# 配布情報

公開配布元は [penguino-lab/Webclass-manager](https://github.com/penguino-lab/Webclass-manager)、開発元は [penguino-lab/webclass-library-manager](https://github.com/penguino-lab/webclass-library-manager) です。開発元の閲覧にはアクセス権が必要です。

## 今回の同期

- 確認日：2026年10月23日（日本時間）
- 取り込み元：開発用リポジトリの0.9.1リリース変更（両リポジトリでPRを通じてmainへ反映）
- コミット：`47299071326c3496a797e35f004f4b1967ffd118`
- 拡張バージョン：**0.9.1**
- WebClassの初回アクセス時のURL自動検出と許可案内、許可後の自動登録・画面反映を追加しました。JavaScript・CSS・HTML・manifest・package・アイコン・画像・テスト・同梱ライブラリ・CI設定を開発用と配布用で揃えています。
- README・機能ガイド・初期設定・更新方法・プライバシー・開発案内は実装に合わせて整理し、両リポジトリへ同じ内容を反映します。
- 開発作業用の `AGENTS.md`、Gitの履歴・認証情報・個人設定・実際の授業資料は配布用へコピーしません。

両リポジトリは別のGit履歴を維持します。自動同期の仕組みは設けていないため、今後の開発変更は次回の配布同期まで配布用に反映されません。同じ0.9.1でもmain上の内容が進むことがあるため、バージョンだけでなくコミットで取り込み元を記録します。

## コードの一致確認

[配布用のCODE_HASHES.sha256](https://github.com/penguino-lab/Webclass-manager/blob/main/CODE_HASHES.sha256) は、上記の開発元コミットからコピーした追跡ファイルのSHA-256一覧です。ルートのMarkdown説明書・開発作業用の `AGENTS.md`・ハッシュ一覧自身は対象外です。第三者ライブラリの説明書は対象に含みます。

ハッシュはGitに記録されたファイルのバイト列を基準とします。GitHubのmainのZIPから展開したファイルで照合できます。WindowsでGitの改行変換を有効にしてクローンした場合は、作業ファイルではなくGit上の内容で比較してください。

LinuxなどでZIP展開後に配布フォルダーの直下で検証する例：

```sh
sha256sum -c CODE_HASHES.sha256
```

## 利用前に確認すること

- ダウンロード先は公開配布用の [mainのZIP](https://github.com/penguino-lab/Webclass-manager/archive/refs/heads/main.zip) です。インストール手順は [README](README.md) を参照してください。
- 初回検出はTCUに限定しません。自動検出できないURLはライブラリ設定から手動登録できます。アイコンの通常クリックは未許可のWebClassでは初回案内、それ以外では登録した大学を開きます。TCUの初期値では従来のSAML入口を使います。
- Node.jsの自動テストと、ローカルのダミーサイトによるブラウザ検証を利用します。大学の認証・実際の授業資料・Windowsのフォルダーピッカーの確認は別途必要です。手順は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。
- 独自部分のライセンスは未設定です。第三者ライブラリのライセンスは同梱のまま保持しています。
