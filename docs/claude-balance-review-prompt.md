> **[アーカイブ]** 初回バランスレビュー(2026-07-02)用のプロンプト。

# Claude Code Prompt: Card Balance Review

このリポジトリのカードゲームバランスをレビューしてください。

まず以下3ファイルを読んでください。

- `C:\Projects\codex\eoj-reboot\docs\claude-balance-review-brief.md`
- `C:\Projects\codex\eoj-reboot\data\cards.json`
- `C:\Projects\codex\eoj-reboot\data\cards.schema.json`

重要:

- 最新ルールは `claude-balance-review-brief.md` を正としてください。
- repo内の古いREADMEやルールブックは、現在の会話で決まった変更が反映されていない可能性があります。
- `cards.json` が現在のカードマスターです。
- コード編集は不要です。
- 回答は日本語で、設計会議にそのまま出せる粒度にしてください。

レビューしてほしいこと:

1. このゲームを調整するためのKPI
2. カード単体を評価するための変数
3. AI/シミュレーション判断に入れるべき変数
4. `HP +2 / ATK -1` ベースラインの良い点と懸念点
5. 次に試すべきシミュレーション案
6. 以下の調整用語の定義
   - 盤面維持力
   - チェック生成力
   - チェック返し性能
   - 除去圧
   - 回転価値
   - 属性価値

出力形式:

- 結論
- KPI
- カード評価変数
- AI/シミュ判断変数
- `HP +2 / ATK -1` 案の評価
- 次のシミュレーション計画
