// Operational behaviour of the online server (audit sim2/out/audit-ops):
// records that survive an abandoned room, a sweep timer that cannot kill the
// process, the restart notice on SIGTERM, /healthz, cached + gzipped static
// files, closing a room and HEAD.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { request } from "node:http";
import type { IncomingHttpHeaders, IncomingMessage, Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { replayRecord } from "../online/match.ts";
import type { MatchRecord } from "../online/match.ts";
import { EMPTY_ROOM_MS, IDLE_MS, streamCount, sweep } from "../online/rooms.ts";
import {
  createOnlineServer,
  handleApi,
  healthBody,
  onlineStaticAllowed,
  RESTART_NOTICE,
  shutdown,
  startSweep,
  STATIC_MAX_AGE_S,
  staticCacheControl,
} from "../online/server.ts";
import type { OnlineApp } from "../online/server.ts";
import { serveFile } from "../play/server.ts";
import { call, newApp, nextAiInput, seatTwo, testRecordDir } from "./online-api-helpers.ts";
import type { Seated } from "./online-api-helpers.ts";

const DIR = testRecordDir("ops");

test.after(() => {
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
});

const freshDir = (tag: string): string => {
  const dir = join(DIR, tag);
  rmSync(dir, { recursive: true, force: true });
  return dir;
};

/** Plays `n` greedy inputs on the server's own flow, so the match is genuinely mid-game. */
const playSome = (s: Seated, n: number): void => {
  const room = s.app.lobby.rooms.get(s.code);
  assert.ok(room !== undefined && room.match !== null);
  const per = { key: "", n: 0 };
  for (let i = 0; i < n; i++) {
    const nx = nextAiInput(room.match.flow, per);
    if (nx === null) return;
    assert.equal(call(s.app, "POST", `/api/rooms/${s.code}/input`, nx[1], s.tokens[nx[0]]).status, 200);
  }
};

const records = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")).sort() : []);

// ------------------------------------------------- 2: abandoned matches

test("a room swept mid-match leaves an unfinished record, and that record still replays", () => {
  const dir = freshDir("unfinished");
  let now = 1_000_000;
  const app = newApp(dir, { now: () => now });
  const s = seatTwo(app);
  playSome(s, 30);
  const room = s.app.lobby.rooms.get(s.code);
  assert.ok(room !== undefined && room.match !== null);
  const flow = room.match.flow;
  assert.ok(flow.inputs.length >= 10 && flow.phase.kind !== "over", "the match is really in progress");
  assert.deepEqual(records(dir), [], "nothing is written while the match runs");

  now += IDLE_MS + 1;
  assert.deepEqual(sweep(app.lobby), [s.code]);
  const files = records(dir);
  assert.equal(files.length, 1, "the abandoned game is kept");
  assert.match(files[0], /-unfinished\.json$/, "the name says so");
  assert.match(files[0], /^\d{8}-\d{6}-/, "the name still starts with the start time, so pruning stays by age");

  const rec = JSON.parse(readFileSync(join(dir, files[0]), "utf8")) as MatchRecord;
  assert.equal(rec.unfinished, true);
  assert.equal(rec.room, s.code);
  assert.equal(rec.endedAt, null);
  assert.equal(rec.result.winner, null);
  assert.equal(rec.inputs.length, flow.inputs.length);
  // shorter than a finished game, and otherwise an ordinary record
  assert.deepEqual(JSON.parse(JSON.stringify(replayRecord(rec).state)), JSON.parse(JSON.stringify(flow.state)));
});

test("a swept room with no input at all writes nothing; a finished match is not re-saved as unfinished", () => {
  const dir = freshDir("nothing");
  let now = 1_000_000;
  const app = newApp(dir, { now: () => now });
  // (a) a room whose match started but where nobody ever moved
  const s = seatTwo(app);
  now += IDLE_MS + 1;
  assert.deepEqual(sweep(app.lobby), [s.code]);
  assert.deepEqual(records(dir), []);

  // (b) a room nobody ever joined goes after EMPTY_ROOM_MS, well before the 2-hour idle window
  const before = call(app, "POST", "/api/rooms", { rule: "r0913", pack: "shuten-kyuryu", seat: "first", effects: true });
  assert.equal(before.status, 200);
  now += EMPTY_ROOM_MS - 1_000;
  assert.deepEqual(sweep(app.lobby), [], "not yet");
  now += 2_000;
  assert.deepEqual(sweep(app.lobby), [before.json.code as string]);
  assert.deepEqual(records(dir), [], "a match that never started has nothing to record");
});

// -------------------------------------------- 3a: the sweep timer survives

test("an exception inside the sweep timer is reported, not fatal: the loop keeps firing", async () => {
  const app = newApp(freshDir("sweepboom"));
  let ticks = 0;
  app.lobby.rooms = {
    [Symbol.iterator]() {
      ticks += 1;
      throw new Error("boom in sweep timer");
    },
  } as unknown as typeof app.lobby.rooms;
  const seen: string[] = [];
  const stderr = process.stderr as unknown as { write: (s: string) => boolean };
  const original = stderr.write;
  stderr.write = (s: string) => {
    seen.push(s);
    return true;
  };
  const timer = startSweep(app, 5);
  try {
    // a loaded machine may run the interval slowly; what matters is that it runs again at all
    for (let i = 0; i < 600 && ticks < 3; i++) await new Promise((r) => setTimeout(r, 5));
  } finally {
    clearInterval(timer);
    stderr.write = original;
  }
  assert.ok(ticks >= 3, `the timer kept running after the first throw (${ticks} ticks)`);
  assert.equal(seen.length, ticks, "every failure is reported once");
  assert.match(seen[0], /sweep failed/);
  assert.match(seen[0], /boom in sweep timer/);
});

// ------------------------------------------------------- 4: /healthz

test("/healthz is a small JSON summary: ok, rooms, streams and uptime", () => {
  let now = 5_000_000;
  const app = newApp(freshDir("health"), { now: () => now });
  const empty = call(app, "GET", "/healthz");
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.json, { ok: true, rooms: 0, streams: 0, uptime: 0 });

  seatTwo(app);
  now += 90_000;
  assert.deepEqual(healthBody(app), { ok: true, rooms: 1, streams: 0, uptime: 90 });
  assert.deepEqual(call(app, "GET", "/healthz").json, { ok: true, rooms: 1, streams: 0, uptime: 90 });
  assert.equal(call(app, "POST", "/healthz", {}).status, 405);
  // no room codes, no names, nothing about who is playing
  assert.ok(!JSON.stringify(call(app, "GET", "/healthz").json).includes("A"));
});

// ------------------------------------------------- 5: cache + compression

test("static cache rule: the HTML entry pages are never stored, everything they import is", () => {
  assert.equal(staticCacheControl("/online/room.html"), "no-store");
  assert.equal(staticCacheControl("/play/index.html"), "no-store");
  for (const asset of ["/online/client.ts", "/play/table.css", "/data/pack-shuten-kyuryu.json", "/src/flow.ts"]) {
    assert.equal(staticCacheControl(asset), `public, max-age=${STATIC_MAX_AGE_S}`, asset);
  }
});

test("records are never reachable over HTTP, with or without the volume", async () => {
  for (const path of ["/out/online/x.json", "/out/online/", "/../out/online/x.json", "/out%2fonline%2fx.json"]) {
    assert.equal((await serveFile(path, onlineStaticAllowed)).code, 404, path);
  }
  assert.equal(onlineStaticAllowed("out/online/20260921-000000-ABC234-g1.json"), false);
});

// ------------------------------------------------------------ over HTTP

type Raw = { status: number; headers: IncomingHttpHeaders; body: Buffer };

const raw = (base: string, path: string, opts: { method?: string; headers?: Record<string, string> } = {}): Promise<Raw> =>
  new Promise((resolve, reject) => {
    const req = request(`${base}${path}`, { method: opts.method ?? "GET", headers: opts.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });

const listen = async (server: Server): Promise<string> => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

const withServer = async (app: OnlineApp, body: (base: string, server: Server) => Promise<void>): Promise<void> => {
  const server = createOnlineServer(app);
  const base = await listen(server);
  try {
    await body(base, server);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
};

test("static files are gzipped for clients that ask, and may be cached; HTML and the API are not stored", async () => {
  const app = newApp(freshDir("gzip"));
  await withServer(app, async (base) => {
    const plain = await raw(base, "/play/table.css");
    assert.equal(plain.status, 200);
    assert.equal(plain.headers["content-encoding"], undefined, "nothing is compressed unasked");
    assert.equal(plain.headers["cache-control"], `public, max-age=${STATIC_MAX_AGE_S}`);
    assert.equal(plain.headers["vary"], "Accept-Encoding");
    assert.equal(Number(plain.headers["content-length"]), plain.body.length);

    const gz = await raw(base, "/play/table.css", { headers: { "accept-encoding": "gzip" } });
    assert.equal(gz.status, 200);
    assert.equal(gz.headers["content-encoding"], "gzip");
    assert.equal(Number(gz.headers["content-length"]), gz.body.length);
    assert.deepEqual(gunzipSync(gz.body), plain.body, "the same bytes, compressed");
    assert.ok(gz.body.length * 3 < plain.body.length, `${plain.body.length} -> ${gz.body.length} bytes`);
    // the security headers of the uncompressed answer are still there
    assert.match(String(gz.headers["content-security-policy"]), /script-src 'self'/);
    assert.equal(gz.headers["x-content-type-options"], "nosniff");

    // a stripped module compresses the same way, an identity-only client gets plain bytes
    const mod = await raw(base, "/online/client.ts", { headers: { "accept-encoding": "br, gzip" } });
    assert.equal(mod.headers["content-encoding"], "gzip");
    assert.equal(mod.headers["cache-control"], `public, max-age=${STATIC_MAX_AGE_S}`);
    assert.equal((await raw(base, "/online/client.ts", { headers: { "accept-encoding": "br" } })).headers["content-encoding"], undefined);
    // gzipping twice reuses the cached buffer: same bytes
    assert.deepEqual((await raw(base, "/online/client.ts", { headers: { "accept-encoding": "gzip" } })).body, mod.body);

    // the entry pages pin a browser to one deploy, so they are never stored
    const page = await raw(base, "/", { headers: { "accept-encoding": "gzip" } });
    assert.equal(page.status, 200);
    assert.equal(page.headers["cache-control"], "no-store");
    const room = await raw(base, "/room/ABC234");
    assert.equal(room.headers["cache-control"], "no-store");

    // API answers are never cached and never compressed
    const api = await raw(base, "/api/rooms/ABC234", { headers: { "accept-encoding": "gzip" } });
    assert.equal(api.status, 404);
    assert.equal(api.headers["cache-control"], "no-store");
    assert.equal(api.headers["content-encoding"], undefined);
    const missing = await raw(base, "/play/nope.css");
    assert.equal(missing.status, 404);
    assert.equal(missing.headers["cache-control"], "no-store", "a 404 must not be cached");
  });
});

test("HEAD answers like GET without a body, for pages, assets, /healthz and the room API", async () => {
  const app = newApp(freshDir("head"));
  const s = seatTwo(app);
  await withServer(app, async (base) => {
    for (const path of ["/", `/room/${s.code}`, "/play/table.css", "/healthz", `/api/rooms/${s.code}`]) {
      const get = await raw(base, path);
      const head = await raw(base, path, { method: "HEAD" });
      assert.equal(head.status, get.status, path);
      assert.equal(head.body.length, 0, `${path}: no body`);
      assert.equal(head.headers["content-length"], String(get.body.length), `${path}: Content-Length`);
      assert.equal(head.headers["content-type"], get.headers["content-type"], path);
    }
    // a HEAD that would be a 404 GET is still a 404
    assert.equal((await raw(base, "/api/rooms/ZZZZZZ", { method: "HEAD" })).status, 404);
    // POST-only routes keep saying so
    assert.equal((await raw(base, "/api/rooms", { method: "HEAD" })).status, 405);
  });
});

// --------------------------------------------------------- 6: closing a room

test("closing a room: a seat may, a spectator may not, and the room is gone at once", () => {
  const dir = freshDir("close");
  const app = newApp(dir, { now: () => 2_000_000 });
  const s = seatTwo(app);
  const spec = call(app, "POST", `/api/rooms/${s.code}/join`, { spectate: true });
  assert.equal(spec.status, 200);
  const path = `/api/rooms/${s.code}/close`;

  assert.equal(call(app, "POST", path).status, 401, "no token at all");
  assert.equal(call(app, "POST", path, undefined, "x".repeat(32)).status, 401, "a token of the wrong room");
  const asSpectator = call(app, "POST", path, undefined, spec.json.token as string);
  assert.equal(asSpectator.status, 403);
  assert.match(String(asSpectator.json.error), /席に着いている人だけ/);
  assert.equal(app.lobby.rooms.size, 1, "the spectator changed nothing");

  assert.equal(call(app, "GET", path, undefined, s.tokens[0]).status, 405, "GET does not close anything");

  playSome(s, 8);
  assert.equal(call(app, "POST", path, undefined, s.tokens[1]).status, 200, "the seat that did not create it may close it too");
  assert.equal(app.lobby.rooms.size, 0);
  assert.equal(call(app, "POST", path, undefined, s.tokens[1]).status, 404, "closing twice");
  assert.equal(call(app, "GET", `/api/rooms/${s.code}`).status, 404);
  // the game played in it is not lost
  const files = records(dir);
  assert.equal(files.length, 1);
  assert.match(files[0], /-unfinished\.json$/);
});

test("closing a room frees one of the six rooms the address may have, without waiting for a sweep", () => {
  const app = newApp(freshDir("close-cap"), { now: () => 3_000_000 });
  const body = { rule: "r0913", pack: "shuten-kyuryu", seat: "first", effects: true };
  const made: { code: string; token: string }[] = [];
  for (let i = 0; i < 5; i++) {
    const r = call(app, "POST", "/api/rooms", body, undefined, "203.0.113.9");
    assert.equal(r.status, 200, `room ${i + 1}`);
    made.push({ code: r.json.code as string, token: r.json.token as string });
  }
  // the 6th is refused by the creates-per-minute limit, so use a room the same address already has
  assert.equal(call(app, "POST", "/api/rooms", body, undefined, "203.0.113.9").status, 429);
  assert.equal(call(app, "POST", `/api/rooms/${made[0].code}/close`, undefined, made[0].token).status, 200);
  assert.equal(app.lobby.rooms.size, 4);
});

test("closing a room ends the open streams, so the other page reconnects and is told it is gone", async () => {
  const app = newApp(freshDir("close-stream"));
  const s = seatTwo(app);
  await withServer(app, async (base) => {
    const res = await new Promise<IncomingMessage>((ok, no) => {
      const req = request(`${base}/api/rooms/${s.code}/stream`, { headers: { authorization: `Bearer ${s.tokens[1]}` } });
      req.on("response", ok);
      req.on("error", no);
      req.end();
    });
    assert.equal(res.statusCode, 200);
    const ended = new Promise<void>((r) => res.on("end", () => r()));
    res.resume();
    for (let i = 0; i < 100 && streamCount(app.lobby) === 0; i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(streamCount(app.lobby), 1);

    assert.equal(call(app, "POST", `/api/rooms/${s.code}/close`, undefined, s.tokens[0]).status, 200);
    await ended; // the server did not leave the other seat hanging on a dead room
    assert.equal(app.streams.size, 0);
    const after = await raw(base, `/api/rooms/${s.code}`);
    assert.equal(after.status, 404);
  });
});

// ------------------------------------------------- 3b: restart on SIGTERM

test("a restart tells every open stream so, instead of dropping it, and then refuses new requests", async () => {
  const app = newApp(freshDir("restart"));
  const s = seatTwo(app);
  await withServer(app, async (base, server) => {
    const res = await new Promise<IncomingMessage>((ok, no) => {
      const req = request(`${base}/api/rooms/${s.code}/stream`, { headers: { authorization: `Bearer ${s.tokens[0]}` } });
      req.on("response", ok);
      req.on("error", no);
      req.end();
    });
    assert.equal(res.statusCode, 200);
    let text = "";
    res.setEncoding("utf8");
    const bye = new Promise<void>((r) => {
      res.on("data", (c: string) => {
        text += c;
        if (text.includes("event: bye")) r();
      });
    });
    for (let i = 0; i < 100 && app.streams.size === 0; i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(app.streams.size, 1);

    let exited: number | null = null;
    shutdown(app, server, (code) => {
      exited = code;
    }, 50);
    await bye;
    assert.match(text, /event: bye/);
    assert.match(text, new RegExp(RESTART_NOTICE));
    assert.equal(app.streams.size, 0);
    assert.equal(app.shuttingDown, true);
    for (let i = 0; i < 100 && exited === null; i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(exited, 0, "the process leaves well inside Fly's 5s kill_timeout");
  });
});

test("while shutting down, requests are answered with the restart notice instead of a game", async () => {
  const app = newApp(freshDir("restart-503"));
  app.shuttingDown = true;
  await withServer(app, async (base) => {
    for (const path of ["/", "/healthz", "/api/rooms/ABC234", "/play/table.css"]) {
      const r = await raw(base, path);
      assert.equal(r.status, 503, path);
      assert.equal(JSON.parse(r.body.toString("utf8")).error, RESTART_NOTICE, path);
    }
    assert.equal((await raw(base, "/", { method: "HEAD" })).status, 503);
  });
  // handleApi itself is unchanged: the guard is in the HTTP layer only
  assert.equal(handleApi(app, { method: "GET", path: "/healthz", headers: {}, body: null, ip: "1.1.1.1" })?.status, 200);
});

// ---------------------------------------------------- 4: operational log

test("one stdout line per room created, seat joined and match finished - seats only, never names", () => {
  const lines: string[] = [];
  const app = newApp(freshDir("log"), { log: (l: string) => void lines.push(l) });
  const s = seatTwo(app, { name: "ヒミツの名前" });
  call(app, "POST", `/api/rooms/${s.code}/join`, { spectate: true, name: "のぞき" });
  assert.equal(lines.length, 3);
  assert.match(lines[0], new RegExp(`^room ${s.code} created seat=0 rule=r0913 pack=shuten-kyuryu rooms=1$`));
  assert.match(lines[1], new RegExp(`^room ${s.code} seat 1 joined match=1$`));
  assert.match(lines[2], new RegExp(`^room ${s.code} spectator joined spectators=1$`));

  // play to the end: exactly one "finished" line, with the numbers an operator wants
  const room = app.lobby.rooms.get(s.code);
  assert.ok(room !== undefined && room.match !== null);
  const per = { key: "", n: 0 };
  for (let i = 0; i < 4000; i++) {
    const nx = nextAiInput(room.match.flow, per);
    if (nx === null) break;
    call(app, "POST", `/api/rooms/${s.code}/input`, nx[1], s.tokens[nx[0]]);
  }
  const finished = lines.filter((l) => l.includes("finished"));
  assert.equal(finished.length, 1, finished.join(" | "));
  assert.match(finished[0], new RegExp(`^room ${s.code} match 1 finished rounds=\\d+ winner=\\S+ winType=\\S+ record=ok$`));
  for (const l of lines) assert.ok(!l.includes("ヒミツ") && !l.includes("のぞき"), `no names: ${l}`);
});
