// Shared helpers for the online tests.
import { packFromCards } from "../src/cards.ts";
import type { CardPack } from "../src/cards.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { submit, submitDiscardWith } from "../src/flow.ts";
import type { Flow } from "../src/flow.ts";
import { makeGreedy } from "../src/ai/greedy.ts";
import { bestCounterOrder } from "../src/ai/counter-order.ts";
import { isLegal } from "../src/rules.ts";
import type { Ai } from "../src/ai/greedy.ts";
import type { AiSeat } from "../src/ai/index.ts";
import { defaultDiscardPolicy, defaultMulliganPolicy } from "../src/turn.ts";
import { defaultTansuPolicy } from "../src/effects.ts";
import type { GameState, PlayerId } from "../src/types.ts";
import { opponent } from "../src/state.ts";

export const SK = loadPack(packPath("shuten-kyuryu"));

/**
 * shuten-kyuryu duplicated under "A_" and "B_" ids (effects keep their
 * original keys). With `splitDeal` each seat gets only its own prefix, so a
 * card id identifies exactly one physical card of one player - which is what
 * makes "this id must not appear in the other seat's JSON" a sharp test.
 */
export const SPLIT_PACK: CardPack = packFromCards("split-shuten", [
  ...SK.cards.map((c) => ({ ...c, id: `A_${c.id}`, effect: c.effect ?? c.id })),
  ...SK.cards.map((c) => ({ ...c, id: `B_${c.id}`, effect: c.effect ?? c.id })),
]);

export const splitDeal = (s: GameState): void => {
  for (const p of [0, 1] as PlayerId[]) {
    const prefix = p === 0 ? "A_" : "B_";
    const all = [...s.players[p].hand, ...s.players[p].deck].map((id) => prefix + id.slice(2));
    // createGame dealt 5 + 39 from the 44-card split pack; keep one copy of each
    const unique = [...new Set(all)];
    s.players[p].hand = unique.slice(0, 5);
    s.players[p].deck = unique.slice(5);
  }
};

/** Both seats greedy: what every online test drives the flow with unless it passes its own seats. */
export const GREEDY_SEATS: [AiSeat, AiSeat] = [makeGreedy(), makeGreedy()];

/** Pending main-phase plans, so a seat plays its planned turn one action at a time. */
const plans = new WeakMap<Flow, { round: number; player: PlayerId; actions: ReturnType<Ai["planTurn"]> }>();

/**
 * Feeds exactly one AI input into the flow. Returns false when nothing is
 * owed. `ais` picks the seats (default greedy); a seat without its own
 * mulligan / 古箪笥 / discard answer gets the engine's default policy, which
 * is what the play UI does for greedy and beam.
 */
export const aiStep = (f: Flow, taken = { n: 0 }, ais: [AiSeat, AiSeat] = GREEDY_SEATS): boolean => {
  const ph = f.phase;
  if (ph.kind === "over") return false;
  if (ph.kind === "mulligan") {
    const seat: PlayerId = ph.submitted[0] ? 1 : 0;
    const choose = ais[seat].mulligan ?? defaultMulliganPolicy;
    const r = submit(f, seat, { type: "mulligan", indices: choose(f.ctx, f.state, seat) });
    if (!r.ok) throw new Error(r.error);
    return true;
  }
  if (ph.kind === "tansu") {
    const choose = ais[ph.player].tansu ?? defaultTansuPolicy;
    const answers = ph.uids.map((uid) => {
      const unit = f.state.units.find((u) => u.uid === uid);
      return { uid, choice: unit === undefined ? ("mana" as const) : choose(f.ctx, f.state, unit) };
    });
    const r = submit(f, ph.player, { type: "tansu", answers });
    if (!r.ok) throw new Error(r.error);
    return true;
  }
  if (ph.kind === "discard") {
    const r = submitDiscardWith(f, ph.player, ais[ph.player].discard ?? defaultDiscardPolicy);
    if (!r.ok) throw new Error(r.error);
    return true;
  }
  if (ph.kind === "counterOrder") {
    const order = (ais[ph.player].counterOrder ?? bestCounterOrder)(f.ctx, f.state, ph.action) ?? ph.uids;
    const r = submit(f, ph.player, { type: "counterOrder", order });
    if (!r.ok) throw new Error(r.error);
    // the attacker's plan assumed the default order: it plans again on the board as it is now
    plans.delete(f);
    return true;
  }
  // main
  let plan = plans.get(f);
  if (plan === undefined || plan.round !== f.state.round || plan.player !== ph.player) {
    plan = { round: f.state.round, player: ph.player, actions: ais[ph.player].planTurn(f.ctx, f.state) };
    plans.set(f, plan);
    taken.n = 0;
  }
  let next = plan.actions.shift();
  // a planned action that is no longer legal (the board moved away from the plan): plan again from here
  if (next !== undefined && next.kind !== "pass" && !isLegal(f.ctx, f.state, next)) {
    plan = { round: f.state.round, player: ph.player, actions: ais[ph.player].planTurn(f.ctx, f.state) };
    plans.set(f, plan);
    next = plan.actions.shift();
  }
  const stop = next === undefined || next.kind === "pass" || taken.n >= f.ctx.cfg.maxActionsPerTurn;
  const action = stop || next === undefined ? { kind: "pass" as const } : next;
  const r = submit(f, ph.player, { type: "action", action });
  if (!r.ok) {
    const p = submit(f, ph.player, { type: "action", action: { kind: "pass" } });
    if (!p.ok) throw new Error(p.error);
  } else if (!stop) {
    taken.n += 1;
  }
  if (stop || !r.ok) plans.delete(f);
  return true;
};

export const playOut = (f: Flow, maxInputs = 5000, each?: () => void, ais: [AiSeat, AiSeat] = GREEDY_SEATS): void => {
  const taken = { n: 0 };
  for (let i = 0; i < maxInputs; i++) {
    if (!aiStep(f, taken, ais)) return;
    if (each !== undefined) each();
  }
  throw new Error("playOut: game did not finish");
};

export { opponent };
