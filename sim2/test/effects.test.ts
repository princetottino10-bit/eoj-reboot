// One acceptance test per card effect. Spec: sim2/EFFECTS-SPEC.md
// (tm04's dead-letter rotate-0 is deliberately untested - it is not implemented.)
import test from "node:test";
import assert from "node:assert/strict";
import { loadPack, packPath } from "../src/pack-io.ts";
import { applyAction, isLegal, legalActions } from "../src/rules.ts";
import { endTurn, pendingTansuChoices, startTurn } from "../src/turn.ts";
import { cardOf } from "../src/cards.ts";
import { effectTextOf } from "../src/effects.ts";
import { occupied, unitByUid, unitHp, unitMaxHp } from "../src/state.ts";
import type { Action, GameEvent } from "../src/types.ts";
import { runGame } from "../src/runner.ts";
import { makeGreedy } from "../src/ai/greedy.ts";
import { blankState, mkCtx, place } from "./helpers.ts";

const TM = loadPack(packPath("tsukumo-miyako"));
const on = (over = {}) => mkCtx({ effects: true, ...over }, TM);
const off = (over = {}) => mkCtx({ effects: false, ...over }, TM);

const atkEvent = (events: GameEvent[]) => {
  const e = events.find((x) => x.t === "attack");
  assert.ok(e !== undefined && e.t === "attack");
  return e;
};
const hasEffect = (events: GameEvent[], source: string): boolean =>
  events.some((e) => e.t === "effect" && e.source === source);

// --- tm01 灯籠の精 -----------------------------------------------------
test("tm01: on destruction, heals the owner's priciest survivor by 1", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const victim = place(s, "tm01", 1, 0, 2, 2); // yang hp2 on empty corner -> effMax 2
  unitByUid(s, victim)!.damage = 1; // 1 HP, so ATK 1 is lethal
  const cheap = place(s, "tm03", 1, 2, 2, 0); // summonCost 2
  const pricey = place(s, "tm16", 1, 2, 0, 0); // summonCost 7
  unitByUid(s, pricey)!.damage = 3;
  unitByUid(s, cheap)!.damage = 1;
  const killer = place(s, "tm03", 0, 0, 1, 0); // atk1, range (0,2)

  const before = unitHp(ctx, unitByUid(s, pricey)!);
  const r = applyAction(ctx, s, { kind: "attack", uid: killer, targetUid: victim });
  assert.equal(unitByUid(r.state, victim), undefined, "the lamp died");
  assert.equal(unitHp(ctx, unitByUid(r.state, pricey)!), before + 1, "priciest healed");
  assert.equal(unitByUid(r.state, cheap)!.damage, 1, "the cheap one is untouched");
  assert.ok(hasEffect(r.events, "tm01"));
});

test("tm01: no survivors means the effect just fizzles", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const victim = place(s, "tm01", 1, 0, 2, 2);
  unitByUid(s, victim)!.damage = 1;
  const killer = place(s, "tm03", 0, 0, 1, 0);
  const r = applyAction(ctx, s, { kind: "attack", uid: killer, targetUid: victim });
  assert.equal(r.state.units.length, 1, "only the killer is left");
  assert.ok(!hasEffect(r.events, "tm01"));
});

// --- tm02 提灯お化け ---------------------------------------------------
test("tm02: +1 damage against yin targets only", () => {
  const ctx = on();
  const mk = (targetId: string): number => {
    const s = blankState(ctx, 20);
    const a = place(s, "tm02", 0, 0, 0, 0); // jutsu atk1, range (0,1)
    const d = place(s, targetId, 1, 0, 1, 0);
    return atkEvent(applyAction(ctx, s, { kind: "attack", uid: a, targetUid: d }).events).hits[0].dmg;
  };
  assert.equal(mk("tm03"), 2, "yin target: 1 + 1"); // tm03 is yin
  assert.equal(mk("tm04"), 1, "yang target: no bonus"); // tm04 is yang
});

// --- tm03 影鬼 ---------------------------------------------------------
test("tm03: +1 on a blind shot, stacking with the +2 blind bonus", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const a = place(s, "tm03", 0, 0, 0, 0); // atk1, range (0,1)
  const d = place(s, "tm05", 1, 0, 1, 0); // facing north -> blind is (0,0)
  const ev = atkEvent(applyAction(ctx, s, { kind: "attack", uid: a, targetUid: d }).events);
  assert.equal(ev.hits[0].blind, true);
  assert.equal(ev.hits[0].dmg, 1 + 2 + 1, "atk1 + blind2 + kage1");

  // non-blind: no bonus
  const s2 = blankState(ctx, 20);
  const a2 = place(s2, "tm03", 0, 0, 0, 0);
  const d2 = place(s2, "tm05", 1, 0, 1, 2); // faces the attacker
  const ev2 = atkEvent(applyAction(ctx, s2, { kind: "attack", uid: a2, targetUid: d2 }).events);
  assert.equal(ev2.hits[0].blind, false);
  assert.equal(ev2.hits[0].dmg, 1);
});

// --- tm06 夫婦面 -------------------------------------------------------
test("tm06: heal-attack restores ATK to an ally, costs the attack, draws no counter", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const healer = place(s, "tm06", 0, 0, 0, 0); // jutsu atk2, range (0,1)
  const ally = place(s, "tm05", 0, 0, 1, 0);
  unitByUid(s, ally)!.damage = 3;

  const act: Action = { kind: "attack", uid: healer, targetUid: ally, variant: "heal" };
  assert.ok(isLegal(ctx, s, act));
  const r = applyAction(ctx, s, act);
  assert.equal(unitByUid(r.state, ally)!.damage, 1, "healed by ATK 2");
  assert.equal(r.state.players[0].mana, 20 - 2, "attackCost paid");
  assert.equal(unitByUid(r.state, healer)!.attackedThisTurn, true);
  assert.equal(atkEvent(r.events).counterTotal, 0);
  assert.ok(!isLegal(ctx, r.state, act), "the one attack is spent");
});

test("tm06: healing never exceeds the effective max, and other cards cannot do it", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const healer = place(s, "tm06", 0, 0, 0, 0);
  const ally = place(s, "tm05", 0, 0, 1, 0);
  unitByUid(s, ally)!.damage = 1;
  const r = applyAction(ctx, s, { kind: "attack", uid: healer, targetUid: ally, variant: "heal" });
  assert.equal(unitByUid(r.state, ally)!.damage, 0);

  const s2 = blankState(ctx, 20);
  const other = place(s2, "tm03", 0, 0, 0, 0);
  const friend = place(s2, "tm05", 0, 0, 1, 0);
  assert.ok(!isLegal(ctx, s2, { kind: "attack", uid: other, targetUid: friend, variant: "heal" }));
});

// --- tm07 古箪笥 -------------------------------------------------------
test("tm07: trades 1 HP for 1 mana at its owner's turn start, and stops at 1 HP", () => {
  const ctx = on();
  const s = blankState(ctx, 0);
  const tansu = place(s, "tm07", 0, 0, 0, 0); // hp5 on a corner -> effMax 5
  const ev: GameEvent[] = [];
  startTurn(ctx, s, ev);
  assert.equal(unitHp(ctx, unitByUid(s, tansu)!), 4);
  assert.equal(s.players[0].mana, 1 + 3, "1 from the chest, 3 income");
  assert.ok(hasEffect(ev, "tm07"));

  // at 1 HP it declines
  unitByUid(s, tansu)!.damage = 4;
  s.turnPlayer = 0;
  const ev2: GameEvent[] = [];
  const manaBefore = s.players[0].mana;
  startTurn(ctx, s, ev2);
  assert.equal(unitHp(ctx, unitByUid(s, tansu)!), 1, "does not kill itself");
  assert.equal(s.players[0].mana, manaBefore + 3, "income only");
  assert.ok(!hasEffect(ev2, "tm07"));
});

// --- tm09 首引の鬼娘 ---------------------------------------------------
test("tm09 konshin: +1 damage, then 1 self-damage after the exchange", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const a = place(s, "tm09", 0, 1, 0, 0); // atk2, range = 3 cells ahead
  const d = place(s, "tm05", 1, 1, 1, 0); // faces away -> blind

  const normal = legalActions(ctx, s).filter(
    (x) => x.kind === "attack" && x.uid === a && (x.variant ?? "normal") === "normal",
  );
  const konshin = legalActions(ctx, s).filter(
    (x) => x.kind === "attack" && x.uid === a && x.variant === "konshin",
  );
  assert.ok(normal.length > 0 && konshin.length > 0, "both variants are offered");

  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: d, variant: "konshin" });
  const ev = atkEvent(r.events);
  assert.equal(ev.variant, "konshin");
  assert.equal(ev.hits[0].dmg, 2 + 2 + 1, "atk2 + blind2 + konshin1");
  assert.equal(unitByUid(r.state, a)!.damage, 1, "paid 1 HP");
  assert.ok(hasEffect(r.events, "tm09"));
});

test("tm09 konshin: dying to the self-damage runs the normal destruction path", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const a = place(s, "tm09", 0, 1, 0, 0);
  const d = place(s, "tm05", 1, 1, 1, 0);
  unitByUid(s, a)!.damage = unitMaxHp(ctx, unitByUid(s, a)!) - 1; // 1 HP left
  const lifeBefore = s.players[0].life;
  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: d, variant: "konshin" });
  assert.equal(unitByUid(r.state, a), undefined, "the attacker died to its own cost");
  assert.equal(r.state.players[0].life, lifeBefore - 2, "life value 2 lost");
  assert.ok(r.events.some((e) => e.t === "destroy" && e.uid === a));
});

// --- tm10 一目鬼 -------------------------------------------------------
test("tm10: +1 damage only when it currently has more HP than the target", () => {
  const ctx = on();
  const build = (targetDamage: number): number => {
    const s = blankState(ctx, 20);
    const a = place(s, "tm10", 0, 1, 0, 0); // aoe atk1, hp6
    const d = place(s, "tm12", 1, 1, 1, 2); // hp5, faces the attacker (not blind)
    unitByUid(s, d)!.damage = targetDamage;
    return atkEvent(applyAction(ctx, s, { kind: "attack", uid: a, targetUid: null }).events)
      .hits.find((h) => h.uid === d)!.dmg;
  };
  // attacker on (1,0) yang, tm10 is yang -> effMax 8. target tm12 none-attr -> 5
  assert.equal(build(0), 2, "8 HP vs 5 HP: +1");
  const ctx2 = on();
  const s2 = blankState(ctx2, 20);
  const a2 = place(s2, "tm10", 0, 1, 0, 0);
  const d2 = place(s2, "tm12", 1, 1, 1, 2);
  unitByUid(s2, a2)!.damage = 6; // down to 2 HP, below the target's 5
  const dmg = atkEvent(applyAction(ctx2, s2, { kind: "attack", uid: a2, targetUid: null }).events)
    .hits.find((h) => h.uid === d2)!.dmg;
  assert.equal(dmg, 1, "no bonus when outmatched");
});

// --- tm11 雲外鏡 -------------------------------------------------------
test("tm11: arrives copying the current HP of whatever it faces", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const front = place(s, "tm16", 1, 0, 1, 0); // hp8 yang on yin cell -> effMax 6
  unitByUid(s, front)!.damage = 2; // now 4 HP
  s.players[0].hand = ["tm11"];

  const r = applyAction(ctx, s, { kind: "summon", handIndex: 0, pos: { x: 0, y: 0 }, facing: 0 });
  const mirror = r.state.units[r.state.units.length - 1];
  assert.equal(unitHp(ctx, mirror), 4, "copied the 4 HP in front of it");
  assert.ok(hasEffect(r.events, "tm11"));
});

test("tm11: nothing in front means it summons normally", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  s.players[0].hand = ["tm11"];
  const r = applyAction(ctx, s, { kind: "summon", handIndex: 0, pos: { x: 0, y: 0 }, facing: 0 });
  const mirror = r.state.units[0];
  assert.equal(mirror.damage, 0);
  assert.equal(unitHp(ctx, mirror), unitMaxHp(ctx, mirror));
});

// --- tm12 照魔鏡 -------------------------------------------------------
test("tm12: borrows the ATK of the physical unit in front of it, live", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const mirror = place(s, "tm12", 0, 1, 1, 0); // atk2, range includes (1,2),(0,1),(2,1)
  const front = place(s, "tm16", 1, 1, 2, 2); // phys atk3, faces the mirror
  const r = applyAction(ctx, s, { kind: "attack", uid: mirror, targetUid: front });
  const ev = atkEvent(r.events);
  assert.equal(ev.hits[0].dmg, 3, "used the front unit's ATK 3, not its own 2");
  assert.equal(ev.cost, 2, "cost stays its own attackCost");
  assert.ok(hasEffect(r.events, "tm12"), "the swap is logged so it can be counted");

  // a jutsu unit in front is not borrowed from
  const s2 = blankState(ctx, 20);
  const m2 = place(s2, "tm12", 0, 1, 1, 0);
  const f2 = place(s2, "tm06", 1, 1, 2, 2); // jutsu atk2... use a jutsu with different atk
  const ev2 = atkEvent(applyAction(ctx, s2, { kind: "attack", uid: m2, targetUid: f2 }).events);
  assert.equal(ev2.hits[0].dmg, 2, "jutsu in front is ignored; own ATK 2 used");
});

// --- tm15 茨木童子 -----------------------------------------------------
test("tm15: regenerates on a re-attack but not on a summon-attack", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  s.players[0].hand = ["tm15"];
  // tm15 at (1,1) facing north reaches (1,2), (2,2) and (2,1).
  // Both foes face north so neither is in range to counter back.
  place(s, "tm07", 1, 1, 2, 0); // atk0 wall
  place(s, "tm07", 1, 2, 1, 0);

  // summon then attack in the same turn = summon-attack, no regen
  const r1 = applyAction(ctx, s, { kind: "summon", handIndex: 0, pos: { x: 1, y: 1 }, facing: 0 });
  const ibaraki = r1.state.units[r1.state.units.length - 1];
  unitByUid(r1.state, ibaraki.uid)!.damage = 3;
  const r2 = applyAction(ctx, r1.state, { kind: "attack", uid: ibaraki.uid, targetUid: null });
  assert.equal(unitByUid(r2.state, ibaraki.uid)!.damage, 3, "summon-attack does not regenerate");
  assert.ok(!hasEffect(r2.events, "tm15"));

  // next turn the same unit re-attacks
  const s3 = r2.state;
  const self = s3.units.find((u) => u.uid === ibaraki.uid)!;
  self.summonedThisTurn = false;
  self.attackedThisTurn = false;
  assert.ok(s3.units.some((u) => u.owner === 1), "a target survived for the re-attack");
  const r3 = applyAction(ctx, s3, { kind: "attack", uid: ibaraki.uid, targetUid: null });
  assert.equal(unitByUid(r3.state, ibaraki.uid)!.damage, 2, "re-attack regenerates 1");
  assert.ok(hasEffect(r3.events, "tm15"));
});

// --- tm16 酒呑童子 -----------------------------------------------------
test("tm16: ATK+1 for the turn when any reigu targets it, from either side", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const shuten = place(s, "tm16", 0, 1, 1, 0); // aoe atk3
  const foe = place(s, "tm07", 1, 1, 2, 0);
  s.players[0].hand = ["tm18"]; // Yanari: rotate anything

  const r = applyAction(ctx, s, {
    kind: "reigu",
    handIndex: 0,
    targetUid: shuten,
    facing: 1,
  });
  assert.equal(unitByUid(r.state, shuten)!.atkBuff, 1);
  assert.ok(hasEffect(r.events, "tm16"));

  // the buff shows up in damage, then expires at end of turn
  unitByUid(r.state, shuten)!.facing = 0;
  const r2 = applyAction(ctx, r.state, { kind: "attack", uid: shuten, targetUid: null });
  assert.equal(atkEvent(r2.events).hits.find((h) => h.uid === foe)!.dmg, 3 + 1 + 2);
  endTurn(ctx, r2.state, []);
  assert.equal(unitByUid(r2.state, shuten)!.atkBuff, 0, "cleared at end of turn");
});

// --- tm17 玖龍街 -------------------------------------------------------
test("tm17: locks the opponent out of rotate commands, and proxy-rotates instead", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const kuryu = place(s, "tm17", 1, 1, 1, 0); // enemy Kuryugai on the board
  const mine = place(s, "tm05", 0, 0, 0, 0);
  assert.ok(
    !isLegal(ctx, s, { kind: "rotate", uid: mine, facing: 1 }),
    "rotate command is locked while an enemy Kuryugai is out",
  );
  assert.equal(legalActions(ctx, s).filter((a) => a.kind === "rotate").length, 0);

  // its owner uses its rotate to turn someone else
  const s2 = blankState(ctx, 20);
  s2.turnPlayer = 1;
  const k2 = place(s2, "tm17", 1, 1, 1, 0);
  const victim = place(s2, "tm05", 0, 0, 0, 0);
  const act: Action = { kind: "proxyRotate", uid: k2, targetUid: victim, facing: 1 };
  assert.ok(isLegal(ctx, s2, act));
  const r = applyAction(ctx, s2, act);
  assert.equal(unitByUid(r.state, victim)!.facing, 1, "the other unit turned");
  assert.equal(unitByUid(r.state, k2)!.facing, 0, "Kuryugai itself did not turn");
  assert.equal(unitByUid(r.state, k2)!.rotatedThisTurn, true, "it spent its own rotate");
  assert.equal(r.state.players[1].mana, 19);
  void kuryu;
});

// --- tm18 家鳴り -------------------------------------------------------
test("tm18: rotates any unit and bypasses the Kuryugai lock", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  place(s, "tm17", 1, 2, 2, 0); // enemy lock in play
  const mine = place(s, "tm05", 0, 0, 0, 0);
  s.players[0].hand = ["tm18"];
  assert.ok(!isLegal(ctx, s, { kind: "rotate", uid: mine, facing: 1 }), "command locked");

  const act: Action = { kind: "reigu", handIndex: 0, targetUid: mine, facing: 1 };
  assert.ok(isLegal(ctx, s, act), "the reigu still works");
  const r = applyAction(ctx, s, act);
  assert.equal(unitByUid(r.state, mine)!.facing, 1);
  assert.equal(r.state.players[0].mana, 19, "cost 1");
  assert.deepEqual(r.state.players[0].hand, []);
  assert.ok(r.state.players[0].grave.includes("tm18"));
});

// --- tm19 マヨヒガ -----------------------------------------------------
test("tm19: hides a unit from every count and from targeting, until the caster's next turn", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const mine = place(s, "tm05", 0, 0, 0, 0);
  const foe = place(s, "tm05", 1, 0, 1, 2);
  s.players[0].hand = ["tm19"];
  assert.equal(occupied(s, 1), 1);

  const r = applyAction(ctx, s, { kind: "reigu", handIndex: 0, targetUid: foe, facing: null });
  assert.equal(unitByUid(r.state, foe)!.hiddenBy, 0);
  assert.equal(unitByUid(r.state, foe)!.damage, 1, "enemy takes 1");
  assert.equal(occupied(r.state, 1), 0, "off the occupied count");
  assert.ok(
    !isLegal(ctx, r.state, { kind: "attack", uid: mine, targetUid: foe }),
    "cannot be targeted",
  );
  // its cell is still physically blocked
  r.state.players[0].hand = ["tm05"];
  assert.ok(
    !isLegal(ctx, r.state, { kind: "summon", handIndex: 0, pos: { x: 0, y: 1 }, facing: 0 }),
    "the cell stays blocked",
  );

  // expires at the caster's next turn start
  r.state.turnPlayer = 0;
  startTurn(ctx, r.state, []);
  assert.equal(unitByUid(r.state, foe)!.hiddenBy, null);
  assert.equal(occupied(r.state, 1), 1);
});

test("tm19: hiding a friendly unit heals it; a lethal 1 damage runs normal destruction", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const friend = place(s, "tm05", 0, 0, 0, 0);
  unitByUid(s, friend)!.damage = 2;
  s.players[0].hand = ["tm19"];
  const r = applyAction(ctx, s, { kind: "reigu", handIndex: 0, targetUid: friend, facing: null });
  assert.equal(unitByUid(r.state, friend)!.damage, 1, "friendly gets +1 HP");

  const s2 = blankState(ctx, 20);
  const foe = place(s2, "tm03", 1, 0, 1, 0); // yin hp2 on yin cell -> effMax 4
  unitByUid(s2, foe)!.damage = 3; // 1 HP left
  s2.players[0].hand = ["tm19"];
  const lifeBefore = s2.players[1].life;
  const r2 = applyAction(ctx, s2, { kind: "reigu", handIndex: 0, targetUid: foe, facing: null });
  assert.equal(unitByUid(r2.state, foe), undefined, "destroyed by the 1 damage");
  assert.equal(r2.state.players[1].life, lifeBefore - 1);
});

// --- tm20 琵琶牧々 -----------------------------------------------------
test("tm20: +2 HP across the caster's board, capped at each effective max", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const a = place(s, "tm05", 0, 0, 0, 0);
  const b = place(s, "tm16", 0, 2, 2, 0);
  const foe = place(s, "tm05", 1, 0, 1, 0);
  unitByUid(s, a)!.damage = 3;
  unitByUid(s, b)!.damage = 1;
  unitByUid(s, foe)!.damage = 3;
  s.players[0].hand = ["tm20"];

  const r = applyAction(ctx, s, { kind: "reigu", handIndex: 0, targetUid: null, facing: null });
  assert.equal(unitByUid(r.state, a)!.damage, 1, "healed 2");
  assert.equal(unitByUid(r.state, b)!.damage, 0, "capped at full");
  assert.equal(unitByUid(r.state, foe)!.damage, 3, "the enemy is untouched");
  assert.equal(r.state.players[0].mana, 17, "cost 3");
});

// --- tm21 鬼の酒 -------------------------------------------------------
test("tm21: sets current HP to exactly 7, allowed past the effective max", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const u = place(s, "tm05", 0, 0, 0, 0); // hp3 on a corner -> effMax 3
  s.players[0].hand = ["tm21"];
  const r = applyAction(ctx, s, { kind: "reigu", handIndex: 0, targetUid: u, facing: null });
  assert.equal(unitHp(ctx, unitByUid(r.state, u)!), 7, "over its effective max of 3");

  // a unit already at 7+ is not a legal target
  assert.ok(
    !isLegal(ctx, r.state, { kind: "reigu", handIndex: 0, targetUid: u, facing: null }),
    "no target at 7 HP or more",
  );
});

test("tm21: a later heal does not drag an over-healed unit back down", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const u = place(s, "tm05", 0, 0, 0, 0);
  s.players[0].hand = ["tm21", "tm20"];
  const r = applyAction(ctx, s, { kind: "reigu", handIndex: 0, targetUid: u, facing: null });
  const r2 = applyAction(ctx, r.state, { kind: "reigu", handIndex: 0, targetUid: null, facing: null });
  assert.equal(unitHp(ctx, unitByUid(r2.state, u)!), 7, "still 7, not clamped to 3");
});

// --- tm22 閻魔獄卒棒 ---------------------------------------------------
test("tm22: 4 damage to whatever the chosen unit faces, friend or foe, no counter", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const mine = place(s, "tm05", 0, 0, 0, 0); // faces (0,1)
  const foe = place(s, "tm16", 1, 0, 1, 2); // hp8 yang on yin cell -> effMax 6
  s.players[0].hand = ["tm22"];

  const r = applyAction(ctx, s, { kind: "reigu", handIndex: 0, targetUid: mine, facing: null });
  assert.equal(unitByUid(r.state, foe)!.damage, 4);
  assert.equal(unitByUid(r.state, mine)!.damage, 0, "not an attack: no counter");
  assert.equal(r.state.players[0].mana, 17);
  assert.ok(hasEffect(r.events, "tm22"));
});

test("tm22: illegal when the chosen unit faces an empty cell or off the board", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const mine = place(s, "tm05", 0, 0, 0, 0);
  s.players[0].hand = ["tm22"];
  assert.ok(
    !isLegal(ctx, s, { kind: "reigu", handIndex: 0, targetUid: mine, facing: null }),
    "empty front cell",
  );
  unitByUid(s, mine)!.facing = 2; // faces off the board
  assert.ok(!isLegal(ctx, s, { kind: "reigu", handIndex: 0, targetUid: mine, facing: null }));
});

// --- effects off -------------------------------------------------------
test("effects off: no reigu, no variants, no proxy rotate, no damage modifiers", () => {
  const ctxOff = off();
  const s = blankState(ctxOff, 20);
  s.players[0].hand = ["tm18", "tm19", "tm20", "tm21", "tm22"];
  const konshin = place(s, "tm09", 0, 1, 0, 0);
  const kuryu = place(s, "tm17", 0, 2, 2, 0);
  place(s, "tm05", 1, 1, 1, 0);

  const acts = legalActions(ctxOff, s);
  assert.equal(acts.filter((a) => a.kind === "reigu").length, 0);
  assert.equal(acts.filter((a) => a.kind === "proxyRotate").length, 0);
  assert.equal(acts.filter((a) => a.kind === "attack" && a.variant === "konshin").length, 0);
  assert.ok(!isLegal(ctxOff, s, { kind: "reigu", handIndex: 0, targetUid: konshin, facing: 1 }));
  assert.ok(!isLegal(ctxOff, s, { kind: "attack", uid: konshin, targetUid: null, variant: "konshin" }));

  // tm03's +1 does not apply either
  const s2 = blankState(ctxOff, 20);
  const a = place(s2, "tm03", 0, 0, 0, 0);
  const d = place(s2, "tm05", 1, 0, 1, 0);
  const ev = atkEvent(applyAction(ctxOff, s2, { kind: "attack", uid: a, targetUid: d }).events);
  assert.equal(ev.hits[0].dmg, 1 + 2, "atk1 + blind2, no kage bonus");
  void kuryu;
});

test("effects off: reigu are still unsummonable dead cards", () => {
  const ctxOff = off();
  const s = blankState(ctxOff, 20);
  s.players[0].hand = ["tm18"];
  assert.ok(!isLegal(ctxOff, s, { kind: "summon", handIndex: 0, pos: { x: 0, y: 0 }, facing: 0 }));
  assert.equal(legalActions(ctxOff, s).filter((a) => a.kind === "summon").length, 0);
});

test("hand cleanup keeps reigu when effects are on, pitches them when off", () => {
  const hand = ["tm18", "tm19", "tm03"];
  const onCtx = on();
  const sOn = blankState(onCtx, 5);
  sOn.players[0].hand = [...hand];
  sOn.players[0].deck = ["tm04", "tm05", "tm07", "tm08"];
  endTurn(onCtx, sOn, []);
  assert.ok(sOn.players[0].hand.includes("tm18"), "affordable reigu is kept");
  assert.ok(sOn.players[0].hand.includes("tm19"), "affordable reigu is kept");

  const offCtx = off();
  const sOff = blankState(offCtx, 5);
  sOff.players[0].hand = [...hand];
  sOff.players[0].deck = ["tm04", "tm05", "tm07", "tm08"];
  endTurn(offCtx, sOff, []);
  assert.ok(!sOff.players[0].hand.some((c) => c.startsWith("tm18")), "dead card pitched");
  assert.ok(!sOff.players[0].hand.some((c) => c.startsWith("tm19")), "dead card pitched");
});

// --- display data ------------------------------------------------------
test("every real-pack card carries a Japanese display name", () => {
  for (const name of ["tsukumo-miyako", "kyubi-ryu"]) {
    const pack = loadPack(packPath(name));
    for (const c of pack.cards) {
      assert.ok(c.nameJa.length > 0, `${name}/${c.id} has no nameJa`);
      assert.ok(!/^[\x20-\x7e]+$/.test(c.nameJa), `${name}/${c.id} nameJa is ASCII: ${c.nameJa}`);
    }
  }
  assert.equal(cardOf(TM, "tm10").nameJa, "一目鬼");
  assert.equal(cardOf(TM, "tm19").nameJa, "マヨヒガ");
  // packs without the field fall back to `name`
  const plain = loadPack(packPath("placeholder22"));
  assert.equal(plain.cards[0].nameJa, plain.cards[0].name);
});

test("effect text exists for every card that has an effect, and only those", () => {
  const withEffect = [
    "tm01", "tm02", "tm03", "tm04", "tm06", "tm07", "tm09", "tm10",
    "tm11", "tm12", "tm15", "tm16", "tm17", "tm18", "tm19", "tm20", "tm21", "tm22",
  ];
  for (const id of withEffect) {
    assert.ok((effectTextOf(id) ?? "").length > 0, `${id} has no effect text`);
  }
  for (const id of ["tm05", "tm08", "tm13", "tm14"]) {
    assert.equal(effectTextOf(id), null, `${id} should have no effect text`);
  }
});

test("damage-modifier log lines name the effect", () => {
  const ctx = on();
  const s = blankState(ctx, 20);
  const a = place(s, "tm10", 0, 1, 0, 0);
  place(s, "tm12", 1, 1, 1, 2);
  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: null });
  const fx = r.events.find((e) => e.t === "effect" && e.source === "tm10");
  assert.ok(fx !== undefined && fx.t === "effect");
  assert.match(fx.text, /【巨撃】/);
  assert.match(fx.text, /一目鬼/);
});

// --- tm07 player choice ------------------------------------------------
test("tm07: the turn-start choice is injectable (mana / draw / skip)", () => {
  const mk = () => {
    const ctx = on();
    const s = blankState(ctx, 0);
    const uid = place(s, "tm07", 0, 0, 0, 0);
    s.players[0].deck = ["tm03", "tm04", "tm05"];
    s.players[0].hand = [];
    return { ctx, s, uid };
  };

  const a = mk();
  assert.deepEqual(pendingTansuChoices(a.ctx, a.s), [a.uid]);
  startTurn(a.ctx, a.s, [], () => "mana");
  assert.equal(a.s.players[0].mana, 1 + 3);
  assert.equal(a.s.players[0].hand.length, 0);
  assert.equal(unitHp(a.ctx, unitByUid(a.s, a.uid)!), 4);

  const b = mk();
  startTurn(b.ctx, b.s, [], () => "draw");
  assert.equal(b.s.players[0].mana, 3, "income only");
  assert.equal(b.s.players[0].hand.length, 1, "drew a card");
  assert.equal(unitHp(b.ctx, unitByUid(b.s, b.uid)!), 4, "still paid the HP");

  const c = mk();
  startTurn(c.ctx, c.s, [], () => "skip");
  assert.equal(c.s.players[0].mana, 3);
  assert.equal(c.s.players[0].hand.length, 0);
  assert.equal(unitHp(c.ctx, unitByUid(c.s, c.uid)!), 5, "no HP paid");

  // default policy is still "mana"
  const d = mk();
  startTurn(d.ctx, d.s, []);
  assert.equal(d.s.players[0].mana, 4);
});

test("pendingTansuChoices is empty with effects off, at 1 HP, and on a control win", () => {
  const offCtx = off();
  const sOff = blankState(offCtx, 0);
  place(sOff, "tm07", 0, 0, 0, 0);
  assert.deepEqual(pendingTansuChoices(offCtx, sOff), []);

  const ctx = on();
  const low = blankState(ctx, 0);
  const uid = place(low, "tm07", 0, 0, 0, 0);
  unitByUid(low, uid)!.damage = 4; // 1 HP left
  assert.deepEqual(pendingTansuChoices(ctx, low), []);

  const winning = blankState(ctx, 0);
  place(winning, "tm07", 0, 0, 0, 0);
  for (const [x, y] of [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]) {
    place(winning, "tm05", 0, x, y, 0);
  }
  winning.players[0].reach = true;
  assert.deepEqual(pendingTansuChoices(ctx, winning), [], "a control win preempts the prompt");
});

// --- full games --------------------------------------------------------
test("effects on: full games run, stay deterministic, and actually fire effects", () => {
  const ctx = on();
  const seen = new Set<string>();
  let reigu = 0;
  for (let seed = 500; seed < 512; seed++) {
    const a = runOne(ctx, seed);
    const b = runOne(ctx, seed);
    assert.equal(JSON.stringify(a.events), JSON.stringify(b.events), `seed ${seed}`);
    for (const e of a.events) {
      if (e.t === "effect") seen.add(e.source);
      if (e.t === "reigu") reigu += 1;
    }
  }
  assert.ok(seen.size > 0, "some effects fired across 12 games");
  assert.ok(reigu > 0, "reigu got played");
});

const runOne = (ctx: ReturnType<typeof on>, seed: number) =>
  runGame(ctx, [makeGreedy(), makeGreedy()], seed);
