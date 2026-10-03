// 観戦モード: an AI-vs-AI match played one visible step at a time, and the
// pacing that lets a person follow it. Both seats are driven by the same AI
// seat driver as the AI table (play/ai-seat.ts) through the same flow
// (src/flow.ts); nothing here decides a rule. Pure: no DOM, and the runner
// takes its clock from the caller (the page passes real timers, the tests a
// fake one).
import { createFlow } from "../src/flow.ts";
import type { Flow, FlowInput } from "../src/flow.ts";
import { AI_LABELS, isAiKind } from "../src/ai/index.ts";
import type { AiKind, AiSeat } from "../src/ai/index.ts";
import type { Ctx } from "../src/state.ts";
import type { PlayerId } from "../src/types.ts";
import { decideAiMove, freshMemo, needsPlan, playAiMove } from "./ai-seat.ts";
import type { AiMemo } from "./ai-seat.ts";
import { beforeOf, narrateStep } from "./watch-text.ts";
import type { Narration, WatchLevel } from "./watch-text.ts";

export type WatchGame = { flow: Flow; ais: [AiSeat, AiSeat]; memos: [AiMemo, AiMemo]; steps: number };

export type WatchStep = Narration & {
  /** The seat that acted (the counter order and the turn end it caused are part of its step). */
  seat: PlayerId;
  /** The step's number from 1. */
  index: number;
  over: boolean;
};

export const createWatchGame = (ctx: Ctx, seed: number, ais: [AiSeat, AiSeat]): WatchGame => ({
  flow: createFlow(ctx, seed),
  ais,
  memos: [freshMemo(), freshMemo()],
  steps: 0,
});

/** The seat whose input comes next (先手 first in the simultaneous mulligan); null once it is over. */
export const nextSeat = (f: Flow): PlayerId | null => {
  const ph = f.phase;
  if (ph.kind === "over") return null;
  if (ph.kind === "mulligan") return ph.submitted[0] ? 1 : 0;
  return ph.player;
};

/** Is the next step one that makes a plan (the slow part: the page shows 「考え中」)? */
export const nextThinks = (g: WatchGame): boolean => {
  const seat = nextSeat(g.flow);
  return seat !== null && needsPlan(g.flow, seat, g.memos[seat]);
};

const playOne = (g: WatchGame, seat: PlayerId, played: FlowInput[]): void => {
  const f = g.flow;
  const move = decideAiMove(f, seat, g.ais[seat], g.memos[seat]);
  if (move === null) throw new Error(`観戦: ${seat === 0 ? "先手" : "後手"}の番ではありません`);
  const r = playAiMove(f, seat, move, g.memos[seat]);
  if (!r.ok) throw new Error(`観戦: AIの手が受け付けられませんでした(${r.error})`);
  const last = f.inputs[f.inputs.length - 1];
  if (last !== undefined) played.push(last.input);
};

/**
 * Plays one visible step: the next seat's input, then what belongs to the same
 * moment - the counter order the other seat owes for a declared attack, the
 * 灯籠の精 / 僵尸公主 choices it leaves, and the
 * turn end (discard) after a pass. Returns it in words; null once the match is over.
 */
export const playWatchStep = (g: WatchGame): WatchStep | null => {
  const f = g.flow;
  const seat = nextSeat(f);
  if (seat === null) return null;
  const before = beforeOf(f.ctx, f.state);
  const logFrom = f.log.length;
  const played: FlowInput[] = [];
  playOne(g, seat, played);
  for (;;) {
    const ph = f.phase;
    if (ph.kind === "counterOrder" || ph.kind === "lantern" || ph.kind === "kyonshi" || ph.kind === "discard") playOne(g, ph.player, played);
    else break;
  }
  const events = f.log.slice(logFrom).filter((l) => l.audience === "all").map((l) => l.event);
  g.steps += 1;
  const index = g.steps;
  const over = f.phase.kind === "over";
  const said = narrateStep(f.ctx, before, f.state, seat, played, events);
  return { ...said, level: over ? "end" : said.level, seat, index, over };
};

// ------------------------------------------------------------------ pacing

export const SPEEDS = ["slow", "normal", "fast"] as const;
export type Speed = (typeof SPEEDS)[number];
export const SPEED_LABELS: Record<Speed, string> = { slow: "ゆっくり", normal: "ふつう", fast: "はやい" };
/** The pause after an ordinary step. */
export const SPEED_MS: Record<Speed, number> = { slow: 2500, normal: 1400, fast: 600 };
/** Key moments (turn change, income step, heavy unit, control) linger this much longer. */
export const KEY_FACTOR = 1.8;

export const isSpeed = (v: unknown): v is Speed => typeof v === "string" && (SPEEDS as readonly string[]).includes(v);

export const paceMs = (speed: Speed, level: WatchLevel): number =>
  level === "normal" ? SPEED_MS[speed] : Math.round(SPEED_MS[speed] * KEY_FACTOR);

export type RunnerView = { paused: boolean; speed: Speed; busy: boolean; over: boolean; stopped: boolean };

export type RunnerDeps = {
  /** Plays and shows one step; its level, or null when there was nothing left to play. */
  next: () => Promise<WatchLevel | null>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** How much longer the step just shown is still animating (the pause lasts at least that long). */
  settleMs?: () => number;
  onChange?: (v: RunnerView) => void;
  /** Called when `next` throws; the runner pauses. */
  onError?: (err: unknown) => void;
  speed?: Speed;
  paused?: boolean;
};

export type Runner = {
  /** Runs until the match is over or the runner is stopped. */
  run: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  toggle: () => void;
  /** One step now (only while paused). */
  step: () => Promise<void>;
  setSpeed: (s: Speed) => void;
  stop: () => void;
  view: () => RunnerView;
};

/**
 * The pacing loop: a step, then a pause that starts once the step is shown
 * (thinking happens before it, not inside it). Pausing holds the next step;
 * resuming plays it at once. A speed change takes effect on the pause under way.
 */
export const createRunner = (deps: RunnerDeps): Runner => {
  let paused = deps.paused ?? false;
  let speed: Speed = deps.speed ?? "normal";
  let busy = false;
  let over = false;
  let stopped = false;
  let shownAt = -Infinity;
  let settle = 0;
  let level: WatchLevel = "normal";
  let wake: (() => void) | null = null;

  const view = (): RunnerView => ({ paused, speed, busy, over, stopped });
  const changed = (): void => deps.onChange?.(view());
  const poke = (): void => {
    const w = wake;
    wake = null;
    w?.();
  };
  const woken = (): Promise<void> => new Promise((r) => (wake = r));
  const due = (): number => shownAt + Math.max(paceMs(speed, level), settle);

  const doStep = async (): Promise<void> => {
    busy = true;
    changed();
    try {
      const got = await deps.next();
      if (got === null) over = true;
      else {
        level = got;
        if (got === "end") over = true;
      }
      shownAt = deps.now();
      settle = deps.settleMs?.() ?? 0;
    } catch (err) {
      paused = true;
      deps.onError?.(err);
    } finally {
      busy = false;
      changed();
    }
  };

  const run = async (): Promise<void> => {
    while (!stopped && !over) {
      if (paused) {
        await woken();
        continue;
      }
      const left = due() - deps.now();
      if (left > 0) {
        await Promise.race([deps.sleep(left), woken()]);
        continue;
      }
      await doStep();
    }
    changed();
  };

  const runner: Runner = {
    run,
    pause: () => {
      if (paused || over) return;
      paused = true;
      changed();
      poke();
    },
    resume: () => {
      if (!paused) return;
      paused = false;
      // the viewer has looked long enough: the next step comes at once
      shownAt = -Infinity;
      changed();
      poke();
    },
    toggle: () => (paused ? runner.resume() : runner.pause()),
    step: async () => {
      if (!paused || busy || over || stopped) return;
      await doStep();
    },
    setSpeed: (s) => {
      speed = s;
      changed();
      poke();
    },
    stop: () => {
      stopped = true;
      changed();
      poke();
    },
    view,
  };
  return runner;
};

// ------------------------------------------------------------------ setup

export const WATCH_SETUP_KEY = "sim2:watch-setup";

/** The spectate card's choices; `s` is the encoded settings (as in a share URL). */
export type WatchSetup = { s: string; ais: [AiKind, AiKind]; seed: number; speed: Speed; hands: boolean };

export const defaultWatchSetup = (s: string): WatchSetup => ({ s, ais: ["strong", "strong"], seed: 20261003, speed: "normal", hands: true });

/** Stored choices from untrusted JSON (null when malformed); the settings text is checked by the page. */
export const parseWatchSetup = (raw: unknown): WatchSetup | null => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const ais = o.ais;
  if (typeof o.s !== "string" || !Array.isArray(ais) || ais.length !== 2 || !isAiKind(ais[0]) || !isAiKind(ais[1])) return null;
  if (typeof o.seed !== "number" || !Number.isFinite(o.seed) || !isSpeed(o.speed) || typeof o.hands !== "boolean") return null;
  return { s: o.s, ais: [ais[0], ais[1]], seed: Math.trunc(o.seed), speed: o.speed, hands: o.hands };
};

/** The spectate page with these settings (kept here for existing callers; it lives with the mode switch). */
export { watchHref } from "./mode-switch.ts";

/** Seat names on the plates: 「先手・強い」. */
export const watchNames = (ais: readonly [AiKind, AiKind]): [string, string] => [`先手・${AI_LABELS[ais[0]]}`, `後手・${AI_LABELS[ais[1]]}`];
