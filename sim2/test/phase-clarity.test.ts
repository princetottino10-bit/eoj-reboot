// 今なにをする場面か (10/17): every prompt opens with a step label, and the opening
// mulligan is a panel of its own over the (still empty) board.
import test from "node:test";
import assert from "node:assert/strict";
import { promptHtml } from "../play/prompt-view.ts";
import type { PromptVM } from "../play/prompt-view.ts";
import { mulliganPanelHtml } from "../play/mulligan-view.ts";
import { boardView } from "../online/view.ts";
import { presetConfig } from "../src/presets.ts";
import { makeCtx } from "../src/state.ts";
import { blankState } from "./helpers.ts";
import { SK } from "./online-helpers.ts";

const ctx = makeCtx(presetConfig("r0914"), SK);
const vm = (over: Partial<PromptVM>): PromptVM => ({
  ctx, board: boardView(blankState(ctx)), names: ["あなた", "相手"], viewer: 0, hand: [], prompt: { kind: "main", legal: [] }, sel: { kind: "none" }, marked: 0, tansuIndex: 0, endConfirm: false, flash: "", ...over,
});

test("each prompt names the step: your turn, the opponent's, the mulligan", () => {
  const mine = promptHtml(vm({}));
  assert.match(mine, /pr-step is-you[^>]*>あなたの番/);
  assert.match(mine, /ターン終了/);
  const b = { ...boardView(blankState(ctx)), turnPlayer: 1 as const };
  assert.match(promptHtml(vm({ board: b, prompt: { kind: "idle", text: "AIが考えています…" } })), /pr-step is-opp[^>]*>相手の番/);
  assert.match(promptHtml(vm({ prompt: { kind: "mulligan" } })), /pr-step[^>]*>対局前: 手札の引き直し/);
  assert.match(promptHtml(vm({ prompt: { kind: "over", text: "勝ち" } })), /^(?![\s\S]*pr-step)/);
});

test("the mulligan panel: the hand, what a tap does, and one button that fits the choice", () => {
  const cards = ["sk01", "sk02", "sk03"].map((cardId, index) => ({ cardId, index, playable: false, selected: false, marked: index === 1 }));
  const none = mulliganPanelHtml(ctx, cards.map((c) => ({ ...c, marked: false })), {}, 0);
  assert.match(none, /1回だけ/);
  assert.equal((none.match(/data-act="hand"/g) ?? []).length, 3);
  assert.match(none, /data-act="marks-none"[^>]*>このまま始める/);
  assert.doesNotMatch(none, /data-act="marks"/);
  const one = mulliganPanelHtml(ctx, cards, {}, 1);
  assert.match(one, /is-marked/);
  assert.match(one, /data-act="marks"[^>]*>1枚を引き直して始める/);
  assert.match(one, /引き直す/);
});

test("a piece that counts 制圧力2 says so on the board", async () => {
  const { pieceHtml } = await import("../play/cards-view.ts");
  const c = makeCtx(presetConfig("r1007"), SK);
  const big = { uid: 1, cardId: "sk01", owner: 0 as const, pos: { x: 0, y: 0 }, facing: 0 as const, damage: 0, attackedThisTurn: false, rotatedThisTurn: false, summonedThisTurn: false, hiddenBy: null, atkBuff: 0 };
  const hc = makeCtx({ ...presetConfig("r1007"), controlCountThreshold: 1 }, SK);
  assert.match(pieceHtml(hc, big, { control: false }), /pc-ctl2[^>]*>制2/);
  const lo = makeCtx({ ...presetConfig("r1007"), controlCountThreshold: 99 }, SK);
  assert.doesNotMatch(pieceHtml(lo, big, { control: false }), /pc-ctl2/);
  void c;
});
