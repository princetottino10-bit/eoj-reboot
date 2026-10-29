// 遊びやすくする工夫 (10/17): what a square does to the card about to be summoned
// there (its 耐久 change), which squares an enemy can already hit, and the
// one line about the race to 制圧 at the top of the idle prompt.
import test from "node:test";
import assert from "node:assert/strict";
import { promptHtml } from "../play/prompt-view.ts";
import type { PromptVM } from "../play/prompt-view.ts";
import { boardHtml } from "../play/board-view.ts";
import type { BoardVM } from "../play/board-view.ts";
import { placeHints } from "../play/select.ts";
import { boardView } from "../online/view.ts";
import { presetConfig } from "../src/presets.ts";
import { legalEntries } from "../src/preview.ts";
import { controlNeed, makeCtx } from "../src/state.ts";
import { blankState, place } from "./helpers.ts";
import { SK } from "./online-helpers.ts";

const ctx = makeCtx(presetConfig("r0914"), SK);
const NAMES: [string, string] = ["あなた", "相手"];

test("placeHints: the 耐久 change of each square and the enemies that reach it", () => {
  const s = blankState(ctx);
  // the enemy's sk02 (前1) at the top middle, facing down: it reaches the centre only
  place(s, "sk02", 1, 1, 2, 2);
  const cells = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 0 }];
  const h = placeHints(ctx, boardView(s), "sk01", 0, cells); // 陽
  assert.equal(h.get("1,0")?.delta, ctx.cfg.attrBonus); // 陽のマス
  assert.equal(h.get("0,1")?.delta, -ctx.cfg.attrBonus); // 陰のマス
  assert.equal(h.get("0,0")?.delta, 0);
  assert.equal(h.get("1,1")?.threats, 1);
  assert.equal(h.get("0,0")?.threats, 0);
  // own pieces never count as a threat
  place(s, "sk02", 0, 0, 2, 2);
  assert.equal(placeHints(ctx, boardView(s), "sk01", 0, [{ x: 0, y: 1 }]).get("0,1")?.threats, 0);
});

test("the board writes the hints on the glowing squares only", () => {
  const s = blankState(ctx);
  place(s, "sk02", 1, 1, 2, 2);
  const board = boardView(s);
  const marks = new Map([["1,0", "summon" as const], ["1,1", "summon" as const]]);
  const vm: BoardVM = {
    ctx, board, names: NAMES, look: {}, marks, range: null, selectedUid: null, selectedCell: null, prediction: null, radial: null, facing: null,
    placeHints: placeHints(ctx, board, "sk01", 0, [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]),
  };
  const html = boardHtml(vm);
  assert.match(html, new RegExp(`耐久\\+${ctx.cfg.attrBonus}`));
  assert.match(html, /敵間合内/);
  // (0,1) has a hint but no glow: nothing is written there
  assert.doesNotMatch(html, new RegExp(`耐久−${ctx.cfg.attrBonus}`));
});

const vm = (over: Partial<PromptVM>): PromptVM => ({
  ctx, board: boardView(blankState(ctx)), names: NAMES, viewer: 0, hand: [], prompt: { kind: "main", legal: [] }, sel: { kind: "none" }, marked: 0, tansuIndex: 0, endConfirm: false, flash: "", ...over,
});

test("the idle prompt says how close either side is to 制圧", () => {
  const s = blankState(ctx);
  const need = controlNeed(ctx, s);
  for (let i = 0; i < need - 1; i++) place(s, "sk01", 0, i % 3, Math.floor(i / 3), 0);
  const near = promptHtml(vm({ board: boardView(s), prompt: { kind: "main", legal: legalEntries(ctx, s) } }));
  assert.match(near, new RegExp(`総制圧力${need - 1}/${need}`));
  assert.doesNotMatch(near, /しないと|しのげば|崩さない/);
  const t = blankState(ctx);
  for (let i = 0; i < need; i++) place(t, "sk01", 1, i % 3, Math.floor(i / 3), 2);
  t.players[1].reach = true;
  const danger = promptHtml(vm({ board: boardView(t), prompt: { kind: "main", legal: legalEntries(ctx, t) } }));
  assert.match(danger, /相手がチェック中/);
  const calm = promptHtml(vm({ board: boardView(blankState(ctx)), prompt: { kind: "main", legal: [] } }));
  assert.doesNotMatch(calm, /チェック|総制圧力/);
});
