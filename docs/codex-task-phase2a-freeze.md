> **[完了]** 実行済み(2026-07-05)。結果: baselines/pure-vanilla-baseline-v3.md(現行基準)

# Codex Task: 案A確定 — 頑健性再実行と純粋バニラ基準v3の凍結

前提資料(先に読むこと):

- `docs/codex-task-phase2a-main-search.md` と `docs/baselines/phase2a-main-search.md`(前段)
- `docs/kpi-design-pure-vanilla.md`(確定KPI帯)

## 確定した構成(案A)

| 項目 | 値 |
|---|---|
| カーブ | HP hybrid: 2/3/4/6/7/8 / ATK high: 1/2/2/3/3/4 / 再行動 heavy: 2/3/3/4/4/5 |
| 分布中心 | lowmid: C2:4 / C3:4 / C4:4 / C5:2 / C6:1 / C7:1 |
| START_MANA_FIRST | 3 |
| START_MANA_SECOND | 4 |
| DESTROY_MANA_GAIN | 1 |
| その他 | フェーズ0同期済みエンジンのまま(MAX_MANA=15、MAX_HP=10、生命価 1/1/1/3/3/4 等) |

ルール上の注意(毎回明示): 回転は式神1体につき1ターン1回まで(RULE_SPECの記載に関わらず裁定済みの例外)。撃破判定で撃破された式神は反撃しない。盤面から墓地へ送られた式神の所有者は DESTROY_MANA_GAIN を獲得。

## 1. 頑健性テストの再実行(案A構成)

前回の頑健性テストは案B構成(m3/dm0)で実施したため、案Aで測り直す:

- 中心分布 lowmid に対し、前回と同じ近傍ルール(lighter_step1/2、heavier_step1/2)で4近傍を生成
- ミラー4本+対中心クロス8本(計12ラン)、各1000試合、seed `20260702`、oracle あり、depth 6
- 中心ミラー(案A構成そのもの)も2000試合で1本(凍結用の基準値)

## 2. 凍結資料の作成

- 結果JSON: `docs/baselines/pure-vanilla-baseline-v3-results.json`
- 基準書: `docs/baselines/pure-vanilla-baseline-v3.md` に以下を記載:
  - 確定構成の表(上記)
  - 中心ミラー2000試合の全KPIと確定帯の対照表
  - 頑健性テスト結果(許容半径の記述: 軽側/重側それぞれ何枚まで健全か)
  - 再現コマンド、スクリプトSHA256、結果JSON SHA256、Repo HEAD
  - 注記: 純粋素体・霊具/形状/効果なしの基準であること、平均Rは下端でありフェーズ2bに「素体アイテム込みで平均R 8.5〜10」のゲートがあること

## 注意

- エンジン・スコア関数の変更はしない(実行と資料作成のみ)
- 頑健性の結果が前回(案B)と大きく異なる場合(例: 重側の崖が悪化)は、判定せずメモに差分を明記
- 判定は人間+Claude側で行う
