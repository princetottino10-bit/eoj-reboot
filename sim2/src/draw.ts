// Drawing a card and the deck-out end, shared by the turn flow (turn.ts) and
// main-phase draws (古箪笥 tm07b's attack, src/tansu-attack.ts). Split out of
// turn.ts so rules.ts can draw without importing turn.ts (which imports it).
// Pure: no node builtins.
import { recheckControl } from "./combat.ts";
import { shuffle } from "./rng.ts";
import { controlCount, opponent } from "./state.ts";
import type { Ctx } from "./state.ts";
import type { GameEvent, GameState, PlayerId } from "./types.ts";

/**
 * EXP-0913 deckOutMode "second": the game stops the moment either player has
 * reshuffled their grave twice. The larger 占拠 (controlCount, so weighted
 * under controlCount hp / cost) wins; a tie is a draw. Both outcomes report
 * winType "deck_out".
 */
export const checkDeckOut = (ctx: Ctx, s: GameState, events: GameEvent[]): boolean => {
  if (s.ended) return true;
  if (ctx.cfg.deckOutMode !== "second") return false;
  if (s.players[0].reshuffleCount < 2 && s.players[1].reshuffleCount < 2) return false;
  const o0 = controlCount(ctx, s, 0);
  const o1 = controlCount(ctx, s, 1);
  const winner: PlayerId | null = o0 === o1 ? null : o0 > o1 ? 0 : 1;
  // the turn player's draws are the ones that run a deck out; else whoever reached 2
  const by: PlayerId = s.players[s.turnPlayer].reshuffleCount >= 2 ? s.turnPlayer : opponent(s.turnPlayer);
  s.ended = true;
  s.winner = winner;
  s.winType = "deck_out";
  events.push({ t: "gameEnd", winner, winType: "deck_out", round: s.round, occ: [o0, o1], by });
  return true;
};

/** Draws one card, reshuffling the grave if the deck has run out. */
export const drawOne = (
  ctx: Ctx,
  s: GameState,
  p: PlayerId,
  events?: GameEvent[],
): boolean => {
  const ps = s.players[p];
  if (ps.deck.length === 0) {
    if (ps.grave.length === 0) return false;
    const [shuffled, rng] = shuffle(ps.grave, s.rngState);
    s.rngState = rng;
    ps.deck = shuffled;
    ps.grave = [];
    ps.reshuffleCount += 1;
    events?.push({ t: "reshuffle", player: p, count: ps.reshuffleCount });
    if (s.players[0].reshuffleCount + s.players[1].reshuffleCount === 1) enterLatePhase(ctx, s, p, events ?? []);
  }
  const card = ps.deck.shift();
  if (card === undefined) return false;
  ps.hand.push(card);
  return true;
};

/**
 * The first reshuffle of the game (either player's) starts the late phase:
 * with controlWinLate set, control now needs that many, which is logged once
 * and checked at once against both players' standing control states.
 */
const enterLatePhase = (ctx: Ctx, s: GameState, p: PlayerId, events: GameEvent[]): void => {
  if (ctx.cfg.controlWinLate <= 0) return;
  events.push({ t: "effect", player: p, source: "rule", uid: null, text: `終盤: 制圧は${ctx.cfg.controlWinLate}マスで成立` });
  recheckControl(ctx, s, events);
};
