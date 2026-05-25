import type { DraftState } from "./draft.js";
import { buildDeck } from "./draft.js";
import type { CharInstance, Direction, GameState } from "./types.js";
import { assertNonNull } from "./types.js";

// ============================================================
// カード定義型
// ============================================================

export type AttackCells = "all" | null | [number, number][];

export interface UltDef {
  name: string;
  vp_cost: number;
  timing: string;
  effect: string;
}

export interface CharCardDef {
  id: string;
  name: string;
  faction: string;
  cost: number;
  vp: number;
  hp: number;
  atk: number;
  reactivation_cost: number;
  attribute: string;
  attack_cells: AttackCells;
  attack_type: string;
  keywords: string[];
  effect: string;
  ult: UltDef | null;
  weakness_cells?: [number, number][];
}

export interface ItemCardDef {
  id: string;
  name: string;
  cost: number;
  vp: number;
  effect: string;
  sets: string[];
}

export interface CardDatabase {
  characters: CharCardDef[];
  items: ItemCardDef[];
}

// ============================================================
// 属性
// ============================================================

const ATTR_OPPOSITES: Record<string, string> = {
  拳: "念",
  念: "拳",
  光: "闇",
  闇: "光",
};

/** 標準盤面属性セット（拳×2, 念×2, 光×2, 闇×2, 虚×1） */
export const STANDARD_BOARD_ATTRS: string[] = [
  "拳",
  "拳",
  "念",
  "念",
  "光",
  "光",
  "闇",
  "闇",
  "虚",
];

/**
 * 召喚時の属性マス HP 補正を返す。
 * 同属性: +2, 対立属性: -2, それ以外（虚含む）: 0
 */
export function attributeHpBonus(charAttr: string, cellAttr: string): number {
  if (charAttr === "虚" || cellAttr === "虚") return 0;
  if (charAttr === cellAttr) return 2;
  if (ATTR_OPPOSITES[charAttr] === cellAttr) return -2;
  return 0;
}

// ============================================================
// CharInstance 生成
// ============================================================

export function createCharInstance(
  def: CharCardDef,
  owner: 0 | 1,
  dir: Direction,
): CharInstance {
  return {
    cardId: def.id,
    owner,
    hp: def.hp,
    maxHp: def.hp,
    atk: def.atk,
    baseAtk: def.atk,
    dir,
    hasActed: false,
    hasRotated: false,
    ultUsed: false,
    summonedOnTurn: 0,
    keywords: [...def.keywords],
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

// ============================================================
// 初期 GameState 生成
// ============================================================

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // biome-ignore lint/style/noNonNullAssertion: Fisher-Yates — loop bounds guarantee valid indices
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface CreateStateOptions {
  boardAttrs?: string[];
  firstPlayer?: 0 | 1;
}

/**
 * ドラフト結果と全カードデータから初期 GameState を生成する。
 * デッキ構築・シャッフル・初期 5 ドロー済みの状態を返す。
 */
export function createInitialGameState(
  draft: DraftState,
  cardDb: CardDatabase,
  opts: CreateStateOptions = {},
): GameState {
  const firstPlayer: 0 | 1 = opts.firstPlayer ?? 0;
  const boardAttrs = opts.boardAttrs ?? shuffleArray([...STANDARD_BOARD_ATTRS]);

  const deck0 = buildDeck(draft.factions[0], draft.itemSets[0] ?? "", cardDb);
  const deck1 = buildDeck(draft.factions[1], draft.itemSets[1] ?? "", cardDb);

  const drawInitial = (deck: string[]): { hand: string[]; deck: string[] } => {
    const d = [...deck];
    const hand: string[] = [];
    for (let i = 0; i < 5 && d.length > 0; i++) {
      hand.push(assertNonNull(d.pop()));
    }
    return { hand, deck: d };
  };

  const d0 = drawInitial(deck0);
  const d1 = drawInitial(deck1);

  return {
    turn: 0,
    active: firstPlayer,
    players: [
      {
        factions: [...draft.factions[0]],
        itemSet: draft.itemSets[0] ?? "",
        vp: 0,
        mana: 0,
        hand: d0.hand,
        deck: d0.deck,
        discard: [],
      },
      {
        factions: [...draft.factions[1]],
        itemSet: draft.itemSets[1] ?? "",
        vp: 0,
        mana: 0,
        hand: d1.hand,
        deck: d1.deck,
        discard: [],
      },
    ],
    board: Array(9).fill(null),
    boardAttrs,
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
