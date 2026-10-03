// Rooms saved to disk survive a restart: a new app reading the same directory
// has the same room code, the same seat tokens and the match at the same
// position, and play goes on from there.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRooms, saveAllRooms } from "../online/room-store.ts";
import { call, newApp, nextAiInput, seatTwo, testRecordDir } from "./online-api-helpers.ts";
import type { Seated } from "./online-api-helpers.ts";

const DIR = testRecordDir("room-store");

test.after(() => {
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
});

const fresh = (tag: string): { records: string; rooms: string } => {
  const records = join(DIR, tag);
  rmSync(records, { recursive: true, force: true });
  return { records, rooms: join(records, "rooms") };
};

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

const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

for (const [tag, body] of [
  ["r0913", {}],
  ["r1003", { rule: "r1003", pack: "adopted-1003" }],
] as const) {
test(`a restarted server has the room back, at the same position, and the same tokens keep playing (${tag})`, () => {
  const d = fresh(`restart-${tag}`);
  const before = newApp(d.records, { roomDir: d.rooms });
  const s = seatTwo(before, body);
  playSome(s, 30);
  const old = before.lobby.rooms.get(s.code);
  assert.ok(old !== undefined && old.match !== null && old.match.flow.phase.kind !== "over");
  assert.ok(old.match.flow.inputs.length >= 10, "the match is really in progress");
  assert.deepEqual(readdirSync(d.rooms), [`${s.code}.json`], "one file per room, written as the game goes");
  assert.equal(saveAllRooms(before.lobby), 1);

  const after = newApp(d.records, { roomDir: d.rooms });
  assert.deepEqual(loadRooms(after.lobby), [s.code]);
  const room = after.lobby.rooms.get(s.code);
  assert.ok(room !== undefined && room.match !== null);
  assert.deepEqual(plain(room.match.flow.state), plain(old.match.flow.state));
  assert.deepEqual(plain(room.match.flow.phase), plain(old.match.flow.phase));
  assert.equal(room.match.flow.log.length, old.match.flow.log.length);
  assert.equal(room.seats[0]?.connections, 0, "nobody is connected yet after a boot");
  assert.ok(room.idleSince !== null);

  for (const seat of [0, 1] as const) {
    const who = call(after, "GET", `/api/rooms/${s.code}/whoami`, undefined, s.tokens[seat]);
    assert.equal(who.status, 200, "the token the page already holds still works");
  }
  const moved = { ...s, app: after };
  const n = room.match.flow.inputs.length;
  playSome(moved, 5);
  assert.ok(room.match.flow.inputs.length > n, "play goes on from where it stopped");
});
}

test("a closed room's file goes away; a file that does not replay is set aside and the server still starts", () => {
  const d = fresh("close");
  const app = newApp(d.records, { roomDir: d.rooms });
  const s = seatTwo(app);
  assert.equal(call(app, "POST", `/api/rooms/${s.code}/close`, undefined, s.tokens[0]).status, 200);
  assert.deepEqual(readdirSync(d.rooms), []);

  writeFileSync(join(d.rooms, "ABCDEF.json"), "{ not json", "utf8");
  const again = newApp(d.records, { roomDir: d.rooms });
  assert.deepEqual(loadRooms(again.lobby), []);
  assert.deepEqual(readdirSync(d.rooms), ["ABCDEF.json.bad"]);
});

test("without roomDir nothing is written (tests and simulators stay in memory)", () => {
  const d = fresh("off");
  const app = newApp(d.records);
  const s = seatTwo(app);
  playSome(s, 5);
  assert.equal(saveAllRooms(app.lobby), 1);
  assert.equal(existsSync(d.rooms), false);
});
