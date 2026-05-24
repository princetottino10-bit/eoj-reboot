import { describe, it, expect } from 'vitest';
import { startTurnPhase, drawStep, endTurnCleanup, spendReactivationMana, HAND_LIMIT } from '../src/engine/turn.js';
import type { GameState, PlayerState, CharInstance } from '../src/engine/types.js';

// ============================================================
// テストヘルパー
// ============================================================

function makePlayer(opts: Partial<PlayerState> = {}): PlayerState {
  return { factions: [], itemSet: 'A', vp: 0, mana: 0, hand: [], deck: [], discard: [], ...opts };
}

function makeChar(owner: 0 | 1, opts: Partial<CharInstance> = {}): CharInstance {
  return {
    cardId: 'test_v2_01', owner,
    hp: 3, maxHp: 3, atk: 2, baseAtk: 2, dir: 0,
    hasActed: false, hasRotated: false, ultUsed: false, summonedOnTurn: 0,
    keywords: [],
    markers: { protection: 0, evasion: 0, piercing: 0, quickness: 0, aim: 0 },
    status: { brainwashedTurns: 0, brainwashedBy: null, actionTax: 0, actionTaxBy: null, dirLocked: 0, immune: 0 },
    tempAtkBuff: 0,
    ...opts,
  };
}

function makeState(opts: Partial<GameState> = {}): GameState {
  return {
    turn: 0, active: 0,
    players: [makePlayer(), makePlayer()],
    board: Array(9).fill(null),
    boardAttrs: Array(9).fill('nicht'),
    log: [], winner: null, winReason: '',
    ui: { mode: 'idle', selectedHandIndex: -1, selectedBoardIndex: -1, validCells: [], pendingEffect: null },
    teamDR: [false, false],
    ...opts,
  };
}

// ============================================================
// 定数
// ============================================================
describe('定数', () => {
  it('HAND_LIMIT = 7', () => { expect(HAND_LIMIT).toBe(7); });
});

// ============================================================
// startTurnPhase
// ============================================================
describe('startTurnPhase: フラグリセット', () => {
  it('現在プレイヤーの hasActed をリセット', () => {
    const board = Array(9).fill(null);
    board[0] = makeChar(0, { hasActed: true });
    const next = startTurnPhase(makeState({ board }));
    expect(next.board[0]?.hasActed).toBe(false);
  });

  it('現在プレイヤーの hasRotated をリセット', () => {
    const board = Array(9).fill(null);
    board[0] = makeChar(0, { hasRotated: true });
    const next = startTurnPhase(makeState({ board }));
    expect(next.board[0]?.hasRotated).toBe(false);
  });

  it('相手のキャラのフラグはリセットしない（active=0, P1のキャラ）', () => {
    const board = Array(9).fill(null);
    board[1] = makeChar(1, { hasActed: true, hasRotated: true });
    const next = startTurnPhase(makeState({ board, active: 0 }));
    expect(next.board[1]?.hasActed).toBe(true);
    expect(next.board[1]?.hasRotated).toBe(true);
  });
});

describe('startTurnPhase: ステータス効果のtick（現プレイヤーのキャラのみ）', () => {
  it('洗脳ターン数を1減算', () => {
    const board = Array(9).fill(null);
    board[0] = makeChar(0, {
      status: { brainwashedTurns: 2, brainwashedBy: 'ctrl_v2_01', actionTax: 0, actionTaxBy: null, dirLocked: 0, immune: 0 },
    });
    const next = startTurnPhase(makeState({ board, active: 0 }));
    expect(next.board[0]?.status.brainwashedTurns).toBe(1);
  });

  it('洗脳が1→0になったら brainwashedBy をクリア', () => {
    const board = Array(9).fill(null);
    board[0] = makeChar(0, {
      status: { brainwashedTurns: 1, brainwashedBy: 'ctrl_v2_01', actionTax: 0, actionTaxBy: null, dirLocked: 0, immune: 0 },
    });
    const next = startTurnPhase(makeState({ board, active: 0 }));
    expect(next.board[0]?.status.brainwashedTurns).toBe(0);
    expect(next.board[0]?.status.brainwashedBy).toBeNull();
  });

  it('向き固定ターン数を1減算', () => {
    const board = Array(9).fill(null);
    board[0] = makeChar(0, {
      status: { brainwashedTurns: 0, brainwashedBy: null, actionTax: 0, actionTaxBy: null, dirLocked: 3, immune: 0 },
    });
    const next = startTurnPhase(makeState({ board, active: 0 }));
    expect(next.board[0]?.status.dirLocked).toBe(2);
  });

  it('immune ターン数を1減算', () => {
    const board = Array(9).fill(null);
    board[0] = makeChar(0, {
      status: { brainwashedTurns: 0, brainwashedBy: null, actionTax: 0, actionTaxBy: null, dirLocked: 0, immune: 2 },
    });
    const next = startTurnPhase(makeState({ board, active: 0 }));
    expect(next.board[0]?.status.immune).toBe(1);
  });

  it('既に0の値は減算しない（負にならない）', () => {
    const board = Array(9).fill(null);
    board[0] = makeChar(0); // all status = 0
    const next = startTurnPhase(makeState({ board, active: 0 }));
    const s = next.board[0]?.status;
    expect(s?.brainwashedTurns).toBe(0);
    expect(s?.dirLocked).toBe(0);
    expect(s?.immune).toBe(0);
  });

  it('相手のキャラのステータスはtickしない', () => {
    const board = Array(9).fill(null);
    board[1] = makeChar(1, {
      status: { brainwashedTurns: 3, brainwashedBy: 'ctrl_v2_01', actionTax: 0, actionTaxBy: null, dirLocked: 2, immune: 1 },
    });
    const next = startTurnPhase(makeState({ board, active: 0 }));
    const s = next.board[1]?.status;
    expect(s?.brainwashedTurns).toBe(3);
    expect(s?.dirLocked).toBe(2);
    expect(s?.immune).toBe(1);
  });
});

describe('startTurnPhase: immutability', () => {
  it('元のstateを変更しない', () => {
    const board = Array(9).fill(null);
    board[0] = makeChar(0, { hasActed: true });
    const original = makeState({ board });
    startTurnPhase(original);
    expect(original.board[0]?.hasActed).toBe(true);
  });
});

// ============================================================
// drawStep
// ============================================================
describe('drawStep', () => {
  it('現在プレイヤーのマナが+2', () => {
    const state = makeState({ players: [makePlayer({ mana: 3 }), makePlayer()] });
    const next = drawStep(state);
    expect(next.players[0].mana).toBe(5);
  });

  it('相手のマナは変わらない', () => {
    const state = makeState({ players: [makePlayer({ mana: 3 }), makePlayer({ mana: 2 })] });
    const next = drawStep(state);
    expect(next.players[1].mana).toBe(2);
  });

  it('デッキのトップカードを手札に加える', () => {
    const state = makeState({
      players: [makePlayer({ deck: ['card_a', 'card_b', 'card_top'] }), makePlayer()],
    });
    const next = drawStep(state);
    expect(next.players[0].hand).toContain('card_top');
    expect(next.players[0].deck).toHaveLength(2);
    expect(next.players[0].deck).not.toContain('card_top');
  });

  it('デッキが空の場合はドローしない', () => {
    const state = makeState({ players: [makePlayer({ deck: [] }), makePlayer()] });
    const next = drawStep(state);
    expect(next.players[0].hand).toHaveLength(0);
  });

  it('P1のターンの場合はP1がドロー', () => {
    const state = makeState({
      active: 1,
      players: [makePlayer(), makePlayer({ deck: ['card_x'] })],
    });
    const next = drawStep(state);
    expect(next.players[1].hand).toContain('card_x');
    expect(next.players[0].hand).toHaveLength(0);
  });

  it('マナ0からでも正しく+2', () => {
    const state = makeState({ players: [makePlayer({ mana: 0 }), makePlayer()] });
    const next = drawStep(state);
    expect(next.players[0].mana).toBe(2);
  });
});

// ============================================================
// endTurnCleanup
// ============================================================
describe('endTurnCleanup: プレイヤー切替', () => {
  it('P0→P1に切り替わる', () => {
    expect(endTurnCleanup(makeState({ active: 0 })).active).toBe(1);
  });
  it('P1→P0に切り替わる', () => {
    expect(endTurnCleanup(makeState({ active: 1 })).active).toBe(0);
  });
});

describe('endTurnCleanup: ターン数', () => {
  it('ターン数が+1される', () => {
    expect(endTurnCleanup(makeState({ turn: 5 })).turn).toBe(6);
  });
  it('turn=0から始まって増加', () => {
    expect(endTurnCleanup(makeState({ turn: 0 })).turn).toBe(1);
  });
});

describe('endTurnCleanup: 手札上限', () => {
  it(`${HAND_LIMIT}枚以内なら捨てない`, () => {
    const hand = Array(7).fill('c').map((_, i) => `c${i}`);
    const state = makeState({ players: [makePlayer({ hand }), makePlayer()] });
    const next = endTurnCleanup(state);
    expect(next.players[0].hand).toHaveLength(7);
    expect(next.players[0].discard).toHaveLength(0);
  });

  it('8枚なら1枚を捨てる', () => {
    const hand = Array(8).fill('c').map((_, i) => `c${i}`);
    const state = makeState({ players: [makePlayer({ hand }), makePlayer()] });
    const next = endTurnCleanup(state);
    expect(next.players[0].hand).toHaveLength(7);
    expect(next.players[0].discard).toHaveLength(1);
  });

  it('10枚なら3枚を捨てる', () => {
    const hand = Array(10).fill('c').map((_, i) => `c${i}`);
    const state = makeState({ players: [makePlayer({ hand }), makePlayer()] });
    const next = endTurnCleanup(state);
    expect(next.players[0].hand).toHaveLength(7);
    expect(next.players[0].discard).toHaveLength(3);
  });

  it('P1の手札超過はP1から捨てる', () => {
    const hand = Array(8).fill('c').map((_, i) => `c${i}`);
    const state = makeState({ active: 1, players: [makePlayer(), makePlayer({ hand })] });
    const next = endTurnCleanup(state);
    expect(next.players[1].hand).toHaveLength(7);
    expect(next.players[0].hand).toHaveLength(0);
  });
});

// ============================================================
// spendReactivationMana
// ============================================================
describe('spendReactivationMana: マナ消費', () => {
  it('baseCost 分のマナを消費する（actionTax=0）', () => {
    const board = Array(9).fill(null);
    board[0] = makeChar(0);
    const state = makeState({ players: [makePlayer({ mana: 5 }), makePlayer()], board });
    const next = spendReactivationMana(state, 0, 2);
    expect(next.players[0].mana).toBe(3);
  });

  it('actionTax 分が追加コストとして加算される', () => {
    const board = Array(9).fill(null);
    board[0] = makeChar(0, {
      status: { brainwashedTurns: 0, brainwashedBy: null, actionTax: 1, actionTaxBy: null, dirLocked: 0, immune: 0 },
    });
    const state = makeState({ players: [makePlayer({ mana: 5 }), makePlayer()], board });
    const next = spendReactivationMana(state, 0, 2);
    expect(next.players[0].mana).toBe(2); // 5 − (2+1)
  });

  it('actionTax=2 の場合も正しく計算', () => {
    const board = Array(9).fill(null);
    board[0] = makeChar(0, {
      status: { brainwashedTurns: 0, brainwashedBy: null, actionTax: 2, actionTaxBy: null, dirLocked: 0, immune: 0 },
    });
    const state = makeState({ players: [makePlayer({ mana: 6 }), makePlayer()], board });
    const next = spendReactivationMana(state, 0, 1);
    expect(next.players[0].mana).toBe(3); // 6 − (1+2)
  });

  it('相手のマナは変わらない', () => {
    const board = Array(9).fill(null);
    board[0] = makeChar(0);
    const state = makeState({ players: [makePlayer({ mana: 5 }), makePlayer({ mana: 3 })], board });
    const next = spendReactivationMana(state, 0, 1);
    expect(next.players[1].mana).toBe(3);
  });

  it('P1のターンはP1のマナを消費する', () => {
    const board = Array(9).fill(null);
    board[3] = makeChar(1);
    const state = makeState({
      active: 1,
      players: [makePlayer({ mana: 4 }), makePlayer({ mana: 5 })],
      board,
    });
    const next = spendReactivationMana(state, 3, 2);
    expect(next.players[1].mana).toBe(3);
    expect(next.players[0].mana).toBe(4);
  });

  it('baseCost=0 の場合マナは変化しない', () => {
    const board = Array(9).fill(null);
    board[0] = makeChar(0);
    const state = makeState({ players: [makePlayer({ mana: 5 }), makePlayer()], board });
    const next = spendReactivationMana(state, 0, 0);
    expect(next.players[0].mana).toBe(5);
  });

  it('元のstateを変更しない（immutability）', () => {
    const board = Array(9).fill(null);
    board[0] = makeChar(0);
    const state = makeState({ players: [makePlayer({ mana: 5 }), makePlayer()], board });
    spendReactivationMana(state, 0, 2);
    expect(state.players[0].mana).toBe(5);
  });
});

describe('endTurnCleanup: teamDR', () => {
  it('P0のターン終了 → P1のチームDRをクリア', () => {
    const state = makeState({ active: 0, teamDR: [false, true] });
    const next = endTurnCleanup(state);
    expect(next.teamDR[1]).toBe(false);
  });

  it('P1のターン終了 → P0のチームDRをクリア', () => {
    const state = makeState({ active: 1, teamDR: [true, false] });
    const next = endTurnCleanup(state);
    expect(next.teamDR[0]).toBe(false);
  });

  it('自分のチームDRは変更しない（次の相手ターン用）', () => {
    const state = makeState({ active: 0, teamDR: [true, false] });
    const next = endTurnCleanup(state);
    expect(next.teamDR[0]).toBe(true);
  });
});

describe('endTurnCleanup: tempAtkBuff', () => {
  it('現プレイヤー(P0)のtempAtkBuffがリセットされる', () => {
    const board = Array(9).fill(null);
    board[0] = makeChar(0, { tempAtkBuff: 2 });
    const state = makeState({ active: 0, board });
    const next = endTurnCleanup(state);
    expect(next.board[0]?.tempAtkBuff).toBe(0);
  });

  it('相手(P1)のtempAtkBuffはリセットされない', () => {
    const board = Array(9).fill(null);
    board[0] = makeChar(1, { tempAtkBuff: 2 }); // P1のキャラ
    const state = makeState({ active: 0, board }); // P0のターン終了
    const next = endTurnCleanup(state);
    expect(next.board[0]?.tempAtkBuff).toBe(2); // P1は変わらない
  });

  it('tempAtkBuff=0のキャラはそのまま', () => {
    const board = Array(9).fill(null);
    board[0] = makeChar(0, { tempAtkBuff: 0 });
    const state = makeState({ active: 0, board });
    const next = endTurnCleanup(state);
    expect(next.board[0]?.tempAtkBuff).toBe(0);
  });
});
