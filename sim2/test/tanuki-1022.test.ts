// 狸一門 (10/22案, packs tanuki-1022k / tanuki-1022s). The design note is the
// project file new-ichimon-1016/狸一門_1016案3.md (10/22 additions included):
// 【加勢 -N】(条件) on each card, the 太極 discount and 【加勢】 never stack (the
// larger applies), 狸 never arrive by 継承召喚 (a 狸 on the board may be
// replaced), and the four combos (化け狸 / 分福茶釜×茶釜狸 / 金長×小鷹 / 狸囃子×腹鼓).
import { test } from "node:test";
import assert from "node:assert/strict";
import { attackCells, counterCells } from "../src/combat.ts";
import { effectiveAtk, effectTextOf } from "../src/effects.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { packLabel, PLAYABLE_PACKS, presetConfig } from "../src/presets.ts";
import { applyAction, isLegal, legalActions, summonCostFor } from "../src/rules.ts";
import { cloneState, createGame, makeCtx, unitByUid, unitHp } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import { kaseiDiscount } from "../src/tanuki.ts";
import { endTurn } from "../src/turn.ts";
import { makeAi } from "../src/ai/index.ts";
import { runGame } from "../src/runner.ts";
import type { Action, Facing, GameState, PlayerId, Pos } from "../src/types.ts";
import { blankState, place } from "./helpers.ts";

const PK = loadPack(packPath("tanuki-1022k"));
const PS = loadPack(packPath("tanuki-1022s"));
const ctx = (): Ctx => makeCtx(presetConfig("r1007"), PK);

const cost = (c: Ctx, s: GameState, cardId: string, pos: Pos, p: PlayerId = 0): number =>
  summonCostFor(c, s, p, c.pack.byId.get(cardId)!, pos);

/** Seat 0 holds `hand`, to act, with `mana`. */
const scene = (hand: string[], mana = 20): { c: Ctx; s: GameState } => {
  const c = ctx();
  const s = blankState(c, mana);
  s.players[0].hand = hand.slice();
  return { c, s };
};

const summon = (c: Ctx, s: GameState, handIndex: number, pos: Pos, facing: Facing = 0): GameState => {
  const a: Action = { kind: "summon", handIndex, pos, facing };
  assert.ok(isLegal(c, s, a), `summon ${s.players[0].hand[handIndex]} at ${pos.x},${pos.y} should be legal`);
  return applyAction(c, s, a).state;
};

const at = (s: GameState, pos: Pos) => s.units.find((u) => u.pos.x === pos.x && u.pos.y === pos.y)!;

test("packs: seat 0 plays 狸 + a partner clan, seat 1 the 10/13 23 cards; both are playable and labelled", () => {
  const tn = PK.cards.filter((c) => c.clan === "狸一門");
  assert.equal(tn.length, 12);
  assert.equal(tn.filter((c) => c.kind === "reigu").length, 3);
  assert.equal(PK.decks?.[0].length, 23);
  assert.equal(PK.decks?.[1].length, 23);
  assert.equal(PS.decks?.[0].length, 24);
  assert.ok(PK.decks![0].every((id) => id.startsWith("tn") || PK.byId.get(id)!.clan === "玖龍一門"));
  assert.ok(PS.decks![0].every((id) => id.startsWith("tn") || PS.byId.get(id)!.clan === "酒呑一門"));
  assert.ok(PK.decks![1].every((id) => !id.startsWith("tn")));
  for (const id of ["tanuki-1022k", "tanuki-1022s"]) {
    assert.ok((PLAYABLE_PACKS as readonly string[]).includes(id));
    assert.match(packLabel(id), /狸/);
  }
  for (const c of tn) assert.ok(effectTextOf(c.id, c.effect), `${c.nameJa} has effect text`);
  const g = createGame(ctx(), 7);
  const all0 = [...g.players[0].hand, ...g.players[0].deck];
  const all1 = [...g.players[1].hand, ...g.players[1].deck];
  assert.deepEqual(all0.slice().sort(), PK.decks![0].slice().sort());
  assert.deepEqual(all1.slice().sort(), PK.decks![1].slice().sort());
});

test("【加勢】味方の数: 茶釜狸は味方2体以上の隣で-1、豆狸は2体と数える。腹鼓の子狸は割引なし(召3)", () => {
  const { c, s } = scene(["tn03", "tn02"]);
  assert.equal(cost(c, s, "tn03", { x: 1, y: 0 }), 4);
  place(s, "ac02", 0, 0, 0, 0); // one ordinary ally: not enough
  assert.equal(cost(c, s, "tn03", { x: 1, y: 0 }), 4);
  place(s, "ac03", 0, 2, 0, 0); // two allies next to (1,0)
  assert.equal(cost(c, s, "tn03", { x: 1, y: 0 }), 3);
  const b = blankState(c, 20);
  place(b, "tn01", 0, 0, 0, 0); // 豆狸 alone counts 2
  assert.equal(cost(c, b, "tn03", { x: 1, y: 0 }), 3);
  assert.equal(cost(c, b, "tn02", { x: 1, y: 0 }), 3);
  // enemies and far allies do not count
  const e = blankState(c, 20);
  place(e, "tn01", 1, 0, 0, 0);
  place(e, "tn01", 0, 2, 2, 0);
  assert.equal(cost(c, e, "tn03", { x: 1, y: 0 }), 4);
});

test("【加勢】と太極は重ならない: 大きい方だけ(r1007 の太極は−1)", () => {
  const { c, s } = scene([]);
  place(s, "tn01", 0, 0, 0, 0);
  place(s, "ac02", 0, 2, 2, 0);
  place(s, "ac03", 0, 0, 2, 0);
  assert.equal(cost(c, s, "tn03", { x: 1, y: 1 }), 3); // 加勢 -1 and 太極 -1: one of them
  assert.equal(cost(c, s, "tn06", { x: 1, y: 1 }), 4); // 太三郎: 3 allies around 太極 → -2, not -3
  assert.equal(cost(c, s, "tn02", { x: 1, y: 1 }), 2); // no 加勢: 太極 as usual
});

test("【加勢】敵: 化け狸は敵の隙のマスで-1、小鷹狸は敵2体以上の隣で-2", () => {
  const { c, s } = scene([]);
  place(s, "ac03", 1, 1, 2, 0); // enemy at (1,2) facing north (+y): its 隙 8 is (1,1)
  assert.equal(cost(c, s, "tn04", { x: 1, y: 1 }), 4 - 1);
  assert.equal(cost(c, s, "tn04", { x: 0, y: 0 }), 4);
  assert.equal(cost(c, s, "tn05", { x: 0, y: 1 }), 5);
  place(s, "ac04", 1, 0, 0, 0);
  assert.equal(cost(c, s, "tn05", { x: 0, y: 1 }), 3);
});

test("【加勢】場面: 団三郎は相手のリーチ中-3、金長は相手の式神が多いか小鷹の隣で-3、隠神刑部は味方1体につき-1(最大-3)", () => {
  const { c, s } = scene([]);
  assert.equal(cost(c, s, "tn07", { x: 0, y: 0 }), 7);
  s.players[1].reach = true;
  assert.equal(cost(c, s, "tn07", { x: 0, y: 0 }), 4);
  assert.equal(cost(c, s, "tn08", { x: 0, y: 0 }), 8);
  place(s, "ac03", 1, 2, 2, 2);
  assert.equal(cost(c, s, "tn08", { x: 0, y: 0 }), 5); // 0 対 1
  place(s, "ac02", 0, 2, 0, 0);
  assert.equal(cost(c, s, "tn08", { x: 0, y: 0 }), 8); // 1 対 1
  place(s, "tn05", 0, 1, 0, 0);
  assert.equal(cost(c, s, "tn08", { x: 0, y: 0 }), 5); // next to 小鷹
  assert.equal(cost(c, s, "tn08", { x: 0, y: 2 }), 8);
  assert.equal(cost(c, s, "tn09", { x: 0, y: 2 }), 9 - 2);
  place(s, "ac01", 0, 1, 2, 0);
  place(s, "ac04", 0, 2, 1, 0);
  assert.equal(cost(c, s, "tn09", { x: 0, y: 2 }), 9 - 3);
  assert.equal(kaseiDiscount(c, s, 0, c.pack.byId.get("tn09")!, { x: 0, y: 2 }).amount, 3);
});

test("summoning applies the cost; そうしたとき: 茶釜狸 heals the most hurt neighbour +2, only when it came by 【加勢】", () => {
  const { c, s } = scene(["tn03", "tn03"], 10);
  const a = place(s, "tn01", 0, 0, 0, 0);
  unitByUid(s, a)!.damage = 2; // 豆狸 at (0,0) on an empty cell: HP 3 → 1
  let n = summon(c, s, 0, { x: 1, y: 0 });
  assert.equal(n.players[0].mana, 7);
  assert.equal(unitHp(c, unitByUid(n, a)!), 3);
  // far from allies: full price, no heal
  const b = blankState(c, 10);
  b.players[0].hand = ["tn03"];
  const lone = place(b, "ac02", 0, 2, 2, 0);
  unitByUid(b, lone)!.damage = 1;
  n = summon(c, b, 0, { x: 0, y: 0 });
  assert.equal(n.players[0].mana, 6);
  assert.equal(unitHp(c, unitByUid(n, lone)!), 2);
});

test("そうしたとき: 太三郎狸は隣の味方全員の耐久+1、金長狸はこの手番 隣の味方の攻撃力+1", () => {
  const { c, s } = scene(["tn06"]);
  const ids = [place(s, "ac03", 0, 0, 0, 0), place(s, "ac04", 0, 1, 0, 0), place(s, "ac02", 0, 2, 0, 0)];
  for (const id of ids) unitByUid(s, id)!.damage = 1;
  const n = summon(c, s, 0, { x: 1, y: 1 });
  assert.equal(n.players[0].mana, 20 - 4);
  for (const id of ids) assert.equal(unitByUid(n, id)!.damage, 0);

  const k = scene(["tn08"]);
  const kotaka = place(k.s, "tn05", 0, 0, 0, 0);
  const far = place(k.s, "ac03", 0, 2, 2, 0);
  const m = summon(k.c, k.s, 0, { x: 1, y: 0 });
  assert.equal(m.players[0].mana, 20 - 5);
  assert.equal(unitByUid(m, kotaka)!.atkBuff, 1);
  assert.equal(unitByUid(m, far)!.atkBuff, 0);
});

test("小鷹狸: 盤上に自分の金長狸がいる間、攻撃力+1", () => {
  const { c, s } = scene([]);
  const kotaka = place(s, "tn05", 0, 0, 0, 0);
  assert.equal(effectiveAtk(c, s, unitByUid(s, kotaka)!), 3);
  place(s, "tn08", 1, 2, 2, 0); // an enemy 金長 does not count
  assert.equal(effectiveAtk(c, s, unitByUid(s, kotaka)!), 3);
  place(s, "tn08", 0, 2, 0, 0);
  assert.equal(effectiveAtk(c, s, unitByUid(s, kotaka)!), 4);
});

test("化け狸: 召喚時、正面の式神の間合・反撃間合・単体/範囲を写す(全域は写さない)", () => {
  const { c, s } = scene(["tn04", "tn04"]);
  place(s, "tn08", 1, 1, 1, 2); // enemy 金長 (範囲 123) at (1,1)
  let n = summon(c, s, 0, { x: 1, y: 0 }, 0); // faces north: 金長 in front
  const bake = at(n, { x: 1, y: 0 });
  assert.equal(bake.borrow, "tn08");
  // 123 from (1,0) facing north: (0,1)(1,1)(2,1)
  assert.deepEqual(attackCells(c, bake).map((p) => `${p.x},${p.y}`).sort(), ["0,1", "1,1", "2,1"]);
  assert.deepEqual(counterCells(c, bake).map((p) => `${p.x},${p.y}`), ["1,1"]);
  // nothing in front: its own shape
  const b = blankState(c, 20);
  b.players[0].hand = ["tn04"];
  n = summon(c, b, 0, { x: 0, y: 0 }, 0);
  assert.equal(at(n, { x: 0, y: 0 }).borrow, undefined);
  // 全域 (玖龍街) is not copied
  const k = blankState(c, 20);
  k.players[0].hand = ["tn04"];
  place(k, "ac17", 1, 1, 1, 2);
  n = summon(c, k, 0, { x: 1, y: 0 }, 0);
  assert.equal(at(n, { x: 1, y: 0 }).borrow, undefined);
  // the copy survives cloning
  assert.equal(cloneState(n).units.length, n.units.length);
});

test("狸は継承召喚で出せない。盤の狸は入れ替えられる側にはなれる", () => {
  const { c, s } = scene(["tn03", "ac16"]); // 茶釜狸(陽) and 酒呑童子(陽)
  const old = place(s, "ac04", 0, 0, 0, 0); // 鉈鬼 (陽)
  const tanuki = place(s, "tn01", 0, 2, 0, 0); // 豆狸 (陽)
  const acts = legalActions(c, s);
  assert.ok(!acts.some((a) => a.kind === "inherit" && a.handIndex === 0), "no 狸 by 継承召喚");
  assert.ok(acts.some((a) => a.kind === "inherit" && a.handIndex === 1 && a.targetUid === tanuki), "a 狸 may be replaced");
  assert.ok(acts.some((a) => a.kind === "inherit" && a.handIndex === 1 && a.targetUid === old));
});

test("狸囃子: 次の召喚は【加勢】の条件を満たす。盤に腹鼓の子狸がいれば、この手番の召喚すべて。手番の終わりで消える", () => {
  const { c, s } = scene(["tn10", "tn03", "tn06"], 20);
  let n = applyAction(c, s, { kind: "reigu", handIndex: 0, targetUid: null, facing: null }).state;
  assert.equal(n.players[0].mana, 18);
  assert.equal(cost(c, n, "tn03", { x: 0, y: 0 }), 3);
  n = summon(c, n, 0, { x: 0, y: 0 }); // 茶釜 at 3
  assert.equal(n.players[0].mana, 15);
  assert.equal(cost(c, n, "tn06", { x: 2, y: 2 }), 6); // used up

  const t = scene(["tn10", "tn03", "tn06"], 20);
  place(t.s, "tn02", 0, 2, 2, 0);
  let m = applyAction(t.c, t.s, { kind: "reigu", handIndex: 0, targetUid: null, facing: null }).state;
  m = summon(t.c, m, 0, { x: 0, y: 0 });
  assert.equal(cost(t.c, m, "tn06", { x: 0, y: 2 }), 4);
  const ev: never[] = [];
  endTurn(t.c, m, ev);
  m.turnPlayer = 0;
  assert.equal(cost(t.c, m, "tn06", { x: 0, y: 2 }), 6);
});

test("分福茶釜: 霊力+2。盤上に茶釜狸がいれば、代わりに霊力+4と1枚引く", () => {
  const { c, s } = scene(["tn11"], 5);
  s.players[0].deck = ["ac01", "ac02"];
  let n = applyAction(c, s, { kind: "reigu", handIndex: 0, targetUid: null, facing: null }).state;
  assert.equal(n.players[0].mana, 7);
  assert.deepEqual(n.players[0].hand, []);
  const t = scene(["tn11"], 5);
  t.s.players[0].deck = ["ac01", "ac02"];
  place(t.s, "tn03", 0, 0, 0, 0);
  n = applyAction(t.c, t.s, { kind: "reigu", handIndex: 0, targetUid: null, facing: null }).state;
  assert.equal(n.players[0].mana, 9);
  assert.deepEqual(n.players[0].hand, ["ac01"]);
});

test("木の葉の小判: 自分の式神1体と、その隣の味方1体の位置を入れ替える(向きはそのまま)", () => {
  const { c, s } = scene(["tn12"], 5);
  const a = place(s, "tn01", 0, 0, 0, 1);
  const b = place(s, "ac03", 0, 1, 0, 0);
  place(s, "ac02", 1, 0, 1, 0); // an enemy neighbour is not a choice
  const acts = legalActions(c, s).filter((x) => x.kind === "reigu");
  assert.ok(acts.some((x) => x.kind === "reigu" && x.targetUid === a && x.victimUid === b));
  assert.ok(!acts.some((x) => x.kind === "reigu" && x.victimUid !== undefined && unitByUid(s, x.victimUid)!.owner === 1));
  const n = applyAction(c, s, { kind: "reigu", handIndex: 0, targetUid: a, facing: null, victimUid: b }).state;
  assert.deepEqual(unitByUid(n, a)!.pos, { x: 1, y: 0 });
  assert.deepEqual(unitByUid(n, b)!.pos, { x: 0, y: 0 });
  assert.equal(unitByUid(n, a)!.facing, 1);
  assert.equal(n.players[0].mana, 3);
});

test("AI同士で最後まで遊べる(玖龍街と組む・酒呑と組む)", () => {
  for (const pack of [PK, PS]) {
    const c = makeCtx(presetConfig("r1007", { roundLimit: 40 }), pack);
    for (let seed = 1; seed <= 6; seed++) {
      const r = runGame(c, [makeAi("greedy"), makeAi("greedy")], seed, false);
      assert.ok(r.state.ended, `${pack.packId} seed ${seed} ends`);
    }
  }
});
