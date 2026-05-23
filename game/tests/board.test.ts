import { describe, it, expect } from 'vitest';
import {
  cellIdx, cellRow, cellCol, isValidCell,
  relToAbs, absToRel,
  getAdjacentCells,
  isBlindSpot,
  getAttackCells,
  getValidSummonCells,
  findCoverAlly,
  DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_LEFT,
} from '../src/engine/board.js';
import type { Board, Direction, RelCoord } from '../src/engine/types.js';

// ============================================================
// セル座標変換
// ============================================================
describe('cellIdx / cellRow / cellCol', () => {
  it('左上は index 0', () => expect(cellIdx(0, 0)).toBe(0));
  it('右下は index 8', () => expect(cellIdx(2, 2)).toBe(8));
  it('中央は index 4', () => expect(cellIdx(1, 1)).toBe(4));
  it('cellRow(7) = 2', () => expect(cellRow(7)).toBe(2));
  it('cellCol(5) = 2', () => expect(cellCol(5)).toBe(2));
  it('isValidCell: 範囲内', () => expect(isValidCell(0, 0)).toBe(true));
  it('isValidCell: 範囲外（行）', () => expect(isValidCell(3, 0)).toBe(false));
  it('isValidCell: 範囲外（列）', () => expect(isValidCell(0, -1)).toBe(false));
});

// ============================================================
// 方向変換: relToAbs / absToRel
// ============================================================
// ローカル座標系: rr+ = キャラの正面, rc+ = キャラの右
// ボード座標系:   dr+ = 下方向, dc+ = 右方向
describe('relToAbs', () => {
  it('UP向き: 正面 [1,0] → ボード上(-1,0)', () => {
    expect(relToAbs(1, 0, DIR_UP)).toEqual([-1, 0]);
  });
  it('UP向き: 右 [0,1] → ボード右(0,1)', () => {
    expect(relToAbs(0, 1, DIR_UP)).toEqual([0, 1]);
  });
  it('UP向き: 後方 [-1,0] → ボード下(1,0)', () => {
    expect(relToAbs(-1, 0, DIR_UP)).toEqual([1, 0]);
  });
  it('UP向き: 左 [0,-1] → ボード左(0,-1)', () => {
    expect(relToAbs(0, -1, DIR_UP)).toEqual([0, -1]);
  });

  it('RIGHT向き: 正面 [1,0] → ボード右(0,1)', () => {
    expect(relToAbs(1, 0, DIR_RIGHT)).toEqual([0, 1]);
  });
  it('RIGHT向き: 右 [0,1] → ボード下(1,0)', () => {
    expect(relToAbs(0, 1, DIR_RIGHT)).toEqual([1, 0]);
  });
  it('RIGHT向き: 後方 [-1,0] → ボード左(0,-1)', () => {
    expect(relToAbs(-1, 0, DIR_RIGHT)).toEqual([0, -1]);
  });

  it('DOWN向き: 正面 [1,0] → ボード下(1,0)', () => {
    expect(relToAbs(1, 0, DIR_DOWN)).toEqual([1, 0]);
  });
  it('DOWN向き: 右 [0,1] → ボード左(0,-1) （下向き時の右はスクリーン左）', () => {
    expect(relToAbs(0, 1, DIR_DOWN)).toEqual([0, -1]);
  });
  it('DOWN向き: 後方 [-1,0] → ボード上(-1,0)', () => {
    expect(relToAbs(-1, 0, DIR_DOWN)).toEqual([-1, 0]);
  });

  it('LEFT向き: 正面 [1,0] → ボード左(0,-1)', () => {
    expect(relToAbs(1, 0, DIR_LEFT)).toEqual([0, -1]);
  });
  it('LEFT向き: 右 [0,1] → ボード上(-1,0)', () => {
    expect(relToAbs(0, 1, DIR_LEFT)).toEqual([-1, 0]);
  });
  it('LEFT向き: 後方 [-1,0] → ボード右(0,1)', () => {
    expect(relToAbs(-1, 0, DIR_LEFT)).toEqual([0, 1]);
  });
});

describe('absToRel (relToAbs の逆変換)', () => {
  const dirs: Direction[] = [DIR_UP, DIR_RIGHT, DIR_DOWN, DIR_LEFT];
  const cases: RelCoord[] = [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,-1]];
  for (const dir of dirs) {
    for (const [rr, rc] of cases) {
      it(`dir=${dir} (${rr},${rc}) の往復変換が恒等`, () => {
        const [dr, dc] = relToAbs(rr, rc, dir);
        expect(absToRel(dr, dc, dir)).toEqual([rr, rc]);
      });
    }
  }
});

// ============================================================
// 隣接セル（縦横のみ）
// ============================================================
describe('getAdjacentCells', () => {
  it('左上コーナー(0): 右と下のみ', () => {
    expect(getAdjacentCells(0).sort((a,b)=>a-b)).toEqual([1, 3]);
  });
  it('中央(4): 上下左右の4マス', () => {
    expect(getAdjacentCells(4).sort((a,b)=>a-b)).toEqual([1, 3, 5, 7]);
  });
  it('上辺中央(1): 左右と下の3マス', () => {
    expect(getAdjacentCells(1).sort((a,b)=>a-b)).toEqual([0, 2, 4]);
  });
  it('右下コーナー(8): 左と上のみ', () => {
    expect(getAdjacentCells(8).sort((a,b)=>a-b)).toEqual([5, 7]);
  });
});

// ============================================================
// B位置（ブラインドスポット）判定
// ============================================================
// デフォルト weakness_cells = [[-1,0]] (真後ろ)
// 例: UP向きキャラの真後ろ = ボード上では自分の下
describe('isBlindSpot', () => {
  // 防衛者: index 4 (row=1,col=1), UP向き
  // weakness [[-1,0]] → ローカル後方 = ボード(2,1) = index 7
  const defIdx = 4;
  const defDir = DIR_UP;
  const defaultWeak: RelCoord[] = [[-1, 0]];

  it('真後ろ(index 7)からの攻撃 → B位置', () => {
    expect(isBlindSpot(7, defIdx, defDir, defaultWeak)).toBe(true);
  });
  it('正面(index 1)からの攻撃 → B位置でない', () => {
    expect(isBlindSpot(1, defIdx, defDir, defaultWeak)).toBe(false);
  });
  it('左(index 3)からの攻撃 → B位置でない', () => {
    expect(isBlindSpot(3, defIdx, defDir, defaultWeak)).toBe(false);
  });
  it('右(index 5)からの攻撃 → B位置でない', () => {
    expect(isBlindSpot(5, defIdx, defDir, defaultWeak)).toBe(false);
  });

  // DOWN向きキャラの真後ろ = ボード上では自分の上
  it('DOWN向き: 上(index 1)からの攻撃 → B位置', () => {
    expect(isBlindSpot(1, defIdx, DIR_DOWN, defaultWeak)).toBe(true);
  });
  it('DOWN向き: 下(index 7)からの攻撃 → B位置でない', () => {
    expect(isBlindSpot(7, defIdx, DIR_DOWN, defaultWeak)).toBe(false);
  });

  // 不動のナギサ: weakness_cells = [] (死角なし)
  it('weakness_cells=[] → どこからでもB位置でない', () => {
    expect(isBlindSpot(7, defIdx, DIR_UP, [])).toBe(false);
    expect(isBlindSpot(1, defIdx, DIR_UP, [])).toBe(false);
  });

  // 魔法系キャラ: weakness_cells = 全8方向 → どこからでもB位置
  const allWeak: RelCoord[] = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  it('魔法系(全方向weakness): 正面からでもB位置', () => {
    expect(isBlindSpot(1, defIdx, DIR_UP, allWeak)).toBe(true);
  });
  it('魔法系(全方向weakness): 横からもB位置', () => {
    expect(isBlindSpot(3, defIdx, DIR_UP, allWeak)).toBe(true);
  });
  it('魔法系(全方向weakness): 後ろからもB位置', () => {
    expect(isBlindSpot(7, defIdx, DIR_UP, allWeak)).toBe(true);
  });
});

// ============================================================
// 攻撃可能セル
// ============================================================
describe('getAttackCells', () => {
  it('UP向き: 正面1マス([[1,0]]) → index 1', () => {
    expect(getAttackCells(4, [[1, 0]], DIR_UP)).toEqual([cellIdx(0, 1)]);
  });
  it('DOWN向き: 正面1マス([[1,0]]) → index 7', () => {
    expect(getAttackCells(4, [[1, 0]], DIR_DOWN)).toEqual([cellIdx(2, 1)]);
  });
  it('RIGHT向き: 正面1マス[[1,0]] → index 5', () => {
    expect(getAttackCells(4, [[1, 0]], DIR_RIGHT)).toEqual([cellIdx(1, 2)]);
  });

  // 前列攻撃 (前方3マス横一列)
  it('UP向き: 前列([[1,-1],[1,0],[1,1]]) → row=0の3マス', () => {
    const result = getAttackCells(4, [[1,-1],[1,0],[1,1]], DIR_UP)!.sort((a,b)=>a-b);
    expect(result).toEqual([0, 1, 2]);
  });

  // 十字攻撃
  it('UP向き: 十字([[1,0],[-1,0],[0,1],[0,-1]]) → 4マス', () => {
    const result = getAttackCells(4, [[1,0],[-1,0],[0,1],[0,-1]], DIR_UP)!.sort((a,b)=>a-b);
    expect(result).toEqual([1, 3, 5, 7]);
  });

  // 2マス前方 (直線2)
  it('UP向き: 直線2([[1,0],[2,0]]) → index 1, 0... index 1がrow=0なのでrow=-1はスキップ', () => {
    // fromIdx=4, UP向き: [1,0]→(0,1)=idx1, [2,0]→(-1,1)→盤外
    const result = getAttackCells(4, [[1,0],[2,0]], DIR_UP)!.sort((a,b)=>a-b);
    expect(result).toEqual([1]); // (−1,1)は盤外なのでスキップ
  });
  it('DOWN向き: 直線2([[1,0],[2,0]]) → index 7は有効、index 10は盤外', () => {
    // fromIdx=4, DOWN向き: [1,0]→(2,1)=idx7, [2,0]→(3,1)→盤外
    const result = getAttackCells(4, [[1,0],[2,0]], DIR_DOWN)!;
    expect(result).toEqual([7]);
  });

  // 角からの攻撃で盤外はスキップ
  it('角のキャラ(index 0)がUP向き正面攻撃 → 盤外なので空配列', () => {
    expect(getAttackCells(0, [[1, 0]], DIR_UP)).toEqual([]);
  });

  // 全域魔法は null を返す
  it('"all" 攻撃範囲は null を返す', () => {
    expect(getAttackCells(4, 'all', DIR_UP)).toBeNull();
  });
});

// ============================================================
// 召喚可能マス
// ============================================================
describe('getValidSummonCells', () => {
  const emptyBoard: Board = Array(9).fill(null);

  it('味方が0体のとき: 全空きマスが有効', () => {
    const valid = getValidSummonCells(emptyBoard, 0).sort((a,b)=>a-b);
    expect(valid).toEqual([0,1,2,3,4,5,6,7,8]);
  });

  it('味方が中央(4)にいるとき: 隣接する空きマスのみ', () => {
    const board: Board = Array(9).fill(null);
    board[4] = { owner: 0 } as any;
    expect(getValidSummonCells(board, 0).sort((a,b)=>a-b)).toEqual([1, 3, 5, 7]);
  });

  it('コーナー(0)に味方がいるとき: 隣接する空きマスのみ', () => {
    const board: Board = Array(9).fill(null);
    board[0] = { owner: 0 } as any;
    expect(getValidSummonCells(board, 0).sort((a,b)=>a-b)).toEqual([1, 3]);
  });

  it('味方が2体いるとき: 両方の隣接空きマスの和集合', () => {
    const board: Board = Array(9).fill(null);
    board[0] = { owner: 0 } as any;
    board[1] = { owner: 0 } as any;
    // index 0 の隣: 1(occupied), 3
    // index 1 の隣: 0(occupied), 2, 4
    expect(getValidSummonCells(board, 0).sort((a,b)=>a-b)).toEqual([2, 3, 4]);
  });

  it('敵キャラで占有されたマスは召喚不可', () => {
    const board: Board = Array(9).fill(null);
    board[4] = { owner: 0 } as any;
    board[1] = { owner: 1 } as any; // 敵
    expect(getValidSummonCells(board, 0).sort((a,b)=>a-b)).toEqual([3, 5, 7]);
  });

  it('自分のターゲット: P1=0, P2=1 で別々に判定', () => {
    const board: Board = Array(9).fill(null);
    board[0] = { owner: 1 } as any; // P2の味方
    expect(getValidSummonCells(board, 1).sort((a,b)=>a-b)).toEqual([1, 3]);
    expect(getValidSummonCells(board, 0).sort((a,b)=>a-b)).toEqual([1,2,3,4,5,6,7,8]);
  });
});

// ============================================================
// カバー判定
// ============================================================
describe('findCoverAlly', () => {
  it('カバー持ちの隣接味方がいる → そのインデックスを返す', () => {
    const board: Board = Array(9).fill(null);
    board[4] = { owner: 0, keywords: [] } as any;
    board[3] = { owner: 0, keywords: ['カバー'] } as any;
    expect(findCoverAlly(board, 4)).toBe(3);
  });

  it('カバー持ちがいない → null', () => {
    const board: Board = Array(9).fill(null);
    board[4] = { owner: 0, keywords: [] } as any;
    board[3] = { owner: 0, keywords: [] } as any;
    expect(findCoverAlly(board, 4)).toBeNull();
  });

  it('敵のカバーは無効（同オーナーのみ有効）', () => {
    const board: Board = Array(9).fill(null);
    board[4] = { owner: 0, keywords: [] } as any;
    board[3] = { owner: 1, keywords: ['カバー'] } as any;
    expect(findCoverAlly(board, 4)).toBeNull();
  });

  it('対角のカバーは無効（縦横隣接のみ）', () => {
    const board: Board = Array(9).fill(null);
    board[4] = { owner: 0, keywords: [] } as any;
    board[0] = { owner: 0, keywords: ['カバー'] } as any; // 斜め → 非隣接
    expect(findCoverAlly(board, 4)).toBeNull();
  });

  it('カバー役が複数いる場合は最初に見つかったものを返す', () => {
    const board: Board = Array(9).fill(null);
    board[4] = { owner: 0, keywords: [] } as any;
    board[1] = { owner: 0, keywords: ['カバー'] } as any;
    board[3] = { owner: 0, keywords: ['カバー'] } as any;
    const result = findCoverAlly(board, 4);
    expect([1, 3]).toContain(result);
  });
});
