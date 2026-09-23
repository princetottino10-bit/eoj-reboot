// Editing operations on card overrides, used by the settings panel: paint a
// range cell, change many cards at once, copy one card's range to others,
// pick cards by kind or attribute. Every function returns a new
// CardOverrides; nothing passed in is modified. Pure: browser-safe.
import { CARD_STATS, editableStats, editedCard, canEditShape, posKey, sortCells, statMin } from "./card-overrides.ts";
import type { CardEdit, CardOverrides, CardStatKey } from "./card-overrides.ts";
import type { CardPack } from "./cards.ts";
import type { Attr, CardDef, CardKind, Pos } from "./types.ts";

export type RangeTool = "attack" | "blind" | "gap" | "erase";

const withEdit = (cards: CardOverrides, id: string, patch: CardEdit): CardOverrides => ({
  ...cards,
  [id]: { ...(cards[id] ?? {}), ...patch },
});

const without = (cells: readonly Pos[], p: Pos): Pos[] => cells.filter((c) => c.x !== p.x || c.y !== p.y);
const has = (cells: readonly Pos[], p: Pos): boolean => cells.some((c) => c.x === p.x && c.y === p.y);

/**
 * One click on the range grid. attack / blind toggle the cell into (or out of)
 * that set and out of the other; gap marks an attack cell as the gap (adding
 * it to the range if needed) or clears it; erase empties the cell. A cell is
 * never both attack and blind.
 */
export const paintCell = (printed: CardPack, cards: CardOverrides, id: string, tool: RangeTool, p: Pos): CardOverrides => {
  const base = printed.byId.get(id);
  if (base === undefined || !canEditShape(base) || (p.x === 0 && p.y === 0)) return cards;
  const card = editedCard(base, cards[id]);
  let range = card.attackRange.slice();
  let blind = card.blindSpots.slice();
  let gap = card.gapCell ?? null;
  const isGap = gap !== null && gap.x === p.x && gap.y === p.y;
  switch (tool) {
    case "attack":
      if (has(range, p)) {
        range = without(range, p);
        if (isGap) gap = null;
      } else {
        range.push(p);
        blind = without(blind, p);
      }
      break;
    case "blind":
      if (has(blind, p)) {
        blind = without(blind, p);
      } else {
        blind.push(p);
        range = without(range, p);
        if (isGap) gap = null;
      }
      break;
    case "gap":
      if (isGap) {
        gap = null;
      } else {
        if (!has(range, p)) range.push(p);
        blind = without(blind, p);
        gap = { x: p.x, y: p.y };
      }
      break;
    default:
      range = without(range, p);
      blind = without(blind, p);
      if (isGap) gap = null;
  }
  return withEdit(cards, id, { attackRange: sortCells(range), blindSpots: sortCells(blind), gapCell: gap });
};

/** Set one shape field (attribute, attack type, area / single) on a card. */
export const setShape = (printed: CardPack, cards: CardOverrides, id: string, patch: Pick<CardEdit, "attribute" | "attackType" | "aoe">): CardOverrides => {
  const base = printed.byId.get(id);
  if (base === undefined || !canEditShape(base)) return cards;
  return withEdit(cards, id, patch);
};

export type BulkResult = { cards: CardOverrides; changed: number; skipped: string[] };

/**
 * Change one number on many cards: by `delta` from each card's current value,
 * or to `value`. Values are clamped to the card's allowed range when moving by
 * a delta; an exact value outside a card's range skips that card (reported).
 */
export const bulkStat = (
  printed: CardPack,
  cards: CardOverrides,
  ids: readonly string[],
  stat: CardStatKey,
  change: { delta: number } | { value: number },
): BulkResult => {
  const def = CARD_STATS.find((s) => s.key === stat);
  if (def === undefined) return { cards, changed: 0, skipped: [] };
  let next = cards;
  let changed = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const base = printed.byId.get(id);
    if (base === undefined || !editableStats(base).includes(stat)) continue;
    const lo = statMin(base, def);
    const now = editedCard(base, next[id])[stat];
    let v: number;
    if ("delta" in change) {
      v = Math.min(def.max, Math.max(lo, now + change.delta));
    } else {
      if (!Number.isInteger(change.value) || change.value < lo || change.value > def.max) {
        skipped.push(base.nameJa);
        continue;
      }
      v = change.value;
    }
    if (v === now) continue;
    const patch: CardEdit = {};
    patch[stat] = v;
    next = withEdit(next, id, patch);
    changed++;
  }
  return { cards: next, changed, skipped };
};

/** Copy the range, blind spots, gap and area / single of one card onto others (shikigami only). */
export const copyShape = (printed: CardPack, cards: CardOverrides, fromId: string, ids: readonly string[]): BulkResult => {
  const from = printed.byId.get(fromId);
  if (from === undefined || !canEditShape(from)) return { cards, changed: 0, skipped: [] };
  const src = editedCard(from, cards[fromId]);
  let next = cards;
  let changed = 0;
  for (const id of ids) {
    const base = printed.byId.get(id);
    if (id === fromId || base === undefined || !canEditShape(base)) continue;
    next = withEdit(next, id, {
      attackRange: sortCells(src.attackRange),
      blindSpots: sortCells(src.blindSpots),
      gapCell: src.gapCell === undefined || src.gapCell === null ? null : { ...src.gapCell },
      aoe: src.aoe,
    });
    changed++;
  }
  return { cards: next, changed, skipped: [] };
};

/** Drop every change on these cards. */
export const resetCards = (cards: CardOverrides, ids: readonly string[]): CardOverrides => {
  const drop = new Set(ids);
  return Object.fromEntries(Object.entries(cards).filter(([id]) => !drop.has(id)));
};

export type CardFilter = "all" | "shikigami" | "reigu" | "yin" | "yang" | "none" | "changed";

/** Card ids matching a quick-select button, judged on the cards as edited. */
export const selectCards = (printed: CardPack, cards: CardOverrides, filter: CardFilter): string[] =>
  printed.cards
    .filter((base) => {
      const c: CardDef = editedCard(base, cards[base.id]);
      switch (filter) {
        case "all":
          return true;
        case "shikigami":
        case "reigu":
          return c.kind === filter;
        case "changed":
          return cards[base.id] !== undefined && Object.keys(cards[base.id]).length > 0;
        default:
          return c.kind === "shikigami" && c.attribute === filter;
      }
    })
    .map((c) => c.id);

/** Filter chips: OR inside a group (陰 or 陽), AND across groups (陰 and cost 3). */
export type CardChips = { kind: CardKind[]; attr: Attr[]; cost: number[] };

export const noChips = (): CardChips => ({ kind: [], attr: [], cost: [] });

export const chipsActive = (f: CardChips): boolean => f.kind.length + f.attr.length + f.cost.length > 0;

/**
 * Card ids matching the chips, judged on the cards as edited. An empty group
 * does not narrow; no chip at all selects nothing. Attribute chips only match
 * shikigami; the cost chip is the summon cost (a reigu's use cost).
 */
export const selectByChips = (printed: CardPack, cards: CardOverrides, f: CardChips): string[] => {
  if (!chipsActive(f)) return [];
  return printed.cards
    .filter((base) => {
      const c = editedCard(base, cards[base.id]);
      if (f.kind.length > 0 && !f.kind.includes(c.kind)) return false;
      if (f.attr.length > 0 && (c.kind !== "shikigami" || !f.attr.includes(c.attribute))) return false;
      return f.cost.length === 0 || f.cost.includes(c.summonCost);
    })
    .map((c) => c.id);
};

/** Summon costs present among the cards as edited, with how many cards have each. */
export const costCounts = (printed: CardPack, cards: CardOverrides): { cost: number; count: number }[] => {
  const counts = new Map<number, number>();
  for (const base of printed.cards) {
    const cost = editedCard(base, cards[base.id]).summonCost;
    counts.set(cost, (counts.get(cost) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([cost, count]) => ({ cost, count }));
};

/** The state of one grid cell on a card as edited. */
export const cellState = (card: CardDef, p: Pos): "self" | "gap" | "attack" | "blind" | "empty" => {
  if (p.x === 0 && p.y === 0) return "self";
  const gap = card.gapCell ?? null;
  if (gap !== null && posKey(gap) === posKey(p) && has(card.attackRange, p)) return "gap";
  if (has(card.attackRange, p)) return "attack";
  if (has(card.blindSpots, p)) return "blind";
  return "empty";
};
