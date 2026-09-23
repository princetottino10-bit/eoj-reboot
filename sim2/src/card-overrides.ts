// Card overrides: "what if 子鬼 had 3 HP, or hit two cells ahead?". An
// override never edits a loaded pack; applyCardOverrides builds a new pack
// whose changed cards are fresh copies, and the match context is made from
// that. Numbers, attribute, attack type, area / single, attack range, blind
// spots and the gap cell can all be changed. Pure: browser-safe.
import { formatTenkey, packFromCards } from "./cards.ts";
import type { CardPack } from "./cards.ts";
import type { AttackType, Attr, CardDef, Pos } from "./types.ts";
import type { Parsed } from "./config-schema.ts";

export type CardStatKey = "summonCost" | "attackCost" | "hp" | "atk" | "lifeValue" | "manaValue";

export type CardStat = {
  key: CardStatKey;
  label: string;
  /** Column heading in the card table. */
  short: string;
  desc: string;
  min: number;
  max: number;
};

export const CARD_STATS: readonly CardStat[] = [
  { key: "summonCost", label: "召喚コスト", short: "召", desc: "召喚(霊具は使用)に払う霊力", min: 0, max: 15 },
  { key: "attackCost", label: "攻撃コスト", short: "攻", desc: "攻撃1回に払う霊力", min: 0, max: 15 },
  { key: "hp", label: "HP", short: "HP", desc: "属性ボーナスを含まない基本HP", min: 1, max: 20 },
  { key: "atk", label: "ATK", short: "ATK", desc: "与えるダメージの基本値", min: 0, max: 10 },
  { key: "lifeValue", label: "生命価", short: "命", desc: "撃破されたとき持ち主が失う生命", min: 0, max: 15 },
  { key: "manaValue", label: "霊力価", short: "霊", desc: "撃破した側が得る霊力(撃破報酬の額が「カードの霊力価」のとき)", min: 0, max: 15 },
];

/** Everything of one card an override may replace. Absent = printed value. */
export type CardEdit = Partial<Record<CardStatKey, number>> & {
  attribute?: Attr;
  attackType?: AttackType;
  /** true = area attack (hits every cell of the range), false = single target. */
  aoe?: boolean;
  attackRange?: Pos[];
  blindSpots?: Pos[];
  /** The area attack's gap cell; null = none. */
  gapCell?: Pos | null;
};

export type CardOverrides = Record<string, CardEdit>;

export type CardShapeKey = "attribute" | "attackType" | "aoe" | "attackRange" | "blindSpots" | "gapCell";
export type CardFieldKey = CardStatKey | CardShapeKey;

export const SHAPE_LABELS: Record<CardShapeKey, string> = {
  attribute: "属性",
  attackType: "攻撃の種類",
  aoe: "範囲/単体",
  attackRange: "攻撃範囲",
  blindSpots: "死角",
  gapCell: "隙",
};

export const ATTR_LABELS: Record<Attr, string> = { yin: "陰", yang: "陽", none: "空" };
export const ATTACK_TYPE_LABELS: Record<AttackType, string> = { phys: "物理", jutsu: "術式" };

const STAT_KEYS = new Set<string>(CARD_STATS.map((s) => s.key));
const SHAPE_KEYS = new Set<string>(Object.keys(SHAPE_LABELS));
const CARD_ID = /^[A-Za-z0-9_-]{1,32}$/;
// Plain-object keys that would hit Object.prototype instead of creating an entry.
const RESERVED_IDS = new Set(["__proto__", "constructor", "prototype"]);
const MAX_CARDS = 64;
/** Relative cells stay within two steps (the 5x5 around the piece). */
export const RANGE_REACH = 2;
const MAX_CELLS = (RANGE_REACH * 2 + 1) ** 2 - 1;

/** Which numbers are meaningful for a card: a reigu only has its use cost. */
export const editableStats = (card: CardDef): CardStatKey[] =>
  card.kind === "reigu" ? ["summonCost"] : CARD_STATS.map((s) => s.key);

/** Attribute, attack type, range and friends exist only on shikigami. */
export const canEditShape = (card: CardDef): boolean => card.kind === "shikigami";

/** Lowest allowed value for a stat on this card (a shikigami needs cost and HP >= 1). */
export const statMin = (card: CardDef, stat: CardStat): number =>
  card.kind === "shikigami" && stat.key === "summonCost" ? 1 : stat.min;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

// ------------------------------------------------------------------ cells

export const posKey = (p: Pos): string => `${p.x},${p.y}`;

/** Canonical order (front rows first, left to right) so equal sets compare and encode equally. */
export const sortCells = (cells: readonly Pos[]): Pos[] =>
  cells.map((c) => ({ x: c.x, y: c.y })).sort((a, b) => b.y - a.y || a.x - b.x);

export const sameCells = (a: readonly Pos[], b: readonly Pos[]): boolean => {
  if (a.length !== b.length) return false;
  const keys = new Set(a.map(posKey));
  return b.every((c) => keys.has(posKey(c)));
};

const samePos = (a: Pos | null | undefined, b: Pos | null | undefined): boolean =>
  (a ?? null) === null ? (b ?? null) === null : b !== null && b !== undefined && a!.x === b.x && a!.y === b.y;

const parseCell = (v: unknown): Pos | null => {
  if (!isObj(v) || !isInt(v.x) || !isInt(v.y)) return null;
  if (Math.abs(v.x) > RANGE_REACH || Math.abs(v.y) > RANGE_REACH || (v.x === 0 && v.y === 0)) return null;
  return { x: v.x, y: v.y };
};

const parseCellList = (v: unknown, label: string): Parsed<Pos[]> => {
  if (!Array.isArray(v) || v.length > MAX_CELLS) return { ok: false, error: `${label}の形式が不正です` };
  const out: Pos[] = [];
  for (const raw of v) {
    const c = parseCell(raw);
    if (c === null) return { ok: false, error: `${label}のマスは自分の周り2マス以内(自分のマス以外)にしてください` };
    if (out.some((x) => x.x === c.x && x.y === c.y)) return { ok: false, error: `${label}に同じマスが重なっています` };
    out.push(c);
  }
  return { ok: true, value: sortCells(out) };
};

// ------------------------------------------------------------------ words

/** One relative cell in words, as printed (forward = up): (-1,1) → 左前, (0,2) → 前2. */
export const cellWord = (c: Pos): string => {
  const side = c.x === 0 ? "" : `${c.x < 0 ? "左" : "右"}${Math.abs(c.x) > 1 ? Math.abs(c.x) : ""}`;
  const depth = c.y === 0 ? "" : `${c.y > 0 ? "前" : "後"}${Math.abs(c.y) > 1 ? Math.abs(c.y) : ""}`;
  return side + depth;
};

export const cellsWord = (cells: readonly Pos[]): string =>
  cells.length === 0 ? "なし" : cells.length >= 12 ? `周囲${cells.length}マス` : sortCells(cells).map(cellWord).join("・");

/** Cells as the card sheet writes them when possible ("-1-2-32"), otherwise in words. */
export const cellsText = (cells: readonly Pos[]): string => {
  if (cells.length === 0) return "なし";
  const tenkey = formatTenkey(cells);
  return tenkey === null ? cellsWord(cells) : `${cellsWord(cells)}(${tenkey})`;
};

// ------------------------------------------------------------- validation

/** The value a field has on this card once the edit is applied. */
const effective = <K extends keyof CardEdit & keyof CardDef>(card: CardDef, edit: CardEdit, key: K): CardDef[K] =>
  (edit[key] !== undefined ? edit[key] : card[key]) as CardDef[K];

/** Relations between range, blind spots and gap, on the card as it will be played. */
const checkShape = (name: string, range: readonly Pos[], blind: readonly Pos[], gap: Pos | null, aoe: boolean): string | null => {
  const keys = new Set(range.map(posKey));
  if (blind.some((c) => keys.has(posKey(c)))) return `${name}: 攻撃範囲と死角が同じマスにあります`;
  if (gap !== null && aoe && !keys.has(posKey(gap))) return `${name}: 隙は攻撃範囲のマスに置いてください`;
  return null;
};

const parseShape = (key: string, v: unknown, name: string, edit: CardEdit): string | null => {
  switch (key) {
    case "attribute":
      if (v !== "yin" && v !== "yang" && v !== "none") return `${name} の属性が不正です`;
      edit.attribute = v;
      return null;
    case "attackType":
      if (v !== "phys" && v !== "jutsu") return `${name} の攻撃の種類が不正です`;
      edit.attackType = v;
      return null;
    case "aoe":
      if (typeof v !== "boolean") return `${name} の範囲/単体が不正です`;
      edit.aoe = v;
      return null;
    case "gapCell": {
      if (v === null) {
        edit.gapCell = null;
        return null;
      }
      const c = parseCell(v);
      if (c === null) return `${name} の隙のマスが不正です`;
      edit.gapCell = c;
      return null;
    }
    default: {
      const label = key === "attackRange" ? "攻撃範囲" : "死角";
      const cells = parseCellList(v, `${name} の${label}`);
      if (!cells.ok) return cells.error;
      if (key === "attackRange") edit.attackRange = cells.value;
      else edit.blindSpots = cells.value;
      return null;
    }
  }
};

/**
 * Rebuilds overrides from untrusted JSON. Without a pack only the shape and
 * the global ranges are checked; with the pack, card ids must exist, each
 * field must be editable for that card with the card's own minimum, and the
 * range / blind spots / gap must agree on the card as it will be played.
 */
export const parseCardOverrides = (raw: unknown, pack: CardPack | null): Parsed<CardOverrides> => {
  if (raw === undefined) return { ok: true, value: {} };
  if (!isObj(raw)) return { ok: false, error: "カードの変更の形式が不正です" };
  const ids = Object.keys(raw);
  if (ids.length > MAX_CARDS) return { ok: false, error: "カードの変更が多すぎます" };
  const out: CardOverrides = {};
  for (const id of ids) {
    if (!CARD_ID.test(id) || RESERVED_IDS.has(id)) return { ok: false, error: "カードIDが不正です" };
    const card = pack === null ? undefined : pack.byId.get(id);
    if (pack !== null && card === undefined) return { ok: false, error: `パックにないカードです: ${id}` };
    const fields = raw[id];
    if (!isObj(fields)) return { ok: false, error: `${id} の変更の形式が不正です` };
    const name = card === undefined ? id : card.nameJa;
    const clean: CardEdit = {};
    for (const [k, v] of Object.entries(fields)) {
      if (SHAPE_KEYS.has(k)) {
        if (card !== undefined && !canEditShape(card)) return { ok: false, error: `${name} は霊具なので${SHAPE_LABELS[k as CardShapeKey]}はありません` };
        const problem = parseShape(k, v, name, clean);
        if (problem !== null) return { ok: false, error: problem };
        continue;
      }
      if (!STAT_KEYS.has(k)) return { ok: false, error: `不明なカードの項目です: ${k.slice(0, 20)}` };
      const stat = CARD_STATS.find((s) => s.key === k) as CardStat;
      if (card !== undefined && !editableStats(card).includes(stat.key)) {
        return { ok: false, error: `${name} の${stat.label}は変更できません` };
      }
      const lo = card === undefined ? stat.min : statMin(card, stat);
      if (!isInt(v) || v < lo || v > stat.max) {
        return { ok: false, error: `${name} の${stat.label}は${lo}〜${stat.max}の整数にしてください` };
      }
      clean[stat.key] = v;
    }
    const relation =
      card !== undefined
        ? checkShape(name, effective(card, clean, "attackRange"), effective(card, clean, "blindSpots"), effective(card, clean, "gapCell") ?? null, effective(card, clean, "aoe"))
        : clean.attackRange !== undefined && clean.blindSpots !== undefined
          ? checkShape(name, clean.attackRange, clean.blindSpots, clean.gapCell ?? null, clean.aoe ?? true)
          : null;
    if (relation !== null) return { ok: false, error: relation };
    out[id] = clean;
  }
  return { ok: true, value: out };
};

// ------------------------------------------------------------- normalizing

const fieldEquals = (card: CardDef, key: CardFieldKey, v: unknown): boolean => {
  if (key === "attackRange" || key === "blindSpots") return sameCells(card[key], v as Pos[]);
  if (key === "gapCell") return samePos(card.gapCell, v as Pos | null);
  return card[key] === v;
};

const FIELD_ORDER: readonly CardFieldKey[] = [
  ...CARD_STATS.map((s) => s.key),
  "attribute",
  "attackType",
  "aoe",
  "attackRange",
  "blindSpots",
  "gapCell",
];

const copyField = (v: unknown): unknown => (Array.isArray(v) ? sortCells(v as Pos[]) : isObj(v) ? { ...v } : v);

/** Drops fields equal to the printed card and cards left with nothing. */
export const normalizeCardOverrides = (pack: CardPack, ov: CardOverrides): CardOverrides => {
  const out: CardOverrides = {};
  for (const card of pack.cards) {
    const edit = ov[card.id];
    if (edit === undefined) continue;
    const kept: Record<string, unknown> = {};
    for (const key of FIELD_ORDER) {
      const v = edit[key];
      if (v !== undefined && !fieldEquals(card, key, v)) kept[key] = copyField(v);
    }
    if (Object.keys(kept).length > 0) out[card.id] = kept as CardEdit;
  }
  return out;
};

/**
 * The edits that turn pack `from` into pack `to` (same card ids), field by
 * field. Used for "what differs from the printed pack right now" and for the
 * mid-match change a player asks for (current pack -> wanted pack).
 */
export const overridesBetween = (from: CardPack, to: CardPack): CardOverrides => {
  const out: CardOverrides = {};
  for (const a of from.cards) {
    const b = to.byId.get(a.id);
    if (b === undefined) continue;
    const kept: Record<string, unknown> = {};
    for (const key of FIELD_ORDER) {
      const v = key === "gapCell" ? (b.gapCell ?? null) : b[key];
      if (!fieldEquals(a, key, v)) kept[key] = copyField(v);
    }
    if (Object.keys(kept).length > 0) out[a.id] = kept as CardEdit;
  }
  return out;
};

/** Deep copy (cells are fresh objects). */
export const cloneCardOverrides = (ov: CardOverrides): CardOverrides =>
  Object.fromEntries(
    Object.entries(ov).map(([id, edit]) => [id, Object.fromEntries(Object.entries(edit).map(([k, v]) => [k, copyField(v)])) as CardEdit]),
  );

/** Number of changed fields (a whole range counts as one). */
export const cardChangeCount = (ov: CardOverrides): number =>
  Object.values(ov).reduce((n, edit) => n + Object.keys(edit).length, 0);

/** Does an attack-range edit move this card's counter range too? Decided by the printed card. */
export const counterFollowsAttack = (card: CardDef): boolean =>
  card.counterFollowsAttack ?? sameCells(card.counterRange, card.attackRange);

/** One card as it will be played. The printed card is never modified. */
export const editedCard = (card: CardDef, edit: CardEdit | undefined): CardDef => {
  if (edit === undefined || Object.keys(edit).length === 0) return card;
  // an already edited card may have its two ranges equal by accident: keep the printed decision
  const next: CardDef = { ...card, counterFollowsAttack: counterFollowsAttack(card) };
  for (const s of CARD_STATS) if (edit[s.key] !== undefined) next[s.key] = edit[s.key] as number;
  if (edit.attribute !== undefined) next.attribute = edit.attribute;
  if (edit.attackType !== undefined) next.attackType = edit.attackType;
  if (edit.aoe !== undefined) next.aoe = edit.aoe;
  if (edit.blindSpots !== undefined) next.blindSpots = sortCells(edit.blindSpots);
  if (edit.attackRange !== undefined) {
    next.attackRange = sortCells(edit.attackRange);
    if (next.counterFollowsAttack === true) next.counterRange = next.attackRange.map((c) => ({ ...c }));
  }
  if (edit.gapCell !== undefined) next.gapCell = edit.gapCell === null ? null : { ...edit.gapCell };
  return next;
};

const mergeOverrides = (a: CardOverrides, b: CardOverrides): CardOverrides => {
  const out: CardOverrides = { ...a };
  for (const [id, edit] of Object.entries(b)) out[id] = { ...(a[id] ?? {}), ...edit };
  return out;
};

/**
 * A new pack with the overrides applied (each value replaces the current one).
 * The result is always the printed pack plus the combined edits, so the same
 * final values give the same cards however many steps they took, and a card
 * set back to its printed values is the printed card again. The input pack and
 * its card objects are never modified; unchanged cards are shared (nothing
 * mutates a CardDef).
 */
export const applyCardOverrides = (pack: CardPack, ov: CardOverrides): CardPack => {
  if (cardChangeCount(ov) === 0) return pack;
  const printed = pack.printed ?? pack;
  const current = pack.printed === undefined ? {} : overridesBetween(printed, pack);
  const total = normalizeCardOverrides(printed, mergeOverrides(current, ov));
  if (cardChangeCount(total) === 0) return printed;
  const next = packFromCards(printed.packId, printed.cards.map((c) => editedCard(c, total[c.id])));
  // keep the original deck order (one entry per copy)
  return { ...next, deckList: printed.deckList.slice(), printed };
};

// ----------------------------------------------------------------- changes

export type CardChange = { cardId: string; field: CardFieldKey; label: string; from: string; to: string };

const fieldLabel = (key: CardFieldKey): string => CARD_STATS.find((s) => s.key === key)?.label ?? SHAPE_LABELS[key as CardShapeKey];

/** A card field's value as text for change lists: "3" / "陰" / "範囲" / "前・左前(12)". */
export const formatCardField = (key: CardFieldKey, v: unknown): string => {
  switch (key) {
    case "attribute":
      return ATTR_LABELS[v as Attr] ?? String(v);
    case "attackType":
      return ATTACK_TYPE_LABELS[v as AttackType] ?? String(v);
    case "aoe":
      return v === true ? "範囲" : "単体";
    case "attackRange":
    case "blindSpots":
      return cellsText(v as Pos[]);
    case "gapCell":
      return v === null || v === undefined ? "なし" : cellWord(v as Pos);
    default:
      return String(v);
  }
};

/** Every overridden field against the printed pack, in pack order. */
export const cardChanges = (pack: CardPack, ov: CardOverrides): CardChange[] => {
  const out: CardChange[] = [];
  for (const card of pack.cards) {
    const edit = ov[card.id];
    if (edit === undefined) continue;
    for (const key of FIELD_ORDER) {
      const v = edit[key];
      if (v === undefined || fieldEquals(card, key, v)) continue;
      const printed = key === "gapCell" ? (card.gapCell ?? null) : card[key];
      out.push({ cardId: card.id, field: key, label: fieldLabel(key), from: formatCardField(key, printed), to: formatCardField(key, v) });
    }
  }
  return out;
};
