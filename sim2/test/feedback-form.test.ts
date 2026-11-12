// 11/12 感想フォーム: the 開発機能版 (not the public build) offers 「感想を送る」
// at the end of a match, opening the Google form with the scene and the
// changed settings already filled in. The device is not filled in (11/13).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FEEDBACK_ENTRY,
  FEEDBACK_FORM_URL,
  feedbackFormUrl,
  feedbackSettingsText,
} from "../play/feedback-form.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { defaultSettings } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import { RULE_PRESETS } from "../src/presets.ts";

const src = (f: string): string => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const params = (url: string): URLSearchParams => new URL(url).searchParams;

test("the form URL pre-fills scene and settings by entry id, never the device", () => {
  const url = feedbackFormUrl({ scene: "AI対戦", settings: "基準のまま" });
  assert.ok(url.startsWith(FEEDBACK_FORM_URL + "?"));
  const p = params(url);
  assert.equal(p.get("usp"), "pp_url");
  assert.equal(p.get(`entry.${FEEDBACK_ENTRY.scene}`), "AI対戦");
  assert.equal(p.get(`entry.${FEEDBACK_ENTRY.settings}`), "基準のまま");
  assert.deepEqual([...p.keys()].sort(), ["entry." + FEEDBACK_ENTRY.scene, "entry." + FEEDBACK_ENTRY.settings, "usp"].sort());
});

test("untouched settings say so, with the rule's name", () => {
  const s = defaultSettings();
  const printed = loadPack(packPath(s.pack));
  const text = feedbackSettingsText(s, printed, "https://example.test");
  assert.match(text, /基準のまま/);
  assert.ok(text.includes(RULE_PRESETS[s.rule].label));
  assert.ok(!text.includes("https://example.test"), "no share link when nothing changed");
});

test("changed settings list each change and carry a share link that reproduces them", () => {
  const base = defaultSettings();
  const s: GameSettings = { ...base, config: { baseIncome: 9 } as GameSettings["config"] };
  const printed = loadPack(packPath(s.pack));
  const text = feedbackSettingsText(s, printed, "https://example.test");
  assert.match(text, /1項目変更/);
  assert.match(text, /→9/);
  assert.match(text, /共有URL: https:\/\/example\.test\/rules\?s=/);
});

test("the end of a match offers the form only off the public build (AI and online)", () => {
  const ui = src("play/ui.ts");
  const client = src("online/client.ts");
  assert.match(ui, /feedbackLink\(/);
  assert.match(client, /feedbackLink\(/);
  const mod = src("play/feedback-form.ts");
  assert.match(mod, /isPublicSite\(\)/);
});

test("the supporter welcome page points to the in-game button", () => {
  const html = src("play/supporter.html");
  assert.ok(html.includes("ご意見・ご感想は、ゲーム内の「感想を送る」ボタンからお知らせください。"));
});
