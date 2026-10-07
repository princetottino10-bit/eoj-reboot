// 10/3: 僵尸公主 (ac13) may turn 90° after its move - its OWNER chooses, on
// either seat's turn (src/kyonshi.ts, EFFECTS-SPEC.md §6.3 裁定3) - and the
// paper rule's deck-out ending (deckOutMode "second", the r1003 default:
// EFFECTS-SPEC.md §6.1). Engine, flow, AI, runner, online room, replays, the
// prompt, the log lines, the HUD counter and the result words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { applyCardOverrides } from "../src/card-overrides.ts";
import type { CardPack } from "../src/cards.ts";
import { CONFIG_SCHEMA } from "../src/config-schema.ts";
import { EFFECT_TEXT } from "../src/effects.ts";
import { createFlow, replayFlow, submit } from "../src/flow.ts";
import type { Flow, FlowInput, FlowOptions, FlowPhase } from "../src/flow.ts";
import { parseFlowInput } from "../src/input-parse.ts";
import { kyonshiAsks, resolveKyonshiTurns } from "../src/kyonshi-choice.ts";
import { withKyonshiTurns } from "../src/kyonshi.ts";
import type { KyonshiTurn } from "../src/kyonshi.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig, RULE_PRESET_IDS } from "../src/presets.ts";
import { applyAction } from "../src/rules.ts";
import { playMainPhase } from "../src/runner.ts";
import { makeCtx, unitByUid, unitHp, unitMaxHp } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import { checkDeckOut, endTurn } from "../src/turn.ts";
import type { Action, Config, GameEvent, GameState, PlayerId } from "../src/types.ts";
import { AI_KINDS, makeAi } from "../src/ai/index.ts";
import type { AiSeat } from "../src/ai/index.ts";
import { deckOutUrgency, evaluate } from "../src/ai/eval.ts";
import { strongEvaluate } from "../src/ai/strong-eval.ts";
import { decideAiMove, freshMemo, playAiMove } from "../play/ai-seat.ts";
import { boardOf } from "../play/board-snapshot.ts";
import { nameplateHtml, turnHtml } from "../play/hud.ts";
import { quickRules } from "../play/print-sheet.ts";
import { promptHtml } from "../play/prompt-view.ts";
import { describeEvent, resultHow } from "../play/render.ts";
import { beforeOf, narrateStep } from "../play/watch-text.ts";
import { blankState, place } from "./helpers.ts";
import { bothKeep, flowOf, newApp, seatTwo, send, testRecordDir, view } from "./online-api-helpers.ts";

const AC: CardPack = loadPack(packPath("adopted-1003"));
const AD: CardPack = loadPack(packPath("adopted-0922"));
const r1003 = (over: Partial<Config> = {}, pack: CardPack = AC): Ctx => makeCtx(presetConfig("r1003", { mulligan: false, ...over }), pack);
const ONLINE_DIR = testRecordDir("kyonshi");
test.after(() => {
  if (existsSync(ONLINE_DIR)) rmSync(ONLINE_DIR, { recursive: true, force: true });
});

const setHp = (ctx: Ctx, s: GameState, uid: number, hp: number): void => {
  const u = unitByUid(s, uid)!;
  u.damage = unitMaxHp(ctx, u) - hp;
};
const turnLines = (f: Flow): string[] =>
  f.log.flatMap((l) => (l.event.t === "effect" && l.event.text.startsWith("僵尸公主が移動") ? [l.event.text] : []));
const phaseOf = (f: Flow): FlowPhase => f.phase;

type Ids = Record<string, number>;
type Scene = { opts: FlowOptions; ids: Ids; action: () => Action };

/** 僵尸公主 (seat 0, 太極, facing up) strikes 影鬼 (seat 1, HP 3) on the far corner: it moves there. */
const attackScene = (tweak: (s: GameState, ids: Ids, ctx: Ctx) => void = () => {}): Scene => {
  const ids: Ids = {};
  const opts: FlowOptions = {
    prepare: (s, ctx) => {
      s.units = [];
      ids.k = place(s, "ac13", 0, 1, 1, 0);
      ids.v = place(s, "ac03", 1, 2, 2, 0);
      s.players[0].mana = 10;
      tweak(s, ids, ctx);
    },
  };
  return { opts, ids, action: () => ({ kind: "attack", uid: ids.k, targetUid: ids.v }) };
};

/** 一目鬼 (seat 0, HP 4) sweeps 僵尸公主 (seat 1, 太極); its counter (ATK 4) destroys 一目鬼 and it steps down. */
const counterScene = (): Scene => {
  const ids: Ids = {};
  const opts: FlowOptions = {
    prepare: (s, ctx) => {
      s.units = [];
      ids.atk = place(s, "ac09", 0, 1, 0, 0);
      ids.k = place(s, "ac13", 1, 1, 1, 0);
      setHp(ctx, s, ids.atk, 4);
      s.players[0].mana = 10;
    },
  };
  return { opts, ids, action: () => ({ kind: "attack", uid: ids.atk, targetUid: null }) };
};

const flowOf2 = (ctx: Ctx, sc: Scene): Flow => {
  const f = createFlow(ctx, 11, sc.opts);
  assert.deepEqual(f.phase, { kind: "main", player: 0 });
  return f;
};

// ------------------------------------------------------------- 僵尸公主: engine

test("僵尸公主 engine: after its attack-kill move, keep / left 90° / right 90° (no 180°); no answer keeps the facing", () => {
  const ctx = r1003();
  const sc = attackScene();
  const s = createFlow(ctx, 11, sc.opts).state;
  const a = sc.action();
  const asks = kyonshiAsks(ctx, s, a, [], []);
  assert.equal(asks.length, 1);
  assert.equal(asks[0].owner, 0);
  assert.equal(asks[0].cause, "attack");
  assert.deepEqual(asks[0].to, { x: 2, y: 2 });
  assert.deepEqual(asks[0].options.map((o) => [o.turn, o.facing]), [[0, 0], [-1, 3], [1, 1]], "keep, left, right - never the back");
  const faced = (turns: KyonshiTurn[]): number => unitByUid(withKyonshiTurns(turns, () => applyAction(ctx, s, a)).result.state, sc.ids.k)!.facing;
  assert.equal(faced([1]), 1);
  assert.equal(faced([-1]), 3);
  assert.equal(faced([0]), 0);
  assert.equal(faced([2 as KyonshiTurn]), 0, "anything else (180°) keeps the facing");
  const r = applyAction(ctx, s, a);
  assert.deepEqual(unitByUid(r.state, sc.ids.k)!.pos, { x: 2, y: 2 });
  assert.equal(unitByUid(r.state, sc.ids.k)!.facing, 0, "headless default: the facing stays");
  const right = withKyonshiTurns([1], () => applyAction(ctx, s, a)).result;
  assert.ok(right.events.some((e) => e.t === "effect" && e.text === "僵尸公主が移動 → 右へ90度(右向き)" && e.from === 0 && e.to === 1));
  assert.ok(r.events.some((e) => e.t === "effect" && e.text === "僵尸公主が移動 → 向きはそのまま"));
  assert.equal(EFFECT_TEXT.ac13, "攻撃・反撃によって対象のHPを0にした場合、その位置に移動する。この時、向きを90度変えられる");
});

test("僵尸公主 engine: no move, no ask (the target survives / the 9/22 card / effects off)", () => {
  const ctx = r1003();
  const tough = attackScene((s, ids, c) => setHp(c, s, ids.v, 9));
  const s = createFlow(ctx, 11, tough.opts).state;
  assert.deepEqual(kyonshiAsks(ctx, s, tough.action(), [], []), []);
  // 9/22 僵尸公主 (ad13): moves, keeps its facing, nobody is asked
  const ad = makeCtx(presetConfig("r0923", { mulligan: false }), AD);
  const s2 = blankState(ad, 10);
  const k = place(s2, "ad13", 0, 1, 1, 0);
  const v = place(s2, "ad03", 1, 2, 2, 0);
  const a: Action = { kind: "attack", uid: k, targetUid: v };
  assert.deepEqual(kyonshiAsks(ad, s2, a, [], []), []);
  assert.equal(unitByUid(withKyonshiTurns([1], () => applyAction(ad, s2, a)).result.state, k)!.facing, 0);
  const off = r1003({ effects: false });
  assert.deepEqual(kyonshiAsks(off, createFlow(off, 11, attackScene().opts).state, attackScene().action(), [], []), []);
});

// ---------------------------------------------------------------- flow

test("僵尸公主 flow: its own attack - the owner (turn player) chooses before anything resolves; replays exactly", () => {
  const ctx = r1003();
  const sc = attackScene();
  const f = flowOf2(ctx, sc);
  const before = JSON.stringify(f.state);
  assert.ok(submit(f, 0, { type: "action", action: sc.action() }).ok);
  const ph = phaseOf(f);
  assert.ok(ph.kind === "kyonshi" && ph.player === 0 && ph.actor === 0);
  assert.equal(JSON.stringify(f.state), before, "nothing resolved yet");
  const wrong = submit(f, 1, { type: "kyonshi", turn: 1 });
  assert.ok(!wrong.ok && wrong.code === "forbidden");
  const bad = submit(f, 0, { type: "kyonshi", turn: 2 as KyonshiTurn });
  assert.ok(!bad.ok && bad.code === "illegal");
  const cfg = submit(f, 0, { type: "config", patch: { baseIncome: 5 } });
  assert.ok(!cfg.ok && cfg.code === "phase");
  assert.ok(submit(f, 0, { type: "kyonshi", turn: -1 }).ok);
  assert.deepEqual(f.phase, { kind: "main", player: 0 });
  assert.equal(unitByUid(f.state, sc.ids.v), undefined);
  assert.deepEqual(unitByUid(f.state, sc.ids.k)!.pos, { x: 2, y: 2 });
  assert.equal(unitByUid(f.state, sc.ids.k)!.facing, 3);
  assert.deepEqual(turnLines(f), ["僵尸公主が移動 → 左へ90度(左向き)"]);
  const again = replayFlow(ctx, 11, f.inputs, attackScene().opts);
  assert.deepEqual(again.state, f.state);
  assert.deepEqual(again.log, f.log);
  // no move: no prompt
  const tough = attackScene((s, ids, c) => setHp(c, s, ids.v, 9));
  const g = flowOf2(ctx, tough);
  assert.ok(submit(g, 0, { type: "action", action: tough.action() }).ok);
  assert.deepEqual(g.phase, { kind: "main", player: 0 });
  // the parser keeps the input, and only 0 / -1 / 1
  assert.deepEqual(parseFlowInput({ type: "kyonshi", turn: -1, x: 1 }, { changes: false }), { ok: true, value: { type: "kyonshi", turn: -1 } });
  assert.equal(parseFlowInput({ type: "kyonshi", turn: 2 }, { changes: false })?.ok, false);
});

test("僵尸公主 flow: its counter on the other seat's turn - the OWNER (not the turn player) chooses", () => {
  const ctx = r1003();
  const sc = counterScene();
  const f = flowOf2(ctx, sc);
  assert.ok(submit(f, 0, { type: "action", action: sc.action() }).ok);
  const ph = phaseOf(f);
  assert.ok(ph.kind === "kyonshi" && ph.player === 1 && ph.actor === 0);
  assert.equal(ph.ask.cause, "counter");
  assert.deepEqual(ph.ask.to, { x: 1, y: 0 });
  assert.ok(unitByUid(f.state, sc.ids.atk) !== undefined, "still unresolved");
  const wrong = submit(f, 0, { type: "kyonshi", turn: 0 });
  assert.ok(!wrong.ok && wrong.code === "forbidden");
  assert.equal(submit(f, 0, { type: "action", action: { kind: "pass" } }).ok, false);
  assert.ok(submit(f, 1, { type: "kyonshi", turn: 1 }).ok);
  assert.deepEqual(f.phase, { kind: "main", player: 0 });
  assert.equal(unitByUid(f.state, sc.ids.atk), undefined);
  assert.deepEqual(unitByUid(f.state, sc.ids.k)!.pos, { x: 1, y: 0 });
  assert.equal(unitByUid(f.state, sc.ids.k)!.facing, 1);
  assert.deepEqual(turnLines(f), ["僵尸公主が移動 → 右へ90度(右向き)"]);
  const again = replayFlow(ctx, 11, f.inputs, counterScene().opts);
  assert.deepEqual(again.state, f.state);
});

test("僵尸公主 flow: an attack that destroys an enemy 灯籠の精 asks its owner first, then the facing", () => {
  const ctx = r1003();
  const ids: Ids = {};
  const opts: FlowOptions = {
    prepare: (s, c) => {
      s.units = [];
      ids.k = place(s, "ac13", 0, 1, 1, 0);
      ids.toro = place(s, "ac01", 1, 2, 2, 0);
      ids.a1 = place(s, "ac14", 1, 2, 0, 2);
      ids.a2 = place(s, "ac03", 1, 0, 2, 2);
      setHp(c, s, ids.toro, 4);
      setHp(c, s, ids.a1, 3);
      setHp(c, s, ids.a2, 1);
      s.players[0].mana = 10;
    },
  };
  const f = createFlow(ctx, 11, opts);
  const a: Action = { kind: "attack", uid: ids.k, targetUid: ids.toro };
  assert.ok(submit(f, 0, { type: "action", action: a }).ok);
  const lp = phaseOf(f);
  assert.ok(lp.kind === "lantern" && lp.player === 1);
  assert.ok(submit(f, 1, { type: "lantern", uid: ids.a2 }).ok);
  const kp = phaseOf(f);
  assert.ok(kp.kind === "kyonshi" && kp.player === 0 && kp.picks.length === 1);
  assert.ok(submit(f, 0, { type: "kyonshi", turn: 1 }).ok);
  assert.deepEqual(f.phase, { kind: "main", player: 0 });
  assert.equal(unitByUid(f.state, ids.k)!.facing, 1);
  assert.equal(unitHp(ctx, unitByUid(f.state, ids.a2)!), 3, "the light went to 影鬼 (+2)");
  const again = replayFlow(ctx, 11, f.inputs, opts);
  assert.deepEqual(again.state, f.state);
});

// ------------------------------------------------------------------ AI

test("僵尸公主 AI: every kind answers (never stalls); strong turns toward a target it can finish next turn", () => {
  const ctx = r1003();
  for (const kind of AI_KINDS) {
    const sc = counterScene();
    const f = flowOf2(ctx, sc);
    submit(f, 0, { type: "action", action: sc.action() });
    const ai = makeAi(kind, "territorial", { seed: 3 });
    const move = decideAiMove(f, 1, ai, freshMemo());
    assert.ok(move !== null && move.kind === "input" && move.input.type === "kyonshi", kind);
    assert.equal(decideAiMove(f, 0, ai, freshMemo()), null, `${kind}: the attacker owes nothing`);
    assert.ok(playAiMove(f, 1, move, freshMemo()).ok, kind);
    assert.deepEqual(f.phase, { kind: "main", player: 0 });
  }
  // the 10/3 range (all four diagonals) looks the same every way: a front-only
  // range shows the choice. 僵尸公主 kills on (1,2) and stands facing off the
  // board; turning right faces 影鬼 on (2,2) (HP 3 < ATK 4).
  const edited = makeCtx(ctx.cfg, applyCardOverrides(AC, { ac13: { attackRange: [{ x: 0, y: 1 }] } }));
  const s = blankState(edited, 10);
  const k = place(s, "ac13", 0, 1, 1, 0);
  const v = place(s, "ac03", 1, 1, 2, 0);
  place(s, "ac03", 1, 2, 2, 0);
  const a: Action = { kind: "attack", uid: k, targetUid: v };
  const ask = kyonshiAsks(edited, s, a, [], [])[0];
  assert.deepEqual(ask.options.map((o) => o.targets.length), [0, 0, 1], "only right covers an enemy");
  const strong = makeAi("strong", "territorial", { seed: 1 });
  assert.equal(strong.kyonshi?.(edited, s, a, [], [], ask), 1);
  for (const kind of AI_KINDS) {
    const t = resolveKyonshiTurns(edited, s, a, [], () => makeAi(kind).kyonshi!);
    assert.equal(t.length, 1, kind);
    assert.ok([0, 1, -1].includes(t[0]), kind);
  }
});

test("僵尸公主 runner: the owner's chooser is asked on the other seat's turn, and the plan is made again", () => {
  const ctx = r1003();
  const sc = counterScene();
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
    kyonshi: (_c, _s, _a, _p, _t, ask) => {
      asked = ask.owner;
      return -1;
    },
  };
  playMainPhase(ctx, s, [attacker, owner], []);
  assert.equal(asked, 1);
  assert.equal(unitByUid(s, sc.ids.k)!.facing, 3);
  assert.equal(plans, 2);
});

// --------------------------------------------------------------- online

test("僵尸公主 online: the owner gets the facing prompt, the attacker waits; only the owner's answer is taken", () => {
  const sc = counterScene();
  const app = newApp(ONLINE_DIR, { flowOptions: sc.opts });
  const s = seatTwo(app, { rule: "r1003", pack: "adopted-1003" });
  bothKeep(s);
  assert.equal(send(s, s.tokens[0], { type: "action", action: sc.action() }).status, 200);
  const own = view(s, s.tokens[1]).game;
  const atk = view(s, s.tokens[0]).game;
  assert.ok(own !== null && atk !== null);
  assert.equal(own.phase.kind, "kyonshi");
  if (own.phase.kind === "kyonshi") {
    assert.equal(own.phase.player, 1);
    assert.equal(own.phase.actorUid, sc.ids.atk);
    assert.deepEqual(own.phase.ask.options.map((o) => o.turn), [0, -1, 1]);
  }
  assert.equal(JSON.stringify(atk.phase).includes("handIndex"), false);
  assert.notEqual(send(s, s.tokens[0], { type: "kyonshi", turn: 1 }).status, 200);
  assert.equal(send(s, s.tokens[1], { type: "kyonshi", turn: 1 }).status, 200);
  const after = view(s, s.tokens[0]);
  assert.equal(after.game?.phase.kind, "main");
  assert.ok(after.log.some((l) => l.event.t === "effect" && l.event.text === "僵尸公主が移動 → 右へ90度(右向き)"));
  const f = flowOf(s);
  assert.deepEqual(replayFlow(f.ctx, f.seed, f.inputs, counterScene().opts).state, f.state);
});

// ------------------------------------------------------------------- UI

test("僵尸公主 UI: the prompt says where it moves and offers the three facings; log lines name the seat", () => {
  const ctx = r1003();
  const sc = counterScene();
  const f = flowOf2(ctx, sc);
  submit(f, 0, { type: "action", action: sc.action() });
  const ph = phaseOf(f);
  assert.ok(ph.kind === "kyonshi");
  const html = promptHtml({
    ctx,
    board: boardOf(f.state),
    names: ["先", "後"],
    viewer: 1,
    hand: [],
    prompt: { kind: "kyonshi", ask: ph.ask, actorUid: sc.ids.atk },
    sel: { kind: "none" },
    marked: 0,
    tansuIndex: 0,
    endConfirm: false,
    flash: "",
  });
  assert.match(html, /僵尸公主の向き/);
  assert.match(html, /反撃で一目鬼を撃破し/);
  for (const t of [0, -1, 1]) assert.match(html, new RegExp(`data-act="kyonshi"[^>]*data-turn="${t}"`));
  assert.match(html, /向きはそのまま/);
  assert.match(html, /左へ90度/);
  assert.match(html, /右へ90度/);
  assert.match(html, /180度/);
  const ev: GameEvent = { t: "effect", player: 1, source: "ac13", uid: sc.ids.k, text: "僵尸公主が移動 → 右へ90度(右向き)" };
  assert.equal(describeEvent(ctx, ["あなた", "AI"], ev)?.text, "★ AI: 僵尸公主が移動 → 右へ90度(右向き)");
  const n = narrateStep(ctx, beforeOf(ctx, f.state), f.state, 0, [] as FlowInput[], [ev]);
  assert.deepEqual(n.lines.map((l) => l.text), ["後手: 僵尸公主が移動 → 右へ90度(右向き)"]);
});

// ----------------------------------------------------------- deck-out end

const deckOutState = (ctx: Ctx, own: string[], opp: string[]): GameState => {
  const s = blankState(ctx, 5);
  own.forEach((id, i) => place(s, id, 0, i, 0, 0));
  opp.forEach((id, i) => place(s, id, 1, i, 2, 2));
  return s;
};

test("deck-out: r1003 ends at the second 山札切れ once the refill is done; more 占拠 (HP 11+ counts 2) wins", () => {
  const ctx = r1003();
  // 僵尸公主 HP 11 counts 2 (on its cell's attribute it stays >= 11), 影鬼 1 -> 3 vs 2
  const s = deckOutState(ctx, ["ac13", "ac03"], ["ac03", "ac02"]);
  assert.equal(unitHp(ctx, s.units[0]) >= 11, true);
  const p0 = s.players[0];
  p0.reshuffleCount = 1;
  p0.deck = [];
  p0.grave = ["ac04", "ac05", "ac06", "ac07", "ac08", "ac10"];
  p0.hand = [];
  const ev: GameEvent[] = [];
  endTurn(ctx, s, ev, () => []);
  assert.equal(s.ended, true);
  assert.equal(s.winType, "deck_out");
  assert.equal(s.winner, 0);
  assert.equal(p0.hand.length, 5, "the refill finished before the end");
  const kinds = ev.map((e) => e.t);
  assert.ok(kinds.indexOf("reshuffle") < kinds.indexOf("turnEnd") && kinds.indexOf("turnEnd") < kinds.indexOf("gameEnd"));
  const end = ev.find((e) => e.t === "gameEnd");
  assert.ok(end !== undefined && end.t === "gameEnd");
  assert.deepEqual(end.occ, [3, 2]);
  assert.equal(end.by, 0);
  const names: [string, string] = ["先手", "後手"];
  assert.equal(resultHow("deck_out", 0, names, [3, 2]), "2回目の山札切れ — 占拠 3 対 2 で先手の勝ち");
  assert.equal(resultHow("deck_out", 1, names, [3, 4]), "2回目の山札切れ — 占拠 4 対 3 で後手の勝ち");
  assert.equal(describeEvent(ctx, names, end)?.text, "◆ 決着 (第1ラウンド): 先手の勝ち(2回目の山札切れ・占拠 3 対 2)");
  const turn = turnHtml(ctx, boardOf(s), names, { phaseText: "" });
  assert.match(turn, /2回目の山札切れ — 占拠 3 対 2 で先手の勝ち/);
  assert.doesNotMatch(turn, /先手の勝ち・/);
});

test("deck-out: a level 占拠 is a draw; a hidden unit (マヨヒガ) counts 0; one reshuffle is not the end", () => {
  const ctx = r1003();
  const s = deckOutState(ctx, ["ac03", "ac02"], ["ac13"]);
  s.players[1].reshuffleCount = 2;
  const ev: GameEvent[] = [];
  assert.equal(checkDeckOut(ctx, s, ev), true);
  assert.equal(s.winner, null, "2 vs 2 (僵尸公主 counts 2)");
  assert.equal(resultHow("deck_out", null, ["先手", "後手"], [2, 2]), "2回目の山札切れ — 占拠 2 対 2 で引き分け");
  const hid = deckOutState(ctx, ["ac03"], ["ac13"]);
  hid.units[1].hiddenBy = 0;
  hid.players[0].reshuffleCount = 2;
  checkDeckOut(ctx, hid, []);
  assert.equal(hid.winner, 0, "1 vs 0");
  const once = deckOutState(ctx, ["ac03"], []);
  once.players[0].reshuffleCount = 1;
  assert.equal(checkDeckOut(ctx, once, []), false);
});

test("deck-out: the r1003 default only; the other presets keep none; the settings and the 早見表 say it in Japanese", () => {
  assert.equal(presetConfig("r1003").deckOutMode, "second");
  for (const id of RULE_PRESET_IDS) if (id !== "r1003" && id !== "r1006" && id !== "r1007") assert.equal(presetConfig(id).deckOutMode, "none", id);
  const field = CONFIG_SCHEMA.find((f) => f.key === "deckOutMode");
  assert.ok(field !== undefined && field.kind === "choice");
  assert.equal(field.label, "山札切れでの終了");
  assert.match(field.desc, /2回目の山札切れ.*その補充が終わったところでゲーム終了.*占拠.*多い方の勝ち.*引き分け/);
  assert.deepEqual(field.choices?.map((c) => c.label), ["なし", "2回目の山札切れで終了"]);
  const win = quickRules(presetConfig("r1003"), 23).find((r) => r.label === "勝ち");
  assert.match(win?.text ?? "", /2回目の山札切れ/);
  assert.doesNotMatch(quickRules(presetConfig("r0923"), 22).find((r) => r.label === "勝ち")?.text ?? "", /山札切れ/);
});

test("deck-out HUD: each nameplate shows 「山札切れ n/2」 under the rule, nothing without it", () => {
  const ctx = r1003();
  const s = deckOutState(ctx, ["ac03"], ["ac03"]);
  s.players[1].reshuffleCount = 1;
  const b = boardOf(s);
  const p0 = nameplateHtml(ctx, b, 0, ["先", "後"], true);
  const p1 = nameplateHtml(ctx, b, 1, ["先", "後"], false);
  assert.match(p0, /data-stat="deckout"[^>]*>.*<i>山札切れ<\/i><b>0<\/b><small>\/2<\/small>/s);
  assert.match(p1, /np-deckout is-late/);
  assert.match(p1, /<i>山札切れ<\/i><b>1<\/b><small>\/2<\/small>/);
  const none = makeCtx(presetConfig("r0923"), AD);
  assert.doesNotMatch(nameplateHtml(none, b, 0, ["先", "後"], true), /山札切れ/);
});

test("deck-out AI: the end draws near as a reshuffled deck runs down, and both evals then weigh the 占拠 lead more", () => {
  const ctx = r1003();
  const s = deckOutState(ctx, ["ac03", "ac02"], ["ac03"]);
  assert.equal(deckOutUrgency(ctx, s), 0, "nobody has reshuffled");
  s.players[1].reshuffleCount = 1;
  s.players[1].deck = ["ac04", "ac05", "ac06", "ac07", "ac08", "ac10", "ac11", "ac12", "ac14", "ac15"];
  assert.equal(deckOutUrgency(ctx, s), 0, "a full deck is still far");
  const calm = { greedy: evaluate(ctx, s, 0), strong: strongEvaluate(ctx, s, 0) };
  s.players[1].deck = [];
  assert.equal(deckOutUrgency(ctx, s), 1);
  assert.ok(evaluate(ctx, s, 0) > calm.greedy + 100, "greedy / beam: ahead 2 vs 1 at the end");
  assert.ok(strongEvaluate(ctx, s, 0) > calm.strong + 100, "strong too");
  assert.ok(evaluate(ctx, s, 1) < -100, "and the side behind sees it");
  assert.equal(deckOutUrgency(makeCtx(presetConfig("r0923"), AD), s), 0, "the rule off: no pressure");
});
