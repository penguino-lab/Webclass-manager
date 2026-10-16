# 開発と不具合報告

不具合はこのリポジトリのIssuesで報告してください。ブラウザの種類とバージョン、拡張のバージョン、期待する動作、実際の動作、再現手順を添えてください。画面写真は氏名・学籍番号・教材名等を必要に応じて伏せてください。認証URL、Cookie、パスワード、授業資料、保存した大学サイトのHTMLは投稿しないでください。

## 検証

Node.js 20以降で次を実行します。拡張の利用にNode.jsは不要です。

```sh
node --test tests/*.test.js
```

実ブラウザでのダミーサイト検証にはNode.js 22以降とPlaywrightを使用します。

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node tests/browser-check.mjs
```

大学アカウントや実際の資料をテストへ含めず、同梱ダミーサイトを使用します。ブラウザテストの出力は隣接するtmpディレクトリへ作成されます。

## 変更提案

Issueで目的を共有し、作業ブランチからPull Requestを作成してください。変更理由、利用者に見える影響、検証結果を記載してください。独自部分のライセンスが確定するまでは、投稿物の利用許諾についてメンテナーと事前に確認してください。
