import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { PACK_NAMES } from "./cards.ts";
import { loadPack, packPath } from "./pack-io.ts";
import { makeCtx } from "./state.ts";
import { defaultConfig } from "./types.ts";
import type { ChipMode, Config } from "./types.ts";
import { makeGreedy } from "./ai/greedy.ts";
import type { Ai } from "./ai/greedy.ts";
import { makeBeam } from "./ai/beam.ts";
import { EVAL_PROFILE_NAMES, profileWeights } from "./ai/eval.ts";
import { runMatches } from "./runner.ts";
import { summarise } from "./metrics.ts";

const USAGE = `sim2 self-play

  node --experimental-strip-types sim2/src/cli.ts selfplay [options]

  --games <n>          number of games            (default 20)
  --seed <n>           base seed                  (default 20260830)
  --ai <a,b>           greedy|beam for p0,p1      (default greedy,greedy)
  --eval <a,b>         eval profile for p0,p1     (default territorial,territorial)
                       one of: ${EVAL_PROFILE_NAMES.join(" | ")}
  --pack <name>        ${PACK_NAMES.join(" | ")}  (default placeholder22)
  --chip-mode <m>      catch_up|one_per_turn      (default catch_up)
  --effects <on|off>   card effects and reigu     (default on)
  --round-limit <n>    rounds before a draw       (default 40)
  --label <s>          label written into the summary
  --out <path>         write the summary JSON here
  --games-out <path>   write one JSON line per game here
`;

const parseArgs = (argv: string[]): Map<string, string> => {
  const m = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (val === undefined || val.startsWith("--")) m.set(key, "true");
    else {
      m.set(key, val);
      i += 1;
    }
  }
  return m;
};

const num = (m: Map<string, string>, k: string, d: number): number => {
  const v = m.get(k);
  if (v === undefined) return d;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`--${k} must be a number, got "${v}"`);
  return n;
};

export const makeAi = (name: string, profile: string): Ai => {
  const weights = profileWeights(profile);
  if (name === "greedy") return makeGreedy(weights);
  if (name === "beam") return makeBeam({ weights });
  throw new Error(`unknown ai "${name}" (expected greedy|beam)`);
};

const writeJson = (path: string, data: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const main = (argv: string[]): void => {
  const cmd = argv[0];
  if (cmd === undefined || cmd === "help" || cmd === "--help") {
    process.stdout.write(USAGE);
    return;
  }
  if (cmd !== "selfplay") throw new Error(`unknown command "${cmd}"\n\n${USAGE}`);

  const args = parseArgs(argv.slice(1));
  const chipMode = (args.get("chip-mode") ?? "catch_up") as ChipMode;
  if (chipMode !== "catch_up" && chipMode !== "one_per_turn") {
    throw new Error(`--chip-mode must be catch_up|one_per_turn, got "${chipMode}"`);
  }
  const packName = args.get("pack") ?? "placeholder22";
  const aiNames = (args.get("ai") ?? "greedy,greedy").split(",");
  if (aiNames.length !== 2) throw new Error("--ai needs exactly two names, e.g. greedy,beam");
  const evalNames = (args.get("eval") ?? "territorial,territorial").split(",");
  if (evalNames.length !== 2) {
    throw new Error("--eval needs exactly two profiles, e.g. territorial,aggressive");
  }
  for (const p of evalNames) profileWeights(p); // fail fast on a typo

  const effectsArg = args.get("effects") ?? "on";
  if (effectsArg !== "on" && effectsArg !== "off") {
    throw new Error(`--effects must be on|off, got "${effectsArg}"`);
  }

  const cfg: Config = {
    ...defaultConfig(),
    chipMode,
    effects: effectsArg === "on",
    roundLimit: num(args, "round-limit", defaultConfig().roundLimit),
  };
  const ctx = makeCtx(cfg, loadPack(packPath(packName)));
  const ais: [Ai, Ai] = [
    makeAi(aiNames[0], evalNames[0]),
    makeAi(aiNames[1], evalNames[1]),
  ];

  const games = num(args, "games", 20);
  const seed = num(args, "seed", 20260830);
  const label =
    args.get("label") ??
    `${packName}/${aiNames.join("-vs-")}/${evalNames.join("-vs-")}/${chipMode}/effects-${effectsArg}`;

  const started = process.hrtime.bigint();
  const records = runMatches(ctx, ais, {
    games,
    seed,
    onProgress: (done, total) => {
      process.stderr.write(`  ${label}: ${done}/${total}\n`);
    },
  });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  const summary = {
    ...summarise(label, records),
    config: {
      pack: packName,
      ai: aiNames,
      eval: evalNames,
      chipMode,
      effects: effectsArg,
      roundLimit: cfg.roundLimit,
      seed,
      games,
    },
    elapsedMs: Math.round(elapsedMs),
  };

  const out = args.get("out");
  if (out !== undefined) writeJson(out, summary);
  const gamesOut = args.get("games-out");
  if (gamesOut !== undefined) {
    mkdirSync(dirname(gamesOut), { recursive: true });
    writeFileSync(gamesOut, `${records.map((r) => JSON.stringify(r)).join("\n")}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
};

main(process.argv.slice(2));
