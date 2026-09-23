// The marks of the team's 記号体系 第一稿 (3x3_duel print/icon-system-v1,
// generated there by _foundry/marks.mjs): 陰 / 陽 / 空 / 太極, the braided
// pentagram with a ring (召喚コスト) and without (攻撃・回転コスト), 亀甲 (HP),
// 菱 (ATK), 冷たい炎 (生命価), 刀 (物理), 稲妻 (術式), plus the owner cube.
// The path data is copied unchanged from that system (64 grid, centre 32,32);
// only the ids are prefixed "mk-". Fix a mark there first, then copy it here.
// Two marks follow the team's print kit (print-kit-a4-deck-oni-tsukumogami,
// 2026-09-23) instead: 空 is a ring with a diagonal slash (⊘), and 霊力価 is
// the kit's blue flame (traced from the page raster by
// sim2/out/printkit/flame_trace.py), drawn once per point (flames()).
//
// The symbols live once per page in a hidden <svg> (ensureMarks); every card
// refers to them with <use>, so a board of pieces does not repeat the paths.
import type { Attr, CellAttr } from "../src/types.ts";

export type MarkId =
  | "yin"
  | "yang"
  | "void"
  | "taiji"
  | "mana-ring"
  | "mana"
  | "hp"
  | "atk"
  | "life"
  | "flame"
  | "phys"
  | "jutsu"
  | "cube";

const TEAL = "#1a7f72";
const INK = "#26262b";
const PAPER = "#f7f5f0";
const NAVY = "#1b2340";
const CREAM = "#f5f1e2";

const BRAID =
  `<path d="M29.43 3.62L46.6 56.47L49.17 55.63L32 2.78Z" fill="${TEAL}"/>` +
  `<path d="M50.75 53.45L5.8 20.79L4.22 22.97L49.17 55.63Z" fill="${TEAL}"/>` +
  `<path d="M4.22 25.67L59.78 25.67L59.78 22.97L4.22 22.97Z" fill="${TEAL}"/>` +
  `<path d="M58.2 20.79L13.25 53.45L14.83 55.63L59.78 22.97Z" fill="${TEAL}"/>` +
  `<path d="M17.4 56.47L34.57 3.62L32 2.78L14.83 55.63Z" fill="${TEAL}"/>`;

/** The over / under crossings of the braid: each strand passes under the next inside a small circle. */
const WEAVE: readonly (readonly [string, string, string, string])[] = [
  ["37.58", "24.32", "M28.48 3.92L45.65 56.78L50.12 55.33L32.95 2.47Z", "M29.43 3.62L46.6 56.47L49.17 55.63L32 2.78Z"],
  ["41.03", "34.93", "M57.61 19.98L12.66 52.64L15.42 56.44L60.37 23.78Z", "M58.2 20.79L13.25 53.45L14.83 55.63L59.78 22.97Z"],
  ["32", "41.49", "M51.34 52.64L6.39 19.98L3.63 23.78L48.58 56.44Z", "M50.75 53.45L5.8 20.79L4.22 22.97L49.17 55.63Z"],
  ["22.97", "34.93", "M18.35 56.78L35.52 3.92L31.05 2.47L13.88 55.33Z", "M17.4 56.47L34.57 3.62L32 2.78L14.83 55.63Z"],
  ["26.42", "24.32", "M4.22 26.67L59.78 26.67L59.78 21.97L4.22 21.97Z", "M4.22 25.67L59.78 25.67L59.78 22.97L4.22 22.97Z"],
];

const weave = (prefix: string): string =>
  WEAVE.map(([cx, cy, under, over], i) => {
    const id = `mk-${prefix}${i}`;
    return `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="4.93"/></clipPath><g clip-path="url(#${id})"><path d="${under}" fill="${PAPER}"/><path d="${over}" fill="${TEAL}"/></g>`;
  }).join("");

const YANG_PATH = "M32 9A23 23 0 0 1 32 55A11.5 11.5 0 0 1 32 32A11.5 11.5 0 0 0 32 9Z";
const RING = `<circle cx="32" cy="32" r="28" fill="none" stroke="${INK}" stroke-width="1.6" opacity=".6"/>`;
const TAIJI_BODY = `<circle cx="32" cy="32" r="23" fill="${NAVY}" stroke="${INK}" stroke-width="1.6"/><path d="${YANG_PATH}" fill="${CREAM}"/><circle cx="32" cy="43.5" r="4.4" fill="${NAVY}"/><circle cx="32" cy="20.5" r="4.4" fill="${CREAM}"/>`;

/** The print kit's 霊力価 flame: outline and inner core, traced (flame_trace.py), 60 of the 64 grid tall, x 17.8 - 46.3. */
const FLAME_OUTER =
  "M35.5 2.0C35.8 0.7 36.6 2.6 37.3 4.2C38.0 5.8 39.3 9.8 39.7 11.6C40.1 13.4 40.1 13.5 39.6 14.9C39.2 16.4 37.4 19.1 37.0 20.3C36.5 21.6 36.8 21.8 37.0 22.6" +
  "C37.3 23.3 37.6 24.0 38.3 25.1C39.1 26.2 40.9 27.7 41.7 29.1C42.5 30.4 42.7 32.6 43.0 33.3C43.3 34.0 43.5 33.7 43.7 33.4C44.0 33.1 44.0 31.7 44.3 31.4" +
  "C44.6 31.2 45.0 31.4 45.3 32.1C45.6 32.8 46.3 34.5 46.2 35.7C46.1 36.8 45.5 38.2 44.8 39.1C44.2 39.9 43.0 40.5 42.3 40.8C41.6 41.1 40.9 40.8 40.5 41.0" +
  "C40.2 41.2 40.1 41.4 40.1 41.8C40.1 42.2 39.9 42.6 40.4 43.4C41.0 44.1 42.5 45.1 43.2 46.2C43.9 47.3 44.4 48.7 44.7 49.9C44.9 51.1 44.9 52.0 44.7 53.2" +
  "C44.4 54.4 44.0 55.9 43.3 57.0C42.6 58.1 41.5 59.1 40.6 59.8C39.7 60.5 39.4 61.0 37.9 61.4C36.4 61.7 33.5 62.2 31.5 62.0C29.6 61.8 28.0 61.3 26.4 60.4" +
  "C24.8 59.6 23.2 58.4 22.0 57.1C20.8 55.8 19.7 54.3 19.0 52.6C18.3 51.0 17.9 48.6 17.8 47.2C17.7 45.8 17.9 45.3 18.2 44.3C18.6 43.3 18.8 42.5 19.7 41.4" +
  "C20.6 40.4 22.5 38.8 23.7 37.9C25.0 37.0 26.3 36.7 27.0 36.1C27.8 35.6 28.1 35.2 28.3 34.6C28.5 33.9 28.9 33.3 28.3 32.3C27.7 31.3 25.3 30.0 24.8 28.5" +
  "C24.2 27.1 24.2 25.4 24.8 23.6C25.5 21.7 26.8 19.4 28.6 17.5C30.4 15.6 34.5 14.9 35.7 12.3C36.8 9.7 35.2 3.3 35.5 2.0Z";
const FLAME_CORE =
  "M33.0 39.6C33.5 40.2 34.4 43.0 34.7 44.1C35.0 45.2 34.5 45.6 34.8 46.4C35.0 47.2 36.0 47.8 36.2 49.0C36.5 50.1 36.7 51.9 36.3 53.2C35.9 54.5 34.9 56.1 34.0 56.9" +
  "C33.1 57.6 32.0 57.8 30.9 57.7C29.8 57.5 28.1 56.7 27.3 55.9C26.5 55.2 26.3 54.2 26.0 53.3C25.8 52.4 25.8 51.5 25.9 50.7C26.1 50.0 26.5 49.3 26.9 48.8" +
  "C27.2 48.3 27.6 48.0 28.1 47.8C28.7 47.6 29.8 47.9 30.3 47.7C30.9 47.5 31.4 47.2 31.7 46.7C32.1 46.2 32.5 45.8 32.6 44.8C32.6 43.9 31.8 41.6 31.9 40.7" +
  "C32.0 39.8 32.6 39.0 33.0 39.6Z";
/** The kit's colours: blue at the tip to cyan at the base, a dark blue outline, a pale core. */
const FLAME = `<linearGradient id="mk-flame-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b62cf"/><stop offset=".5" stop-color="#1690e5"/><stop offset="1" stop-color="#13b8ef"/></linearGradient><path d="${FLAME_OUTER}" fill="url(#mk-flame-g)" stroke="#14508f" stroke-width="2" stroke-linejoin="round"/><path d="${FLAME_CORE}" fill="#dcfbff"/>`;

const SYMBOLS: Record<MarkId, string> = {
  yin: `<clipPath id="mk-tj1"><path clip-rule="evenodd" d="M9 32a23 23 0 1 0 46 0a23 23 0 1 0-46 0 ${YANG_PATH}"/></clipPath>${RING}<g clip-path="url(#mk-tj1)">${TAIJI_BODY}</g>`,
  yang: `<clipPath id="mk-tj2"><path d="${YANG_PATH}"/></clipPath>${RING}<g clip-path="url(#mk-tj2)">${TAIJI_BODY}</g><path d="${YANG_PATH}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`,
  // 空 as printed in the kit: the bare ring crossed by a slash from top right to bottom left (⊘)
  void: `<circle cx="32" cy="32" r="28" fill="none" stroke="${INK}" stroke-width="3.2"/><path d="M51.8 12.2L12.2 51.8" fill="none" stroke="${INK}" stroke-width="3.2"/>`,
  taiji: `${RING}${TAIJI_BODY}`,
  "mana-ring": `<circle cx="32" cy="32" r="19.6" fill="none" stroke="${TEAL}" stroke-width="2.9"/>${BRAID}${weave("wa")}`,
  mana: `${BRAID}${weave("wb")}`,
  hp: `<path d="M32 4L56.25 18L56.25 46L32 60L7.75 46L7.75 18Z" fill="${PAPER}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`,
  atk: `<path d="M32 4L52.5 32L32 60L11.5 32Z" fill="${PAPER}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`,
  flame: FLAME,
  life: `<path d="M32 61C19.3 61 9.5 52.4 9.5 40.6 9.5 32.1 13.6 25.6 18.1 19.4C19.1 25.3 21.3 28.6 24.4 30.2 22.1 20.4 25.4 11.1 34.4 3C33 12.6 38.1 17.9 43 22.6 45.4 18.9 46.4 15.4 46.3 11.6C51.5 18.4 54.5 28.5 54.5 40.6 54.5 52.4 44.7 61 32 61Z" fill="#91c8dc" stroke="${INK}" stroke-width="3.2" stroke-linejoin="round"/><path d="M32 53.5C26 53.5 22 49.6 22 44.2 22 39.4 25 35.6 28.2 31.4C28.6 35.4 29.8 37.6 31.4 38.7 30.6 32.9 32.5 28.2 36.6 23.9C36.2 30.4 40 34.4 41.4 39.4 41.9 41 42 42.7 42 44.2 42 49.6 38 53.5 32 53.5Z" fill="${PAPER}" opacity=".62"/>`,
  phys: `<path d="M15 51C24 41 35 28 47 14L53 11 51 18C39 32 28 45 20 56Z" fill="${INK}"/><path d="M16.1 59.1L26.1 49.1L16.9 39.9L6.9 49.9Z" fill="${INK}"/><path d="M11.14 54.4L4.14 59.4L7.86 64.6L14.86 59.6Z" fill="${INK}"/>`,
  jutsu: `<path d="M39 3 15 35.5H27.5L23.5 61 49 26.5H35.5L39 3Z" fill="${INK}"/>`,
  // the owner cube is the table's own (not in the system): its colour is the owner's (currentColor)
  cube: `<path d="M32 6 56 19 32 32 8 19Z" fill="currentColor"/><path d="M8 19 32 32 32 60 8 47Z" fill="currentColor" opacity=".72"/><path d="M56 19 32 32 32 60 56 47Z" fill="currentColor" opacity=".5"/><path d="M32 6 56 19 56 47 32 60 8 47 8 19Z M8 19 32 32 56 19 M32 32 32 60" fill="none" stroke="#0e0f13" stroke-width="2.4" stroke-linejoin="round"/>`,
};

export const MARKS_ID = "mk-defs";

/** The hidden sprite (not display:none, which would stop the clip paths inside from working). */
export const MARKS_DEFS = `<svg id="${MARKS_ID}" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>${(Object.keys(SYMBOLS) as MarkId[])
  .map((id) => `<symbol id="mk-${id}" viewBox="0 0 64 64">${SYMBOLS[id]}</symbol>`)
  .join("")}</defs></svg>`;

/** Puts the sprite into the page once (every page that draws a card calls it before drawing). */
export const ensureMarks = (doc: Document = document): void => {
  if (doc.getElementById(MARKS_ID) !== null) return;
  doc.body.insertAdjacentHTML("afterbegin", MARKS_DEFS);
};

const escText = (s: string): string =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);

/**
 * One mark. With a label it is an image for screen readers (and a tooltip);
 * without one it is decoration next to text that says the same.
 */
export const mark = (id: MarkId, cls = "", label?: string): string => {
  const a = label === undefined ? ' aria-hidden="true"' : ` role="img" aria-label="${escText(label)}"`;
  const title = label === undefined ? "" : `<title>${escText(label)}</title>`;
  return `<svg class="mk${cls === "" ? "" : ` ${cls}`}" viewBox="0 0 64 64"${a} focusable="false">${title}<use href="#mk-${id}"/></svg>`;
};

/** Flames in a row: one flame's width (the 64 grid's x 16-48) and the step to the next, as in the kit. */
const FLAME_W = 32;
const FLAME_STEP = 38;
const FLAME_X0 = 16;

/**
 * `count` of the kit's flames in one row (1-3; anything else draws one), for
 * 霊力価. Decoration: the caller says the value in words (screen readers,
 * tooltip). Sized by CSS on its height; the width follows from the viewBox.
 */
export const flames = (count: number, cls = ""): string => {
  const n = count >= 1 && count <= 3 ? Math.floor(count) : 1;
  const w = FLAME_W + (n - 1) * FLAME_STEP;
  const uses = Array.from({ length: n }, (_, i) => `<use href="#mk-flame" x="${i * FLAME_STEP - FLAME_X0}" y="0" width="64" height="64"/>`).join("");
  return `<svg class="mk-flames${cls === "" ? "" : ` ${cls}`}" viewBox="0 0 ${w} 64" width="${w}" height="64" aria-hidden="true" focusable="false">${uses}</svg>`;
};

/** The attribute mark of a card, and of a board cell (太極 = both halves, an empty cell = 空's ⊘). */
export const ATTR_MARK_ID: Record<Attr | CellAttr, MarkId> = { yin: "yin", yang: "yang", none: "void", empty: "void", taiji: "taiji" };
