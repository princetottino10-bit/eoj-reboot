// The visual upgrade: the 記号体系's marks on every card, the owner cube, the
// lacquer-and-raden board with its control seal, the start card's default AI
// and the tab icon on every page.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { boardHtml } from "../play/board-view.ts";
import type { BoardVM } from "../play/board-view.ts";
import { cardFaceHtml, counterCellsOf } from "../play/cards-view.ts";
import { defaultAiSetup } from "../play/ai-store.ts";
import { ATTR_MARK_ID, MARKS_DEFS, mark } from "../play/marks.ts";
import type { MarkId } from "../play/marks.ts";
import { rangeSets } from "../play/select.ts";
import { boardView } from "../online/view.ts";
import { presetConfig } from "../src/presets.ts";
import { makeCtx } from "../src/state.ts";
import { blankState, place } from "./helpers.ts";
import { SK } from "./online-helpers.ts";

const ctx = makeCtx(presetConfig("r0914"), SK);
const MARKS: MarkId[] = ["yin", "yang", "void", "taiji", "mana-ring", "mana", "hp", "atk", "life", "phys", "jutsu", "cube"];

test("the marks live once in a hidden sprite; a card refers to them with <use>", () => {
  for (const id of MARKS) assert.equal(MARKS_DEFS.split(`<symbol id="mk-${id}"`).length - 1, 1, id);
  // not display:none (the clip paths inside 陰 / 陽 would stop working)
  assert.doesNotMatch(MARKS_DEFS, /display:\s*none/);
  assert.equal(mark("hp"), '<svg class="mk" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="#mk-hp"/></svg>');
  assert.match(mark("yin", "x", "属性: 陰"), /role="img" aria-label="属性: 陰"[^>]*><title>属性: 陰<\/title><use href="#mk-yin"\/>/);
  assert.deepEqual([ATTR_MARK_ID.yin, ATTR_MARK_ID.yang, ATTR_MARK_ID.none, ATTR_MARK_ID.empty, ATTR_MARK_ID.taiji], ["yin", "yang", "void", "void", "taiji"]);
  // a whole card draws no path of its own: the sprite is not repeated per card
  assert.doesNotMatch(cardFaceHtml(ctx, "sk09", { size: "lg" }), /<symbol|<path d="M32 4L56/);
});

test("cards speak in marks: no kanji badges or 召 / 攻 / HP / ATK labels, but screen readers and tooltips keep the words", () => {
  for (const size of ["sm", "md", "lg"] as const) {
    const html = cardFaceHtml(ctx, "sk09", { size }); // 一目鬼: 陽, cost 4, attack cost 2, HP 6, ATK 2, life 2
    assert.match(html, /aria-label="属性: 陽"/, size);
    assert.match(html, /<use href="#mk-yang"\/>/, size);
    assert.match(html, /title="召喚コスト 4"><i class="sr">召喚コスト<\/i><svg[^>]*><use href="#mk-mana-ring"\/><\/svg><b class="num">4<\/b>/, size);
    assert.match(html, /title="HP 6"><i class="sr">HP<\/i><svg[^>]*><use href="#mk-hp"\/><\/svg><b class="num">6<\/b>/, size);
    assert.match(html, /title="ATK 2"><i class="sr">ATK<\/i><svg[^>]*><use href="#mk-atk"\/>/, size);
    assert.doesNotMatch(html, /<i>(召|攻|HP|ATK|生命価)<\/i>|>陽<\/span>|物・範囲/, size);
  }
  const md = cardFaceHtml(ctx, "sk09", { size: "md" });
  // the three costs; the rotate cost is the rule's (1), 爪鬼 turns for free
  assert.match(md, /title="攻撃コスト 2">.*<use href="#mk-mana"\/>/);
  assert.match(md, /title="回転コスト 1">/);
  assert.match(cardFaceHtml(ctx, "sk04", { size: "md" }), /title="回転コスト 0">/);
  assert.match(md, /title="生命価 2"><i class="sr">生命価<\/i><svg[^>]*><use href="#mk-life"\/>/);
  assert.match(md, /title="物理・範囲"><svg[^>]*><use href="#mk-phys"\/><\/svg><span class="fu-type-w">物理・範囲<\/span>/);
  assert.match(cardFaceHtml(ctx, "sk02", { size: "lg" }), /title="術式・単体"><svg[^>]*><use href="#mk-jutsu"\/>/);
  // the board piece: no visible name (screen readers only), no effect text
  const sm = cardFaceHtml(ctx, "sk09", { size: "sm" });
  assert.match(sm, /class="fu-name sr">一目鬼</);
  assert.doesNotMatch(sm, /fu-text|fu-life|攻撃コスト/);
  // a reigu: its use cost, the 霊具 badge, no numbers or range
  const reigu = cardFaceHtml(ctx, "sk22", { size: "md" });
  assert.match(reigu, /title="使用コスト 3">/);
  assert.match(reigu, /class="fu-attr fu-badge" title="霊具">霊具</);
  assert.doesNotMatch(reigu, /fu-range|mk-hp|mk-life|攻撃コスト/);
});

test("the art area is one placeholder face (ink-wash ground and a character), and edited numbers stay marked", () => {
  assert.match(cardFaceHtml(ctx, "sk16", { size: "md" }), /<span class="fu-art"><span class="fu-glyph" aria-hidden="true">酒<\/span><\/span>/);
  const printed = (id: string) => SK.byId.get(id);
  const html = cardFaceHtml(ctx, "sk09", { size: "lg", mods: { sk09: { hp: 3, attackRange: [{ x: 0, y: 1 }] } }, printed });
  assert.match(html, /class="fu-hp gem is-mod" title="HP 6\(変更: 元の値 6\)"/);
  assert.match(html, /class="fu-rblock is-mod"/);
});

test("the diagram shows the counter range the rules count: none for a jutsu under counterMode gap or without ATK", () => {
  const card = (id: string) => {
    const c = SK.byId.get(id);
    assert.ok(c !== undefined);
    return c;
  };
  assert.deepEqual(counterCellsOf(ctx.cfg, card("sk09")), [{ x: 0, y: 1 }]);
  assert.equal(ctx.cfg.counterMode, "gap");
  assert.deepEqual(counterCellsOf(ctx.cfg, card("sk02")), [], "a jutsu never counters under gap");
  assert.deepEqual(counterCellsOf(ctx.cfg, card("sk01")), [], "no ATK, no counter");
  assert.deepEqual(counterCellsOf({ ...ctx.cfg, counterMode: "all" }, card("sk02")), [{ x: 0, y: 1 }]);
  assert.match(cardFaceHtml(ctx, "sk09", { size: "md" }), /反撃範囲: 前/);
  assert.match(cardFaceHtml(ctx, "sk02", { size: "md" }), /反撃範囲: なし/);
});

const vmOf = (over: Partial<BoardVM> & { board: BoardVM["board"] }): BoardVM => ({
  ctx,
  names: ["あなた", "相手"],
  look: {},
  marks: new Map(),
  range: null,
  selectedUid: null,
  selectedCell: null,
  prediction: null,
  radial: null,
  facing: null,
  ...over,
});

test("board: lacquer cells with a raden disc of the cell's attribute; under a piece it shrinks to a chip; the label names the card", () => {
  const s = blankState(ctx);
  place(s, "sk09", 0, 1, 1, 0); // 太極
  const html = boardHtml(vmOf({ board: boardView(s) }));
  assert.doesNotMatch(html, /cell-attr|cell-taiji/);
  assert.equal(html.split('class="raden"').length - 1, 8, "the empty cells");
  assert.equal(html.split('class="raden chip"').length - 1, 1);
  assert.match(html, /class="cell c-taiji has-unit"[^>]*[\s\S]*?class="raden chip"[^>]*><svg class="mk raden-mk"[^>]*><use href="#mk-taiji"\/>/);
  assert.match(html, /class="cell c-yin"[\s\S]*?<use href="#mk-yin"\/>/);
  assert.match(html, /class="cell c-empty"[\s\S]*?<use href="#mk-void"\/>/);
  assert.match(html, /aria-label="太極のマス \/ あなたの駒 一目鬼\(HP \d+\/\d+・上向き\)"/);
});

test("board: the looked-at unit's counter range and attack shape are marked like the card", () => {
  const s = blankState(ctx);
  const uid = place(s, "sk09", 0, 1, 1, 0);
  const u = s.units.find((x) => x.uid === uid);
  const range = rangeSets(ctx, u);
  assert.ok(range !== null);
  assert.equal(range.aoe, true);
  assert.deepEqual([...range.counter], ["1,2"]);
  const html = boardHtml(vmOf({ board: boardView(s), range }));
  assert.match(html, /class="cell c-yin rg-attack rg-area rg-counter"/);
  assert.match(html, /aria-label="上の陰のマス \/ 空きマス \/ 攻撃範囲 \/ 反撃範囲"/);
});

test("board: the control state puts the 「制」 seal and one lantern per needed cell on the holder's edge; pulses on the other's turn; clears when over", () => {
  const s = blankState(ctx);
  place(s, "sk09", 1, 0, 2, 2);
  place(s, "sk02", 1, 1, 2, 2);
  s.players[1].reach = true;
  s.turnPlayer = 0;
  const html = boardHtml(vmOf({ board: boardView(s), bottom: 0 }));
  assert.match(html, /class="bd ctl-1 ctl-wait"/);
  assert.match(html, /class="bd-ctl bd-ctl-high o1" data-seat="1"/, "the top seat's edge for the viewer at the bottom");
  assert.match(html, /<span class="bd-seal">制<\/span>/);
  assert.equal(html.split('class="bd-lamp on"').length - 1, 2);
  assert.equal((html.match(/class="bd-lamp( on)?"/g) ?? []).length, ctx.cfg.controlWin);
  s.turnPlayer = 1;
  assert.match(boardHtml(vmOf({ board: boardView(s), bottom: 1 })), /class="bd ctl-1"[\s\S]*bd-ctl-low/);
  s.ended = true;
  const over = boardHtml(vmOf({ board: boardView(s) }));
  assert.doesNotMatch(over, /ctl-1|bd-seal/);
});

test("the AI table starts with the strong AI; its policy sits behind 詳細", () => {
  assert.equal(defaultAiSetup().ai, "strong");
  const ui = readFileSync(join(import.meta.dirname, "..", "play", "ui.ts"), "utf8");
  assert.match(ui, /<details class="start-more"><summary>詳細<\/summary>\s*<label>AIの方針<select name="eval">/);
});

test("every page has the 太極 tab icon (no /favicon.ico request)", () => {
  for (const page of ["play/index.html", "play/rules.html", "online/lobby.html", "online/room.html"]) {
    const html = readFileSync(join(import.meta.dirname, "..", page), "utf8");
    assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="data:image\/svg\+xml,%3Csvg[^"]+%3C\/svg%3E">/, page);
  }
});
