#!/usr/bin/env node
/**
 * KJM Shift＋ アプリ内マニュアル用スクリーンショット撮影（最新UI）。
 * - 新規コンテキスト・空localStorage・ダミーデータ（サンプル/9xxxx）のみ。実データ不使用。
 * - 出力: assets/manual/<name>.png（既存を上書き）
 * 使い方: node scripts/capture-manual.js [--only=name1,name2]
 *
 * 注: 画面は100vhで左メニュー/右操作画面が内部スクロールするため、パネル全体を切らずに撮る
 *     ショットは relax()（内部スクロール一時解除）してから要素を撮影する。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const APP_URL = 'file://' + path.join(ROOT, 'index.html');
const OUT = path.join(ROOT, 'assets', 'manual');
const VW = { width: 1360, height: 940 };

function loadChromium() {
  try { return require('playwright').chromium; }
  catch (e) { const g = require('child_process').execSync('npm root -g').toString().trim(); return require(path.join(g, 'playwright')).chromium; }
}
async function gotoClean(page) {
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => { try { const y = document.getElementById('menuYear'), m = document.getElementById('menuMonth'); if (y && m) { y.value = '2026'; m.value = '8'; setMenuPeriodFromInputs(); } } catch (e) {} });
  await page.waitForTimeout(250);
}
async function seed(page) {
  await page.evaluate(() => {
    const mk = (n, dept, opt = {}) => ({ id: 'dummy' + n, name: 'サンプル ' + n, sei: 'サンプル', mei: String(n), seiKana: 'さんぷる', meiKana: String(n), kana: 'さんぷる ' + n, empNo: String(90000 + n), dept, tags: opt.tags || [], skill: '', offWds: opt.offWds || [], offHolidays: !!opt.offHolidays, useFixedOff: true, useWeeklyLimit: true, weeklyAvailableDays: 5, canShifts: ['C', 'E', 'G'], supportDepts: opt.supportDepts || [dept], minDays: 0, maxDays: 0 });
    let n = 0; const staff = [];
    const add = (dept, count, opt) => { for (let i = 0; i < count; i++) { n++; staff.push(mk(n, dept, (i === 0 ? opt : undefined) || {})); } };
    add('店長', 1); add('CA', 3, { tags: ['副店長'] }); add('管理', 2); add('SCA', 2); add('用品', 2);
    add('トリマー', 3, { tags: ['チーフ'], offWds: [2], offHolidays: true, supportDepts: ['トリマー', '用品'] }); add('トレーナー', 1);
    state.staff = staff;
    state.attempts = 60; // 撮影用に試行回数を抑えて高速化（結果品質は不問）
    DEPTS.forEach((d) => { state.deptNeeds[d] = { week: { E: 1, M: 1, L: 1 }, hol: { E: 1, M: 1, L: 1 } }; });
    const days = getDays();
    if (!state.scheduleTags.includes('チーフMTG')) state.scheduleTags.push('チーフMTG');
    if (!state.scheduleTags.includes('納品')) state.scheduleTags.push('納品');
    state.recurringSchedules = [{ id: 'rm', tag: 'チーフMTG', axis: 'wd', wds: [days[0] ? days[0].wd : 2], occ: ['every'] }];
    const pk = periodKey();
    state.scheduleEventsByPeriod[pk] = [{ id: 'ev1', tag: '納品', axis: 'date', date: (days[3] || days[0]).key }];
    state.closures = state.closures || {}; if (days[5]) state.closures[days[5].key] = true;
    normalizeState(); persist(); renderInputs(); renderAll();
  });
  await page.waitForTimeout(250);
}
async function genDepts(page, list) {
  for (const d of list) {
    await page.evaluate(async (dept) => { try { await generateDeptSchedule(dept); } catch (e) {} renderAll(); }, d);
    await page.waitForTimeout(150);
  }
}
async function confirmDepts(page, list) {
  await page.evaluate((list) => { window.isWarningAllowed = () => true; list.forEach((d) => { try { setActiveBuildDept(d); if (!confirmedDepts[d]) toggleDeptConfirm(d, {skipConfirm:true}); } catch (e) {} }); persist(); renderAll(); }, list);
  await page.waitForTimeout(250);
}
async function show(page, panel) { await page.evaluate((p) => { showMenuPanel(p); const ca = document.querySelector('.contentArea'); if (ca) ca.scrollTop = 0; }, panel); await page.waitForTimeout(300); }
const RELAX = 'body{height:auto!important;overflow:visible!important}.appLayout{grid-template-rows:auto!important;min-height:0!important;align-items:start!important}.menuRail{overflow:visible!important;max-height:none!important}.contentArea{overflow:visible!important;max-height:none!important}';
async function relax(page, on) {
  await page.evaluate(({ on, css }) => { let el = document.getElementById('__relax'); if (on) { if (!el) { el = document.createElement('style'); el.id = '__relax'; document.head.appendChild(el); } el.textContent = css; } else if (el) el.remove(); }, { on, css: RELAX });
  await page.waitForTimeout(150);
}
async function snapEl(page, sel, file) { const loc = page.locator(sel).first(); await loc.scrollIntoViewIfNeeded().catch(() => {}); await loc.screenshot({ path: path.join(OUT, file), type: 'png' }); console.log('OK  ', file, '<-', sel); }
async function snapRange(page, selTop, selBottom, file, padX = 8) {
  const clip = await page.evaluate(({ a, b, padX }) => {
    const ea = document.querySelector(a), eb = document.querySelector(b); if (!ea || !eb) return null;
    const ra = ea.getBoundingClientRect(), rb = eb.getBoundingClientRect();
    const x = Math.max(0, Math.min(ra.left, rb.left) - padX), top = ra.top - padX;
    const right = Math.max(ra.right, rb.right) + padX, bottom = rb.bottom + padX;
    return { x, y: top, width: right - x, height: bottom - top };
  }, { a: selTop, b: selBottom, padX });
  if (!clip) throw new Error('snapRange selectors not found: ' + selTop + ' / ' + selBottom);
  await page.screenshot({ path: path.join(OUT, file), type: 'png', clip });
  console.log('OK  ', file, '(range)', selTop, '->', selBottom);
}
async function snapViewport(page, file, h) { await page.screenshot({ path: path.join(OUT, file), type: 'png', clip: { x: 0, y: 0, width: VW.width, height: h || VW.height } }); console.log('OK  ', file, '(viewport)'); }

async function main() {
  const onlyArg = (process.argv.find((a) => a.startsWith('--only=')) || '').split('=')[1];
  const only = onlyArg ? new Set(onlyArg.split(',')) : null;
  const want = (n) => !only || only.has(n);
  const chromium = loadChromium();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VW, deviceScaleFactor: 1.4 });
  const page = await context.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  fs.mkdirSync(OUT, { recursive: true });
  await gotoClean(page);
  await seed(page);

  // 左メニュー（最新グループ）／上部固定バー
  if (want('m-menu')) { await show(page, 'calendar'); await relax(page, true); await snapEl(page, '.menuRail', 'm-menu.png'); await relax(page, false); }
  if (want('m-period')) { await page.evaluate(() => markBackupTaken()); await page.setViewportSize({ width: 1060, height: 300 }); await page.waitForTimeout(200); await snapEl(page, '#globalBar .gbInner', 'm-period.png'); await page.setViewportSize(VW); }

  // 区分デザイン設定（早番＝オレンジ・規定は太枠でない）
  if (want('m-appearance')) {
    await page.evaluate(() => { shiftAppearanceOpen = true; showMenuPanel('basic'); renderInputs(); renderAll(); });
    await page.waitForTimeout(300); await relax(page, true);
    await snapEl(page, '.sapPanel', 'm-appearance.png'); await relax(page, false);
  }

  // 全体予定タブ（タグ・個別除外）／臨時休業
  if (want('m-event') || want('m-closure')) {
    await page.evaluate(() => { showMenuPanel('prefs'); setPrefsTab('event'); renderInputs(); renderAll(); });
    await page.waitForTimeout(300); await relax(page, true);
    if (want('m-event')) await snapEl(page, '.menuPanel[data-panel="prefs"] .prefAddBox', 'm-event.png');
    if (want('m-closure')) { const ok = await page.evaluate(() => { const h = [...document.querySelectorAll('.menuPanel[data-panel="prefs"] h3')].find(e => e.textContent.includes('臨時休業')); if (h) { h.closest('.prefAddBox')?.setAttribute('data-cap', 'closure'); return true; } return false; }); await snapEl(page, ok ? '[data-cap="closure"]' : '.menuPanel[data-panel="prefs"] .prefAddBox', 'm-closure.png'); }
    await relax(page, false);
  }

  // シフト希望（request タブ）。個人を選ばないと追加フォーム(.prefAddBox)が出ないため、トリマーを選ぶ
  if (want('m-prefs')) { await page.evaluate(() => { const st = state.staff.find(s => s.dept === 'トリマー') || state.staff[0]; activePrefDept = st.dept; activePrefStaff = st.name; showMenuPanel('prefs'); setPrefsTab('request'); renderInputs(); renderAll(); }); await page.waitForTimeout(300); await relax(page, true); await snapEl(page, '.menuPanel[data-panel="prefs"] .prefAddBox', 'm-prefs.png'); await relax(page, false); }

  // 部署別シフト作成（トリマーを生成）
  await page.evaluate(() => { showMenuPanel('deptBuild'); setActiveBuildDept('トリマー'); renderAll(); });
  await page.waitForTimeout(200);
  await genDepts(page, ['トリマー', 'CA', '用品']);
  if (want('m-deptbuild') || want('q-deptgen')) {
    await page.evaluate(() => { showMenuPanel('deptBuild'); setActiveBuildDept('トリマー'); renderAll(); });
    await page.waitForTimeout(250); await relax(page, true);
    // 下のプレビュー表・候補表・月次などを隠し、カード＋作成/確定（＋下書きチェック）に絞って撮る
    await page.evaluate(() => { let el = document.getElementById('deptShiftPreview'); while (el) { const n = el.nextElementSibling; el.style.display = 'none'; el = n; } });
    await page.waitForTimeout(100);
    if (want('m-deptbuild')) await snapEl(page, '#deptBuildPanel', 'm-deptbuild.png');
    if (want('q-deptgen')) await snapEl(page, '#deptBuildPanel', 'q-deptgen.png');
    await page.evaluate(() => { showMenuPanel('deptBuild'); setActiveBuildDept('トリマー'); renderAll(); }); // 元に戻す
    await relax(page, false);
  }
  if (want('q-check')) { await page.evaluate(() => { setActiveBuildDept('トリマー'); renderAll(); }); await page.waitForTimeout(250); await snapEl(page, '#deptShiftPreview .deptPvWrap', 'q-check.png'); }
  if (want('q-confirm')) { await page.evaluate(() => { setActiveBuildDept('トリマー'); renderAll(); }); await page.waitForTimeout(200); await snapEl(page, '.buildCommonRow', 'q-confirm.png'); }

  // 集計・警告（必要人数を少し高くして既存ドラフトに不足警告を出す。relaxせず右画面のスクロール内を撮る＝サイズ過大を防ぐ）
  if (want('m-stats')) {
    await page.evaluate(() => { state.deptNeeds['用品'] = { week: { E: 2, M: 1, L: 2 }, hol: { E: 2, M: 1, L: 2 } }; state.globalNeeds = { week: { E: 3, L: 3 }, hol: { E: 3, L: 3 } }; normalizeState(); persist(); showMenuPanel('stats'); renderAll(); const ca = document.querySelector('.contentArea'); if (ca) ca.scrollTop = 0; });
    await page.waitForTimeout(300);
    await snapEl(page, '.contentArea', 'm-stats.png');
  }

  // 確定して全体シフト表（参照／編集）。必要人数を既定に戻し、バックアップ取得済みにして見た目を整える
  if (want('m-calendar') || want('m-edit') || want('q-calendar-view')) {
    // 撮影用：未生成の部署による「不足」表示を消すため必要人数を0に（見た目を整えるためだけ）
    await page.evaluate(() => { DEPTS.forEach((d) => { state.deptNeeds[d] = { week: { E: 0, M: 0, L: 0 }, hol: { E: 0, M: 0, L: 0 } }; }); state.globalNeeds = { week: { E: 0, L: 0 }, hol: { E: 0, L: 0 } }; normalizeState(); persist(); });
    await confirmDepts(page, ['トリマー', 'CA', '用品']);
    await page.evaluate(() => markBackupTaken());
    await page.evaluate(() => { showMenuPanel('calendar'); if (typeof calendarEditMode !== 'undefined' && calendarEditMode) toggleCalendarEditMode(); renderAll(); const ca = document.querySelector('.contentArea'); if (ca) ca.scrollTop = 0; });
    await page.waitForTimeout(300);
    if (want('m-calendar')) await snapEl(page, 'body', 'm-calendar.png');
    if (want('q-calendar-view')) { await relax(page, true); await snapEl(page, '#viewCalendar .tableWrap', 'q-calendar-view.png'); await relax(page, false); }
    if (want('m-edit')) { await page.evaluate(() => { toggleCalendarEditMode(); renderAll(); const ca = document.querySelector('.contentArea'); if (ca) ca.scrollTop = 0; }); await page.waitForTimeout(300); await snapEl(page, 'body', 'm-edit.png'); }
  }

  console.log('done');
  await context.close();
  await browser.close();
}
main().catch((e) => { console.error(e && e.message ? e.message : e); process.exit(1); });
