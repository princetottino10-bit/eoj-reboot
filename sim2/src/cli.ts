import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ALL_PACK_NAMES } from "./cards.ts";
import { loadPack, packPath } from "./pack-io.ts";
import { makeCtx } from "./state.ts";
import { defaultConfig } from "./types.ts";
import { RULE_PRESET_IDS, isRulePresetId, presetConfig } from "./presets.ts";
import { schemaHelpText } from "./config-schema.ts";
import type {
  AoeMode,
  ChipMode,
  Config,
  ControlHold,
  CounterMode,
  CounterResolve,
  DeckOutMode,
  HandMode,
  IncomeTiming,
  KillRewardBase,
  RefundMode,
  SummonCostScale,
} from "./types.ts";
import { AI_KINDS, makeAi } from "./ai/index.ts";
import type { AiSeat } from "./ai/index.ts";
import { EVAL_PROFILE_NAMES, profileWeights } from "./ai/eval.ts";
import { runMatches } from "./runner.ts";
import { summarise } from "./metrics.ts";

const USAGE = `sim2 self-play

  node --experimental-strip-types sim2/src/cli.ts selfplay [options]

  --preset <id>        rule preset as the base config: ${RULE_PRESET_IDS.join(" | ")}
                       (r0923 = 採用ルール 9/22, the default rules since 9/23; play it with
                       --pack adopted-0922. r0913 = 9/13 test rules = EXP-0913B K0,
                       r0828 = 8/28 rules = K8ts). Every flag below still overrides the preset.
  --games <n>          number of games            (default 20)
  --seed <n>           base seed                  (default 20260830)
  --ai <a,b>           ${AI_KINDS.join("|")} for p0,p1 (default greedy,greedy)
                       strong = the AI-table opponent (two-ply search, own discard/mulligan)
  --eval <a,b>         eval profile for p0,p1     (default territorial,territorial)
                       one of: ${EVAL_PROFILE_NAMES.join(" | ")}
  --pack <name>        ${ALL_PACK_NAMES.join(" | ")}  (default placeholder22)
  --chip-mode <m>      catch_up|one_per_turn      (default catch_up)
  --effects <on|off>   card effects and reigu     (default on)
  --round-limit <n>    rounds before a draw       (default 40)
  --label <s>          label written into the summary
  --out <path>         write the summary JSON here
  --games-out <path>   write one JSON line per game here

EXP-0913 rule variants (every default reproduces the pre-EXP behaviour):

  --summon-limit <n|none>      summons per turn           (default none)
  --aoe-mode <on|off|no_ff>    area attack handling       (default on)
  --jutsu-aoe-spares-allies <on|off>  jutsu area attacks skip allies (default off; on in r0913 / r0914)
  --counter-mode <all|single|gap>  who counters           (default all)
  --counter-resolve <sum|chosen>   several counters: summed, or one at a time in
                               the countering side's order (default sum; chosen in r0923)
  --kill-reward-base <half_floor|half_ceil|full|zero|card>  destruction mana
                               (default half_floor; card = the card's 霊力価, r0923)
  --attack-cost-delta <n>      added to attack costs      (default 0)
  --refund-mode <half|none|killer_half>  destruction refund (default half)
  --summon-cost-scale <full|half>                         (default full)
  --move-on-kill <on|off>      step onto the freed cell   (default off)
  --life-value <on|off>        life loss and life defeat  (default on)
  --deck-out-mode <none|second>                           (default none)
  --income-timing <turn_start|turn_end>                   (default turn_start)
  --base-income <n>            mana per income tick       (default 3)

EXP-0913B rule variants (defaults again reproduce the pre-EXP behaviour):

  --inherit-summon <on|off>    replace own unit with a pricier one (default off)
  --mulligan <on|off>          one mulligan each before turn 1     (default off)
  --control-hold <next_turn_start|next_turn_end>        (default next_turn_start)
  --hand-mode <refill_to_5|replace_discarded>           (default refill_to_5)
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

const writeJson = (path: string, data: unknown): void => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const main = (argv: string[]): void => {
  const cmd = argv[0];
  if (cmd === undefined || cmd === "help" || cmd === "--help") {
    process.stdout.write(USAGE);
    process.stdout.write(
      `
Rule variables (CONFIG_SCHEMA - the same list the play UI and the online settings panel show):

${schemaHelpText()}
`,
    );
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

  const pick = <T extends string>(key: string, allowed: readonly T[], d: T): T => {
    const v = args.get(key);
    if (v === undefined) return d;
    if (!(allowed as readonly string[]).includes(v)) {
      throw new Error(`--${key} must be ${allowed.join("|")}, got "${v}"`);
    }
    return v as T;
  };
  const onOff = (key: string, d: boolean): boolean =>
    pick(key, ["on", "off"] as const, d ? "on" : "off") === "on";

  const summonLimitArg = args.get("summon-limit") ?? "none";
  const summonLimit =
    summonLimitArg === "none" || summonLimitArg === "null" ? null : Number(summonLimitArg);
  if (summonLimit !== null && (!Number.isInteger(summonLimit) || summonLimit < 1)) {
    throw new Error(`--summon-limit must be "none" or a positive integer`);
  }

  const presetArg = args.get("preset");
  if (presetArg !== undefined && !isRulePresetId(presetArg)) {
    throw new Error(`--preset must be ${RULE_PRESET_IDS.join("|")}, got "${presetArg}"`);
  }
  const base = presetArg === undefined ? defaultConfig() : presetConfig(presetArg);
  const cfg: Config = {
    ...base,
    chipMode,
    effects: effectsArg === "on",
    roundLimit: num(args, "round-limit", base.roundLimit),
    baseIncome: num(args, "base-income", base.baseIncome),
    summonLimit,
    aoeMode: pick("aoe-mode", ["on", "off", "no_ff"] as const, base.aoeMode) as AoeMode,
    jutsuAoeSparesAllies: onOff("jutsu-aoe-spares-allies", base.jutsuAoeSparesAllies),
    counterMode: pick(
      "counter-mode",
      ["all", "single", "gap"] as const,
      base.counterMode,
    ) as CounterMode,
    counterResolve: pick("counter-resolve", ["sum", "chosen"] as const, base.counterResolve) as CounterResolve,
    killRewardBase: pick(
      "kill-reward-base",
      ["half_floor", "half_ceil", "full", "zero", "card"] as const,
      base.killRewardBase,
    ) as KillRewardBase,
    attackCostDelta: num(args, "attack-cost-delta", base.attackCostDelta),
    refundMode: pick(
      "refund-mode",
      ["half", "none", "killer_half"] as const,
      base.refundMode,
    ) as RefundMode,
    summonCostScale: pick(
      "summon-cost-scale",
      ["full", "half"] as const,
      base.summonCostScale,
    ) as SummonCostScale,
    moveOnKill: onOff("move-on-kill", base.moveOnKill),
    lifeValueEnabled: onOff("life-value", base.lifeValueEnabled),
    deckOutMode: pick("deck-out-mode", ["none", "second"] as const, base.deckOutMode) as DeckOutMode,
    incomeTiming: pick(
      "income-timing",
      ["turn_start", "turn_end"] as const,
      base.incomeTiming,
    ) as IncomeTiming,
    inheritSummon: onOff("inherit-summon", base.inheritSummon),
    mulligan: onOff("mulligan", base.mulligan),
    controlHold: pick(
      "control-hold",
      ["next_turn_start", "next_turn_end"] as const,
      base.controlHold,
    ) as ControlHold,
    handMode: pick(
      "hand-mode",
      ["refill_to_5", "replace_discarded"] as const,
      base.handMode,
    ) as HandMode,
  };
  const ctx = makeCtx(cfg, loadPack(packPath(packName)));
  const ais: [AiSeat, AiSeat] = [
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
      preset: presetArg ?? null,
      pack: packName,
      ai: aiNames,
      eval: evalNames,
      chipMode,
      effects: effectsArg,
      roundLimit: cfg.roundLimit,
      seed,
      games,
      baseIncome: cfg.baseIncome,
      summonLimit: cfg.summonLimit,
      aoeMode: cfg.aoeMode,
      jutsuAoeSparesAllies: cfg.jutsuAoeSparesAllies,
      counterMode: cfg.counterMode,
      counterResolve: cfg.counterResolve,
      killRewardBase: cfg.killRewardBase,
      startMana: cfg.startMana,
      chipIncomeSteps: cfg.chipIncomeSteps,
      maxHp: cfg.maxHp,
      attackCostDelta: cfg.attackCostDelta,
      refundMode: cfg.refundMode,
      summonCostScale: cfg.summonCostScale,
      moveOnKill: cfg.moveOnKill,
      lifeValueEnabled: cfg.lifeValueEnabled,
      deckOutMode: cfg.deckOutMode,
      incomeTiming: cfg.incomeTiming,
      inheritSummon: cfg.inheritSummon,
      mulligan: cfg.mulligan,
      controlHold: cfg.controlHold,
      handMode: cfg.handMode,
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
