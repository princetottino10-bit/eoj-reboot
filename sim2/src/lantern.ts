// 灯籠の精 (effect keys tm01 +1 / ad01 +2): when it is destroyed, its OWNER
// chooses one ally on the board to heal (decided by the team 2026-10-03; until
// then the engine took the priciest ally). Spec: EFFECTS-SPEC.md §5.3 裁定1.
//
// Candidates: the owner's other units still standing after the same resolution
// (allies destroyed by it stand at 0 HP until they are removed and are not
// candidates), not hidden by マヨヒガ. A full-HP ally may be chosen (it gains 0).
// No candidate: nothing happens. One candidate: it is healed, nobody is asked.
//
// The engine resolves synchronously, so the answers are collected beforehand:
// a resolution runs inside withLanternPicks(picks), and each 灯籠の精 death
// with two or more candidates (an "ask", in resolution order) takes the next
// pick. Asks beyond the picks given take defaultLanternPick. The flow (flow.ts)
// probes an action for its asks, prompts the owner one ask at a time and then
// resolves the action with every pick; the runner and the AIs do the same
// through their choosers. Pure: no node builtins.
import { cardOf, effectKeyOf } from "./cards.ts";
import { controlWeight, isHidden, unitHp, unitMaxHp } from "./state.ts";
import type { Ctx } from "./state.ts";
import type { GameState, PlayerId, Unit } from "./types.ts";

/** HP each 灯籠の精 effect key gives. */
export const LANTERN_HEAL: Readonly<Record<string, number>> = { tm01: 1, ad01: 2 };

/** The heal this card gives when destroyed, or undefined for any other card / an id not in the pack (effects on). */
export const lanternAmount = (ctx: Ctx, cardId: string): number | undefined =>
  ctx.cfg.effects && ctx.pack.byId.has(cardId) ? LANTERN_HEAL[effectKeyOf(ctx.pack, cardId)] : undefined;

/** One ally the owner may choose, as it stands at the moment of the choice. */
export type LanternOption = {
  uid: number;
  cardId: string;
  /** HP now (the same resolution may already have damaged it). */
  hp: number;
  maxHp: number;
  /** HP it would really gain: capped at its effective max HP (0 when full). */
  gain: number;
};

/** One choice owed: which ally the destroyed 灯籠の精 heals. */
export type LanternAsk = {
  lanternUid: number;
  lanternCardId: string;
  owner: PlayerId;
  amount: number;
  /** Two or more, in board order. */
  options: LanternOption[];
};

/** What healing `u` by `amount` really adds (healUnit never lifts HP above the effective max). */
export const lanternGain = (ctx: Ctx, u: Unit, amount: number): number => Math.max(0, Math.min(amount, u.damage));

/** The allies the destroyed `lantern` may heal, as the board stands now. */
export const lanternOptions = (ctx: Ctx, s: GameState, lantern: Unit, amount: number): LanternOption[] =>
  s.units
    .filter((x) => x.owner === lantern.owner && x.uid !== lantern.uid && !isHidden(x) && unitHp(ctx, x) > 0)
    .map((x) => ({ uid: x.uid, cardId: x.cardId, hp: unitHp(ctx, x), maxHp: unitMaxHp(ctx, x), gain: lanternGain(ctx, x, amount) }));

/** 占拠 the heal adds under controlCount "hp" (a unit reaching the threshold counts twice). */
const weightGain = (ctx: Ctx, s: GameState, o: LanternOption): number => {
  const u = s.units.find((x) => x.uid === o.uid);
  if (u === undefined) return 0;
  const healed = { ...u, damage: u.damage - o.gain };
  return controlWeight(ctx, healed) - controlWeight(ctx, u);
};

/**
 * The pick when nobody answers (the headless engine, an AI's lookahead): the
 * most HP gained, then a unit the heal makes count twice for 占拠, then the
 * most damaged one (lowest HP), then the priciest, then the oldest (lowest uid).
 */
export const defaultLanternPick = (ctx: Ctx, s: GameState, ask: LanternAsk): number => {
  const cost = (o: LanternOption): number => cardOf(ctx.pack, o.cardId).summonCost;
  const ranked = ask.options.slice().sort(
    (a, b) =>
      b.gain - a.gain ||
      weightGain(ctx, s, b) - weightGain(ctx, s, a) ||
      a.hp - b.hp ||
      cost(b) - cost(a) ||
      a.uid - b.uid,
  );
  return ranked[0].uid;
};

/** The options ordered best-first by defaultLanternPick's rule (AIs break their ties in this order). */
export const rankedLanternOptions = (ctx: Ctx, s: GameState, ask: LanternAsk): LanternOption[] => {
  const out: LanternOption[] = [];
  let rest = ask.options.slice();
  while (rest.length > 0) {
    const uid = defaultLanternPick(ctx, s, { ...ask, options: rest });
    out.push(rest.find((o) => o.uid === uid) as LanternOption);
    rest = rest.filter((o) => o.uid !== uid);
  }
  return out;
};

// ---------------------------------------------------------------- session

type Session = { picks: readonly number[]; asks: LanternAsk[] };

let session: Session | null = null;

/**
 * Runs `run` (one resolution) with the owners' answers. Returns what it
 * returned and every ask met on the way (two or more candidates each), in
 * resolution order. Nests: the outer session is restored afterwards.
 */
export const withLanternPicks = <T>(picks: readonly number[], run: () => T): { result: T; asks: LanternAsk[] } => {
  const outer = session;
  const mine: Session = { picks, asks: [] };
  session = mine;
  try {
    return { result: run(), asks: mine.asks };
  } finally {
    session = outer;
  }
};

/** The ally the destroyed `lantern` heals: the only candidate, the session's pick, or the default. null = none. */
export const chooseLanternTarget = (ctx: Ctx, s: GameState, lantern: Unit, amount: number): Unit | null => {
  const options = lanternOptions(ctx, s, lantern, amount);
  if (options.length === 0) return null;
  let uid = options[0].uid;
  if (options.length >= 2) {
    const ask: LanternAsk = { lanternUid: lantern.uid, lanternCardId: lantern.cardId, owner: lantern.owner, amount, options };
    const i = session === null ? -1 : session.asks.length;
    session?.asks.push(ask);
    const pick = i >= 0 ? session?.picks[i] : undefined;
    uid = pick !== undefined && options.some((o) => o.uid === pick) ? pick : defaultLanternPick(ctx, s, ask);
  }
  return s.units.find((x) => x.uid === uid) ?? null;
};
