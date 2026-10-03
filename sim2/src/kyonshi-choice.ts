// The 僵尸公主 facing choices an action leaves its owners (src/kyonshi.ts has
// the rule): found by resolving the action on a copy with the 灯籠の精 picks and
// the turns chosen so far. Shared by the flow (it prompts the owner), the
// runner and the AIs (their choosers answer). Pure: no node builtins.
//
// Within one action every 灯籠の精 choice comes before any 僵尸公主 one: the
// move is the last thing that can happen to the board in an attack (an
// attack-kill move follows the destructions, and only the destroyed target
// could have countered; a counter-kill move comes after all counters), so the
// flow asks the lanterns first and the turns after them.
import { cardOf } from "./cards.ts";
import { withKyonshiTurns, turnsOnMove } from "./kyonshi.ts";
import type { KyonshiAsk, KyonshiTurn } from "./kyonshi.ts";
import { withLanternPicks } from "./lantern.ts";
import { applyAction, applyActionInPlace } from "./rules.ts";
import type { Ctx } from "./state.ts";
import type { Action, ApplyResult, GameEvent, GameState } from "./types.ts";

/** Can this action move a turning 僵尸公主 at all? A cheap filter before the probe. */
export const kyonshiMayAsk = (ctx: Ctx, s: GameState, a: Action): boolean =>
  ctx.cfg.effects && a.kind === "attack" && s.units.some((u) => turnsOnMove(ctx, u.cardId));

/** The action on a copy with every answer given (the ones not given take their defaults). */
export const applyWithChoices = (
  ctx: Ctx,
  s: GameState,
  a: Action,
  picks: readonly number[],
  turns: readonly KyonshiTurn[],
): { result: ApplyResult; asks: KyonshiAsk[] } =>
  withLanternPicks(picks, () => withKyonshiTurns(turns, () => applyAction(ctx, s, a))).result;

/** The same, in place on `s` (the flow and the runner). */
export const applyInPlaceWithChoices = (
  ctx: Ctx,
  s: GameState,
  a: Action,
  picks: readonly number[],
  turns: readonly KyonshiTurn[],
  events: GameEvent[],
): void => {
  withLanternPicks(picks, () => withKyonshiTurns(turns, () => applyActionInPlace(ctx, s, a, events)));
};

/** Every facing ask the action meets with these answers. */
export const kyonshiAsks = (
  ctx: Ctx,
  s: GameState,
  a: Action,
  picks: readonly number[],
  turns: readonly KyonshiTurn[],
): KyonshiAsk[] => (kyonshiMayAsk(ctx, s, a) ? applyWithChoices(ctx, s, a, picks, turns).asks : []);

/** The next facing choice owed after `turns`, or null when every one is answered. */
export const nextKyonshiAsk = (
  ctx: Ctx,
  s: GameState,
  a: Action,
  picks: readonly number[],
  turns: readonly KyonshiTurn[],
): KyonshiAsk | null => kyonshiAsks(ctx, s, a, picks, turns)[turns.length] ?? null;

/** Answers one ask (an AI seat): the action, the lantern picks, the turns before it and the ask. */
export type KyonshiChooser = (
  ctx: Ctx,
  s: GameState,
  a: Action,
  picks: readonly number[],
  turns: readonly KyonshiTurn[],
  ask: KyonshiAsk,
) => KyonshiTurn;

/** Every turn for the action, one ask at a time, each from the owner's chooser. [] when nothing is asked. */
export const resolveKyonshiTurns = (
  ctx: Ctx,
  s: GameState,
  a: Action,
  picks: readonly number[],
  chooserFor: (ask: KyonshiAsk) => KyonshiChooser,
): KyonshiTurn[] => {
  const turns: KyonshiTurn[] = [];
  // one move per unit at most: the loop always ends
  for (let guard = 0; guard <= s.units.length; guard++) {
    const ask = nextKyonshiAsk(ctx, s, a, picks, turns);
    if (ask === null) return turns;
    const t = chooserFor(ask)(ctx, s, a, picks, turns, ask);
    turns.push(t === 1 || t === -1 ? t : 0);
  }
  return turns;
};

/** 「僵尸公主」: the moving card's name, for prompts. */
export const kyonshiName = (ctx: Ctx, ask: KyonshiAsk): string => cardOf(ctx.pack, ask.cardId).nameJa;
