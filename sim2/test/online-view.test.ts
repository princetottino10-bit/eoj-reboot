// DESIGN-ONLINE Sec.9 test 2 (hidden information), the rule presets and the
// flow state machine that the online match is built on.
import test from "node:test";
import assert from "node:assert/strict";
import { makeCtx } from "../src/state.ts";
import { createFlow, replayFlow, submit } from "../src/flow.ts";
import type { Flow } from "../src/flow.ts";
import { presetConfig, RULE_PRESETS } from "../src/presets.ts";
import { defaultConfig } from "../src/types.ts";
import type { PlayerId } from "../src/types.ts";
import { gameView, logView } from "../online/view.ts";
import { aiStep, playOut, SK, SPLIT_PACK, splitDeal } from "./online-helpers.ts";
import { blankState, place } from "./helpers.ts";
import { previewAttack } from "../src/preview.ts";
import { applyAction } from "../src/rules.ts";

const SEED = 987654321;

test("presets are RESULTS-EXP0913B K0 and K8ts with the team's base taiji discount of 1; 9/13 jutsu area attacks spare allies", () => {
  const k0 = {
    ...defaultConfig(),
    taijiDiscount: 1,
    chipMode: "catch_up", effects: true, incomeTiming: "turn_end",
    refundMode: "killer_half", inheritSummon: true, counterMode: "gap", mulligan: true,
    controlHold: "next_turn_end", handMode: "refill_to_5", summonLimit: null,
    // the 9/13 procedure (術式・範囲 hits no ally); no shuten-kyuryu card is jutsu + area, so K0 there is unchanged
    jutsuAoeSparesAllies: true,
  };
  const k8ts = {
    ...defaultConfig(),
    taijiDiscount: 1,
    chipMode: "catch_up", effects: true, incomeTiming: "turn_start",
    refundMode: "half", inheritSummon: false, counterMode: "all", mulligan: false,
    controlHold: "next_turn_start", handMode: "refill_to_5", summonLimit: null,
  };
  assert.deepEqual(presetConfig("r0913"), k0);
  assert.deepEqual(presetConfig("r0828"), k8ts);
  assert.equal(RULE_PRESETS.r0913.experiment, "K0");
  assert.equal(RULE_PRESETS.r0828.experiment, "K8ts");
  assert.equal(presetConfig("r0913", { effects: false }).effects, false, "overrides win");
});

const splitFlow = (): Flow =>
  createFlow(makeCtx(presetConfig("r0913"), SPLIT_PACK), SEED, { prepare: (s) => splitDeal(s) });

/** Card ids of `p` that have never been public (never on the board / in a grave). */
const secretIds = (f: Flow, p: PlayerId, revealed: Set<string>): string[] => {
  const ps = f.state.players[p];
  return [...ps.hand, ...ps.deck].filter((id) => !revealed.has(id));
};

const noteRevealed = (f: Flow, revealed: Set<string>): void => {
  for (const u of f.state.units) revealed.add(u.cardId);
  for (const ps of f.state.players) for (const id of ps.grave) revealed.add(id);
};

const assertNoLeak = (f: Flow, viewer: PlayerId | null, victim: PlayerId, revealed: Set<string>, where: string): void => {
  const view = JSON.stringify(gameView({ flow: f, matchNo: 1, rule: "r0913", pack: "split" }, viewer));
  const log = JSON.stringify(logView(f.log, viewer));
  for (const blob of [view, log]) {
    for (const id of secretIds(f, victim, revealed)) {
      assert.ok(!blob.includes(`"${id}"`), `${where}: ${id} of seat ${victim} leaked to ${viewer}`);
    }
    assert.ok(!blob.includes(String(f.state.rngState)), `${where}: rngState leaked`);
    assert.ok(!blob.includes(String(SEED)), `${where}: seed leaked`);
    assert.ok(!blob.includes("rngState"), `${where}: rngState key present`);
    assert.ok(!/"deck"\s*:/.test(blob), `${where}: a deck array is present`);
    assert.ok(!blob.includes('"seed"'), `${where}: seed key present`);
  }
};

test("test 2: an opponent's / spectator's view never holds hand ids, deck contents, rngState or the seed", () => {
  const f = splitFlow();
  const revealed = new Set<string>();
  // sanity: the split deal really does give each seat its own ids
  assert.ok(f.state.players[0].hand.every((id) => id.startsWith("A_")));
  assert.ok(f.state.players[1].deck.every((id) => id.startsWith("B_")));

  // own view does show own hand
  const own = gameView({ flow: f, matchNo: 1, rule: "r0913", pack: "split" }, 0);
  assert.deepEqual(own.hand, f.state.players[0].hand);
  const opp = gameView({ flow: f, matchNo: 1, rule: "r0913", pack: "split" }, 1);
  assert.equal(opp.board.players[0].handCount, 5);
  assert.equal(opp.legal, null);

  // mulligan: seat 0 sends back two cards; its private log line names them
  const back = f.state.players[0].hand.slice(0, 2);
  assert.equal(submit(f, 0, { type: "mulligan", indices: [0, 1] }).ok, true);
  assertNoLeak(f, 1, 0, revealed, "after seat 0 mulligan pick");
  assert.equal(submit(f, 1, { type: "mulligan", indices: [4] }).ok, true);
  const mine = JSON.stringify(logView(f.log, 0));
  assert.ok(back.every((id) => mine.includes(`"${id}"`)), "own mulligan cards are shown to their owner");
  for (const id of back) {
    assert.ok(!JSON.stringify(logView(f.log, 1)).includes(`"${id}"`), "...and to nobody else");
    assert.ok(!JSON.stringify(logView(f.log, null)).includes(`"${id}"`));
  }

  // play the whole game; after every input check both directions + spectator
  let steps = 0;
  playOut(f, 5000, () => {
    noteRevealed(f, revealed);
    assertNoLeak(f, 1, 0, revealed, `step ${steps}`);
    assertNoLeak(f, 0, 1, revealed, `step ${steps}`);
    assertNoLeak(f, null, 0, revealed, `step ${steps}`);
    assertNoLeak(f, null, 1, revealed, `step ${steps}`);
    steps += 1;
  });
  assert.equal(f.phase.kind, "over");
  assert.ok(steps > 20, "a real game was played");
  assert.ok(f.log.some((e) => e.event.t === "turnEnd" && e.event.discarded > 0), "discards happened");
});

test("the legal-action list only goes to the seat that is to act, with previews", () => {
  const f = createFlow(makeCtx(presetConfig("r0913"), SK), 5);
  submit(f, 0, { type: "mulligan", indices: [] });
  submit(f, 1, { type: "mulligan", indices: [] });
  assert.equal(f.phase.kind, "main");
  const src = { flow: f, matchNo: 1, rule: "r0913" as const, pack: "shuten-kyuryu" };
  assert.ok((gameView(src, 0).legal ?? []).length > 1);
  assert.equal(gameView(src, 1).legal, null);
  assert.equal(gameView(src, null).legal, null);
  assert.equal(gameView(src, null).hand, null);
});

test("flow: mulligan waits for both seats, then turn 1 starts", () => {
  const f = createFlow(makeCtx(presetConfig("r0913"), SK), 11);
  assert.deepEqual(f.phase, { kind: "mulligan", submitted: [false, false] });
  const hand1 = f.state.players[1].hand.slice();
  assert.equal(submit(f, 0, { type: "mulligan", indices: [0] }).ok, true);
  assert.deepEqual(f.phase, { kind: "mulligan", submitted: [true, false] });
  assert.equal(submit(f, 0, { type: "mulligan", indices: [] }).ok, false, "no second mulligan");
  assert.equal(submit(f, 0, { type: "action", action: { kind: "pass" } }).ok, false, "no play before both");
  assert.deepEqual(f.state.players[1].hand, hand1);
  assert.ok(!f.events.some((e) => e.t === "turnStart"));
  assert.equal(submit(f, 1, { type: "mulligan", indices: [] }).ok, true);
  assert.deepEqual(f.phase, { kind: "main", player: 0 });
  assert.ok(f.events.some((e) => e.t === "mulligan"));
  assert.ok(f.events.some((e) => e.t === "turnStart"));
});

test("flow: 8/28 preset has no mulligan and starts straight in the main phase", () => {
  const f = createFlow(makeCtx(presetConfig("r0828"), SK), 11);
  assert.deepEqual(f.phase, { kind: "main", player: 0 });
});

test("flow: a full AI game replays identically from its inputs", () => {
  const ctx = makeCtx(presetConfig("r0913"), SK);
  const f = createFlow(ctx, 20260913);
  playOut(f);
  const r = replayFlow(ctx, 20260913, f.inputs);
  assert.deepEqual(r.state, f.state);
  assert.deepEqual(r.events, f.events);
  assert.equal(r.phase.kind, "over");
});

test("attack preview: gap-position counter under the 9/13 rules matches the real resolution", () => {
  const ctx = makeCtx(presetConfig("r0913"), SK);
  const s = blankState(ctx, 10);
  const atk = place(s, "sk05", 0, 1, 1, 0); // 鎖鬼 area 1234, gap 4 -> (0,1)
  const onGap = place(s, "sk03", 1, 0, 1, 1); // 影鬼 faces east: its counter range covers (1,1)
  const offGap = place(s, "sk02", 1, 2, 2, 2); // 提灯お化け (jutsu, HP2 on an empty cell) in range, not on the gap
  const action = { kind: "attack" as const, uid: atk, targetUid: null };
  const pv = previewAttack(ctx, s, action);
  assert.ok(pv !== null);
  assert.deepEqual(pv.hits.map((h) => [h.uid, h.dmg, h.destroyed]), [[onGap, 2, false], [offGap, 2, true]]);
  assert.equal(pv.counterCount, 1, "only the unit on the gap counters");
  assert.equal(pv.counterTotal, 2);
  assert.equal(pv.attackerHpBefore, 3);
  assert.equal(pv.attackerHpAfter, 1);
  assert.deepEqual(pv.manaGain, [1, 0], "killer_half: the attacker's side gains floor(2/2)");
  const real = applyAction(ctx, s, action);
  const ev = real.events.find((e) => e.t === "attack");
  assert.ok(ev !== undefined && ev.t === "attack");
  assert.equal(ev.counterTotal, pv.counterTotal);
  assert.equal(real.state.players[0].mana, 10 - 2 + 1);
  // the same attacker turned so the enemy is off its gap: no counter
  // 影鬼 moved to (1,2) facing south: the attacker is in its counter range,
  // but (1,2) is not the gap cell, so no counter under counterMode gap
  s.units[1].pos = { x: 1, y: 2 };
  s.units[1].facing = 2;
  s.units[2].pos = { x: 0, y: 1 };
  const pv2 = previewAttack(ctx, s, action);
  assert.equal(pv2?.counterCount, 0);
  const pv3 = previewAttack(makeCtx(presetConfig("r0828"), SK), s, action);
  assert.equal(pv3?.counterCount, 1, "under 8/28 (counterMode all) the same position is countered");
});

test("flow: resign ends the game for the opponent", () => {
  const f = createFlow(makeCtx(presetConfig("r0828"), SK), 3);
  aiStep(f);
  assert.equal(submit(f, 1, { type: "resign" }).ok, true);
  assert.equal(f.phase.kind, "over");
  assert.equal(f.state.winner, 0);
  assert.equal(f.resignedBy, 1);
  assert.equal(submit(f, 0, { type: "action", action: { kind: "pass" } }).ok, false);
});
