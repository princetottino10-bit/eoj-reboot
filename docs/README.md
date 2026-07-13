# docs 索引

最終更新: 2026-07-14

このフォルダの読み方: **正本は RULE_SPEC.md(リポジトリ外で管理)**。バランス関連の現行文書は下記「現行」から辿る。ステータスバナー(`> **[廃案]**` 等)が付いている文書は履歴であり、現行の判断には使わないこと。

## 現在地(2026-07-14 時点)

- **確定済みの数値基盤 = 純粋バニラ基準 v3.1(R1構成)**: 再命令コスト heavy(2/3/3/3/3/4)+ **回転攻撃ルール**。先手勝率は3.2万試合で50.1%を確認済み。
- **進行中**: 7/18プレイテスト用の「攻撃範囲・死角バリエーション」構成の調整(形状フル→トリムのMバッチまで実施、平均R短縮の最終判断が保留中)。
- 詳細な意思決定の流れは [balance-roadmap.md](balance-roadmap.md) の検討事項トラッカーを参照。

## 現行(まずここを読む)

| 文書 | 内容 |
|---|---|
| [balance-overview.md](balance-overview.md) | **チーム向けサマリー**: 確定した数値・カーブ・KPI・理由 |
| [roadmap-team-brief.md](roadmap-team-brief.md) | チーム向けの進め方説明+再命令コストFAQ |
| [balance-roadmap.md](balance-roadmap.md) | フェーズ計画(0〜7)+検討事項トラッカー(裁定の記録) |
| [kpi-design-pure-vanilla.md](kpi-design-pure-vanilla.md) | KPIの定義・確定帯・改訂履歴 |
| [test-package-0718.md](test-package-0718.md) | **7/18プレイテスト用パッケージ**(ルール・数値・デッキ構成の全部入り) |
| [engine-handoff-pack.md](engine-handoff-pack.md) | **エンジン実装者向け**: constants、未反映裁定、実装解釈メモ、素体カードセット |
| [effect-design-guidelines.md](effect-design-guidelines.md) | 効果設計の原則(ループ対策)とチェックリスト |
| [card-text-style-guide.md](card-text-style-guide.md) | カードテキストの表記ルール(フェーズ6の効果改訂で使用) |

## 検証レポート(結論のまとまった読み物)

各シミュレーションの分析レポート。生データは baselines/ にある。

| レポート | 結論 |
|---|---|
| [r1-firstplayer-32k-report.md](r1-firstplayer-32k-report.md) | R1の先手勝率=50.1%(3.2万試合で確定)。2000試合は±2pt揺れることも実証 |
| [react-value-report.md](react-value-report.md) | 再命令は適正価格(損得中立)。回転攻撃には固有価値(互角局面+32pt)を因果比較で確認 |
| [standard-mana-handicap-report.md](standard-mana-handicap-report.md) | 再命令コストstandard案は先手勝率の帯に乗らず不採用。R1が唯一の帯内完走構成 |
| [phase2d-rotate-attack-report.md](phase2d-rotate-attack-report.md) | 回転攻撃ルール(R1)の採用検証。全KPI帯内・先手50.0% |
| [react-cost-sweep-report.md](react-cost-sweep-report.md) | 再命令コスト掃引。「高すぎ」は値付けの問題(構造死ではない)、ただし安くすると後手有利に崩れる |

## 提案・ドラフト(承認状況はロードマップのトラッカー参照)

| 文書 | 状態 |
|---|---|
| [new-effect-proposals.md](new-effect-proposals.md) | 新効果の考案(計測ギャップ埋め。アイデア用ドラフト) |
| [card-audit-draft.md](card-audit-draft.md) / [card-audit-table.md](card-audit-table.md) | 実カード104枚の監査(フェーズ4/6の下ごしらえ) |
| [attribute-migration-draft.md](attribute-migration-draft.md) | 方針承認済み・実作業保留(改名等は後で手を入れる) |
| [hijutsu-design-draft.md](hijutsu-design-draft.md) | 設計思想(劣勢時の保険)は暫定承認。原型はフェーズ5で検証 |
| [schema-v2-draft.md](schema-v2-draft.md) | レビュー待ち。適用はフェーズ6 |
| [faction-draft-format-draft.md](faction-draft-format-draft.md) | レビュー待ち(陣営デッキドラフトの方式) |

## codexタスク指示書(実装役=codexへの依頼書)

シミュ実装・実行はcodexが `scripts/explore-stat-curves.cjs` で担当。以下は各実験の依頼書(意図と計測仕様の記録)。

| タスク | 状態 |
|---|---|
| codex-task-phase0-spec-sync / phase2a-main-search / phase2a-freeze | 完了(→ v3凍結) |
| codex-task-phase2b-item-layer | 完了(素体霊具ゲート合格) |
| codex-task-react-cost-sweep / phase2d-rotate-attack / standard-mana-handicap | 完了(→ R1採用) |
| codex-task-react-value-forked-v2 | 完了(因果比較)。無印`react-value-forked`は設計バグで**破棄** |
| codex-task-r1-firstplayer-32k | 完了(先手勝率確定) |
| codex-task-v31-freeze-and-items | 実行済み(v3.1凍結・霊具再計測) |
| codex-task-shapes-0718 / -d1 / -m | 完了(7/18形状検証・切り分け・トリム) |
| codex-task-phase3-shape-pricing | 実行待ち(フェーズ3の形状値付け) |
| codex-task-pure-vanilla-calibration | v2で改訂済み / codex-task-deck-rules-v0 | 廃案 |

## 凍結スナップショット(baselines/)

各 `.md` に再現コマンド・スクリプトSHA・結果JSON SHA が記録されている。

| 文書 | 状態 |
|---|---|
| [baselines/pure-vanilla-baseline-v3.1.md](baselines/pure-vanilla-baseline-v3.1.md) | **現行の数値基盤**(R1採用構成) |
| [baselines/pure-vanilla-baseline-v3.md](baselines/pure-vanilla-baseline-v3.md) | v3(R1採用前の基準。対照群) |
| [baselines/r1-firstplayer-32k.md](baselines/r1-firstplayer-32k.md) | 先手勝率3.2万試合 |
| [baselines/react-value-forked-v2.md](baselines/react-value-forked-v2.md) | 再命令の損得(対称fork) |
| [baselines/phase2d-rotate-attack.md](baselines/phase2d-rotate-attack.md) | 回転攻撃ルール8ラン |
| [baselines/standard-mana-handicap.md](baselines/standard-mana-handicap.md) | ハンデ掃引 |
| [baselines/react-cost-sweep.md](baselines/react-cost-sweep.md) | 再命令コスト4水準 |
| [baselines/phase2b-item-layer-v31.md](baselines/phase2b-item-layer-v31.md) | 霊具レイヤー(v3.1再実行) |
| [baselines/phase2b-item-layer.md](baselines/phase2b-item-layer.md) | 霊具レイヤー(v3ベース・旧) |
| [baselines/phase2a-main-search.md](baselines/phase2a-main-search.md) / [pure-vanilla-calibration-v2.md](baselines/pure-vanilla-calibration-v2.md) | v3確定に至る探索 |
| [baselines/shapes-0718.md](baselines/shapes-0718.md) / [-d1](baselines/shapes-0718-d1.md) / [-m](baselines/shapes-0718-m.md) | 7/18形状検証(フル→切り分け→トリム) |
| baselines/ のその他(v1系、rotation-cost、無印calibration/forked、deck-rules-v0) | 旧環境・破棄・廃案(各ファイルのバナー参照) |

## 旧世代・別系統(バランス調整の現行判断には使わない)

| 文書 | 備考 |
|---|---|
| EOJR_Rulebook.md | 旧ルールブック(2026-05-11)。正本はRULE_SPEC.mdに移行済み |
| cards.md | カードリスト(`just md` で生成) |
| v2-review-roadmap.md / v2-expansion-ideas.md / v2-sim-spec.json | 旧「v2」構想のメモ(現行ロードマップとは別物。名称が紛らわしいので注意) |
| IMPLEMENTATION_STATUS.md | エンジン実装(game/src)の対応状況。エンジン担当者の管理物 |
| stat-curve-exploration.md | 旧環境の探索ログ(アーカイブ) |
| claude-balance-review-brief.md / claude-balance-review-prompt.md | 初回レビュー資料(アーカイブ) |
| deck-rules-draft.md / codex-task-deck-rules-v0.md | 一部廃案(ファティーグ不採用。24枚構成のみ継承) |
