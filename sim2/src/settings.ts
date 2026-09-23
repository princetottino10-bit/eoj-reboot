// Game settings = a fixed base preset + the rule variables changed from it +
// card number overrides. The same shape is used when a room is created, when
// settings change between matches, by the local play UI, for named saves in
// the browser and for "play with these settings" share URLs.
// Pure: no node builtins.
import { applyCardOverrides, cardChangeCount, cloneCardOverrides, normalizeCardOverrides, parseCardOverrides } from "./card-overrides.ts";
import type { CardOverrides } from "./card-overrides.ts";
import type { CardPack } from "./cards.ts";
import { checkConfigRelations, configChanges, diffPatch, parseConfigPatch } from "./config-schema.ts";
import type { ConfigChange, ConfigPatch, Parsed } from "./config-schema.ts";
import { isPlayablePack, isRulePresetId, presetConfig, RULE_PRESETS } from "./presets.ts";
import type { PlayablePack, RulePresetId } from "./presets.ts";
import type { Config, Pos } from "./types.ts";

export type GameSettings = {
  rule: RulePresetId;
  pack: PlayablePack;
  /** Only the variables that differ from the preset. */
  config: ConfigPatch;
  cards: CardOverrides;
};

export const defaultSettings = (rule: RulePresetId = "r0923"): GameSettings => ({
  rule,
  pack: RULE_PRESETS[rule].defaultPack as PlayablePack,
  config: {},
  cards: {},
});

/** The full Config a match with these settings starts from. */
export const settingsConfig = (s: GameSettings): Config => presetConfig(s.rule, s.config);

/** The pack a match with these settings is played with. */
export const settingsPack = (s: GameSettings, printed: CardPack): CardPack => applyCardOverrides(printed, s.cards);

/** Drops no-op entries so that "changed items" counts stay honest. */
export const normalizeSettings = (s: GameSettings, printed: CardPack | null): GameSettings => ({
  rule: s.rule,
  pack: s.pack,
  config: diffPatch(presetConfig(s.rule), settingsConfig(s)),
  cards: printed === null ? cloneOverrides(s.cards) : normalizeCardOverrides(printed, s.cards),
});

const cloneOverrides = cloneCardOverrides;

export const cloneSettings = (s: GameSettings): GameSettings => ({
  rule: s.rule,
  pack: s.pack,
  config: diffPatch(presetConfig(s.rule), settingsConfig(s)),
  cards: cloneOverrides(s.cards),
});

export type SettingsDiff = { rules: ConfigChange[]; cards: number };

/** What differs from the untouched preset (for the "+3項目変更" badge). */
export const settingsDiff = (s: GameSettings): SettingsDiff => ({
  rules: configChanges(presetConfig(s.rule), settingsConfig(s)),
  cards: cardChangeCount(s.cards),
});

export const changedItemCount = (s: GameSettings): number => {
  const d = settingsDiff(s);
  return d.rules.length + d.cards;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Validates settings from untrusted JSON. `packOf` supplies the printed pack
 * so card ids can be checked; pass null to check the shape only (the browser
 * decoding a URL before the pack has loaded).
 */
export const parseSettings = (
  raw: unknown,
  packOf: ((name: PlayablePack) => CardPack | null) | null,
): Parsed<GameSettings> => {
  if (!isObj(raw)) return { ok: false, error: "設定の形式が不正です" };
  if (!isRulePresetId(raw.rule)) return { ok: false, error: "基準ルールが不正です" };
  if (!isPlayablePack(raw.pack)) return { ok: false, error: "パックが不正です" };
  const config = parseConfigPatch(raw.config, { midGame: false });
  if (!config.ok) return config;
  const printed = packOf === null ? null : packOf(raw.pack);
  if (packOf !== null && printed === null) return { ok: false, error: "パックを読み込めません" };
  const cards = parseCardOverrides(raw.cards, printed);
  if (!cards.ok) return cards;
  const s: GameSettings = { rule: raw.rule, pack: raw.pack, config: config.value, cards: cards.value };
  const relation = checkConfigRelations(settingsConfig(s));
  if (relation !== null) return { ok: false, error: relation };
  return { ok: true, value: normalizeSettings(s, printed) };
};

// ------------------------------------------------------------- share URL

/** Longest encoded settings string accepted from a URL (every card's range edited still fits). */
export const MAX_ENCODED = 12000;

// Cells in a share URL: each coordinate -2..2 as one letter a..e, two letters per cell.
const COORD = "abcde";
const packCells = (cells: readonly Pos[]): string => cells.map((c) => COORD[c.x + 2] + COORD[c.y + 2]).join("");
const unpackCells = (text: unknown): unknown => {
  if (typeof text !== "string" || text.length % 2 !== 0 || !/^[a-e]*$/.test(text)) return text; // left for the validator to refuse
  const out: Pos[] = [];
  for (let i = 0; i < text.length; i += 2) out.push({ x: COORD.indexOf(text[i]) - 2, y: COORD.indexOf(text[i + 1]) - 2 });
  return out;
};
const CELL_FIELDS = ["attackRange", "blindSpots"] as const;

const compactCards = (ov: CardOverrides): Record<string, Record<string, unknown>> =>
  Object.fromEntries(
    Object.entries(ov).map(([id, edit]) => {
      const e: Record<string, unknown> = { ...edit };
      for (const f of CELL_FIELDS) if (edit[f] !== undefined) e[f] = packCells(edit[f]);
      if (edit.gapCell !== undefined) e.gapCell = edit.gapCell === null ? "" : packCells([edit.gapCell]);
      return [id, e];
    }),
  );

const expandCards = (raw: unknown): unknown => {
  if (!isObj(raw)) return raw;
  return Object.fromEntries(
    Object.entries(raw).map(([id, edit]) => {
      if (!isObj(edit)) return [id, edit];
      const e: Record<string, unknown> = { ...edit };
      for (const f of CELL_FIELDS) if (typeof e[f] === "string") e[f] = unpackCells(e[f]);
      if (typeof e.gapCell === "string") {
        const cells = unpackCells(e.gapCell);
        e.gapCell = e.gapCell === "" ? null : Array.isArray(cells) && cells.length === 1 ? cells[0] : e.gapCell;
      }
      return [id, e];
    }),
  );
};

const toBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (text: string): string | null => {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

/**
 * Compact, URL-safe form. Only the differences from the preset are stored,
 * so an untouched 9/13 setup is a handful of characters.
 */
export const encodeSettings = (s: GameSettings): string => {
  const n = cloneSettings(s);
  const compact: Record<string, unknown> = { v: 1, r: n.rule, p: n.pack };
  if (Object.keys(n.config).length > 0) compact.c = n.config;
  if (cardChangeCount(n.cards) > 0) compact.k = compactCards(n.cards);
  return toBase64Url(JSON.stringify(compact));
};

/** Inverse of encodeSettings, validating everything. */
export const decodeSettings = (
  text: string,
  packOf: ((name: PlayablePack) => CardPack | null) | null,
): Parsed<GameSettings> => {
  if (text.length === 0 || text.length > MAX_ENCODED) return { ok: false, error: "設定の文字列が不正です" };
  const json = fromBase64Url(text);
  if (json === null) return { ok: false, error: "設定の文字列を読めません" };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: "設定の文字列を読めません" };
  }
  if (!isObj(raw) || raw.v !== 1) return { ok: false, error: "設定の文字列の版が違います" };
  return parseSettings({ rule: raw.r, pack: raw.p, config: raw.c, cards: expandCards(raw.k) }, packOf);
};
