// 10/13案 (pack-adopted-1013): the 10/6案その2 cards with the new 古箪笥 (ac05,
// effect key tm07b): 「この式神に攻撃を命じた際、ダメージを与える代わりに、次の
// いずれか1つを行う。・耐久を1消費し、霊力を1得る ・カードを1枚引く」.
// The old turn-start 古箪笥 (tm07) stays in every older pack.
import { test } from "node:test";
import assert from "node:assert/strict";
import { commandsFor } from "../src/commands.ts";
import { effectTextOf, hasTansuAttack } from "../src/effects.ts";
import { createFlow, replayFlow, submit } from "../src/flow.ts";
import { parseFlowInput } from "../src/input-parse.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { DEFAULT_RULE_PRESET, packLabel, PLAYABLE_PACKS, presetConfig, RULE_PRESETS } from "../src/presets.ts";
import { applyAction, isLegal, legalActions } from "../src/rules.ts";
import { defaultSettings } from "../src/settings.ts";
import { makeCtx, unitByUid, unitHp } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import { startTurn } from "../src/turn.ts";
import { tansuOwed } from "../src/flow.ts";
import type { Action, Config, GameEvent, GameState } from "../src/types.ts";
import { makeAi } from "../src/ai/index.ts";
import { tansuAttackChoice } from "../src/ai/tansu.ts";
import { cardFaceHtml } from "../play/cards-view.ts";
import { describeEvent } from "../play/render.ts";
import { narrateStep, beforeOf } from "../play/watch-text.ts";
import { blankState, place } from "./helpers.ts";
import { promptHtml } from "../play/prompt-view.ts";
import { selStillValid, tansuEntries } from "../play/select.ts";
import { boardView } from "../online/view.ts";
import { legalEntries } from "../src/preview.ts";
import { bothKeep, flowOf, newApp, seatTwo, send, testRecordDir, view } from "./online-api-helpers.ts";
import { existsSync, rmSync } from "node:fs";

const P13 = loadPack(packPath("adopted-1013"));
const P06 = loadPack(packPath("adopted-1006"));
const ctx13 = (over: Partial<Config> = {}): Ctx => makeCtx(presetConfig("r1007", over), P13);
const mana = (v: "tansuMana" | "tansuDraw", uid: number): Action => ({ kind: "attack", uid, targetUid: null, variant: v });
const texts = (events: GameEvent[]): string[] => events.flatMap((e) => (e.t === "effect" ? [e.text] : []));

/** 古箪笥 of seat 0 on the board, with `hp` left; seat 0 to act. */
const scene = (ctx: Ctx, hp = 7, m = 3): { s: GameState; uid: number } => {
  const s = blankState(ctx, m);
  const uid = place(s, "ac05", 0, 0, 0, 0);
  unitByUid(s, uid)!.damage = 7 - hp;
  s.players[0].deck = ["ac01", "ac02"];
  s.players[0].hand = ["ac03"];
  return { s, uid };
};

test("10/13 pack: 1006 with only 古箪笥's effect changed; the default for r1007, 1006 still selectable", () => {
  assert.equal(P13.cards.length, P06.cards.length);
  for (const c of P13.cards) {
    const o = P06.byId.get(c.id)!;
    if (c.id === "ac05") {
      assert.equal(c.effect, "tm07b");
      assert.equal(o.effect, "tm07");
      // the sheet values: 召4 / 攻撃霊力 - / 回1 / HP7 / ATK - / 陽 / 術 / no ranges / 隙 8
      assert.deepEqual([c.summonCost, c.attackCost, c.manaValue, c.hp, c.atk, c.attribute, c.attackType], [4, 0, 1, 7, 0, "yang", "jutsu"]);
      assert.deepEqual([c.attackRange.length, c.counterRange.length, c.blindSpots.length], [0, 0, 1]);
      assert.deepEqual({ ...c, effect: "tm07" }, o);
      continue;
    }
    assert.deepEqual(c, o, c.id);
  }
  assert.equal(DEFAULT_RULE_PRESET, "r1007");
  assert.equal(RULE_PRESETS.r1007.defaultPack, "adopted-1013");
  assert.equal(RULE_PRESETS.r1006.defaultPack, "adopted-1006");
  assert.equal(PLAYABLE_PACKS[0], "adopted-1013");
  assert.ok((PLAYABLE_PACKS as readonly string[]).includes("adopted-1006"));
  assert.equal(defaultSettings().pack, "adopted-1013");
  assert.match(packLabel("adopted-1013"), /10\/13/);
});

test("10/13 古箪笥: the card text is the official one (by effect key), the old packs keep theirs", () => {
  const official = "この式神に攻撃を命じた際、ダメージを与える代わりに、次のいずれか1つを行う。・耐久を1消費し、霊力を1得る ・カードを1枚引く";
  assert.equal(effectTextOf("ac05", "tm07b"), official);
  assert.match(effectTextOf("ac05", "tm07") ?? "", /手番開始時/);
  assert.ok(cardFaceHtml(ctx13(), "ac05", { size: "lg" }).includes("ダメージを与える代わりに"));
  const old = makeCtx(presetConfig("r1006"), P06);
  assert.ok(cardFaceHtml(old, "ac05", { size: "lg" }).includes("手番開始時"));
});

test("10/13 古箪笥: 攻撃 = 耐久-1 で霊力+1 (cost 0, no target, no counter, no damage)", () => {
  const ctx = ctx13();
  const { s, uid } = scene(ctx, 7, 0);
  // an enemy right in front: nothing is hit and nothing counters
  const foe = place(s, "ac02", 1, 0, 1, 2);
  const legal = legalActions(ctx, s).filter((a) => a.kind === "attack");
  assert.deepEqual(legal, [mana("tansuMana", uid), mana("tansuDraw", uid)], "both choices, even at 霊力0");
  assert.equal(isLegal(ctx, s, { kind: "attack", uid, targetUid: foe, variant: "tansuMana" }), false, "no target");
  assert.equal(isLegal(ctx, s, { kind: "attack", uid, targetUid: foe }), false, "no plain attack");
  assert.equal(isLegal(ctx, s, { ...mana("tansuMana", uid), counterOrder: [] } as Action), false);
  const { state, events } = applyAction(ctx, s, mana("tansuMana", uid));
  assert.equal(state.players[0].mana, 1);
  assert.equal(unitHp(ctx, unitByUid(state, uid)!), 6);
  assert.equal(unitHp(ctx, unitByUid(state, foe)!), unitHp(ctx, unitByUid(s, foe)!));
  const atk = events.find((e) => e.t === "attack");
  assert.ok(atk !== undefined && atk.t === "attack");
  assert.deepEqual([atk.cost, atk.hits.length, atk.counterTotal, atk.variant], [0, 0, 0, "tansuMana"]);
  assert.deepEqual(texts(events), ["古箪笥: 耐久-1 で霊力+1"]);
  // the mana cap holds
  const capped = scene(ctx, 7, ctx.cfg.manaCap);
  const c2 = applyAction(ctx, capped.s, mana("tansuMana", capped.uid));
  assert.equal(c2.state.players[0].mana, ctx.cfg.manaCap);
  assert.match(texts(c2.events)[0], /上限/);
});

test("10/13 古箪笥: 攻撃 = 1枚引く (the deck top; an empty deck takes the grave back as any draw)", () => {
  const ctx = ctx13();
  const { s, uid } = scene(ctx);
  const { state, events } = applyAction(ctx, s, mana("tansuDraw", uid));
  assert.deepEqual(state.players[0].hand, ["ac03", "ac01"]);
  assert.deepEqual(state.players[0].deck, ["ac02"]);
  assert.equal(unitHp(ctx, unitByUid(state, uid)!), 7, "drawing costs no 耐久");
  assert.equal(state.players[0].mana, s.players[0].mana);
  assert.deepEqual(texts(events), ["古箪笥: 1枚引く"]);
  // empty deck: the grave is shuffled back (reshuffle), as for any draw
  const e2 = scene(ctx);
  e2.s.players[0].deck = [];
  e2.s.players[0].grave = ["ac04"];
  const r2 = applyAction(ctx, e2.s, mana("tansuDraw", e2.uid));
  assert.deepEqual(r2.state.players[0].hand, ["ac03", "ac04"]);
  assert.ok(r2.events.some((e) => e.t === "reshuffle"));
  // r1007 ends the game at the second 山札切れ: a 古箪笥 draw can be that one
  const e3 = scene(ctx);
  e3.s.players[0].deck = [];
  e3.s.players[0].grave = ["ac04"];
  e3.s.players[0].reshuffleCount = 1;
  const r3 = applyAction(ctx, e3.s, mana("tansuDraw", e3.uid));
  assert.equal(r3.state.ended, true);
  assert.equal(r3.state.winType, "deck_out");
});

test("10/13 古箪笥: once per turn like an attack; rotate first is fine, nothing after", () => {
  const ctx = ctx13();
  const { s, uid } = scene(ctx);
  const turned = applyAction(ctx, s, { kind: "rotate", uid, facing: 1 }).state;
  assert.ok(isLegal(ctx, turned, mana("tansuDraw", uid)), "rotate, then attack");
  const after = applyAction(ctx, turned, mana("tansuDraw", uid)).state;
  assert.equal(isLegal(ctx, after, mana("tansuMana", uid)), false, "the attack is used up");
  assert.equal(isLegal(ctx, after, mana("tansuDraw", uid)), false);
  const once = applyAction(ctx, s, mana("tansuMana", uid)).state;
  assert.equal(isLegal(ctx, once, { kind: "rotate", uid, facing: 1 }), false, "attacking ends the unit's turn");
  // the command menu: one 攻撃 (cost 0) that opens the choice, then disabled
  const cmd = commandsFor(ctx, s)[String(uid)];
  assert.deepEqual(cmd.map((c) => [c.id, c.cost, c.enabled]), [["tansu", 0, true], ["rotate", 1, true]]);
  assert.equal(commandsFor(ctx, once)[String(uid)][0].reason, "攻撃済み");
});

test("10/13 古箪笥: 霊力 at 耐久1 resolves, then it is destroyed as a self-destruction (nobody gains a kill reward)", () => {
  const ctx = ctx13();
  const { s, uid } = scene(ctx, 1, 2);
  s.players[1].mana = 2;
  const { state, events } = applyAction(ctx, s, mana("tansuMana", uid));
  assert.equal(unitByUid(state, uid), undefined);
  assert.equal(state.players[0].mana, 3, "the mana is gained first");
  assert.equal(state.players[1].mana, 2, "the opponent gains nothing");
  const d = events.find((e) => e.t === "destroy");
  assert.ok(d !== undefined && d.t === "destroy");
  assert.equal(d.killer, null);
  assert.equal(d.manaGain, 0);
  assert.deepEqual(state.players[0].grave, ["ac05"]);
});

test("10/13 古箪笥: its 召喚攻撃 may be the effect (never forced), and a free summon attack changes nothing", () => {
  const ctx = ctx13({ summonAttackForced: true, freeSummonAttack: "optional" });
  const s = blankState(ctx, 10);
  s.players[0].hand = ["ac05"];
  s.players[0].deck = ["ac01"];
  const placed = applyAction(ctx, s, { kind: "summon", handIndex: 0, pos: { x: 0, y: 0 }, facing: 0 }).state;
  const uid = placed.nextUid - 1;
  assert.equal(placed.forcedAttackUid, null, "no obligation: the effect is a choice");
  assert.ok(isLegal(ctx, placed, mana("tansuDraw", uid)));
  assert.ok(legalActions(ctx, placed).some((a) => a.kind === "pass"));
  const r = applyAction(ctx, placed, mana("tansuMana", uid));
  assert.equal(r.state.players[0].mana, placed.players[0].mana + 1);
});

test("10/13 古箪笥: no turn-start prompt; the old pack (tm07) still asks at the turn start", () => {
  const ctx = ctx13();
  const { s, uid } = scene(ctx, 7, 3);
  assert.deepEqual(tansuOwed(ctx, s), []);
  const ev: GameEvent[] = [];
  startTurn(ctx, s, ev, () => "mana");
  assert.equal(unitHp(ctx, unitByUid(s, uid)!), 7, "nothing at the turn start");
  assert.equal(texts(ev).filter((t) => t.startsWith("古箪笥")).length, 0);

  const old = makeCtx(presetConfig("r1006"), P06);
  const o = scene(old, 7, 3);
  assert.equal(hasTansuAttack(old, unitByUid(o.s, o.uid)!), false);
  assert.deepEqual(tansuOwed(old, o.s), [o.uid]);
  assert.equal(legalActions(old, o.s).some((a) => a.kind === "attack"), false, "tm07 never attacks");
  const ev2: GameEvent[] = [];
  startTurn(old, o.s, ev2, () => "mana");
  assert.equal(unitHp(old, unitByUid(o.s, o.uid)!), 6);
  assert.ok(texts(ev2).includes("古箪笥: 耐久-1 で霊力+1"));
});

test("10/13 古箪笥: the flow takes the choice as an action input, records it and replays it", () => {
  const ctx = ctx13({ mulligan: false });
  let tansu = -1;
  const f = createFlow(ctx, 7, {
    prepare: (s) => {
      tansu = place(s, "ac05", 0, 0, 0, 0);
    },
  });
  assert.equal(f.phase.kind, "main");
  const input = parseFlowInput({ type: "action", action: { kind: "attack", uid: tansu, targetUid: null, variant: "tansuDraw" } }, { changes: false });
  assert.ok(input !== null && input.ok);
  const hand = f.state.players[0].hand.length;
  assert.ok(submit(f, 0, input.value).ok);
  assert.equal(f.state.players[0].hand.length, hand + 1);
  assert.equal(f.phase.kind, "main");
  const bad = parseFlowInput({ type: "action", action: { kind: "attack", uid: tansu, targetUid: null, variant: "tansuGold" } }, { changes: false });
  assert.ok(bad !== null && !bad.ok);
  const again = replayFlow(ctx, 7, f.inputs, { prepare: (s) => void place(s, "ac05", 0, 0, 0, 0) });
  assert.deepEqual(again.state, f.state);
});

test("10/13 古箪笥: log, watch and AI policy", () => {
  const ctx = ctx13();
  const { s, uid } = scene(ctx, 7, 3);
  const { state, events } = applyAction(ctx, s, mana("tansuMana", uid));
  const atk = events.find((e) => e.t === "attack")!;
  assert.match(describeEvent(ctx, ["先手", "後手"], atk)?.text ?? "", /古箪笥の攻撃\(霊力0\) → ダメージの代わりに耐久-1で霊力\+1/);
  // the table: 攻撃 opens the choice bar (霊力を得る / 1枚引く) instead of target selection
  const lg = legalEntries(ctx, s);
  assert.equal(tansuEntries(lg, uid).length, 2);
  assert.ok(tansuEntries(lg, uid).every((e) => e.preview === null), "no preview (a draw would look at the deck)");
  const sel = { kind: "chest" as const, uid, summonAttack: false };
  assert.ok(selStillValid(sel, boardView(s), s.players[0].hand, lg));
  const html = promptHtml({ ctx, board: boardView(s), names: ["先手", "後手"], viewer: 0, hand: s.players[0].hand, prompt: { kind: "main", legal: lg }, sel, marked: 0, tansuIndex: 0, endConfirm: false, flash: "" });
  assert.match(html, /data-act="chest"[^>]*data-choice="mana"/);
  assert.match(html, /data-act="chest"[^>]*data-choice="draw"/);
  assert.match(html, /霊力を得る/);
  assert.match(html, /1枚引く/);
  const n = narrateStep(ctx, beforeOf(ctx, s), state, 0, [], events);
  assert.match(n.lines[0].text, /先手: 古箪笥に攻撃を命じた → ダメージの代わりに耐久を1減らして霊力\+1/);
  // the rule: 霊力 when 耐久 3+ and one more 霊力 reaches a hand card; else draw; never self-destruct
  const u = unitByUid(s, uid)!;
  s.players[0].hand = ["ac05"]; // cost 4 = 霊力3 + 1
  assert.equal(tansuAttackChoice(ctx, s, u), "tansuMana");
  s.players[0].hand = ["ac03"]; // cost 3: already affordable
  assert.equal(tansuAttackChoice(ctx, s, u), "tansuDraw");
  s.players[0].hand = ["ac05"];
  u.damage = 5; // 耐久2
  assert.equal(tansuAttackChoice(ctx, s, u), "tansuDraw");
  u.damage = 6; // 耐久1
  assert.equal(tansuAttackChoice(ctx, s, u), "tansuDraw");
});

test("10/13 古箪笥: every AI kind uses it by the rule and plays legal, whole games", () => {
  for (const kind of ["greedy", "beam", "strong"]) {
    const ai = makeAi(kind, "territorial", { strong: { timeLimitMs: 200 } });
    const ctx = ctx13();
    const { s, uid } = scene(ctx, 7, 3);
    s.players[0].hand = ["ac05"];
    const plan = ai.planTurn(ctx, s);
    assert.deepEqual(plan[0], mana("tansuMana", uid), kind);
    let cur = s;
    for (const a of plan) {
      assert.ok(isLegal(ctx, cur, a), `${kind}: ${JSON.stringify(a)}`);
      cur = applyAction(ctx, cur, a).state;
    }
  }
  // a seeded greedy game on the 10/13 pack runs to its end
  const flowCtx = ctx13({ mulligan: false });
  const ai = makeAi("greedy");
  const f = createFlow(flowCtx, 3);
  for (let i = 0; i < 4000 && f.phase.kind !== "over"; i++) {
    const ph = f.phase;
    if (ph.kind === "main") {
      for (const a of ai.planTurn(f.ctx, f.state)) {
        if (f.phase.kind !== "main" || !isLegal(f.ctx, f.state, a)) break;
        assert.ok(submit(f, ph.player, { type: "action", action: a }).ok);
      }
      if (f.phase.kind === "main") submit(f, ph.player, { type: "action", action: { kind: "pass" } });
    } else if (ph.kind === "discard") submit(f, ph.player, { type: "discard", indices: [] });
    else if (ph.kind === "counterOrder") submit(f, ph.player, { type: "counterOrder", order: ph.uids });
    else if (ph.kind === "lantern") submit(f, ph.player, { type: "lantern", uid: ph.ask.options[0].uid });
    else if (ph.kind === "kyonshi") submit(f, ph.player, { type: "kyonshi", turn: 0 });
    else break;
  }
  assert.equal(f.phase.kind, "over");
});

const DIR = testRecordDir("tansu1013");
test.after(() => {
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
});

test("10/13 古箪笥 online: the server offers the 攻撃 command and takes the choice as an input", () => {
  const seated = seatTwo(newApp(DIR), { rule: "r1007", pack: "adopted-1013" });
  bothKeep(seated);
  const f = flowOf(seated);
  assert.equal(f.phase.kind, "main");
  const seat = f.state.turnPlayer;
  const uid = place(f.state, "ac05", seat, 0, 0, seat === 0 ? 0 : 2);
  const v = view(seated, seated.tokens[seat]);
  const cmds = (v as unknown as { game: { commands: Record<string, { id: string; enabled: boolean }[]> } }).game.commands;
  assert.equal(cmds[String(uid)][0].id, "tansu");
  assert.equal(cmds[String(uid)][0].enabled, true);
  const before = f.state.players[seat].mana;
  const r = send(seated, seated.tokens[seat], { type: "action", action: { kind: "attack", uid, targetUid: null, variant: "tansuMana" } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(f.state.players[seat].mana, Math.min(f.ctx.cfg.manaCap, before + 1));
  assert.equal(unitHp(f.ctx, unitByUid(f.state, uid)!), 6);
  const twice = send(seated, seated.tokens[seat], { type: "action", action: { kind: "attack", uid, targetUid: null, variant: "tansuDraw" } });
  assert.notEqual(twice.status, 200, "once per turn");
});
