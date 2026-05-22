import type { Board, CellIndex, Direction, RelCoord } from './types.js';

export {
  DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_LEFT,
} from './types.js';

// ============================================================
// セル座標ユーティリティ
// ============================================================

export function cellIdx(row: number, col: number): CellIndex {
  return row * 3 + col;
}

export function cellRow(idx: CellIndex): number {
  return Math.floor(idx / 3);
}

export function cellCol(idx: CellIndex): number {
  return idx % 3;
}

export function isValidCell(row: number, col: number): boolean {
  return row >= 0 && row < 3 && col >= 0 && col < 3;
}

// ============================================================
// 方向変換
// ============================================================
// ローカル座標系: rr+ = キャラ正面, rc+ = キャラ右
// ボード座標系:   dr+ = 下, dc+ = 右
//
// UP    → forward=(-1,0), right=(0,1):  (rr,rc) → (-rr,  rc)
// RIGHT → forward=(0,1),  right=(1,0):  (rr,rc) → ( rc,  rr)
// DOWN  → forward=(1,0),  right=(0,-1): (rr,rc) → ( rr, -rc)
// LEFT  → forward=(0,-1), right=(-1,0): (rr,rc) → (-rc, -rr)

/** JavaScript の -0 を +0 に正規化する */
function z(n: number): number { return n === 0 ? 0 : n; }

export function relToAbs(rr: number, rc: number, dir: Direction): [number, number] {
  switch (dir) {
    case 0: return [z(-rr), z( rc)]; // UP
    case 1: return [z( rc), z( rr)]; // RIGHT
    case 2: return [z( rr), z(-rc)]; // DOWN
    case 3: return [z(-rc), z(-rr)]; // LEFT
  }
}

/** relToAbs の逆変換 */
export function absToRel(dr: number, dc: number, dir: Direction): [number, number] {
  switch (dir) {
    case 0: return [z(-dr), z( dc)]; // UP
    case 1: return [z( dc), z( dr)]; // RIGHT
    case 2: return [z( dr), z(-dc)]; // DOWN
    case 3: return [z(-dc), z(-dr)]; // LEFT
  }
}

// ============================================================
// 隣接セル（縦横のみ、対角不可）
// ============================================================

const ORTHO_DELTAS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];

export function getAdjacentCells(idx: CellIndex): CellIndex[] {
  const r = cellRow(idx);
  const c = cellCol(idx);
  const result: CellIndex[] = [];
  for (const [dr, dc] of ORTHO_DELTAS) {
    const nr = r + dr;
    const nc = c + dc;
    if (isValidCell(nr, nc)) result.push(cellIdx(nr, nc));
  }
  return result;
}

// ============================================================
// B位置（ブラインドスポット）判定
// ============================================================

export function isBlindSpot(
  attackerIdx: CellIndex,
  defenderIdx: CellIndex,
  defenderDir: Direction,
  weaknessCells: RelCoord[],
): boolean {
  if (weaknessCells.length === 0) return false;

  const dr = cellRow(attackerIdx) - cellRow(defenderIdx);
  const dc = cellCol(attackerIdx) - cellCol(defenderIdx);
  const [rr, rc] = absToRel(dr, dc, defenderDir);

  return weaknessCells.some(([wr, wc]) => wr === rr && wc === rc);
}

// ============================================================
// 攻撃可能セル計算
// ============================================================

export function getAttackCells(
  fromIdx: CellIndex,
  attackCells: RelCoord[] | 'all',
  dir: Direction,
): CellIndex[] | null {
  if (attackCells === 'all') return null;

  const fr = cellRow(fromIdx);
  const fc = cellCol(fromIdx);
  const result: CellIndex[] = [];

  for (const [rr, rc] of attackCells) {
    const [dr, dc] = relToAbs(rr, rc, dir);
    const tr = fr + dr;
    const tc = fc + dc;
    if (isValidCell(tr, tc)) result.push(cellIdx(tr, tc));
  }

  return result;
}

// ============================================================
// 召喚可能マス
// ============================================================

export function getValidSummonCells(board: Board, playerIdx: 0 | 1): CellIndex[] {
  const friendlyIndices: CellIndex[] = [];
  for (let i = 0; i < 9; i++) {
    if (board[i]?.owner === playerIdx) friendlyIndices.push(i);
  }

  if (friendlyIndices.length === 0) {
    // 初回召喚: 全空きマス
    return board.reduce<CellIndex[]>((acc, cell, i) => {
      if (cell === null) acc.push(i);
      return acc;
    }, []);
  }

  // 2回目以降: 既存味方の隣接空きマスの和集合
  const valid = new Set<CellIndex>();
  for (const fi of friendlyIndices) {
    for (const adj of getAdjacentCells(fi)) {
      if (board[adj] === null) valid.add(adj);
    }
  }
  return [...valid];
}

// ============================================================
// カバー判定
// ============================================================

export function findCoverAlly(board: Board, targetIdx: CellIndex): CellIndex | null {
  const target = board[targetIdx];
  if (target === null) return null;

  for (const adj of getAdjacentCells(targetIdx)) {
    const ally = board[adj];
    if (ally !== null && ally.owner === target.owner && ally.keywords.includes('カバー')) {
      return adj;
    }
  }
  return null;
}
