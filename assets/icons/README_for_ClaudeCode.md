# KJM Shift+ Modern UI Icon Set

このアイコンセットは、シフト作成アプリの既存アイコン差し替え用です。

## デザイン方針

- モダンUI向けの角丸アウトラインアイコン
- ペットサロンらしいやさしさを残すセージグリーン基調
- 絵文字感・チープ感を避ける
- 24pxグリッド、stroke-width 1.85、round cap / round join
- SVGを優先使用し、必要に応じてPNG 128pxを使用

## 収録形式

- `svg/`：アプリ実装推奨
- `png_128/`：画像指定が必要な場合の代替
- `manifest.json`：アイコン一覧

## Claude Codeへの修正依頼例

既存アプリの絵文字・チープなアイコンを、このアイコンセットのSVGに差し替えてください。
基本方針は以下です。

1. SVGは `assets/icons/` に配置する
2. 既存の絵文字アイコンは削除または非表示にする
3. 左メニューは `nav-*` アイコンを使用する
4. 操作ボタンは `action-*` アイコンを使用する
5. エラー・許容・成功などの状態表示は `status-*` アイコンを使用する
6. アイコンサイズは基本 `20px`、テーブル内や小ボタンでは `16px`
7. 色はSVG内の色をそのまま使うか、CSS変数で `currentColor` 化できる場合はアプリ側の `--primary` を使う
8. レイアウトはアイコンと文字の間隔を `8px` に統一する
9. アイコンだけで意味を伝えず、必ずテキストラベルを残す

## 推奨マッピング

| 画面・操作 | アイコン |
|---|---|
| 全体シフト表 | `nav-overall-shift.svg` |
| 部署別シフト作成 | `nav-department-create.svg` |
| 基本ルール | `nav-rules.svg` |
| スタッフ | `nav-staff.svg` |
| 固定希望・勤務不可 | `nav-requests.svg` |
| バックアップ | `nav-backup.svg` |
| 集計・警告 | `nav-warnings.svg` |
| 自動作成 | `action-auto-generate.svg` |
| 確定 | `action-confirm.svg` |
| 編集 | `action-edit.svg` |
| 再編集 | `action-reedit.svg` |
| CSV出力 | `action-export-csv.svg` |
| Excel出力 | `action-export-excel.svg` |
| 印刷/PDF | `action-print-pdf.svg` |
| バックアップ取得 | `action-backup-save.svg` |
| バックアップから復元 | `action-restore.svg` |
| スタッフ追加 | `action-add-staff.svg` |
| 削除 | `action-delete.svg` |
| 上へ移動 | `action-move-up.svg` |
| 下へ移動 | `action-move-down.svg` |
| エラー | `status-error.svg` |
| 許容済み | `status-allowed.svg` |
| 成功・完了 | `status-success.svg` |
| 情報 | `status-info.svg` |
| 早番 | `shift-early.svg` |
| 中番 | `shift-middle.svg` |
| 遅番 | `shift-late.svg` |

## 注意

アプリのUI改善では、アイコンを増やしすぎないでください。
左メニュー・主要ボタン・警告状態に絞る方が、モダンで業務アプリらしい印象になります。
