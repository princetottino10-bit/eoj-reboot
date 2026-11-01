import { describe, expect, it } from "vitest";
import {
  applyOnAllyKilledEffects,
  applyOnDamagedEffects,
  applyOnDeathEffects,
  applyOnKillEffects,
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

function makeState(board: Board, opts: Partial<GameState> = {}): GameState {
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
// applyOnKillEffects: aggro_v2_04 (撃破時ATK+1)
// ============================================================

describe("applyOnKillEffects: aggro_v2_04 (撃破時ATK+1)", () => {
  it("aggro_v2_04が敵を倒したとき自身のATKが+1", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "aggro_v2_04", atk: 3, baseAtk: 3 });
    const state = makeState(board);
    const { board: nb } = applyOnKillEffects(state, 0);
    expect(nb[0]?.atk).toBe(4);
  });

  it("攻撃者が既に撃破されていても例外を出さない（boardがnull）", () => {
    const board = emptyBoard();
    // index 0 は null（撃破済み）
    const state = makeState(board);
    const { board: nb } = applyOnKillEffects(state, 0);
    expect(nb[0]).toBeNull();
  });

  it("on_kill specを持たないカードは何もしない", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "aggro_v2_01", atk: 2, baseAtk: 2 });
    const state = makeState(board);
    const { board: nb } = applyOnKillEffects(state, 0);
    expect(nb[0]?.atk).toBe(2);
  });
});

// ============================================================
// applyOnDeathEffects: aggro_v2_08 (撃破時隣接味方HP+2・ATK+1)
// ============================================================

describe("applyOnDeathEffects: aggro_v2_08 (撃破時隣接味方HP+2・ATK+1)", () => {
  it("aggro_v2_08が撃破されたとき隣接味方HP+2・ATK+1", () => {
    const board = emptyBoard();
    // aggro_v2_08 は index 4 (中央) にいたが撃破済み → null
    board[3] = makeChar(0, { hp: 2, maxHp: 5, atk: 1, baseAtk: 1 }); // 隣接味方
    board[5] = makeChar(0, { hp: 1, maxHp: 3, atk: 2, baseAtk: 2 }); // 隣接味方
    board[7] = makeChar(1, { hp: 3, maxHp: 3, atk: 2, baseAtk: 2 }); // 隣接敵
    const state = makeState(board);
    // aggro_v2_08 は index 4 にいた
    const { board: nb } = applyOnDeathEffects(state, "aggro_v2_08", 4, 0);
    // P0の隣接味方 (3, 5) がHP+2, ATK+1
    expect(nb[3]?.hp).toBe(4); // 2+2=4 (maxHp=5なので上限内)
    expect(nb[3]?.atk).toBe(2); // 1+1=2
    expect(nb[5]?.hp).toBe(3); // 1+2=3 (maxHp=3なので上限=3)
    expect(nb[5]?.atk).toBe(3); // 2+1=3
    // 敵はバフなし
    expect(nb[7]?.atk).toBe(2);
  });

  it("隣接に味方がいなければ何も起きない", () => {
    const board = emptyBoard();
    board[3] = makeChar(1, { atk: 2, baseAtk: 2 }); // 隣接するが敵
    const state = makeState(board);
    const { board: nb } = applyOnDeathEffects(state, "aggro_v2_08", 4, 0);
    expect(nb[3]?.atk).toBe(2);
  });

  it("on_death specを持たないカードは何もしない", () => {
    const board = emptyBoard();
    board[3] = makeChar(0, { atk: 2, baseAtk: 2 });
    const state = makeState(board);
    const { board: nb } = applyOnDeathEffects(state, "aggro_v2_01", 4, 0);
    expect(nb[3]?.atk).toBe(2);
  });
});

// ============================================================
// applyOnDeathEffects: tank_v2_10 (撃破時隣接味方ATK+1)
// ============================================================

describe("applyOnDeathEffects: tank_v2_10 (撃破時隣接味方ATK+1)", () => {
  it("tank_v2_10が撃破されたとき隣接味方ATK+1", () => {
    const board = emptyBoard();
    // tank_v2_10 は index 1 にいたが撃破済み（null）
    board[0] = makeChar(0, { atk: 2, baseAtk: 2 }); // 隣接味方
    board[2] = makeChar(0, { atk: 1, baseAtk: 1 }); // 隣接味方
    board[4] = makeChar(0, { atk: 1, baseAtk: 1 }); // 隣接味方
    board[6] = makeChar(1, { atk: 3, baseAtk: 3 }); // 非隣接の敵
    const state = makeState(board);
    const { board: nb } = applyOnDeathEffects(state, "tank_v2_10", 1, 0);
    expect(nb[0]?.atk).toBe(3); // +1
    expect(nb[2]?.atk).toBe(2); // +1
    expect(nb[4]?.atk).toBe(2); // +1
    expect(nb[6]?.atk).toBe(3); // 変化なし
  });
});

// ============================================================
// applyOnDamagedEffects: tank_v2_07 (被ダメ時ATK+1)
// ============================================================

describe("applyOnDamagedEffects: tank_v2_07 (被ダメ時ATK+1)", () => {
  it("tank_v2_07がダメージを受けたとき自身のATK+1", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "tank_v2_07", atk: 2, baseAtk: 2 });
    const state = makeState(board);
    const { board: nb } = applyOnDamagedEffects(state, 0);
    expect(nb[0]?.atk).toBe(3);
  });

  it("on_damaged specを持たないカードは何もしない", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "aggro_v2_01", atk: 2, baseAtk: 2 });
    const state = makeState(board);
    const { board: nb } = applyOnDamagedEffects(state, 0);
    expect(nb[0]?.atk).toBe(2);
  });

  it("charがnullの場合は何もしない", () => {
    const board = emptyBoard();
    const state = makeState(board);
    const { board: nb } = applyOnDamagedEffects(state, 0);
    expect(nb[0]).toBeNull();
  });
});

// ============================================================
// applyOnAllyKilledEffects: synergy_v2_06 (味方撃破時防護マーカー)
// ============================================================

describe("applyOnAllyKilledEffects: synergy_v2_06 (味方撃破時防護マーカー)", () => {
  it("synergy_v2_06が生存中に味方が撃破されると防護マーカー+1", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "synergy_v2_06" });
    board[1] = makeChar(0); // 別の生存味方
    // killedIdx=2 (撃破された味方の最後の位置)
    const state = makeState(board);
    const { board: nb } = applyOnAllyKilledEffects(state, 0, 2);
    expect(nb[0]?.markers.protection).toBe(1);
  });

  it("synergy_v2_06が複数体いれば全員が防護マーカー+1", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "synergy_v2_06" });
    board[3] = makeChar(0, { cardId: "synergy_v2_06" });
    const state = makeState(board);
    const { board: nb } = applyOnAllyKilledEffects(state, 0, 6);
    expect(nb[0]?.markers.protection).toBe(1);
    expect(nb[3]?.markers.protection).toBe(1);
  });

  it("on_ally_killed specを持たないキャラには効果なし", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "aggro_v2_01" });
    const state = makeState(board);
    const { board: nb } = applyOnAllyKilledEffects(state, 0, 2);
    expect(nb[0]?.markers.protection).toBe(0);
  });

  it("相手プレイヤーの撃破では自分のon_ally_killedは発動しない", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "synergy_v2_06" });
    // P1の味方が撃破された → killedOwner=1
    const state = makeState(board);
    const { board: nb } = applyOnAllyKilledEffects(state, 1, 5);
    // P0のsynergy_v2_06には効果なし
    expect(nb[0]?.markers.protection).toBe(0);
  });
});
