import type { Attr, CellAttr, Facing, Pos } from "./types.ts";

export const BOARD_W = 3;
export const BOARD_H = 3;
export const TAIJI: Pos = { x: 1, y: 1 };

export const inBoard = (p: Pos): boolean =>
  p.x >= 0 && p.x < BOARD_W && p.y >= 0 && p.y < BOARD_H;

export const posEq = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;
export const posKey = (p: Pos): string => `${p.x},${p.y}`;

export const allCells = (): Pos[] => {
  const out: Pos[] = [];
  for (let y = 0; y < BOARD_H; y++) for (let x = 0; x < BOARD_W; x++) out.push({ x, y });
  return out;
};

/**
 * Rotate a relative cell (forward = +y at facing 0) by `facing` 90-degree
 * clockwise steps.
 *   facing 0 (north): (x, y) -> ( x,  y)
 *   facing 1 (east):  (x, y) -> ( y, -x)
 *   facing 2 (south): (x, y) -> (-x, -y)
 *   facing 3 (west):  (x, y) -> (-y,  x)
 */
/** Normalises -0 to 0 so deep-equality on coordinates behaves. */
const nz = (v: number): number => v + 0;

export const rotateRel = (c: Pos, facing: Facing): Pos => {
  switch (facing) {
    case 0:
      return { x: nz(c.x), y: nz(c.y) };
    case 1:
      return { x: nz(c.y), y: nz(-c.x) };
    case 2:
      return { x: nz(-c.x), y: nz(-c.y) };
    default:
      return { x: nz(-c.y), y: nz(c.x) };
  }
};

/** Relative cells -> absolute board cells, clipped to the board. */
export const toBoardCells = (
  relCells: readonly Pos[],
  pos: Pos,
  facing: Facing,
): Pos[] => {
  const out: Pos[] = [];
  for (const c of relCells) {
    const r = rotateRel(c, facing);
    const abs = { x: pos.x + r.x, y: pos.y + r.y };
    if (inBoard(abs)) out.push(abs);
  }
  return out;
};

export const turnFacing = (facing: Facing, dir: 1 | -1): Facing =>
  (((facing + dir) % 4) + 4) % 4 as Facing;

/**
 * Fixed board attributes:
 *   (0,2)empty (1,2)yin   (2,2)empty
 *   (0,1)yin   (1,1)taiji (2,1)yang
 *   (0,0)empty (1,0)yang  (2,0)empty
 */
export const cellAttr = (p: Pos): CellAttr => {
  if (p.x === 1 && p.y === 1) return "taiji";
  if (p.x === 1 && p.y === 2) return "yin";
  if (p.x === 0 && p.y === 1) return "yin";
  if (p.x === 2 && p.y === 1) return "yang";
  if (p.x === 1 && p.y === 0) return "yang";
  return "empty";
};

export const isTaiji = (p: Pos): boolean => cellAttr(p) === "taiji";

/** +bonus on matching attribute cell, -bonus on the opposing one, else 0. */
export const attrMod = (p: Pos, attribute: Attr, bonus: number): number => {
  if (attribute === "none") return 0;
  const ca = cellAttr(p);
  if (ca === "taiji" || ca === "empty") return 0;
  return ca === attribute ? bonus : -bonus;
};

/** Effective max HP at a position: min(cap, baseHp + attrMod). */
export const effMaxHp = (
  baseHp: number,
  p: Pos,
  attribute: Attr,
  attrBonus: number,
  maxHp: number,
): number => Math.min(maxHp, baseHp + attrMod(p, attribute, attrBonus));
