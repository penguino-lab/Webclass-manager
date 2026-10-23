# 配布情報

公開配布元は [penguino-lab/Webclass-manager](https://github.com/penguino-lab/Webclass-manager)、開発元は [penguino-lab/webclass-library-manager](https://github.com/penguino-lab/webclass-library-manager) です。開発元の閲覧にはアクセス権が必要です。

## 今回の同期

- 確認日：2026年10月23日（日本時間）
- 取り込み元：開発用リポジトリのリモート `main`
- コミット：`b5b42799f171d1b5c87e9b4a4f6d01cf82cba6c4`
- 拡張バージョン：**0.9.0**
- JavaScript・CSS・HTML・manifest・package・アイコン・画像・テスト・同梱ライブラリ・CI設定は、上記コミットの追跡ファイルと同じ内容です。コードの改変やバージョン番号の変更は行っていません。
- README・機能ガイド・初期設定・更新方法・プライバシー・開発案内は実装に合わせて整理し、両リポジトリへ同じ内容を反映します。
- 開発作業用の `AGENTS.md`、Gitの履歴・認証情報・個人設定・実際の授業資料は配布用へコピーしません。

両リポジトリは別のGit履歴を維持します。自動同期の仕組みは設けていないため、今後の開発変更は次回の配布同期まで配布用に反映されません。同じ0.9.0でもmain上の内容が進むことがあるため、バージョンだけでなくコミットで取り込み元を記録します。

## コードの一致確認

[配布用のCODE_HASHES.sha256](https://github.com/penguino-lab/Webclass-manager/blob/main/CODE_HASHES.sha256) は、上記の開発元コミットからコピーした追跡ファイルのSHA-256一覧です。ルートの `AGENTS.md`・`README.md`・`CONTRIBUTING.md`・`GITHUB_GUIDE.md` は対象外です。利用者向けに新規追加した説明書とハッシュ一覧自身も含みません。第三者ライブラリの説明書は対象に含みます。

ハッシュはGitに記録されたファイルのバイト列を基準とします。GitHubのmainのZIPから展開したファイルで照合できます。WindowsでGitの改行変換を有効にしてクローンした場合は、作業ファイルではなくGit上の内容で比較してください。

LinuxなどでZIP展開後に配布フォルダーの直下で検証する例：

```sh
sha256sum -c CODE_HASHES.sha256
```

## 利用前に確認すること

- ダウンロード先は公開配布用の [mainのZIP](https://github.com/penguino-lab/Webclass-manager/archive/refs/heads/main.zip) です。インストール手順は [README](README.md) を参照してください。
- 既定の大学URLと、アイコンの通常クリックで開く東京都市大学のSAMLログイン先は元コードのままです。ベースURLは設定で変更できますが、アイコンの通常クリック先は変更されません。
- Node.jsの自動テストと、ローカルのダミーサイトによるブラウザ検証を利用します。大学の認証・実際の授業資料・Windowsのフォルダーピッカーの確認は別途必要です。手順は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。
- 独自部分のライセンスは未設定です。第三者ライブラリのライセンスは同梱のまま保持しています。
