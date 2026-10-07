// 10/7 mock-test reports: 継承召喚 took the 太極 discount a second time, heals
// stopped at a per-unit max HP the paper rule does not have, and the mulligan
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

test("回復の上限: 10/6案 heals past the card's HP up to 19; the unit cap is still an option", () => {
  const board = makeCtx(presetConfig("r1006"), PACK);
  const s = blankState(board);
  place(s, "ac03", 0, 0, 0, 0);
  const u = s.units[0];
  u.damage = 1;
  healUnit(board, u, 3);
  assert.equal(unitHp(board, u), unitMaxHp(board, u) + 2);
  healUnit(board, u, 40);
  assert.equal(unitHp(board, u), 19);
  const unit = makeCtx(presetConfig("r1006", { healCap: "unit" }), PACK);
  u.damage = 1;
  healUnit(unit, u, 3);
  assert.equal(unitHp(unit, u), unitMaxHp(unit, u));
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
