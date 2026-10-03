// /world: the 3D showcase page and its vendored three.js are served by both
// the local play server and the online server, as JavaScript, and nothing
// else under vendor/ leaks out of the online allowlist.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { createPlayServer, playTarget } from "../play/server.ts";
import { createOnlineApp, createOnlineServer, onlineStaticAllowed, staticTarget } from "../online/server.ts";
import { WORLD_POSITION } from "../play/world-position.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig } from "../src/presets.ts";
import { createGame, makeCtx, unitHp, unitMaxHp } from "../src/state.ts";
import { checkRoundLimit, defaultMulliganPolicy, endTurn, performMulligan, startTurn } from "../src/turn.ts";
import { playMainPhase } from "../src/runner.ts";
import { makeAi } from "../src/ai/index.ts";
import type { GameEvent } from "../src/types.ts";

const VENDOR = [
  "three.module.js",
  "three.core.js",
  "OrbitControls.js",
  ...["EffectComposer", "RenderPass", "ShaderPass", "MaskPass", "Pass", "UnrealBloomPass", "OutputPass", "FXAAPass"].map((n) => `postprocessing/${n}.js`),
  ...["CopyShader", "LuminosityHighPassShader", "OutputShader", "FXAAShader"].map((n) => `shaders/${n}.js`),
].map((f) => `/play/vendor/three/${f}`);
const PAGE_MODULES = [
  "world.ts", "world-kit.ts", "world-paint.ts", "world-facade.ts", "world-city.ts", "world-roof.ts", "world-cards.ts", "world-fx.ts", "world-post.ts",
  "world-sky.ts", "world-volume.ts", "world-props.ts", "world-marks.ts", "world-position.ts", "world-capture.ts",
].map(
  (f) => `/play/${f}`,
);

const listen = async (server: Server): Promise<string> => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  assert.ok(addr !== null && typeof addr === "object");
  return `http://127.0.0.1:${addr.port}`;
};

const close = (server: Server): Promise<void> => new Promise((r) => server.close(() => r()));

const checkServed = async (base: string): Promise<void> => {
  for (const path of ["/world", "/world/"]) {
    const page = await fetch(base + path);
    assert.equal(page.status, 200, path);
    assert.match(page.headers.get("content-type") ?? "", /^text\/html/);
    const html = await page.text();
    assert.match(html, /src="\/play\/world\.ts"/);
    assert.match(html, /href="\/ai"/, "the 遊ぶ link goes back to the AI table");
    assert.match(html, /rel="icon"/);
  }
  for (const path of [...VENDOR, ...PAGE_MODULES, "/play/world.css"]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    const type = res.headers.get("content-type") ?? "";
    if (path.endsWith(".css")) assert.match(type, /^text\/css/, path);
    else assert.match(type, /^text\/javascript/, path);
    await res.arrayBuffer();
  }
};

test("world: /world maps to play/world.html on both servers", () => {
  assert.equal(playTarget("/world"), "/play/world.html");
  assert.equal(playTarget("/world/"), "/play/world.html");
  assert.equal(staticTarget("/world"), "/play/world.html");
  assert.ok(onlineStaticAllowed("play/world.html"));
  for (const path of [...VENDOR, ...PAGE_MODULES, "/play/world.css"]) assert.ok(onlineStaticAllowed(path.slice(1)), path);
});

test("world: the online allowlist takes only the vendored three.js modules", () => {
  for (const rel of [
    "play/vendor/three/three.module.d.ts",
    "play/vendor/three/postprocessing/EffectComposer.d.ts",
    "play/vendor/three/LICENSE",
    "play/vendor/three/other.js",
    "play/vendor/three/postprocessing/deep/x.js",
    "play/vendor/evil.js",
  ]) {
    assert.equal(onlineStaticAllowed(rel), false, rel);
  }
});

test("world: the vendored addons import three by relative path (no import map under the CSP)", () => {
  for (const path of VENDOR.filter((p) => !/three\.(module|core)\.js$/.test(p))) {
    const src = readFileSync(new URL(".." + path, import.meta.url), "utf8");
    assert.ok(!/from\s*['"]three['"]/.test(src), path);
  }
  const html = readFileSync(new URL("../play/world.html", import.meta.url), "utf8");
  assert.ok(!/<script>|type="importmap"/.test(html), "no inline scripts (CSP script-src 'self')");
});

test("world: the local play server serves the page and three.js", async () => {
  const server = createPlayServer();
  const base = await listen(server);
  try {
    await checkServed(base);
  } finally {
    await close(server);
  }
});

test("world: the online server serves the page and three.js", async () => {
  const app = createOnlineApp({ recordDir: mkdtempSync(join(tmpdir(), "sim2-world-")), seed: () => 20261003 });
  const server = createOnlineServer(app);
  const base = await listen(server);
  try {
    await checkServed(base);
    const vendor = await fetch(base + VENDOR[0]);
    assert.match(vendor.headers.get("cache-control") ?? "", /max-age/);
    await vendor.arrayBuffer();
    assert.equal((await fetch(base + "/play/vendor/three/three.module.d.ts")).status, 404);
  } finally {
    await close(server);
  }
});

test("world: the board position is a real engine position (r1003, adopted-1003, seeded greedy game)", () => {
  const pack = loadPack(packPath(WORLD_POSITION.pack));
  const ctx = makeCtx(presetConfig(WORLD_POSITION.rules), pack);
  const ais = [makeAi("greedy"), makeAi("greedy")] as const;
  const s = createGame(ctx, WORLD_POSITION.seed);
  const events: GameEvent[] = [];
  performMulligan(ctx, s, events, (c, st, p) => (ais[p].mulligan ?? defaultMulliganPolicy)(c, st, p));
  for (let turn = 1; turn <= WORLD_POSITION.turns; turn++) {
    assert.ok(!checkRoundLimit(ctx, s, events));
    startTurn(ctx, s, events, ais[s.turnPlayer].tansu);
    playMainPhase(ctx, s, [ais[0], ais[1]], events);
    assert.ok(!s.ended);
    endTurn(ctx, s, events, ais[s.turnPlayer].discard);
  }
  const key = (u: { x: number; y: number }): number => u.y * 3 + u.x;
  const got = s.units
    .map((u) => ({ printId: pack.byId.get(u.cardId)?.printId, x: u.pos.x, y: u.pos.y, facing: u.facing, owner: u.owner, hp: unitHp(ctx, u), maxHp: unitMaxHp(ctx, u) }))
    .sort((a, b) => key(a) - key(b));
  assert.deepEqual(got, [...WORLD_POSITION.units].sort((a, b) => key(a) - key(b)));
});
