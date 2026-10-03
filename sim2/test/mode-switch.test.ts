// The shared three-way switch (AIと対戦 / オンライン対戦 / 観戦) on the entry screens.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modeHref, modeSwitchHtml, PLAY_MODES, watchHref } from "../play/mode-switch.ts";
import type { PlayMode } from "../play/mode-switch.ts";
import { watchHref as watchHrefFromCore } from "../play/watch-core.ts";
import { onlineStaticAllowed, staticTarget } from "../online/server.ts";
import { serveFile } from "../play/server.ts";

const links = (html: string): { mode: string; href: string; current: boolean; text: string }[] =>
  [...html.matchAll(/<a class="mode-item[^"]*" data-mode="([a-z]+)" href="([^"]*)"( aria-current="page")?>(.*?)<\/a>/g)].map((m) => ({
    mode: m[1] ?? "",
    href: (m[2] ?? "").replace(/&amp;/g, "&"),
    current: m[3] !== undefined,
    text: (m[4] ?? "").replace(/<[^>]+>/g, " "),
  }));

test("mode switch: three entries in order, labelled with a one-line hint", () => {
  assert.deepEqual(
    PLAY_MODES.map((m) => m.label),
    ["AIと対戦", "オンライン対戦", "観戦"],
  );
  const html = modeSwitchHtml("ai", null);
  assert.ok(html.startsWith('<nav class="mode-switch" aria-label='), "a navigation landmark");
  const found = links(html);
  assert.deepEqual(found.map((l) => l.mode), ["ai", "online", "watch"]);
  assert.ok(found[0]?.text.includes("ひとりでAIと遊ぶ"));
  assert.ok(found[1]?.text.includes("友だちと部屋で遊ぶ"));
  assert.ok(found[2]?.text.includes("AI同士の対局を見る"));
});

test("mode switch: exactly the active mode carries aria-current and is-current", () => {
  for (const active of ["ai", "online", "watch"] as const satisfies readonly PlayMode[]) {
    const html = modeSwitchHtml(active, null);
    const current = links(html).filter((l) => l.current);
    assert.deepEqual(current.map((l) => l.mode), [active]);
    assert.equal((html.match(/is-current/g) ?? []).length, 1);
    assert.equal((html.match(/aria-current/g) ?? []).length, 1);
  }
});

test("mode switch: the settings travel as ?s= to every page, encoded", () => {
  const s = "v1.a b&c=d";
  const byMode = Object.fromEntries(links(modeSwitchHtml("online", s)).map((l) => [l.mode, l.href]));
  const q = `s=${encodeURIComponent(s)}`;
  assert.equal(byMode.ai, `/ai?${q}`);
  assert.equal(byMode.online, `/?${q}`);
  assert.equal(byMode.watch, `/watch?${q}`);
  // no settings: plain entry links
  assert.deepEqual(links(modeSwitchHtml("watch", null)).map((l) => l.href), ["/ai", "/", "/watch"]);
  assert.equal(modeHref("ai", ""), "/ai");
  // the href is attribute-safe
  assert.ok(!modeSwitchHtml("ai", '"><x').includes('"><x'));
});

test("mode switch: watchHref is one helper, still reachable from watch-core", () => {
  assert.equal(watchHrefFromCore, watchHref);
  assert.equal(watchHref("a b"), "/watch?s=a%20b");
});

test("mode switch: the online server serves the module, and each entry screen uses it", async () => {
  assert.ok(onlineStaticAllowed("play/mode-switch.ts"));
  const r = await serveFile("/play/mode-switch.ts", onlineStaticAllowed);
  assert.equal(r.code, 200);
  assert.ok(r.body.includes("export const modeSwitchHtml"));
  assert.ok(!/^import type /m.test(r.body), "types erased");
  for (const path of ["/", "/ai", "/watch"]) assert.ok(onlineStaticAllowed(staticTarget(path).slice(1)), path);
  const src = (f: string): string => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  // the switch comes with the shared page header (play/entry-shell.ts entryTopHtml)
  assert.ok(src("play/entry-shell.ts").includes("modeSwitchHtml(mode, s)"));
  assert.ok(src("online/lobby.ts").includes('entryTopHtml("online"'));
  assert.ok(src("online/lobby.html").includes('id="entryTop"'));
  assert.ok(src("play/ui.ts").includes('entryTopHtml("ai"'));
  assert.ok(src("play/watch.ts").includes('entryTopHtml("watch"'));
  // one control per job: the AI start card no longer has its own 観戦 button
  assert.ok(!src("play/ui.ts").includes("data-watch"));
  // the switch is styled once, in the stylesheet all three pages load
  assert.ok(src("play/panel.css").includes(".mode-switch"));
  for (const page of ["online/lobby.html", "play/index.html", "play/watch.html"]) assert.ok(src(page).includes("/play/panel.css"), page);
});
