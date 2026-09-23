import { cardOf } from "./cards.ts";
import { checkControlAtStart, controlEvent, recheckControl } from "./combat.ts";
import { shuffle } from "./rng.ts";
import { baseSummonCost, incomeNow, incomeParts, nextChips, underdogSummonDiscount } from "./rules.ts";
import { boardHpTotal, controlCount, controlNeed, opponent, underdogNote } from "./state.ts";
import {
  clearExpiredHidden,
  clearTurnBuffs,
  defaultTansuPolicy,
  onTurnStart,
  reiguImplemented,
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
  s.ended = true;
  s.winner = winner;
  s.winType = "deck_out";
  events.push({ t: "gameEnd", winner, winType: "deck_out", round: s.round });
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
  if (
    ctx.cfg.controlHold === "next_turn_start" &&
    s.players[p].reach &&
    controlCount(ctx, s, p) >= controlNeed(ctx, s)
  ) {
    return [];
  }
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
  s.summonsThisTurn = 0;
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
  onTurnStart(ctx, s, p, events, chooseTansu, (who) => drawOne(ctx, s, who, events));
  let income = 0;
  let underdog = 0;
  // EXP-0913 incomeTiming "turn_end" moves this tick to endTurn.
  if (ctx.cfg.incomeTiming === "turn_start") {
    if (ps.firstTurnDone) {
      // incomeMode "current": the steps follow the 占拠 as it stands now, after
      // the opponent's turn and this turn's start effects
      if (ctx.cfg.incomeMode === "current") ps.chips = controlCount(ctx, s, p);
      const parts = incomeParts(ctx, s, p);
      income = parts.total;
      underdog = parts.underdog;
      ps.mana = Math.min(ctx.cfg.manaCap, ps.mana + income);
    } else {
      ps.firstTurnDone = true;
    }
  } else {
    ps.firstTurnDone = true;
  }
  events.push({ t: "turnStart", player: p, round: s.round, income, ...(underdog > 0 ? { underdog } : {}) });
  if (underdog > 0) events.push(underdogEvent(ctx, s, p, underdog));
  checkDeckOut(ctx, s, events); // start-of-turn draws can trigger a reshuffle
};

const seatWord = (p: PlayerId): string => (p === 0 ? "先手" : "後手");

/** The log line of a 劣勢ボーナス (a rule line: source "rule", no unit). */
const underdogEvent = (ctx: Ctx, s: GameState, p: PlayerId, amount: number): GameEvent => ({
  t: "effect",
  player: p,
  source: "rule",
  uid: null,
  text: `${seatWord(p)}: 劣勢ボーナス +${amount}(${underdogNote(ctx, s, p)})`,
});

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

const drawTo = (ctx: Ctx, s: GameState, p: PlayerId, events: GameEvent[]): number => {
  const ps = s.players[p];
  let drawn = 0;
  while (ps.hand.length < ctx.cfg.handRefill) {
    if (!drawOne(ctx, s, p, events)) break;
    drawn += 1;
  }
  return drawn;
};

/** EXP-0913B handMode "replace_discarded": draw exactly `n` (deck permitting). */
const drawN = (ctx: Ctx, s: GameState, p: PlayerId, n: number, events: GameEvent[]): number => {
  let drawn = 0;
  while (drawn < n) {
    if (!drawOne(ctx, s, p, events)) break;
    drawn += 1;
  }
  return drawn;
};

// ------------------------------------------------------ mulligan (EXP-0913B 1.4)

/** Chooses hand indices to send back. The AI rule is fixed by the spec. */
export type MulliganChooser = (ctx: Ctx, s: GameState, p: PlayerId) => number[];

/** EXP-0913B 1.4 AI rule: return shikigami with printed summonCost >= 5;
 *  keep reigu and shikigami costing 4 or less. */
export const MULLIGAN_RETURN_FROM = 5;
export const defaultMulliganPolicy: MulliganChooser = (ctx, s, p) => {
  const out: number[] = [];
  s.players[p].hand.forEach((id, i) => {
    const c = cardOf(ctx.pack, id);
    if (c.kind === "shikigami" && c.summonCost >= MULLIGAN_RETURN_FROM) out.push(i);
  });
  return out;
};

/**
 * Once each, before the first player's first turn (player 0 then player 1):
 * returned cards go back into the deck, the deck is shuffled with the game
 * rng, then as many cards are drawn. A no-op unless cfg.mulligan.
 */
export const performMulligan = (
  ctx: Ctx,
  s: GameState,
  events: GameEvent[],
  choose: MulliganChooser = defaultMulliganPolicy,
): void => {
  if (!ctx.cfg.mulligan) return;
  for (const p of [0, 1] as PlayerId[]) {
    const ps = s.players[p];
    const back = new Set(choose(ctx, s, p).filter((i) => i >= 0 && i < ps.hand.length));
    const returned = ps.hand.filter((_, i) => back.has(i));
    ps.hand = ps.hand.filter((_, i) => !back.has(i));
    if (returned.length > 0) {
      const [shuffled, rng] = shuffle([...ps.deck, ...returned], s.rngState);
      s.rngState = rng;
      ps.deck = shuffled;
      drawN(ctx, s, p, returned.length, events);
    }
    events.push({ t: "mulligan", player: p, returned: returned.length });
  }
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
  // Under turn_end income the tick has already been applied at this point.
  const projected =
    ctx.cfg.incomeTiming === "turn_end"
      ? ps.mana
      : Math.min(ctx.cfg.manaCap, ps.mana + incomeNow(ctx, s, p));
  const out: number[] = [];
  for (let i = 0; i < ps.hand.length; i++) {
    const card = cardOf(ctx.pack, ps.hand[i]);
    // With effects off a reigu is a dead card and always goes first, and so is
    // a reigu without an implemented effect (kyubi-ryu). Otherwise it is a
    // real action, so it is judged on affordability only.
    const dead = card.kind !== "shikigami" && (!ctx.cfg.effects || !reiguImplemented(ctx, card.id));
    // reigu pay their printed cost; summonCostScale only touches shikigami
    // (less 劣勢時の大型割引 as it stands now; 0 unless underdogDiscount is set)
    const off = underdogSummonDiscount(ctx, s, p, card);
    const base = card.kind === "shikigami" ? baseSummonCost(ctx, card) : card.summonCost;
    const cost = off === 0 ? base : Math.max(1, base - off);
    if (dead || cost > projected) out.push(i);
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

const controlWinNow = (ctx: Ctx, s: GameState, p: PlayerId, events: GameEvent[]): void => {
  events.push(controlEvent(ctx, p, "win", controlNeed(ctx, s)));
  s.ended = true;
  s.winner = p;
  s.winType = "control";
  events.push({ t: "gameEnd", winner: p, winType: "control", round: s.round });
};

/**
 * controlWinMode "hold". next_turn_start (R2): re-declare reach from this turn
 * end; the win is checked at the next turn start. next_turn_end (EXP-0913B
 * 1.5): a player who carried the control state through to this turn end wins
 * now; otherwise controlWin 占拠 grants it (it is dropped on any action that
 * breaks it). true = the game ended.
 */
const endTurnControl = (ctx: Ctx, s: GameState, p: PlayerId, occ: number, events: GameEvent[]): boolean => {
  const ps = s.players[p];
  const need = controlNeed(ctx, s);
  if (ctx.cfg.controlHold === "next_turn_end" && ps.reach && occ >= need) {
    controlWinNow(ctx, s, p, events);
    return true;
  }
  ps.reach = occ >= need;
  if (ps.reach) events.push(controlEvent(ctx, p, "gain", need));
  return false;
};

/**
 * controlWinMode "points": there is no control state. A turn end on
 * controlWin 占拠 earns a 制圧点 (they never go down), and controlPointsToWin
 * of them win at once. true = the game ended.
 */
const endTurnPoints = (ctx: Ctx, s: GameState, p: PlayerId, occ: number, events: GameEvent[]): boolean => {
  const ps = s.players[p];
  ps.reach = false;
  if (occ < controlNeed(ctx, s)) return false;
  ps.controlPoints += 1;
  events.push({
    t: "effect",
    player: p,
    source: "rule",
    uid: null,
    text: `${seatWord(p)}: 制圧点 +1(計${ps.controlPoints}/${ctx.cfg.controlPointsToWin}点・占拠${occ})`,
  });
  if (ps.controlPoints < ctx.cfg.controlPointsToWin) return false;
  controlWinNow(ctx, s, p, events);
  return true;
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
  // 占拠 under controlCount: chips, control and the log all read this one count
  const occ = controlCount(ctx, s, p);
  // Captured before chips/income so it means the same thing under either
  // incomeTiming: what the main phase failed to spend.
  const manaLeft = ps.mana;

  // negative only under incomeMode "current" (the chips follow the count down)
  const chipGained = nextChips(ctx, ps.chips, occ) - ps.chips;
  ps.chips += chipGained;

  // コールド勝ち: before either control mode
  if (ctx.cfg.instantWinCells > 0 && occ >= ctx.cfg.instantWinCells) {
    events.push({ t: "effect", player: p, source: "rule", uid: null, text: `${seatWord(p)}: コールド勝ち(占拠${occ})` });
    controlWinNow(ctx, s, p, events);
    return;
  }
  if (ctx.cfg.controlWinMode === "points") {
    if (endTurnPoints(ctx, s, p, occ, events)) return;
  } else if (endTurnControl(ctx, s, p, occ, events)) {
    return;
  }

  // EXP-0913 incomeTiming "turn_end": control check -> income -> hand cleanup.
  if (ctx.cfg.incomeTiming === "turn_end") {
    const parts = incomeParts(ctx, s, p);
    ps.mana = Math.min(ctx.cfg.manaCap, ps.mana + parts.total);
    if (parts.underdog > 0) events.push(underdogEvent(ctx, s, p, parts.underdog));
  }

  // discard -> draw. Discards only reach the grave after the draw, so a card
  // pitched this turn cannot be handed straight back by a reshuffle.
  const discarded = applyDiscards(s, p, chooseDiscards(ctx, s, p));
  const drawn =
    ctx.cfg.handMode === "replace_discarded"
      ? drawN(ctx, s, p, discarded.length, events)
      : drawTo(ctx, s, p, events);
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
    boardHp: boardHpTotal(ctx, s, p),
    manaLeft,
    occBoth: [controlCount(ctx, s, 0), controlCount(ctx, s, 1)],
    handBoth: [s.players[0].hand.length, s.players[1].hand.length],
    ...(ctx.cfg.controlWinMode === "points" ? { points: [s.players[0].controlPoints, s.players[1].controlPoints] as [number, number] } : {}),
  });

  clearTurnBuffs(s); // tm16 ATK+1 lasts only the turn it was granted

  if (checkDeckOut(ctx, s, events)) return;

  if (p === 1) s.round += 1;
  s.turnPlayer = opponent(p);
};
