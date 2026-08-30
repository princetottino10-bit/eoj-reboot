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

export const occupied = (s: GameState, p: PlayerId): number =>
  s.units.reduce((n, u) => (u.owner === p && !isHidden(u) ? n + 1 : n), 0);

export const cardOfUnit = (ctx: Ctx, u: Unit): CardDef => cardOf(ctx.pack, u.cardId);

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

export const gainMana = (ps: PlayerState, amount: number, cap: number): void => {
  ps.mana = Math.min(cap, ps.mana + amount);
};
