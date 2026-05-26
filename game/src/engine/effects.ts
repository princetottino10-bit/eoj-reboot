import { getAdjacentCells, getAttackCells } from "./board.js";
import type { AttackResult } from "./combat.js";
import { resolveAttack } from "./combat.js";
import { countAlliesInBPosition } from "./cost.js";
import type {
  EffectAtom,
  EffectClause,
  EffectCondition,
  EffectTarget,
} from "./effectSpecs.js";
import {
  clauseHasPendingEffects,
  getEffectSpec,
  needsTargetSelection,
} from "./effectSpecs.js";
import type { CharCardDef } from "./gamestate.js";
import type {
  Board,
  CellIndex,
  CharInstance,
  GameState,
  PlayerState,
  RelCoord,
} from "./types.js";
import { assertNonNull } from "./types.js";

// ============================================================
// 型
// ============================================================

export interface SummonEffectResult {
  clauses: EffectClause[];
  hasPending: boolean;
}

// ============================================================
// ルックアップ
// ============================================================

export function getSummonEffect(cardId: string): SummonEffectResult {
  const spec = getEffectSpec(cardId);
  return {
    clauses: spec.clauses,
    hasPending: needsTargetSelection(spec.clauses, "on_summon"),
  };
}

// ============================================================
// ユーティリティ
// ============================================================

function hasMarkerBuff(char: CharInstance): boolean {
  return (
    char.markers.protection > 0 ||
    char.markers.evasion > 0 ||
    char.markers.piercing > 0 ||
    char.markers.quickness > 0 ||
    char.keywords.includes("防護") ||
    char.keywords.includes("回避") ||
    char.keywords.includes("貫通") ||
    char.keywords.includes("先制")
  );
}

function countMarkerAllies(board: Board, owner: 0 | 1): number {
  return board.filter(
    (c) => c !== null && c.owner === owner && hasMarkerBuff(c),
  ).length;
}

/** passive.ts から参照できるようにエクスポート */
export function countMarkerAlliesForPassive(
  board: Board,
  owner: 0 | 1,
): number {
  return countMarkerAllies(board, owner);
}

function deepCopyBoard(board: Board): Board {
  return board.map((c) =>
    c === null
      ? null
      : {
          ...c,
          keywords: [...c.keywords],
          markers: { ...c.markers },
          status: { ...c.status },
        },
  ) as Board;
}

// ============================================================
// ターゲット解決
// ============================================================

function resolveTargets(
  target: EffectTarget,
  board: Board,
  summonIdx: CellIndex,
  owner: 0 | 1,
): CellIndex[] {
  const opp = (1 - owner) as 0 | 1;
  const adjIdxs = getAdjacentCells(summonIdx);
  switch (target) {
    case "self":
      return [summonIdx];
    case "adj_allies":
      return adjIdxs.filter((i) => board[i]?.owner === owner);
    case "adj_enemies":
      return adjIdxs.filter((i) => board[i]?.owner === opp);
    case "self_and_adj_allies":
      return [summonIdx, ...adjIdxs.filter((i) => board[i]?.owner === owner)];
    case "all_allies":
      return board.map((_, i) => i).filter((i) => board[i]?.owner === owner);
    case "all_enemies":
      return board.map((_, i) => i).filter((i) => board[i]?.owner === opp);
    default:
      return [];
  }
}

// ============================================================
// 条件評価
// ============================================================

export function evalCondition(
  cond: EffectCondition,
  board: Board,
  summonIdx: CellIndex,
  owner: 0 | 1,
  boardAttrs: string[],
  charAttr?: string,
): boolean {
  const opp = (1 - owner) as 0 | 1;
  switch (cond.type) {
    case "ally_count_gte":
      return board.filter((c) => c?.owner === owner).length >= cond.min;
    case "marker_ally_count_gte":
      return countMarkerAllies(board, owner) >= cond.min;
    case "attacked_ally_count_gte":
      return (
        board.filter((c) => c?.owner === owner && c.hasActed).length >= cond.min
      );
    case "debuffed_enemy_count_gte": {
      const count = board.filter(
        (c) =>
          c?.owner === opp &&
          (c.status.brainwashedTurns > 0 ||
            c.status.actionTax > 0 ||
            c.atk < c.baseAtk),
      ).length;
      return count >= cond.min;
    }
    case "b_position_ally_count_gte":
      return countAlliesInBPosition(board, owner) >= cond.min;
    case "on_matching_attr_cell":
      return charAttr != null && boardAttrs[summonIdx] === charAttr;
    case "empty_cell_count_gte":
      return board.filter((c) => c === null).length >= cond.min;
    default:
      return false;
  }
}

// ============================================================
// エフェクト原子の適用（内部）
// ============================================================

export function applyAtom(
  board: Board,
  players: [PlayerState, PlayerState],
  summonIdx: CellIndex,
  owner: 0 | 1,
  atom: EffectAtom,
): { board: Board; players: [PlayerState, PlayerState] } {
  const opp = (1 - owner) as 0 | 1;
  const nb = [...board] as Board;
  const np: [PlayerState, PlayerState] = [{ ...players[0] }, { ...players[1] }];

  switch (atom.type) {
    case "give_marker": {
      const idxs = resolveTargets(atom.target, nb, summonIdx, owner);
      for (const idx of idxs) {
        const c = nb[idx];
        if (c != null) {
          nb[idx] = {
            ...c,
            markers: {
              ...c.markers,
              [atom.marker]: c.markers[atom.marker] + 1,
            },
          };
        }
      }
      break;
    }
    case "heal": {
      const idxs = resolveTargets(atom.target, nb, summonIdx, owner);
      for (const idx of idxs) {
        const c = nb[idx];
        if (c != null) {
          nb[idx] = { ...c, hp: Math.min(c.hp + atom.amount, c.maxHp) };
        }
      }
      break;
    }
    case "atk_delta": {
      const idxs = resolveTargets(atom.target, nb, summonIdx, owner);
      for (const idx of idxs) {
        const c = nb[idx];
        if (c != null) {
          nb[idx] = { ...c, atk: Math.max(0, c.atk + atom.delta) };
        }
      }
      break;
    }
    case "hp_delta": {
      const idxs = resolveTargets(atom.target, nb, summonIdx, owner);
      for (const idx of idxs) {
        const c = nb[idx];
        if (c != null) {
          const newHp = c.hp + atom.amount;
          nb[idx] = newHp <= 0 ? null : { ...c, hp: newHp };
        }
      }
      break;
    }
    case "mana_steal": {
      const stolen = Math.min(atom.amount, np[opp].mana);
      np[opp] = { ...np[opp], mana: np[opp].mana - stolen };
      np[owner] = { ...np[owner], mana: np[owner].mana + stolen };
      break;
    }
    case "draw": {
      for (let i = 0; i < atom.count; i++) {
        const deck = np[owner].deck;
        if (deck.length > 0) {
          const card = assertNonNull(deck.at(-1));
          np[owner] = {
            ...np[owner],
            deck: deck.slice(0, -1),
            hand: [...np[owner].hand, card],
          };
        }
      }
      break;
    }
  }

  return { board: nb, players: np };
}

// ============================================================
// 公開 API
// ============================================================

/**
 * on_summon 節のうち pending でないものを順番に適用し、新しい board と players を返す。
 * charAttr は on_matching_attr_cell 条件の評価に使用。
 */
export function applyAutoEffects(
  state: GameState,
  summonIdx: CellIndex,
  owner: 0 | 1,
  clauses: EffectClause[],
  charAttr?: string,
): { board: Board; players: [PlayerState, PlayerState] } {
  let board = [...state.board] as Board;
  let players: [PlayerState, PlayerState] = [
    { ...state.players[0] },
    { ...state.players[1] },
  ];

  for (const clause of clauses) {
    if (clause.trigger !== "on_summon") continue;
    if (clauseHasPendingEffects(clause)) continue;
    if (
      clause.condition &&
      !evalCondition(
        clause.condition,
        board,
        summonIdx,
        owner,
        state.boardAttrs,
        charAttr,
      )
    )
      continue;

    for (const atom of clause.effects) {
      const r = applyAtom(board, players, summonIdx, owner, atom);
      board = r.board;
      players = r.players;
    }
  }

  return { board, players };
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
  getDefenderCardInfo: (cardId: string) => {
    cost: number;
    attackCells: "all" | null | [number, number][];
    weaknessCells: [number, number][];
  },
): { board: Board; results: AutoAttackResult[] } {
  const workBoard = deepCopyBoard(board);

  const summoned = workBoard[summonIdx];
  if (summoned == null) return { board: workBoard, results: [] };

  const owner = summoned.owner;
  const opp = (1 - owner) as 0 | 1;
  const attackType =
    charDef.attack_type === "魔法" ? ("magic" as const) : ("physical" as const);

  let targetIdxs: CellIndex[];
  if (charDef.attack_cells === "all") {
    targetIdxs = workBoard
      .map((c, i) => (c !== null && c.owner === opp ? i : -1))
      .filter((i) => i >= 0);
  } else if (charDef.attack_cells === null) {
    targetIdxs = [];
  } else {
    const cells = getAttackCells(summonIdx, charDef.attack_cells, summoned.dir);
    targetIdxs = (cells ?? []).filter((idx) => {
      const c = workBoard[idx];
      return c != null && c.owner === opp;
    });
  }

  const results: AutoAttackResult[] = [];
  for (const targetIdx of targetIdxs) {
    if (workBoard[summonIdx] == null) break;
    if (workBoard[targetIdx] == null) continue;

    const defInfo = getDefenderCardInfo(workBoard[targetIdx]?.cardId);
    const result = resolveAttack(workBoard, summonIdx, targetIdx, {
      teamDR,
      weaknessCells: defInfo.weaknessCells as RelCoord[],
      attackType,
      defenderCost: defInfo.cost,
      attackerCost: charDef.cost,
      defenderAttackCells: defInfo.attackCells,
    });
    results.push({ targetIdx, result });
  }

  return { board: workBoard, results };
}
