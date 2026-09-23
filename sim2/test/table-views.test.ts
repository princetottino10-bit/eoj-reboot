// Table view builders: the reigu confirm step, acted marks, upright labels, the turn panel and the prompt texts.
import test from "node:test";
import assert from "node:assert/strict";
import { pieceHtml } from "../play/cards-view.ts";
import { nameplateHtml, turnHtml } from "../play/hud.ts";
import { promptHtml } from "../play/prompt-view.ts";
import type { PromptVM } from "../play/prompt-view.ts";
import type { Names } from "../play/render.ts";
import { reiguForecast, reiguPrediction } from "../play/select.ts";
import { boardView } from "../online/view.ts";
import { presetConfig } from "../src/presets.ts";
import { legalEntries } from "../src/preview.ts";
import { makeCtx } from "../src/state.ts";
import { blankState, place } from "./helpers.ts";
import { SK } from "./online-helpers.ts";

const NAMES: Names = ["あなた", "AI greedy"];
const ctx = makeCtx(presetConfig("r0914"), SK);

const vm = (over: Partial<PromptVM>): PromptVM => {
  const s = blankState(ctx);
  return { ctx, board: boardView(s), names: NAMES, viewer: 0, hand: [], prompt: { kind: "main", legal: [] }, sel: { kind: "none" }, marked: 0, tansuIndex: 0, endConfirm: false, flash: "", ...over };
};

test("閻魔獄卒棒 on a unit facing an ally: the forecast names the ally, the damage, the HP and the destruction", () => {
  const s = blankState(ctx);
  const user = place(s, "sk01", 0, 1, 0, 0); // facing up at (1,0)
  const ally = place(s, "sk02", 0, 1, 1, 0); // 提灯お化け (HP 2) right in front
  const board = boardView(s);
  const f = reiguForecast(ctx, board, "sk22", user, 0);
  assert.ok(f !== null && f.kind === "strike" && f.victim !== null);
  assert.equal(f.victim.uid, ally);
  assert.equal(f.dmg, 3);
  assert.equal(f.ally, true);
  assert.equal(f.destroyed, true);
  assert.equal(f.after, 0);
  const pv = reiguPrediction(f);
  assert.ok(pv !== null);
  assert.equal(pv.attackerUid, null, "no counter badge for a reigu");
  assert.deepEqual(pv.hits.map((h) => [h.uid, h.dmg, h.ally, h.destroyed]), [[ally, 3, true, true]]);
});

test("a targeted reigu waits for confirmation: the prompt shows the forecast, a red confirm and a retarget button", () => {
  const s = blankState(ctx);
  const user = place(s, "sk01", 0, 1, 0, 0);
  place(s, "sk02", 0, 1, 1, 0);
  s.players[0].hand = ["sk22"];
  const legal = legalEntries(ctx, s);
  assert.ok(legal.some((e) => e.action.kind === "reigu" && e.action.targetUid === user), "the strike is legal");
  const html = promptHtml(vm({ board: boardView(s), hand: ["sk22"], prompt: { kind: "main", legal }, sel: { kind: "reigu", handIndex: 0, targetUid: user } }));
  assert.match(html, /data-act="confirm"/);
  assert.match(html, /btn-red/);
  assert.match(html, /味方への攻撃です/);
  assert.match(html, /3ダメージ/);
  assert.match(html, /HP 2→0/);
  assert.match(html, /data-act="retarget"/);
});

test("prompt texts: cell names for placing, a keyboard hint that can be hidden, the end-turn question notes what is left", () => {
  const s = blankState(ctx);
  s.players[0].hand = ["sk01"];
  const legal = legalEntries(ctx, s);
  const place1 = promptHtml(vm({ board: boardView(s), hand: ["sk01"], prompt: { kind: "main", legal }, sel: { kind: "place", handIndex: 0, pos: { x: 2, y: 2 } } }));
  assert.match(place1, /灯籠の精<\/b>を右上の空に置く向き/);
  assert.doesNotMatch(place1, /\(2,2\)/);
  const idle = promptHtml(vm({ board: boardView(s), hand: ["sk01"], prompt: { kind: "main", legal } }));
  assert.match(idle, /<span class="kbd-hint">\(Enter でターン終了\)<\/span>/);
  const ask = promptHtml(vm({ board: boardView(s), hand: ["sk01"], prompt: { kind: "main", legal }, endConfirm: true }));
  assert.match(ask, /まだ使える行動があります/);
});

test("acted marks show only on the turn player's pieces; a piece prints no name or seat seal, its owner is a cube", () => {
  const s = blankState(ctx);
  const uid = place(s, "sk09", 1, 1, 1, 2);
  const u = s.units.find((x) => x.uid === uid);
  assert.ok(u !== undefined);
  u.attackedThisTurn = true;
  const theirTurn = pieceHtml(ctx, u, { control: false, turnPlayer: 1 });
  const myTurn = pieceHtml(ctx, u, { control: false, turnPlayer: 0 });
  assert.match(theirTurn, /class="pc-flag"[^>]*>攻</);
  assert.match(theirTurn, /is-spent/);
  assert.doesNotMatch(myTurn, /pc-flag/);
  assert.doesNotMatch(myTurn, /is-spent/);
  // no upright name label and no 先/後 seal: the name is for screen readers (and the detail panel), the owner a cube
  assert.doesNotMatch(myTurn, /pc-name|pc-seal|>後</);
  assert.match(myTurn, /class="fu-name sr">一目鬼</);
  assert.match(myTurn, /class="mk pc-cube"[^>]*><use href="#mk-cube"\/>/);
  // the whole card turns (class f2), its numbers carry the counter-turn class; damage reads in vermilion
  assert.match(myTurn, /class="pc o1 f2 /);
  assert.doesNotMatch(myTurn, /class="num hurt"/);
  u.damage = 2;
  assert.match(pieceHtml(ctx, u, { control: false, turnPlayer: 0 }), /title="HP \d+\/\d+"[^>]*>.*<b class="num hurt">\d+<\/b>/);
});

test("turn panel: both seats during the mulligan, the result once over (no doubled 対局終了), life never below 0", () => {
  const s = blankState(ctx);
  const mull = turnHtml(ctx, boardView(s), NAMES, { phaseText: "マリガン", mulligan: true });
  assert.match(mull, /マリガン\(両者\)/);
  assert.doesNotMatch(mull, /の番/);
  s.ended = true;
  s.winner = 1;
  s.winType = "life";
  s.players[0].life = -1;
  const over = turnHtml(ctx, boardView(s), NAMES, { phaseText: "対局終了" });
  assert.equal(over.split("対局終了").length - 1, 1);
  assert.match(over, /AI greedyの勝ち・生命勝ち\(あなたの生命が0\)/);
  assert.match(nameplateHtml(ctx, boardView(s), 0, NAMES, true), /data-stat="life"[^>]*><i>生命<\/i><b>0<\/b>/);
  const online = turnHtml(ctx, boardView({ ...s, ended: false }), ["たろう", "はなこ"], { phaseText: "たろうが行動中" });
  assert.match(online, /たろうの番<\/span>\s*<span class="turn-phase">行動中</);
});
