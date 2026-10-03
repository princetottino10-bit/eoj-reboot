// 「召喚した手番の攻撃はコストなし」 (10/3 designer request):
// freeSummonAttack off (default, every attack pays) | optional (the first
// attack of a unit on the turn it was summoned skips the attack cost; a paid
// variant's extra is still paid) and freeSummonAttackInherit (継承召喚 too,
// while the replaced unit had not attacked yet).
import { test } from "node:test";
import assert from "node:assert/strict";
import { attackCostFor, hasFreeSummonAttack } from "../src/combat.ts";
import { commandsFor } from "../src/commands.ts";
import { CONFIG_SCHEMA, formatConfigValue } from "../src/config-schema.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig, RULE_PRESET_IDS } from "../src/presets.ts";
import { applyAction, isLegal, legalActions } from "../src/rules.ts";
import { matchingSettingPreset, SETTING_PRESETS, settingPresetSettings, settingsLabel } from "../src/setting-presets.ts";
import { decodeSettings, encodeSettings, settingsConfig } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import { cloneState, unitByUid } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import { endTurn, startTurn } from "../src/turn.ts";
import { defaultConfig } from "../src/types.ts";
import type { Action, Config, GameEvent, GameState } from "../src/types.ts";
import { makeAi } from "../src/ai/index.ts";
import { stateKey } from "../src/ai/strong-search.ts";
import { describeEvent } from "../play/render.ts";
import { boardView, logView } from "../online/view.ts";
import { blankState, mkCtx, place } from "./helpers.ts";

const AC = loadPack(packPath("adopted-1003"));
const FREE: Partial<Config> = { freeSummonAttack: "optional" };
const ac = (over: Partial<Config> = {}): Ctx => mkCtx({ effects: true, inheritSummon: true, ...over }, AC);

type Attack = Extract<GameEvent, { t: "attack" }>;
const attackEvent = (events: GameEvent[]): Attack => {
  const e = events.find((x) => x.t === "attack");
  assert.ok(e !== undefined && e.t === "attack", "an attack event");
  return e;
};

/** Player 0 summons `cardId` somewhere it can attack the enemy at once; returns the state after and the new uid. */
const summonInReach = (ctx: Ctx, s: GameState, cardId: string): { state: GameState; uid: number } => {
  s.players[0].hand = [cardId];
  for (const a of legalActions(ctx, s)) {
    if (a.kind !== "summon") continue;
    const r = applyAction(ctx, s, a);
    const uid = r.state.nextUid - 1;
    // under "off" the attack may be unaffordable: look at the geometry with plenty of mana
    const probe = cloneState(r.state);
    probe.players[0].mana = 30;
    if (legalActions(ctx, probe).some((x) => x.kind === "attack" && x.uid === uid)) return { state: r.state, uid };
  }
  throw new Error("no summon that can attack");
};

/** An enemy 影鬼 in the middle of the board and player 0 with `mana`. */
const board = (ctx: Ctx, mana: number): GameState => {
  const s = blankState(ctx, mana);
  place(s, "ac03", 1, 1, 1, 0);
  return s;
};

const attackOf = (ctx: Ctx, s: GameState, uid: number, variant?: string): Action => {
  const a = legalActions(ctx, s).find((x) => x.kind === "attack" && x.uid === uid && (x.variant ?? "normal") === (variant ?? "normal"));
  assert.ok(a !== undefined, `a legal ${variant ?? "normal"} attack by ${uid}`);
  return a;
};

// ------------------------------------------------------------- defaults

test("defaults: off everywhere (every attack pays), inherit off; old presets unchanged", () => {
  const d = defaultConfig();
  assert.equal(d.freeSummonAttack, "off");
  assert.equal(d.freeSummonAttackInherit, false);
  for (const id of RULE_PRESET_IDS) {
    assert.equal(presetConfig(id).freeSummonAttack, "off", id);
    assert.equal(presetConfig(id).freeSummonAttackInherit, false, id);
  }
  const ctx = ac();
  const s = board(ctx, 20);
  const { state, uid } = summonInReach(ctx, s, "ac03");
  assert.equal(unitByUid(state, uid)?.freeAttack, undefined, "no flag when the option is off");
  const before = state.players[0].mana;
  const r = applyAction(ctx, state, attackOf(ctx, state, uid));
  assert.equal(attackEvent(r.events).cost, 2);
  assert.equal(attackEvent(r.events).free, undefined);
  assert.equal(r.state.players[0].mana, before - 2);
});

test("settings page: both fields sit with 攻撃コストの増減, labels in Japanese, the second hangs under the first", () => {
  const delta = CONFIG_SCHEMA.find((f) => f.key === "attackCostDelta");
  const main = CONFIG_SCHEMA.find((f) => f.key === "freeSummonAttack");
  const inh = CONFIG_SCHEMA.find((f) => f.key === "freeSummonAttackInherit");
  assert.ok(delta !== undefined && main !== undefined && inh !== undefined);
  assert.equal(main.group, delta.group);
  assert.equal(inh.group, delta.group);
  assert.equal(main.label, "召喚した手番の攻撃");
  assert.ok(main.kind === "choice");
  assert.deepEqual(main.choices.map((c) => c.label), ["毎回コストを払う", "1回目はコストなし"]);
  assert.equal(inh.label, "継承召喚にも適用");
  assert.equal(formatConfigValue(inh, true), "する");
  assert.equal(formatConfigValue(inh, false), "しない");
  assert.deepEqual(inh.dependsOn, { key: "freeSummonAttack", off: "off" });
});

// ------------------------------------------------------------- the rule

test("optional: the summoned unit's first attack that turn costs 0 and is logged as 召喚攻撃(霊力0)", () => {
  const ctx = ac(FREE);
  // 3 for the 影鬼 and nothing left: only the free attack is affordable
  const s = board(ctx, 3);
  const { state, uid } = summonInReach(ctx, s, "ac03");
  assert.equal(state.players[0].mana, 0);
  const u = unitByUid(state, uid);
  assert.ok(u !== undefined && hasFreeSummonAttack(ctx, u));
  assert.equal(attackCostFor(ctx, u), 0);
  const a = attackOf(ctx, state, uid);
  assert.ok(isLegal(ctx, state, a));
  const r = applyAction(ctx, state, a);
  const e = attackEvent(r.events);
  assert.equal(e.cost, 0);
  assert.equal(e.free, true);
  assert.equal(r.state.players[0].mana >= 0, true);
  assert.equal(unitByUid(r.state, uid)?.freeAttack, undefined, "the flag is spent");
  const line = describeEvent(ctx, ["先手", "後手"], e);
  assert.ok(line !== null && line.text.startsWith("先手: 影鬼の召喚攻撃(霊力0)"), line?.text);
});

test("optional: attacking stays optional — passing on it keeps nothing for the next turn, which pays", () => {
  const ctx = ac(FREE);
  const s = board(ctx, 10);
  const { state, uid } = summonInReach(ctx, s, "ac03");
  const ev: GameEvent[] = [];
  const next = cloneState(state);
  endTurn(ctx, next, ev);
  assert.equal(unitByUid(next, uid)?.freeAttack, undefined, "cleared at the turn end");
  // back to player 0's next turn
  endTurn(ctx, next, ev);
  next.turnPlayer = 0;
  startTurn(ctx, next, ev);
  assert.equal(next.ended, false);
  const u = unitByUid(next, uid);
  assert.ok(u !== undefined);
  assert.equal(hasFreeSummonAttack(ctx, u), false);
  assert.equal(attackCostFor(ctx, u), 2);
});

test("optional: only the first attack is free — a second attack (were a rule to allow it) pays", () => {
  const ctx = ac(FREE);
  const s = board(ctx, 10);
  s.units[0].damage = 0;
  const enemy = s.units[0];
  enemy.cardId = "ac17"; // 玖龍街: HP 16, survives two hits
  const { state, uid } = summonInReach(ctx, s, "ac03");
  const r1 = applyAction(ctx, state, attackOf(ctx, state, uid));
  assert.equal(attackEvent(r1.events).cost, 0);
  const again = cloneState(r1.state);
  const u = unitByUid(again, uid);
  if (u === undefined) return; // countered to death: nothing more to check
  u.attackedThisTurn = false; // as if a rule granted another attack
  assert.equal(attackCostFor(ctx, u), 2);
  const r2 = applyAction(ctx, again, attackOf(ctx, again, uid));
  assert.equal(attackEvent(r2.events).cost, 2);
  assert.equal(attackEvent(r2.events).free, undefined);
});

test("optional: a paid variant still pays its extra (酒呑童子【飲酒】 +2), the attack cost itself is 0", () => {
  const ctx = ac(FREE);
  const s = board(ctx, 11); // 9 for 酒呑童子, 2 for 【飲酒】
  s.units[0].cardId = "ac17";
  const { state, uid } = summonInReach(ctx, s, "ac16");
  assert.equal(state.players[0].mana, 2);
  const u = unitByUid(state, uid);
  assert.ok(u !== undefined);
  assert.equal(attackCostFor(ctx, u, "normal"), 0);
  assert.equal(attackCostFor(ctx, u, "drink"), 2);
  const r = applyAction(ctx, state, attackOf(ctx, state, uid, "drink"));
  const e = attackEvent(r.events);
  assert.equal(e.cost, 2);
  assert.equal(e.free, true);
  assert.equal(r.state.players[0].mana, 0);
  const line = describeEvent(ctx, ["先手", "後手"], e);
  assert.ok(line !== null && line.text.includes("召喚攻撃 (霊力-2)"), line?.text);
  // the menu says so: the attack costs 0, 【飲酒】 only its extra
  const cmds = commandsFor(ctx, state)[String(uid)];
  const atk = cmds.find((c) => c.id === "attack");
  const drink = cmds.find((c) => c.id === "drink");
  assert.ok(atk !== undefined && drink !== undefined);
  assert.equal(atk.cost, 0);
  assert.equal(atk.label, "攻撃(召喚攻撃・コスト0)");
  assert.equal(atk.free, true);
  assert.equal(drink.cost, 2);
  assert.equal(drink.label, "飲酒(召喚攻撃・攻撃コスト0)");
});

// ------------------------------------------------------------- 継承召喚

/** Player 0's 影鬼 in reach of the enemy, a 茨木童子 (yin, like 影鬼) in hand to inherit onto it. */
const inheritBoard = (ctx: Ctx, attacked: boolean): { s: GameState; old: number } => {
  const s = blankState(ctx, 20);
  place(s, "ac17", 1, 1, 1, 0);
  const old = place(s, "ac03", 0, 1, 0, 0);
  // face it so the enemy in the middle is in range
  for (const f of [0, 1, 2, 3] as const) {
    s.units[1].facing = f;
    if (legalActions(ctx, s).some((a) => a.kind === "attack" && a.uid === old)) break;
  }
  s.units[1].attackedThisTurn = attacked;
  s.players[0].hand = ["ac15"];
  return { s, old };
};

const inherit = (ctx: Ctx, s: GameState, old: number): { state: GameState; uid: number } => {
  const a = legalActions(ctx, s).find((x) => x.kind === "inherit" && x.targetUid === old);
  assert.ok(a !== undefined, "a legal 継承召喚");
  const r = applyAction(ctx, s, a);
  return { state: r.state, uid: r.state.nextUid - 1 };
};

test("継承召喚: inherit off — the new unit pays; inherit on — its first attack is free", () => {
  const off = ac(FREE);
  const a = inheritBoard(off, false);
  const x = inherit(off, a.s, a.old);
  const ux = unitByUid(x.state, x.uid);
  assert.ok(ux !== undefined && ux.summonedThisTurn);
  assert.equal(hasFreeSummonAttack(off, ux), false);
  assert.equal(attackCostFor(off, ux), 4);

  const on = ac({ ...FREE, freeSummonAttackInherit: true });
  const b = inheritBoard(on, false);
  const y = inherit(on, b.s, b.old);
  const uy = unitByUid(y.state, y.uid);
  assert.ok(uy !== undefined);
  assert.equal(hasFreeSummonAttack(on, uy), true);
  const r = applyAction(on, y.state, attackOf(on, y.state, y.uid));
  assert.equal(attackEvent(r.events).cost, 0);
});

test("継承召喚: the replaced unit already attacked — the new one still cannot attack, free or not", () => {
  const on = ac({ ...FREE, freeSummonAttackInherit: true });
  const b = inheritBoard(on, true);
  const y = inherit(on, b.s, b.old);
  const uy = unitByUid(y.state, y.uid);
  assert.ok(uy !== undefined && uy.attackedThisTurn);
  assert.equal(uy.freeAttack, undefined);
  assert.equal(hasFreeSummonAttack(on, uy), false);
  assert.ok(!legalActions(on, y.state).some((x) => x.kind === "attack" && x.uid === y.uid));
});

// ------------------------------------------------------------- AI

/** Plays an AI's plan for player 0; every step must be legal. */
const playPlan = (kind: string, ctx: Ctx, s: GameState): { state: GameState; events: GameEvent[] } => {
  const plan = makeAi(kind).planTurn(ctx, s);
  let cur = s;
  const events: GameEvent[] = [];
  for (const a of plan) {
    if (cur.ended || a.kind === "pass") break;
    assert.ok(isLegal(ctx, cur, a), `${kind}: ${JSON.stringify(a)}`);
    const r = applyAction(ctx, cur, a);
    events.push(...r.events);
    cur = r.state;
  }
  return { state: cur, events };
};

const tookFreeKill = (kind: string, r: { state: GameState; events: GameEvent[] }): void => {
  const atk = r.events.find((e) => e.t === "attack");
  assert.ok(atk !== undefined && atk.t === "attack" && atk.free === true && atk.cost === 0, `${kind} attacks for free`);
  assert.ok(!r.state.units.some((u) => u.owner === 1), `${kind} took the kill`);
};

test("AI (beam / strong): with the mana for the summon only, it summons facing the enemy and takes the free kill", () => {
  for (const kind of ["beam", "strong"]) {
    const ctx = ac(FREE);
    const s = board(ctx, 3);
    s.units[0].damage = 2; // the enemy 影鬼 at 1 HP
    s.players[0].hand = ["ac03"];
    tookFreeKill(kind, playPlan(kind, ctx, s));
  }
  // under off the same position has no attack after the summon
  const off = ac();
  const s = board(off, 3);
  s.players[0].hand = ["ac03"];
  const { state } = summonInReach(off, s, "ac03");
  assert.ok(!legalActions(off, state).some((a) => a.kind === "attack"));
});

test("AI (greedy / beam / strong): a just-summoned unit with no mana left still attacks for free", () => {
  for (const kind of ["greedy", "beam", "strong"]) {
    const ctx = ac(FREE);
    const s = board(ctx, 3);
    s.units[0].damage = 2;
    const { state } = summonInReach(ctx, s, "ac03");
    assert.equal(state.players[0].mana, 0);
    tookFreeKill(kind, playPlan(kind, ctx, state));
  }
});

test("strong search: the pending free attack is part of the position key", () => {
  const ctx = ac(FREE);
  const { state, uid } = summonInReach(ctx, board(ctx, 10), "ac03");
  const spent = cloneState(state);
  delete unitByUid(spent, uid)!.freeAttack;
  assert.notEqual(stateKey(state, 0), stateKey(spent, 0));
});

// ------------------------------------------------------------- online

test("online: the board view carries the pending flag; the log view carries the free attack", () => {
  const ctx = ac(FREE);
  const { state, uid } = summonInReach(ctx, board(ctx, 10), "ac03");
  assert.equal(boardView(state).units.find((u) => u.uid === uid)?.freeAttack, true);
  const r = applyAction(ctx, state, attackOf(ctx, state, uid));
  const e = attackEvent(r.events);
  const items = logView([{ seq: 0, audience: "all", event: e }], null);
  const back = items[0].event;
  assert.ok(back.t === "attack" && back.free === true && back.cost === 0);
});

// ------------------------------------------------------------- settings

test("share URL: the fields round-trip; an old URL decodes to off", () => {
  const s: GameSettings = { rule: "r1003", pack: "adopted-1003", config: { freeSummonAttack: "optional", freeSummonAttackInherit: true }, cards: {} };
  const back = decodeSettings(encodeSettings(s), null);
  assert.ok(back.ok, back.ok ? "" : back.error);
  assert.deepEqual(back.value.config, { freeSummonAttack: "optional", freeSummonAttackInherit: true });
  const old = decodeSettings(encodeSettings({ ...s, config: { instantWinCells: 7 } }), null);
  assert.ok(old.ok);
  const cfg = settingsConfig(old.value);
  assert.equal(cfg.freeSummonAttack, "off");
  assert.equal(cfg.freeSummonAttackInherit, false);
  const bad = decodeSettings(encodeSettings({ ...s, config: { freeSummonAttack: "always" } as never }), null);
  assert.equal(bad.ok, false);
});

test("bundle 「召喚攻撃はコストなし」: an overlay (optional + inherit) found on top of any ruleset", () => {
  const b = SETTING_PRESETS.freeSummon;
  assert.equal(b.label, "召喚攻撃はコストなし");
  assert.equal(b.overlay, true);
  assert.deepEqual(b.config, { freeSummonAttack: "optional", freeSummonAttackInherit: true });
  assert.deepEqual(settingPresetSettings("freeSummon").config, b.config);
  const onR0923: GameSettings = { rule: "r0923", pack: "adopted-0922", config: { ...b.config }, cards: {} };
  assert.equal(matchingSettingPreset(onR0923, null), "freeSummon");
  assert.match(settingsLabel(onR0923, null), /\+召喚攻撃はコストなし$/);
  assert.equal(matchingSettingPreset({ ...onR0923, config: { freeSummonAttack: "optional" } }, null), null);
});
