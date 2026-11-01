import { attackCells, isBlindShot } from "../combat.ts";
import { boardHpTotal, occupied, opponent } from "../state.ts";
import type { Ctx } from "../state.ts";
import { posEq } from "../board.ts";
import { canAttack, cardOf } from "../cards.ts";
import type { GameState, PlayerId } from "../types.ts";

export type Weights = {
  occ: number;
  chip: number;
  life: number;
  boardHp: number;
  reach: number;
  threat: number;
};

export const DEFAULT_WEIGHTS: Weights = {
  occ: 30,
  chip: 12,
  life: 8,
  boardHp: 3,
  reach: 200,
  threat: 2,
};

/** Named weight profiles: the shape of the policy, not its depth. */
export const EVAL_PROFILES: Record<string, Weights> = {
  territorial: { occ: 30, chip: 12, life: 8, boardHp: 3, reach: 200, threat: 2 },
  aggressive: { occ: 12, chip: 6, life: 40, boardHp: 4, reach: 120, threat: 2 },
  balanced: { occ: 20, chip: 10, life: 20, boardHp: 3, reach: 160, threat: 2 },
};

export const EVAL_PROFILE_NAMES = Object.keys(EVAL_PROFILES);

export const profileWeights = (name: string): Weights => {
  const w = EVAL_PROFILES[name];
  if (w === undefined) {
    throw new Error(`unknown eval profile "${name}" (expected ${EVAL_PROFILE_NAMES.join("|")})`);
  }
  return w;
};

export const WIN_SCORE = 1_000_000;

/** Damage `p` is exposed to if the opponent attacks with what is on the board. */
const threatAgainst = (ctx: Ctx, s: GameState, p: PlayerId): number => {
  const o = opponent(p);
  let total = 0;
  for (const u of s.units) {
    if (u.owner !== o) continue;
    if (!canAttack(cardOf(ctx.pack, u.cardId))) continue;
    const cells = attackCells(ctx, u);
    let best = 0;
    for (const m of s.units) {
      if (m.owner !== p) continue;
      if (!cells.some((c) => posEq(c, m.pos))) continue;
      const dmg = cardOf(ctx.pack, u.cardId).atk + (isBlindShot(ctx, u, m) ? ctx.cfg.blindBonus : 0);
      if (dmg > best) best = dmg;
    }
    total += best;
  }
  return total;
};

/** Scalar board score from `p`'s point of view. Higher is better for p. */
export const evaluate = (
  ctx: Ctx,
  s: GameState,
  p: PlayerId,
  w: Weights = DEFAULT_WEIGHTS,
): number => {
  if (s.ended) {
    if (s.winner === null) return 0;
    return s.winner === p ? WIN_SCORE : -WIN_SCORE;
  }
  const o = opponent(p);
  const occP = occupied(s, p);
  const occO = occupied(s, o);
  let score = 0;
  score += w.occ * (occP - occO);
  score += w.chip * (s.players[p].chips - s.players[o].chips);
  score += w.life * (s.players[p].life - s.players[o].life);
  score += w.boardHp * (boardHpTotal(ctx, s, p) - boardHpTotal(ctx, s, o));
  if (occP >= ctx.cfg.controlWin) score += w.reach;
  if (occO >= ctx.cfg.controlWin) score -= w.reach;
  // an opponent already on reach is one turn from winning
  if (s.players[o].reach && occO >= ctx.cfg.controlWin) score -= w.reach * 2;
  score -= w.threat * threatAgainst(ctx, s, p);
  return score;
};
