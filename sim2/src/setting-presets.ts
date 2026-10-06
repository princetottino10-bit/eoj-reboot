// Setting bundles: a whole balance proposal under one name — the base rule
// preset it is expressed against, the rule variables it changes and the card
// numbers it changes.
//
// A bundle (「調整案」 in the UI) is deliberately NOT a new base rule, and not
// a RulePreset: it stays a (RULE_PRESETS entry + ConfigPatch + CardOverrides)
// triple, so picking one is the same kind of change as editing the panel by
// hand — the "+N項目変更" badge counts it, the share URL carries it, a
// mid-match proposal can send the part that may change now, and 現行ルール
// (r0914) itself never moves.
//
// Values that already equal the base rule or the printed card are kept in the
// table on purpose (the sheet prints them, and they pin the intent if a pack
// ever changes); settingPresetSettings drops them from the diff.
// Pure data: no node builtins, so the browser can import it.
import { parseCardOverrides } from "./card-overrides.ts";
import type { CardOverrides } from "./card-overrides.ts";
import type { CardPack } from "./cards.ts";
import { configChanges, parseConfigPatch } from "./config-schema.ts";
import type { ConfigPatch } from "./config-schema.ts";
import { DEFAULT_RULE_PRESET, isPlayablePack, isRulePresetId, presetConfig, RULE_PRESETS } from "./presets.ts";
import type { PlayablePack, RulePresetId } from "./presets.ts";
import { changedItemCount, normalizeSettings, parseSettings, settingsConfig } from "./settings.ts";
import type { GameSettings } from "./settings.ts";

export const SETTING_PRESET_IDS = ["ryuDraft", "lineUp", "adj15", "adj15life", "incomeNow", "comeback", "bigComeback", "coldFive", "freeSummon"] as const;
export type SettingPresetId = (typeof SETTING_PRESET_IDS)[number];

export type SettingPreset = {
  id: SettingPresetId;
  /** Japanese name shown in the picker. */
  label: string;
  /** Where the numbers come from and what they do, in one or two lines. */
  note: string;
  /** Base rule preset the bundle is expressed against. */
  rule: RulePresetId;
  /** Pack the card numbers belong to. */
  pack: PlayablePack;
  /** Rule variables the bundle sets. */
  config: ConfigPatch;
  /** Card numbers the bundle sets, as the sheet prints them. */
  cards: CardOverrides;
  /**
   * true = a quick option laid on top of whatever base rule, pack and cards
   * are selected: picking it sets only `config` (no cards). `rule` / `pack`
   * are then just what the bundle is checked and shown against on its own.
   */
  overlay?: boolean;
};

/**
 * 調整案1.5倍 — the 9/15 balance sheet's 霊力1.5倍 / 能力1.5倍 tab, as the
 * coordinator extracted it into sim2/out/adj15-spec.json.
 *
 * Not represented here (they are not part of this bundle's data):
 *   - 鎖鬼(sk05) の反撃範囲 123 and 僵尸公主 → 玖龍公主 の改名: sheet-wide
 *     changes, not this proposal's numbers.
 *   - 収入のラチェット段数: the sheet has two steps (6→7→8), the bundle keeps
 *     現行ルール's three (3/4/5枚 → 6,7,8,9).
 *
 * 最大HP(maxHp) is not on the sheet: it is 15, the team's decision of 9/19,
 * because 現行ルール's 10 would cap 茨木 11+3, 酒呑 12+3 and 玖龍街 15 in play
 * and take the 能力1.5倍 back out of the biggest cards.
 */
const ADJ15: SettingPreset = {
  id: "adj15",
  label: "調整案1.5倍",
  note: "9/15「デッキ(一門)設計」シートの調整タブ(霊力1.5倍・能力1.5倍)。攻撃コスト=ATKの50%(四捨五入)、属性効果±3、初期霊力6/8、毎ターン収入6から、太極−1、最大HP15。基準は9/14ルール(旧・現行)。",
  rule: "r0914",
  pack: "shuten-kyuryu",
  config: {
    startMana: [6, 8],
    baseIncome: 6,
    attrBonus: 3,
    // not on the sheet: 1.5x of 現行ルール's 10, so the biggest cards are not capped
    maxHp: 15,
    taijiDiscount: 1,
    killRewardBase: "half_floor",
    chipIncomeSteps: [3, 4, 5],
  },
  cards: {
    // 灯籠の精 / 古箪笥 never attack: the sheet gives them no 攻撃コスト・ATK.
    sk01: { summonCost: 3, hp: 3, lifeValue: 1 },
    sk02: { summonCost: 3, attackCost: 2, hp: 3, atk: 3, lifeValue: 1 },
    sk03: { summonCost: 4, attackCost: 2, hp: 4, atk: 3, lifeValue: 1 },
    sk04: { summonCost: 4, attackCost: 2, hp: 4, atk: 3, lifeValue: 1 },
    sk05: { summonCost: 4, attackCost: 2, hp: 5, atk: 3, lifeValue: 2 },
    sk06: { summonCost: 5, attackCost: 2, hp: 7, atk: 3, lifeValue: 2 },
    sk07: { summonCost: 4, hp: 5, lifeValue: 2 },
    sk08: { summonCost: 5, attackCost: 2, hp: 6, atk: 3, lifeValue: 2 },
    sk09: { summonCost: 8, attackCost: 2, hp: 9, atk: 3, lifeValue: 2 },
    sk10: { summonCost: 6, attackCost: 2, hp: 8, atk: 3, lifeValue: 2 },
    sk11: { summonCost: 6, attackCost: 2, hp: 8, atk: 3, lifeValue: 2 },
    sk12: { summonCost: 7, attackCost: 2, hp: 8, atk: 3, lifeValue: 2 },
    sk13: { summonCost: 7, attackCost: 3, hp: 8, atk: 4, lifeValue: 2 },
    sk14: { summonCost: 8, attackCost: 3, hp: 9, atk: 4, lifeValue: 3 },
    sk15: { summonCost: 10, attackCost: 3, hp: 11, atk: 5, lifeValue: 3 },
    sk16: { summonCost: 11, attackCost: 4, hp: 12, atk: 6, lifeValue: 3 },
    sk17: { summonCost: 12, attackCost: 1, hp: 15, atk: 2, lifeValue: 4 },
    // 霊具(sk18-sk22)の使用コストは据え置き
  },
};

/**
 * 調整案1.5倍+生命22 — the same sheet numbers with one thing the sheet leaves
 * at its old value: 初期生命.
 *
 * Measured on 2026-09-21 (2000 games per cell, greedy / beam / strong, same
 * seeds, sim2/out/sim-adj15/): with 生命15, 能力1.5倍 turns the game into a
 * damage race — against the strong AI 制圧勝ち falls 68.4% → 39.5% and the
 * loser is left on 2.5 life. 生命22 puts it back to 61.1% without overshooting,
 * and because games last a little longer (9.5 → 11.0 rounds) the big cards
 * come back too: 茨木 38.0 → 49.8%, 酒呑 13.9 → 22.2%, 玖龍街 6.1 → 11.4%.
 *
 * 霊力上限(manaCap) is deliberately NOT raised: the same runs show it never
 * binds (0.00 mana lost to the cap per income, cap22 identical to adj15).
 */
const ADJ15_LIFE: SettingPreset = {
  ...ADJ15,
  id: "adj15life",
  label: "調整案1.5倍+生命22",
  note: "調整案1.5倍の数値そのままに、シートが据え置いた初期生命を15→22(1.5倍)にした版。AI検証では、制圧勝ちと生命勝ちの比率が現行ルールに近づき、茨木・酒呑・玖龍街が盤に出る回数も戻ります。霊力上限は検証で効いていなかったので15のままです。",
  config: { ...ADJ15.config, startLife: 22 },
  cards: { ...ADJ15.cards },
};

/**
 * 調整案: 今の占拠で収入(開始時) — the team's next trial (9/23): 採用ルール 9/22
 * with the income judged on the 占拠 as it stands when it is paid, at the start
 * of your own turn. A break on the opponent's turn lowers your next income;
 * the opening turns are paid exactly as under turn_end (no income on either
 * player's first turn, the start mana 6/8 is that turn's budget).
 */
const INCOME_NOW: SettingPreset = {
  id: "incomeNow",
  label: "調整案: 今の占拠で収入(開始時)",
  note: "採用ルール 9/22 の収入を、自分のターン開始時に「その時点の占拠数」で決める案。相手のターン中に占拠を崩されると次の収入が下がる(チップは減らないラチェットをやめる)。",
  rule: "r0923",
  pack: "adopted-0922",
  config: { incomeMode: "current", incomeTiming: "turn_start" },
  cards: {},
};

/** 調整案: 逆転しやすく — 今の占拠で収入(開始時) + two anti-snowball knobs. */
const COMEBACK: SettingPreset = {
  id: "comeback",
  label: "調整案: 逆転しやすく",
  note: "「今の占拠で収入(開始時)」に、撃破報酬は占拠が相手以下のときだけ・占拠で負けている側は収入+1(劣勢ボーナス)を足した案。勝っている側が撃破で霊力を積み増す雪だるま式の展開を抑える。",
  rule: "r0923",
  pack: "adopted-0922",
  config: { ...INCOME_NOW.config, killRewardCondition: "behind", underdogIncome: 1 },
  cards: {},
};

/**
 * 調整案: 大型で逆転 — the paper rule "HP 11以上はHPバーのマーカー2つ": a unit
 * whose current HP is 11+ counts 2 for control and chips, and a cost-8+
 * shikigami is 1 cheaper to summon / inherit per 劣勢 condition met (behind on
 * 占拠: −1, behind on chips: −1 more; underdogBy "both"). The ratchet stays.
 * (controlCount "cost" and underdogBy cells / chips stay available as options.)
 */
const BIG_COMEBACK: SettingPreset = {
  id: "bigComeback",
  label: "調整案: 大型で逆転",
  note: "HP11以上の式神は制圧・チップで2マス分(ダメージで11を下回れば1マス)。召喚コスト8以上の式神の召喚・継承召喚は、占拠数で負けていれば−1、チップで負けていればさらに−1(両方なら−2。大型に付ける効果の試作)。基準は採用ルール 9/22、収入のラチェットはそのまま。",
  rule: "r0923",
  pack: "adopted-0922",
  config: { controlCount: "hp", controlCountThreshold: 11, underdogDiscount: 1, underdogDiscountMinCost: 8, underdogBy: "both" },
  cards: {},
};

/**
 * 5体目で即勝ち (10/3 designer request): 即勝ち at 5 of your own
 * units, judged the moment an action has resolved — so placing the fifth
 * wins on the spot. An overlay: it goes on top of the selected ruleset.
 */
const COLD_FIVE: SettingPreset = {
  id: "coldFive",
  label: "5体目で即勝ち",
  note: "今のルールに重ねる: 盤上の自分の式神が5体になった瞬間に勝ち(即勝ち5・判定は置いた瞬間・数え方は式神の数。マヨヒガで隠れた式神は数えない)。基準ルール・パック・カードはそのまま。",
  rule: DEFAULT_RULE_PRESET,
  pack: RULE_PRESETS[DEFAULT_RULE_PRESET].defaultPack as PlayablePack,
  config: { instantWinCells: 5, instantWinTiming: "immediate", instantWinCount: "units" },
  cards: {},
  overlay: true,
};

/**
 * 召喚攻撃はコストなし (10/3 designer request): on the turn a unit is
 * summoned (継承召喚 included), its first attack that turn skips the attack
 * cost. An overlay like 5体目で即勝ち: it goes on top of the selected ruleset.
 */
const FREE_SUMMON: SettingPreset = {
  id: "freeSummon",
  label: "召喚攻撃はコストなし",
  note: "今のルールに重ねる: 式神を召喚した手番に、その式神の1回目の攻撃は攻撃コストなし(継承召喚で置いた式神も。置き換えた式神が攻撃済みなら攻撃できないのは同じ)。【飲酒】などの追加の霊力は払う。基準ルール・パック・カードはそのまま。",
  rule: DEFAULT_RULE_PRESET,
  pack: RULE_PRESETS[DEFAULT_RULE_PRESET].defaultPack as PlayablePack,
  config: { freeSummonAttack: "optional", freeSummonAttackInherit: true },
  cards: {},
  overlay: true,
};

/**
 * 並べて勝つ・重いので巻き返す (2026-10-05 designer proposal, measured with
 * sim2/scripts/speed-sweep.ts --set victim): cheap shikigami fill the board
 * single-target, area attacks belong to the cost-7+ ones, the side behind
 * gets them cheaper and may strike at once, and losing a unit pays 1.
 * Five AIs: 先手 48-55%, about half the kills by cost-7+ cards.
 */
const LINE_UP: SettingPreset = {
  id: "lineUp",
  label: "並べて勝つ・重いので巻き返す案",
  note: "低コスを並べて勝ち、負けている側は高コスの範囲攻撃で巻き返す案。5体目で即勝ち(置いた瞬間・式神の数)、召喚は1ターン2体まで。範囲攻撃はコスト7以上だけ(僵尸公主・茨木童子を範囲に、鎖鬼・一目鬼を単体に)。占拠が相手より少ない側は、コスト7以上の召喚が3安い。召喚した手番の1回目の攻撃はコストなし(継承召喚も)。式神を倒されたら、倒された側が霊力1をもらう(倒した側はもらわない)。札は10/6案その2。",
  rule: "r1006",
  pack: "adopted-1006",
  config: {
    instantWinCells: 5,
    instantWinTiming: "immediate",
    instantWinCount: "units",
    summonLimit: 2,
    underdogDiscount: 3,
    underdogDiscountMinCost: 7,
    underdogBy: "cells",
    freeSummonAttack: "optional",
    freeSummonAttackInherit: true,
    refundMode: "half",
    killRewardBase: "zero",
    killRewardBonus: 1,
  },
  cards: { ac06: { aoe: false }, ac09: { aoe: false }, ac13: { aoe: true }, ac15: { aoe: true } },
};

/**
 * りゅー案(仮) (2026-10-07, speed-sweep --set barbell 「中コス抜き+軽い2枚ずつ・重い2枚ずつ」):
 * 並べて勝つ・重いので巻き返す案 on a barbell deck - no cost 5-6 shikigami, the
 * cost-3 ones and the cost-7+ ones twice each (28 cards), so the hand-size
 * discard is "keep the light ones to win, or a heavy one to strike back".
 * Five AIs: 先手 45-55%, about 60% of the kills by cost-7+ cards.
 */
const RYU_DRAFT: SettingPreset = {
  id: "ryuDraft",
  label: "りゅー案(仮)",
  note: "並べて勝つ・重いので巻き返す案のルールに、中コストを抜いたデッキ(28枚)。召喚コスト5〜6の式神(変面・一角鬼・一目鬼・雲外鏡・照魔鏡)を抜き、コスト3の4種(灯籠の精・提灯お化け・影鬼・鉈鬼)とコスト7以上の6種(首引の姫鬼・両面・僵尸公主・茨木童子・酒呑童子・玖龍街)を2枚ずつ。ルールは、5体目で即勝ち・召喚は1ターン2体まで・範囲攻撃はコスト7以上だけ・負けている側はコスト7以上が3安い・召喚した手番の1回目の攻撃はコストなし・倒された側が霊力1。札は10/6案その2。",
  rule: "r1006",
  pack: "adopted-1006",
  config: LINE_UP.config,
  cards: {
    ...LINE_UP.cards,
    // light: cost 3, twice each
    ac01: { copies: 2 }, ac02: { copies: 2 }, ac03: { copies: 2 }, ac04: { copies: 2 },
    // no mid cost (5-6)
    ac07: { copies: 0 }, ac08: { copies: 0 }, ac09: { aoe: false, copies: 0 }, ac10: { copies: 0 }, ac11: { copies: 0 },
    // heavy: cost 7+, twice each
    ac12: { copies: 2 }, ac13: { aoe: true, copies: 2 }, ac14: { copies: 2 }, ac15: { aoe: true, copies: 2 }, ac16: { copies: 2 }, ac17: { copies: 2 },
  },
};

export const SETTING_PRESETS: Record<SettingPresetId, SettingPreset> = {
  ryuDraft: RYU_DRAFT,
  lineUp: LINE_UP,
  adj15: ADJ15,
  adj15life: ADJ15_LIFE,
  incomeNow: INCOME_NOW,
  comeback: COMEBACK,
  bigComeback: BIG_COMEBACK,
  coldFive: COLD_FIVE,
  freeSummon: FREE_SUMMON,
};

export const isSettingPresetId = (v: unknown): v is SettingPresetId =>
  typeof v === "string" && (SETTING_PRESET_IDS as readonly string[]).includes(v);

/**
 * Checked when the module loads: a bundle that the schema, the rule presets or
 * the card-override shape would refuse is a mistake in this file, and every
 * importer should hear about it at once. Card ids and each card's own limits
 * need the pack, so they are checked in settingPresetSettings.
 *
 * Throwing here is on purpose. The settings panel, the tables (for the
 * result line's 「ルール: …」) and the online server's records (settingsLabel)
 * import this file, so a bad entry fails the tests at once and would break
 * those pages: keep the data honest.
 */
const checkAtLoad = (b: SettingPreset): void => {
  const bad = (text: string): never => {
    throw new Error(`調整案 ${b.id}: ${text}`);
  };
  if (b.label === "" || b.note === "") bad("名前と説明を書いてください");
  if (!isRulePresetId(b.rule)) bad("基準ルールが不正です");
  if (!isPlayablePack(b.pack)) bad("パックが不正です");
  const config = parseConfigPatch(b.config, { midGame: false });
  if (!config.ok) bad(config.error);
  const cards = parseCardOverrides(b.cards, null);
  if (!cards.ok) bad(cards.error);
};

for (const id of SETTING_PRESET_IDS) checkAtLoad(SETTING_PRESETS[id]);

/**
 * The bundle as GameSettings. With the printed pack the card ids and each
 * card's own limits are checked the way the server checks them, and values
 * equal to the base rule or to the printed card drop out, so the change count
 * says what really differs. Built-in data: a failure is a bug, and throws.
 */
export const settingPresetSettings = (id: SettingPresetId, printed: CardPack | null = null): GameSettings => {
  const b = SETTING_PRESETS[id];
  const parsed = parseSettings({ rule: b.rule, pack: b.pack, config: b.config, cards: b.cards }, printed === null ? null : () => printed);
  if (!parsed.ok) throw new Error(`調整案「${b.label}」を読み込めません: ${parsed.error}`);
  return parsed.value;
};

/** Does the config hold every value an overlay bundle sets? */
const overlayHolds = (b: SettingPreset, s: GameSettings): boolean => {
  const cfg = settingsConfig(s) as unknown as Record<string, unknown>;
  const want = presetConfig(s.rule, b.config) as unknown as Record<string, unknown>;
  return Object.keys(b.config).every((k) => JSON.stringify(cfg[k]) === JSON.stringify(want[k]));
};

/**
 * Which bundle these settings are, exactly (base rule, pack, rules and cards),
 * or null. `printed` is the pack `s` is played with. Used by the picker to show
 * the bundle while the settings still match it, and 「(なし)」 once they do not.
 * An overlay bundle matches any settings that hold its values, but only when
 * no whole bundle matches exactly.
 */
export const matchingSettingPreset = (s: GameSettings, printed: CardPack | null): SettingPresetId | null => {
  let key: string | null = null;
  for (const id of SETTING_PRESET_IDS) {
    const b = SETTING_PRESETS[id];
    if (b.overlay === true || b.rule !== s.rule || b.pack !== s.pack) continue;
    // both sides go through the same normalizer, so the key order is the schema's
    if (key === null) key = JSON.stringify(normalizeSettings(s, printed));
    try {
      if (JSON.stringify(settingPresetSettings(id, printed)) === key) return id;
    } catch {
      continue; // a bundle this pack cannot take is simply not the one in the panel
    }
  }
  for (const id of SETTING_PRESET_IDS) {
    if (SETTING_PRESETS[id].overlay === true && overlayHolds(SETTING_PRESETS[id], s)) return id;
  }
  return null;
};

/**
 * The settings in a few words, for result lines and records: the base rule's
 * label, then the bundle when the settings are one (「10/3テスト案+5体目で即勝ち」,
 * 「9/14ルール(旧・現行)+調整案1.5倍」), else the number of changed items
 * (「採用ルール 9/22+3項目変更」). An overlay bundle with more changed on top
 * says so (「…+5体目で即勝ち+他2項目」). `printed`: the pack `s` is played with.
 */
export const settingsLabel = (s: GameSettings, printed: CardPack | null): string => {
  const base = RULE_PRESETS[s.rule].label;
  const n = normalizeSettings(s, printed);
  const changed = changedItemCount(n);
  const id = matchingSettingPreset(s, printed);
  if (id === null) return changed > 0 ? `${base}+${changed}項目変更` : base;
  const b = SETTING_PRESETS[id];
  if (b.overlay !== true) return `${base}+${b.label}`;
  const own = configChanges(presetConfig(s.rule), presetConfig(s.rule, b.config)).length;
  const extra = changed - own;
  return `${base}+${b.label}${extra > 0 ? `+他${extra}項目` : ""}`;
};
