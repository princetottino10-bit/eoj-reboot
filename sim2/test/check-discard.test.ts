// 王手を意識した手札整理: one or two short of the unit-count コールド勝ち, keep the
// cheapest shikigami that finish next turn and redraw the rest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAwareDiscard } from "../src/ai/check-discard.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig } from "../src/presets.ts";
import { makeCtx } from "../src/state.ts";
import { defaultDiscardPolicy } from "../src/turn.ts";
import { blankState, place } from "./helpers.ts";

const AC = loadPack(packPath("adopted-1003"));
const COLD5 = { instantWinCells: 5, instantWinTiming: "immediate" as const, instantWinCount: "units" as const };

test("check-aware discard: at 3 units keep the two cheap shikigami that fit next turn, pitch the 7-cost and the reigu", () => {
  const ctx = makeCtx(presetConfig("r1003", COLD5), AC);
  const s = blankState(ctx, 7);
  for (const [x, y] of [[0, 0], [2, 0], [0, 2]]) place(s, "ac06", 0, x, y, 0);
  s.players[0].hand = ["ac12", "ac03", "ac18", "ac04", "ac10"]; // 首引7, 影鬼3, 家鳴り, 鉞鬼3, 雲外鏡6
  const pitch = checkAwareDiscard(defaultDiscardPolicy)(ctx, s, 0);
  assert.deepEqual(pitch, [0, 2, 4]);
  // without the コールド勝ち rule the base policy decides
  const plain = makeCtx(presetConfig("r1003"), AC);
  assert.deepEqual(checkAwareDiscard(defaultDiscardPolicy)(plain, s, 0), defaultDiscardPolicy(plain, s, 0));
  // far from it (1 unit): the base policy too
  const far = blankState(ctx, 7);
  place(far, "ac06", 0, 0, 0, 0);
  far.players[0].hand = s.players[0].hand.slice();
  assert.deepEqual(checkAwareDiscard(defaultDiscardPolicy)(ctx, far, 0), defaultDiscardPolicy(ctx, far, 0));
});
