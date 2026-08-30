// Spec addendum: attackType (phys/jutsu), counterRange, reigu, atk-0 cards.
import test from "node:test";
import assert from "node:assert/strict";
import { canAttack, cardOf, PACK_NAMES } from "../src/cards.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { applyAction, isLegal, legalActions } from "../src/rules.ts";
import { endTurn } from "../src/turn.ts";
import { unitByUid } from "../src/state.ts";
import type { GameEvent } from "../src/types.ts";
import { blankState, mkCtx } from "./helpers.ts";
import { place } from "./helpers.ts";

const TM = loadPack(packPath("tsukumo-miyako"));
const KR = loadPack(packPath("kyubi-ryu"));

const attackEvent = (events: GameEvent[]) => {
  const e = events.find((x) => x.t === "attack");
  assert.ok(e !== undefined && e.t === "attack");
  return e;
};

test("every pack has 22 cards and attackCost === atk", () => {
  for (const name of PACK_NAMES) {
    const pack = loadPack(packPath(name));
    assert.equal(pack.cards.length, 22, name);
    for (const c of pack.cards) assert.equal(c.attackCost, c.atk, `${name}/${c.id}`);
  }
});

test("counterRange defaults to attackRange and can be overridden", () => {
  const kanabo = cardOf(TM, "tm05");
  assert.deepEqual(kanabo.counterRange, kanabo.attackRange);
  const kuryugai = cardOf(TM, "tm17");
  assert.equal(kuryugai.counterRange.length, 0);
  assert.equal(kuryugai.attackRange.length, 24);
});

test("reigu cannot be summoned and are absent from legal actions", () => {
  const ctx = mkCtx({}, TM);
  const s = blankState(ctx, 20);
  s.players[0].hand = ["tm18", "tm03"];
  assert.ok(!isLegal(ctx, s, { kind: "summon", handIndex: 0, pos: { x: 0, y: 0 }, facing: 0 }));
  assert.ok(isLegal(ctx, s, { kind: "summon", handIndex: 1, pos: { x: 0, y: 0 }, facing: 0 }));
  const summons = legalActions(ctx, s).filter((a) => a.kind === "summon");
  assert.ok(summons.every((a) => a.kind === "summon" && a.handIndex === 1));
});

test("reigu are discarded first during hand cleanup", () => {
  const ctx = mkCtx({}, TM);
  const s = blankState(ctx, 20);
  s.players[0].hand = ["tm18", "tm19", "tm03"];
  s.players[0].deck = ["tm04", "tm05", "tm06", "tm07"];
  const ev: GameEvent[] = [];
  endTurn(ctx, s, ev);
  const te = ev.find((e) => e.t === "turnEnd");
  assert.ok(te !== undefined && te.t === "turnEnd");
  assert.equal(te.discarded, 2);
  assert.ok(!s.players[0].hand.some((c) => cardOf(TM, c).kind === "reigu"));
});

test("atk-0 / empty-range cards generate no attack action", () => {
  const ctx = mkCtx({}, TM);
  assert.ok(!canAttack(cardOf(TM, "tm01")));
  assert.ok(!canAttack(cardOf(TM, "tm07")));
  const s = blankState(ctx, 20);
  const a = place(s, "tm07", 0, 1, 1, 0); // Furu-Tansu, atk 0
  place(s, "tm03", 1, 1, 2, 0);
  assert.equal(legalActions(ctx, s).filter((x) => x.kind === "attack").length, 0);
  assert.ok(!isLegal(ctx, s, { kind: "attack", uid: a, targetUid: 2 }));
});

test("jutsu attacks take no blind bonus and draw no counter", () => {
  const ctx = mkCtx({}, TM);
  const s = blankState(ctx, 20);
  // tm02 Chochin-Obake: jutsu, atk 1, range front-1
  const a = place(s, "tm02", 0, 0, 0, 0); // range (0,1)
  const d = place(s, "tm03", 1, 0, 1, 0); // facing north -> blind (0,0), range (0,2)
  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: d });
  const ev = attackEvent(r.events);
  assert.equal(ev.hits[0].blind, false, "jutsu never counts as a blind shot");
  assert.equal(ev.hits[0].dmg, 1);

  // same geometry with the physical twin: blind bonus applies
  const ctx2 = mkCtx({}, TM);
  const s2 = blankState(ctx2, 20);
  const a2 = place(s2, "tm03", 0, 0, 0, 0);
  const d2 = place(s2, "tm03", 1, 0, 1, 0);
  const ev2 = attackEvent(applyAction(ctx2, s2, { kind: "attack", uid: a2, targetUid: d2 }).events);
  assert.equal(ev2.hits[0].blind, true);
  assert.equal(ev2.hits[0].dmg, 1 + 2);
});

test("a jutsu attacker takes no counter, but a jutsu unit can still counter", () => {
  const ctx = mkCtx({}, TM);
  // attacker jutsu, defender faces it and is in range -> no counter at all
  const s = blankState(ctx, 20);
  const a = place(s, "tm06", 0, 0, 0, 0); // Meoto-Men jutsu atk2, range (0,1)
  const d = place(s, "tm03", 1, 0, 1, 2); // phys, facing south, range (0,0)
  const ev = attackEvent(applyAction(ctx, s, { kind: "attack", uid: a, targetUid: d }).events);
  assert.equal(ev.counterTotal, 0, "jutsu attacks are not answered");

  // reverse: physical attacker, jutsu defender -> the jutsu unit counters
  const s2 = blankState(ctx, 20);
  const a2 = place(s2, "tm03", 0, 0, 0, 0); // phys atk1
  const d2 = place(s2, "tm06", 1, 0, 1, 2); // jutsu atk2, range (0,0)
  const r2 = applyAction(ctx, s2, { kind: "attack", uid: a2, targetUid: d2 });
  const ev2 = attackEvent(r2.events);
  assert.equal(ev2.hits[0].blind, false);
  assert.equal(ev2.counterCount, 1);
  assert.equal(ev2.counterTotal, 2, "counter damage is the raw ATK");
});

test("an empty counterRange means the unit never counters", () => {
  const ctx = mkCtx({}, TM);
  const s = blankState(ctx, 20);
  const a = place(s, "tm03", 0, 0, 0, 0); // phys, range (0,1)
  const d = place(s, "tm17", 1, 0, 1, 0); // Kuryugai: huge range, counterRange []
  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: d });
  assert.equal(attackEvent(r.events).counterTotal, 0);
  assert.equal(unitByUid(r.state, a)!.damage, 0);
});

test("kyubi-ryu pack is all-physical and has 6 reigu", () => {
  assert.equal(KR.cards.filter((c) => c.kind === "reigu").length, 6);
  assert.ok(KR.cards.filter((c) => c.kind === "shikigami").every((c) => c.attackType === "phys"));
});
