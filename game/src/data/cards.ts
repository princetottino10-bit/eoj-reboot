import cardsJson from '../../../data/cards.json';
import type { CharCardDef, ItemCardDef, CardDatabase } from '../engine/gamestate.js';

export interface FullCardDatabase extends CardDatabase {
  faction_names: Record<string, string>;
  keyword_effects: Record<string, string>;
}

export const CARD_DB = cardsJson as unknown as FullCardDatabase;

export const CHAR_MAP = new Map<string, CharCardDef>(
  CARD_DB.characters.map(c => [c.id, c]),
);
export const ITEM_MAP = new Map<string, ItemCardDef>(
  CARD_DB.items.map(i => [i.id, i]),
);

export function getCharDef(cardId: string): CharCardDef | undefined {
  return CHAR_MAP.get(cardId);
}

export function getItemDef(cardId: string): ItemCardDef | undefined {
  return ITEM_MAP.get(cardId);
}

export function isCharCard(cardId: string): boolean {
  return CHAR_MAP.has(cardId);
}

export function getCardName(cardId: string): string {
  return CHAR_MAP.get(cardId)?.name ?? ITEM_MAP.get(cardId)?.name ?? cardId;
}

export function getCardCost(cardId: string): number {
  return CHAR_MAP.get(cardId)?.cost ?? ITEM_MAP.get(cardId)?.cost ?? 0;
}

export const FACTIONS = Object.keys(CARD_DB.faction_names);
export const FACTION_NAMES = CARD_DB.faction_names;
