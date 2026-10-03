// The three ways to play — AIと対戦 (/ai), オンライン対戦 (/), 観戦 (/watch) —
// as one switch at the top of each entry screen (the AI table's start card,
// the lobby, the spectate setup card), so whoever lands on one sees the
// others. Each link carries the rules and cards picked on the current screen
// as ?s= (all three pages read it). Markup is a pure string builder; the one
// DOM helper only wires clicks.
import { esc } from "./cards-view.ts";

export type PlayMode = "ai" | "online" | "watch";

export const PLAY_MODES: readonly { mode: PlayMode; label: string; hint: string }[] = [
  { mode: "ai", label: "AIと対戦", hint: "ひとりでAIと遊ぶ" },
  { mode: "online", label: "オンライン対戦", hint: "友だちと部屋で遊ぶ" },
  { mode: "watch", label: "観戦", hint: "AI同士の対局を見る" },
];

const withS = (path: string, s: string | null): string =>
  s === null || s === "" ? path : `${path}?s=${encodeURIComponent(s)}`;

/** The spectate page with these settings. */
export const watchHref = (s: string | null): string => withS("/watch", s);

/** The entry page of a mode, with the settings `s` (encodeSettings) when given. */
export const modeHref = (mode: PlayMode, s: string | null): string =>
  mode === "ai" ? withS("/ai", s) : mode === "online" ? withS("/", s) : watchHref(s);

/** The switch: three links, the current one marked with aria-current. */
export const modeSwitchHtml = (active: PlayMode, s: string | null): string =>
  `<nav class="mode-switch" aria-label="遊び方を選ぶ">${PLAY_MODES.map(({ mode, label, hint }) => {
    const current = mode === active;
    return `<a class="mode-item${current ? " is-current" : ""}" data-mode="${mode}" href="${esc(modeHref(mode, s))}"${
      current ? ' aria-current="page"' : ""
    }><span class="mode-label">${esc(label)}</span><span class="mode-hint">${esc(hint)}</span></a>`;
  }).join("")}</nav>`;

/**
 * Clicks inside `root`: the current mode stays put (no reload that would drop
 * what is being chosen); leaving for another runs `beforeLeave` first so the
 * page can keep its choices.
 */
export const bindModeSwitch = (root: HTMLElement, beforeLeave?: () => void): void => {
  root.addEventListener("click", (ev) => {
    const link = (ev.target as HTMLElement).closest<HTMLAnchorElement>(".mode-switch a.mode-item");
    if (link === null) return;
    if (link.getAttribute("aria-current") === "page") {
      ev.preventDefault();
      return;
    }
    beforeLeave?.();
  });
};
