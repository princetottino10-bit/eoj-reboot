import { describe, it, expect } from 'vitest';
import { applyItemEffect } from '../src/engine/items.js';
import type { GameState, CharInstance, PlayerState, Board } from '../src/engine/types.js';

// ============================================================
// テストヘルパー
// ============================================================

function makeChar(owner: 0 | 1, opts: Partial<CharInstance> = {}): CharInstance {
  return {
    cardId: 'aggro_v2_01', owner,
    hp: 3, maxHp: 3, atk: 2, baseAtk: 2, dir: 0,
    hasActed: false, hasRotated: false, ultUsed: false, summonedOnTurn: 0,
    keywords: [],
    markers: { protection: 0, evasion: 0, piercing: 0, quickness: 0, aim: 0 },
    status: { brainwashedTurns: 0, brainwashedBy: null, actionTax: 0, actionTaxBy: null, dirLocked: 0, immune: 0 },
    tempAtkBuff: 0,
    ...opts,
  };
}

function makePlayer(opts: Partial<PlayerState> = {}): PlayerState {
  return { factions: [], itemSet: 'A', vp: 0, mana: 0, hand: [], deck: [], discard: [], ...opts };
}

function makeState(board: Board, opts: Partial<GameState> = {}): GameState {
  return {
    turn: 0, active: 0,
    players: [makePlayer(), makePlayer()],
    board,
    boardAttrs: Array(9).fill('nicht'),
    log: [], winner: null, winReason: '',
    ui: { mode: 'idle', selectedHandIndex: -1, selectedBoardIndex: -1, validCells: [], pendingEffect: null },
    teamDR: [false, false],
    ...opts,
  };
}

// ============================================================
// item_03: HP+3
// ============================================================
describe('item_03: HP+3', () => {
  it('味方のHPが3回復する', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, { hp: 1, maxHp: 5 });
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_03', 4, 0);
    expect(result.board[4]?.hp).toBe(4);
  });

  it('maxHpを超えない', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, { hp: 2, maxHp: 3 });
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_03', 4, 0);
    expect(result.board[4]?.hp).toBe(3);
  });

  it('敵には効果なし', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { hp: 1, maxHp: 5 }); // P1のキャラ
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_03', 4, 0); // P0が使用
    expect(result.board[4]?.hp).toBe(1); // 変化なし
  });
});

// ============================================================
// item_04: このターンATK+2 (tempAtkBuff)
// ============================================================
describe('item_04: このターンATK+2', () => {
  it('tempAtkBuffが+2される', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, { atk: 3, tempAtkBuff: 0 });
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_04', 4, 0);
    expect(result.board[4]?.tempAtkBuff).toBe(2);
  });

  it('atkは変わらない（tempAtkBuffだけ変更）', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, { atk: 3, tempAtkBuff: 0 });
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_04', 4, 0);
    expect(result.board[4]?.atk).toBe(3); // atkは不変
    expect(result.board[4]?.tempAtkBuff).toBe(2); // tempAtkBuffが+2
  });

  it('既存のtempAtkBuffに累積する', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, { atk: 3, tempAtkBuff: 1 });
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_04', 4, 0);
    expect(result.board[4]?.tempAtkBuff).toBe(3);
  });

  it('敵には効果なし', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { atk: 3 }); // P1
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_04', 4, 0); // P0が使用
    expect(result.board[4]?.tempAtkBuff).toBe(0);
  });
});

// ============================================================
// item_grant_piercing: 貫通マーカー
// ============================================================
describe('item_grant_piercing: 貫通マーカー付与', () => {
  it('味方に貫通マーカーを付与', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_grant_piercing', 4, 0);
    expect(result.board[4]?.markers.piercing).toBe(1);
  });

  it('既存の貫通マーカーに積み重なる', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, { markers: { protection: 0, evasion: 0, piercing: 2, quickness: 0, aim: 0 } });
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_grant_piercing', 4, 0);
    expect(result.board[4]?.markers.piercing).toBe(3);
  });
});

// ============================================================
// item_grant_protection: 防護マーカー
// ============================================================
describe('item_grant_protection: 防護マーカー付与', () => {
  it('味方に防護マーカーを付与', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_grant_protection', 4, 0);
    expect(result.board[4]?.markers.protection).toBe(1);
  });
});

// ============================================================
// item_reactivate: 再行動可能
// ============================================================
describe('item_reactivate: 再行動可能', () => {
  it('hasActedをfalseにする', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, { hasActed: true });
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_reactivate', 4, 0);
    expect(result.board[4]?.hasActed).toBe(false);
  });

  it('敵には効果なし', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { hasActed: true });
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_reactivate', 4, 0);
    expect(result.board[4]?.hasActed).toBe(true);
  });
});

// ============================================================
// item_self_bounce: 味方を手札に戻す
// ============================================================
describe('item_self_bounce: 手札に戻す', () => {
  it('盤面から取り除き手札に追加', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, { cardId: 'aggro_v2_01' });
    const state = makeState(board, { players: [makePlayer({ hand: [] }), makePlayer()] });
    const result = applyItemEffect(state, 'item_self_bounce', 4, 0);
    expect(result.board[4]).toBeNull();
    expect(result.players[0].hand).toContain('aggro_v2_01');
  });

  it('敵には効果なし（盤面から取り除かない）', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { cardId: 'aggro_v2_01' }); // P1のキャラ
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_self_bounce', 4, 0);
    expect(result.board[4]).not.toBeNull();
  });
});

// ============================================================
// item_05: 敵ATK-2
// ============================================================
describe('item_05: 敵ATK-2', () => {
  it('敵のATKを2下げる', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { atk: 4 }); // P1の敵
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_05', 4, 0);
    expect(result.board[4]?.atk).toBe(2);
  });

  it('ATKが0未満にならない', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { atk: 1 });
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_05', 4, 0);
    expect(result.board[4]?.atk).toBe(0);
  });

  it('味方には効果なし', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, { atk: 4 }); // P0の味方
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_05', 4, 0);
    expect(result.board[4]?.atk).toBe(4);
  });
});

// ============================================================
// item_06: 敵に2ダメ
// ============================================================
describe('item_06: 敵に2ダメ', () => {
  it('敵に2ダメージ', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { hp: 5, maxHp: 5 });
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_06', 4, 0);
    expect(result.board[4]?.hp).toBe(3);
  });

  it('撃破時にVP獲得とclearAffiliatedEffects', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { hp: 2, maxHp: 2, cardId: 'control_v2_01' });
    // 洗脳付与者として登録
    board[1] = makeChar(0, { status: { brainwashedTurns: 2, brainwashedBy: 'control_v2_01', actionTax: 0, actionTaxBy: null, dirLocked: 0, immune: 0 } });
    const state = makeState(board, { players: [makePlayer({ vp: 0 }), makePlayer()] });
    const result = applyItemEffect(state, 'item_06', 4, 0);
    expect(result.board[4]).toBeNull(); // 撃破
    expect(result.players[0].vp).toBe(1); // VP獲得
    expect(result.board[1]?.status.brainwashedTurns).toBe(0); // 効果クリア
    expect(result.board[1]?.status.brainwashedBy).toBeNull();
  });

  it('味方には効果なし', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, { hp: 5 });
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_06', 4, 0);
    expect(result.board[4]?.hp).toBe(5);
  });
});

// ============================================================
// item_14: 180°回転・向き固定
// ============================================================
describe('item_14: 180°回転・向き固定1ターン', () => {
  it('敵を180°回転させて向き固定', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { dir: 0 }); // UP向き
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_14', 4, 0);
    expect(result.board[4]?.dir).toBe(2); // DOWN向き
    expect(result.board[4]?.status.dirLocked).toBe(1);
  });
});

// ============================================================
// item_20: 90°回転
// ============================================================
describe('item_20: 敵を90°回転', () => {
  it('敵を90°右回転', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { dir: 0 }); // UP → RIGHT
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_20', 4, 0);
    expect(result.board[4]?.dir).toBe(1); // RIGHT
  });
});

// ============================================================
// item_bounce_enemy: 相手手札に戻す
// ============================================================
describe('item_bounce_enemy: 相手手札に戻す', () => {
  it('敵を相手の手札に戻す', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { cardId: 'aggro_v2_01' });
    const state = makeState(board, { players: [makePlayer(), makePlayer({ hand: [] })] });
    const result = applyItemEffect(state, 'item_bounce_enemy', 4, 0);
    expect(result.board[4]).toBeNull();
    expect(result.players[1].hand).toContain('aggro_v2_01');
  });

  it('味方には効果なし', () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, { cardId: 'aggro_v2_01' });
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_bounce_enemy', 4, 0);
    expect(result.board[4]).not.toBeNull();
  });
});

// ============================================================
// item_01: 2枚ドロー（即時）
// ============================================================
describe('item_01: 2枚ドロー', () => {
  it('デッキから2枚引いて手札に加える', () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board, {
      players: [makePlayer({ deck: ['aggro_v2_01', 'tank_v2_01'], hand: [] }), makePlayer()],
    });
    const result = applyItemEffect(state, 'item_01', undefined, 0);
    expect(result.players[0].hand.length).toBe(2);
    expect(result.players[0].deck.length).toBe(0);
  });

  it('デッキが1枚なら1枚だけドロー', () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board, {
      players: [makePlayer({ deck: ['aggro_v2_01'], hand: [] }), makePlayer()],
    });
    const result = applyItemEffect(state, 'item_01', undefined, 0);
    expect(result.players[0].hand.length).toBe(1);
    expect(result.players[0].deck.length).toBe(0);
  });

  it('マナは変化しない', () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board, {
      players: [makePlayer({ deck: ['aggro_v2_01', 'tank_v2_01'], mana: 3 }), makePlayer()],
    });
    const result = applyItemEffect(state, 'item_01', undefined, 0);
    expect(result.players[0].mana).toBe(3);
  });
});

// ============================================================
// item_02: マナ+1（即時）
// ============================================================
describe('item_02: マナ+1', () => {
  it('使用者のマナが1増える', () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board, { players: [makePlayer({ mana: 2 }), makePlayer()] });
    const result = applyItemEffect(state, 'item_02', undefined, 0);
    expect(result.players[0].mana).toBe(3);
  });

  it('相手のマナは変わらない', () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board, { players: [makePlayer({ mana: 0 }), makePlayer({ mana: 5 })] });
    const result = applyItemEffect(state, 'item_02', undefined, 0);
    expect(result.players[1].mana).toBe(5);
  });
});

// ============================================================
// 未実装アイテム
// ============================================================
describe('未実装アイテム', () => {
  it('不明なitemIdはログを残して状態を返す', () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board);
    const result = applyItemEffect(state, 'item_unknown', undefined, 0);
    expect(result.log.length).toBeGreaterThan(0);
  });
});
