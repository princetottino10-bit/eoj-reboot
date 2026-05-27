import { describe, expect, it } from "vitest";
import { applyItemEffect } from "../src/engine/items.js";
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
    cardId: "aggro_v2_01",
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
    skipNextTurn: false,
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
// item_03: HP+3
// ============================================================
describe("item_03: HP+3", () => {
  it("味方のHPが3回復する", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, { hp: 1, maxHp: 5 });
    const state = makeState(board);
    const result = applyItemEffect(state, "item_03", 4, 0);
    expect(result.board[4]?.hp).toBe(4);
  });

  it("maxHpを超えない", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, { hp: 2, maxHp: 3 });
    const state = makeState(board);
    const result = applyItemEffect(state, "item_03", 4, 0);
    expect(result.board[4]?.hp).toBe(3);
  });

  it("敵には効果なし", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { hp: 1, maxHp: 5 }); // P1のキャラ
    const state = makeState(board);
    const result = applyItemEffect(state, "item_03", 4, 0); // P0が使用
    expect(result.board[4]?.hp).toBe(1); // 変化なし
  });
});

// ============================================================
// item_heroize: 英雄化 (ATK+1永続 + quickness)
// ============================================================
describe("item_heroize: 英雄化", () => {
  it("味方のATKが永続+1される", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, { atk: 2 });
    const state = makeState(board);
    const result = applyItemEffect(state, "item_heroize", 4, 0);
    expect(result.board[4]?.atk).toBe(3);
  });

  it("quicknessマーカーが付与される", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    const state = makeState(board);
    const result = applyItemEffect(state, "item_heroize", 4, 0);
    expect(result.board[4]?.markers.quickness).toBe(1);
  });

  it("敵には効果なし", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { atk: 2 }); // P1
    const state = makeState(board);
    const result = applyItemEffect(state, "item_heroize", 4, 0);
    expect(result.board[4]?.atk).toBe(2); // 不変
  });
});

// ============================================================
// item_grant_piercing: 貫通マーカー
// ============================================================
describe("item_grant_piercing: 貫通マーカー付与", () => {
  it("味方に貫通マーカーを付与", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    const state = makeState(board);
    const result = applyItemEffect(state, "item_grant_piercing", 4, 0);
    expect(result.board[4]?.markers.piercing).toBe(1);
  });

  it("既存の貫通マーカーに積み重なる", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, {
      markers: { protection: 0, evasion: 0, piercing: 2, quickness: 0, aim: 0 },
    });
    const state = makeState(board);
    const result = applyItemEffect(state, "item_grant_piercing", 4, 0);
    expect(result.board[4]?.markers.piercing).toBe(3);
  });
});

// ============================================================
// item_grant_protection: 防護マーカー
// ============================================================
describe("item_grant_protection: 防護マーカー付与", () => {
  it("味方に防護マーカーを付与", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0);
    const state = makeState(board);
    const result = applyItemEffect(state, "item_grant_protection", 4, 0);
    expect(result.board[4]?.markers.protection).toBe(1);
  });
});

// ============================================================
// item_reactivate: 再行動可能
// ============================================================
describe("item_reactivate: 再行動可能", () => {
  it("hasActedをfalseにする", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, { hasActed: true });
    const state = makeState(board);
    const result = applyItemEffect(state, "item_reactivate", 4, 0);
    expect(result.board[4]?.hasActed).toBe(false);
  });

  it("敵には効果なし", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { hasActed: true });
    const state = makeState(board);
    const result = applyItemEffect(state, "item_reactivate", 4, 0);
    expect(result.board[4]?.hasActed).toBe(true);
  });
});

// ============================================================
// item_time_freeze: 時間凍結（相手のターンスキップ）
// ============================================================
describe("item_time_freeze: 時間凍結", () => {
  it("相手プレイヤーのskipNextTurnがtrueになる", () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board);
    const result = applyItemEffect(state, "item_time_freeze", undefined, 0);
    expect(result.players[1].skipNextTurn).toBe(true);
  });

  it("自分のskipNextTurnは変化しない", () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board);
    const result = applyItemEffect(state, "item_time_freeze", undefined, 0);
    expect(result.players[0].skipNextTurn).toBe(false);
  });
});

// ============================================================
// item_bind_ring: 呪縛の指輪 (dir_lock 1T + action_tax +2)
// ============================================================
describe("item_bind_ring: 呪縛の指輪", () => {
  it("敵のdirLockedが1になる", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1);
    const state = makeState(board);
    const result = applyItemEffect(state, "item_bind_ring", 4, 0);
    expect(result.board[4]?.status.dirLocked).toBe(1);
  });

  it("敵のactionTaxが2増える", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1);
    const state = makeState(board);
    const result = applyItemEffect(state, "item_bind_ring", 4, 0);
    expect(result.board[4]?.status.actionTax).toBe(2);
  });

  it("味方には効果なし", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0); // P0の味方
    const state = makeState(board);
    const result = applyItemEffect(state, "item_bind_ring", 4, 0);
    expect(result.board[4]?.status.dirLocked).toBe(0);
    expect(result.board[4]?.status.actionTax).toBe(0);
  });
});

// ============================================================
// item_06: 敵に3ダメ
// ============================================================
describe("item_06: 敵に3ダメ", () => {
  it("敵に3ダメージ", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { hp: 5, maxHp: 5 });
    const state = makeState(board);
    const result = applyItemEffect(state, "item_06", 4, 0);
    expect(result.board[4]?.hp).toBe(2);
  });

  it("撃破時にVP獲得とclearAffiliatedEffects", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { hp: 3, maxHp: 3, cardId: "control_v2_01" });
    // 洗脳付与者として登録
    board[1] = makeChar(0, {
      status: {
        brainwashedTurns: 2,
        brainwashedBy: "control_v2_01",
        actionTax: 0,
        actionTaxBy: null,
        dirLocked: 0,
        immune: 0,
        skipNextTurn: 0,
      },
    });
    const state = makeState(board, {
      players: [makePlayer({ vp: 0 }), makePlayer()],
    });
    const result = applyItemEffect(state, "item_06", 4, 0);
    expect(result.board[4]).toBeNull(); // 撃破
    expect(result.players[0].vp).toBe(1); // VP獲得
    expect(result.board[1]?.status.brainwashedTurns).toBe(0); // 効果クリア
    expect(result.board[1]?.status.brainwashedBy).toBeNull();
  });

  it("味方には効果なし", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, { hp: 5 });
    const state = makeState(board);
    const result = applyItemEffect(state, "item_06", 4, 0);
    expect(result.board[4]?.hp).toBe(5);
  });
});

// ============================================================
// item_14: 拘束鎖（任意方向・向き固定）
// ============================================================
describe("item_14: 拘束鎖", () => {
  it("rotate degrees:'any' のためエンジンは向きを変えない（UI側で処理）", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { dir: 0 }); // UP向き
    const state = makeState(board);
    const result = applyItemEffect(state, "item_14", 4, 0);
    expect(result.board[4]?.dir).toBe(0); // unchanged (UI側で方向確定)
  });

  it("dir_lockが1ターンセットされる", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { dir: 0 });
    const state = makeState(board);
    const result = applyItemEffect(state, "item_14", 4, 0);
    expect(result.board[4]?.status.dirLocked).toBe(1);
  });
});

// ============================================================
// item_piercing_bullet: 徹甲弾（貫通2ダメ）
// ============================================================
describe("item_piercing_bullet: 徹甲弾", () => {
  it("敵に2ダメージ", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(1, { hp: 5, maxHp: 5 });
    const state = makeState(board);
    const result = applyItemEffect(state, "item_piercing_bullet", 4, 0);
    expect(result.board[4]?.hp).toBe(3);
  });

  it("味方には効果なし", () => {
    const board: Board = Array(9).fill(null);
    board[4] = makeChar(0, { hp: 5 });
    const state = makeState(board);
    const result = applyItemEffect(state, "item_piercing_bullet", 4, 0);
    expect(result.board[4]?.hp).toBe(5);
  });
});

// ============================================================
// item_01: 2枚ドロー（即時）
// ============================================================
describe("item_01: 2枚ドロー", () => {
  it("デッキから2枚引いて手札に加える", () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board, {
      players: [
        makePlayer({ deck: ["aggro_v2_01", "tank_v2_01"], hand: [] }),
        makePlayer(),
      ],
    });
    const result = applyItemEffect(state, "item_01", undefined, 0);
    expect(result.players[0].hand.length).toBe(2);
    expect(result.players[0].deck.length).toBe(0);
  });

  it("デッキが1枚なら1枚だけドロー", () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board, {
      players: [makePlayer({ deck: ["aggro_v2_01"], hand: [] }), makePlayer()],
    });
    const result = applyItemEffect(state, "item_01", undefined, 0);
    expect(result.players[0].hand.length).toBe(1);
    expect(result.players[0].deck.length).toBe(0);
  });

  it("マナは変化しない", () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board, {
      players: [
        makePlayer({ deck: ["aggro_v2_01", "tank_v2_01"], mana: 3 }),
        makePlayer(),
      ],
    });
    const result = applyItemEffect(state, "item_01", undefined, 0);
    expect(result.players[0].mana).toBe(3);
  });
});

// ============================================================
// item_02: マナ+1（即時）
// ============================================================
describe("item_02: マナ+1", () => {
  it("使用者のマナが1増える", () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board, {
      players: [makePlayer({ mana: 2 }), makePlayer()],
    });
    const result = applyItemEffect(state, "item_02", undefined, 0);
    expect(result.players[0].mana).toBe(3);
  });

  it("相手のマナは変わらない", () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board, {
      players: [makePlayer({ mana: 0 }), makePlayer({ mana: 5 })],
    });
    const result = applyItemEffect(state, "item_02", undefined, 0);
    expect(result.players[1].mana).toBe(5);
  });
});

// ============================================================
// 未実装アイテム
// ============================================================
describe("未実装アイテム", () => {
  it("不明なitemIdはログを残して状態を返す", () => {
    const board: Board = Array(9).fill(null);
    const state = makeState(board);
    const result = applyItemEffect(state, "item_unknown", undefined, 0);
    expect(result.log.length).toBeGreaterThan(0);
  });
});
