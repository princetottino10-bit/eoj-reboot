// Match flow: the input-driven state machine that sits on top of the engine.
//
// The engine asks for player decisions through synchronous chooser functions
// (MulliganChooser / DiscardChooser / TansuChooser). A human answers
// asynchronously, so this module collects the answer FIRST (the flow parks in
// a phase that names who owes what) and only then calls the engine with a
// chooser that returns the collected answer. The engine itself is untouched.
//
//   mulligan (both seats, simultaneous)
//     -> [tansu (turn player, tm07 decisions owed at this turn start)]
//     -> startTurn -> main (turn player's actions) -> pass
//     -> discard (turn player) -> endTurn -> next turn ...
//
//   main: an attack whose counters the countering side may order (採用ルール
//   9/22 案A, src/counter-order.ts) -> counterOrder (the defending seat) ->
//   the attack resolves in that order -> main (the attacker again)
//
//   main / counterOrder: an attack or reigu that destroys a 灯籠の精 with two
//   or more allies left (src/lantern.ts, 2026-10-03) -> lantern (that
//   lantern's OWNER, often the seat not on turn), once per such lantern in
//   resolution order -> the action resolves with every pick -> main
//
//   main / counterOrder / lantern: an attack after which a 10/3 僵尸公主 (ac13)
//   moves onto the cell it cleared (src/kyonshi.ts) -> kyonshi (its OWNER: the
//   attacker's seat for its own attack, the defending seat for its counter)
//   keeps the facing or turns 90° -> the action resolves -> main
//
// Shared by the local play UI (with an AI seat) and the online server.
// Pure: no node builtins. Every accepted input is recorded, so a flow can be
// replayed from (config, pack, seed, inputs).
import { parseCardOverrides } from "./card-overrides.ts";
import type { CardChange, CardOverrides } from "./card-overrides.ts";
import { parseConfigPatch } from "./config-schema.ts";
import type { ConfigChange, ConfigPatch } from "./config-schema.ts";
import { recheckControl } from "./combat.ts";
import { counterOrderChoice } from "./counter-order.ts";
import type { AttackAction } from "./counter-order.ts";
import { clearExpiredHidden } from "./effects.ts";
import { nextLanternAsk } from "./lantern-choice.ts";
import type { LanternAsk } from "./lantern.ts";
import { applyInPlaceWithChoices, nextKyonshiAsk } from "./kyonshi-choice.ts";
import { isKyonshiTurn } from "./kyonshi.ts";
import type { KyonshiAsk, KyonshiTurn } from "./kyonshi.ts";
import type { TansuChoice } from "./effects.ts";
import { applyCardChange, applyRuleChange } from "./rule-change.ts";
import { isLegal } from "./rules.ts";
import { cloneState, createGame, opponent } from "./state.ts";
import type { Ctx } from "./state.ts";
import {
  checkDeckOut,
  checkRoundLimit,
  endTurn,
  pendingTansuChoices,
  performMulligan,
  startTurn,
} from "./turn.ts";
import type { DiscardChooser } from "./turn.ts";
import type { Action, Config, GameEvent, GameState, PlayerId } from "./types.ts";

export type TansuAnswer = { uid: number; choice: TansuChoice };

export type FlowInput =
  | { type: "action"; action: Action }
  | { type: "mulligan"; indices: number[] }
  | { type: "discard"; indices: number[] }
  | { type: "tansu"; answers: TansuAnswer[] }
  /** 案A: the countering seat's order for the attack waiting in the counterOrder phase (every counterer's uid once). */
  | { type: "counterOrder"; order: number[] }
  /** 灯籠の精: the owner's ally (uid) for the lantern waiting in the lantern phase. */
  | { type: "lantern"; uid: number }
  /** 僵尸公主 (10/3): the owner's facing after the move waiting in the kyonshi phase (0 keep, -1 left 90°, 1 right 90°). */
  | { type: "kyonshi"; turn: KyonshiTurn }
  | { type: "resign" }
  /** Rule variables changed mid-match (already agreed on). Any phase but "over". */
  | { type: "config"; patch: ConfigPatch }
  /** Cards changed mid-match (already agreed on): each value replaces the current one. Any phase but "over". */
  | { type: "cards"; edits: CardOverrides };

export type FlowPhase =
  | { kind: "mulligan"; submitted: [boolean, boolean] }
  | { kind: "tansu"; player: PlayerId; uids: number[] }
  | { kind: "main"; player: PlayerId }
  /**
   * 案A: `attacker` declared `action`; it resolves once `player` (the
   * countering seat) has put `uids` (the counterers, engine order) in order.
   */
  | { kind: "counterOrder"; player: PlayerId; attacker: PlayerId; action: AttackAction; uids: number[] }
  /**
   * 灯籠の精: `actor`'s `action` (counter order included) destroys a lantern of
   * `player`; it resolves once `player` has chosen the ally for `ask` (and any
   * later ask). `picks`: the answers to the asks before this one.
   */
  | { kind: "lantern"; player: PlayerId; actor: PlayerId; action: Action; picks: number[]; ask: LanternAsk }
  /**
   * 僵尸公主 (10/3): `actor`'s `action` moves a 僵尸公主 of `player`, who keeps
   * its facing or turns it 90° (`ask`). `picks`: every 灯籠の精 answer of the
   * action; `turns`: the answers to the facing asks before this one.
   */
  | { kind: "kyonshi"; player: PlayerId; actor: PlayerId; action: Action; picks: number[]; turns: KyonshiTurn[]; ask: KyonshiAsk }
  | { kind: "discard"; player: PlayerId }
  | { kind: "over" };

/** Flow-level log lines that are not engine events. */
export type FlowEvent =
  /** Private to `player`: which cards they sent back. */
  | { t: "mulliganCards"; player: PlayerId; cards: string[] }
  | { t: "resign"; player: PlayerId; round: number }
  /** 案A: the order the countering seat chose (card ids in that order, for the log). */
  | { t: "counterOrder"; player: PlayerId; round: number; order: number[]; cards: string[] }
  /** A mid-match rule change; `player` is the seat that proposed it. */
  | { t: "config"; player: PlayerId; round: number; changes: ConfigChange[] }
  /** A mid-match card change; `player` is the seat that proposed it. */
  | { t: "cards"; player: PlayerId; round: number; changes: CardChange[] };

export type Audience = "all" | PlayerId;
export type LogEntry = { seq: number; audience: Audience; event: GameEvent | FlowEvent };

export type RecordedInput = { seat: PlayerId; input: FlowInput };

export type Flow = {
  /** The current rules and cards. Replaced (never mutated) by a "config" or "cards" input. */
  ctx: Ctx;
  /** The rules the match started with; a replay starts from these. */
  initialCfg: Config;
  seed: number;
  state: GameState;
  /** Every engine event, in order (the same stream the runner produces). */
  events: GameEvent[];
  log: LogEntry[];
  phase: FlowPhase;
  inputs: RecordedInput[];
  resignedBy: PlayerId | null;
  mulliganPicks: [number[] | null, number[] | null];
};

export type SubmitResult = { ok: true } | { ok: false; code: "forbidden" | "illegal" | "phase"; error: string };

const fail = (code: "forbidden" | "illegal" | "phase", error: string): SubmitResult => ({
  ok: false,
  code,
  error,
});

// -------------------------------------------------------------- log helpers

const pushLog = (f: Flow, audience: Audience, event: GameEvent | FlowEvent): void => {
  f.log.push({ seq: f.log.length, audience, event });
};

/** Runs an engine call with a scratch event list, then files the events. */
const engine = (f: Flow, run: (events: GameEvent[]) => void): void => {
  const fresh: GameEvent[] = [];
  run(fresh);
  for (const e of fresh) {
    f.events.push(e);
    pushLog(f, "all", e);
  }
};

// ------------------------------------------------------------ transitions

/**
 * tm07 decisions owed at the coming turn start. pendingTansuChoices looks at
 * the state before startTurn clears expiring Mayohiga; a unit the turn player
 * hid themself becomes visible (and eligible) inside startTurn, so expire
 * those on a scratch clone first.
 */
export const tansuOwed = (ctx: Ctx, s: GameState): number[] => {
  const scratch = cloneState(s);
  clearExpiredHidden(scratch, scratch.turnPlayer, []);
  return pendingTansuChoices(ctx, scratch);
};

const finishIfEnded = (f: Flow): boolean => {
  if (!f.state.ended) return false;
  f.phase = { kind: "over" };
  return true;
};

const beginTurn = (f: Flow, answers: Map<number, TansuChoice>): void => {
  // A rule change while a tm07 prompt was open (roundLimit lowered, deckOutMode
  // switched on) can already have ended the match: check again right before
  // the turn starts. A no-op when coming straight from advance().
  let over = false;
  engine(f, (ev) => {
    over = checkRoundLimit(f.ctx, f.state, ev) || checkDeckOut(f.ctx, f.state, ev);
  });
  if (over || finishIfEnded(f)) {
    f.phase = { kind: "over" };
    return;
  }
  engine(f, (ev) => startTurn(f.ctx, f.state, ev, (_c, _s, u) => answers.get(u.uid) ?? "skip"));
  if (finishIfEnded(f)) return;
  f.phase = { kind: "main", player: f.state.turnPlayer };
};

/** From "between turns" to the next prompt. */
const advance = (f: Flow): void => {
  if (finishIfEnded(f)) return;
  let limit = false;
  engine(f, (ev) => {
    limit = checkRoundLimit(f.ctx, f.state, ev);
  });
  if (limit || finishIfEnded(f)) {
    f.phase = { kind: "over" };
    return;
  }
  const owed = tansuOwed(f.ctx, f.state);
  if (owed.length > 0) {
    f.phase = { kind: "tansu", player: f.state.turnPlayer, uids: owed };
    return;
  }
  beginTurn(f, new Map());
};

const runEndTurn = (f: Flow, chooser: DiscardChooser): void => {
  engine(f, (ev) => endTurn(f.ctx, f.state, ev, chooser));
  advance(f);
};

// --------------------------------------------------------------- creation

export type FlowOptions = {
  /** Test hook: adjust the freshly dealt state before anything happens. */
  prepare?: (s: GameState, ctx: Ctx) => void;
};

export const createFlow = (ctx: Ctx, seed: number, opts: FlowOptions = {}): Flow => {
  const state = createGame(ctx, seed);
  if (opts.prepare !== undefined) opts.prepare(state, ctx);
  const f: Flow = {
    ctx,
    initialCfg: ctx.cfg,
    seed,
    state,
    events: [],
    log: [],
    phase: { kind: "over" },
    inputs: [],
    resignedBy: null,
    mulliganPicks: [null, null],
  };
  if (ctx.cfg.mulligan) f.phase = { kind: "mulligan", submitted: [false, false] };
  else advance(f);
  return f;
};

// ------------------------------------------------------------------ input

/** Seats that currently owe an input. */
export const owedBy = (f: Flow): PlayerId[] => {
  const ph = f.phase;
  if (ph.kind === "mulligan") return ([0, 1] as PlayerId[]).filter((p) => !ph.submitted[p]);
  if (ph.kind === "over") return [];
  return [ph.player];
};

const validIndices = (indices: number[], size: number): boolean =>
  indices.length <= size &&
  new Set(indices).size === indices.length &&
  indices.every((i) => Number.isInteger(i) && i >= 0 && i < size);

const submitMulligan = (f: Flow, seat: PlayerId, indices: number[]): SubmitResult => {
  const ph = f.phase;
  if (ph.kind !== "mulligan") return fail("phase", "マリガンの時間ではありません");
  if (ph.submitted[seat]) return fail("phase", "マリガンは確定済みです");
  const hand = f.state.players[seat].hand;
  if (!validIndices(indices, hand.length)) return fail("illegal", "手札の指定が不正です");
  f.mulliganPicks[seat] = indices.slice();
  const submitted: [boolean, boolean] = [ph.submitted[0], ph.submitted[1]];
  submitted[seat] = true;
  f.phase = { kind: "mulligan", submitted };
  if (!submitted[0] || !submitted[1]) return { ok: true };

  const picks = f.mulliganPicks;
  const returned = ([0, 1] as PlayerId[]).map((p) =>
    f.state.players[p].hand.filter((_, i) => (picks[p] ?? []).includes(i)),
  );
  engine(f, (ev) => performMulligan(f.ctx, f.state, ev, (_c, _s, p) => picks[p] ?? []));
  for (const p of [0, 1] as PlayerId[]) {
    if (returned[p].length > 0) pushLog(f, p, { t: "mulliganCards", player: p, cards: returned[p] });
  }
  advance(f);
  return { ok: true };
};

const submitTansu = (f: Flow, seat: PlayerId, answers: TansuAnswer[]): SubmitResult => {
  const ph = f.phase;
  if (ph.kind !== "tansu") return fail("phase", "古箪笥の選択の時間ではありません");
  if (ph.player !== seat) return fail("forbidden", "相手の選択待ちです");
  const map = new Map<number, TansuChoice>();
  for (const a of answers) {
    if (!ph.uids.includes(a.uid)) return fail("illegal", "古箪笥の対象が不正です");
    if (a.choice !== "mana" && a.choice !== "draw" && a.choice !== "skip") {
      return fail("illegal", "古箪笥の選択が不正です");
    }
    map.set(a.uid, a.choice);
  }
  beginTurn(f, map);
  return { ok: true };
};

const submitAction = (f: Flow, seat: PlayerId, action: Action): SubmitResult => {
  const ph = f.phase;
  if (ph.kind !== "main") return fail("phase", "行動できる場面ではありません");
  if (ph.player !== seat) return fail("forbidden", "あなたの手番ではありません");
  if (!isLegal(f.ctx, f.state, action)) return fail("illegal", "その行動は合法ではありません");
  // 案A: several counters whose order matters wait for the countering seat
  if (action.kind === "attack" && action.counterOrder === undefined) {
    const choice = counterOrderChoice(f.ctx, f.state, action);
    if (choice !== null) {
      f.phase = { kind: "counterOrder", player: opponent(seat), attacker: seat, action: { ...action }, uids: choice.uids.slice() };
      return { ok: true };
    }
  }
  if (action.kind === "pass") {
    engine(f, (ev) => ev.push({ t: "pass", player: seat }));
    f.phase = { kind: "discard", player: seat };
    return { ok: true };
  }
  resolveAction(f, seat, action, [], []);
  return { ok: true };
};

/**
 * Resolves `actor`'s action with the 灯籠の精 picks and 僵尸公主 turns so far, or
 * parks in the lantern / kyonshi phase when an owner still owes one (every
 * lantern choice of an action comes before its facing choices:
 * src/kyonshi-choice.ts). Win / control checks run with the resolution, so
 * after every answer is in.
 */
const resolveAction = (f: Flow, actor: PlayerId, action: Action, picks: number[], turns: KyonshiTurn[]): void => {
  const ask = nextLanternAsk(f.ctx, f.state, action, picks);
  if (ask !== null) {
    f.phase = { kind: "lantern", player: ask.owner, actor, action, picks: picks.slice(), ask };
    return;
  }
  const turn = nextKyonshiAsk(f.ctx, f.state, action, picks, turns);
  if (turn !== null) {
    f.phase = { kind: "kyonshi", player: turn.owner, actor, action, picks: picks.slice(), turns: turns.slice(), ask: turn };
    return;
  }
  f.phase = { kind: "main", player: actor };
  engine(f, (ev) => applyInPlaceWithChoices(f.ctx, f.state, action, picks, turns, ev));
  finishIfEnded(f);
};

const submitLantern = (f: Flow, seat: PlayerId, uid: number): SubmitResult => {
  const ph = f.phase;
  if (ph.kind !== "lantern") return fail("phase", "灯籠の精の灯を託す相手を選ぶ場面ではありません");
  if (ph.player !== seat) return fail("forbidden", "灯籠の精の灯は相手が選びます");
  if (!ph.ask.options.some((o) => o.uid === uid)) return fail("illegal", "灯を託せる味方ではありません");
  resolveAction(f, ph.actor, ph.action, [...ph.picks, uid], []);
  return { ok: true };
};

const submitKyonshi = (f: Flow, seat: PlayerId, turn: KyonshiTurn): SubmitResult => {
  const ph = f.phase;
  if (ph.kind !== "kyonshi") return fail("phase", "僵尸公主の向きを選ぶ場面ではありません");
  if (ph.player !== seat) return fail("forbidden", "僵尸公主の向きは持ち主が選びます");
  if (!isKyonshiTurn(turn)) return fail("illegal", "向きは「そのまま」「左へ90度」「右へ90度」のどれかです");
  resolveAction(f, ph.actor, ph.action, ph.picks, [...ph.turns, turn]);
  return { ok: true };
};

const submitCounterOrder = (f: Flow, seat: PlayerId, order: number[]): SubmitResult => {
  const ph = f.phase;
  if (ph.kind !== "counterOrder") return fail("phase", "反撃の順番を選ぶ場面ではありません");
  if (ph.player !== seat) return fail("forbidden", "反撃の順番は相手が選びます");
  const ok = order.length === ph.uids.length && new Set(order).size === order.length && order.every((u) => ph.uids.includes(u));
  if (!ok) return fail("illegal", "反撃の順番の指定が不正です");
  const action: AttackAction = { ...ph.action, counterOrder: order.slice() };
  if (!isLegal(f.ctx, f.state, action)) return fail("illegal", "その順番では反撃を解決できません");
  const cards = order.map((uid) => f.state.units.find((u) => u.uid === uid)?.cardId ?? "");
  pushLog(f, "all", { t: "counterOrder", player: seat, round: f.state.round, order: order.slice(), cards });
  resolveAction(f, ph.attacker, action, [], []);
  return { ok: true };
};

const submitDiscard = (f: Flow, seat: PlayerId, indices: number[]): SubmitResult => {
  const ph = f.phase;
  if (ph.kind !== "discard") return fail("phase", "手札整理の時間ではありません");
  if (ph.player !== seat) return fail("forbidden", "相手の手札整理を待っています");
  if (!validIndices(indices, f.state.players[seat].hand.length)) {
    return fail("illegal", "捨て札の指定が不正です");
  }
  const chosen = indices.slice();
  runEndTurn(f, () => chosen);
  return { ok: true };
};

const submitResign = (f: Flow, seat: PlayerId): SubmitResult => {
  if (f.phase.kind === "over") return fail("phase", "試合は終了しています");
  f.state.ended = true;
  f.state.winner = opponent(seat);
  f.state.winType = null;
  f.resignedBy = seat;
  pushLog(f, "all", { t: "resign", player: seat, round: f.state.round });
  f.phase = { kind: "over" };
  return { ok: true };
};

/** A change while an attack waits for its counter order could change who counters: it waits until the order is in. */
const COUNTER_ORDER_WAIT = "反撃の順番を選んでいる間はルール・カードを変えられません(選び終わってから)";
/** The same for a 灯籠の精 choice: the candidates and the gains were worked out under the rules in force. */
const LANTERN_WAIT = "灯籠の精の灯を託す相手を選んでいる間はルール・カードを変えられません(選び終わってから)";

/** And for a 僵尸公主 facing choice. */
const KYONSHI_WAIT = "僵尸公主の向きを選んでいる間はルール・カードを変えられません(選び終わってから)";

const choiceOpen = (f: Flow): SubmitResult | null =>
  f.phase.kind === "counterOrder"
    ? fail("phase", COUNTER_ORDER_WAIT)
    : f.phase.kind === "lantern"
      ? fail("phase", LANTERN_WAIT)
      : f.phase.kind === "kyonshi"
        ? fail("phase", KYONSHI_WAIT)
        : null;

const submitConfig = (f: Flow, seat: PlayerId, patch: ConfigPatch): SubmitResult => {
  if (f.phase.kind === "over") return fail("phase", "試合は終了しています");
  const open = choiceOpen(f);
  if (open !== null) return open;
  const parsed = parseConfigPatch(patch, { midGame: true });
  if (!parsed.ok) return fail("illegal", parsed.error);
  const { ctx, changes } = applyRuleChange(f.ctx, f.state, parsed.value);
  if (changes.length === 0) return fail("illegal", "変更点がありません");
  f.ctx = ctx;
  pushLog(f, "all", { t: "config", player: seat, round: f.state.round, changes });
  // a raised controlWin (or a switch to next_turn_end) can break a standing
  // control state at once; the loss is logged like any other engine event
  engine(f, (ev) => recheckControl(f.ctx, f.state, ev));
  return { ok: true };
};

const submitCards = (f: Flow, seat: PlayerId, edits: CardOverrides): SubmitResult => {
  if (f.phase.kind === "over") return fail("phase", "試合は終了しています");
  const open = choiceOpen(f);
  if (open !== null) return open;
  const parsed = parseCardOverrides(edits, f.ctx.pack);
  if (!parsed.ok) return fail("illegal", parsed.error);
  const { ctx, changes } = applyCardChange(f.ctx, f.state, parsed.value);
  if (changes.length === 0) return fail("illegal", "変更点がありません");
  f.ctx = ctx;
  pushLog(f, "all", { t: "cards", player: seat, round: f.state.round, changes });
  // under controlCount hp / cost a card edit can change a weighted 占拠 (it
  // never removes a unit, so under "cells" this never fires)
  engine(f, (ev) => recheckControl(f.ctx, f.state, ev));
  return { ok: true };
};

/** Validates and applies one input. Rejected inputs change nothing. */
export const submit = (f: Flow, seat: PlayerId, input: FlowInput): SubmitResult => {
  let r: SubmitResult;
  switch (input.type) {
    case "mulligan":
      r = submitMulligan(f, seat, input.indices);
      break;
    case "tansu":
      r = submitTansu(f, seat, input.answers);
      break;
    case "action":
      r = submitAction(f, seat, input.action);
      break;
    case "counterOrder":
      r = submitCounterOrder(f, seat, input.order);
      break;
    case "lantern":
      r = submitLantern(f, seat, input.uid);
      break;
    case "kyonshi":
      r = submitKyonshi(f, seat, input.turn);
      break;
    case "discard":
      r = submitDiscard(f, seat, input.indices);
      break;
    case "resign":
      r = submitResign(f, seat);
      break;
    case "config":
      r = submitConfig(f, seat, input.patch);
      break;
    case "cards":
      r = submitCards(f, seat, input.edits);
      break;
    default:
      r = fail("illegal", "不明な入力です");
  }
  if (r.ok) f.inputs.push({ seat, input });
  return r;
};

/**
 * Discard through an engine policy (the local AI seat). The chooser runs
 * inside endTurn exactly as it does in the runner; the indices it returned
 * are recorded as an ordinary discard input so replays stay exact.
 */
export const submitDiscardWith = (f: Flow, seat: PlayerId, chooser: DiscardChooser): SubmitResult => {
  const ph = f.phase;
  if (ph.kind !== "discard") return fail("phase", "手札整理の時間ではありません");
  if (ph.player !== seat) return fail("forbidden", "相手の手札整理を待っています");
  let captured: number[] = [];
  runEndTurn(f, (ctx, s, p) => {
    captured = chooser(ctx, s, p);
    return captured;
  });
  f.inputs.push({ seat, input: { type: "discard", indices: captured.slice() } });
  return { ok: true };
};

/** Re-runs a recorded input list. Throws if any input is rejected. */
export const replayFlow = (
  ctx: Ctx,
  seed: number,
  inputs: RecordedInput[],
  opts: FlowOptions = {},
): Flow => {
  const f = createFlow(ctx, seed, opts);
  inputs.forEach((rec, i) => {
    const r = submit(f, rec.seat, rec.input);
    if (!r.ok) throw new Error(`replay: input #${i} rejected: ${r.error}`);
  });
  return f;
};
