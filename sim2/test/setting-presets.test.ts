// Built-in setting bundles (src/setting-presets.ts): a named balance proposal
// picked in one go. 調整案1.5倍 against the shipped shuten-kyuryu pack — the
// numbers of the 9/15 sheet, a match actually played with them, the share-URL
// round trip, and the promise that picking a bundle never moves 現行ルール or
// the printed pack.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CARD_STATS } from "../src/card-overrides.ts";
import type { CardStatKey } from "../src/card-overrides.ts";
import { createFlow, replayFlow } from "../src/flow.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig, RULE_PRESET_IDS } from "../src/presets.ts";
import {
  isSettingPresetId,
  matchingSettingPreset,
  SETTING_PRESET_IDS,
  SETTING_PRESETS,
  settingPresetSettings,
} from "../src/setting-presets.ts";
import {
  changedItemCount,
  decodeSettings,
  defaultSettings,
  encodeSettings,
  MAX_ENCODED,
  parseSettings,
  settingsConfig,
  settingsDiff,
  settingsPack,
} from "../src/settings.ts";
import { controlCount, makeCtx, unitMaxHp } from "../src/state.ts";
import { applyAction } from "../src/rules.ts";
import { endTurn } from "../src/turn.ts";
import { blankState, place } from "./helpers.ts";
import { aiStep } from "./online-helpers.ts";

const JAPANESE = /[぀-ヿ一-鿿]/;

const SHUTEN = loadPack(packPath("shuten-kyuryu"));

// --------------------------------------------------------------- the sheet

/**
 * The 9/15「デッキ(一門)設計」sheet's 霊力1.5倍・能力1.5倍 tab, transcribed from
 * the coordinator's sim2/out/adj15-spec.json. sim2/out is not in the repo, so
 * this copy is the one that travels with the tests; the test below compares
 * the two whenever the extracted file is still on the machine.
 */
const SPEC_CONFIG = {
  startMana: [6, 8],
  baseIncome: 6,
  attrBonus: 3,
  // not on the sheet: the team's 9/19 decision, so 茨木 11+3 / 酒呑 12+3 / 玖龍街 15 are not capped
  maxHp: 15,
  taijiDiscount: 1,
  killRewardBase: "half_floor",
  chipIncomeSteps: [3, 4, 5],
} as const;

/** 灯籠の精(sk01) と 古箪笥(sk07) は攻撃しないので 攻撃コスト・ATK は無し。 */
const SPEC_CARDS: Record<string, Partial<Record<CardStatKey, number>>> = {
  sk01: { summonCost: 3, hp: 3, lifeValue: 1 },
  sk02: { summonCost: 3, attackCost: 2, hp: 3, atk: 3, lifeValue: 1 },
  sk03: { summonCost: 4, attackCost: 2, hp: 4, atk: 3, lifeValue: 1 },
  sk04: { summonCost: 4, attackCost: 2, hp: 4, atk: 3, lifeValue: 1 },
  sk05: { summonCost: 4, attackCost: 2, hp: 5, atk: 3, lifeValue: 2 },
  sk06: { summonCost: 5, attackCost: 2, hp: 7, atk: 3, lifeValue: 2 },
  sk07: { summonCost: 4, hp: 5, lifeValue: 2 },
  sk08: { summonCost: 5, attackCost: 2, hp: 6, atk: 3, lifeValue: 2 },
  sk09: { summonCost: 8, attackCost: 2, hp: 9, atk: 3, lifeValue: 2 },
  sk10: { summonCost: 6, attackCost: 2, hp: 8, atk: 3, lifeValue: 2 },
  sk11: { summonCost: 6, attackCost: 2, hp: 8, atk: 3, lifeValue: 2 },
  sk12: { summonCost: 7, attackCost: 2, hp: 8, atk: 3, lifeValue: 2 },
  sk13: { summonCost: 7, attackCost: 3, hp: 8, atk: 4, lifeValue: 2 },
  sk14: { summonCost: 8, attackCost: 3, hp: 9, atk: 4, lifeValue: 3 },
  sk15: { summonCost: 10, attackCost: 3, hp: 11, atk: 5, lifeValue: 3 },
  sk16: { summonCost: 11, attackCost: 4, hp: 12, atk: 6, lifeValue: 3 },
  sk17: { summonCost: 12, attackCost: 1, hp: 15, atk: 2, lifeValue: 4 },
};

const REIGU = ["sk18", "sk19", "sk20", "sk21", "sk22"];

// -------------------------------------------------------------- the bundles

test("every built-in bundle names a rule preset, a pack and Japanese text, and applies to its pack", () => {
  assert.ok(SETTING_PRESET_IDS.length >= 1, "at least one bundle ships");
  assert.equal(new Set(SETTING_PRESET_IDS.map(String)).size, SETTING_PRESET_IDS.length, "no duplicate ids");
  for (const id of SETTING_PRESET_IDS) {
    const b = SETTING_PRESETS[id];
    assert.equal(b.id, id);
    assert.ok(isSettingPresetId(id));
    assert.match(b.label, JAPANESE, `${id}: label`);
    assert.ok(b.note.length >= 10 && JAPANESE.test(b.note), `${id}: note`);
    assert.ok((RULE_PRESET_IDS as readonly string[]).includes(b.rule), `${id}: base rule`);
    const printed = loadPack(packPath(b.pack));
    // throws if the schema, the card ids or a card's own limits refuse anything
    const s = settingPresetSettings(id, printed);
    assert.equal(s.rule, b.rule);
    assert.equal(s.pack, b.pack);
    // exactly what the server accepts from a share URL or a room proposal
    const again = parseSettings(s, () => printed);
    assert.ok(again.ok, again.ok ? "" : again.error);
    assert.deepEqual(again.value, s);
    assert.equal(matchingSettingPreset(s, printed), id, `${id}: the picker finds itself`);
    assert.ok(changedItemCount(s) > 0, `${id}: a bundle that changes nothing is pointless`);
  }
  for (const bad of ["", "nope", "r0914", 1, null, undefined]) assert.equal(isSettingPresetId(bad), false, String(bad));
});

test("調整案1.5倍: every rule value and every card number is the 9/15 sheet's", () => {
  const s = settingPresetSettings("adj15", SHUTEN);
  assert.equal(SETTING_PRESETS.adj15.label, "調整案1.5倍");
  assert.equal(s.rule, "r0914", "expressed against 現行ルール, not a new base rule");
  assert.equal(s.pack, "shuten-kyuryu");

  const cfg = settingsConfig(s);
  assert.deepEqual(cfg.startMana, [6, 8]);
  assert.equal(cfg.baseIncome, 6);
  assert.equal(cfg.attrBonus, 3);
  assert.equal(cfg.maxHp, 15);
  assert.equal(cfg.taijiDiscount, 1);
  assert.equal(cfg.killRewardBase, "half_floor");
  assert.deepEqual(cfg.chipIncomeSteps, [3, 4, 5], "現行ルールの3段のまま");

  const pack = settingsPack(s, SHUTEN);
  for (const [id, want] of Object.entries(SPEC_CARDS)) {
    const card = pack.byId.get(id);
    assert.ok(card !== undefined, `${id} is in the pack`);
    for (const stat of CARD_STATS) {
      const v = want[stat.key];
      if (v === undefined) continue;
      assert.equal(card[stat.key], v, `${id} ${card.nameJa} の${stat.label}`);
    }
  }
  // 攻撃しない2枚と霊具は据え置き
  for (const id of ["sk01", "sk07"]) {
    assert.equal(pack.byId.get(id)?.attackCost, SHUTEN.byId.get(id)?.attackCost, `${id} attack cost`);
    assert.equal(pack.byId.get(id)?.atk, 0, `${id} atk`);
  }
  for (const id of REIGU) {
    assert.equal(pack.byId.get(id)?.summonCost, SHUTEN.byId.get(id)?.summonCost, `${id} 使用コスト`);
    assert.equal(s.cards[id], undefined, `${id} は変更しない`);
  }
  // the badge count: 4 rule variables + 50 card numbers that really differ
  const diff = settingsDiff(s);
  assert.equal(diff.rules.length, 4, "初期霊力・毎ターン収入・属性ボーナス・最大HP");
  assert.equal(diff.cards, 50);
  assert.equal(changedItemCount(s), 54);
  assert.deepEqual(
    diff.rules.map((c) => c.key).sort(),
    ["attrBonus", "baseIncome", "maxHp", "startMana"],
    "太極の軽減・撃破報酬の額・収入が増える占拠チップ数 は現行ルールと同じなので差分に出ない",
  );
});

test("調整案1.5倍+生命22: the same numbers with 初期生命22, and nothing else moved", () => {
  const base = settingPresetSettings("adj15", SHUTEN);
  const s = settingPresetSettings("adj15life", SHUTEN);
  assert.equal(SETTING_PRESETS.adj15life.label, "調整案1.5倍+生命22");
  assert.equal(settingsConfig(s).startLife, 22);
  assert.equal(settingsConfig(base).startLife, presetConfig("r0914").startLife, "シート通りの案は現行ルールの初期生命のまま");
  assert.equal(settingsConfig(s).manaCap, settingsConfig(base).manaCap, "霊力上限は上げない(検証で効いていない)");
  assert.deepEqual(s.cards, base.cards, "カードの数値は調整案1.5倍と同じ");
  const diff = settingsDiff(s);
  assert.deepEqual(diff.rules.map((c) => c.key).sort(), ["attrBonus", "baseIncome", "maxHp", "startLife", "startMana"]);
  assert.equal(changedItemCount(s), 55);
  assert.equal(matchingSettingPreset(s, SHUTEN), "adj15life", "ピッカーはこの案として表示する");
  assert.equal(matchingSettingPreset(base, SHUTEN), "adj15", "生命だけ違う2案を取り違えない");
});

test("調整案1.5倍: the big shikigami keep their HP on the board — nothing is capped", () => {
  const s = settingPresetSettings("adj15", SHUTEN);
  const ctx = makeCtx(settingsConfig(s), settingsPack(s, SHUTEN));
  const state = blankState(ctx, 20);
  // (2,1) is the 陽 cell and (0,1) the 陰 cell (see config-settings.test.ts)
  place(state, "sk16", 0, 2, 1, 0); // 酒呑童子 陽 HP12 on 陽: 12 + 3
  place(state, "sk15", 1, 0, 1, 0); // 茨木童子 陰 HP11 on 陰: 11 + 3
  place(state, "sk17", 0, 1, 1, 0); // 玖龍街 空 HP15 on the taiji cell: no attribute bonus
  const hp = (i: number): number => unitMaxHp(ctx, state.units[i]);
  assert.equal(hp(0), 15, "酒呑童子 12+3 = 15, the new cap, not 10");
  assert.equal(hp(1), 14, "茨木童子 11+3 = 14");
  assert.equal(hp(2), 15, "玖龍街 15 flat");
  // with 現行ルール's cap of 10 every one of them would have been cut back
  const capped = makeCtx({ ...settingsConfig(s), maxHp: 10 }, settingsPack(s, SHUTEN));
  assert.deepEqual([0, 1, 2].map((i) => unitMaxHp(capped, state.units[i])), [10, 10, 10]);
});

test("調整案1.5倍 agrees with the extracted spec file while it is on this machine", () => {
  const path = join(import.meta.dirname, "..", "out", "adj15-spec.json");
  if (!existsSync(path)) return; // sim2/out is not in the repo: SPEC_CARDS above is the copy that travels
  const spec = JSON.parse(readFileSync(path, "utf8")) as {
    id: string;
    config: Record<string, unknown>;
    cards: Record<string, Record<string, unknown>>;
  };
  assert.equal(spec.id, "adj15");
  for (const [key, want] of Object.entries(SPEC_CONFIG)) {
    assert.deepEqual(spec.config[key], want, `spec config ${key}`);
  }
  const specIds = Object.keys(spec.cards).sort();
  assert.deepEqual(specIds, Object.keys(SPEC_CARDS).sort(), "the same cards");
  for (const [id, want] of Object.entries(SPEC_CARDS)) {
    for (const stat of CARD_STATS) {
      // keys prefixed with _ in the spec file are notes for humans
      assert.equal(spec.cards[id][stat.key] ?? undefined, want[stat.key], `spec ${id} ${stat.key}`);
    }
  }
});

test("調整案1.5倍: a match starts and plays several turns with the bundle's mana and cards", () => {
  const s = settingPresetSettings("adj15", SHUTEN);
  const pack = settingsPack(s, SHUTEN);
  const cfg = settingsConfig(s);
  const f = createFlow(makeCtx(cfg, pack), 20260915);
  assert.deepEqual([f.state.players[0].mana, f.state.players[1].mana], [6, 8], "初期霊力 6/8");
  for (let i = 0; i < 4000 && f.state.round < 4 && f.phase.kind !== "over"; i++) {
    if (!aiStep(f)) break;
  }
  assert.ok(f.state.round >= 4 || f.phase.kind === "over", `reached round ${f.state.round}`);
  assert.ok(f.inputs.length > 10, "the match really moved");
  assert.ok(f.log.length > 0);
  assert.equal(f.ctx.pack.byId.get("sk16")?.summonCost, 11, "the match is played with the edited cards");
  assert.equal(SHUTEN.byId.get("sk16")?.summonCost, 6, "the printed pack is untouched");
  // the recorded match replays to the same board with the same settings
  const again = replayFlow(makeCtx(f.initialCfg, settingsPack(s, SHUTEN)), 20260915, f.inputs);
  assert.deepEqual(again.state, f.state);
  assert.deepEqual(again.log, f.log);
  assert.deepEqual(again.ctx.cfg, f.ctx.cfg);
});

test("調整案1.5倍: the share URL carries the whole bundle and decodes back to it", () => {
  const s = settingPresetSettings("adj15", SHUTEN);
  const encoded = encodeSettings(s);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/, "URL-safe");
  assert.ok(encoded.length < MAX_ENCODED, `encoded ${encoded.length} < ${MAX_ENCODED}`);
  const back = decodeSettings(encoded, () => SHUTEN);
  assert.ok(back.ok, back.ok ? "" : back.error);
  assert.deepEqual(back.value, s);
  assert.equal(changedItemCount(back.value), 54);
  assert.equal(matchingSettingPreset(back.value, SHUTEN), "adj15", "the picker still shows the bundle after a round trip");
  // one edit afterwards and it is no longer the bundle (the picker falls back to 「(なし)」)
  const edited = { ...s, config: { ...s.config, baseIncome: 5 } };
  assert.equal(matchingSettingPreset(edited, SHUTEN), null);
  const lessCards = { ...s, cards: { ...s.cards, sk17: { ...s.cards.sk17, hp: 14 } } };
  assert.equal(matchingSettingPreset(lessCards, SHUTEN), null);
});

test("a bundle changes nothing outside itself: 現行ルール, the presets and the printed pack stay put", () => {
  const before = JSON.stringify(presetConfig("r0914"));
  const printedBefore = JSON.stringify(SHUTEN.cards);
  const others = RULE_PRESET_IDS.map((id) => JSON.stringify(presetConfig(id)));

  const s = settingPresetSettings("adj15", SHUTEN);
  settingsPack(s, SHUTEN);
  settingsConfig(s);

  assert.equal(JSON.stringify(presetConfig("r0914")), before, "現行ルール is the same object graph as before");
  assert.deepEqual(presetConfig("r0914").startMana, [3, 4]);
  assert.equal(presetConfig("r0914").baseIncome, 3);
  assert.equal(presetConfig("r0914").attrBonus, 2);
  assert.deepEqual(RULE_PRESET_IDS.map((id) => JSON.stringify(presetConfig(id))), others, "no preset moved");
  assert.equal(JSON.stringify(SHUTEN.cards), printedBefore, "the loaded pack is untouched");
  assert.equal(SHUTEN.byId.get("sk17")?.hp, 10);
  // an untouched base rule is still "基準のまま", and is not mistaken for a bundle
  const plain = defaultSettings("r0914");
  assert.equal(changedItemCount(plain), 0);
  assert.equal(matchingSettingPreset(plain, SHUTEN), null);
  assert.deepEqual(plain, { rule: "r0914", pack: "shuten-kyuryu", config: {}, cards: {} });
});

// ------------------------------------------------ 9/23 bundles (採用ルール 9/22)

const ADOPTED = loadPack(packPath("adopted-0922"));

test("9/23 bundles: 今の占拠で収入(開始時) / 逆転しやすく / 大型で逆転 — on r0923 + adopted-0922, exactly these rule values", () => {
  const rulesOf = (id: "incomeNow" | "comeback" | "bigComeback"): Record<string, unknown> => {
    const s = settingPresetSettings(id, ADOPTED);
    assert.equal(s.rule, "r0923");
    assert.equal(s.pack, "adopted-0922");
    assert.deepEqual(s.cards, {}, "no card numbers");
    return Object.fromEntries(settingsDiff(s).rules.map((c) => [c.key, c.to]));
  };
  assert.equal(SETTING_PRESETS.incomeNow.label, "調整案: 今の占拠で収入(開始時)");
  assert.deepEqual(rulesOf("incomeNow"), { incomeTiming: "turn_start", incomeMode: "current" });
  assert.equal(SETTING_PRESETS.comeback.label, "調整案: 逆転しやすく");
  assert.deepEqual(rulesOf("comeback"), {
    incomeTiming: "turn_start",
    incomeMode: "current",
    killRewardCondition: "behind",
    underdogIncome: 1,
  });
  assert.equal(SETTING_PRESETS.bigComeback.label, "調整案: 大型で逆転");
  // underdogDiscountMinCost 8 is the default, so it drops out of the diff but stays in the table
  assert.deepEqual(rulesOf("bigComeback"), { controlCount: "hp", underdogDiscount: 1, underdogBy: "both" });
  const big = settingsConfig(settingPresetSettings("bigComeback", ADOPTED));
  assert.equal(big.controlCountThreshold, 11);
  assert.equal(big.underdogDiscountMinCost, 8);
  assert.equal(big.incomeMode, "ratchet", "大型で逆転 keeps the ratchet");
  // the picker tells the three apart
  for (const id of ["incomeNow", "comeback", "bigComeback"] as const) {
    assert.equal(matchingSettingPreset(settingPresetSettings(id, ADOPTED), ADOPTED), id);
  }
  // the 1.5倍 bundles are untouched by the new settings: they stay on r0914 with the defaults
  for (const id of ["adj15", "adj15life"] as const) {
    const cfg = settingsConfig(settingPresetSettings(id, SHUTEN));
    assert.equal(cfg.incomeMode, "ratchet");
    assert.equal(cfg.controlCount, "cells");
    assert.equal(cfg.underdogIncome, 0);
  }
});

test("大型で逆転: a unit at HP 11+ is two cells for chips — 茨木童子 on its own 陰 cell (9+2) turns 2 chips into 4", () => {
  const cfg = settingsConfig(settingPresetSettings("bigComeback", ADOPTED));
  const ctx = makeCtx(cfg, ADOPTED);
  const s = blankState(ctx, 8);
  s.players[0].chips = 2;
  place(s, "ad02", 0, 2, 0, 0);
  place(s, "ad03", 0, 2, 2, 0);
  s.players[0].hand = ["ad15"];
  const r = applyAction(ctx, s, { kind: "summon", handIndex: 0, pos: { x: 0, y: 1 }, facing: 0 });
  assert.equal(controlCount(ctx, r.state, 0), 4);
  endTurn(ctx, r.state, []);
  assert.equal(r.state.players[0].chips, 4);
  assert.equal(r.state.players[0].mana, 8, "r0923 turn_end income: 6 + 2 steps");
});

test("9/23 bundles: a match plays several rounds with each and replays to the same board", () => {
  for (const id of ["incomeNow", "comeback", "bigComeback"] as const) {
    const s = settingPresetSettings(id, ADOPTED);
    const f = createFlow(makeCtx(settingsConfig(s), settingsPack(s, ADOPTED)), 20260923);
    for (let i = 0; i < 4000 && f.state.round < 5 && f.phase.kind !== "over"; i++) {
      if (!aiStep(f)) break;
    }
    assert.ok(f.state.round >= 5 || f.phase.kind === "over", `${id}: reached round ${f.state.round}`);
    const again = replayFlow(makeCtx(f.initialCfg, settingsPack(s, ADOPTED)), 20260923, f.inputs);
    assert.deepEqual(again.state, f.state, id);
    assert.deepEqual(again.log, f.log, id);
  }
});
