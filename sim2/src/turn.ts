import { cardOf } from "./cards.ts";
import { checkControlAtStart } from "./combat.ts";
import { shuffle } from "./rng.ts";
import { incomeFor } from "./rules.ts";
import { occupied, opponent } from "./state.ts";
import {
  clearExpiredHidden,
  clearTurnBuffs,
  defaultTansuPolicy,
  onTurnStart,
  tansuCandidates,
} from "./effects.ts";
import type { TansuChooser } from "./effects.ts";
import type { Ctx } from "./state.ts";
import type { GameEvent, GameState, PlayerId } from "./types.ts";

/** Turn-limit guard. Call before startTurn. */
export const checkRoundLimit = (ctx: Ctx, s: GameState, events: GameEvent[]): boolean => {
  if (s.ended) return true;
  if (s.round <= ctx.cfg.roundLimit) return false;
  s.ended = true;
  s.winner = null;
  s.winType = "turn_limit";
  events.push({ t: "gameEnd", winner: null, winType: "turn_limit", round: s.round });
  return true;
};

/**
 * DESIGN 3.5 startTurn: control-reach win check, then income.
 * A player gets no income on their very first turn - the configured starting
 * mana (3 / 4) already is that turn's budget.
 */
/**
 * tm07 decisions owed at this turn start. Empty when a control win preempts
 * the turn, so the UI never prompts for a turn that is already over.
 */
export const pendingTansuChoices = (ctx: Ctx, s: GameState): number[] => {
  if (s.ended) return [];
  const p = s.turnPlayer;
  if (s.players[p].reach && occupied(s, p) >= ctx.cfg.controlWin) return [];
  return tansuCandidates(ctx, s, p);
};

export const startTurn = (
  ctx: Ctx,
  s: GameState,
  events: GameEvent[],
  chooseTansu: TansuChooser = defaultTansuPolicy,
): void => {
  if (s.ended) return;
  const p = s.turnPlayer;
  for (const u of s.units) {
    if (u.owner === p) {
      u.attackedThisTurn = false;
      u.rotatedThisTurn = false;
      u.summonedThisTurn = false;
    }
  }
  // Mayohiga expires at the start of the turn of whoever cast it, before the
  // control check, since it changes the occupied count.
  clearExpiredHidden(s, p, events);
  if (checkControlAtStart(ctx, s, events)) return;

  const ps = s.players[p];
  // rulebook 7: effects resolve before income
  onTurnStart(ctx, s, p, events, chooseTansu, (who) => drawOne(ctx, s, who));
  let income = 0;
  if (ps.firstTurnDone) {
    income = incomeFor(ctx, ps.chips);
    ps.mana = Math.min(ctx.cfg.manaCap, ps.mana + income);
  } else {
    ps.firstTurnDone = true;
  }
  events.push({ t: "turnStart", player: p, round: s.round, income });
};

/** Draws one card, reshuffling the grave if the deck has run out. */
export const drawOne = (ctx: Ctx, s: GameState, p: PlayerId): boolean => {
  const ps = s.players[p];
  if (ps.deck.length === 0) {
    if (ps.grave.length === 0) return false;
    const [shuffled, rng] = shuffle(ps.grave, s.rngState);
    s.rngState = rng;
    ps.deck = shuffled;
    ps.grave = [];
  }
  const card = ps.deck.shift();
  if (card === undefined) return false;
  ps.hand.push(card);
  return true;
};

const drawTo = (ctx: Ctx, s: GameState, p: PlayerId): number => {
  const ps = s.players[p];
  let drawn = 0;
  while (ps.hand.length < ctx.cfg.handRefill) {
    if (!drawOne(ctx, s, p)) break;
    drawn += 1;
  }
  return drawn;
};

/**
 * Hand cleanup policy (not AI-controlled): discard cards that stay
 * unaffordable even after the next income tick, then refill to handRefill.
 */
/**
 * Chooses which hand indices to pitch at end of turn. Returning [] keeps the
 * whole hand. The UI passes a human's selection; the AI runner uses the
 * default policy below.
 */
export type DiscardChooser = (ctx: Ctx, s: GameState, p: PlayerId) => number[];

/** Default policy: pitch reigu and anything still unaffordable next turn. */
export const defaultDiscardPolicy: DiscardChooser = (ctx, s, p) => {
  const ps = s.players[p];
  const projected = Math.min(ctx.cfg.manaCap, ps.mana + incomeFor(ctx, ps.chips));
  const out: number[] = [];
  for (let i = 0; i < ps.hand.length; i++) {
    const card = cardOf(ctx.pack, ps.hand[i]);
    // With effects off a reigu is a dead card and always goes first. With
    // effects on it is a real action, so it is judged on affordability only.
    const dead = card.kind !== "shikigami" && !ctx.cfg.effects;
    if (dead || card.summonCost > projected) out.push(i);
  }
  return out;
};

const applyDiscards = (s: GameState, p: PlayerId, indices: number[]): string[] => {
  const ps = s.players[p];
  const drop = new Set(indices.filter((i) => i >= 0 && i < ps.hand.length));
  const kept: string[] = [];
  const discarded: string[] = [];
  for (let i = 0; i < ps.hand.length; i++) {
    if (drop.has(i)) discarded.push(ps.hand[i]);
    else kept.push(ps.hand[i]);
  }
  ps.hand = kept;
  return discarded;
};

/** DESIGN 3.5 endTurn: chips -> reach -> hand cleanup -> pass the turn. */
export const endTurn = (
  ctx: Ctx,
  s: GameState,
  events: GameEvent[],
  chooseDiscards: DiscardChooser = defaultDiscardPolicy,
): void => {
  if (s.ended) return;
  const p = s.turnPlayer;
  const ps = s.players[p];
  const occ = occupied(s, p);

  let chipGained = 0;
  if (ctx.cfg.chipMode === "one_per_turn") {
    if (occ > ps.chips) chipGained = 1;
  } else {
    chipGained = Math.max(0, occ - ps.chips);
  }
  ps.chips += chipGained;

  ps.reach = occ >= ctx.cfg.controlWin;

  // discard -> draw. Discards only reach the grave after the draw, so a card
  // pitched this turn cannot be handed straight back by a reshuffle.
  const discarded = applyDiscards(s, p, chooseDiscards(ctx, s, p));
  const drawn = drawTo(ctx, s, p);
  for (const id of discarded) ps.grave.push(id);

  events.push({
    t: "turnEnd",
    player: p,
    round: s.round,
    occupied: occ,
    chips: ps.chips,
    chipGained,
    reach: ps.reach,
    discarded: discarded.length,
    drawn,
  });

  clearTurnBuffs(s); // tm16 ATK+1 lasts only the turn it was granted

  if (p === 1) s.round += 1;
  s.turnPlayer = opponent(p);
};
