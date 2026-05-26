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
import { getCharDef } from "../data/cards.js";
import { ATTR_OPPOSITES } from "./gamestate.js";
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
import { appendLog, assertNonNull } from "./types.js";

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
    case "mana_gain": {
      np[owner] = { ...np[owner], mana: np[owner].mana + atom.amount };
      break;
    }
  }

  return { board: nb, players: np };
}

// ============================================================
// 公開 API
// ============================================================

/**
 * 盤面マスの属性を変更し、そのマスに立つキャラへのHP補正を適用する。
 * 同属性: +2HP（maxHp上限）、対立属性: -2HP（0以下で撃破）、虚/無関係: 変化なし
 */
export function applyCellAttrChange(
  state: GameState,
  cellIdx: CellIndex,
  newAttr: string,
): GameState {
  const oldAttr = state.boardAttrs[cellIdx];
  if (oldAttr === newAttr) return state;

  const newBoardAttrs = [...state.boardAttrs];
  newBoardAttrs[cellIdx] = newAttr;
  let newState = { ...state, boardAttrs: newBoardAttrs };

  const occupant = state.board[cellIdx];
  if (occupant) {
    const charDef = getCharDef(occupant.cardId);
    const charAttr = charDef?.attribute ?? "虚";
    if (charAttr !== "虚" && newAttr !== "虚") {
      let delta = 0;
      if (newAttr === charAttr) delta = 2;
      else if (ATTR_OPPOSITES[charAttr] === newAttr) delta = -2;

      if (delta !== 0) {
        const nb = [...newState.board] as Board;
        const c = nb[cellIdx];
        if (c) {
          const newHp = Math.min(c.maxHp, c.hp + delta);
          nb[cellIdx] = newHp <= 0 ? null : { ...c, hp: newHp };
          const sign = delta > 0 ? `+${delta}` : `${delta}`;
          newState = appendLog(
            { ...newState, board: nb },
            `属性変更: ${oldAttr}→${newAttr} ${charAttr}属性キャラにHP${sign}`,
            delta > 0 ? "heal" : "damage",
          );
          return newState;
        }
      }
    }
  }

  return appendLog(
    newState,
    `マス${cellIdx}の属性: ${oldAttr}→${newAttr}`,
    "info",
  );
}

function resolveCellAttrTargets(target: EffectTarget, summonIdx: CellIndex): CellIndex[] {
  if (target === "self_cell") return [summonIdx];
  if (target === "adj_cells") return getAdjacentCells(summonIdx);
  return [];
}

function resolveSetCellAttrMode(
  mode: string,
  charAttr: string | undefined,
): string | null {
  if (mode === "self_attr") return charAttr ?? null;
  if (mode === "opposite") {
    if (!charAttr || charAttr === "虚") return null;
    return ATTR_OPPOSITES[charAttr] ?? null;
  }
  return null;
}

function applySetCellAttrToBoard(
  board: Board,
  boardAttrs: string[],
  cellIdx: CellIndex,
  newAttr: string,
): { board: Board; boardAttrs: string[] } {
  if (boardAttrs[cellIdx] === newAttr) return { board, boardAttrs };
  const na = [...boardAttrs];
  na[cellIdx] = newAttr;
  const nb = [...board] as Board;
  const occupant = nb[cellIdx];
  if (occupant) {
    const charAttr = getCharDef(occupant.cardId)?.attribute ?? "虚";
    if (charAttr !== "虚" && newAttr !== "虚") {
      let delta = 0;
      if (newAttr === charAttr) delta = 2;
      else if (ATTR_OPPOSITES[charAttr] === newAttr) delta = -2;
      if (delta !== 0) {
        const newHp = Math.min(occupant.maxHp, occupant.hp + delta);
        nb[cellIdx] = newHp <= 0 ? null : { ...occupant, hp: newHp };
      }
    }
  }
  return { board: nb, boardAttrs: na };
}

export function applyAutoEffects(
  state: GameState,
  summonIdx: CellIndex,
  owner: 0 | 1,
  clauses: EffectClause[],
  charAttr?: string,
): { board: Board; players: [PlayerState, PlayerState]; boardAttrs: string[] } {
  let board = [...state.board] as Board;
  let players: [PlayerState, PlayerState] = [
    { ...state.players[0] },
    { ...state.players[1] },
  ];
  let boardAttrs = [...state.boardAttrs];

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
        boardAttrs,
        charAttr,
      )
    )
      continue;

    for (const atom of clause.effects) {
      if (atom.type === "set_cell_attr") {
        const cellIdxs = resolveCellAttrTargets(atom.target, summonIdx);
        const newAttr = resolveSetCellAttrMode(atom.mode, charAttr);
        if (newAttr !== null) {
          for (const ci of cellIdxs) {
            const r = applySetCellAttrToBoard(board, boardAttrs, ci, newAttr);
            board = r.board;
            boardAttrs = r.boardAttrs;
          }
        }
      } else {
        const r = applyAtom(board, players, summonIdx, owner, atom);
        board = r.board;
        players = r.players;
      }
    }
  }

  return { board, players, boardAttrs };
}

// ============================================================
// combat callback エフェクト適用（on_kill / on_death / on_damaged / on_ally_killed）
// ============================================================

/**
 * 攻撃者（killerIdx）の on_kill 節を適用する。
 * 攻撃者が既に撃破されている場合は何もしない。
 */
export function applyOnKillEffects(
  state: GameState,
  killerIdx: CellIndex,
): { board: Board; players: [PlayerState, PlayerState] } {
  const char = state.board[killerIdx];
  if (char == null) return { board: [...state.board] as Board, players: [{ ...state.players[0] }, { ...state.players[1] }] };
  const spec = getEffectSpec(char.cardId);
  let board = [...state.board] as Board;
  let players: [PlayerState, PlayerState] = [{ ...state.players[0] }, { ...state.players[1] }];
  for (const clause of spec.clauses) {
    if (clause.trigger !== "on_kill") continue;
    if (clauseHasPendingEffects(clause)) continue;
    if (clause.condition && !evalCondition(clause.condition, board, killerIdx, char.owner, state.boardAttrs)) continue;
    for (const atom of clause.effects) {
      const r = applyAtom(board, players, killerIdx, char.owner, atom);
      board = r.board;
      players = r.players;
    }
  }
  return { board, players };
}

/**
 * 撃破されたキャラの on_death 節を適用する。
 * キャラはすでに board から除去されている前提。
 * @param deadCardId 撃破されたカードID
 * @param deadIdx 撃破されたキャラの最後の位置
 * @param deadOwner 撃破されたキャラのオーナー
 */
export function applyOnDeathEffects(
  state: GameState,
  deadCardId: string,
  deadIdx: CellIndex,
  deadOwner: 0 | 1,
): { board: Board; players: [PlayerState, PlayerState] } {
  const spec = getEffectSpec(deadCardId);
  let board = [...state.board] as Board;
  let players: [PlayerState, PlayerState] = [{ ...state.players[0] }, { ...state.players[1] }];
  for (const clause of spec.clauses) {
    if (clause.trigger !== "on_death") continue;
    if (clauseHasPendingEffects(clause)) continue;
    if (clause.condition && !evalCondition(clause.condition, board, deadIdx, deadOwner, state.boardAttrs)) continue;
    for (const atom of clause.effects) {
      const r = applyAtom(board, players, deadIdx, deadOwner, atom);
      board = r.board;
      players = r.players;
    }
  }
  return { board, players };
}

/**
 * ダメージを受けたキャラの on_damaged 節を適用する。
 * キャラが生存していることを前提とする。
 */
export function applyOnDamagedEffects(
  state: GameState,
  damagedIdx: CellIndex,
): { board: Board; players: [PlayerState, PlayerState] } {
  const char = state.board[damagedIdx];
  if (char == null) return { board: [...state.board] as Board, players: [{ ...state.players[0] }, { ...state.players[1] }] };
  const spec = getEffectSpec(char.cardId);
  let board = [...state.board] as Board;
  let players: [PlayerState, PlayerState] = [{ ...state.players[0] }, { ...state.players[1] }];
  for (const clause of spec.clauses) {
    if (clause.trigger !== "on_damaged") continue;
    if (clauseHasPendingEffects(clause)) continue;
    if (clause.condition && !evalCondition(clause.condition, board, damagedIdx, char.owner, state.boardAttrs)) continue;
    for (const atom of clause.effects) {
      const r = applyAtom(board, players, damagedIdx, char.owner, atom);
      board = r.board;
      players = r.players;
    }
  }
  return { board, players };
}

/**
 * 味方が撃破されたときに発動する on_ally_killed 節を、生存中の味方キャラ全員に適用する。
 * @param killedOwner 撃破された味方のオーナー
 * @param killedIdx 撃破された味方の最後の位置（自分とは別の味方に適用するため参照）
 */
export function applyOnAllyKilledEffects(
  state: GameState,
  killedOwner: 0 | 1,
  killedIdx: CellIndex,
): { board: Board; players: [PlayerState, PlayerState] } {
  let board = [...state.board] as Board;
  let players: [PlayerState, PlayerState] = [{ ...state.players[0] }, { ...state.players[1] }];
  for (let idx = 0; idx < 9; idx++) {
    if (idx === killedIdx) continue;
    const char = board[idx];
    if (char == null || char.owner !== killedOwner) continue;
    const spec = getEffectSpec(char.cardId);
    for (const clause of spec.clauses) {
      if (clause.trigger !== "on_ally_killed") continue;
      if (clauseHasPendingEffects(clause)) continue;
      if (clause.condition && !evalCondition(clause.condition, board, idx, killedOwner, state.boardAttrs)) continue;
      for (const atom of clause.effects) {
        const r = applyAtom(board, players, idx, killedOwner, atom);
        board = r.board;
        players = r.players;
      }
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

// ============================================================
// ターントリガー自動エフェクト（on_turn_start / on_turn_end）
// ============================================================

/**
 * アクティブプレイヤーのキャラの on_turn_start 節のうち、
 * UIインタラクション不要（pending でない）なものを適用する。
 * aggro_v2_02 のようなオプションdiscardはUI側で別途処理する。
 */
export function applyOnTurnStartEffects(
  state: GameState,
): { board: Board; players: [PlayerState, PlayerState] } {
  return applyAutoTriggerEffects(state, "on_turn_start");
}

/**
 * アクティブプレイヤーのキャラの on_turn_end 節のうち、
 * UIインタラクション不要（pending でない）なものを適用する。
 */
export function applyOnTurnEndEffects(
  state: GameState,
): { board: Board; players: [PlayerState, PlayerState] } {
  return applyAutoTriggerEffects(state, "on_turn_end");
}

function applyAutoTriggerEffects(
  state: GameState,
  trigger: "on_turn_start" | "on_turn_end",
): { board: Board; players: [PlayerState, PlayerState] } {
  const owner = state.active;
  let board = [...state.board] as Board;
  let players: [PlayerState, PlayerState] = [
    { ...state.players[0] },
    { ...state.players[1] },
  ];

  for (let idx = 0; idx < 9; idx++) {
    const char = board[idx];
    if (char == null || char.owner !== owner) continue;
    const spec = getEffectSpec(char.cardId);
    for (const clause of spec.clauses) {
      if (clause.trigger !== trigger) continue;
      if (clauseHasPendingEffects(clause)) continue;
      const tempState = { ...state, board, players };
      if (
        clause.condition &&
        !evalCondition(
          clause.condition,
          board,
          idx,
          owner,
          state.boardAttrs,
        )
      )
        continue;
      for (const atom of clause.effects) {
        const r = applyAtom(board, players, idx, owner, atom);
        board = r.board;
        players = r.players;
      }
    }
  }

  return { board, players };
}
