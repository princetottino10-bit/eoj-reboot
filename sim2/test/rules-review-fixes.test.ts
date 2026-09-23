// Engine fixes from the 2026-09-15 rules review (out/review-rules/findings.ts):
// F1 jutsu area attacks and allies, F2 灯籠の精 with allies destroyed in the
// same attack, F7 destruction / inherit mana after the cap, F10 tm18 facings.
import test from "node:test";
import assert from "node:assert/strict";
import { cardOf } from "../src/cards.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig } from "../src/presets.ts";
import { previewAttack, previewInherit } from "../src/preview.ts";
import { applyAction, isLegal, legalActions } from "../src/rules.ts";
import { makeCtx, unitByUid, unitHp, unitMaxHp } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import type { Action, Config, GameEvent, GameState } from "../src/types.ts";
import { blankState, place } from "./helpers.ts";
import { SK } from "./online-helpers.ts";

const TM = loadPack(packPath("tsukumo-miyako"));
const r0914 = (pack = SK, over: Partial<Config> = {}): Ctx => makeCtx(presetConfig("r0914", over), pack);
const attackOf = (ev: GameEvent[]) => ev.find((e): e is Extract<GameEvent, { t: "attack" }> => e.t === "attack")!;
const hpTo = (ctx: Ctx, s: GameState, uid: number, hp: number): void => {
  const u = unitByUid(s, uid)!;
  u.damage = unitMaxHp(ctx, u) - hp;
};

// ------------------------------------------------------------------- F1

test("F1: under the 9/13 presets a jutsu area attack spares allies; a phys one and the 8/28 rules still hit them", () => {
  const sweep = (ctx: Ctx, attacker: string, pack = ctx.pack) => {
    const s = blankState(ctx, 10);
    const k = place(s, attacker, 0, 1, 1, 0);
    const ally = place(s, pack === TM ? "tm13" : "sk06", 0, 1, 2, 0);
    const foe = place(s, pack === TM ? "tm13" : "sk06", 1, 2, 2, 2);
    const a: Action = { kind: "attack", uid: k, targetUid: null };
    assert.ok(isLegal(ctx, s, a));
    const hit = attackOf(applyAction(ctx, s, a).events).hits.map((h) => h.uid).sort();
    const predicted = previewAttack(ctx, s, a)!.hits.map((h) => h.uid).sort();
    assert.deepEqual(predicted, hit, "the preview agrees");
    return { hit, ally, foe };
  };
  for (const id of ["r0914", "r0913"] as const) {
    assert.equal(presetConfig(id).jutsuAoeSparesAllies, true, id);
    const jutsu = sweep(makeCtx(presetConfig(id), TM), "tm17"); // 玖龍街: jutsu, area, every cell around
    assert.deepEqual(jutsu.hit, [jutsu.foe], `${id}: tm17 hits the enemy only`);
  }
  const old = sweep(makeCtx(presetConfig("r0828"), TM), "tm17");
  assert.deepEqual(old.hit, [old.ally, old.foe], "r0828 keeps the old behaviour");
  assert.equal(presetConfig("r0828").jutsuAoeSparesAllies, false);
  const phys = sweep(r0914(), "sk05"); // 鎖鬼: phys, area, front row + front
  assert.deepEqual(phys.hit, [phys.ally, phys.foe], "物理・範囲 still hits allies");

  // only allies in range: the jutsu sweep has no target, so it is not an action
  const ctx = makeCtx(presetConfig("r0914"), TM);
  const s = blankState(ctx, 10);
  const k = place(s, "tm17", 0, 1, 1, 0);
  place(s, "tm13", 0, 0, 0, 0);
  assert.equal(legalActions(ctx, s).some((a) => a.kind === "attack" && a.uid === k), false);
});

// ------------------------------------------------------------------- F2

test("F2: 灯籠の精 never heals an ally destroyed by the same attack, whatever the board order", () => {
  const outcome = (toroFirst: boolean) => {
    const ctx = r0914();
    const s = blankState(ctx, 10);
    const k = place(s, "sk17", 0, 1, 1, 0); // 玖龍街: ATK 1, hits every cell around
    const put = (id: string, x: number, y: number) => place(s, id, 1, x, y, 2);
    const [toro, ibaraki] = toroFirst ? [put("sk01", 0, 2), put("sk15", 2, 2)] : [put("sk15", 2, 2), put("sk01", 0, 2)].reverse();
    const survivor = place(s, "sk10", 1, 0, 0, 0);
    hpTo(ctx, s, toro, 1);
    hpTo(ctx, s, ibaraki, 1); // cost 6: the priciest ally, but it dies in the same sweep
    hpTo(ctx, s, survivor, 3);
    const { state, events } = applyAction(ctx, s, { kind: "attack", uid: k, targetUid: null });
    return {
      destroyed: events.filter((e) => e.t === "destroy").length,
      heals: events.filter((e) => e.t === "effect" && e.source === "sk01").map((e) => (e.t === "effect" ? e.uid : null)),
      survivorHp: unitHp(ctx, unitByUid(state, survivor)!),
      survivor,
    };
  };
  for (const toroFirst of [true, false]) {
    const o = outcome(toroFirst);
    assert.equal(o.destroyed, 2);
    assert.deepEqual(o.heals, [o.survivor], `toroFirst=${toroFirst}: the heal goes to the survivor`);
    assert.equal(o.survivorHp, 3, "3 - 1 from the sweep + 1 from 灯籠の精");
  }

  // nobody survives: no heal at all
  const ctx = r0914();
  const s = blankState(ctx, 10);
  const k = place(s, "sk17", 0, 1, 1, 0);
  const toro = place(s, "sk01", 1, 0, 2, 2);
  const other = place(s, "sk15", 1, 2, 2, 2);
  hpTo(ctx, s, toro, 1);
  hpTo(ctx, s, other, 1);
  const { events } = applyAction(ctx, s, { kind: "attack", uid: k, targetUid: null });
  assert.equal(events.some((e) => e.t === "effect" && e.source === "sk01"), false);
});

// ------------------------------------------------------------------- F7

test("F7: destruction mana and the inherit refund are reported after the mana cap, in events and previews", () => {
  const ctx = r0914();
  const s = blankState(ctx, 15);
  const att = place(s, "sk10", 0, 1, 0, 0); // attack cost 2
  const vic = place(s, "sk15", 1, 1, 1, 2); // cost 6: killer_half pays 3
  hpTo(ctx, s, vic, 1);
  const a: Action = { kind: "attack", uid: att, targetUid: vic };
  const pv = previewAttack(ctx, s, a)!;
  const { state, events } = applyAction(ctx, s, a);
  const d = events.find((e): e is Extract<GameEvent, { t: "destroy" }> => e.t === "destroy")!;
  assert.equal(state.players[0].mana, 15);
  assert.equal(d.manaGain, 2, "15 - 2 = 13, capped at 15");
  assert.deepEqual(pv.manaGain, [2, 0]);

  // uncapped rewards are unchanged
  const roomy = blankState(ctx, 5);
  const a2 = place(roomy, "sk10", 0, 1, 0, 0);
  const v2 = place(roomy, "sk15", 1, 1, 1, 2);
  hpTo(ctx, roomy, v2, 1);
  const d2 = applyAction(ctx, roomy, { kind: "attack", uid: a2, targetUid: v2 }).events.find((e) => e.t === "destroy");
  assert.ok(d2 !== undefined && d2.t === "destroy" && d2.manaGain === 3);

  // inherit 変面 (3) -> 雲外鏡 (4) on taiji with a big discount: pay 1, refund 2, room for 1
  const ictx = r0914(SK, { taijiDiscount: 5 });
  const is = blankState(ictx, 15);
  is.players[0].hand = ["sk10"];
  const old = place(is, "sk06", 0, 1, 1, 0);
  const inherit: Action = { kind: "inherit", handIndex: 0, targetUid: old };
  const ipv = previewInherit(ictx, is, inherit)!;
  const done = applyAction(ictx, is, inherit);
  const summon = done.events.find((e): e is Extract<GameEvent, { t: "summon" }> => e.t === "summon")!;
  assert.equal(cardOf(SK, "sk06").summonCost, 3);
  assert.equal(done.state.players[0].mana, 15);
  assert.equal(summon.inheritedFrom?.refund, 1);
  assert.equal(ipv.refund, 1);
  assert.equal(ipv.manaAfter, 15);
});

// ------------------------------------------------------------------ F10

test("F10: a turning reigu is legal only with the facings the legal list offers; other reigu take no facing", () => {
  const ctx = r0914(TM);
  const s = blankState(ctx, 10);
  s.players[0].hand = ["tm18", "tm20"];
  const t = place(s, "tm13", 1, 1, 1, 2);
  place(s, "tm13", 0, 0, 0, 0);
  const offered = legalActions(ctx, s)
    .filter((a): a is Extract<Action, { kind: "reigu" }> => a.kind === "reigu" && a.handIndex === 0 && a.targetUid === t)
    .map((a) => a.facing);
  assert.deepEqual(offered.sort(), [1, 3]);
  for (const facing of [0, 1, 2, 3] as const) {
    assert.equal(isLegal(ctx, s, { kind: "reigu", handIndex: 0, targetUid: t, facing }), offered.includes(facing), `tm18 facing ${facing}`);
  }
  assert.equal(isLegal(ctx, s, { kind: "reigu", handIndex: 1, targetUid: null, facing: null }), true);
  assert.equal(isLegal(ctx, s, { kind: "reigu", handIndex: 1, targetUid: null, facing: 0 }), false, "tm20 takes no facing");

  // sk18 turns to any other facing
  const sctx = r0914();
  const ss = blankState(sctx, 10);
  ss.players[0].hand = ["sk18"];
  const st = place(ss, "sk06", 1, 1, 1, 2);
  for (const facing of [0, 1, 2, 3] as const) {
    assert.equal(isLegal(sctx, ss, { kind: "reigu", handIndex: 0, targetUid: st, facing }), facing !== 2, `sk18 facing ${facing}`);
  }
});
