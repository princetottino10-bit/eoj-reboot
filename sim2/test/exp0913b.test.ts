// EXP-0913B acceptance tests: the tenkey tokenizer (Sec.2.1), the
// shuten-kyuryu pack (Sec.2.2), its effect differences (Sec.2.3) and the six
// new rule flags (Sec.1). Every flag also has a default-off guard.
import test from "node:test";
import assert from "node:assert/strict";
import { cardOf, parsePack, parseTenkey, tokenizeTenkey } from "../src/cards.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { toBoardCells } from "../src/board.ts";
import { applyAction, isLegal, legalActions } from "../src/rules.ts";
import { occupied, unitByUid, unitHp } from "../src/state.ts";
import { endTurn, performMulligan, startTurn } from "../src/turn.ts";
import { runGame } from "../src/runner.ts";
import { summarise } from "../src/metrics.ts";
import { makeGreedy } from "../src/ai/greedy.ts";
import { defaultConfig } from "../src/types.ts";
import type { Config, GameEvent, Pos } from "../src/types.ts";
import { blankState, mkCtx, place } from "./helpers.ts";

const SK = loadPack(packPath("shuten-kyuryu"));
const sk = (over: Partial<Config> = {}) => mkCtx(over, SK);

/** The 9/13 ruleset of Sec.3 (K0). */
const K0: Partial<Config> = {
  effects: true,
  chipMode: "catch_up",
  incomeTiming: "turn_end",
  refundMode: "killer_half",
  inheritSummon: true,
  counterMode: "gap",
  mulligan: true,
  controlHold: "next_turn_end",
  handMode: "refill_to_5",
};

const attackEvent = (events: GameEvent[]) => {
  const e = events.find((x) => x.t === "attack");
  assert.ok(e !== undefined && e.t === "attack", "expected an attack event");
  return e;
};
const destroyEvents = (events: GameEvent[]) =>
  events.flatMap((e) => (e.t === "destroy" ? [e] : []));
const p = (x: number, y: number): Pos => ({ x, y });

// ------------------------------------------------------------ defaults

test("B0 every EXP-0913B flag defaults to the pre-EXP behaviour", () => {
  const c = defaultConfig();
  assert.equal(c.refundMode, "half");
  assert.equal(c.inheritSummon, false);
  assert.equal(c.counterMode, "all");
  assert.equal(c.mulligan, false);
  assert.equal(c.controlHold, "next_turn_start");
  assert.equal(c.handMode, "refill_to_5");
});

// ---------------------------------------------------- tenkey (Sec.2.1)

test("TK1 tenkey tokenizer passes the spec's worked examples", () => {
  assert.deepEqual(tokenizeTenkey("-1-2-32"), ["-1", "-2", "-3", "2"]);
  assert.deepEqual(tokenizeTenkey("-223"), ["-2", "2", "3"]);
  assert.deepEqual(tokenizeTenkey("1234"), ["1", "2", "3", "4"]);
  assert.deepEqual(parseTenkey("-1-2-32"), [p(-1, 2), p(0, 2), p(1, 2), p(0, 1)]);
  assert.deepEqual(parseTenkey("-223"), [p(0, 2), p(0, 1), p(1, 1)]);
  assert.deepEqual(parseTenkey("1234"), [p(-1, 1), p(0, 1), p(1, 1), p(-1, 0)]);
  assert.deepEqual(parseTenkey("138"), [p(-1, 1), p(1, 1), p(0, -1)]);
  assert.deepEqual(parseTenkey("789"), [p(-1, -1), p(0, -1), p(1, -1)]);
  assert.deepEqual(parseTenkey(""), []);
  assert.deepEqual(parseTenkey("6"), [p(1, 0)]);
});

test("TK2 tenkey rejects tokens outside the table", () => {
  assert.throws(() => parseTenkey("5"));
  assert.throws(() => parseTenkey("-4"));
  assert.throws(() => parseTenkey("2-"));
  assert.throws(() => parseTenkey("22"), /duplicate/);
});

test("TK3 5x5ALL reaches all 8 other cells from every square and facing", () => {
  const rel = parseTenkey("5x5ALL");
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      for (const f of [0, 1, 2, 3] as const) {
        const cells = toBoardCells(rel, p(x, y), f);
        assert.equal(cells.length, 8);
        assert.ok(!cells.some((c) => c.x === x && c.y === y));
      }
    }
  }
});

test("TK4 pack JSON keeps the tenkey strings; parsing yields coordinates", () => {
  const pack = parsePack({
    packId: "t",
    attackCostMatchesAtk: false,
    cards: [
      {
        id: "a", name: "A", summonCost: 3, attackCost: 3, atk: 2, hp: 3, lifeValue: 1,
        attribute: "yin", aoe: true, attackRange: "-223", counterRange: "2",
        blindSpots: "48", gapCell: "2",
      },
    ],
  });
  const c = cardOf(pack, "a");
  assert.deepEqual(c.attackRange, [p(0, 2), p(0, 1), p(1, 1)]);
  assert.deepEqual(c.counterRange, [p(0, 1)]);
  assert.deepEqual(c.blindSpots, [p(-1, 0), p(0, -1)]);
  assert.deepEqual(c.gapCell, p(0, 1));
  // the attackCost === atk invariant still guards packs that do not opt out
  assert.throws(() =>
    parsePack({ cards: [{ id: "b", name: "B", summonCost: 3, attackCost: 3, atk: 2, hp: 3,
      lifeValue: 1, attribute: "yin", aoe: false, attackRange: "2", blindSpots: "8" }] }),
  );
});

// ------------------------------------------------------ pack (Sec.2.2)

test("PK1 shuten-kyuryu: 22 cards, attribute split 7/6/4, sheet values", () => {
  assert.equal(SK.cards.length, 22);
  const shiki = SK.cards.filter((c) => c.kind === "shikigami");
  assert.equal(shiki.length, 17);
  assert.equal(shiki.filter((c) => c.attribute === "yang").length, 7);
  assert.equal(shiki.filter((c) => c.attribute === "yin").length, 6);
  assert.equal(shiki.filter((c) => c.attribute === "none").length, 4);
  const kubi = cardOf(SK, "sk12");
  assert.equal(kubi.attackCost, 3);
  assert.equal(kubi.atk, 2);
  assert.equal(kubi.aoe, true);
  const shuten = cardOf(SK, "sk16");
  assert.deepEqual([shuten.summonCost, shuten.hp, shuten.atk], [6, 7, 4]);
  assert.equal(cardOf(SK, "sk07").hp, 3);
  const kuryu = cardOf(SK, "sk17");
  assert.equal(kuryu.attackType, "phys");
  assert.equal(kuryu.aoe, true);
  assert.equal(kuryu.gapCell, null);
  assert.equal(kuryu.counterRange.length, 0);
  assert.deepEqual(cardOf(SK, "sk09").gapCell, p(1, 0));
  assert.deepEqual(cardOf(SK, "sk05").gapCell, p(-1, 0));
  assert.deepEqual(cardOf(SK, "sk08").attackRange, [p(-1, 2), p(0, 2), p(1, 2), p(0, 1)]);
  assert.deepEqual(
    ["sk18", "sk19", "sk20", "sk21", "sk22"].map((id) => cardOf(SK, id).summonCost),
    [2, 2, 2, 3, 3],
  );
});

// ------------------------------------------------ 1.1 killer_half refund

test("KH1 killer_half: the attacker's side gets floor(cost/2), the owner gets nothing", () => {
  for (const mode of ["half", "killer_half"] as const) {
    const ctx = sk({ refundMode: mode });
    const s = blankState(ctx, 10); // below manaCap so refunds are visible
    const a = place(s, "sk03", 0, 0, 1, 0); // front (0,2)
    const v = place(s, "sk04", 1, 0, 2, 0); // hp2 on a corner
    const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: v });
    const [d] = destroyEvents(r.events);
    assert.equal(d.manaGain, 1);
    assert.equal(d.killer, 0);
    if (mode === "killer_half") {
      assert.equal(d.manaTo, 0);
      assert.equal(r.state.players[0].mana, 10 - 2 + 1);
      assert.equal(r.state.players[1].mana, 10);
    } else {
      assert.equal(d.manaTo, 1);
      assert.equal(r.state.players[0].mana, 10 - 2);
      assert.equal(r.state.players[1].mana, 11);
    }
    assert.equal(r.state.players[1].life, 15 - 1, "life value is still lost by the owner");
  }
});

test("KH2 killer_half: friendly fire pays the attacker for its own unit too", () => {
  const ctx = sk({ refundMode: "killer_half" });
  const s = blankState(ctx, 10);
  const a = place(s, "sk05", 0, 1, 1, 0); // AoE: (0,2) (1,2) (2,2) (0,1)
  place(s, "sk04", 0, 0, 2, 0); // own, hp2
  place(s, "sk03", 1, 2, 2, 0); // enemy, hp2
  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: null });
  const ds = destroyEvents(r.events);
  assert.equal(ds.length, 2);
  assert.ok(ds.every((d) => d.killer === 0 && d.manaTo === 0));
  assert.equal(r.state.players[0].mana, 10 - 2 + 1 + 1);
  assert.equal(r.state.players[1].mana, 10);
});

test("KH3 killer_half: a counter-kill pays the countering side", () => {
  const ctx = sk({ refundMode: "killer_half" });
  const s = blankState(ctx, 10);
  const a = place(s, "sk04", 0, 0, 0, 0); // range reaches (1,1)
  const d = place(s, "sk10", 1, 1, 1, 2); // facing south: counter range covers (0,0)
  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: d });
  assert.equal(attackEvent(r.events).attackerDestroyed, true);
  const [de] = destroyEvents(r.events);
  assert.equal(de.uid, a);
  assert.equal(de.killer, 1);
  assert.equal(de.manaTo, 1);
  assert.equal(r.state.players[1].mana, 11);
});

test("KH4 killer_half: a reigu kill pays the reigu's user; a self-kill pays nobody", () => {
  const ctx = sk({ refundMode: "killer_half", effects: true });
  const s = blankState(ctx, 10);
  s.players[0].hand = ["sk22"];
  const own = place(s, "sk03", 0, 0, 1, 0); // faces (0,2)
  const v = place(s, "sk04", 1, 0, 2, 0);
  const r = applyAction(ctx, s, { kind: "reigu", handIndex: 0, targetUid: own, facing: null });
  const [d] = destroyEvents(r.events);
  assert.equal(d.uid, v);
  assert.equal(d.manaTo, 0);
  assert.equal(r.state.players[0].mana, 10 - 3 + 1);

  // konshin: sk12 kills the target (paid to its side), then dies to its own
  // 1 HP cost (killer = nobody, so nobody is paid).
  const s2 = blankState(ctx, 10);
  const k = place(s2, "sk12", 0, 0, 0, 0);
  unitByUid(s2, k)!.damage = 4; // 1 HP left
  const t = place(s2, "sk10", 1, 1, 1, 0); // the attacker stands in its blind spot
  const r2 = applyAction(ctx, s2, { kind: "attack", uid: k, targetUid: null, variant: "konshin" });
  const ds = destroyEvents(r2.events);
  assert.equal(ds.length, 2);
  const victim = ds.find((x) => x.uid === t)!;
  const self = ds.find((x) => x.uid === k)!;
  assert.equal(victim.manaTo, 0);
  assert.equal(self.killer, null);
  assert.equal(self.manaTo, null);
  assert.equal(self.manaGain, 0);
  assert.equal(r2.state.players[0].mana, 10 - 3 + 2);
  assert.equal(r2.state.players[1].mana, 10);
});

// ------------------------------------------------- 1.2 inherit summon

test("IN1 inherit: position, facing, damage and action flags carry over; cost and refund", () => {
  const ctx = sk({ inheritSummon: true });
  const s = blankState(ctx, 10);
  s.players[0].hand = ["sk08"]; // yin, cost 3
  const old = place(s, "sk03", 0, 0, 1, 1); // yin, cost 2, on a yin cell
  const ou = unitByUid(s, old)!;
  ou.damage = 1;
  ou.attackedThisTurn = true;
  const act = { kind: "inherit" as const, handIndex: 0, targetUid: old };
  assert.ok(isLegal(ctx, s, act));
  assert.ok(legalActions(ctx, s).some((a) => a.kind === "inherit" && a.targetUid === old));

  const r = applyAction(ctx, s, act);
  assert.equal(r.state.units.length, 1);
  const nu = r.state.units[0];
  assert.equal(nu.cardId, "sk08");
  assert.deepEqual(nu.pos, p(0, 1));
  assert.equal(nu.facing, 1);
  assert.equal(nu.damage, 1);
  assert.equal(nu.attackedThisTurn, true);
  assert.equal(r.state.players[0].mana, 10 - 3 + 1, "full cost, then ceil(2/2) back");
  assert.deepEqual(r.state.players[0].grave, ["sk03"]);
  assert.equal(r.state.players[0].life, 15, "not a destruction: no life loss");
  assert.equal(destroyEvents(r.events).length, 0);
  const se = r.events.find((e) => e.t === "summon");
  assert.ok(se !== undefined && se.t === "summon" && se.inheritedFrom?.cardId === "sk03");
  // it attacked already this turn, so it cannot attack now
  place(r.state, "sk04", 1, 0, 2, 0);
  assert.ok(!legalActions(ctx, r.state).some((a) => a.kind === "attack"));
});

test("IN2 inherit: strictly pricier, attribute match (none matches both ways), HP must stay > 0", () => {
  const ctx = sk({ inheritSummon: true });
  const s = blankState(ctx, 20);
  s.players[0].hand = ["sk04", "sk05", "sk06", "sk09", "sk12"];
  const yin2 = place(s, "sk03", 0, 0, 1, 0); // yin, cost 2
  const yang2 = place(s, "sk04", 0, 2, 0, 0); // yang, cost 2
  const none3 = place(s, "sk06", 0, 1, 2, 0); // none, cost 3, yin cell
  unitByUid(s, none3)!.damage = 3; // 1 HP left
  const ok = (hand: number, target: number) =>
    isLegal(ctx, s, { kind: "inherit", handIndex: hand, targetUid: target });
  assert.ok(!ok(0, yin2), "equal cost is not enough (and yang onto yin)");
  assert.ok(!ok(1, yang2), "yin onto yang is refused");
  assert.ok(ok(1, yin2), "yin onto yin, pricier");
  assert.ok(ok(2, yang2), "none onto yang");
  assert.ok(ok(3, none3), "yang onto none; 6-2 (yin cell) - 3 damage = 1 HP");
  assert.ok(!ok(4, none3), "yang hp5 on a yin cell with 3 damage would be at 0");

  const hidden = blankState(ctx, 20);
  hidden.players[0].hand = ["sk05"];
  const h = place(hidden, "sk03", 0, 0, 1, 0);
  unitByUid(hidden, h)!.hiddenBy = 0;
  assert.ok(!isLegal(ctx, hidden, { kind: "inherit", handIndex: 0, targetUid: h }));
});

test("IN3 inherit: taiji discount applies, summonLimit counts it, works on a full board", () => {
  const ctx = sk({ inheritSummon: true, summonLimit: 1 });
  const s = blankState(ctx, 10);
  s.players[0].hand = ["sk16", "sk02"];
  const cells: [number, number][] = [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]];
  for (const [x, y] of cells) place(s, "sk06", 1, x, y, 0);
  const t = place(s, "sk01", 0, 1, 1, 0); // yang, cost 2, on taiji
  assert.equal(s.units.length, 9);
  const r = applyAction(ctx, s, { kind: "inherit", handIndex: 0, targetUid: t });
  assert.equal(r.state.players[0].mana, 10 - (6 - 2) + 1);
  assert.equal(r.state.summonsThisTurn, 1);
  assert.ok(!legalActions(ctx, r.state).some((a) => a.kind === "inherit" || a.kind === "summon"));
});

test("IN4 inherit: an unacted unit may still attack; on-summon effects fire (Ungaikyo overwrites HP)", () => {
  const ctx = sk({ inheritSummon: true, effects: true });
  const s = blankState(ctx, 20);
  s.players[0].hand = ["sk10"]; // none, cost 4
  const old = place(s, "sk06", 0, 0, 0, 0); // faces (0,1)
  unitByUid(s, old)!.damage = 2;
  place(s, "sk03", 1, 0, 1, 2); // yin on a yin cell: 4 HP
  const r = applyAction(ctx, s, { kind: "inherit", handIndex: 0, targetUid: old });
  const nu = r.state.units.find((u) => u.cardId === "sk10")!;
  assert.equal(unitHp(ctx, nu), 4, "copied from the front unit, carried damage ignored");
  assert.equal(nu.summonedThisTurn, true);
  assert.ok(legalActions(ctx, r.state).some((a) => a.kind === "attack" && a.uid === nu.uid));
});

test("IN5 inherit is off by default", () => {
  const ctx = sk();
  const s = blankState(ctx, 20);
  s.players[0].hand = ["sk05"];
  const t = place(s, "sk03", 0, 0, 1, 0);
  assert.ok(!legalActions(ctx, s).some((a) => a.kind === "inherit"));
  assert.ok(!isLegal(ctx, s, { kind: "inherit", handIndex: 0, targetUid: t }));
});

// ---------------------------------------------------- 1.3 counter gap

test("GP1 gap: a single-target attack is countered like before", () => {
  const ctx = sk({ counterMode: "gap" });
  const s = blankState(ctx, 20);
  const a = place(s, "sk03", 0, 0, 1, 0);
  const d = place(s, "sk10", 1, 0, 2, 2); // faces (0,1)
  const ev = attackEvent(applyAction(ctx, s, { kind: "attack", uid: a, targetUid: d }).events);
  assert.equal(ev.counterCount, 1);
  assert.equal(ev.counterTotal, 2);
});

test("GP2 gap: an area attack is countered only from its gap cell", () => {
  const setup = (mode: "gap" | "all") => {
    const ctx = sk({ counterMode: mode });
    const s = blankState(ctx, 20);
    const a = place(s, "sk05", 0, 1, 1, 0); // gap (-1,0) -> (0,1)
    place(s, "sk10", 1, 0, 1, 1); // on the gap, faces (1,1)
    place(s, "sk10", 1, 1, 2, 2); // in range, faces (1,1), not on the gap
    return attackEvent(applyAction(ctx, s, { kind: "attack", uid: a, targetUid: null }).events);
  };
  const gap = setup("gap");
  assert.equal(gap.hits.length, 2);
  assert.equal(gap.counterCount, 1);
  assert.equal(gap.counterTotal, 2);
  assert.equal(setup("all").counterCount, 2);
});

test("GP3 gap: an area card without a gap cell is never countered (Kuryugai)", () => {
  const run = (mode: "gap" | "all") => {
    const ctx = sk({ counterMode: mode });
    const s = blankState(ctx, 20);
    const a = place(s, "sk17", 0, 1, 1, 0);
    place(s, "sk10", 1, 1, 2, 2); // faces (1,1)
    return attackEvent(applyAction(ctx, s, { kind: "attack", uid: a, targetUid: null }).events);
  };
  assert.equal(run("gap").counterCount, 0);
  assert.equal(run("all").counterCount, 1);
});

test("GP4 gap: jutsu units do not counter (they still do under the old modes)", () => {
  const run = (mode: "gap" | "all") => {
    const ctx = sk({ counterMode: mode });
    const s = blankState(ctx, 20);
    const a = place(s, "sk03", 0, 0, 1, 0);
    const d = place(s, "sk06", 1, 0, 2, 2); // jutsu, faces (0,1)
    return attackEvent(applyAction(ctx, s, { kind: "attack", uid: a, targetUid: d }).events);
  };
  assert.equal(run("gap").counterCount, 0);
  assert.equal(run("all").counterCount, 1);
});

// ------------------------------------------------------- 1.4 mulligan

test("MU1 mulligan returns summonCost >= 5 shikigami and redraws as many", () => {
  const ctx = sk({ mulligan: true });
  const s = blankState(ctx, 20);
  s.players[0].hand = ["sk01", "sk14", "sk17", "sk18", "sk05"];
  s.players[0].deck = ["sk02", "sk03", "sk04", "sk06", "sk07"];
  s.players[1].hand = ["sk08", "sk09", "sk10", "sk11", "sk12"];
  s.players[1].deck = ["sk13"];
  const events: GameEvent[] = [];
  performMulligan(ctx, s, events);
  const ps = s.players[0];
  assert.equal(ps.hand.length, 5);
  assert.equal(ps.deck.length, 5);
  for (const id of ["sk01", "sk18", "sk05"]) assert.ok(ps.hand.includes(id));
  assert.deepEqual(
    [...ps.hand, ...ps.deck].sort(),
    ["sk01", "sk02", "sk03", "sk04", "sk05", "sk06", "sk07", "sk14", "sk17", "sk18"],
  );
  const mu = events.flatMap((e) => (e.t === "mulligan" ? [e] : []));
  assert.deepEqual(mu.map((e) => [e.player, e.returned]), [[0, 2], [1, 0]]);
  assert.deepEqual(s.players[1].hand, ["sk08", "sk09", "sk10", "sk11", "sk12"]);
});

test("MU2 mulligan is off by default and changes nothing", () => {
  const ctx = sk();
  const s = blankState(ctx, 20);
  s.players[0].hand = ["sk17"];
  s.players[0].deck = ["sk02"];
  const events: GameEvent[] = [];
  performMulligan(ctx, s, events);
  assert.deepEqual(s.players[0].hand, ["sk17"]);
  assert.equal(events.length, 0);
});

// ------------------------------------------------- 1.5 control hold

const fiveUnits = (s: ReturnType<typeof blankState>, owner: 0 | 1): number[] =>
  ([[0, 0], [2, 0], [0, 2], [2, 2], [1, 1]] as const).map(([x, y]) =>
    place(s, "sk06", owner, x, y, 0),
  );

test("CH1 next_turn_end: 5 at own turn end grants control; holding it to the next own turn end wins", () => {
  const ctx = sk({ controlHold: "next_turn_end" });
  const s = blankState(ctx, 20);
  fiveUnits(s, 0);
  const ev: GameEvent[] = [];
  endTurn(ctx, s, ev);
  assert.equal(s.players[0].reach, true);
  assert.ok(ev.some((e) => e.t === "control" && e.change === "gain" && e.player === 0));
  startTurn(ctx, s, ev);
  endTurn(ctx, s, ev); // opponent passes
  startTurn(ctx, s, ev);
  assert.equal(s.ended, false, "no win at the start of the turn any more");
  endTurn(ctx, s, ev);
  assert.equal(s.ended, true);
  assert.equal(s.winner, 0);
  assert.equal(s.winType, "control");
});

test("CH2 next_turn_end: control is lost the moment the count drops, even by own friendly fire", () => {
  const ctx = sk({ controlHold: "next_turn_end" });
  const s = blankState(ctx, 20);
  const mine = fiveUnits(s, 0); // (0,0) (2,0) (0,2) (2,2) (1,1)
  const ev: GameEvent[] = [];
  endTurn(ctx, s, ev);
  startTurn(ctx, s, ev);
  endTurn(ctx, s, ev);
  startTurn(ctx, s, ev); // player 0 again, still holding control
  assert.equal(s.turnPlayer, 0);
  assert.equal(s.players[0].reach, true);
  // own AoE: sk05 on (1,2) facing south hits (2,1) (1,1) (0,1) (2,2) and
  // takes down its own units on (1,1) and (2,2): 6 -> 4 cells
  const a = place(s, "sk05", 0, 1, 2, 2);
  unitByUid(s, mine[3])!.damage = 2;
  unitByUid(s, mine[4])!.damage = 2;
  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: null });
  assert.equal(occupied(r.state, 0), 4);
  assert.equal(r.state.players[0].reach, false);
  assert.ok(r.events.some((e) => e.t === "control" && e.change === "lost" && e.player === 0));
  // back up to 5 in the same turn: that is a fresh grant, not a win
  const re = r.state;
  place(re, "sk06", 0, 1, 1, 0);
  assert.equal(occupied(re, 0), 5);
  const ev2: GameEvent[] = [];
  endTurn(ctx, re, ev2);
  assert.equal(re.ended, false);
  assert.equal(re.players[0].reach, true);
});

test("CH3 next_turn_end: the opponent breaking the count removes the control state", () => {
  const ctx = sk({ controlHold: "next_turn_end" });
  const s = blankState(ctx, 20);
  const mine = fiveUnits(s, 0);
  const ev: GameEvent[] = [];
  endTurn(ctx, s, ev);
  startTurn(ctx, s, ev); // player 1
  unitByUid(s, mine[0])!.damage = 3; // (0,0): 1 HP left
  const killer = place(s, "sk03", 1, 0, 1, 2); // yin cell, faces (0,0)
  const r = applyAction(ctx, s, { kind: "attack", uid: killer, targetUid: mine[0] });
  assert.equal(r.state.players[0].reach, false);
  assert.ok(r.events.some((e) => e.t === "control" && e.change === "lost" && e.player === 0));
});

// -------------------------------------------------------- 1.6 hand mode

test("HM1 replace_discarded draws only as many as were discarded", () => {
  for (const mode of ["refill_to_5", "replace_discarded"] as const) {
    const ctx = sk({ handMode: mode });
    const s = blankState(ctx, 0); // projected mana 3: sk17 and sk16 get pitched
    s.players[0].hand = ["sk17", "sk16", "sk03"];
    s.players[0].deck = ["sk01", "sk02", "sk04", "sk05", "sk06"];
    const ev: GameEvent[] = [];
    endTurn(ctx, s, ev);
    const te = ev.find((e) => e.t === "turnEnd");
    assert.ok(te !== undefined && te.t === "turnEnd");
    assert.equal(te.discarded, 2);
    if (mode === "replace_discarded") {
      assert.equal(te.drawn, 2);
      assert.equal(s.players[0].hand.length, 3);
    } else {
      assert.equal(te.drawn, 4);
      assert.equal(s.players[0].hand.length, 5);
    }
  }
});

// ------------------------------------------------- effects (Sec.2.3)

test("FX1 sk13 Kyonshi-Kojo steps onto the cell it cleared, keeping its facing", () => {
  const ctx = sk({ effects: true });
  const s = blankState(ctx, 20);
  const a = place(s, "sk13", 0, 1, 0, 0); // yin on a yang cell: 3 HP; hits (0,1) (2,1)
  const v = place(s, "sk03", 1, 0, 1, 0);
  unitByUid(s, v)!.damage = 2; // 2 HP left
  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: v });
  const moved = unitByUid(r.state, a)!;
  assert.deepEqual(moved.pos, p(0, 1));
  assert.equal(moved.facing, 0);
  assert.equal(unitHp(ctx, moved), 7, "re-evaluated on the yin cell");
  assert.ok(r.events.some((e) => e.t === "move" && e.source === "sk13"));

  const off = applyAction(sk({ effects: false }), s, { kind: "attack", uid: a, targetUid: v });
  assert.deepEqual(unitByUid(off.state, a)!.pos, p(1, 0), "an effect: off means no move");
});

test("FX2 sk13 does not move onto a cell that would leave it at 0 HP", () => {
  const ctx = sk({ effects: true });
  const s = blankState(ctx, 20);
  const a = place(s, "sk13", 0, 1, 2, 2); // yin cell; facing south hits (2,1) (0,1)
  unitByUid(s, a)!.damage = 4; // 3 HP here, would be 5-2-4 < 0 on yang
  const v = place(s, "sk04", 1, 2, 1, 0);
  unitByUid(s, v)!.damage = 2;
  const r = applyAction(ctx, s, { kind: "attack", uid: a, targetUid: v });
  assert.equal(destroyEvents(r.events).length, 1);
  assert.deepEqual(unitByUid(r.state, a)!.pos, p(1, 2));
  assert.ok(!r.events.some((e) => e.t === "move"));
});

test("FX3 sk18 Yanari sets any facing (including a half turn); tm-style 90 degrees no longer binds", () => {
  const ctx = sk({ effects: true });
  const s = blankState(ctx, 20);
  s.players[0].hand = ["sk18"];
  const t = place(s, "sk06", 1, 1, 1, 0);
  const facings = legalActions(ctx, s)
    .flatMap((a) => (a.kind === "reigu" && a.targetUid === t ? [a.facing] : []))
    .sort();
  assert.deepEqual(facings, [1, 2, 3]);
  const r = applyAction(ctx, s, { kind: "reigu", handIndex: 0, targetUid: t, facing: 2 });
  assert.equal(unitByUid(r.state, t)!.facing, 2);
  assert.equal(r.state.players[0].mana, 18);
  assert.ok(!isLegal(ctx, s, { kind: "reigu", handIndex: 0, targetUid: t, facing: 0 }));
});

test("FX4 sk20 heals the whole side by 1; sk22 deals 3", () => {
  const ctx = sk({ effects: true });
  const s = blankState(ctx, 20);
  s.players[0].hand = ["sk20", "sk22"];
  const own = place(s, "sk06", 0, 0, 0, 0); // faces (0,1)
  unitByUid(s, own)!.damage = 2;
  const foe = place(s, "sk10", 1, 0, 1, 0); // 5 HP
  const r1 = applyAction(ctx, s, { kind: "reigu", handIndex: 0, targetUid: null, facing: null });
  assert.equal(unitByUid(r1.state, own)!.damage, 1);
  assert.equal(r1.state.players[0].mana, 18);
  const r2 = applyAction(ctx, r1.state, { kind: "reigu", handIndex: 0, targetUid: own, facing: null });
  assert.equal(unitHp(ctx, unitByUid(r2.state, foe)!), 2);
  assert.equal(r2.state.players[0].mana, 15);
});

test("FX5 sk12 konshin is an area attack; the +1 lands on every target", () => {
  const ctx = sk({ effects: true });
  const s = blankState(ctx, 20);
  const a = place(s, "sk12", 0, 1, 1, 0); // (0,2) (1,2) (2,2)
  place(s, "sk10", 1, 0, 2, 2);
  place(s, "sk10", 1, 2, 2, 2);
  const acts = legalActions(ctx, s).filter((x) => x.kind === "attack" && x.uid === a);
  assert.ok(acts.some((x) => x.kind === "attack" && x.variant === "konshin" && x.targetUid === null));
  const ev = attackEvent(
    applyAction(ctx, s, { kind: "attack", uid: a, targetUid: null, variant: "konshin" }).events,
  );
  assert.deepEqual(ev.hits.map((h) => h.dmg), [3, 3]);
  assert.equal(ev.cost, 3, "the sheet's attack cost, not ATK");
});

test("FX6 reused effects run under the sk ids (sk10 Ungaikyo, sk01 Toro-no-Sei)", () => {
  const ctx = sk({ effects: true });
  const s = blankState(ctx, 20);
  s.players[0].hand = ["sk10"];
  place(s, "sk03", 1, 0, 1, 2); // 4 HP, in front of (0,0)
  const r = applyAction(ctx, s, { kind: "summon", handIndex: 0, pos: p(0, 0), facing: 0 });
  assert.equal(unitHp(ctx, r.state.units.find((u) => u.cardId === "sk10")!), 4);
  assert.ok(r.events.some((e) => e.t === "effect" && e.source === "sk10"));
});

// ------------------------------------------------------- full game

test("K0 ruleset plays end to end and fills every Sec.4 metric", () => {
  const ctx = sk(K0);
  const ais = [makeGreedy(), makeGreedy()] as const;
  const recs = [0, 1, 2, 3].map((i) => runGame(ctx, [ais[0], ais[1]], 20260910 + i).record);
  const again = runGame(ctx, [ais[0], ais[1]], 20260910).record;
  assert.deepEqual(again, recs[0], "deterministic");
  const sum = summarise("k0", recs);
  assert.equal(sum.games, 4);
  for (const k of [
    "inheritPerGame", "inheritCombos", "killerManaPerGame", "counterRate", "firstKillWinRate",
    "leadFlipsPerGame", "controlStates", "handSizeByRound", "highCostBreakdownPerGame",
    "mulliganReturned",
  ]) {
    assert.ok(k in sum, k);
  }
  assert.equal(sum.controlStates.won, sum.winTypes.control);
  assert.ok(recs.every((r) => r.winType !== "turn_limit"));
});
