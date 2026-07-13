# docs 索引

最終更新: 2026-07-05

このフォルダの読み方: **正本は RULE_SPEC.md(リポジトリ外で管理)**。バランス関連の現行文書は下記「現行」から辿る。ステータスバナー(`> **[廃案]**` 等)が付いている文書は履歴であり、現行の判断には使わないこと。

## 現行(まずここを読む)

| 文書 | 内容 |
|---|---|
| [balance-overview.md](balance-overview.md) | **チーム向けサマリー**: 確定した数値・カーブ・KPI・理由(純粋バニラ基準v3) |
| [balance-roadmap.md](balance-roadmap.md) | フェーズ計画(0〜7)+検討事項トラッカー(裁定の記録) |
| [kpi-design-pure-vanilla.md](kpi-design-pure-vanilla.md) | KPIの定義・確定帯・改訂履歴 |
| [engine-handoff-pack.md](engine-handoff-pack.md) | **エンジン実装者向け**: constants、未反映裁定、実装解釈メモ、素体カードセット |
| [effect-design-guidelines.md](effect-design-guidelines.md) | 効果設計の原則(ループ対策)とチェックリスト |
| [card-text-style-guide.md](card-text-style-guide.md) | カードテキストの表記ルール(フェーズ6の効果改訂で使用) |

## 提案・ドラフト(承認状況はロードマップのトラッカー参照)

| 文書 | 状態 |
|---|---|
| [attribute-migration-draft.md](attribute-migration-draft.md) | 方針承認済み・実作業保留(改名等は後で手を入れる) |
| [hijutsu-design-draft.md](hijutsu-design-draft.md) | 設計思想(劣勢時の保険)は暫定承認。原型はフェーズ5で検証 |
| [schema-v2-draft.md](schema-v2-draft.md) | レビュー待ち。適用はフェーズ6 |
| [faction-draft-format-draft.md](faction-draft-format-draft.md) | レビュー待ち(陣営デッキドラフトの方式) |
| [card-audit-draft.md](card-audit-draft.md) | 実カード104枚の監査(フェーズ4/6の下ごしらえ) |
| [codex-task-phase3-shape-pricing.md](codex-task-phase3-shape-pricing.md) | フェーズ3の実験設計(実行待ち) |

## 凍結スナップショット(baselines/)

| 文書 | 状態 |
|---|---|
| [baselines/pure-vanilla-baseline-v3.md](baselines/pure-vanilla-baseline-v3.md) | **現行基準**(案A構成・SHA記録つき) |
| [baselines/phase2b-item-layer.md](baselines/phase2b-item-layer.md) | 最新計測(素体霊具。ゲート合格) |
| [baselines/phase2a-main-search.md](baselines/phase2a-main-search.md) | フェーズ2a探索結果 |
| [baselines/pure-vanilla-calibration-v2.md](baselines/pure-vanilla-calibration-v2.md) | 仕様準拠キャリブレーション |
| baselines/ のその他(v1系、rotation-cost、deck-rules-v0、無印calibration) | 旧環境・廃案・破棄(各ファイルのバナー参照) |

## 完了済みcodexタスク(履歴)

codex-task-phase0-spec-sync / phase2a-main-search / phase2a-freeze / phase2b-item-layer(実行済み)、codex-task-pure-vanilla-calibration(v2で改訂)、codex-task-deck-rules-v0(廃案)

## 旧世代・別系統(バランス調整の現行判断には使わない)

| 文書 | 備考 |
|---|---|
| EOJR_Rulebook.md | 旧ルールブック(2026-05-11)。**正本はRULE_SPEC.mdに移行済み** |
| cards.md / card-list*.docx / cardlist.docx / game-rules-design.docx | 旧世代のカードリスト・設計資料 |
| v2-review-roadmap.md / v2-expansion-ideas.md / v2-sim-spec.json | 旧「v2」構想のメモ(現行ロードマップとは別物。名称が紛らわしいので注意) |
| IMPLEMENTATION_STATUS.md | エンジン実装(game/src)の対応状況。**エンジン担当者の管理物** |
| stat-curve-exploration.md | 旧環境の探索ログ(アーカイブ) |
| claude-balance-review-brief.md / claude-balance-review-prompt.md | 初回レビュー資料(アーカイブ) |
| deck-rules-draft.md | 一部廃案(ファティーグ不採用。24枚構成のみ継承) |
