import { describe, expect, it } from "vitest";
import {
  applyDiscardEffect,
  applyPendingEffect,
} from "../src/engine/pendingEffects.js";
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

// ============================================================
// applyPendingEffect
// ============================================================

describe("applyPendingEffect: synergy_v2_01/04 防護マーカー", () => {
  it("synergy_v2_01: 味方に防護マーカーを付与", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0); // 召喚者
    board[1] = makeChar(0); // 対象
    const state = makeState(board);
    const result = applyPendingEffect(state, "synergy_v2_01", 4, 1, 0);
    expect(result.board[1]?.markers.protection).toBe(1);
  });

  it("synergy_v2_04: 味方に防護マーカーを付与", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[1] = makeChar(0);
    const state = makeState(board);
    const result = applyPendingEffect(state, "synergy_v2_04", 4, 1, 0);
    expect(result.board[1]?.markers.protection).toBe(1);
  });

  it("敵には付与しない", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[1] = makeChar(1); // 敵
    const state = makeState(board);
    const result = applyPendingEffect(state, "synergy_v2_01", 4, 1, 0);
    expect(result.board[1]?.markers.protection).toBe(0);
  });
});

describe("applyPendingEffect: synergy_v2_02 回避マーカー", () => {
  it("味方に回避マーカーを付与", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[3] = makeChar(0); // 隣接味方
    const state = makeState(board);
    const result = applyPendingEffect(state, "synergy_v2_02", 4, 3, 0);
    expect(result.board[3]?.markers.evasion).toBe(1);
  });
});

describe("applyPendingEffect: synergy_v2_03 貫通マーカー", () => {
  it("味方に貫通マーカーを付与", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[3] = makeChar(0);
    const state = makeState(board);
    const result = applyPendingEffect(state, "synergy_v2_03", 4, 3, 0);
    expect(result.board[3]?.markers.piercing).toBe(1);
  });
});

describe("applyPendingEffect: synergy_v2_09 HP+1", () => {
  it("味方のHPを1回復", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[3] = makeChar(0, { hp: 2, maxHp: 3 });
    const state = makeState(board);
    const result = applyPendingEffect(state, "synergy_v2_09", 4, 3, 0);
    expect(result.board[3]?.hp).toBe(3);
  });

  it("maxHpを超えない", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[3] = makeChar(0, { hp: 3, maxHp: 3 });
    const state = makeState(board);
    const result = applyPendingEffect(state, "synergy_v2_09", 4, 3, 0);
    expect(result.board[3]?.hp).toBe(3);
  });
});

describe("applyPendingEffect: trick_v2_04 位置入れ替え", () => {
  it("召喚者と対象の位置を入れ替える", () => {
    const board: Board = Array(9).fill(null);
    const summonChar = makeChar(0, { cardId: "trick_v2_04" });
    const targetChar = makeChar(0, { cardId: "synergy_v2_01" });
    board[4] = summonChar; // 召喚者
    board[3] = targetChar; // 対象
    const state = makeState(board);
    const result = applyPendingEffect(state, "trick_v2_04", 4, 3, 0);
    expect(result.board[4]?.cardId).toBe("synergy_v2_01");
    expect(result.board[3]?.cardId).toBe("trick_v2_04");
  });
});

describe("applyPendingEffect: trick_v2_01/02 敵を90°回転", () => {
  it("trick_v2_01: 敵を90°回転", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[1] = makeChar(1, { dir: 0 }); // UP向き敵
    const state = makeState(board);
    const result = applyPendingEffect(state, "trick_v2_01", 4, 1, 0);
    expect(result.board[1]?.dir).toBe(1); // RIGHT
  });

  it("trick_v2_02: 敵を90°回転", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[3] = makeChar(1, { dir: 2 }); // DOWN向き敵
    const state = makeState(board);
    const result = applyPendingEffect(state, "trick_v2_02", 4, 3, 0);
    expect(result.board[3]?.dir).toBe(3); // LEFT
  });
});

describe("applyPendingEffect: trick_v2_06 後退", () => {
  it("敵を後退させる（UP向きなら下に）", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[1] = makeChar(1, { dir: 0 }); // UP向き敵: idx1 → 後退先=idx4... 被ってるのでidx7を使用
    // UP向き: 後退=dir 0→後ろ=下 → row+1
    // idx=1(row=0,col=1) → 後退=row=1,col=1=idx4
    // idx=4に誰かいるのでブロック → null
    // 別のキャラでテスト: idx=0(row=0,col=0) UP向き → 後退=row=1,col=0=idx3
    board[1] = null;
    board[0] = makeChar(1, { dir: 0 }); // idx=0(row=0,col=0) UP向き → 後退=idx3
    const state = makeState(board);
    const result = applyPendingEffect(state, "trick_v2_06", 4, 0, 0);
    expect(result.board[0]).toBeNull();
    expect(result.board[3]).not.toBeNull();
  });

  it("後退できない場合は効果なし", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[7] = makeChar(1, { dir: 0 }); // idx=7(row=2,col=1) UP向き → 後退=row=3→盤外
    const state = makeState(board);
    const result = applyPendingEffect(state, "trick_v2_06", 4, 7, 0);
    expect(result.board[7]).not.toBeNull(); // 動いていない
  });
});

describe("applyPendingEffect: control_v2_01 ATK-1", () => {
  it("敵のATKを1下げる", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[3] = makeChar(1, { atk: 3 }); // 隣接敵
    const state = makeState(board);
    const result = applyPendingEffect(state, "control_v2_01", 4, 3, 0);
    expect(result.board[3]?.atk).toBe(2);
  });

  it("ATKが0未満にならない", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[3] = makeChar(1, { atk: 0 });
    const state = makeState(board);
    const result = applyPendingEffect(state, "control_v2_01", 4, 3, 0);
    expect(result.board[3]?.atk).toBe(0);
  });
});

describe("applyPendingEffect: control_v2_02/04/11 actionTax追跡", () => {
  it("control_v2_02: 敵の再行動コスト+1 (actionTaxByを記録)", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[3] = makeChar(1);
    const state = makeState(board);
    const result = applyPendingEffect(state, "control_v2_02", 4, 3, 0);
    expect(result.board[3]?.status.actionTax).toBe(1);
    expect(result.board[3]?.status.actionTaxBy).toBe("control_v2_02");
  });

  it("control_v2_04: 再行動コスト+1", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[3] = makeChar(1);
    const state = makeState(board);
    const result = applyPendingEffect(state, "control_v2_04", 4, 3, 0);
    expect(result.board[3]?.status.actionTax).toBe(1);
    expect(result.board[3]?.status.actionTaxBy).toBe("control_v2_04");
  });

  it("control_v2_11: 再行動コスト+1", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[3] = makeChar(1);
    const state = makeState(board);
    const result = applyPendingEffect(state, "control_v2_11", 4, 3, 0);
    expect(result.board[3]?.status.actionTax).toBe(1);
  });
});

describe("applyPendingEffect: control_v2_03 ATK-2", () => {
  it("敵のATKを2下げる", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[3] = makeChar(1, { atk: 3 });
    const state = makeState(board);
    const result = applyPendingEffect(state, "control_v2_03", 4, 3, 0);
    expect(result.board[3]?.atk).toBe(1);
  });
});

describe("applyPendingEffect: control_v2_07 洗脳+隣接ATK-1", () => {
  it("対象を洗脳し隣接敵ATK-1", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0); // 召喚者
    board[1] = makeChar(1, { atk: 3 }); // 洗脳対象（召喚者の隣接）
    board[3] = makeChar(1, { atk: 3 }); // 隣接敵（召喚者の隣接）
    const state = makeState(board);
    const result = applyPendingEffect(state, "control_v2_07", 4, 1, 0);
    expect(result.board[1]?.status.brainwashedTurns).toBe(3);
    expect(result.board[1]?.status.brainwashedBy).toBe("control_v2_07");
    expect(result.board[3]?.atk).toBe(2); // 隣接敵ATK-1
  });
});

describe("applyPendingEffect: control_v2_10 ATK-1+条件ドロー・ダメ", () => {
  it("ATK-1のみ（デバフ0体）", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[3] = makeChar(1, { atk: 3, baseAtk: 3 }); // 対象
    const state = makeState(board, {
      players: [makePlayer({ deck: ["c1"], hand: [] }), makePlayer()],
    });
    const result = applyPendingEffect(state, "control_v2_10", 4, 3, 0);
    expect(result.board[3]?.atk).toBe(2);
    expect(result.players[0].hand).toHaveLength(0); // ドローなし
  });

  it("デバフ1体以上でドロー", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[3] = makeChar(1, { atk: 1, baseAtk: 3 }); // 対象（already debuffed）
    board[5] = makeChar(1, { atk: 2, baseAtk: 3 }); // 別のデバフ済み敵
    const state = makeState(board, {
      players: [makePlayer({ deck: ["c1", "c2"], hand: [] }), makePlayer()],
    });
    const result = applyPendingEffect(state, "control_v2_10", 4, 3, 0);
    expect(result.players[0].hand).toHaveLength(1); // 1ドロー
  });

  it("デバフ3体以上で1ダメ追加", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[3] = makeChar(1, { atk: 1, baseAtk: 3, hp: 3 }); // 対象
    board[5] = makeChar(1, { atk: 1, baseAtk: 3 });
    board[6] = makeChar(1, { atk: 1, baseAtk: 3 });
    const state = makeState(board, {
      players: [makePlayer({ deck: ["c1"], hand: [] }), makePlayer()],
    });
    const result = applyPendingEffect(state, "control_v2_10", 4, 3, 0);
    // ATK-1 → atk=0 (debuff count was 3)
    // debuffCount = 3 (3体) → 1ダメ追加
    expect(result.board[3]?.hp).toBe(2); // 3 - 1 = 2
  });
});

describe("applyPendingEffect: control_v2_05/08 90°回転", () => {
  it("control_v2_05: 隣接敵を90°回転", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    board[3] = makeChar(1, { dir: 0 });
    const state = makeState(board);
    const result = applyPendingEffect(state, "control_v2_05", 4, 3, 0);
    expect(result.board[3]?.dir).toBe(1);
  });
});

describe("applyPendingEffect: 未実装cardId", () => {
  it("未知のカードIDはログを残してstateを返す", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    const state = makeState(board);
    const result = applyPendingEffect(state, "unknown_card", 4, 4, 0);
    expect(result.log.length).toBeGreaterThan(0);
  });
});

// ============================================================
// applyDiscardEffect
// ============================================================

describe("applyDiscardEffect: discarded=false は何もしない", () => {
  it("discarded=falseは状態を返す", () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board);
    const result = applyDiscardEffect(state, "trick_v2_03", 4, 0, false);
    expect(result).toBe(state); // 同じ参照
  });
});

describe("applyDiscardEffect: trick_v2_03 マナ+1", () => {
  it("捨て時にマナ+1", () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board, {
      players: [makePlayer({ mana: 2 }), makePlayer()],
    });
    const result = applyDiscardEffect(state, "trick_v2_03", 4, 0, true);
    expect(result.players[0].mana).toBe(3);
  });
});

describe("applyDiscardEffect: snipe_v2_07 2ドロー", () => {
  it("捨て時に2ドロー", () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board, {
      players: [
        makePlayer({ deck: ["c1", "c2", "c3"], hand: [] }),
        makePlayer(),
      ],
    });
    const result = applyDiscardEffect(state, "snipe_v2_07", 4, 0, true);
    expect(result.players[0].hand).toHaveLength(2);
  });
});

describe("applyDiscardEffect: aggro_v2_10 効果なし", () => {
  it("mandatory discardなので効果なし（状態そのまま）", () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board);
    const result = applyDiscardEffect(state, "aggro_v2_10", 4, 0, true);
    expect(result.log).toHaveLength(0); // ログ追加なし
  });
});

describe("applyDiscardEffect: aggro_v2_03 後退", () => {
  it("隣接敵を後退させる", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0); // 召喚者
    // 召喚者idx=4の隣接 (1,3,5,7) に敵
    board[3] = makeChar(1, { dir: 1 }); // RIGHT向き idx=3(row=1,col=0) → 後退=dir 1→後ろ=左→col-1→盤外 → null
    // 別ケース: idx=1(row=0,col=1)に敵、UP向き → 後退=row+1=row1,col1=idx4 → 被ってるからnull
    // 正常ケース: idx=5(row=1,col=2)に敵、RIGHT向き → 後退=left=col-1=col1=idx4 ... 被る
    // さらに別: idx=5(row=1,col=2) RIGHT向き(dir=1) → 後退は左方向=col2-1=col1 → idx=4が被る
    // idx=7(row=2,col=1) UP向き → 後退=row+1=3→盤外
    // Let's use idx=1, DOWN向き(dir=2) → 後退=上方向=row-1=row(-1)→盤外
    // 使える例: idx=3(row=1,col=0) UP向き(dir=0) → 後退=row+1=2,col=0=idx6
    board[3] = makeChar(1, { dir: 0 }); // UP向き idx=3 → 後退=idx6
    const state = makeState(board);
    const result = applyDiscardEffect(state, "aggro_v2_03", 4, 0, true);
    expect(result.board[3]).toBeNull(); // 移動済み
    expect(result.board[6]).not.toBeNull(); // 後退先
  });

  it("後退できる敵がいない場合は効果なし", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    // 隣接に敵なし
    const state = makeState(board);
    const result = applyDiscardEffect(state, "aggro_v2_03", 4, 0, true);
    expect(result.log.length).toBeGreaterThan(0);
  });
});
