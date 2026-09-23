// UI v2 wiring that the browser depends on: which files the online server
// exposes, the font CSP, the pages' module entry points, and the event fields
// the animations read.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { createFlow } from "../src/flow.ts";
import { presetConfig } from "../src/presets.ts";
import { makeCtx } from "../src/state.ts";
import { blankState, place } from "./helpers.ts";
import { applyAction } from "../src/rules.ts";
import { logView } from "../online/view.ts";
import { createOnlineApp, createOnlineServer, onlineStaticAllowed, staticTarget } from "../online/server.ts";
import { serve, serveFile } from "../play/server.ts";
import { SK } from "./online-helpers.ts";

const PLAY_DIR = join(import.meta.dirname, "..", "play");

test("every browser module of play/ is served by both servers and strips cleanly; the play server file is not", async () => {
  const browser = readdirSync(PLAY_DIR).filter((f) => (f.endsWith(".ts") || f.endsWith(".css")) && f !== "server.ts");
  assert.ok(browser.length >= 12, browser.join(","));
  for (const f of browser) {
    assert.ok(onlineStaticAllowed(`play/${f}`), `online allows play/${f}`);
    const r = await serveFile(`/play/${f}`, onlineStaticAllowed);
    assert.equal(r.code, 200, f);
    if (f.endsWith(".ts")) assert.ok(!/^import type /m.test(r.body), `${f}: types erased`);
    assert.equal((await serve(`/play/${f}`)).code, 200, `local server serves ${f}`);
  }
  assert.equal(onlineStaticAllowed("play/server.ts"), false);
  assert.equal((await serveFile("/play/server.ts", onlineStaticAllowed)).code, 404);
  for (const f of ["online/room-tools.ts", "online/client.ts", "online/lobby.ts", "online/rules-room.ts", "online/storage.ts"]) {
    assert.equal((await serveFile(`/${f}`, onlineStaticAllowed)).code, 200, f);
  }
});

test("pages load the fonts, the shared styles and their module; the online CSP admits only Google Fonts", async () => {
  for (const [path, entry] of [["/play/index.html", "/play/ui.ts"], ["/online/room.html", "/online/client.ts"], ["/online/lobby.html", "/online/lobby.ts"]]) {
    const r = await serveFile(path, (rel) => rel.startsWith("play") || rel.startsWith("online"));
    assert.equal(r.code, 200, path);
    assert.match(r.body, /fonts\.googleapis\.com\/css2\?family=Shippori\+Mincho\+B1/);
    for (const css of ["table.css", "panel.css", "fx.css"]) assert.ok(r.body.includes(`/play/${css}`), `${path} links ${css}`);
    assert.ok(r.body.includes(`src="${entry}"`), `${path} runs ${entry}`);
    assert.ok(!/<script>/.test(r.body), "no inline scripts");
  }
  // the settings page: the panel's styles, no board effects
  const rules = await serveFile("/play/rules.html", onlineStaticAllowed);
  assert.equal(rules.code, 200);
  assert.match(rules.body, /fonts\.googleapis\.com\/css2\?family=Shippori\+Mincho\+B1/);
  for (const css of ["table.css", "panel.css"]) assert.ok(rules.body.includes(`/play/${css}`), `rules.html links ${css}`);
  assert.ok(rules.body.includes('src="/play/rules-page.ts"') && !/<script>/.test(rules.body));
  assert.equal(staticTarget("/rules"), "/play/rules.html");
  assert.equal((await serve("/rules?for=ai")).code, 200, "the local server has the settings page too");
  const server = createOnlineServer(createOnlineApp({ recordDir: join(import.meta.dirname, "..", "out", `ui-static-${process.pid}`) }));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  try {
    const addr = server.address();
    assert.ok(addr !== null && typeof addr === "object");
    const res = await fetch(`http://127.0.0.1:${addr.port}/`);
    const csp = res.headers.get("content-security-policy") ?? "";
    assert.match(csp, /style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com/);
    assert.match(csp, /font-src https:\/\/fonts\.gstatic\.com/);
    assert.match(csp, /script-src 'self'(;|$)/, "scripts stay same-origin");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("attack events name the units that countered, and the per-viewer log keeps that field", () => {
  const ctx = makeCtx(presetConfig("r0913"), SK);
  const s = blankState(ctx, 10);
  const atk = place(s, "sk05", 0, 1, 1, 0); // 鎖鬼: area 1234, gap 4 -> (0,1)
  const onGap = place(s, "sk03", 1, 0, 1, 1); // on the gap, counter range covers (1,1)
  place(s, "sk02", 1, 2, 2, 2);
  const { events } = applyAction(ctx, s, { kind: "attack", uid: atk, targetUid: null });
  const ev = events.find((e) => e.t === "attack");
  assert.ok(ev !== undefined && ev.t === "attack");
  assert.deepEqual(ev.counterUids, [onGap]);
  const f = createFlow(ctx, 1);
  f.log.push({ seq: f.log.length, audience: "all", event: ev });
  const seen = logView(f.log, 1).find((l) => l.event.t === "attack");
  assert.ok(seen !== undefined && seen.event.t === "attack");
  assert.deepEqual(seen.event.counterUids, [onGap]);
});
