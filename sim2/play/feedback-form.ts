// 11/12 感想フォーム (Googleフォーム「『式神符陣』開発機能版 ご感想・ご意見フォーム」).
// The 開発機能版 offers 「感想を送る」 at the end of a match and opens the form
// with the scene, the device and the changed rules / cards already filled in
// (the form's pre-fill URL: ?usp=pp_url&entry.N=value), so a player only
// writes what they thought. Never on the public build.
import { cardChangeLines } from "./settings-badge.ts";
import { isPublicSite } from "./site.ts";
import { shareHref } from "./rules-url.ts";
import { configChanges, describeChange } from "../src/config-schema.ts";
import type { CardPack } from "../src/cards.ts";
import { presetConfig } from "../src/presets.ts";
import { settingsLabel } from "../src/setting-presets.ts";
import { encodeSettings, settingsConfig } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";

export const FEEDBACK_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSc1Cp5Dr4P_cICa8Xkri1QBSPuoG0la2zrc46T54-gV7PljFQ/viewform";

/** The form's question ids (read from the published form, 11/12). */
export const FEEDBACK_ENTRY = {
  scene: "1038255780",
  settings: "4898987",
  device: "356440219",
} as const;

/** The form's choices for 「利用した端末・環境」. */
export type FeedbackDevice = "iPhone・iPad" | "Android" | "PC";

export const deviceOf = (userAgent: string, maxTouchPoints: number): FeedbackDevice => {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "iPhone・iPad";
  if (/Android/.test(userAgent)) return "Android";
  // iPadOS 13+ reports a Mac; a Mac has no touch screen
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return "iPhone・iPad";
  return "PC";
};

/**
 * 「変更したルールや設定」 in words: the rule's name, each change from it,
 * and a share link that opens the same settings (only when something changed).
 */
export const feedbackSettingsText = (s: GameSettings, printed: CardPack, origin: string): string => {
  const label = settingsLabel(s, printed);
  const lines = [
    ...configChanges(presetConfig(s.rule), settingsConfig(s)).map(describeChange),
    ...cardChangeLines(printed, s.cards),
  ];
  if (lines.length === 0) return `${label}(基準のまま)`;
  return [label, ...lines.map((l) => `・${l}`), `共有URL: ${shareHref(origin, { for: "standalone", s: null }, encodeSettings(s))}`].join("\n");
};

export type FeedbackFill = { scene: string; device: FeedbackDevice | null; settings: string };

export const feedbackFormUrl = (f: FeedbackFill): string => {
  const q = new URLSearchParams({ usp: "pp_url" });
  q.set(`entry.${FEEDBACK_ENTRY.scene}`, f.scene);
  if (f.device !== null) q.set(`entry.${FEEDBACK_ENTRY.device}`, f.device);
  q.set(`entry.${FEEDBACK_ENTRY.settings}`, f.settings);
  return `${FEEDBACK_FORM_URL}?${q.toString()}`;
};

/** 「感想を送る」 for the end of a match, or null on the public build. */
export const feedbackLink = (scene: string, settings: GameSettings, printed: CardPack): HTMLElement | null => {
  if (isPublicSite() || typeof document === "undefined") return null;
  const a = document.createElement("a");
  a.className = "btn btn-quiet feedback-link";
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = "感想を送る";
  a.title = "ルールの変更点は自動で入ります";
  a.href = feedbackFormUrl({
    scene,
    device: deviceOf(navigator.userAgent, navigator.maxTouchPoints ?? 0),
    settings: feedbackSettingsText(settings, printed, location.origin),
  });
  return a;
};
