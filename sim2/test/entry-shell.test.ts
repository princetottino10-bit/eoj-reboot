// The three entry screens (AIと対戦 /ai, オンライン対戦 /, 観戦 /watch) share one
// page skeleton and one rules-and-cards block (play/entry-shell.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  actionsHtml,
  EDIT_RULES_LABEL,
  ENTRY_TEXT,
  entryHeadHtml,
  entryPanelHtml,
  entryProblemHtml,
  entryTopHtml,
  moreHtml,
  quietButton,
  rulesBlockHtml,
} from "../play/entry-shell.ts";
import { PLAY_MODES } from "../play/mode-switch.ts";
import type { PlayMode } from "../play/mode-switch.ts";
import { RULE_PRESETS } from "../src/presets.ts";
import { defaultSettings, settingsConfig } from "../src/settings.ts";
import { onlineStaticAllowed } from "../online/server.ts";

const src = (f: string): string => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const MODES: PlayMode[] = PLAY_MODES.map((m) => m.mode);

const look = () => {
  const s = defaultSettings();
  return { rule: s.rule, pack: s.pack, cfg: settingsConfig(s), cards: s.cards, printed: null };
};

test("entry shell: the same header on every screen, only the subtitle changes", () => {
  const heads = MODES.map((m) => entryHeadHtml(m));
  for (const [i, h] of heads.entries()) {
    assert.match(h, /^<header class="entry-head"><span class="brand-mark" aria-hidden="true">符<\/span>/);
    assert.ok(h.includes("<h1>陰陽符陣<small>(仮)</small></h1>"));
    assert.ok(h.includes(`<p>${ENTRY_TEXT[MODES[i] as PlayMode].sub}</p>`));
  }
  const strip = (h: string): string => h.replace(/<p>.*?<\/p>/, "");
  assert.equal(new Set(heads.map(strip)).size, 1, "identical but for the subtitle");
  assert.equal(new Set(MODES.map((m) => ENTRY_TEXT[m].sub)).size, 3, "each mode says what it is");
});

test("entry shell: the mode switch sits right under the header, current mode marked", () => {
  for (const m of MODES) {
    const top = entryTopHtml(m, null);
    assert.ok(top.startsWith(entryHeadHtml(m)));
    assert.match(top, /<\/header><div class="mode-slot"><nav class="mode-switch"/);
    assert.match(top, new RegExp(`data-mode="${m}" href="[^"]*" aria-current="page"`));
  }
});

test("entry shell: one rules-and-cards block — badge, one button label, the note and the changes folded", () => {
  const html = rulesBlockHtml(look(), "/rules?for=ai&s=x");
  assert.ok(html.includes('<span class="entry-label">ルールとカード</span>'));
  assert.match(html, /<span class="rules-badge">.*基準のまま/s);
  assert.ok(html.includes(`data-edit-rules href="/rules?for=ai&amp;s=x">${EDIT_RULES_LABEL}</a>`));
  assert.equal(EDIT_RULES_LABEL, "ルールとカードを変える");
  // the ruleset's note is folded, never a raw paragraph in the panel
  const note = RULE_PRESETS[look().rule].note;
  assert.ok(note.length > 0);
  assert.match(html, /<details class="entry-fold"><summary>ルールの説明<\/summary><p class="entry-note">/);
  assert.ok(html.includes("基準からの変更点</summary><p class=\"muted\">変更はありません</p>"));
});

test("entry shell: panel, 詳細 fold, one full-width gold button and quiet ones under it", () => {
  for (const m of MODES) {
    const panel = entryPanelHtml(m, "x");
    assert.ok(panel.startsWith(`<form class="entry-panel" novalidate aria-labelledby="entry-h"><h2 id="entry-h">${ENTRY_TEXT[m].heading}</h2>`));
    const foot = actionsHtml(m, "", "");
    assert.ok(foot.includes(`class="btn btn-gold entry-primary" data-start>${ENTRY_TEXT[m].primary}</button>`));
    assert.ok(!foot.includes('role="alert"'));
    assert.ok(actionsHtml(m, "<bad>", "").includes('<p class="err" role="alert">&lt;bad&gt;</p>'));
    assert.ok(entryProblemHtml(m, "x").includes('<p class="err" role="alert">x</p>'));
  }
  assert.deepEqual(
    MODES.map((m) => ENTRY_TEXT[m].heading),
    ["対局の準備", "部屋を作る", "観戦の準備"],
  );
  assert.equal(moreHtml("<i></i>"), '<details class="entry-more"><summary>詳細</summary><div class="entry-grid"><i></i></div></details>');
  assert.equal(quietButton("data-close", "閉じる"), '<button type="button" class="btn-text" data-close>閉じる</button>');
});

test("entry shell: all three screens are built from it (and the online server serves it)", () => {
  assert.ok(onlineStaticAllowed("play/entry-shell.ts"));
  const lobby = src("online/lobby.ts");
  const ai = src("play/ui.ts");
  const watch = src("play/watch.ts");
  for (const [name, code, mode] of [["lobby", lobby, "online"], ["ai", ai, "ai"], ["watch", watch, "watch"]] as const) {
    assert.ok(code.includes('from "../play/entry-shell.ts"') || code.includes('from "./entry-shell.ts"'), name);
    assert.ok(code.includes(`entryTopHtml("${mode}"`), `${name}: shared header and mode switch`);
    assert.ok(code.includes("rulesBlockHtml(look, "), `${name}: shared rules-and-cards block`);
  }
  // the seed is behind 詳細 wherever a screen has one
  for (const code of [ai, watch]) assert.match(code, /moreHtml\(`[^]*?name="seed"/);
  // the lobby's panels use the same panel, fields and gold button
  const html = src("online/lobby.html");
  assert.ok(html.includes('<main class="entry lobby">'));
  assert.equal((html.match(/class="entry-panel/g) ?? []).length, 3);
  assert.ok(html.includes('<div class="entry-grid">'));
  assert.ok(html.includes('class="btn btn-gold entry-primary">この設定で部屋を作る</button>'));
  assert.ok(!html.includes("ruleNote"), "no raw note paragraph");
  // the AI and spectate screens: a setup page in place of the table, not a dialog over it
  for (const page of ["play/index.html", "play/watch.html"]) {
    const p = src(page);
    assert.match(p, /<main id="entry" class="entry" hidden><\/main>\r?\n<div id="table" hidden><\/div>/, page);
    assert.ok(!p.includes("yy-start"), page);
  }
});
