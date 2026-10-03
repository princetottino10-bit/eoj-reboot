// One AI seat of a local match, one input at a time: what the seat owes right
// now (mulligan, 古箪笥, counter order, the next main-phase action, the
// hand-size discard) and playing it through the flow. The AI table (ui.ts)
// drives its AI seat with it and the spectate page (watch.ts) drives both
// seats with it, so the two never differ in how an AI plays. Pure: no DOM.
//
// The main phase follows the seat's plan for the turn. The plan is taken again
// from the board as it is when the next action is no longer legal, and when
// another seat answered something since this seat's last input (the other
// side ordered its counters differently from what the plan assumed).
import { bestCounterOrder, MAX_REPLANS } from "../src/ai/counter-order.ts";
import type { AiSeat } from "../src/ai/index.ts";
import { defaultTansuPolicy } from "../src/effects.ts";
import { submit, submitDiscardWith } from "../src/flow.ts";
import type { Flow, FlowInput, SubmitResult } from "../src/flow.ts";
import { isLegal } from "../src/rules.ts";
import { defaultMulliganPolicy } from "../src/turn.ts";
import type { DiscardChooser } from "../src/turn.ts";
import { defaultDiscardPolicy } from "../src/turn.ts";
import type { Action, PlayerId } from "../src/types.ts";

/** What a seat remembers of its turn between inputs. */
export type AiMemo = {
  /** round:seat of the turn the plan belongs to ("" = none yet). */
  turn: string;
  /** How many inputs the match had after this seat's last main-phase input (-1 = none). */
  inputsAt: number;
  plan: Action[];
  taken: number;
  replans: number;
};

export const freshMemo = (): AiMemo => ({ turn: "", inputsAt: -1, plan: [], taken: 0, replans: 0 });

/** One input for the seat: a plain input, or the discard (its chooser runs inside the turn end). */
export type AiMove = { kind: "input"; input: FlowInput } | { kind: "discard"; chooser: DiscardChooser };

const turnOf = (f: Flow): string => `${f.state.round}:${f.state.turnPlayer}`;

/** Does `seat` owe an input right now? */
export const aiOwes = (f: Flow, seat: PlayerId): boolean => {
  const ph = f.phase;
  if (ph.kind === "over") return false;
  if (ph.kind === "mulligan") return !ph.submitted[seat];
  return ph.player === seat;
};

/** Will the next main-phase move make a new plan (the slow part of a turn)? */
export const needsPlan = (f: Flow, seat: PlayerId, memo: AiMemo): boolean =>
  f.phase.kind === "main" && f.phase.player === seat && (memo.turn !== turnOf(f) || memo.inputsAt !== f.inputs.length);

const pass: AiMove = { kind: "input", input: { type: "action", action: { kind: "pass" } } };

/** The next main-phase action from the plan (planned again as needed); pass when the plan is done. */
const mainMove = (f: Flow, ai: AiSeat, memo: AiMemo): AiMove => {
  const turn = turnOf(f);
  if (memo.turn !== turn) {
    memo.turn = turn;
    memo.taken = 0;
    memo.replans = 0;
    memo.plan = ai.planTurn(f.ctx, f.state);
  } else if (memo.inputsAt !== f.inputs.length) {
    memo.plan = ai.planTurn(f.ctx, f.state);
  }
  memo.inputsAt = f.inputs.length;
  for (;;) {
    const a = memo.plan[0];
    if (a === undefined || a.kind === "pass" || memo.taken >= f.ctx.cfg.maxActionsPerTurn) return pass;
    if (isLegal(f.ctx, f.state, a)) return { kind: "input", input: { type: "action", action: a } };
    if (memo.replans >= MAX_REPLANS) return pass;
    memo.replans += 1;
    memo.plan = ai.planTurn(f.ctx, f.state);
  }
};

/**
 * The input `seat` owes now, or null when it owes none. A seat that answers
 * for itself (strong) is asked; greedy / beam keep the engine's default
 * policies for everything but the main phase.
 */
export const decideAiMove = (f: Flow, seat: PlayerId, ai: AiSeat, memo: AiMemo): AiMove | null => {
  if (!aiOwes(f, seat)) return null;
  const ph = f.phase;
  switch (ph.kind) {
    case "mulligan":
      return { kind: "input", input: { type: "mulligan", indices: (ai.mulligan ?? defaultMulliganPolicy)(f.ctx, f.state, seat) } };
    case "tansu": {
      const choose = ai.tansu ?? defaultTansuPolicy;
      const answers = ph.uids.map((uid) => {
        const unit = f.state.units.find((u) => u.uid === uid);
        return { uid, choice: unit === undefined ? ("mana" as const) : choose(f.ctx, f.state, unit) };
      });
      return { kind: "input", input: { type: "tansu", answers } };
    }
    case "counterOrder": {
      // 案A: the seat orders its counters the way its eval likes best
      const order = (ai.counterOrder ?? bestCounterOrder)(f.ctx, f.state, ph.action) ?? ph.uids;
      return { kind: "input", input: { type: "counterOrder", order } };
    }
    case "main":
      return mainMove(f, ai, memo);
    case "discard":
      return { kind: "discard", chooser: ai.discard ?? defaultDiscardPolicy };
    default:
      return null;
  }
};

/** Main-phase actions and the discard are the moves a watcher waits for (the AI table paces them). */
export const isPacedMove = (move: AiMove): boolean => move.kind === "discard" || move.input.type === "action";

/** Plays a move decided by decideAiMove and keeps the seat's memo in step. */
export const playAiMove = (f: Flow, seat: PlayerId, move: AiMove, memo: AiMemo): SubmitResult => {
  if (move.kind === "discard") return submitDiscardWith(f, seat, move.chooser);
  const r = submit(f, seat, move.input);
  if (r.ok && move.input.type === "action" && move.input.action.kind !== "pass") {
    memo.plan = memo.plan.slice(1);
    memo.taken += 1;
    memo.inputsAt = f.inputs.length;
  }
  return r;
};
