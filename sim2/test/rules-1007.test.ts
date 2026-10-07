// 10/7 mock-test reports: 継承召喚 took the 太極 discount a second time, heals
// stopped at a per-unit max HP the game never had, and the mulligan
// can now send the cards to the grave.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig } from "../src/presets.ts";
import { applyAction, isLegal } from "../src/rules.ts";
import { healUnit, makeCtx, unitHp, unitMaxHp } from "../src/state.ts";
import { performMulligan } from "../src/turn.ts";
import { blankState, place } from "./helpers.ts";

const PACK = loadPack(packPath("adopted-1006"));

test("継承召喚 onto the 太極 pays the printed cost: 霊力6, 影鬼 on 太極 (1), then 茨木 (8) is not payable", () => {
  const ctx = makeCtx(presetConfig("r1006"), PACK);
  const s = blankState(ctx, 6);
  s.players[0].hand = ["ac03", "ac15"];
  const a = applyAction(ctx, s, { kind: "summon", handIndex: 0, pos: { x: 1, y: 1 }, facing: 0 }).state;
  assert.equal(a.players[0].mana, 5);
  const inherit = { kind: "inherit" as const, handIndex: 0, targetUid: a.units[0].uid };
  assert.equal(isLegal(ctx, a, inherit), false);
  a.players[0].mana = 8;
  assert.equal(isLegal(ctx, a, inherit), true);
  // 8 - 8 + ceil(3/2)
  assert.equal(applyAction(ctx, a, inherit).state.players[0].mana, 2);
  // the old behaviour stays behind the option
  const old = makeCtx(presetConfig("r1006", { inheritTaiji: true }), PACK);
  a.players[0].mana = 6;
  assert.equal(isLegal(old, a, inherit), true);
});

test("no per-unit max HP: heals go past the card's HP, up to the board's 19", () => {
  const ctx = makeCtx(presetConfig("r1006"), PACK);
  const s = blankState(ctx);
  place(s, "ac03", 0, 0, 0, 0);
  const u = s.units[0];
  u.damage = 1;
  healUnit(ctx, u, 3);
  assert.equal(unitHp(ctx, u), unitMaxHp(ctx, u) + 2);
  healUnit(ctx, u, 40);
  assert.equal(unitHp(ctx, u), 19);
  const old = makeCtx(presetConfig("r0923"), loadPack(packPath("adopted-0922")));
  const s2 = blankState(old);
  place(s2, "ad03", 0, 0, 0, 0);
  healUnit(old, s2.units[0], 3);
  assert.equal(unitHp(old, s2.units[0]), unitMaxHp(old, s2.units[0]) + 3);
});

test("マリガン: 捨て札にする puts the cards in the grave and draws from the deck", () => {
  for (const to of ["deck", "grave"] as const) {
    const ctx = makeCtx(presetConfig("r1006", { mulligan: true, mulliganTo: to }), PACK);
    const s = blankState(ctx);
    s.players[0].hand = ["ac01", "ac02", "ac03"];
    s.players[0].deck = ["ac04", "ac05", "ac06", "ac07"];
    s.players[0].grave = [];
    performMulligan(ctx, s, [], (_c, _s, p) => (p === 0 ? [0, 1] : []));
    const ps = s.players[0];
    assert.equal(ps.hand.length, 3, to);
    if (to === "grave") {
      assert.deepEqual(ps.grave, ["ac01", "ac02"]);
      assert.equal(ps.deck.length, 2);
    } else {
      assert.deepEqual(ps.grave, []);
      assert.equal(ps.deck.length, 4);
    }
  }
});

test("10/7モック案: 10/6案 with the dial, chips 4/5 and 太極−1, three changes from the base", async () => {
  const { settingPresetSettings } = await import("../src/setting-presets.ts");
  const { settingsConfig, settingsDiff } = await import("../src/settings.ts");
  const s = settingPresetSettings("mock1007", PACK);
  const cfg = settingsConfig(s);
  assert.equal(cfg.incomeMode, "current");
  assert.deepEqual(cfg.chipIncomeSteps, [4, 5]);
  assert.equal(cfg.taijiDiscount, 1);
  assert.equal(settingsDiff(s).rules.length, 3);
});

test("3点先取: a turn end on 占拠5 scores 1, on 6 scores 3 and wins", async () => {
  const { endTurn } = await import("../src/turn.ts");
  const { settingPresetSettings } = await import("../src/setting-presets.ts");
  const { settingsConfig } = await import("../src/settings.ts");
  const cfg = { ...settingsConfig(settingPresetSettings("points3", PACK)), controlCount: "cells" as const };
  const ctx = makeCtx(cfg, PACK);
  const run = (n: number) => {
    const s = blankState(ctx);
    const cells: [number, number][] = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]];
    for (const [x, y] of cells.slice(0, n)) place(s, "ac03", 0, x, y, 0);
    s.players[0].deck = Array(20).fill("ac01");
    endTurn(ctx, s, [], () => []);
    return s;
  };
  assert.equal(run(4).players[0].controlPoints, 0);
  const five = run(5);
  assert.equal(five.players[0].controlPoints, 1);
  assert.equal(five.ended, false);
  const six = run(6);
  assert.equal(six.players[0].controlPoints, 3);
  assert.equal(six.winner, 0);
});
