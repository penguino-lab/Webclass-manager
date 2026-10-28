# 配布情報

公開配布元は [penguino-lab/Webclass-manager](https://github.com/penguino-lab/Webclass-manager) です。初見導入の検証期間中は、この公開用リポジトリで変更をPR・CI確認を経てmainへ反映します。ブラウザーへの導入・更新・再読み込みは利用者が行います。

## 現在の公開版

- 確認日：2026年10月23日（日本時間）
- バージョン：**0.9.6**
- コード基準コミット：`54d72c7a0b0284d393791515c91b43d45d5ef758`
- WebClass上部にも更新バナーを表示します。案内を閉じる操作はライブラリと共有し、次の新版は再通知します。
- 拡張アイコン・WebClass・ライブラリを開く操作から非同期で更新を確認し、全タブの自動通信は1分に1回までにまとめます。
- ライブラリのヘッダーに現在のバージョンを常時表示します。
- 利用できない教材をテーマ共通のグレーで控えめに表示し、元の詳細リンクは操作できます。
- バージョン通知で新旧を判別できるよう、今後の機能変更・修正もmanifestとpackageのバージョンを揃えて上げます。

以前の開発元は [penguino-lab/webclass-library-manager](https://github.com/penguino-lab/webclass-library-manager) です。両リポジトリの自動同期は行いません。今回の変更は公開用mainを配布元とします。

## コードの一致確認

[CODE_HASHES.sha256](CODE_HASHES.sha256) は上記のコード基準コミットにある追跡ファイルのSHA-256一覧です。ルートのMarkdown説明書・作業指示のAGENTS.md・ハッシュ一覧自身は対象外です。第三者ライブラリの説明書は含みます。

ハッシュはGitに記録されたバイト列を基準とします。GitHubのmainのZIPを展開したファイルで照合できます。WindowsでGitの改行変換を有効にした場合はGit上の内容で比較してください。

```sh
sha256sum -c CODE_HASHES.sha256
```

## 検証と導入

- Node.jsの自動テストと、一時プロファイル・ダミー資料を使うブラウザーテストを利用します。手順は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。
- フォルダー選択はテスト用ハンドルで検証します。OSの実フォルダーピッカー・大学の認証・ネイティブな権限承認は利用者の環境で確認してください。
- ダウンロード先は [mainのZIP](https://github.com/penguino-lab/Webclass-manager/archive/refs/heads/main.zip) です。既存の拡張を削除せず同じフォルダーを更新し、再読み込みしてください。手順は [README](README.md) にあります。
- 独自部分のライセンスは未設定です。第三者ライブラリのライセンスは同梱のまま保持しています。
