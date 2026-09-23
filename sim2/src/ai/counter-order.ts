// The countering side's order when a human does not choose it (an AI seat, the
// headless runner, and the fallback): every candidate order is played out on a
// copy and scored from the defender's side with the eval the greedy / beam AIs
// use. Ties keep the earlier candidate, so the engine order wins them.
// Pure: no node builtins.
import { counterOrderChoice } from "../counter-order.ts";
import type { AttackAction } from "../counter-order.ts";
import { applyAction } from "../rules.ts";
import { opponent, unitByUid } from "../state.ts";
import type { Ctx } from "../state.ts";
import type { GameState } from "../types.ts";
import { DEFAULT_WEIGHTS, evaluate } from "./eval.ts";
import type { Weights } from "./eval.ts";

/**
 * How many times one turn's plan may be taken again because an action in it is
 * no longer legal. A plan is made on the board as the AI simulates it; under
 * 案A (counterResolve "chosen") the countering seat may order the counters
 * differently, and the board then differs from the one the plan assumed.
 * Every AI driver (the runner, the AI table, the test drivers) plans again then.
 */
export const MAX_REPLANS = 4;

/** The chooser an AI seat answers the counter-order question with. null = no choice to make. */
export type CounterOrderChooser = (ctx: Ctx, s: GameState, a: AttackAction) => number[] | null;

export const bestCounterOrder = (ctx: Ctx, s: GameState, a: AttackAction, w: Weights = DEFAULT_WEIGHTS): number[] | null => {
  const attacker = unitByUid(s, a.uid);
  if (attacker === undefined) return null;
  const choice = counterOrderChoice(ctx, s, a);
  if (choice === null) return null;
  const defender = opponent(attacker.owner);
  let best = choice.orders[0];
  let bestScore = -Infinity;
  for (const order of choice.orders) {
    const score = evaluate(ctx, applyAction(ctx, s, { ...a, counterOrder: order }).state, defender, w);
    if (score > bestScore) {
      bestScore = score;
      best = order;
    }
  }
  return best.slice();
};

/** The attack with the countering side's order attached when there is one to choose (otherwise unchanged). */
export const withCounterOrder = (ctx: Ctx, s: GameState, a: AttackAction, choose: CounterOrderChooser = bestCounterOrder): AttackAction => {
  if (a.counterOrder !== undefined) return a;
  const order = choose(ctx, s, a);
  return order === null ? a : { ...a, counterOrder: order };
};
