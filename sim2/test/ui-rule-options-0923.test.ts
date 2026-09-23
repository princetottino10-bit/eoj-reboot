// The browser table under the 9/23 optional rule settings: weighted 占拠 in the
// nameplate / turn panel / board lanterns, the late control line, 制圧点, the
// income tooltip, the new log lines, and 劣勢割引 on summon costs.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CardPack } from "../src/cards.ts";
import { boardHtml } from "../play/board-view.ts";
import type { BoardVM } from "../play/board-view.ts";
import { cardFaceHtml } from "../play/cards-view.ts";
import { nameplateHtml, turnHtml } from "../play/hud.ts";
import { promptHtml } from "../play/prompt-view.ts";
import type { PromptVM } from "../play/prompt-view.ts";
import { describeEvent, inheritSummaryLines, occupiedOf } from "../play/render.ts";
import type { Names } from "../play/render.ts";
import { boardView } from "../online/view.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig } from "../src/presets.ts";
import { legalEntries } from "../src/preview.ts";
import { makeCtx } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import type { Config, GameEvent } from "../src/types.ts";
import { blankState, place } from "./helpers.ts";

const AD: CardPack = loadPack(packPath("adopted-0922"));
const r0923 = (over: Partial<Config> = {}): Ctx => makeCtx(presetConfig("r0923", over), AD);
const NAMES: Names = ["あなた", "AI"];

/** P0: 玖龍街 (HP 13) + three small ones = 4 cells; P1: one. */
const bigBoard = (ctx: Ctx) => {
  const s = blankState(ctx, 10);
  place(s, "ad17", 0, 0, 0, 0);
  place(s, "ad02", 0, 2, 0, 0);
  place(s, "ad03", 0, 2, 2, 0);
  place(s, "ad02", 0, 1, 2, 0);
  place(s, "ad14", 1, 0, 1, 2);
  return s;
};

const occText = (html: string): string => {
  const m = /np-occ[^>]*>.*?<b>(\d+)<\/b><small>\/(\d+)<\/small>/s.exec(html);
  assert.ok(m !== null, "the 占拠 stat is shown");
  return `${m[1]}/${m[2]}`;
};

test("占拠 in the HUD counts a HP 11+ unit as 2 under controlCount hp (and 1 under cells)", () => {
  const hp = r0923({ controlCount: "hp", controlCountThreshold: 11 });
  const s = bigBoard(hp);
  const board = boardView(s);
  assert.equal(occupiedOf(hp, board, 0), 5);
  const np = nameplateHtml(hp, board, 0, NAMES, true);
  assert.equal(occText(np), `5/${hp.cfg.controlWin}`);
  assert.match(np, /HP11以上の駒は2マス分/);
  const plain = r0923();
  assert.equal(occText(nameplateHtml(plain, boardView(bigBoard(plain)), 0, NAMES, true)), `4/${plain.cfg.controlWin}`);

  // the turn panel and the board lanterns read the same weighted count
  s.players[0].reach = true;
  const b2 = boardView(s);
  assert.match(turnHtml(hp, b2, NAMES, { phaseText: "" }), /占拠5/);
  const vm: BoardVM = {
    ctx: hp, board: b2, names: NAMES, look: {}, marks: new Map(), range: null, bottom: 0,
    selectedUid: null, selectedCell: null, prediction: null, radial: null, facing: null,
  };
  const bd = boardHtml(vm);
  const lamps = /bd-ctl[^"]*o0"[^>]*><span class="bd-lamps">(.*?)<\/span>/s.exec(bd);
  assert.ok(lamps !== null);
  assert.equal((lamps[1].match(/bd-lamp on/g) ?? []).length, hp.cfg.controlWin, "every lantern lit");
});

test("the late control line shows after a reshuffle (controlWinLate), marked as 終盤", () => {
  const ctx = r0923({ controlWinLate: 4 });
  const s = bigBoard(ctx);
  assert.equal(occText(nameplateHtml(ctx, boardView(s), 0, NAMES, true)), `4/${ctx.cfg.controlWin}`);
  s.players[1].reshuffleCount = 1;
  const np = nameplateHtml(ctx, boardView(s), 0, NAMES, true);
  assert.equal(occText(np), "4/4");
  assert.match(np, /np-occ is-late/);
  assert.match(np, /(終盤)/);
});

test("controlWinMode points: the nameplate shows 制圧点 N/M; hold mode shows none", () => {
  const ctx = r0923({ controlWinMode: "points", controlPointsToWin: 2 });
  const s = blankState(ctx);
  s.players[0].controlPoints = 1;
  const np = nameplateHtml(ctx, boardView(s), 0, NAMES, true);
  assert.match(np, /<i>制圧点<\/i><b>1<\/b><small>\/2<\/small>/);
  assert.doesNotMatch(nameplateHtml(r0923(), boardView(s), 0, NAMES, true), /制圧点/);
});

test("the chip tooltip gives the income now: 劣勢ボーナス included", () => {
  const ctx = r0923({ underdogIncome: 1 });
  const s = blankState(ctx);
  place(s, "ad02", 1, 2, 2, 2);
  const np = nameplateHtml(ctx, boardView(s), 0, NAMES, true);
  assert.match(np, new RegExp(`収入 ${ctx.cfg.baseIncome + 1}・うち劣勢ボーナス\\+1`));
});

test("log lines: chips going down, a denied kill reward, an upset bonus", () => {
  const ctx = r0923();
  const line = (e: GameEvent): string => describeEvent(ctx, NAMES, e)?.text ?? "";
  const te: GameEvent = { t: "turnEnd", player: 0, round: 3, occupied: 1, chips: 1, chipGained: -2, reach: false, discarded: 0, drawn: 1, boardHp: 3, manaLeft: 0 };
  assert.match(line(te), /チップ−2\(計1\)/);
  const base = { t: "destroy", owner: 1, uid: 5, cardId: "ad02", lifeLoss: 0, killer: 0 } as const;
  assert.match(line({ ...base, manaGain: 0, manaTo: null, rewardDenied: true }), /撃破報酬なし/);
  assert.match(line({ ...base, manaGain: 5, manaTo: 0, upsetBonus: 2 }), /格上撃破\+2/);
  assert.doesNotMatch(line({ ...base, manaGain: 3, manaTo: 0 }), /撃破報酬なし|格上撃破/);
});

test("劣勢割引: the place / hand prompts and the inherit summary show the lowered cost; the hand card strikes the printed one", () => {
  const ctx = r0923({ underdogDiscount: 2 });
  const s = blankState(ctx, 20);
  place(s, "ad02", 1, 2, 2, 2);
  s.players[0].hand = ["ad15"];
  const legal = legalEntries(ctx, s);
  const vm = (sel: PromptVM["sel"]): PromptVM => ({
    ctx, board: boardView(s), names: NAMES, viewer: 0, hand: ["ad15"], prompt: { kind: "main", legal }, sel, marked: 0, tansuIndex: 0, endConfirm: false, flash: "",
  });
  assert.match(promptHtml(vm({ kind: "hand", handIndex: 0 })), /劣勢割引 −2/);
  assert.match(promptHtml(vm({ kind: "place", handIndex: 0, pos: { x: 0, y: 0 } })), /霊力−6\(本来8・劣勢割引\)/);
  const lines = inheritSummaryLines(ctx, {
    kind: "inherit", fromCardId: "ad02", toCardId: "ad15", cost: 6, underdogDiscount: 2, refund: 1, manaBefore: 10, manaAfter: 5, hpAfter: 5, maxHpAfter: 5, carriedDamage: 0,
  } as Parameters<typeof inheritSummaryLines>[1]);
  assert.match(lines[1], /本来8・劣勢割引 −2/);
  const face = cardFaceHtml(ctx, "ad15", { size: "md", costNow: 6 });
  assert.match(face, /<s class="num-was">8<\/s><b class="num">6<\/b>/);
  assert.doesNotMatch(cardFaceHtml(ctx, "ad15", { size: "md" }), /num-was/);
});
