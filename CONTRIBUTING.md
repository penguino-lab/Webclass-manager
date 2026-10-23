# 開発・検証・不具合報告

利用者向けのダウンロードと導入は [README.md](README.md)、GitHubの基本操作は [GITHUB_GUIDE.md](GITHUB_GUIDE.md) を参照してください。

## 不具合報告

[配布用リポジトリのIssues](https://github.com/penguino-lab/Webclass-manager/issues)に、次を記載してください。

- ブラウザの種類・バージョン、拡張バージョン
- 行った操作と再現手順
- 期待する結果と実際の結果
- 分かる場合は、適用したmainのコミットまたはZIPの取得日

氏名・学籍番号・パスワード・Cookie・認証URL・実際の授業資料・保存した大学サイトのHTMLは投稿しないでください。画面画像も個人情報を伏せてください。

## 変更の流れ

1. アクセス権のある共同開発者は [開発用リポジトリ](https://github.com/penguino-lab/webclass-library-manager) の最新mainを取得します。
2. 目的ごとに作業ブランチを作り、変更します。
3. 関係するテストとブラウザでの確認を行います。
4. 差分を確認してコミット・pushし、Pull Requestを作成します。
5. レビューとCIを確認してmainへマージします。mainへ直接pushせず、競合がある場合は残す内容を確認します。
6. 配布時は開発用のリモートmainを基準に公開配布用へ同期し、README・配布情報・コードのハッシュ一覧を更新します。両リポジトリは自動同期ではありません。

外部からの提案は、まずIssueで目的を共有してください。独自部分のライセンスは未設定のため、投稿物の利用許諾はメンテナーと確認してください。

## 主なファイル

| 対象 | ファイル |
| --- | --- |
| 拡張の定義・権限 | `manifest.json` |
| 講義・教材の判定 | `webclass-adapter.js` |
| 保存処理・サイトへの適用 | `background.js`、`content.js`、`core.js`、`offscreen.js`、`save-file.js` |
| ホーム・ヘッダー・テーマ | `page-ui.js`、`page-ui.css`、`page-themes.js`、`banner-crop.js`、`typography.css` |
| 教材一覧・教材の表示 | `course-ui.js`、`course-ui.css`、`material-ui.js` |
| 資料ライブラリ・設定 | `library.html`、`library.js`、`library.css`、`library-*.js` |
| 検証 | `tests/`、`.github/workflows/test.yml` |

`popup.html`・`popup.js` は残っていますが、現行manifestでは通常クリックのポップアップには指定していません。通常クリックは `background.js` の固定SAMLログイン先を開きます。

## 自動テスト

Node.js 20以降で、リポジトリ直下から実行します。拡張を利用するだけならNode.jsは不要です。

```sh
node --test tests/*.test.js
```

`npm test` でも同じテストを実行できます。GitHub ActionsはNode.js 22で実行します。大学へのログインや実際の資料取得は含みません。

## ダミーサイトでのブラウザ検証

Node.js 22以降とPlaywrightを使います。

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/browser-check.mjs
node tests/theme-browser.mjs
node tests/banner-browser.mjs
node tests/home-ui-browser.mjs
```

総合テストは添付・PDF保存、重複・再ダウンロード、講義別整理、ライブラリ検索・プレビュー等を確認します。テーマ専用テストは配色と同期、バナー専用テストはヘッダー画像の切り取りと保持、ホーム専用テストはライブラリバナーとお知らせティッカーを確認します。

既存のPlaywrightやChromiumを使う場合は `PLAYWRIGHT_MODULE_PATH` と `PLAYWRIGHT_EXECUTABLE_PATH` を指定できます。出力はリポジトリに隣接する `tmp/` 以下です。

テストは普段のブラウザと別のプロファイルで、ダミー資料とダミーサイトを使います。フォルダー選択はテスト用のハンドルで代用しているため、Windowsの実フォルダーピッカー・大学の認証・ネイティブの権限承認は別途手動で確認してください。

手動でダミーサイトを開く場合：

```sh
node tests/demo-server.js
```

拡張設定のベースURLを `http://127.0.0.1:8765/webclass/` に変更し、`http://127.0.0.1:8765/webclass/course.php/26math/` から確認します。検証後は大学のURLへ戻してください。
