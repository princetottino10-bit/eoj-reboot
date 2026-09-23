import { applyActionInPlace, isLegal } from "./rules.ts";
import { createGame } from "./state.ts";
import type { Ctx } from "./state.ts";
import { checkRoundLimit, defaultMulliganPolicy, endTurn, performMulligan, startTurn } from "./turn.ts";
import type { Action, GameEvent, GameState } from "./types.ts";
import type { AiSeat } from "./ai/index.ts";
import { bestCounterOrder, MAX_REPLANS, withCounterOrder } from "./ai/counter-order.ts";

export { MAX_REPLANS };
import { opponent } from "./state.ts";
import { buildRecord } from "./metrics.ts";
import type { GameRecord } from "./metrics.ts";

export type GameResult = {
  record: GameRecord;
  events: GameEvent[];
  state: GameState;
};

/**
 * The turn player's main phase, action by action. The plan is taken again from
 * the current board whenever its next action is no longer legal, and right after
 * an attack whose counter order the other seat chose (the rest of the plan was
 * made for the default order). With no counter-order choice in the rules the
 * plan is never stale, so this is the plain "apply the plan" loop.
 */
export const playMainPhase = (ctx: Ctx, s: GameState, ais: [AiSeat, AiSeat], events: GameEvent[]): void => {
  const p = s.turnPlayer;
  let plan: Action[] = ais[p].planTurn(ctx, s);
  let taken = 0;
  let replans = 0;
  while (!s.ended && taken < ctx.cfg.maxActionsPerTurn) {
    const a = plan[0];
    if (a === undefined || a.kind === "pass") break;
    if (!isLegal(ctx, s, a)) {
      if (replans >= MAX_REPLANS) break;
      replans += 1;
      plan = ais[p].planTurn(ctx, s);
      continue;
    }
    plan = plan.slice(1);
    // 案A: the countering seat chooses the order of several counters
    const act = a.kind === "attack" ? withCounterOrder(ctx, s, a, ais[opponent(p)].counterOrder ?? bestCounterOrder) : a;
    applyActionInPlace(ctx, s, act, events);
    taken += 1;
    if (act !== a && !s.ended) plan = ais[p].planTurn(ctx, s);
  }
};

/**
 * One AI-vs-AI game. A seat that answers the mulligan / 古箪笥 / discard
 * questions (AiSeat) gets asked; one that does not (greedy, beam) leaves the
 * engine's default policies in place, exactly as before.
 */
export const runGame = (
  ctx: Ctx,
  ais: [AiSeat, AiSeat],
  seed: number,
  keepEvents = true,
): GameResult => {
  const s = createGame(ctx, seed);
  const events: GameEvent[] = [];
  // EXP-0913B 1.4; no-op unless cfg.mulligan
  performMulligan(ctx, s, events, (c, st, p) => (ais[p].mulligan ?? defaultMulliganPolicy)(c, st, p));
  const hardCap = ctx.cfg.roundLimit * 2 + 8;

  for (let turn = 0; turn < hardCap; turn++) {
    if (s.ended) break;
    if (checkRoundLimit(ctx, s, events)) break;
    startTurn(ctx, s, events, ais[s.turnPlayer].tansu);
    if (s.ended) break;

    playMainPhase(ctx, s, ais, events);
    if (s.ended) break;
    events.push({ t: "pass", player: s.turnPlayer });
    endTurn(ctx, s, events, ais[s.turnPlayer].discard);
  }

  if (!s.ended) {
    s.ended = true;
    s.winner = null;
    s.winType = "turn_limit";
    events.push({ t: "gameEnd", winner: null, winType: "turn_limit", round: s.round });
  }

  const record = buildRecord(seed, events);
  record.finalLife = [s.players[0].life, s.players[1].life];
  return { record, events, state: s };
};

export type RunOptions = {
  games: number;
  seed: number;
  onProgress?: (done: number, total: number) => void;
};

export const runMatches = (ctx: Ctx, ais: [AiSeat, AiSeat], opts: RunOptions): GameRecord[] => {
  const out: GameRecord[] = [];
  for (let i = 0; i < opts.games; i++) {
    const seed = opts.seed + i;
    out.push(runGame(ctx, ais, seed, false).record);
    if (opts.onProgress !== undefined && (i + 1) % 50 === 0) opts.onProgress(i + 1, opts.games);
  }
  return out;
};
