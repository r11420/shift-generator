#!/usr/bin/env node
/**
 * KJM Shift＋ NotebookLM スクリーンショット自動撮影
 *
 * 台帳: notebooklm/01_docs/10_スクリーンショット台帳.md（ファイル名はこの台帳を正とする）
 * 使い方: npm run screenshot:notebooklm
 *
 * 安全方針（厳守）:
 *   - 新規ブラウザコンテキスト（独立・空ストレージ）で開き、各撮影前に localStorage を空にする。
 *     既存の実 localStorage・実データ・リポジトリ内バックアップJSONは読み込まない。
 *   - スタッフ等が必要な画面は「ダミーデータ（サンプル名・9xxxx番号）」を生成して撮影する。
 *     実名・実社員番号・実シフト・実希望休は一切使わない。
 *   - 初期化(resetAll)・復元(loadJSONFile)は実行しない。危険操作はボタンが見える状態までで止める。
 *   - OBIC本体・外部サロン管理システムへはアクセスしない（アプリ内の「OBIC連携用」画面のみ表示）。
 *   - 本体アプリ(index.html 等)の仕様・コードは変更しない（表示するだけ）。
 *
 * 出力:
 *   - 画像: notebooklm/02_screenshots/<番号帯フォルダ>/<台帳のファイル名>
 *   - ログ: notebooklm/04_checklists/スクリーンショット撮影ログ.md（表形式で追記）
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_URL = 'file://' + path.join(ROOT, 'index.html');
const SHOTS_ROOT = path.join(ROOT, 'notebooklm', '02_screenshots');
const LEDGER_PATH = path.join(ROOT, 'notebooklm', '01_docs', '10_スクリーンショット台帳.md');
const LOG_PATH = path.join(ROOT, 'notebooklm', '04_checklists', 'スクリーンショット撮影ログ.md');

const VIEWPORT = { width: 1440, height: 1000 };
const DEVICE_SCALE_FACTOR = 1;

// 撮影対象（最優先セット）。状態の作りやすさを考えてフェーズ順に並べる。
const TARGET_SS = [
  'SS-001',
  'SS-601','SS-602','SS-603','SS-606','SS-607',
  'SS-401','SS-402','SS-403','SS-404','SS-407','SS-408','SS-410',
  'SS-501','SS-502','SS-503','SS-504','SS-505','SS-506','SS-507','SS-508','SS-509','SS-515',
  'SS-301','SS-302','SS-303','SS-304','SS-305',
  'SS-701','SS-702','SS-703','SS-704','SS-705','SS-706',
  'SS-101','SS-104','SS-105','SS-106','SS-107',
  'SS-801','SS-802','SS-803','SS-804','SS-805','SS-806','SS-807',
];

const rel = (p) => path.relative(ROOT, p);
const nowStamp = () => new Date().toISOString().replace('T', ' ').replace(/\..+$/, '');

function loadChromium() {
  try { return require('playwright').chromium; }
  catch (e) {
    try {
      const groot = require('child_process').execSync('npm root -g', { stdio: ['ignore','pipe','ignore'] }).toString().trim();
      return require(path.join(groot, 'playwright')).chromium;
    } catch (e2) {
      throw new Error('Playwright が見つかりません。`npm install` 後に `npx playwright install chromium` を実行してください。（' + e.message + '）');
    }
  }
}

// 台帳 Markdown から「SS番号 -> ファイル名」を読み取る（ファイル名は台帳を正とする）
function parseLedger() {
  const map = {};
  const text = fs.readFileSync(LEDGER_PATH, 'utf8');
  const re = /^\|\s*(SS-\d{3})\s*\|\s*([^|]+?)\s*\|/gm;
  let m;
  while ((m = re.exec(text)) !== null) map[m[1]] = m[2].trim();
  return map;
}

// 番号帯 -> 保存フォルダ
function subdirFor(ss) {
  const n = parseInt(ss.slice(3), 10);
  if (n <= 99) return '00_common';
  if (n <= 199) return '01_global_shift';
  if (n <= 299) return '02_basic_rules';
  if (n <= 399) return '03_department_shift';
  if (n <= 499) return '04_staff';
  if (n <= 599) return '05_requests';
  if (n <= 699) return '06_backup';
  if (n <= 799) return '07_warnings';
  if (n <= 899) return '08_obic';
  return '09_manuals';
}
// ファイル名に使えない文字を除去（台帳の "印刷/PDF" → "印刷PDF" に統一）
const safeName = (f) => f.replace(/[\\/:*?"<>|]/g, '');

// ---- アプリ操作ヘルパ（すべて headless ページ内・ダミー/空状態） ----

async function gotoClean(page) {
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => {
    try {
      const y = document.getElementById('menuYear'), m = document.getElementById('menuMonth');
      if (y && m && typeof setMenuPeriodFromInputs === 'function') { y.value = '2026'; m.value = '8'; setMenuPeriodFromInputs(); }
    } catch (e) {}
  });
  await page.waitForTimeout(250);
}

// ダミーデータ投入（明確に作り物：姓「サンプル」/番号 9xxxx）。実データは一切使わない。
async function seedDummy(page) {
  await page.evaluate(() => {
    const mk = (n, dept, opt = {}) => ({
      id: 'dummy' + n, name: 'サンプル ' + n, sei: 'サンプル', mei: String(n),
      seiKana: 'さんぷる', meiKana: String(n), kana: 'さんぷる ' + n,
      empNo: String(90000 + n), dept, tags: opt.tags || [], skill: '',
      offWds: opt.offWds || [], offHolidays: !!opt.offHolidays, useFixedOff: true,
      useWeeklyLimit: true, weeklyAvailableDays: 5, canShifts: ['C', 'E', 'G'],
      supportDepts: opt.supportDepts || [dept], minDays: 0, maxDays: 0,
    });
    let n = 0;
    const staff = [];
    const add = (dept, count, opt) => { for (let i = 0; i < count; i++) { n++; staff.push(mk(n, dept, (i === 0 ? opt : undefined) || {})); } };
    add('店長', 1);
    add('CA', 3, { tags: ['副店長'] });
    add('管理', 2);
    add('SCA', 2);
    add('用品', 2);
    add('トリマー', 3, { tags: ['チーフ'], offWds: [2], offHolidays: true, supportDepts: ['トリマー', '用品'] });
    add('トレーナー', 1);
    state.staff = staff;
    (typeof DEPTS !== 'undefined' ? DEPTS : []).forEach((d) => {
      state.deptNeeds[d] = { week: { E: 1, M: 1, L: 1 }, hol: { E: 1, M: 1, L: 1 } };
    });
    normalizeState(); persist(); renderInputs(); renderAll();
  });
  await page.waitForTimeout(200);
}

async function show(page, panel) {
  await page.evaluate((p) => { if (typeof showMenuPanel === 'function') showMenuPanel(p); window.scrollTo(0, 0); }, panel);
  await page.waitForTimeout(300);
}

async function drawOutline(page, selector) {
  return page.evaluate((sel) => {
    document.querySelectorAll('.__ssbox').forEach((e) => e.remove());
    const el = document.querySelector(sel);
    if (!el) return false;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const b = document.createElement('div');
    b.className = '__ssbox';
    b.style.cssText = 'position:fixed;left:' + (r.left - 4) + 'px;top:' + (r.top - 4) + 'px;width:' + (r.width + 8) +
      'px;height:' + (r.height + 8) + 'px;border:3px solid #e53935;border-radius:8px;box-shadow:0 0 0 2px rgba(255,255,255,.6);z-index:99999;pointer-events:none;box-sizing:border-box';
    document.body.appendChild(b);
    return true;
  }, selector);
}
const clearOutline = (page) => page.evaluate(() => document.querySelectorAll('.__ssbox').forEach((e) => e.remove()));

// ---- メイン ----
async function main() {
  const chromium = loadChromium();
  const LEDGER = parseLedger();
  const results = [];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
  const page = await context.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {})); // 危険操作の確認ダイアログは絶対に承認しない（dismiss）

  // 撮影1件: fn() は {outline?, selector?, note?, status?, skip?} を返す
  async function cap(ss, fn) {
    const file = LEDGER[ss];
    if (!file) { results.push({ ss, file: '(台帳に無し)', ok: false, dest: '-', note: '台帳にファイル名がありません', status: '未撮影' }); console.error('FAIL', ss, ': 台帳に無し'); return; }
    const safe = safeName(file);
    const dir = path.join(SHOTS_ROOT, subdirFor(ss));
    const out = path.join(dir, safe);
    try {
      fs.mkdirSync(dir, { recursive: true });
      const r = (await fn()) || {};
      if (r.skip) { results.push({ ss, file: safe, ok: false, dest: rel(dir), note: r.note || '', status: r.status || '要実機確認' }); console.log('SKIP', ss, '(' + (r.status || '要実機確認') + ')', r.note || ''); return; }
      if (r.outline) await drawOutline(page, r.outline);
      if (r.selector) await page.locator(r.selector).first().screenshot({ path: out, type: 'png' });
      else await page.screenshot({ path: out, type: 'png' });
      await clearOutline(page);
      const bytes = fs.statSync(out).size;
      results.push({ ss, file: safe, ok: true, dest: rel(out), note: r.note || '', status: r.status || '撮影済', bytes });
      console.log('OK  ', ss, '->', rel(out), r.note ? '(' + r.note + ')' : '');
    } catch (e) {
      await clearOutline(page).catch(() => {});
      const msg = (e && e.message) ? e.message.split('\n')[0] : String(e);
      results.push({ ss, file: safe, ok: false, dest: rel(dir), note: msg, status: '未撮影' });
      console.error('FAIL', ss, ':', msg);
    }
  }

  // ===== フェーズ0: データ無し（メニュー・バックアップ） =====
  await gotoClean(page);
  await show(page, 'calendar');
  await cap('SS-001', async () => ({ selector: '.menuRail', note: '左メニュー全体（空状態）' }));

  await show(page, 'actions');
  await cap('SS-601', async () => ({ note: 'バックアップ画面全体' }));
  await cap('SS-602', async () => ({ outline: '.menuPanel[data-panel="actions"] .btn', note: 'バックアップ取得(JSON保存)ボタン' }));
  await cap('SS-603', async () => ({ outline: '.menuPanel[data-panel="actions"] .btnCaution', note: '復元ボタンの表示のみ（復元は実行していない）', status: '撮影済（実行なし）' }));
  await cap('SS-606', async () => ({ outline: '.menuPanel[data-panel="actions"] .btnDanger', note: 'すべて初期化ボタンの表示のみ（初期化は実行していない）', status: '撮影済（実行なし）' }));
  await cap('SS-607', async () => ({ outline: '.menuPanel[data-panel="actions"] .btnDanger', note: '初期化前の注意文＋ボタンは撮影済だが、native確認ダイアログ自体は未撮影のため保留', status: '保留' }));

  // ===== フェーズ1: ダミースタッフ（スケジュール無し） =====
  await seedDummy(page);

  await show(page, 'staff');
  await cap('SS-401', async () => ({ note: 'スタッフ画面全体（ダミー）' }));
  await cap('SS-402', async () => ({ outline: '#staffDeptTabs', note: '部署タブ' }));
  await cap('SS-403', async () => { await page.evaluate(() => { if (typeof showStaffAddForm === 'function') showStaffAddForm(); }); await page.waitForTimeout(300); return { note: 'スタッフ追加フォーム' }; });
  await cap('SS-404', async () => ({ outline: '#addStaffEmpNo', note: '社員番号入力欄' }));
  // スタッフ編集（固定公休・祝日・兼務）：ダミー1名を開く
  await page.evaluate(() => { const s = (state.staff || []).find((x) => (x.offWds || []).length) || state.staff[0]; if (s && typeof openStaffDetails === 'function') openStaffDetails(s.id); });
  await page.waitForTimeout(300);
  await cap('SS-407', async () => ({ outline: '.staffItem .weekdayChecks', note: '固定公休（曜日）' }));
  await cap('SS-408', async () => ({ outline: '.staffItem .stOffHoliday', note: '祝日固定公休' }));
  await cap('SS-410', async () => ({ outline: '.staffItem .deptCheckGrid', note: '対応できる部署・兼務可能部署' }));

  // シフト希望・全体予定
  const firstStaff = await page.evaluate(() => (state.staff.find((s) => s.dept === 'トリマー') || state.staff[0]).name);
  async function prefsRequest(staff) {
    await page.evaluate((nm) => { activePrefDept = (state.staff.find((s) => s.name === nm) || {}).dept || 'トリマー'; activePrefStaff = nm; if (typeof setPrefsTab === 'function') setPrefsTab('request'); showMenuPanel('prefs'); renderInputs(); renderAll(); window.scrollTo(0, 0); }, staff);
    await page.waitForTimeout(300);
  }
  async function setPrefShift(group) {
    await page.evaluate((g) => {
      const sel = document.getElementById('newPrefShift'); if (!sel) return;
      let val = 'OFF';
      if (g === 'OFF') val = 'OFF';
      else { const d = (state.shiftDefs || []).find((x) => x.weekGroup === g); if (d) val = d.code; }
      sel.value = val; sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, group);
    await page.waitForTimeout(150);
  }
  await prefsRequest(firstStaff);
  await cap('SS-501', async () => ({ note: 'シフト希望・全体予定 画面全体' }));
  await cap('SS-502', async () => ({ outline: '#prefDeptSelect', note: '表示する部署の絞り込み' }));
  await cap('SS-503', async () => ({ outline: '#prefStaffTabs', note: 'スタッフ別タブ' }));
  await setPrefShift('OFF');
  await cap('SS-504', async () => ({ outline: '.prefAddBox', note: '希望休（休）を選んで追加' }));
  await cap('SS-505', async () => ({ outline: '.prefAddBox', note: '勤務不可も「休」で追加。希望休（SS-504）と同じ操作・同等の画面' }));
  await setPrefShift('E');
  await cap('SS-506', async () => ({ outline: '.prefAddBox', note: '早番希望を選んで追加' }));
  await setPrefShift('M');
  await cap('SS-507', async () => ({ outline: '.prefAddBox', note: '中番希望を選んで追加' }));
  await setPrefShift('L');
  await cap('SS-508', async () => ({ outline: '.prefAddBox', note: '遅番希望を選んで追加' }));
  await cap('SS-509', async () => { await page.evaluate(() => { if (typeof setPrefsTab === 'function') setPrefsTab('event'); renderAll(); window.scrollTo(0, 0); }); await page.waitForTimeout(300); return { outline: '#evtTag', note: '全体予定を追加（タグ・日付/曜日）' }; });
  // 登録後確認：ダミー希望を1件入れて一覧表示
  await cap('SS-515', async () => {
    await page.evaluate((nm) => {
      const st = state.staff.find((s) => s.name === nm); if (!st) return;
      const days = getDays(); const day = days.find((d) => !d.holType) || days[0];
      const pk = (typeof currentPeriodKey === 'function') ? currentPeriodKey() : null;
      state.preferencesByPeriod = state.preferencesByPeriod || {};
      const key = pk || Object.keys(state.preferencesByPeriod)[0] || 'p';
      const arr = state.preferencesByPeriod[key] = state.preferencesByPeriod[key] || [];
      if (!arr.some((p) => p.staff === nm)) arr.push({ type: 'date', date: day.key, staff: nm, shift: 'OFF' });
      activePrefDept = st.dept; activePrefStaff = nm; if (typeof setPrefsTab === 'function') setPrefsTab('request');
      renderInputs(); renderAll(); window.scrollTo(0, 0);
    }, firstStaff);
    await page.waitForTimeout(300);
    return { note: '登録後の希望一覧（ダミー1件）' };
  });

  // 部署別シフト作成
  await page.evaluate(() => { showMenuPanel('deptBuild'); if (typeof setActiveBuildDept === 'function') setActiveBuildDept('トリマー'); renderAll(); window.scrollTo(0, 0); });
  await page.waitForTimeout(300);
  await cap('SS-301', async () => ({ note: '部署別シフト作成 画面全体' }));
  await cap('SS-302', async () => ({ outline: '#deptBuildPanel .deptBuildCard.active', note: '部署の選択（カード）' }));

  // ===== フェーズ2: 自動生成 =====
  await page.evaluate(async () => { try { await generateDeptSchedule('トリマー'); } catch (e) {} renderAll(); });
  await page.waitForTimeout(400);
  await cap('SS-303', async () => ({ outline: '#deptBuildPanel .btn.genBtn', note: '「この部署だけ自動作成」' }));
  await cap('SS-304', async () => { await page.evaluate(() => { const t = document.querySelector('#deptShiftPreview'); if (t) { t.scrollIntoView({ block: 'start' }); window.scrollBy(0, -12); } }); await page.waitForTimeout(250); return { note: '作成結果（確認表）' }; });
  await cap('SS-305', async () => { await page.evaluate(() => window.scrollTo(0, 0)); return { outline: '#deptBuildPanel .confirmBtn', note: '確定ボタン（押下前。確定はこの後別途実施）' }; });

  // ===== フェーズ3: 集計・警告（警告を出す） =====
  // 全部署生成＋一部の警告を誘発（高めの必要人数・連勤・希望未達のダミー）
  await page.evaluate(async () => {
    DEPTS.forEach((d) => { state.deptNeeds[d] = { week: { E: 2, M: 1, L: 2 }, hol: { E: 2, M: 1, L: 2 } }; });
    state.deptNeeds['用品'] = { week: { E: 3, M: 2, L: 3 }, hol: { E: 3, M: 2, L: 3 } }; // 部署別不足を起こす
    state.globalNeeds = { week: { E: 6, L: 6 }, hol: { E: 6, L: 6 } }; // 全体早遅不足を起こす
    state.maxConsecutive = 5;
    normalizeState();
    for (const d of DEPTS) { try { await generateDeptSchedule(d); } catch (e) {} }
    // ダミーの連勤違反＋希望未達を作る（1名のみ・作り物）
    try {
      const st = state.staff.find((s) => s.dept === 'トリマー') || state.staff[0];
      const days = getDays();
      for (let i = 0; i < Math.min(7, days.length); i++) { (schedule[days[i].key] = schedule[days[i].key] || {})[st.name] = 'C'; (assignDept[days[i].key] = assignDept[days[i].key] || {})[st.name] = st.dept; } // 7連勤
      const pk = (typeof currentPeriodKey === 'function') ? currentPeriodKey() : Object.keys(state.preferencesByPeriod || {})[0];
      if (pk) { state.preferencesByPeriod[pk] = state.preferencesByPeriod[pk] || []; const wd = days.find((d) => !d.holType); if (wd) { state.preferencesByPeriod[pk].push({ type: 'date', date: wd.key, staff: st.name, shift: 'OFF' }); (schedule[wd.key] = schedule[wd.key] || {})[st.name] = 'C'; } } // 休希望だが勤務→希望未達
    } catch (e) {}
    persist(); renderAll();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    // 画面内で警告要素をテキストで特定し、中央へスクロールして印を付けるヘルパ
    window.__markWarn = (kws, tag) => {
      const root = document.querySelector('.menuPanel[data-panel="stats"]') || document.body;
      const els = [...root.querySelectorAll('.allowErrorLine, .statsWarn, li, tr, td, p, h3, h4, div')];
      const matches = els.filter((e) => { const t = (e.textContent || '').trim(); return t.length > 0 && t.length < 300 && kws.every((k) => t.includes(k)); });
      matches.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length); // 最も内側（短い）要素
      const hit = matches[0];
      if (hit) { hit.setAttribute('data-ssw', tag); hit.scrollIntoView({ block: 'center' }); return true; }
      return false;
    };
  });
  await show(page, 'stats');
  await cap('SS-701', async () => ({ note: '集計・警告 画面全体' }));
  await cap('SS-702', async () => { await page.evaluate(() => { const t = document.querySelector('#statsTable, #viewStats table'); if (t) { t.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } }); return { outline: '#statsTable, #viewStats table', note: 'スタッフ別の回数表' }; });
  const warnShot = async (ss, kws, label) => {
    const tag = ss.replace('-', '');
    const found = await page.evaluate(({ kws, tag }) => window.__markWarn(kws, tag), { kws, tag });
    await cap(ss, async () => found
      ? ({ outline: '[data-ssw="' + tag + '"]', note: label + 'の警告を確認（ダミーデータ警告）' })
      : ({ outline: '#warnings', note: label + 'はダミーデータで再現されず（警告一覧は撮影・該当警告は要実機確認）', status: '要実機確認' }));
  };
  await warnShot('SS-703', ['不足'], '部署別不足');
  await warnShot('SS-704', ['全体', '不足'], '全体早遅不足');
  await warnShot('SS-705', ['連勤'], '連勤違反');
  await warnShot('SS-706', ['希望', '未達'], '希望未達');

  // ===== フェーズ4: 確定 → 全体シフト表 / ファイル出力 / OBIC =====
  await page.evaluate(() => {
    window.isWarningAllowed = () => true; // 撮影用：全警告を許容扱いにして確定を通す（データは破壊しない）
    DEPTS.forEach((d) => { try { setActiveBuildDept(d); if (!confirmedDepts[d]) toggleDeptConfirm(d); } catch (e) {} });
    persist(); renderAll();
  });
  await page.waitForTimeout(300);

  await page.evaluate(() => { showMenuPanel('calendar'); if (typeof calendarEditMode !== 'undefined' && calendarEditMode) toggleCalendarEditMode(); renderAll(); window.scrollTo(0, 0); });
  await page.waitForTimeout(300);
  await cap('SS-101', async () => ({ note: '全体シフト表 画面全体（確定済みダミー）' }));
  const openExport = async () => { await page.evaluate(() => { const d = document.querySelector('.menuPanel[data-panel="calendar"] details.exportMenu'); if (d) d.open = true; window.scrollTo(0, 0); }); await page.waitForTimeout(200); };
  await openExport(); await cap('SS-104', async () => ({ outline: '.menuPanel[data-panel="calendar"] .exportMenuList', note: 'ファイル出力メニュー' }));
  const exBtn = (re) => `.menuPanel[data-panel="calendar"] .exportMenuList >> text=${re}`;
  await openExport(); await cap('SS-105', async () => ({ outline: '.menuPanel[data-panel="calendar"] .exportMenuList button:nth-child(1)', note: 'CSV出力' }));
  await openExport(); await cap('SS-106', async () => ({ outline: '.menuPanel[data-panel="calendar"] .exportMenuList button:nth-child(2)', note: 'Excel出力' }));
  await openExport(); await cap('SS-107', async () => ({ outline: '.menuPanel[data-panel="calendar"] .exportMenuList button:nth-child(3)', note: '印刷/PDF。ファイル名は「印刷PDF」に統一（"/"はファイル名に使えないため）' }));

  await page.evaluate(() => { showMenuPanel('obic'); renderAll(); window.scrollTo(0, 0); });
  await page.waitForTimeout(300);
  await cap('SS-801', async () => ({ note: 'OBIC連携用 画面全体（休日/空欄・社員番号順）' }));
  // OBICテーブルの休日セル / 空欄セルを特定して印付け
  const obicCells = await page.evaluate(() => {
    const tbl = document.getElementById('obicTable'); if (!tbl) return { hol: false, empty: false };
    const tds = [...tbl.querySelectorAll('tbody td')];
    let holIdx = -1, emptyIdx = -1;
    tds.forEach((td, i) => { const t = td.textContent.trim(); if (holIdx < 0 && t === '休日') { td.setAttribute('data-ss', 'hol'); holIdx = i; } if (emptyIdx < 0 && t === '' && !td.className.includes('sticky')) { td.setAttribute('data-ss', 'empty'); emptyIdx = i; } });
    return { hol: holIdx >= 0, empty: emptyIdx >= 0 };
  });
  await cap('SS-802', async () => obicCells.hol ? ({ outline: '#obicTable td[data-ss="hol"]', note: '休日の表示' }) : ({ skip: true, status: '要実機確認', note: 'OBIC表に休日セルが見つかりませんでした' }));
  await cap('SS-803', async () => obicCells.empty ? ({ outline: '#obicTable td[data-ss="empty"]', note: '勤務日は空欄' }) : ({ skip: true, status: '要実機確認', note: 'OBIC表に空欄セルが見つかりませんでした' }));
  await cap('SS-804', async () => ({ outline: '#currentPeriodBadge', note: '対象締め月（メニュー上部バッジ）' }));
  await cap('SS-805', async () => ({ outline: '#obicTable', note: '社員番号の昇順で並ぶ一覧' }));
  await cap('SS-806', async () => ({ outline: '.obicCopyBtn', note: 'コピー（押下せず）' }));
  await cap('SS-807', async () => ({ outline: '.obicExcelBtn', note: 'Excel出力（押下せず）' }));

  await context.close();
  await browser.close();
  writeLog(results);

  const finalStatus = (r) => r.status || (r.ok ? '撮影済' : '未撮影');
  const ok = results.filter((r) => finalStatus(r).startsWith('撮影済')).length;
  const need = results.filter((r) => finalStatus(r) === '要実機確認' || finalStatus(r) === '保留').length;
  const fail = results.filter((r) => finalStatus(r) === '未撮影').length;
  console.log('\n完了: 撮影済 ' + ok + ' / 要実機確認・保留 ' + need + ' / 未撮影(失敗) ' + fail + '（ログ: ' + rel(LOG_PATH) + '）');
  // 機械可読の結果も出力（台帳更新用）
  fs.writeFileSync(path.join(ROOT, '.last-capture-results.json'), JSON.stringify(results.map((r) => ({ ss: r.ss, status: finalStatus(r) })), null, 2));
}

function writeLog(results) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  const header =
    '# スクリーンショット撮影ログ\n\n' +
    'このファイルは `scripts/capture-notebooklm-screenshots.js` が自動生成・追記します。\n' +
    '実行のたびに、撮影条件と結果（撮影済／要実機確認／保留／未撮影）を1ブロックずつ追記します。\n';
  let block = '\n## 実行: ' + nowStamp() + '\n\n';
  block += '- 撮影条件: viewport ' + VIEWPORT.width + 'x' + VIEWPORT.height + ' / deviceScaleFactor ' + DEVICE_SCALE_FACTOR +
    ' / PNG / 新規コンテキスト（空 localStorage・実データなし・ダミーデータ使用）\n';
  block += '- 注釈状態: 対象すべて「未対応」（赤丸・番号などの注釈は今回未実施。画面状態の撮影のみ。注釈は人間確認後の別フェーズ）\n\n';
  block += '| SS番号 | ファイル名 | 撮影結果 | 保存先 | 備考 |\n|---|---|---|---|---|\n';
  for (const r of results) {
    const status = r.status || (r.ok ? '撮影済' : '未撮影');
    block += '| ' + r.ss + ' | ' + r.file + ' | ' + status + ' | ' + r.dest + ' | ' + (r.note || '').replace(/\|/g, '/') + ' |\n';
  }
  let body;
  if (fs.existsSync(LOG_PATH)) {
    body = fs.readFileSync(LOG_PATH, 'utf8');
    if (!body.startsWith('# スクリーンショット撮影ログ')) body = header + body;
  } else body = header;
  fs.writeFileSync(LOG_PATH, body + block);
}

main().catch((e) => {
  const msg = (e && e.message) ? e.message.split('\n')[0] : String(e);
  try { writeLog([{ ss: '(致命的エラー)', file: '-', ok: false, dest: '-', status: '未撮影', note: msg }]); } catch (_) {}
  console.error(e);
  process.exit(1);
});
