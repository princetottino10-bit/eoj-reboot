// ============================================================
// 型
// ============================================================

export interface CardData {
  characters: { id: string; faction: string }[];
  items: { id: string; sets?: string[]; faction?: string }[];
}

export interface DraftState {
  step: number;
  availableFactions: string[];
  availableItemSets: string[];
  factions: [string[], string[]];
  itemSets: [string | null, string | null];
}

// ============================================================
// 定数
// ============================================================

export const DRAFT_PICK_ORDER = [0, 1, 1, 0, 0, 1] as const;
export const DRAFT_PICK_TYPES = [
  "faction",
  "faction",
  "faction",
  "faction",
  "itemSet",
  "itemSet",
] as const;

// ============================================================
// 状態生成
// ============================================================

const DEFAULT_FACTIONS = [
  "aggro",
  "cip",
  "spell",
  "inheritance",
  "mobility",
  "defense",
  "meta",
];

export function createDraftState(availableFactions = DEFAULT_FACTIONS): DraftState {
  return {
    step: 0,
    availableFactions: [...availableFactions],
    availableItemSets: ["A", "B", "C", "D"],
    factions: [[], []],
    itemSets: [null, null],
  };
}

// ============================================================
// 参照ヘルパー
// ============================================================

export function currentPicker(draft: DraftState): 0 | 1 {
  return DRAFT_PICK_ORDER[draft.step] ?? 0;
}

export function currentPickType(draft: DraftState): "faction" | "itemSet" {
  return DRAFT_PICK_TYPES[draft.step] ?? "faction";
}

export function isDraftComplete(draft: DraftState): boolean {
  return draft.step >= DRAFT_PICK_ORDER.length;
}

// ============================================================
// ピック処理
// ============================================================

export function makePick(draft: DraftState, choice: string): DraftState {
  const pickType = currentPickType(draft);
  const picker = currentPicker(draft);

  if (pickType === "faction") {
    if (!draft.availableFactions.includes(choice)) {
      throw new Error(`Invalid or unavailable faction: ${choice}`);
    }
    const newFactions: [string[], string[]] = [
      [...draft.factions[0]],
      [...draft.factions[1]],
    ];
    newFactions[picker].push(choice);
    return {
      ...draft,
      step: draft.step + 1,
      availableFactions: draft.availableFactions.filter((f) => f !== choice),
      factions: newFactions,
    };
  } else {
    if (!draft.availableItemSets.includes(choice)) {
      throw new Error(`Invalid or unavailable item set: ${choice}`);
    }
    const newItemSets: [string | null, string | null] = [...draft.itemSets];
    newItemSets[picker] = choice;
    return {
      ...draft,
      step: draft.step + 1,
      availableItemSets: draft.availableItemSets.filter((s) => s !== choice),
      itemSets: newItemSets,
    };
  }
}

// ============================================================
// デッキ構築
// ============================================================

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // biome-ignore lint/style/noNonNullAssertion: Fisher-Yates — loop bounds guarantee valid indices
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export function buildDeck(
  factions: string[],
  itemSet: string,
  cards: CardData,
): string[] {
  const charIds = cards.characters
    .filter((c) => factions.includes(c.faction))
    .map((c) => c.id);
  const itemIds = cards.items
    .filter((i) =>
      Array.isArray(i.sets)
        ? i.sets.includes(itemSet)
        : i.faction != null && factions.includes(i.faction)
    )
    .map((i) => i.id);
  return shuffle([...charIds, ...itemIds]);
}
