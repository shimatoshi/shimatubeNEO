# deploy/ — shimatube.vercel.app に置く静的フロント

`https://shimatube.vercel.app` は「トンネルURLが回っても変わらない固定オリジン」として
存在している。中身は**バックエンドを持たない静的フロントだけ**で、実際のAPIは起動時に
`https://url-board.vercel.app/api/resolve/shimatube` を引いて得たバックエンド
（現在は Redmi = `https://shimabook.taileee658.ts.net:8443`）へ直接叩きに行く。

固定オリジンである事自体が重要で、`shimatube_uid` / `shimatube_backend` などの
localStorage はこのオリジンに紐付いている。リダイレクト運用にすると回転するトンネル
ドメインへ移ってしまい、購読・履歴の紐付け（uid）が切れる。

## 何を配信するか

このディレクトリはリポジトリ直下のバニラJSフロント（`index.html` + `js/` + `css/`、
`APP_VERSION v30.0`）のコピー。正本は直下側で、`handlers/handler.py` は
`_CANDIDATES` の先頭にプロジェクトルートを置いているので、Redmi/Pixel5 のバックエンドも
APK も同じバニラJSフロントを配信している。つまり deploy/ を配信していれば
**PWA・バックエンド直アクセス・APK が全部同じUI**になる。

手動コピー運用で過去に取りこぼしが出た（NEOビジュアル刷新が `css/style.css` にだけ入り
`deploy/css/style.css` に入らなかった）ので、配信前に必ず同期スクリプトを通す:

```sh
./tools/sync_deploy_front.sh
```

`vercel.json` と `.gitignore` は deploy/ 固有なので同期対象外。

## Vercelへの反映

Vercel の Git 連携は繋がっていない（GitHub側に deployments / commit status が無い）ため、
反映は CLI からの手動デプロイ。

```sh
cd deploy
vercel link          # 既存の shimatube プロジェクトに紐付け（初回のみ）
vercel --prod
```

リポジトリルートに置いた `vercel.json` は `outputDirectory: "deploy"` を指しているので、
プロジェクトの Root Directory がリポジトリルートに設定されている場合はルートから
`vercel --prod` しても deploy/ が配信される。Root Directory が `frontend` に
設定されている場合だけ、ダッシュボードで `./` に戻すか、上の通り deploy/ から
リンクし直す必要がある。

## React版に戻したくなったら

React版のソースは `frontend/` にそのまま残してある（消していない）。

```sh
cd frontend && npm ci && npm run build && vercel --prod
```
