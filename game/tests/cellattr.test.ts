import { describe, expect, it } from "vitest";
import { applyCellAttrChange } from "../src/engine/effects.js";
import type { CharInstance, GameState, PlayerState } from "../src/engine/types.js";

function makePlayer(opts: Partial<PlayerState> = {}): PlayerState {
  return {
    factions: [],
    itemSet: "",
    vp: 0,
    mana: 0,
    hand: [],
    deck: [],
    discard: [],
    ...opts,
  };
}

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
      skipNextTurn: 0,
    },
    tempAtkBuff: 0,
    ...opts,
  };
}

function makeState(opts: Partial<GameState> = {}): GameState {
  return {
    turn: 0,
    active: 0,
    players: [makePlayer(), makePlayer()],
    board: Array(9).fill(null),
    boardAttrs: ["拳", "拳", "念", "念", "光", "光", "闇", "闇", "虚"],
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

describe("applyCellAttrChange", () => {
  it("空マスの属性が変わる", () => {
    const state = makeState();
    const result = applyCellAttrChange(state, 0, "光");
    expect(result.boardAttrs[0]).toBe("光");
  });

  it("同じ属性への変更は何もしない", () => {
    const state = makeState({ boardAttrs: ["拳", "拳", "念", "念", "光", "光", "闇", "闇", "虚"] });
    const result = applyCellAttrChange(state, 0, "拳");
    expect(result.boardAttrs[0]).toBe("拳");
    expect(result.log).toHaveLength(0);
  });

  it("同属性キャラがいるマスに変更 → HP+2（maxHp上限）", () => {
    // aggro_v2_01 is 拳属性
    const board = Array(9).fill(null) as (CharInstance | null)[];
    board[2] = makeChar(0, "aggro_v2_01", { hp: 3, maxHp: 5 });
    const state = makeState({ board, boardAttrs: ["拳", "拳", "闇", "念", "光", "光", "闇", "闇", "虚"] });
    // セル2は闇→拳に変更。キャラ(aggro_v2_01=拳)がいる
    const result = applyCellAttrChange(state, 2, "拳");
    expect(result.boardAttrs[2]).toBe("拳");
    expect(result.board[2]?.hp).toBe(5); // 3+2=5
  });

  it("同属性キャラHP+2はmaxHpでキャップ", () => {
    const board = Array(9).fill(null) as (CharInstance | null)[];
    board[0] = makeChar(0, "aggro_v2_01", { hp: 4, maxHp: 5 });
    const state = makeState({ board, boardAttrs: ["光", "拳", "念", "念", "光", "光", "闇", "闇", "虚"] });
    // セル0は光→拳。キャラ(拳属性)
    const result = applyCellAttrChange(state, 0, "拳");
    expect(result.board[0]?.hp).toBe(5); // min(4+2, 5)=5
  });

  it("対立属性キャラがいるマスに変更 → HP-2", () => {
    // aggro_v2_01 は拳属性。念マスに変更すると対立→HP-2
    const board = Array(9).fill(null) as (CharInstance | null)[];
    board[0] = makeChar(0, "aggro_v2_01", { hp: 5, maxHp: 5 });
    const state = makeState({ board, boardAttrs: ["拳", "拳", "念", "念", "光", "光", "闇", "闇", "虚"] });
    const result = applyCellAttrChange(state, 0, "念");
    expect(result.boardAttrs[0]).toBe("念");
    expect(result.board[0]?.hp).toBe(3); // 5-2=3
  });

  it("対立属性でHP-2 → 0以下になれば撃破", () => {
    const board = Array(9).fill(null) as (CharInstance | null)[];
    board[0] = makeChar(0, "aggro_v2_01", { hp: 1, maxHp: 3 });
    const state = makeState({ board, boardAttrs: ["拳", "拳", "念", "念", "光", "光", "闇", "闇", "虚"] });
    const result = applyCellAttrChange(state, 0, "念");
    expect(result.board[0]).toBeNull(); // 撃破
    expect(result.boardAttrs[0]).toBe("念");
  });

  it("虚マスに変更 → キャラへのHP変化なし", () => {
    const board = Array(9).fill(null) as (CharInstance | null)[];
    board[0] = makeChar(0, "aggro_v2_01", { hp: 3, maxHp: 5 });
    const state = makeState({ board, boardAttrs: ["拳", "拳", "念", "念", "光", "光", "闇", "闇", "虚"] });
    const result = applyCellAttrChange(state, 0, "虚");
    expect(result.boardAttrs[0]).toBe("虚");
    expect(result.board[0]?.hp).toBe(3); // no change
  });

  it("虚属性キャラがいるマスを変更 → HP変化なし", () => {
    const board = Array(9).fill(null) as (CharInstance | null)[];
    // snipe_v2_02 is 虚属性
    board[8] = makeChar(0, "snipe_v2_02", { hp: 2, maxHp: 2 });
    const state = makeState({ board, boardAttrs: ["拳", "拳", "念", "念", "光", "光", "闇", "闇", "虚"] });
    const result = applyCellAttrChange(state, 8, "拳");
    expect(result.boardAttrs[8]).toBe("拳");
    expect(result.board[8]?.hp).toBe(2); // 虚属性キャラはHP変化なし
  });

  it("関係なし属性（同でも対立でもない）→ HP変化なし", () => {
    // aggro_v2_01 は拳属性。拳の対立は念。光は無関係
    const board = Array(9).fill(null) as (CharInstance | null)[];
    board[0] = makeChar(0, "aggro_v2_01", { hp: 3, maxHp: 5 });
    const state = makeState({ board, boardAttrs: ["闇", "拳", "念", "念", "光", "光", "闇", "闇", "虚"] });
    const result = applyCellAttrChange(state, 0, "光");
    expect(result.boardAttrs[0]).toBe("光");
    expect(result.board[0]?.hp).toBe(3); // 変化なし
  });
});
