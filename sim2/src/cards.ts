// Pure card-data layer: no node builtins, so the browser UI can import it
// directly. File loading lives in pack-io.ts.
import type { CardDef, Pos } from "./types.ts";

export const PACK_NAMES = ["placeholder22", "tsukumo-miyako", "kyubi-ryu"] as const;
export type PackName = (typeof PACK_NAMES)[number];

export type CardPack = {
  packId: string;
  cards: CardDef[];
  byId: Map<string, CardDef>;
  /** cardId list, one entry per copy, in pack order. */
  deckList: string[];
};

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

const parsePos = (v: unknown, where: string): Pos => {
  if (typeof v !== "object" || v === null) throw new Error(`${where}: cell must be an object`);
  const o = v as Record<string, unknown>;
  if (!isInt(o.x) || !isInt(o.y)) throw new Error(`${where}: cell needs integer x/y`);
  return { x: o.x, y: o.y };
};

const parseCells = (v: unknown, where: string): Pos[] => {
  if (!Array.isArray(v)) throw new Error(`${where}: must be an array`);
  return v.map((c, i) => parsePos(c, `${where}[${i}]`));
};

const parseCard = (v: unknown, i: number): CardDef => {
  if (typeof v !== "object" || v === null) throw new Error(`card[${i}]: not an object`);
  const o = v as Record<string, unknown>;
  const where = `card[${i}]`;
  if (typeof o.id !== "string" || o.id.length === 0) throw new Error(`${where}: bad id`);
  if (typeof o.name !== "string") throw new Error(`${where}: bad name`);
  if (o.nameJa !== undefined && typeof o.nameJa !== "string") {
    throw new Error(`${where}: nameJa must be a string`);
  }
  for (const k of ["summonCost", "attackCost", "atk", "hp", "lifeValue"]) {
    if (!isInt(o[k])) throw new Error(`${where}: ${k} must be an integer`);
  }
  if (o.attribute !== "yin" && o.attribute !== "yang" && o.attribute !== "none") {
    throw new Error(`${where}: attribute must be yin|yang|none`);
  }
  if (typeof o.aoe !== "boolean") throw new Error(`${where}: aoe must be boolean`);
  const attackType = o.attackType === undefined ? "phys" : o.attackType;
  if (attackType !== "phys" && attackType !== "jutsu") {
    throw new Error(`${where}: attackType must be phys|jutsu`);
  }
  const kind = o.kind === undefined ? "shikigami" : o.kind;
  if (kind !== "shikigami" && kind !== "reigu") {
    throw new Error(`${where}: kind must be shikigami|reigu`);
  }
  const card: CardDef = {
    id: o.id,
    name: o.name,
    nameJa: typeof o.nameJa === "string" && o.nameJa.length > 0 ? o.nameJa : o.name,
    summonCost: o.summonCost as number,
    attackCost: o.attackCost as number,
    atk: o.atk as number,
    hp: o.hp as number,
    lifeValue: o.lifeValue as number,
    attribute: o.attribute,
    aoe: o.aoe,
    attackType,
    kind,
    attackRange: parseCells(o.attackRange, `${where}.attackRange`),
    blindSpots: parseCells(o.blindSpots, `${where}.blindSpots`),
    counterRange:
      o.counterRange === undefined
        ? parseCells(o.attackRange, `${where}.attackRange`)
        : parseCells(o.counterRange, `${where}.counterRange`),
  };
  if (card.summonCost < 0) throw new Error(`${where}: summonCost < 0`);
  if (card.attackCost < 0) throw new Error(`${where}: attackCost < 0`);
  if (card.hp < 0) throw new Error(`${where}: hp < 0`);
  // attackCost is definitionally the ATK slice of the old summon cost
  if (card.attackCost !== card.atk) {
    throw new Error(`${where}: attackCost (${card.attackCost}) must equal atk (${card.atk})`);
  }
  if (card.kind === "shikigami" && card.summonCost < 1) {
    throw new Error(`${where}: shikigami summonCost < 1`);
  }
  if (card.kind === "shikigami" && card.hp < 1) throw new Error(`${where}: shikigami hp < 1`);
  return card;
};

/** A card that can never make an attack action. */
export const canAttack = (card: CardDef): boolean =>
  card.atk > 0 && card.attackRange.length > 0;

/** Builds a pack from already-parsed card definitions (used by tests). */
export const packFromCards = (packId: string, cards: CardDef[]): CardPack => {
  const byId = new Map<string, CardDef>();
  for (const c of cards) {
    if (byId.has(c.id)) throw new Error(`pack: duplicate card id ${c.id}`);
    byId.set(c.id, c);
  }
  return { packId, cards, byId, deckList: cards.map((c) => c.id) };
};

/** Validates a parsed pack JSON object. Works in node and in the browser. */
export const parsePack = (input: unknown): CardPack => {
  if (typeof input !== "object" || input === null) throw new Error("pack: not an object");
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.cards)) throw new Error("pack: `cards` must be an array");
  const pack = packFromCards(
    typeof raw.packId === "string" ? raw.packId : "unnamed",
    raw.cards.map(parseCard),
  );
  return pack;
};

export const cardOf = (pack: CardPack, cardId: string): CardDef => {
  const c = pack.byId.get(cardId);
  if (c === undefined) throw new Error(`unknown cardId: ${cardId}`);
  return c;
};
