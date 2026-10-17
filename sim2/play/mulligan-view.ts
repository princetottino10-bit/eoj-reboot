// The opening mulligan as a panel of its own over the empty board: the hand
// large, what a tap does, and the one button that fits the choice so far.
// Pure string builder; the buttons use the hand / marks actions of table.ts.
import type { Ctx } from "../src/state.ts";
import { cardFaceHtml } from "./cards-view.ts";
import type { HandCard } from "./hand-view.ts";
import type { CardLook } from "./hud.ts";

export const mulliganPanelHtml = (ctx: Ctx, cards: HandCard[], look: CardLook, marked: number): string => {
  const items = cards
    .map(
      (c) => `<button type="button" class="mull-card${c.marked ? " is-marked" : ""}" data-act="hand" data-i="${c.index}"
        aria-pressed="${c.marked}" aria-label="手札${c.index + 1}枚目: ${c.marked ? "引き直さない" : "引き直す"}">
        ${cardFaceHtml(ctx, c.cardId, { size: "md", ...look })}${c.marked ? '<span class="mull-seal">引き直す</span>' : ""}
      </button>`,
    )
    .join("");
  const go =
    marked === 0
      ? '<button type="button" class="btn btn-gold" data-act="marks-none">このまま始める</button>'
      : `<button type="button" class="btn btn-gold" data-act="marks">${marked}枚を引き直して始める</button><button type="button" class="btn btn-quiet" data-act="marks-none">引き直さずに始める</button>`;
  return `<div class="mull" role="dialog" aria-label="対局前: 手札の引き直し">
    <p class="mull-step">対局前</p>
    <h2 class="mull-title">手札の引き直し</h2>
    <p class="mull-lead">最初の手札を<b>1回だけ</b>入れ替えられます。いらない札をタップ → ${ctx.cfg.mulliganTo === "grave" ? "捨て札にして" : "山札に戻して"}、同じ枚数を引きます。</p>
    <div class="mull-cards">${items}</div>
    <div class="mull-btns">${go}</div>
    <p class="mull-note">迷ったら、そのまま始めて大丈夫です。</p>
  </div>`;
};
