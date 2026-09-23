// Card faces after the team's print kit (phase 2): the illustration in the
// art slot (square crop on board pieces, card crop in hand / detail / editor,
// the placeholder glyph as the fallback), 霊力価 as the kit's blue flames, 空
// as ⊘, and the print card number at the bottom right.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { applyCardOverrides } from "../src/card-overrides.ts";
import { cardOf } from "../src/cards.ts";
import type { CardPack } from "../src/cards.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig } from "../src/presets.ts";
import { makeCtx } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import type { Config } from "../src/types.ts";
import { boardHtml } from "../play/board-view.ts";
import type { BoardVM } from "../play/board-view.ts";
import { cardSectionHtml, initialCardUi } from "../play/card-editor.ts";
import { ART_PX, artUrl, cardFaceHtml, cardThumbHtml, illustrationHtml, pieceHtml, watchArtErrors } from "../play/cards-view.ts";
import { detailHtml } from "../play/hud.ts";
import { flames, MARKS_DEFS, mark } from "../play/marks.ts";
import { MANA_VALUE_TAG } from "../play/render.ts";
import { boardView } from "../online/view.ts";
import { blankState, place } from "./helpers.ts";
import { SK } from "./online-helpers.ts";

const SIM2 = join(import.meta.dirname, "..");
const AD: CardPack = loadPack(packPath("adopted-0922"));
const r0923 = (over: Partial<Config> = {}, pack: CardPack = AD): Ctx => makeCtx(presetConfig("r0923", over), pack);
const CTX = r0923();
const count = (s: string, needle: string): number => s.split(needle).length - 1;
const mval = (html: string): string => /<span class="fu-mval[^"]*"[^>]*>.*?<\/svg>(?:<b class="num">\d+<\/b>)?<\/span>/.exec(html)?.[0] ?? "";

// ---------------------------------------------------------------------- art

test("a card with art shows the print kit's crop: the card crop in hand / detail, the square on a board piece", () => {
  const ib = cardOf(AD, "ad15");
  for (const size of ["md", "lg"] as const) {
    const html = cardFaceHtml(CTX, "ad15", { size });
    assert.match(
      html,
      /<span class="fu-art has-img"><span class="fu-glyph" aria-hidden="true">茨<\/span><img src="\/play\/art\/adopted\/O-008\.webp" width="624" height="604" alt="茨木童子" decoding="async" draggable="false"><\/span>/,
      size,
    );
    assert.match(html, /class="fu fu-\w\w k-shikigami a-yin m-wave has-art has-pid"/, size);
  }
  const sm = cardFaceHtml(CTX, "ad15", { size: "sm" });
  assert.match(sm, /<img src="\/play\/art\/adopted\/O-008-sq\.webp" width="256" height="256" alt="茨木童子" decoding="async" draggable="false">/);
  assert.doesNotMatch(sm, /O-008\.webp/);
  // the board piece (and so the burn ghost cut from it) carries the square
  const s = blankState(CTX);
  const uid = place(s, "ad15", 0, 1, 1, 0);
  const u = s.units.find((x) => x.uid === uid);
  assert.ok(u !== undefined);
  assert.match(pieceHtml(CTX, u, { control: true }), /O-008-sq\.webp/);
  // one code path: the slot itself
  assert.equal(illustrationHtml(ib, "sm").includes(artUrl(ib.art!.square)), true);
  assert.deepEqual(ART_PX, { card: { w: 624, h: 604 }, square: { w: 256, h: 256 } });
  // every URL the faces use is a file the servers hand out
  for (const c of AD.cards) {
    if (c.art === undefined) continue;
    for (const size of ["sm", "md", "lg"] as const) {
      const src = /<img src="([^"]+)"/.exec(illustrationHtml(c, size))?.[1];
      assert.ok(src !== undefined && src.startsWith("/play/art/"), `${c.id} ${size}`);
      assert.ok(existsSync(join(SIM2, src.slice(1))), src);
    }
  }
});

test("a card without art keeps today's placeholder face: ink-wash ground and one character, no <img>", () => {
  for (const size of ["sm", "md", "lg"] as const) {
    const html = cardFaceHtml(CTX, "ad04", { size }); // 鉞鬼: blank in the kit
    assert.match(html, /<span class="fu-art"><span class="fu-glyph" aria-hidden="true">鉞<\/span><\/span>/, size);
    assert.doesNotMatch(html, /<img|has-art/, size);
  }
  // other packs have no art at all
  for (const c of SK.cards) assert.doesNotMatch(cardFaceHtml(makeCtx(presetConfig("r0914"), SK), c.id, { size: "md" }), /<img/, c.id);
});

test("a picture that fails to load falls back to the glyph under it (capture listener, once per page)", () => {
  const g = globalThis as Record<string, unknown>;
  const had = "HTMLImageElement" in g;
  const saved = g.HTMLImageElement;
  class FakeImg {
    parentElement: { classList: Set<string> & { contains: (c: string) => boolean } } | null;
    constructor(parent: FakeImg["parentElement"]) {
      this.parentElement = parent;
    }
  }
  g.HTMLImageElement = FakeImg;
  try {
    const listeners: { type: string; fn: (e: { target: unknown }) => void; capture: unknown }[] = [];
    const doc = { addEventListener: (type: string, fn: (e: { target: unknown }) => void, capture: unknown) => listeners.push({ type, fn, capture }) };
    watchArtErrors(doc as unknown as Document);
    watchArtErrors(doc as unknown as Document);
    assert.equal(listeners.length, 1, "installed once");
    assert.equal(listeners[0].type, "error");
    assert.equal(listeners[0].capture, true, "error does not bubble: capture it");
    const slotClasses = () => Object.assign(new Set<string>(["fu-art", "has-img"]), { contains(this: Set<string>, c: string) { return this.has(c); } });
    const slot = { classList: slotClasses() };
    listeners[0].fn({ target: new FakeImg(slot) });
    assert.ok(slot.classList.has("no-img"));
    // an image elsewhere on the page is left alone
    const other = { classList: Object.assign(new Set<string>(["avatar"]), { contains(this: Set<string>, c: string) { return this.has(c); } }) };
    listeners[0].fn({ target: new FakeImg(other) });
    assert.ok(!other.classList.has("no-img"));
    listeners[0].fn({ target: { parentElement: slot } });
  } finally {
    if (had) g.HTMLImageElement = saved;
    else delete g.HTMLImageElement;
  }
  const css = readFileSync(join(SIM2, "play/table.css"), "utf8");
  assert.match(css, /\.fu-art\.has-img img \{[^}]*object-fit: cover;/);
  assert.match(css, /\.fu-art\.has-img \.fu-glyph \{ visibility: hidden; \}/);
  assert.match(css, /\.fu-art\.no-img img \{ display: none; \}/);
  assert.match(css, /\.fu-art\.no-img \.fu-glyph \{ visibility: visible; \}/);
});

test("the grave list shows each card's square (decoration next to its name) or its glyph", () => {
  const s = blankState(CTX);
  s.players[0].grave = ["ad15", "ad04"];
  const html = detailHtml(CTX, boardView(s), ["あなた", "相手"], { kind: "grave", seat: 0 }, {});
  assert.match(html, /data-card="ad15"><span class="fu-art fu-thumb has-img" aria-hidden="true"><span class="fu-glyph" aria-hidden="true">茨<\/span><img src="\/play\/art\/adopted\/O-008-sq\.webp" width="256" height="256" alt="" [^>]*><\/span>茨木童子<\/button>/);
  assert.match(html, /data-card="ad04"><span class="fu-art fu-thumb" aria-hidden="true"><span class="fu-glyph" aria-hidden="true">鉞<\/span><\/span>鉞鬼<\/button>/);
  assert.equal(cardThumbHtml(cardOf(AD, "ad04")).includes("<img"), false);
});

// ----------------------------------------------------------------- 霊力価

test("霊力価 is the print kit's blue flames: one per point up to 3, from 4 (and at 0) one flame and the number", () => {
  const cases: [string, number][] = [["ad01", 1], ["ad07", 2], ["ad15", 3]];
  for (const [id, n] of cases) {
    for (const size of ["md", "lg"] as const) {
      const html = cardFaceHtml(CTX, id, { size });
      const m = mval(html);
      assert.ok(m !== "", `${id} ${size}`);
      assert.match(m, new RegExp(`^<span class="fu-mval n${n}" title="霊力価 ${n}\\(撃破した側が得る霊力\\)"><i class="sr">霊力価 ${n}</i>`), `${id} ${size}`);
      assert.equal(count(m, '<use href="#mk-flame"'), n, `${id} ${size}`);
      assert.doesNotMatch(m, /<b class="num">|mk-mana/, `${id} ${size}: flames only`);
    }
  }
  const printed = (id: string) => AD.byId.get(id);
  for (const v of [5, 0]) {
    const mods = { ad15: { manaValue: v } };
    const ctx = makeCtx(CTX.cfg, applyCardOverrides(AD, mods));
    const m = mval(cardFaceHtml(ctx, "ad15", { size: "md", mods, printed }));
    assert.match(m, new RegExp(`^<span class="fu-mval n1 is-mod" title="霊力価 ${v}\\(撃破した側が得る霊力\\)\\(変更: 元の値 3\\)"><i class="sr">霊力価 ${v}</i>`));
    assert.equal(count(m, '<use href="#mk-flame"'), 1);
    assert.match(m, new RegExp(`<b class="num">${v}</b></span>$`));
  }
  // not on board pieces or 霊具, not while destruction pays a cost share instead of the card's value
  assert.doesNotMatch(cardFaceHtml(CTX, "ad15", { size: "sm" }), /fu-mval|mk-flame/);
  assert.doesNotMatch(cardFaceHtml(CTX, "ad21", { size: "lg" }), /fu-mval|mk-flame/);
  assert.doesNotMatch(cardFaceHtml(r0923({ killRewardBase: "half_floor" }), "ad15", { size: "lg" }), /fu-mval/);
  // the old braided-pentagram 霊力価 disc is gone (the pentagrams stay for the costs)
  assert.doesNotMatch(cardFaceHtml(CTX, "ad15", { size: "md" }), /fu-life fu-mval|is-second/);
});

test("flames(): the kit's flame symbol drawn 1-3 times in one row, sized from its viewBox", () => {
  assert.equal(count(MARKS_DEFS, '<symbol id="mk-flame"'), 1);
  assert.match(MARKS_DEFS, /<symbol id="mk-flame" viewBox="0 0 64 64"><linearGradient id="mk-flame-g"[^]*?<path d="M35\.5 2\.0C[^"]+" fill="url\(#mk-flame-g\)"/);
  assert.equal(flames(1), '<svg class="mk-flames" viewBox="0 0 32 64" width="32" height="64" aria-hidden="true" focusable="false"><use href="#mk-flame" x="-16" y="0" width="64" height="64"/></svg>');
  assert.match(flames(3), /viewBox="0 0 108 64"/);
  assert.equal(count(flames(3), "<use"), 3);
  for (const odd of [0, 4, 7, -1, Number.NaN]) assert.equal(count(flames(odd), "<use"), 1, String(odd));
  // the destroy flight and the predictions use the same flame
  assert.match(readFileSync(join(SIM2, "play/fx-play.ts"), "utf8"), /"fx-flame fx-mana", box, `\$\{mark\("flame"\)\}<b>\+\$\{d\.manaGain\}<\/b>`/);
  assert.equal(MANA_VALUE_TAG, `(${mark("flame", "mk-inline")}霊力価)`);
});

test("the card editor heads its 霊力価 column with the flame (named for screen readers and in the tooltip)", () => {
  const w = { printed: AD, cards: {}, cfg: CTX.cfg, packName: "adopted-0922", locked: false };
  const html = cardSectionHtml(w, initialCardUi(AD), true);
  assert.match(html, /<th scope="col" class="ce-th-flame" title="霊力価: [^"]+"><svg class="mk ce-flame" viewBox="0 0 64 64" role="img" aria-label="霊力価" focusable="false"><title>霊力価<\/title><use href="#mk-flame"\/><\/svg><\/th>/);
  assert.match(html, /<span class="ce-bulk-label">|ce-bulk is-closed/);
  // the preview is the lg face, art included
  assert.match(html, /class="ce-preview"><div class="fu fu-lg[^"]*has-art[^"]*"[^>]*><span class="fu-art has-img">/);
});

// ---------------------------------------------------------------------- 空

test("空 is the print kit's ⊘ (a ring crossed from top right to bottom left): on cards and on the board's 空 cells", () => {
  const sym = /<symbol id="mk-void" viewBox="0 0 64 64">(.*?)<\/symbol>/.exec(MARKS_DEFS)?.[1] ?? "";
  assert.match(sym, /<circle cx="32" cy="32" r="28" fill="none"[^>]*\/>/);
  assert.match(sym, /<path d="M51\.8 12\.2L12\.2 51\.8"[^>]*stroke="#26262b"/);
  // 陰 / 陽 unchanged
  assert.doesNotMatch(/<symbol id="mk-yin"[^]*?<\/symbol>/.exec(MARKS_DEFS)?.[0] ?? "", /M51\.8 12\.2/);
  for (const size of ["sm", "md", "lg"] as const) {
    assert.match(cardFaceHtml(CTX, "ad07", { size }), /aria-label="属性: 空"[^>]*><title>属性: 空<\/title><use href="#mk-void"\/>/, size); // 変面
  }
  const vm: BoardVM = {
    ctx: CTX, names: ["あなた", "相手"], look: {}, marks: new Map(), range: null, selectedUid: null, selectedCell: null,
    prediction: null, radial: null, facing: null, board: boardView(blankState(CTX)),
  };
  assert.equal(count(boardHtml(vm), '<use href="#mk-void"/>'), 4, "the four corner (空) cells");
});

// ------------------------------------------------------------ card number

test("the print card number sits at the bottom right of hand and detail cards, not on board pieces", () => {
  for (const size of ["md", "lg"] as const) {
    const html = cardFaceHtml(CTX, "ad15", { size });
    assert.match(html, /<span class="fu-pid" title="カード番号 O-008">O-008<\/span><\/div>$/, size);
    assert.match(cardFaceHtml(CTX, "ad21", { size }), /<span class="fu-pid" title="カード番号 O-010">O-010<\/span><\/div>$/, `${size} reigu`);
  }
  assert.doesNotMatch(cardFaceHtml(CTX, "ad15", { size: "sm" }), /fu-pid|has-pid/);
  // packs without a print kit: no tag
  assert.doesNotMatch(cardFaceHtml(makeCtx(presetConfig("r0914"), SK), "sk09", { size: "lg" }), /fu-pid|has-pid/);
  // the text keeps clear of the corner only while 生命価 sits there
  assert.match(cardFaceHtml(CTX, "ad15", { size: "md" }), /class="fu-text"/);
  assert.match(cardFaceHtml(r0923({ lifeValueEnabled: true }), "ad15", { size: "md" }), /class="fu-text has-corner">.*title="生命価 3"/);
});
