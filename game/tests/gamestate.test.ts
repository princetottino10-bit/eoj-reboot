import { describe, expect, it } from "vitest";
import { createDraftState, makePick } from "../src/engine/draft.js";
import {
  attributeHpBonus,
  type CardDatabase,
  type CharCardDef,
  createCharInstance,
  createInitialGameState,
  STANDARD_BOARD_ATTRS,
} from "../src/engine/gamestate.js";

// ============================================================
// テスト用モックデータ
// ============================================================

function makeCharDef(opts: Partial<CharCardDef> = {}): CharCardDef {
  return {
    id: "aggro_v2_01",
    name: "テストキャラ",
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

// 最小構成の CardDatabase（2派閥×12枚 + セットAのアイテム6枚）
const MOCK_DB: CardDatabase = {
  characters: [
    ...Array.from({ length: 12 }, (_, i) =>
      makeCharDef({
        id: `aggro_v2_${String(i + 1).padStart(2, "0")}`,
        faction: "aggro",
        attribute: "拳",
      }),
    ),
    ...Array.from({ length: 12 }, (_, i) =>
      makeCharDef({
        id: `cip_v2_${String(i + 1).padStart(2, "0")}`,
        faction: "cip",
        attribute: "光",
      }),
    ),
    ...Array.from({ length: 12 }, (_, i) =>
      makeCharDef({
        id: `spell_v2_${String(i + 1).padStart(2, "0")}`,
        faction: "spell",
        attribute: "念",
      }),
    ),
    ...Array.from({ length: 12 }, (_, i) =>
      makeCharDef({
        id: `inheritance_v2_${String(i + 1).padStart(2, "0")}`,
        faction: "inheritance",
        attribute: "闇",
      }),
    ),
    ...Array.from({ length: 12 }, (_, i) =>
      makeCharDef({
        id: `mobility_v2_${String(i + 1).padStart(2, "0")}`,
        faction: "mobility",
        attribute: "虚",
      }),
    ),
    ...Array.from({ length: 12 }, (_, i) =>
      makeCharDef({
        id: `defense_v2_${String(i + 1).padStart(2, "0")}`,
        faction: "defense",
        attribute: "拳",
      }),
    ),
  ],
  items: [
    {
      id: "item_01",
      name: "テストアイテム1",
      cost: 1,
      vp: 1,
      effect: "",
      sets: ["A", "B", "C", "D"],
    },
    {
      id: "item_02",
      name: "テストアイテム2",
      cost: 1,
      vp: 1,
      effect: "",
      sets: ["A", "B", "C", "D"],
    },
    {
      id: "item_03",
      name: "テストアイテム3",
      cost: 1,
      vp: 1,
      effect: "",
      sets: ["D"],
    },
    {
      id: "item_04",
      name: "テストアイテム4",
      cost: 1,
      vp: 1,
      effect: "",
      sets: ["A", "B"],
    },
    {
      id: "item_05",
      name: "テストアイテム5",
      cost: 1,
      vp: 1,
      effect: "",
      sets: ["B", "D"],
    },
    {
      id: "item_06",
      name: "テストアイテム6",
      cost: 1,
      vp: 1,
      effect: "",
      sets: ["A", "C"],
    },
    {
      id: "item_14",
      name: "テストアイテム7",
      cost: 1,
      vp: 1,
      effect: "",
      sets: ["C"],
    },
    {
      id: "item_20",
      name: "テストアイテム8",
      cost: 1,
      vp: 1,
      effect: "",
      sets: ["A"],
    },
    {
      id: "item_bounce",
      name: "テストアイテム9",
      cost: 1,
      vp: 1,
      effect: "",
      sets: ["C"],
    },
    {
      id: "item_element",
      name: "テストアイテム10",
      cost: 1,
      vp: 1,
      effect: "",
      sets: ["A", "D"],
    },
    {
      id: "item_piercing",
      name: "テストアイテム11",
      cost: 1,
      vp: 1,
      effect: "",
      sets: ["B"],
    },
    {
      id: "item_protect",
      name: "テストアイテム12",
      cost: 1,
      vp: 1,
      effect: "",
      sets: ["B"],
    },
    {
      id: "item_reactivate",
      name: "テストアイテム13",
      cost: 1,
      vp: 1,
      effect: "",
      sets: ["C"],
    },
    {
      id: "item_selfbounce",
      name: "テストアイテム14",
      cost: 1,
      vp: 1,
      effect: "",
      sets: ["D"],
    },
  ],
};

// ドラフト完走ヘルパー
function completeDraft(
  p0factions: [string, string],
  p0item: string,
  p1factions: [string, string],
  p1item: string,
) {
  let d = createDraftState();
  d = makePick(d, p0factions[0]); // P1: faction
  d = makePick(d, p1factions[0]); // P2: faction
  d = makePick(d, p1factions[1]); // P2: faction
  d = makePick(d, p0factions[1]); // P1: faction
  d = makePick(d, p0item); // P1: itemSet
  d = makePick(d, p1item); // P2: itemSet
  return d;
}

// ============================================================
// STANDARD_BOARD_ATTRS
// ============================================================
describe("STANDARD_BOARD_ATTRS", () => {
  it("9マス分ある", () => {
    expect(STANDARD_BOARD_ATTRS).toHaveLength(9);
  });
  it("火×2, 水×2, 土×2, 木×2, 無×1", () => {
    const counts = STANDARD_BOARD_ATTRS.reduce<Record<string, number>>(
      (acc, a) => {
        acc[a] = (acc[a] ?? 0) + 1;
        return acc;
      },
      {},
    );
    expect(counts.火).toBe(2);
    expect(counts.水).toBe(2);
    expect(counts.土).toBe(2);
    expect(counts.木).toBe(2);
    expect(counts.無).toBe(1);
  });
});

// ============================================================
// attributeHpBonus
// ============================================================
describe("attributeHpBonus", () => {
  it("同属性 → +2", () => {
    expect(attributeHpBonus("火", "火")).toBe(2);
    expect(attributeHpBonus("土", "土")).toBe(2);
  });
  it("対立属性 火⇔水 → -2", () => {
    expect(attributeHpBonus("火", "水")).toBe(-2);
    expect(attributeHpBonus("水", "火")).toBe(-2);
  });
  it("対立属性 土⇔木 → -2", () => {
    expect(attributeHpBonus("土", "木")).toBe(-2);
    expect(attributeHpBonus("木", "土")).toBe(-2);
  });
  it("キャラが無 → 常に 0（対立関係なし）", () => {
    expect(attributeHpBonus("無", "火")).toBe(0);
    expect(attributeHpBonus("無", "無")).toBe(0);
  });
  it("マスが無 → 常に 0", () => {
    expect(attributeHpBonus("火", "無")).toBe(0);
    expect(attributeHpBonus("土", "無")).toBe(0);
  });
  it("無関係な属性の組み合わせ → 0", () => {
    expect(attributeHpBonus("火", "土")).toBe(0);
    expect(attributeHpBonus("水", "木")).toBe(0);
  });
});

// ============================================================
// createCharInstance
// ============================================================
describe("createCharInstance", () => {
  const def = makeCharDef({ hp: 4, atk: 3, keywords: ["防護", "先制"] });

  it("hp と maxHp が def.hp と一致", () => {
    const c = createCharInstance(def, 0, 0);
    expect(c.hp).toBe(4);
    expect(c.maxHp).toBe(4);
  });
  it("atk と baseAtk が def.atk と一致", () => {
    const c = createCharInstance(def, 0, 0);
    expect(c.atk).toBe(3);
    expect(c.baseAtk).toBe(3);
  });
  it("キーワードが def.keywords と一致", () => {
    const c = createCharInstance(def, 0, 0);
    expect(c.keywords).toEqual(["防護", "先制"]);
  });
  it("キーワードは独立コピー（def を共有しない）", () => {
    const c = createCharInstance(def, 0, 0);
    c.keywords.push("貫通");
    expect(def.keywords).toHaveLength(2);
  });
  it("owner が正しく設定される", () => {
    expect(createCharInstance(def, 0, 2).owner).toBe(0);
    expect(createCharInstance(def, 1, 2).owner).toBe(1);
  });
  it("dir が正しく設定される", () => {
    expect(createCharInstance(def, 0, 2).dir).toBe(2);
  });
  it("hasActed / hasRotated / ultUsed はすべて false", () => {
    const c = createCharInstance(def, 0, 0);
    expect(c.hasActed).toBe(false);
    expect(c.hasRotated).toBe(false);
    expect(c.ultUsed).toBe(false);
  });
  it("全マーカーが 0", () => {
    const c = createCharInstance(def, 0, 0);
    expect(c.markers).toEqual({
      protection: 0,
      evasion: 0,
      piercing: 0,
      quickness: 0,
      aim: 0,
    });
  });

  it("tempAtkBuff が 0", () => {
    const c = createCharInstance(def, 0, 0);
    expect(c.tempAtkBuff).toBe(0);
  });
  it("全ステータス効果が初期値", () => {
    const c = createCharInstance(def, 0, 0);
    expect(c.status).toEqual({
      brainwashedTurns: 0,
      brainwashedBy: null,
      actionTax: 0,
      actionTaxBy: null,
      dirLocked: 0,
      immune: 0,
    });
  });
});

// ============================================================
// createInitialGameState
// ============================================================
describe("createInitialGameState", () => {
  const FIXED_ATTRS = ["拳", "念", "光", "闇", "虚", "拳", "念", "光", "闇"];
  const draft = completeDraft(
    ["aggro", "cip"],
    "A",
    ["spell", "inheritance"],
    "B",
  );

  it("盤面は全マス null", () => {
    const state = createInitialGameState(draft, MOCK_DB, {
      boardAttrs: FIXED_ATTRS,
    });
    expect(state.board).toHaveLength(9);
    expect(state.board.every((c) => c === null)).toBe(true);
  });

  it("マナは両プレイヤーとも 0", () => {
    const state = createInitialGameState(draft, MOCK_DB, {
      boardAttrs: FIXED_ATTRS,
    });
    expect(state.players[0].mana).toBe(0);
    expect(state.players[1].mana).toBe(0);
  });

  it("VPは両プレイヤーとも 0", () => {
    const state = createInitialGameState(draft, MOCK_DB, {
      boardAttrs: FIXED_ATTRS,
    });
    expect(state.players[0].vp).toBe(0);
    expect(state.players[1].vp).toBe(0);
  });

  it("ターン数は 0", () => {
    const state = createInitialGameState(draft, MOCK_DB, {
      boardAttrs: FIXED_ATTRS,
    });
    expect(state.turn).toBe(0);
  });

  it("デフォルトは P0 先手", () => {
    const state = createInitialGameState(draft, MOCK_DB, {
      boardAttrs: FIXED_ATTRS,
    });
    expect(state.active).toBe(0);
  });

  it("firstPlayer オプションで先手を指定できる", () => {
    const state = createInitialGameState(draft, MOCK_DB, {
      boardAttrs: FIXED_ATTRS,
      firstPlayer: 1,
    });
    expect(state.active).toBe(1);
  });

  it("各プレイヤーの手札は 5枚", () => {
    const state = createInitialGameState(draft, MOCK_DB, {
      boardAttrs: FIXED_ATTRS,
    });
    expect(state.players[0].hand).toHaveLength(5);
    expect(state.players[1].hand).toHaveLength(5);
  });

  it("各プレイヤーのデッキは 25枚（30枚 - 5枚ドロー）", () => {
    const state = createInitialGameState(draft, MOCK_DB, {
      boardAttrs: FIXED_ATTRS,
    });
    expect(state.players[0].deck).toHaveLength(25);
    expect(state.players[1].deck).toHaveLength(25);
  });

  it("手札＋デッキ＝30枚（重複なし）", () => {
    const state = createInitialGameState(draft, MOCK_DB, {
      boardAttrs: FIXED_ATTRS,
    });
    const p0All = [...state.players[0].hand, ...state.players[0].deck];
    expect(p0All).toHaveLength(30);
    expect(new Set(p0All).size).toBe(30);
  });

  it("boardAttrs の長さは 9", () => {
    const state = createInitialGameState(draft, MOCK_DB, {
      boardAttrs: FIXED_ATTRS,
    });
    expect(state.boardAttrs).toHaveLength(9);
    expect(state.boardAttrs).toEqual(FIXED_ATTRS);
  });

  it("boardAttrs 未指定時はランダム配置（長さ 9, 標準属性セット）", () => {
    const state = createInitialGameState(draft, MOCK_DB);
    expect(state.boardAttrs).toHaveLength(9);
    const sorted = [...state.boardAttrs].sort();
    expect(sorted).toEqual([...STANDARD_BOARD_ATTRS].sort());
  });

  it('winner = null, winReason = ""', () => {
    const state = createInitialGameState(draft, MOCK_DB, {
      boardAttrs: FIXED_ATTRS,
    });
    expect(state.winner).toBeNull();
    expect(state.winReason).toBe("");
  });

  it("teamDR = [false, false]", () => {
    const state = createInitialGameState(draft, MOCK_DB, {
      boardAttrs: FIXED_ATTRS,
    });
    expect(state.teamDR).toEqual([false, false]);
  });

  it("派閥情報が players に保存される", () => {
    const state = createInitialGameState(draft, MOCK_DB, {
      boardAttrs: FIXED_ATTRS,
    });
    expect(state.players[0].factions.sort()).toEqual(["aggro", "cip"]);
    expect(state.players[1].factions.sort()).toEqual(["inheritance", "spell"]);
  });

  it("アイテムセットが players に保存される", () => {
    const state = createInitialGameState(draft, MOCK_DB, {
      boardAttrs: FIXED_ATTRS,
    });
    expect(state.players[0].itemSet).toBe("A");
    expect(state.players[1].itemSet).toBe("B");
  });
});
