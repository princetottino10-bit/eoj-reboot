import { getAdjacentCells } from "./board.js";
import { countMarkerAlliesForPassive } from "./effects.js";
import { getEffectSpec } from "./effectSpecs.js";
import type { Board, CellIndex } from "./types.js";

// ============================================================
// passive ATK 補正
// ============================================================

/**
 * 盤面上のキャラのpassive ATKボーナス合計を返す。
 * - 自身の passive spec で target=self のATK補正
 * - 隣接味方の passive spec で target=adj_allies のATK補正（tank_v2_08 等）
 */
export function getPassiveAtkBonus(board: Board, charIdx: CellIndex): number {
  const char = board[charIdx];
  if (char == null) return 0;

  let bonus = 0;
  const owner = char.owner;

  // 自身のpassive ATK補正（target=self）
  const spec = getEffectSpec(char.cardId);
  for (const clause of spec.clauses) {
    if (clause.trigger !== "passive") continue;
    if (
      clause.condition &&
      !evalPassiveCondition(clause.condition, board, charIdx, owner)
    )
      continue;
    for (const atom of clause.effects) {
      if (atom.type === "atk_delta" && atom.target === "self") {
        bonus += atom.delta;
      }
    }
  }

  // 隣接味方のpassive ATK補正（target=adj_allies）
  const adjIdxs = getAdjacentCells(charIdx);
  for (const adjIdx of adjIdxs) {
    const adjChar = board[adjIdx];
    if (adjChar == null || adjChar.owner !== owner) continue;
    const adjSpec = getEffectSpec(adjChar.cardId);
    for (const clause of adjSpec.clauses) {
      if (clause.trigger !== "passive") continue;
      if (
        clause.condition &&
        !evalPassiveCondition(clause.condition, board, adjIdx, adjChar.owner)
      )
        continue;
      for (const atom of clause.effects) {
        if (atom.type === "atk_delta" && atom.target === "adj_allies") {
          bonus += atom.delta;
        }
      }
    }
  }

  return bonus;
}

// ============================================================
// passive 再行動コスト補正
// ============================================================

/**
 * キャラのpassive再行動コスト補正（delta）を返す。
 * 負値ならコスト減少。複数条件が満たされた場合は合計する。
 */
export function getPassiveReactivationCostDelta(
  board: Board,
  charIdx: CellIndex,
): number {
  const char = board[charIdx];
  if (char == null) return 0;

  let delta = 0;
  const spec = getEffectSpec(char.cardId);
  for (const clause of spec.clauses) {
    if (clause.trigger !== "passive") continue;
    if (
      clause.condition &&
      !evalPassiveCondition(clause.condition, board, charIdx, char.owner)
    )
      continue;
    for (const atom of clause.effects) {
      if (atom.type === "reactivation_cost_delta") {
        delta += atom.delta;
      }
    }
  }
  return delta;
}

// ============================================================
// 戦闘フラグ判定
// ============================================================

/** cardId が no_counterattack passive を持つか（攻撃者が反撃されない） */
export function hasPassiveNoCounter(cardId: string): boolean {
  const spec = getEffectSpec(cardId);
  return spec.clauses.some(
    (c) =>
      c.trigger === "passive" &&
      c.effects.some((a) => a.type === "no_counterattack"),
  );
}

/** cardId が omnidirectional_counter passive を持つか（全方位から反撃可能） */
export function hasPassiveOmniCounter(cardId: string): boolean {
  const spec = getEffectSpec(cardId);
  return spec.clauses.some(
    (c) =>
      c.trigger === "passive" &&
      c.effects.some((a) => a.type === "omnidirectional_counter"),
  );
}

// ============================================================
// 内部: passive条件評価
// ============================================================

import type { EffectCondition } from "./effectSpecs.js";

function evalPassiveCondition(
  cond: EffectCondition,
  board: Board,
  charIdx: CellIndex,
  owner: 0 | 1,
): boolean {
  switch (cond.type) {
    case "ally_count_gte":
      // passive条件では自身を除いた他の味方をカウント
      return (
        board.filter((c, i) => c !== null && c.owner === owner && i !== charIdx)
          .length >= cond.min
      );
    case "marker_ally_count_gte":
      return countMarkerAlliesForPassive(board, owner) >= cond.min;
    case "attacked_ally_count_gte":
      return (
        board.filter((c) => c !== null && c.owner === owner && c.hasActed)
          .length >= cond.min
      );
    case "empty_cell_count_gte":
      return board.filter((c) => c === null).length >= cond.min;
    default:
      return false;
  }
}
