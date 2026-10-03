import { attackCells, isBlindShot } from "../combat.ts";
import { boardHpTotal, controlCount, controlNeed, opponent } from "../state.ts";
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

/** Deck cards left at which a side one reshuffle from the end starts to feel it (urgency 0 above, 1 at an empty deck). */
export const DECK_OUT_HORIZON = 8;

/**
 * deckOutMode "second" (the 10/3 default): how near the game is to its end by
 * the second 山札切れ, 0 (off, or nobody has reshuffled yet) .. 1 (a side that
 * already reshuffled once has an empty deck: its next draw ends the game).
 * Grows as the deck of a side on its last deck runs down.
 */
export const deckOutUrgency = (ctx: Ctx, s: GameState): number => {
  if (ctx.cfg.deckOutMode !== "second") return 0;
  let u = 0;
  for (const ps of s.players) {
    if (ps.reshuffleCount < 1) continue;
    u = Math.max(u, Math.min(1, Math.max(0, 1 - ps.deck.length / DECK_OUT_HORIZON)));
  }
  return u;
};

/**
 * What the coming deck-out end adds for `p`: the 占拠 lead weighs up to three
 * times as much, and being ahead at all (the side ahead wins outright) is worth
 * up to a control reach. 0 when the end is not near. Shared by both evals.
 */
export const deckOutTerm = (ctx: Ctx, s: GameState, occP: number, occO: number, occW: number, reachW: number): number => {
  const u = deckOutUrgency(ctx, s);
  if (u === 0) return 0;
  const lead = occP - occO;
  return occW * 2 * u * lead + reachW * u * u * Math.sign(lead);
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
  // 占拠 as the rules count it (weighted under controlCount hp / cost)
  const occP = controlCount(ctx, s, p);
  const occO = controlCount(ctx, s, o);
  let score = 0;
  score += w.occ * (occP - occO);
  score += w.chip * (s.players[p].chips - s.players[o].chips);
  // EXP-0913: with lifeValueEnabled off there is no life win condition, so the
  // life term is dropped rather than letting the AI chase a dead line.
  if (ctx.cfg.lifeValueEnabled) {
    score += w.life * (s.players[p].life - s.players[o].life);
  }
  score += w.boardHp * (boardHpTotal(ctx, s, p) - boardHpTotal(ctx, s, o));
  const cw = controlNeed(ctx, s); // controlWin, or controlWinLate in the late phase
  if (occP >= cw) score += w.reach;
  if (occO >= cw) score -= w.reach;
  // an opponent already on reach is one turn from winning
  if (s.players[o].reach && occO >= cw) score -= w.reach * 2;
  // コールド勝ち: standing on instantWinCells wins at that side's turn end
  const cold = ctx.cfg.instantWinCells;
  if (cold > 0 && occP >= cold) score += w.reach;
  if (cold > 0 && occO >= cold) score -= w.reach * 2;
  // controlWinMode "points": every 制圧点 is banked progress, and an opponent
  // one point short on controlWin 占拠 is one turn end from winning
  if (ctx.cfg.controlWinMode === "points") {
    const need = ctx.cfg.controlPointsToWin;
    score += w.reach * (s.players[p].controlPoints - s.players[o].controlPoints);
    if (s.players[o].controlPoints + 1 >= need && occO >= cw) score -= w.reach * 2;
  }
  // 2回目の山札切れ is near: the side ahead on 占拠 then wins
  score += deckOutTerm(ctx, s, occP, occO, w.occ, w.reach);
  score -= w.threat * threatAgainst(ctx, s, p);
  return score;
};
