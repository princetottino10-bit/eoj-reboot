import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import {
  applyCommand,
  createContext,
  createMatch,
  type GameEvent,
  type MatchContext,
  type MatchState,
  type PlayerId,
} from "../../../../3x3_duel/engine/src/index.ts";
import {
  type Agent,
  agentSeed,
  createAgent,
  createLvCAgent,
  type Level,
} from "../../../../3x3_duel/clients/ai/src/agent.ts";
import {
  buildDeckFromPacks,
  loadCardsWithTestCards,
  loadConstants,
} from "../../../../3x3_duel/clients/ai/src/data.ts";

type AgentKind = "C" | 5 | 6 | 7;
type Outcome = "territory" | "life" | "draw" | "turn_limit";

interface MatchResult {
  seed: number;
  p0: AgentKind;
  p1: AgentKind;
  winner: PlayerId | "draw" | null;
  winnerAgent: AgentKind | "draw" | null;
  outcome: Outcome;
  rounds: number;
  destroyed: number;
}

interface RunSpec {
  id: string;
  p0: AgentKind;
  p1: AgentKind;
  games: number;
}

interface MatchJob {
  runId: string;
  index: number;
  seed: number;
  p0: AgentKind;
  p1: AgentKind;
}

const SEED_BASE = 20260702;
const TURN_LIMIT = 200;
const COMMAND_SAFETY_CAP = 20_000;

function parseArgs(argv: string[]): {
  scale: number;
  out: string;
  workers: number;
  only: Set<string> | null;
} {
  let scale = 1;
  let out = resolve("docs/baselines/ai-crossplay-results.json");
  let workers = Math.min(8, availableParallelism());
  let only: Set<string> | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--scale") scale = Number(argv[++i]);
    else if (argv[i] === "--out") out = resolve(argv[++i]!);
    else if (argv[i] === "--workers") workers = Number(argv[++i]);
    else if (argv[i] === "--only") only = new Set(argv[++i]!.split(","));
  }
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(`invalid --scale: ${scale}`);
  if (!Number.isInteger(workers) || workers <= 0) throw new Error(`invalid --workers: ${workers}`);
  return { scale, out, workers, only };
}

function makeAgent(kind: AgentKind, seed: number, player: PlayerId): Agent {
  if (kind === "C") return createLvCAgent();
  return createAgent(kind as Level, agentSeed(seed, player, kind as Level));
}

function eventDestroyed(events: GameEvent[]): number {
  return events.filter((event) => event.type === "destroyed").length;
}

function outcomeOf(state: MatchState, turnLimited: boolean): Outcome {
  if (turnLimited || state.winner === null) return "turn_limit";
  if (state.winner === "draw") return "draw";
  const loser = state.winner === 0 ? 1 : 0;
  return state.players[loser].life <= 0 ? "life" : "territory";
}

function playMatch(
  ctx: MatchContext,
  deck: string[],
  seed: number,
  p0Kind: AgentKind,
  p1Kind: AgentKind,
): MatchResult {
  const agents: [Agent, Agent] = [makeAgent(p0Kind, seed, 0), makeAgent(p1Kind, seed, 1)];
  let state = createMatch(ctx, { seed, decks: [[...deck], [...deck]] });
  let commands = 0;
  let destroyed = 0;
  let turnLimited = false;

  while (state.winner === null) {
    if (state.turnNumber > TURN_LIMIT || commands >= COMMAND_SAFETY_CAP) {
      turnLimited = true;
      break;
    }
    const mover = state.pendingChoice?.player ?? state.currentPlayer;
    const command = agents[mover].decide(ctx, state);
    const applied = applyCommand(ctx, state, command);
    destroyed += eventDestroyed(applied.events);
    state = applied.state;
    commands++;
  }

  const winner = state.winner;
  return {
    seed,
    p0: p0Kind,
    p1: p1Kind,
    winner,
    winnerAgent: winner === null || winner === "draw" ? winner : winner === 0 ? p0Kind : p1Kind,
    outcome: outcomeOf(state, turnLimited),
    rounds: state.turnNumber / 2,
    destroyed,
  };
}

function rate(count: number, total: number): number {
  return total === 0 ? 0 : count / total;
}

function summarize(spec: RunSpec, matches: MatchResult[]) {
  const outcomes = {
    territory: matches.filter((match) => match.outcome === "territory").length,
    life: matches.filter((match) => match.outcome === "life").length,
    draw: matches.filter((match) => match.outcome === "draw").length,
    turn_limit: matches.filter((match) => match.outcome === "turn_limit").length,
  };
  const decisive = matches.filter((match) => match.winner === 0 || match.winner === 1);
  const cGames = matches.filter((match) => match.p0 === "C" || match.p1 === "C");
  const cWins = cGames.filter((match) => match.winnerAgent === "C");
  const cLosses = cGames.filter(
    (match) => (match.winner === 0 || match.winner === 1) && match.winnerAgent !== "C",
  );
  const winnerOutcome = {
    c: {
      territory: matches.filter(
        (match) => match.winnerAgent === "C" && match.outcome === "territory",
      ).length,
      life: matches.filter((match) => match.winnerAgent === "C" && match.outcome === "life").length,
    },
    opponent: {
      territory: matches.filter(
        (match) =>
          match.winnerAgent !== null &&
          match.winnerAgent !== "draw" &&
          match.winnerAgent !== "C" &&
          match.outcome === "territory",
      ).length,
      life: matches.filter(
        (match) =>
          match.winnerAgent !== null &&
          match.winnerAgent !== "draw" &&
          match.winnerAgent !== "C" &&
          match.outcome === "life",
      ).length,
    },
  };
  return {
    ...spec,
    outcomes,
    outcomeRates: {
      territory: rate(outcomes.territory, matches.length),
      life: rate(outcomes.life, matches.length),
      draw: rate(outcomes.draw, matches.length),
      turn_limit: rate(outcomes.turn_limit, matches.length),
    },
    p0WinRate: rate(matches.filter((match) => match.winner === 0).length, decisive.length),
    lvC: {
      games: cGames.length,
      wins: cWins.length,
      losses: cLosses.length,
      winRate: rate(cWins.length, cWins.length + cLosses.length),
    },
    winnerOutcome,
    avgRounds: matches.reduce((sum, match) => sum + match.rounds, 0) / matches.length,
    avgDestroyed: matches.reduce((sum, match) => sum + match.destroyed, 0) / matches.length,
  };
}

function combinedSummary(id: string, runs: MatchResult[]) {
  return summarize({ id, p0: "C", p1: 7, games: runs.length }, runs);
}

function runJobs(jobs: MatchJob[]): Array<{ job: MatchJob; match: MatchResult }> {
  const cards = loadCardsWithTestCards();
  const constants = loadConstants();
  const ctx = createContext(cards, constants);
  const deck = buildDeckFromPacks(["vanilla-4"]).cardIds;
  return jobs.map((job) => ({ job, match: playMatch(ctx, deck, job.seed, job.p0, job.p1) }));
}

async function runParallel(
  jobs: MatchJob[],
  workerCount: number,
): Promise<Array<{ job: MatchJob; match: MatchResult }>> {
  if (workerCount === 1) return runJobs(jobs);
  const buckets = Array.from(
    { length: Math.min(workerCount, jobs.length) },
    () => [] as MatchJob[],
  );
  jobs.forEach((job, index) => buckets[index % buckets.length]!.push(job));
  let completed = 0;
  return (
    await Promise.all(
      buckets.map(
        (bucket) =>
          new Promise<Array<{ job: MatchJob; match: MatchResult }>>(
            (resolveWorker, rejectWorker) => {
              const worker = new Worker(new URL(import.meta.url), {
                workerData: bucket,
                execArgv: ["--experimental-strip-types"],
              });
              worker.on("message", (result: Array<{ job: MatchJob; match: MatchResult }>) => {
                completed += result.length;
                process.stderr.write(`\rcrossplay: ${completed}/${jobs.length}`);
                resolveWorker(result);
              });
              worker.on("error", rejectWorker);
              worker.on("exit", (code) => {
                if (code !== 0) rejectWorker(new Error(`worker exited with code ${code}`));
              });
            },
          ),
      ),
    )
  ).flat();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  let specs: RunSpec[] = [
    { id: "G0_C_vs_C", p0: "C", p1: "C", games: Math.max(1, Math.round(200 * args.scale)) },
    { id: "G1_C_vs_Lv7", p0: "C", p1: 7, games: Math.max(1, Math.round(200 * args.scale)) },
    { id: "G1_Lv7_vs_C", p0: 7, p1: "C", games: Math.max(1, Math.round(200 * args.scale)) },
    { id: "G2_C_vs_Lv5", p0: "C", p1: 5, games: Math.max(1, Math.round(100 * args.scale)) },
    { id: "G2_C_vs_Lv6", p0: "C", p1: 6, games: Math.max(1, Math.round(100 * args.scale)) },
    { id: "G3_Lv7_vs_Lv7", p0: 7, p1: 7, games: Math.max(1, Math.round(200 * args.scale)) },
  ];
  if (args.only) specs = specs.filter((spec) => args.only!.has(spec.id));
  const jobs = specs.flatMap((spec) =>
    Array.from({ length: spec.games }, (_, index) => ({
      runId: spec.id,
      index,
      seed: SEED_BASE + index,
      p0: spec.p0,
      p1: spec.p1,
    })),
  );
  const started = Date.now();
  const completed = await runParallel(jobs, args.workers);
  process.stderr.write(` (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);

  const results: Record<string, MatchResult[]> = {};
  const summaries = [];
  for (const spec of specs) {
    const matches = completed
      .filter(({ job }) => job.runId === spec.id)
      .sort((a, b) => a.job.index - b.job.index)
      .map(({ match }) => match);
    results[spec.id] = matches;
    summaries.push(summarize(spec, matches));
  }

  const g1 = [...(results.G1_C_vs_Lv7 ?? []), ...(results.G1_Lv7_vs_C ?? [])];
  const output = {
    generatedAt: new Date().toISOString(),
    configuration: {
      seedBase: SEED_BASE,
      turnLimit: TURN_LIMIT,
      pack: "vanilla-4",
      scale: args.scale,
      engineRepo: "fenril058/3x3_duel",
      engineHead: "b0e4dcba323b24240fe9c103f1c5e4dc70860627",
    },
    summaries,
    combined: {
      ...(g1.length > 0
        ? { G1_C_vs_Lv7_both_seats: combinedSummary("G1_C_vs_Lv7_both_seats", g1) }
        : {}),
    },
    matches: results,
  };
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(output, null, 2)}\n`);
  console.log(args.out);
}

if (isMainThread) {
  await main();
} else {
  parentPort!.postMessage(runJobs(workerData as MatchJob[]));
}
