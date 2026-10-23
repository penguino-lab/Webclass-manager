# GitHubを初めて使う共同開発者へ

拡張を使うだけならGitHubのアカウントやGitは不要です。[ダウンロードと導入](README.md)を参照してください。このページはコードを共同編集する方向けです。

## 最初に用意するもの

1. GitHubアカウントとGit、またはGitHub Desktopを用意します。
2. 開発元の [webclass-library-manager](https://github.com/penguino-lab/webclass-library-manager) を使う場合は、管理者からアクセス権を受け取ります。
3. GitHub Desktopの **File → Clone repository → URL** で開発元をクローンし、自分のPCの保存場所を選びます。既存リポジトリを取得するので、新規リポジトリ作成やPublish repositoryは不要です。
4. コミットに使う名前・メールを設定します。メールを公開したくない場合はGitHubで案内されるnoreplyアドレスを使います。

パスワード・トークン・認証コードをIssueやチャットへ投稿しないでください。認証はGitHubやGitHub Desktopの画面で行います。

## よく使う言葉

| 用語 | 意味 |
| --- | --- |
| Repository | コードと履歴を保管する場所 |
| Clone | リポジトリをPCへ取得すること |
| Branch | 変更の作業場所。mainは共有する本流 |
| Commit | 変更を説明付きでローカル履歴に記録すること |
| Push | コミットをGitHubへ送ること |
| Fetch / Pull | GitHubの更新を確認・取得し、PCへ取り込むこと |
| Pull Request（PR） | 変更をmainへ取り込むための提案 |
| Merge | PRの変更をmainへ取り込むこと |

## 普段の変更手順

1. GitHub Desktopでmainを選び、**Fetch origin → Pull origin** で最新版にします。
2. **Current branch → New branch** で作業用ブランチを作ります。
3. 変更し、[開発・検証手順](CONTRIBUTING.md)に沿って確認します。
4. **Changes** で差分を確認し、理由を添えてコミットします。
5. **Publish branch / Push origin → Create Pull Request** で変更を提案します。
6. 差分・テスト・レビューを確認してマージします。各自もmainをPullしてください。
7. 読み込んでいる拡張フォルダーを更新し、拡張とWebClassのタブを再読み込みします。

ファイルの保存だけではGitHubへ反映されません。また、GitHubへ送っても、ブラウザに読み込んだ別フォルダーの拡張は自動更新されません。GitHub Desktopやエディターの保存先と、ブラウザで読み込んだフォルダーを確認してください。

配布用 [Webclass-manager](https://github.com/penguino-lab/Webclass-manager) への公開は、開発用mainの内容を確認して同期します。開発用・配布用は別のリポジトリで、自動的には連動しません。
