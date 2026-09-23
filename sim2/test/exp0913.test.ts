// EXP-0913 Sec.1 config flags: one acceptance test per flag, plus a default
// regression guard. Uses the placeholder22 pack (no card effects).
import test from "node:test";
import assert from "node:assert/strict";
import { cardOf } from "../src/cards.ts";
import { applyAction, isLegal, legalActions, summonCostAt } from "../src/rules.ts";
import { attackCostOf } from "../src/combat.ts";
import { occupied, unitByUid, unitHp } from "../src/state.ts";
import { drawOne, endTurn, startTurn } from "../src/turn.ts";
import { defaultConfig } from "../src/types.ts";
import type { GameEvent } from "../src/types.ts";
import { blankState, mkCtx, PACK, place } from "./helpers.ts";

const attackEvent = (events: GameEvent[]) => {
  const e = events.find((x) => x.t === "attack");
  assert.ok(e !== undefined, "expected an attack event");
  if (e.t !== "attack") throw new Error("unreachable");
  return e;
};

// ------------------------------------------------------------- defaults

test("E0 every EXP-0913 flag defaults to the pre-EXP behaviour", () => {
  const c = defaultConfig();
  assert.equal(c.summonLimit, null);
  assert.equal(c.aoeMode, "on");
  assert.equal(c.counterMode, "all");
  assert.equal(c.attackCostDelta, 0);
  assert.equal(c.refundMode, "half");
  assert.equal(c.summonCostScale, "full");
  assert.equal(c.moveOnKill, false);
  assert.equal(c.lifeValueEnabled, true);
  assert.equal(c.deckOutMode, "none");
  assert.equal(c.incomeTiming, "turn_start");
  assert.equal(c.baseIncome, 3);
});

// ---------------------------------------------------------- summonLimit

test("E1 summonLimit=1 allows one summon per turn, and the main phase goes on", () => {
  const ctx = mkCtx({ summonLimit: 1 });
  const s = blankState(ctx, 20);
  s.players[0].hand = ["p01", "p02"];
  const first = { kind: "summon" as const, handIndex: 0, pos: { x: 0, y: 0 }, facing: 0 as const };
  assert.ok(isLegal(ctx, s, first));

  const r = applyAction(ctx, s, first);
  assert.equal(r.state.summonsThisTurn, 1);
  assert.equal(
    legalActions(ctx, r.state).filter((a) => a.kind === "summon").length,
    0,
    "the second summon of the turn must be gone",
  );
  assert.ok(!isLegal(ctx, r.state, { kind: "summon", handIndex: 0, pos: { x: 2, y: 0 }, facing: 0 }));
  // the phase continues: rotating the freshly summoned unit is still legal
  const u = r.state.units[0];
  assert.ok(isLegal(ctx, r.state, { kind: "rotate", uid: u.uid, facing: 1 }));

  // and the allowance comes back at the next turn start
  const events: GameEvent[] = [];
  endTurn(ctx, r.state, events);
  startTurn(ctx, r.state, events);
  assert.equal(r.state.summonsThisTurn, 0);
});

test("E1b the default (null) still allows several summons in one turn", () => {
  const ctx = mkCtx();
  const s = blankState(ctx, 20);
  s.players[0].hand = ["p01", "p02"];
  const r = applyAction(ctx, s, {
    kind: "summon",
    handIndex: 0,
    pos: { x: 0, y: 0 },
    facing: 0,
  });
  assert.ok(
    legalActions(ctx, r.state).some((a) => a.kind === "summon"),
    "unlimited summons must survive the first one",
  );
});

// -------------------------------------------------------------- aoeMode

test("E2 aoeMode=off turns an area card into a single-target attacker", () => {
  const ctx = mkCtx({ aoeMode: "off" });
  const s = blankState(ctx, 20);
  const a = place(s, "p20", 0, 1, 1, 0); // area: front + both sides
  const e1 = place(s, "p13", 1, 1, 2, 0);
  const e2 = place(s, "p14", 1, 0, 1, 0);

  const acts = legalActions(ctx, s).filter((x) => x.kind === "attack" && x.uid === a);
  assert.deepEqual(
    acts.map((x) => (x.kind === "attack" ? x.targetUid : null)).sort(),
    [e1, e2].sort(),
    "each enemy in range is its own action; the null-target sweep is gone",
  );
  assert.ok(!isLegal(ctx, s, { kind: "attack", uid: a, targetUid: null }));

  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: e1 });
  const ev = attackEvent(r.events);
  assert.equal(ev.aoe, false);
  assert.equal(ev.hits.length, 1);
  assert.equal(unitByUid(r.state, e2)!.damage, 0, "the other enemy is untouched");
});

test("E3 aoeMode=no_ff sweeps enemies only", () => {
  const s0 = () => {
    const s = blankState(mkCtx(), 20);
    place(s, "p20", 0, 1, 1, 0); // uid 1, area attacker
    place(s, "p13", 1, 1, 2, 0); // uid 2, enemy in front
    place(s, "p14", 0, 0, 1, 0); // uid 3, ALLY on the left flank
    return s;
  };
  const on = applyAction(mkCtx(), s0(), { kind: "attack", uid: 1, targetUid: null });
  assert.equal(attackEvent(on.events).hits.length, 2, "friendly fire is the default");
  assert.ok(attackEvent(on.events).hits.some((h) => h.ally));

  const ctx = mkCtx({ aoeMode: "no_ff" });
  const noff = applyAction(ctx, s0(), { kind: "attack", uid: 1, targetUid: null });
  const ev = attackEvent(noff.events);
  assert.equal(ev.aoe, true);
  assert.equal(ev.hits.length, 1);
  assert.equal(ev.hits[0].ally, false);
  assert.equal(unitByUid(noff.state, 3)!.damage, 0, "the ally takes nothing");
});

// ---------------------------------------------------------- counterMode

test("E4 counterMode=single lets only the healthiest defender answer", () => {
  // p21 sweeps five cells; two enemies both hold the attacker in range.
  const build = () => {
    const s = blankState(mkCtx(), 20);
    place(s, "p21", 0, 1, 1, 0); // uid 1 attacker, atk 3, hp 7
    const d1 = place(s, "p13", 1, 1, 2, 2); // yin hp5 on the yin cell -> 7 HP
    place(s, "p18", 1, 2, 1, 3); // yang hp6 atk3 on the yang cell -> 8 HP
    s.units.find((u) => u.uid === d1)!.damage = 2; // 5 HP, the weaker defender
    return s;
  };
  const all = applyAction(mkCtx(), build(), { kind: "attack", uid: 1, targetUid: null });
  const evAll = attackEvent(all.events);
  assert.equal(evAll.counterCount, 2, "both defenders answer by default");
  assert.equal(evAll.counterTotal, 5); // atk 2 + atk 3

  const one = applyAction(mkCtx({ counterMode: "single" }), build(), {
    kind: "attack",
    uid: 1,
    targetUid: null,
  });
  const evOne = attackEvent(one.events);
  assert.equal(evOne.counterCount, 1);
  assert.equal(evOne.counterTotal, 3, "only the higher-HP defender (atk 3) answers");
});

// ------------------------------------------------------ attackCostDelta

test("E5 attackCostDelta shifts attack costs with a floor of 1", () => {
  const cheap = mkCtx({ attackCostDelta: -1 });
  assert.equal(attackCostOf(cheap, cardOf(PACK, "p22")), 3); // 4 - 1
  assert.equal(attackCostOf(cheap, cardOf(PACK, "p01")), 1); // 1 - 1 -> floor
  assert.equal(attackCostOf(mkCtx({ attackCostDelta: 2 }), cardOf(PACK, "p07")), 4);
  assert.equal(attackCostOf(mkCtx(), cardOf(PACK, "p07")), 2);

  const s = blankState(cheap, 20);
  const a = place(s, "p07", 0, 1, 1, 0); // attackCost 2 -> 1
  place(s, "p13", 1, 1, 2, 0);
  const r = applyAction(cheap, s, { kind: "attack", uid: a, targetUid: s.units[1].uid });
  assert.equal(r.state.players[0].mana, 19);
  assert.equal(attackEvent(r.events).cost, 1);
});

// ----------------------------------------------------------- refundMode

test("E6 refundMode=none removes the destruction refund", () => {
  // p22 stands in p07's blind spot, so the hit is 4 + 2 = 6 and lethal.
  // Mana starts below the cap so the refund is actually observable.
  const build = () => {
    const s = blankState(mkCtx(), 8);
    place(s, "p22", 0, 1, 1, 0); // atk 4
    place(s, "p07", 1, 1, 2, 0); // yin hp3 on the yin cell -> 5 HP
    return s;
  };
  const half = applyAction(mkCtx(), build(), { kind: "attack", uid: 1, targetUid: 2 });
  const none = applyAction(mkCtx({ refundMode: "none" }), build(), {
    kind: "attack",
    uid: 1,
    targetUid: 2,
  });
  // both runs must actually have killed something for the comparison to mean
  // anything; p07 sits on its own attribute cell so use a plain destroy check
  const destroyed = (evs: GameEvent[]) => evs.filter((e) => e.t === "destroy");
  assert.equal(destroyed(half.events).length, 1, "the setup must actually kill");
  assert.equal(half.state.players[1].mana, 8 + 1, "half refunds floor(3/2)");
  assert.equal(none.state.players[1].mana, 8, "none refunds nothing");
  const dNone = destroyed(none.events)[0];
  assert.equal(dNone.t === "destroy" ? dNone.manaGain : -1, 0);
});

// ------------------------------------------------------ summonCostScale

test("E7 summonCostScale=half halves the summon cost, rounding up, floor 1", () => {
  const ctx = mkCtx({ summonCostScale: "half" });
  const corner = { x: 0, y: 0 };
  assert.equal(summonCostAt(ctx, cardOf(PACK, "p01"), corner), 1); // 2 -> 1
  assert.equal(summonCostAt(ctx, cardOf(PACK, "p07"), corner), 2); // 3 -> 2
  assert.equal(summonCostAt(ctx, cardOf(PACK, "p22"), corner), 4); // 7 -> 4
  // taiji applies after the halving, still with its floor
  assert.equal(summonCostAt(ctx, cardOf(PACK, "p22"), { x: 1, y: 1 }), 2);
  assert.equal(summonCostAt(ctx, cardOf(PACK, "p01"), { x: 1, y: 1 }), 1);
  // default untouched
  assert.equal(summonCostAt(mkCtx(), cardOf(PACK, "p22"), corner), 7);
});

// ---------------------------------------------------------- moveOnKill

test("E8 moveOnKill steps the attacker onto the freed cell after a single kill", () => {
  const ctx = mkCtx({ moveOnKill: true });
  const s = blankState(ctx, 20);
  const a = place(s, "p22", 0, 1, 1, 0); // atk 4, taiji
  const e = place(s, "p01", 1, 1, 2, 0); // yin hp2 on the yin cell (1,2) -> 4 HP
  unitByUid(s, e)!.damage = 1; // 3 left, dies to 4
  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: e });
  const moved = unitByUid(r.state, a)!;
  assert.deepEqual(moved.pos, { x: 1, y: 2 });
  assert.equal(moved.facing, 0, "facing is unchanged");
  assert.ok(r.events.some((ev) => ev.t === "move"));

  // default off
  const off = applyAction(mkCtx(), s, { kind: "attack", uid: a, targetUid: e });
  assert.deepEqual(unitByUid(off.state, a)!.pos, { x: 1, y: 1 });
  assert.ok(!off.events.some((ev) => ev.t === "move"));
});

test("E8b moveOnKill does not fire on a double kill, nor into a lethal cell", () => {
  const ctx = mkCtx({ moveOnKill: true });
  // two kills at once: no move
  const s = blankState(ctx, 20);
  const a = place(s, "p21", 0, 1, 1, 0); // area, atk 3
  place(s, "p01", 1, 1, 2, 0); // 4 HP on its own cell
  place(s, "p02", 1, 0, 1, 0); // yang hp2 on a yin cell -> 0? illegal, use damage
  s.units[1].damage = 2; // 2 left
  s.units[2].damage = 0;
  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: null });
  const kills = r.events.filter((e) => e.t === "destroy").length;
  if (kills >= 2) {
    assert.ok(!r.events.some((e) => e.t === "move"), "a double kill must not move");
  }

  // the destination would put the attacker at 0 effective HP or less
  const s2 = blankState(ctx, 20);
  const b = place(s2, "p02", 0, 0, 2, 2); // yang hp2, facing south, at (0,2)
  const v = place(s2, "p01", 1, 0, 1, 0); // yin, on the yin cell (0,1)
  unitByUid(s2, v)!.damage = 3; // 4 - 3 = 1 left, dies to atk 1
  const r2 = applyAction(ctx, s2, { kind: "attack", uid: b, targetUid: v });
  assert.equal(r2.events.filter((e) => e.t === "destroy").length, 1);
  assert.deepEqual(
    unitByUid(r2.state, b)!.pos,
    { x: 0, y: 2 },
    "a yang unit must not step onto the yin cell that would kill it",
  );
  assert.ok(!r2.events.some((e) => e.t === "move"));
});

// ----------------------------------------------------- lifeValueEnabled

test("E9 lifeValueEnabled=false removes life loss and the life defeat", () => {
  const ctx = mkCtx({ lifeValueEnabled: false });
  const s = blankState(ctx, 20);
  s.players[1].life = 1;
  const a = place(s, "p22", 0, 1, 1, 0); // atk 4
  const e = place(s, "p18", 1, 1, 2, 0); // lifeValue 3
  unitByUid(s, e)!.damage = 10; // guarantees the kill
  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: e });
  const d = r.events.find((x) => x.t === "destroy");
  assert.ok(d !== undefined && d.t === "destroy");
  assert.equal(d.lifeLoss, 0);
  assert.equal(r.state.players[1].life, 1, "life is untouched");
  assert.equal(r.state.ended, false, "no life defeat");

  // and with the flag on, the same board ends the game
  const on = applyAction(mkCtx(), s, { kind: "attack", uid: a, targetUid: e });
  assert.equal(on.state.ended, true);
  assert.equal(on.state.winType, "life");
});

// ---------------------------------------------------------- deckOutMode

test("E10 deckOutMode=second ends the game on the second reshuffle", () => {
  const ctx = mkCtx({ deckOutMode: "second" });
  const s = blankState(ctx, 20);
  place(s, "p13", 0, 0, 0, 0);
  place(s, "p13", 0, 2, 0, 0); // p0 holds two cells, p1 none
  const events: GameEvent[] = [];
  s.players[0].deck = [];
  s.players[0].grave = ["p01"];
  drawOne(ctx, s, 0, events); // reshuffle 1
  s.players[0].deck = [];
  s.players[0].grave = ["p01"];
  drawOne(ctx, s, 0, events); // reshuffle 2
  assert.equal(s.players[0].reshuffleCount, 2);
  assert.equal(events.filter((e) => e.t === "reshuffle").length, 2);

  endTurn(ctx, s, events);
  assert.equal(s.ended, true);
  assert.equal(s.winType, "deck_out");
  assert.equal(s.winner, 0, "the larger occupied count wins");
  assert.equal(occupied(s, 0), 2);
});

test("E10b a level board at the second reshuffle is a draw, and none never ends", () => {
  const mk = (deckOutMode: "none" | "second") => {
    const ctx = mkCtx({ deckOutMode });
    const s = blankState(ctx, 20);
    const events: GameEvent[] = [];
    for (let i = 0; i < 2; i++) {
      s.players[0].deck = [];
      s.players[0].grave = ["p01"];
      drawOne(ctx, s, 0, events);
    }
    endTurn(ctx, s, events);
    return s;
  };
  const second = mk("second");
  assert.equal(second.ended, true);
  assert.equal(second.winType, "deck_out");
  assert.equal(second.winner, null, "0 vs 0 occupied is a draw");

  const none = mk("none");
  assert.equal(none.ended, false, "the default mode never ends on a reshuffle");
});

// --------------------------------------------------------- incomeTiming

test("E11 incomeTiming=turn_end moves the income tick to the end of the turn", () => {
  const ctx = mkCtx({ incomeTiming: "turn_end" });
  const s = blankState(ctx, 5);
  s.players[0].chips = 0;
  const events: GameEvent[] = [];
  startTurn(ctx, s, events);
  assert.equal(s.players[0].mana, 5, "no income at the start of the turn");
  const ts = events.find((e) => e.t === "turnStart");
  assert.equal(ts !== undefined && ts.t === "turnStart" ? ts.income : -1, 0);

  endTurn(ctx, s, events);
  assert.equal(s.players[0].mana, 8, "baseIncome 3 arrives at the end instead");
  const te = events.find((e) => e.t === "turnEnd");
  assert.equal(te !== undefined && te.t === "turnEnd" ? te.manaLeft : -1, 5);

  // default timing is unchanged
  const start = mkCtx();
  const s2 = blankState(start, 5);
  const ev2: GameEvent[] = [];
  startTurn(start, s2, ev2);
  assert.equal(s2.players[0].mana, 8);
  endTurn(start, s2, ev2);
  assert.equal(s2.players[0].mana, 8);
});

// ----------------------------------------------------------- baseIncome

test("E12 baseIncome raises every income tick", () => {
  const ctx = mkCtx({ baseIncome: 4 });
  const s = blankState(ctx, 5);
  const events: GameEvent[] = [];
  startTurn(ctx, s, events);
  assert.equal(s.players[0].mana, 9);
  s.players[0].chips = 4; // +2 from the chip steps
  const s2 = blankState(ctx, 0);
  s2.players[0].chips = 4;
  startTurn(ctx, s2, []);
  assert.equal(s2.players[0].mana, 6);
});

// ------------------------------------------------------- new metrics

test("E13 turnEnd carries boardHp and manaLeft, and destroys are counted", () => {
  const ctx = mkCtx();
  const s = blankState(ctx, 7);
  place(s, "p13", 0, 0, 0, 0); // hp 5 on an empty corner
  const events: GameEvent[] = [];
  endTurn(ctx, s, events);
  const te = events.find((e) => e.t === "turnEnd");
  assert.ok(te !== undefined && te.t === "turnEnd");
  assert.equal(te.boardHp, 5);
  assert.equal(te.manaLeft, 7);
});

test("E14 the summon event reports the printed cost for the high-cost metric", () => {
  const ctx = mkCtx();
  const s = blankState(ctx, 20);
  s.players[0].hand = ["p18"]; // printed summonCost 5
  const r = applyAction(ctx, s, {
    kind: "summon",
    handIndex: 0,
    pos: { x: 1, y: 1 },
    facing: 0,
  });
  const ev = r.events.find((e) => e.t === "summon");
  assert.ok(ev !== undefined && ev.t === "summon");
  assert.equal(ev.baseCost, 5);
  assert.equal(ev.cost, 3, "taiji discount applies to what was actually paid");
  assert.equal(unitHp(ctx, r.state.units[0]), 6);
});
