// The attack range printed on every card, and board pieces turning with their facing.
import test from "node:test";
import assert from "node:assert/strict";
import { cardFaceHtml, describeRange, pieceHtml, rangeSvg } from "../play/cards-view.ts";
import { presetConfig } from "../src/presets.ts";
import { makeCtx } from "../src/state.ts";
import { blankState, place } from "./helpers.ts";
import { SK } from "./online-helpers.ts";

const count = (html: string, cls: string): number => html.split(`class="${cls}"`).length - 1;

test("range diagram: 3x3 for adjacent ranges, 5x5 when something reaches two cells; the 記号体系's primitives per cell", () => {
  // 一目鬼 (area): attack front/left/right, counter front, blind front corners and back, gap on the right
  const ichimoku = SK.byId.get("sk09");
  assert.ok(ichimoku !== undefined);
  const svg = rangeSvg(ichimoku.attackRange, ichimoku.blindSpots, { x: 1, y: 0 }, 0, { counter: ichimoku.counterRange, aoe: true });
  assert.match(svg, /class="fu-range g3"/);
  assert.equal(count(svg, "rs-atk"), 3);
  assert.equal(svg.split('<rect class="rs-atk" ').length - 1, 3, "area attack = squares");
  assert.equal(svg.split('<rect class="rs-ctr" ').length - 1, 1, "area counter = a full-cell square");
  assert.equal(count(svg, "rs-blind"), 3);
  assert.equal(count(svg, "rs-gap"), 1);
  assert.equal(count(svg, "rs-self"), 1);
  assert.equal(count(svg, "rs-cell"), 8, "every cell but the piece has its washi ground");
  // 影鬼 (single): circles, the counter inscribed in the cell, the attack at half of it
  const kage = SK.byId.get("sk03");
  assert.ok(kage !== undefined);
  const single = rangeSvg(kage.attackRange, kage.blindSpots, null, 0, { counter: kage.counterRange, aoe: false });
  assert.match(single, /<circle class="rs-ctr" cx="[\d.]+" cy="[\d.]+" r="5"\/>/);
  assert.match(single, /<circle class="rs-atk" cx="[\d.]+" cy="[\d.]+" r="2.5"\/>/);
  assert.equal(count(single, "rs-gap"), 0);
  // 一角鬼 reaches two cells forward
  const ikkaku = SK.byId.get("sk08");
  assert.ok(ikkaku !== undefined);
  const far = rangeSvg(ikkaku.attackRange, ikkaku.blindSpots, null, 0, { counter: ikkaku.counterRange });
  assert.match(far, /class="fu-range g5"/);
  assert.equal(count(far, "rs-atk"), 4);
  assert.equal(count(far, "rs-dot"), 16 - 3, "unused outer ring cells are dots");
});

test("range diagram is described in words for the tooltip, with the facing on the board", () => {
  assert.equal(
    describeRange([{ x: -1, y: 1 }, { x: 0, y: 2 }], [{ x: 0, y: -1 }], { x: -1, y: 1 }),
    "攻撃範囲: 左前・前2 / 死角: 後 / 隙: 左前",
  );
  assert.equal(
    describeRange([{ x: -1, y: 1 }, { x: 0, y: 2 }], [{ x: 0, y: -1 }], null, [{ x: 0, y: 1 }]),
    "攻撃範囲: 左前・前2 / 反撃範囲: 前 / 死角: 後",
  );
  assert.match(rangeSvg([{ x: 0, y: 1 }], [], null, 2), /aria-label="攻撃範囲: 前 \/ 死角: なし\(いまの向き: 下\)"/);
});

test("every shikigami card shows its range at all three sizes; reigu cards have none", () => {
  const ctx = makeCtx(presetConfig("r0913"), SK);
  for (const card of SK.cards) {
    for (const size of ["sm", "md", "lg"] as const) {
      const html = cardFaceHtml(ctx, card.id, { size });
      assert.equal(html.includes("fu-range"), card.kind !== "reigu", `${card.id} ${size}`);
    }
  }
});

test("a board piece carries its facing so the whole card turns, and the diagram inside stays printed", () => {
  const ctx = makeCtx(presetConfig("r0913"), SK);
  const s = blankState(ctx);
  place(s, "sk09", 0, 1, 1, 2);
  const u = s.units[0];
  assert.ok(u !== undefined);
  const html = pieceHtml(ctx, u, { control: false });
  assert.match(html, /class="pc o0 f2 /);
  assert.match(html, /class="fu-range g3"/);
  assert.match(html, /いまの向き: 下/);
});
