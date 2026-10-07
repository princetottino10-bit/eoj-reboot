// The team sheet's 10/4 and 10/6 tabs as packs (sim2/out/sheet-1007/build_packs.py),
// and 10/6案 (r1006) = the 10/3 rule numbers on the 10/6 cards, the default since 10/7.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPack, packPath } from "../src/pack-io.ts";
import { DEFAULT_RULE_PRESET, packLabel, presetConfig, RULE_PRESETS } from "../src/presets.ts";

test("10/6案その2: 鎖鬼 and 首引の姫鬼 reach 2 cells, the top HP went up; same ids, art and effects as 10/3", () => {
  const p = loadPack(packPath("adopted-1006"));
  const old = loadPack(packPath("adopted-1003"));
  const by = (n: string) => p.cards.find((c) => c.nameJa === n)!;
  assert.equal(p.cards.length, 23);
  assert.deepEqual(by("鎖鬼").attackRange.length, 2);
  assert.deepEqual(by("首引の姫鬼").attackRange.length, 2);
  assert.equal(by("酒呑童子").hp, 15);
  assert.equal(by("玖龍街").hp, 19);
  assert.equal(by("鉈鬼").printId, "O-002", "鉞鬼 renamed on the sheet, same card");
  for (const c of p.cards) {
    const o = old.byId.get(c.id)!;
    assert.equal(c.effect, o.effect, c.id);
    assert.equal(c.printId, o.printId, c.id);
  }
  const p1 = loadPack(packPath("adopted-1006a"));
  assert.equal(p1.cards.find((c) => c.nameJa === "鎖鬼")!.attackRange.length, 3);
  assert.equal(loadPack(packPath("adopted-1004")).cards.length, 23);
  assert.equal(DEFAULT_RULE_PRESET, "r1007");
  assert.equal(RULE_PRESETS.r1006.defaultPack, "adopted-1006");
  assert.deepEqual(presetConfig("r1006"), presetConfig("r1003"));
  assert.match(packLabel("adopted-1006"), /10\/6/);
});

test("召喚攻撃のコストなし、コスト7以上だけ: a cheap summon pays for its attack, a heavy one does not", async () => {
  const { freeAttackFor } = await import("../src/rules.ts");
  const { makeCtx } = await import("../src/state.ts");
  const p = loadPack(packPath("adopted-1006"));
  const ctx = makeCtx(presetConfig("r1006", { freeSummonAttack: "optional", freeSummonAttackMinCost: 7 }), p);
  assert.equal(freeAttackFor(ctx, p.byId.get("ac03")!), false);
  assert.equal(freeAttackFor(ctx, p.byId.get("ac15")!), true);
  const all = makeCtx(presetConfig("r1006", { freeSummonAttack: "optional" }), p);
  assert.equal(freeAttackFor(all, p.byId.get("ac03")!), true);
});

test("りゅー案(仮): 28 cards, no cost 5-6, light and heavy twice; the default is not changed by it", async () => {
  const { settingPresetSettings } = await import("../src/setting-presets.ts");
  const { settingsPack } = await import("../src/settings.ts");
  const printed = loadPack(packPath("adopted-1006"));
  const s = settingPresetSettings("ryuDraft", printed);
  const pack = settingsPack(s, printed);
  assert.equal(pack.deckList.length, 28);
  const cost = (id: string) => pack.byId.get(id)!.summonCost;
  assert.ok(pack.deckList.every((id) => pack.byId.get(id)!.kind !== "shikigami" || cost(id) < 5 || cost(id) > 6));
  assert.equal(pack.deckList.filter((id) => id === "ac17").length, 2);
  assert.equal(DEFAULT_RULE_PRESET, "r1007");
});
