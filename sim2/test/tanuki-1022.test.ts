// 狸一門 (10/22案, packs tanuki-1022k / tanuki-1022s). The design note is the
// project file new-ichimon-1016/狸一門_1016案3.md (10/22 additions included):
// 【加勢】(条件で召喚霊力-N), 太極 and 【加勢】 never stack (the larger applies);
// 10/25: 【袋叩き】 (free attacks on a 【加勢】 summon, chaining on a kill) and
// the 召3 allies the big 狸 count and lead (狸一門_袋叩き案_1025.md). 狸 never arrive by 継承召喚 (a 狸 on the board may be
// replaced), and the four combos (化け狸 / 分福茶釜×茶釜狸 / 金長×小鷹 / 狸囃子×腹鼓).
// 10/26 (性能をそろえる): 茶釜狸・化け狸は【加勢】なし、大物の割引は−1か−2、連鎖と「攻撃済みでも」はなし。
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

test("10/26 の数値: 耐久と召喚霊力", () => {
  const want: Record<string, [number, number]> = { tn01: [3, 2], tn02: [3, 3], tn03: [3, 3], tn04: [3, 3], tn05: [6, 6], tn06: [7, 8], tn07: [8, 9], tn08: [8, 10], tn09: [9, 13], tn11: [1, 0] };
  for (const pack of [PK, PS]) for (const [id, [sc, hp]] of Object.entries(want)) {
    const card = pack.byId.get(id)!;
    assert.deepEqual([card.summonCost, card.hp], [sc, hp], `${pack.packId} ${card.nameJa}`);
  }
});

const met = (c: Ctx, s: GameState, cardId: string, pos: Pos, p: PlayerId = 0): boolean =>
  kaseiDiscount(c, s, p, c.pack.byId.get(cardId)!, pos).amount > 0;

/** The attacks seat 0 may make with `uid` now. */
const attacksOf = (c: Ctx, s: GameState, uid: number): Action[] =>
  legalActions(c, s).filter((a) => a.kind === "attack" && a.uid === uid);

test("【加勢】味方の数: 太三郎は召3の味方2体以上の隣。豆狸は2体と数える。敵や離れた味方は数えない。茶釜狸・化け狸・腹鼓に【加勢】はない", () => {
  const { c, s } = scene([]);
  place(s, "ac02", 0, 0, 0, 0);
  assert.equal(met(c, s, "tn06", { x: 1, y: 0 }), false);
  place(s, "ac03", 0, 2, 0, 0);
  assert.equal(met(c, s, "tn06", { x: 1, y: 0 }), true);
  for (const id of ["tn02", "tn03", "tn04"]) assert.equal(met(c, s, id, { x: 1, y: 0 }), false, `${id} has no 【加勢】`);
  const b = blankState(c, 20);
  place(b, "tn01", 0, 0, 0, 0);
  assert.equal(met(c, b, "tn06", { x: 1, y: 0 }), true);
  const e = blankState(c, 20);
  place(e, "tn01", 1, 0, 0, 0);
  place(e, "ac03", 0, 2, 2, 0);
  assert.equal(met(c, e, "tn06", { x: 1, y: 0 }), false);
});

test("【加勢】は召喚霊力を下げる。太極とは重ならず大きい方(r1007 の太極は−1)", () => {
  const { c, s } = scene([]);
  place(s, "ac02", 0, 0, 0, 0);
  assert.equal(cost(c, s, "tn03", { x: 1, y: 0 }), 3); // no 【加勢】
  assert.equal(cost(c, s, "tn06", { x: 0, y: 1 }), 7);
  place(s, "ac03", 0, 0, 2, 0);
  assert.equal(cost(c, s, "tn06", { x: 0, y: 1 }), 6); // two 召3 allies: -1
  assert.equal(cost(c, s, "tn06", { x: 1, y: 1 }), 6); // and 太極 -1: never both
  assert.equal(cost(c, s, "tn07", { x: 1, y: 1 }), 7); // 太極 alone
  assert.equal(cost(c, s, "tn02", { x: 1, y: 1 }), 2); // no 【加勢】: 太極 as usual
});

test("【加勢】の条件: 小鷹は敵の隣、太三郎は召3の味方2体、団三郎はリーチ、金長は式神の数か小鷹の隣、隠神刑部は召3の味方1体につき", () => {
  const { c, s } = scene([]);
  place(s, "ac03", 1, 1, 2, 0);
  assert.equal(met(c, s, "tn05", { x: 2, y: 0 }), false);
  assert.equal(met(c, s, "tn05", { x: 0, y: 1 }), true);
  const big = scene([]);
  place(big.s, "tn05", 0, 0, 0, 0); // 召6: not 召3
  place(big.s, "ac04", 0, 0, 2, 0);
  assert.equal(met(big.c, big.s, "tn06", { x: 0, y: 1 }), false);
  place(big.s, "tn01", 0, 2, 2, 0); // 豆狸 counts 2 but is not next to (0,1)
  assert.equal(met(big.c, big.s, "tn06", { x: 0, y: 1 }), false);
  assert.equal(met(big.c, big.s, "tn06", { x: 1, y: 1 }), true);
  const r = scene([]);
  assert.equal(met(r.c, r.s, "tn07", { x: 0, y: 0 }), false);
  r.s.players[1].reach = true;
  assert.equal(met(r.c, r.s, "tn07", { x: 0, y: 0 }), true);
  place(r.s, "ac03", 1, 2, 2, 2);
  assert.equal(met(r.c, r.s, "tn08", { x: 0, y: 0 }), true); // 0 対 1
  place(r.s, "ac02", 0, 2, 0, 0);
  assert.equal(met(r.c, r.s, "tn08", { x: 0, y: 0 }), false);
  place(r.s, "tn05", 0, 1, 0, 0);
  assert.equal(met(r.c, r.s, "tn08", { x: 0, y: 0 }), true); // next to 小鷹
  assert.equal(cost(r.c, r.s, "tn08", { x: 0, y: 0 }), 8 - 2);
  assert.equal(cost(r.c, r.s, "tn09", { x: 0, y: 2 }), 9 - 1); // one 召3 (提灯お化け); 小鷹 is 召6
  place(r.s, "tn01", 0, 1, 2, 0);
  assert.equal(cost(r.c, r.s, "tn09", { x: 0, y: 2 }), 9 - 2); // 豆狸 counts 2: 3, but at most -2
  r.s.players[1].reach = true;
  assert.equal(cost(r.c, r.s, "tn07", { x: 2, y: 0 }), 8 - 2);
});

test("茶釜狸: 召喚時、隣の味方1体の耐久+2(【加勢】なし)", () => {
  const { c, s } = scene(["tn03", "tn03"], 10);
  const a = place(s, "tn01", 0, 0, 0, 0);
  unitByUid(s, a)!.damage = 2;
  let n = summon(c, s, 0, { x: 1, y: 0 });
  assert.equal(n.players[0].mana, 7);
  assert.equal(unitByUid(n, a)!.damage, 0);
  const b = blankState(c, 10);
  b.players[0].hand = ["tn03"];
  const lone = place(b, "ac02", 0, 2, 2, 0);
  unitByUid(b, lone)!.damage = 1;
  n = summon(c, b, 0, { x: 0, y: 0 });
  assert.equal(n.players[0].mana, 7);
  assert.equal(unitByUid(n, lone)!.damage, 1);
});

/** Seat 0: 影鬼 (召3) at (1,1) facing north at 提灯お化け (enemy, (1,2)); 豆狸 at (0,0). */
const strikeScene = (hand: string[]) => {
  const { c, s } = scene(hand, 10);
  const kage = place(s, "ac03", 0, 1, 1, 0);
  const mame = place(s, "tn01", 0, 0, 0, 0);
  const foe = place(s, "ac02", 1, 1, 2, 2);
  return { c, s, kage, mame, foe };
};

test("【袋叩き】: 【加勢】で召喚したとき、この手番まだ攻撃していない味方が攻撃霊力なしで攻撃できる。小鷹は隣の味方か自分の1体", () => {
  const { c, s, kage, mame, foe } = strikeScene(["tn05"]);
  let n = summon(c, s, 0, { x: 0, y: 1 }); // next to the enemy: 【加勢】 -1
  assert.equal(n.players[0].mana, 10 - 5);
  const small = at(n, { x: 0, y: 1 });
  assert.ok(unitByUid(n, kage)!.kasei && unitByUid(n, mame)!.kasei && small.kasei, "two neighbours and 小鷹 itself");
  const hp = unitHp(c, unitByUid(n, foe)!);
  const hit = attacksOf(c, n, kage).find((a) => a.kind === "attack" && a.targetUid === foe)!;
  assert.ok(hit, "影鬼 attacks");
  n = applyAction(c, n, hit).state;
  assert.equal(n.players[0].mana, 5, "free");
  assert.equal(unitByUid(n, mame)!.kasei, undefined, "one attack between them");
  const left = unitByUid(n, foe);
  assert.ok(left === undefined || left.damage === 3, `影鬼 2 + 小鷹の隣 1 (HP ${hp})`);
  // turn end clears what is left
  const t = strikeScene(["tn05"]);
  const m = summon(t.c, t.s, 0, { x: 0, y: 1 });
  endTurn(t.c, m, []);
  assert.equal(unitByUid(m, t.mame)!.kasei, undefined);
  // an ally that already attacked this turn gets none
  const d = strikeScene(["tn05"]);
  unitByUid(d.s, d.kage)!.attackedThisTurn = true;
  const e = summon(d.c, d.s, 0, { x: 0, y: 1 });
  assert.equal(unitByUid(e, d.kage)!.kasei, undefined);
  assert.equal(attacksOf(d.c, e, d.kage).length, 0);
  // no 【加勢】: no 【袋叩き】
  const f = scene(["tn05"], 10);
  const lone = place(f.s, "ac03", 0, 0, 1, 0);
  const q = summon(f.c, f.s, 0, { x: 0, y: 0 });
  assert.equal(unitByUid(q, lone)!.kasei, undefined);
});

test("【袋叩き】で敵を倒しても、続けての攻撃(連鎖)はない", () => {
  const { c, s, kage, foe } = strikeScene(["tn05"]);
  unitByUid(s, foe)!.damage = unitHp(c, unitByUid(s, foe)!) - 3; // 3 left: 影鬼 2 + 1 destroys it
  let n = summon(c, s, 0, { x: 0, y: 1 });
  n = applyAction(c, n, attacksOf(c, n, kage).find((a) => a.kind === "attack" && a.targetUid === foe)!).state;
  assert.equal(unitByUid(n, foe), undefined);
  assert.equal(n.units.filter((u) => u.kasei?.src === "chain").length, 0);
});

test("腹鼓の子狸: 隣の味方の【袋叩き】の攻撃は攻撃力+1", () => {
  const { c, s, kage } = strikeScene([]);
  place(s, "tn02", 0, 2, 1, 0); // next to 影鬼
  const u = unitByUid(s, kage)!;
  assert.equal(effectiveAtk(c, s, u), 2);
  u.kaseiStrike = true;
  assert.equal(effectiveAtk(c, s, u), 3);
});

test("太三郎・団三郎は隣の味方全員、隠神刑部は盤上の召3の味方3体まで、金長は盤上の召3の味方全員の攻撃力+1", () => {
  const { c, s } = scene(["tn06"]);
  const ids = [place(s, "ac03", 0, 0, 0, 0), place(s, "ac04", 0, 1, 0, 0), place(s, "ac02", 0, 2, 0, 0)];
  const n = summon(c, s, 0, { x: 1, y: 1 });
  const groups = new Set(ids.map((id) => unitByUid(n, id)!.kasei!.group));
  assert.equal(groups.size, 3, "one attack each");

  const g = scene(["tn09"]);
  const far = [place(g.s, "ac03", 0, 0, 0, 0), place(g.s, "ac04", 0, 2, 0, 0), place(g.s, "ac02", 0, 1, 2, 0)];
  const big = place(g.s, "tn05", 0, 0, 2, 0);
  const h = summon(g.c, g.s, 0, { x: 2, y: 2 });
  assert.equal(h.players[0].mana, 20 - 7);
  assert.ok(far.every((id) => unitByUid(h, id)!.kasei !== undefined));
  assert.equal(unitByUid(h, big)!.kasei, undefined, "小鷹 is 召6");
  assert.equal(h.kaseiLeft![unitByUid(h, far[0])!.kasei!.group], 3);

  const j = scene(["tn08"]);
  const kotaka = place(j.s, "tn05", 0, 0, 0, 0);
  const away = place(j.s, "ac03", 0, 2, 2, 0);
  const o = summon(j.c, j.s, 0, { x: 1, y: 0 });
  assert.equal(o.players[0].mana, 20 - 6);
  assert.equal(unitByUid(o, kotaka)!.atkBuff, 0, "小鷹 is 召6");
  assert.equal(unitByUid(o, away)!.atkBuff, 1, "anywhere on the board");
});

test("小鷹狸: 隣の召3の味方の攻撃力+1", () => {
  const { c, s } = scene([]);
  const near = place(s, "ac03", 0, 0, 0, 0);
  const big = place(s, "tn06", 0, 1, 0, 0); // 召6
  const far = place(s, "ac04", 0, 2, 2, 0);
  assert.equal(effectiveAtk(c, s, unitByUid(s, near)!), 2);
  place(s, "tn05", 0, 1, 1, 0);
  assert.equal(effectiveAtk(c, s, unitByUid(s, near)!), 3);
  assert.equal(effectiveAtk(c, s, unitByUid(s, big)!), 2);
  assert.equal(effectiveAtk(c, s, unitByUid(s, far)!), 4); // 鉈鬼 3, (2,2) is next to (1,1)
  place(s, "tn05", 1, 2, 0, 0); // an enemy 小鷹 does not help
  assert.equal(effectiveAtk(c, s, unitByUid(s, near)!), 3);
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
  const { c, s } = scene(["tn10", "tn05", "tn06"], 20);
  let n = applyAction(c, s, { kind: "reigu", handIndex: 0, targetUid: null, facing: null }).state;
  assert.equal(n.players[0].mana, 18);
  assert.equal(cost(c, n, "tn05", { x: 0, y: 0 }), 5);
  n = summon(c, n, 0, { x: 0, y: 0 });
  assert.equal(n.players[0].mana, 13);
  assert.equal(cost(c, n, "tn06", { x: 2, y: 2 }), 7); // used up

  const t = scene(["tn10", "tn05", "tn06"], 20);
  place(t.s, "tn02", 0, 2, 2, 0);
  let m = applyAction(t.c, t.s, { kind: "reigu", handIndex: 0, targetUid: null, facing: null }).state;
  m = summon(t.c, m, 0, { x: 0, y: 0 });
  assert.equal(cost(t.c, m, "tn06", { x: 0, y: 2 }), 6);
  endTurn(t.c, m, []);
  m.turnPlayer = 0;
  assert.equal(cost(t.c, m, "tn06", { x: 0, y: 2 }), 7);
});

test("分福茶釜(使1): 霊力+2。盤上に茶釜狸がいれば、代わりに霊力+4と1枚引く", () => {
  const { c, s } = scene(["tn11"], 5);
  s.players[0].deck = ["ac01", "ac02"];
  let n = applyAction(c, s, { kind: "reigu", handIndex: 0, targetUid: null, facing: null }).state;
  assert.equal(n.players[0].mana, 6);
  assert.deepEqual(n.players[0].hand, []);
  const t = scene(["tn11"], 5);
  t.s.players[0].deck = ["ac01", "ac02"];
  place(t.s, "tn03", 0, 0, 0, 0);
  n = applyAction(t.c, t.s, { kind: "reigu", handIndex: 0, targetUid: null, facing: null }).state;
  assert.equal(n.players[0].mana, 8);
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
