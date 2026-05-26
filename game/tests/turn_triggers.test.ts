import { describe, expect, it } from "vitest";
import {
  applyOnTurnEndEffects,
  applyOnTurnStartEffects,
} from "../src/engine/effects.js";
import type {
  Board,
  CharInstance,
  GameState,
  PlayerState,
} from "../src/engine/types.js";

// ============================================================
// テストヘルパー
// ============================================================

function makeChar(
  owner: 0 | 1,
  opts: Partial<CharInstance> = {},
): CharInstance {
  return {
    cardId: "test_v2_01",
    owner,
    hp: 3,
    maxHp: 3,
    atk: 2,
    baseAtk: 2,
    dir: 0,
    hasActed: false,
    hasRotated: false,
    ultUsed: false,
    summonedOnTurn: 0,
    keywords: [],
    markers: { protection: 0, evasion: 0, piercing: 0, quickness: 0, aim: 0 },
    status: {
      brainwashedTurns: 0,
      brainwashedBy: null,
      actionTax: 0,
      actionTaxBy: null,
      dirLocked: 0,
      immune: 0,
    },
    tempAtkBuff: 0,
    ...opts,
  };
}

function makePlayer(opts: Partial<PlayerState> = {}): PlayerState {
  return {
    factions: [],
    itemSet: "A",
    vp: 0,
    mana: 0,
    hand: [],
    deck: [],
    discard: [],
    ...opts,
  };
}

function makeState(
  board: Board,
  opts: Partial<GameState> = {},
): GameState {
  return {
    turn: 0,
    active: 0,
    players: [makePlayer(), makePlayer()],
    board,
    boardAttrs: Array(9).fill("nicht"),
    log: [],
    winner: null,
    winReason: "",
    ui: {
      mode: "idle",
      selectedHandIndex: -1,
      selectedBoardIndex: -1,
      validCells: [],
      pendingEffect: null,
    },
    teamDR: [false, false],
    ...opts,
  };
}

function emptyBoard(): Board {
  return Array(9).fill(null) as Board;
}

// ============================================================
// applyOnTurnStartEffects: control_v2_12
// ============================================================

describe("applyOnTurnStartEffects: control_v2_12 (デバフ敵2体以上で1ドロー、3体以上でマナ+1)", () => {
  function makeDebuffedEnemy(owner: 0 | 1): CharInstance {
    return makeChar(owner, { atk: 1, baseAtk: 2 }); // atk < baseAtk → デバフ状態
  }

  it("デバフ敵2体: 1ドローのみ", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "control_v2_12" });
    board[3] = makeDebuffedEnemy(1);
    board[6] = makeDebuffedEnemy(1);
    const state = makeState(board, {
      players: [makePlayer({ mana: 2, deck: ["card_a"] }), makePlayer()],
    });
    const result = applyOnTurnStartEffects(state);
    // 1ドロー
    expect(result.players[0].hand).toContain("card_a");
    // マナ+1はなし
    expect(result.players[0].mana).toBe(2);
  });

  it("デバフ敵3体以上: 1ドロー+マナ+1", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "control_v2_12" });
    board[3] = makeDebuffedEnemy(1);
    board[6] = makeDebuffedEnemy(1);
    board[7] = makeDebuffedEnemy(1);
    const state = makeState(board, {
      players: [makePlayer({ mana: 2, deck: ["card_a"] }), makePlayer()],
    });
    const result = applyOnTurnStartEffects(state);
    expect(result.players[0].hand).toContain("card_a");
    expect(result.players[0].mana).toBe(3); // +1
  });

  it("デバフ敵1体では効果なし", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "control_v2_12" });
    board[3] = makeDebuffedEnemy(1);
    const state = makeState(board, {
      players: [makePlayer({ mana: 2, deck: ["card_a"] }), makePlayer()],
    });
    const result = applyOnTurnStartEffects(state);
    expect(result.players[0].hand).toHaveLength(0); // ドローなし
    expect(result.players[0].mana).toBe(2);
  });

  it("相手ターン（active=1）ではP0のcontrol_v2_12は発動しない", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "control_v2_12" }); // P0のキャラ
    board[3] = makeDebuffedEnemy(0); // P0視点で「敵」は逆
    board[6] = makeDebuffedEnemy(0);
    const state = makeState(board, {
      active: 1, // P1のターン
      players: [makePlayer({ mana: 2, deck: ["card_a"] }), makePlayer()],
    });
    const result = applyOnTurnStartEffects(state);
    // P1のターンなのでP0のキャラのon_turn_startは発動しない
    expect(result.players[0].hand).toHaveLength(0);
  });
});

describe("applyOnTurnStartEffects: 自動効果なしのカードは何もしない", () => {
  it("on_turn_start specがないカードは board / players を変更しない", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "aggro_v2_01" });
    const state = makeState(board, {
      players: [makePlayer({ mana: 3 }), makePlayer()],
    });
    const result = applyOnTurnStartEffects(state);
    expect(result.players[0].mana).toBe(3);
    expect(result.players[0].hand).toHaveLength(0);
  });
});

// ============================================================
// applyOnTurnEndEffects: synergy_v2_05 (マーカー味方4体以上で隣接味方HP+1)
// ============================================================

describe("applyOnTurnEndEffects: synergy_v2_05 (マーカー味方4体以上で隣接味方HP+1)", () => {
  function makeMarkerChar(owner: 0 | 1): CharInstance {
    return makeChar(owner, {
      markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0, aim: 0 },
    });
  }

  it("マーカー味方4体以上: 隣接味方HP+1", () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { cardId: "synergy_v2_05" }); // 中央
    board[3] = makeMarkerChar(0); // 隣接
    board[5] = makeMarkerChar(0); // 隣接
    board[1] = makeMarkerChar(0); // 隣接
    board[7] = makeMarkerChar(0); // 隣接 (4体目)
    const adjChar = { hp: 2, maxHp: 3 };
    board[3] = { ...board[3], ...adjChar };
    const state = makeState(board, { active: 0 });
    const result = applyOnTurnEndEffects(state);
    // 隣接味方がHP+1
    expect(result.board[3]?.hp).toBe(3); // 2+1
  });

  it("マーカー味方3体では条件未達", () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { cardId: "synergy_v2_05" });
    board[3] = makeMarkerChar(0);
    board[5] = makeMarkerChar(0);
    board[1] = makeMarkerChar(0);
    board[3] = { ...board[3], hp: 2, maxHp: 3 };
    const state = makeState(board, { active: 0 });
    const result = applyOnTurnEndEffects(state);
    expect(result.board[3]?.hp).toBe(2); // HP変化なし
  });
});

// ============================================================
// applyOnTurnEndEffects: synergy_v2_10 (マーカー味方3体以上で隣接味方HP+1)
// ============================================================

describe("applyOnTurnEndEffects: synergy_v2_10 (マーカー味方3体以上で隣接味方HP+1)", () => {
  function makeMarkerChar(owner: 0 | 1): CharInstance {
    return makeChar(owner, {
      markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0, aim: 0 },
    });
  }

  it("マーカー味方3体以上: 隣接味方HP+1", () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { cardId: "synergy_v2_10" }); // 中央
    board[3] = makeMarkerChar(0); // 隣接
    board[5] = makeMarkerChar(0); // 隣接
    board[1] = makeMarkerChar(0); // 隣接 (3体目)
    board[3] = { ...board[3], hp: 1, maxHp: 3 };
    const state = makeState(board, { active: 0 });
    const result = applyOnTurnEndEffects(state);
    expect(result.board[3]?.hp).toBe(2); // 1+1
  });

  it("マーカー味方2体では条件未達", () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { cardId: "synergy_v2_10" });
    board[3] = makeMarkerChar(0);
    board[5] = makeMarkerChar(0);
    board[3] = { ...board[3], hp: 1, maxHp: 3 };
    const state = makeState(board, { active: 0 });
    const result = applyOnTurnEndEffects(state);
    expect(result.board[3]?.hp).toBe(1); // HP変化なし
  });
});
