import { describe, expect, it } from "vitest";
import {
  getPassiveAtkBonus,
  getPassiveReactivationCostDelta,
  hasPassiveNoCounter,
  hasPassiveOmniCounter,
} from "../src/engine/passive.js";
import type { Board, CharInstance } from "../src/engine/types.js";

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

function emptyBoard(): Board {
  return Array(9).fill(null) as Board;
}

// ============================================================
// getPassiveAtkBonus
// ============================================================

describe("getPassiveAtkBonus: tank_v2_06 (味方2体以上でATK+1)", () => {
  it("味方2体いればATK+1", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "tank_v2_06" });
    board[1] = makeChar(0);
    board[2] = makeChar(0);
    expect(getPassiveAtkBonus(board, 0)).toBe(1);
  });

  it("自分だけ（1体）ではATK+1なし", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "tank_v2_06" });
    expect(getPassiveAtkBonus(board, 0)).toBe(0);
  });

  it("味方1体では条件未達（min=2）", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "tank_v2_06" });
    board[1] = makeChar(0);
    expect(getPassiveAtkBonus(board, 0)).toBe(0);
  });

  it("敵だけでは条件未達", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "tank_v2_06" });
    board[1] = makeChar(1);
    board[2] = makeChar(1);
    expect(getPassiveAtkBonus(board, 0)).toBe(0);
  });
});

describe("getPassiveAtkBonus: tank_v2_08 (隣接味方のATK+1)", () => {
  it("tank_v2_08の隣接味方はATK+1を得る", () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { cardId: "tank_v2_08" }); // 中央
    board[3] = makeChar(0); // 左（隣接）
    // board[3]（隣接味方）は tank_v2_08 から+1を得る
    expect(getPassiveAtkBonus(board, 3)).toBe(1);
  });

  it("tank_v2_08自身はATK+1を得ない", () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { cardId: "tank_v2_08" });
    board[3] = makeChar(0);
    // tank_v2_08自身は自分の passive で adj_allies ターゲット → 自身には適用されない
    expect(getPassiveAtkBonus(board, 4)).toBe(0);
  });

  it("隣接していない味方はATK+1を得ない", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "tank_v2_08" }); // 左上
    board[8] = makeChar(0); // 右下（隣接していない）
    expect(getPassiveAtkBonus(board, 8)).toBe(0);
  });

  it("隣接敵はATK+1を得ない", () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { cardId: "tank_v2_08" }); // P0
    board[3] = makeChar(1); // P1 隣接敵
    expect(getPassiveAtkBonus(board, 3)).toBe(0);
  });

  it("tank_v2_08が2体いれば隣接する共通味方はATK+2", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "tank_v2_08" }); // 左上
    board[2] = makeChar(0, { cardId: "tank_v2_08" }); // 右上
    board[1] = makeChar(0); // 中上（両方に隣接）
    expect(getPassiveAtkBonus(board, 1)).toBe(2);
  });
});

describe("getPassiveAtkBonus: synergy_v2_10 (マーカー味方2体以上でATK+1)", () => {
  it("マーカー持ち味方2体以上でATK+1", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "synergy_v2_10" });
    board[1] = makeChar(0, {
      markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0, aim: 0 },
    });
    board[2] = makeChar(0, {
      markers: { protection: 0, evasion: 1, piercing: 0, quickness: 0, aim: 0 },
    });
    expect(getPassiveAtkBonus(board, 0)).toBe(1);
  });

  it("マーカー持ち1体では条件未達", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "synergy_v2_10" });
    board[1] = makeChar(0, {
      markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0, aim: 0 },
    });
    expect(getPassiveAtkBonus(board, 0)).toBe(0);
  });

  it("敵のマーカーはカウントしない", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "synergy_v2_10" });
    board[1] = makeChar(1, {
      markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0, aim: 0 },
    });
    board[2] = makeChar(1, {
      markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0, aim: 0 },
    });
    expect(getPassiveAtkBonus(board, 0)).toBe(0);
  });
});

describe("getPassiveAtkBonus: trick_v2_10 (空きマス5以上でATK+1)", () => {
  it("空きマス5個以上でATK+1", () => {
    // 9マス中 board[0] と board[1] だけ使用 → 7空きマス
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "trick_v2_10" });
    board[1] = makeChar(1);
    expect(getPassiveAtkBonus(board, 0)).toBe(1);
  });

  it("空きマス4個では条件未達", () => {
    // 5体配置 → 4空きマス
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "trick_v2_10" });
    board[1] = makeChar(0);
    board[2] = makeChar(0);
    board[3] = makeChar(1);
    board[4] = makeChar(1);
    expect(getPassiveAtkBonus(board, 0)).toBe(0);
  });
});

describe("getPassiveAtkBonus: passiveがないカード", () => {
  it("通常カードは0を返す", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "aggro_v2_01" });
    expect(getPassiveAtkBonus(board, 0)).toBe(0);
  });

  it("charがnullなら0を返す", () => {
    const board = emptyBoard();
    expect(getPassiveAtkBonus(board, 0)).toBe(0);
  });
});

// ============================================================
// getPassiveReactivationCostDelta
// ============================================================

describe("getPassiveReactivationCostDelta: aggro_v2_12 (攻撃済み味方3体以上で再行動コスト-2)", () => {
  it("攻撃済み味方3体以上でコスト-2", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "aggro_v2_12" });
    board[1] = makeChar(0, { hasActed: true });
    board[2] = makeChar(0, { hasActed: true });
    board[3] = makeChar(0, { hasActed: true });
    expect(getPassiveReactivationCostDelta(board, 0)).toBe(-2);
  });

  it("攻撃済み味方2体では条件未達（コスト変化なし）", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "aggro_v2_12" });
    board[1] = makeChar(0, { hasActed: true });
    board[2] = makeChar(0, { hasActed: true });
    expect(getPassiveReactivationCostDelta(board, 0)).toBe(0);
  });

  it("passiveがないカードは0を返す", () => {
    const board = emptyBoard();
    board[0] = makeChar(0, { cardId: "aggro_v2_01" });
    board[1] = makeChar(0, { hasActed: true });
    board[2] = makeChar(0, { hasActed: true });
    board[3] = makeChar(0, { hasActed: true });
    expect(getPassiveReactivationCostDelta(board, 0)).toBe(0);
  });
});

// ============================================================
// hasPassiveNoCounter
// ============================================================

describe("hasPassiveNoCounter", () => {
  it("aggro_v2_09 はtrueを返す", () => {
    expect(hasPassiveNoCounter("aggro_v2_09")).toBe(true);
  });

  it("それ以外のカードはfalseを返す", () => {
    expect(hasPassiveNoCounter("aggro_v2_01")).toBe(false);
    expect(hasPassiveNoCounter("tank_v2_10")).toBe(false);
  });
});

// ============================================================
// hasPassiveOmniCounter
// ============================================================

describe("hasPassiveOmniCounter", () => {
  it("tank_v2_10 はtrueを返す", () => {
    expect(hasPassiveOmniCounter("tank_v2_10")).toBe(true);
  });

  it("それ以外のカードはfalseを返す", () => {
    expect(hasPassiveOmniCounter("aggro_v2_09")).toBe(false);
    expect(hasPassiveOmniCounter("tank_v2_06")).toBe(false);
  });
});
