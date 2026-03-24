import type { Buff, BoardCharacter, GameState, PlayerId, Position } from '../types/game';
import { isBlindSpot } from './range';
import { getAdjacentPositions } from './utils';

export const MAX_CHARACTERS_PER_PLAYER = 5;
export const MAX_SUMMONS_PER_TURN = 2;
export const EXTRA_SUMMON_MANA_COST = 1;
export const VP_TARGET = 13;
export const TERRITORY_CONTROL_TARGET = 5;

export function getKillVpForManaCost(manaCost: number): number {
  if (manaCost <= 2) return 1;
  if (manaCost <= 4) return 2;
  return 3;
}

export function isControlDebuff(buff: Buff): boolean {
  return buff.type === 'atk_down' || buff.type === 'action_tax' || buff.type === 'brainwashed';
}

// ========================================
// エース回収条件カウンター
// 各派閥のエースは、この値1につきコスト-1（最低2）
// ========================================

const MARKER_BUFF_TYPES = ['has_protection', 'has_dodge', 'has_piercing', 'has_quickness'] as const;
const FORMER_C6_ACE_IDS = new Set([
  'aggro_v2_11',
  'tank_v2_12',
  'control_v2_10',
  'synergy_v2_11',
  'snipe_v2_10',
  'trick_v2_12',
]);

function getBaseCardId(id: string): string {
  return id.replace(/_d\d+$/, '');
}

function countOwnerUnits(state: GameState, pid: PlayerId): number {
  let count = 0;
  for (const row of state.board) {
    for (const cell of row) {
      if (cell.character?.owner === pid) count++;
    }
  }
  return count;
}

/** アグロ: このターン攻撃した味方の数 */
export function countAggroAceCondition(state: GameState, pid: PlayerId): number {
  const attacked = state.attackedThisTurn;
  if (!attacked) return 0;
  // attackedThisTurn にはこのターン攻撃した味方のcardIdが入っている
  // 自分の味方のみカウント
  let count = 0;
  const arr = Array.isArray(attacked) ? attacked : [];
  for (const cardId of arr) {
    // 盤面上にそのカードが自分のものとして存在するか確認
    for (const row of state.board) {
      for (const cell of row) {
        if (cell.character && cell.character.owner === pid && cell.character.card.id === cardId) {
          count++;
        }
      }
    }
  }
  return count;
}

/** タンク: coverキーワードを持ち、隣接に味方がいるキャラの数 */
export function countTankAceCondition(state: GameState, pid: PlayerId): number {
  let count = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ch = state.board[r][c].character;
      if (!ch || ch.owner !== pid) continue;
      if (!ch.card.keywords.includes('cover')) continue;
      // 隣接に味方がいるか
      const adj = getAdjacentPositions({ row: r, col: c });
      const hasAdjacentAlly = adj.some(a => {
        const ac = state.board[a.row][a.col].character;
        return ac && ac.owner === pid;
      });
      if (hasAdjacentAlly) count++;
    }
  }
  return count;
}

/** コントロール: atk_down/action_tax/brainwashed 状態の敵の数 */
export function countControlAceCondition(state: GameState, pid: PlayerId): number {
  const enemyId: PlayerId = pid === 0 ? 1 : 0;
  let count = 0;
  for (const row of state.board) {
    for (const cell of row) {
      const ch = cell.character;
      if (!ch || ch.owner !== enemyId) continue;
      if (ch.buffs.some(b => isControlDebuff(b))) count++;
    }
  }
  return count;
}

/** シナジー: マーカー(protection/dodge/piercing/quickness)を持つ味方の数 */
export function countSynergyAceCondition(state: GameState, pid: PlayerId): number {
  let count = 0;
  for (const row of state.board) {
    for (const cell of row) {
      const ch = cell.character;
      if (!ch || ch.owner !== pid) continue;
      if (ch.buffs.some(b => (MARKER_BUFF_TYPES as readonly string[]).includes(b.type))) count++;
    }
  }
  return count;
}

/** スナイプ: 味方に反撃できない敵の数（味方の攻撃範囲外にいる or マーク済み） */
export function countSnipeAceCondition(state: GameState, pid: PlayerId): number {
  const enemyId: PlayerId = pid === 0 ? 1 : 0;
  // 自分の味方の位置を収集
  const myUnits: { pos: Position; ch: BoardCharacter }[] = [];
  const enemyUnits: { pos: Position; ch: BoardCharacter }[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ch = state.board[r][c].character;
      if (!ch) continue;
      if (ch.owner === pid) myUnits.push({ pos: { row: r, col: c }, ch });
      else enemyUnits.push({ pos: { row: r, col: c }, ch });
    }
  }

  let count = 0;
  for (const enemy of enemyUnits) {
    // この敵が「味方のいずれかに反撃できない」= ブラインドスポットにいる味方がいる
    // → 逆: 味方のうち誰かがこの敵のブラインドにいるか
    const cannotCounterAny = myUnits.some(ally =>
      isBlindSpot(enemy.pos, enemy.ch, ally.pos)
    );
    // マーク済みも対象
    const isMarked = enemy.ch.buffs.some(b => b.type === 'marked');
    if (cannotCounterAny || isMarked) count++;
  }
  return count;
}

/** トリック: 相手キャラのB位置（ブラインドスポット）にいる味方の数 */
export function countTrickAceCondition(state: GameState, pid: PlayerId): number {
  const enemyId: PlayerId = pid === 0 ? 1 : 0;
  const myUnits: { pos: Position }[] = [];
  const enemyUnits: { pos: Position; ch: BoardCharacter }[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ch = state.board[r][c].character;
      if (!ch) continue;
      if (ch.owner === pid) myUnits.push({ pos: { row: r, col: c } });
      else enemyUnits.push({ pos: { row: r, col: c }, ch });
    }
  }

  let count = 0;
  for (const ally of myUnits) {
    // この味方が敵のどれかのブラインドスポットにいるか
    const inEnemyBlind = enemyUnits.some(enemy =>
      isBlindSpot(enemy.pos, enemy.ch, ally.pos)
    );
    if (inEnemyBlind) count++;
  }
  return count;
}

/**
 * 派閥に応じたエース条件カウントを返す
 */
export function getAceConditionCount(state: GameState, pid: PlayerId, faction: string): number {
  switch (faction) {
    case 'aggro': return countAggroAceCondition(state, pid);
    case 'tank': return countTankAceCondition(state, pid);
    case 'control': return countControlAceCondition(state, pid);
    case 'synergy': return countSynergyAceCondition(state, pid);
    case 'snipe': return countSnipeAceCondition(state, pid);
    case 'trick': return countTrickAceCondition(state, pid);
    default: return 0;
  }
}

/**
 * エースカード（コスト5以上）の実効コストを計算
 * 条件1つにつき-1、最低コスト2
 */
export function getAceEffectiveCost(state: GameState, pid: PlayerId, card: { id?: string; manaCost: number; faction: string }): number {
  const baseId = card.id ? getBaseCardId(card.id) : '';
  const isFormerC6Ace = FORMER_C6_ACE_IDS.has(baseId);
  if (card.manaCost < 5 && !isFormerC6Ace) return card.manaCost;

  const condCount = getAceConditionCount(state, pid, card.faction);
  if (isFormerC6Ace) {
    const ownerUnits = countOwnerUnits(state, pid);
    const fieldDiscount = ownerUnits >= 3 ? 1 : 0;
    return Math.max(2, card.manaCost - condCount - fieldDiscount);
  }

  return Math.max(2, card.manaCost - condCount);
}
