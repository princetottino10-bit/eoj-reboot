// 10/3テスト案 (r1003) with pack-adopted-1003: the pack against the team's
// 10/3 sheet (sim2/out/sheet-1003/params.csv, copied into the table below so
// the test does not need the sheet), the preset and the defaults, the ratchet
// with a repeated step, the HP-weighted 占拠, every changed effect (ac07 変面,
// ac15 茨木【再生】, ac17 玖龍街, 琵琶牧々 = tm20, ac23 鬼の酒) and AI legality.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CardPack } from "../src/cards.ts";
import { chipStepsText, CONFIG_SCHEMA, formatConfigValue, parseConfigPatch } from "../src/config-schema.ts";
import { canUseVariant, EFFECT_TEXT, rotateCommandLocked } from "../src/effects.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { DEFAULT_RULE_PRESET, PLAYABLE_PACKS, presetConfig, RULE_PRESET_IDS, RULE_PRESETS } from "../src/presets.ts";
import { applyAction, incomeFor, isLegal, legalActions, summonCostAt } from "../src/rules.ts";
import { decodeSettings, defaultSettings, encodeSettings, settingsConfig } from "../src/settings.ts";
import { controlCount, createGame, makeCtx, opponent, unitByUid, unitHp } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import { checkRoundLimit, endTurn, performMulligan, startTurn } from "../src/turn.ts";
import type { Config, GameEvent, GameState, PlayerId } from "../src/types.ts";
import { makeAi } from "../src/ai/index.ts";
import { bestCounterOrder, withCounterOrder } from "../src/ai/counter-order.ts";
import { cardFaceHtml } from "../play/cards-view.ts";
import { nameplateHtml } from "../play/hud.ts";
import { blankState, place } from "./helpers.ts";

const AC: CardPack = loadPack(packPath("adopted-1003"));
const AD: CardPack = loadPack(packPath("adopted-0922"));
const r1003 = (over: Partial<Config> = {}): Ctx => makeCtx(presetConfig("r1003", over), AC);
const hpOf = (ctx: Ctx, s: GameState, uid: number): number => {
  const u = unitByUid(s, uid);
  return u === undefined ? 0 : unitHp(ctx, u);
};
const texts = (events: GameEvent[]): string[] => events.flatMap((e) => (e.t === "effect" ? [e.text] : []));

// ----------------------------------------------------------------- the pack

/** The 10/3 sheet: id, name, 召, 攻, HP, ATK, 霊力価, 陰陽, 範囲?, 間合い, 反撃間合い, 旧・隙, effect key. */
const SHEET: [string, string, number, number, number, number, number, string, boolean, string, string, string, string | undefined][] = [
  ["ac01", "灯籠の精", 3, 0, 4, 0, 1, "yang", false, "", "", "8", "ad01"],
  ["ac02", "提灯お化け", 3, 2, 3, 2, 1, "yin", false, "2", "2", "8", "tm02"],
  ["ac03", "影鬼", 3, 2, 3, 2, 1, "yin", false, "2", "2", "8", "tm03"],
  ["ac04", "鉞鬼", 3, 2, 3, 3, 1, "yang", false, "23", "3", "48", undefined],
  ["ac05", "古箪笥", 4, 0, 5, 0, 1, "yang", false, "", "", "8", "tm07"],
  ["ac06", "鎖鬼", 4, 2, 6, 2, 1, "yin", true, "126", "", "48", undefined],
  ["ac07", "変面", 5, 3, 7, 3, 1, "none", false, "13", "13", "8", "ac07"],
  ["ac08", "一角鬼", 5, 2, 8, 2, 1, "yin", false, "-1-2-32", "-1-2-3", "46", undefined],
  ["ac09", "一目鬼", 5, 3, 8, 3, 1, "yang", true, "246", "2", "138", "tm10"],
  ["ac10", "雲外鏡", 6, 3, 8, 2, 2, "none", false, "12346", "", "789", "tm11"],
  ["ac11", "照魔鏡", 6, 3, 8, 2, 2, "none", false, "12346", "", "789", "tm12"],
  ["ac12", "首引の姫鬼", 7, 3, 9, 3, 2, "yang", true, "123", "2", "78", "tm09"],
  ["ac13", "僵尸公主", 8, 3, 11, 4, 2, "yin", false, "1379", "2468", "", "ac13"],
  ["ac14", "両面", 7, 4, 8, 4, 2, "yang", true, "28", "28", "", undefined],
  ["ac15", "茨木童子", 8, 4, 9, 5, 2, "yin", false, "-223", "-223", "6", "ac15"],
  ["ac16", "酒呑童子", 9, 6, 11, 5, 2, "yang", true, "124", "12", "8", "ad16"],
  ["ac17", "玖龍街", 10, 3, 16, 2, 3, "none", true, "5x5ALL", "", "", "ac17"],
  ["ac18", "家鳴り", 2, 0, 0, 0, 0, "none", false, "", "", "", "sk18"],
  ["ac19", "マヨヒガ", 2, 0, 0, 0, 0, "none", false, "", "", "", "tm19"],
  ["ac20", "琵琶牧々", 6, 0, 0, 0, 0, "none", false, "", "", "", "tm20"],
  ["ac21", "茨木の左腕", 4, 0, 0, 0, 0, "none", false, "", "", "", "ad21"],
  ["ac22", "閻魔獄卒棒", 4, 0, 0, 0, 0, "none", false, "", "", "", "ad22"],
  ["ac23", "鬼の酒", 5, 0, 0, 0, 0, "none", false, "", "", "", "ac23"],
];

test("pack-adopted-1003 is the 10/3 sheet: 23 cards, one copy each, every number, range and effect key", () => {
  const raw = JSON.parse(readFileSync(packPath("adopted-1003"), "utf8")) as { cards: Record<string, unknown>[] };
  assert.equal(AC.cards.length, 23);
  assert.deepEqual(AC.deckList, SHEET.map((r) => r[0]));
  for (const [id, name, summon, attack, hp, atk, mv, attr, aoe, range, counter, blind, fx] of SHEET) {
    const c = AC.byId.get(id);
    assert.ok(c !== undefined, id);
    const r = raw.cards.find((x) => x.id === id)!;
    assert.deepEqual(
      [c.nameJa, c.summonCost, c.attackCost, c.hp, c.atk, c.manaValue, c.attribute, c.aoe, r.attackRange, r.counterRange, r.blindSpots, c.effect],
      [name, summon, attack, hp, atk, mv, attr, aoe, range, counter, blind, fx],
      id,
    );
    // 生命価 is off under r1003; the pack carries the same number (as adopted-0922 does)
    assert.equal(c.lifeValue, mv, id);
  }
  // the shapes the team decided on 10/3
  assert.equal(AC.byId.get("ac15")!.counterRange.length, 3, "茨木童子 counter -223");
  assert.equal(AC.byId.get("ac06")!.counterRange.length, 0, "鎖鬼 has no counter");
  assert.equal(AC.byId.get("ac17")!.attackRange.length, 24, "玖龍街 5x5ALL");
  assert.equal(AC.byId.get("ac17")!.counterRange.length, 0);
  assert.equal(AC.byId.get("ac17")!.blindSpots.length, 0);
  for (const c of AC.cards) assert.equal(c.clan, AD.byId.get(`ad${c.id.slice(2)}`)?.clan ?? "酒呑一門", c.id);
});

test("print numbers and art carry over from adopted-0922; 鬼の酒 has O-012 and no art, and its face renders", () => {
  for (const c of AC.cards) {
    if (c.id === "ac23") continue;
    const old = AD.byId.get(`ad${c.id.slice(2)}`)!;
    assert.equal(c.nameJa, old.nameJa);
    assert.equal(c.printId, old.printId, c.id);
    assert.deepEqual(c.art, old.art, c.id);
  }
  const sake = AC.byId.get("ac23")!;
  assert.equal(sake.printId, "O-012");
  assert.equal(sake.art, undefined);
  assert.equal(sake.kind, "reigu");
  const ctx = r1003();
  for (const size of ["sm", "md", "lg"] as const) {
    const face = cardFaceHtml(ctx, "ac23", { size });
    assert.ok(face.includes("鬼の酒"), size);
    assert.ok(!face.includes("has-art"), size);
  }
  // effect text for every card with an effect, none for the plain ones
  for (const c of AC.cards) assert.equal((EFFECT_TEXT[c.id] ?? "") !== "", c.effect !== undefined, c.id);
  assert.match(EFFECT_TEXT.ac20, /HP\+2/);
});

// ----------------------------------------------------------- the preset

test("r1003 = 10/3テスト案: the numbers, and it is the default for new rooms, the AI table and the settings page", () => {
  const cfg = presetConfig("r1003");
  assert.deepEqual(cfg.startMana, [6, 8]);
  assert.equal(cfg.baseIncome, 6);
  assert.deepEqual(cfg.chipIncomeSteps, [4, 5, 5]);
  assert.equal(cfg.taijiDiscount, 2);
  assert.equal(cfg.taijiFloor, 1);
  assert.equal(cfg.attrBonus, 2);
  assert.equal(cfg.blindBonus, 2);
  assert.equal(cfg.maxHp, 19);
  assert.equal(cfg.controlCount, "hp");
  assert.equal(cfg.controlCountThreshold, 11);
  assert.equal(cfg.controlWin, 5);
  // the paper rule (10/3): the 2nd 山札切れ ends the game; the 9/22 preset keeps none
  assert.equal(cfg.deckOutMode, "second");
  // 10/7: a kept 制圧 wins at the start of the next own turn
  assert.equal(cfg.controlHold, "next_turn_start");
  // everything else is r0923
  const base = presetConfig("r0923");
  assert.equal(base.deckOutMode, "none");
  const same = { ...cfg, chipIncomeSteps: base.chipIncomeSteps, taijiDiscount: base.taijiDiscount, maxHp: base.maxHp, controlCount: base.controlCount, controlHold: base.controlHold, deckOutMode: base.deckOutMode };
  assert.deepEqual(same, base);
  assert.equal(RULE_PRESETS.r1003.label, "10/3テスト案");
  assert.equal(RULE_PRESETS.r1003.defaultPack, "adopted-1003");
  assert.match(RULE_PRESETS.r1003.note, /4枚で7、5枚で9/);
  // income 6 -> 7 at 4 chips -> 9 at 5 chips
  const ctx = r1003();
  assert.deepEqual([0, 3, 4, 5, 6, 9].map((c) => incomeFor(ctx, c)), [6, 6, 7, 9, 9, 9]);
  // 太極 −2, floor 1
  const taiji = { x: 1, y: 1 };
  assert.equal(summonCostAt(ctx, AC.byId.get("ac03")!, taiji), 1);
  assert.equal(summonCostAt(ctx, AC.byId.get("ac17")!, taiji), 8);
  assert.equal(summonCostAt(ctx, AC.byId.get("ac17")!, { x: 0, y: 0 }), 10);
  // the defaults
  // 10/7決定 (10/6案 with the dial, chips 4/5 and 太極−1) is the default since the 10/7 test
  assert.equal(DEFAULT_RULE_PRESET, "r1007");
  assert.equal(RULE_PRESET_IDS[0], "r1007");
  assert.equal(PLAYABLE_PACKS[0], "adopted-1006");
  assert.deepEqual(presetConfig("r1006"), presetConfig("r1003"));
  const d = defaultSettings();
  assert.equal(d.rule, "r1007");
  assert.equal(d.pack, "adopted-1006");
  assert.deepEqual(settingsConfig(d), { ...cfg, incomeMode: "current", chipIncomeSteps: [4, 5], taijiDiscount: 1 });
  // the preset table does not move through a returned config
  cfg.chipIncomeSteps.push(9);
  assert.deepEqual(RULE_PRESETS.r1003.overrides.chipIncomeSteps, [4, 5, 5]);
});

test("an old share URL naming r0923 still opens r0923 with its own pack and numbers", () => {
  const text = encodeSettings({ rule: "r0923", pack: "adopted-0922", config: {}, cards: {} });
  const back = decodeSettings(text, () => AD);
  assert.ok(back.ok);
  assert.equal(back.value.rule, "r0923");
  assert.equal(back.value.pack, "adopted-0922");
  assert.deepEqual(settingsConfig(back.value).chipIncomeSteps, [3, 4]);
  assert.equal(settingsConfig(back.value).maxHp, 15);
  // and a 10/3 URL round-trips
  const now = decodeSettings(encodeSettings(defaultSettings()), () => AC);
  assert.ok(now.ok);
  assert.equal(now.value.rule, "r1007");
});

test("the ratchet accepts a repeated step (4,5,5) and says it as income", () => {
  const f = CONFIG_SCHEMA.find((x) => x.key === "chipIncomeSteps")!;
  const ok = parseConfigPatch({ chipIncomeSteps: [4, 5, 5] }, { midGame: true });
  assert.ok(ok.ok);
  assert.deepEqual(ok.value.chipIncomeSteps, [4, 5, 5]);
  const bad = parseConfigPatch({ chipIncomeSteps: [5, 4] }, { midGame: true });
  assert.ok(!bad.ok);
  assert.match(bad.error, /小さい順/);
  assert.equal(formatConfigValue(f, [4, 5, 5]), "4,5,5(4枚で+1・5枚で+3)");
  assert.equal(formatConfigValue(f, [3, 4]), "3,4");
  assert.equal(chipStepsText([4, 5, 5], 6), "4枚で7・5枚で9");
  // the name plate's step marks say the income they bring
  const ctx = r1003();
  const board = { units: [], players: [0, 1].map(() => ({ life: 15, mana: 6, chips: 4, reach: false, handCount: 5, deckCount: 17, grave: [], reshuffleCount: 0 })) as never, turnPlayer: 0 as PlayerId, round: 1, ended: false, winner: null, winType: null, summonsThisTurn: 0 };
  const plate = nameplateHtml(ctx, board, 0, ["あなた", "AI"], true);
  assert.match(plate, /data-chip="4" title="4枚で収入7"/);
  assert.match(plate, /data-chip="5" title="5枚で収入9"/);
});

test("占拠: a unit at HP 11 or more counts 2, and damage below 11 makes it 1", () => {
  const ctx = r1003();
  const s = blankState(ctx);
  const kuryu = place(s, "ac17", 0, 0, 0, 0); // HP 16
  place(s, "ac03", 0, 2, 0, 0); // HP 3
  assert.equal(controlCount(ctx, s, 0), 3);
  unitByUid(s, kuryu)!.damage = 5; // HP 11
  assert.equal(controlCount(ctx, s, 0), 3);
  unitByUid(s, kuryu)!.damage = 6; // HP 10
  assert.equal(controlCount(ctx, s, 0), 2);
});

// ------------------------------------------------------------ the effects

test("ac07 変面 (10/3): the heal on an ally restores the full ATK, past the card's HP (no per-unit max); the 9/22 card keeps ceil(ATK/2)", () => {
  const ctx = r1003();
  const build = (c: Ctx, hen: string, ally: string, damage: number): { s: GameState; h: number; a: number } => {
    const s = blankState(c, 10);
    const h = place(s, hen, 0, 1, 0, 0); // ATK 3, range front-left / front-right: (0,1) (2,1)
    const a = place(s, ally, 0, 0, 1, 0); // 提灯お化け, yin on a yin cell: HP 5
    unitByUid(s, a)!.damage = damage;
    return { s, h, a };
  };
  const b = build(ctx, "ac07", "ac02", 4); // HP 1
  assert.ok(canUseVariant(ctx, unitByUid(b.s, b.h)!, "heal"));
  assert.ok(legalActions(ctx, b.s).some((x) => x.kind === "attack" && x.uid === b.h && x.targetUid === b.a && x.variant === "heal"));
  const r = applyAction(ctx, b.s, { kind: "attack", uid: b.h, targetUid: b.a, variant: "heal" });
  assert.equal(hpOf(ctx, r.state, b.a), 1 + 3, "ATK 3 in full");
  assert.equal(r.state.players[0].mana, 10 - 3, "the attack cost");
  // no per-unit max: 4 + 3 goes past the card's 5
  const c = build(ctx, "ac07", "ac02", 1); // HP 4
  assert.equal(hpOf(ctx, applyAction(ctx, c.s, { kind: "attack", uid: c.h, targetUid: c.a, variant: "heal" }).state, c.a), 7);
  // the 9/22 変面 under r0923 still heals ceil(3/2) = 2
  const old = makeCtx(presetConfig("r0923"), AD);
  const o = build(old, "ad07", "ad02", 4);
  assert.equal(hpOf(old, applyAction(old, o.s, { kind: "attack", uid: o.h, targetUid: o.a, variant: "heal" }).state, o.a), 1 + 2);
  // effects off: no heal
  const off = makeCtx(presetConfig("r1003", { effects: false }), AC);
  assert.ok(!canUseVariant(off, unitByUid(build(off, "ac07", "ac02", 4).s, 1)!, "heal"));
  // the card says so
  assert.match(EFFECT_TEXT.ac07, /この式神のATK分だけ対象のHP\+/);
  assert.doesNotMatch(EFFECT_TEXT.ac07, /1\/2/);
  assert.match(EFFECT_TEXT.ad07, /1\/2\(切り上げ\)/);
});

test("ac15 茨木童子【再生】: HP+1 on every attack, free, before the counter (it survives a counter it would not have)", () => {
  const ctx = r1003();
  const s = blankState(ctx);
  const ibaraki = place(s, "ac15", 0, 0, 0, 0); // empty cell, HP 9; reaches (0,2) with its -2
  const ikkaku = place(s, "ac08", 1, 0, 2, 2); // 一角鬼 HP 8 facing south: counters (0,0) with its -2, ATK 2
  unitByUid(s, ibaraki)!.damage = 7; // HP 2: the counter 2 kills it unless 【再生】 comes first
  assert.ok(!canUseVariant(ctx, unitByUid(s, ibaraki)!, "regen"), "no paid variant any more");
  const mana = s.players[0].mana;
  const r = applyAction(ctx, s, { kind: "attack", uid: ibaraki, targetUid: ikkaku });
  assert.equal(r.state.players[0].mana, mana - 4, "the attack cost only");
  assert.equal(hpOf(ctx, r.state, ikkaku), 3);
  assert.equal(hpOf(ctx, r.state, ibaraki), 1, "2 + 1 (再生) - 2 (counter)");
  const order = r.events.map((e) => (e.t === "effect" && e.text.includes("再生") ? "regen" : e.t === "attack" ? "attack" : e.t)).filter((t) => t === "regen" || t === "attack");
  assert.deepEqual(order, ["regen", "attack"]);
  // at full HP it still grows (no per-unit max)
  const s2 = blankState(ctx);
  const ib2 = place(s2, "ac15", 0, 0, 0, 0);
  const ik2 = place(s2, "ac08", 1, 0, 2, 2);
  const r2 = applyAction(ctx, s2, { kind: "attack", uid: ib2, targetUid: ik2 });
  assert.equal(hpOf(ctx, r2.state, ib2), 8, "9 + 1, then the counter 2");
  assert.ok(texts(r2.events).includes("【再生】HP+1(反撃の前)"));
  // effects off: no regen, the counter kills it
  const off = makeCtx(presetConfig("r1003", { effects: false }), AC);
  const s3 = blankState(off);
  const ib3 = place(s3, "ac15", 0, 0, 0, 0);
  const ik3 = place(s3, "ac08", 1, 0, 2, 2);
  unitByUid(s3, ib3)!.damage = 7;
  const r3 = applyAction(off, s3, { kind: "attack", uid: ib3, targetUid: ik3 });
  assert.equal(unitByUid(r3.state, ib3), undefined);
});

test("ac17 玖龍街: its attack takes no blind bonus and no counter; it proxy-rotates and no longer locks rotate commands", () => {
  const ctx = r1003();
  const build = (c: Ctx): { s: GameState; kuryu: number; kage: number; ryomen: number } => {
    const s = blankState(c);
    const kuryu = place(s, "ac17", 0, 1, 1, 0); // 太極, hits every other cell
    const kage = place(s, "ac03", 1, 1, 2, 0); // 影鬼 on a yin cell (HP 5); its blind spot 8 is (1,1)
    const ryomen = place(s, "ac14", 1, 1, 0, 0); // 両面 on a yang cell (HP 10); counters (1,1) with its 2
    return { s, kuryu, kage, ryomen };
  };
  const b = build(ctx);
  const r = applyAction(ctx, b.s, { kind: "attack", uid: b.kuryu, targetUid: null });
  const ev = r.events.find((e) => e.t === "attack");
  assert.ok(ev !== undefined && ev.t === "attack");
  assert.deepEqual(ev.hits.map((h) => [h.uid, h.dmg, h.blind]), [[b.kage, 2, false], [b.ryomen, 2, false]]);
  assert.equal(ev.counterCount, 0);
  assert.equal(hpOf(ctx, r.state, b.kuryu), 16);
  // the same board without effects: blind +2 and 両面's counter
  const off = makeCtx(presetConfig("r1003", { effects: false }), AC);
  const o = build(off);
  const ro = applyAction(off, o.s, { kind: "attack", uid: o.kuryu, targetUid: null });
  const evo = ro.events.find((e) => e.t === "attack");
  assert.ok(evo !== undefined && evo.t === "attack");
  assert.deepEqual(evo.hits.map((h) => [h.uid, h.dmg, h.blind]), [[o.kage, 4, true], [o.ryomen, 2, false]]);
  assert.equal(evo.counterCount, 1);
  // rotate commands: the opponent may rotate; 玖龍街 turns another unit instead of itself
  const s = build(ctx).s;
  assert.ok(!rotateCommandLocked(ctx, s, 1));
  const other = { ...s, turnPlayer: 1 as PlayerId };
  assert.ok(isLegal(ctx, other, { kind: "rotate", uid: b.kage, facing: 1 }));
  assert.ok(legalActions(ctx, s).some((a) => a.kind === "proxyRotate" && a.uid === b.kuryu && a.targetUid === b.kage));
  // the 9/22 玖龍街 (tm17) still locks them under r0923
  const old = makeCtx(presetConfig("r0923"), AD);
  const so = blankState(old);
  place(so, "ad17", 0, 1, 1, 0);
  assert.ok(rotateCommandLocked(old, so, 1));
});

test("琵琶牧々 (tm20): every own unit HP+2, past the card's HP", () => {
  const ctx = r1003();
  const s = blankState(ctx);
  s.players[0].hand = ["ac20"];
  const a = place(s, "ac08", 0, 0, 0, 0); // HP 8
  const b = place(s, "ac03", 0, 2, 0, 0); // HP 3
  const e = place(s, "ac14", 1, 2, 2, 0);
  unitByUid(s, a)!.damage = 5;
  unitByUid(s, b)!.damage = 1;
  unitByUid(s, e)!.damage = 3;
  const r = applyAction(ctx, s, { kind: "reigu", handIndex: 0, targetUid: null, facing: null });
  assert.equal(r.state.players[0].mana, 20 - 6);
  assert.equal(hpOf(ctx, r.state, a), 5);
  assert.equal(hpOf(ctx, r.state, b), 4, "2 + 2: past the card's 3");
  assert.equal(hpOf(ctx, r.state, e), 5, "the enemy is untouched");
});

test("ac23 鬼の酒: HP set to 10 on any shikigami (ally or enemy, up or down), 15 on【飲酒】, never above maxHp; a no-op is not legal", () => {
  const ctx = r1003();
  const s = blankState(ctx);
  s.players[0].hand = ["ac23"];
  const kage = place(s, "ac03", 0, 0, 0, 0); // HP 3 (max 3)
  const shuten = place(s, "ac16", 0, 2, 0, 0); // 酒呑童子 HP 11 (yang on a corner: no bonus)
  const kuryu = place(s, "ac17", 1, 2, 2, 2); // enemy 玖龍街 HP 16
  const use = (c: Ctx, st: GameState, targetUid: number) => applyAction(c, st, { kind: "reigu", handIndex: 0, targetUid, facing: null });
  // a small ally goes past its printed max
  const r1 = use(ctx, s, kage);
  assert.equal(r1.state.players[0].mana, 15);
  assert.equal(hpOf(ctx, r1.state, kage), 10);
  assert.ok(texts(r1.events).some((t) => t.includes("鬼の酒") && t.includes("3→10")));
  const ev = r1.events.find((e) => e.t === "reigu");
  assert.ok(ev !== undefined && ev.t === "reigu" && ev.cardId === "ac23" && ev.targetUid === kage);
  // 【飲酒】: 15, and it counts 2 for 占拠 (it already did at 11)
  unitByUid(s, shuten)!.damage = 8; // HP 4
  const r2 = use(ctx, s, shuten);
  assert.equal(hpOf(ctx, r2.state, shuten), 15);
  // an enemy 玖龍街 comes down to 10 and stops counting 2
  assert.equal(controlCount(ctx, s, 1), 2);
  const r3 = use(ctx, s, kuryu);
  assert.equal(hpOf(ctx, r3.state, kuryu), 10);
  assert.equal(controlCount(ctx, r3.state, 1), 1);
  // a no-op is not a legal use; a hidden unit cannot be chosen
  unitByUid(s, kage)!.damage = -7; // HP 10 already
  assert.ok(!isLegal(ctx, s, { kind: "reigu", handIndex: 0, targetUid: kage, facing: null }));
  unitByUid(s, kage)!.damage = 0;
  unitByUid(s, kage)!.hiddenBy = 1;
  assert.ok(!isLegal(ctx, s, { kind: "reigu", handIndex: 0, targetUid: kage, facing: null }));
  unitByUid(s, kage)!.hiddenBy = null;
  // capped by the board's HP cap
  const low = makeCtx(presetConfig("r1003", { maxHp: 12 }), AC);
  const r4 = use(low, s, shuten);
  assert.equal(hpOf(low, r4.state, shuten), 12);
  // effects off: a dead card
  const off = makeCtx(presetConfig("r1003", { effects: false }), AC);
  assert.ok(!isLegal(off, s, { kind: "reigu", handIndex: 0, targetUid: kage, facing: null }));
});

// ------------------------------------------------------------ AI legality

const playChecked = (ctx: Ctx, kinds: [string, string], seed: number): { events: GameEvent[]; state: GameState } => {
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
      const act = a.kind === "attack" ? withCounterOrder(ctx, s, a, ais[opponent(s.turnPlayer)].counterOrder ?? bestCounterOrder) : a;
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
  return { events, state: s };
};

test("AI legality: greedy / beam / strong play r1003 + adopted-1003 with legal inputs only, 鬼の酒 included", () => {
  const ctx = r1003();
  const seen = new Set<string>();
  const runs: [[string, string], number][] = [
    [["greedy", "greedy"], 120],
    [["beam", "greedy"], 20],
    [["strong", "greedy"], 6],
    [["greedy", "strong"], 4],
  ];
  let games = 0;
  for (const [kinds, n] of runs) {
    for (let i = 0; i < n; i++) {
      const { events, state } = playChecked(ctx, kinds, 31000 + games);
      games += 1;
      assert.ok(state.ended);
      for (const e of events) if (e.t === "reigu") seen.add(e.cardId);
    }
  }
  for (const id of ["ac20", "ac21", "ac22", "ac23"]) assert.ok(seen.has(id), `${id} never used in ${games} games`);
});
