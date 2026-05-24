import type { GameState, CellIndex, Board, Direction, PlayerState } from './types.js';
import { appendLog } from './types.js';
import { getAdjacentCells } from './board.js';
import { pushBack } from './board.js';
import { drawStep } from './turn.js';
import { clearAffiliatedEffects } from './combat.js';
import { getCardName } from '../data/cards.js';
import { getEffectSpec, clauseHasPendingEffects } from './effectSpecs.js';
import { evalCondition, applyAtom } from './effects.js';

export function applyPendingEffect(
  state: GameState,
  cardId: string,
  summonIdx: CellIndex,
  targetIdx: CellIndex,
  active: 0 | 1,
): GameState {
  const opp = (1 - active) as 0 | 1;
  const nb = [...state.board] as Board;

  const giveMarker = (marker: 'protection' | 'evasion' | 'piercing' | 'quickness') => {
    const c = nb[targetIdx];
    if (c && c.owner === active) nb[targetIdx] = { ...c, markers: { ...c.markers, [marker]: c.markers[marker] + 1 } };
  };

  const rotateTarget90 = () => {
    const c = nb[targetIdx];
    if (c) nb[targetIdx] = { ...c, dir: ((c.dir + 1) % 4) as Direction };
  };

  const adjustAtk = (delta: number) => {
    const c = nb[targetIdx];
    if (c && c.owner === opp) nb[targetIdx] = { ...c, atk: Math.max(0, c.atk + delta) };
  };

  const addActionTax = (amount: number) => {
    const c = nb[targetIdx];
    if (c && c.owner === opp) nb[targetIdx] = { ...c, status: { ...c.status, actionTax: c.status.actionTax + amount, actionTaxBy: cardId } };
  };

  void summonIdx;

  switch (cardId) {
    // ── Synergy ──
    case 'synergy_v2_01': case 'synergy_v2_04':
      giveMarker('protection');
      return appendLog({ ...state, board: nb }, '防護マーカーを付与した', 'info');
    case 'synergy_v2_02':
      giveMarker('evasion');
      return appendLog({ ...state, board: nb }, '回避マーカーを付与した', 'info');
    case 'synergy_v2_03':
      giveMarker('piercing');
      return appendLog({ ...state, board: nb }, '貫通マーカーを付与した', 'info');
    case 'synergy_v2_09': {
      const c = nb[targetIdx];
      if (c && c.owner === active) nb[targetIdx] = { ...c, hp: Math.min(c.hp + 1, c.maxHp) };
      return appendLog({ ...state, board: nb }, 'HPを1回復させた', 'heal');
    }
    // ── Trick ──
    case 'trick_v2_04': {
      const summoned = nb[summonIdx];
      const target = nb[targetIdx];
      nb[summonIdx] = target ?? null;
      nb[targetIdx] = summoned ?? null;
      return appendLog({ ...state, board: nb }, '味方と位置を入れ替えた', 'info');
    }
    case 'trick_v2_01':
      rotateTarget90();
      return appendLog({ ...state, board: nb }, `敵を90°回転させた`, 'info');
    case 'trick_v2_02':
      rotateTarget90();
      return appendLog({ ...state, board: nb }, `敵を90°回転させた`, 'info');
    case 'trick_v2_06': {
      const pushed = pushBack(nb, targetIdx);
      if (pushed) return appendLog({ ...state, board: pushed }, `敵を後退させた`, 'info');
      return appendLog(state, `後退できない（効果なし）`, 'info');
    }
    // ── Control ──
    case 'control_v2_01':
      adjustAtk(-1);
      return appendLog({ ...state, board: nb }, '敵のATKを1下げた', 'info');
    case 'control_v2_02': case 'control_v2_04': case 'control_v2_11':
      addActionTax(1);
      return appendLog({ ...state, board: nb }, '敵の再行動コスト+1', 'info');
    case 'control_v2_03':
      adjustAtk(-2);
      return appendLog({ ...state, board: nb }, '敵のATKを2下げた', 'info');
    case 'control_v2_05': case 'control_v2_08':
      rotateTarget90();
      return appendLog({ ...state, board: nb }, '敵を90°回転させた', 'info');
    case 'control_v2_07': {
      // Brainwash any enemy; bonus: ATK-1 on all adjacent enemies
      const c = nb[targetIdx];
      if (c && c.owner === opp) {
        nb[targetIdx] = { ...c, status: { ...c.status, brainwashedTurns: 3, brainwashedBy: cardId } };
      }
      const adjIdxs = getAdjacentCells(summonIdx);
      for (const ai of adjIdxs) {
        const ac = nb[ai];
        if (ac && ac.owner === opp) nb[ai] = { ...ac, atk: Math.max(0, ac.atk - 1) };
      }
      return appendLog({ ...state, board: nb }, `${getCardName(nb[targetIdx]?.cardId ?? targetIdx.toString())} を洗脳、隣接敵ATK-1`, 'info');
    }
    case 'control_v2_10': {
      adjustAtk(-1);
      const debuffCount = state.board.filter(c => c !== null && c.owner === opp &&
        (c.atk < c.baseAtk || c.status.actionTax > 0)).length;
      let ns = appendLog({ ...state, board: nb }, `敵のATK-1（デバフ敵: ${debuffCount}体）`, 'info');
      if (debuffCount >= 1) {
        ns = drawStep(ns);
        ns = appendLog(ns, 'デバフ1体以上 → 1ドロー', 'info');
      }
      if (debuffCount >= 3) {
        const tgt = ns.board[targetIdx];
        if (tgt) {
          const nb2 = [...ns.board] as Board;
          const newHp = tgt.hp - 1;
          nb2[targetIdx] = newHp <= 0 ? null : { ...tgt, hp: newHp };
          if (newHp <= 0) {
            clearAffiliatedEffects(nb2, tgt.cardId);
            const np = [...ns.players] as typeof ns.players;
            np[active] = { ...np[active], vp: np[active].vp + 1 };
            ns = { ...ns, board: nb2, players: np };
            ns = appendLog(ns, 'デバフ3体以上 → 1ダメ（撃破！1VP）', 'system');
          } else {
            ns = { ...ns, board: nb2 };
            ns = appendLog(ns, 'デバフ3体以上 → 1ダメ', 'damage');
          }
        }
      }
      return ns;
    }
    default:
      return appendLog(state, `${cardId} の効果（未実装）`, 'system');
  }
}

export function applyDiscardEffect(
  state: GameState,
  cardId: string,
  summonIdx: CellIndex,
  active: 0 | 1,
  discarded: boolean,
): GameState {
  if (!discarded) return state;
  const opp = (1 - active) as 0 | 1;

  if (cardId === 'trick_v2_03') {
    const np = [...state.players] as typeof state.players;
    np[active] = { ...np[active], mana: np[active].mana + 1 };
    return appendLog({ ...state, players: np }, 'マナ+1', 'info');
  }
  if (cardId === 'snipe_v2_07') {
    let ns = drawStep(state);
    ns = drawStep(ns);
    return appendLog(ns, '2枚ドロー', 'info');
  }
  if (cardId === 'aggro_v2_10') {
    // mandatory discard already done; no further effect
    return state;
  }
  if (cardId === 'aggro_v2_03') {
    // Push an adjacent enemy — find the first one
    const adjIdxs = getAdjacentCells(summonIdx);
    for (const ai of adjIdxs) {
      const c = state.board[ai];
      if (c && c.owner === opp) {
        const pushed = pushBack(state.board, ai);
        if (pushed) return appendLog({ ...state, board: pushed }, `敵を後退させた`, 'info');
      }
    }
    return appendLog(state, '後退できる敵なし（効果なし）', 'info');
  }
  return state;
}

/**
 * 向き選択完了後に残っている on_summon の条件付き自動効果を適用する。
 * pending 節・無条件節はスキップ（summon 時に適用済み）。
 */
export function applyEffectAfterDir(
  state: GameState,
  cardId: string,
  summonIdx: CellIndex,
  active: 0 | 1,
): GameState {
  const spec = getEffectSpec(cardId);
  let board = [...state.board] as Board;
  let players: [PlayerState, PlayerState] = [{ ...state.players[0] }, { ...state.players[1] }];

  for (const clause of spec.clauses) {
    if (clause.trigger !== 'on_summon') continue;
    if (clauseHasPendingEffects(clause)) continue;
    if (!clause.condition) continue;
    if (!evalCondition(clause.condition, board, summonIdx, active, state.boardAttrs)) continue;
    for (const atom of clause.effects) {
      const r = applyAtom(board, players, summonIdx, active, atom);
      board = r.board;
      players = r.players;
    }
  }
  return { ...state, board, players };
}
