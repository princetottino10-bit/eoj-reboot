// The 灯籠の精 choices an action leaves its owners (src/lantern.ts has the
// rule): found by resolving the action on a copy with the picks made so far.
// Shared by the flow (it prompts the owner), the runner and the AIs (their
// choosers answer). Pure: no node builtins.
import { cardOf, effectKeyOf } from "./cards.ts";
import { LANTERN_HEAL, withLanternPicks } from "./lantern.ts";
import type { LanternAsk } from "./lantern.ts";
import { applyAction } from "./rules.ts";
import type { Ctx } from "./state.ts";
import type { Action, GameState } from "./types.ts";

/** Can this action destroy a 灯籠の精 at all? A cheap filter before the probe. */
export const lanternMayAsk = (ctx: Ctx, s: GameState, a: Action): boolean =>
  ctx.cfg.effects &&
  (a.kind === "attack" || a.kind === "reigu") &&
  s.units.some((u) => LANTERN_HEAL[effectKeyOf(ctx.pack, u.cardId)] !== undefined);

/** Every ask the action meets with these picks (the ones past the picks resolved by the default). */
export const lanternAsks = (ctx: Ctx, s: GameState, a: Action, picks: readonly number[]): LanternAsk[] =>
  lanternMayAsk(ctx, s, a) ? withLanternPicks(picks, () => applyAction(ctx, s, a)).asks : [];

/** The next choice owed after `picks`, or null when every one is answered. */
export const nextLanternAsk = (ctx: Ctx, s: GameState, a: Action, picks: readonly number[]): LanternAsk | null =>
  lanternAsks(ctx, s, a, picks)[picks.length] ?? null;

/** Answers one ask (an AI seat): the action, the picks before it and the ask; returns an option's uid. */
export type LanternChooser = (ctx: Ctx, s: GameState, a: Action, picks: readonly number[], ask: LanternAsk) => number;

/** Every pick for the action, one ask at a time, each from the owner's chooser. [] when nothing is asked. */
export const resolveLanternPicks = (
  ctx: Ctx,
  s: GameState,
  a: Action,
  chooserFor: (ask: LanternAsk) => LanternChooser,
): number[] => {
  const picks: number[] = [];
  // a resolution destroys at most the units on the board: the loop always ends
  for (let guard = 0; guard <= s.units.length; guard++) {
    const ask = nextLanternAsk(ctx, s, a, picks);
    if (ask === null) return picks;
    const uid = chooserFor(ask)(ctx, s, a, picks, ask);
    picks.push(ask.options.some((o) => o.uid === uid) ? uid : ask.options[0].uid);
  }
  return picks;
};

/** 「灯籠の精」: the destroyed lantern's name, for prompts. */
export const lanternName = (ctx: Ctx, ask: LanternAsk): string => cardOf(ctx.pack, ask.lanternCardId).nameJa;
