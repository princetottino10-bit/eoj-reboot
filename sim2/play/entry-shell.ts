// The one page skeleton of the three entry screens — AIと対戦 (/ai),
// オンライン対戦 (/), 観戦 (/watch) — before a game starts:
//
//   header (符 + 陰陽符陣(仮) + a one-line subtitle per mode)
//   the mode switch
//   one panel: h2, the mode's own fields, the shared rules-and-cards block,
//              one full-width gold button, quiet secondary buttons under it
//
// Only the fields change from mode to mode. Markup is pure string building
// (tested without a DOM); the pages fill it in and wire the clicks.
import { RULE_PRESETS } from "../src/presets.ts";
import { esc } from "./cards-view.ts";
import { modeSwitchHtml } from "./mode-switch.ts";
import type { PlayMode } from "./mode-switch.ts";
import { badgeHtml, diffFromPresetHtml } from "./settings-badge.ts";
import type { SettingsLook } from "./settings-badge.ts";

/** Per mode: the subtitle under the title, the panel's heading, the gold button. */
export const ENTRY_TEXT: Record<PlayMode, { sub: string; heading: string; primary: string }> = {
  ai: { sub: "席とAIを選んで、ひとりで対戦します", heading: "対局の準備", primary: "対局開始" },
  online: { sub: "部屋を作り、招待URLで友だちと対戦します", heading: "部屋を作る", primary: "この設定で部屋を作る" },
  watch: { sub: "AI同士の対局を、1手ずつ見せます", heading: "観戦の準備", primary: "観戦開始" },
};

/** The one label of the button to the settings page, on every entry screen. */
export const EDIT_RULES_LABEL = "ルールとカードを変える";

/** The header: the same on the three screens but for the subtitle. */
export const entryHeadHtml = (mode: PlayMode): string =>
  `<header class="entry-head"><span class="brand-mark" aria-hidden="true">符</span><div class="entry-titles"><h1>陰陽符陣<small>(仮)</small></h1><p>${esc(
    ENTRY_TEXT[mode].sub,
  )}</p></div></header>`;

/** The header and the mode switch under it (`s`: the settings the switch carries). */
export const entryTopHtml = (mode: PlayMode, s: string | null): string =>
  `${entryHeadHtml(mode)}<div class="mode-slot">${modeSwitchHtml(mode, s)}</div>`;

/**
 * The rules-and-cards block: the badge (ruleset · pack · 基準のまま/変更あり),
 * the one button to the settings page, and the ruleset's note and the
 * changes from it folded away.
 */
export const rulesBlockHtml = (look: SettingsLook, href: string): string =>
  `<div class="entry-rules">
    <span class="entry-label">ルールとカード</span>
    <div class="entry-rules-row">
      <span class="rules-badge">${badgeHtml(look)}</span>
      <a class="btn btn-quiet" data-edit-rules href="${esc(href)}">${EDIT_RULES_LABEL}</a>
    </div>
    <details class="entry-fold"><summary>ルールの説明</summary><p class="entry-note">${esc(RULE_PRESETS[look.rule].note)}</p></details>
    <details class="entry-fold"><summary>基準からの変更点</summary>${diffFromPresetHtml(look)}</details>
  </div>`;

/** 詳細: settings a first game does not need (the seed, the AI's policy), folded. */
export const moreHtml = (inner: string): string =>
  `<details class="entry-more"><summary>詳細</summary><div class="entry-grid">${inner}</div></details>`;

/** The panel's foot: an error if any, the gold button, then the quiet ones (`secondary`: button markup). */
export const actionsHtml = (mode: PlayMode, problem: string, secondary: string): string =>
  `${problem === "" ? "" : `<p class="err" role="alert">${esc(problem)}</p>`}
    <button type="button" class="btn btn-gold entry-primary" data-start>${esc(ENTRY_TEXT[mode].primary)}</button>
    <div class="entry-secondary">${secondary}</div>`;

/** A whole setup panel of the AI and spectate screens (the lobby's panel is in its HTML, with the same classes). */
export const entryPanelHtml = (mode: PlayMode, body: string): string =>
  `<form class="entry-panel" novalidate aria-labelledby="entry-h"><h2 id="entry-h">${esc(ENTRY_TEXT[mode].heading)}</h2>${body}</form>`;

/** The page when not even the default settings can be read (the pack failed to load): the error in the panel. */
export const entryProblemHtml = (mode: PlayMode, problem: string): string =>
  `${entryTopHtml(mode, null)}<section class="entry-panel" aria-labelledby="entry-h"><h2 id="entry-h">${esc(ENTRY_TEXT[mode].heading)}</h2><p class="err" role="alert">${esc(
    problem,
  )}</p></section>`;

/** The quiet secondary button (続きから, 閉じる, …). */
export const quietButton = (attr: string, label: string): string =>
  `<button type="button" class="btn-text" ${attr}>${esc(label)}</button>`;

// ------------------------------------------------------------------ DOM

/**
 * Shows the setup page in place of the table: the page scrolls to its top and
 * the focus goes to the first field (marked data-first), not the mode switch.
 */
export const showEntryPage = (entry: HTMLElement, table: HTMLElement, html: string): HTMLFormElement | null => {
  entry.innerHTML = html;
  table.hidden = true;
  entry.hidden = false;
  window.scrollTo(0, 0);
  entry.querySelector<HTMLElement>("[data-first]")?.focus({ preventScroll: true });
  return entry.querySelector<HTMLFormElement>("form.entry-panel");
};

/** The table again (a game started, or went on): the setup page is emptied, so its ids are not doubled. */
export const showTablePage = (entry: HTMLElement, table: HTMLElement): void => {
  entry.hidden = true;
  entry.innerHTML = "";
  table.hidden = false;
};

/** The mode switch's box on the page just shown (fresh each time: wire it with bindModeSwitch). */
export const modeSlotOf = (entry: HTMLElement): HTMLElement => entry.querySelector<HTMLElement>(".mode-slot") ?? entry;

/** Whether the setup page is up (keyboard shortcuts of the table stay off meanwhile). */
export const entryShown = (entry: HTMLElement): boolean => !entry.hidden;
