// 案A counter order (採用ルール 9/22, counterResolve "chosen"): when several
// defenders counter, they resolve one at a time and the countering side picks
// the order. Most of the time the order cannot matter (every counter only
// deals damage, and the attacker is destroyed or not whatever the order); the
// choice is only asked for when the orders really lead to different boards -
// today that is 僵尸公主 (ad13) among two or more counterers that destroy the
// attacker: whether its counter lands the kill decides whether it moves.
// Pure: no node builtins, importable from the browser.
import { counterersOf } from "./combat.ts";
import { applyAction } from "./rules.ts";
import type { Ctx } from "./state.ts";
import type { Action, GameState } from "./types.ts";

export type AttackAction = Extract<Action, { kind: "attack" }>;

/** Above this many counterers only one order per unit (it goes first) is tried, not every permutation. */
export const MAX_PERMUTED_COUNTERERS = 4;

const permutations = (xs: readonly number[]): number[][] => {
  if (xs.length <= 1) return [xs.slice()];
  const out: number[][] = [];
  xs.forEach((x, i) => {
    for (const rest of permutations([...xs.slice(0, i), ...xs.slice(i + 1)])) out.push([x, ...rest]);
  });
  return out;
};

/**
 * The orders worth comparing, the engine order first: every permutation up to
 * MAX_PERMUTED_COUNTERERS counterers, above that each unit moved to the front
 * of the engine order.
 */
export const counterOrderCandidates = (uids: readonly number[]): number[][] => {
  if (uids.length <= MAX_PERMUTED_COUNTERERS) return permutations(uids);
  return uids.map((u) => [u, ...uids.filter((x) => x !== u)]);
};

export type CounterOrderChoice = {
  /** The counterers in engine order (the default the prompt starts from). */
  uids: number[];
  /** Candidate orders, the engine order first. */
  orders: number[][];
};

/**
 * Whether this attack leaves the countering side a real choice of order, and
 * which. null when counters are summed, when fewer than two units counter, or
 * when every order leads to the same board. Call it for a legal attack.
 */
export const counterOrderChoice = (ctx: Ctx, s: GameState, a: AttackAction): CounterOrderChoice | null => {
  if (ctx.cfg.counterResolve !== "chosen" || (a.variant ?? "normal") === "heal") return null;
  const uids = counterersOf(ctx, s, a);
  if (uids.length < 2) return null;
  const orders = counterOrderCandidates(uids);
  let first: string | null = null;
  for (const order of orders) {
    const key = JSON.stringify(applyAction(ctx, s, { ...a, counterOrder: order }).state);
    if (first === null) first = key;
    else if (key !== first) return { uids, orders };
  }
  return null;
};

/** What one order leads to, for the countering side's prompt. */
export type CounterOrderOutcome = {
  order: number[];
  /** The units whose counter landed (the rest were skipped once the attacker was destroyed). */
  landed: number[];
  /** The unit whose counter destroyed the attacker; null when it survives. */
  killer: number | null;
  /** Effect moves that follow (僵尸公主 stepping onto the cell). */
  moves: { uid: number; from: { x: number; y: number }; to: { x: number; y: number } }[];
};

/** Each candidate order played out on a copy. */
export const counterOrderOutcomes = (ctx: Ctx, s: GameState, a: AttackAction, orders: readonly number[][]): CounterOrderOutcome[] =>
  orders.map((order) => {
    const { events } = applyAction(ctx, s, { ...a, counterOrder: order });
    const ev = events.find((e) => e.t === "attack");
    const landed = ev !== undefined && ev.t === "attack" ? (ev.counterUids ?? []).slice() : [];
    const killer = ev !== undefined && ev.t === "attack" && ev.attackerDestroyed && landed.length > 0 ? landed[landed.length - 1] : null;
    const moves = events.flatMap((e) =>
      e.t === "move" && e.source !== "rule" && e.uid !== a.uid ? [{ uid: e.uid, from: { x: e.from.x, y: e.from.y }, to: { x: e.to.x, y: e.to.y } }] : [],
    );
    return { order: order.slice(), landed, killer, moves };
  });
