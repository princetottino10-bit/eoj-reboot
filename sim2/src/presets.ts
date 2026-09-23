// Rule presets: the single definition of "9/13 test rules" and "8/28 rules"
// shared by the CLI, the local play UI and the online server.
//
// r0913 and r0828 follow RESULTS-EXP0913B.md, except that every preset
// starts from the taiji discount the team now treats as the base (1; the
// experiments ran with 2), and r0913 / r0914 keep jutsu area attacks off
// allies as the 9/13 procedure says (no shuten-kyuryu card is jutsu + area):
//   r0913 = K0   (9/13 ruleset, incomeTiming turn_end - the Sec.3 common condition)
//   r0828 = K8ts (8/28 rules with the 8/28 income timing, turn_start)
// r0914 = the rules as the team played them until 9/22: r0913 with a third
//   chip step (3/4/5 chips -> income +1/+2/+3). Not an experiment condition.
// r0923 = 採用ルール 9/22 (sim2/out/adopted-0922-spec.json), the default since
//   9/23: r0914 with the adopted numbers, no life (the destroyer gains the
//   card's 霊力価), no gap (every eligible defender counters, one at a time in
//   the order the countering side chooses: counterResolve "chosen"). The two
//   income ratchets are chipIncomeSteps [3, 4] (3 chips -> 7, 4 chips -> 8),
//   the team's call of 9/23 (it replaced the first guess [4, 5]).
// The experiment scripts set their conditions with flags, not presets, so
// their results still reproduce.
// chipMode catch_up and effects on are the common conditions of that experiment.
// Pure data: no node builtins, so the browser can import it.
import { defaultConfig } from "./types.ts";
import type { Config } from "./types.ts";

export const RULE_PRESET_IDS = ["r0923", "r0914", "r0913", "r0828"] as const;
export type RulePresetId = (typeof RULE_PRESET_IDS)[number];

export type RulePreset = {
  id: RulePresetId;
  label: string;
  /** Which RESULTS-EXP0913B.md condition this preset reproduces. */
  experiment: string;
  /** Pack the team uses with this ruleset by default. */
  defaultPack: string;
  /** One line for the lobby: what sets this preset apart. */
  note: string;
  overrides: Partial<Config>;
};

/** The team's base taiji discount for every preset (the engine default stays 2 for the 8/28 spec tests). */
const BASE_TAIJI_DISCOUNT = 1;

const R0913_OVERRIDES: Partial<Config> = {
  taijiDiscount: BASE_TAIJI_DISCOUNT,
  chipMode: "catch_up",
  effects: true,
  incomeTiming: "turn_end",
  refundMode: "killer_half",
  inheritSummon: true,
  counterMode: "gap",
  mulligan: true,
  controlHold: "next_turn_end",
  handMode: "refill_to_5",
  summonLimit: null,
  // the 9/13 procedure: 術式・範囲 does not hit allies (not an EXP-0913B condition)
  jutsuAoeSparesAllies: true,
};

/**
 * The chip counts at which 採用ルール 9/22's two income ratchets (6 -> 7 -> 8)
 * happen: 3 chips -> 7, 4 chips -> 8 (decided 9/23; the first guess was [4, 5]).
 */
export const R0923_CHIP_STEPS: readonly number[] = [3, 4];

export const RULE_PRESETS: Record<RulePresetId, RulePreset> = {
  r0923: {
    id: "r0923",
    label: "採用ルール 9/22",
    experiment: "",
    defaultPack: "adopted-0922",
    note: "採用ルール 9/22: 初期霊力 先手6・後手8、毎ターン収入6(占拠チップ3枚で7、4枚で8)、太極−1、属性±2、死角+2、最大HP15。生命価なし(生命の増減・生命勝ちなし): 撃破した側がそのカードの霊力価を得る。隙なし: 反撃範囲に入っている被弾者は全員反撃し、反撃側が順番を選ぶ(案A)。",
    overrides: {
      ...R0913_OVERRIDES,
      startMana: [6, 8],
      baseIncome: 6,
      chipIncomeSteps: R0923_CHIP_STEPS.slice(),
      attrBonus: 2,
      blindBonus: 2,
      maxHp: 15,
      lifeValueEnabled: false,
      refundMode: "killer_half",
      killRewardBase: "card",
      killRewardBonus: 0,
      counterMode: "all",
      counterResolve: "chosen",
    },
  },
  r0914: {
    id: "r0914",
    label: "9/14ルール(旧・現行)",
    experiment: "",
    defaultPack: "shuten-kyuryu",
    note: "9/14ルール(9/22まで現行ルール) = 9/13テストルール + チップ3/4/5枚で収入+1/+2/+3。太極の軽減は1。",
    overrides: { ...R0913_OVERRIDES, chipIncomeSteps: [3, 4, 5] },
  },
  r0913: {
    id: "r0913",
    label: "9/13テストルール",
    experiment: "K0",
    defaultPack: "shuten-kyuryu",
    note: "9/13テストルール = EXP-0913B K0: 撃破した側が霊力獲得・継承召喚・反撃は隙位置のみ・マリガン・制圧はターン終了時判定・収入はターン終了時・術式の範囲攻撃は味方に当たらない。太極の軽減は1。",
    overrides: R0913_OVERRIDES,
  },
  r0828: {
    id: "r0828",
    label: "8/28ルール",
    experiment: "K8ts",
    defaultPack: "shuten-kyuryu",
    note: "8/28ルール = K8ts: 撃破された側に還付・継承なし・反撃は範囲内全員・マリガンなし・制圧リーチはターン開始時判定。太極の軽減は1。",
    overrides: {
      taijiDiscount: BASE_TAIJI_DISCOUNT,
      chipMode: "catch_up",
      effects: true,
      incomeTiming: "turn_start",
      refundMode: "half",
      inheritSummon: false,
      counterMode: "all",
      mulligan: false,
      controlHold: "next_turn_start",
      handMode: "refill_to_5",
      summonLimit: null,
    },
  },
};

/** Packs selectable from the play UI and the online lobby. */
export const PLAYABLE_PACKS = ["adopted-0922", "shuten-kyuryu", "tsukumo-miyako", "kyubi-ryu"] as const;
export type PlayablePack = (typeof PLAYABLE_PACKS)[number];

export const isRulePresetId = (v: unknown): v is RulePresetId =>
  typeof v === "string" && (RULE_PRESET_IDS as readonly string[]).includes(v);

export const isPlayablePack = (v: unknown): v is PlayablePack =>
  typeof v === "string" && (PLAYABLE_PACKS as readonly string[]).includes(v);

/** defaultConfig() + the preset + caller overrides (applied last). */
export const presetConfig = (id: RulePresetId, over: Partial<Config> = {}): Config => {
  const cfg: Config = { ...defaultConfig(), ...RULE_PRESETS[id].overrides, ...over };
  // arrays are copied so a caller editing its Config never reaches the preset table
  return { ...cfg, startMana: [cfg.startMana[0], cfg.startMana[1]], chipIncomeSteps: cfg.chipIncomeSteps.slice() };
};
