import { applyActionInPlace, isLegal } from "./rules.ts";
import { createGame } from "./state.ts";
import type { Ctx } from "./state.ts";
import { checkRoundLimit, endTurn, startTurn } from "./turn.ts";
import type { GameEvent, GameState } from "./types.ts";
import type { Ai } from "./ai/greedy.ts";
import { buildRecord } from "./metrics.ts";
import type { GameRecord } from "./metrics.ts";

export type GameResult = {
  record: GameRecord;
  events: GameEvent[];
  state: GameState;
};

export const runGame = (
  ctx: Ctx,
  ais: [Ai, Ai],
  seed: number,
  keepEvents = true,
): GameResult => {
  const s = createGame(ctx, seed);
  const events: GameEvent[] = [];
  const hardCap = ctx.cfg.roundLimit * 2 + 8;

  for (let turn = 0; turn < hardCap; turn++) {
    if (s.ended) break;
    if (checkRoundLimit(ctx, s, events)) break;
    startTurn(ctx, s, events);
    if (s.ended) break;

    const plan = ais[s.turnPlayer].planTurn(ctx, s);
    let taken = 0;
    for (const a of plan) {
      if (s.ended) break;
      if (taken >= ctx.cfg.maxActionsPerTurn) break;
      if (a.kind === "pass") break;
      if (!isLegal(ctx, s, a)) break; // AI returned a stale plan; stop the turn
      applyActionInPlace(ctx, s, a, events);
      taken += 1;
    }
    if (s.ended) break;
    events.push({ t: "pass", player: s.turnPlayer });
    endTurn(ctx, s, events);
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

export const runMatches = (ctx: Ctx, ais: [Ai, Ai], opts: RunOptions): GameRecord[] => {
  const out: GameRecord[] = [];
  for (let i = 0; i < opts.games; i++) {
    const seed = opts.seed + i;
    out.push(runGame(ctx, ais, seed, false).record);
    if (opts.onProgress !== undefined && (i + 1) % 50 === 0) opts.onProgress(i + 1, opts.games);
  }
  return out;
};
