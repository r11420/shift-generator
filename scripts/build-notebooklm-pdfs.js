/*
 * build-notebooklm-pdfs.js
 *
 * notebooklm/02_screenshots/ 配下のスクリーンショットを、画面カテゴリ別の
 * NotebookLM 投入用 PDF（A4縦・1ページ1枚・キャプション付き）へ集約します。
 *
 * - 同一SS番号で通常PNGと _annotated.png がある場合は _annotated を採用。
 * - 各画像の直上に「SS番号／画面名：キャプション」をテキストで掲載。
 * - 既存画像は一切加工・トリミング・再圧縮しない（元バイトを data URI で埋め込み）。
 * - 出力先: notebooklm/05_sources/
 *
 * 本スクリプトは画像・本体アプリ・台帳・撮影ログ・既存撮影スクリプトを変更しません。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function loadChromium() {
  try { return require('playwright').chromium; } catch (e) {}
  try {
    const root = execSync('npm root -g').toString().trim();
    return require(path.join(root, 'playwright')).chromium;
  } catch (e) {}
  return require('/opt/node22/lib/node_modules/playwright').chromium;
}

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'notebooklm', '02_screenshots');
const OUT = path.join(ROOT, 'notebooklm', '05_sources');

const FOLDERS = [
  { dir: '00_common',          name: '共通メニュー',        pdf: 'screenshots_00_common.pdf' },
  { dir: '01_global_shift',    name: '全体シフト表',        pdf: 'screenshots_01_global_shift.pdf' },
  { dir: '02_basic_rules',     name: '基本ルール',          pdf: 'screenshots_02_basic_rules.pdf' },
  { dir: '03_department_shift',name: '部署別シフト作成',     pdf: 'screenshots_03_department_shift.pdf' },
  { dir: '04_staff',           name: 'スタッフ',            pdf: 'screenshots_04_staff.pdf' },
  { dir: '05_requests',        name: 'シフト希望・全体予定', pdf: 'screenshots_05_requests.pdf' },
  { dir: '06_backup',          name: 'バックアップ',        pdf: 'screenshots_06_backup.pdf' },
  { dir: '07_warnings',        name: '集計・警告',          pdf: 'screenshots_07_warnings.pdf' },
  { dir: '08_obic',            name: 'OBIC連携用',          pdf: 'screenshots_08_obic.pdf' },
  { dir: '09_manuals',         name: 'マニュアル',          pdf: 'screenshots_09_manuals.pdf' },
];

// SS番号 → キャプション本文（「SS番号／画面名：」の後ろ）
const CAP = {
  'SS-001': '左メニュー全体の構成（よく使う・管理者向け・店長のみ）を確認できます',
  'SS-002': '締め月（15日締め）の確認位置を示します',
  'SS-003': 'バックアップ取得のショートカット（こまめな取得を推奨）です',
  'SS-004': '「よく使う」メニューグループを示します',
  'SS-005': '「管理者向け」メニューグループを示します',
  'SS-006': '「店長のみ」メニューグループを示します',

  'SS-101': '全体シフト表の画面全体（確定済みシフトの一覧）です',
  'SS-102': '編集モードへの切替位置を示します',
  'SS-103': '部署別シフト作成画面への移動を示します',
  'SS-104': 'ファイル出力メニュー（CSV・Excel・印刷/PDF）を示します',
  'SS-105': 'CSV出力の操作位置を示します',
  'SS-106': 'Excel出力の操作位置を示します',
  'SS-107': '印刷・PDF出力の操作位置を示します',
  'SS-108': '締め年の変更位置を示します',
  'SS-109': '締め月の変更位置を示します',
  'SS-110': '15日締めの対象期間の表示を示します',
  'SS-111': 'シフト区分の色分け表示を示します',
  'SS-112': '編集後の反映確認の例です',

  'SS-201': '基本ルールの画面全体です',
  'SS-202': '全部署に共通するルールの設定箇所です',
  'SS-203': '部署別ルールの設定箇所です',
  'SS-204': '最大連勤の設定箇所です',
  'SS-205': '自動作成の試行回数の設定箇所です',
  'SS-206': '早期終了に関する説明の表示です',
  'SS-207': '遅番の翌日に早番を避ける設定に関する箇所です',
  'SS-208': '平日の遅番・土祝の早番に関する設定箇所です',
  'SS-209': '土日祝の必要人数の扱いに関する設定箇所です',
  'SS-210': 'スタッフ向けタグの一覧です（用途は画面上で確認してください）',
  'SS-211': '全体予定向けタグの一覧です',
  'SS-212': '定期予定の設定箇所です',
  'SS-213': '定休日の曜日の設定箇所です',
  'SS-214': '全体の最低人数の設定箇所です',
  'SS-215': '平日の全体早遅に関する設定箇所です',
  'SS-216': '土日祝の全体早遅に関する設定箇所です',
  'SS-217': 'シフト区分の一覧です',
  'SS-218': 'シフト区分の編集箇所です',
  'SS-219': '区分デザイン設定（区分の見た目）の設定箇所です',
  'SS-220': '部署タブの切替を示します',
  'SS-221': '部署別の必要人数の設定箇所です',
  'SS-222': '変更後の反映確認の例です',

  'SS-301': '部署別シフト作成の画面全体です（赤丸・番号で操作箇所を注釈）',
  'SS-302': '作成する部署の選択（カード）を示します',
  'SS-303': '「この部署だけ自動作成」の操作を示します（赤丸・番号で注釈）',
  'SS-304': '自動作成の結果（確認表）の例です',
  'SS-305': '確定の操作位置を示します（赤丸・番号で注釈。確定はこの後の操作）',
  'SS-306': '確定後は編集できなくなる状態を示します',
  'SS-307': '全体シフト表への移動を示します',
  'SS-308': 'トリマー部署の月次表（参照専用）の例です',
  'SS-309': '確定前の確認の例です',
  'SS-310': '全体表への反映確認の例です',

  'SS-401': 'スタッフ画面の全体です（赤丸・番号で操作箇所を注釈）',
  'SS-402': '部署タブの切替を示します',
  'SS-403': 'スタッフ追加の操作を示します',
  'SS-404': '社員番号の入力欄を示します',
  'SS-405': '氏名の編集箇所を示します',
  'SS-406': '同姓同名のスタッフは社員番号などで見分けます（具体的な方法は画面上で確認してください）',
  'SS-407': '固定公休（曜日）の設定箇所です（赤丸・番号で注釈）',
  'SS-408': '祝日の固定公休の設定箇所です（赤丸・番号で注釈）',
  'SS-409': '個別の希望は別画面（シフト希望・全体予定）で登録することを示します',
  'SS-410': '兼務可能（対応できる）部署の設定箇所です',
  'SS-411': '社員番号順に並ぶスタッフ一覧の例です',
  'SS-412': '保存後の反映確認の例です',
  'SS-413': 'スタッフの削除または無効化の箇所です（操作方法は画面上で確認してください）',

  'SS-501': 'シフト希望・全体予定の画面全体です（赤丸・番号で操作箇所を注釈）',
  'SS-502': '表示する部署の絞り込みを示します',
  'SS-503': 'スタッフ別タブを示します',
  'SS-504': '希望休（「休」）を選んで追加する操作です（赤丸・番号で注釈）',
  'SS-505': '勤務不可も現行アプリでは希望休と同じ「休」として登録します（赤丸・番号で注釈）',
  'SS-506': '早番希望を選んで追加する操作です',
  'SS-507': '中番希望を選んで追加する操作です',
  'SS-508': '遅番希望を選んで追加する操作です',
  'SS-509': '全体予定（タグ・日付/曜日）を追加する操作です',
  'SS-510': '登録した希望の編集箇所です',
  'SS-511': '登録した希望の削除箇所です',
  'SS-512': '保存後の反映確認の例です',
  'SS-514': '希望は締め月ごとに保持されることを示します',
  'SS-515': '登録後の希望一覧（ダミー1件）の例です',

  'SS-601': 'バックアップ画面の全体です（赤丸・番号で操作箇所を注釈）',
  'SS-602': 'バックアップ取得（JSON保存）の操作位置です（赤丸・番号で注釈）',
  'SS-603': '復元ボタンの表示のみです。復元は実行していません（赤丸・番号で注釈）',
  'SS-606': 'すべて初期化ボタンの表示のみです。初期化は実行していません（赤丸・番号で注釈）',
  'SS-607': '暫定PNGです。native確認ダイアログは必要に応じて手動撮影で差し替え。初期化は実行していません',

  'SS-701': '集計・警告の画面全体です',
  'SS-702': 'スタッフ別の回数表です',
  'SS-703': '部署別不足の警告の例です（ダミーデータで誘発した警告。実データではありません）',
  'SS-704': '全体早遅不足の警告の例です（ダミーデータで誘発した警告。実データではありません）',
  'SS-705': '連勤違反の警告の例です（ダミーデータで誘発した警告。実データではありません）',
  'SS-706': '希望未達の警告の例です（ダミーデータで誘発した警告。実データではありません）',
  'SS-707': '全体シフト表への移動を示します',
  'SS-708': '警告の詳細表示の例です',
  'SS-709': '警告がない状態の一例です（警告の有無は登録内容により変わります）',

  'SS-801': 'OBIC連携用の画面全体です（休日表示・社員番号順。赤丸・番号で注釈）',
  'SS-802': '休日の表示を示します',
  'SS-803': '勤務日は空欄で表示されることを示します',
  'SS-804': '対象の締め月の表示を示します',
  'SS-805': '社員番号の昇順で並ぶ一覧を示します',
  'SS-806': 'コピーの操作位置を示します（赤丸・番号で注釈。OBIC本体へのアクセスはしていません）',
  'SS-807': 'Excel出力の操作位置を示します（赤丸・番号で注釈）',
  'SS-809': '全体シフト表への移動を示します',

  'SS-901': '使い方マニュアル（詳しい手順）の画面です',
  'SS-902': 'クイックマニュアル（よく使う操作の早わかり）の画面です',
  'SS-903': 'マニュアルを別タブで表示する例です',
};

const INTRO = 'このPDFは、KJM Shift＋のNotebookLM用スクリーンショット資料です。各画像の上に記載されたSS番号は、NotebookLM本文・FAQ・スクリーンショット台帳と対応しています。画像内のデータはダミーデータです。注釈付き画像があるSSでは、注釈付き画像を優先して掲載しています。';
const FOOTER = '注記：本PDF内のスクリーンショットはNotebookLM投入用にカテゴリ別に集約したものです。危険操作に該当する復元・初期化は実行していません。警告系スクリーンショットはダミーデータで警告を誘発して撮影しています。本番共有前には、全画像を人間が目視確認してください。';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function ssOf(filename) {
  const m = filename.match(/^(SS-\d+)/);
  return m ? m[1] : null;
}
// 同一SSで _annotated を優先して1枚に絞る
function selectImages(dir) {
  const abs = path.join(SHOTS, dir);
  if (!fs.existsSync(abs)) return [];
  const pngs = fs.readdirSync(abs).filter((f) => /\.png$/i.test(f));
  const bySS = new Map();
  for (const f of pngs) {
    const ss = ssOf(f);
    if (!ss) continue;
    const annotated = /_annotated\.png$/i.test(f);
    const cur = bySS.get(ss);
    if (!cur) { bySS.set(ss, { ss, file: f, annotated }); continue; }
    if (annotated && !cur.annotated) bySS.set(ss, { ss, file: f, annotated }); // annotated優先
  }
  return [...bySS.values()].sort((a, b) =>
    a.ss.localeCompare(b.ss, undefined, { numeric: true })
  );
}

function buildHtml(folder, items) {
  const css = `
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'IPAPGothic','IPAGothic','WenQuanYi Zen Hei',sans-serif; color:#1a1a1a; }
  .intro { page-break-after: always; padding: 8mm 2mm; }
  .intro .kicker { font-size: 10.5pt; color:#4a7a4a; font-weight:bold; letter-spacing:.04em; }
  .intro h1 { font-size: 19pt; margin: 4mm 0 7mm; line-height:1.4; }
  .intro p { font-size: 11.5pt; line-height: 1.9; margin:0; }
  .page { page-break-after: always; display:flex; flex-direction:column; min-height: 271mm; }
  .cap { font-size: 12.5pt; font-weight: bold; line-height: 1.65;
         margin: 0 0 5mm; padding: 3.5mm 4mm;
         background:#eef3ee; border-left: 5px solid #4a7a4a; border-radius: 3px; }
  .imgwrap { flex: 1; display:flex; align-items:center; justify-content:center; width:100%; }
  .imgwrap img { max-width: 100%; max-height: 232mm; width:auto; height:auto;
                 border:1px solid #cfcfcf; box-shadow: 0 0 0 1px #fff inset; }
  .footer { padding: 8mm 2mm; }
  .footer h2 { font-size: 13pt; margin:0 0 5mm; color:#333; }
  .footer p { font-size: 10.8pt; line-height: 1.95; color:#333; margin:0; }
  `;
  let body = '';
  body += `<div class="intro"><div class="kicker">KJM Shift＋ / NotebookLM ソース</div>` +
          `<h1>スクリーンショット資料：${esc(folder.name)}</h1>` +
          `<p>${esc(INTRO)}</p></div>`;
  for (const it of items) {
    const abs = path.join(SHOTS, folder.dir, it.file);
    const b64 = fs.readFileSync(abs).toString('base64');
    const cap = CAP[it.ss] || '（キャプション未設定）';
    const line = `${it.ss}／${folder.name}：${cap}`;
    body += `<div class="page"><div class="cap">${esc(line)}</div>` +
            `<div class="imgwrap"><img src="data:image/png;base64,${b64}" alt="${esc(it.ss)}"></div></div>`;
  }
  body += `<div class="footer"><h2>注記</h2><p>${esc(FOOTER)}</p></div>`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;
}

(async () => {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const chromium = loadChromium();
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const report = [];
  for (const folder of FOLDERS) {
    const items = selectImages(folder.dir);
    if (items.length === 0) { console.log(`SKIP ${folder.dir} (画像なし)`); continue; }
    const html = buildHtml(folder, items);
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.emulateMedia({ media: 'print' });
    const outPath = path.join(OUT, folder.pdf);
    await page.pdf({ path: outPath, format: 'A4', printBackground: true,
                     margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' } });
    const ann = items.filter((i) => i.annotated).map((i) => i.ss);
    const plain = items.filter((i) => !i.annotated).map((i) => i.ss);
    const size = fs.statSync(outPath).size;
    report.push({ pdf: folder.pdf, name: folder.name, count: items.length,
                  ss: items.map((i) => i.ss), annotated: ann, plain, bytes: size });
    console.log(`OK   ${folder.pdf}  (${items.length}枚, ${(size/1024/1024).toFixed(2)}MB)  注釈:${ann.length}  通常:${plain.length}`);
  }

  await browser.close();
  fs.writeFileSync(path.join(ROOT, '.last-pdf-build.json'), JSON.stringify(report, null, 2));

  // サマリ出力
  let total = 0, totalAnn = 0;
  console.log('\n===== サマリ =====');
  for (const r of report) {
    total += r.count; totalAnn += r.annotated.length;
    console.log(`\n# ${r.pdf} （${r.name}） : ${r.count}枚`);
    console.log(`  SS: ${r.ss.join(', ')}`);
    if (r.annotated.length) console.log(`  注釈採用: ${r.annotated.join(', ')}`);
  }
  console.log(`\n合計画像: ${total} 枚  / 注釈採用: ${totalAnn} 件 / PDF: ${report.length} 本`);
})().catch((e) => { console.error(e); process.exit(1); });
