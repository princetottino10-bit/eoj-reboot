import { getCharDef } from "../data/cards.js";
import {
  cellCol,
  cellIdx,
  cellRow,
  getAdjacentCells,
  isValidCell,
  relToAbs,
} from "./board.js";
import type { CharCardDef } from "./gamestate.js";
import type { Board, CellIndex } from "./types.js";

/**
 * Count allied chars that are in B-position of at least one enemy.
 */
export function countAlliesInBPosition(board: Board, active: 0 | 1): number {
  const opp = (1 - active) as 0 | 1;
  const allySet = new Set<number>();
  board.forEach((c, enemyIdx) => {
    if (c == null || c.owner !== opp) return;
    const weakCells = (getCharDef(c.cardId)?.weakness_cells ?? [[-1, 0]]) as [
      number,
      number,
    ][];
    for (const [rr, rc] of weakCells) {
      const [dr, dc] = relToAbs(rr, rc, c.dir);
      const row = cellRow(enemyIdx) + dr;
      const col = cellCol(enemyIdx) + dc;
      if (!isValidCell(row, col)) continue;
      const wIdx = cellIdx(row, col);
      const ally = board[wIdx];
      if (ally != null && ally.owner === active) allySet.add(wIdx);
    }
  });
  return allySet.size;
}

/**
 * Calculate cost reduction for a cost-5 character card.
 * Only applies to cost-5 cards (returns 0 for others).
 * The caller should apply: Math.max(2, baseCost - reduction)
 */
export function calcCostReduction(
  cardDef: CharCardDef,
  board: Board,
  active: 0 | 1,
): number {
  if (cardDef.cost !== 5) return 0;
  const opp = (1 - active) as 0 | 1;

  switch (cardDef.faction) {
    case "aggro": {
      // Number of active player's chars with hasActed === true
      return board.filter(
        (c) => c !== null && c.owner === active && c.hasActed === true,
      ).length;
    }
    case "tank": {
      // Number of active player's chars with 'カバー' keyword that have at least 1 adjacent ally
      return board.filter((c, idx) => {
        if (c === null || c.owner !== active || !c.keywords.includes("カバー"))
          return false;
        const adjAllies = getAdjacentCells(idx as CellIndex).filter((ai) => {
          const ally = board[ai];
          return ally != null && ally.owner === active;
        });
        return adjAllies.length >= 1;
      }).length;
    }
    case "control": {
      // Number of opponent's chars with atk < baseAtk || actionTax > 0 || brainwashedTurns > 0
      return board.filter((c) => {
        if (c === null || c.owner !== opp) return false;
        return (
          c.atk < c.baseAtk ||
          c.status.actionTax > 0 ||
          c.status.brainwashedTurns > 0
        );
      }).length;
    }
    case "synergy": {
      // Number of active player's chars with any marker > 0
      return board.filter((c) => {
        if (c === null || c.owner !== active) return false;
        return (
          c.markers.protection +
            c.markers.evasion +
            c.markers.piercing +
            c.markers.quickness +
            c.markers.aim >
          0
        );
      }).length;
    }
    case "snipe": {
      // Number of opponent's chars with aim markers > 0 (currently always 0)
      return board.filter(
        (c) => c !== null && c.owner === opp && c.markers.aim > 0,
      ).length;
    }
    case "trick": {
      // Number of active player's allies that are in B-position of at least one enemy
      return countAlliesInBPosition(board, active);
    }
    default:
      return 0;
  }
}
