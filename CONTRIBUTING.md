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

`popup.html`・`popup.js` は残っていますが、現行manifestでは通常クリックのポップアップには指定していません。通常クリックは未許可のWebClassでは初回案内を開き、それ以外では設定済みの大学のURLを開きます。TCUの初期値ではSAML入口を使います。初回導入は `site-discovery.js`・`site-onboarding.js`・`onboarding.*` が担当します。

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
node tests/onboarding-browser.mjs
node tests/library-first-run-browser.mjs
node tests/webclass-updates-browser.mjs
```

総合テストは添付・PDF保存、重複・再ダウンロード、講義別整理、ライブラリ検索・プレビュー等を確認します。テーマ専用テストは配色と同期、バナー専用テストはヘッダー画像の切り取りと保持、ホーム専用テストはライブラリバナーとお知らせティッカーを確認します。

初回導入専用テストは、事前のホスト権限がないプロファイルでの検出と案内・拒否、ユーザー操作内での権限要求、許可済みのテスト用プロファイルでのURL登録と実際の画面適用を確認します。Chromeのネイティブな許可ダイアログの承認操作自体は手動確認が必要です。

`library-first-run-browser.mjs` は、初期画面からのフォルダー選択・キャンセル・拒否、空フォルダー、標準の読み込み範囲、深いフォルダーを読む設定と再読み込み、更新バナー・キャッシュ・案内を閉じる操作・手動確認・ヘッダーの高さ・狭い画面の配置を検証します。通常は更新情報をテスト用の応答に置き換えます。`CHECK_LIVE_UPDATE=1` を指定した場合のみ、実際の公開GitHubへ更新確認を1回行います。

`webclass-updates-browser.mjs` は、WebClassへのアクセスとライブラリの更新確認を並行させ、通信中も画面が使えること、全タブの通信共有、通知と閉じる操作の同期、次の新版、フレーム内での重複防止、固定ヘッダー、常時バージョン表示、7テーマの利用不可教材と詳細リンク、狭い画面の配置を検証します。

公開用のGitHub Actionsでも、初回ライブラリ検証とWebClass更新検証をChromiumで実行し、ダミー画面のスクリーンショットを7日間保存します。

同じ検証で、フォルダーの読み取りだけ許可されている状態から表示・保存をまとめて要求すること、拒否後の再試行、要求時のユーザー操作、開講情報と省略記号の色、サイドバーと全資料の短い授業名、テーマ切り替え、サムネイルのホバー・キーボード操作も確認します。ネイティブな「常に許可」の選択は自動化せず、実機で確認してください。

既存のPlaywrightやChromiumを使う場合は `PLAYWRIGHT_MODULE_PATH` と `PLAYWRIGHT_EXECUTABLE_PATH` を指定できます。出力はリポジトリに隣接する `tmp/` 以下です。

テストは普段のブラウザと別のプロファイルで、ダミー資料とダミーサイトを使います。フォルダー選択はテスト用のハンドルで代用しているため、Windowsの実フォルダーピッカー・大学の認証・ネイティブの権限承認は別途手動で確認してください。

手動でダミーサイトを開く場合：

```sh
node tests/demo-server.js
```

拡張設定のベースURLを `http://127.0.0.1:8765/webclass/` に変更し、`http://127.0.0.1:8765/webclass/course.php/26math/` から確認します。検証後は大学のURLへ戻してください。
