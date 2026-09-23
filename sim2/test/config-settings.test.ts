// DESIGN-UI-V2 Sec.4.1 tests 1, 3 (flow level), 5, 6 and 7: the rule-variable
// schema, card number overrides, the share-URL codec, mid-match rule changes
// in the flow state machine and their replay.
import test from "node:test";
import assert from "node:assert/strict";
import { applyCardOverrides, CARD_STATS, cardChangeCount, parseCardOverrides } from "../src/card-overrides.ts";
import {
  CONFIG_GROUPS,
  CONFIG_SCHEMA,
  checkFieldValue,
  describeChange,
  NON_PLAY_CONFIG_KEYS,
  parseConfigPatch,
} from "../src/config-schema.ts";
import { createFlow, replayFlow, submit } from "../src/flow.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig, RULE_PRESET_IDS } from "../src/presets.ts";
import { applyRuleChange } from "../src/rule-change.ts";
import { changedItemCount, decodeSettings, defaultSettings, encodeSettings, parseSettings } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import { makeCtx, unitHp, unitMaxHp } from "../src/state.ts";
import { applyAction } from "../src/rules.ts";
import { defaultConfig } from "../src/types.ts";
import { blankState, place } from "./helpers.ts";
import { aiStep, SK } from "./online-helpers.ts";

const JAPANESE = /[぀-ヿ一-鿿]/;

test("UI-V2 test 1: every schema field has a Japanese name, a description, a type and a range", () => {
  const keys = CONFIG_SCHEMA.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length, "no duplicate keys");
  const groups = new Set(CONFIG_GROUPS.map((g) => g.id));
  for (const f of CONFIG_SCHEMA) {
    assert.match(f.label, JAPANESE, `${f.key}: label`);
    assert.ok(f.desc.length >= 8 && JAPANESE.test(f.desc), `${f.key}: desc`);
    assert.ok(groups.has(f.group), `${f.key}: group`);
    assert.equal(typeof f.midGame, "boolean");
    if (f.kind === "choice") {
      assert.ok(f.choices.length >= 2, `${f.key}: choices`);
      for (const c of f.choices) assert.match(c.label, JAPANESE, `${f.key}.${c.value}: choice label`);
    } else if (f.kind !== "bool") {
      assert.ok(Number.isInteger(f.min) && Number.isInteger(f.max) && f.min < f.max, `${f.key}: range`);
    }
  }
});

test("UI-V2 test 1: the schema covers every play-relevant Config field", () => {
  const all = Object.keys(defaultConfig()).sort();
  const covered = [...CONFIG_SCHEMA.map((f) => f.key as string), ...NON_PLAY_CONFIG_KEYS].sort();
  assert.deepEqual(covered, all);
  // every preset value is inside the schema's own ranges
  for (const id of RULE_PRESET_IDS) {
    const cfg = presetConfig(id) as unknown as Record<string, unknown>;
    for (const f of CONFIG_SCHEMA) assert.ok(checkFieldValue(f, cfg[f.key]).ok, `${id}.${f.key}`);
  }
  // choices list exactly the values the engine understands
  const choice = (key: string) => {
    const f = CONFIG_SCHEMA.find((x) => x.key === key);
    return f?.kind === "choice" ? f.choices.map((c) => c.value).sort() : [];
  };
  assert.deepEqual(choice("counterMode"), ["all", "gap", "single"]);
  assert.deepEqual(choice("refundMode"), ["half", "killer_half", "none"]);
  assert.deepEqual(choice("aoeMode"), ["no_ff", "off", "on"]);
  const startOnly = CONFIG_SCHEMA.filter((f) => !f.midGame).map((f) => f.key).sort();
  // incomeTiming: switching mid-match would pay the turn that straddles the change twice
  // controlWinMode: 制圧点 earned under one mode mean nothing under the other
  assert.deepEqual(startOnly, ["controlWinMode", "incomeTiming", "mulligan", "startLife", "startMana"]);
  assert.deepEqual(choice("controlCount"), ["cells", "cost", "hp"]);
  assert.deepEqual(choice("controlWinMode"), ["hold", "points"]);
  assert.deepEqual(choice("incomeMode"), ["current", "ratchet"]);
  assert.deepEqual(choice("killRewardCondition"), ["always", "behind", "upset"]);
  assert.deepEqual(choice("underdogBy"), ["both", "cells", "chips"]);
});

test("UI-V2 test 2 (values): out-of-range and malformed values are refused", () => {
  const bad: unknown[] = [
    { baseIncome: -1 },
    { startMana: [3, -4] },
    { maxHp: 0 },
    { manaCap: 1.5 },
    { chipIncomeSteps: [4, 3] },
    { chipIncomeSteps: [0] },
    { summonLimit: 0 },
    { counterMode: "everyone" },
    { effects: "yes" },
    { boardCells: 8 },
    { maxActionsPerTurn: 3 },
    { nope: 1 },
    [],
  ];
  for (const v of bad) assert.equal(parseConfigPatch(v, { midGame: false }).ok, false, JSON.stringify(v));
  assert.deepEqual(parseConfigPatch({ summonLimit: null, chipIncomeSteps: [2, 5] }, { midGame: false }), {
    ok: true,
    value: { summonLimit: null, chipIncomeSteps: [2, 5] },
  });
  for (const v of [{ sk03: { hp: 0 } }, { sk18: { hp: 3 } }, { sk01: { summonCost: 0 } }, { zz99: { hp: 3 } }, { sk03: { speed: 1 } }]) {
    assert.equal(parseCardOverrides(v, SK).ok, false, JSON.stringify(v));
  }
  assert.equal(parseCardOverrides({ sk18: { summonCost: 0 } }, SK).ok, true, "a reigu may cost 0");
  for (const id of ["__proto__", "constructor", "prototype"]) {
    const raw = JSON.parse(`{"${id}": {"hp": 5}}`);
    assert.equal(parseCardOverrides(raw, null).ok, false, `reserved id ${id} without a pack`);
    assert.equal(parseCardOverrides(raw, SK).ok, false, `reserved id ${id} with a pack`);
  }
  assert.equal(parseSettings({ rule: "r0913", pack: "shuten-kyuryu", config: { startMana: [3, 9], manaCap: 8 } }, () => SK).ok, false, "start mana above the cap");
});

test("UI-V2 test 3 (flow): variables that cannot change mid-match are refused and change nothing", () => {
  const f = createFlow(makeCtx(presetConfig("r0913"), SK), 4);
  for (const patch of [{ startLife: 20 }, { startMana: [5, 5] }, { mulligan: false }]) {
    const before = JSON.stringify({ cfg: f.ctx.cfg, state: f.state, log: f.log.length });
    const r = submit(f, 0, { type: "config", patch } as never);
    assert.equal(r.ok, false, JSON.stringify(patch));
    assert.equal(JSON.stringify({ cfg: f.ctx.cfg, state: f.state, log: f.log.length }), before);
  }
  assert.equal(parseConfigPatch({ startLife: 20 }, { midGame: true }).ok, false);
  assert.equal(submit(f, 0, { type: "config", patch: { baseIncome: 3 } }).ok, false, "a no-op change is refused");
  assert.equal(f.inputs.length, 0, "refused inputs are not recorded");
});

test("mid-match change: max HP down cuts current HP, up keeps it, never destroys; mana is cut to the cap", () => {
  const ctx = makeCtx(presetConfig("r0913"), SK);
  const s = blankState(ctx, 12);
  const big = place(s, "sk17", 0, 0, 0, 0); // 玖龍街 HP10 on an empty cell
  const hurt = place(s, "sk16", 1, 2, 2, 2); // 酒呑童子 HP7
  const weak = place(s, "sk03", 0, 2, 1, 3); // 影鬼 (陰) HP2 on the 陽 cell (2,1): 2 - 2 = 0 -> legal only because it was placed by hand
  s.units[1].damage = 2; // 5/7
  s.units[2].damage = -1; // shown as 1 HP (0 + 1)
  assert.equal(unitHp(ctx, s.units[0]), 10);
  const down = applyRuleChange(ctx, s, { maxHp: 6, manaCap: 10 });
  assert.equal(unitMaxHp(down.ctx, s.units[0]), 6);
  assert.equal(unitHp(down.ctx, s.units[0]), 6, "10/10 -> cut to 6");
  assert.equal(unitHp(down.ctx, s.units[1]), 5, "5/7 -> 5/6");
  assert.equal(s.players[0].mana, 10, "mana cut to the new cap");
  const up = applyRuleChange(down.ctx, s, { maxHp: 12 });
  assert.equal(unitMaxHp(up.ctx, s.units[0]), 10);
  assert.equal(unitHp(up.ctx, s.units[0]), 6, "raising the cap does not heal");
  const harsher = applyRuleChange(up.ctx, s, { attrBonus: 4 });
  assert.equal(unitHp(harsher.ctx, s.units.find((u) => u.uid === weak)!), 1, "a change never destroys a unit");
  assert.equal(unitHp(harsher.ctx, s.units.find((u) => u.uid === hurt)!), 5, "no attribute (陽 on empty) -> unchanged");
  assert.equal(big, s.units[0].uid);
  assert.equal(ctx.cfg.maxHp, 10, "the old Config object is untouched");
  assert.deepEqual(up.changes.map(describeChange), ["最大HP 6→12"]);
});

test("UI-V2 test 5: a match with mid-match rule changes replays to the same result", () => {
  const ctx = makeCtx(presetConfig("r0913"), SK);
  const f = createFlow(ctx, 20260914);
  const changes: Record<number, object> = {
    4: { baseIncome: 4 },
    14: { maxHp: 8, attrBonus: 1 },
    26: { manaCap: 9, rotateCost: 2, chipIncomeSteps: [2, 6] },
    38: { counterMode: "all", refundMode: "half" },
  };
  let applied = 0;
  for (let i = 0; i < 4000 && f.phase.kind !== "over"; i++) {
    const patch = changes[i];
    if (patch !== undefined) {
      const r = submit(f, 0, { type: "config", patch });
      assert.equal(r.ok, true, JSON.stringify(r));
      applied += 1;
    }
    aiStep(f);
  }
  assert.equal(f.phase.kind, "over");
  assert.equal(applied, 4);
  assert.equal(f.ctx.cfg.counterMode, "all");
  assert.equal(f.initialCfg.counterMode, "gap");
  assert.ok(f.log.filter((e) => e.event.t === "config").length === 4);
  const r = replayFlow(makeCtx(f.initialCfg, SK), 20260914, f.inputs);
  assert.deepEqual(r.state, f.state);
  assert.deepEqual(r.events, f.events);
  assert.deepEqual(r.log, f.log);
  assert.deepEqual(r.ctx.cfg, f.ctx.cfg);
  // without the change inputs the recorded game does not come out the same
  let differs = false;
  try {
    const plain = replayFlow(ctx, 20260914, f.inputs.filter((x) => x.input.type !== "config"));
    differs = JSON.stringify(plain.state) !== JSON.stringify(f.state);
  } catch {
    differs = true; // an input became illegal without the extra income
  }
  assert.ok(differs, "the rule changes mattered");
});

test("UI-V2 test 6: card overrides reach the match and never touch the loaded pack", () => {
  const fresh = loadPack(packPath("shuten-kyuryu"));
  const before = JSON.stringify(SK.cards);
  const sk03 = SK.byId.get("sk03");
  const pack = applyCardOverrides(SK, { sk03: { hp: 5, atk: 4, attackCost: 1 }, sk04: { lifeValue: 3 } });
  assert.equal(JSON.stringify(SK.cards), before, "the source pack is unchanged");
  assert.deepEqual(SK.cards, fresh.cards);
  assert.equal(SK.byId.get("sk03"), sk03, "same card object, still printed values");
  assert.equal(sk03?.hp, 2);
  assert.equal(pack.byId.get("sk03")?.hp, 5);
  assert.equal(pack.byId.get("sk04")?.lifeValue, 3);
  assert.equal(pack.byId.get("sk05"), SK.byId.get("sk05"), "untouched cards are shared");
  assert.deepEqual(pack.deckList, SK.deckList);

  const ctx = makeCtx({ ...presetConfig("r0828"), effects: false }, pack);
  const s = blankState(ctx, 10);
  const atk = place(s, "sk03", 0, 0, 0, 0); // faces north: (0,1)
  const def = place(s, "sk17", 1, 0, 1, 0); // 玖龍街 HP10 on 陰 (none attr: no bonus)
  assert.equal(unitMaxHp(ctx, s.units[0]), 5, "overridden HP on an empty cell");
  const res = applyAction(ctx, s, { kind: "attack", uid: atk, targetUid: def });
  const hit = res.events.find((e) => e.t === "attack");
  assert.ok(hit !== undefined && hit.t === "attack");
  assert.equal(hit.hits[0].dmg, 4, "overridden ATK deals the damage");
  assert.equal(hit.cost, 1, "overridden attack cost is paid");
  assert.equal(res.state.players[0].mana, 9);
  const printed = applyAction(makeCtx(ctx.cfg, SK), s, { kind: "attack", uid: atk, targetUid: def });
  const printedHit = printed.events.find((e) => e.t === "attack");
  assert.ok(printedHit !== undefined && printedHit.t === "attack");
  assert.equal(printedHit.hits[0].dmg, 2, "the printed pack still deals 2");
});

test("UI-V2 test 7: settings survive the share-URL round trip", () => {
  const cases: GameSettings[] = [
    defaultSettings("r0913"),
    defaultSettings("r0828"),
    {
      rule: "r0913",
      pack: "shuten-kyuryu",
      config: { baseIncome: 4, startMana: [2, 5], chipIncomeSteps: [2, 4, 6], summonLimit: 1, counterMode: "all", effects: false },
      cards: { sk03: { hp: 3, atk: 3 }, sk18: { summonCost: 1 } },
    },
    { rule: "r0828", pack: "tsukumo-miyako", config: { summonLimit: null, roundLimit: 30 }, cards: { tm04: { hp: 3 } } },
  ];
  const packs = new Map([["shuten-kyuryu", SK], ["tsukumo-miyako", loadPack(packPath("tsukumo-miyako"))]]);
  for (const s of cases) {
    const text = encodeSettings(s);
    assert.match(text, /^[A-Za-z0-9_-]+$/, "URL-safe");
    const back = decodeSettings(text, (name) => packs.get(name) ?? null);
    assert.ok(back.ok, JSON.stringify(back));
    const expected = parseSettings(s, (name) => packs.get(name) ?? null);
    assert.ok(expected.ok);
    assert.deepEqual(back.value, expected.value);
    assert.equal(changedItemCount(back.value), changedItemCount(expected.value));
  }
  // summonLimit null is the r0913 default, so it is not stored at all
  assert.ok(encodeSettings(defaultSettings()).length < 60, "an untouched preset is short");
  assert.equal(changedItemCount(decodeSettings(encodeSettings(cases[2]), () => SK).ok ? cases[2] : defaultSettings()), 9);
  // tampered or garbage strings are refused
  const tampered = btoa(JSON.stringify({ v: 1, r: "r0913", p: "shuten-kyuryu", c: { maxHp: 0 } })).replace(/=+$/, "");
  for (const bad of ["", "!!!", tampered, "x".repeat(5000), btoa("not json")]) {
    assert.equal(decodeSettings(bad, () => SK).ok, false, bad.slice(0, 20));
  }
  // 召喚コスト・攻撃コスト・HP・ATK・生命価・霊力価 (the last one since 採用 9/22)
  assert.equal(CARD_STATS.length, 6);
  assert.equal(cardChangeCount({ sk03: { hp: 3, atk: 3 }, sk04: {} }), 2);
});
