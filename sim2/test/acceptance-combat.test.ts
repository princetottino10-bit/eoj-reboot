// DESIGN.md Sec.8 acceptance tests 1-13.
import test from "node:test";
import assert from "node:assert/strict";
import { cardOf, packFromCards } from "../src/cards.ts";
import { applyAction, isLegal, legalActions, summonCostAt } from "../src/rules.ts";
import { unitByUid, unitHp, unitMaxHp } from "../src/state.ts";
import type { GameEvent } from "../src/types.ts";
import { blankState, mkCtx, PACK, place } from "./helpers.ts";

const attackEvent = (events: GameEvent[]) => {
  const e = events.find((x) => x.t === "attack");
  assert.ok(e !== undefined, "expected an attack event");
  if (e.t !== "attack") throw new Error("unreachable");
  return e;
};

// 1 -------------------------------------------------------------------
test("T1 cost table matches DESIGN Sec.4 bands", () => {
  const ctx = mkCtx();
  const band = (hp: number, atk: number) =>
    PACK.cards.filter((c) => c.hp === hp && c.atk === atk);
  const expect: [number, number, number, number][] = [
    // hp, atk, summonCost, attackCost
    [2, 1, 2, 1],
    [3, 2, 3, 2],
    [5, 2, 4, 2],
    [6, 3, 5, 3],
    [7, 3, 6, 3],
    [8, 4, 7, 4],
  ];
  for (const [hp, atk, sc, ac] of expect) {
    const cards = band(hp, atk);
    assert.ok(cards.length > 0, `no card for ${hp}/${atk}`);
    for (const c of cards) {
      assert.equal(c.summonCost, sc, `${c.id} summonCost`);
      assert.equal(c.attackCost, ac, `${c.id} attackCost`);
    }
  }
  assert.equal(ctx.cfg.rotateCost, 1);
  assert.equal(PACK.cards.length, 22);
});

// 2 -------------------------------------------------------------------
test("T2 taiji discount: 2->1, 3->1, 4->2 (floor 1)", () => {
  const ctx = mkCtx();
  const taiji = { x: 1, y: 1 };
  const at = (id: string) => summonCostAt(ctx, cardOf(PACK, id), taiji);
  assert.equal(at("p01"), 1); // summonCost 2
  assert.equal(at("p07"), 1); // summonCost 3
  assert.equal(at("p13"), 2); // summonCost 4
  assert.equal(at("p22"), 5); // summonCost 7
  // normal cells are undiscounted
  assert.equal(summonCostAt(ctx, cardOf(PACK, "p13"), { x: 0, y: 0 }), 4);
});

// 3 -------------------------------------------------------------------
test("T3 matching attribute cell gives +2 effective max HP (capped at 10)", () => {
  const ctx = mkCtx();
  const s = blankState(ctx);
  const u = place(s, "p02", 0, 1, 0, 0); // yang hp2 on yang cell (1,0)
  assert.equal(unitMaxHp(ctx, unitByUid(s, u)!), 4);
  const big = place(s, "p22", 0, 2, 1, 0); // yang hp8 on yang cell (2,1)
  assert.equal(unitMaxHp(ctx, unitByUid(s, big)!), 10); // 8+2 capped
  const neutral = place(s, "p01", 0, 0, 0, 0); // yin hp2 on empty corner
  assert.equal(unitMaxHp(ctx, unitByUid(s, neutral)!), 2);
});

// 4 -------------------------------------------------------------------
test("T4 summon is illegal where effective max HP would be <= 0", () => {
  const ctx = mkCtx();
  const s = blankState(ctx);
  s.players[0].hand = ["p01"]; // yin hp2
  const yangCell = { x: 2, y: 1 };
  assert.ok(
    !isLegal(ctx, s, { kind: "summon", handIndex: 0, pos: yangCell, facing: 0 }),
    "yin hp2 on the opposing cell must be illegal",
  );
  const acts = legalActions(ctx, s).filter(
    (a) => a.kind === "summon" && a.pos.x === 2 && a.pos.y === 1,
  );
  assert.equal(acts.length, 0);
  // the same card on its own attribute cell is fine
  assert.ok(isLegal(ctx, s, { kind: "summon", handIndex: 0, pos: { x: 0, y: 1 }, facing: 0 }));
});

// 5 -------------------------------------------------------------------
test("T5 no summon when the 9-cell board is full", () => {
  const ctx = mkCtx();
  const s = blankState(ctx);
  s.players[0].hand = ["p13"];
  let n = 0;
  for (let y = 0; y < 3; y++)
    for (let x = 0; x < 3; x++) {
      place(s, "p13", (n % 2) as 0 | 1, x, y, 0);
      n += 1;
    }
  assert.equal(s.units.length, 9);
  assert.equal(legalActions(ctx, s).filter((a) => a.kind === "summon").length, 0);
  assert.ok(!isLegal(ctx, s, { kind: "summon", handIndex: 0, pos: { x: 0, y: 0 }, facing: 0 }));
});

// 6 -------------------------------------------------------------------
test("T6 summon-attack is optional, costs attackCost, and uses the one attack", () => {
  const ctx = mkCtx();
  const s0 = blankState(ctx, 20);
  s0.players[0].hand = ["p07"]; // summon 3 / attack 2
  place(s0, "p13", 1, 1, 2, 2); // enemy in front

  const r1 = applyAction(ctx, s0, { kind: "summon", handIndex: 0, pos: { x: 1, y: 1 }, facing: 0 });
  assert.equal(r1.state.players[0].mana, 20 - 1); // taiji discount 3 -> 1
  const me = r1.state.units.find((u) => u.owner === 0)!;
  const atk = { kind: "attack" as const, uid: me.uid, targetUid: s0.units[0].uid };
  assert.ok(isLegal(ctx, r1.state, atk), "summon-attack must be available");

  const r2 = applyAction(ctx, r1.state, atk);
  assert.equal(r2.state.players[0].mana, 20 - 1 - 2);
  assert.ok(!isLegal(ctx, r2.state, atk), "no second attack in the same turn");
  const after = unitByUid(r2.state, me.uid)!;
  assert.equal(after.attackedThisTurn, true);
});

// 7, 8 ----------------------------------------------------------------
test("T7 attack->rotate is illegal, rotate->attack is legal", () => {
  const ctx = mkCtx();
  const s = blankState(ctx, 20);
  const a = place(s, "p07", 0, 1, 1, 3); // facing west, range (0,1)
  const e = place(s, "p13", 1, 1, 2, 2); // enemy to the north

  const rot = { kind: "rotate" as const, uid: a, facing: 0 as const };
  const atk = { kind: "attack" as const, uid: a, targetUid: e };
  assert.ok(!isLegal(ctx, s, atk), "enemy is not in range before rotating");
  assert.ok(isLegal(ctx, s, rot));

  const r1 = applyAction(ctx, s, rot);
  assert.ok(isLegal(ctx, r1.state, atk), "rotate -> attack is legal");
  const r2 = applyAction(ctx, r1.state, atk);
  assert.ok(
    !isLegal(ctx, r2.state, { kind: "rotate", uid: a, facing: 1 }),
    "attack -> rotate is illegal",
  );
});

test("T8 a unit rotates at most once per turn", () => {
  const ctx = mkCtx();
  const s = blankState(ctx, 20);
  const a = place(s, "p07", 0, 1, 1, 0);
  const r1 = applyAction(ctx, s, { kind: "rotate", uid: a, facing: 1 });
  assert.equal(r1.state.players[0].mana, 19);
  assert.ok(!isLegal(ctx, r1.state, { kind: "rotate", uid: a, facing: 2 }));
  assert.ok(!isLegal(ctx, r1.state, { kind: "rotate", uid: a, facing: 0 }));
});

// 9 -------------------------------------------------------------------
test("T9 blind shot deals +2 and draws no counter, even when in the target's range", () => {
  // synthetic card whose blind spot IS its attack range, so the "no counter"
  // half of the rule is actually exercised.
  const tricky = packFromCards("tricky", [
    {
      id: "t1",
      name: "Tricky",
      nameJa: "トリッキー",
      summonCost: 4,
      attackCost: 2,
      atk: 2,
      hp: 6,
      lifeValue: 1,
      attribute: "yin",
      aoe: false,
      attackType: "phys",
      kind: "shikigami",
      attackRange: [{ x: 0, y: 1 }],
      counterRange: [{ x: 0, y: 1 }],
      blindSpots: [{ x: 0, y: 1 }],
    },
  ]);
  const ctx = mkCtx({}, tricky);
  const s = blankState(ctx, 20);
  const a = place(s, "t1", 0, 0, 0, 0); // (0,0) facing north -> range (0,1)
  const d = place(s, "t1", 1, 0, 1, 2); // (0,1) facing south -> range+blind (0,0)

  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: d });
  const ev = attackEvent(r.events);
  assert.equal(ev.hits.length, 1);
  assert.equal(ev.hits[0].blind, true);
  assert.equal(ev.hits[0].dmg, 2 + 2);
  assert.equal(ev.counterTotal, 0, "blind shots take no counter");
  assert.equal(unitByUid(r.state, a)!.damage, 0);

  // plain-pack sanity: blind bonus applied from a back cell
  const ctx2 = mkCtx();
  const s2 = blankState(ctx2, 20);
  const a2 = place(s2, "p07", 0, 1, 0, 0); // range (1,1)
  const d2 = place(s2, "p13", 1, 1, 1, 0); // facing north -> blind (1,0)
  const r2 = applyAction(ctx2, s2, { kind: "attack", uid: a2, targetUid: d2 });
  const ev2 = attackEvent(r2.events);
  assert.equal(ev2.hits[0].blind, true);
  assert.equal(ev2.hits[0].dmg, 2 + 2);
});

// 10 ------------------------------------------------------------------
test("T10 non-blind target in range counters for its raw ATK", () => {
  const ctx = mkCtx();
  const s = blankState(ctx, 20);
  const a = place(s, "p07", 0, 0, 0, 0); // yin atk2, corner -> effMax 3, range (0,1)
  const d = place(s, "p07", 1, 0, 1, 2); // yin on yin cell -> effMax 5, range (0,0)

  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: d });
  const ev = attackEvent(r.events);
  assert.equal(ev.hits[0].blind, false);
  assert.equal(ev.hits[0].dmg, 2);
  assert.equal(ev.counterCount, 1);
  assert.equal(ev.counterTotal, 2, "counter is the raw ATK, no blind bonus");
  assert.equal(unitByUid(r.state, a)!.damage, 2);
  assert.equal(unitHp(ctx, unitByUid(r.state, a)!), 1);
  assert.equal(unitByUid(r.state, d)!.damage, 2);
});

// 11 ------------------------------------------------------------------
test("T11 a destroyed unit does not counter", () => {
  const ctx = mkCtx();
  const s = blankState(ctx, 20);
  const a = place(s, "p22", 0, 0, 0, 0); // atk4, range includes (0,1)
  const d = place(s, "p01", 1, 0, 1, 2); // yin hp2 on yin cell -> effMax 4, range (0,0)

  // sanity: were it to survive it would be in range to counter
  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: d });
  const ev = attackEvent(r.events);
  assert.equal(ev.hits[0].dmg, 4);
  assert.equal(ev.hits[0].destroyed, true);
  assert.equal(ev.counterTotal, 0, "lethal damage cancels the counter");
  assert.equal(unitByUid(r.state, a)!.damage, 0);
  assert.equal(unitByUid(r.state, d), undefined);
});

// 12 ------------------------------------------------------------------
test("T12 AoE hits every unit in range, blind is per target, allies never counter", () => {
  const ctx = mkCtx();
  const s = blankState(ctx, 20);
  // p20: aoe, atk3, range front/left/right
  const a = place(s, "p20", 0, 1, 1, 0); // range (1,2), (0,1), (2,1)
  const e1 = place(s, "p13", 1, 1, 2, 2); // facing south: range (1,1), blind off-board
  const e2 = place(s, "p22", 1, 2, 1, 1); // facing east: blind (1,1)
  const ally = place(s, "p01", 0, 0, 1, 1); // facing east: range (1,1)

  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: null });
  const ev = attackEvent(r.events);
  assert.equal(ev.aoe, true);
  assert.equal(ev.hits.length, 3);

  const h = (u: number) => ev.hits.find((x) => x.uid === u)!;
  assert.equal(h(e1).blind, false);
  assert.equal(h(e1).dmg, 3);
  assert.equal(h(e2).blind, true, "blind is judged per target");
  assert.equal(h(e2).dmg, 5);
  assert.equal(h(ally).ally, true);
  assert.equal(h(ally).dmg, 3, "allies inside the area take damage too");

  assert.equal(ev.counterCount, 1, "only the non-blind enemy counters");
  assert.equal(ev.counterTotal, 2);
  assert.equal(unitByUid(r.state, a)!.damage, 2);
  assert.equal(unitByUid(r.state, ally)!.damage, 3);
});

// 13 ------------------------------------------------------------------
test("T13 destruction costs the owner lifeValue and refunds floor(summonCost/2)", () => {
  const ctx = mkCtx();
  const s = blankState(ctx, 20);
  s.players[1].mana = 0;
  const a = place(s, "p22", 0, 1, 0, 0); // atk4, range (1,1),(1,2),(0,0),(2,0)
  const d = place(s, "p20", 1, 1, 1, 0); // summonCost 5, lifeValue 3, effMax 6 (taiji)
  unitByUid(s, d)!.damage = 3; // 3 HP left -> atk4 + blind2 is lethal

  const life0 = s.players[1].life;
  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: d });
  const de = r.events.find((e) => e.t === "destroy");
  assert.ok(de !== undefined && de.t === "destroy");
  assert.equal(de.lifeLoss, 3);
  assert.equal(de.manaGain, 2); // floor(5/2)
  assert.equal(r.state.players[1].life, life0 - 3);
  assert.equal(r.state.players[1].mana, 2);
  assert.deepEqual(r.state.players[1].grave, ["p20"]);
  assert.equal(r.state.units.length, 1);
  void a;
});
