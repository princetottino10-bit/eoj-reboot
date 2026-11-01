import { describe, expect, it } from "vitest";
import { DIR_UP } from "../src/engine/board.js";
import type {
  Board,
  CharInstance,
  GameState,
  PlayerState,
} from "../src/engine/types.js";
import {
  applyUltDirectEffect,
  applyUltTargetEffect,
} from "../src/engine/ults.js";

// ============================================================
// テストヘルパー
// ============================================================

function makeChar(
  owner: 0 | 1,
  cardId: string,
  opts: Partial<CharInstance> = {},
): CharInstance {
  return {
    cardId,
    owner,
    hp: 3,
    maxHp: 3,
    atk: 2,
    baseAtk: 2,
    dir: DIR_UP,
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

// ============================================================
// applyUltDirectEffect
// ============================================================

describe("applyUltDirectEffect: aggro_v2_09 貫通マーカー+1", () => {
  it("自身に貫通マーカーを1枚付与", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "aggro_v2_09");
    const state = makeState(board);
    const result = applyUltDirectEffect(state, 4, 0);
    expect(result.board[4]?.markers.piercing).toBe(1);
  });
});

describe("applyUltDirectEffect: aggro_v2_12 前列5ダメ+HP1設定", () => {
  it("前列の敵に5ダメ・自身HP1に設定", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "aggro_v2_12", { dir: DIR_UP }); // UP向き idx=4(row=1,col=1) → 前列=row=0
    board[1] = makeChar(1, "enemy", { hp: 7, maxHp: 7 }); // row=0の敵
    const state = makeState(board);
    const result = applyUltDirectEffect(state, 4, 0);
    expect(result.board[1]?.hp).toBe(2); // 7 - 5 = 2
    expect(result.board[4]?.hp).toBe(1); // 自身HP1
  });

  it("前列の敵を撃破した場合VP獲得とclearAffiliatedEffects", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "aggro_v2_12", { dir: DIR_UP });
    board[1] = makeChar(1, "control_v2_01", { hp: 3, maxHp: 3 });
    // 洗脳付与者として登録
    board[7] = makeChar(0, "victim", {
      status: {
        brainwashedTurns: 2,
        brainwashedBy: "control_v2_01",
        actionTax: 0,
        actionTaxBy: null,
        dirLocked: 0,
        immune: 0,
      },
    });
    const state = makeState(board, {
      players: [makePlayer({ vp: 0 }), makePlayer()],
    });
    const result = applyUltDirectEffect(state, 4, 0);
    expect(result.board[1]).toBeNull(); // 撃破
    expect(result.board[7]?.status.brainwashedTurns).toBe(0); // clearAffiliatedEffects
  });
});

describe("applyUltDirectEffect: tank_v2_08 チームDR設定", () => {
  it("activeのチームDRをtrueに設定", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "tank_v2_08");
    const state = makeState(board, { teamDR: [false, false] });
    const result = applyUltDirectEffect(state, 4, 0);
    expect(result.teamDR[0]).toBe(true);
    expect(result.teamDR[1]).toBe(false);
  });
});

describe("applyUltDirectEffect: tank_v2_10 全快+防護", () => {
  it("隣接味方を全回復して防護マーカー付与", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "tank_v2_10");
    board[3] = makeChar(0, "ally", { hp: 1, maxHp: 5 }); // 隣接味方
    const state = makeState(board);
    const result = applyUltDirectEffect(state, 4, 0);
    expect(result.board[3]?.hp).toBe(5); // 全回復
    expect(result.board[3]?.markers.protection).toBe(1); // 防護マーカー
  });

  it("隣接敵には効果なし", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "tank_v2_10");
    board[3] = makeChar(1, "enemy", { hp: 1, maxHp: 5 }); // 隣接敵
    const state = makeState(board);
    const result = applyUltDirectEffect(state, 4, 0);
    expect(result.board[3]?.hp).toBe(1); // 変化なし
  });
});

describe("applyUltDirectEffect: control_v2_10 全敵ATK永続-1", () => {
  it("全敵のATKとbaseAtkを-1（永続）", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "control_v2_10");
    board[1] = makeChar(1, "enemy", { atk: 3, baseAtk: 3 });
    board[7] = makeChar(1, "enemy2", { atk: 2, baseAtk: 2 });
    const state = makeState(board);
    const result = applyUltDirectEffect(state, 4, 0);
    expect(result.board[1]?.atk).toBe(2);
    expect(result.board[1]?.baseAtk).toBe(2);
    expect(result.board[7]?.atk).toBe(1);
    expect(result.board[7]?.baseAtk).toBe(1);
  });

  it("味方には効果なし", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "control_v2_10", { atk: 3, baseAtk: 3 });
    const state = makeState(board);
    const result = applyUltDirectEffect(state, 4, 0);
    expect(result.board[4]?.atk).toBe(3); // 変化なし（自分のATK）
  });
});

describe("applyUltDirectEffect: synergy_v2_10 全味方永続バフ", () => {
  it("全味方のATK+1・最大HP+1（永続）", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "synergy_v2_10", {
      atk: 2,
      baseAtk: 2,
      hp: 3,
      maxHp: 3,
    });
    board[3] = makeChar(0, "ally", { atk: 1, baseAtk: 1, hp: 2, maxHp: 3 });
    const state = makeState(board);
    const result = applyUltDirectEffect(state, 4, 0);
    expect(result.board[4]?.atk).toBe(3);
    expect(result.board[4]?.baseAtk).toBe(3);
    expect(result.board[4]?.maxHp).toBe(4);
    expect(result.board[3]?.atk).toBe(2);
    expect(result.board[3]?.maxHp).toBe(4);
  });

  it("敵には効果なし", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "synergy_v2_10");
    board[1] = makeChar(1, "enemy", { atk: 3 });
    const state = makeState(board);
    const result = applyUltDirectEffect(state, 4, 0);
    expect(result.board[1]?.atk).toBe(3);
  });
});

describe("applyUltDirectEffect: synergy_v2_12 全味方4種マーカー", () => {
  it("全味方に4種マーカーを1枚ずつ付与", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "synergy_v2_12");
    board[3] = makeChar(0, "ally");
    const state = makeState(board);
    const result = applyUltDirectEffect(state, 4, 0);
    expect(result.board[4]?.markers.protection).toBe(1);
    expect(result.board[4]?.markers.evasion).toBe(1);
    expect(result.board[4]?.markers.piercing).toBe(1);
    expect(result.board[4]?.markers.quickness).toBe(1);
    expect(result.board[3]?.markers.protection).toBe(1);
    expect(result.board[3]?.markers.evasion).toBe(1);
  });

  it("敵には付与しない", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "synergy_v2_12");
    board[1] = makeChar(1, "enemy");
    const state = makeState(board);
    const result = applyUltDirectEffect(state, 4, 0);
    expect(result.board[1]?.markers.protection).toBe(0);
  });
});

describe("applyUltDirectEffect: trick_v2_12 immune+1", () => {
  it("自身に無敵ターン+1", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "trick_v2_12");
    const state = makeState(board);
    const result = applyUltDirectEffect(state, 4, 0);
    expect(result.board[4]?.status.immune).toBe(1);
  });
});

describe("applyUltDirectEffect: casterが存在しない場合", () => {
  it("casterがnullなら状態そのままを返す", () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board);
    const result = applyUltDirectEffect(state, 4, 0);
    expect(result).toBe(state);
  });
});

// ============================================================
// applyUltTargetEffect
// ============================================================

describe("applyUltTargetEffect: snipe_v2_09 4ダメ+clearAffiliatedEffects", () => {
  it("敵に4ダメージ（貫通）", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "snipe_v2_09");
    board[1] = makeChar(1, "enemy", { hp: 7 });
    const state = makeState(board);
    const { newState, continueToDir } = applyUltTargetEffect(
      state,
      4,
      "snipe_v2_09",
      1,
      0,
    );
    expect(newState.board[1]?.hp).toBe(3);
    expect(continueToDir).toBe(false);
  });

  it("撃破時にVP獲得", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "snipe_v2_09");
    board[1] = makeChar(1, "enemy", { hp: 3 });
    const state = makeState(board, {
      players: [makePlayer({ vp: 0 }), makePlayer()],
    });
    const { newState } = applyUltTargetEffect(state, 4, "snipe_v2_09", 1, 0);
    expect(newState.board[1]).toBeNull();
    expect(newState.players[0].vp).toBeGreaterThan(0);
  });
});

describe("applyUltTargetEffect: snipe_v2_12 5ダメ", () => {
  it("敵に5ダメージ（貫通）", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "snipe_v2_12");
    board[1] = makeChar(1, "enemy", { hp: 7 });
    const state = makeState(board);
    const { newState, continueToDir } = applyUltTargetEffect(
      state,
      4,
      "snipe_v2_12",
      1,
      0,
    );
    expect(newState.board[1]?.hp).toBe(2); // 7-5=2
    expect(continueToDir).toBe(false);
  });
});

describe("applyUltTargetEffect: control_v2_09 ATK奪取", () => {
  it("敵のATKを最大2奪う（casterに付与）", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "control_v2_09", { atk: 2, baseAtk: 2 });
    board[1] = makeChar(1, "enemy", { atk: 4, baseAtk: 4 });
    const state = makeState(board);
    const { newState, continueToDir } = applyUltTargetEffect(
      state,
      4,
      "control_v2_09",
      1,
      0,
    );
    expect(newState.board[4]?.atk).toBe(4); // 2+2
    expect(newState.board[4]?.baseAtk).toBe(4);
    expect(newState.board[1]?.atk).toBe(2); // 4-2
    expect(newState.board[1]?.baseAtk).toBe(2);
    expect(continueToDir).toBe(false);
  });

  it("敵のATKが1しかない場合は1だけ奪う", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "control_v2_09", { atk: 2, baseAtk: 2 });
    board[1] = makeChar(1, "enemy", { atk: 1, baseAtk: 1 });
    const state = makeState(board);
    const { newState } = applyUltTargetEffect(state, 4, "control_v2_09", 1, 0);
    expect(newState.board[4]?.atk).toBe(3); // 2+1
    expect(newState.board[1]?.atk).toBe(0);
  });
});

describe("applyUltTargetEffect: trick_v2_09 位置交換+continueToDir", () => {
  it("casterと対象の位置を入れ替え、continueToDir=trueを返す", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, "trick_v2_09");
    board[1] = makeChar(1, "enemy");
    const state = makeState(board);
    const { newState, continueToDir } = applyUltTargetEffect(
      state,
      4,
      "trick_v2_09",
      1,
      0,
    );
    expect(newState.board[4]?.cardId).toBe("enemy"); // 位置交換
    expect(newState.board[1]?.cardId).toBe("trick_v2_09");
    expect(continueToDir).toBe(true); // 向き選択が必要
  });
});
