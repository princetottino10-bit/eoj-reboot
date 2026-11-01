import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, resolve } from "node:path";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import {
  applyCommand,
  createContext,
  createMatch,
  legalSummonPositions,
  type GameEvent,
  type MatchContext,
  type MatchState,
  type PlayerId,
} from "../../../../3x3_duel/engine/src/index.ts";
import { agentSeed, createAgent } from "../../../../3x3_duel/clients/ai/src/agent.ts";
import {
  buildDeckFromPacks,
  loadCardsWithTestCards,
  loadConstants,
} from "../../../../3x3_duel/clients/ai/src/data.ts";

type Outcome = "destroy" | "control" | "draw" | "turn_limit";

interface TurnEnd {
  player: PlayerId;
  occupancy: number;
  controlWin: boolean;
}

interface LegalSample {
  turnNumber: number;
  player: PlayerId;
  occupied: number;
  empty: number;
  legal: number;
}

interface MatchResult {
  index: number;
  seed: number;
  winner: PlayerId | "draw" | null;
  outcome: Outcome;
  rounds: number;
  destroyed: number;
  attacks: number;
  blindAttacks: number;
  counterAttacks: number;
  turnEnds: TurnEnd[];
  legalSamples: LegalSample[];
}

interface WorkerConfig {
  jobs: Array<{ index: number; seed: number }>;
  turnLimit: number;
  nodeBudget: number;
}

interface Args {
  mode: string;
  games: number;
  seedBase: number;
  turnLimit: number;
  nodeBudget: number;
  workers: number;
  out: string;
}

const COMMAND_SAFETY_CAP = 20_000;

function parseArgs(argv: string[]): Args {
  const args: Args = {
    mode: "A",
    games: 2000,
    seedBase: 20260702,
    turnLimit: 200,
    nodeBudget: 5000,
    workers: Math.min(12, availableParallelism()),
    out: resolve("C:/Projects/3x3_duel/analysis/adjacency-A.json"),
  };
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    if (argv[i] === "--mode") args.mode = value!;
    else if (argv[i] === "--games") args.games = Number(value);
    else if (argv[i] === "--seed-base") args.seedBase = Number(value);
    else if (argv[i] === "--turn-limit") args.turnLimit = Number(value);
    else if (argv[i] === "--node-budget") args.nodeBudget = Number(value);
    else if (argv[i] === "--workers") args.workers = Number(value);
    else if (argv[i] === "--out") args.out = resolve(value!);
    else continue;
    i++;
  }
  for (const key of ["games", "seedBase", "turnLimit", "nodeBudget", "workers"] as const) {
    if (!Number.isInteger(args[key]) || args[key] <= 0)
      throw new Error(`invalid --${key}: ${args[key]}`);
  }
  return args;
}

function countDestroyed(events: GameEvent[]): number {
  return events.filter((event) => event.type === "destroyed").length;
}

function outcomeOf(state: MatchState, limited: boolean): Outcome {
  if (limited || state.winner === null) return "turn_limit";
  if (state.winner === "draw") return "draw";
  const loser = state.winner === 0 ? 1 : 0;
  return state.players[loser].life <= 0 ? "destroy" : "control";
}

function playMatch(
  ctx: MatchContext,
  deck: string[],
  index: number,
  seed: number,
  turnLimit: number,
  nodeBudget: number,
): MatchResult {
  const agents = [
    createAgent(7, agentSeed(seed, 0, 7), { nodeBudget }),
    createAgent(7, agentSeed(seed, 1, 7), { nodeBudget }),
  ] as const;
  let state = createMatch(ctx, { seed, decks: [[...deck], [...deck]] });
  let commandCount = 0;
  let destroyed = 0;
  let attacks = 0;
  let blindAttacks = 0;
  let counterAttacks = 0;
  let limited = false;
  let observedTurn = 0;
  const turnEnds: TurnEnd[] = [];
  const legalSamples: LegalSample[] = [];

  while (state.winner === null) {
    if (state.turnNumber > turnLimit || commandCount >= COMMAND_SAFETY_CAP) {
      limited = true;
      break;
    }
    if (state.pendingChoice === null && state.turnNumber !== observedTurn) {
      observedTurn = state.turnNumber;
      const occupied = state.units.length;
      legalSamples.push({
        turnNumber: state.turnNumber,
        player: state.currentPlayer,
        occupied,
        empty: ctx.constants.BOARD_SIZE ** 2 - occupied,
        legal: legalSummonPositions(ctx, state, state.currentPlayer).length,
      });
    }

    const mover = state.pendingChoice?.player ?? state.currentPlayer;
    const command = agents[mover].decide(ctx, state);
    const applied = applyCommand(ctx, state, command);
    destroyed += countDestroyed(applied.events);
    for (const event of applied.events) {
      if (event.type === "attacked") {
        attacks++;
        if (event.blindSpot) blindAttacks++;
        if (event.counter) counterAttacks++;
      } else if (event.type === "turnEnded") {
        const occupancy = applied.state.units.filter((unit) => unit.owner === event.player).length;
        turnEnds.push({
          player: event.player,
          occupancy,
          controlWin:
            applied.state.winner === event.player && occupancy >= ctx.constants.WIN_CONTROL,
        });
      }
    }
    state = applied.state;
    commandCount++;
  }

  return {
    index,
    seed,
    winner: state.winner,
    outcome: outcomeOf(state, limited),
    rounds: state.turnNumber / 2,
    destroyed,
    attacks,
    blindAttacks,
    counterAttacks,
    turnEnds,
    legalSamples,
  };
}

function runJobs(config: WorkerConfig): MatchResult[] {
  const cards = loadCardsWithTestCards();
  const constants = loadConstants();
  const ctx = createContext(cards, constants);
  const deck = buildDeckFromPacks(["vanilla-4"]).cardIds;
  return config.jobs.map((job) =>
    playMatch(ctx, deck, job.index, job.seed, config.turnLimit, config.nodeBudget),
  );
}

async function runParallel(config: WorkerConfig, workerCount: number): Promise<MatchResult[]> {
  if (workerCount === 1) return runJobs(config);
  const buckets = Array.from(
    { length: Math.min(workerCount, config.jobs.length) },
    () => [] as WorkerConfig["jobs"],
  );
  config.jobs.forEach((job, index) => buckets[index % buckets.length]!.push(job));
  let completed = 0;
  const groups = await Promise.all(
    buckets.map(
      (jobs) =>
        new Promise<MatchResult[]>((resolveWorker, rejectWorker) => {
          const worker = new Worker(new URL(import.meta.url), {
            workerData: { ...config, jobs },
            execArgv: ["--experimental-strip-types"],
          });
          worker.on("message", (results: MatchResult[]) => {
            completed += results.length;
            process.stderr.write(`\radjacency: ${completed}/${config.jobs.length}`);
            resolveWorker(results);
          });
          worker.on("error", rejectWorker);
          worker.on("exit", (code) => {
            if (code !== 0) rejectWorker(new Error(`worker exited with code ${code}`));
          });
        }),
    ),
  );
  return groups.flat().sort((a, b) => a.index - b.index);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[index]!;
}

function histogram(values: number[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function controlMetrics(matches: MatchResult[], winControl: number) {
  const threshold = winControl - 1;
  let checks = 0;
  let converted = 0;
  let matchesWithCheck = 0;
  let firstCheckerWon = 0;
  for (const match of matches) {
    for (const player of [0, 1] as PlayerId[]) {
      const turns = match.turnEnds.filter((turn) => turn.player === player);
      for (let i = 0; i < turns.length; i++) {
        if (turns[i]!.occupancy === threshold) {
          checks++;
          if (turns[i + 1]?.controlWin) converted++;
        }
      }
    }
    const firstCheck = match.turnEnds.find((turn) => turn.occupancy >= threshold);
    if (firstCheck) {
      matchesWithCheck++;
      if (match.winner === firstCheck.player) firstCheckerWon++;
    }
  }
  return {
    checks,
    checksPerGame: ratio(checks, matches.length),
    converted,
    conversionRate: ratio(converted, checks),
    matchesWithCheck,
    firstCheckerWinRate: ratio(firstCheckerWon, matchesWithCheck),
  };
}

function summarize(ctx: MatchContext, matches: MatchResult[]) {
  const outcomes = {
    destroy: matches.filter((match) => match.outcome === "destroy").length,
    control: matches.filter((match) => match.outcome === "control").length,
    draw: matches.filter((match) => match.outcome === "draw").length,
    turn_limit: matches.filter((match) => match.outcome === "turn_limit").length,
  };
  const decisive = matches.filter((match) => match.winner === 0 || match.winner === 1);
  const rounds = matches.map((match) => match.rounds);
  const samples = matches.flatMap((match) => match.legalSamples);
  const legal = samples.map((sample) => sample.legal);
  const excluded = samples.map((sample) => sample.empty - sample.legal);
  const attacks = matches.reduce((sum, match) => sum + match.attacks, 0);
  const blind = matches.reduce((sum, match) => sum + match.blindAttacks, 0);
  const counters = matches.reduce((sum, match) => sum + match.counterAttacks, 0);
  return {
    games: matches.length,
    outcomes,
    outcomeRates: {
      destroy: ratio(outcomes.destroy, matches.length),
      control: ratio(outcomes.control, matches.length),
      draw: ratio(outcomes.draw, matches.length),
      turn_limit: ratio(outcomes.turn_limit, matches.length),
    },
    firstPlayerWinRate: ratio(
      decisive.filter((match) => match.winner === 0).length,
      decisive.length,
    ),
    rounds: {
      mean: rounds.reduce((sum, value) => sum + value, 0) / rounds.length,
      median: percentile(rounds, 0.5),
      p90: percentile(rounds, 0.9),
    },
    destroyedPerGame: matches.reduce((sum, match) => sum + match.destroyed, 0) / matches.length,
    attacks: {
      total: attacks,
      blindRate: ratio(blind, attacks),
      counterRate: ratio(counters, attacks),
    },
    control: controlMetrics(matches, ctx.constants.WIN_CONTROL),
    legalSummonPositions: {
      samples: samples.length,
      mean: legal.reduce((sum, value) => sum + value, 0) / legal.length,
      median: percentile(legal, 0.5),
      p90: percentile(legal, 0.9),
      histogram: histogram(legal),
      excludedMean: excluded.reduce((sum, value) => sum + value, 0) / excluded.length,
      constrainedSampleRate: ratio(excluded.filter((value) => value > 0).length, excluded.length),
      byOccupied: Object.fromEntries(
        Array.from(new Set(samples.map((sample) => sample.occupied)))
          .sort((a, b) => a - b)
          .map((occupied) => {
            const group = samples.filter((sample) => sample.occupied === occupied);
            return [
              occupied,
              {
                samples: group.length,
                mean: group.reduce((sum, sample) => sum + sample.legal, 0) / group.length,
                excludedMean:
                  group.reduce((sum, sample) => sum + sample.empty - sample.legal, 0) /
                  group.length,
              },
            ];
          }),
      ),
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cards = loadCardsWithTestCards();
  const constants = loadConstants();
  const ctx = createContext(cards, constants);
  const jobs = Array.from({ length: args.games }, (_, index) => ({
    index,
    seed: args.seedBase + index,
  }));
  const started = Date.now();
  const matches = await runParallel(
    { jobs, turnLimit: args.turnLimit, nodeBudget: args.nodeBudget },
    args.workers,
  );
  process.stderr.write(` (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
  const output = {
    generatedAt: new Date().toISOString(),
    mode: args.mode,
    configuration: {
      games: args.games,
      seedBase: args.seedBase,
      turnLimit: args.turnLimit,
      nodeBudget: args.nodeBudget,
      workers: args.workers,
      pack: "vanilla-4",
    },
    summary: summarize(ctx, matches),
    matches,
  };
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(output, null, 2)}\n`);
  console.log(args.out);
}

if (isMainThread) {
  await main();
} else {
  parentPort!.postMessage(runJobs(workerData as WorkerConfig));
}
