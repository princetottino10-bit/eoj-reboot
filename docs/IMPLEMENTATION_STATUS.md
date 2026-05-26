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
| エース回収コスト軽減（コスト5→最低2） | ✅ | `engine/cost.ts: calcCostReduction`（派閥別条件） |
| 召喚後は即ターン終了（行動権消費） | ✅ | `doSummon`→`onEndTurn`呼出、エフェクト解決後も同様 |
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
| on_turn_start トリガー効果 | ✅ | `effects.ts: applyOnTurnStartEffects` → `turn.ts: startTurnPhase` から呼出 |
| on_turn_end トリガー効果 | ✅ | `effects.ts: applyOnTurnEndEffects` → `turn.ts: endTurnCleanup` から呼出 |
| passive効果評価（ATK補正・コスト補正・戦闘フラグ） | ✅ | `engine/passive.ts: getPassiveAtkBonus` 等、`game.ts` で攻撃時に参照 |

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
| 反撃不可（no_counterattack passive） | ✅ | `passive.ts: hasPassiveNoCounter` + `AttackOptions.attackerNoCounterAttack` |
| 全方位反撃（omnidirectional_counter passive） | ✅ | `passive.ts: hasPassiveOmniCounter` + `canCounterAttack`の omnidirectionalCounter 引数 |
| on_kill / on_death / on_damaged トリガー効果 | ✅ | `effects.ts: applyOnKillEffects` 等、`game.ts` で戦闘結果に応じて呼出 |
| on_ally_killed トリガー効果 | ✅ | `effects.ts: applyOnAllyKilledEffects`、`game.ts` で味方撃破時に呼出 |

---

## キャラクター効果（on_summon）

| カード | ステータス | 効果 |
|--------|-----------|------|
| aggro_v2_03 | ✅ | 手札1枚捨て→隣接敵後退 |
| aggro_v2_10 | ✅ | 1ドロー→手札1枚強制捨て |
| aggro_v2_11 | ✅ | 隣接敵-3HP、攻撃済み味方2体以上でATK+2 |
| tank_v2_02 | ✅ | 隣接味方に防護マーカー付与 |
| tank_v2_04 | ✅ | 同属性マスならHP+1 |
| tank_v2_05 | ✅ | 隣接味方HP+1 |
| tank_v2_09 | ✅ | 自身＋隣接味方に防護マーカー＋隣接味方HP+1 |
| tank_v2_11 | ✅ | 味方向き変更 |
| tank_v2_12 | ✅ | 隣接味方HP+2＋自身防護マーカー |
| control_v2_01 | ✅ | 隣接敵ATK-1 |
| control_v2_02 | ✅ | 隣接敵再行動コスト+1 |
| control_v2_03 | ✅ | 隣接敵ATK-2 |
| control_v2_04 | ✅ | 隣接敵再行動コスト+1 |
| control_v2_05 | ✅ | 隣接敵90°回転 |
| control_v2_07 | ✅ | 敵洗脳（3ターン）+ 隣接敵ATK-1 |
| control_v2_08 | ✅ | 隣接敵90°回転 |
| control_v2_09 | ✅ | マナ2奪取（on_attack効果は別途） |
| control_v2_10 | ✅ | 隣接敵ATK-1 + デバフ条件ドロー/ダメ |
| control_v2_11 | ✅ | 隣接敵再行動コスト+1 |
| synergy_v2_01 | ✅ | 防護マーカー付与 |
| synergy_v2_02 | ✅ | 回避マーカー付与（隣接味方） |
| synergy_v2_03 | ✅ | 貫通マーカー付与（隣接味方） |
| synergy_v2_04 | ✅ | 回避マーカー付与（任意味方） |
| synergy_v2_07 | ✅ | 隣接味方ATK+1 |
| synergy_v2_08 | ✅ | 隣接味方HP+1、マーカー3体以上でATK+1 |
| synergy_v2_09 | ✅ | 隣接味方HP+1 |
| synergy_v2_11 | ✅ | 隣接味方HP+1、マーカー3体以上でATK+1 |
| synergy_v2_12 | ✅ | 隣接味方ATK+1 |
| snipe_v2_07 | ✅ | 手札1枚捨て→2ドロー |
| trick_v2_01 | ✅ | 敵90°回転 |
| trick_v2_02 | ✅ | 隣接敵90°回転 |
| trick_v2_03 | ✅ | 手札1枚捨て→マナ+1 |
| trick_v2_04 | ✅ | 召喚位置と隣接味方を入れ替え |
| trick_v2_06 | ✅ | 隣接敵後退 |
| trick_v2_09 | ✅ | 隣接敵向き変更（向き選択） |
| trick_v2_12 | ✅ | 全敵向き変更＋B位置3体以上でドロー |

---

## キャラクター効果（on_attack）

on_attack 効果は `ui/game.ts: computeOnAttackEffects / applyOnAttackPostEffects` で処理。  
コストあり節は `on_attack_cost_pending` / `on_attack_discard_pending` UIフローで任意選択。

| カード | ステータス | 効果 |
|--------|-----------|------|
| aggro_v2_07 | ✅ | 攻撃済み味方1体以上でダメージ+1 |
| control_v2_09 | ✅ | 隣接敵に再行動コスト+1 |
| synergy_v2_05 | ✅ | マーカー味方3体以上でダメージ+1 |
| snipe_v2_01 | ✅ | 自HP-1コスト→ダメージ+1 |
| snipe_v2_02 | ✅ | 手札1枚捨てコスト→ダメージ+1 |
| snipe_v2_03 | ✅ | 手札1枚捨てコスト→ダメージ+1 |
| snipe_v2_04 | ✅ | 自HP-1コスト→攻撃に貫通付与 |
| snipe_v2_05 | ✅ | 自HP-1コスト→ダメージ+2 |
| snipe_v2_06 | ✅ | 手札1枚捨てコスト→ダメージ+2 |
| snipe_v2_08 | ✅ | 自HP-1コスト→ダメージ+1＋貫通付与 |
| snipe_v2_09 | ✅ | 手札1枚捨てコスト→ダメージ+3 |
| snipe_v2_10 | ✅ | 自HP-1＋手札1枚捨てコスト→ダメージ+3＋貫通付与 |
| snipe_v2_11 | ✅ | マナ1コスト→ダメージ+2 |
| snipe_v2_12 | ✅ | 自HP-1コスト→ダメージ+2＋貫通付与 |
| trick_v2_05 | ✅ | B位置から攻撃時ダメージ+1 |
| trick_v2_07 | ✅ | B位置から攻撃時ダメージ+1 |
| trick_v2_08 | ✅ | 攻撃対象を任意向きに回転 |
| trick_v2_11 | ✅ | B位置から攻撃時1ドロー |

---

## キャラクター効果（passive）

passive 効果は「盤面状態に応じて常時発動」する効果。`engine/passive.ts` で実装済み。

| カード | ステータス | 効果 | 備考 |
|--------|-----------|------|------|
| aggro_v2_09 | ✅ | 反撃されない（no_counterattack） | `passive.ts: hasPassiveNoCounter` |
| aggro_v2_12 | ✅ | 攻撃済み味方3体以上で再行動コスト-2 | `passive.ts: getPassiveReactivationCostDelta` |
| tank_v2_06 | ✅ | 味方2体以上でATK+1（自身） | `passive.ts: getPassiveAtkBonus` |
| tank_v2_08 | ✅ | 隣接味方のATK+1 | `passive.ts: getPassiveAtkBonus`（隣接チェック） |
| tank_v2_10 | ✅ | 全方位反撃（omnidirectional_counter） | `passive.ts: hasPassiveOmniCounter` |
| synergy_v2_10 | ✅ | マーカー味方2体以上でATK+1（自身） | `passive.ts: getPassiveAtkBonus` |
| trick_v2_10 | ✅ | 空きマス5以上でATK+1（自身） | `passive.ts: getPassiveAtkBonus` |

---

## キャラクター効果（その他トリガー）

| カード | ステータス | トリガー | 効果 |
|--------|-----------|---------|------|
| aggro_v2_02 | ✅ | on_turn_start | 手札1枚捨て（任意）→マナ+1 / UIフロー実装済み |
| aggro_v2_04 | ✅ | on_kill | 撃破時ATK+1（自身） / `effects.ts: applyOnKillEffects` |
| aggro_v2_08 | ✅ | on_death | 撃破時に隣接味方HP+2・ATK+1 / `effects.ts: applyOnDeathEffects` |
| tank_v2_07 | ✅ | on_damaged | 被ダメージ時ATK+1（自身） / `effects.ts: applyOnDamagedEffects` |
| tank_v2_10 | ✅ | on_death | 撃破時に隣接味方ATK+1 / `effects.ts: applyOnDeathEffects` |
| control_v2_12 | ✅ | on_turn_start | デバフ敵2体以上で1ドロー、3体以上でマナ+1 / `turn.ts: startTurnPhase`から自動適用 |
| synergy_v2_05 | ✅ | on_turn_end | マーカー味方4体以上で隣接味方HP+1 / `turn.ts: endTurnCleanup`から自動適用 |
| synergy_v2_06 | ✅ | on_ally_killed | 味方撃破時に防護マーカー獲得 / `effects.ts: applyOnAllyKilledEffects` |
| synergy_v2_10 | ✅ | on_turn_end | マーカー味方3体以上で隣接味方HP+1 / `turn.ts: endTurnCleanup`から自動適用 |

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
| snipe エース回収（照準マーカー） | 低 | `aim`マーカーの付与手段未実装のため常に軽減0 |
| キャラ個別効果の網羅テスト | 低 | `effects.test.ts`は自動効果のみカバー |
