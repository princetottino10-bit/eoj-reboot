// The public build (online/server.ts --public): the decided rules and cards
// only, no settings page, no proposals, and every page marked for
// play/site-public.css.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { DEFAULT_RULE_PRESET, RULE_PRESETS } from "../src/presets.ts";
import { createOnlineServer, markPublicHtml, parseServerArgs, publicHidden, PUBLIC_NO_CHANGES, staticTarget, targetFor } from "../online/server.ts";
import { call, newApp, seatTwo, send, testRecordDir } from "./online-api-helpers.ts";

const DIR = testRecordDir("public");

test.after(() => {
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
});

test("public build: --public turns it on, off by default", () => {
  assert.equal(parseServerArgs([]).publicSite, false);
  assert.equal(parseServerArgs(["--public"]).publicSite, true);
  assert.equal(newApp(DIR).publicSite, false);
  assert.equal(newApp(DIR, { publicSite: true }).publicSite, true);
});

test("public build: a room gets the decided rules and cards whatever the request asks", () => {
  const app = newApp(DIR, { publicSite: true });
  const s = seatTwo(app, { rule: "r0913", pack: "shuten-kyuryu", config: { startMana: [9, 9] } });
  const room = app.lobby.rooms.get(s.code);
  assert.ok(room !== undefined);
  assert.equal(room.settings.rule, DEFAULT_RULE_PRESET);
  assert.equal(room.settings.pack, RULE_PRESETS[DEFAULT_RULE_PRESET].defaultPack);
  assert.deepEqual(room.settings.config, {});
  assert.deepEqual(room.settings.cards, {});
});

test("public build: settings proposals are refused, other inputs pass", () => {
  const app = newApp(DIR, { publicSite: true });
  const s = seatTwo(app);
  const now = send(s, s.tokens[0], { type: "propose", scope: "now", patch: { rotateCost: 0 }, cards: {} });
  assert.equal(now.status, 403);
  assert.equal(now.json.error, PUBLIC_NO_CHANGES);
  const next = send(s, s.tokens[0], { type: "propose", scope: "next", settings: { rule: "r0913", pack: "shuten-kyuryu", config: {}, cards: {} } });
  assert.equal(next.status, 403);
  assert.equal(send(s, s.tokens[0], { type: "mulligan", indices: [] }).status, 200);
  // the test table keeps its proposals
  const open = seatTwo(newApp(DIR));
  assert.equal(send(open, open.tokens[0], { type: "propose", scope: "now", patch: { rotateCost: 0 }, cards: {} }).status, 200);
});

test("public build: the hidden pages and the page mark", () => {
  for (const p of ["/rules", "/rules/", "/world", "/print", "/records", "/records.csv", "/play/rules.html", "/play/print.html", "/play/world.html", "/watch", "/play/watch.html"]) {
    assert.ok(publicHidden(p), p);
  }
  for (const p of ["/", "/online", "/ai", "/guide", "/room/ABC234", "/play/index.html", "/play/guide.html", "/play/art/face/T-001.webp"]) {
    assert.ok(!publicHidden(p), p);
  }
  assert.equal(staticTarget("/guide"), "/play/guide.html");
  // the public front page is the welcome page; the lobby is at /online on both builds
  assert.equal(targetFor("/", true), "/play/welcome.html");
  assert.equal(targetFor("/", false), "/online/lobby.html");
  assert.equal(targetFor("/online", true), "/online/lobby.html");
  const marked = markPublicHtml('<!doctype html>\n<html lang="ja">\n<head>\n<title>x</title>\n</head>\n<body></body></html>');
  assert.match(marked, /<html lang="ja" data-site="public">/);
  assert.match(marked, /<link rel="stylesheet" href="\/play\/site-public.css">\n<\/head>/);
});

test("public build over HTTP: marked pages, /rules goes to /guide, records are not served", async () => {
  const run = async (publicSite: boolean, check: (base: string) => Promise<void>): Promise<void> => {
    const server = createOnlineServer(newApp(DIR, { publicSite }));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const addr = server.address();
    assert.ok(addr !== null && typeof addr === "object");
    try {
      await check(`http://127.0.0.1:${addr.port}`);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  };
  await run(true, async (base) => {
    for (const p of ["/", "/online", "/ai", "/room/ABC234"]) {
      const html = await (await fetch(base + p)).text();
      assert.match(html, /data-site="public"/, p);
      assert.match(html, /\/play\/site-public\.css/, p);
    }
    const rules = await fetch(`${base}/rules`, { redirect: "manual" });
    assert.equal(rules.status, 302);
    assert.equal(rules.headers.get("location"), "/guide");
    assert.equal((await fetch(`${base}/records`)).status, 404);
    assert.equal((await fetch(`${base}/print`)).status, 404);
    assert.equal((await fetch(`${base}/watch`)).status, 404);
    assert.match(await (await fetch(`${base}/`)).text(), /AIと対戦する/);
    assert.match(await (await fetch(`${base}/online`)).text(), /部屋を作る/);
    assert.equal((await fetch(`${base}/play/site-public.css`)).status, 200);
    assert.equal((await fetch(`${base}/play/art/face/back.webp`)).status, 200);
    assert.equal((await fetch(`${base}/play/art/board/taiji.webp`)).status, 200);
  });
  await run(false, async (base) => {
    const html = await (await fetch(`${base}/ai`)).text();
    assert.doesNotMatch(html, /data-site=/);
    assert.equal((await fetch(`${base}/rules`)).status, 200);
    assert.match(await (await fetch(`${base}/`)).text(), /部屋を作る/);
    assert.equal((await fetch(`${base}/watch`)).status, 200);
  });
});

test("public build: the crowdfunding link is set in one place (--cf-url) and hidden until then", () => {
  assert.equal(parseServerArgs(["--public"]).cfUrl, null);
  assert.equal(parseServerArgs(["--public", "--cf-url", "https://camp-fire.jp/projects/992243"]).cfUrl, "https://camp-fire.jp/projects/992243");
  assert.throws(() => parseServerArgs(["--cf-url", "javascript:alert(1)"]), /--cf-url/);
  assert.equal(newApp(DIR, { publicSite: true }).cfUrl, null);
  const page = '<!doctype html>\n<html lang="ja">\n<head>\n</head>\n<body><a class="cf-link" href="#cf">x</a></body></html>';
  // no URL yet: no mark, the placeholder stays (the style sheet hides .cf-link)
  const off = markPublicHtml(page);
  assert.doesNotMatch(off, /data-cf-url/);
  assert.match(off, /href="#cf"/);
  const on = markPublicHtml(page, "https://camp-fire.jp/projects/992243?a=1&b=2");
  assert.match(on, /<html lang="ja" data-site="public" data-cf-url="https:\/\/camp-fire.jp\/projects\/992243\?a=1&amp;b=2">/);
  assert.match(on, /<a class="cf-link" href="https:\/\/camp-fire.jp\/projects\/992243\?a=1&amp;b=2">/);
  assert.doesNotMatch(on, /href="#cf"/);
});

test("public build over HTTP: the crowdfunding link reaches the pages only when set", async () => {
  for (const cfUrl of [null, "https://camp-fire.jp/projects/992243"]) {
    const server = createOnlineServer(newApp(DIR, { publicSite: true, cfUrl }));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const addr = server.address();
    assert.ok(addr !== null && typeof addr === "object");
    try {
      for (const p of ["/", "/guide"]) {
        const html = await (await fetch(`http://127.0.0.1:${addr.port}${p}`)).text();
        assert.match(html, /class="cf-link/, p);
        if (cfUrl === null) assert.doesNotMatch(html, /camp-fire/, p);
        else assert.ok(html.includes(`data-cf-url="${cfUrl}"`) && html.includes(`href="${cfUrl}"`), p);
      }
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }
});
