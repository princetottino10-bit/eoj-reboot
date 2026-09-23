// The player's hand: face-up cards fanned along the bottom edge. Hovering
// lifts a card, selecting lifts it further; in the discard / mulligan prompts
// a marked card rises with a seal. Pure string builder.
import type { Ctx } from "../src/state.ts";
import { cardFaceHtml } from "./cards-view.ts";
import type { CardLook } from "./hud.ts";

export type HandCard = {
  cardId: string;
  index: number;
  /** Has at least one legal use right now. */
  playable: boolean;
  selected: boolean;
  /** Checked for discard / mulligan. */
  marked: boolean;
  /** Summon cost now, when 劣勢時の大型割引 lowers it (absent otherwise). */
  costNow?: number;
};

export type HandMode = "play" | "discard" | "mulligan" | "idle";

export const handHtml = (ctx: Ctx, cards: HandCard[], mode: HandMode, look: CardLook): string => {
  if (cards.length === 0) return `<div class="hand is-empty"><span class="muted">手札なし</span></div>`;
  const n = cards.length;
  const mid = (n - 1) / 2;
  const seal = mode === "mulligan" ? "戻" : "捨";
  const items = cards
    .map((c) => {
      const off = c.index - mid;
      const cls = [
        "hand-card",
        c.playable ? "is-playable" : "",
        c.selected ? "is-selected" : "",
        c.marked ? "is-marked" : "",
        mode === "play" && !c.playable ? "is-dead" : "",
      ].join(" ");
      const verb = mode === "mulligan" ? "戻す札に選ぶ" : mode === "discard" ? "捨てる札に選ぶ" : c.playable ? "使う" : "詳しく見る";
      return `<button type="button" class="${cls}" data-act="hand" data-i="${c.index}" style="--i:${off.toFixed(2)};--n:${n}"
        aria-pressed="${c.selected || c.marked}" aria-label="手札${c.index + 1}枚目: ${verb}">
        ${cardFaceHtml(ctx, c.cardId, { size: "md", ...look, ...(c.costNow === undefined ? {} : { costNow: c.costNow }) })}${c.marked ? `<span class="hand-seal">${seal}</span>` : ""}
      </button>`;
    })
    .join("");
  return `<div class="hand mode-${mode}">${items}</div>`;
};
