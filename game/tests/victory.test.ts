import { describe, expect, it } from "vitest";
import type {
  CharInstance,
  GameState,
  PlayerState,
} from "../src/engine/types.js";
import {
  checkTerritoryWin,
  checkTimeoutWin,
  checkVPWin,
  evalVictory,
  TERRITORY_WIN_COUNT,
  TIMEOUT_TURN,
  VP_WIN_THRESHOLD,
} from "../src/engine/victory.js";

// ============================================================
// テストヘルパー
// ============================================================

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

function makeChar(owner: 0 | 1): CharInstance {
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
  };
}

function makeState(opts: Partial<GameState> = {}): GameState {
  return {
    turn: 0,
    active: 0,
    players: [makePlayer(), makePlayer()],
    board: Array(9).fill(null),
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

// ============================================================
// 定数
// ============================================================
describe("定数", () => {
  it("VP勝利閾値 = 15", () => {
    expect(VP_WIN_THRESHOLD).toBe(15);
  });
  it("領土勝利マス数 = 5", () => {
    expect(TERRITORY_WIN_COUNT).toBe(5);
  });
  it("タイムアウトターン = 50", () => {
    expect(TIMEOUT_TURN).toBe(50);
  });
});

// ============================================================
// checkVPWin
// ============================================================
describe("checkVPWin", () => {
  it("P0が15VP → 0を返す", () => {
    expect(checkVPWin([makePlayer({ vp: 15 }), makePlayer()])).toBe(0);
  });
  it("P1が15VP → 1を返す", () => {
    expect(checkVPWin([makePlayer(), makePlayer({ vp: 15 })])).toBe(1);
  });
  it("両方15VP → 0を返す（P0優先）", () => {
    expect(checkVPWin([makePlayer({ vp: 15 }), makePlayer({ vp: 15 })])).toBe(
      0,
    );
  });
  it("両方14VP → null", () => {
    expect(
      checkVPWin([makePlayer({ vp: 14 }), makePlayer({ vp: 14 })]),
    ).toBeNull();
  });
  it("0VP同士 → null", () => {
    expect(checkVPWin([makePlayer(), makePlayer()])).toBeNull();
  });
  it("P0が16VPでも勝利", () => {
    expect(checkVPWin([makePlayer({ vp: 16 }), makePlayer()])).toBe(0);
  });
});

// ============================================================
// checkTerritoryWin
// ============================================================
describe("checkTerritoryWin", () => {
  it("P0が5体、P0のターン終了 → 0を返す", () => {
    const board = [...Array(5).fill(makeChar(0)), ...Array(4).fill(null)];
    expect(checkTerritoryWin(board, 0)).toBe(0);
  });
  it("P0が5体、P1のターン終了 → null（相手のターン終了では判定しない）", () => {
    const board = [...Array(5).fill(makeChar(0)), ...Array(4).fill(null)];
    expect(checkTerritoryWin(board, 1)).toBeNull();
  });
  it("P0が4体のみ → null", () => {
    const board = [...Array(4).fill(makeChar(0)), ...Array(5).fill(null)];
    expect(checkTerritoryWin(board, 0)).toBeNull();
  });
  it("P1が5体、P1のターン終了 → 1を返す", () => {
    const board = [...Array(5).fill(makeChar(1)), ...Array(4).fill(null)];
    expect(checkTerritoryWin(board, 1)).toBe(1);
  });
  it("P0とP1が混在してもそれぞれカウント", () => {
    const board = [
      makeChar(0),
      makeChar(0),
      makeChar(0),
      makeChar(0),
      makeChar(0),
      makeChar(1),
      makeChar(1),
      makeChar(1),
      null,
    ];
    expect(checkTerritoryWin(board, 0)).toBe(0);
    expect(checkTerritoryWin(board, 1)).toBeNull(); // P1は3体
  });
  it("空盤面 → null", () => {
    expect(checkTerritoryWin(Array(9).fill(null), 0)).toBeNull();
  });
});

// ============================================================
// checkTimeoutWin
// ============================================================
describe("checkTimeoutWin", () => {
  it("49ターン → null（まだ判定しない）", () => {
    expect(
      checkTimeoutWin(49, [makePlayer({ vp: 10 }), makePlayer({ vp: 0 })]),
    ).toBeNull();
  });
  it("50ターン、P0 VP多 → 0", () => {
    expect(
      checkTimeoutWin(50, [makePlayer({ vp: 10 }), makePlayer({ vp: 5 })]),
    ).toBe(0);
  });
  it("50ターン、P1 VP多 → 1", () => {
    expect(
      checkTimeoutWin(50, [makePlayer({ vp: 3 }), makePlayer({ vp: 8 })]),
    ).toBe(1);
  });
  it("50ターン、同VP → -1（引き分け）", () => {
    expect(
      checkTimeoutWin(50, [makePlayer({ vp: 5 }), makePlayer({ vp: 5 })]),
    ).toBe(-1);
  });
  it("50ターン超でも同様に判定", () => {
    expect(
      checkTimeoutWin(99, [makePlayer({ vp: 10 }), makePlayer({ vp: 5 })]),
    ).toBe(0);
  });
  it("0VP同士で50ターン → 引き分け", () => {
    expect(checkTimeoutWin(50, [makePlayer(), makePlayer()])).toBe(-1);
  });
});

// ============================================================
// evalVictory
// ============================================================
describe("evalVictory", () => {
  it("何もなければ null", () => {
    expect(evalVictory(makeState(), null)).toBeNull();
  });

  it("VP勝利が最優先（領土・タイムアウトより先）", () => {
    const board = [...Array(5).fill(makeChar(0)), ...Array(4).fill(null)];
    const state = makeState({
      players: [makePlayer({ vp: 15 }), makePlayer()],
      board,
    });
    expect(evalVictory(state, 0)).toBe(0);
  });

  it("ターン終了指定なし → 領土勝利をチェックしない", () => {
    const board = [...Array(5).fill(makeChar(0)), ...Array(4).fill(null)];
    expect(evalVictory(makeState({ board }), null)).toBeNull();
  });

  it("ターン終了 P0 → P0の領土勝利をチェック", () => {
    const board = [...Array(5).fill(makeChar(0)), ...Array(4).fill(null)];
    expect(evalVictory(makeState({ board }), 0)).toBe(0);
  });

  it("ターン終了 P0 → P1の領土は判定しない", () => {
    const board = [...Array(5).fill(makeChar(1)), ...Array(4).fill(null)];
    expect(evalVictory(makeState({ board }), 0)).toBeNull();
  });

  it("50ターンでP0多VPなら0", () => {
    const state = makeState({
      turn: 50,
      players: [makePlayer({ vp: 10 }), makePlayer({ vp: 5 })],
    });
    expect(evalVictory(state, null)).toBe(0);
  });

  it("50ターン同VPなら -1（引き分け）", () => {
    const state = makeState({
      turn: 50,
      players: [makePlayer({ vp: 5 }), makePlayer({ vp: 5 })],
    });
    expect(evalVictory(state, null)).toBe(-1);
  });
});
