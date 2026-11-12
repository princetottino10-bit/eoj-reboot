// 11/13案 (pack-adopted-1113): シート【採用_261113】一門_玖龍街＋酒呑_Ver4_3。
// 10/13案と同じ札で、霊力価(撃破した側が得る霊力)だけを直したもの。
// 11/12 の見直しで、霊力価の基準を「召喚霊力×25%」から意図どおりの「耐久×22%」にした
// (小型=盤上の耐久5以下は1まで)。表のミスで低すぎた9枚が上がる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPack, packPath } from "../src/pack-io.ts";
import { DEFAULT_RULE_PRESET, packLabel, PLAYABLE_PACKS, RULE_PRESETS } from "../src/presets.ts";
import { decodeSettings, defaultSettings, encodeSettings, upgradeLegacyPack } from "../src/settings.ts";

const P13 = loadPack(packPath("adopted-1013"));
const P1113 = loadPack(packPath("adopted-1113"));

/** シート Ver4_3 の霊力価 (T列) */
const SHEET_MANA_VALUE: Record<string, number> = {
  ac01: 1, ac02: 1, ac03: 1, ac04: 1, ac05: 2, ac06: 1, ac07: 2, ac08: 2, ac09: 2,
  ac10: 2, ac11: 2, ac12: 2, ac13: 3, ac14: 3, ac15: 3, ac16: 3, ac17: 4,
};

test("11/13 pack: 10/13案と同じ札で、霊力価だけシート Ver4_3 の値", () => {
  assert.equal(P1113.cards.length, P13.cards.length);
  const changed: string[] = [];
  for (const c of P1113.cards) {
    const o = P13.byId.get(c.id)!;
    assert.deepEqual({ ...c, manaValue: o.manaValue }, o, c.id);
    if (c.kind === "shikigami") assert.equal(c.manaValue, SHEET_MANA_VALUE[c.id], c.id);
    else assert.equal(c.manaValue, 0, c.id);
    if (c.manaValue !== o.manaValue) changed.push(c.id);
  }
  // 古箪笥・変面・一角鬼・一目鬼 1→2、僵尸公主・両面・茨木童子・酒呑童子 2→3、玖龍街 3→4
  assert.deepEqual(changed.sort(), ["ac05", "ac07", "ac08", "ac09", "ac13", "ac14", "ac15", "ac16", "ac17"]);
});

test("11/13 pack: 10/26案(既定のルール)と10/7決定の札になり、前の案も選べる", () => {
  assert.equal(DEFAULT_RULE_PRESET, "r1026");
  assert.equal(RULE_PRESETS.r1026.defaultPack, "adopted-1113");
  assert.equal(RULE_PRESETS.r1007.defaultPack, "adopted-1113");
  assert.equal(PLAYABLE_PACKS[0], "adopted-1113");
  assert.ok((PLAYABLE_PACKS as readonly string[]).includes("adopted-1013"));
  assert.equal(defaultSettings().pack, "adopted-1113");
  assert.match(packLabel("adopted-1113"), /11\/13/);
});

test("10/13案・10/6案その2の古いリンクは11/13案の札で開く(ルールの変更は残す)", () => {
  for (const from of ["adopted-1013", "adopted-1006"] as const) {
    const old = encodeSettings({ ...defaultSettings(), pack: from, config: { taijiDiscount: 2 } });
    const up = decodeSettings(upgradeLegacyPack(old), null);
    assert.ok(up.ok);
    if (!up.ok) return;
    assert.equal(up.value.pack, "adopted-1113", from);
    assert.deepEqual(up.value.config, { taijiDiscount: 2 });
  }
});
