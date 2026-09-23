// Engine fixes from the 2026-09-17 fuzzing run (out/bughunt-engine/repro-*.ts):
// B1 raising controlWin mid-match re-checks the control state,
// B2 a control state lost at turn start (next_turn_start) clears reach,
// B3 reigu without an implemented effect (kyubi-ryu) are never usable,
// B4 isLegal rejects off-board cells, bad facings and unknown attack variants,
// B5 heal / inherit preview numbers match what applying the action does,
// B6 a limit lowered during a 古箪笥 prompt still stops the turn from starting.
import test from "node:test";
import assert from "node:assert/strict";
import { makeGreedy } from "../src/ai/greedy.ts";
import { canUseVariant, effectTextOf, IMPLEMENTED_REIGU_EFFECTS, reiguImplemented } from "../src/effects.ts";
import { createFlow, replayFlow, submit } from "../src/flow.ts";
import type { Flow, FlowInput } from "../src/flow.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig } from "../src/presets.ts";
import type { RulePresetId } from "../src/presets.ts";
import { legalEntries } from "../src/preview.ts";
import type { AttackPreview, InheritPreview } from "../src/preview.ts";
import { applyAction, isLegal, legalActions } from "../src/rules.ts";
import { runGame } from "../src/runner.ts";
import { makeCtx, occupied, unitByUid, unitHp, unitMaxHp } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import { defaultDiscardPolicy } from "../src/turn.ts";
import type { Action, AttackVariant, Config, Facing, GameEvent, GameState, PlayerId } from "../src/types.ts";
import { blankState, place } from "./helpers.ts";

const SK = loadPack(packPath("shuten-kyuryu"));
const TM = loadPack(packPath("tsukumo-miyako"));
const KR = loadPack(packPath("kyubi-ryu"));

const ctxOf = (preset: RulePresetId, over: Partial<Config> = {}, pack = SK): Ctx => makeCtx(presetConfig(preset, over), pack);

/** Puts `ids` on the board for `owner` (taken out of their deck / hand), then refills the hand to 5. */
const seedUnits = (s: GameState, owner: PlayerId, ids: string[], cells: [number, number][], facing: Facing = 0): void => {
  const ps = s.players[owner];
  ids.forEach((id, i) => {
    ps.deck = ps.deck.filter((c) => c !== id);
    ps.hand = ps.hand.filter((c) => c !== id);
    s.units.push({
      uid: s.nextUid++, cardId: id, owner, pos: { x: cells[i][0], y: cells[i][1] }, facing, damage: 0,
      attackedThisTurn: false, rotatedThisTurn: false, summonedThisTurn: false, hiddenBy: null, atkBuff: 0,
    });
  });
  while (ps.hand.length < 5) ps.hand.push(ps.deck.shift()!);
};

const FIVE: [number, number][] = [[0, 0], [2, 0], [0, 2], [2, 2], [1, 1]];
const FIVE_IDS = ["sk05", "sk08", "sk09", "sk14", "sk15"];

const ok = (f: Flow, seat: PlayerId, input: FlowInput): void => {
  const r = submit(f, seat, input);
  assert.ok(r.ok, `${JSON.stringify(input)}: ${r.ok ? "" : r.error}`);
};
const passTurn = (f: Flow, seat: PlayerId): void => {
  ok(f, seat, { type: "action", action: { kind: "pass" } });
  ok(f, seat, { type: "discard", indices: [] });
};
const controlEvents = (f: Flow): string[] =>
  f.events.flatMap((e) => (e.t === "control" ? [`${e.player}:${e.change}`] : []));

// ------------------------------------------------------------------- B1

test("B1: raising controlWin mid-match drops a control state that no longer reaches it (no early win)", () => {
  const run = (midMatch: boolean): Flow => {
    const f = createFlow(ctxOf("r0914", midMatch ? {} : { controlWin: 6 }), 42, { prepare: (s) => seedUnits(s, 0, FIVE_IDS, FIVE) });
    ok(f, 0, { type: "mulligan", indices: [] });
    ok(f, 1, { type: "mulligan", indices: [] });
    passTurn(f, 0); // 5 cells at turn end: the control state under controlWin 5
    assert.equal(f.state.players[0].reach, midMatch);
    if (midMatch) {
      ok(f, 1, { type: "config", patch: { controlWin: 6 } });
      assert.equal(f.state.players[0].reach, false, "5 cells no longer hold controlWin 6");
      const last = f.log.slice(-2).map((l) => l.event.t);
      assert.deepEqual(last, ["config", "control"], "the loss is logged right after the change");
      // the event carries the threshold it was judged against, so the log line keeps saying it later
      assert.deepEqual(f.events.at(-1), { t: "control", player: 0, change: "lost", need: 6, hold: f.ctx.cfg.controlHold });
    }
    passTurn(f, 1);
    const summon = legalActions(f.ctx, f.state).find((a) => a.kind === "summon")!;
    ok(f, 0, { type: "action", action: summon }); // 6th cell
    passTurn(f, 0);
    return f;
  };
  const changed = run(true);
  const fromStart = run(false);
  assert.equal(occupied(changed.state, 0), 6);
  assert.equal(changed.state.ended, false, "the control state starts only now");
  assert.equal(changed.state.players[0].reach, true);
  assert.deepEqual(changed.state, fromStart.state, "same as playing controlWin 6 from the start");
  // the recorded inputs replay to the same flow
  const again = replayFlow(ctxOf("r0914"), 42, changed.inputs, { prepare: (s) => seedUnits(s, 0, FIVE_IDS, FIVE) });
  assert.deepEqual(again.events, changed.events);
  assert.deepEqual(again.log, changed.log);
});

test("B1: a rule change that keeps the control state emits nothing, and the win still comes at the next turn end", () => {
  const f = createFlow(ctxOf("r0914"), 42, { prepare: (s) => seedUnits(s, 0, FIVE_IDS, FIVE) });
  ok(f, 0, { type: "mulligan", indices: [] });
  ok(f, 1, { type: "mulligan", indices: [] });
  passTurn(f, 0);
  const before = f.events.length;
  ok(f, 1, { type: "config", patch: { controlWin: 4 } });
  ok(f, 1, { type: "config", patch: { manaCap: 12 } });
  assert.equal(f.events.length, before, "no control event");
  assert.equal(f.state.players[0].reach, true);
  passTurn(f, 1);
  passTurn(f, 0);
  assert.equal(f.state.winner, 0);
  assert.equal(f.state.winType, "control");
});

// ------------------------------------------------------------------- B2

/** r0828: P0 holds 5 cells, (0,0) at 1 HP; P1's sk03 at (0,1) faces it. */
const r0828Board = (s: GameState): void => {
  seedUnits(s, 0, FIVE_IDS, FIVE);
  s.units[0].damage = 2;
  seedUnits(s, 1, ["sk03"], [[0, 1]], 2);
};

test("B2: next_turn_start - a control state broken before the turn start clears reach with the lost event", () => {
  const f = createFlow(ctxOf("r0828"), 42, { prepare: r0828Board });
  passTurn(f, 0);
  assert.equal(f.state.players[0].reach, true);
  const kill = legalActions(f.ctx, f.state).find((a) => a.kind === "attack")!;
  ok(f, 1, { type: "action", action: kill });
  assert.equal(f.state.players[0].reach, true, "next_turn_start: the break is judged at the holder's turn start");
  passTurn(f, 1);
  assert.deepEqual(controlEvents(f), ["0:gain", "0:lost"]);
  assert.equal(f.state.players[0].reach, false, "the lost event clears reach");
  // switching to next_turn_end now must not turn the old reach into a win
  ok(f, 0, { type: "config", patch: { controlHold: "next_turn_end" } });
  const summon = legalActions(f.ctx, f.state).find((a) => a.kind === "summon")!;
  ok(f, 0, { type: "action", action: summon });
  passTurn(f, 0);
  assert.equal(f.state.ended, false, "the control state is only gained now");
  assert.equal(f.state.players[0].reach, true);
});

test("B2: next_turn_start - an unbroken control state still wins at the next turn start", () => {
  const f = createFlow(ctxOf("r0828"), 42, { prepare: r0828Board });
  passTurn(f, 0);
  passTurn(f, 1);
  assert.deepEqual(controlEvents(f), ["0:gain", "0:win"]);
  assert.equal(f.state.winner, 0);
  assert.equal(f.state.winType, "control");
  assert.equal(f.state.round, 2);
  assert.ok(!f.events.some((e) => e.t === "turnStart" && e.round === 2 && e.player === 0), "won before the turn");
});

// ------------------------------------------------------------------- B3

test("B3: kyubi-ryu reigu have no implemented effect and are unusable with effects on or off", () => {
  const reigu = KR.cards.filter((c) => c.kind === "reigu").map((c) => c.id);
  assert.deepEqual(reigu, ["kr17", "kr18", "kr19", "kr20", "kr21", "kr22"]);
  for (const effects of [true, false]) {
    const ctx = ctxOf("r0914", { effects }, KR);
    const s = blankState(ctx, 10);
    place(s, "kr01", 0, 1, 1, 0);
    s.players[0].hand = reigu.slice();
    for (const id of reigu) assert.equal(reiguImplemented(ctx, id), false, id);
    assert.ok(!legalActions(ctx, s).some((a) => a.kind === "reigu"), `effects ${effects}: none listed`);
    reigu.forEach((_, handIndex) => {
      assert.ok(!isLegal(ctx, s, { kind: "reigu", handIndex, targetUid: null, facing: null }));
      assert.ok(!isLegal(ctx, s, { kind: "reigu", handIndex, targetUid: 1, facing: null }));
    });
    // the default discard policy pitches them as dead cards either way
    const hand = ["kr17", "kr01", "kr21"];
    s.players[0].hand = hand.slice();
    const pitched = defaultDiscardPolicy(ctx, s, 0).map((i) => hand[i]);
    assert.ok(pitched.includes("kr17") && pitched.includes("kr21"), `effects ${effects}: ${pitched}`);
  }
});

test("B3: kyubi-ryu greedy games are the same with effects on and off", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const on = runGame(ctxOf("r0914", { effects: true }, KR), [makeGreedy(), makeGreedy()], seed);
    const off = runGame(ctxOf("r0914", { effects: false }, KR), [makeGreedy(), makeGreedy()], seed);
    assert.deepEqual(on.events, off.events, `seed ${seed}`);
  }
});

test("B3: every shuten-kyuryu / tsukumo-miyako reigu stays implemented and usable; the key list has effect text", () => {
  for (const pack of [SK, TM]) {
    const ctx = ctxOf("r0914", {}, pack);
    for (const card of pack.cards.filter((c) => c.kind === "reigu")) {
      assert.ok(reiguImplemented(ctx, card.id), card.id);
      const s = blankState(ctx, 20);
      const own = place(s, pack === SK ? "sk05" : "tm05", 0, 1, 0, 0); // faces (1,1)
      unitByUid(s, own)!.damage = 1;
      place(s, pack === SK ? "sk05" : "tm05", 1, 1, 1, 2);
      s.players[0].hand = [card.id];
      assert.ok(legalActions(ctx, s).some((a) => a.kind === "reigu"), `${card.id} usable`);
      // and the discard policy judges it on cost, not as a dead card
      assert.deepEqual(defaultDiscardPolicy(ctx, s, 0), [], `${card.id} kept`);
    }
  }
  for (const key of IMPLEMENTED_REIGU_EFFECTS) assert.ok((effectTextOf(key) ?? "").length > 0, key);
});

// ------------------------------------------------------------------- B4

test("B4: isLegal rejects summons off the board or with a facing outside 0-3", () => {
  const ctx = ctxOf("r0914");
  const s = blankState(ctx, 10);
  s.players[0].hand = ["sk03"];
  const summon = (x: number, y: number, facing: number): Action => ({ kind: "summon", handIndex: 0, pos: { x, y }, facing: facing as Facing });
  assert.ok(isLegal(ctx, s, summon(0, 0, 0)));
  assert.ok(isLegal(ctx, s, summon(2, 2, 3)));
  for (const [x, y] of [[3, 1], [-1, 0], [1, 3], [0, -1], [0.5, 0], [Number.NaN, 0]]) {
    assert.ok(!isLegal(ctx, s, summon(x, y, 0)), `(${x},${y})`);
  }
  for (const facing of [4, 7, -1, 1.5]) assert.ok(!isLegal(ctx, s, summon(0, 0, facing)), `facing ${facing}`);
  assert.ok(!legalActions(ctx, s).some((a) => a.kind === "summon" && (a.pos.x > 2 || a.facing > 3)));
});

test("B4: an unknown attack variant is never usable (not even on a heal-attack unit)", () => {
  const ctx = ctxOf("r0914");
  const s = blankState(ctx, 10);
  const healer = place(s, "sk06", 0, 1, 0, 0); // tm06 effect
  const ally = place(s, "sk04", 0, 1, 1, 0);
  const u = unitByUid(s, healer)!;
  assert.equal(canUseVariant(ctx, u, "heal"), true);
  for (const v of ["bogus", "", "Heal", "__proto__"]) {
    assert.equal(canUseVariant(ctx, u, v as AttackVariant), false, v);
    assert.ok(!isLegal(ctx, s, { kind: "attack", uid: healer, targetUid: ally, variant: v as AttackVariant }), v);
  }
  assert.ok(isLegal(ctx, s, { kind: "attack", uid: healer, targetUid: ally, variant: "heal" }));
});

// ------------------------------------------------------------------- B5

const attackPv = (ctx: Ctx, s: GameState, pick: (a: Action) => boolean): { action: Action; pv: AttackPreview } => {
  const e = legalEntries(ctx, s).find((x) => pick(x.action))!;
  assert.ok(e !== undefined && e.preview?.kind === "attack");
  return { action: e.action, pv: e.preview };
};

test("B5: the heal-attack preview and event report the HP actually restored", () => {
  const ctx = ctxOf("r0914");
  const isHeal = (a: Action): boolean => a.kind === "attack" && a.variant === "heal";
  // sk06 ATK 2 heals sk04 (max HP 2 at (0,2)): missing 1, full, over-healed (HP 4)
  for (const [damage, healed] of [[1, 1], [0, 0], [-2, 0]] as [number, number][]) {
    const s = blankState(ctx, 10);
    place(s, "sk06", 0, 0, 1, 0);
    const ally = place(s, "sk04", 0, 0, 2, 0);
    const u = unitByUid(s, ally)!;
    assert.equal(unitMaxHp(ctx, u), 2);
    u.damage = damage;
    const before = unitHp(ctx, u);
    const { action, pv } = attackPv(ctx, s, isHeal);
    const r = applyAction(ctx, s, action);
    const after = unitHp(ctx, unitByUid(r.state, ally)!);
    assert.equal(after - before, healed);
    assert.ok(Object.is(pv.hits[0].dmg, healed === 0 ? 0 : -healed), `damage ${damage}: preview dmg ${pv.hits[0].dmg}`);
    assert.equal(pv.hits[0].hpAfter, after);
    const ev = r.events.find((e): e is Extract<GameEvent, { t: "attack" }> => e.t === "attack")!;
    assert.ok(Object.is(ev.hits[0].dmg, pv.hits[0].dmg), "the log says the same");
  }
});

test("B5: the inherit preview reports the damage the new unit really carries (0 under a 雲外鏡 HP overwrite)", () => {
  const ctx = ctxOf("r0914");
  const inheritPv = (s: GameState): { pv: InheritPreview; damage: number; hp: number } => {
    const e = legalEntries(ctx, s).find((x) => x.action.kind === "inherit")!;
    assert.ok(e !== undefined && e.preview?.kind === "inherit");
    const r = applyAction(ctx, s, e.action);
    const fresh = r.state.units.find((u) => u.cardId === s.players[0].hand[0])!;
    return { pv: e.preview, damage: fresh.damage, hp: unitHp(ctx, fresh) };
  };
  // sk10 (雲外鏡) replaces a damaged sk06 facing an enemy sk15: HP copied from the front unit
  {
    const s = blankState(ctx, 10);
    const old = place(s, "sk06", 0, 1, 0, 0);
    unitByUid(s, old)!.damage = 3;
    place(s, "sk15", 1, 1, 1, 2);
    s.players[0].hand = ["sk10"];
    const { pv, hp } = inheritPv(s);
    assert.equal(pv.carriedDamage, 0, "the overwrite replaces the carried damage");
    assert.equal(pv.hpAfter, hp);
  }
  // nothing in front: the damage really carries over
  {
    const s = blankState(ctx, 10);
    const old = place(s, "sk06", 0, 1, 0, 2); // faces off the board
    unitByUid(s, old)!.damage = 3;
    s.players[0].hand = ["sk10"];
    const { pv, damage, hp } = inheritPv(s);
    assert.equal(damage, 3);
    assert.equal(pv.carriedDamage, 3);
    assert.equal(pv.hpAfter, hp);
  }
  // an over-healed unit (HP 10 on max 4): the carry-over is capped at maxHp
  {
    const s = blankState(ctx, 10);
    const old = place(s, "sk06", 0, 1, 0, 2);
    unitByUid(s, old)!.damage = -6;
    s.players[0].hand = ["sk14"];
    const { pv, damage, hp } = inheritPv(s);
    assert.notEqual(damage, -6, "the cap cut it");
    assert.equal(pv.carriedDamage, damage);
    assert.equal(pv.hpAfter, hp);
  }
});

// ------------------------------------------------------------------- B6

/** P0 has a 古箪笥 (sk07) on the board, so every P0 turn start opens a prompt. */
const tansuFlow = (prepareMore: (s: GameState) => void = () => {}): Flow => {
  const f = createFlow(ctxOf("r0914"), 7, {
    prepare: (s) => {
      seedUnits(s, 0, ["sk07"], [[0, 0]]);
      prepareMore(s);
    },
  });
  ok(f, 0, { type: "mulligan", indices: [] });
  ok(f, 1, { type: "mulligan", indices: [] });
  assert.equal(f.phase.kind, "tansu");
  ok(f, 0, { type: "tansu", answers: [] });
  passTurn(f, 0);
  ok(f, 1, { type: "action", action: { kind: "pass" } });
  return f;
};

test("B6: roundLimit lowered during a 古箪笥 prompt ends the match before that turn starts", () => {
  const f = tansuFlow();
  ok(f, 1, { type: "discard", indices: [] });
  assert.equal(f.phase.kind, "tansu");
  assert.equal(f.state.round, 2);
  ok(f, 1, { type: "config", patch: { roundLimit: 1 } });
  ok(f, 0, { type: "tansu", answers: [] });
  assert.equal(f.phase.kind, "over");
  assert.equal(f.state.winType, "turn_limit");
  assert.deepEqual(f.events.at(-1), { t: "gameEnd", winner: null, winType: "turn_limit", round: 2 });
  assert.ok(!f.events.some((e) => e.t === "turnStart" && e.round === 2), "no round-2 turn");

  // the same change one input earlier gives the same end
  const g = tansuFlow();
  ok(g, 1, { type: "config", patch: { roundLimit: 1 } });
  ok(g, 1, { type: "discard", indices: [] });
  assert.equal(g.phase.kind, "over");
  assert.deepEqual(g.state, f.state);
  assert.deepEqual(g.events, f.events);
});

test("B6: deckOutMode switched to second during a 古箪笥 prompt ends the match before that turn starts", () => {
  const f = tansuFlow((s) => {
    s.players[1].reshuffleCount = 2;
  });
  ok(f, 1, { type: "discard", indices: [] });
  assert.equal(f.phase.kind, "tansu");
  ok(f, 1, { type: "config", patch: { deckOutMode: "second" } });
  ok(f, 0, { type: "tansu", answers: [] });
  assert.equal(f.phase.kind, "over");
  assert.equal(f.state.winType, "deck_out");
  assert.equal(f.state.winner, 0, "1 cell against 0");
  assert.ok(!f.events.some((e) => e.t === "turnStart" && e.round === 2));
});
