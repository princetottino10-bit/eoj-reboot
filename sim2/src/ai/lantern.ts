// The ally an AI seat gives the light of its destroyed 灯籠の精 to (the owner
// chooses since 2026-10-03, src/lantern.ts). Each option is played out on a
// copy - the whole action, with the picks before it and this one - and the
// result is scored from the owner's side: greedy / beam with their eval
// (占拠 incl. the HP-weighted count, board HP, the threat of the enemy's next
// attacks), strong with its own. Exact ties keep the engine default's order
// (most HP gained, a unit that comes to count twice, the most damaged, the
// priciest). Always returns one of the options: the seat never stalls.
// Pure: no node builtins.
import type { LanternChooser } from "../lantern-choice.ts";
import { rankedLanternOptions, withLanternPicks } from "../lantern.ts";
import type { LanternAsk } from "../lantern.ts";
import { applyAction } from "../rules.ts";
import type { Ctx } from "../state.ts";
import type { Action, GameState } from "../types.ts";
import { DEFAULT_WEIGHTS, evaluate } from "./eval.ts";
import type { Weights } from "./eval.ts";
import { STRONG_WEIGHTS, strongEvaluate } from "./strong-eval.ts";
import type { StrongWeights } from "./strong-eval.ts";

type Score = (ctx: Ctx, s: GameState, ask: LanternAsk) => number;

const pickBy = (score: Score): LanternChooser => (ctx, s, a: Action, picks, ask) => {
  // exact ties go to the default's order (judged on the board before the action)
  const order = rankedLanternOptions(ctx, s, ask);
  let best = order[0].uid;
  let bestScore = -Infinity;
  for (const o of order) {
    const { result } = withLanternPicks([...picks, o.uid], () => applyAction(ctx, s, a));
    const v = score(ctx, result.state, ask);
    if (v > bestScore) {
      bestScore = v;
      best = o.uid;
    }
  }
  return best;
};

/** greedy / beam (and any seat without its own chooser). */
export const bestLanternPick = (w: Weights = DEFAULT_WEIGHTS): LanternChooser =>
  pickBy((ctx, s, ask) => evaluate(ctx, s, ask.owner, w));

/** strong: its own eval of the board each choice leaves. */
export const strongLanternPick = (w: StrongWeights = STRONG_WEIGHTS): LanternChooser =>
  pickBy((ctx, s, ask) => strongEvaluate(ctx, s, ask.owner, w));
