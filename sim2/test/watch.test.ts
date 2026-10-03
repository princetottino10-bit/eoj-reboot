// 観戦モード: the words of each step, how long each is shown, the pacing loop
// (pause / step / speed) on a fake clock, whole AI-vs-AI games through it for
// every pairing on 10/3テスト案, and the page's routes.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardPack } from "../src/cards.ts";
import { AI_KINDS, makeAi } from "../src/ai/index.ts";
import type { AiKind } from "../src/ai/index.ts";
import type { FlowEvent, FlowInput } from "../src/flow.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig } from "../src/presets.ts";
import { makeCtx } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import type { GameEvent, GameState, HitRecord } from "../src/types.ts";
import { aiOwes, decideAiMove, freshMemo } from "../play/ai-seat.ts";
import { playTarget, serveFile } from "../play/server.ts";
import {
  createRunner,
  createWatchGame,
  defaultWatchSetup,
  KEY_FACTOR,
  paceMs,
  parseWatchSetup,
  playWatchStep,
  SPEED_MS,
  watchHref,
  watchNames,
} from "../play/watch-core.ts";
import type { WatchStep } from "../play/watch-core.ts";
import { beforeOf, narrateStep } from "../play/watch-text.ts";
import type { WatchLevel } from "../play/watch-text.ts";
import { onlineStaticAllowed, staticTarget } from "../online/server.ts";
import { blankState, place } from "./helpers.ts";

const AC: CardPack = loadPack(packPath("adopted-1003"));
const r1003 = (): Ctx => makeCtx(presetConfig("r1003"), AC);

type Ev = GameEvent | FlowEvent;

/** Narrates events on a board (the units named in them placed before). */
const say = (ctx: Ctx, s: GameState, events: Ev[], inputs: FlowInput[] = [], after: GameState = s) =>
  narrateStep(ctx, beforeOf(ctx, s), after, 0, inputs, events);
const texts = (n: { lines: { text: string }[] }): string[] => n.lines.map((l) => l.text);
const hit = (uid: number, cardId: string, dmg: number, over: Partial<HitRecord> = {}): HitRecord => ({
  uid, cardId, owner: 1, blind: false, dmg, destroyed: false, ally: false, ...over,
});

// ---------------------------------------------------------------- words

test("words: a summon names the card, the cell, the facing and the cost; an inherit says from what", () => {
  const ctx = r1003();
  const s = blankState(ctx);
  const n = say(ctx, s, [{ t: "summon", player: 0, uid: 7, cardId: "ac03", pos: { x: 0, y: 2 }, facing: 0, cost: 3, taiji: false, baseCost: 3 }]);
  assert.deepEqual(texts(n), ["先手: 影鬼を左上の空に召喚・上向き(霊力−3)"]);
  assert.equal(n.level, "normal");
  assert.equal(n.actor, 7);
  const taiji = say(ctx, s, [{ t: "summon", player: 1, uid: 8, cardId: "ac04", pos: { x: 1, y: 1 }, facing: 2, cost: 1, taiji: true, baseCost: 3, underdogDiscount: 1 }]);
  assert.deepEqual(texts(taiji), ["後手: 鉞鬼を太極に召喚・下向き(霊力−1・劣勢割引−1)"]);
  const inh = say(ctx, s, [{
    t: "summon", player: 0, uid: 9, cardId: "ac15", pos: { x: 2, y: 0 }, facing: 0, cost: 6, taiji: false, baseCost: 8,
    inheritedFrom: { uid: 3, cardId: "ac04", baseCost: 3, refund: 2 },
  }]);
  assert.deepEqual(texts(inh), ["先手: 鉞鬼から茨木童子へ継承召喚(霊力−6・回収+2)"]);
});

test("words: an attack says who struck whom for how much, 撃破, the counter and the attacker's fall; the action comes before what it caused", () => {
  const ctx = r1003();
  const s = blankState(ctx);
  const a = place(s, "ac15", 1, 1, 2, 2);
  const v = place(s, "ac04", 0, 1, 1, 0);
  const one = say(ctx, s, [
    { t: "effect", player: 1, source: "ac15", uid: a, text: "茨木童子: 【再生】" },
    { t: "destroy", owner: 0, uid: v, cardId: "ac04", lifeLoss: 0, manaGain: 1, killer: 1, manaTo: 1 },
    { t: "attack", player: 1, uid: a, cardId: "ac15", aoe: false, cost: 2, hits: [hit(v, "ac04", 5, { owner: 0, destroyed: true })], counterTotal: 0, counterCount: 0, attackerDestroyed: false, variant: "normal" },
  ]);
  assert.deepEqual(texts(one), [
    "後手: 茨木童子の攻撃(霊力−2) → 鉞鬼に5ダメージ、撃破",
    "★ 茨木童子: 【再生】",
    "撃破で後手の霊力+1(鉞鬼)",
  ]);
  assert.equal(one.lines[0].tone, "main");
  assert.equal(one.actor, a);
  assert.deepEqual(one.targets, [v]);
  const area = say(ctx, s, [{
    t: "attack", player: 0, uid: v, cardId: "ac04", aoe: true, cost: 3,
    hits: [hit(a, "ac15", 4, { blind: true, destroyed: true }), hit(9, "ac03", 2, { ally: true })],
    counterTotal: 3, counterCount: 2, attackerDestroyed: true, variant: "konshin",
  }]);
  assert.deepEqual(texts(area), ["先手: 鉞鬼の渾身の攻撃(霊力−3) → 茨木童子に4ダメージ(死角)(撃破)・影鬼(味方)に2ダメージ / 反撃で3ダメージ(2体)、鉞鬼は撃破された"]);
  const heal = say(ctx, s, [{ t: "attack", player: 1, uid: a, cardId: "ac15", aoe: false, cost: 1, hits: [hit(v, "ac04", -2)], counterTotal: 0, counterCount: 0, attackerDestroyed: false, variant: "heal" }]);
  assert.deepEqual(texts(heal), ["後手: 茨木童子が味方の鉞鬼を2回復(霊力−1)"]);
  const miss = say(ctx, s, [{ t: "attack", player: 0, uid: v, cardId: "ac04", aoe: true, cost: 0, hits: [], counterTotal: 0, counterCount: 0, attackerDestroyed: false, variant: "normal" }]);
  assert.deepEqual(texts(miss), ["先手: 鉞鬼の範囲攻撃 → 当たらず"]);
});

test("words: rotate, proxy rotate, reigu (with its target named from the board before), counter order and moves", () => {
  const ctx = r1003();
  const s = blankState(ctx);
  const u = place(s, "ac04", 0, 0, 0, 0);
  const k = place(s, "ac17", 1, 2, 2, 2);
  assert.deepEqual(texts(say(ctx, s, [{ t: "rotate", player: 0, uid: u, cost: 1, cardId: "ac04", from: 0, to: 1 }])), ["先手: 鉞鬼を右へ回転・右向き(霊力−1)"]);
  assert.deepEqual(texts(say(ctx, s, [{ t: "rotate", player: 0, uid: u, cost: 1, cardId: "ac04", from: 0, to: 2 }])), ["先手: 鉞鬼を反対へ回転・下向き(霊力−1)"]);
  const proxy = say(ctx, s, [
    { t: "rotate", player: 1, uid: k, cost: 1, cardId: "ac17", from: 2, to: 2 },
    { t: "effect", player: 1, source: "ac17", uid: u, text: "玖龍街: 鉞鬼を回転", from: 0, to: 3 },
  ]);
  assert.deepEqual(texts(proxy), ["後手: 玖龍街の代理回転(霊力−1)", "★ 玖龍街: 鉞鬼を回転"]);
  assert.equal(proxy.actor, k);
  assert.deepEqual(proxy.targets, [u]);
  // the target is gone after the reigu: still named from the board before
  const reigu = say(ctx, s, [{ t: "reigu", player: 1, cardId: "ac23", targetUid: k, cost: 4 }]);
  assert.deepEqual(texts(reigu), ["後手: 霊具「鬼の酒」を玖龍街に使用(霊力−4)"]);
  assert.deepEqual(reigu.targets, [k]);
  assert.deepEqual(texts(say(ctx, s, [{ t: "reigu", player: 0, cardId: "ac18", targetUid: null, cost: 2 }])), ["先手: 霊具「家鳴り」を使用(霊力−2)"]);
  const co = say(ctx, s, [{ t: "counterOrder", player: 1, round: 2, order: [3, 4], cards: ["ac03", "ac04"] }]);
  assert.deepEqual(texts(co), ["反撃の順番: 後手が 影鬼 → 鉞鬼 に決めた"]);
  assert.deepEqual(texts(say(ctx, s, [{ t: "move", player: 0, uid: u, from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, source: "rule" }])), ["鉞鬼が太極へ移動"]);
});

test("words: the turn end joins the pass, the turn change is a key moment, mulligan and 古箪笥 come from the inputs", () => {
  const ctx = r1003();
  const s = blankState(ctx);
  const end = say(makeCtx(presetConfig("r1003", { incomeTiming: "turn_start" }), AC), s, [
    { t: "pass", player: 0 },
    { t: "turnEnd", player: 0, round: 2, occupied: 3, chips: 3, chipGained: 1, reach: false, discarded: 1, drawn: 2, boardHp: 10, manaLeft: 1 },
    { t: "turnStart", player: 1, round: 2, income: 6 },
  ]);
  assert.deepEqual(texts(end), ["先手: ターン終了 — 占拠3・チップ3枚・1枚捨てて2枚補充", "── ラウンド2・後手の番(収入+6)"]);
  assert.equal(end.level, "key");
  assert.equal(end.banner, "ラウンド2・後手の番");
  assert.equal(end.lines[1].tone, "turn");
  const mull = narrateStep(ctx, beforeOf(ctx, s), s, 1, [{ type: "mulligan", indices: [0, 3] }], [{ t: "mulligan", player: 0, returned: 1 }]);
  assert.deepEqual(texts(mull), ["後手: マリガンで2枚戻して引き直し"]);
  assert.deepEqual(texts(narrateStep(ctx, beforeOf(ctx, s), s, 0, [{ type: "mulligan", indices: [] }], [])), ["先手: マリガンしない"]);
  const t = place(s, "ac05", 0, 0, 2, 0);
  const tansu = narrateStep(ctx, beforeOf(ctx, s), s, 0, [{ type: "tansu", answers: [{ uid: t, choice: "draw" }] }], [{ t: "turnStart", player: 0, round: 3, income: 7 }]);
  assert.deepEqual(texts(tansu), ["先手: 古箪笥 — 1枚引く", "── ラウンド3・先手の番"]);
});

test("importance: an income step, a unit counting 2, control and the end are key moments with a headline (the end outranks all)", () => {
  const ctx = r1003();
  const s = blankState(ctx);
  // 10/3: 4 chips raise the income 6 -> 7
  const up = say(ctx, s, [{ t: "turnEnd", player: 1, round: 3, occupied: 4, chips: 4, chipGained: 1, reach: false, discarded: 0, drawn: 1, boardHp: 20, manaLeft: 0 }]);
  assert.equal(up.level, "key");
  assert.equal(up.banner, "後手のチップが4枚に — 収入 6→7");
  assert.ok(texts(up).includes("◆ 後手のチップが4枚に — 収入 6→7"));
  const flat = say(ctx, s, [{ t: "turnEnd", player: 1, round: 3, occupied: 3, chips: 3, chipGained: 1, reach: false, discarded: 0, drawn: 1, boardHp: 20, manaLeft: 0 }]);
  assert.equal(flat.level, "normal");
  // a unit with HP 11 or more appears: it counts 2 toward 占拠
  const after = blankState(ctx);
  const big = place(after, "ac17", 0, 2, 1, 0);
  const heavy = narrateStep(ctx, beforeOf(ctx, s), after, 0, [], [{ t: "summon", player: 0, uid: big, cardId: "ac17", pos: { x: 2, y: 1 }, facing: 0, cost: 10, taiji: false, baseCost: 10 }]);
  assert.equal(heavy.level, "key");
  assert.equal(heavy.banner, "先手の玖龍街(HP16)は占拠2マス分");
  // already counting 2 before: not news
  assert.equal(narrateStep(ctx, beforeOf(ctx, after), after, 0, [], []).level, "normal");
  const ctl = say(ctx, s, [
    { t: "control", player: 0, change: "gain", need: 5, hold: "next_turn_end" },
    { t: "turnStart", player: 1, round: 4, income: 7 },
  ]);
  assert.equal(ctl.level, "key");
  assert.match(ctl.banner ?? "", /^先手が制圧中/);
  const lost = say(ctx, s, [{ t: "control", player: 0, change: "lost", need: 5, hold: "next_turn_end" }]);
  assert.equal(lost.level, "normal");
  const end = say(ctx, s, [
    { t: "control", player: 0, change: "win", need: 5, hold: "next_turn_end" },
    { t: "gameEnd", winner: 0, winType: "control", round: 5 },
    { t: "turnStart", player: 1, round: 5, income: 7 },
  ]);
  assert.equal(end.level, "end");
  assert.equal(end.banner, "決着 (R5): 先手の勝ち(制圧)");
});

test("pacing: 速さ ゆっくり / ふつう / はやい, key moments linger longer", () => {
  assert.deepEqual(SPEED_MS, { slow: 2500, normal: 1400, fast: 600 });
  assert.equal(paceMs("normal", "normal"), 1400);
  assert.equal(paceMs("normal", "key"), Math.round(1400 * KEY_FACTOR));
  assert.equal(paceMs("fast", "end"), Math.round(600 * KEY_FACTOR));
  assert.ok(KEY_FACTOR >= 1.5 && KEY_FACTOR <= 2);
  for (const s of ["slow", "normal", "fast"] as const) assert.ok(paceMs(s, "key") > paceMs(s, "normal"));
});

test("setup: stored choices are validated, the link carries the settings, the plates name seat and AI", () => {
  const d = defaultWatchSetup("abc");
  assert.deepEqual(parseWatchSetup(JSON.parse(JSON.stringify(d))), d);
  assert.equal(parseWatchSetup({ ...d, ais: ["strong", "clever"] }), null);
  assert.equal(parseWatchSetup({ ...d, speed: "warp" }), null);
  assert.equal(parseWatchSetup("x"), null);
  assert.equal(watchHref("a b"), "/watch?s=a%20b");
  assert.equal(watchHref(null), "/watch");
  assert.deepEqual(watchNames(["strong", "greedy"]), ["先手・強い", "後手・速い"]);
});

// ---------------------------------------------------------------- runner

/** A fake clock: sleeping moves time on at once. */
const fakeClock = () => {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms), advance: (ms: number) => void (t += ms) };
};

test("runner: the pause after a step starts once it is shown; pause holds, step plays one, resume goes on at once, speed changes the pause", async () => {
  const clock = fakeClock();
  const shown: number[] = [];
  const levels: WatchLevel[] = ["normal", "key", "normal", "normal", "normal", "end"];
  let i = 0;
  const runner = createRunner({
    next: async () => {
      clock.advance(300); // thinking takes time before the step is shown
      shown.push(clock.now());
      return levels[i++] ?? null;
    },
    now: clock.now,
    sleep: clock.sleep,
    speed: "normal",
    paused: true,
  });
  const done = runner.run();
  await runner.step();
  assert.equal(shown.length, 1);
  await runner.step();
  assert.equal(shown.length, 2);
  assert.equal(runner.view().paused, true);
  runner.setSpeed("fast");
  runner.resume();
  await new Promise((r) => setTimeout(r, 0));
  await runner.step(); // ignored while running
  await done;
  assert.equal(runner.view().over, true);
  assert.equal(shown.length, 6);
  // after resume the next step came at once, then each waited its pause (after the thinking) from when it was shown
  assert.equal(shown[2] - shown[1], 300);
  assert.equal(shown[3] - shown[2], SPEED_MS.fast + 300);
  assert.equal(shown[5] - shown[4], SPEED_MS.fast + 300);
});

test("runner: a key step waits longer; animations still running lengthen the pause; an error pauses", async () => {
  const clock = fakeClock();
  const shown: number[] = [];
  const levels: WatchLevel[] = ["key", "normal", "end"];
  let i = 0;
  const r = createRunner({
    next: async () => {
      shown.push(clock.now());
      return levels[i++] ?? null;
    },
    now: clock.now,
    sleep: clock.sleep,
    settleMs: () => (i === 2 ? 5000 : 0),
    speed: "slow",
  });
  await r.run();
  assert.equal(shown[1] - shown[0], paceMs("slow", "key"));
  assert.equal(shown[2] - shown[1], 5000);
  let seen: unknown = null;
  const bad = createRunner({
    next: async () => {
      throw new Error("boom");
    },
    now: clock.now,
    sleep: clock.sleep,
    onError: (e) => (seen = e),
  });
  const running = bad.run();
  await new Promise((res) => setTimeout(res, 0));
  assert.ok(seen instanceof Error);
  assert.equal(bad.view().paused, true);
  bad.stop();
  await running;
});

// ------------------------------------------------------------- whole games

const watchGame = async (kinds: [AiKind, AiKind], seed: number): Promise<{ steps: WatchStep[]; over: boolean }> => {
  const ctx = r1003();
  const quick = { strong: { timeLimitMs: 40 } };
  const g = createWatchGame(ctx, seed, [makeAi(kinds[0], "territorial", { seed, ...quick }), makeAi(kinds[1], "territorial", { seed: seed + 1, ...quick })]);
  const clock = fakeClock();
  const steps: WatchStep[] = [];
  const runner = createRunner({
    next: async () => {
      const s = playWatchStep(g);
      if (s === null) return null;
      steps.push(s);
      return s.level;
    },
    now: clock.now,
    sleep: clock.sleep,
    speed: "fast",
    onError: (e) => {
      throw e;
    },
  });
  await runner.run();
  return { steps, over: g.flow.phase.kind === "over" && runner.view().over };
};

test("whole games: every AI pairing plays r1003 to the end through the runner, one readable step at a time", async () => {
  let seed = 51000;
  for (const a of AI_KINDS) {
    for (const b of AI_KINDS) {
      const { steps, over } = await watchGame([a, b], seed);
      const tag = `${a}-${b} seed ${seed}`;
      assert.ok(over, `${tag}: reached the end`);
      const last = steps[steps.length - 1];
      assert.equal(last.level, "end", tag);
      assert.equal(last.over, true, tag);
      assert.ok(last.banner !== null && last.banner.startsWith("決着"), `${tag}: ${last.banner}`);
      for (const s of steps) {
        assert.ok(s.lines.length > 0, `${tag}: step ${s.index} has words`);
        assert.equal(s.lines[0].tone, "main", `${tag}: step ${s.index} starts with its action`);
        for (const l of s.lines) assert.ok(!/undefined|NaN|\[object/.test(l.text), `${tag}: ${l.text}`);
      }
      assert.ok(steps.some((s) => s.lines.some((l) => l.text.includes("召喚"))), tag);
      assert.ok(steps.some((s) => s.level === "key" && (s.banner ?? "").startsWith("ラウンド")), tag);
      seed += 1;
    }
  }
});

test("a watched game is the same match the seed gives (replaying its inputs rebuilds it)", async () => {
  const ctx = r1003();
  const g = createWatchGame(ctx, 777, [makeAi("greedy"), makeAi("beam")]);
  while (playWatchStep(g) !== null && g.flow.phase.kind !== "over");
  assert.equal(g.flow.phase.kind, "over");
  const { replayFlow } = await import("../src/flow.ts");
  const again = replayFlow(ctx, 777, g.flow.inputs);
  assert.equal(JSON.stringify(again.state), JSON.stringify(g.flow.state));
  assert.equal(playWatchStep(g), null, "nothing to play once it is over");
});

test("ai seat: owes nothing out of turn; a pass once the plan is done", () => {
  const ctx = r1003();
  const g = createWatchGame(ctx, 5, [makeAi("greedy"), makeAi("greedy")]);
  assert.ok(aiOwes(g.flow, 0) && aiOwes(g.flow, 1), "both mulligan at once");
  playWatchStep(g);
  assert.ok(!aiOwes(g.flow, 0) && aiOwes(g.flow, 1));
  assert.equal(decideAiMove(g.flow, 0, g.ais[0], freshMemo()), null);
});

// ------------------------------------------------------------------ routes

test("routes: /watch on the local and the online server, and the page loads its own module and styles", async () => {
  assert.equal(playTarget("/watch"), "/play/watch.html");
  assert.equal(playTarget("/watch?s=abc"), "/play/watch.html");
  assert.equal(staticTarget("/watch"), "/play/watch.html");
  assert.ok(onlineStaticAllowed("play/watch.html"));
  assert.ok(onlineStaticAllowed("play/watch.ts") && onlineStaticAllowed("play/watch-core.ts") && onlineStaticAllowed("play/watch.css"));
  const r = await serveFile("/play/watch.html", onlineStaticAllowed);
  assert.equal(r.code, 200);
  for (const css of ["table.css", "panel.css", "fx.css", "watch.css"]) assert.ok(r.body.includes(`/play/${css}`), css);
  assert.ok(r.body.includes('src="/play/watch.ts"') && !/<script>/.test(r.body));
  assert.ok((await serveFile("/play/ui.ts")).body.includes('entryTopHtml("ai"'), "the AI table's setup page links to 観戦 through the mode switch");
});
