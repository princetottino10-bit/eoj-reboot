// DESIGN.md Sec.8 acceptance tests 14-21.
import test from "node:test";
import assert from "node:assert/strict";
import { applyAction, incomeFor } from "../src/rules.ts";
import { endTurn, startTurn } from "../src/turn.ts";
import { occupied, unitByUid } from "../src/state.ts";
import type { GameEvent } from "../src/types.ts";
import { blankState, mkCtx, place } from "./helpers.ts";

const fill = (s: ReturnType<typeof blankState>, owner: 0 | 1, n: number): void => {
  const cells = [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: 2 },
    { x: 2, y: 2 },
    { x: 1, y: 1 },
    { x: 1, y: 0 },
    { x: 1, y: 2 },
    { x: 0, y: 1 },
    { x: 2, y: 1 },
  ];
  for (let i = 0; i < n; i++) place(s, "p13", owner, cells[i].x, cells[i].y, 0);
};

// 14 ------------------------------------------------------------------
test("T14 chip mode one_per_turn grants at most one chip per turn", () => {
  const ctx = mkCtx({ chipMode: "one_per_turn" });
  const s = blankState(ctx);
  fill(s, 0, 3);
  const ev: GameEvent[] = [];
  endTurn(ctx, s, ev);
  assert.equal(s.players[0].chips, 1);
  // three turns to catch up to three occupied cells
  s.turnPlayer = 0;
  endTurn(ctx, s, ev);
  assert.equal(s.players[0].chips, 2);
  s.turnPlayer = 0;
  endTurn(ctx, s, ev);
  assert.equal(s.players[0].chips, 3);
  s.turnPlayer = 0;
  endTurn(ctx, s, ev);
  assert.equal(s.players[0].chips, 3, "cannot exceed the occupied count");
});

// 15 ------------------------------------------------------------------
test("T15 chip mode catch_up jumps straight to the occupied count", () => {
  const ctx = mkCtx({ chipMode: "catch_up" });
  const s = blankState(ctx);
  fill(s, 0, 3);
  endTurn(ctx, s, []);
  assert.equal(s.players[0].chips, 3);
});

// 16 ------------------------------------------------------------------
test("T16 chips never decrease when occupation shrinks", () => {
  for (const chipMode of ["one_per_turn", "catch_up"] as const) {
    const ctx = mkCtx({ chipMode });
    const s = blankState(ctx);
    s.players[0].chips = 4;
    fill(s, 0, 1);
    endTurn(ctx, s, []);
    assert.equal(s.players[0].chips, 4, chipMode);
  }
});

// 17 ------------------------------------------------------------------
test("T17 income is 3 / 4 at 3 chips / 5 at 4+ chips", () => {
  const ctx = mkCtx();
  assert.equal(incomeFor(ctx, 0), 3);
  assert.equal(incomeFor(ctx, 2), 3);
  assert.equal(incomeFor(ctx, 3), 4);
  assert.equal(incomeFor(ctx, 4), 5);
  assert.equal(incomeFor(ctx, 9), 5);

  // and it actually lands in the mana pool at turn start
  const s = blankState(ctx, 0);
  s.players[0].chips = 4;
  startTurn(ctx, s, []);
  assert.equal(s.players[0].mana, 5);
});

// 18 ------------------------------------------------------------------
test("T18 reach held into the next own turn start wins by control", () => {
  const ctx = mkCtx();
  const s = blankState(ctx);
  fill(s, 0, 5);
  const ev: GameEvent[] = [];
  endTurn(ctx, s, ev);
  assert.equal(s.players[0].reach, true);
  assert.equal(s.ended, false);

  s.turnPlayer = 0; // back around to the reaching player
  startTurn(ctx, s, ev);
  assert.equal(s.ended, true);
  assert.equal(s.winner, 0);
  assert.equal(s.winType, "control");
  assert.ok(ev.some((e) => e.t === "gameEnd" && e.winType === "control"));
});

// 19 ------------------------------------------------------------------
test("T19 reach broken below the threshold does not win, and reach is re-judged", () => {
  const ctx = mkCtx();
  const s = blankState(ctx);
  fill(s, 0, 5);
  endTurn(ctx, s, []);
  assert.equal(s.players[0].reach, true);

  // opponent removes one of the five
  const victim = s.units[4];
  s.units = s.units.filter((u) => u.uid !== victim.uid);
  assert.equal(occupied(s, 0), 4);

  s.turnPlayer = 0;
  startTurn(ctx, s, []);
  assert.equal(s.ended, false, "no control win while below the threshold");

  endTurn(ctx, s, []);
  assert.equal(s.players[0].reach, false, "reach is re-judged at turn end");
});

// 20 ------------------------------------------------------------------
test("T20 hand cleanup discards then refills to 5, reshuffling the grave", () => {
  const ctx = mkCtx();
  const s = blankState(ctx, 0);
  s.players[0].hand = ["p22", "p01"]; // p22 costs 7, unaffordable at 0+3
  s.players[0].deck = [];
  s.players[0].grave = ["p02", "p03", "p04", "p05", "p06", "p07"];

  const ev: GameEvent[] = [];
  endTurn(ctx, s, ev);
  const te = ev.find((e) => e.t === "turnEnd");
  assert.ok(te !== undefined && te.t === "turnEnd");
  assert.equal(te.discarded, 1);
  assert.equal(te.drawn, 4);
  assert.equal(s.players[0].hand.length, 5);
  assert.ok(!s.players[0].hand.includes("p22"), "the discard is not handed back");
  assert.ok(s.players[0].grave.includes("p22"));
  assert.equal(s.players[0].deck.length, 2); // 6 shuffled in, 4 drawn
});

// 21 ------------------------------------------------------------------
test("T21 life reaching 0 ends the game immediately, mid-turn", () => {
  const ctx = mkCtx();
  const s = blankState(ctx, 20);
  s.players[1].life = 3;
  const a = place(s, "p22", 0, 1, 0, 0); // atk4, range covers (1,1)
  const d = place(s, "p20", 1, 1, 1, 0); // lifeValue 3, effMax 6
  unitByUid(s, d)!.damage = 3;

  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: d });
  assert.equal(r.state.players[1].life, 0);
  assert.equal(r.state.ended, true);
  assert.equal(r.state.winner, 0);
  assert.equal(r.state.winType, "life");
  assert.ok(r.events.some((e) => e.t === "gameEnd" && e.winType === "life"));
});

test("T21b a counter-kill that drops the attacker's own life ends the game too", () => {
  const ctx = mkCtx();
  const s = blankState(ctx, 20);
  s.players[0].life = 1;
  const a = place(s, "p07", 0, 0, 0, 0); // effMax 3 at a corner
  const d = place(s, "p22", 1, 0, 1, 2); // atk4, range includes (0,0)
  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: d });
  assert.equal(r.state.ended, true);
  assert.equal(r.state.winner, 1);
  assert.equal(r.state.winType, "life");
});
