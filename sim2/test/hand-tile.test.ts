// スマホの手札 (10/25): the hand on a phone uses the board's tile (art, range, numbers, name),
// a tap opens the card large with 召喚 / 使う in it, and a picked piece's range lies over the tiles.
import test from "node:test";
import assert from "node:assert/strict";
import { handHtml } from "../play/hand-view.ts";
import { handTileHtml } from "../play/cards-view.ts";
import { sheetUseHtml } from "../play/hand-view.ts";
import { presetConfig } from "../src/presets.ts";
import { makeCtx } from "../src/state.ts";
import { SK } from "./online-helpers.ts";

const ctx = makeCtx(presetConfig("r1007"), SK);

test("a shikigami hand tile shows the art, the range, 召喚霊力 / 耐 / 攻 and the name", () => {
  const card = SK.byId.get("sk01")!;
  const t = handTileHtml(ctx, "sk01");
  assert.match(t, /class="ht-tile/);
  assert.match(t, /class="pt-art"/);
  assert.match(t, /class="pt-range f0"[^>]*>\s*<svg class="fu-range/);
  assert.match(t, new RegExp(`class="pt-cost"[^>]*>[\\s\\S]*?<b>${card.summonCost}</b>`));
  assert.match(t, new RegExp(`耐<b>${card.hp}</b>`));
  assert.match(t, new RegExp(`攻<b>${card.atk}</b>`));
  assert.match(t, new RegExp(`class="pt-name">${card.nameJa}<`));
});

test("a discounted cost shows the cost now; a reigu tile has no range and says 霊具", () => {
  assert.match(handTileHtml(ctx, "sk01", { costNow: 1 }), /class="pt-cost is-disc"[\s\S]*?<b>1<\/b>/);
  const r = handTileHtml(ctx, "sk18");
  assert.doesNotMatch(r, /fu-range/);
  assert.match(r, /霊具/);
  assert.doesNotMatch(r, /耐<b>/);
});

test("handHtml with tile draws tiles in place of the card faces", () => {
  const cards = [{ cardId: "sk01", index: 0, playable: true, selected: false, marked: false }];
  const tiled = handHtml(ctx, cards, "play", {}, { tile: true });
  assert.match(tiled, /hand-card is-playable[^"]*" data-act="hand" data-i="0"/);
  assert.match(tiled, /ht-tile/);
  assert.doesNotMatch(tiled, /class="fu fu-md/);
  assert.match(handHtml(ctx, cards, "play", {}), /class="fu fu-md/);
});

test("the popup offers 召喚 for a usable shikigami, 使う for a reigu, nothing when it can't be used", () => {
  assert.match(sheetUseHtml(ctx, "sk01", 2, true), /data-act="sheet-use" data-i="2"[^>]*>召喚する</);
  assert.match(sheetUseHtml(ctx, "sk18", 0, true), /data-act="sheet-use" data-i="0"[^>]*>使う</);
  assert.equal(sheetUseHtml(ctx, "sk01", 2, false), "");
});
