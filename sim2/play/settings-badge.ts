// "9/13テストルール +3項目変更": the badge that keeps every test record honest
// about which settings were played, and the difference list behind it.
import { cardChanges } from "../src/card-overrides.ts";
import type { CardOverrides } from "../src/card-overrides.ts";
import type { CardPack } from "../src/cards.ts";
import { configChanges, describeChange } from "../src/config-schema.ts";
import type { ConfigChange } from "../src/config-schema.ts";
import { presetConfig, RULE_PRESETS } from "../src/presets.ts";
import type { RulePresetId } from "../src/presets.ts";
import type { Config } from "../src/types.ts";
import { esc } from "./cards-view.ts";

export type SettingsLook = { rule: RulePresetId; pack: string; cfg: Config; cards: CardOverrides; printed: CardPack | null };

export const changeCountOf = (s: SettingsLook): number =>
  configChanges(presetConfig(s.rule), s.cfg).length + (s.printed === null ? Object.values(s.cards).reduce((n, x) => n + Object.keys(x).length, 0) : cardChanges(s.printed, s.cards).length);

export const badgeHtml = (s: SettingsLook): string => {
  const n = changeCountOf(s);
  return `${esc(RULE_PRESETS[s.rule].label)}<span class="badge-pack">${esc(s.pack)}</span>${
    n > 0 ? `<span class="mod">+${n}項目変更</span>` : '<span class="badge-plain">基準のまま</span>'
  }`;
};

export const cardChangeLines = (printed: CardPack | null, cards: CardOverrides): string[] => {
  if (printed === null) return [];
  return cardChanges(printed, cards).map((c) => `${printed.byId.get(c.cardId)?.nameJa ?? c.cardId} の${c.label} ${c.from}→${c.to}`);
};

export const changeListHtml = (changes: ConfigChange[], cardLines: string[]): string => {
  const items = [...changes.map(describeChange), ...cardLines];
  return items.length === 0
    ? '<p class="muted">変更はありません</p>'
    : `<ul class="diff-list">${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
};

/** Everything that differs from the untouched preset. */
export const diffFromPresetHtml = (s: SettingsLook): string =>
  changeListHtml(configChanges(presetConfig(s.rule), s.cfg), cardChangeLines(s.printed, s.cards));
