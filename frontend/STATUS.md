# frontend/ (React版) の位置づけ

**本番UIではありません。** 本番はリポジトリ直下のバニラJS版（`index.html` / `js/` / `css/`、配信用コピーは `deploy/`）です。

- この React 版は、GPT に作らせた試験的な新UI。API・状態の配線が未完成で、現状は実運用できません。
- `handlers/handler.py` の静的配信は、直下の `index.html`（バニラ版）を最優先し、`frontend/dist` は無い場合のフォールバックです。
- APK 内の `android/app/src/main/assets/app-source/` は過去時点のコピーで、同期されていません。
- 本番UIに取り込む／捨てるを決めるまで、機能追加はバニラ版側で行ってください。
