// Pure card-data layer: no node builtins, so the browser UI can import it
// directly. File loading lives in pack-io.ts.
import type { CardArt, CardDef, Pos } from "./types.ts";

export const PACK_NAMES = ["placeholder22", "tsukumo-miyako", "kyubi-ryu"] as const;
export type PackName = (typeof PACK_NAMES)[number];

/**
 * EXP-0913B packs. Kept out of PACK_NAMES on purpose: shuten-kyuryu has an
 * attack cost that differs from ATK (spec 2.2), which the PACK_NAMES-wide
 * data invariants (attackCost === atk) do not hold for.
 */
export const EXTRA_PACK_NAMES = ["shuten-kyuryu", "adopted-0922"] as const;
export const ALL_PACK_NAMES = [...PACK_NAMES, ...EXTRA_PACK_NAMES] as const;

// ------------------------------------------------------------ tenkey notation

/**
 * EXP-0913B Sec.2.1. The team's card sheet writes cells in numpad ("tenkey")
 * notation: 5 = the unit itself, 2 = the cell it faces. A leading "-" marks
 * the second row out. Engine coordinates put "forward" at +y.
 */
const TENKEY: Record<string, Pos> = {
  "1": { x: -1, y: 1 },
  "2": { x: 0, y: 1 },
  "3": { x: 1, y: 1 },
  "4": { x: -1, y: 0 },
  "6": { x: 1, y: 0 },
  "7": { x: -1, y: -1 },
  "8": { x: 0, y: -1 },
  "9": { x: 1, y: -1 },
  "-1": { x: -1, y: 2 },
  "-2": { x: 0, y: 2 },
  "-3": { x: 1, y: 2 },
};

/** Every relative cell within 2 steps except the unit itself. On a 3x3
 *  board that reaches all 8 other cells from any square and any facing. */
export const TENKEY_ALL = "5x5ALL";

const allAround = (): Pos[] => {
  const out: Pos[] = [];
  for (let y = -2; y <= 2; y++) {
    for (let x = -2; x <= 2; x++) if (x !== 0 || y !== 0) out.push({ x, y });
  }
  return out;
};

/** Splits a tenkey string into tokens: "-1-2-32" -> ["-1","-2","-3","2"]. */
export const tokenizeTenkey = (src: string): string[] => {
  const out: string[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "-") {
      const next = src[i + 1];
      if (next === undefined) throw new Error(`tenkey "${src}": dangling "-"`);
      out.push(`-${next}`);
      i += 2;
    } else {
      out.push(ch);
      i += 1;
    }
  }
  for (const t of out) {
    if (TENKEY[t] === undefined) throw new Error(`tenkey "${src}": unknown token "${t}"`);
  }
  return out;
};

/** Tenkey string -> relative cells, in token order. "" = no cells. */
export const parseTenkey = (src: string): Pos[] => {
  const trimmed = src.trim();
  if (trimmed === TENKEY_ALL) return allAround();
  const cells = tokenizeTenkey(trimmed).map((t) => ({ x: TENKEY[t].x, y: TENKEY[t].y }));
  const seen = new Set<string>();
  for (const c of cells) {
    const k = `${c.x},${c.y}`;
    if (seen.has(k)) throw new Error(`tenkey "${src}": duplicate cell ${k}`);
    seen.add(k);
  }
  return cells;
};

const TENKEY_ORDER = ["-1", "-2", "-3", "1", "2", "3", "4", "6", "7", "8", "9"];

/**
 * Relative cells -> the card sheet's tenkey string ("" for none, 5x5ALL for
 * every cell around). null when a cell has no tenkey token (two cells sideways
 * or behind), so the caller can fall back to words.
 */
export const formatTenkey = (cells: readonly Pos[]): string | null => {
  const all = allAround();
  if (cells.length === all.length && all.every((a) => cells.some((c) => c.x === a.x && c.y === a.y))) return TENKEY_ALL;
  const tokens: string[] = [];
  for (const c of cells) {
    const t = TENKEY_ORDER.find((k) => TENKEY[k].x === c.x && TENKEY[k].y === c.y);
    if (t === undefined) return null;
    tokens.push(t);
  }
  return tokens.sort((a, b) => TENKEY_ORDER.indexOf(a) - TENKEY_ORDER.indexOf(b)).join("");
};

export type CardPack = {
  packId: string;
  cards: CardDef[];
  byId: Map<string, CardDef>;
  /** cardId list, one entry per copy, in pack order. */
  deckList: string[];
  /** The pack as loaded that card overrides made this one from. Absent = this pack is the printed one. */
  printed?: CardPack;
};

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

const parsePos = (v: unknown, where: string): Pos => {
  if (typeof v !== "object" || v === null) throw new Error(`${where}: cell must be an object`);
  const o = v as Record<string, unknown>;
  if (!isInt(o.x) || !isInt(o.y)) throw new Error(`${where}: cell needs integer x/y`);
  return { x: o.x, y: o.y };
};

/** A cell list, either as {x,y} objects or as a tenkey string (Sec.2.1). */
const parseCells = (v: unknown, where: string): Pos[] => {
  if (typeof v === "string") return parseTenkey(v);
  if (!Array.isArray(v)) throw new Error(`${where}: must be an array or a tenkey string`);
  return v.map((c, i) => parsePos(c, `${where}[${i}]`));
};

/** EXP-0913B gap cell: one cell (object or single-token tenkey), or none. */
const parseGap = (v: unknown, where: string): Pos | null => {
  if (v === undefined || v === null || v === "") return null;
  const cells = typeof v === "string" ? parseTenkey(v) : [parsePos(v, where)];
  if (cells.length !== 1) throw new Error(`${where}: gap must be exactly one cell`);
  return cells[0];
};

const sameCellSet = (a: readonly Pos[], b: readonly Pos[]): boolean =>
  a.length === b.length && a.every((c) => b.some((d) => d.x === c.x && d.y === c.y));

/** Print-kit card number: one capital letter, a hyphen, three digits ("T-001"). */
export const PRINT_ID = /^[A-Z]-\d{3}$/;

/**
 * Card art path: relative to sim2/, under play/art/ only, plain segments (no
 * "..", no backslash, no leading slash) and a .webp or .jpg file - the image
 * types both servers serve.
 */
export const ART_PATH = /^play\/art\/(?:[a-z0-9-]+\/)*[A-Za-z0-9-]+\.(?:webp|jpg)$/;

const parseArt = (v: unknown, where: string): CardArt => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`${where}: must be an object {card, square}`);
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (k !== "card" && k !== "square") throw new Error(`${where}: unknown key "${k}"`);
  }
  const path = (k: "card" | "square"): string => {
    const p = o[k];
    if (typeof p !== "string" || !ART_PATH.test(p)) {
      throw new Error(`${where}.${k}: must be a .webp or .jpg path under play/art/`);
    }
    return p;
  };
  return { card: path("card"), square: path("square") };
};

export type ParseOptions = {
  /** false lifts the attackCost === atk invariant (EXP-0913B Sec.2.2). */
  attackCostMatchesAtk: boolean;
};

const parseCard = (v: unknown, i: number, opts: ParseOptions): CardDef => {
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
  if (o.manaValue !== undefined && (!isInt(o.manaValue) || o.manaValue < 0)) {
    throw new Error(`${where}: manaValue must be a non-negative integer`);
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
  const attackRange = parseCells(o.attackRange, `${where}.attackRange`);
  const counterRange = o.counterRange === undefined ? attackRange.map((c) => ({ ...c })) : parseCells(o.counterRange, `${where}.counterRange`);
  const card: CardDef = {
    id: o.id,
    name: o.name,
    nameJa: typeof o.nameJa === "string" && o.nameJa.length > 0 ? o.nameJa : o.name,
    summonCost: o.summonCost as number,
    attackCost: o.attackCost as number,
    atk: o.atk as number,
    hp: o.hp as number,
    lifeValue: o.lifeValue as number,
    // 髴雁鴨萓｡: printed by the adopted 9/22 set; older packs get the half_floor reward
    manaValue: isInt(o.manaValue) ? o.manaValue : kind === "reigu" ? 0 : Math.floor((o.summonCost as number) / 2),
    attribute: o.attribute,
    aoe: o.aoe,
    attackType,
    kind,
    attackRange,
    blindSpots: parseCells(o.blindSpots, `${where}.blindSpots`),
    counterRange,
    counterFollowsAttack: sameCellSet(counterRange, attackRange),
  };
  if (o.gapCell !== undefined) card.gapCell = parseGap(o.gapCell, `${where}.gapCell`);
  if (o.clan !== undefined) {
    if (typeof o.clan !== "string" || o.clan.length === 0) throw new Error(`${where}: clan must be a non-empty string`);
    card.clan = o.clan;
  }
  if (o.effect !== undefined) {
    if (typeof o.effect !== "string" || o.effect.length === 0) {
      throw new Error(`${where}: effect must be a non-empty string`);
    }
    card.effect = o.effect;
  }
  if (o.printId !== undefined) {
    if (typeof o.printId !== "string" || !PRINT_ID.test(o.printId)) {
      throw new Error(`${where}: printId must look like "T-001"`);
    }
    card.printId = o.printId;
  }
  if (o.art !== undefined) card.art = parseArt(o.art, `${where}.art`);
  if (card.summonCost < 0) throw new Error(`${where}: summonCost < 0`);
  if (card.attackCost < 0) throw new Error(`${where}: attackCost < 0`);
  if (card.hp < 0) throw new Error(`${where}: hp < 0`);
  // attackCost is definitionally the ATK slice of the old summon cost
  if (opts.attackCostMatchesAtk && card.attackCost !== card.atk) {
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
  if (raw.attackCostMatchesAtk !== undefined && typeof raw.attackCostMatchesAtk !== "boolean") {
    throw new Error("pack: `attackCostMatchesAtk` must be boolean");
  }
  const opts: ParseOptions = { attackCostMatchesAtk: raw.attackCostMatchesAtk !== false };
  const pack = packFromCards(
    typeof raw.packId === "string" ? raw.packId : "unnamed",
    raw.cards.map((c, i) => parseCard(c, i, opts)),
  );
  const printIds = new Set<string>();
  for (const c of pack.cards) {
    if (c.printId === undefined) continue;
    if (printIds.has(c.printId)) throw new Error(`pack: duplicate printId ${c.printId}`);
    printIds.add(c.printId);
  }
  return pack;
};

export const cardOf = (pack: CardPack, cardId: string): CardDef => {
  const c = pack.byId.get(cardId);
  if (c === undefined) throw new Error(`unknown cardId: ${cardId}`);
  return c;
};

/** The effect key a card runs under (its own id unless the pack remaps it). */
export const effectKeyOf = (pack: CardPack, cardId: string): string =>
  cardOf(pack, cardId).effect ?? cardId;
