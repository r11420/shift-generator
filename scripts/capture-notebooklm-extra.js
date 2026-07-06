#!/usr/bin/env node
/**
 * KJM Shift＋ NotebookLM スクリーンショット — 追加撮影・注釈バッチ（C作業）
 *
 * 役割（メインの capture-notebooklm-screenshots.js とは別の追加バッチ）:
 *   1. SS-101 をトースト写り込みなしで撮り直す
 *   2. 台帳の未撮影SSのうち、安全に撮れるものを追加撮影する
 *   3. 優先SSに赤丸・番号注釈を付けた _annotated 画像を別ファイルで作る
 *   危険操作・外部連携・実データ・native確認ダイアログが必要なものは撮影しない（保留/要実機確認）。
 *
 * 安全方針はメインスクリプトと同一（新規コンテキスト・空localStorage・ダミーデータ・
 * 初期化/復元/OBIC本体/外部システムは実行しない・本体アプリは変更しない）。
 * 結果は .last-extra-results.json と撮影ログ追記用に出力する。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const APP = 'file://' + path.join(ROOT, 'index.html');
const MANUAL = 'file://' + path.join(ROOT, 'manual.html');
const QUICK = 'file://' + path.join(ROOT, 'quick.html');
const SHOTS = path.join(ROOT, 'notebooklm', '02_screenshots');
const LEDGER = path.join(ROOT, 'notebooklm', '01_docs', '10_スクリーンショット台帳.md');
const VIEWPORT = { width: 1440, height: 1000 }, DSF = 1;
const rel = (p) => path.relative(ROOT, p);

function loadChromium() {
  try { return require('playwright').chromium; }
  catch (e) {
    const g = require('child_process').execSync('npm root -g', { stdio: ['ignore','pipe','ignore'] }).toString().trim();
    return require(path.join(g, 'playwright')).chromium;
  }
}
function parseLedger() {
  const map = {}, t = fs.readFileSync(LEDGER, 'utf8'); let m;
  const re = /^\|\s*(SS-\d{3})\s*\|\s*([^|]+?)\s*\|/gm;
  while ((m = re.exec(t))) map[m[1]] = m[2].trim();
  return map;
}
function subdir(ss) { const n = +ss.slice(3); return n<=99?'00_common':n<=199?'01_global_shift':n<=299?'02_basic_rules':n<=399?'03_department_shift':n<=499?'04_staff':n<=599?'05_requests':n<=699?'06_backup':n<=799?'07_warnings':n<=899?'08_obic':'09_manuals'; }
const safe = (f) => f.replace(/[\\/:*?"<>|]/g, '');

const results = [];
let LED = {};

async function show(page, panel) { await page.evaluate((p)=>{ if(typeof showMenuPanel==='function') showMenuPanel(p); window.scrollTo(0,0); }, panel); await page.waitForTimeout(300); }
async function removeToasts(page){ await page.evaluate(()=>{ document.querySelectorAll('.toast,[class*="toast"],#toast,.toastWrap,.toasts').forEach(e=>e.remove()); }); }
async function box(page, selector, color){ // 赤枠（番号なし）
  return page.evaluate(({selector,color})=>{ const el=document.querySelector(selector); if(!el) return false; el.scrollIntoView({block:'center',inline:'center'}); const r=el.getBoundingClientRect(); const b=document.createElement('div'); b.className='__x'; b.style.cssText='position:fixed;left:'+(r.left-4)+'px;top:'+(r.top-4)+'px;width:'+(r.width+8)+'px;height:'+(r.height+8)+'px;border:3px solid '+(color||'#e53935')+';border-radius:8px;box-shadow:0 0 0 2px rgba(255,255,255,.6);z-index:99999;pointer-events:none;box-sizing:border-box'; document.body.appendChild(b); return true; }, {selector,color});
}
async function badges(page, sels){ // 番号付き赤丸（注釈用）
  return page.evaluate((sels)=>{ document.querySelectorAll('.__x').forEach(e=>e.remove()); let n=0,ok=0;
    for(const s of sels){ n++; const el=document.querySelector(s); if(!el) continue; el.scrollIntoView({block:'center',inline:'center'}); const r=el.getBoundingClientRect(); if(!r.width&&!r.height) continue; ok++;
      const bx=document.createElement('div'); bx.className='__x'; bx.style.cssText='position:fixed;left:'+(r.left-4)+'px;top:'+(r.top-4)+'px;width:'+(r.width+8)+'px;height:'+(r.height+8)+'px;border:3px solid #e53935;border-radius:8px;z-index:99998;pointer-events:none;box-sizing:border-box'; document.body.appendChild(bx);
      const bd=document.createElement('div'); bd.className='__x'; bd.textContent=n; bd.style.cssText='position:fixed;left:'+(r.left-15)+'px;top:'+(r.top-15)+'px;width:28px;height:28px;border-radius:50%;background:#e53935;color:#fff;font-weight:900;font-size:16px;display:flex;align-items:center;justify-content:center;z-index:100000;font-family:sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.35)'; document.body.appendChild(bd);
    } return ok; }, sels);
}
const clearMarks = (page) => page.evaluate(()=>document.querySelectorAll('.__x').forEach(e=>e.remove()));

async function capCore(page, ss, {sel, outline, status, note, fullName}={}){
  const file = LED[ss]; if(!file){ results.push({ss,ok:false,status:'未撮影',note:'台帳に無し',file:'-'}); return; }
  const out = path.join(SHOTS, subdir(ss), fullName || safe(file));
  try{
    fs.mkdirSync(path.dirname(out),{recursive:true});
    if(outline) await box(page, outline);
    if(sel) await page.locator(sel).first().screenshot({path:out,type:'png'});
    else await page.screenshot({path:out,type:'png'});
    await clearMarks(page);
    results.push({ss,ok:true,status:status||'撮影済',note:note||'',file:path.basename(out)});
    console.log('OK  ',ss, note?('('+note+')'):'');
  }catch(e){ await clearMarks(page).catch(()=>{}); results.push({ss,ok:false,status:'未撮影',note:(e.message||'').split('\n')[0],file:safe(file)}); console.error('FAIL',ss,e.message); }
}
function skip(ss, status, note){ const f=LED[ss]; results.push({ss,ok:false,status,note,file:f?safe(f):'-'}); console.log('SKIP',ss,'('+status+')',note); }

async function annotate(page, ss, sels, note){
  const file = LED[ss]; if(!file) return;
  const annName = safe(file).replace(/\.png$/, '_annotated.png');
  const out = path.join(SHOTS, subdir(ss), annName);
  try{
    const ok = await badges(page, sels);
    if(!ok){ await clearMarks(page); results.push({ss:ss+'(注釈)',ok:false,status:'注釈保留',note:'対象要素要確認',file:annName}); console.log('ANNO-HOLD',ss); return; }
    await page.screenshot({path:out,type:'png'});
    await clearMarks(page);
    results.push({ss:ss+'(注釈)',ok:true,status:'注釈済み',note:(note||'')+' 注釈'+ok+'点',file:annName});
    console.log('ANNO',ss,'->',annName,'('+ok+')');
  }catch(e){ await clearMarks(page).catch(()=>{}); results.push({ss:ss+'(注釈)',ok:false,status:'注釈保留',note:(e.message||'').split('\n')[0],file:annName}); console.error('ANNO-FAIL',ss,e.message); }
}

async function seedDummy(page){
  await page.goto(APP,{waitUntil:'load'});
  await page.evaluate(()=>{ try{localStorage.clear();}catch(e){} });
  await page.reload({waitUntil:'load'});
  await page.evaluate(async ()=>{
    const y=document.getElementById('menuYear'),m=document.getElementById('menuMonth'); if(y&&m){y.value='2026';m.value='8';setMenuPeriodFromInputs();}
    const mk=(n,dept,opt={})=>({id:'dummy'+n,name:'サンプル '+n,sei:'サンプル',mei:String(n),seiKana:'さんぷる',meiKana:String(n),kana:'さんぷる '+n,empNo:String(90000+n),dept,tags:opt.tags||[],skill:'',offWds:opt.offWds||[],offHolidays:!!opt.offHolidays,useFixedOff:true,useWeeklyLimit:true,weeklyAvailableDays:5,canShifts:['C','E','G'],supportDepts:opt.supportDepts||[dept],minDays:0,maxDays:0});
    let n=0; const s=[]; const add=(d,c,o)=>{for(let i=0;i<c;i++){n++;s.push(mk(n,d,(i===0?o:undefined)||{}));}};
    add('店長',1); add('CA',3,{tags:['副店長']}); add('管理',2); add('SCA',2); add('用品',2); add('トリマー',3,{tags:['チーフ'],offWds:[2],offHolidays:true,supportDepts:['トリマー','用品']}); add('トレーナー',1);
    state.staff=s;
    DEPTS.forEach(d=>{ state.deptNeeds[d]={week:{E:1,M:1,L:1},hol:{E:1,M:1,L:1}}; });
    state.recurringSchedules=[{id:'r1',tag:'納品',axis:'date',month:'every',day:'10'}];
    normalizeState(); persist(); renderInputs(); renderAll();
    for(const d of DEPTS){ try{ await generateDeptSchedule(d);}catch(e){} }
    window.isWarningAllowed=()=>true;
    for(const d of DEPTS){ try{ setActiveBuildDept(d); if(!confirmedDepts[d]) toggleDeptConfirm(d, {skipConfirm:true});}catch(e){} }
    persist(); renderAll();
  });
  await page.waitForTimeout(400);
}

(async ()=>{
  LED = parseLedger();
  const browser = await loadChromium().launch({headless:true});
  const ctx = await browser.newContext({viewport:VIEWPORT, deviceScaleFactor:DSF});
  const page = await ctx.newPage();
  page.on('dialog', d=>d.dismiss().catch(()=>{})); // 確認ダイアログは絶対に承認しない

  await seedDummy(page);

  // ===== 共通メニュー =====
  await show(page,'calendar');
  await capCore(page,'SS-002',{outline:'#currentPeriodBadge',note:'締め月バッジ'});
  await capCore(page,'SS-003',{outline:'.menuRail .backupHint',note:'バックアップ取得ショートカット'});
  // よく使う/管理者向け/店長のみ の各グループ見出し
  const grp = (label)=>`.menuRail .menuGroup:has-text("${label}")`;
  await capCore(page,'SS-004',{outline:'xpath=//*[contains(@class,"menuGroup")][contains(.,"よく使う")]',note:'よく使うグループ'});
  await capCore(page,'SS-005',{outline:'xpath=//*[contains(@class,"menuGroup")][contains(.,"管理者向け")]',note:'管理者向けグループ'});
  await capCore(page,'SS-006',{outline:'xpath=//*[contains(@class,"menuGroup")][contains(.,"店長")]',note:'店長のみグループ'});

  // ===== 全体シフト表 =====
  await show(page,'calendar');
  await capCore(page,'SS-102',{outline:'#calendarEditBtn',note:'編集モード切替'});
  await capCore(page,'SS-103',{outline:'.menuPanel[data-panel="calendar"] .panelActions .btn',note:'部署別シフト作成へ'});
  await capCore(page,'SS-108',{outline:'#year',note:'締め年変更'});
  await capCore(page,'SS-109',{outline:'#month',note:'締め月変更'});
  await capCore(page,'SS-110',{outline:'.menuPanel[data-panel="calendar"] .periodBox, .menuPanel[data-panel="calendar"] .calendarControl',note:'15日締め期間'});
  await capCore(page,'SS-111',{outline:'.menuPanel[data-panel="calendar"] .legend',note:'区分の色'});
  // 編集後確認：編集モードのテーブル
  await page.evaluate(()=>{ if(typeof calendarEditMode!=='undefined' && !calendarEditMode) toggleCalendarEditMode(); renderAll(); window.scrollTo(0,0); });
  await page.waitForTimeout(300); await removeToasts(page);
  await capCore(page,'SS-112',{outline:'.menuPanel[data-panel="calendar"] .tableWrap',note:'編集モードの表（編集後確認）'});
  await page.evaluate(()=>{ if(calendarEditMode) toggleCalendarEditMode(); renderAll(); });

  // ===== 基本ルール（共通） =====
  await page.evaluate(()=>{ showMenuPanel('basic'); setBasicTab('common'); window.scrollTo(0,0); }); await page.waitForTimeout(300);
  await capCore(page,'SS-201',{note:'基本ルール 画面全体'});
  await capCore(page,'SS-202',{outline:'#basicTabCommonBtn',note:'共通ルールタブ'});
  await capCore(page,'SS-204',{outline:'#maxConsecutive',note:'最大連勤'});
  await capCore(page,'SS-205',{outline:'#attempts',note:'試行回数'});
  await capCore(page,'SS-206',{outline:'label[for="attempts"]',note:'早期終了の説明'});
  await capCore(page,'SS-207',{outline:'#avoidLateEarly',note:'遅番→翌日早番を避ける'});
  await capCore(page,'SS-208',{outline:'#avoidLateEarly',note:'平日遅番→土祝早番禁止（同一設定）'});
  await capCore(page,'SS-209',{outline:'#holidayAsWeekend',note:'土日祝を必要人数で扱う'});
  await capCore(page,'SS-210',{outline:'#tagManager',note:'スタッフタグ一覧'});
  await capCore(page,'SS-211',{outline:'#scheduleTagManager',note:'全体予定タグ一覧'});
  await capCore(page,'SS-212',{outline:'#recurringScheduleBox',note:'定期予定'});
  await capCore(page,'SS-213',{outline:'#closedWeekdays',note:'定休日の曜日'});
  await capCore(page,'SS-214',{outline:'#global_week_E',note:'全体の最低人数'});
  await capCore(page,'SS-215',{outline:'#global_week_E',note:'平日 全体早遅'});
  await capCore(page,'SS-216',{outline:'#global_hol_E',note:'土日祝 全体早遅'});
  await capCore(page,'SS-217',{outline:'#shiftDefEditor',note:'シフト区分一覧'});
  // シフト区分編集を開く
  await page.evaluate(()=>{ const b=document.querySelector('[data-sapact="defToggle"]'); if(b) b.click(); }); await page.waitForTimeout(300);
  await capCore(page,'SS-218',{outline:'#shiftDefEditor .sapTable, #shiftDefEditor table',note:'シフト区分編集'});
  // 区分デザイン設定を開く
  await page.evaluate(()=>{ const b=document.querySelector('[data-sapact="toggle"]'); if(b) b.click(); }); await page.waitForTimeout(300);
  await capCore(page,'SS-219',{outline:'.shiftAppearanceWrap .sapTable',note:'区分デザイン設定'});
  // 基本ルール（部署別）
  await page.evaluate(()=>{ setBasicTab('dept'); if(typeof setActiveBasicDept==='function') setActiveBasicDept('トリマー'); window.scrollTo(0,0); }); await page.waitForTimeout(300);
  await capCore(page,'SS-203',{outline:'#basicTabDeptBtn',note:'部署別ルールタブ'});
  await capCore(page,'SS-220',{outline:'#basicDeptTabs',note:'部署タブ切替'});
  await capCore(page,'SS-221',{outline:'#basicDeptRulePanel',note:'部署別必要人数'});
  await capCore(page,'SS-222',{note:'基本ルール（変更後確認の画面）'});

  // ===== 部署別シフト作成 =====
  await page.evaluate(()=>{ showMenuPanel('deptBuild'); setActiveBuildDept('トリマー'); renderAll(); window.scrollTo(0,0); }); await page.waitForTimeout(400);
  await capCore(page,'SS-306',{outline:'#deptBuildPanel .confirmBtn',note:'確定後は編集不可（確定/再編集ボタン付近）'});
  await capCore(page,'SS-307',{outline:'.menuPanel[data-panel="deptBuild"] .panelActions .btn2',note:'全体シフト表へ'});
  await page.evaluate(()=>{ const t=[...document.querySelectorAll('#deptBuildPanel button')].find(b=>/自動生成/.test(b.textContent)); if(t)t.click(); const mb=document.querySelector('.monthlyBox'); if(mb){mb.scrollIntoView({block:'start'});window.scrollBy(0,-12);} }); await page.waitForTimeout(400);
  await capCore(page,'SS-308',{sel:'.monthlyBox',note:'トリマー月次表'});
  await page.evaluate(()=>{ const t=[...document.querySelectorAll('#deptBuildPanel button')].find(b=>/下書きチェック|チェック/.test(b.textContent)); if(t)t.click(); window.scrollTo(0,0); }); await page.waitForTimeout(300);
  await capCore(page,'SS-309',{outline:'#deptBuildPanel',note:'確定前の確認（下書きチェック等）'});
  await page.evaluate(()=>{ showMenuPanel('calendar'); if(calendarEditMode)toggleCalendarEditMode(); renderAll(); window.scrollTo(0,0); }); await page.waitForTimeout(300); await removeToasts(page);
  await capCore(page,'SS-310',{outline:'.menuPanel[data-panel="calendar"] .tableWrap',note:'確定が全体表に反映'});

  // ===== スタッフ =====
  await page.evaluate(()=>{ showMenuPanel('staff'); activeStaffDept='全体'; renderAll(); window.scrollTo(0,0); }); await page.waitForTimeout(300);
  await capCore(page,'SS-411',{outline:'#staffList',note:'社員番号の昇順で並ぶ一覧'});
  await capCore(page,'SS-406',{outline:'#staffList .staffItem .empNoBadge',note:'同姓同名は社員番号・よみで識別'});
  await page.evaluate(()=>{ const id=(state.staff[0]||{}).id; if(id) openStaffDetails(id); }); await page.waitForTimeout(300);
  await capCore(page,'SS-405',{outline:'.staffItem .stNamePart, .staffItem .stSei',note:'氏名編集'});
  await capCore(page,'SS-412',{outline:'.staffItem',note:'変更は自動保存（保存確認）'});
  await capCore(page,'SS-413',{outline:'.staffItem .btnDanger, .staffItem button',note:'削除または無効化（押下せず）'});
  await capCore(page,'SS-409',{outline:'.staffItem',note:'個別の希望は別画面（シフト希望・全体予定）'});

  // ===== シフト希望・全体予定 =====
  const trim = await page.evaluate(()=> (state.staff.find(s=>s.dept==='トリマー')||state.staff[0]).name );
  await page.evaluate((nm)=>{ activePrefDept=(state.staff.find(s=>s.name===nm)||{}).dept||'トリマー'; activePrefStaff=nm; setPrefsTab('request'); showMenuPanel('prefs'); renderInputs(); renderAll(); window.scrollTo(0,0); }, trim);
  await page.waitForTimeout(300);
  await capCore(page,'SS-512',{outline:'.prefAddBox',note:'追加すると自動保存（保存確認）'});
  await capCore(page,'SS-514',{outline:'#currentPeriodBadge',note:'希望は締め月ごとに保持'});
  await capCore(page,'SS-510',{outline:'#prefList table, #prefList .recList',note:'登録済みの希望を編集'});
  await capCore(page,'SS-511',{outline:'#prefList table, #prefList .recList',note:'登録済みの希望を削除（押下せず）'});

  // ===== 集計・警告 =====
  await show(page,'stats');
  await capCore(page,'SS-707',{outline:'.menuPanel[data-panel="stats"] .panelActions, #statsNextAction',note:'全体表へ戻る／次アクション'});
  await capCore(page,'SS-708',{outline:'#warnings',note:'警告の詳細一覧'});
  // 警告なし状態：必要人数0で再生成し警告を抑える
  await page.evaluate(async ()=>{ DEPTS.forEach(d=>{state.deptNeeds[d]={week:{E:0,M:0,L:0},hol:{E:0,M:0,L:0}};}); state.globalNeeds={week:{E:0,L:0},hol:{E:0,L:0}}; normalizeState(); for(const d of DEPTS){try{await generateDeptSchedule(d);}catch(e){}} persist(); renderAll(); });
  await show(page,'stats');
  await capCore(page,'SS-709',{note:'警告が少ない状態（警告なしに近い・ダミー）'});

  // ===== OBIC =====
  await page.evaluate(()=>{ showMenuPanel('obic'); renderAll(); window.scrollTo(0,0); }); await page.waitForTimeout(300);
  await capCore(page,'SS-809',{outline:'.menuPanel[data-panel="obic"] .btn2, .menuPanel[data-panel="obic"] button',note:'全体シフト表へ戻る'});

  // ===== マニュアル（別ページ表示） =====
  await capCore(page,'SS-903',{outline:'.menuItem.menuLink',note:'使い方/クイックは別タブで開く（メニューのリンク）'});
  await page.goto(MANUAL,{waitUntil:'load'}); await page.waitForTimeout(500);
  await capCore(page,'SS-901',{note:'使い方マニュアル（別ページ）'});
  await page.goto(QUICK,{waitUntil:'load'}); await page.waitForTimeout(500);
  await capCore(page,'SS-902',{note:'クイックマニュアル（別ページ）'});

  // ===== 撮影できないもの（保留／要実機確認） =====
  skip('SS-513','要実機確認','削除確認は native の confirm ダイアログのため自動撮影不可');
  skip('SS-604','要実機確認','OSのファイル選択ダイアログのため自動撮影不可（手動撮影）');
  skip('SS-605','保留','「通常出力との違い」は単一画面でなく説明図のため保留');
  skip('SS-608','要実機確認','OSのファイル保存/エクスプローラ表示のため自動撮影不可（手動撮影）');
  skip('SS-609','保留','復元後確認は復元の実行が必要なため保留（復元は実行しない）');
  skip('SS-808','要実機確認','OBIC本体への貼付確認は外部システムのため対象外（実機確認）');

  // ===== SS-101 撮り直し（トースト写り込み解消） =====
  await page.goto(APP,{waitUntil:'load'}); // 別ページから戻る（データは再生成しない＝ここでは空のクリーン状態）
  await seedDummy(page); // ダミー再投入
  await page.evaluate(()=>{ showMenuPanel('calendar'); if(calendarEditMode)toggleCalendarEditMode(); renderAll(); window.scrollTo(0,0); });
  await page.waitForTimeout(3800); await removeToasts(page); await page.waitForTimeout(200);
  await capCore(page,'SS-101',{note:'撮り直し（トースト写り込み解消）',fullName:safe(LED['SS-101'])});

  // ===== 注釈（優先SS → _annotated） =====
  // 各SSの状態を作ってから番号バッジを描画
  const A = async (panel, prep, ss, sels, note) => { if(prep) await prep(); else await show(page, panel); await page.waitForTimeout(250); await removeToasts(page); await annotate(page, ss, sels, note); };
  // バックアップ
  await show(page,'actions');
  await annotate(page,'SS-601',['.menuPanel[data-panel="actions"] .btn','.menuPanel[data-panel="actions"] .btnCaution','.menuPanel[data-panel="actions"] .btnDanger'],'取得/復元/初期化');
  await annotate(page,'SS-602',['.menuPanel[data-panel="actions"] .btn'],'JSON保存');
  await annotate(page,'SS-603',['.menuPanel[data-panel="actions"] .btnCaution'],'復元');
  await annotate(page,'SS-606',['.menuPanel[data-panel="actions"] .btnDanger'],'すべて初期化');
  // スタッフ
  await page.evaluate(()=>{ showMenuPanel('staff'); activeStaffDept='全体'; renderAll(); window.scrollTo(0,0); }); await page.waitForTimeout(300);
  await annotate(page,'SS-401',['.staffAddButton','.staffSearchWrap','#staffList .staffItem .staffSummaryName'],'追加/検索/名前');
  await page.evaluate(()=>{ const s=state.staff.find(x=>(x.offWds||[]).length)||state.staff[0]; if(s) openStaffDetails(s.id); }); await page.waitForTimeout(300);
  await annotate(page,'SS-407',['.staffItem .weekdayChecks'],'固定公休');
  await annotate(page,'SS-408',['.staffItem .stOffHoliday'],'祝日固定公休');
  // シフト希望
  await page.evaluate((nm)=>{ activePrefDept=(state.staff.find(s=>s.name===nm)||{}).dept||'トリマー'; activePrefStaff=nm; setPrefsTab('request'); showMenuPanel('prefs'); renderInputs(); renderAll(); window.scrollTo(0,0); }, trim); await page.waitForTimeout(300);
  await annotate(page,'SS-501',['#prefTopTabs button:nth-child(1)','#prefDeptSelect','#prefStaffTabs','#newPrefShift','.prefAddBox button.btn'],'タブ/部署/スタッフ/希望/追加');
  await page.evaluate(()=>{ const s=document.getElementById('newPrefShift'); if(s){s.value='OFF';s.dispatchEvent(new Event('change',{bubbles:true}));} }); await page.waitForTimeout(150);
  await annotate(page,'SS-504',['#newPrefShift','.prefAddBox button.btn'],'休を選ぶ/追加');
  await annotate(page,'SS-505',['#newPrefShift','.prefAddBox button.btn'],'勤務不可も休で追加');
  // 部署別
  await page.evaluate(()=>{ showMenuPanel('deptBuild'); setActiveBuildDept('トリマー'); if(confirmedDepts['トリマー'])toggleDeptConfirm('トリマー'); renderAll(); window.scrollTo(0,0); }); await page.waitForTimeout(400);
  await annotate(page,'SS-301',['#deptBuildPanel .deptBuildCard.active','#deptBuildPanel .btn.genBtn','#deptBuildPanel .confirmBtn'],'部署/自動作成/確定');
  await annotate(page,'SS-303',['#deptBuildPanel .btn.genBtn'],'この部署だけ自動作成');
  await annotate(page,'SS-305',['#deptBuildPanel .confirmBtn'],'確定');
  // OBIC
  await page.evaluate(()=>{ DEPTS.forEach(d=>{state.deptNeeds[d]={week:{E:1,M:1,L:1},hol:{E:1,M:1,L:1}};}); }); // 念のため
  await page.evaluate(async()=>{ window.isWarningAllowed=()=>true; for(const d of DEPTS){try{await generateDeptSchedule(d);setActiveBuildDept(d);if(!confirmedDepts[d])toggleDeptConfirm(d, {skipConfirm:true});}catch(e){}} persist(); showMenuPanel('obic'); renderAll(); window.scrollTo(0,0); }); await page.waitForTimeout(400);
  await annotate(page,'SS-801',['#obicSummary','.obicCopyBtn','.obicExcelBtn'],'対象人数/コピー/Excel');
  await annotate(page,'SS-806',['.obicCopyBtn'],'コピー');
  await annotate(page,'SS-807',['.obicExcelBtn'],'Excel出力');

  await ctx.close(); await browser.close();
  fs.writeFileSync(path.join(ROOT,'.last-extra-results.json'), JSON.stringify(results,null,2));
  const c = results.reduce((a,r)=>{const k=r.status;a[k]=(a[k]||0)+1;return a;},{});
  console.log('\n=== 集計 ===', JSON.stringify(c));
})().catch(e=>{ console.error('FATAL',e); try{fs.writeFileSync(path.join(ROOT,'.last-extra-results.json'),JSON.stringify(results,null,2));}catch(_){ } process.exit(1); });
