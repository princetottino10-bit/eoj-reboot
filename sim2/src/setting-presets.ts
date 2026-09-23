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
import { parseConfigPatch } from "./config-schema.ts";
import type { ConfigPatch } from "./config-schema.ts";
import { isPlayablePack, isRulePresetId } from "./presets.ts";
import type { PlayablePack, RulePresetId } from "./presets.ts";
import { normalizeSettings, parseSettings } from "./settings.ts";
import type { GameSettings } from "./settings.ts";

export const SETTING_PRESET_IDS = ["adj15", "adj15life"] as const;
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

export const SETTING_PRESETS: Record<SettingPresetId, SettingPreset> = { adj15: ADJ15, adj15life: ADJ15_LIFE };

export const isSettingPresetId = (v: unknown): v is SettingPresetId =>
  typeof v === "string" && (SETTING_PRESET_IDS as readonly string[]).includes(v);

/**
 * Checked when the module loads: a bundle that the schema, the rule presets or
 * the card-override shape would refuse is a mistake in this file, and every
 * importer should hear about it at once. Card ids and each card's own limits
 * need the pack, so they are checked in settingPresetSettings.
 *
 * Throwing here is on purpose, and its blast radius is the settings panel:
 * today only play/settings-panel.ts (hence the /rules page) and the tests
 * import this file, so a bad entry breaks the editor and fails the tests
 * without touching the table or the server. Anything that later imports it
 * from the table or a server module inherits that, so keep the data honest.
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

/**
 * Which bundle these settings are, exactly (base rule, pack, rules and cards),
 * or null. `printed` is the pack `s` is played with. Used by the picker to show
 * the bundle while the settings still match it, and 「(なし)」 once they do not.
 */
export const matchingSettingPreset = (s: GameSettings, printed: CardPack | null): SettingPresetId | null => {
  let key: string | null = null;
  for (const id of SETTING_PRESET_IDS) {
    const b = SETTING_PRESETS[id];
    if (b.rule !== s.rule || b.pack !== s.pack) continue;
    // both sides go through the same normalizer, so the key order is the schema's
    if (key === null) key = JSON.stringify(normalizeSettings(s, printed));
    try {
      if (JSON.stringify(settingPresetSettings(id, printed)) === key) return id;
    } catch {
      continue; // a bundle this pack cannot take is simply not the one in the panel
    }
  }
  return null;
};
