// All shared types. Erasable syntax only (no enum / namespace / decorators).

export type Attr = "yin" | "yang" | "none";
export type CellAttr = "yin" | "yang" | "taiji" | "empty";
/** phys: gains the blind bonus and draws counters. jutsu: neither. */
export type AttackType = "phys" | "jutsu";
/** reigu (spirit tools) are unplayable in v1 - dead cards that only clog hands. */
export type CardKind = "shikigami" | "reigu";
export type PlayerId = 0 | 1;
/** 0 = north. Relative +y is "forward". 90-degree steps, clockwise. */
export type Facing = 0 | 1 | 2 | 3;
export type Pos = { x: number; y: number };

export type CardDef = {
  id: string;
  name: string;
  /** Display name shown in the UI. Falls back to `name` when a pack omits it. */
  nameJa: string;
  summonCost: number;
  attackCost: number;
  atk: number;
  hp: number;
  lifeValue: number;
  attribute: Attr;
  attackRange: Pos[];
  blindSpots: Pos[];
  aoe: boolean;
  attackType: AttackType;
  kind: CardKind;
  /** Cells from which this unit answers an attack. Defaults to attackRange. */
  counterRange: Pos[];
};

export type Unit = {
  uid: number;
  cardId: string;
  owner: PlayerId;
  pos: Pos;
  facing: Facing;
  damage: number;
  attackedThisTurn: boolean;
  rotatedThisTurn: boolean;
  /** Set on summon, cleared at the owner's next turn start. Distinguishes a
   *  summon-attack from a re-attack (tm15 regen keys off this). */
  summonedThisTurn: boolean;
  /** Mayohiga (tm19): who hid it. Cleared at that player's next turn start.
   *  A hidden unit is off every count and cannot be targeted or commanded,
   *  but still physically blocks its cell. */
  hiddenBy: PlayerId | null;
  /** Turn-scoped ATK bonus (tm16 Shuten-Doji). Cleared at end of turn. */
  atkBuff: number;
};

export type PlayerState = {
  life: number;
  mana: number;
  chips: number;
  deck: string[];
  hand: string[];
  grave: string[];
  reach: boolean;
  firstTurnDone: boolean;
};

export type WinType = "control" | "life" | "turn_limit";

export type GameState = {
  units: Unit[];
  players: [PlayerState, PlayerState];
  turnPlayer: PlayerId;
  round: number;
  nextUid: number;
  rngState: number;
  winner: PlayerId | null;
  winType: WinType | null;
  ended: boolean;
};

export type ChipMode = "one_per_turn" | "catch_up";

export type Config = {
  chipMode: ChipMode;
  startLife: number;
  startMana: [number, number];
  baseIncome: number;
  chipIncomeSteps: number[];
  manaCap: number;
  handRefill: number;
  maxHp: number;
  blindBonus: number;
  attrBonus: number;
  taijiDiscount: number;
  taijiFloor: number;
  rotateCost: number;
  controlWin: number;
  roundLimit: number;
  boardCells: number;
  maxActionsPerTurn: number;
  /** R8: both players hit 0 life simultaneously -> turn player wins. */
  simultaneousDeathTurnPlayerWins: boolean;
  /**
   * Card effects and reigu. false = rules-only baseline (the behaviour every
   * pre-effects test was written against). defaultConfig() keeps this off so
   * that baseline stays pinned; the CLI and the play UI default it on.
   */
  effects: boolean;
};

export const defaultConfig = (): Config => ({
  // R1 settled: chips catch up to the occupied count. one_per_turn is kept
  // as a comparison mode only.
  chipMode: "catch_up",
  startLife: 15,
  startMana: [3, 4],
  baseIncome: 3,
  chipIncomeSteps: [3, 4],
  manaCap: 15,
  handRefill: 5,
  maxHp: 10,
  blindBonus: 2,
  attrBonus: 2,
  taijiDiscount: 2,
  taijiFloor: 1,
  rotateCost: 1,
  controlWin: 5,
  roundLimit: 40,
  boardCells: 9,
  maxActionsPerTurn: 12,
  simultaneousDeathTurnPlayerWins: true,
  effects: false,
});

/**
 * normal: plain attack.
 * konshin: tm09 Kubihiki - +1 damage, 1 self-damage after resolution.
 * heal: tm06 Meoto-Men - targets an ally and restores ATK worth of HP.
 */
export type AttackVariant = "normal" | "konshin" | "heal";

export type Action =
  | { kind: "summon"; handIndex: number; pos: Pos; facing: Facing }
  | { kind: "attack"; uid: number; targetUid: number | null; variant?: AttackVariant }
  | { kind: "rotate"; uid: number; facing: Facing }
  /** tm17 Kuryugai spends its own rotate to turn any other unit instead. */
  | { kind: "proxyRotate"; uid: number; targetUid: number; facing: Facing }
  /** Reigu are atomic actions: pay, resolve, to the grave. No per-turn cap. */
  | { kind: "reigu"; handIndex: number; targetUid: number | null; facing: Facing | null }
  | { kind: "pass" };

export type HitRecord = {
  uid: number;
  cardId: string;
  owner: PlayerId;
  blind: boolean;
  dmg: number;
  destroyed: boolean;
  ally: boolean;
};

export type GameEvent =
  | { t: "turnStart"; player: PlayerId; round: number; income: number }
  | {
      t: "summon";
      player: PlayerId;
      uid: number;
      cardId: string;
      pos: Pos;
      facing: Facing;
      cost: number;
      taiji: boolean;
    }
  | {
      t: "attack";
      player: PlayerId;
      uid: number;
      cardId: string;
      aoe: boolean;
      cost: number;
      hits: HitRecord[];
      counterTotal: number;
      counterCount: number;
      attackerDestroyed: boolean;
      variant: AttackVariant;
    }
  | {
      t: "reigu";
      player: PlayerId;
      cardId: string;
      targetUid: number | null;
      cost: number;
    }
  /** Any card effect firing. `source` is the cardId that owns the effect. */
  | { t: "effect"; player: PlayerId; source: string; uid: number | null; text: string }
  | { t: "rotate"; player: PlayerId; uid: number; cost: number }
  | { t: "pass"; player: PlayerId }
  | {
      t: "destroy";
      owner: PlayerId;
      uid: number;
      cardId: string;
      lifeLoss: number;
      manaGain: number;
    }
  | {
      t: "turnEnd";
      player: PlayerId;
      round: number;
      occupied: number;
      chips: number;
      chipGained: number;
      reach: boolean;
      discarded: number;
      drawn: number;
    }
  | { t: "gameEnd"; winner: PlayerId | null; winType: WinType; round: number };

export type ApplyResult = { state: GameState; events: GameEvent[] };
