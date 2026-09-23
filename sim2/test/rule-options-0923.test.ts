// 9/23 optional rule settings: 制圧の数え方 (controlCount), 制圧の勝ち方
// (controlWinMode "points"), 収入の決め方 (incomeMode "current", also with
// turn_start income), 撃破報酬の条件 (killRewardCondition), 劣勢ボーナス
// (underdogIncome) and 劣勢時の大型割引 (underdogDiscount). Hand-built boards
// against 採用ルール 9/22 (r0923) + adopted-0922, then seeded AI games with
// every option on. That the defaults change nothing is pinned by the rest of
// the suite running unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardOf } from "../src/cards.ts";
import type { CardPack } from "../src/cards.ts";
import { recheckControl } from "../src/combat.ts";
import { CONFIG_SCHEMA } from "../src/config-schema.ts";
import { createFlow, replayFlow } from "../src/flow.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig, RULE_PRESET_IDS } from "../src/presets.ts";
import { legalEntries } from "../src/preview.ts";
import { applyAction, incomeParts, isLegal, legalActions, summonCostFor } from "../src/rules.ts";
import { settingPresetSettings } from "../src/setting-presets.ts";
import { settingsConfig } from "../src/settings.ts";
import { controlCount, createGame, makeCtx, occupied, unitByUid, unitHp } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import { checkDeckOut, checkRoundLimit, endTurn, performMulligan, startTurn } from "../src/turn.ts";
import { defaultConfig } from "../src/types.ts";
import type { Action, Config, GameEvent, GameState, PlayerId } from "../src/types.ts";
import { makeAi } from "../src/ai/index.ts";
import { bestCounterOrder, withCounterOrder } from "../src/ai/counter-order.ts";
import { logView } from "../online/view.ts";
import { blankState, place } from "./helpers.ts";
import { aiStep } from "./online-helpers.ts";

const AD: CardPack = loadPack(packPath("adopted-0922"));
const r0923 = (over: Partial<Config> = {}): Ctx => makeCtx(presetConfig("r0923", over), AD);

const apply = (ctx: Ctx, s: GameState, a: Action): { state: GameState; events: GameEvent[] } => {
  assert.ok(isLegal(ctx, s, a), `illegal: ${JSON.stringify(a)}`);
  return applyAction(ctx, s, a);
};

const effectTexts = (events: GameEvent[]): string[] => events.flatMap((e) => (e.t === "effect" ? [e.text] : []));

// ------------------------------------------------------------- defaults

test("defaults: every new setting reproduces today's rules, in the engine default and in every preset", () => {
  const want = {
    controlCount: "cells",
    controlCountThreshold: 11,
    controlWinMode: "hold",
    controlPointsToWin: 2,
    incomeMode: "ratchet",
    killRewardCondition: "always",
    underdogIncome: 0,
    underdogDiscount: 0,
    underdogDiscountMinCost: 8,
    underdogBy: "cells",
    controlWinLate: 0,
    instantWinCells: 0,
  };
  const d = defaultConfig() as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(want)) assert.equal(d[k], v, k);
  for (const id of RULE_PRESET_IDS) {
    const c = presetConfig(id) as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(want)) assert.equal(c[k], v, `${id} ${k}`);
  }
  // every one of them is on the /rules page, in Japanese
  for (const k of Object.keys(want)) {
    const f = CONFIG_SCHEMA.find((x) => x.key === k);
    assert.ok(f !== undefined, `${k} is in CONFIG_SCHEMA`);
    assert.match(f.label, /[぀-ヿ一-鿿]/);
  }
  // under "cells" the 占拠 is the plain cell count, hidden units excluded
  const ctx = r0923();
  const s = blankState(ctx);
  place(s, "ad17", 0, 0, 0, 0);
  const hid = place(s, "ad02", 0, 2, 0, 0);
  const u = unitByUid(s, hid);
  assert.ok(u !== undefined);
  u.hiddenBy = 1;
  assert.equal(controlCount(ctx, s, 0), occupied(s, 0));
  assert.equal(controlCount(ctx, s, 0), 1);
});

// ------------------------------------------------------- 制圧の数え方

/** P0: 玖龍街 (HP13, cost 9) + three cost-3 units. P1: 両面 facing the 玖龍街. */
const bigBoard = (ctx: Ctx): { s: GameState; big: number; attacker: number } => {
  const s = blankState(ctx, 10);
  const big = place(s, "ad17", 0, 0, 0, 0); // empty cell: HP 13
  place(s, "ad02", 0, 2, 0, 0);
  place(s, "ad03", 0, 2, 2, 0);
  place(s, "ad02", 0, 1, 2, 0);
  const attacker = place(s, "ad14", 1, 0, 1, 2); // facing south: (0,0) ahead
  return { s, big, attacker };
};

test("controlCount hp: HP 11+ counts 2, gains control on 4 cells, and damage below 11 breaks it without a kill", () => {
  const ctx = r0923({ controlCount: "hp", controlCountThreshold: 11 });
  const { s, big, attacker } = bigBoard(ctx);
  assert.equal(occupied(s, 0), 4);
  assert.equal(controlCount(ctx, s, 0), 5, "玖龍街 HP13 is two markers");

  // own turn end on 5 → the control state
  const ev: GameEvent[] = [];
  endTurn(ctx, s, ev);
  assert.equal(s.players[0].reach, true);
  assert.ok(ev.some((e) => e.t === "control" && e.player === 0 && e.change === "gain"));
  const te = ev.find((e) => e.t === "turnEnd");
  assert.ok(te !== undefined && te.t === "turnEnd");
  assert.equal(te.occupied, 5, "the log reports the weighted 占拠");
  assert.deepEqual(te.occBoth, [5, 1]);

  // P1 hits it for 3: HP 10, still on the board, but now one marker → control lost at once
  const r = apply(ctx, s, { kind: "attack", uid: attacker, targetUid: null });
  const after = unitByUid(r.state, big);
  assert.ok(after !== undefined, "no kill");
  assert.equal(unitHp(ctx, after), 10);
  assert.equal(controlCount(ctx, r.state, 0), 4);
  assert.equal(r.state.players[0].reach, false);
  assert.ok(r.events.some((e) => e.t === "control" && e.player === 0 && e.change === "lost"));

  // the same hit under "cells" changes nothing: 4 cells were never control
  const plain = r0923();
  const b = bigBoard(plain);
  assert.equal(controlCount(plain, b.s, 0), 4);
});

test("controlCount cost: printed cost 8+ counts 2 (Mayohiga-hidden counts 0), and chips / income follow the weighted count", () => {
  const run = (over: Partial<Config>): { chips: number; mana: number; gained: number; occ: number } => {
    const ctx = r0923(over);
    const s = blankState(ctx, 8);
    s.players[0].chips = 2;
    place(s, "ad02", 0, 2, 0, 0);
    place(s, "ad03", 0, 2, 2, 0);
    s.players[0].hand = ["ad15"]; // 茨木童子, cost 8
    const r = apply(ctx, s, { kind: "summon", handIndex: 0, pos: { x: 0, y: 0 }, facing: 0 });
    assert.equal(r.state.players[0].mana, 0);
    const ev: GameEvent[] = [];
    endTurn(ctx, r.state, ev);
    const te = ev.find((e) => e.t === "turnEnd");
    assert.ok(te !== undefined && te.t === "turnEnd");
    return { chips: r.state.players[0].chips, mana: r.state.players[0].mana, gained: te.chipGained, occ: te.occupied };
  };
  // r0923: income at turn end, 6 + one step per chip step reached ([3, 4])
  assert.deepEqual(run({ controlCount: "cost", controlCountThreshold: 8 }), { chips: 4, mana: 8, gained: 2, occ: 4 });
  assert.deepEqual(run({}), { chips: 3, mana: 7, gained: 1, occ: 3 }, "cells: the big unit is one chip");
  // threshold above the card: one marker
  assert.deepEqual(run({ controlCount: "cost", controlCountThreshold: 9 }), { chips: 3, mana: 7, gained: 1, occ: 3 });

  const ctx = r0923({ controlCount: "cost", controlCountThreshold: 8 });
  const s = blankState(ctx);
  const uid = place(s, "ad16", 0, 0, 0, 0);
  assert.equal(controlCount(ctx, s, 0), 2);
  const u = unitByUid(s, uid);
  assert.ok(u !== undefined);
  u.hiddenBy = 0;
  assert.equal(controlCount(ctx, s, 0), 0, "a hidden unit is off the count whatever it weighs");
});

test("controlCount: the deck-out tiebreak (占拠の多い側の勝ち) compares weighted counts", () => {
  const board = (over: Partial<Config>): GameState => {
    const ctx = r0923({ deckOutMode: "second", ...over });
    const s = blankState(ctx);
    place(s, "ad02", 0, 0, 0, 0);
    place(s, "ad03", 0, 2, 0, 0);
    place(s, "ad15", 1, 0, 2, 2);
    place(s, "ad04", 1, 2, 2, 2);
    s.players[0].reshuffleCount = 2;
    const ev: GameEvent[] = [];
    assert.equal(checkDeckOut(ctx, s, ev), true);
    return s;
  };
  const cells = board({});
  assert.equal(cells.winner, null, "2 cells each: a draw");
  const cost = board({ controlCount: "cost", controlCountThreshold: 8 });
  assert.equal(cost.winner, 1, "茨木 counts 2: 3 against 2");
  assert.equal(cost.winType, "deck_out");
});

test("controlCount can be switched mid-match: a weight change that breaks a control state is logged (flow recheck)", () => {
  const ctx = r0923({ controlCount: "hp" });
  const { s } = bigBoard(ctx);
  s.players[0].reach = true;
  const ev: GameEvent[] = [];
  recheckControl(ctx, s, ev);
  assert.equal(ev.length, 0, "5 with 玖龍街 as two");
  recheckControl(r0923(), s, ev);
  assert.ok(ev.some((e) => e.t === "control" && e.change === "lost"), "under cells the same board is 4");
});

// ------------------------------------------------------- 制圧の勝ち方

test("controlWinMode points: a turn end on controlWin earns 制圧点 (never lost), the second wins at once, no control state", () => {
  const ctx = r0923({ controlWinMode: "points", controlPointsToWin: 2 });
  const s = blankState(ctx, 0);
  const cells: [string, number, number][] = [["ad02", 0, 0], ["ad03", 2, 0], ["ad04", 1, 0], ["ad02", 0, 2], ["ad03", 2, 2]];
  for (const [id, x, y] of cells) place(s, id, 0, x, y, 0);
  const ev: GameEvent[] = [];
  endTurn(ctx, s, ev);
  assert.equal(s.players[0].controlPoints, 1);
  assert.equal(s.players[0].reach, false, "no control state in this mode");
  assert.equal(s.ended, false);
  assert.ok(!ev.some((e) => e.t === "control"), "no gain / lost lines");
  assert.ok(effectTexts(ev).some((t) => t.includes("制圧点 +1") && t.includes("1/2")));
  const te = ev.find((e) => e.t === "turnEnd");
  assert.ok(te !== undefined && te.t === "turnEnd");
  assert.deepEqual(te.points, [1, 0]);

  // P1's turn, then P0 ends a turn on 4: the point stays
  startTurn(ctx, s, ev);
  endTurn(ctx, s, ev);
  startTurn(ctx, s, ev);
  const removed = s.units.pop();
  assert.ok(removed !== undefined);
  endTurn(ctx, s, ev);
  assert.equal(s.players[0].controlPoints, 1, "points never decrease");
  startTurn(ctx, s, ev);
  endTurn(ctx, s, ev);
  startTurn(ctx, s, ev);
  s.units.push(removed);
  const last: GameEvent[] = [];
  endTurn(ctx, s, last);
  assert.equal(s.players[0].controlPoints, 2);
  assert.equal(s.ended, true);
  assert.equal(s.winner, 0);
  assert.equal(s.winType, "control");
  assert.ok(last.some((e) => e.t === "control" && e.change === "win"));
  assert.ok(!last.some((e) => e.t === "turnEnd"), "the game ends before the turn-end bookkeeping, as a hold win does");
  // hold mode never touches the points
  const hold = r0923();
  const h = blankState(hold);
  for (const [id, x, y] of cells) place(h, id, 0, x, y, 0);
  endTurn(hold, h, []);
  assert.equal(h.players[0].controlPoints, 0);
  assert.equal(h.players[0].reach, true);
});

// ------------------------------------------------------- 収入の決め方

test("incomeMode current (turn_end income): chips follow the 占拠 down, and so does the income", () => {
  const run = (over: Partial<Config>): { chips: number; mana: number; gained: number } => {
    const ctx = r0923(over);
    const s = blankState(ctx, 0);
    s.players[0].chips = 4;
    place(s, "ad02", 0, 0, 0, 0);
    place(s, "ad03", 0, 2, 0, 0);
    const ev: GameEvent[] = [];
    endTurn(ctx, s, ev);
    const te = ev.find((e) => e.t === "turnEnd");
    assert.ok(te !== undefined && te.t === "turnEnd");
    return { chips: s.players[0].chips, mana: s.players[0].mana, gained: te.chipGained };
  };
  assert.deepEqual(run({}), { chips: 4, mana: 8, gained: 0 }, "ratchet: 4 chips stay, income 8");
  assert.deepEqual(run({ incomeMode: "current" }), { chips: 2, mana: 6, gained: -2 }, "current: 2 cells → income 6");
});

/** P0 on four cells (鉞鬼 at (0,0) in front of P1's 両面); P1's 両面 at (0,1) facing south. */
const breakBoard = (ctx: Ctx): { s: GameState; victim: number; attacker: number } => {
  const s = blankState(ctx, 0);
  const victim = place(s, "ad04", 0, 0, 0, 0);
  place(s, "ad02", 0, 2, 0, 0);
  place(s, "ad03", 0, 2, 2, 0);
  place(s, "ad02", 0, 1, 2, 0);
  const attacker = place(s, "ad14", 1, 0, 1, 2);
  return { s, victim, attacker };
};

test("incomeMode current + income at turn start: a break on the opponent's turn lowers your next income", () => {
  const run = (cfg: Config): { income: number; chips: number; mana: number } => {
    const ctx = makeCtx(cfg, AD);
    const { s, victim, attacker } = breakBoard(ctx);
    const ev: GameEvent[] = [];
    endTurn(ctx, s, ev); // P0 ends on 4 cells
    assert.equal(s.players[0].chips, 4);
    assert.equal(s.players[0].mana, 0, "turn_start: nothing is paid at the turn end");
    startTurn(ctx, s, ev); // P1
    const r = apply(ctx, s, { kind: "attack", uid: attacker, targetUid: null });
    assert.equal(unitByUid(r.state, victim), undefined, "P1 breaks one of P0's cells");
    endTurn(ctx, r.state, ev);
    const start: GameEvent[] = [];
    startTurn(ctx, r.state, start); // P0 again
    const ts = start.find((e) => e.t === "turnStart");
    assert.ok(ts !== undefined && ts.t === "turnStart" && ts.player === 0);
    return { income: ts.income, chips: r.state.players[0].chips, mana: r.state.players[0].mana };
  };
  const bundle = settingsConfig(settingPresetSettings("incomeNow"));
  assert.equal(bundle.incomeMode, "current");
  assert.equal(bundle.incomeTiming, "turn_start");
  assert.deepEqual(run(bundle), { income: 7, chips: 3, mana: 7 }, "3 cells at the turn start: 6 + one step");
  assert.deepEqual(run({ ...bundle, incomeMode: "ratchet" }), { income: 8, chips: 4, mana: 8 }, "ratchet keeps the 4th chip");
});

test("incomeMode current + turn_start: the opening turns pay what r0923 (turn_end) pays — no extra, none missing", () => {
  const manaTrail = (cfg: Config): number[] => {
    const ctx = makeCtx(cfg, AD);
    const s = createGame(ctx, 4242);
    const out: number[] = [];
    const ev: GameEvent[] = [];
    // four turns of nothing: each entry is the turn player's mana as the main phase opens
    for (let i = 0; i < 4; i++) {
      startTurn(ctx, s, ev);
      out.push(s.players[s.turnPlayer].mana);
      endTurn(ctx, s, ev, () => []);
    }
    const starts = ev.filter((e) => e.t === "turnStart");
    assert.equal(starts.length, 4);
    return out;
  };
  const r = presetConfig("r0923");
  const bundle = settingsConfig(settingPresetSettings("incomeNow"));
  assert.deepEqual(manaTrail(r), [6, 8, 12, 14]);
  assert.deepEqual(manaTrail(bundle), [6, 8, 12, 14], "first turns: the start mana is the budget; income from each player's second turn");
  // and the income events say so
  const ctx = makeCtx(bundle, AD);
  const s = createGame(ctx, 4242);
  const ev: GameEvent[] = [];
  for (let i = 0; i < 4; i++) {
    startTurn(ctx, s, ev);
    endTurn(ctx, s, ev, () => []);
  }
  assert.deepEqual(ev.flatMap((e) => (e.t === "turnStart" ? [e.income] : [])), [0, 0, 6, 6]);
});

test("incomeMode current + turn_start (the 今の占拠で収入 bundle): a recorded match replays to the same board and log", () => {
  const cfg = settingsConfig(settingPresetSettings("incomeNow"));
  const f = createFlow(makeCtx(cfg, AD), 20260923);
  for (let i = 0; i < 4000 && f.state.round < 6 && f.phase.kind !== "over"; i++) {
    if (!aiStep(f)) break;
  }
  assert.ok(f.inputs.length > 10);
  const again = replayFlow(makeCtx(f.initialCfg, AD), 20260923, f.inputs);
  assert.deepEqual(again.state, f.state);
  assert.deepEqual(again.log, f.log);
});

// ------------------------------------------------------- 劣勢ボーナス

test("underdogIncome: +N when your 占拠 is strictly lower at the moment income is paid, logged as its own line", () => {
  // turn_end income (r0923)
  const endRun = (p1Units: number): { mana: number; texts: string[] } => {
    const ctx = r0923({ underdogIncome: 1 });
    const s = blankState(ctx, 0);
    place(s, "ad02", 0, 0, 0, 0);
    const spots: [number, number][] = [[2, 2], [0, 2], [2, 0]];
    for (let i = 0; i < p1Units; i++) place(s, "ad03", 1, spots[i][0], spots[i][1], 2);
    const ev: GameEvent[] = [];
    endTurn(ctx, s, ev);
    return { mana: s.players[0].mana, texts: effectTexts(ev) };
  };
  const behind = endRun(2);
  assert.equal(behind.mana, 7);
  assert.ok(behind.texts.some((t) => t.includes("劣勢ボーナス +1") && t.includes("1 対 2")), behind.texts.join(" / "));
  const even = endRun(1);
  assert.equal(even.mana, 6, "equal is not behind");
  assert.ok(!even.texts.some((t) => t.includes("劣勢ボーナス")));

  // turn_start income: on the turnStart event too
  const ctx = r0923({ underdogIncome: 2, incomeTiming: "turn_start" });
  const s = blankState(ctx, 0);
  place(s, "ad03", 1, 2, 2, 2);
  const ev: GameEvent[] = [];
  startTurn(ctx, s, ev);
  const ts = ev.find((e) => e.t === "turnStart");
  assert.ok(ts !== undefined && ts.t === "turnStart");
  assert.equal(ts.income, 8);
  assert.equal(ts.underdog, 2);
  assert.equal(s.players[0].mana, 8);
  assert.deepEqual(incomeParts(ctx, s, 0), { steps: 6, underdog: 2, total: 8 });
  assert.ok(effectTexts(ev).some((t) => t.includes("劣勢ボーナス +2")));
});

// ------------------------------------------------------- 撃破報酬の条件

test("killRewardCondition behind: the destroyer is paid only while its 占拠 is at most the opponent's at the kill", () => {
  const kill = (cond: Config["killRewardCondition"], p0Extra: number, p1Extra: number): { mana: number; ev: GameEvent } => {
    const ctx = r0923({ killRewardCondition: cond });
    const s = blankState(ctx, 5);
    s.turnPlayer = 1;
    const victim = place(s, "ad04", 0, 0, 0, 0);
    const attacker = place(s, "ad14", 1, 0, 1, 2);
    const p0Spots: [number, number][] = [[2, 0], [2, 2], [1, 2]];
    const p1Spots: [number, number][] = [[2, 1], [1, 0]]; // clear of the 両面 back cell (0,2): no friendly fire
    for (let i = 0; i < p0Extra; i++) place(s, "ad02", 0, p0Spots[i][0], p0Spots[i][1], 0);
    for (let i = 0; i < p1Extra; i++) place(s, "ad03", 1, p1Spots[i][0], p1Spots[i][1], 2);
    const r = apply(ctx, s, { kind: "attack", uid: attacker, targetUid: null });
    const d = r.events.find((e) => e.t === "destroy" && e.uid === victim);
    assert.ok(d !== undefined);
    return { mana: r.state.players[1].mana, ev: d };
  };
  // P1 on 3 against P0's 1 (the victim still counts at the kill): ahead → nobody is paid
  const ahead = kill("behind", 0, 2);
  assert.equal(ahead.mana, 3, "5 - attack cost 2, no reward");
  assert.ok(ahead.ev.t === "destroy" && ahead.ev.rewardDenied === true && ahead.ev.manaGain === 0 && ahead.ev.manaTo === null);
  // level (2 against 2) and behind (1 against 4): paid the card's 霊力価 (鉞鬼 1)
  const level = kill("behind", 1, 1);
  assert.equal(level.mana, 4);
  const behind = kill("behind", 3, 0);
  assert.equal(behind.mana, 4);
  assert.ok(behind.ev.t === "destroy" && behind.ev.rewardDenied === undefined && behind.ev.manaTo === 1);
  // always: paid even when ahead
  assert.equal(kill("always", 0, 2).mana, 4);
});

test("killRewardCondition upset: + floor((victim cost - destroying cost) / 2), for an attack kill and for a counter kill", () => {
  // 鉞鬼 (cost 3) finishes a damaged 茨木童子 (cost 8, 霊力価 3): 3 + floor(5/2) = 5
  const attackKill = (cond: Config["killRewardCondition"]): { mana: number; ev: GameEvent } => {
    const ctx = r0923({ killRewardCondition: cond });
    const s = blankState(ctx, 5);
    const attacker = place(s, "ad04", 0, 0, 0, 0);
    const victim = place(s, "ad15", 1, 0, 1, 0);
    const v = unitByUid(s, victim);
    assert.ok(v !== undefined);
    v.damage = unitHp(ctx, v) - 2;
    const r = apply(ctx, s, { kind: "attack", uid: attacker, targetUid: victim });
    const d = r.events.find((e) => e.t === "destroy" && e.uid === victim);
    assert.ok(d !== undefined);
    return { mana: r.state.players[0].mana, ev: d };
  };
  const up = attackKill("upset");
  assert.equal(up.mana, 5 - 2 + 3 + 2);
  assert.ok(up.ev.t === "destroy" && up.ev.upsetBonus === 2 && up.ev.manaGain === 5);
  assert.equal(attackKill("always").mana, 5 - 2 + 3);

  // a 鎖鬼 (cost 4) counter finishes a damaged 酒呑童子 (cost 9, 霊力価 3): 3 + floor(5/2) = 5 to P1
  const ctx = r0923({ killRewardCondition: "upset" });
  const s = blankState(ctx, 5);
  const shuten = place(s, "ad16", 0, 1, 0, 0);
  const kusari = place(s, "ad06", 1, 1, 1, 2);
  const u = unitByUid(s, shuten);
  assert.ok(u !== undefined);
  u.damage = unitHp(ctx, u) - 2;
  const a = legalActions(ctx, s).find((x) => x.kind === "attack" && x.uid === shuten && (x.variant ?? "normal") === "normal");
  assert.ok(a !== undefined, "酒呑童子 can attack");
  const r = apply(ctx, s, a);
  const d = r.events.find((e) => e.t === "destroy" && e.uid === shuten);
  assert.ok(d !== undefined && d.t === "destroy", "the counter destroys the attacker");
  assert.ok(unitByUid(r.state, kusari) !== undefined, "鎖鬼 survives the hit");
  assert.equal(d.manaTo, 1);
  assert.equal(d.upsetBonus, 2);
  assert.equal(d.manaGain, 5);
  assert.equal(r.state.players[1].mana, 10);
});

// ------------------------------------------------------- 劣勢時の大型割引

test("underdogDiscount: cost 8+ shikigami cost N less while behind, stacks with 太極 (floor 1), logged; not when level or cheaper", () => {
  const ctx = r0923({ underdogDiscount: 2 });
  const s = blankState(ctx, 20);
  place(s, "ad02", 1, 2, 2, 2);
  s.players[0].hand = ["ad15", "ad14"];
  const ibaraki = cardOf(AD, "ad15");
  const ryomen = cardOf(AD, "ad14");
  assert.equal(summonCostFor(ctx, s, 0, ibaraki, { x: 0, y: 0 }), 6, "8 − 2");
  assert.equal(summonCostFor(ctx, s, 0, ibaraki, { x: 1, y: 1 }), 5, "太極 −1, then −2");
  assert.equal(summonCostFor(ctx, s, 0, ryomen, { x: 0, y: 0 }), 7, "cost 7 is below the threshold");
  assert.equal(summonCostFor(ctx, s, 1, ibaraki, { x: 0, y: 0 }), 8, "P1 is ahead");

  const r = apply(ctx, s, { kind: "summon", handIndex: 0, pos: { x: 0, y: 0 }, facing: 0 });
  assert.equal(r.state.players[0].mana, 14);
  const sm = r.events.find((e) => e.t === "summon");
  assert.ok(sm !== undefined && sm.t === "summon");
  assert.equal(sm.cost, 6);
  assert.equal(sm.underdogDiscount, 2);
  assert.ok(effectTexts(r.events).some((t) => t.includes("劣勢割引 −2")));

  // level: full price, and the preview / legal list follow it
  const lv = blankState(ctx, 6);
  place(lv, "ad02", 1, 2, 2, 2);
  lv.players[0].hand = ["ad15"];
  const summonAt00 = (st: GameState) =>
    legalEntries(ctx, st).find((e) => e.action.kind === "summon" && e.action.pos.x === 0 && e.action.pos.y === 0 && e.action.facing === 0);
  const behindEntry = summonAt00(lv);
  assert.ok(behindEntry !== undefined, "6 mana is enough while behind");
  assert.deepEqual(behindEntry.preview, { kind: "summon", cost: 6, costBefore: 8, underdogDiscount: 2 });
  place(lv, "ad03", 0, 2, 0, 0);
  assert.equal(summonAt00(lv), undefined, "level: 8 is needed");
  // no discount configured: summons carry no preview, as before
  const plain = r0923();
  const ps = blankState(plain, 20);
  ps.players[0].hand = ["ad15"];
  assert.ok(legalEntries(plain, ps).filter((e) => e.action.kind === "summon").every((e) => e.preview === null));
});

test("underdogDiscount: an inherit-summon takes it too", () => {
  const ctx = r0923({ underdogDiscount: 2 });
  const s = blankState(ctx, 6);
  const old = place(s, "ad08", 0, 0, 1, 0); // 一角鬼 cost 5, 陰
  place(s, "ad02", 1, 2, 2, 2);
  place(s, "ad03", 1, 2, 0, 2);
  s.players[0].hand = ["ad15"]; // 茨木童子 cost 8, 陰
  const a: Action = { kind: "inherit", handIndex: 0, targetUid: old };
  const entry = legalEntries(ctx, s).find((e) => e.action.kind === "inherit" && e.action.targetUid === old);
  assert.ok(entry !== undefined && entry.preview?.kind === "inherit");
  assert.equal(entry.preview.cost, 6);
  assert.equal(entry.preview.underdogDiscount, 2);
  const r = apply(ctx, s, a);
  const sm = r.events.find((e) => e.t === "summon");
  assert.ok(sm !== undefined && sm.t === "summon" && sm.inheritedFrom !== undefined);
  assert.equal(sm.cost, 6);
  assert.equal(r.state.players[0].mana, 6 - 6 + 3, "refund ceil(5/2)");
  assert.equal(isLegal(r0923(), s, a), false, "without the discount 6 mana is not enough");
});

// ------------------------------------------------------------ online view

test("the online log passes the new event fields through its whitelist", () => {
  const events: GameEvent[] = [
    { t: "turnStart", player: 0, round: 2, income: 7, underdog: 1 },
    { t: "destroy", owner: 0, uid: 3, cardId: "ad04", lifeLoss: 0, manaGain: 0, killer: 1, manaTo: null, killerRefund: false, rewardDenied: true },
    { t: "destroy", owner: 1, uid: 4, cardId: "ad15", lifeLoss: 0, manaGain: 5, killer: 0, manaTo: 0, killerRefund: true, upsetBonus: 2 },
    { t: "summon", player: 0, uid: 5, cardId: "ad15", pos: { x: 0, y: 0 }, facing: 0, cost: 6, taiji: false, baseCost: 8, underdogDiscount: 2 },
    {
      t: "turnEnd", player: 0, round: 2, occupied: 5, chips: 5, chipGained: 1, reach: false, discarded: 0, drawn: 0,
      boardHp: 20, manaLeft: 0, occBoth: [5, 2], handBoth: [5, 5], points: [1, 0],
    },
  ];
  const items = logView(events.map((event, seq) => ({ seq, audience: "all" as const, event })), null);
  assert.deepEqual(items.map((i) => i.event), events);
});

// ------------------------------------------------------------ AI legality

const playChecked = (ctx: Ctx, kinds: [string, string], seed: number): GameState => {
  const ais = [makeAi(kinds[0], "territorial", { seed }), makeAi(kinds[1], "territorial", { seed: seed + 1 })];
  const s = createGame(ctx, seed);
  const events: GameEvent[] = [];
  performMulligan(ctx, s, events, (c, st, p) => (ais[p].mulligan ?? (() => []))(c, st, p));
  for (let turn = 0; turn < ctx.cfg.roundLimit * 2 + 8 && !s.ended; turn++) {
    if (checkRoundLimit(ctx, s, events)) break;
    startTurn(ctx, s, events, ais[s.turnPlayer].tansu);
    if (s.ended) break;
    let plan = ais[s.turnPlayer].planTurn(ctx, s);
    let taken = 0;
    while (plan.length > 0 && !s.ended && taken < ctx.cfg.maxActionsPerTurn) {
      const a = plan[0];
      plan = plan.slice(1);
      if (a.kind === "pass") break;
      assert.ok(isLegal(ctx, s, a), `seed ${seed} ${kinds.join("-")}: illegal ${JSON.stringify(a)}`);
      const act = a.kind === "attack" ? withCounterOrder(ctx, s, a, ais[1 - s.turnPlayer].counterOrder ?? bestCounterOrder) : a;
      const planned = applyAction(ctx, s, a).state;
      const r = applyAction(ctx, s, act);
      Object.assign(s, r.state);
      events.push(...r.events);
      taken += 1;
      if (JSON.stringify(planned) !== JSON.stringify(s)) plan = ais[s.turnPlayer].planTurn(ctx, s);
    }
    if (s.ended) break;
    events.push({ t: "pass", player: s.turnPlayer });
    endTurn(ctx, s, events, ais[s.turnPlayer].discard);
  }
  return s;
};

test("AI legality: greedy / beam / strong play r0923 + adopted-0922 with each new option on, legal inputs only", () => {
  const options: [string, Partial<Config>][] = [
    ["hp", { controlCount: "hp", controlCountThreshold: 11 }],
    ["cost", { controlCount: "cost", controlCountThreshold: 8 }],
    ["points", { controlWinMode: "points", controlPointsToWin: 2 }],
    ["current", { incomeMode: "current" }],
    ["incomeNow", settingPresetSettings("incomeNow").config],
    ["comeback", settingPresetSettings("comeback").config],
    ["bigComeback", settingPresetSettings("bigComeback").config],
    ["upset", { killRewardCondition: "upset", underdogIncome: 3, underdogDiscount: 3 }],
    ["chips", { killRewardCondition: "behind", underdogIncome: 1, underdogDiscount: 2, underdogBy: "chips" }],
    ["both", { underdogIncome: 1, underdogDiscount: 1, underdogBy: "both", incomeMode: "current" }],
    ["late", { controlWinLate: 4, instantWinCells: 7, controlCount: "hp" }],
    ["latePoints", { controlWinLate: 4, controlWinMode: "points" }],
  ];
  const runs: [[string, string], number][] = [
    [["greedy", "greedy"], 4],
    [["beam", "greedy"], 1],
    [["greedy", "strong"], 1],
    [["strong", "beam"], 1],
  ];
  let seed = 23000;
  const winTypes = new Set<string>();
  for (const [name, over] of options) {
    const ctx = r0923(over);
    for (const [kinds, n] of runs) {
      for (let i = 0; i < n; i++) {
        const s = playChecked(ctx, kinds, seed);
        seed += 1;
        assert.ok(s.ended, `${name} seed ${seed - 1} ended`);
        if (s.winType !== null) winTypes.add(`${name}:${s.winType}`);
        for (const p of [0, 1] as PlayerId[]) {
          assert.ok(s.players[p].mana >= 0 && s.players[p].mana <= ctx.cfg.manaCap, `${name}: mana in range`);
          if (ctx.cfg.controlWinMode === "hold") assert.equal(s.players[p].controlPoints, 0);
        }
      }
    }
  }
  assert.ok(winTypes.has("points:control"), `a points game was won on 制圧点: ${[...winTypes].join(", ")}`);
});

// ------------------------------------------------------------ 劣勢の判定

/** P0 to summon; `cells` / `chips`: is P0 behind on each. P1 always has one unit on (2,2). */
const underdogBoard = (ctx: Ctx, cells: boolean, chips: boolean, mana = 20): GameState => {
  const s = blankState(ctx, mana);
  place(s, "ad02", 1, 2, 2, 2);
  if (!cells) place(s, "ad03", 0, 2, 0, 0); // level on 占拠
  s.players[1].chips = 3;
  s.players[0].chips = chips ? 2 : 3;
  s.players[0].hand = ["ad15"];
  return s;
};

test("underdogBy both: one discount step per condition — 0 / −1 / −1 / −2 on a cost-8 summon; stacks with 太極, floor 1", () => {
  const ctx = r0923({ underdogDiscount: 1, underdogBy: "both" });
  const ibaraki = cardOf(AD, "ad15");
  const at = { x: 0, y: 0 };
  const cost = (cells: boolean, chips: boolean): number => summonCostFor(ctx, underdogBoard(ctx, cells, chips), 0, ibaraki, at);
  assert.equal(cost(false, false), 8);
  assert.equal(cost(true, false), 7, "behind on 占拠 only");
  assert.equal(cost(false, true), 7, "behind on chips only");
  assert.equal(cost(true, true), 6, "behind on both");
  // the applied summon logs the whole discount
  const r = apply(ctx, underdogBoard(ctx, true, true), { kind: "summon", handIndex: 0, pos: at, facing: 0 });
  const sm = r.events.find((e) => e.t === "summon");
  assert.ok(sm !== undefined && sm.t === "summon" && sm.cost === 6 && sm.underdogDiscount === 2);
  assert.ok(effectTexts(r.events).some((t) => t.includes("劣勢割引 −2")));
  // 太極 (−1 in r0923) first, then the steps; never below 1
  assert.equal(summonCostFor(ctx, underdogBoard(ctx, true, true), 0, ibaraki, { x: 1, y: 1 }), 5);
  const deep = r0923({ underdogDiscount: 3, underdogBy: "both", taijiDiscount: 2 });
  assert.equal(summonCostFor(deep, underdogBoard(deep, true, true), 0, ibaraki, { x: 1, y: 1 }), 1, "8 − 2 − 6 floors at 1");
  // cells / chips alone count one condition each
  const byCells = r0923({ underdogDiscount: 1, underdogBy: "cells" });
  assert.equal(summonCostFor(byCells, underdogBoard(byCells, false, true), 0, ibaraki, at), 8);
  assert.equal(summonCostFor(byCells, underdogBoard(byCells, true, true), 0, ibaraki, at), 7);
  const byChips = r0923({ underdogDiscount: 1, underdogBy: "chips" });
  assert.equal(summonCostFor(byChips, underdogBoard(byChips, true, false), 0, ibaraki, at), 8);
  assert.equal(summonCostFor(byChips, underdogBoard(byChips, false, true), 0, ibaraki, at), 7);
});

test("underdogBy both: an inherit-summon takes both steps too", () => {
  const ctx = r0923({ underdogDiscount: 1, underdogBy: "both" });
  const s = blankState(ctx, 6);
  const old = place(s, "ad08", 0, 0, 1, 0);
  place(s, "ad02", 1, 2, 2, 2);
  place(s, "ad03", 1, 2, 0, 2);
  s.players[0].chips = 1;
  s.players[1].chips = 2;
  s.players[0].hand = ["ad15"];
  const r = apply(ctx, s, { kind: "inherit", handIndex: 0, targetUid: old });
  const sm = r.events.find((e) => e.t === "summon");
  assert.ok(sm !== undefined && sm.t === "summon" && sm.inheritedFrom !== undefined);
  assert.equal(sm.cost, 6);
  assert.equal(sm.underdogDiscount, 2);
});

test("underdogBy chips: a cheap summon first in the same turn does not take the discount away from the big one", () => {
  const play = (by: Config["underdogBy"]): number => {
    const ctx = r0923({ underdogDiscount: 2, underdogBy: by });
    const s = blankState(ctx, 20);
    place(s, "ad02", 1, 2, 2, 2);
    s.players[0].chips = 1;
    s.players[1].chips = 3;
    s.players[0].hand = ["ad03", "ad15"];
    const first = apply(ctx, s, { kind: "summon", handIndex: 0, pos: { x: 2, y: 0 }, facing: 0 });
    assert.equal(controlCount(ctx, first.state, 0), controlCount(ctx, first.state, 1), "now level on 占拠");
    const big = apply(ctx, first.state, { kind: "summon", handIndex: 0, pos: { x: 0, y: 0 }, facing: 0 });
    const sm = big.events.find((e) => e.t === "summon");
    assert.ok(sm !== undefined && sm.t === "summon");
    return sm.cost;
  };
  assert.equal(play("chips"), 6, "chips are still 1 against 3");
  assert.equal(play("cells"), 8, "under cells the first summon evened the 占拠");
});

test("underdogBy: 劣勢ボーナス stacks per condition under both, and killRewardCondition behind reads the chosen measure", () => {
  const ctx = r0923({ underdogIncome: 1, underdogBy: "both" });
  const s = blankState(ctx, 0);
  place(s, "ad02", 1, 2, 2, 2);
  s.players[1].chips = 3;
  s.players[0].chips = 2;
  assert.deepEqual(incomeParts(ctx, s, 0), { steps: 6, underdog: 2, total: 8 });
  const ev: GameEvent[] = [];
  endTurn(ctx, s, ev);
  assert.equal(s.players[0].mana, 8);
  assert.ok(effectTexts(ev).some((t) => t.includes("劣勢ボーナス +2") && t.includes("占拠 0 対 1") && t.includes("チップ 2 対 3")), effectTexts(ev).join(" / "));

  // P1 is ahead on 占拠 (3 against 1) but not on chips: paid under chips, not under cells
  const kill = (by: Config["underdogBy"]): number => {
    const k = r0923({ killRewardCondition: "behind", underdogBy: by });
    const b = blankState(k, 5);
    b.turnPlayer = 1;
    const victim = place(b, "ad04", 0, 0, 0, 0);
    const attacker = place(b, "ad14", 1, 0, 1, 2);
    place(b, "ad03", 1, 2, 1, 2);
    place(b, "ad03", 1, 1, 0, 2);
    b.players[0].chips = 4;
    b.players[1].chips = 2;
    const r = apply(k, b, { kind: "attack", uid: attacker, targetUid: null });
    assert.equal(unitByUid(r.state, victim), undefined);
    return r.state.players[1].mana;
  };
  assert.equal(kill("cells"), 3, "ahead on 占拠: no reward");
  assert.equal(kill("chips"), 4, "behind on chips: 霊力価 1");
  assert.equal(kill("both"), 4, "both: level-or-behind on either is enough");
});

// ------------------------------------------------------- 終盤の制圧ライン

/** P0 on `n` small units; P1's deck empty and grave full, so P1's turn-end refill reshuffles. */
const lateBoard = (ctx: Ctx, n: number): GameState => {
  const s = blankState(ctx, 0);
  const cells: [string, number, number][] = [["ad02", 0, 0], ["ad03", 2, 0], ["ad04", 1, 0], ["ad02", 0, 2], ["ad03", 2, 2], ["ad02", 1, 2]];
  for (const [id, x, y] of cells.slice(0, n)) place(s, id, 0, x, y, 0);
  s.players[1].grave = ["ad02", "ad03", "ad04", "ad05", "ad06", "ad07"];
  return s;
};

test("controlWinLate: the first reshuffle switches the line, logged once, and a standing control state is judged again at once", () => {
  // raised to 6: P0's control state on 5 breaks the moment P1 reshuffles
  const ctx = r0923({ controlWinLate: 6 });
  const s = lateBoard(ctx, 5);
  const ev: GameEvent[] = [];
  endTurn(ctx, s, ev); // P0 gains control on 5 (not late yet)
  assert.equal(s.players[0].reach, true);
  startTurn(ctx, s, ev);
  const p1End: GameEvent[] = [];
  endTurn(ctx, s, p1End); // P1 draws 5 from an empty deck: the first reshuffle
  assert.ok(p1End.some((e) => e.t === "reshuffle" && e.player === 1));
  assert.deepEqual(effectTexts(p1End).filter((t) => t.startsWith("終盤")), ["終盤: 制圧は6マスで成立"]);
  const lost = p1End.find((e) => e.t === "control" && e.change === "lost");
  assert.ok(lost !== undefined && lost.t === "control" && lost.player === 0 && lost.need === 6);
  assert.equal(s.players[0].reach, false);
  // a later reshuffle does not log it again
  const again: GameEvent[] = [];
  s.players[1].deck = [];
  s.players[1].hand = [];
  s.players[1].grave = ["ad02", "ad03"];
  s.turnPlayer = 1;
  endTurn(ctx, s, again);
  assert.ok(again.some((e) => e.t === "reshuffle"));
  assert.ok(!effectTexts(again).some((t) => t.startsWith("終盤")));

  // lowered to 4: 4 cells are no control before, and are after the switch
  const low = r0923({ controlWinLate: 4 });
  const before = lateBoard(low, 4);
  endTurn(low, before, []);
  assert.equal(before.players[0].reach, false, "early game: 5 are needed");
  const after = lateBoard(low, 4);
  after.players[1].reshuffleCount = 1;
  const gain: GameEvent[] = [];
  endTurn(low, after, gain);
  assert.equal(after.players[0].reach, true);
  const g = gain.find((e) => e.t === "control" && e.change === "gain");
  assert.ok(g !== undefined && g.t === "control" && g.need === 4);
  // and 制圧点 use the late line too
  const pts = r0923({ controlWinLate: 4, controlWinMode: "points" });
  const ps = lateBoard(pts, 4);
  ps.players[0].reshuffleCount = 1;
  endTurn(pts, ps, []);
  assert.equal(ps.players[0].controlPoints, 1);
  // off (0): the switch never happens
  const off = r0923();
  const o = lateBoard(off, 5);
  endTurn(off, o, []);
  startTurn(off, o, []);
  const offEv: GameEvent[] = [];
  endTurn(off, o, offEv);
  assert.ok(offEv.some((e) => e.t === "reshuffle"));
  assert.ok(!effectTexts(offEv).some((t) => t.startsWith("終盤")));
  assert.equal(o.players[0].reach, true);
});

// ------------------------------------------------------------ コールド勝ち

test("instantWinCells: an own turn end on that 占拠 wins at once — a big unit counting 2 under controlCount hp gets there on 6 cells", () => {
  const board = (ctx: Ctx): GameState => {
    const s = blankState(ctx, 0);
    place(s, "ad17", 0, 0, 0, 0); // 玖龍街 HP13
    const cells: [string, number, number][] = [["ad02", 2, 0], ["ad04", 1, 0], ["ad02", 0, 2], ["ad03", 2, 2], ["ad02", 1, 2]];
    for (const [id, x, y] of cells) place(s, id, 0, x, y, 0);
    return s;
  };
  const hp = r0923({ controlCount: "hp", instantWinCells: 7 });
  const s = board(hp);
  assert.equal(controlCount(hp, s, 0), 7);
  const ev: GameEvent[] = [];
  endTurn(hp, s, ev);
  assert.equal(s.ended, true);
  assert.equal(s.winner, 0);
  assert.equal(s.winType, "control");
  assert.ok(effectTexts(ev).some((t) => t.includes("コールド勝ち") && t.includes("占拠7")));
  assert.ok(ev.some((e) => e.t === "gameEnd"));
  // the same board counted in cells is 6: no cold win, just the control state
  const cells = r0923({ instantWinCells: 7 });
  const c = board(cells);
  endTurn(cells, c, []);
  assert.equal(c.ended, false);
  assert.equal(c.players[0].reach, true);
  // under points too, before any 制圧点
  const pts = r0923({ controlCount: "hp", instantWinCells: 7, controlWinMode: "points", controlPointsToWin: 3 });
  const p = board(pts);
  endTurn(pts, p, []);
  assert.equal(p.winner, 0);
  assert.equal(p.players[0].controlPoints, 0);
});
