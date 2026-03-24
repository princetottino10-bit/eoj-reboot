/**
 * Minimax AI エンジン
 * 3手先読み + 評価関数で最善手を選択
 *
 * 改善点:
 * 1. 方向/ブラインド/反撃の評価
 * 2. 状態異常の評価（凍結/封印/洗脳/方向固定）
 * 3. キーワード評価（防護/貫通/カバー/回避/先制/要塞/不動/反射/威圧）
 * 4. 5マス勝利条件の適切な処理
 * 5. マナ/エース到達可能性の重み付け
 * 6. 召喚位置候補の拡大（上位N個）
 * 7. 攻撃候補の反撃リスク評価
 */
import type { CharacterCard, ItemCard, Direction } from '../types/card';
import { isCharacter, isItem } from '../types/card';
import type { GameState, Position, PlayerId, BoardCharacter } from '../types/game';
import { countControlledCells } from './state';
import { startTurn, executeSummon, executeAttack, executeItem, executeSkipDraw, endTurn, getAttackTargets } from './actions';
import { getAdjacentPositions, calculateHpBonus } from './utils';
import { getValidTargetCells, isBlindSpot, isInAttackRange, getEffectiveBlindPattern, getBlindPositions } from './range';
import { getAceConditionCount, getAceEffectiveCost } from './rules';

const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left'];
const FORMER_C6_ACE_IDS = new Set([
  'aggro_v2_11',   // 覇王のカイザー
  'tank_v2_12',    // 天城のバスティア
  'control_v2_10', // 蝕心のミスズ
  'synergy_v2_11', // 集星のアルス
  'snipe_v2_10',   // 滅線のアイン
  'trick_v2_12',   // 転界のオボロ
]);

function getBaseCardId(id: string): string {
  return id.replace(/_d\d+$/, '');
}

// ========================================
// 行動の型定義
// ========================================
type AIAction =
  | { type: 'summon'; cardId: string; pos: Position; dir: Direction }
  | { type: 'attack'; pos: Position; targetPos: Position }
  | { type: 'item'; cardId: string; targetPos?: Position }
  | { type: 'skip_draw'; cardId: string }
  | { type: 'end_turn' };

// ========================================
// ユニット情報ヘルパー
// ========================================

function getEffectiveAtk(ch: BoardCharacter): number {
  let atk = ch.card.atk;
  for (const b of ch.buffs) {
    if (b.type === 'atk_up') atk += b.value;
    if (b.type === 'atk_down') atk -= b.value;
  }
  return Math.max(0, atk);
}

function getSummonCardBias(state: GameState, card: CharacterCard, pid: PlayerId): number {
  let score = 0;

  const summonEffects = card.effects.filter(e => e.trigger === 'on_summon');

  // --- C4+ 高コスト札の即時価値評価 ---
  if (card.manaCost >= 4) {
    // 即時価値のあるon_summon効果をスコアリング
    const IMMEDIATE_EFFECTS = ['damage', 'piercing_damage', 'heal', 'debuff_atk', 'buff_atk',
      'grant_protection', 'grant_piercing', 'grant_quickness', 'grant_dodge',
      'rotate', 'push', 'pull', 'steal_mana', 'draw', 'action_tax', 'mark',
      'freeze', 'brainwash', 'seal'];

    let immediateValue = 0;
    for (const eff of summonEffects) {
      if (!IMMEDIATE_EFFECTS.includes(eff.effect)) continue;
      // 無条件効果は高評価
      const isUnconditional = !eff.condition || eff.condition.type === 'always';
      // 全体効果は高評価
      const isAoE = eff.target === 'all_enemies' || eff.target === 'all_allies' || eff.target === 'adjacent_allies' || eff.target === 'adjacent_enemies';

      let effScore = 8; // 基本
      if (isUnconditional) effScore += 12; // 無条件ボーナス
      if (isAoE) effScore += 10; // 全体ボーナス
      if (eff.effect === 'damage' || eff.effect === 'piercing_damage') effScore += (eff.value || 1) * 5;
      if (eff.effect === 'heal' && isAoE) effScore += (eff.value || 1) * 4;
      if (eff.effect === 'debuff_atk' && isAoE) effScore += 15;
      immediateValue += effScore;
    }

    // 即時価値が高いカードにのみボーナスを付与
    if (immediateValue > 0) {
      score += immediateValue;

      // 盤面が埋まっている場合（味方3体以上）、低コスト展開より質を優先すべき
      const myCharCount = state.board.flat().filter(c => c.character?.owner === pid).length;
      if (myCharCount >= 3) score += 25; // 既に展開済みなら高コスト札のほうが有利
    }

    // エース条件ボーナス（C4/C5共通）
    const condCount = getAceConditionCount(state, pid, card.faction);
    if (card.effects.some(e => e.condition?.type === 'ace_condition_gte')) {
      score += condCount * 12;
    }

    // 素のスタッツボーナス（C4+は高HP/ATKなので中盤以降に価値あり）
    score += card.hp * 2 + card.atk * 3;
  } else {
    // C1-C3: on_summon効果数の軽いボーナスのみ
    score += summonEffects.length * 6;
  }

  return score;
}

function getFormerC6AceBoardBonus(
  state: GameState,
  ch: BoardCharacter,
  ownerUnitCount: number,
): number {
  if (!FORMER_C6_ACE_IDS.has(getBaseCardId(ch.card.id))) return 0;

  let score = 90;
  const condCount = getAceConditionCount(state, ch.owner, ch.card.faction);
  score += condCount * 15;

  // 低コストを並べ切った後は、質の高い1枠の価値を上げる
  if (ownerUnitCount >= 3) score += 20;

  // 即時盤面価値を持つ札はさらに少し押し上げる
  const summonEffects = ch.card.effects.filter(e => e.trigger === 'on_summon');
  const hasAoE = summonEffects.some(e => e.target === 'all_enemies' || e.target === 'all_allies');
  const hasForcedInteraction = summonEffects.some(e =>
    e.effect === 'damage'
    || e.effect === 'rotate'
    || e.effect === 'push'
    || e.effect === 'debuff_atk'
    || e.effect === 'grant_piercing'
    || e.effect === 'heal'
  );
  if (hasForcedInteraction) score += 15;
  if (hasAoE) score += 10;

  return score;
}

function getFormerC6AceActionBias(
  state: GameState,
  action: AIAction,
  pid: PlayerId,
): number {
  if (action.type !== 'summon') return 0;

  const card = state.players[pid].hand.find(c => c.id === action.cardId);
  if (!card || !isCharacter(card)) return 0;
  if (!FORMER_C6_ACE_IDS.has(getBaseCardId(card.id))) return 0;

  const myUnitCount = state.board.flat().filter(c => c.character?.owner === pid).length;
  const condCount = getAceConditionCount(state, pid, card.faction);

  let score = 120;
  score += condCount * 20;
  if (myUnitCount >= 3) score += 40;
  if (myUnitCount >= 4) score += 20;

  return score;
}

/** ユニットが行動不能かどうか */
function isDisabled(ch: BoardCharacter): boolean {
  return ch.buffs.some(b => b.type === 'frozen' || b.type === 'sealed');
}

/** 洗脳されているかどうか */
function isBrainwashed(ch: BoardCharacter): boolean {
  // 洗脳 = owner が元の owner と異なる状態（effects で処理済み）
  // BuffではなくownerフリップなのでBoardCharacter自体では判定不可
  // → 簡易判定: ATKデバフが大きい or 特殊な状態を見る
  // 実際にはbrainwashはowner変更なのでevaluateのowner判定で自然に反映される
  return false;
}

// ========================================
// 評価関数（改善版）
// ========================================
export function evaluate(state: GameState, pid: PlayerId): number {
  const enemyId: PlayerId = pid === 0 ? 1 : 0;

  // 勝敗判定
  if (state.winner === pid) return 10000;
  if (state.winner === enemyId) return -10000;

  let score = 0;

  // ========================================
  // 1. マス制圧数 (最重要: 5マスで勝利)
  // ========================================
  const myCells = countControlledCells(state, pid);
  const enemyCells = countControlledCells(state, enemyId);
  const cellDiff = myCells - enemyCells;
  score += cellDiff * 100;

  // 5マス制圧 = 勝利直前（ターン終了時に判定）
  if (myCells >= 5) score += 5000;
  if (enemyCells >= 5) score -= 5000;

  // 4マスCHECK: 自分=次ターン勝ち狙い、敵=緊急防御必須
  if (myCells >= 4) score += 400;
  if (enemyCells >= 4) score -= 1000;

  // 3マス支配: 敵が3マス取ると4マス→5マスのルートが開く
  if (enemyCells >= 3) score -= 250;
  if (myCells >= 3) score += 150;

  // ========================================
  // 2. ユニット戦力 + キーワード + 状態異常 + 方向
  // ========================================
  let myTotalHp = 0;
  let enemyTotalHp = 0;
  let myTotalAtk = 0;
  let enemyTotalAtk = 0;
  let myUnitCount = 0;
  let enemyUnitCount = 0;
  let enemyLowHpUnits = 0;

  // 全ユニット情報を収集
  interface UnitInfo {
    pos: Position;
    ch: BoardCharacter;
    atk: number;
    isMine: boolean;
  }
  const units: UnitInfo[] = [];

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ch = state.board[r][c].character;
      if (!ch) continue;
      const effectiveAtk = getEffectiveAtk(ch);
      const isMine = ch.owner === pid;
      units.push({ pos: { row: r, col: c }, ch, atk: effectiveAtk, isMine });

      if (isMine) {
        myTotalHp += ch.currentHp;
        myTotalAtk += effectiveAtk;
        myUnitCount++;
      } else {
        enemyTotalHp += ch.currentHp;
        enemyTotalAtk += effectiveAtk;
        enemyUnitCount++;
        if (ch.currentHp <= 3) enemyLowHpUnits++;
      }
    }
  }

  // HP差とATK差（基本戦闘力）
  score += (myTotalHp - enemyTotalHp) * 6;
  score += (myTotalAtk - enemyTotalAtk) * 10;

  // ========================================
  // 3. 方向/ブラインド/反撃の評価（優先度1）
  // ========================================
  for (const unit of units) {
    const sign = unit.isMine ? 1 : -1;
    const { pos, ch } = unit;

    // 攻撃範囲内に敵がいるか
    const targets = getValidTargetCells(pos, ch.direction, ch.card.attackRange);
    let enemiesInRange = 0;
    let alliesInRange = 0;
    for (const t of targets) {
      const tc = state.board[t.row][t.col].character;
      if (!tc) continue;
      if (tc.owner === ch.owner) alliesInRange++;
      else enemiesInRange++;
    }

    // 範囲内に敵がいる = 戦闘的に有利なポジション
    score += sign * enemiesInRange * 15;

    // front_backで味方が範囲内 = マイナス（フレンドリーファイア）
    if (ch.card.attackRange === 'front_back' && alliesInRange > 0) {
      score -= sign * alliesInRange * 20;
    }

    // ブラインドスポット評価: 敵からブラインド攻撃される危険度
    const blindPattern = getEffectiveBlindPattern(ch.card);
    const blindCells = getBlindPositions(pos, ch.direction, blindPattern);
    let enemiesInBlind = 0;
    for (const bp of blindCells) {
      const bc = state.board[bp.row][bp.col].character;
      if (bc && bc.owner !== ch.owner) enemiesInBlind++;
    }

    // 自分のブラインドに敵がいる = 非常に危険（反撃不可 + ダメージ+1）
    score -= sign * enemiesInBlind * 30;

    // 反撃可能性: 攻撃範囲内の敵に対してブラインド攻撃できるか
    for (const t of targets) {
      const tc = state.board[t.row][t.col].character;
      if (!tc || tc.owner === ch.owner) continue;
      if (isBlindSpot(t, tc, pos)) {
        score += sign * 15; // ブラインドから攻撃可能 = 反撃なし + ダメ+1
      }
    }
  }

  // ========================================
  // 4. 状態異常の評価（優先度2）
  // ========================================
  for (const unit of units) {
    const sign = unit.isMine ? 1 : -1;
    const { ch } = unit;

    for (const buff of ch.buffs) {
      switch (buff.type) {
        case 'frozen':
          // 凍結: 行動不能 → 非常に不利
          score -= sign * 50;
          break;
        case 'sealed':
          // 封印: 効果使用不能 → 効果持ちほど不利
          score -= sign * (ch.card.effects.length > 0 ? 30 : 5);
          break;
        case 'direction_locked':
          // 方向固定: 回転不能 → 方向が重要なキャラほど不利
          score -= sign * 20;
          break;
        case 'atk_up':
          score += sign * buff.value * 8;
          break;
        case 'atk_down':
          score -= sign * buff.value * 8;
          break;
        case 'action_tax':
          // v2: 再行動コスト増加 → 不利
          score -= sign * buff.value * 15;
          break;
        case 'brainwashed':
          // 洗脳 = 行動不能
          score -= sign * 40;
          break;
        case 'marked':
          // マーク = スナイプから追加ダメージ
          score -= sign * 10;
          break;
      }
    }
  }

  // ========================================
  // 5. キーワード評価（優先度3）
  // ========================================
  for (const unit of units) {
    const sign = unit.isMine ? 1 : -1;
    const { ch } = unit;
    const keywords = ch.card.keywords;

    // 防護: 物理ダメージ-1（貫通には無効）
    if (keywords.includes('protection')) {
      // 敵に貫通持ちがいるかチェック
      const enemyHasPiercing = units.some(u => u.isMine !== unit.isMine && u.ch.card.keywords.includes('piercing'));
      score += sign * (enemyHasPiercing ? 5 : 15);
    }

    // 回避: 物理攻撃を受けない
    if (keywords.includes('dodge')) {
      const enemyHasMagic = units.some(u => u.isMine !== unit.isMine && u.ch.card.attackType === 'magic');
      const enemyHasPiercing = units.some(u => u.isMine !== unit.isMine && u.ch.card.keywords.includes('piercing'));
      if (enemyHasMagic || enemyHasPiercing) {
        score += sign * 10; // 対策あり → 価値低下
      } else {
        score += sign * 35; // 対策なし → 非常に強い
      }
    }

    // 先制: 反撃が先に来る → 低HPでも生存しやすい
    if (keywords.includes('quickness')) {
      score += sign * 12;
    }

    // 要塞: 自分から攻撃不可、反撃のみ → 防御的
    if (keywords.includes('fortress')) {
      // 範囲内に敵がいるほど反撃の価値が高い
      const targets = getValidTargetCells(unit.pos, ch.direction, ch.card.attackRange);
      let enemiesNearby = 0;
      for (const t of targets) {
        const tc = state.board[t.row][t.col].character;
        if (tc && tc.owner !== ch.owner) enemiesNearby++;
      }
      score += sign * (enemiesNearby > 0 ? 10 : -5); // 敵がいなければ損
    }

    // 貫通: 防護を無視
    if (keywords.includes('piercing')) {
      const enemyHasProtection = units.some(u => u.isMine !== unit.isMine && u.ch.card.keywords.includes('protection'));
      score += sign * (enemyHasProtection ? 15 : 5);
    }

    // 不動: 移動不可（push/pull無効）
    if (keywords.includes('anchor')) {
      score += sign * 8;
    }

    // 反射: 受けたダメージを1返す
    if (keywords.includes('reflect')) {
      score += sign * 10;
    }

    // カバー: 隣接味方への攻撃を代わりに受ける
    if (keywords.includes('cover')) {
      const adj = getAdjacentPositions(unit.pos);
      const alliesNearby = adj.filter(a => {
        const ac = state.board[a.row][a.col].character;
        return ac && ac.owner === ch.owner;
      }).length;
      score += sign * alliesNearby * 10;
    }

    // 隠密: 常にブラインド攻撃
    if (keywords.includes('stealth')) {
      score += sign * 20;
    }

    // 威圧: 周囲敵の再行動コスト+1
    if (keywords.includes('pressure')) {
      const adj = getAdjacentPositions(unit.pos);
      const enemiesNearby = adj.filter(a => {
        const ac = state.board[a.row][a.col].character;
        return ac && ac.owner !== ch.owner;
      }).length;
      score += sign * enemiesNearby * 12;
    }

    // 分散: ダメージを隣接味方と分割
    if (keywords.includes('damage_link')) {
      const adj = getAdjacentPositions(unit.pos);
      const alliesNearby = adj.filter(a => {
        const ac = state.board[a.row][a.col].character;
        return ac && ac.owner === ch.owner;
      }).length;
      score += sign * (alliesNearby > 0 ? 12 : 0);
    }
  }

  // ========================================
  // 6. キル価値（セル劣勢時の重み増加）
  // ========================================
  if (cellDiff < 0) {
    score += enemyLowHpUnits * 60;
    score += myTotalAtk * 8;
    if (enemyCells >= 4) {
      score += enemyLowHpUnits * 100;
      score += myTotalAtk * 15;
    }
  }
  score += enemyLowHpUnits * 25;
  score -= enemyUnitCount * 20;

  // ========================================
  // 7. 空きセル数による戦略判断
  // ========================================
  const emptyCells = 9 - myUnitCount - enemyUnitCount;
  if (emptyCells <= 2) {
    score += (myTotalHp - enemyTotalHp) * 4;
    score += myTotalAtk * 3;
  }

  // 条件付きエース札は、盤面に出ているだけで「1枠あたりの質」が高い
  for (const unit of units) {
    const ownerUnitCount = unit.isMine ? myUnitCount : enemyUnitCount;
    const aceScore = getFormerC6AceBoardBonus(state, unit.ch, ownerUnitCount);
    if (aceScore > 0) {
      score += unit.isMine ? aceScore : -aceScore;
    }
  }

  // ========================================
  // 8. マナ/手札/エース到達可能性（優先度5）
  // ========================================
  const myMana = state.players[pid].mana;
  const enemyMana = state.players[enemyId].mana;
  score += (myMana - enemyMana) * 3;

  const myHand = state.players[pid].hand;
  const enemyHand = state.players[enemyId].hand;
  score += (myHand.length - enemyHand.length) * 2;

  // 手札にエース（5-6コスト）がいてマナが近い → 温存価値
  for (const card of myHand) {
    if (isCharacter(card)) {
      const cc = card as CharacterCard;
      if (cc.manaCost >= 5) {
        const effectiveCost = getAceEffectiveCost(state, pid, cc);
        const condCount = getAceConditionCount(state, pid, cc.faction);
        const manaDiff = effectiveCost - myMana;
        score += condCount * 8;
        if (manaDiff <= 0) {
          score += 30 + condCount * 10; // 今すぐ出せるエース
        } else if (manaDiff <= 2) {
          score += 15 + condCount * 6; // 1-2ターン後に出せる
        } else if (manaDiff <= 4) {
          score += 5 + condCount * 3;
        }
      }
    }
  }

  // 敵がエースを持っている可能性（手札枚数＋マナが高い = 危険）
  if (enemyMana >= 5 && enemyHand.length >= 2) {
    score -= 20;
  }

  // ========================================
  // v2: VP評価（VP15で即勝利）
  // ========================================
  const myVP = state.players[pid].vp;
  const enemyVP = state.players[enemyId].vp;
  score += (myVP - enemyVP) * 30;
  // VP12以上 = あと1-2キルで勝ち
  if (myVP >= 12) score += 300;
  if (enemyVP >= 12) score -= 400;
  // VP優位なら積極的にキル
  if (myVP > enemyVP + 3) score += enemyLowHpUnits * 40;

  // ========================================
  // 9. ポジション品質（属性ボーナス + 中央）
  // ========================================
  for (const unit of units) {
    const sign = unit.isMine ? 1 : -1;
    if (unit.pos.row === 1 && unit.pos.col === 1) score += sign * 10;
    const hpBonus = calculateHpBonus(unit.ch.card.element, state.board[unit.pos.row][unit.pos.col].element);
    score += sign * hpBonus * 5;
  }

  return score;
}

// ========================================
// 行動生成（改善版）
// ========================================

function getValidSummonPositions(state: GameState, pid: PlayerId): Position[] {
  const positions: Position[] = [];
  let hasChars = false;
  for (const row of state.board) {
    for (const cell of row) {
      if (cell.character && cell.character.owner === pid) { hasChars = true; break; }
    }
    if (hasChars) break;
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (state.board[r][c].character !== null) continue;
      if (!hasChars) {
        positions.push({ row: r, col: c });
      } else {
        const adj = getAdjacentPositions({ row: r, col: c });
        if (adj.some(p => state.board[p.row][p.col].character !== null)) {
          positions.push({ row: r, col: c });
        }
      }
    }
  }
  return positions;
}

/** 召喚位置スコアリング（方向考慮版） */
function scoreSummonPosition(
  state: GameState,
  pos: Position,
  card: CharacterCard,
  dir: Direction,
  pid: PlayerId,
): number {
  let s = 0;

  // 属性ボーナス
  const cell = state.board[pos.row][pos.col];
  s += calculateHpBonus(card.element, cell.element) * 4;

  // 中央ボーナス
  if (pos.row === 1 && pos.col === 1) s += 5;

  // 隣接味方ボーナス（カバーや分散シナジー）
  const adj = getAdjacentPositions(pos);
  s += adj.filter(a => {
    const ch = state.board[a.row][a.col].character;
    return ch && ch.owner === pid;
  }).length * 6;

  // 攻撃範囲内の敵数（方向依存）
  const targets = getValidTargetCells(pos, dir, card.attackRange);
  let enemiesInRange = 0;
  for (const t of targets) {
    const tc = state.board[t.row][t.col].character;
    if (tc && tc.owner !== pid) enemiesInRange++;
  }
  s += enemiesInRange * 10;

  // ブラインドリスク: 召喚位置で敵がブラインドにいないか
  const blindPattern = getEffectiveBlindPattern(card);
  const blindCells = getBlindPositions(pos, dir, blindPattern);
  for (const bp of blindCells) {
    const bc = state.board[bp.row][bp.col].character;
    if (bc && bc.owner !== pid) s -= 15;
  }

  s += getSummonCardBias(state, card, pid);

  return s;
}

function chooseBestDirection(state: GameState, pos: Position, card: CharacterCard, pid: PlayerId): Direction {
  // magic は方向不問（全域ターゲット）→ ブラインドが少ない方向を選ぶ
  if (card.attackRange === 'magic') {
    let bestDir: Direction = 'up';
    let bestScore = -Infinity;
    for (const dir of DIRECTIONS) {
      const blindPattern = getEffectiveBlindPattern(card);
      const blindCells = getBlindPositions(pos, dir, blindPattern);
      let enemiesInBlind = 0;
      for (const bp of blindCells) {
        const bc = state.board[bp.row][bp.col].character;
        if (bc && bc.owner !== pid) enemiesInBlind++;
      }
      const s = -enemiesInBlind; // ブラインドに敵が少ないほど良い
      if (s > bestScore) { bestScore = s; bestDir = dir; }
    }
    return bestDir;
  }

  let bestDir: Direction = 'up';
  let bestScore = -Infinity;
  for (const dir of DIRECTIONS) {
    const cells = getValidTargetCells(pos, dir, card.attackRange);
    let s = 0;
    for (const c of cells) {
      const ch = state.board[c.row][c.col].character;
      if (ch && ch.owner !== pid) s += 10;
    }
    // ブラインドに敵がいるのはマイナス
    const blindPattern = getEffectiveBlindPattern(card);
    const blindCells = getBlindPositions(pos, dir, blindPattern);
    for (const bp of blindCells) {
      const bc = state.board[bp.row][bp.col].character;
      if (bc && bc.owner !== pid) s -= 8;
    }
    if (s > bestScore) { bestScore = s; bestDir = dir; }
  }
  return bestDir;
}

/** 召喚候補を上位N個まで生成（優先度6） */
const MAX_SUMMON_CANDIDATES = 2;

function generateActions(state: GameState): AIAction[] {
  const pid = state.currentPlayer;
  const mana = state.players[pid].mana;
  const actions: AIAction[] = [];

  // v2: 召喚アクション（最大2回/ターン、2回目は+1マナ、盤面上限5体、エースコスト軽減）
  const hand = state.players[pid].hand;
  const myCharCount = state.board.flat().filter(c => c.character?.owner === pid).length;
  const canSummon = state.summonCountThisTurn < 2 && myCharCount < 5;
  const extraCost = state.summonCountThisTurn >= 1 ? 1 : 0;
  const summonableCards = canSummon
    ? (hand.filter(c => {
        if (!isCharacter(c)) return false;
        const cc = c as CharacterCard;
        const aceCost = getAceEffectiveCost(state, pid, cc);
        return aceCost + extraCost <= mana;
      }) as CharacterCard[])
    : [];
  const validPositions = getValidSummonPositions(state, pid);

  if (summonableCards.length > 0 && validPositions.length > 0) {
    for (const card of summonableCards) {
      // 各位置×方向でスコアリング
      const candidates: { pos: Position; dir: Direction; score: number }[] = [];

      for (const pos of validPositions) {
        const dir = chooseBestDirection(state, pos, card, pid);
        const s = scoreSummonPosition(state, pos, card, dir, pid);
        candidates.push({ pos, dir, score: s });
      }

      // スコア降順ソート、上位N個
      candidates.sort((a, b) => b.score - a.score);
      const topN = candidates.slice(0, MAX_SUMMON_CANDIDATES);
      for (const c of topN) {
        actions.push({ type: 'summon', cardId: card.id, pos: c.pos, dir: c.dir });
      }
    }
  }

  // ドロー返上アクション: skip_draw持ちキャラがいて未使用なら候補に
  {
    let hasSkipDrawChar = false;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const ch = state.board[r][c].character;
        if (ch && ch.owner === pid && !ch.buffs.some(b => b.type === 'sealed')) {
          if (ch.card.effects.some(e => e.effect === 'skip_draw')
            && !ch.buffs.some(b => b.type === 'atk_cost_reduction')) {
            hasSkipDrawChar = true;
          }
        }
      }
    }
    if (hasSkipDrawChar && hand.length > 0) {
      // 最もコストの低いカードを返上候補にする（minimaxが判断）
      const sorted = [...hand].sort((a, b) => a.manaCost - b.manaCost);
      actions.push({ type: 'skip_draw', cardId: sorted[0].id });
    }
  }

  // 攻撃アクション: 全ターゲット候補を生成（minimaxが最善を選ぶ）
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ch = state.board[r][c].character;
      if (!ch || ch.owner !== pid || ch.hasActedThisTurn) continue;

      // 封印/凍結チェック（封印は攻撃自体は可能だが、凍結は行動不能）
      if (ch.buffs.some(b => b.type === 'frozen')) continue;

      let cost = ch.card.activateCost ?? 3;
      // atk_cost_reduction/action_tax を攻撃コストへ反映
      for (const b of ch.buffs) {
        if (b.type === 'atk_cost_reduction') cost -= b.value;
        if (b.type === 'action_tax') cost += b.value;
      }
      cost = Math.max(0, cost);
      // 威圧コスト加算
      const adjP = getAdjacentPositions({ row: r, col: c });
      for (const ap of adjP) {
        const ac = state.board[ap.row]?.[ap.col];
        if (ac?.character && ac.character.owner !== pid
          && ac.character.card.keywords.includes('pressure')) {
          cost += 1; break;
        }
      }
      if (mana < cost) continue;

      // 要塞は攻撃不可
      if (ch.card.keywords.includes('fortress')) continue;

      const targets = getAttackTargets(state, { row: r, col: c }, ch);
      for (const t of targets) {
        actions.push({ type: 'attack', pos: { row: r, col: c }, targetPos: t });
      }
    }
  }

  // アイテムアクション（全ターゲット候補を生成）
  // ノア (control_v2_11) のオーラ: 相手にノアがいる場合、アイテムコスト+1
  const enemyPid: PlayerId = pid === 0 ? 1 : 0;
  let noahCostExtra = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ch = state.board[r][c].character;
      if (ch && ch.owner === enemyPid && ch.card.id === 'control_v2_11') {
        noahCostExtra += 1;
      }
    }
  }
  const items = hand.filter(c => isItem(c) && (c.manaCost + noahCostExtra) <= mana) as ItemCard[];
  for (const item of items) {
    const targetType = getItemTargetType(item);
    if (targetType === 'none') {
      actions.push({ type: 'item', cardId: item.id });
    } else if (targetType === 'ally') {
      // 味方候補: 回復ならHP損失順、それ以外はATK順で上位2
      const allTargets = findAllAllyTargets(state, pid, item);
      const isHeal = item.effects.some(e => e.effect === 'heal');
      const scored = allTargets.map(pos => {
        const ch = state.board[pos.row][pos.col].character!;
        const s = isHeal ? (ch.card.hp - ch.currentHp) : getEffectiveAtk(ch);
        return { pos, s };
      });
      scored.sort((a, b) => b.s - a.s);
      if (scored.length > 0) {
        actions.push({ type: 'item', cardId: item.id, targetPos: scored[0].pos });
      }
    } else if (targetType === 'enemy') {
      // 敵候補: HP低い順でベスト1
      const allTargets = findAllEnemyTargets(state, pid);
      const scored = allTargets.map(pos => {
        const ch = state.board[pos.row][pos.col].character!;
        return { pos, hp: ch.currentHp };
      });
      scored.sort((a, b) => a.hp - b.hp);
      if (scored.length > 0) {
        actions.push({ type: 'item', cardId: item.id, targetPos: scored[0].pos });
      }
    } else if (targetType === 'cell') {
      actions.push({ type: 'item', cardId: item.id });
    }
  }

  // ターン終了は常に選択肢
  actions.push({ type: 'end_turn' });

  return actions;
}

function applyAction(state: GameState, action: AIAction): GameState | null {
  try {
    switch (action.type) {
      case 'summon':
        return executeSummon(state, action.cardId, action.pos, action.dir);
      case 'attack':
        return executeAttack(state, action.pos, action.targetPos);
      case 'item':
        return executeItem(state, action.cardId, action.targetPos);
      case 'skip_draw':
        return executeSkipDraw(state, action.cardId);
      case 'end_turn':
        return endTurn(state);
    }
  } catch {
    return null;
  }
}

// ========================================
// Minimax 探索
// ========================================
function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  maximizingPlayer: PlayerId,
): number {
  // 終端条件
  if (depth === 0 || state.phase === 'game_over') {
    return evaluate(state, maximizingPlayer);
  }

  const isMaximizing = state.currentPlayer === maximizingPlayer;
  const actions = generateActions(state);

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const action of actions) {
      const nextState = applyAction(state, action);
      if (!nextState) continue;
      const eval_ = minimax(nextState, depth - 1, alpha, beta, maximizingPlayer);
      maxEval = Math.max(maxEval, eval_);
      alpha = Math.max(alpha, eval_);
      if (beta <= alpha) break; // αβ枝刈り
    }
    return maxEval === -Infinity ? evaluate(state, maximizingPlayer) : maxEval;
  } else {
    let minEval = Infinity;
    for (const action of actions) {
      const nextState = applyAction(state, action);
      if (!nextState) continue;
      const eval_ = minimax(nextState, depth - 1, alpha, beta, maximizingPlayer);
      minEval = Math.min(minEval, eval_);
      beta = Math.min(beta, eval_);
      if (beta <= alpha) break;
    }
    return minEval === Infinity ? evaluate(state, maximizingPlayer) : minEval;
  }
}

export function debugActionScores(
  state: GameState,
  depth: number = 2,
): Array<{ action: AIAction; minimaxScore: number; bias: number; totalScore: number }> {
  const pid = state.currentPlayer;
  const actions = generateActions(state);

  return actions.map(action => {
    const nextState = applyAction(state, action);
    const minimaxScore = nextState ? minimax(nextState, depth - 1, -Infinity, Infinity, pid) : -Infinity;
    const bias = nextState ? getFormerC6AceActionBias(state, action, pid) : 0;
    return {
      action,
      minimaxScore,
      bias,
      totalScore: minimaxScore + bias,
    };
  }).sort((a, b) => b.totalScore - a.totalScore);
}

// ========================================
// メインエントリ: 最善手を選んで実行
// ========================================
export function runMinimaxTurn(state: GameState, depth: number = 3): GameState {
  if (state.phase === 'game_over') return state;

  const pid = state.currentPlayer;
  let currentState = state;

  // 1ターン中に複数アクションを実行（召喚→攻撃→アイテム→end_turn）
  let actionsTaken = 0;
  const maxActions = 8; // 無限ループ防止

  while (currentState.phase !== 'game_over' && actionsTaken < maxActions) {
    const actions = generateActions(currentState);

    // end_turnしかないなら終了
    if (actions.length === 1 && actions[0].type === 'end_turn') {
      currentState = endTurn(currentState);
      break;
    }

    let bestAction: AIAction = { type: 'end_turn' };
    let bestScore = -Infinity;

    for (const action of actions) {
      const nextState = applyAction(currentState, action);
      if (!nextState) continue;

      const score = minimax(nextState, depth - 1, -Infinity, Infinity, pid)
        + getFormerC6AceActionBias(currentState, action, pid);

      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }

    // end_turnが最善なら終了
    if (bestAction.type === 'end_turn') {
      currentState = endTurn(currentState);
      break;
    }

    const nextState = applyAction(currentState, bestAction);
    if (!nextState) {
      currentState = endTurn(currentState);
      break;
    }

    currentState = nextState;

    // ターンが変わっていたら終了（endTurnが内部で呼ばれた場合）
    if (currentState.currentPlayer !== pid) break;

    actionsTaken++;
  }

  // 安全弁: まだ自分のターンなら強制終了
  if (currentState.phase !== 'game_over' && currentState.currentPlayer === pid) {
    try { currentState = endTurn(currentState); } catch { /* */ }
  }

  return currentState;
}

// ========================================
// ヘルパー（アイテム用）
// ========================================
function getItemTargetType(item: ItemCard): 'none' | 'ally' | 'enemy' | 'cell' {
  for (const effect of item.effects) {
    if (effect.target === 'target_enemy') return 'enemy';
    if (effect.target === 'target_ally') return 'ally';
    if (effect.target === 'target_cell') return 'cell';
  }
  return 'none';
}

/** 全味方ターゲットを返す（フィルタリング付き） */
function findAllAllyTargets(state: GameState, pid: PlayerId, item: ItemCard): Position[] {
  const targets: Position[] = [];
  const isHeal = item.effects.some(e => e.effect === 'heal');

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ch = state.board[r][c].character;
      if (!ch || ch.owner !== pid) continue;
      // 回復アイテムの場合、満タンの味方は除外
      if (isHeal && ch.currentHp >= ch.card.hp) continue;
      targets.push({ row: r, col: c });
    }
  }
  return targets;
}

/** 全敵ターゲットを返す */
function findAllEnemyTargets(state: GameState, pid: PlayerId): Position[] {
  const targets: Position[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ch = state.board[r][c].character;
      if (ch && ch.owner !== pid) targets.push({ row: r, col: c });
    }
  }
  return targets;
}

// 旧ヘルパー（互換性のため残す）
function findBestAllyTarget(state: GameState, pid: PlayerId, item: ItemCard): Position | undefined {
  const targets = findAllAllyTargets(state, pid, item);
  return targets.length > 0 ? targets[0] : undefined;
}

function findBestEnemyTarget(state: GameState, pid: PlayerId): Position | undefined {
  const targets = findAllEnemyTargets(state, pid);
  return targets.length > 0 ? targets[0] : undefined;
}
