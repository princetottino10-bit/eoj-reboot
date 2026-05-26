import { describe, expect, it } from "vitest";
import {
  buildDeck,
  type CardData,
  createDraftState,
  currentPicker,
  currentPickType,
  DRAFT_PICK_ORDER,
  DRAFT_PICK_TYPES,
  type DraftState,
  isDraftComplete,
  makePick,
} from "../src/engine/draft.js";

// ============================================================
// テスト用カードデータ（最小構成）
// ============================================================
const MOCK_CARDS: CardData = {
  characters: [
    // aggro: 12枚
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `aggro_v2_${String(i + 1).padStart(2, "0")}`,
      faction: "aggro",
    })),
    // tank: 12枚
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `tank_v2_${String(i + 1).padStart(2, "0")}`,
      faction: "tank",
    })),
    // control: 12枚
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `control_v2_${String(i + 1).padStart(2, "0")}`,
      faction: "control",
    })),
    // synergy: 12枚
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `synergy_v2_${String(i + 1).padStart(2, "0")}`,
      faction: "synergy",
    })),
    // snipe: 12枚
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `snipe_v2_${String(i + 1).padStart(2, "0")}`,
      faction: "snipe",
    })),
    // trick: 12枚
    ...Array.from({ length: 12 }, (_, i) => ({
      id: `trick_v2_${String(i + 1).padStart(2, "0")}`,
      faction: "trick",
    })),
  ],
  items: [
    { id: "item_01", sets: ["A", "B", "C", "D"] },
    { id: "item_02", sets: ["A", "B", "C", "D"] },
    { id: "item_03", sets: ["D"] },
    { id: "item_04", sets: ["A", "B"] },
    { id: "item_05", sets: ["B", "D"] },
    { id: "item_06", sets: ["A", "C"] },
    { id: "item_14", sets: ["C"] },
    { id: "item_20", sets: ["A"] },
    { id: "item_bounce", sets: ["C"] },
    { id: "item_element", sets: ["A", "D"] },
    { id: "item_piercing", sets: ["B"] },
    { id: "item_protect", sets: ["B"] },
    { id: "item_reactivate", sets: ["C"] },
    { id: "item_selfbounce", sets: ["D"] },
  ],
};

// ============================================================
// DRAFT_PICK_ORDER / DRAFT_PICK_TYPES 定数
// ============================================================
describe("ドラフト定数", () => {
  it("DRAFT_PICK_ORDER は [0,1,1,0,0,1]", () => {
    expect(DRAFT_PICK_ORDER).toEqual([0, 1, 1, 0, 0, 1]);
  });

  it("DRAFT_PICK_TYPES は faction×4, itemSet×2", () => {
    expect(DRAFT_PICK_TYPES).toEqual([
      "faction",
      "faction",
      "faction",
      "faction",
      "itemSet",
      "itemSet",
    ]);
  });
});

// ============================================================
// createDraftState
// ============================================================
describe("createDraftState", () => {
  it("step=0 で始まる", () => {
    expect(createDraftState().step).toBe(0);
  });

  it("全7派閥が available", () => {
    const draft = createDraftState();
    expect(draft.availableFactions.sort()).toEqual([
      "aggro",
      "control",
      "geo",
      "snipe",
      "synergy",
      "tank",
      "trick",
    ]);
  });

  it("全5アイテムセットが available", () => {
    const draft = createDraftState();
    expect(draft.availableItemSets.sort()).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("各プレイヤーの選択はすべて空", () => {
    const { factions, itemSets } = createDraftState();
    expect(factions[0]).toEqual([]);
    expect(factions[1]).toEqual([]);
    expect(itemSets[0]).toBeNull();
    expect(itemSets[1]).toBeNull();
  });
});

// ============================================================
// currentPicker / currentPickType
// ============================================================
describe("currentPicker", () => {
  it("step=0: P1がピック", () => {
    expect(currentPicker(createDraftState())).toBe(0);
  });
  it("step=1: P2がピック", () => {
    const draft = { ...createDraftState(), step: 1 };
    expect(currentPicker(draft)).toBe(1);
  });
  it("step=2: P2がピック（連続）", () => {
    const draft = { ...createDraftState(), step: 2 };
    expect(currentPicker(draft)).toBe(1);
  });
  it("step=3: P1がピック", () => {
    const draft = { ...createDraftState(), step: 3 };
    expect(currentPicker(draft)).toBe(0);
  });
  it("step=4: P1がピック（連続）", () => {
    const draft = { ...createDraftState(), step: 4 };
    expect(currentPicker(draft)).toBe(0);
  });
  it("step=5: P2がピック", () => {
    const draft = { ...createDraftState(), step: 5 };
    expect(currentPicker(draft)).toBe(1);
  });
});

describe("currentPickType", () => {
  it("step 0〜3: faction", () => {
    for (let s = 0; s <= 3; s++) {
      expect(currentPickType({ ...createDraftState(), step: s })).toBe(
        "faction",
      );
    }
  });
  it("step 4〜5: itemSet", () => {
    for (let s = 4; s <= 5; s++) {
      expect(currentPickType({ ...createDraftState(), step: s })).toBe(
        "itemSet",
      );
    }
  });
});

// ============================================================
// isDraftComplete
// ============================================================
describe("isDraftComplete", () => {
  it("step < 6 のとき false", () => {
    for (let s = 0; s <= 5; s++) {
      expect(isDraftComplete({ ...createDraftState(), step: s })).toBe(false);
    }
  });
  it("step = 6 のとき true", () => {
    expect(isDraftComplete({ ...createDraftState(), step: 6 })).toBe(true);
  });
});

// ============================================================
// makePick
// ============================================================
describe("makePick: 派閥ピック", () => {
  it("ピックした派閥が選択者のリストに追加される", () => {
    const next = makePick(createDraftState(), "aggro");
    expect(next.factions[0]).toContain("aggro"); // step=0はP1
  });

  it("ピックした派閥が available から除外される", () => {
    const next = makePick(createDraftState(), "aggro");
    expect(next.availableFactions).not.toContain("aggro");
  });

  it("step が 1 進む", () => {
    const next = makePick(createDraftState(), "aggro");
    expect(next.step).toBe(1);
  });

  it("2回目のピックは次のプレイヤー（P2）", () => {
    let draft = makePick(createDraftState(), "aggro"); // P1: aggro
    draft = makePick(draft, "tank"); // P2: tank
    expect(draft.factions[1]).toContain("tank");
  });

  it("存在しない派閥はピックできない（例外）", () => {
    expect(() => makePick(createDraftState(), "nonexistent")).toThrow();
  });

  it("すでに取られた派閥はピックできない（例外）", () => {
    const draft = makePick(createDraftState(), "aggro");
    expect(() => makePick(draft, "aggro")).toThrow();
  });
});

describe("makePick: アイテムセットピック", () => {
  // step=4 まで進める
  function advanceTo4(): DraftState {
    let d = createDraftState();
    d = makePick(d, "aggro"); // P1
    d = makePick(d, "tank"); // P2
    d = makePick(d, "control"); // P2
    d = makePick(d, "synergy"); // P1
    return d; // step=4
  }

  it("step=4 でアイテムセットをピックできる", () => {
    const draft = advanceTo4();
    const next = makePick(draft, "A");
    expect(next.itemSets[0]).toBe("A"); // step=4はP1
  });

  it("ピックしたセットが available から除外される", () => {
    const next = makePick(advanceTo4(), "A");
    expect(next.availableItemSets).not.toContain("A");
  });

  it("すでに取られたアイテムセットはピックできない（例外）", () => {
    const draft = makePick(advanceTo4(), "A");
    expect(() => makePick(draft, "A")).toThrow();
  });

  it("派閥フェーズにアイテムセットを指定するとエラー", () => {
    expect(() => makePick(createDraftState(), "A")).toThrow();
  });

  it("アイテムフェーズに派閥を指定するとエラー", () => {
    expect(() => makePick(advanceTo4(), "aggro")).toThrow();
  });
});

describe("makePick: フルドラフト完走", () => {
  it("6ピック後に isDraftComplete = true", () => {
    let d = createDraftState();
    d = makePick(d, "aggro"); // P1: faction
    d = makePick(d, "tank"); // P2: faction
    d = makePick(d, "control"); // P2: faction
    d = makePick(d, "synergy"); // P1: faction
    d = makePick(d, "A"); // P1: itemSet
    d = makePick(d, "B"); // P2: itemSet
    expect(isDraftComplete(d)).toBe(true);
  });

  it("フルドラフト後の各プレイヤーの選択が正しい", () => {
    let d = createDraftState();
    d = makePick(d, "aggro");
    d = makePick(d, "tank");
    d = makePick(d, "control");
    d = makePick(d, "synergy");
    d = makePick(d, "A");
    d = makePick(d, "B");

    expect(d.factions[0].sort()).toEqual(["aggro", "synergy"]);
    expect(d.factions[1].sort()).toEqual(["control", "tank"]);
    expect(d.itemSets[0]).toBe("A");
    expect(d.itemSets[1]).toBe("B");
  });
});

// ============================================================
// buildDeck
// ============================================================
describe("buildDeck", () => {
  it("30枚のデッキを返す（キャラ24 + アイテム6）", () => {
    const deck = buildDeck(["aggro", "tank"], "A", MOCK_CARDS);
    expect(deck).toHaveLength(30);
  });

  it("選択した派閥のキャラが各12枚含まれる", () => {
    const deck = buildDeck(["aggro", "tank"], "A", MOCK_CARDS);
    const aggroCards = deck.filter((id) => id.startsWith("aggro"));
    const tankCards = deck.filter((id) => id.startsWith("tank"));
    expect(aggroCards).toHaveLength(12);
    expect(tankCards).toHaveLength(12);
  });

  it("他の派閥のカードは含まれない", () => {
    const deck = buildDeck(["aggro", "tank"], "A", MOCK_CARDS);
    const others = deck.filter(
      (id) =>
        !id.startsWith("aggro") &&
        !id.startsWith("tank") &&
        !id.startsWith("item"),
    );
    expect(others).toHaveLength(0);
  });

  it("選択したアイテムセットのアイテムが6枚含まれる", () => {
    const deck = buildDeck(["aggro", "tank"], "A", MOCK_CARDS);
    const itemCards = deck.filter((id) => id.startsWith("item"));
    expect(itemCards).toHaveLength(6);
  });

  it("セットAのアイテムのみ含まれる", () => {
    const setAItems = MOCK_CARDS.items
      .filter((i) => i.sets.includes("A"))
      .map((i) => i.id);
    const deck = buildDeck(["aggro", "tank"], "A", MOCK_CARDS);
    const itemCards = deck.filter((id) => id.startsWith("item"));
    expect(itemCards.sort()).toEqual(setAItems.sort());
  });

  it("セットBのアイテムのみ含まれる", () => {
    const setBItems = MOCK_CARDS.items
      .filter((i) => i.sets.includes("B"))
      .map((i) => i.id);
    const deck = buildDeck(["aggro", "tank"], "B", MOCK_CARDS);
    const itemCards = deck.filter((id) => id.startsWith("item"));
    expect(itemCards.sort()).toEqual(setBItems.sort());
  });

  it("カードは重複しない", () => {
    const deck = buildDeck(["aggro", "tank"], "A", MOCK_CARDS);
    expect(new Set(deck).size).toBe(deck.length);
  });

  it("シャッフルされている（元の順番とは異なる可能性が高い）", () => {
    // 同じ入力で複数回生成して、少なくとも1回は順番が違うことを確認
    const ref = buildDeck(["aggro", "tank"], "A", MOCK_CARDS);
    let diffCount = 0;
    for (let i = 0; i < 10; i++) {
      const deck = buildDeck(["aggro", "tank"], "A", MOCK_CARDS);
      if (JSON.stringify(deck) !== JSON.stringify(ref)) diffCount++;
    }
    // シャッフルされているので10回中少なくとも1回は違う順番のはず
    expect(diffCount).toBeGreaterThan(0);
  });
});
