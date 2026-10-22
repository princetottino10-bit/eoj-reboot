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

test("board pieces carry no 制2 tag (10/22: 制圧力 lives on the summary card only)", async () => {
  const { pieceHtml } = await import("../play/cards-view.ts");
  const big = { uid: 1, cardId: "sk01", owner: 0 as const, pos: { x: 0, y: 0 }, facing: 0 as const, damage: 0, attackedThisTurn: false, rotatedThisTurn: false, summonedThisTurn: false, hiddenBy: null, atkBuff: 0 };
  const hc = makeCtx({ ...presetConfig("r1007"), controlCountThreshold: 1 }, SK);
  assert.doesNotMatch(pieceHtml(hc, big, { control: false }), /制2/);
  assert.doesNotMatch(pieceHtml(hc, big, { control: false, tile: true }), /制2/);
});

test("the range diagram marks the piece's front with an arrow, and a tile turns only the diagram", async () => {
  const { pieceHtml, rangeSvg } = await import("../play/cards-view.ts");
  const svg = rangeSvg([{ x: 0, y: 1 }], [{ x: 0, y: -1 }], null);
  assert.match(svg, /class="rs-fwd" d="M[\d.]+ [\d.]+L[^"]*Z"/);
  assert.equal((svg.match(/class="rs-fwd" d="([^"]*)"/)?.[1].match(/L/g) ?? []).length, 6);
  const turned = { uid: 1, cardId: "sk01", owner: 0 as const, pos: { x: 0, y: 0 }, facing: 1 as const, damage: 0, attackedThisTurn: false, rotatedThisTurn: false, summonedThisTurn: false, hiddenBy: null, atkBuff: 0 };
  const tile = pieceHtml(makeCtx(presetConfig("r1007"), SK), turned, { control: false, tile: true });
  assert.match(tile, /pc-tile/);
  assert.match(tile, /class="pt-range f1"/);
  assert.match(tile, /class="pc-dir f1"/);
});

test("a 制圧チェック knocked below the count stops showing as one", async () => {
  const { inCheck } = await import("../play/render.ts");
  const { nameplateHtml } = await import("../play/hud.ts");
  const c = makeCtx(presetConfig("r1007"), SK);
  const s = blankState(c);
  s.players[1].reach = true; // declared at its turn end, then knocked down to 0 on my turn
  const b = boardView(s);
  assert.equal(inCheck(c, b, 1), false);
  assert.doesNotMatch(nameplateHtml(c, b, 1, ["あなた", "相手"], false), /is-ctl/);
  const p = promptHtml({ ...vm({}), ctx: c, board: b });
  assert.doesNotMatch(p, /相手が制圧チェック中/);
  assert.match(p, /相手の制圧チェックは崩れています/);
});

test("a piece says its 耐久 now in a tag of its own, marked when hurt", async () => {
  const { pieceHtml } = await import("../play/cards-view.ts");
  const { unitMaxHp } = await import("../src/state.ts");
  const c = makeCtx(presetConfig("r1007"), SK);
  const u = { uid: 1, cardId: "sk02", owner: 0 as const, pos: { x: 0, y: 0 }, facing: 0 as const, damage: 0, attackedThisTurn: false, rotatedThisTurn: false, summonedThisTurn: false, hiddenBy: null, atkBuff: 0 };
  const max = unitMaxHp(c, u);
  assert.match(pieceHtml(c, u, { control: false }), new RegExp(`class="pc-hp"[^>]*>耐久<b>${max}</b>`));
  const hurt = pieceHtml(c, { ...u, damage: 1 }, { control: false });
  assert.match(hurt, new RegExp(`class="pc-hp is-hurt"[^>]*>耐久<b>${max - 1}</b>`));
});

test("my pieces that can still attack are marked on the board", async () => {
  const { boardHtml } = await import("../play/board-view.ts");
  const { place } = await import("./helpers.ts");
  const s = blankState(ctx);
  place(s, "sk02", 0, 1, 1, 0);
  const b = boardView(s);
  const uid = b.units[0].uid;
  const base = { ctx, board: b, names: ["あなた", "相手"] as [string, string], look: {}, marks: new Map(), range: null, selectedUid: null, selectedCell: null, prediction: null, radial: null, facing: null };
  assert.match(boardHtml({ ...base, canAttack: new Set([uid]) }), /can-attack[\s\S]*攻撃できる/);
  assert.doesNotMatch(boardHtml(base), /can-attack/);
});
