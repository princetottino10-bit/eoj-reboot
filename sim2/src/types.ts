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
  /**
   * 霊力価 (adopted 9/22 set): mana whoever destroys this unit gains when
   * killRewardBase is "card". parsePack fills it from the pack, or with
   * floor(summonCost / 2) (the half_floor reward) for a pack that has none.
   */
  manaValue: number;
  attribute: Attr;
  attackRange: Pos[];
  blindSpots: Pos[];
  aoe: boolean;
  attackType: AttackType;
  kind: CardKind;
  /** Cells from which this unit answers an attack. Defaults to attackRange. */
  counterRange: Pos[];
  /**
   * A property of the PRINTED card: its counter range is its attack range
   * (counterRange omitted or equal in the pack), so an attack-range edit moves
   * the counter range too. parsePack records it and edits carry it along.
   * Absent = decided from this card's own ranges.
   */
  counterFollowsAttack?: boolean;
  /**
   * EXP-0913B counterMode "gap": the one relative cell of an AREA attack that
   * is exposed to a counter. null / absent = an area attack that can never be
   * countered. Ignored for single-target attacks (their whole range is gap).
   */
  gapCell?: Pos | null;
  /** Display only: the clan (一門) a card belongs to, if the pack says so. */
  clan?: string;
  /**
   * Effect key used by effects.ts. Absent = the card id itself (every
   * tsukumo-miyako card). Lets a new pack reuse an existing effect under a
   * different card id.
   */
  effect?: string;
  /**
   * Display only: the card number printed on the team's print kit ("T-001",
   * "O-011"; one capital letter, a hyphen, three digits). Absent = the pack
   * has no print kit. The rules never read it.
   */
  printId?: string;
  /** Display only: the card's illustration cut from the print kit. Absent = no art. */
  art?: CardArt;
};

/**
 * Card art, as paths relative to sim2/ (the root both servers serve from) and
 * always under play/art/: `card` is the art window of the printed card face
 * (roughly square, meant to be cover-fitted), `square` a square crop around
 * the focal point (the face) for the small board pieces.
 */
export type CardArt = { card: string; square: string };

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
  /** EXP-0913: how many times this player's grave has been reshuffled. */
  reshuffleCount: number;
  /** controlWinMode "points": 制圧点 earned so far (never decreases). Always 0 under "hold". */
  controlPoints: number;
};

export type WinType = "control" | "life" | "turn_limit" | "deck_out";

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
  /** EXP-0913 summonLimit: summons the turn player has made this turn. */
  summonsThisTurn: number;
};

export type ChipMode = "one_per_turn" | "catch_up";

// ------------------------------------------------- EXP-0913 rule variants

/** on = range hits everything in range. off = AoE cards attack a single
 *  enemy. no_ff = range hits enemies only. */
export type AoeMode = "on" | "off" | "no_ff";
/** all = every eligible defender counters. single = only one does.
 *  gap = EXP-0913B: only a defender standing on the attacker's gap cell. */
export type CounterMode = "all" | "single" | "gap";
/** sum = the eligible counters land together as one total (every ruleset so
 *  far). chosen = adopted 9/22 案A: they resolve one at a time, in an order the
 *  countering side chooses, each with its own effects; once the attacker is
 *  destroyed the rest are skipped. Jutsu units do not counter under chosen. */
export type CounterResolve = "sum" | "chosen";
/** half = destroyed unit refunds floor(summonCost/2) to its owner.
 *  killer_half = EXP-0913B: the same amount goes to whoever destroyed it. */
export type RefundMode = "half" | "none" | "killer_half";
/** How much a destruction pays (to whoever refundMode names), before killRewardBonus.
 *  half_floor = floor(summonCost/2) (every ruleset so far), half_ceil, full, zero.
 *  card = the destroyed card's printed 霊力価 (manaValue; adopted 9/22). */
export type KillRewardBase = "half_floor" | "half_ceil" | "full" | "zero" | "card";
/** half = summon costs ceil(summonCost/2), floor 1. */
export type SummonCostScale = "full" | "half";
/** second = the game ends when either grave has been reshuffled twice. */
export type DeckOutMode = "none" | "second";
export type IncomeTiming = "turn_start" | "turn_end";
/** EXP-0913B. next_turn_start = R2 (reach, win at the next own turn start).
 *  next_turn_end = control state from own turn end, lost the moment the
 *  count drops below controlWin, win at the next own turn end. */
export type ControlHold = "next_turn_start" | "next_turn_end";
/** EXP-0913B. refill_to_5 = discard then draw up to handRefill.
 *  replace_discarded = discard then draw exactly as many as were discarded. */
export type HandMode = "refill_to_5" | "replace_discarded";

// ------------------------------------------------- 9/23 optional rule settings

/** How units count toward control (and chips). cells = 1 each. hp = a unit
 *  whose CURRENT HP is >= controlCountThreshold counts 2 (the paper rule "HP
 *  11以上はHPバーのマーカー2つ"). cost = a unit whose printed summon cost is
 *  >= controlCountThreshold counts 2. Hidden units count 0 under every mode. */
export type ControlCount = "cells" | "hp" | "cost";
/** hold = the control state + controlHold (every ruleset so far). points = at
 *  each own turn end with count >= controlWin the player gains 1 制圧点;
 *  controlPointsToWin points win at once. Points never decrease. */
export type ControlWinMode = "hold" | "points";
/** ratchet = chips never decrease (every ruleset so far). current = the chip
 *  steps are judged on the count as it stands whenever income is paid, so
 *  losing cells lowers income. */
export type IncomeMode = "ratchet" | "current";
/** Whether the destroyer gets the kill reward. always = every ruleset so far.
 *  behind = only while the destroyer's count <= the opponent's (at the kill).
 *  upset = always, plus floor((victim cost - destroying cost) / 2) when positive. */
export type KillRewardCondition = "always" | "behind" | "upset";

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

  // ----------------------------------------------------------- EXP-0913
  /** Summons allowed per turn. null = unlimited. The main phase continues
   *  after a summon either way. */
  summonLimit: number | null;
  aoeMode: AoeMode;
  /** true = a jutsu area attack never hits allies (the 9/13 procedure); phys
   *  area attacks still follow aoeMode. false = every area card follows aoeMode. */
  jutsuAoeSparesAllies: boolean;
  counterMode: CounterMode;
  /** How several counters resolve (adopted 9/22 案A = "chosen"). */
  counterResolve: CounterResolve;
  /** Added to every card's attack cost, floored at 1. */
  attackCostDelta: number;
  refundMode: RefundMode;
  summonCostScale: SummonCostScale;
  /** Move the attacker onto the freed cell when exactly one enemy died. */
  moveOnKill: boolean;
  /** false = destroyed units cost no life, and life 0 is no longer a loss. */
  lifeValueEnabled: boolean;
  deckOutMode: DeckOutMode;
  incomeTiming: IncomeTiming;

  // ---------------------------------------------------------- EXP-0913B
  /** Replace an own unit with a strictly pricier shikigami (same attribute,
   *  or either side attribute "none"). */
  inheritSummon: boolean;
  /** One mulligan each before the first turn (AI: return summonCost >= 5). */
  mulligan: boolean;
  controlHold: ControlHold;
  handMode: HandMode;

  // ------------------------------------------------------------ UI knobs
  /** Destruction mana: base amount from the destroyed card's summon cost. */
  killRewardBase: KillRewardBase;
  /** Added to the destruction mana (the total never goes below 0). */
  killRewardBonus: number;

  // ------------------------------------------- 9/23 optional rule settings
  /** 制圧の数え方. Every count that decides control, chips, income and the
   *  deck-out tiebreak uses it (state.ts controlCount). */
  controlCount: ControlCount;
  /** HP (controlCount "hp") or printed summon cost ("cost") from which a unit counts 2. */
  controlCountThreshold: number;
  /** 制圧の勝ち方. */
  controlWinMode: ControlWinMode;
  /** controlWinMode "points": 制圧点 needed to win. */
  controlPointsToWin: number;
  /** 収入の決め方. */
  incomeMode: IncomeMode;
  /** 撃破報酬の条件 (applies when the reward goes to the destroyer, refundMode killer_half). */
  killRewardCondition: KillRewardCondition;
  /** 劣勢ボーナス: extra income while the receiver's count is below the opponent's. */
  underdogIncome: number;
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
  // EXP-0913 defaults: every one of these reproduces the pre-EXP behaviour.
  summonLimit: null,
  aoeMode: "on",
  jutsuAoeSparesAllies: false,
  counterMode: "all",
  counterResolve: "sum",
  attackCostDelta: 0,
  refundMode: "half",
  summonCostScale: "full",
  moveOnKill: false,
  lifeValueEnabled: true,
  deckOutMode: "none",
  incomeTiming: "turn_start",
  // EXP-0913B defaults: likewise the pre-EXP behaviour.
  inheritSummon: false,
  mulligan: false,
  controlHold: "next_turn_start",
  handMode: "refill_to_5",
  // Destruction mana as every ruleset so far pays it: half the cost, rounded down.
  killRewardBase: "half_floor",
  killRewardBonus: 0,
  // 9/23 optional settings: every default is today's behaviour.
  controlCount: "cells",
  controlCountThreshold: 11,
  controlWinMode: "hold",
  controlPointsToWin: 2,
  incomeMode: "ratchet",
  killRewardCondition: "always",
  underdogIncome: 0,
});

/**
 * normal: plain attack.
 * konshin: tm09 Kubihiki - +1 damage, 1 self-damage after resolution.
 * heal: tm06 Meoto-Men - targets an ally and restores ATK worth of HP.
 * regen: ad15 茨木童子【再生】 - pay 1 more mana, HP+1 after the attack.
 * drink: ad16 酒呑童子【飲酒】 - pay 2 more mana, ATK+1 for this attack.
 */
export type AttackVariant = "normal" | "konshin" | "heal" | "regen" | "drink";

/** ad21 茨木の左腕: 【拳】 pushes the struck enemy away, 【握】 pulls it closer. */
export type ReiguMode = "ken" | "aku";

export type Action =
  | { kind: "summon"; handIndex: number; pos: Pos; facing: Facing }
  /** EXP-0913B inheritSummon: replace own unit `targetUid` with the hand card.
   *  Position and facing are inherited, so neither is part of the action. */
  | { kind: "inherit"; handIndex: number; targetUid: number }
  /**
   * counterOrder (counterResolve "chosen"): the countering side's order, as
   * uids of every unit that will counter. Absent = the engine order.
   */
  | { kind: "attack"; uid: number; targetUid: number | null; variant?: AttackVariant; counterOrder?: number[] }
  | { kind: "rotate"; uid: number; facing: Facing }
  /** tm17 Kuryugai spends its own rotate to turn any other unit instead. */
  | { kind: "proxyRotate"; uid: number; targetUid: number; facing: Facing }
  /** Reigu are atomic actions: pay, resolve, to the grave. No per-turn cap. */
  /** mode: ad21's 拳 / 握. victimUid: ad22's chosen enemy next to the target. */
  | { kind: "reigu"; handIndex: number; targetUid: number | null; facing: Facing | null; mode?: ReiguMode; victimUid?: number }
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
  /** underdog: the 劣勢ボーナス part of income (already included in income; absent when 0). */
  | { t: "turnStart"; player: PlayerId; round: number; income: number; underdog?: number }
  | {
      t: "summon";
      player: PlayerId;
      uid: number;
      cardId: string;
      pos: Pos;
      facing: Facing;
      cost: number;
      taiji: boolean;
      /** The card's printed summon cost, before taiji / summonCostScale. */
      baseCost: number;
      /** EXP-0913B inheritSummon: the card that was replaced on this cell. */
      inheritedFrom?: { uid: number; cardId: string; baseCost: number; refund: number };
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
      /** Display: the units that countered (a heal-attack omits it). */
      counterUids?: number[];
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
  /** Any card effect firing. `source` is the cardId that owns the effect. from/to: the unit's facing before / after, for effects that turn it (家鳴り, 玖龍街). */
  | { t: "effect"; player: PlayerId; source: string; uid: number | null; text: string; from?: Facing; to?: Facing }
  /** from/to: the rotating unit's facing (equal for a proxy rotate, whose turned unit follows as an effect). */
  | { t: "rotate"; player: PlayerId; uid: number; cost: number; cardId: string; from: Facing; to: Facing }
  /** EXP-0913 moveOnKill (source "rule") or a card effect such as sk13. */
  | { t: "move"; player: PlayerId; uid: number; from: Pos; to: Pos; source?: string }
  /** EXP-0913B mulligan: cards returned to the deck (and as many drawn). */
  | { t: "mulligan"; player: PlayerId; returned: number }
  /** Control (reach) bookkeeping. gain = entered the control state at an own
   *  turn end; lost = dropped out without winning; win = converted. need / hold:
   *  controlWin and controlHold when it happened (both may change mid-match). */
  | { t: "control"; player: PlayerId; change: "gain" | "lost" | "win"; need: number; hold: ControlHold }
  /** EXP-0913: a player's grave was shuffled back into their deck. */
  | { t: "reshuffle"; player: PlayerId; count: number }
  | { t: "pass"; player: PlayerId }
  | {
      t: "destroy";
      owner: PlayerId;
      uid: number;
      cardId: string;
      lifeLoss: number;
      manaGain: number;
      /** Who caused it. null = nobody (self-inflicted, e.g. konshin). */
      killer?: PlayerId | null;
      /** Who received manaGain (the owner, or the killer under killer_half). */
      manaTo?: PlayerId | null;
      /** true when manaGain was paid to the killer (refundMode killer_half). */
      killerRefund?: boolean;
      /** killRewardCondition "behind": the destroyer was ahead, so nobody was paid. */
      rewardDenied?: boolean;
      /** killRewardCondition "upset": the part of manaGain that is the upset bonus (before the mana cap). */
      upsetBonus?: number;
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
      /** Board HP total of the player whose turn just ended. */
      boardHp: number;
      /** Mana still unspent when the main phase closed (before chips/income). */
      manaLeft: number;
      /** EXP-0913B: both players' occupied counts at this turn end. */
      occBoth?: [number, number];
      /** EXP-0913B: both players' hand sizes after the refill. */
      handBoth?: [number, number];
      /** controlWinMode "points": both players' 制圧点 at this turn end. */
      points?: [number, number];
    }
  | { t: "gameEnd"; winner: PlayerId | null; winType: WinType; round: number };

export type ApplyResult = { state: GameState; events: GameEvent[] };
