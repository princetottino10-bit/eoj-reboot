import { seedRng, shuffle } from "./rng.ts";
import type { CardPack } from "./cards.ts";
import { cardOf } from "./cards.ts";
import { effMaxHp, posEq } from "./board.ts";
import type { CardDef, Config, GameState, PlayerId, PlayerState, Pos, Unit } from "./types.ts";

export type Ctx = { cfg: Config; pack: CardPack };

export const makeCtx = (cfg: Config, pack: CardPack): Ctx => ({ cfg, pack });

const clonePlayer = (p: PlayerState): PlayerState => ({
  life: p.life,
  mana: p.mana,
  chips: p.chips,
  deck: p.deck.slice(),
  hand: p.hand.slice(),
  grave: p.grave.slice(),
  reach: p.reach,
  firstTurnDone: p.firstTurnDone,
  reshuffleCount: p.reshuffleCount,
  controlPoints: p.controlPoints,
});

const cloneUnit = (u: Unit): Unit => ({
  uid: u.uid,
  cardId: u.cardId,
  owner: u.owner,
  pos: { x: u.pos.x, y: u.pos.y },
  facing: u.facing,
  damage: u.damage,
  attackedThisTurn: u.attackedThisTurn,
  rotatedThisTurn: u.rotatedThisTurn,
  summonedThisTurn: u.summonedThisTurn,
  hiddenBy: u.hiddenBy,
  atkBuff: u.atkBuff,
});

export const cloneState = (s: GameState): GameState => ({
  units: s.units.map(cloneUnit),
  players: [clonePlayer(s.players[0]), clonePlayer(s.players[1])],
  turnPlayer: s.turnPlayer,
  round: s.round,
  nextUid: s.nextUid,
  rngState: s.rngState,
  winner: s.winner,
  winType: s.winType,
  ended: s.ended,
  summonsThisTurn: s.summonsThisTurn,
});

export const createGame = (ctx: Ctx, seed: number): GameState => {
  const { cfg, pack } = ctx;
  let rng = seedRng(seed);
  const players: PlayerState[] = [];
  for (let i = 0; i < 2; i++) {
    const [deck, r] = shuffle(pack.deckList, rng);
    rng = r;
    const hand = deck.slice(0, cfg.handRefill);
    const rest = deck.slice(cfg.handRefill);
    players.push({
      life: cfg.startLife,
      mana: cfg.startMana[i],
      chips: 0,
      deck: rest,
      hand,
      grave: [],
      reach: false,
      firstTurnDone: false,
      reshuffleCount: 0,
      controlPoints: 0,
    });
  }
  return {
    units: [],
    players: [players[0], players[1]],
    turnPlayer: 0,
    round: 1,
    nextUid: 1,
    rngState: rng,
    winner: null,
    winType: null,
    ended: false,
    summonsThisTurn: 0,
  };
};

export const opponent = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

/** Mayohiga (tm19): off every count, untargetable, uncommandable. */
export const isHidden = (u: Unit): boolean => u.hiddenBy !== null;

/** Includes hidden units: a hidden unit still physically blocks its cell. */
export const unitAt = (s: GameState, pos: Pos): Unit | undefined =>
  s.units.find((u) => posEq(u.pos, pos));

/** Excludes hidden units: they cannot be seen, targeted or commanded. */
export const visibleUnitAt = (s: GameState, pos: Pos): Unit | undefined =>
  s.units.find((u) => posEq(u.pos, pos) && !isHidden(u));

export const unitByUid = (s: GameState, uid: number): Unit | undefined =>
  s.units.find((u) => u.uid === uid);

/** Raw cells: one per visible unit, whatever controlCount says. The rules use controlCount. */
export const occupied = (s: GameState, p: PlayerId): number =>
  s.units.reduce((n, u) => (u.owner === p && !isHidden(u) ? n + 1 : n), 0);

export const cardOfUnit = (ctx: Ctx, u: Unit): CardDef => cardOf(ctx.pack, u.cardId);

/**
 * What one unit adds to its owner's 占拠 under controlCount: 0 while hidden,
 * else 1, or 2 when its current HP ("hp") / printed summon cost ("cost") is at
 * least controlCountThreshold.
 */
export const controlWeight = (ctx: Ctx, u: Unit): number => {
  if (isHidden(u)) return 0;
  const mode = ctx.cfg.controlCount;
  if (mode === "hp") return unitHp(ctx, u) >= ctx.cfg.controlCountThreshold ? 2 : 1;
  if (mode === "cost") return cardOfUnit(ctx, u).summonCost >= ctx.cfg.controlCountThreshold ? 2 : 1;
  return 1;
};

/**
 * 占拠: the count every rule reads - control (gain, loss, win, 制圧点), chips
 * and income, the deck-out tiebreak - and the AI and the HUD show. Equals
 * occupied() under controlCount "cells". Takes anything with units (a
 * GameState or the browser's BoardView).
 */
export const controlCount = (ctx: Ctx, s: { readonly units: readonly Unit[] }, p: PlayerId): number =>
  s.units.reduce((n, u) => (u.owner === p ? n + controlWeight(ctx, u) : n), 0);

/** 終盤: has either player reshuffled their grave into a new deck yet? */
export const isLatePhase = (s: { readonly players: readonly { readonly reshuffleCount: number }[] }): boolean =>
  s.players.some((ps) => ps.reshuffleCount > 0);

/**
 * The 占拠 control needs right now: controlWin, or controlWinLate once the
 * game is in its late phase (controlWinLate > 0 and a grave has been
 * reshuffled). Every control rule and the AI read this, not cfg.controlWin.
 */
export const controlNeed = (ctx: Ctx, s: { readonly players: readonly { readonly reshuffleCount: number }[] }): number =>
  ctx.cfg.controlWinLate > 0 && isLatePhase(s) ? ctx.cfg.controlWinLate : ctx.cfg.controlWin;

/** A GameState, or the browser's BoardView: units and each player's chips. */
export type UnderdogView = { readonly units: readonly Unit[]; readonly players: readonly { readonly chips: number }[] };

/** Is p behind on 占拠 (controlCount) / on chips, strictly? Judged on the board as it is now. */
export const behindOn = (ctx: Ctx, s: UnderdogView, p: PlayerId): { cells: boolean; chips: boolean } => {
  const o = opponent(p);
  return {
    cells: controlCount(ctx, s, p) < controlCount(ctx, s, o),
    chips: s.players[p].chips < s.players[o].chips,
  };
};

/**
 * 劣勢 steps for underdogIncome / underdogDiscount under underdogBy: cells or
 * chips = 1 when behind on that, both = one per condition met (0..2).
 */
export const underdogSteps = (ctx: Ctx, s: UnderdogView, p: PlayerId): number => {
  const b = behindOn(ctx, s, p);
  const by = ctx.cfg.underdogBy;
  if (by === "cells") return b.cells ? 1 : 0;
  if (by === "chips") return b.chips ? 1 : 0;
  return (b.cells ? 1 : 0) + (b.chips ? 1 : 0);
};

/** "占拠 1 対 3・チップ 2 対 4": the counts underdogBy looks at, for the log lines. */
export const underdogNote = (ctx: Ctx, s: UnderdogView, p: PlayerId): string => {
  const o = opponent(p);
  const by = ctx.cfg.underdogBy;
  const parts: string[] = [];
  if (by !== "chips") parts.push(`占拠 ${controlCount(ctx, s, p)} 対 ${controlCount(ctx, s, o)}`);
  if (by !== "cells") parts.push(`チップ ${s.players[p].chips} 対 ${s.players[o].chips}`);
  return parts.join("・");
};

/** Effective max HP for a unit at its current position. */
export const unitMaxHp = (ctx: Ctx, u: Unit): number => {
  const c = cardOfUnit(ctx, u);
  return effMaxHp(c.hp, u.pos, c.attribute, ctx.cfg.attrBonus, ctx.cfg.maxHp);
};

/** Remaining HP. <= 0 means destroyed. */
export const unitHp = (ctx: Ctx, u: Unit): number => unitMaxHp(ctx, u) - u.damage;

export const boardHpTotal = (ctx: Ctx, s: GameState, p: PlayerId): number =>
  s.units.reduce(
    (n, u) => (u.owner === p && !isHidden(u) ? n + Math.max(0, unitHp(ctx, u)) : n),
    0,
  );

/**
 * Restores `amount` HP, never past the unit's effective max - but never pushes
 * an already over-healed unit (tm21 Oni-no-Sake) back down either.
 */
export const healUnit = (u: Unit, amount: number): void => {
  const floor = Math.min(0, u.damage);
  u.damage = Math.max(floor, u.damage - amount);
};

/** Adds mana up to `cap`. Returns what was actually gained (events report that, not the nominal amount). */
export const gainMana = (ps: PlayerState, amount: number, cap: number): number => {
  const before = ps.mana;
  ps.mana = Math.min(cap, ps.mana + amount);
  return Math.max(0, ps.mana - before);
};
