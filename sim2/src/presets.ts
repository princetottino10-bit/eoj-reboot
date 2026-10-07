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
// r0923 = 採用ルール 9/22 (sim2/out/adopted-0922-spec.json), the default from
//   9/23 to 10/3: r0914 with the adopted numbers, no life (the destroyer gains the
//   card's 霊力価), no gap (every eligible defender counters, one at a time in
//   the order the countering side chooses: counterResolve "chosen"). The two
//   income ratchets are chipIncomeSteps [3, 4] (3 chips -> 7, 4 chips -> 8),
//   the team's call of 9/23 (it replaced the first guess [4, 5]).
// r1003 = 10/3テスト案 (sim2/out/sheet-1003), the default since 10/3: r0923
//   with the 10/3 sheet (pack adopted-1003), income 6 -> 7 at 4 chips -> 9 at
//   5 chips (chipIncomeSteps [4, 5, 5]: one +1 per entry reached, so the
//   repeated 5 is the +2 jump), 太極 -2 (floor 1), max HP 19, and a unit at
//   HP 11+ counts 2 toward 占拠 (controlCount "hp"); control at 5 counted that way.
// The experiment scripts set their conditions with flags, not presets, so
// their results still reproduce.
// chipMode catch_up and effects on are the common conditions of that experiment.
// Pure data: no node builtins, so the browser can import it.
import { defaultConfig } from "./types.ts";
import type { Config } from "./types.ts";

export const RULE_PRESET_IDS = ["r1006", "r1003", "r0923", "r0914", "r0913", "r0828"] as const;
export type RulePresetId = (typeof RULE_PRESET_IDS)[number];

/**
 * The rulesets offered as a base in the settings panel (2026-10-04: the older
 * ones are hardly ever called up). The others stay defined: old records,
 * shared URLs, the 調整案 built on them and the tests still name them.
 */
export const OFFERED_RULE_IDS: readonly RulePresetId[] = ["r1006", "r1003", "r0923"];

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

/**
 * 10/3テスト案's income ratchets (6 -> 7 -> 9): 4 chips -> 7, 5 chips -> 9. Each
 * entry reached is +1, so 5 is listed twice for the +2 jump.
 */
export const R1003_CHIP_STEPS: readonly number[] = [4, 5, 5];

/** The preset new games, rooms and the settings page start from. */
export const DEFAULT_RULE_PRESET: RulePresetId = "r1006";

export const RULE_PRESETS: Record<RulePresetId, RulePreset> = {
  r1006: {
    id: "r1006",
    label: "10/6案",
    experiment: "",
    defaultPack: "adopted-1006",
    note: "10/6案: ルールの数値は10/3テスト案と同じ(シートの10/4・10/6のタブもルールの採用値は同じ)。札はシート【調整中_261006】Ver4_2(鎖鬼と首引の姫鬼の範囲を2マスに、上位のHPを伸ばした版)。札の組を選び直せば、10/4採用版(Ver3)や10/6案その1(Ver4_1)でも遊べる。",
    overrides: {} as Partial<Config>,
  },
  r1003: {
    id: "r1003",
    label: "10/3テスト案",
    experiment: "",
    defaultPack: "adopted-1003",
    note: "10/3テスト案: 10/3のシートの数値(23枚、霊具「鬼の酒」を追加)。初期霊力 先手6・後手8、毎ターン収入6(占拠チップ4枚で7、5枚で9)、太極−2(下限1)、属性±2、死角+2、最大HP19。HP11以上の式神は占拠を2マス分と数え、制圧はその数え方で5。生命価なし・隙なし・反撃の順番は反撃側が選ぶ(採用ルール 9/22 と同じ)。どちらかが2回目の山札切れを起こしたら、その補充が終わったところで終了し、占拠の多い方の勝ち(同じなら引き分け)。",
    overrides: {
      ...R0913_OVERRIDES,
      startMana: [6, 8],
      baseIncome: 6,
      chipIncomeSteps: R1003_CHIP_STEPS.slice(),
      taijiDiscount: 2,
      taijiFloor: 1,
      attrBonus: 2,
      blindBonus: 2,
      maxHp: 19,
      lifeValueEnabled: false,
      refundMode: "killer_half",
      killRewardBase: "card",
      killRewardBonus: 0,
      counterMode: "all",
      counterResolve: "chosen",
      controlCount: "hp",
      controlCountThreshold: 11,
      controlWin: 5,
      // the paper rule the team plays (10/3): the 2nd 山札切れ ends the game, more 占拠 wins
      deckOutMode: "second",
    },
  },
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
// 10/6案 plays the 10/3 rule numbers (only the cards changed)
RULE_PRESETS.r1006.overrides = RULE_PRESETS.r1003.overrides;

/** Packs selectable from the play UI and the online lobby. */
export const PLAYABLE_PACKS = ["adopted-1006", "adopted-1006a", "adopted-1004", "adopted-1003", "adopted-0922", "shuten-kyuryu", "tsukumo-miyako", "kyubi-ryu"] as const;
export type PlayablePack = (typeof PLAYABLE_PACKS)[number];

/** What a pack is called on screen (the ids stay in files, URLs and records). */
export const PACK_LABELS: Record<PlayablePack, string> = {
  "adopted-1006": "10/6案その2の札(範囲2マス)",
  "adopted-1006a": "10/6案その1の札",
  "adopted-1004": "10/4採用版の札",
  "adopted-1003": "10/3版の札",
  "adopted-0922": "9/22版の札",
  "shuten-kyuryu": "9/13版の札",
  "tsukumo-miyako": "付喪神・京の鬼(効果なし)",
  "kyubi-ryu": "九尾・竜(効果なし)",
};

/** The on-screen name of a pack; an unknown id is shown as it is. */
export const packLabel = (id: string): string => (isPlayablePack(id) ? PACK_LABELS[id] : id);

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
