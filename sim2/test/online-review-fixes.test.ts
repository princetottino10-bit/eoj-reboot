// Online fixes from the 2026-09-15 review (out/review-online/): seat tokens
// kept through rate limits and shared between tabs, per-IP room and stream
// caps, the rematch held by a pending proposal, the answer notice for the
// proposer, and incomeTiming refused mid-match.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { submit } from "../src/flow.ts";
import { MAX_ROOMS_PER_IP, MAX_STREAMS_PER_IP, MAX_STREAMS_PER_MEMBER, API_PER_WINDOW, IDLE_MS, attachClient, authenticate, sweep } from "../online/rooms.ts";
import { createOnlineServer } from "../online/server.ts";
import { chooseSeatToken } from "../online/storage.ts";
import type { SeatSources, TokenCheck } from "../online/storage.ts";
import { bothKeep, call, flowOf, newApp, roomOf, seatTwo, send, testRecordDir, view } from "./online-api-helpers.ts";
import type { Seated } from "./online-api-helpers.ts";

const DIR = testRecordDir("review-fixes");

test.after(() => {
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
});

const ROOM = { rule: "r0914", pack: "shuten-kyuryu", seat: "first" };

// ------------------------------------------------------- seat tokens (5, 6)

type Fake = Record<string, TokenCheck>;

const sources = (checks: Fake, over: Partial<SeatSources> = {}): SeatSources & { forgotten: string[] } => {
  const out = {
    watch: false,
    tab: null,
    stored: Object.keys(checks),
    forgotten: [] as string[],
    check: async (t: string) => checks[t] ?? { status: 401 },
    forget: (t: string) => void out.forgotten.push(t),
    ...over,
  };
  return out;
};

const seat = (connections: number): TokenCheck => ({ status: 200, role: "player", connections });
const spec = (connections: number): TokenCheck => ({ status: 200, role: "spectator", connections });

test("seat token choice: only a 401 forgets a token; rate limits, server errors and network failures ask for a retry", async () => {
  for (const status of [429, 500, 503, 0]) {
    const src = sources({ mine: { status } }, { tab: "mine" });
    assert.deepEqual(await chooseSeatToken(src), { kind: "retry", status }, `status ${status}`);
    assert.deepEqual(src.forgotten, [], `status ${status}: nothing forgotten`);
  }
  const stale = sources({ old: { status: 401 }, other: seat(0) }, { tab: "old" });
  assert.deepEqual(await chooseSeatToken(stale), { kind: "use", token: "other" });
  assert.deepEqual(stale.forgotten, ["old"]);
  assert.deepEqual(await chooseSeatToken(sources({ mine: { status: 404 } }, { tab: "mine" })), { kind: "gone" });
});

test("seat token choice: a tab uses this browser's seat token rather than spectating, and a spectator token never shadows it", async () => {
  // [B] a second tab while the first still holds the seat, in a full room
  const second = sources({ seatTok: seat(1) });
  assert.deepEqual(await chooseSeatToken(second), { kind: "use", token: "seatTok", shared: true });
  // [B] that tab had already been seated as a spectator: its reload takes the seat back
  for (const connections of [0, 1]) {
    const src = sources({ specTok: spec(1), seatTok: seat(connections) }, { tab: "specTok" });
    const shared = connections > 0 ? { shared: true } : {};
    assert.deepEqual(await chooseSeatToken(src), { kind: "use", token: "seatTok", ...shared }, `seat connections ${connections}`);
  }
  // own seat token first, even while an old connection is still open
  assert.deepEqual(await chooseSeatToken(sources({ a: seat(0), mine: seat(1) }, { tab: "mine" })), { kind: "use", token: "mine" });
  // a free seat: this browser keeps the seat it holds (the room creator opening their own invite link
  // must not fill the seat the friend is being invited to); the room page offers to ask for it
  const free = sources({ seatTok: seat(1) });
  assert.deepEqual(await chooseSeatToken(free), { kind: "use", token: "seatTok", shared: true });
  // nothing but its own spectator token: stay a spectator
  assert.deepEqual(await chooseSeatToken(sources({ specTok: spec(1) }, { tab: "specTok" })), { kind: "use", token: "specTok" });
  assert.deepEqual(await chooseSeatToken(sources({})), { kind: "join" });
  // ?watch=1 keeps spectating
  assert.deepEqual(await chooseSeatToken(sources({ seatTok: seat(0), specTok: spec(0) }, { watch: true })), { kind: "use", token: "specTok" });
  assert.deepEqual(await chooseSeatToken(sources({ seatTok: seat(0) }, { watch: true })), { kind: "join" });
});

test("seat tokens against the real server: a rate-limited reload keeps the seat; a second tab of the seat is not made a spectator", async () => {
  const app = newApp(DIR);
  const server = createOnlineServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const s = seatTwo(app, ROOM);
    const api = `${base}/api/rooms/${s.code}`;
    const check = async (t: string): Promise<TokenCheck> => {
      const res = await fetch(`${api}/whoami`, { headers: { authorization: `Bearer ${t}` } });
      return { status: res.status, ...((await res.json()) as object) };
    };
    const forgotten: string[] = [];
    const src = (tab: string | null, stored: string[]): SeatSources => ({ watch: false, tab, stored, check, forget: (t) => void forgotten.push(t) });

    // [B] the seat holder is connected; a new tab of the same browser
    const ms = authenticate(app.lobby, s.code, s.tokens[1]);
    assert.ok(ms !== null);
    attachClient(app.lobby, ms, () => {}, "127.0.0.1");
    assert.deepEqual(await chooseSeatToken(src(null, [s.tokens[1]])), { kind: "use", token: s.tokens[1], shared: true });

    // [A] the API limit is used up: the reload is told to retry and forgets nothing
    const now = Date.now();
    app.lobby.hits.set("api:127.0.0.1", Array.from({ length: API_PER_WINDOW }, () => now));
    assert.deepEqual(await chooseSeatToken(src(s.tokens[1], [s.tokens[1]])), { kind: "retry", status: 429 });
    assert.deepEqual(forgotten, []);
    app.lobby.hits.delete("api:127.0.0.1");
    assert.deepEqual(await chooseSeatToken(src(s.tokens[1], [s.tokens[1]])), { kind: "use", token: s.tokens[1] });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

// ------------------------------------------------------------ per-IP caps (7)

test("one IP can keep only MAX_ROOMS_PER_IP rooms alive; others can still create; swept rooms free the quota", () => {
  let now = 1_000_000;
  const app = newApp(DIR, { now: () => now });
  const make = (ip: string) => call(app, "POST", "/api/rooms", ROOM, undefined, ip);
  for (let i = 0; i < MAX_ROOMS_PER_IP; i++) {
    if (i === 5) now += 61_000; // stay under 5 creates a minute
    assert.equal(make("203.0.113.7").status, 200, `room ${i + 1}`);
  }
  now += 61_000;
  const refused = make("203.0.113.7");
  assert.equal(refused.status, 429);
  assert.match(String(refused.json.error), /この接続元から作った部屋が多すぎます/);
  assert.equal(make("198.51.100.1").status, 200, "another address is not affected");
  now += IDLE_MS + 1;
  sweep(app.lobby);
  assert.equal(make("203.0.113.7").status, 200, "after the idle sweep the address may create again");
});

test("one IP can hold only MAX_STREAMS_PER_IP event streams; another address still connects", async () => {
  const app = newApp(DIR, { trustProxy: true, flyProxy: true });
  const server = createOnlineServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const ac = new AbortController();
  const from = (ip: string) => ({ "fly-client-ip": ip });
  try {
    const post = async (path: string, body: object) =>
      (await (await fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...from("203.0.113.9") }, body: JSON.stringify(body) })).json()) as Record<string, string>;
    const created = await post("/api/rooms", ROOM);
    const tokens = [created.token];
    const perToken = MAX_STREAMS_PER_MEMBER;
    while (tokens.length * perToken <= MAX_STREAMS_PER_IP) tokens.push((await post(`/api/rooms/${created.code}/join`, { spectate: tokens.length > 1 })).token);
    const open = async (token: string, ip: string) => {
      const res = await fetch(`${base}/api/rooms/${created.code}/stream`, { headers: { authorization: `Bearer ${token}`, ...from(ip) }, signal: ac.signal });
      if (res.status === 200) await res.body!.getReader().read();
      return res;
    };
    let opened = 0;
    for (const t of tokens.slice(0, -1)) {
      for (let k = 0; k < perToken && opened < MAX_STREAMS_PER_IP; k++) {
        assert.equal((await open(t, "203.0.113.9")).status, 200);
        opened += 1;
      }
    }
    assert.equal(opened, MAX_STREAMS_PER_IP);
    const fresh = tokens[tokens.length - 1];
    const refused = await open(fresh, "203.0.113.9");
    assert.equal(refused.status, 429, "a token with no stream of its own is still refused for this address");
    assert.match(((await refused.json()) as { error: string }).error, /この接続元で開いている画面が多すぎます/);
    assert.equal((await open(fresh, "198.51.100.2")).status, 200, "the same room from another address");
  } finally {
    ac.abort();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

// ------------------------------------------------- rematch and proposals (9)

const NEXT = { rule: "r0914", pack: "shuten-kyuryu", config: { startLife: 12 }, cards: {} };

const overWithProposal = (): Seated => {
  const s = seatTwo(newApp(DIR), ROOM);
  assert.equal(send(s, s.tokens[1], { type: "resign" }).status, 200);
  assert.equal(send(s, s.tokens[0], { type: "propose", scope: "next", settings: NEXT }).status, 200);
  assert.equal(send(s, s.tokens[0], { type: "rematch" }).status, 200);
  assert.equal(send(s, s.tokens[1], { type: "rematch" }).status, 200);
  const v = view(s, s.tokens[1]);
  assert.equal(v.room.matchNo, 1, "the rematch waits for the answer");
  assert.deepEqual(v.room.rematch, [true, true], "both votes are kept");
  assert.equal(v.room.proposal?.scope, "next");
  return s;
};

test("a pending next-match proposal holds the rematch; answering it (or withdrawing) starts the match", () => {
  const accepted = overWithProposal();
  assert.equal(send(accepted, accepted.tokens[1], { type: "answer", id: roomOf(accepted).proposal!.id, accept: true }).status, 200);
  assert.equal(roomOf(accepted).match!.no, 2);
  assert.equal(flowOf(accepted).state.players[0].life, 12, "the agreed settings");

  const declined = overWithProposal();
  assert.equal(send(declined, declined.tokens[1], { type: "answer", id: roomOf(declined).proposal!.id, accept: false }).status, 200);
  assert.equal(roomOf(declined).match!.no, 2);
  assert.equal(flowOf(declined).state.players[0].life, 15, "the settings as they were");

  const withdrawn = overWithProposal();
  assert.equal(send(withdrawn, withdrawn.tokens[0], { type: "withdraw", id: roomOf(withdrawn).proposal!.id }).status, 200);
  assert.equal(roomOf(withdrawn).match!.no, 2);
});

// ---------------------------------------------------------- answer notice (11)

test("the room state tells the proposer how the proposal was answered, until the next input", () => {
  const s = seatTwo(newApp(DIR), ROOM);
  const propose = () => {
    assert.equal(send(s, s.tokens[0], { type: "propose", scope: "now", patch: { baseIncome: 4 } }).status, 200);
    return roomOf(s).proposal!.id;
  };
  assert.equal(view(s, s.tokens[0]).room.lastAnswer, null);
  const first = propose();
  assert.equal(send(s, s.tokens[1], { type: "answer", id: first, accept: false }).status, 200);
  for (const token of s.tokens) {
    const a = view(s, token).room.lastAnswer;
    assert.ok(a !== null);
    assert.deepEqual({ id: a.id, scope: a.scope, by: a.by, accepted: a.accepted }, { id: first, scope: "now", by: 0, accepted: false });
  }
  const second = propose();
  assert.equal(view(s, s.tokens[0]).room.lastAnswer, null, "a new proposal clears it");
  assert.equal(send(s, s.tokens[1], { type: "answer", id: second, accept: true }).status, 200);
  assert.equal(view(s, s.tokens[0]).room.lastAnswer?.accepted, true);
  assert.equal(send(s, s.tokens[0], { type: "rematch" }).status, 409, "a refused input");
  assert.equal(view(s, s.tokens[0]).room.lastAnswer?.accepted, true, "does not clear it");
  bothKeep(s);
  assert.equal(view(s, s.tokens[0]).room.lastAnswer, null, "the next accepted input does");

  // answered between matches and the rematch starts at once: seats swap, so does `by`
  const r = overWithProposal();
  assert.equal(send(r, r.tokens[1], { type: "answer", id: roomOf(r).proposal!.id, accept: true }).status, 200);
  assert.equal(view(r, r.tokens[0]).room.lastAnswer?.by, view(r, r.tokens[0]).you.seat, "still names the owner's seat");
});

// ------------------------------------------------------------ incomeTiming (8)

test("incomeTiming cannot change mid-match (the switch paid a turn twice); between matches it can", () => {
  const s = seatTwo(newApp(DIR), ROOM);
  bothKeep(s);
  const r = send(s, s.tokens[0], { type: "propose", scope: "now", patch: { incomeTiming: "turn_start" } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error, "「収入のタイミング」は試合の途中では変更できません(次の試合から)");
  const direct = submit(flowOf(s), 0, { type: "config", patch: { incomeTiming: "turn_start" } });
  assert.equal(direct.ok, false, "the flow refuses it as well (a replay cannot carry it)");
  assert.equal(flowOf(s).ctx.cfg.incomeTiming, "turn_end");
  assert.equal(send(s, s.tokens[1], { type: "resign" }).status, 200);
  assert.equal(send(s, s.tokens[0], { type: "propose", scope: "next", settings: { ...NEXT, config: { incomeTiming: "turn_start" } } }).status, 200);
});
