// "strong" AI: the opponent for the browser AI table. A new kind next to
// greedy / beam, which stay untouched (past simulation results rest on them).
//
// Per turn: a deduplicated beam over the turn's action sequences (facings of
// a summon pruned by a cheap heuristic, a few slots reserved for rotates /
// reigu / inherits so two-step combos survive), leaves scored two-ply (own
// turn end projected, then the opponent's best single reply), and when the
// opponent holds the control state a targeted search for any sequence of up
// to three actions that breaks it. Also owns the seat's discard, mulligan
// and 古箪笥 choices, which the engine otherwise fixes by policy.
//
// Deterministic: no randomness anywhere; ties go to the shorter plan, then to
// generation order. A `seed` only perturbs exact ties.
import { cardOf } from "../cards.ts";
import { reiguImplemented } from "../effects.ts";
import type { TansuChooser } from "../effects.ts";
import { nextFloat, seedRng } from "../rng.ts";
import { baseSummonCost, incomeNow, underdogSummonDiscount } from "../rules.ts";
import { opponent, unitHp } from "../state.ts";
import type { Ctx } from "../state.ts";
import type { DiscardChooser, MulliganChooser } from "../turn.ts";
import type { Action, GameState, PlayerId } from "../types.ts";
import type { Ai } from "./greedy.ts";
import { STRONG_WEIGHTS, STRONG_WIN, hasControl } from "./strong-eval.ts";
import type { StrongWeights } from "./strong-eval.ts";
import {
  DEFAULT_SEARCH,
  applySequence,
  controlBroken,
  deepEval,
  findControlBreaks,
  finishTurn,
  makeBudget,
  searchTurn,
} from "./strong-search.ts";
import type { SearchOptions } from "./strong-search.ts";

export type StrongOptions = SearchOptions & {
  weights: StrongWeights;
  /** 0 = plain deterministic order; otherwise perturbs exact score ties. */
  seed: number;
};

export const DEFAULT_STRONG: StrongOptions = { ...DEFAULT_SEARCH, weights: STRONG_WEIGHTS, seed: 0 };

/** An AI seat: the turn planner plus the choices the engine asks a seat for. */
export type StrongAi = Ai & {
  discard: DiscardChooser;
  mulligan: MulliganChooser;
  tansu: TansuChooser;
};

/** Break candidates that get a full continuation search (the rest are ranked two-ply only). */
const BREAK_CONTINUATIONS = 2;

// ------------------------------------------------------------ discard

/** Shikigami cost >= this are worth waiting a turn or two for. */
const BIG_CARD = 5;
const MAX_WAITING = 2;
const MAX_REIGU_KEPT = 2;
/** Reigu kept in preference order when the hand holds several. */
const REIGU_PRIORITY = ["ad22", "tm19", "ad21", "sk22", "tm22", "sk18", "tm18", "tm21", "sk20", "tm20"];

/**
 * End-of-turn hand cleanup. Unlike the engine's default policy it keeps a
 * big shikigami that the next income tick (or two) makes affordable, pitches
 * duplicates and dead cards first, and drops reigu that have nothing to do.
 */
export const strongDiscard: DiscardChooser = (ctx, s, p) => {
  const ps = s.players[p];
  const cap = ctx.cfg.manaCap;
  const income = incomeNow(ctx, s, p);
  const projected = ctx.cfg.incomeTiming === "turn_end" ? ps.mana : Math.min(cap, ps.mana + income);
  const boardHasUnits = s.units.length > 0;
  const damagedOwn = s.units.some((u) => u.owner === p && u.damage > 0);
  const drop = new Set<number>();
  const seenId = new Set<string>();
  const waiting: { i: number; cost: number }[] = [];
  const reigu: { i: number; rank: number }[] = [];
  for (let i = 0; i < ps.hand.length; i++) {
    const id = ps.hand[i];
    const card = cardOf(ctx.pack, id);
    if (card.kind !== "shikigami") {
      const dead = !ctx.cfg.effects || !reiguImplemented(ctx, id);
      const fx = card.effect ?? id;
      const healer = fx === "sk20" || fx === "tm20" || fx === "tm21";
      const useless = !boardHasUnits || (healer && !damagedOwn && fx !== "tm21");
      if (dead || useless || card.summonCost > projected || seenId.has(id)) drop.add(i);
      else {
        const rank = REIGU_PRIORITY.indexOf(fx);
        reigu.push({ i, rank: rank < 0 ? REIGU_PRIORITY.length : rank });
      }
      seenId.add(id);
      continue;
    }
    const off = underdogSummonDiscount(ctx, s, p, card); // 劣勢時の大型割引 as it stands now
    const cost = off === 0 ? baseSummonCost(ctx, card) : Math.max(1, baseSummonCost(ctx, card) - off);
    if (cost <= projected) {
      if (seenId.has(id) && cost * 2 > projected) drop.add(i); // a second copy that cannot both be played
      seenId.add(id);
      continue;
    }
    seenId.add(id);
    // unaffordable now: wait only for one that the next tick or two brings in reach
    if (cost <= Math.min(cap, projected + 2 * income)) waiting.push({ i, cost });
    else drop.add(i);
  }
  waiting.sort((a, b) => a.cost - b.cost || a.i - b.i);
  const keptWaiting = new Set<string>();
  let kept = 0;
  for (const wct of waiting) {
    const id = ps.hand[wct.i];
    const soon = wct.cost <= Math.min(cap, projected + income);
    const big = cardOf(ctx.pack, id).summonCost >= BIG_CARD;
    if (kept < MAX_WAITING && !keptWaiting.has(id) && (soon || (big && kept === 0))) {
      kept += 1;
      keptWaiting.add(id);
    } else drop.add(wct.i);
  }
  reigu.sort((a, b) => a.rank - b.rank || a.i - b.i);
  for (const r of reigu.slice(MAX_REIGU_KEPT)) drop.add(r.i);
  return [...drop].sort((a, b) => a - b);
};

// ------------------------------------------------------------ mulligan

/**
 * Before turn 1 nothing is on the board, so every reigu is dead weight and a
 * shikigami costing 5+ is two or three turns away: send both back for a
 * chance at cheap units (the first turns are a race for cells).
 */
export const strongMulligan: MulliganChooser = (ctx, s, p) => {
  const out: number[] = [];
  s.players[p].hand.forEach((id, i) => {
    const c = cardOf(ctx.pack, id);
    if (c.kind !== "shikigami" || c.summonCost >= BIG_CARD) out.push(i);
  });
  return out;
};

// ------------------------------------------------------------ 古箪笥

/** Pay 1 HP for 1 mana while the unit keeps 2+ HP afterwards; at 2 HP the mana is not worth a one-hit unit. */
export const strongTansu: TansuChooser = (ctx, _s, unit) => (unitHp(ctx, unit) >= 3 ? "mana" : "skip");

// ------------------------------------------------------------ planning

const tieJitter = (seed: number, s: GameState, i: number): number => {
  if (seed === 0) return 0;
  const [f] = nextFloat(seedRng((seed * 1000003 + i * 7919 + (s.rngState >>> 3)) >>> 0));
  return f * 1e-3;
};

const planWithBreak = (
  ctx: Ctx,
  s: GameState,
  p: PlayerId,
  o: StrongOptions,
  budget: ReturnType<typeof makeBudget>,
): Action[] | null => {
  const breaks = findControlBreaks(ctx, s, p, budget);
  if (breaks.length === 0) return null;
  const ranked = breaks
    .map((seq, i) => {
      const st = applySequence(ctx, s, seq);
      return { seq, st, score: deepEval(ctx, st, p, o.weights, budget) + tieJitter(o.seed, s, i) };
    })
    .sort((a, b) => b.score - a.score || a.seq.length - b.seq.length);
  let best: Action[] = ranked[0].seq;
  let bestScore = -Infinity;
  for (const r of ranked.slice(0, BREAK_CONTINUATIONS)) {
    if (r.st.ended) return r.seq;
    const cont = searchTurn(ctx, r.st, p, o.weights, o, budget);
    const total = cont.actions.length === 0 ? r.score : cont.score;
    if (total > bestScore) {
      bestScore = total;
      best = [...r.seq, ...cont.actions];
    }
  }
  return best;
};

export const makeStrong = (opts: Partial<StrongOptions> = {}): StrongAi => {
  const o: StrongOptions = { ...DEFAULT_STRONG, ...opts };
  return {
    name: "strong",
    planTurn: (ctx, s) => {
      const p = s.turnPlayer;
      if (s.ended) return [{ kind: "pass" }];
      const budget = makeBudget(o);
      const main = searchTurn(ctx, s, p, o.weights, o, budget);
      let plan = main.actions;
      let leaf = main.leaf;
      let score = main.score;
      if (!main.wins && hasControl(ctx, s, opponent(p)) && !controlBroken(ctx, main.leaf, p)) {
        const withBreak = planWithBreak(ctx, s, p, o, budget);
        if (withBreak !== null) {
          plan = withBreak;
          leaf = applySequence(ctx, s, plan);
          score = deepEval(ctx, leaf, p, o.weights, budget);
        }
      }
      // the beam prunes on the static score, so sweep up any kill it left behind
      if (!main.wins && plan.length < ctx.cfg.maxActionsPerTurn) {
        plan = [...plan, ...finishTurn(ctx, leaf, p, o.weights, budget, score)];
      }
      const capped = plan.slice(0, ctx.cfg.maxActionsPerTurn);
      return [...capped, { kind: "pass" }];
    },
    discard: strongDiscard,
    mulligan: strongMulligan,
    tansu: strongTansu,
  };
};

export { STRONG_WIN };
