import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ALL_PACK_NAMES } from "./cards.ts";
import { loadPack, packPath } from "./pack-io.ts";
import { makeCtx } from "./state.ts";
import { defaultConfig } from "./types.ts";
import { RULE_PRESET_IDS, isRulePresetId, presetConfig } from "./presets.ts";
import { schemaHelpText } from "./config-schema.ts";
import { isSettingPresetId, SETTING_PRESET_IDS, settingPresetSettings } from "./setting-presets.ts";
import { settingsConfig, settingsPack } from "./settings.ts";
import type { CardPack } from "./cards.ts";
import type {
  AoeMode,
  ChipMode,
  Config,
  ControlCount,
  ControlHold,
  ControlWinMode,
  CounterMode,
  CounterResolve,
  DeckOutMode,
  HandMode,
  IncomeMode,
  IncomeTiming,
  KillRewardBase,
  KillRewardCondition,
  RefundMode,
  SummonCostScale,
  UnderdogBy,
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

9/23 optional settings (defaults = today's rules; each overrides the preset / bundle):

  --bundle <id>                a built-in 調整案 (${SETTING_PRESET_IDS.join(" | ")}): its base
                               preset, pack and card numbers, then its rule values. Replaces
                               --preset and --pack; the flags below still override it.
  --control-count <cells|hp|cost>     制圧の数え方 (default cells)
  --control-count-threshold <n>       2マス分になる基準 (default 11; hp 11 / cost 8 discussed)
  --control-win-mode <hold|points>    制圧の勝ち方 (default hold)
  --control-points-to-win <n>         勝ちに必要な制圧点 (default 2)
  --income-mode <ratchet|current>     収入の決め方 (default ratchet)
  --kill-reward-condition <always|behind|upset>  撃破報酬の条件 (default always)
  --underdog-income <n>               劣勢ボーナス 0-3 (default 0)
  --underdog-discount <n>             劣勢時の大型割引 0-3 (default 0)
  --underdog-discount-min-cost <n>    大型割引の対象コスト (default 8)
  --underdog-by <cells|chips|both>    劣勢の判定 (default cells; both = one step per condition)
  --control-win-late <n>              終盤の制圧ライン 0-9 (default 0 = off)
  --instant-win-cells <n>             コールド勝ち 0-18 (default 0 = off)
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

/** An integer flag within [lo, hi] (the CONFIG_SCHEMA range). */
const intIn = (m: Map<string, string>, k: string, lo: number, hi: number, d: number): number => {
  const n = num(m, k, d);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`--${k} must be an integer ${lo}..${hi}, got "${m.get(k)}"`);
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
  const bundleArg = args.get("bundle");
  if (bundleArg !== undefined && !isSettingPresetId(bundleArg)) {
    throw new Error(`--bundle must be ${SETTING_PRESET_IDS.join("|")}, got "${bundleArg}"`);
  }
  if (bundleArg !== undefined && (args.has("preset") || args.has("pack"))) {
    throw new Error("--bundle already names its preset and pack; drop --preset / --pack");
  }
  const bundle = bundleArg === undefined ? null : settingPresetSettings(bundleArg);
  const packName = bundle?.pack ?? args.get("pack") ?? "placeholder22";
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
  const base = bundle !== null ? settingsConfig(bundle) : presetArg === undefined ? defaultConfig() : presetConfig(presetArg);
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
    controlCount: pick("control-count", ["cells", "hp", "cost"] as const, base.controlCount) as ControlCount,
    controlCountThreshold: intIn(args, "control-count-threshold", 1, 20, base.controlCountThreshold),
    controlWinMode: pick("control-win-mode", ["hold", "points"] as const, base.controlWinMode) as ControlWinMode,
    controlPointsToWin: intIn(args, "control-points-to-win", 1, 9, base.controlPointsToWin),
    incomeMode: pick("income-mode", ["ratchet", "current"] as const, base.incomeMode) as IncomeMode,
    killRewardCondition: pick(
      "kill-reward-condition",
      ["always", "behind", "upset"] as const,
      base.killRewardCondition,
    ) as KillRewardCondition,
    underdogIncome: intIn(args, "underdog-income", 0, 3, base.underdogIncome),
    underdogDiscount: intIn(args, "underdog-discount", 0, 3, base.underdogDiscount),
    underdogDiscountMinCost: intIn(args, "underdog-discount-min-cost", 1, 20, base.underdogDiscountMinCost),
    underdogBy: pick("underdog-by", ["cells", "chips", "both"] as const, base.underdogBy) as UnderdogBy,
    controlWinLate: intIn(args, "control-win-late", 0, 9, base.controlWinLate),
    instantWinCells: intIn(args, "instant-win-cells", 0, 18, base.instantWinCells),
  };
  const printed = loadPack(packPath(packName));
  const pack: CardPack = bundle === null ? printed : settingsPack(bundle, printed);
  const ctx = makeCtx(cfg, pack);
  const ais: [AiSeat, AiSeat] = [
    makeAi(aiNames[0], evalNames[0]),
    makeAi(aiNames[1], evalNames[1]),
  ];

  const games = num(args, "games", 20);
  const seed = num(args, "seed", 20260830);
  const label =
    args.get("label") ??
    `${bundleArg === undefined ? "" : `${bundleArg}/`}${packName}/${aiNames.join("-vs-")}/${evalNames.join("-vs-")}/${chipMode}/effects-${effectsArg}`;

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
      preset: bundle?.rule ?? presetArg ?? null,
      bundle: bundleArg ?? null,
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
      controlCount: cfg.controlCount,
      controlCountThreshold: cfg.controlCountThreshold,
      controlWinMode: cfg.controlWinMode,
      controlPointsToWin: cfg.controlPointsToWin,
      incomeMode: cfg.incomeMode,
      killRewardCondition: cfg.killRewardCondition,
      underdogIncome: cfg.underdogIncome,
      underdogDiscount: cfg.underdogDiscount,
      underdogDiscountMinCost: cfg.underdogDiscountMinCost,
      underdogBy: cfg.underdogBy,
      controlWinLate: cfg.controlWinLate,
      instantWinCells: cfg.instantWinCells,
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
