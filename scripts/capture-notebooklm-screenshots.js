#!/usr/bin/env node
/**
 * KJM Shift＋ NotebookLM スクリーンショット自動撮影（最小実装）
 *
 * 目的:
 *   notebooklm/01_docs/10_スクリーンショット台帳.md に沿って、NotebookLM 用の
 *   スクリーンショットを台帳どおりのファイル名・保存先で自動撮影する。
 *
 * この最小実装で撮影するのは次の3枚のみ（いきなり全SS番号は撮影しない）:
 *   - SS-001 メニュー全体構成        -> notebooklm/02_screenshots/00_common/
 *   - SS-101 全体シフト表の画面全体  -> notebooklm/02_screenshots/01_global_shift/
 *   - SS-601 バックアップ画面全体    -> notebooklm/02_screenshots/06_backup/
 *
 * 安全方針:
 *   - 新規ブラウザコンテキスト（独立・空の localStorage）で開き、各撮影前にも
 *     localStorage を空にして再読込する。既存の実データ・実 localStorage は読み込まない。
 *   - 撮影直前に「スタッフ0件（実データなし）」を検証し、0件でなければ撮影を中止する
 *     （実名・社員番号・実シフト・実希望休の写り込み防止）。
 *   - 初期化／復元／OBIC本体連携／外部サロン管理システムへのアクセスは一切行わない。
 *   - 本体アプリ（index.html）の仕様・データは変更しない（読み取り専用で表示するだけ）。
 *
 * 実行:
 *   npm run screenshot:notebooklm
 *   ※ Playwright が必要。未導入の場合は `npm install` 後に `npx playwright install chromium`。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const APP_URL = 'file://' + path.join(ROOT, 'index.html');
const SHOTS_ROOT = path.join(ROOT, 'notebooklm', '02_screenshots');
const LOG_PATH = path.join(ROOT, 'notebooklm', '04_checklists', 'スクリーンショット撮影ログ.md');

// 撮影時のブラウザ条件（台帳・チェックリスト準拠）
const VIEWPORT = { width: 1440, height: 1000 };
const DEVICE_SCALE_FACTOR = 1;

// 撮影対象（最小：3枚）。台帳の画像ID・ファイル名・保存先に準拠。
const TARGETS = [
  {
    id: 'SS-001',
    subdir: '00_common',
    file: 'SS-001_メニュー_全体構成.png',
    panel: 'calendar',
    // メニュー全体構成 → 左メニュー（.menuRail）の要素全体を撮る
    selector: '.menuRail',
  },
  {
    id: 'SS-101',
    subdir: '01_global_shift',
    file: 'SS-101_全体シフト表_画面全体.png',
    panel: 'calendar',
    // 画面全体 → ビューポート全体（1440x1000）
    selector: null,
  },
  {
    id: 'SS-601',
    subdir: '06_backup',
    file: 'SS-601_バックアップ_画面全体.png',
    panel: 'actions',
    selector: null,
  },
];

// Playwright を解決する（ローカル node_modules → グローバルの順で探す）
function loadChromium() {
  try {
    return require('playwright').chromium;
  } catch (e) {
    try {
      const groot = require('child_process')
        .execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
      return require(path.join(groot, 'playwright')).chromium;
    } catch (e2) {
      throw new Error(
        'Playwright が見つかりません。`npm install` 後に `npx playwright install chromium` を実行してください。（詳細: ' +
          e.message + '）'
      );
    }
  }
}

function nowStamp() {
  return new Date().toISOString().replace('T', ' ').replace(/\..+$/, '');
}

// 空・無PIIの状態でアプリを開き直す（実データを読み込まない）
async function openClean(page, panel) {
  await page.goto(APP_URL, { waitUntil: 'load' });
  // 念のため localStorage を空にしてから再読込（既存データの写り込み防止）
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'load' });
  // 締め月を固定し、表示を安定させる（個人情報ではない・データは作らない）
  await page.evaluate(() => {
    try {
      const y = document.getElementById('menuYear');
      const m = document.getElementById('menuMonth');
      if (y && m && typeof setMenuPeriodFromInputs === 'function') {
        y.value = '2026';
        m.value = '8';
        setMenuPeriodFromInputs();
      }
    } catch (e) {}
  });
  await page.evaluate((p) => { if (typeof showMenuPanel === 'function') showMenuPanel(p); }, panel);
  await page.waitForTimeout(350);
}

// 実データが無いこと（スタッフ0件）を検証
async function assertNoPII(page) {
  const staffCount = await page.evaluate(() =>
    (typeof state !== 'undefined' && state && Array.isArray(state.staff)) ? state.staff.length : 0
  );
  if (staffCount > 0) {
    throw new Error('スタッフが ' + staffCount + ' 件存在します（実データの可能性）。個人情報保護のため撮影を中止しました。');
  }
}

async function main() {
  const chromium = loadChromium();
  const results = [];
  const browser = await chromium.launch({ headless: true });
  // 新規コンテキスト：独立した空ストレージ（既存 localStorage・実データを読み込まない）
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });
  const page = await context.newPage();

  for (const t of TARGETS) {
    const outDir = path.join(SHOTS_ROOT, t.subdir);
    const outPath = path.join(outDir, t.file);
    try {
      fs.mkdirSync(outDir, { recursive: true });
      await openClean(page, t.panel);
      await assertNoPII(page);

      if (t.selector) {
        const el = page.locator(t.selector).first();
        await el.scrollIntoViewIfNeeded();
        await el.screenshot({ path: outPath, type: 'png' });
      } else {
        await page.screenshot({ path: outPath, type: 'png' }); // ビューポート全体
      }

      const bytes = fs.statSync(outPath).size;
      results.push({ id: t.id, ok: true, outPath, detail: bytes + ' bytes' });
      console.log('OK   ' + t.id + ' -> ' + path.relative(ROOT, outPath));
    } catch (err) {
      const msg = (err && err.message) ? err.message.split('\n')[0] : String(err);
      results.push({ id: t.id, ok: false, outPath, detail: msg });
      console.error('FAIL ' + t.id + ' : ' + msg);
    }
  }

  await context.close();
  await browser.close();
  writeLog(results);

  const failed = results.filter((r) => !r.ok).length;
  console.log('\n完了: 成功 ' + (results.length - failed) + ' / 失敗 ' + failed + '（ログ: ' + path.relative(ROOT, LOG_PATH) + '）');
  process.exit(failed ? 1 : 0);
}

function writeLog(results) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  const header =
    '# スクリーンショット撮影ログ\n\n' +
    'このファイルは `scripts/capture-notebooklm-screenshots.js` が自動生成・追記します。\n' +
    '実行のたびに、撮影条件・成功/失敗・保存先を1ブロックずつ追記します。\n';

  let block = '\n## 実行: ' + nowStamp() + '\n\n';
  block += '- 撮影条件: viewport ' + VIEWPORT.width + 'x' + VIEWPORT.height +
    ' / deviceScaleFactor ' + DEVICE_SCALE_FACTOR + ' / PNG / 新規コンテキスト（空 localStorage・実データなし）\n\n';
  block += '| 画像ID | 状態 | 保存先 | 詳細 |\n|---|---|---|---|\n';
  for (const r of results) {
    const rel = path.relative(ROOT, r.outPath);
    block += '| ' + r.id + ' | ' + (r.ok ? '✅ 成功' : '❌ 失敗') + ' | ' + rel + ' | ' + r.detail + ' |\n';
  }

  let body;
  if (fs.existsSync(LOG_PATH)) {
    body = fs.readFileSync(LOG_PATH, 'utf8');
    if (!body.startsWith('# スクリーンショット撮影ログ')) body = header + body;
  } else {
    body = header;
  }
  fs.writeFileSync(LOG_PATH, body + block);
}

main().catch((e) => {
  // 予期せぬ致命的エラーもログに残す
  const msg = (e && e.message) ? e.message.split('\n')[0] : String(e);
  try {
    writeLog([{ id: '(致命的エラー)', ok: false, outPath: path.join(SHOTS_ROOT, '-'), detail: msg }]);
  } catch (_) {}
  console.error(e);
  process.exit(1);
});
