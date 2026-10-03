// コールド勝ち (instantWinCells) variants of 10/3: when it is judged
// (instantWinTiming turn_end / immediate) and what it counts
// (instantWinCount occupation / units). The designer's 「5体目を置いたら即勝ち」
// is instantWinCells 5 + immediate + units (the 「5体目で即勝ち」 bundle).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG_SCHEMA } from "../src/config-schema.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig } from "../src/presets.ts";
import { applyAction, isLegal, legalActions } from "../src/rules.ts";
import { matchingSettingPreset, SETTING_PRESETS, settingPresetSettings } from "../src/setting-presets.ts";
import { decodeSettings, encodeSettings, settingsConfig } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import { controlCount, instantWinCountOf, makeCtx, meetsInstantWin, unitByUid } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import { endTurn, pendingTansuChoices, startTurn } from "../src/turn.ts";
import { defaultConfig } from "../src/types.ts";
import type { Action, Config, GameEvent, GameState } from "../src/types.ts";
import { makeAi } from "../src/ai/index.ts";
import { coldTerm } from "../src/ai/eval.ts";
import { describeEvent, resultHow } from "../play/render.ts";
import { logView } from "../online/view.ts";
import { blankState, mkCtx, place } from "./helpers.ts";

const SK = loadPack(packPath("shuten-kyuryu"));
const AD = loadPack(packPath("adopted-0922"));
const FIVE: Partial<Config> = { instantWinCells: 5, instantWinTiming: "immediate", instantWinCount: "units" };
const sk = (over: Partial<Config> = {}): Ctx => mkCtx({ inheritSummon: true, ...over }, SK);

const gameEnd = (events: GameEvent[]) => {
  const e = events.find((x) => x.t === "gameEnd");
  assert.ok(e !== undefined && e.t === "gameEnd", "a gameEnd event");
  return e;
};

/** Four of player 0's units in the corners and on (1,0), the rest of the board free. */
const fourUnits = (ctx: Ctx, mana = 20): GameState => {
  const s = blankState(ctx, mana);
  for (const [x, y] of [[0, 0], [2, 0], [0, 2], [2, 2]] as const) place(s, "sk03", 0, x, y, 0);
  return s;
};

const firstSummon = (ctx: Ctx, s: GameState): Action => {
  const a = legalActions(ctx, s).find((x) => x.kind === "summon");
  assert.ok(a !== undefined, "a legal summon");
  return a;
};

// ------------------------------------------------------------- defaults

test("defaults: turn_end + occupation everywhere (old URLs and presets keep today's コールド勝ち); both on the rules page in Japanese", () => {
  const d = defaultConfig();
  assert.equal(d.instantWinTiming, "turn_end");
  assert.equal(d.instantWinCount, "occupation");
  for (const id of ["r1003", "r0923", "r0914"] as const) {
    assert.equal(presetConfig(id).instantWinTiming, "turn_end");
    assert.equal(presetConfig(id).instantWinCount, "occupation");
  }
  for (const key of ["instantWinTiming", "instantWinCount"]) {
    const f = CONFIG_SCHEMA.find((x) => x.key === key);
    assert.ok(f !== undefined && f.kind === "choice" && f.group === "victory", key);
    assert.match(f.label, /^コールド勝ちの/);
    assert.ok(f.choices.every((c) => /[぀-ヿ一-鿿]/.test(c.label)));
  }
  const timing = CONFIG_SCHEMA.find((x) => x.key === "instantWinTiming");
  assert.ok(timing !== undefined && timing.kind === "choice");
  assert.deepEqual(timing.choices.map((c) => c.label), ["手番の終わり", "置いた瞬間"]);
});

// ------------------------------------------------------------- immediate

test("immediate + units: the fifth summon wins on the spot, before the turn ends", () => {
  const ctx = sk(FIVE);
  const s = fourUnits(ctx);
  s.players[0].hand = ["sk03"];
  const r = applyAction(ctx, s, firstSummon(ctx, s));
  assert.equal(r.state.ended, true);
  assert.equal(r.state.winner, 0);
  assert.equal(r.state.winType, "control");
  const e = gameEnd(r.events);
  assert.deepEqual(e.cold, { count: 5, by: "units", timing: "immediate", placed: true });
  assert.ok(r.events.some((x) => x.t === "effect" && x.text === "先手: コールド勝ち(式神5体)"));
  // the words the log and the result panel use
  const names: [string, string] = ["先手", "後手"];
  assert.equal(resultHow("control", 0, names, undefined, e.cold), "5体目を置いて勝ち(コールド勝ち)");
  const line = describeEvent(ctx, names, e);
  assert.ok(line !== null && line.text.includes("先手が5体目を置いて勝ち(コールド勝ち)"), line?.text);
  // no further action is legal on an ended board through the flow; the AI sees a win
  assert.equal(meetsInstantWin(ctx, r.state, 0), true);
});

test("turn_end (today): the same fifth summon only wins at the turn end", () => {
  const ctx = sk({ ...FIVE, instantWinTiming: "turn_end" });
  const s = fourUnits(ctx);
  s.players[0].hand = ["sk03"];
  const r = applyAction(ctx, s, firstSummon(ctx, s));
  assert.equal(r.state.ended, false);
  const ev: GameEvent[] = [];
  endTurn(ctx, r.state, ev);
  assert.equal(r.state.winner, 0);
  assert.deepEqual(gameEnd(ev).cold, { count: 5, by: "units", timing: "turn_end" });
  // and with コールド勝ち off nothing happens at all
  const off = sk({ instantWinTiming: "immediate", instantWinCount: "units" });
  const o = fourUnits(off);
  o.players[0].hand = ["sk03"];
  const ro = applyAction(off, o, firstSummon(off, o));
  endTurn(off, ro.state, []);
  assert.equal(ro.state.ended, false);
});

test("immediate + units: 継承召喚 keeps the unit count — four stay four, no win", () => {
  const ctx = sk(FIVE);
  const s = fourUnits(ctx);
  s.players[0].hand = ["sk08"]; // cost 3 > sk03's 2, same attribute
  const a = legalActions(ctx, s).find((x) => x.kind === "inherit");
  assert.ok(a !== undefined, "an inherit is legal");
  const r = applyAction(ctx, s, a);
  assert.equal(r.state.units.length, 4);
  assert.equal(r.state.ended, false);
  assert.equal(instantWinCountOf(ctx, r.state, 0), 4);
});

test("immediate: judged after the counters — an attacker that falls to a counter is not counted", () => {
  // a board standing on 5 (as when コールド勝ち is lowered mid-match) is judged
  // at the next action's end, never before or inside it
  const ctx = sk(FIVE);
  const s = blankState(ctx, 10);
  const atk = place(s, "sk04", 0, 0, 0, 0); // range reaches (1,1)
  const def = place(s, "sk10", 1, 1, 1, 2); // facing south: its counter covers (0,0)
  for (const [x, y] of [[2, 0], [0, 2], [2, 2], [2, 1]] as const) place(s, "sk03", 0, x, y, 0);
  assert.equal(instantWinCountOf(ctx, s, 0), 5);
  const r = applyAction(ctx, s, { kind: "attack", uid: atk, targetUid: def });
  const ev = r.events.find((e) => e.t === "attack");
  assert.ok(ev !== undefined && ev.t === "attack" && ev.attackerDestroyed);
  assert.equal(r.state.ended, false, "4 left after the counter");
  assert.equal(instantWinCountOf(ctx, r.state, 0), 4);
  // an action that loses nothing ends it at once
  const rot = applyAction(ctx, s, { kind: "rotate", uid: atk, facing: 1 });
  assert.equal(rot.state.winner, 0);
  assert.deepEqual(gameEnd(rot.events).cold, { count: 5, by: "units", timing: "immediate" });
});

test("immediate: both sides on it after one action — the acting player wins; the other side alone wins on the actor's action", () => {
  const ctx = sk({ ...FIVE, instantWinCells: 4 });
  const s = blankState(ctx, 20);
  for (const [x, y] of [[0, 0], [2, 0], [1, 0]] as const) place(s, "sk03", 0, x, y, 0);
  for (const [x, y] of [[0, 2], [1, 2], [2, 2], [2, 1]] as const) place(s, "sk03", 1, x, y, 2);
  s.players[0].hand = ["sk03"];
  const r = applyAction(ctx, s, firstSummon(ctx, s));
  assert.equal(meetsInstantWin(ctx, r.state, 1), true);
  assert.equal(r.state.winner, 0, "the acting player");
  // a rotate leaves player 0 on 3: player 1 stands on 4 and wins on player 0's action
  const u = s.units.find((x) => x.owner === 0);
  assert.ok(u !== undefined);
  const rot = applyAction(ctx, s, { kind: "rotate", uid: u.uid, facing: 1 });
  assert.equal(rot.state.winner, 1);
  assert.equal(gameEnd(rot.events).cold?.placed, undefined);
});

test("units vs occupation: a big unit (HP 11+ under controlCount hp) is 2 for 占拠 but 1 unit", () => {
  const ad = (over: Partial<Config>): Ctx => makeCtx(presetConfig("r0923", { controlCount: "hp", ...over }), AD);
  const board = (ctx: Ctx): GameState => {
    const s = blankState(ctx, 20);
    place(s, "ad17", 0, 0, 0, 0); // 玖龍街 HP13: counts 2
    place(s, "ad02", 0, 2, 0, 0);
    place(s, "ad04", 0, 1, 0, 0);
    s.players[0].hand = ["ad02"];
    return s;
  };
  const occ = ad({ instantWinCells: 5, instantWinTiming: "immediate", instantWinCount: "occupation" });
  const units = ad({ instantWinCells: 5, instantWinTiming: "immediate", instantWinCount: "units" });
  const s = board(occ);
  assert.equal(controlCount(occ, s, 0), 4);
  assert.equal(instantWinCountOf(occ, s, 0), 4);
  assert.equal(instantWinCountOf(units, s, 0), 3);
  const a = firstSummon(occ, s);
  const ro = applyAction(occ, s, a);
  assert.equal(ro.state.winner, 0, "占拠 5");
  assert.deepEqual(gameEnd(ro.events).cold, { count: 5, by: "occupation", timing: "immediate", placed: true });
  assert.equal(resultHow("control", 0, ["先手", "後手"], undefined, gameEnd(ro.events).cold), "コールド勝ち(占拠5)");
  const ru = applyAction(units, board(units), a);
  assert.equal(ru.state.ended, false, "4 units");
});

test("hidden units (マヨヒガ) are not counted; one coming back at its caster's turn start wins at that turn start", () => {
  const ctx = sk(FIVE);
  const s = fourUnits(ctx);
  unitByUid(s, s.units[0].uid)!.hiddenBy = 0;
  assert.equal(instantWinCountOf(ctx, s, 0), 3);
  s.players[0].hand = ["sk03"];
  const r = applyAction(ctx, s, firstSummon(ctx, s));
  assert.equal(r.state.ended, false, "4 visible of 5");
  // player 0's next turn start: マヨヒガ ends, 5 visible
  const next = r.state;
  next.players[0].hand = [];
  next.players[0].deck = ["sk03", "sk03", "sk03", "sk03", "sk03"];
  assert.deepEqual(pendingTansuChoices(ctx, next), []);
  const ev: GameEvent[] = [];
  startTurn(ctx, next, ev);
  assert.equal(next.winner, 0);
  assert.deepEqual(gameEnd(ev).cold, { count: 5, by: "units", timing: "immediate" });
  assert.ok(!ev.some((e) => e.t === "turnStart"), "the turn never starts");
});

// ------------------------------------------------------------- settings

test("share URL: the new fields round-trip; an old URL (no fields) decodes to turn_end + occupation", () => {
  const s: GameSettings = { rule: "r1003", pack: "adopted-1003", config: { ...FIVE }, cards: {} };
  const back = decodeSettings(encodeSettings(s), null);
  assert.ok(back.ok, back.ok ? "" : back.error);
  assert.deepEqual(back.value.config, FIVE);
  const old = decodeSettings(encodeSettings({ ...s, config: { instantWinCells: 7 } }), null);
  assert.ok(old.ok);
  const cfg = settingsConfig(old.value);
  assert.equal(cfg.instantWinCells, 7);
  assert.equal(cfg.instantWinTiming, "turn_end");
  assert.equal(cfg.instantWinCount, "occupation");
  const bad = decodeSettings(encodeSettings({ ...s, config: { instantWinTiming: "later" } as never }), null);
  assert.equal(bad.ok, false);
});

test("bundle 「5体目で即勝ち」: an overlay of the three values; the picker finds it on top of another ruleset or bundle", () => {
  const b = SETTING_PRESETS.coldFive;
  assert.equal(b.label, "5体目で即勝ち");
  assert.equal(b.overlay, true);
  assert.deepEqual(b.config, FIVE);
  assert.deepEqual(settingPresetSettings("coldFive").config, FIVE);
  // on top of 採用ルール 9/22 and of 調整案1.5倍
  const onR0923: GameSettings = { rule: "r0923", pack: "adopted-0922", config: { ...FIVE }, cards: {} };
  assert.equal(matchingSettingPreset(onR0923, null), "coldFive");
  const adj = settingPresetSettings("adj15");
  assert.equal(matchingSettingPreset(adj, null), "adj15", "a whole bundle still wins when it matches exactly");
  assert.equal(matchingSettingPreset({ ...adj, config: { ...adj.config, ...FIVE } }, null), "coldFive");
  assert.equal(matchingSettingPreset({ ...onR0923, config: { ...FIVE, instantWinCells: 6 } }, null), null);
});

// ------------------------------------------------------------- AI

test("AI (greedy / beam / strong) takes the winning summon", () => {
  for (const kind of ["greedy", "beam", "strong"]) {
    const ctx = sk(FIVE);
    const s = fourUnits(ctx);
    s.players[0].hand = ["sk03", "sk08"];
    place(s, "sk03", 1, 1, 1, 0); // something else to do: an enemy in the middle
    const plan = makeAi(kind).planTurn(ctx, s);
    let cur = s;
    for (const a of plan) {
      if (cur.ended || a.kind === "pass") break;
      assert.ok(isLegal(ctx, cur, a), `${kind}: ${JSON.stringify(a)}`);
      cur = applyAction(ctx, cur, a).state;
    }
    assert.equal(cur.winner, 0, kind);
  }
});

test("AI eval: under immediate, an opponent one summon short with a free cell weighs like their win; turn_end is unchanged", () => {
  const imm = sk(FIVE);
  const s = blankState(imm);
  for (const [x, y] of [[0, 0], [2, 0], [0, 2], [2, 2]] as const) place(s, "sk03", 1, x, y, 0);
  assert.equal(coldTerm(imm, s, 0, 100), -200);
  assert.equal(coldTerm(imm, s, 1, 100), 50);
  const te = sk({ ...FIVE, instantWinTiming: "turn_end" });
  assert.equal(coldTerm(te, s, 0, 100), 0);
  assert.equal(coldTerm(sk(), s, 0, 100), 0);
});

test("online: the gameEnd's cold reaches the seats and spectators through the log view", () => {
  const cold = { count: 5, by: "units" as const, timing: "immediate" as const, placed: true };
  const items = logView([{ seq: 0, audience: "all", event: { t: "gameEnd", winner: 0, winType: "control", round: 3, cold } }], null);
  const e = items[0].event;
  assert.ok(e.t === "gameEnd");
  assert.deepEqual(e.cold, cold);
});
