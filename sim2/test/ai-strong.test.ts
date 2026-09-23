// The strong AI (src/ai/strong.ts): the audit's findings, fixed one by one,
// plus the guarantees every AI kind must give (legal plans, determinism).
import test from "node:test";
import assert from "node:assert/strict";
import { AI_KINDS, AI_LABELS, isAiKind, makeAi } from "../src/ai/index.ts";
import { makeStrong, strongDiscard, strongMulligan, strongTansu } from "../src/ai/strong.ts";
import { hasControl, rangeCells } from "../src/ai/strong-eval.ts";
import { applySequence, controlBroken, findControlBreaks, makeBudget, summonFacings, DEFAULT_SEARCH } from "../src/ai/strong-search.ts";
import { makeGreedy } from "../src/ai/greedy.ts";
import { makeBeam } from "../src/ai/beam.ts";
import { presetConfig } from "../src/presets.ts";
import { applyActionInPlace, isLegal } from "../src/rules.ts";
import { runGame } from "../src/runner.ts";
import { createGame, occupied, unitByUid } from "../src/state.ts";
import { checkRoundLimit, defaultDiscardPolicy, endTurn, performMulligan, startTurn } from "../src/turn.ts";
import type { Action, GameEvent, GameState } from "../src/types.ts";
import { blankState, mkCtx, place } from "./helpers.ts";
import { SK } from "./online-helpers.ts";

const r0914 = () => mkCtx(presetConfig("r0914"), SK);

const nonPass = (plan: Action[]): Action[] => plan.filter((a) => a.kind !== "pass");

// --- registry ----------------------------------------------------------
test("registry: three kinds, Japanese labels, factory and validation", () => {
  assert.deepEqual([...AI_KINDS], ["greedy", "beam", "strong"]);
  assert.equal(AI_LABELS.greedy, "速い");
  assert.equal(AI_LABELS.beam, "深い");
  assert.equal(AI_LABELS.strong, "強い");
  assert.ok(isAiKind("strong") && !isAiKind("random") && !isAiKind(3));
  assert.equal(makeAi("greedy").name, "greedy");
  assert.equal(makeAi("beam", "aggressive").name, "beam");
  const strong = makeAi("strong", "balanced");
  assert.equal(strong.name, "strong");
  assert.ok(strong.discard !== undefined && strong.mulligan !== undefined && strong.tansu !== undefined);
  assert.equal(makeAi("greedy").discard, undefined); // greedy keeps the engine's default policies
  assert.throws(() => makeAi("nope"), /unknown ai "nope"/);
  assert.throws(() => makeAi("strong", "nope"), /unknown eval profile/);
});

// --- 1. control break --------------------------------------------------
/** The audit's seed 1001 R8 position: B holds control with 5 units, A's only
 *  break is 家鳴り on 茨木童子 (turn it west) then its area attack. */
const controlPosition = (): { ctx: ReturnType<typeof r0914>; s: GameState } => {
  const ctx = r0914();
  const s = blankState(ctx, 7);
  s.players[1].mana = 4;
  place(s, "sk16", 1, 0, 2, 1); // B酒呑童子7/7>
  place(s, "sk05", 1, 1, 2, 0); // B鎖鬼5/5^
  place(s, "sk15", 0, 2, 2, 0); // A茨木童子7/7^
  place(s, "sk08", 0, 0, 1, 0); // A一角鬼5/5^
  place(s, "sk14", 1, 1, 1, 0); // B両面6/6^
  place(s, "sk09", 0, 2, 1, 0); // A一目鬼8/8^
  const shomakyo = place(s, "sk11", 1, 0, 0, 0); // B照魔鏡4/5^
  place(s, "sk01", 0, 1, 0, 0); // A灯籠の精4/4^
  const tansu = place(s, "sk07", 1, 2, 0, 0); // B古箪笥6/3^ (鬼の酒 over-heal)
  unitByUid(s, shomakyo)!.damage = 1;
  unitByUid(s, tansu)!.damage = -3;
  s.players[0].hand = ["sk21", "sk20", "sk18", "sk05", "sk16"];
  s.players[1].reach = true;
  s.players[0].chips = 4;
  s.players[1].chips = 5;
  s.round = 8;
  assert.ok(hasControl(ctx, s, 1));
  assert.equal(occupied(s, 0), 4);
  return { ctx, s };
};

test("control break: the two-step 家鳴り -> area attack is found and taken (audit seed 1001 R8)", () => {
  const { ctx, s } = controlPosition();
  const breaks = findControlBreaks(ctx, s, 0, makeBudget(DEFAULT_SEARCH));
  assert.ok(breaks.length > 0, "a break exists");
  for (const seq of breaks) {
    assert.ok(seq.length >= 2 && seq.length <= 3, `break length ${seq.length}`);
    assert.ok(controlBroken(ctx, applySequence(ctx, s, seq), 0));
  }
  const plan = makeStrong().planTurn(ctx, s);
  const end = applySequence(ctx, s, nonPass(plan));
  assert.ok(!hasControl(ctx, end, 1), `plan breaks control: ${JSON.stringify(plan)}`);
  assert.ok(nonPass(plan).some((a) => a.kind === "attack" || a.kind === "reigu"));
  // greedy, for comparison, leaves B in control from the same position
  const greedyEnd = applySequence(ctx, s, nonPass(makeGreedy().planTurn(ctx, s)));
  assert.ok(hasControl(ctx, greedyEnd, 1));
});

test("control break: a Mayohiga break hides the most threatening enemy", () => {
  const ctx = r0914();
  const s = blankState(ctx, 2);
  const eye = place(s, "sk09", 1, 1, 0, 0); // B一目鬼 facing ^: range (1,1),(0,0),(2,0)
  const harmless = [place(s, "sk01", 1, 0, 0, 0), place(s, "sk01", 1, 2, 0, 0), place(s, "sk01", 1, 0, 2, 0), place(s, "sk01", 1, 2, 2, 0)];
  place(s, "sk03", 0, 1, 1, 2); // A影鬼 at taiji, facing the 一目鬼: a 2-HP unit it can kill
  place(s, "sk07", 0, 0, 1, 0);
  place(s, "sk07", 0, 2, 1, 0);
  place(s, "sk07", 0, 1, 2, 0);
  s.players[0].hand = ["sk19"];
  s.players[1].reach = true;
  assert.ok(hasControl(ctx, s, 1));
  const plan = nonPass(makeStrong().planTurn(ctx, s));
  const hide = plan.find((a) => a.kind === "reigu");
  assert.ok(hide !== undefined && hide.kind === "reigu", `plan uses Mayohiga: ${JSON.stringify(plan)}`);
  assert.equal(hide.targetUid, eye, "hides the unit that threatens a kill, not a harmless one");
  assert.ok(!harmless.includes(hide.targetUid ?? -1));
  assert.ok(!hasControl(ctx, applySequence(ctx, s, plan), 1));
});

// --- 2. facing -----------------------------------------------------------
test("facing: a summon is turned toward an enemy it can hit, not left facing north", () => {
  const ctx = r0914();
  const s = blankState(ctx, 5);
  // 提灯お化け(yin, 2 HP) on a plain cell, so ATK 2 is exactly lethal
  const prey = place(s, "sk02", 1, 2, 2, 0);
  s.players[0].hand = ["sk06"]; // 変面: attribute none, jutsu, range = the front cell only

  // the facing chooser keeps the facing that covers the enemy, and few others
  const facings = summonFacings(ctx, s, 0, "sk06", { x: 2, y: 1 });
  assert.ok(facings.includes(0), `north (the enemy's cell) is kept: ${facings}`);
  assert.ok(facings.length <= 2, `at most two facings are tried: ${facings}`);

  const plan = nonPass(makeStrong().planTurn(ctx, s));
  const summon = plan.find((a) => a.kind === "summon");
  assert.ok(summon !== undefined && summon.kind === "summon", JSON.stringify(plan));
  const covered = rangeCells(ctx, "sk06", summon.pos, summon.facing).some((c) => c.x === 2 && c.y === 2);
  assert.ok(covered, `summoned facing the enemy: ${JSON.stringify(summon)}`);
  // and the kill it set up is taken
  const end = applySequence(ctx, s, plan);
  assert.equal(unitByUid(end, prey), undefined, `the prey is destroyed: ${JSON.stringify(plan)}`);
});

// --- 3. discard ----------------------------------------------------------
test("discard: keeps the big card the next income makes affordable, pitches the rest", () => {
  const ctx = r0914(); // income at turn end: mana already holds next turn's budget
  const s = blankState(ctx, 3);
  place(s, "sk03", 0, 0, 0, 0);
  s.players[0].chips = 0; // income 3 -> 6 is one tick away, 7 is not
  s.players[0].hand = ["sk16", "sk17", "sk02", "sk01", "sk08"];
  assert.deepEqual(defaultDiscardPolicy(ctx, s, 0), [0, 1], "the default policy drops both big cards");
  assert.deepEqual(strongDiscard(ctx, s, 0), [1], "strong keeps 酒呑童子(6) and drops 玖龍街(7)");
});

test("discard: dead cards and duplicates go first, reigu with nothing to do go too", () => {
  const ctx = r0914();
  const s = blankState(ctx, 8);
  s.players[0].hand = ["sk16", "sk16", "sk19", "sk20", "sk02"];
  // empty board: every reigu is dead weight, the second 酒呑童子 cannot be played next turn either
  assert.deepEqual(strongDiscard(ctx, s, 0), [1, 2, 3]);
  const off = mkCtx({ ...presetConfig("r0914"), effects: false }, SK);
  const t = blankState(off, 8);
  place(t, "sk03", 0, 0, 0, 0);
  t.players[0].hand = ["sk19", "sk02"];
  assert.deepEqual(strongDiscard(off, t, 0), [0], "a reigu with effects off is dead");
});

test("mulligan and 古箪笥 choices", () => {
  const ctx = r0914();
  const s = blankState(ctx, 3);
  s.players[0].hand = ["sk16", "sk19", "sk02", "sk14", "sk08"];
  assert.deepEqual(strongMulligan(ctx, s, 0), [0, 1, 3]);
  const u = place(s, "sk07", 0, 1, 0, 0); // 3 HP on a yang cell -> 5 HP
  assert.equal(strongTansu(ctx, s, unitByUid(s, u)!), "mana");
  unitByUid(s, u)!.damage = 3;
  assert.equal(strongTansu(ctx, s, unitByUid(s, u)!), "skip");
});

// --- 4. two cheap units over one big in a race -----------------------------
test("tempo: two affordable cheap units are summoned rather than one big one", () => {
  const ctx = r0914();
  const s = blankState(ctx, 4);
  place(s, "sk04", 1, 1, 0, 0);
  s.players[0].hand = ["sk10", "sk02", "sk03", "sk21"]; // 雲外鏡(4) vs 提灯お化け(2)+影鬼(2)
  const plan = nonPass(makeStrong().planTurn(ctx, s));
  assert.equal(plan.filter((a) => a.kind === "summon").length, 2, JSON.stringify(plan));
});

// --- legality, determinism, budget ------------------------------------------
const playWith = (ctx: ReturnType<typeof r0914>, seed: number, ai: ReturnType<typeof makeStrong>): { events: GameEvent[]; maxMs: number } => {
  const s = createGame(ctx, seed);
  const events: GameEvent[] = [];
  performMulligan(ctx, s, events, ai.mulligan);
  let maxMs = 0;
  for (let t = 0; t < ctx.cfg.roundLimit * 2 + 8; t++) {
    if (s.ended || checkRoundLimit(ctx, s, events)) break;
    startTurn(ctx, s, events, ai.tansu);
    if (s.ended) break;
    const t0 = performance.now();
    const plan = ai.planTurn(ctx, s);
    maxMs = Math.max(maxMs, performance.now() - t0);
    assert.ok(plan.length <= ctx.cfg.maxActionsPerTurn + 1);
    assert.equal(plan[plan.length - 1].kind, "pass");
    for (const a of plan) {
      if (a.kind === "pass") break;
      assert.ok(isLegal(ctx, s, a), `illegal planned action ${JSON.stringify(a)} at round ${s.round}`);
      applyActionInPlace(ctx, s, a, events);
      if (s.ended) break;
    }
    if (s.ended) break;
    endTurn(ctx, s, events, ai.discard);
  }
  assert.ok(s.ended);
  return { events, maxMs };
};

test("every planned action is legal, games end, and the same seed replays identically", () => {
  const ctx = r0914();
  const ai = makeStrong();
  for (const seed of [11, 12, 13]) {
    const a = playWith(ctx, seed, ai);
    const b = playWith(ctx, seed, ai);
    assert.equal(JSON.stringify(a.events), JSON.stringify(b.events));
    assert.ok(a.events.some((e) => e.t === "gameEnd"));
    assert.ok(a.maxMs < 3000, `a turn took ${a.maxMs.toFixed(0)} ms`); // generous: the node cap is what binds
  }
});

test("runner: strong plays through on every preset and pack, and a seed replays byte-identically", () => {
  const ais: [ReturnType<typeof makeStrong>, ReturnType<typeof makeStrong>] = [makeStrong(), makeStrong()];
  for (const preset of ["r0914", "r0913", "r0828"] as const) {
    const ctx = mkCtx(presetConfig(preset), SK);
    const a = runGame(ctx, ais, 21);
    const b = runGame(ctx, ais, 21);
    assert.equal(JSON.stringify(a.events), JSON.stringify(b.events));
    assert.ok(["control", "life", "turn_limit", "deck_out"].includes(a.record.winType));
  }
  const plain = mkCtx({ roundLimit: 12 });
  assert.ok(runGame(plain, [makeStrong(), makeBeam()], 3).state.ended);
});

test("the node budget bounds the work: a tiny cap still yields a legal plan", () => {
  const ctx = r0914();
  const { s } = controlPosition();
  const tiny = makeStrong({ maxApplies: 5 });
  const plan = tiny.planTurn(ctx, s);
  assert.equal(plan[plan.length - 1].kind, "pass");
  let cur = s;
  for (const a of nonPass(plan)) {
    assert.ok(isLegal(ctx, cur, a));
    cur = applySequence(ctx, cur, [a]);
  }
});

test("an already-won control state is just held (pass), never gambled", () => {
  const ctx = r0914();
  const s = blankState(ctx, 9);
  for (const [x, y] of [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]]) place(s, "sk02", 0, x, y, 0);
  place(s, "sk09", 1, 2, 2, 2);
  s.players[0].reach = true;
  s.players[0].hand = ["sk16", "sk22"];
  const plan = makeStrong().planTurn(ctx, s);
  assert.deepEqual(plan, [{ kind: "pass" }]);
});
