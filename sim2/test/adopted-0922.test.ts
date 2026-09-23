// 採用ルール 9/22 (r0923) with pack-adopted-0922: the pack against the team's
// sheet (sim2/out/adopted-0922-spec.json), the preset and the defaults, every
// new or changed effect, 霊力価 as the destruction reward, no life, the 案A
// counter order (engine, flow replay) and AI legality over seeded games.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { applyCardOverrides } from "../src/card-overrides.ts";
import { CARD_STATS } from "../src/card-overrides.ts";
import { cardOf, parseTenkey } from "../src/cards.ts";
import type { CardPack } from "../src/cards.ts";
import { counterersOf, killReward } from "../src/combat.ts";
import { commandsFor } from "../src/commands.ts";
import { counterOrderChoice, counterOrderOutcomes } from "../src/counter-order.ts";
import { EFFECT_TEXT } from "../src/effects.ts";
import { createFlow, replayFlow, submit } from "../src/flow.ts";
import type { Flow, FlowPhase } from "../src/flow.ts";
import { parseAction } from "../src/input-parse.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { PLAYABLE_PACKS, presetConfig, RULE_PRESET_IDS, RULE_PRESETS } from "../src/presets.ts";
import { legalEntries } from "../src/preview.ts";
import { applyAction, incomeFor, isLegal, legalActions } from "../src/rules.ts";
import { changedItemCount, decodeSettings, defaultSettings, encodeSettings, parseSettings, settingsConfig, settingsPack } from "../src/settings.ts";
import { makeCtx, unitByUid, unitHp } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import { checkRoundLimit, endTurn, performMulligan, startTurn } from "../src/turn.ts";
import type { Action, Config, GameEvent, GameState, PlayerId } from "../src/types.ts";
import { makeAi } from "../src/ai/index.ts";
import type { AiSeat } from "../src/ai/index.ts";
import { playMainPhase } from "../src/runner.ts";
import { aiStep } from "./online-helpers.ts";
import { bestCounterOrder, withCounterOrder } from "../src/ai/counter-order.ts";
import { blankState, place } from "./helpers.ts";
import { SK } from "./online-helpers.ts";
import { bothKeep, flowOf, newApp, seatTwo, send, testRecordDir, view } from "./online-api-helpers.ts";
import { promptHtml } from "../play/prompt-view.ts";
import { nameplateHtml } from "../play/hud.ts";
import { cardFaceHtml } from "../play/cards-view.ts";
import { describeEvent } from "../play/render.ts";
import { createGame, opponent } from "../src/state.ts";

const AD: CardPack = loadPack(packPath("adopted-0922"));
const ONLINE_DIR = testRecordDir("adopted");
test.after(() => {
  if (existsSync(ONLINE_DIR)) rmSync(ONLINE_DIR, { recursive: true, force: true });
});
const r0923 = (over: Partial<Config> = {}, pack: CardPack = AD): Ctx => makeCtx(presetConfig("r0923", over), pack);
const hpOf = (ctx: Ctx, s: GameState, uid: number): number => {
  const u = unitByUid(s, uid);
  return u === undefined ? 0 : unitHp(ctx, u);
};
const effects = (events: GameEvent[]): string[] => events.flatMap((e) => (e.t === "effect" ? [e.text] : []));

// ----------------------------------------------------------------- the pack

type SpecCard = {
  no: number;
  kind: string;
  clan: string;
  name: string;
  summonCost: number;
  attackCost: number | string;
  manaValue_霊力価: number | null;
  hp: number;
  atk: number | string;
  attribute: string;
  attackType: string | null;
  targets: string | null;
  attackRange: number | string | null;
  counterRange: number | string | null;
  blindSpots: number | string | null;
};
const SPEC = JSON.parse(readFileSync(new URL("../out/adopted-0922-spec.json", import.meta.url), "utf8")) as { cards: SpecCard[] };
const NONE = new Set(["ｰ", "-", "なし", "ー", "−", ""]);
const num = (v: number | string | null): number => (v === null || (typeof v === "string" && NONE.has(v.trim())) ? 0 : Number(v));
const cells = (v: number | string | null): string => (v === null || NONE.has(String(v).trim()) ? "" : String(v).replaceAll("−", "-"));
const sameSet = (a: { x: number; y: number }[], b: { x: number; y: number }[]): boolean =>
  a.length === b.length && a.every((c) => b.some((d) => d.x === c.x && d.y === c.y));

test("pack-adopted-0922 is the sheet: 22 cards, one copy each, every number, clan, attribute and range", () => {
  assert.equal(AD.cards.length, 22);
  assert.equal(AD.deckList.length, 22);
  const attr: Record<string, string> = { 陰: "yin", 陽: "yang", 空: "none", 霊具: "none" };
  for (const sc of SPEC.cards) {
    const c = cardOf(AD, `ad${String(sc.no).padStart(2, "0")}`);
    const where = `No.${sc.no} ${sc.name}`;
    assert.equal(c.nameJa, sc.name, where);
    assert.equal(c.clan, sc.clan, where);
    assert.equal(c.kind, sc.kind === "霊具" ? "reigu" : "shikigami", where);
    assert.equal(c.summonCost, sc.summonCost, where);
    assert.equal(c.attackCost, num(sc.attackCost), where);
    assert.equal(c.atk, num(sc.atk), where);
    assert.equal(c.hp, sc.hp, where);
    assert.equal(c.manaValue, sc.manaValue_霊力価 ?? 0, where);
    assert.equal(c.attribute, attr[sc.attribute], where);
    if (c.kind === "shikigami") {
      assert.equal(c.attackType, sc.attackType === "物" ? "phys" : "jutsu", where);
      assert.equal(c.aoe, sc.targets === "範囲", where);
      assert.ok(sameSet(c.attackRange, parseTenkey(cells(sc.attackRange))), `${where} attack range`);
      assert.ok(sameSet(c.counterRange, parseTenkey(cells(sc.counterRange))), `${where} counter range`);
      assert.ok(sameSet(c.blindSpots, parseTenkey(cells(sc.blindSpots))), `${where} blind spots`);
    }
  }
  // 茨木童子 (O-008) after the 9/23 shape revision: attack two-ahead centre and
  // right plus front and front-right, counter unchanged (the sheet writes it
  // with a Unicode minus), blind spot on the left (was the right)
  const ibaraki = cardOf(AD, "ad15");
  assert.deepEqual(ibaraki.attackRange, [{ x: 0, y: 2 }, { x: 1, y: 2 }, { x: 0, y: 1 }, { x: 1, y: 1 }]);
  assert.ok(sameSet(ibaraki.counterRange, parseTenkey("-223")));
  assert.deepEqual(ibaraki.blindSpots, [{ x: -1, y: 0 }]);
  assert.equal(ibaraki.counterFollowsAttack, false);
  // No.4 鉞鬼 replaces 爪鬼, 鬼の酒 is not in the deck
  assert.equal(cardOf(AD, "ad04").nameJa, "鉞鬼");
  assert.ok(!AD.cards.some((c) => c.nameJa === "鬼の酒" || c.nameJa === "爪鬼"));
  // every card with an effect has its text; 鉞鬼・鎖鬼・一角鬼・両面 have none
  for (const c of AD.cards) {
    const hasEffect = c.effect !== undefined;
    assert.equal((EFFECT_TEXT[c.id] ?? "").length > 0, hasEffect, c.id);
  }
});

test("霊力価 is a card stat: older packs default it to the half_floor reward, the editor lists it", () => {
  assert.ok(CARD_STATS.some((s) => s.key === "manaValue" && s.label === "霊力価"));
  for (const c of SK.cards) assert.equal(c.manaValue, c.kind === "reigu" ? 0 : Math.floor(c.summonCost / 2), c.id);
  const edited = applyCardOverrides(AD, { ad15: { manaValue: 5 } });
  assert.equal(cardOf(edited, "ad15").manaValue, 5);
  assert.equal(killReward(r0923({}, edited), cardOf(edited, "ad15")), 5);
  // killRewardBase "card" on an old pack pays what half_floor paid
  const sk = makeCtx(presetConfig("r0914", { killRewardBase: "card" }), SK);
  const half = makeCtx(presetConfig("r0914"), SK);
  for (const c of SK.cards) if (c.kind === "shikigami") assert.equal(killReward(sk, c), killReward(half, c), c.id);
});

test("the share URL carries 霊力価 edits and the ratchet steps, and restores them against the pack", () => {
  const s = { rule: "r0923" as const, pack: "adopted-0922" as const, config: { chipIncomeSteps: [3, 5] }, cards: { ad15: { manaValue: 4 } } };
  const text = encodeSettings(s);
  const back = decodeSettings(text, () => AD);
  assert.ok(back.ok);
  assert.deepEqual(back.value.cards, { ad15: { manaValue: 4 } });
  assert.deepEqual(settingsConfig(back.value).chipIncomeSteps, [3, 5]);
  const pack = settingsPack(back.value, AD);
  assert.equal(cardOf(pack, "ad15").manaValue, 4);
  assert.equal(changedItemCount(back.value), 2);
  // an out-of-range 霊力価 is refused like any other stat
  assert.equal(parseSettings({ ...s, cards: { ad15: { manaValue: 16 } } }, () => AD).ok, false);
  assert.equal(parseSettings({ ...s, cards: { ad21: { manaValue: 2 } } }, () => AD).ok, false, "a reigu has only its use cost");
});

// ------------------------------------------------------ preset and defaults

test("r0923 = 採用ルール 9/22, and it is the default for new rooms and the AI table (older presets kept)", () => {
  const cfg = presetConfig("r0923");
  assert.deepEqual(cfg.startMana, [6, 8]);
  assert.equal(cfg.baseIncome, 6);
  assert.deepEqual(cfg.chipIncomeSteps, [3, 4], "ratchets at 3 and 4 chips (decided 9/23)");
  assert.equal(cfg.taijiDiscount, 1);
  assert.equal(cfg.attrBonus, 2);
  assert.equal(cfg.blindBonus, 2);
  assert.equal(cfg.maxHp, 15);
  assert.equal(cfg.manaCap, 15);
  assert.equal(cfg.roundLimit, presetConfig("r0914").roundLimit);
  assert.equal(cfg.lifeValueEnabled, false);
  assert.equal(cfg.killRewardBase, "card");
  assert.equal(cfg.refundMode, "killer_half");
  assert.equal(cfg.counterMode, "all");
  assert.equal(cfg.counterResolve, "chosen");
  assert.equal(cfg.effects, true);
  // income 6 -> 7 -> 8 with the ratchets at 3 and 4 chips (decided 9/23)
  const ctx = r0923();
  assert.deepEqual([0, 2, 3, 4, 5, 9].map((chips) => incomeFor(ctx, chips)), [6, 6, 7, 8, 8, 8]);
  assert.match(RULE_PRESETS.r0923.note, /3枚で7、4枚で8/);
  // defaults
  const d = defaultSettings();
  assert.equal(d.rule, "r0923");
  assert.equal(d.pack, "adopted-0922");
  assert.deepEqual(settingsConfig(d), cfg);
  assert.equal(RULE_PRESET_IDS[0], "r0923");
  for (const id of ["r0914", "r0913", "r0828"] as const) assert.ok(RULE_PRESET_IDS.includes(id));
  for (const p of ["shuten-kyuryu", "tsukumo-miyako", "kyubi-ryu"] as const) assert.ok(PLAYABLE_PACKS.includes(p));
  // the older presets did not move
  assert.equal(presetConfig("r0914").counterResolve, "sum");
  assert.equal(presetConfig("r0914").killRewardBase, "half_floor");
  assert.equal(presetConfig("r0914").lifeValueEnabled, true);
});

// ------------------------------------------------ destruction: 霊力価, no life

test("destroying a unit pays its 霊力価 to the destroyer; no life is lost and life 0 is no loss", () => {
  const ctx = r0923();
  const s = blankState(ctx, 10);
  s.players[1].life = 1;
  const axe = place(s, "ad04", 0, 0, 0, 0); // 鉞鬼 ATK3, range front + front-right: (0,1) (1,1)
  const ibaraki = place(s, "ad15", 1, 1, 1, 0); // 茨木童子 on 太極, 霊力価 3
  unitByUid(s, ibaraki)!.damage = 7; // HP 2
  const r = applyAction(ctx, s, { kind: "attack", uid: axe, targetUid: ibaraki });
  const d = r.events.find((e) => e.t === "destroy");
  assert.ok(d !== undefined && d.t === "destroy");
  assert.equal(d.lifeLoss, 0);
  assert.equal(d.manaGain, 3);
  assert.equal(d.manaTo, 0);
  assert.equal(r.state.players[0].mana, 10 - 2 + 3);
  assert.equal(r.state.players[1].mana, 10);
  assert.equal(r.state.players[1].life, 1);
  assert.equal(r.state.ended, false);
});

test("destruction without a destroyer follows refundMode: a 渾身 self-kill pays nobody", () => {
  const ctx = r0923();
  const s = blankState(ctx, 10);
  const hime = place(s, "ad12", 0, 0, 0, 0); // 首引の姫鬼 area 123
  unitByUid(s, hime)!.damage = 6; // HP 1
  place(s, "ad14", 1, 1, 1, 0); // 両面 on 太極 (front-right), faces away: no counter
  const r = applyAction(ctx, s, { kind: "attack", uid: hime, targetUid: null, variant: "konshin" });
  const d = r.events.find((e) => e.t === "destroy" && e.uid === hime);
  assert.ok(d !== undefined && d.t === "destroy");
  assert.equal(d.killer, null);
  assert.equal(d.manaGain, 0);
});

// ----------------------------------------------------------------- effects

test("ad01 灯籠の精: on death +2 HP to the priciest surviving ally (tm01 stays +1)", () => {
  const ctx = r0923();
  const s = blankState(ctx, 10);
  const ib = place(s, "ad15", 0, 0, 0, 0); // 茨木童子 ATK5, range (0,2) (1,2) (0,1) (1,1)
  const toro = place(s, "ad01", 1, 0, 2, 2); // HP4 corner
  const ryomen = place(s, "ad14", 1, 2, 2, 2); // cost 7, damaged 3
  const cheap = place(s, "ad03", 1, 2, 0, 0); // cost 3, damaged 1
  unitByUid(s, ryomen)!.damage = 3;
  unitByUid(s, cheap)!.damage = 1;
  const r = applyAction(ctx, s, { kind: "attack", uid: ib, targetUid: toro });
  assert.equal(unitByUid(r.state, toro), undefined);
  assert.equal(unitByUid(r.state, ryomen)!.damage, 1);
  assert.equal(unitByUid(r.state, cheap)!.damage, 1);
  assert.ok(effects(r.events).some((t) => t.includes("灯籠の精") && t.includes("HP+2")));
});

test("ad07 変面: the heal-instead-of-attack restores ceil(ATK/2)", () => {
  const ctx = r0923();
  const s = blankState(ctx, 10);
  const hen = place(s, "ad07", 0, 1, 0, 0); // ATK3, range front-left / front-right: (0,1) (2,1)
  const ally = place(s, "ad02", 0, 0, 1, 0); // 提灯 yin on a yin cell: HP 5
  unitByUid(s, ally)!.damage = 3;
  const r = applyAction(ctx, s, { kind: "attack", uid: hen, targetUid: ally, variant: "heal" });
  assert.equal(hpOf(ctx, r.state, ally), 2 + 2);
  assert.ok(legalActions(ctx, s).some((a) => a.kind === "attack" && a.variant === "heal"));
});

test("ad13 僵尸公主: moves into the cell of a unit it destroys by an attack", () => {
  const ctx = r0923();
  const s = blankState(ctx, 10);
  const k = place(s, "ad13", 0, 1, 1, 0); // diagonals from 太極
  const v = place(s, "ad03", 1, 2, 2, 0); // 影鬼 HP3
  const r = applyAction(ctx, s, { kind: "attack", uid: k, targetUid: v });
  assert.deepEqual(unitByUid(r.state, k)!.pos, { x: 2, y: 2 });
  assert.equal(unitByUid(r.state, k)!.facing, 0);
});

/**
 * 一目鬼 (p0, HP set to 4) on the yang cell hits 僵尸公主 (太極) and 両面 (corner);
 * both survive and both counter for 3. Whoever lands the kill decides whether
 * 僵尸公主 moves: the order is the countering side's.
 */
const counterScene = (attackerHp = 4): { ctx: Ctx; s: GameState; atk: number; kyonshi: number; ryomen: number } => {
  const ctx = r0923();
  const s = blankState(ctx, 10);
  const atk = place(s, "ad09", 0, 1, 0, 0); // 一目鬼 area: front (1,1), left (0,0), right (2,0)
  const kyonshi = place(s, "ad13", 1, 1, 1, 0); // counter range front/left/right/back: (1,0) included
  const ryomen = place(s, "ad14", 1, 2, 0, 3); // faces west: its front is (1,0)
  const u = unitByUid(s, atk)!;
  u.damage = unitHp(ctx, u) - attackerHp;
  return { ctx, s, atk, kyonshi, ryomen };
};

test("案A: every eligible defender counters, one at a time in the chosen order; 僵尸公主 moves when its counter lands the kill", () => {
  const { ctx, s, atk, kyonshi, ryomen } = counterScene();
  const a: Extract<Action, { kind: "attack" }> = { kind: "attack", uid: atk, targetUid: null };
  assert.deepEqual(new Set(counterersOf(ctx, s, a)), new Set([kyonshi, ryomen]));
  const last = applyAction(ctx, s, { ...a, counterOrder: [ryomen, kyonshi] });
  assert.equal(unitByUid(last.state, atk), undefined);
  assert.deepEqual(unitByUid(last.state, kyonshi)!.pos, { x: 1, y: 0 }, "僵尸 lands the kill and steps in");
  assert.ok(last.events.some((e) => e.t === "move" && e.uid === kyonshi));
  const first = applyAction(ctx, s, { ...a, counterOrder: [kyonshi, ryomen] });
  assert.equal(unitByUid(first.state, atk), undefined);
  assert.deepEqual(unitByUid(first.state, kyonshi)!.pos, { x: 1, y: 1 }, "両面 lands it: nobody moves");
  // the kill pays the attacker's 霊力価 to the countering side either way
  for (const r of [first, last]) {
    const d = r.events.find((e) => e.t === "destroy" && e.uid === atk);
    assert.ok(d !== undefined && d.t === "destroy" && d.manaTo === 1 && d.manaGain === 2);
  }
  // the order is a real choice here, and only a permutation of the counterers is legal
  assert.notEqual(counterOrderChoice(ctx, s, a), null);
  assert.ok(isLegal(ctx, s, { ...a, counterOrder: [kyonshi, ryomen] }));
  for (const bad of [[kyonshi], [kyonshi, kyonshi], [kyonshi, ryomen, atk], [ryomen, 999]]) {
    assert.ok(!isLegal(ctx, s, { ...a, counterOrder: bad }), JSON.stringify(bad));
  }
});

test("案A: once the attacker is destroyed the remaining counters are skipped", () => {
  const { ctx, s, atk, kyonshi, ryomen } = counterScene(3);
  const r = applyAction(ctx, s, { kind: "attack", uid: atk, targetUid: null, counterOrder: [ryomen, kyonshi] });
  const ev = r.events.find((e) => e.t === "attack");
  assert.ok(ev !== undefined && ev.t === "attack");
  assert.equal(ev.counterCount, 1);
  assert.deepEqual(ev.counterUids, [ryomen]);
  assert.equal(ev.attackerDestroyed, true);
  assert.deepEqual(unitByUid(r.state, kyonshi)!.pos, { x: 1, y: 1 });
  // the same board under the older summed counters: both land, the kill is simultaneous
  const sum = makeCtx({ ...ctx.cfg, counterResolve: "sum" }, AD);
  const rs = applyAction(sum, s, { kind: "attack", uid: atk, targetUid: null });
  const es = rs.events.find((e) => e.t === "attack");
  assert.ok(es !== undefined && es.t === "attack" && es.counterCount === 2 && es.counterTotal === 6);
});

test("案A: no choice is asked when every order gives the same board; jutsu units do not counter", () => {
  const ctx = r0923();
  const s = blankState(ctx, 10);
  const atk = place(s, "ad09", 0, 1, 0, 0);
  place(s, "ad07", 1, 1, 1, 2); // 変面 faces south: front-left / front-right are (2,0) (0,0)... not (1,0)
  const a = place(s, "ad14", 1, 2, 0, 3); // 両面 counters
  const b = place(s, "ad14", 1, 0, 0, 1); // (0,0) facing east: 両面 counters too
  const ctx2 = makeCtx(ctx.cfg, AD);
  const act = { kind: "attack" as const, uid: atk, targetUid: null };
  assert.deepEqual(new Set(counterersOf(ctx2, s, act)), new Set([a, b]));
  assert.equal(counterOrderChoice(ctx2, s, act), null, "two plain counters: the order changes nothing");
  // a jutsu unit that would otherwise counter stays silent under "chosen"
  const jutsu = makeCtx(ctx.cfg, applyCardOverrides(AD, { ad14: { attackType: "jutsu" } }));
  assert.deepEqual(counterersOf(jutsu, s, act), []);
});

test("ad15 茨木童子【再生】: 1 more mana, HP+1 after the exchange (counters included), capped at its max", () => {
  const ctx = r0923();
  const s = blankState(ctx, 10);
  const ib = place(s, "ad15", 0, 0, 0, 0); // HP 9, range (0,2) (1,2) (0,1) (1,1)
  const foe = place(s, "ad14", 1, 0, 1, 2); // 両面 on the yin cell (HP 6), faces south: counters (0,0)
  const unit = unitByUid(s, ib)!;
  unit.damage = 2;
  const regen = applyAction(ctx, s, { kind: "attack", uid: ib, targetUid: foe, variant: "regen" });
  const plain = applyAction(ctx, s, { kind: "attack", uid: ib, targetUid: foe });
  assert.equal(regen.state.players[0].mana, 10 - 4);
  assert.equal(plain.state.players[0].mana, 10 - 3);
  assert.equal(hpOf(ctx, plain.state, ib), 7 - 3);
  assert.equal(hpOf(ctx, regen.state, ib), 7 - 3 + 1);
  const cmd = commandsFor(ctx, s)[String(ib)].find((c) => c.id === "regen");
  assert.ok(cmd !== undefined && cmd.enabled && cmd.cost === 4);
  // not payable with 3 mana
  s.players[0].mana = 3;
  assert.ok(!legalActions(ctx, s).some((a) => a.kind === "attack" && a.variant === "regen"));
  assert.ok(legalActions(ctx, s).some((a) => a.kind === "attack" && a.uid === ib && (a.variant ?? "normal") === "normal"));
  // the old 茨木 (tm15) keeps its free re-attack regeneration and has no paid variant
  const old = makeCtx(presetConfig("r0914"), SK);
  const so = blankState(old, 10);
  const oib = place(so, "sk15", 0, 1, 1, 0);
  assert.equal(commandsFor(old, so)[String(oib)].some((c) => c.id === "regen"), false);
});

test("ad16 酒呑童子【飲酒】: 2 more mana, ATK+1 on every target of that attack", () => {
  const ctx = r0923();
  const s = blankState(ctx, 10);
  const shuten = place(s, "ad16", 0, 1, 1, 0); // area 124: (0,2) (1,2) (0,1)
  const a = place(s, "ad14", 1, 0, 2, 0);
  const b = place(s, "ad13", 1, 1, 2, 0);
  const r = applyAction(ctx, s, { kind: "attack", uid: shuten, targetUid: null, variant: "drink" });
  const ev = r.events.find((e) => e.t === "attack");
  assert.ok(ev !== undefined && ev.t === "attack");
  assert.deepEqual(ev.hits.map((h) => h.dmg), [5, 5]);
  assert.equal(ev.cost, 3 + 2);
  const pv = legalEntries(ctx, s).find((e) => e.action.kind === "attack" && e.action.variant === "drink");
  assert.ok(pv?.preview?.kind === "attack" && pv.preview.hits.every((h) => h.dmg === 5) && pv.preview.cost === 5);
  assert.ok(a !== b);
});

test("ad21 茨木の左腕: 3 damage to the nearest enemy ahead; 【拳】 pushes it away, 【握】 pulls it in, only into an empty cell", () => {
  const ctx = r0923();
  const arm = (s: GameState): number => {
    s.players[0].hand = ["ad21"];
    return 0;
  };
  // 拳: the enemy right in front goes one cell further
  let s = blankState(ctx, 10);
  const user = place(s, "ad04", 0, 1, 0, 0);
  const foe = place(s, "ad14", 1, 1, 1, 2); // 両面 (yang) on 太極: HP 8
  arm(s);
  const ken = applyAction(ctx, s, { kind: "reigu", handIndex: 0, targetUid: user, facing: null, mode: "ken" });
  assert.deepEqual(unitByUid(ken.state, foe)!.pos, { x: 1, y: 2 });
  assert.equal(unitByUid(ken.state, foe)!.facing, 2, "keeps its facing");
  assert.equal(hpOf(ctx, ken.state, foe), 8 - 2 - 3, "the yin cell takes 2 off its max at once");
  assert.equal(ken.state.players[0].mana, 10 - 4);
  // no counter to the user
  assert.equal(unitByUid(ken.state, user)!.damage, 0);
  // 握 from the same spot has nowhere to go (the user stands there)
  const aku = applyAction(ctx, s, { kind: "reigu", handIndex: 0, targetUid: user, facing: null, mode: "aku" });
  assert.deepEqual(unitByUid(aku.state, foe)!.pos, { x: 1, y: 1 });
  assert.equal(hpOf(ctx, aku.state, foe), 8 - 3);
  // 握: an enemy two cells ahead, past an ally that does not block, stays when the cell is taken
  s = blankState(ctx, 10);
  const u2 = place(s, "ad04", 0, 1, 0, 0);
  const far = place(s, "ad14", 1, 1, 2, 2);
  arm(s);
  const pulled = applyAction(ctx, s, { kind: "reigu", handIndex: 0, targetUid: u2, facing: null, mode: "aku" });
  assert.deepEqual(unitByUid(pulled.state, far)!.pos, { x: 1, y: 1 });
  place(s, "ad03", 0, 1, 1, 0); // an ally in between: still the enemy behind it is struck
  const blocked = applyAction(ctx, s, { kind: "reigu", handIndex: 0, targetUid: u2, facing: null, mode: "aku" });
  assert.deepEqual(unitByUid(blocked.state, far)!.pos, { x: 1, y: 2 });
  assert.equal(hpOf(ctx, blocked.state, far), 6 - 3);
  // destroyed by the blow: nothing moves, the user's side takes the 霊力価
  s = blankState(ctx, 10);
  const u3 = place(s, "ad04", 0, 1, 0, 0);
  const weak = place(s, "ad03", 1, 1, 1, 2);
  arm(s);
  const kill = applyAction(ctx, s, { kind: "reigu", handIndex: 0, targetUid: u3, facing: null, mode: "ken" });
  assert.equal(unitByUid(kill.state, weak), undefined);
  assert.ok(!kill.events.some((e) => e.t === "move"));
  assert.equal(kill.state.players[0].mana, 10 - 4 + 1);
  // pushed onto a cell that takes its last HP: destroyed there, by the user
  s = blankState(ctx, 10);
  const u4 = place(s, "ad04", 0, 1, 0, 0);
  const frail = place(s, "ad14", 1, 1, 1, 2);
  unitByUid(s, frail)!.damage = 3; // HP 5 -> 2 after the blow -> 0 on the yin cell
  arm(s);
  const pushedDead = applyAction(ctx, s, { kind: "reigu", handIndex: 0, targetUid: u4, facing: null, mode: "ken" });
  assert.equal(unitByUid(pushedDead.state, frail), undefined);
  const d = pushedDead.events.find((e) => e.t === "destroy");
  assert.ok(d !== undefined && d.t === "destroy" && d.killer === 0 && d.manaGain === 2);
  // legality: needs an enemy ahead, needs a mode, and offers both modes
  s = blankState(ctx, 10);
  const lonely = place(s, "ad04", 0, 1, 0, 0);
  place(s, "ad14", 1, 0, 2, 0); // not in the forward line
  arm(s);
  assert.ok(!legalActions(ctx, s).some((a) => a.kind === "reigu"));
  place(s, "ad03", 1, 1, 2, 0);
  const modes = legalActions(ctx, s).flatMap((a) => (a.kind === "reigu" ? [a.mode] : []));
  assert.deepEqual(modes.sort(), ["aku", "ken"]);
  assert.ok(!isLegal(ctx, s, { kind: "reigu", handIndex: 0, targetUid: lonely, facing: null }));
  // the preview says the same as the result
  const pv = legalEntries(ctx, s).find((e) => e.action.kind === "reigu" && e.action.mode === "aku");
  assert.ok(pv?.preview?.kind === "reigu");
  assert.equal(pv.preview.hits.length, 1);
  assert.deepEqual(pv.preview.moves.map((m) => m.to), [{ x: 1, y: 1 }]);
});

test("ad22 閻魔獄卒棒: an own 酒呑一門 unit; one enemy next to it (diagonals too) outside its blind spots; 5 damage, no counter", () => {
  const ctx = r0923();
  const s = blankState(ctx, 10);
  const shuten = place(s, "ad16", 0, 2, 2, 1); // 酒呑一門 in the corner facing east: its blind spot (behind) is (1,2)
  const behind = place(s, "ad14", 1, 1, 2, 0);
  const diag = place(s, "ad13", 1, 1, 1, 0); // 僵尸公主 on 太極, diagonal to it
  const side = place(s, "ad14", 1, 2, 1, 2); // 両面 below it, facing it: an attack would draw its counter
  const kuryu = place(s, "ad07", 0, 0, 0, 0); // 変面: 玖龍街一門
  place(s, "ad03", 1, 0, 1, 0); // next to 変面 only, but 変面 cannot use it
  s.players[0].hand = ["ad22"];
  const victims = legalActions(ctx, s).flatMap((a) => (a.kind === "reigu" ? [[a.targetUid, a.victimUid]] : []));
  assert.deepEqual(new Set(victims.map((v) => v[1])), new Set([diag, side]));
  assert.ok(victims.every((v) => v[0] === shuten));
  assert.ok(!isLegal(ctx, s, { kind: "reigu", handIndex: 0, targetUid: shuten, facing: null, victimUid: behind }));
  assert.ok(!isLegal(ctx, s, { kind: "reigu", handIndex: 0, targetUid: kuryu, facing: null, victimUid: diag }));
  assert.ok(!isLegal(ctx, s, { kind: "reigu", handIndex: 0, targetUid: shuten, facing: null }));
  const r = applyAction(ctx, s, { kind: "reigu", handIndex: 0, targetUid: shuten, facing: null, victimUid: diag });
  assert.equal(hpOf(ctx, r.state, diag), 7 - 5);
  assert.equal(unitByUid(r.state, shuten)!.damage, 0);
  assert.equal(r.state.players[0].mana, 10 - 4);
});

test("the new inputs survive the strict parser (variants, counterOrder, reigu mode / victim)", () => {
  for (const a of [
    { kind: "attack", uid: 3, targetUid: null, variant: "drink", counterOrder: [5, 4] },
    { kind: "attack", uid: 3, targetUid: 4, variant: "regen" },
    { kind: "reigu", handIndex: 1, targetUid: 3, facing: null, mode: "aku" },
    { kind: "reigu", handIndex: 1, targetUid: 3, facing: null, victimUid: 9 },
  ]) {
    const p = parseAction(a);
    assert.ok(p.ok, JSON.stringify(a));
    assert.deepEqual(p.value, a);
  }
  for (const a of [
    { kind: "attack", uid: 3, targetUid: null, variant: "beer" },
    { kind: "attack", uid: 3, targetUid: null, counterOrder: "1,2" },
    { kind: "attack", uid: 3, targetUid: null, counterOrder: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    { kind: "reigu", handIndex: 1, targetUid: 3, facing: null, mode: "kick" },
    { kind: "reigu", handIndex: 1, targetUid: 3, facing: null, victimUid: -1 },
  ]) {
    assert.equal(parseAction(a).ok, false, JSON.stringify(a));
  }
});

// ---------------------------------------------------------------- the flow

/** Reads the phase afresh (an earlier assertion must not narrow it). */
const phaseOf = (f: Flow): FlowPhase => f.phase;

/** The counter scene as a flow `prepare` hook (seat 0 to act first). Returns the uids once it has run. */
const scenePrepare = (): { prepare: (s: GameState) => void; ids: { atk: number; kyonshi: number; ryomen: number } } => {
  const ids = { atk: 0, kyonshi: 0, ryomen: 0 };
  const prepare = (s: GameState): void => {
    s.units = [];
    ids.atk = place(s, "ad09", 0, 1, 0, 0);
    ids.kyonshi = place(s, "ad13", 1, 1, 1, 0);
    ids.ryomen = place(s, "ad14", 1, 2, 0, 3);
    unitByUid(s, ids.atk)!.damage = 5; // HP 4
  };
  return { prepare, ids };
};

test("flow: an attack whose counter order matters waits for the countering seat; the order is its input and replays exactly", () => {
  const ctx = r0923({ mulligan: false });
  const { prepare, ids } = scenePrepare();
  const f = createFlow(ctx, 7, { prepare });
  assert.equal(f.phase.kind, "main");
  const attack: Action = { kind: "attack", uid: ids.atk, targetUid: null };
  assert.ok(submit(f, 0, { type: "action", action: attack }).ok);
  const ph = phaseOf(f);
  assert.ok(ph.kind === "counterOrder");
  assert.equal(ph.player, 1);
  assert.equal(ph.attacker, 0);
  assert.deepEqual(new Set(ph.uids), new Set([ids.kyonshi, ids.ryomen]));
  assert.ok(unitByUid(f.state, ids.atk) !== undefined, "nothing resolved yet");
  // only the countering seat answers, with every counterer once; nothing else moves meanwhile
  assert.equal(submit(f, 0, { type: "counterOrder", order: [ids.ryomen, ids.kyonshi] }).ok, false);
  assert.equal(submit(f, 0, { type: "action", action: { kind: "pass" } }).ok, false);
  for (const bad of [[ids.ryomen], [ids.ryomen, ids.ryomen], [ids.ryomen, ids.kyonshi, ids.atk]]) {
    assert.equal(submit(f, 1, { type: "counterOrder", order: bad }).ok, false, JSON.stringify(bad));
  }
  const cfg = submit(f, 0, { type: "config", patch: { baseIncome: 5 } });
  assert.ok(!cfg.ok && cfg.code === "phase");
  assert.ok(submit(f, 1, { type: "counterOrder", order: [ids.ryomen, ids.kyonshi] }).ok);
  assert.deepEqual(f.phase, { kind: "main", player: 0 });
  assert.equal(unitByUid(f.state, ids.atk), undefined);
  assert.deepEqual(unitByUid(f.state, ids.kyonshi)!.pos, { x: 1, y: 0 });
  assert.ok(f.log.some((l) => l.event.t === "counterOrder"));
  // recorded: the attack as declared, then the countering seat's order
  const tail = f.inputs.slice(-2);
  assert.deepEqual(tail, [
    { seat: 0, input: { type: "action", action: attack } },
    { seat: 1, input: { type: "counterOrder", order: [ids.ryomen, ids.kyonshi] } },
  ]);
  const again = replayFlow(ctx, 7, f.inputs, scenePrepare());
  assert.deepEqual(again.state, f.state);
  assert.deepEqual(again.phase, f.phase);
  // the other order, replayed the same way, leaves 僵尸公主 where it was
  const other = createFlow(ctx, 7, scenePrepare());
  submit(other, 0, { type: "action", action: attack });
  submit(other, 1, { type: "counterOrder", order: [ids.kyonshi, ids.ryomen] });
  assert.deepEqual(unitByUid(other.state, ids.kyonshi)!.pos, { x: 1, y: 1 });
  // a resign is still taken while the order is open
  const quit = createFlow(ctx, 7, scenePrepare());
  submit(quit, 0, { type: "action", action: attack });
  assert.ok(submit(quit, 1, { type: "resign" }).ok);
  assert.equal(quit.phase.kind, "over");
});

test("flow: an attack with no order to choose resolves at once; a pre-ordered attack (older records) still replays", () => {
  const ctx = r0923({ mulligan: false });
  const { prepare, ids } = scenePrepare();
  const f = createFlow(ctx, 7, {
    prepare: (s) => {
      prepare(s);
      unitByUid(s, ids.atk)!.damage = 0; // HP 9: the counters cannot destroy it, so the order changes nothing
    },
  });
  assert.ok(submit(f, 0, { type: "action", action: { kind: "attack", uid: ids.atk, targetUid: null } }).ok);
  assert.equal(f.phase.kind, "main");
  const g = createFlow(ctx, 7, scenePrepare());
  assert.ok(submit(g, 0, { type: "action", action: { kind: "attack", uid: ids.atk, targetUid: null, counterOrder: [ids.ryomen, ids.kyonshi] } }).ok);
  assert.equal(g.phase.kind, "main");
  assert.deepEqual(unitByUid(g.state, ids.kyonshi)!.pos, { x: 1, y: 0 });
});

test("the AI chooses the countering order with its eval, and the headless runner uses it", () => {
  const ctx = r0923({ mulligan: false });
  const { prepare, ids } = scenePrepare();
  const s = createGame(ctx, 7);
  prepare(s);
  startTurn(ctx, s, []);
  const a: Extract<Action, { kind: "attack" }> = { kind: "attack", uid: ids.atk, targetUid: null };
  const best = bestCounterOrder(ctx, s, a);
  assert.ok(best !== null && best.length === 2);
  assert.deepEqual(withCounterOrder(ctx, s, a).counterOrder, best);
  // with nothing to choose there is no order
  const calm = createGame(ctx, 7);
  prepare(calm);
  unitByUid(calm, ids.atk)!.damage = 0;
  startTurn(ctx, calm, []);
  assert.equal(bestCounterOrder(ctx, calm, a), null);
  assert.equal(withCounterOrder(ctx, calm, a).counterOrder, undefined);
});

test("online: the defender gets the order prompt data, the attacker waits; a browser cannot pre-order its own attack", () => {
  const { prepare, ids } = scenePrepare();
  const app = newApp(ONLINE_DIR, { flowOptions: { prepare } });
  const s = seatTwo(app, { rule: "r0923", pack: "adopted-0922" });
  bothKeep(s);
  // an attacker's counterOrder is dropped: the attack waits for the other seat all the same
  const sent = send(s, s.tokens[0], { type: "action", action: { kind: "attack", uid: ids.atk, targetUid: null, counterOrder: [ids.ryomen, ids.kyonshi] } });
  assert.equal(sent.status, 200, JSON.stringify(sent.json));
  const def = view(s, s.tokens[1]).game;
  const atk = view(s, s.tokens[0]).game;
  assert.ok(def !== null && atk !== null);
  assert.equal(def.phase.kind, "counterOrder");
  assert.equal(atk.phase.kind, "counterOrder");
  if (def.phase.kind === "counterOrder") {
    assert.equal(def.phase.player, 1);
    assert.equal(def.phase.outcomes.length, 2);
    const moves = def.phase.outcomes.find((o) => o.order[0] === ids.ryomen);
    assert.ok(moves !== undefined && moves.killer === ids.kyonshi && moves.moves.length === 1);
    const stays = def.phase.outcomes.find((o) => o.order[0] === ids.kyonshi);
    assert.ok(stays !== undefined && stays.killer === ids.ryomen && stays.moves.length === 0);
  }
  assert.equal(def.legal, null);
  assert.notEqual(send(s, s.tokens[0], { type: "counterOrder", order: [ids.ryomen, ids.kyonshi] }).status, 200);
  assert.equal(send(s, s.tokens[1], { type: "counterOrder", order: [ids.ryomen, ids.kyonshi] }).status, 200);
  const after = view(s, s.tokens[0]);
  assert.equal(after.game?.phase.kind, "main");
  assert.ok(after.log.some((l) => l.event.t === "counterOrder"));
  const f = flowOf(s);
  assert.deepEqual(unitByUid(f.state, ids.kyonshi)!.pos, { x: 1, y: 0 });
  const again = replayFlow(f.ctx, f.seed, f.inputs, scenePrepare());
  assert.deepEqual(again.state, f.state);
});

test("the counter-order prompt lists the counterers with ▲▼, says what the order leads to, and confirms", () => {
  const ctx = r0923();
  const { prepare, ids } = scenePrepare();
  const s = blankState(ctx, 10);
  prepare(s);
  const a: Extract<Action, { kind: "attack" }> = { kind: "attack", uid: ids.atk, targetUid: null };
  const choice = counterOrderChoice(ctx, s, a);
  assert.ok(choice !== null);
  const outcomes = counterOrderOutcomes(ctx, s, a, choice.orders);
  const html = promptHtml({
    ctx,
    board: { units: s.units, players: [0, 1].map(() => ({ life: 15, mana: 10, chips: 0, reach: false, handCount: 0, deckCount: 0, grave: [], reshuffleCount: 0 })) as never, turnPlayer: 0, round: 1, ended: false, winner: null, winType: null, summonsThisTurn: 0 },
    names: ["先", "後"],
    viewer: 1,
    hand: [],
    prompt: { kind: "counterOrder", attackerUid: ids.atk, uids: choice.uids, outcomes },
    sel: { kind: "none" },
    marked: 0,
    tansuIndex: 0,
    endConfirm: false,
    flash: "",
    counterPick: [ids.ryomen, ids.kyonshi],
  });
  assert.match(html, /反撃の順番/);
  assert.match(html, /data-act="co-up"/);
  assert.match(html, /data-act="co-down"/);
  assert.match(html, /data-act="co-send"/);
  assert.match(html, /僵尸公主<span class="muted">\(太極\)<\/span><\/b>の反撃で撃破/);
  assert.match(html, /僵尸公主.*へ移動/);
  assert.match(html, /既定の順番に戻す/);
});

test("the table hides 生命 and shows 霊力価 when life is off; the log and plates say the destroyer's 霊力", () => {
  const ctx = r0923();
  const board = { units: [], players: [0, 1].map(() => ({ life: 15, mana: 6, chips: 0, reach: false, handCount: 5, deckCount: 17, grave: [], reshuffleCount: 0 })) as never, turnPlayer: 0 as PlayerId, round: 1, ended: false, winner: null, winType: null, summonsThisTurn: 0 };
  const plate = nameplateHtml(ctx, board, 0, ["あなた", "AI"], true);
  assert.ok(!plate.includes('data-stat="life"'));
  assert.ok(plate.includes('data-stat="mana"'));
  const old = nameplateHtml(makeCtx(presetConfig("r0914"), SK), board, 0, ["あなた", "AI"], true);
  assert.ok(old.includes('data-stat="life"'));
  const face = cardFaceHtml(ctx, "ad15", { size: "md" });
  assert.match(face, /霊力価 3/);
  assert.ok(!face.includes("生命価"));
  const line = describeEvent(ctx, ["先", "後"], { t: "destroy", owner: 1, uid: 4, cardId: "ad15", lifeLoss: 0, manaGain: 3, killer: 0, manaTo: 0, killerRefund: true });
  assert.ok(line !== null && line.text.includes("先の霊力+3(霊力価)") && !line.text.includes("生命"));
  // the radial menu offers 再生 / 飲酒 with their extra cost
  const s = blankState(ctx, 10);
  const ib = place(s, "ad15", 0, 0, 0, 0);
  place(s, "ad14", 1, 0, 1, 2);
  const shuten = place(s, "ad16", 0, 2, 2, 2);
  const cmds = commandsFor(ctx, s);
  assert.deepEqual(cmds[String(ib)].filter((c) => c.id === "regen").map((c) => [c.label, c.cost]), [["再生", 4]]);
  assert.deepEqual(cmds[String(shuten)].filter((c) => c.id === "drink").map((c) => [c.label, c.cost]), [["飲酒", 5]]);
});

// ------------------------------------------------- AI plans after a chosen order

/**
 * The counter scene plus 鉞鬼 (seat 0) on the top edge facing down: it can hit
 * 僵尸公主 while 僵尸公主 stays on 太極, not once it has stepped down to the yang
 * cell. A scripted attacker plans [一目鬼's area attack, 鉞鬼 -> 僵尸公主] on the
 * default order (僵尸公主 stays); the defender orders the counters so that
 * 僵尸公主 lands the kill and moves, which makes the second planned attack illegal.
 */
const staleScene = (): { prepare: (s: GameState) => void; ids: { atk: number; kyonshi: number; ryomen: number; axe: number } } => {
  const base = scenePrepare();
  const ids = { ...base.ids, axe: 0 };
  const prepare = (s: GameState): void => {
    base.prepare(s);
    Object.assign(ids, base.ids);
    ids.axe = place(s, "ad04", 0, 1, 2, 2);
  };
  return { prepare, ids };
};

const scriptedAttacker = (ids: { atk: number; kyonshi: number; axe: number }): { seat: AiSeat; plans: Action[][] } => {
  const plans: Action[][] = [];
  const seat: AiSeat = {
    name: "scripted",
    planTurn: (_ctx, st) => {
      const first = plans.length === 0;
      const plan: Action[] = first
        ? [{ kind: "attack", uid: ids.atk, targetUid: null }, { kind: "attack", uid: ids.axe, targetUid: ids.kyonshi }, { kind: "pass" }]
        : [{ kind: "rotate", uid: ids.axe, facing: 3 }, { kind: "pass" }];
      plans.push(plan);
      assert.ok(first || unitByUid(st, ids.atk) === undefined, "the replan sees the board after the attack");
      return plan;
    },
  };
  return { seat, plans };
};

test("AI drivers plan again when the defender's counter order makes the rest of the plan stale (runner)", () => {
  const ctx = r0923({ mulligan: false });
  const { prepare, ids } = staleScene();
  const s = createGame(ctx, 7);
  prepare(s);
  startTurn(ctx, s, []);
  const { seat, plans } = scriptedAttacker(ids);
  const defender: AiSeat = { ...makeAi("greedy"), counterOrder: () => [ids.ryomen, ids.kyonshi] };
  const events: GameEvent[] = [];
  playMainPhase(ctx, s, [seat, defender], events);
  assert.deepEqual(unitByUid(s, ids.kyonshi)!.pos, { x: 1, y: 0 }, "the defender's order moved 僵尸公主");
  assert.equal(plans.length, 2, "planned again after the chosen order");
  assert.ok(events.some((e) => e.t === "rotate" && e.uid === ids.axe), "the attacker went on with a legal action");
  assert.ok(!events.some((e) => e.t === "attack" && e.uid === ids.axe), "the stale attack was never tried");
  // a plan that is simply stale (its next action illegal) is taken again too
  const s2 = createGame(ctx, 7);
  prepare(s2);
  startTurn(ctx, s2, []);
  let calls = 0;
  const stale: AiSeat = {
    name: "stale",
    planTurn: () => (calls++ === 0 ? [{ kind: "attack", uid: 999, targetUid: null }, { kind: "pass" }] : [{ kind: "rotate", uid: ids.axe, facing: 1 }, { kind: "pass" }]),
  };
  const ev2: GameEvent[] = [];
  playMainPhase(ctx, s2, [stale, defender], ev2);
  assert.equal(calls, 2);
  assert.ok(ev2.some((e) => e.t === "rotate" && e.uid === ids.axe));
});

test("AI drivers plan again after a counterOrder input (flow driver, as the AI table and the online tests drive it)", () => {
  const ctx = r0923({ mulligan: false });
  const { prepare, ids } = staleScene();
  const f = createFlow(ctx, 7, { prepare });
  const { seat, plans } = scriptedAttacker(ids);
  const defender: AiSeat = { ...makeAi("greedy"), counterOrder: () => [ids.ryomen, ids.kyonshi] };
  const ais: [AiSeat, AiSeat] = [seat, defender];
  const taken = { n: 0 };
  // attack -> counterOrder (seat 1) -> the attacker's next input
  for (let i = 0; i < 3; i++) assert.ok(aiStep(f, taken, ais));
  assert.equal(f.phase.kind, "main");
  assert.equal(plans.length, 2, "planned again after the counterOrder input");
  const kinds = f.inputs.map((r) => (r.input.type === "action" ? r.input.action.kind : r.input.type));
  assert.deepEqual(kinds.slice(-3), ["attack", "counterOrder", "rotate"], JSON.stringify(kinds));
  assert.ok(f.state.players[0].mana > 0);
});

// ------------------------------------------------------------ AI legality

/**
 * AI-vs-AI games that assert every action an AI asks for is legal at the time
 * (a plan is taken again when the countering side's order made the board
 * differ from the one it was planned on), and that nothing throws.
 */
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
      assert.ok(isLegal(ctx, s, act));
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

test("AI legality: greedy / beam / strong play r0923 + adopted-0922 games with legal inputs only, the new cards included", () => {
  const ctx = r0923();
  const seen = new Set<string>();
  const runs: [[string, string], number][] = [
    [["greedy", "greedy"], 220],
    [["beam", "greedy"], 50],
    [["greedy", "beam"], 20],
    [["strong", "greedy"], 10],
    [["beam", "strong"], 6],
  ];
  let games = 0;
  for (const [kinds, n] of runs) {
    for (let i = 0; i < n; i++) {
      const { events, state } = playChecked(ctx, kinds, 9000 + games);
      games += 1;
      assert.ok(state.ended);
      for (const e of events) {
        if (e.t === "attack" && e.variant !== "normal") seen.add(`variant:${e.variant}`);
        if (e.t === "reigu") seen.add(`reigu:${e.cardId}`);
        if (e.t === "attack" && e.counterCount >= 2) seen.add("multi-counter");
        if (e.t === "destroy") assert.equal(e.lifeLoss, 0);
      }
      for (const p of [0, 1] as PlayerId[]) assert.equal(state.players[p].life, ctx.cfg.startLife);
    }
  }
  assert.ok(games >= 300);
  for (const k of ["variant:regen", "variant:konshin", "variant:heal", "reigu:ad21", "reigu:ad22", "multi-counter"]) {
    assert.ok(seen.has(k), `${k} never happened in ${games} games`);
  }
});
