import { describe, expect, it } from "vitest";
import type { EffectClause } from "../src/engine/effectSpecs.js";
import {
  applyAutoEffects,
  getSummonEffect,
  resolveSummonAutoAttack,
} from "../src/engine/effects.js";
import type { CharCardDef } from "../src/engine/gamestate.js";
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

function emptyBoard(): Board {
  return Array(9).fill(null);
}

function makeState(
  board: Board,
  players?: [PlayerState, PlayerState],
): GameState {
  return {
    turn: 0,
    active: 0,
    players: players ?? [makePlayer(), makePlayer()],
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
  };
}

function makeDef(opts: Partial<CharCardDef> = {}): CharCardDef {
  return {
    id: "aggro_v2_01",
    name: "テスト",
    faction: "aggro",
    cost: 2,
    vp: 1,
    hp: 3,
    atk: 2,
    reactivation_cost: 2,
    attribute: "拳",
    attack_cells: [[1, 0]],
    attack_type: "物理",
    keywords: [],
    effect: "",
    ult: null,
    ...opts,
  };
}

// ============================================================
// getSummonEffect
// ============================================================
describe("getSummonEffect", () => {
  it("未登録IDはclauses=[]・hasPending=false", () => {
    const spec = getSummonEffect("nonexistent_v2_01");
    expect(spec.clauses).toHaveLength(0);
    expect(spec.hasPending).toBe(false);
  });

  it("select_* target を持つカードはhasPending=true", () => {
    expect(getSummonEffect("control_v2_01").hasPending).toBe(true);
    expect(getSummonEffect("synergy_v2_01").hasPending).toBe(true);
    expect(getSummonEffect("trick_v2_01").hasPending).toBe(true);
  });

  it("select_* なしのカードはhasPending=false", () => {
    expect(getSummonEffect("tank_v2_02").hasPending).toBe(false);
    expect(getSummonEffect("tank_v2_05").hasPending).toBe(false);
    expect(getSummonEffect("synergy_v2_07").hasPending).toBe(false);
  });

  it("discard コストのみのカードはhasPending=true", () => {
    expect(getSummonEffect("aggro_v2_03").hasPending).toBe(true);
    expect(getSummonEffect("snipe_v2_07").hasPending).toBe(true);
  });

  it("aggro_v2_10 はhasPending=true（costMandatory discard）", () => {
    expect(getSummonEffect("aggro_v2_10").hasPending).toBe(true);
  });

  it("tank_v2_02 のclauses: give_marker adj_allies protection", () => {
    const { clauses } = getSummonEffect("tank_v2_02");
    expect(clauses[0]?.effects[0]).toMatchObject({
      type: "give_marker",
      target: "adj_allies",
      marker: "protection",
    });
  });

  it("synergy_v2_07 のclauses: atk_delta adj_allies +1", () => {
    const { clauses } = getSummonEffect("synergy_v2_07");
    expect(clauses[0]?.effects[0]).toMatchObject({
      type: "atk_delta",
      target: "adj_allies",
      delta: 1,
    });
  });
});

// ============================================================
// applyAutoEffects — give_marker (adj_allies)
// ============================================================
describe("applyAutoEffects: give_marker adj_allies", () => {
  const fx: EffectClause[] = [
    {
      trigger: "on_summon",
      effects: [
        { type: "give_marker", target: "adj_allies", marker: "protection" },
      ],
    },
  ];

  it("隣接する味方に protection マーカーを付与", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0);
    board[3] = makeChar(0);

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[1]?.markers.protection).toBe(1);
    expect(nb[3]?.markers.protection).toBe(1);
    expect(nb[4]?.markers.protection).toBe(0);
  });

  it("斜めのマスは対象外", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[0] = makeChar(0); // diagonal

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[0]?.markers.protection).toBe(0);
  });

  it("隣接する敵には付与しない", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(1); // enemy

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[1]?.markers.protection).toBe(0);
  });

  it("既存のマーカーに積み重ね可能", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, {
      markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0, aim: 0 },
    });

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[1]?.markers.protection).toBe(2);
  });

  it("元の board を変更しない（immutability）", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0);
    const origProt = board[1]?.markers.protection;

    applyAutoEffects(makeState(board), 4, 0, fx);
    expect(board[1]?.markers.protection).toBe(origProt);
  });
});

// ============================================================
// applyAutoEffects — give_marker (self_and_adj_allies)
// ============================================================
describe("applyAutoEffects: give_marker self_and_adj_allies", () => {
  const fx: EffectClause[] = [
    {
      trigger: "on_summon",
      effects: [
        {
          type: "give_marker",
          target: "self_and_adj_allies",
          marker: "protection",
        },
      ],
    },
  ];

  it("summoner 自身と隣接味方に protection を付与", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0);

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[4]?.markers.protection).toBe(1);
    expect(nb[1]?.markers.protection).toBe(1);
  });
});

// ============================================================
// applyAutoEffects — give_marker (self)
// ============================================================
describe("applyAutoEffects: give_marker self", () => {
  const fx: EffectClause[] = [
    {
      trigger: "on_summon",
      effects: [{ type: "give_marker", target: "self", marker: "protection" }],
    },
  ];

  it("summoner 自身のみに protection を付与", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0);

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[4]?.markers.protection).toBe(1);
    expect(nb[1]?.markers.protection).toBe(0);
  });
});

// ============================================================
// applyAutoEffects — heal (adj_allies)
// ============================================================
describe("applyAutoEffects: heal adj_allies", () => {
  const fx: EffectClause[] = [
    {
      trigger: "on_summon",
      effects: [{ type: "heal", target: "adj_allies", amount: 2 }],
    },
  ];

  it("隣接味方を amount 回復", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { hp: 1, maxHp: 3 });

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[1]?.hp).toBe(3);
  });

  it("maxHp を超えない", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { hp: 3, maxHp: 3 });

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[1]?.hp).toBe(3);
  });

  it("summoner 自身は回復しない", () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { hp: 1, maxHp: 5 });

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[4]?.hp).toBe(1);
  });

  it("隣接敵は回復しない", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(1, { hp: 1, maxHp: 3 });

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[1]?.hp).toBe(1);
  });
});

// ============================================================
// applyAutoEffects — atk_delta (adj_allies)
// ============================================================
describe("applyAutoEffects: atk_delta adj_allies", () => {
  const fxPlus: EffectClause[] = [
    {
      trigger: "on_summon",
      effects: [{ type: "atk_delta", target: "adj_allies", delta: 1 }],
    },
  ];
  const fxMinus: EffectClause[] = [
    {
      trigger: "on_summon",
      effects: [{ type: "atk_delta", target: "adj_allies", delta: -1 }],
    },
  ];

  it("隣接味方の ATK を +1", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { atk: 2 });

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fxPlus);
    expect(nb[1]?.atk).toBe(3);
  });

  it("隣接敵の ATK は変わらない", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(1, { atk: 2 });

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fxPlus);
    expect(nb[1]?.atk).toBe(2);
  });

  it("ATK が 0 以下にはならない（デバフの場合）", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { atk: 0 });

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fxMinus);
    expect(nb[1]?.atk).toBe(0);
  });
});

// ============================================================
// applyAutoEffects — hp_delta (adj_enemies = ダメージ)
// ============================================================
describe("applyAutoEffects: hp_delta adj_enemies", () => {
  const fx: EffectClause[] = [
    {
      trigger: "on_summon",
      effects: [{ type: "hp_delta", target: "adj_enemies", amount: -3 }],
    },
  ];

  it("隣接する敵に 3 ダメージ", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(1, { hp: 5, maxHp: 5 });

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[1]?.hp).toBe(2);
  });

  it("HP が 0 以下になったら撃破（null）", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(1, { hp: 3, maxHp: 3 });

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[1]).toBeNull();
  });

  it("隣接する味方はダメージを受けない", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { hp: 3, maxHp: 3 });

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[1]?.hp).toBe(3);
  });
});

// ============================================================
// applyAutoEffects — mana_steal
// ============================================================
describe("applyAutoEffects: mana_steal", () => {
  const fx: EffectClause[] = [
    { trigger: "on_summon", effects: [{ type: "mana_steal", amount: 2 }] },
  ];

  it("相手から 2 マナ奪う（十分あれば）", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    const players: [PlayerState, PlayerState] = [
      makePlayer({ mana: 3 }),
      makePlayer({ mana: 5 }),
    ];

    const { players: np } = applyAutoEffects(
      makeState(board, players),
      4,
      0,
      fx,
    );
    expect(np[0].mana).toBe(5);
    expect(np[1].mana).toBe(3);
  });

  it("相手のマナが足りない場合は持っている分だけ奪う", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    const players: [PlayerState, PlayerState] = [
      makePlayer({ mana: 0 }),
      makePlayer({ mana: 1 }),
    ];

    const { players: np } = applyAutoEffects(
      makeState(board, players),
      4,
      0,
      fx,
    );
    expect(np[0].mana).toBe(1);
    expect(np[1].mana).toBe(0);
  });

  it("P1がsummonerの場合はP0から奪う", () => {
    const board = emptyBoard();
    board[4] = makeChar(1);
    const players: [PlayerState, PlayerState] = [
      makePlayer({ mana: 4 }),
      makePlayer({ mana: 1 }),
    ];

    const { players: np } = applyAutoEffects(
      makeState(board, players),
      4,
      1,
      fx,
    );
    expect(np[1].mana).toBe(3);
    expect(np[0].mana).toBe(2);
  });
});

// ============================================================
// applyAutoEffects — 条件付き（marker_ally_count_gte）
// ============================================================
describe("applyAutoEffects: 条件 marker_ally_count_gte", () => {
  const fx: EffectClause[] = [
    {
      trigger: "on_summon",
      condition: { type: "marker_ally_count_gte", min: 3 },
      effects: [{ type: "atk_delta", target: "adj_allies", delta: 1 }],
    },
  ];

  it("マーカー持ち味方が3体以上 → 効果発動", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { atk: 2 });
    board[0] = makeChar(0, {
      markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0, aim: 0 },
    });
    board[2] = makeChar(0, {
      markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0, aim: 0 },
    });
    board[6] = makeChar(0, {
      markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0, aim: 0 },
    });

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[1]?.atk).toBe(3);
  });

  it("マーカー持ち味方が 2体 → 効果は発動しない", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { atk: 2 });
    board[0] = makeChar(0, {
      markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0, aim: 0 },
    });
    board[2] = makeChar(0, {
      markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0, aim: 0 },
    });

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[1]?.atk).toBe(2);
  });

  it("永続キーワードもマーカーバフとしてカウント", () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { atk: 2 });
    board[0] = makeChar(0, { keywords: ["防護"] });
    board[2] = makeChar(0, { keywords: ["先制"] });
    board[6] = makeChar(0, { keywords: ["回避"] });

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[1]?.atk).toBe(3);
  });
});

// ============================================================
// applyAutoEffects — 複合エフェクト（多段）
// ============================================================
describe("applyAutoEffects: 複数 clause・複数 effects", () => {
  it("heal + give_marker を同一 clause に並べて適用", () => {
    const fx: EffectClause[] = [
      {
        trigger: "on_summon",
        effects: [
          { type: "heal", target: "adj_allies", amount: 2 },
          { type: "give_marker", target: "adj_allies", marker: "protection" },
        ],
      },
    ];
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { hp: 1, maxHp: 3 });

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[1]?.hp).toBe(3);
    expect(nb[1]?.markers.protection).toBe(1);
  });

  it("複数の独立 clause を順番に適用", () => {
    const fx: EffectClause[] = [
      {
        trigger: "on_summon",
        effects: [{ type: "heal", target: "adj_allies", amount: 1 }],
      },
      {
        trigger: "on_summon",
        effects: [
          { type: "give_marker", target: "self", marker: "protection" },
        ],
      },
    ];
    const board = emptyBoard();
    board[4] = makeChar(0, { hp: 2, maxHp: 3 });
    board[1] = makeChar(0, { hp: 1, maxHp: 3 });

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[1]?.hp).toBe(2); // healされた
    expect(nb[4]?.markers.protection).toBe(1); // give_markerされた
  });
});

// ============================================================
// applyAutoEffects — フィルタリング
// ============================================================
describe("applyAutoEffects: フィルタリング", () => {
  it("select_* target を持つ clause はスキップされる", () => {
    const fx: EffectClause[] = [
      {
        trigger: "on_summon",
        effects: [
          { type: "give_marker", target: "select_ally", marker: "protection" },
        ],
      },
    ];
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0);

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[1]?.markers.protection).toBe(0);
  });

  it("discard cost を持つ clause はスキップされる", () => {
    const fx: EffectClause[] = [
      {
        trigger: "on_summon",
        cost: { type: "discard", count: 1 },
        effects: [
          { type: "give_marker", target: "adj_allies", marker: "protection" },
        ],
      },
    ];
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0);

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[1]?.markers.protection).toBe(0);
  });

  it("on_summon 以外のトリガーはスキップされる", () => {
    const fx: EffectClause[] = [
      {
        trigger: "on_attack",
        effects: [
          { type: "give_marker", target: "adj_allies", marker: "protection" },
        ],
      },
      {
        trigger: "passive",
        effects: [
          { type: "give_marker", target: "adj_allies", marker: "evasion" },
        ],
      },
    ];
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0);

    const { board: nb } = applyAutoEffects(makeState(board), 4, 0, fx);
    expect(nb[1]?.markers.protection).toBe(0);
    expect(nb[1]?.markers.evasion).toBe(0);
  });
});

// ============================================================
// resolveSummonAutoAttack
// ============================================================
describe("resolveSummonAutoAttack", () => {
  // デフォルト: コスト1、反撃不可（attackCells=null）
  const noCost = (_: string) => ({
    cost: 1,
    attackCells: null as "all" | null | [number, number][],
    weaknessCells: [[-1, 0]] as [number, number][],
  });

  it("攻撃範囲に敵がいなければ攻撃しない", () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { dir: 0 });

    const def = makeDef({ attack_cells: [[1, 0]] });
    const { results } = resolveSummonAutoAttack(
      board,
      4,
      def,
      [false, false],
      noCost,
    );
    expect(results).toHaveLength(0);
  });

  it("攻撃範囲に敵がいれば攻撃する", () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { dir: 0, atk: 2 });
    board[1] = makeChar(1, { hp: 5, maxHp: 5, dir: 2 });

    const def = makeDef({ attack_cells: [[1, 0]] });
    const { board: nb, results } = resolveSummonAutoAttack(
      board,
      4,
      def,
      [false, false],
      noCost,
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.targetIdx).toBe(1);
    expect(nb[1]?.hp).toBe(3);
  });

  it("複数の攻撃範囲マスに敵がいれば全て攻撃", () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { dir: 0, atk: 2 });
    board[1] = makeChar(1, { hp: 5, maxHp: 5 });
    board[5] = makeChar(1, { hp: 5, maxHp: 5 });

    const def = makeDef({
      attack_cells: [
        [1, 0],
        [0, 1],
      ],
    });
    const { results } = resolveSummonAutoAttack(
      board,
      4,
      def,
      [false, false],
      noCost,
    );
    expect(results).toHaveLength(2);
  });

  it("attack_cells=null のキャラは攻撃しない", () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { dir: 0 });
    board[1] = makeChar(1, { hp: 3 });

    const def = makeDef({ attack_cells: null });
    const { results } = resolveSummonAutoAttack(
      board,
      4,
      def,
      [false, false],
      noCost,
    );
    expect(results).toHaveLength(0);
  });

  it("魔法（attack_cells=all）は全敵を攻撃", () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { dir: 0, atk: 1 });
    board[0] = makeChar(1, { hp: 3 });
    board[8] = makeChar(1, { hp: 3 });

    const def = makeDef({ attack_cells: "all", attack_type: "魔法" });
    const { results } = resolveSummonAutoAttack(
      board,
      4,
      def,
      [false, false],
      noCost,
    );
    expect(results).toHaveLength(2);
  });

  it("teamDR が有効なら敵はダメージ-1", () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { dir: 0, atk: 3 });
    board[1] = makeChar(1, { hp: 5, maxHp: 5, dir: 2 });

    const def = makeDef({ attack_cells: [[1, 0]] });
    const { board: nb } = resolveSummonAutoAttack(
      board,
      4,
      def,
      [false, true],
      noCost,
    );
    expect(nb[1]?.hp).toBe(3); // 5 - (3-1) = 3
  });

  it("攻撃者が反撃で撃破されたら以降の攻撃をスキップ", () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { dir: 0, atk: 1, hp: 1, maxHp: 1 });
    board[1] = makeChar(1, { hp: 5, maxHp: 5, atk: 2, dir: 2, keywords: [] });
    board[5] = makeChar(1, { hp: 5, maxHp: 5 });

    const def = makeDef({
      attack_cells: [
        [1, 0],
        [0, 1],
      ],
    });
    // P2(idx=1,DOWN) が反撃できるよう attackCells=[[1,0]] を返す
    const withCounter = (_: string) => ({
      cost: 1,
      attackCells: [[1, 0]] as [number, number][],
      weaknessCells: [[-1, 0]] as [number, number][],
    });
    const { board: nb, results } = resolveSummonAutoAttack(
      board,
      4,
      def,
      [false, false],
      withCounter,
    );
    expect(nb[4]).toBeNull();
    expect(results).toHaveLength(1);
    expect(nb[5]?.hp).toBe(5);
  });
});
