# 実装ステータス（ルールブック vs 実装）

このドキュメントはルールブック（`data/rulebook.md`）と実装（`game/src/`）の対応状況を追跡します。

## 凡例

- ✅ 実装済み・ルールブックと一致
- ⚠️ 部分実装・制限あり
- ❌ 未実装

---

## コアシステム

| ルール | ステータス | 備考 |
|--------|-----------|------|
| 盤面 3×3 | ✅ | |
| 属性マスHP補正（同属性+2, 対立-2） | ✅ | `gamestate.ts: attributeHpBonus` |
| 標準盤面属性配置 | ✅ | `STANDARD_BOARD_ATTRS` シャッフル |
| 召喚コスト・マナ消費 | ✅ | |
| 召喚位置: 初回は全空きマス | ✅ | `board.ts: getValidSummonCells` |
| 召喚位置: 2回目以降は既存味方の隣接マス | ✅ | `board.ts: getValidSummonCells` |
| 1プレイヤー最大5体制限 | ✅ | `board.ts: getValidSummonCells`（≥5なら空配列） |
| 再行動コスト（マナ消費） | ✅ | `turn.ts: spendReactivationMana` |
| 再行動コスト増加（action_tax） | ✅ | `StatusEffects.actionTax` + `actionTaxBy`でソース追跡 |
| ターン終了時手札上限7枚 | ✅ | `turn.ts: endTurnCleanup` |
| ターン開始時マナ+2 | ✅ | `turn.ts: drawStep` |
| ターン開始時ドロー | ✅ | `turn.ts: drawStep` |
| ターン開始時フラグリセット（hasActed等） | ✅ | `turn.ts: startTurnPhase` |
| ステータス効果のターン数tick | ✅ | `turn.ts: startTurnPhase` |

---

## 戦闘

| ルール | ステータス | 備考 |
|--------|-----------|------|
| 攻撃範囲（attack_cells） | ✅ | `combat.ts / board.ts: getAttackCells` |
| 物理・魔法攻撃タイプ | ✅ | `AttackOptions.attackType` |
| B位置（弱点方向）ダメージ+1 | ✅ | `combat.ts: isBlindSpot` |
| 防護（ダメージ-1） | ✅ | キーワード＋マーカー両対応 |
| 回避（物理攻撃を無効） | ✅ | キーワード＋マーカー両対応 |
| 貫通（防護・回避を無視） | ✅ | キーワード＋マーカー両対応 |
| 先制（先に反撃） | ✅ | キーワード＋マーカー両対応 |
| カバー（隣接味方が代わりに受ける） | ✅ | `combat.ts: findCoverAlly` |
| 要塞（自ら攻撃不可・カバー反撃） | ✅ | `isInitiatedByFortress` + カバーブロック |
| 不動（後退不可） | ✅ | `pushBack`で`keywords.includes('不動')`チェック |
| 反撃（物理攻撃時、射程内なら） | ✅ | `canCounterAttack` |
| チームダメージ軽減（teamDR） | ✅ | `GameState.teamDR` |
| 撃破時VP | ✅ | `vpForCost`（コスト≤2→1VP, ≤4→2VP, 5+→3VP） |
| 撃破時 brainwashedBy/actionTaxBy クリア | ✅ | `combat.ts: clearAffiliatedEffects`（applyDamageから呼出） |
| 洗脳中は攻撃・向き変更不可 | ✅ | `game.ts: buildActionPanel`でUIボタン非表示 |
| 向き固定中は向き変更不可 | ✅ | `game.ts: buildActionPanel`でUIボタン非表示 |

---

## キャラクター効果（summon effect）

| カード | ステータス | 効果 |
|--------|-----------|------|
| aggro_v2_03 | ✅ | 手札1枚捨て→隣接敵後退 |
| aggro_v2_10 | ✅ | 1ドロー→手札1枚強制捨て |
| aggro_v2_11 | ✅ | 即時効果（attack_bonus） |
| aggro_v2_12 | ✅ | ウルト: 前列5ダメ・自HP1 |
| synergy_v2_01 | ✅ | 防護マーカー付与 |
| synergy_v2_02 | ✅ | 回避マーカー付与（隣接味方） |
| synergy_v2_03 | ✅ | 貫通マーカー付与（隣接味方） |
| synergy_v2_04 | ✅ | 防護マーカー付与 |
| synergy_v2_09 | ✅ | 隣接味方HP+1 |
| trick_v2_01 | ✅ | 敵90°回転 |
| trick_v2_02 | ✅ | 隣接敵90°回転 |
| trick_v2_04 | ✅ | 召喚位置と隣接味方を入れ替え |
| trick_v2_06 | ✅ | 隣接敵後退 |
| trick_v2_09 | ✅ | 隣接敵向き変更（向き選択） |
| trick_v2_12 | ✅ | 全敵向き変更＋B位置3体以上でドロー |
| tank_v2_11 | ✅ | 味方向き変更 |
| control_v2_01 | ✅ | 隣接敵ATK-1 |
| control_v2_02 | ✅ | 隣接敵再行動コスト+1 |
| control_v2_03 | ✅ | 隣接敵ATK-2 |
| control_v2_04 | ✅ | 隣接敵再行動コスト+1 |
| control_v2_05 | ✅ | 隣接敵90°回転 |
| control_v2_07 | ✅ | 敵洗脳（3ターン）+ 隣接敵ATK-1 |
| control_v2_08 | ✅ | 隣接敵90°回転 |
| control_v2_10 | ✅ | 隣接敵ATK-1 + デバフ条件ドロー/ダメ |
| control_v2_11 | ✅ | 隣接敵再行動コスト+1 |
| snipe_v2_07 | ✅ | 手札1枚捨て→2ドロー |
| snipe_v2_08 | ✅ | 即時効果（召喚時攻撃） |

---

## ウルト（Ult）

| カード | ステータス | 効果 |
|--------|-----------|------|
| aggro_v2_09 | ✅ | 貫通マーカー+1 |
| aggro_v2_12 | ✅ | 前列全敵5ダメ・自HP1 |
| tank_v2_08 | ✅ | チームダメージ軽減発動 |
| tank_v2_10 | ✅ | 隣接味方全快＋防護マーカー |
| control_v2_09 | ✅ | 敵ATKを2奪取 |
| control_v2_10 | ✅ | 全敵ATK永続-1 |
| synergy_v2_10 | ✅ | 全味方ATK+1・最大HP+1（永続） |
| synergy_v2_12 | ✅ | 全味方4種マーカー付与 |
| trick_v2_09 | ✅ | 任意ユニットと位置交換→向き選択 |
| trick_v2_12 | ✅ | 無敵1ターン |
| snipe_v2_09 | ✅ | 手札1枚捨て→敵1体4ダメ（貫通） |
| snipe_v2_12 | ✅ | 自身2ダメ→敵1体5ダメ（貫通） |

---

## アイテム

| カード | ステータス | 効果 |
|--------|-----------|------|
| item_01 | ✅ | 2ドロー |
| item_02 | ✅ | マナ+1 |
| item_03 | ✅ | 味方HP+3 |
| item_04 | ✅ | 味方ATK+2（このターン） |
| item_05 | ✅ | 敵ATK-2 |
| item_06 | ✅ | 敵2ダメ |
| item_14 | ✅ | 敵180°回転・向き固定1ターン |
| item_20 | ✅ | 敵90°回転 |
| item_bounce_enemy | ✅ | コスト2以下の敵を手札に戻す |
| item_element_swap | ✅ | 盤面味方と同属性手札キャラ入れ替え |
| item_grant_piercing | ✅ | 貫通マーカー付与 |
| item_grant_protection | ✅ | 防護マーカー付与 |
| item_reactivate | ✅ | 味方再行動可能に |
| item_self_bounce | ✅ | 味方を手札に戻す |

---

## 勝利条件

| ルール | ステータス | 備考 |
|--------|-----------|------|
| VP15以上で即時勝利 | ✅ | `victory.ts: checkVPWin` |
| ターン終了時5マス支配で勝利 | ✅ | `victory.ts: checkTerritoryWin` |
| 50ターン時点でVP多い方が勝利 | ✅ | `victory.ts: checkTimeoutWin` |
| 同VP引き分け | ✅ | `winner = -1` |

---

## Firebase オンライン

| 機能 | ステータス | 備考 |
|------|-----------|------|
| Googleログイン（popup→redirect fallback） | ✅ | `auth.ts: signInWithGoogle` |
| allowlist（invited users only） | ✅ | Firestoreコレクション `allowed_users` |
| ルーム作成・参加 | ✅ | `room.ts: createRoom / joinRoom`（トランザクション） |
| Firestoreセキュリティルール（参加者のみ） | ✅ | `firestore.rules` |
| ゲーム状態同期 | ✅ | `subscribeRoom + updateRoomGameState` |
| ターン制強制（自分のターンのみ操作可） | ✅ | `isMyTurn`フラグ |

---

## 未実装・既知の制限

| 項目 | 優先度 | 備考 |
|------|-------|------|
| on_attack効果（control_v2_09など） | 低 | 攻撃時に発動する効果は現在未実装 |
| 全キャラのウルト実装 | ✅ | 2026-05-24完了 |
| キャラ個別効果の網羅テスト | 低 | `effects.test.ts`は自動効果のみカバー |
