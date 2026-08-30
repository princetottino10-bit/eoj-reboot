// DESIGN.md Sec.8 acceptance test 22 (determinism) plus runner/AI guards.
import test from "node:test";
import assert from "node:assert/strict";
import { loadPack, packPath } from "../src/pack-io.ts";
import { makeGreedy } from "../src/ai/greedy.ts";
import { makeBeam } from "../src/ai/beam.ts";
import { EVAL_PROFILES, profileWeights } from "../src/ai/eval.ts";
import { runGame, runMatches } from "../src/runner.ts";
import { legalActions } from "../src/rules.ts";
import { blankState, mkCtx, place } from "./helpers.ts";

const TM = loadPack(packPath("tsukumo-miyako"));

// 22 ------------------------------------------------------------------
test("T22 the same seed replays byte-identically", () => {
  const ctx = mkCtx();
  const ais: [ReturnType<typeof makeGreedy>, ReturnType<typeof makeGreedy>] = [
    makeGreedy(),
    makeGreedy(),
  ];
  const a = runGame(ctx, ais, 4242);
  const b = runGame(ctx, ais, 4242);
  assert.equal(JSON.stringify(a.events), JSON.stringify(b.events));
  assert.equal(JSON.stringify(a.record), JSON.stringify(b.record));
  assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));

  // and a different seed produces a different game
  const c = runGame(ctx, ais, 4243);
  assert.notEqual(JSON.stringify(a.events), JSON.stringify(c.events));
});

test("T22b beam is deterministic too, on both packs", () => {
  for (const pack of [undefined, TM]) {
    const ctx = mkCtx({ roundLimit: 12 }, pack);
    const ais: [ReturnType<typeof makeBeam>, ReturnType<typeof makeBeam>] = [
      makeBeam(),
      makeBeam(),
    ];
    const a = runGame(ctx, ais, 77);
    const b = runGame(ctx, ais, 77);
    assert.equal(JSON.stringify(a.events), JSON.stringify(b.events));
  }
});

test("every game terminates and reports a win type", () => {
  const ctx = mkCtx();
  const recs = runMatches(ctx, [makeGreedy(), makeGreedy()], { games: 12, seed: 900 });
  assert.equal(recs.length, 12);
  for (const r of recs) {
    assert.ok(["control", "life", "turn_limit"].includes(r.winType));
    assert.ok(r.rounds >= 1 && r.rounds <= ctx.cfg.roundLimit + 1);
    assert.ok(r.turns[0] > 0 && r.turns[1] >= 0);
  }
});

test("a mana-starved greedy player passes instead of looping", () => {
  const ctx = mkCtx();
  const s = blankState(ctx, 0); // no mana at all
  s.players[0].hand = ["p22", "p13"];
  place(s, "p13", 1, 1, 2, 2);
  const plan = makeGreedy().planTurn(ctx, s);
  assert.deepEqual(plan, [{ kind: "pass" }]);
  assert.equal(legalActions(ctx, s).length, 1); // only pass is available
});

test("plans never exceed maxActionsPerTurn", () => {
  const ctx = mkCtx({ maxActionsPerTurn: 12 });
  const s = blankState(ctx, 99);
  s.players[0].hand = ["p01", "p02", "p03", "p07", "p13"];
  for (const ai of [makeGreedy(), makeBeam()]) {
    const plan = ai.planTurn(ctx, s);
    assert.ok(plan.length <= ctx.cfg.maxActionsPerTurn + 1, `${ai.name}: ${plan.length}`);
    assert.equal(plan[plan.length - 1].kind, "pass");
  }
});

test("the round limit produces a draw", () => {
  const ctx = mkCtx({ roundLimit: 2 });
  const r = runGame(ctx, [makeGreedy(), makeGreedy()], 5);
  assert.equal(r.record.winType, "turn_limit");
  assert.equal(r.record.winner, null);
});

test("eval profiles are distinct and produce different games", () => {
  const ctx = mkCtx({}, TM);
  assert.deepEqual(Object.keys(EVAL_PROFILES).sort(), ["aggressive", "balanced", "territorial"]);
  assert.equal(profileWeights("aggressive").life, 40);
  assert.equal(profileWeights("aggressive").occ, 12);
  assert.throws(() => profileWeights("nope"), /unknown eval profile/);

  let differing = 0;
  for (let seed = 50; seed < 60; seed++) {
    const terr = runGame(ctx, [makeGreedy(profileWeights("territorial")), makeGreedy()], seed);
    const aggr = runGame(ctx, [makeGreedy(profileWeights("aggressive")), makeGreedy()], seed);
    if (JSON.stringify(terr.events) !== JSON.stringify(aggr.events)) differing += 1;
  }
  assert.ok(differing > 0, "the two profiles never diverged over 10 seeds");
});

test("real-deck packs play through end to end", () => {
  for (const name of ["tsukumo-miyako", "kyubi-ryu"]) {
    const ctx = mkCtx({}, loadPack(packPath(name)));
    const recs = runMatches(ctx, [makeGreedy(), makeGreedy()], { games: 4, seed: 31 });
    assert.equal(recs.length, 4);
    for (const r of recs) assert.ok(r.summons[0] + r.summons[1] > 0, name);
  }
});
