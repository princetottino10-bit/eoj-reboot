import { describe, it, expect } from 'vitest';
import { calcCostReduction, countAlliesInBPosition } from '../src/engine/cost.js';
import type { Board, CharInstance } from '../src/engine/types.js';
import type { CharCardDef } from '../src/engine/gamestate.js';
import { DIR_UP, DIR_DOWN, DIR_LEFT, DIR_RIGHT } from '../src/engine/board.js';

// ============================================================
// テストヘルパー
// ============================================================

function makeChar(owner: 0 | 1, opts: Partial<CharInstance> = {}): CharInstance {
  return {
    cardId: 'aggro_v2_01', owner,
    hp: 3, maxHp: 3, atk: 2, baseAtk: 2, dir: DIR_UP,
    hasActed: false, hasRotated: false, ultUsed: false, summonedOnTurn: 0,
    keywords: [],
    markers: { protection: 0, evasion: 0, piercing: 0, quickness: 0, aim: 0 },
    status: { brainwashedTurns: 0, brainwashedBy: null, actionTax: 0, actionTaxBy: null, dirLocked: 0, immune: 0 },
    tempAtkBuff: 0,
    ...opts,
  };
}

function emptyBoard(): Board {
  return Array(9).fill(null) as Board;
}

function makeDef(faction: string, cost = 5, opts: Partial<CharCardDef> = {}): CharCardDef {
  return {
    id: `${faction}_v2_12`, name: 'テスト', faction,
    cost, vp: 3, hp: 5, atk: 4, reactivation_cost: 3,
    attribute: '拳', attack_cells: [[1, 0]], attack_type: '物理',
    keywords: [], effect: '', ult: null,
    ...opts,
  };
}

// ============================================================
// 非コスト5キャラは軽減なし
// ============================================================
describe('calcCostReduction: 非コスト5', () => {
  it('コスト2のカード → 0', () => {
    expect(calcCostReduction(makeDef('aggro', 2), emptyBoard(), 0)).toBe(0);
  });
  it('コスト4のカード → 0', () => {
    expect(calcCostReduction(makeDef('tank', 4), emptyBoard(), 0)).toBe(0);
  });
  it('未知のfaction → 0', () => {
    expect(calcCostReduction(makeDef('unknown', 5), emptyBoard(), 0)).toBe(0);
  });
});

// ============================================================
// aggro: このターン攻撃した味方の数
// ============================================================
describe('calcCostReduction: aggro', () => {
  const def = makeDef('aggro');

  it('攻撃済み味方0体 → 0', () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { hasActed: false });
    board[1] = makeChar(0, { hasActed: false });
    expect(calcCostReduction(def, board, 0)).toBe(0);
  });

  it('攻撃済み味方1体 → 1', () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { hasActed: true });
    board[1] = makeChar(0, { hasActed: false });
    expect(calcCostReduction(def, board, 0)).toBe(1);
  });

  it('攻撃済み味方3体 → 3', () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { hasActed: true });
    board[1] = makeChar(0, { hasActed: true });
    board[2] = makeChar(0, { hasActed: true });
    expect(calcCostReduction(def, board, 0)).toBe(3);
  });

  it('相手の攻撃済みキャラはカウントしない', () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { hasActed: true });
    board[1] = makeChar(1, { hasActed: true }); // 相手
    expect(calcCostReduction(def, board, 0)).toBe(1);
  });

  it('P1視点でP1の攻撃済みをカウント', () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { hasActed: true }); // P0
    board[1] = makeChar(1, { hasActed: true }); // P1
    expect(calcCostReduction(def, board, 1)).toBe(1); // P1の攻撃済みのみ
  });
});

// ============================================================
// tank: カバー持ちで隣接味方がいるキャラの数
// ============================================================
describe('calcCostReduction: tank', () => {
  const def = makeDef('tank');

  it('カバーなし → 0', () => {
    const board = emptyBoard();
    board[0] = makeChar(0);
    board[1] = makeChar(0);
    expect(calcCostReduction(def, board, 0)).toBe(0);
  });

  it('カバー持ちだが隣接味方なし → 0', () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { keywords: ['カバー'] }); // idx=0の隣: 1,3 → 空
    expect(calcCostReduction(def, board, 0)).toBe(0);
  });

  it('カバー持ちで隣接味方1体 → 1', () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { keywords: ['カバー'] });
    board[1] = makeChar(0); // idx=0の隣
    expect(calcCostReduction(def, board, 0)).toBe(1);
  });

  it('カバー2体それぞれ隣接味方あり → 2', () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { keywords: ['カバー'] });
    board[1] = makeChar(0, { keywords: ['カバー'] });
    board[3] = makeChar(0); // idx=0の隣
    // idx=1 の隣: 0,2,4 → board[0]がいる
    expect(calcCostReduction(def, board, 0)).toBe(2);
  });

  it('カバーの隣が敵だけ → 0', () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { keywords: ['カバー'] });
    board[1] = makeChar(1); // 敵
    board[3] = makeChar(1); // 敵
    board[5] = makeChar(1); // 敵
    board[7] = makeChar(1); // 敵
    expect(calcCostReduction(def, board, 0)).toBe(0);
  });
});

// ============================================================
// control: デバフ状態の敵の数
// ============================================================
describe('calcCostReduction: control', () => {
  const def = makeDef('control');

  it('デバフ敵なし → 0', () => {
    const board = emptyBoard();
    board[0] = makeChar(1); // 正常な敵
    expect(calcCostReduction(def, board, 0)).toBe(0);
  });

  it('atk < baseAtk → 1', () => {
    const board = emptyBoard();
    board[0] = makeChar(1, { atk: 1, baseAtk: 2 }); // ATK下げ
    expect(calcCostReduction(def, board, 0)).toBe(1);
  });

  it('actionTax > 0 → 1', () => {
    const board = emptyBoard();
    board[0] = makeChar(1, { status: { brainwashedTurns: 0, brainwashedBy: null, actionTax: 1, actionTaxBy: 'x', dirLocked: 0, immune: 0 } });
    expect(calcCostReduction(def, board, 0)).toBe(1);
  });

  it('brainwashedTurns > 0 → 1', () => {
    const board = emptyBoard();
    board[0] = makeChar(1, { status: { brainwashedTurns: 2, brainwashedBy: 'ctrl', actionTax: 0, actionTaxBy: null, dirLocked: 0, immune: 0 } });
    expect(calcCostReduction(def, board, 0)).toBe(1);
  });

  it('複数デバフ敵 → 合計', () => {
    const board = emptyBoard();
    board[0] = makeChar(1, { atk: 1, baseAtk: 2 });
    board[1] = makeChar(1, { status: { brainwashedTurns: 1, brainwashedBy: 'x', actionTax: 0, actionTaxBy: null, dirLocked: 0, immune: 0 } });
    board[2] = makeChar(1); // 正常
    expect(calcCostReduction(def, board, 0)).toBe(2);
  });

  it('自分側のデバフキャラはカウントしない', () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { atk: 1, baseAtk: 2 }); // 自分側
    expect(calcCostReduction(def, board, 0)).toBe(0);
  });
});

// ============================================================
// synergy: マーカー持ちの味方の数
// ============================================================
describe('calcCostReduction: synergy', () => {
  const def = makeDef('synergy');

  it('マーカーなし → 0', () => {
    const board = emptyBoard();
    board[0] = makeChar(0);
    expect(calcCostReduction(def, board, 0)).toBe(0);
  });

  it('防護マーカー1枚 → 1', () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0, aim: 0 } });
    expect(calcCostReduction(def, board, 0)).toBe(1);
  });

  it('各種マーカー持ち複数味方', () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0, aim: 0 } });
    board[1] = makeChar(0, { markers: { protection: 0, evasion: 1, piercing: 0, quickness: 0, aim: 0 } });
    board[2] = makeChar(0); // マーカーなし
    expect(calcCostReduction(def, board, 0)).toBe(2);
  });

  it('相手のマーカー持ちはカウントしない', () => {
    const board = emptyBoard();
    board[0] = makeChar(1, { markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0, aim: 0 } }); // 敵
    expect(calcCostReduction(def, board, 0)).toBe(0);
  });
});

// ============================================================
// snipe: 照準マーカー（現在未実装 → 常に0）
// ============================================================
describe('calcCostReduction: snipe', () => {
  const def = makeDef('snipe');

  it('aimマーカーなし → 0', () => {
    const board = emptyBoard();
    board[0] = makeChar(1); // aim=0
    expect(calcCostReduction(def, board, 0)).toBe(0);
  });

  it('aimマーカーあり → 1（照準実装後に機能する）', () => {
    const board = emptyBoard();
    board[0] = makeChar(1, { markers: { protection: 0, evasion: 0, piercing: 0, quickness: 0, aim: 1 } });
    expect(calcCostReduction(def, board, 0)).toBe(1);
  });
});

// ============================================================
// trick: 敵のB位置にいる味方の数
// ============================================================
describe('calcCostReduction: trick / countAlliesInBPosition', () => {
  const def = makeDef('trick');

  it('P0がP1(idx=7,DOWN)のB位置(idx=4)にいる → 1', () => {
    const board = emptyBoard();
    // P1 DOWN向き: relToAbs(-1,0,DOWN) = (-1,0) → row-1。idx=7(row=2) → weakness=row=1,col=1=idx=4
    board[4] = makeChar(0, { dir: DIR_DOWN });
    board[7] = makeChar(1, { dir: DIR_DOWN }); // weakness後方=idx=4
    expect(countAlliesInBPosition(board, 0)).toBe(1);
  });

  it('空盤面 → 0', () => {
    expect(calcCostReduction(def, emptyBoard(), 0)).toBe(0);
  });

  it('P0のキャラがP1のweaknessセルにいる → 1', () => {
    const board = emptyBoard();
    // P1 idx=4 UP向き, weakness=[-1,0] → ボード後方（UP方向での後方 = DOWN = idx=7）
    // いや、weakness [-1,0] はローカル座標: rr=-1 = 後方。UP向きの場合 relToAbs(-1,0,UP) = (1,0) → ボード的に row+1
    // P1 idx=4, dir=UP: weakness方向 = ボード idx = 4+3=7
    board[4] = makeChar(1, { dir: DIR_UP }); // P1 UP向き、weakness後方=idx=7
    board[7] = makeChar(0); // P0がidx=7にいる = P1のweakness位置
    expect(countAlliesInBPosition(board, 0)).toBe(1);
  });

  it('複数P0キャラがそれぞれ別の敵のB位置 → 2', () => {
    const board = emptyBoard();
    board[4] = makeChar(1, { dir: DIR_UP }); // weakness=idx=7: relToAbs(-1,0,UP)=(1,0)→row=2,col=1
    board[0] = makeChar(1, { dir: DIR_RIGHT }); // weakness盤外: relToAbs(-1,0,RIGHT)=(0,-1)→col=-1
    // DIR_UP向き idx=2(row=0): relToAbs(-1,0,UP)=(1,0)→row=1,col=2=idx=5
    board[2] = makeChar(1, { dir: DIR_UP }); // weakness=idx=5
    board[7] = makeChar(0, { cardId: 'p0a' }); // P0がP1(idx=4)のB位置
    board[5] = makeChar(0, { cardId: 'p0b' }); // P0がP1(idx=2)のB位置
    expect(countAlliesInBPosition(board, 0)).toBe(2);
  });

  it('trick faction: countAlliesInBPosition を使う', () => {
    const board = emptyBoard();
    board[4] = makeChar(1, { dir: DIR_UP }); // weakness idx=7
    board[7] = makeChar(0); // P0がB位置
    expect(calcCostReduction(def, board, 0)).toBe(1);
  });
});

// ============================================================
// 最低コスト2の確認（呼び出し側での適用）
// ============================================================
describe('effectiveCost = Math.max(2, baseCost - reduction)', () => {
  it('reduction=0 → コスト変わらず', () => {
    const reduction = calcCostReduction(makeDef('aggro'), emptyBoard(), 0);
    expect(Math.max(2, 5 - reduction)).toBe(5);
  });

  it('reduction=3 → コスト2', () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { hasActed: true });
    board[1] = makeChar(0, { hasActed: true });
    board[2] = makeChar(0, { hasActed: true });
    const reduction = calcCostReduction(makeDef('aggro'), board, 0);
    expect(Math.max(2, 5 - reduction)).toBe(2);
  });

  it('reduction=4以上でも最低2', () => {
    // aggro: 4体攻撃済みでも最低コスト2
    const board = emptyBoard();
    for (let i = 0; i < 4; i++) board[i] = makeChar(0, { hasActed: true });
    const reduction = calcCostReduction(makeDef('aggro'), board, 0);
    expect(reduction).toBe(4);
    expect(Math.max(2, 5 - reduction)).toBe(2);
  });
});
