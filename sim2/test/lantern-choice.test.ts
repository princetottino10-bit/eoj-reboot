// 灯籠の精 (tm01 / ad01): the owner chooses the ally its light goes to
// (decided by the team 2026-10-03; EFFECTS-SPEC.md §5.3 裁定1). Engine picks,
// the flow's lantern phase (the owner answers, often on the other seat's turn),
// combos (area attacks, counters, reigu, two lanterns at once), the AIs, the
// headless runner, the online room, replays, the prompt and the log lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import type { CardPack } from "../src/cards.ts";
import { createFlow, replayFlow, submit } from "../src/flow.ts";
import type { Flow, FlowOptions, FlowPhase } from "../src/flow.ts";
import { parseFlowInput } from "../src/input-parse.ts";
import { lanternAsks, resolveLanternPicks } from "../src/lantern-choice.ts";
import { defaultLanternPick, withLanternPicks } from "../src/lantern.ts";
import type { LanternAsk } from "../src/lantern.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig } from "../src/presets.ts";
import { applyAction } from "../src/rules.ts";
import { playMainPhase } from "../src/runner.ts";
import { makeCtx, unitByUid, unitHp, unitMaxHp } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import type { Action, Config, GameState, PlayerId } from "../src/types.ts";
import { AI_KINDS, makeAi } from "../src/ai/index.ts";
import type { AiSeat } from "../src/ai/index.ts";
import { bestLanternPick } from "../src/ai/lantern.ts";
import { decideAiMove, freshMemo, playAiMove } from "../play/ai-seat.ts";
import { promptHtml } from "../play/prompt-view.ts";
import { describeEvent } from "../play/render.ts";
import { lanternPrediction } from "../play/table.ts";
import { beforeOf, narrateStep } from "../play/watch-text.ts";
import { blankState, place } from "./helpers.ts";
import { bothKeep, flowOf, newApp, seatTwo, send, testRecordDir, view } from "./online-api-helpers.ts";

const AD: CardPack = loadPack(packPath("adopted-0922"));
const r0923 = (over: Partial<Config> = {}): Ctx => makeCtx(presetConfig("r0923", { mulligan: false, ...over }), AD);
const ONLINE_DIR = testRecordDir("lantern");
test.after(() => {
  if (existsSync(ONLINE_DIR)) rmSync(ONLINE_DIR, { recursive: true, force: true });
});

const hpOf = (ctx: Ctx, s: GameState, uid: number): number => {
  const u = unitByUid(s, uid);
  return u === undefined ? 0 : unitHp(ctx, u);
};
const setHp = (ctx: Ctx, s: GameState, uid: number, hp: number): void => {
  const u = unitByUid(s, uid)!;
  u.damage = unitMaxHp(ctx, u) - hp;
};
const lanternLines = (f: Flow): string[] =>
  f.log.flatMap((l) => (l.event.t === "effect" && l.event.text.includes("の灯 →") ? [l.event.text] : []));
/** Reads the phase afresh (an earlier assertion must not narrow it). */
const phaseOf = (f: Flow): FlowPhase => f.phase;

// ------------------------------------------------------------------ scenes

type Ids = Record<string, number>;
type Scene = { opts: FlowOptions; ids: Ids; action: () => Action };

/**
 * 茨木童子 (seat 0) strikes seat 1's 灯籠の精 (HP 4, ATK 5 kills it). Seat 1
 * keeps 両面 (3 damage: gains the full +2) and 影鬼 one below the board's HP
 * limit cfg.maxHp (no per-unit max: it was healed past its printed HP 3, and
 * gains only +1 more): two candidates.
 */
const strikeScene = (tweak: (s: GameState, ids: Ids, ctx: Ctx) => void = () => {}): Scene => {
  const ids: Ids = {};
  const opts: FlowOptions = {
    prepare: (s, ctx) => {
      s.units = [];
      ids.ib = place(s, "ad15", 0, 0, 0, 0);
      ids.toro = place(s, "ad01", 1, 0, 2, 2);
      ids.ryomen = place(s, "ad14", 1, 2, 2, 2);
      ids.cheap = place(s, "ad03", 1, 2, 0, 0);
      unitByUid(s, ids.ryomen)!.damage = 3;
      setHp(ctx, s, ids.cheap, ctx.cfg.maxHp - 1);
      s.players[0].mana = 10;
      tweak(s, ids, ctx);
    },
  };
  return { opts, ids, action: () => ({ kind: "attack", uid: ids.ib, targetUid: ids.toro }) };
};

const flowOf2 = (ctx: Ctx, sc: Scene): Flow => {
  const f = createFlow(ctx, 11, sc.opts);
  assert.deepEqual(f.phase, { kind: "main", player: 0 });
  return f;
};

// ------------------------------------------------------------------ engine

test("engine: the owner's pick is healed (up to the board's HP limit); an ally at the limit may be picked and gains 0; no pick = the default", () => {
  const ctx = r0923();
  const sc = strikeScene();
  const s = createFlow(ctx, 11, sc.opts).state;
  const { ids } = sc;
  const a = sc.action();
  const asks = lanternAsks(ctx, s, a, []);
  assert.equal(asks.length, 1);
  assert.equal(asks[0].owner, 1);
  assert.equal(asks[0].amount, 2);
  assert.deepEqual(asks[0].options.map((o) => [o.uid, o.gain]), [[ids.ryomen, 2], [ids.cheap, 1]]);
  // 両面 +2, 影鬼 +1 only (stops at cfg.maxHp)
  const toRyomen = withLanternPicks([ids.ryomen], () => applyAction(ctx, s, a)).result.state;
  assert.equal(hpOf(ctx, toRyomen, ids.ryomen), hpOf(ctx, s, ids.ryomen) + 2);
  assert.equal(hpOf(ctx, toRyomen, ids.cheap), hpOf(ctx, s, ids.cheap));
  const toCheap = withLanternPicks([ids.cheap], () => applyAction(ctx, s, a));
  assert.equal(hpOf(ctx, toCheap.result.state, ids.cheap), ctx.cfg.maxHp);
  assert.ok(toCheap.result.events.some((e) => e.t === "effect" && e.text === "灯籠の精の灯 → 影鬼 HP+1"));
  // a pick already at the board's HP limit is allowed and heals nothing
  const full = createFlow(ctx, 11, strikeScene((st, i, c) => setHp(c, st, i.ryomen, c.cfg.maxHp)).opts).state;
  const toFull = withLanternPicks([ids.ryomen], () => applyAction(ctx, full, a)).result;
  assert.equal(hpOf(ctx, toFull.state, ids.ryomen), ctx.cfg.maxHp);
  assert.ok(toFull.events.some((e) => e.t === "effect" && e.text === "灯籠の精の灯 → 両面 HP+0"));
  // no answer (headless): the most HP gained
  assert.equal(defaultLanternPick(ctx, s, asks[0]), ids.ryomen);
  assert.equal(hpOf(ctx, applyAction(ctx, s, a).state, ids.ryomen), hpOf(ctx, s, ids.ryomen) + 2);
  // an id that is not a candidate is ignored (the default instead)
  const stray = withLanternPicks([ids.ib], () => applyAction(ctx, s, a)).result.state;
  assert.equal(hpOf(ctx, stray, ids.ryomen), hpOf(ctx, s, ids.ryomen) + 2);
});

test("engine: one candidate is healed without asking; a hidden ally (マヨヒガ) is no candidate; none = nothing", () => {
  const ctx = r0923();
  const sc = strikeScene((s, ids) => (unitByUid(s, ids.cheap)!.hiddenBy = 1));
  const s = createFlow(ctx, 11, sc.opts).state;
  const a = sc.action();
  assert.deepEqual(lanternAsks(ctx, s, a, []), []);
  const r = applyAction(ctx, s, a);
  assert.equal(hpOf(ctx, r.state, sc.ids.ryomen), hpOf(ctx, s, sc.ids.ryomen) + 2);
  assert.equal(hpOf(ctx, r.state, sc.ids.cheap), hpOf(ctx, s, sc.ids.cheap));
  // alone on the board: no heal, no line
  const alone = strikeScene((st, ids) => (st.units = st.units.filter((u) => u.uid === ids.ib || u.uid === ids.toro)));
  const s2 = createFlow(ctx, 11, alone.opts).state;
  const r2 = applyAction(ctx, s2, alone.action());
  assert.ok(!r2.events.some((e) => e.t === "effect" && e.source === "ad01"));
  // effects off: no lantern at all
  const off = r0923({ effects: false });
  assert.deepEqual(lanternAsks(off, createFlow(off, 11, strikeScene().opts).state, a, []), []);
});

test("engine: an area attack that destroys two lanterns and an ally asks twice, in resolution order; same-resolution deaths are no candidates", () => {
  const ctx = r0923();
  const s = blankState(ctx, 10);
  const shuten = place(s, "ad16", 0, 1, 1, 0); // area: (0,2) (1,2) (0,1)
  const t1 = place(s, "ad01", 1, 0, 2, 2);
  const t2 = place(s, "ad01", 1, 1, 2, 2);
  const dying = place(s, "ad03", 1, 0, 1, 0);
  const keepA = place(s, "ad14", 1, 2, 2, 2);
  const keepB = place(s, "ad04", 1, 2, 0, 0);
  for (const u of [t1, t2, dying]) setHp(ctx, s, u, 1);
  unitByUid(s, keepA)!.damage = 4;
  setHp(ctx, s, keepB, ctx.cfg.maxHp - 2); // two below the board's HP limit
  const a: Action = { kind: "attack", uid: shuten, targetUid: null };
  const asks = lanternAsks(ctx, s, a, []);
  assert.deepEqual(asks.map((k) => k.lanternUid), [t1, t2], "board order");
  for (const k of asks) assert.deepEqual(k.options.map((o) => o.uid), [keepA, keepB], "the other lantern and 影鬼 die in the same sweep");
  // both lights to the same ally, or one each
  const same = withLanternPicks([keepB, keepB], () => applyAction(ctx, s, a)).result.state;
  assert.equal(hpOf(ctx, same, keepB), ctx.cfg.maxHp, "+2 then +0 (at cfg.maxHp)");
  assert.equal(unitByUid(same, keepA)!.damage, 4);
  const split = withLanternPicks([keepA, keepB], () => applyAction(ctx, s, a)).result.state;
  assert.equal(unitByUid(split, keepA)!.damage, 2);
  assert.equal(hpOf(ctx, split, keepB), ctx.cfg.maxHp);
  // the chooser loop asks once per lantern
  const seen: LanternAsk[] = [];
  const picks = resolveLanternPicks(ctx, s, a, () => (_c, _s, _a, _p, ask) => {
    seen.push(ask);
    return ask.options[1].uid;
  });
  assert.deepEqual(picks, [keepB, keepB]);
  assert.equal(seen.length, 2);
});

test("engine: a reigu that destroys a lantern asks its owner too", () => {
  const ctx = r0923();
  const s = blankState(ctx, 10);
  const user = place(s, "ad04", 0, 1, 0, 0);
  const toro = place(s, "ad01", 1, 1, 1, 2);
  setHp(ctx, s, toro, 3);
  const a1 = place(s, "ad14", 1, 0, 2, 2);
  const a2 = place(s, "ad03", 1, 2, 2, 2);
  unitByUid(s, a1)!.damage = 2;
  unitByUid(s, a2)!.damage = 1;
  s.players[0].hand = ["ad21"];
  const a: Action = { kind: "reigu", handIndex: 0, targetUid: user, facing: null, mode: "ken" };
  const asks = lanternAsks(ctx, s, a, []);
  assert.equal(asks.length, 1);
  assert.deepEqual(asks[0].options.map((o) => o.uid), [a1, a2]);
  const r = withLanternPicks([a2], () => applyAction(ctx, s, a)).result.state;
  assert.equal(unitByUid(r, toro), undefined);
  assert.equal(hpOf(ctx, r, a2), hpOf(ctx, s, a2) + 2, "+2, past its printed HP (no per-unit max)");
});

// -------------------------------------------------------------------- flow

test("flow: the lantern's OWNER (not the seat on turn) answers; the action waits for it and replays exactly", () => {
  const ctx = r0923();
  const sc = strikeScene();
  const f = flowOf2(ctx, sc);
  const before = JSON.stringify(f.state);
  assert.ok(submit(f, 0, { type: "action", action: sc.action() }).ok);
  const ph = phaseOf(f);
  assert.ok(ph.kind === "lantern");
  assert.equal(ph.player, 1);
  assert.equal(ph.actor, 0);
  assert.deepEqual(ph.ask.options.map((o) => o.uid), [sc.ids.ryomen, sc.ids.cheap]);
  assert.equal(JSON.stringify(f.state), before, "nothing resolved yet");
  // the attacker cannot answer, nor act; a non-candidate is refused; rules wait
  const wrongSeat = submit(f, 0, { type: "lantern", uid: sc.ids.ryomen });
  assert.ok(!wrongSeat.ok && wrongSeat.code === "forbidden");
  assert.equal(submit(f, 0, { type: "action", action: { kind: "pass" } }).ok, false);
  const bad = submit(f, 1, { type: "lantern", uid: sc.ids.ib });
  assert.ok(!bad.ok && bad.code === "illegal");
  const cfg = submit(f, 1, { type: "config", patch: { baseIncome: 5 } });
  assert.ok(!cfg.ok && cfg.code === "phase");
  assert.ok(submit(f, 1, { type: "lantern", uid: sc.ids.cheap }).ok);
  assert.deepEqual(f.phase, { kind: "main", player: 0 });
  assert.equal(unitByUid(f.state, sc.ids.toro), undefined);
  assert.equal(hpOf(ctx, f.state, sc.ids.cheap), ctx.cfg.maxHp);
  assert.equal(unitByUid(f.state, sc.ids.ryomen)!.damage, 3);
  assert.deepEqual(lanternLines(f), ["灯籠の精の灯 → 影鬼 HP+1"]);
  assert.deepEqual(f.inputs.slice(-2), [
    { seat: 0, input: { type: "action", action: sc.action() } },
    { seat: 1, input: { type: "lantern", uid: sc.ids.cheap } },
  ]);
  const again = replayFlow(ctx, 11, f.inputs, strikeScene().opts);
  assert.deepEqual(again.state, f.state);
  assert.deepEqual(again.log, f.log);
  // the other pick replays to the other board
  const other = flowOf2(ctx, strikeScene());
  submit(other, 0, { type: "action", action: sc.action() });
  submit(other, 1, { type: "lantern", uid: sc.ids.ryomen });
  assert.equal(unitByUid(other.state, sc.ids.ryomen)!.damage, 1);
  // a resign is still taken while the choice is open
  const quit = flowOf2(ctx, strikeScene());
  submit(quit, 0, { type: "action", action: sc.action() });
  assert.ok(submit(quit, 0, { type: "resign" }).ok);
  assert.equal(quit.phase.kind, "over");
});

test("flow: with one candidate nobody is asked; the stored input parser keeps the lantern input", () => {
  const ctx = r0923();
  const sc = strikeScene((s, ids) => (s.units = s.units.filter((u) => u.uid !== ids.cheap)));
  const f = flowOf2(ctx, sc);
  assert.ok(submit(f, 0, { type: "action", action: sc.action() }).ok);
  assert.deepEqual(f.phase, { kind: "main", player: 0 });
  assert.deepEqual(lanternLines(f), ["灯籠の精の灯 → 両面 HP+2"]);
  const parsed = parseFlowInput({ type: "lantern", uid: 7, extra: 1 }, { changes: false });
  assert.deepEqual(parsed, { ok: true, value: { type: "lantern", uid: 7 } });
  assert.equal(parseFlowInput({ type: "lantern", uid: -1 }, { changes: false })?.ok, false);
});

test("flow: counter order first, then the lantern choice, both by the countering seat; nothing resolves (kills, moves, win checks) before both are in", () => {
  const ctx = r0923();
  const ids: Ids = {};
  const opts: FlowOptions = {
    prepare: (s, c) => {
      s.units = [];
      ids.atk = place(s, "ad09", 0, 1, 0, 0); // area (1,1) (0,0) (2,0)
      ids.kyonshi = place(s, "ad13", 1, 1, 1, 0);
      ids.ryomen = place(s, "ad14", 1, 2, 0, 3);
      ids.toro = place(s, "ad01", 1, 0, 0, 0);
      unitByUid(s, ids.atk)!.damage = 5; // HP 4: the counters destroy it
      setHp(c, s, ids.toro, 2);
      s.players[0].mana = 10;
    },
  };
  const f = createFlow(ctx, 11, opts);
  const attack: Action = { kind: "attack", uid: ids.atk, targetUid: null };
  assert.ok(submit(f, 0, { type: "action", action: attack }).ok);
  assert.equal(phaseOf(f).kind, "counterOrder");
  assert.ok(submit(f, 1, { type: "counterOrder", order: [ids.ryomen, ids.kyonshi] }).ok);
  const ph = phaseOf(f);
  assert.ok(ph.kind === "lantern" && ph.player === 1 && ph.actor === 0);
  assert.deepEqual(new Set(ph.ask.options.map((o) => o.uid)), new Set([ids.kyonshi, ids.ryomen]));
  assert.ok(unitByUid(f.state, ids.atk) !== undefined, "still unresolved");
  assert.ok(submit(f, 1, { type: "lantern", uid: ids.kyonshi }).ok);
  assert.deepEqual(f.phase, { kind: "main", player: 0 });
  assert.equal(unitByUid(f.state, ids.atk), undefined);
  assert.deepEqual(unitByUid(f.state, ids.kyonshi)!.pos, { x: 1, y: 0 }, "僵尸公主 landed the kill and moved");
  const again = replayFlow(ctx, 11, f.inputs, opts);
  assert.deepEqual(again.state, f.state);
});

// ---------------------------------------------------------------------- AI

test("AI: every kind answers the lantern choice with a candidate (never stalls) and prefers an ally that gains HP", () => {
  const ctx = r0923();
  for (const kind of AI_KINDS) {
    // 両面 at the board's HP limit (gains 0), 影鬼 one below it (gains 1)
    const sc = strikeScene((s, ids, c) => setHp(c, s, ids.ryomen, c.cfg.maxHp));
    const f = flowOf2(ctx, sc);
    submit(f, 0, { type: "action", action: sc.action() });
    const ai = makeAi(kind, "territorial", { seed: 3 });
    const move = decideAiMove(f, 1, ai, freshMemo());
    assert.ok(move !== null && move.kind === "input" && move.input.type === "lantern", kind);
    assert.equal(move.input.type === "lantern" ? move.input.uid : -1, sc.ids.cheap, `${kind}: the ally that gains`);
    assert.equal(decideAiMove(f, 0, ai, freshMemo()), null, `${kind}: the attacker owes nothing`);
    assert.ok(playAiMove(f, 1, move, freshMemo()).ok);
    assert.deepEqual(f.phase, { kind: "main", player: 0 });
  }
  // the chooser functions directly, with two lanterns asked in a row
  const s = blankState(ctx, 10);
  place(s, "ad16", 0, 1, 1, 0);
  for (const [x, y] of [[0, 2], [1, 2]]) setHp(ctx, s, place(s, "ad01", 1, x, y, 2), 1);
  place(s, "ad14", 1, 2, 2, 2);
  place(s, "ad04", 1, 2, 0, 0);
  const a: Action = { kind: "attack", uid: 1, targetUid: null };
  for (const kind of AI_KINDS) {
    const ai = makeAi(kind);
    const picks = resolveLanternPicks(ctx, s, a, () => ai.lantern ?? bestLanternPick());
    assert.equal(picks.length, 2, kind);
  }
});

test("runner: the lantern owner's chooser is asked (the seat not on turn), and the plan is made again afterwards", () => {
  const ctx = r0923();
  const sc = strikeScene();
  const s = createFlow(ctx, 11, sc.opts).state;
  let asked: PlayerId | null = null;
  let plans = 0;
  const attacker: AiSeat = {
    name: "scripted",
    planTurn: () => {
      plans += 1;
      return plans === 1 ? [sc.action(), { kind: "pass" }] : [{ kind: "pass" }];
    },
  };
  const owner: AiSeat = {
    name: "owner",
    planTurn: () => [{ kind: "pass" }],
    lantern: (_c, _s, _a, _p, ask) => {
      asked = ask.owner;
      return sc.ids.cheap;
    },
  };
  playMainPhase(ctx, s, [attacker, owner], []);
  assert.equal(asked, 1);
  assert.equal(hpOf(ctx, s, sc.ids.cheap), ctx.cfg.maxHp);
  assert.equal(plans, 2, "planned again after the owner's choice");
});

// ------------------------------------------------------------------ online

test("online: the owner gets the lantern prompt, the attacker sees who is choosing; only the owner's answer is taken", () => {
  const sc = strikeScene();
  const app = newApp(ONLINE_DIR, { flowOptions: sc.opts });
  const s = seatTwo(app, { rule: "r0923", pack: "adopted-0922" });
  bothKeep(s);
  assert.equal(send(s, s.tokens[0], { type: "action", action: sc.action() }).status, 200);
  const own = view(s, s.tokens[1]).game;
  const atk = view(s, s.tokens[0]).game;
  assert.ok(own !== null && atk !== null);
  assert.equal(own.phase.kind, "lantern");
  assert.equal(atk.phase.kind, "lantern");
  if (own.phase.kind === "lantern") {
    assert.equal(own.phase.player, 1);
    assert.equal(own.phase.actorUid, sc.ids.ib);
    assert.deepEqual(own.phase.ask.options.map((o) => [o.uid, o.gain]), [[sc.ids.ryomen, 2], [sc.ids.cheap, 1]]);
    assert.equal(own.phase.step, 0);
  }
  assert.equal(own.legal, null);
  assert.equal(JSON.stringify(atk.phase).includes("handIndex"), false, "no action internals in the view");
  assert.notEqual(send(s, s.tokens[0], { type: "lantern", uid: sc.ids.ryomen }).status, 200);
  assert.equal(send(s, s.tokens[1], { type: "lantern", uid: sc.ids.ryomen }).status, 200);
  const after = view(s, s.tokens[0]);
  assert.equal(after.game?.phase.kind, "main");
  assert.ok(after.log.some((l) => l.event.t === "effect" && l.event.text === "灯籠の精の灯 → 両面 HP+2"));
  const f = flowOf(s);
  const again = replayFlow(f.ctx, f.seed, f.inputs, strikeScene().opts);
  assert.deepEqual(again.state, f.state);
});

// --------------------------------------------------------------------- UI

test("the prompt names the lantern, lists the allies with their gain (ones at the HP limit say +0), and the board shows +N on each", () => {
  const ctx = r0923();
  const sc = strikeScene((s, ids, c) => setHp(c, s, ids.ryomen, c.cfg.maxHp));
  const f = flowOf2(ctx, sc);
  submit(f, 0, { type: "action", action: sc.action() });
  const ph = phaseOf(f);
  assert.ok(ph.kind === "lantern");
  const board = { units: f.state.units, players: [0, 1].map(() => ({ life: 0, mana: 0, chips: 0, reach: false, handCount: 0, deckCount: 0, grave: [], reshuffleCount: 0 })) as never, turnPlayer: 0 as PlayerId, round: 1, ended: false, winner: null, winType: null, summonsThisTurn: 0 };
  const html = promptHtml({
    ctx,
    board,
    names: ["先", "後"],
    viewer: 1,
    hand: [],
    prompt: { kind: "lantern", ask: ph.ask, actorUid: sc.ids.ib, step: 0 },
    sel: { kind: "none" },
    marked: 0,
    tansuIndex: 0,
    endConfirm: false,
    flash: "",
  });
  assert.match(html, /灯籠の精の灯/);
  assert.match(html, /茨木童子の攻撃で灯籠の精が撃破されます。灯を託す味方を1体選んでください\(HP\+2/);
  assert.match(html, new RegExp(`data-act="lantern"[^>]*data-uid="${sc.ids.cheap}"|data-uid="${sc.ids.cheap}"`));
  assert.match(html, /影鬼.*<b>\+1<\/b>/);
  assert.match(html, /両面.*満タン\(\+0\)/);
  const pv = lanternPrediction(ph.ask);
  assert.deepEqual(pv.hits.map((h) => [h.uid, -h.dmg, h.heal]), [[sc.ids.ryomen, 0, true], [sc.ids.cheap, 1, true]]);
});

test("log lines: the table says whose light it was; the spectate narration reads 「先手: 灯籠の精の灯 → 僵尸公主 HP+2」", () => {
  const ctx = r0923();
  const s = blankState(ctx);
  const k = place(s, "ad13", 0, 1, 1, 0);
  const ev = { t: "effect" as const, player: 0 as PlayerId, source: "ad01", uid: k, text: "灯籠の精の灯 → 僵尸公主 HP+2" };
  const n = narrateStep(ctx, beforeOf(ctx, s), s, 1, [], [ev]);
  assert.deepEqual(n.lines.map((l) => l.text), ["先手: 灯籠の精の灯 → 僵尸公主 HP+2"]);
  assert.equal(describeEvent(ctx, ["あなた", "AI"], ev)?.text, "★ あなた: 灯籠の精の灯 → 僵尸公主 HP+2");
  // other effects keep their star line
  const other = narrateStep(ctx, beforeOf(ctx, s), s, 1, [], [{ ...ev, source: "ad13", text: "僵尸公主: 撃破した位置へ移動" }]);
  assert.deepEqual(other.lines.map((l) => l.text), ["★ 僵尸公主: 撃破した位置へ移動"]);
});
