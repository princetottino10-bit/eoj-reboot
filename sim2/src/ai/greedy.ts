import { applyActionInPlace, legalActions } from "../rules.ts";
import { cloneState } from "../state.ts";
import type { Ctx } from "../state.ts";
import type { Action, GameEvent, GameState, PlayerId } from "../types.ts";
import { DEFAULT_WEIGHTS, evaluate } from "./eval.ts";
import type { Weights } from "./eval.ts";

export type Ai = {
  name: string;
  /** Returns the action list for the turn, always terminated by `pass`. */
  planTurn: (ctx: Ctx, s: GameState) => Action[];
};

/** Minimum eval gain required before an action is worth taking at all. */
export const GREEDY_EPSILON = 0.5;

export const bestSingleAction = (
  ctx: Ctx,
  s: GameState,
  p: PlayerId,
  w: Weights,
): { action: Action; score: number } | null => {
  const base = evaluate(ctx, s, p, w);
  let best: Action | null = null;
  let bestScore = base + GREEDY_EPSILON;
  const sink: GameEvent[] = [];
  for (const a of legalActions(ctx, s)) {
    if (a.kind === "pass") continue;
    const next = cloneState(s);
    sink.length = 0;
    applyActionInPlace(ctx, next, a, sink);
    const sc = evaluate(ctx, next, p, w);
    if (sc > bestScore) {
      bestScore = sc;
      best = a;
    }
  }
  return best === null ? null : { action: best, score: bestScore };
};

/**
 * Greedy AI: repeatedly take the single atomic action with the largest eval
 * gain. Stops as soon as nothing improves, so a mana-starved player passes
 * instead of spinning. maxActionsPerTurn is the hard backstop.
 */
export const makeGreedy = (w: Weights = DEFAULT_WEIGHTS): Ai => ({
  name: "greedy",
  planTurn: (ctx, s) => {
    const p = s.turnPlayer;
    const out: Action[] = [];
    let cur = cloneState(s);
    const sink: GameEvent[] = [];
    for (let i = 0; i < ctx.cfg.maxActionsPerTurn; i++) {
      if (cur.ended) break;
      const pick = bestSingleAction(ctx, cur, p, w);
      if (pick === null) break;
      out.push(pick.action);
      sink.length = 0;
      applyActionInPlace(ctx, cur, pick.action, sink);
    }
    out.push({ kind: "pass" });
    return out;
  },
});
