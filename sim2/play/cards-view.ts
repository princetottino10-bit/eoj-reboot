// The 札 (card) design, shared by the hand, the board pieces and the detail
// panel: one set of parts at three sizes, laid out after the team's card
// design (3x3_duel print/card-design-v1) with the marks of its 記号体系
// (print/icon-system-v1, see marks.ts). Pure string builders, no DOM access
// and no rules maths (numbers come from the pack in the context and from
// engine helpers such as unitHp).
//
//   cost block (top left)   召喚 / 攻撃 / 回転 costs as braided pentagrams
//   attribute (top right)   陰 / 陽 / 空 (⊘) mark (霊具: a 霊具 badge)
//   霊力価 (under it)         the print kit's blue flames, one per point (md / lg)
//   art                     the print kit's illustration when the card has one,
//                           else the ink-wash ground and one large character (illustrationHtml)
//   name                    a vertical strip (not drawn on board pieces)
//   HP / ATK                亀甲 / 菱 with the number inside
//   type + range            刀 / 稲妻 and the range diagram (rangeSvg)
//   effect text + 生命価     the text box, the cold flame in its corner
//   card number             the print kit's number (T-001) at the bottom right (md / lg)
import type { CardOverrides } from "../src/card-overrides.ts";
import { cardOf } from "../src/cards.ts";
import { isAoeAttack } from "../src/combat.ts";
import { effectTextOf, rotateIsFree } from "../src/effects.ts";
import { cardOfUnit, isHidden, unitHp, unitMaxHp } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import type { CardDef, Config, Facing, PlayerId, Pos, Unit } from "../src/types.ts";
import { ATTR_MARK_ID, flames, mark } from "./marks.ts";

export type CardSize = "sm" | "md" | "lg";

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export const ATTR_MARK: Record<string, string> = { yin: "陰", yang: "陽", none: "空" };

/**
 * Background motif per clan (一門). The shipped packs carry no clan data, so
 * cards without one fall back to: shikigami = wave, reigu = lattice. Add
 * `"clan": "酒呑"` etc. to a pack card to switch it.
 */
const CLAN_MOTIF: Record<string, string> = {
  酒呑: "wave",
  玖龍街: "lattice",
  // the adopted 9/22 pack names its clans in full
  酒呑一門: "wave",
  玖龍街一門: "lattice",
  九尾: "hemp",
  龍: "scale",
};

export const motifOf = (card: CardDef): string =>
  card.clan !== undefined ? (CLAN_MOTIF[card.clan] ?? "plain") : card.kind === "reigu" ? "lattice" : "wave";

/**
 * Pixel sizes of the print-kit crops (sim2/out/printkit): the card's art
 * window and the square around its focal point. CSS sizes both (cover), so
 * these only tell the browser the shape before the file arrives.
 */
export const ART_PX = { card: { w: 624, h: 604 }, square: { w: 256, h: 256 } } as const;

/** A pack's art path (relative to sim2/, the servers' root) as a URL from any page. */
export const artUrl = (path: string): string => `/${path}`;

const glyphHtml = (card: CardDef): string => `<span class="fu-glyph" aria-hidden="true">${esc([...card.nameJa][0] ?? "")}</span>`;

/**
 * The illustration area: the one place where the art plugs in. A card with
 * `art` shows the print kit's illustration (the square crop on a board piece,
 * the card crop on the hand and detail sizes); the glyph stays underneath,
 * hidden, for when the file cannot be loaded (watchArtErrors). A card without
 * art keeps the placeholder face: the ink-wash ground with the first
 * character of the name in large brush-style type.
 */
export const illustrationHtml = (card: CardDef, size: CardSize = "md"): string => {
  const art = card.art;
  if (art === undefined) return `<span class="fu-art">${glyphHtml(card)}</span>`;
  const square = size === "sm";
  const px = square ? ART_PX.square : ART_PX.card;
  const src = artUrl(square ? art.square : art.card);
  return `<span class="fu-art has-img">${glyphHtml(card)}<img src="${esc(src)}" width="${px.w}" height="${px.h}" alt="${esc(card.nameJa)}" decoding="async" draggable="false"></span>`;
};

/**
 * A small square picture of a card for lists (the grave): the square crop, or
 * the placeholder glyph. Decoration next to the card's name, so no alt text.
 */
export const cardThumbHtml = (card: CardDef): string => {
  const art = card.art;
  if (art === undefined) return `<span class="fu-art fu-thumb" aria-hidden="true">${glyphHtml(card)}</span>`;
  const px = ART_PX.square;
  return `<span class="fu-art fu-thumb has-img" aria-hidden="true">${glyphHtml(card)}<img src="${esc(artUrl(art.square))}" width="${px.w}" height="${px.h}" alt="" decoding="async" draggable="false"></span>`;
};

const watched = new WeakSet<Document>();

/**
 * Once per page: a card-art file that fails to load (offline, missing) is
 * dropped and the placeholder glyph under it shows instead. `error` does not
 * bubble, so the listener captures; no inline handlers (the CSP forbids them).
 */
export const watchArtErrors = (doc: Document = document): void => {
  if (watched.has(doc)) return;
  watched.add(doc);
  doc.addEventListener(
    "error",
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement)) return;
      const slot = img.parentElement;
      if (slot !== null && slot.classList.contains("fu-art")) slot.classList.add("no-img");
    },
    true,
  );
};

const FACING_WORD = ["上", "右", "下", "左"];

/** One relative cell in words, as printed (forward = up): (-1,1) → 左前, (0,2) → 前2. */
const cellWord = (c: Pos): string => {
  const side = c.x === 0 ? "" : `${c.x < 0 ? "左" : "右"}${Math.abs(c.x) > 1 ? Math.abs(c.x) : ""}`;
  const depth = c.y === 0 ? "" : `${c.y > 0 ? "前" : "後"}${Math.abs(c.y) > 1 ? Math.abs(c.y) : ""}`;
  return side + depth;
};

const cellsWord = (cells: readonly Pos[]): string =>
  cells.length === 0 ? "なし" : cells.length >= 12 ? `周囲${cells.length}マス` : cells.map(cellWord).join("・");

/** The diagram in words, for the tooltip and screen readers. `counter` omitted = not described. */
export const describeRange = (range: readonly Pos[], blind: readonly Pos[], gap: Pos | null, counter?: readonly Pos[]): string =>
  [
    `攻撃範囲: ${cellsWord(range)}`,
    ...(counter === undefined ? [] : [`反撃範囲: ${cellsWord(counter)}`]),
    `死角: ${cellsWord(blind)}`,
    ...(gap === null ? [] : [`隙: ${cellWord(gap)}`]),
  ].join(" / ");

/**
 * The cells from which this card answers an attack, as the rules count them:
 * none without ATK, none for a jutsu under counterMode "gap".
 */
export const counterCellsOf = (cfg: Config, card: CardDef): Pos[] =>
  card.kind === "reigu" || card.atk <= 0 || (cfg.counterMode === "gap" && card.attackType !== "phys") ? [] : card.counterRange;

export type RangeOpts = {
  /** Counter range (反撃範囲); omitted = not drawn and not described. */
  counter?: readonly Pos[];
  /** Area attack: squares; single target: circles (the system's shape axis). */
  aoe?: boolean;
};

const STEP = 11;
const CELL = 10;

/**
 * The range diagram with the primitives of the 記号体系 (forward = up):
 * counter range = sage (a full-cell square for area attackers, an inscribed
 * circle for single), attack = vermilion at 50% of the cell (square = area,
 * circle = single), blind spot = khaki full cell, the piece = ink with a white
 * forward triangle. The system has no gap (隙) mark yet: an amber ring stands
 * in for it (provisional). 3x3 when everything is adjacent, 5x5 when something
 * reaches two cells (the unused outer ring then shrinks to dots so the core
 * reads first). The diagram is always printed forward = up; on the board the
 * whole card turns with the piece, and `facing` only adds the current facing
 * to the label.
 */
export const rangeSvg = (range: readonly Pos[], blind: readonly Pos[], gap: Pos | null, facing: Facing = 0, opts: RangeOpts = {}): string => {
  const counter = opts.counter ?? [];
  const aoe = opts.aoe ?? false;
  const has = (list: readonly Pos[], dx: number, dy: number): boolean => list.some((c) => c.x === dx && c.y === dy);
  const reach = Math.max(1, ...[...range, ...blind, ...counter, ...(gap === null ? [] : [gap])].map((c) => Math.max(Math.abs(c.x), Math.abs(c.y))));
  const half = reach > 1 ? 2 : 1;
  const grid = half * 2 + 1;
  const size = 2 + (grid - 1) * STEP + CELL;
  const cells: string[] = [];
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const dx = col - half;
      const dy = half - row;
      const x = 1 + col * STEP;
      const y = 1 + row * STEP;
      const c = CELL / 2;
      const rect = (cls: string, inset = 0): string =>
        `<rect class="${cls}" x="${x + inset}" y="${y + inset}" width="${CELL - inset * 2}" height="${CELL - inset * 2}"/>`;
      if (dx === 0 && dy === 0) {
        cells.push(`${rect("rs-self")}<path class="rs-fwd" d="M${x + c} ${y + 2.4}L${x + 7.8} ${y + 7.2}L${x + 2.2} ${y + 7.2}Z"/>`);
        continue;
      }
      const inAtk = has(range, dx, dy);
      const inCtr = has(counter, dx, dy);
      const inBlind = has(blind, dx, dy);
      const isGap = gap !== null && gap.x === dx && gap.y === dy;
      if (!inAtk && !inCtr && !inBlind && !isGap && half === 2 && (Math.abs(dx) === 2 || Math.abs(dy) === 2)) {
        cells.push(`<circle class="rs-dot" cx="${x + c}" cy="${y + c}" r="0.9"/>`);
        continue;
      }
      const parts = [rect("rs-cell")];
      if (inBlind) parts.push(rect("rs-blind"));
      if (inCtr) parts.push(aoe ? rect("rs-ctr") : `<circle class="rs-ctr" cx="${x + c}" cy="${y + c}" r="${c}"/>`);
      if (inAtk) parts.push(aoe ? rect("rs-atk", CELL / 4) : `<circle class="rs-atk" cx="${x + c}" cy="${y + c}" r="${CELL / 4}"/>`);
      if (isGap) parts.push(rect("rs-gap", 1.3));
      cells.push(parts.join(""));
    }
  }
  const label = `${describeRange(range, blind, gap, opts.counter)}${facing === 0 ? "" : `(いまの向き: ${FACING_WORD[facing]})`}`;
  return `<svg class="fu-range g${grid}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${cells.join("")}</svg>`;
};

export type CardFaceOpts = {
  size: CardSize;
  /** Card number overrides in force; changed numbers are marked. */
  mods?: CardOverrides;
  /** Printed values, for the "元の値" tooltip on changed numbers. */
  printed?: (cardId: string) => CardDef | undefined;
  extraClass?: string;
  /** A board piece's facing, named in the range label (the piece turns the whole card). */
  facing?: Facing;
  /** A board piece's HP now (the 亀甲 then shows it; damaged = vermilion). */
  hp?: { now: number; max: number };
  /** A hand card's summon cost now when a rule lowers it (劣勢時の大型割引): the printed cost is struck through. */
  costNow?: number;
};

type Mod = { cls: string; tip: string };

/** Marking for an edited card field: class and "元の値" tooltip text. */
const modOf = (card: CardDef, keys: readonly (keyof CardDef)[], opts: CardFaceOpts): Mod => {
  const edit = opts.mods?.[card.id] as Partial<Record<keyof CardDef, unknown>> | undefined;
  const changed = keys.filter((k) => edit?.[k] !== undefined);
  if (changed.length === 0) return { cls: "", tip: "" };
  const was = opts.printed?.(card.id);
  const first = changed[0];
  const old = was?.[first];
  return { cls: " is-mod", tip: typeof old === "number" || typeof old === "string" ? `(変更: 元の値 ${String(old)})` : "(変更あり)" };
};

/** Screen-reader words beside a mark and its number. */
const sr = (text: string): string => `<i class="sr">${text}</i>`;

const num = (v: number, cls = ""): string => `<b class="num${cls}">${v}</b>`;

const costHtml = (ctx: Ctx, card: CardDef, opts: CardFaceOpts): string => {
  const reigu = card.kind === "reigu";
  const word = reigu ? "使用コスト" : "召喚コスト";
  const m = modOf(card, ["summonCost"], opts);
  const now = opts.costNow !== undefined && opts.costNow !== card.summonCost ? opts.costNow : null;
  const main = now === null
    ? `<span class="fu-c fu-c-sum${m.cls}" title="${word} ${card.summonCost}${m.tip}">${sr(word)}${mark("mana-ring")}${num(card.summonCost)}</span>`
    : `<span class="fu-c fu-c-sum is-disc${m.cls}" title="${word} ${card.summonCost} → いまは${now}(劣勢割引)">${sr(word)}${mark("mana-ring")}<s class="num-was">${card.summonCost}</s>${num(now)}</span>`;
  if (reigu || opts.size === "sm") return `<span class="fu-cost">${main}</span>`;
  const a = modOf(card, ["attackCost"], opts);
  // the rule's rotate cost for this card (爪鬼 turns for free); rotateIsFree reads only the card of the unit
  const rot = rotateIsFree(ctx, { cardId: card.id } as Unit) ? 0 : ctx.cfg.rotateCost;
  return `<span class="fu-cost">${main}<span class="fu-c fu-c-atk${a.cls}" title="攻撃コスト ${card.attackCost}${a.tip}">${sr("攻撃コスト")}${mark("mana")}${num(card.attackCost)}</span><span class="fu-c fu-c-rot" title="回転コスト ${rot}">${sr("回転コスト")}${mark("mana")}${num(rot)}</span></span>`;
};

const attrHtml = (card: CardDef, opts: CardFaceOpts): string => {
  if (card.kind === "reigu") return `<span class="fu-attr fu-badge" title="霊具">霊具</span>`;
  const m = modOf(card, ["attribute"], opts);
  const word = `属性: ${ATTR_MARK[card.attribute]}`;
  return `<span class="fu-attr${m.cls}" title="${word}${m.tip}">${mark(ATTR_MARK_ID[card.attribute], "", word)}</span>`;
};

const statsHtml = (card: CardDef, opts: CardFaceOpts): string => {
  const hm = modOf(card, ["hp"], opts);
  const am = modOf(card, ["atk"], opts);
  const hp = opts.hp;
  const hpNow = hp === undefined ? card.hp : hp.now;
  const tone = hp === undefined ? "" : hp.now < hp.max ? " hurt" : hp.now > hp.max ? " over" : "";
  const hpTip = hp === undefined ? `HP ${card.hp}` : `HP ${hp.now}/${hp.max}`;
  return `<span class="fu-stats"><span class="fu-hp gem${hm.cls}" title="${hpTip}${hm.tip}">${sr("HP")}${mark("hp")}${num(hpNow, tone)}</span><span class="fu-atk gem${am.cls}" title="ATK ${card.atk}${am.tip}">${sr("ATK")}${mark("atk")}${num(card.atk)}</span></span>`;
};

/** 物理・範囲 / 術式・単体 / 術式・攻撃なし. */
const typeWord = (ctx: Ctx, card: CardDef): string =>
  `${card.attackType === "jutsu" ? "術式" : "物理"}・${card.atk <= 0 || card.attackRange.length === 0 ? "攻撃なし" : isAoeAttack(ctx, card) ? "範囲" : "単体"}`;

const rangeBlockHtml = (ctx: Ctx, card: CardDef, opts: CardFaceOpts): string => {
  const aoe = isAoeAttack(ctx, card);
  const gap = ctx.cfg.counterMode === "gap" && aoe ? (card.gapCell ?? null) : null;
  const svg = rangeSvg(card.attackRange, card.blindSpots, gap, opts.facing ?? 0, { counter: counterCellsOf(ctx.cfg, card), aoe });
  const rm = modOf(card, ["attackRange", "blindSpots", "gapCell", "aoe"], opts);
  if (opts.size === "sm") return `<span class="fu-rblock${rm.cls}">${svg}</span>`;
  const tm = modOf(card, ["attackType", "aoe"], opts);
  const word = typeWord(ctx, card);
  return `<span class="fu-rblock${rm.cls}"><span class="fu-type${tm.cls}" title="${word}${tm.tip}">${mark(card.attackType === "jutsu" ? "jutsu" : "phys")}<span class="fu-type-w">${word}</span></span>${svg}</span>`;
};

const textHtml = (ctx: Ctx, card: CardDef, opts: CardFaceOpts): string => {
  const printedText = effectTextOf(card.id);
  // the hand card has no room for the 【霊具】 tag the badge already shows
  const text = printedText !== null && opts.size === "md" ? printedText.replace(/^【霊具】/, "") : printedText;
  // the corner value: 生命価 (the cold flame) while life counts (霊力価 has its
  // flames under the attribute mark, manaValueHtml)
  const lm = modOf(card, ["lifeValue"], opts);
  const lifeOn = ctx.cfg.lifeValueEnabled && card.kind !== "reigu";
  const life = lifeOn ? `<span class="fu-life${lm.cls}" title="生命価 ${card.lifeValue}${lm.tip}">${sr("生命価")}${mark("life")}${num(card.lifeValue)}</span>` : "";
  // the text keeps clear of the corner only while something sits in it
  const corner = lifeOn ? " has-corner" : "";
  if (text === null || text === "") return `<span class="fu-text none${corner}"><span class="fu-tx">効果なし</span>${life}</span>`;
  const on = ctx.cfg.effects;
  return `<span class="fu-text${on ? "" : " off"}${corner}"><span class="fu-tx">${on ? "" : "(効果オフ) "}${esc(text)}</span>${life}</span>`;
};

/**
 * 霊力価 as the print kit shows it: one blue flame per point, 1 to 3; from 4
 * up (and at 0) one flame and the number. Only while destruction pays the
 * card's value (killRewardBase "card"); not on board pieces, not on 霊具.
 */
const manaValueHtml = (ctx: Ctx, card: CardDef, opts: CardFaceOpts): string => {
  if (card.kind === "reigu" || opts.size === "sm" || ctx.cfg.killRewardBase !== "card") return "";
  const m = modOf(card, ["manaValue"], opts);
  const n = card.manaValue;
  const word = `霊力価 ${n}`;
  const count = n >= 1 && n <= 3 ? n : 1;
  return `<span class="fu-mval n${count}${m.cls}" title="${word}(撃破した側が得る霊力)${m.tip}">${sr(word)}${flames(count)}${count === n ? "" : num(n)}</span>`;
};

/** The print kit's card number (T-001) at the bottom right; not on board pieces. */
const printIdHtml = (card: CardDef, size: CardSize): string =>
  card.printId === undefined || size === "sm" ? "" : `<span class="fu-pid" title="カード番号 ${esc(card.printId)}">${esc(card.printId)}</span>`;

/** One card face. `sm` is the board piece body, `md` the hand, `lg` the detail panel. */
export const cardFaceHtml = (ctx: Ctx, cardId: string, opts: CardFaceOpts): string => {
  const card = cardOf(ctx.pack, cardId);
  const size = opts.size;
  const pid = printIdHtml(card, size);
  const cls = ["fu", `fu-${size}`, `k-${card.kind}`, `a-${card.attribute}`, `m-${motifOf(card)}`, card.art === undefined ? "" : "has-art", pid === "" ? "" : "has-pid", opts.extraClass ?? ""]
    .filter((c) => c !== "")
    .join(" ");
  // board pieces carry no name (the detail panel and the cell's label have it)
  const name = `<span class="fu-name${size === "sm" ? " sr" : ""}">${esc(card.nameJa)}</span>`;
  const art = illustrationHtml(card, size);
  const cost = costHtml(ctx, card, opts);
  const attr = attrHtml(card, opts);
  const text = size === "sm" ? "" : textHtml(ctx, card, opts);
  if (card.kind === "reigu") {
    return `<div class="${cls}" data-card="${esc(card.id)}">${art}${cost}${attr}${name}${text}${pid}</div>`;
  }
  const body = `${statsHtml(card, opts)}${rangeBlockHtml(ctx, card, opts)}`;
  return `<div class="${cls}" data-card="${esc(card.id)}">${art}${cost}${attr}${manaValueHtml(ctx, card, opts)}${name}${body}${text}${pid}</div>`;
};

export const cardBackHtml = (extraClass = ""): string =>
  `<div class="fu fu-back ${extraClass}" aria-hidden="true"><span class="fu-back-mark">符</span></div>`;

export const SEAT_SEAL = ["先", "後"];

/**
 * A unit on the board: the small card turned the way the piece faces (its top
 * edge is the front; upside down when facing down) with the numbers kept
 * upright, a gold arrowhead outside that edge, the owner's cube (the only
 * place, with the glow under the card, where the owner's colour appears),
 * spent / hidden markers. `turnPlayer`: acted-this-turn marks show only on
 * that seat's pieces (the other seat's flags are last turn's until its own
 * turn starts).
 */
export const pieceHtml = (
  ctx: Ctx,
  u: Unit,
  opts: { mods?: CardOverrides; printed?: (id: string) => CardDef | undefined; control: boolean; turnPlayer?: PlayerId },
): string => {
  const card = cardOfUnit(ctx, u);
  const hp = Math.max(0, unitHp(ctx, u));
  const max = unitMaxHp(ctx, u);
  const current = opts.turnPlayer === undefined || opts.turnPlayer === u.owner;
  const spent = current && (u.attackedThisTurn || u.rotatedThisTurn);
  const flag = !current ? "" : u.attackedThisTurn ? "攻" : u.rotatedThisTurn ? "回" : "";
  const flagTip = u.attackedThisTurn ? "このターン攻撃済み" : "このターン回転済み";
  const cls = ["pc", `o${u.owner}`, `f${u.facing}`, spent ? "is-spent" : "", isHidden(u) ? "is-hidden" : "", opts.control ? "is-ctl" : ""].join(" ");
  const buff = u.atkBuff > 0 ? `<span class="pc-buff" title="このターンATK+${u.atkBuff}">ATK+${u.atkBuff}</span>` : "";
  return `<div class="${cls}" data-uid="${u.uid}">
    <div class="pc-dir f${u.facing}" aria-hidden="true"><i class="pc-arrow"></i></div>
    <div class="pc-body">${cardFaceHtml(ctx, card.id, { size: "sm", mods: opts.mods, printed: opts.printed, facing: u.facing, hp: { now: hp, max } })}${mark("cube", "pc-cube")}</div>
    ${flag === "" ? "" : `<span class="pc-flag" title="${flagTip}">${flag}</span>`}
    ${buff}
    ${isHidden(u) ? `<span class="pc-fog" aria-hidden="true"></span><span class="pc-hidden">隠</span>` : ""}
  </div>`;
};
