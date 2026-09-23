// DESIGN-ONLINE Sec.9 acceptance tests 1, 3-12 (test 2 lives in
// online-view.test.ts). The API is exercised through handleApi, without
// sockets; one test runs the real HTTP server to cover SSE.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bestSingleAction } from "../src/ai/greedy.ts";
import { DEFAULT_WEIGHTS } from "../src/ai/eval.ts";
import { defaultDiscardPolicy, defaultMulliganPolicy } from "../src/turn.ts";
import type { Action, GameState, PlayerId, Unit } from "../src/types.ts";
import { cleanName } from "../online/protocol.ts";
import type { ClientInput, StateMessage } from "../online/protocol.ts";
import { pruneRecords, replayRecord } from "../online/match.ts";
import type { MatchRecord } from "../online/match.ts";
import { CODE_PATTERN, EMPTY_ROOM_MS, MAX_STREAMS_PER_MEMBER, PEEK_PER_WINDOW, sweep } from "../online/rooms.ts";
import type { Room } from "../online/rooms.ts";
import {
  clientIp,
  createOnlineApp,
  createOnlineServer,
  handleApi,
  onlineStaticAllowed,
  staticTarget,
} from "../online/server.ts";
import type { ApiResponse, OnlineApp } from "../online/server.ts";
import { serveFile } from "../play/server.ts";

const TEST_DIR = join(import.meta.dirname, "..", "out", `online-test-${process.pid}`);

test.after(() => {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
});

type Body = Record<string, unknown>;

const call = (
  app: OnlineApp,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  extra: { ip?: string; type?: string; raw?: string; tooLarge?: boolean } = {},
): ApiResponse & { json: Body } => {
  const headers: Record<string, string | undefined> = {};
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  if (method === "POST") headers["content-type"] = extra.type ?? "application/json";
  const r = handleApi(app, {
    method,
    path,
    headers,
    body: extra.raw ?? (body === undefined ? null : JSON.stringify(body)),
    bodyTooLarge: extra.tooLarge,
    ip: extra.ip ?? "10.0.0.1",
  });
  assert.ok(r !== null, `${path} is an API route`);
  return { ...r, json: r.body as Body };
};

const newApp = (over: Parameters<typeof createOnlineApp>[0] = {}): OnlineApp =>
  createOnlineApp({ recordDir: TEST_DIR, seed: () => 20260913, ...over });

type Seated = { app: OnlineApp; code: string; tokens: [string, string] };

/** Creates a 9/13 room with the creator as first player and seats a second player. */
const seatTwo = (app: OnlineApp, rule = "r0913"): Seated => {
  const c = call(app, "POST", "/api/rooms", { rule, pack: "shuten-kyuryu", seat: "first", effects: true, name: "A" });
  assert.equal(c.status, 200, JSON.stringify(c.json));
  const code = c.json.code as string;
  const j = call(app, "POST", `/api/rooms/${code}/join`, { name: "B" });
  assert.equal(j.status, 200);
  return { app, code, tokens: [c.json.token as string, j.json.token as string] };
};

const view = (s: Seated, token: string): StateMessage => {
  const r = call(s.app, "GET", `/api/rooms/${s.code}/view`, undefined, token);
  assert.equal(r.status, 200);
  return r.json as unknown as StateMessage;
};

const input = (s: Seated, seat: PlayerId, body: ClientInput): ApiResponse & { json: Body } =>
  call(s.app, "POST", `/api/rooms/${s.code}/input`, body, s.tokens[seat]);

const room = (s: Seated): Room => {
  const r = s.app.lobby.rooms.get(s.code);
  assert.ok(r !== undefined);
  return r;
};

const flowOf = (s: Seated) => {
  const m = room(s).match;
  assert.ok(m !== null);
  return m.flow;
};

const bothKeep = (s: Seated): void => {
  assert.equal(input(s, 0, { type: "mulligan", indices: [] }).status, 200);
  assert.equal(input(s, 1, { type: "mulligan", indices: [] }).status, 200);
};

// ------------------------------------------------------------------ tests

test("test 1: create, two players join, tokens identify the seats", () => {
  const app = newApp();
  const s = seatTwo(app);
  assert.match(s.code, CODE_PATTERN);
  assert.ok(!/[01OIL]/.test(s.code));
  assert.notEqual(s.tokens[0], s.tokens[1]);
  for (const t of s.tokens) assert.ok(Buffer.from(t, "base64url").length === 32);
  assert.equal(call(app, "GET", `/api/rooms/${s.code}/whoami`, undefined, s.tokens[0]).json.seat, 0);
  assert.equal(call(app, "GET", `/api/rooms/${s.code}/whoami`, undefined, s.tokens[1]).json.seat, 1);
  assert.equal(call(app, "GET", `/api/rooms/${s.code}/whoami`, undefined, "x".repeat(43)).status, 401);
  assert.equal(call(app, "GET", `/api/rooms/${s.code}/whoami`).status, 401);
  assert.equal(call(app, "GET", `/api/rooms/ZZZZZZ/whoami`, undefined, s.tokens[0]).status, 404);
  // the public room info never contains tokens
  const info = call(app, "GET", `/api/rooms/${s.code.toLowerCase()}`);
  assert.equal(info.status, 200);
  assert.ok(!JSON.stringify(info.json).includes(s.tokens[0]));
  const v = view(s, s.tokens[0]);
  assert.equal(v.you.seat, 0);
  assert.equal(v.room.status, "playing");
  assert.deepEqual(v.game?.phase, { kind: "mulligan", submitted: [false, false] });
  // a second-player creator sits in seat 1
  const c2 = call(app, "POST", "/api/rooms", { rule: "r0828", pack: "tsukumo-miyako", seat: "second", effects: false });
  assert.equal(c2.json.seat, 1);
});

test("test 3: a player who is not to act is refused", () => {
  const s = seatTwo(newApp());
  bothKeep(s);
  const before = JSON.stringify(flowOf(s).state);
  const r = input(s, 1, { type: "action", action: { kind: "pass" } });
  assert.equal(r.status, 403);
  assert.equal(r.json.ok, false);
  assert.equal(JSON.stringify(flowOf(s).state), before);
});

test("test 4: an illegal action is refused and changes nothing", () => {
  const s = seatTwo(newApp());
  bothKeep(s);
  const f = flowOf(s);
  const before = JSON.stringify(f.state);
  const logBefore = f.log.length;
  const bad: Action[] = [
    { kind: "attack", uid: 999, targetUid: null },
    { kind: "rotate", uid: 1, facing: 1 },
    { kind: "summon", handIndex: 7, pos: { x: 0, y: 0 }, facing: 0 },
    { kind: "inherit", handIndex: 0, targetUid: 42 },
  ];
  for (const action of bad) {
    const r = input(s, 0, { type: "action", action });
    assert.equal(r.status, 422, JSON.stringify(action));
  }
  // mana is 3 on turn 1: a 6-cost summon off taiji cannot be paid
  const hand = f.state.players[0].hand;
  f.state.players[0].hand = ["sk16", ...hand.slice(1)];
  const snapshot = JSON.stringify(f.state);
  assert.equal(input(s, 0, { type: "action", action: { kind: "summon", handIndex: 0, pos: { x: 0, y: 0 }, facing: 0 } }).status, 422);
  assert.equal(JSON.stringify(f.state), snapshot);
  f.state.players[0].hand = hand;
  assert.equal(JSON.stringify(f.state), before);
  assert.equal(f.log.length, logBefore);
});

test("test 5: a legal action shows up in both players' views", () => {
  const s = seatTwo(newApp());
  bothKeep(s);
  const legal = view(s, s.tokens[0]).game?.legal ?? [];
  const found = legal.find((e) => e.action.kind === "summon")?.action;
  if (found === undefined || found.kind !== "summon") throw new Error("no legal summon");
  const summon: Extract<Action, { kind: "summon" }> = found;
  const cardId = flowOf(s).state.players[0].hand[summon.handIndex];
  assert.equal(input(s, 0, { type: "action", action: summon }).status, 200);
  const pos = summon.pos;
  for (const token of s.tokens) {
    const v = view(s, token);
    const u: Unit | undefined = v.game?.board.units.find((x) => x.pos.x === pos.x && x.pos.y === pos.y);
    assert.ok(u !== undefined, "unit visible");
    assert.equal(u.cardId, cardId);
    assert.equal(u.owner, 0);
    assert.ok(v.log.some((l) => l.event.t === "summon"));
  }
  assert.equal(view(s, s.tokens[1]).game?.legal, null, "the opponent gets no legal list");
});

test("test 6: the mulligan waits for both players before turn 1", () => {
  const s = seatTwo(newApp());
  const hand0 = flowOf(s).state.players[0].hand.slice();
  assert.equal(input(s, 0, { type: "mulligan", indices: [0, 2] }).status, 200);
  const v = view(s, s.tokens[1]);
  assert.deepEqual(v.game?.phase, { kind: "mulligan", submitted: [true, false] });
  assert.ok(!v.log.some((l) => l.event.t === "turnStart"));
  assert.equal(input(s, 0, { type: "action", action: { kind: "pass" } }).status, 409);
  assert.deepEqual(flowOf(s).state.players[0].hand, hand0, "nothing is redrawn before both confirm");
  assert.equal(input(s, 1, { type: "mulligan", indices: [] }).status, 200);
  const after = view(s, s.tokens[0]);
  assert.deepEqual(after.game?.phase, { kind: "main", player: 0 });
  assert.ok(after.log.some((l) => l.event.t === "turnStart"));
  assert.ok(after.log.some((l) => l.event.t === "mulliganCards"), "own returned cards are listed");
  assert.ok(!view(s, s.tokens[1]).log.some((l) => l.event.t === "mulliganCards" && l.event.player === 0));
});

test("test 7: while a player chooses discards, the opponent's inputs are refused", () => {
  const s = seatTwo(newApp());
  bothKeep(s);
  assert.equal(input(s, 0, { type: "action", action: { kind: "pass" } }).status, 200);
  assert.deepEqual(view(s, s.tokens[1]).game?.phase, { kind: "discard", player: 0 });
  const before = JSON.stringify(flowOf(s).state);
  assert.equal(input(s, 1, { type: "discard", indices: [] }).status, 403);
  assert.equal(input(s, 1, { type: "action", action: { kind: "pass" } }).status, 409);
  assert.equal(input(s, 0, { type: "action", action: { kind: "pass" } }).status, 409, "no second pass");
  assert.equal(input(s, 0, { type: "discard", indices: [0, 0] }).status, 422, "duplicate index");
  assert.equal(JSON.stringify(flowOf(s).state), before);
  assert.equal(input(s, 0, { type: "discard", indices: [1] }).status, 200);
  assert.deepEqual(view(s, s.tokens[1]).game?.phase, { kind: "main", player: 1 });
});

test("test 8: reconnecting with the seat token returns that seat's latest view", () => {
  const s = seatTwo(newApp());
  bothKeep(s);
  const legal = view(s, s.tokens[0]).game?.legal ?? [];
  const summon = legal.find((e) => e.action.kind === "summon")?.action;
  assert.ok(summon !== undefined);
  assert.equal(input(s, 0, { type: "action", action: summon }).status, 200);
  const again = view(s, s.tokens[0]);
  assert.equal(again.you.seat, 0);
  assert.equal(again.logReset, true);
  assert.equal(again.game?.board.units.length, 1);
  assert.deepEqual(again.game?.hand, flowOf(s).state.players[0].hand);
  assert.equal(again.log.length, flowOf(s).log.filter((l) => l.audience === "all" || l.audience === 0).length);
});

test("test 9: an inherit-summon works online with the right payment and refund", () => {
  const prepare = (st: GameState): void => {
    const u: Unit = {
      uid: st.nextUid, cardId: "sk03", owner: 0, pos: { x: 0, y: 0 }, facing: 1, damage: 1,
      attackedThisTurn: false, rotatedThisTurn: false, summonedThisTurn: false, hiddenBy: null, atkBuff: 0,
    };
    st.nextUid += 1;
    st.units.push(u);
    const p0 = st.players[0];
    const rest = [...p0.hand, ...p0.deck].filter((id) => id !== "sk05" && id !== "sk03");
    p0.hand = ["sk05", ...rest.slice(0, 4)];
    p0.deck = rest.slice(4);
  };
  const s = seatTwo(newApp({ flowOptions: { prepare } }));
  bothKeep(s);
  const g = view(s, s.tokens[0]).game;
  assert.ok(g !== null && g !== undefined);
  assert.equal(g.board.players[0].mana, 3);
  const entry = (g.legal ?? []).find((e) => e.action.kind === "inherit");
  assert.ok(entry !== undefined, "inherit offered: sk03 (陰2) -> sk05 (陰3)");
  assert.deepEqual(entry.action, { kind: "inherit", handIndex: 0, targetUid: 1 });
  assert.equal(entry.preview?.kind, "inherit");
  if (entry.preview?.kind === "inherit") {
    assert.equal(entry.preview.cost, 3);
    assert.equal(entry.preview.refund, 1, "ceil(2/2)");
    assert.equal(entry.preview.manaAfter, 1);
    assert.equal(entry.preview.hpAfter, 2, "HP3 with 1 damage carried");
  }
  assert.equal(input(s, 0, { type: "action", action: entry.action }).status, 200);
  for (const token of s.tokens) {
    const b = view(s, token).game?.board;
    assert.ok(b !== undefined);
    assert.equal(b.units.length, 1);
    const u = b.units[0];
    assert.equal(u.cardId, "sk05");
    assert.deepEqual(u.pos, { x: 0, y: 0 });
    assert.equal(u.facing, 1, "facing inherited");
    assert.equal(u.damage, 1, "damage inherited");
    assert.equal(b.players[0].mana, 1, "3 - 3 + 1");
    assert.deepEqual(b.players[0].grave, ["sk03"]);
    assert.equal(b.players[0].life, 15, "not a destruction");
  }
});

/** One greedy input for whoever owes one, computed on the server's flow. */
const nextAiInput = (s: Seated, perTurn: { key: string; n: number }): [PlayerId, ClientInput] | null => {
  const f = flowOf(s);
  const ph = f.phase;
  if (ph.kind === "over") return null;
  if (ph.kind === "mulligan") {
    const seat: PlayerId = ph.submitted[0] ? 1 : 0;
    return [seat, { type: "mulligan", indices: defaultMulliganPolicy(f.ctx, f.state, seat) }];
  }
  if (ph.kind === "tansu") return [ph.player, { type: "tansu", answers: ph.uids.map((uid) => ({ uid, choice: "mana" })) }];
  if (ph.kind === "discard") return [ph.player, { type: "discard", indices: defaultDiscardPolicy(f.ctx, f.state, ph.player) }];
  if (ph.kind === "counterOrder") return [ph.player, { type: "counterOrder", order: ph.uids.slice() }];
  const key = `${f.state.round}:${ph.player}`;
  if (perTurn.key !== key) {
    perTurn.key = key;
    perTurn.n = 0;
  }
  const pick = perTurn.n < f.ctx.cfg.maxActionsPerTurn ? bestSingleAction(f.ctx, f.state, ph.player, DEFAULT_WEIGHTS) : null;
  perTurn.n += 1;
  return [ph.player, { type: "action", action: pick === null ? { kind: "pass" } : pick.action }];
};

test("test 10: the finished game is saved and replays to the same result", () => {
  const s = seatTwo(newApp());
  const perTurn = { key: "", n: 0 };
  for (let i = 0; i < 3000; i++) {
    const next = nextAiInput(s, perTurn);
    if (next === null) break;
    const r = input(s, next[0], next[1]);
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }
  const m = room(s).match;
  assert.ok(m !== null && m.flow.phase.kind === "over");
  assert.ok(m.recordPath !== null && existsSync(m.recordPath), "record written");
  assert.ok(m.recordPath.includes(s.code));
  const rec = JSON.parse(readFileSync(m.recordPath, "utf8")) as MatchRecord;
  assert.equal(rec.format, "sim2-online-record");
  assert.equal(rec.rule, "r0913");
  assert.equal(rec.seed, 20260913);
  assert.ok(rec.inputs.length > 10);
  const replayed = replayRecord(rec);
  assert.deepEqual(replayed.state, m.flow.state);
  assert.deepEqual(replayed.events, m.flow.events);
  assert.equal(replayed.state.winner, rec.result.winner);
  assert.equal(view(s, s.tokens[0]).room.status, "over");

  // rematch: both vote, seats swap, match 2 starts
  assert.equal(input(s, 0, { type: "rematch" }).status, 200);
  assert.equal(view(s, s.tokens[0]).room.rematch[0], true);
  assert.equal(input(s, 1, { type: "rematch" }).status, 200);
  const v0 = view(s, s.tokens[0]);
  assert.equal(v0.room.matchNo, 2);
  assert.equal(v0.you.seat, 1, "the first player of game 1 is second in game 2");
  assert.equal(view(s, s.tokens[1]).you.seat, 0);
  assert.equal(readdirSync(TEST_DIR).filter((n) => n.includes(s.code)).length, 1);
});

test("test 11: spectators cannot act and see no hands", () => {
  const s = seatTwo(newApp());
  const j = call(s.app, "POST", `/api/rooms/${s.code}/join`, {});
  assert.equal(j.json.role, "spectator", "the room is full, so the third visitor watches");
  const spec = j.json.token as string;
  const forced = call(s.app, "POST", `/api/rooms/${s.code}/join`, { spectate: true });
  assert.equal(forced.json.role, "spectator");

  const sv = view(s, spec);
  assert.equal(sv.you.role, "spectator");
  assert.equal(sv.game?.hand, null);
  assert.equal(sv.game?.legal, null);
  // before the mulligan nothing is public yet, so no card id at all may appear
  assert.ok(!/"sk\d\d"/.test(JSON.stringify(sv)), "spectator sees no card ids");
  // the second player's view may only name its own hand
  const own = new Set(flowOf(s).state.players[1].hand);
  const named = JSON.stringify(view(s, s.tokens[1])).match(/"sk\d\d"/g) ?? [];
  assert.ok(named.every((q) => own.has(q.slice(1, -1))), "only the viewer's own cards are named");

  assert.equal(call(s.app, "POST", `/api/rooms/${s.code}/input`, { type: "mulligan", indices: [] }, spec).status, 403);
  bothKeep(s);
  assert.equal(call(s.app, "POST", `/api/rooms/${s.code}/input`, { type: "action", action: { kind: "pass" } }, spec).status, 403);
  assert.equal(call(s.app, "POST", `/api/rooms/${s.code}/input`, { type: "resign" }, spec).status, 403);
  assert.equal(view(s, spec).game?.board.players[0].handCount, 5);
  // disconnected spectators do not block new ones forever
  for (let i = 0; i < 10; i++) {
    assert.equal(call(s.app, "POST", `/api/rooms/${s.code}/join`, { spectate: true }, undefined, { ip: `9.9.9.${i}` }).json.role, "spectator");
  }
  assert.equal(room(s).spectators.length, 8);
});

test("test 12: malformed, oversized and mistyped requests are 400", () => {
  const s = seatTwo(newApp());
  const path = `/api/rooms/${s.code}/input`;
  assert.equal(call(s.app, "POST", path, undefined, s.tokens[0], { raw: "{not json" }).status, 400);
  assert.equal(call(s.app, "POST", path, undefined, s.tokens[0], { raw: `{"type":"discard","indices":[${"1,".repeat(9000)}1]}` }).status, 400);
  assert.equal(call(s.app, "POST", path, undefined, s.tokens[0], { raw: "{}", tooLarge: true }).status, 400);
  assert.equal(call(s.app, "POST", path, { type: "mulligan", indices: [] }, s.tokens[0], { type: "text/plain" }).status, 400);
  for (const body of [
    [],
    { type: "nope" },
    { type: "action" },
    { type: "action", action: { kind: "summon", handIndex: -1, pos: { x: 0, y: 0 }, facing: 0 } },
    { type: "action", action: { kind: "summon", handIndex: 0, pos: { x: 3, y: 0 }, facing: 0 } },
    { type: "action", action: { kind: "rotate", uid: 1, facing: 4 } },
    { type: "action", action: { kind: "attack", uid: "1", targetUid: null } },
    { type: "mulligan", indices: "0" },
    { type: "tansu", answers: [{ uid: 1, choice: "all" }] },
  ]) {
    assert.equal(call(s.app, "POST", path, body, s.tokens[0]).status, 400, JSON.stringify(body));
  }
  assert.equal(call(s.app, "POST", "/api/rooms", { rule: "r9999", pack: "shuten-kyuryu", seat: "first", effects: true }).status, 400);
  assert.equal(call(s.app, "POST", "/api/rooms", { rule: "r0913", pack: "../../etc", seat: "first", effects: true }).status, 400);
  const err = call(s.app, "POST", path, undefined, s.tokens[0], { raw: "{not json" });
  assert.ok(!JSON.stringify(err.json).includes("at "), "no stack trace");
});

test("room limits: creation rate, room cap and the sweep of rooms whose match never started", () => {
  let now = 1_000_000;
  const app = newApp({ now: () => now, maxRooms: 7 });
  const body = { rule: "r0913", pack: "shuten-kyuryu", seat: "random", effects: true };
  for (let i = 0; i < 5; i++) assert.equal(call(app, "POST", "/api/rooms", body, undefined, { ip: "1.1.1.1" }).status, 200);
  assert.equal(call(app, "POST", "/api/rooms", body, undefined, { ip: "1.1.1.1" }).status, 429);
  assert.equal(call(app, "POST", "/api/rooms", body, undefined, { ip: "2.2.2.2" }).status, 200);
  now += 61_000;
  assert.equal(call(app, "POST", "/api/rooms", body, undefined, { ip: "1.1.1.1" }).status, 200);
  assert.equal(call(app, "POST", "/api/rooms", body, undefined, { ip: "3.3.3.3" }).status, 503, "room cap");
  assert.equal(app.lobby.rooms.size, 7);
  // nobody ever took a second seat in any of them: they go after EMPTY_ROOM_MS, not after 2 hours
  now += EMPTY_ROOM_MS - 61_000;
  assert.equal(sweep(app.lobby).length, 6, "the rooms that never started a match are gone, the newest stays");
  now += 61_000;
  assert.equal(sweep(app.lobby).length, 1);
});

test("static files: only browser files are reachable from the online server", async () => {
  assert.equal(staticTarget("/"), "/online/lobby.html");
  assert.equal(staticTarget("/room/ABC234"), "/online/room.html");
  for (const ok of ["/online/client.ts", "/play/table.ts", "/src/rules.ts", "/data/pack-shuten-kyuryu.json"]) {
    assert.ok(onlineStaticAllowed(ok.slice(1)), ok);
  }
  for (const bad of ["/online/server.ts", "/online/rooms.ts", "/test/online-server.test.ts", "/src/../online/server.ts", "/out/online/x.json", "/..%2f..%2fpackage.json"]) {
    const r = await serveFile(bad, onlineStaticAllowed);
    assert.equal(r.code, 404, bad);
  }
  const lobby = await serveFile("/online/lobby.html", onlineStaticAllowed);
  assert.equal(lobby.code, 200);
  // every browser module strips to plain JavaScript (erasable syntax only)
  for (const mod of ["/online/client.ts", "/online/lobby.ts", "/online/storage.ts", "/play/table.ts", "/play/render.ts", "/src/flow.ts", "/src/preview.ts", "/src/presets.ts"]) {
    const r = await serveFile(mod, onlineStaticAllowed);
    assert.equal(r.code, 200, mod);
    assert.equal(r.type, "text/javascript; charset=utf-8");
    assert.ok(!/^import type /m.test(r.body), `${mod}: type imports erased`);
  }
  const html = await serveFile("/online/room.html", onlineStaticAllowed);
  assert.match(html.body, /src="\/online\/client\.ts"/);
  assert.ok(!/<script>/.test(html.body), "no inline scripts (CSP script-src 'self')");
});

test("SSE over real HTTP: first message carries the seat view, inputs push updates", async () => {
  const app = newApp();
  const server = createOnlineServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  assert.ok(addr !== null && typeof addr === "object");
  const base = `http://127.0.0.1:${addr.port}`;
  const post = (path: string, body: unknown, token?: string) =>
    fetch(base + path, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token === undefined ? {} : { authorization: `Bearer ${token}` }) },
      body: JSON.stringify(body),
    });
  const ac = new AbortController();
  try {
    const page = await fetch(`${base}/room/ABC234`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy") ?? "", /script-src 'self'/);
    const created = (await (await post("/api/rooms", { rule: "r0913", pack: "shuten-kyuryu", seat: "first", effects: true })).json()) as Body;
    const code = created.code as string;
    const joined = (await (await post(`/api/rooms/${code}/join`, {})).json()) as Body;
    const big = await fetch(`${base}/api/rooms/${code}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(20000) });
    assert.equal(big.status, 400);

    const res = await fetch(`${base}/api/rooms/${code}/stream`, {
      headers: { authorization: `Bearer ${created.token as string}` },
      signal: ac.signal,
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/event-stream/);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const nextState = async (): Promise<StateMessage> => {
      for (;;) {
        const idx = buf.indexOf("\n\n");
        if (idx !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const data = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (chunk.includes("event: state") && data !== undefined) return JSON.parse(data.slice(6)) as StateMessage;
          continue;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error("stream closed");
        buf += decoder.decode(value, { stream: true });
      }
    };
    const first = await nextState();
    assert.equal(first.logReset, true);
    assert.equal(first.you.seat, 0);
    assert.equal(first.room.seats[0].connected, true);
    assert.equal(first.game?.phase.kind, "mulligan");

    assert.equal((await post(`/api/rooms/${code}/input`, { type: "mulligan", indices: [] }, created.token as string)).status, 200);
    const second = await nextState();
    assert.deepEqual(second.game?.phase, { kind: "mulligan", submitted: [true, false] });
    assert.equal(second.logReset, false);
    assert.equal((await post(`/api/rooms/${code}/input`, { type: "mulligan", indices: [] }, joined.token as string)).status, 200);
    const third = await nextState();
    assert.deepEqual(third.game?.phase, { kind: "main", player: 0 });
    assert.ok(third.log.length > 0 && third.log.every((l) => l.seq >= 0));

    const unauth = await fetch(`${base}/api/rooms/${code}/stream`);
    assert.equal(unauth.status, 401);
  } finally {
    ac.abort();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("client IP for rate limits: only Fly-Client-IP on Fly; forwarding headers only with --trust-proxy; the socket otherwise", () => {
  const req = (headers: Record<string, string>) => ({ headers, socket: { remoteAddress: "10.0.0.9" } }) as unknown as Parameters<typeof clientIp>[1];
  const spoof = { "x-forwarded-for": "6.6.6.6, 10.0.0.1", "cf-connecting-ip": "7.7.7.7", "fly-client-ip": "203.0.113.5" };
  assert.equal(clientIp(newApp({ trustProxy: true, flyProxy: true }), req(spoof)), "203.0.113.5");
  assert.equal(clientIp(newApp({ trustProxy: true, flyProxy: true }), req({ "x-forwarded-for": "6.6.6.6" })), "10.0.0.9", "no Fly header: never a client-supplied one");
  assert.equal(clientIp(newApp({ trustProxy: true, flyProxy: false }), req(spoof)), "7.7.7.7");
  assert.equal(clientIp(newApp({ trustProxy: false, flyProxy: true }), req(spoof)), "10.0.0.9");
});

test("the AI table is hosted at /ai by the online server", () => {
  assert.equal(staticTarget("/ai"), "/play/index.html");
  assert.equal(onlineStaticAllowed("play/index.html"), true);
  assert.equal(onlineStaticAllowed("play/server.ts"), false);
});

test("public-exposure limits: streams per seat, token-less room lookups, HSTS behind a proxy, record pruning, clean names", async () => {
  const app = newApp({ trustProxy: true, flyProxy: true });
  const server = createOnlineServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  assert.ok(addr !== null && typeof addr === "object");
  const base = `http://127.0.0.1:${addr.port}`;
  const ac = new AbortController();
  try {
    const created = (await (
      await fetch(`${base}/api/rooms`, {
        method: "POST",
        headers: { "content-type": "application/json", "fly-client-ip": "198.51.100.1" },
        body: JSON.stringify({ rule: "r0914", pack: "shuten-kyuryu", seat: "first", effects: true, name: "A\u202eB\u200bC" }),
      })
    ).json()) as Body;
    const code = created.code as string;
    const lobbyPage = await fetch(`${base}/`);
    assert.match(lobbyPage.headers.get("strict-transport-security") ?? "", /max-age=/);
    const open = () => fetch(`${base}/api/rooms/${code}/stream`, { headers: { authorization: `Bearer ${created.token as string}` }, signal: ac.signal });
    const streams = [];
    for (let i = 0; i < MAX_STREAMS_PER_MEMBER; i++) {
      const r = await open();
      assert.equal(r.status, 200, `stream ${i + 1}`);
      streams.push(r);
      await r.body!.getReader().read(); // wait until the server has attached it
    }
    assert.equal((await open()).status, 429, "one seat cannot hold more streams");
  } finally {
    ac.abort();
    await new Promise<void>((r) => server.close(() => r()));
  }
  // token-less lookups are limited per IP
  const peekApp = newApp();
  const seen: number[] = [];
  for (let i = 0; i <= PEEK_PER_WINDOW; i++) seen.push(call(peekApp, "GET", "/api/rooms/ABC234", undefined, undefined, { ip: "192.0.2.7" }).status);
  assert.equal(seen[0], 404);
  assert.equal(seen[PEEK_PER_WINDOW], 429);
  // names lose zero-width and direction characters
  assert.equal(cleanName("A\u202eB\u200bC\ufeff"), "ABC");
  // records keep only the newest files
  const dir = join(TEST_DIR, "prune");
  mkdirSync(dir, { recursive: true });
  for (const n of [1, 2, 3, 4, 5]) writeFileSync(join(dir, `2026091${n}-X-g1.json`), "{}");
  pruneRecords(dir, 3);
  assert.deepEqual(readdirSync(dir).sort(), ["20260913-X-g1.json", "20260914-X-g1.json", "20260915-X-g1.json"]);
});
