import type { Board, CharInstance, CellIndex } from './types.js';
import type { PlayerState } from './types.js';
import type { CharCardDef } from './gamestate.js';
import type { AttackResult } from './combat.js';
import { getAdjacentCells, getAttackCells } from './board.js';
import { resolveAttack } from './combat.js';

// ============================================================
// 型
// ============================================================

export type MarkerKey = 'protection' | 'evasion' | 'piercing' | 'quickness';

/** auto-resolve 可能な召喚時エフェクト原子 */
export type AutoEffect =
  | { tag: 'give_marker_adj_allies'; marker: MarkerKey }
  | { tag: 'give_marker_self_and_adj_allies'; marker: MarkerKey }
  | { tag: 'give_marker_self'; marker: MarkerKey }
  | { tag: 'heal_adj_allies'; amount: number }
  | { tag: 'atk_delta_adj_allies'; delta: number }
  | { tag: 'damage_adj_enemies'; amount: number }
  | { tag: 'steal_mana'; amount: number }
  | { tag: 'cond_marker_ally_gte'; minAllies: number; then: AutoEffect };

export interface SummonEffectSpec {
  /** 即時適用できるエフェクト列 */
  autoEffects: AutoEffect[];
  /** true = UI側でターゲット選択が必要なエフェクトを持つ */
  hasPending: boolean;
}

// ============================================================
// カードID → 召喚エフェクト対応表
// ============================================================

const NONE: SummonEffectSpec = { autoEffects: [], hasPending: false };
const PENDING: SummonEffectSpec = { autoEffects: [], hasPending: true };

const SUMMON_EFFECT_TABLE: Record<string, SummonEffectSpec> = {
  // ---- Tank ----
  'tank_v2_02': {
    autoEffects: [{ tag: 'give_marker_adj_allies', marker: 'protection' }],
    hasPending: false,
  },
  'tank_v2_05': {
    autoEffects: [{ tag: 'heal_adj_allies', amount: 1 }],
    hasPending: false,
  },
  'tank_v2_09': {
    autoEffects: [
      { tag: 'give_marker_self_and_adj_allies', marker: 'protection' },
      { tag: 'heal_adj_allies', amount: 1 },
    ],
    hasPending: false,
  },
  'tank_v2_11': PENDING,  // 味方1体の向きを選択
  'tank_v2_12': {
    autoEffects: [
      { tag: 'heal_adj_allies', amount: 2 },
      { tag: 'give_marker_self', marker: 'protection' },
    ],
    hasPending: false,
  },

  // ---- Synergy ----
  'synergy_v2_01': PENDING,  // 味方1体に防護
  'synergy_v2_02': PENDING,  // 隣接味方1体に回避
  'synergy_v2_03': PENDING,  // 隣接味方1体に貫通
  'synergy_v2_04': PENDING,  // 味方1体に回避
  'synergy_v2_07': {
    autoEffects: [{ tag: 'atk_delta_adj_allies', delta: 1 }],
    hasPending: false,
  },
  'synergy_v2_08': {
    autoEffects: [
      { tag: 'heal_adj_allies', amount: 1 },
      { tag: 'cond_marker_ally_gte', minAllies: 3, then: { tag: 'atk_delta_adj_allies', delta: 1 } },
    ],
    hasPending: false,
  },
  'synergy_v2_09': PENDING,  // 隣接味方1体のHP+1
  'synergy_v2_11': {
    autoEffects: [
      { tag: 'heal_adj_allies', amount: 1 },
      { tag: 'cond_marker_ally_gte', minAllies: 3, then: { tag: 'atk_delta_adj_allies', delta: 1 } },
    ],
    hasPending: false,
  },
  'synergy_v2_12': {
    autoEffects: [{ tag: 'atk_delta_adj_allies', delta: 1 }],
    hasPending: false,
  },

  // ---- Aggro ----
  'aggro_v2_03': PENDING,  // optional: 手札捨て→隣接敵を後退
  'aggro_v2_10': PENDING,  // 1ドロー後1捨て（捨て選択が必要）
  'aggro_v2_11': {
    autoEffects: [{ tag: 'damage_adj_enemies', amount: 3 }],
    hasPending: false,
  },

  // ---- Control ----
  'control_v2_01': PENDING,
  'control_v2_02': PENDING,
  'control_v2_03': PENDING,
  'control_v2_04': PENDING,
  'control_v2_05': PENDING,
  'control_v2_07': PENDING,
  'control_v2_08': PENDING,
  'control_v2_09': {
    autoEffects: [{ tag: 'steal_mana', amount: 2 }],
    hasPending: false,
  },
  'control_v2_10': PENDING,
  'control_v2_11': PENDING,

  // ---- Trick ----
  'trick_v2_01': PENDING,
  'trick_v2_02': PENDING,
  'trick_v2_03': PENDING,  // optional discard for mana
  'trick_v2_04': PENDING,  // 味方1体と位置入替
  'trick_v2_06': PENDING,
  'trick_v2_09': PENDING,
  'trick_v2_12': PENDING,

  // ---- Snipe ----
  'snipe_v2_07': PENDING,  // optional: 手札捨て→2ドロー
};

export function getSummonEffect(cardId: string): SummonEffectSpec {
  return SUMMON_EFFECT_TABLE[cardId] ?? NONE;
}

// ============================================================
// ユーティリティ
// ============================================================

/** マーカーバフ（消費型マーカーまたは永続キーワード）を保持しているか */
function hasMarkerBuff(char: CharInstance): boolean {
  return (
    char.markers.protection > 0 || char.markers.evasion > 0 ||
    char.markers.piercing > 0 || char.markers.quickness > 0 ||
    char.keywords.includes('防護') || char.keywords.includes('回避') ||
    char.keywords.includes('貫通') || char.keywords.includes('先制')
  );
}

/** オーナーのマーカーバフ持ち味方の数（全盤面） */
function countMarkerAllies(board: Board, owner: 0 | 1): number {
  return board.filter(c => c !== null && c.owner === owner && hasMarkerBuff(c)).length;
}

/** Board を深くコピーする（resolveAttack がin-place変更するため） */
function deepCopyBoard(board: Board): Board {
  return board.map(c =>
    c === null ? null : {
      ...c,
      keywords: [...c.keywords],
      markers: { ...c.markers },
      status: { ...c.status },
    },
  ) as Board;
}

// ============================================================
// AutoEffect の適用（内部）
// ============================================================

function applyAtom(
  board: Board,
  players: [PlayerState, PlayerState],
  summonIdx: CellIndex,
  owner: 0 | 1,
  atom: AutoEffect,
): { board: Board; players: [PlayerState, PlayerState] } {
  const opp = (1 - owner) as 0 | 1;
  const adjIdxs = getAdjacentCells(summonIdx);
  let nb = [...board] as Board;
  let np: [PlayerState, PlayerState] = [{ ...players[0] }, { ...players[1] }];

  switch (atom.tag) {
    case 'give_marker_adj_allies': {
      for (const idx of adjIdxs) {
        const c = nb[idx];
        if (c != null && c.owner === owner) {
          nb[idx] = { ...c, markers: { ...c.markers, [atom.marker]: c.markers[atom.marker] + 1 } };
        }
      }
      break;
    }
    case 'give_marker_self_and_adj_allies': {
      for (const idx of [summonIdx, ...adjIdxs]) {
        const c = nb[idx];
        if (c != null && c.owner === owner) {
          nb[idx] = { ...c, markers: { ...c.markers, [atom.marker]: c.markers[atom.marker] + 1 } };
        }
      }
      break;
    }
    case 'give_marker_self': {
      const c = nb[summonIdx];
      if (c != null) {
        nb[summonIdx] = { ...c, markers: { ...c.markers, [atom.marker]: c.markers[atom.marker] + 1 } };
      }
      break;
    }
    case 'heal_adj_allies': {
      for (const idx of adjIdxs) {
        const c = nb[idx];
        if (c != null && c.owner === owner) {
          nb[idx] = { ...c, hp: Math.min(c.hp + atom.amount, c.maxHp) };
        }
      }
      break;
    }
    case 'atk_delta_adj_allies': {
      for (const idx of adjIdxs) {
        const c = nb[idx];
        if (c != null && c.owner === owner) {
          nb[idx] = { ...c, atk: Math.max(0, c.atk + atom.delta) };
        }
      }
      break;
    }
    case 'damage_adj_enemies': {
      for (const idx of adjIdxs) {
        const c = nb[idx];
        if (c != null && c.owner === opp) {
          const newHp = c.hp - atom.amount;
          nb[idx] = newHp <= 0 ? null : { ...c, hp: newHp };
        }
      }
      break;
    }
    case 'steal_mana': {
      const stolen = Math.min(atom.amount, np[opp].mana);
      np[opp] = { ...np[opp], mana: np[opp].mana - stolen };
      np[owner] = { ...np[owner], mana: np[owner].mana + stolen };
      break;
    }
    case 'cond_marker_ally_gte': {
      if (countMarkerAllies(nb, owner) >= atom.minAllies) {
        const r = applyAtom(nb, np, summonIdx, owner, atom.then);
        nb = r.board;
        np = r.players;
      }
      break;
    }
  }

  return { board: nb, players: np };
}

// ============================================================
// 公開 API
// ============================================================

/** AutoEffect リストを順番に適用し、新しい board と players を返す。 */
export function applyAutoEffects(
  board: Board,
  players: [PlayerState, PlayerState],
  summonIdx: CellIndex,
  owner: 0 | 1,
  effects: AutoEffect[],
): { board: Board; players: [PlayerState, PlayerState] } {
  let b = board;
  let p = players;
  for (const atom of effects) {
    const r = applyAtom(b, p, summonIdx, owner, atom);
    b = r.board;
    p = r.players;
  }
  return { board: b, players: p };
}

export interface AutoAttackResult {
  targetIdx: CellIndex;
  result: AttackResult;
}

/**
 * 召喚後の自動攻撃を解決する。
 * 攻撃範囲内の全敵を順に攻撃し、結果を返す。
 * 攻撃者が反撃で撃破された場合、以降の攻撃はスキップする。
 */
export function resolveSummonAutoAttack(
  board: Board,
  summonIdx: CellIndex,
  charDef: CharCardDef,
  teamDR: [boolean, boolean],
  getDefenderCost: (cardId: string) => number,
): { board: Board; results: AutoAttackResult[] } {
  // resolveAttack はin-place変更するためコピーして作業する
  const workBoard = deepCopyBoard(board);

  const summoned = workBoard[summonIdx];
  if (summoned == null) return { board: workBoard, results: [] };

  const owner = summoned.owner;
  const opp = (1 - owner) as 0 | 1;
  const weaknessCells = charDef.weakness_cells as [number, number][] | undefined;
  const attackType = charDef.attack_type === '魔法' ? 'magic' as const : 'physical' as const;

  // 攻撃対象インデックスを収集
  let targetIdxs: CellIndex[];
  if (charDef.attack_cells === 'all') {
    targetIdxs = workBoard
      .map((c, i) => (c !== null && c.owner === opp ? i : -1))
      .filter(i => i >= 0);
  } else if (charDef.attack_cells === null) {
    targetIdxs = [];
  } else {
    const cells = getAttackCells(summonIdx, charDef.attack_cells, summoned.dir);
    targetIdxs = (cells ?? []).filter(idx => {
      const c = workBoard[idx];
      return c != null && c.owner === opp;
    });
  }

  const results: AutoAttackResult[] = [];
  for (const targetIdx of targetIdxs) {
    if (workBoard[summonIdx] == null) break;   // 攻撃者が撃破済み
    if (workBoard[targetIdx] == null) continue; // 対象が既に撃破済み

    const defenderCost = getDefenderCost(workBoard[targetIdx]!.cardId);
    const result = resolveAttack(workBoard, summonIdx, targetIdx, {
      teamDR,
      ...(weaknessCells !== undefined ? { weaknessCells } : {}),
      attackType,
      defenderCost,
    });
    results.push({ targetIdx, result });
  }

  return { board: workBoard, results };
}
