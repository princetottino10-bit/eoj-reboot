import { loadPack } from "../src/pack-io.ts";
import type { CardPack } from "../src/cards.ts";
import { seedRng } from "../src/rng.ts";
import { makeCtx } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import { defaultConfig } from "../src/types.ts";
import type { Config, Facing, GameState, PlayerId, PlayerState, Unit } from "../src/types.ts";

export const PACK: CardPack = loadPack();

export const mkCtx = (over: Partial<Config> = {}, pack: CardPack = PACK): Ctx =>
  makeCtx({ ...defaultConfig(), ...over }, pack);

const mkPlayer = (cfg: Config, mana: number): PlayerState => ({
  life: cfg.startLife,
  mana,
  chips: 0,
  deck: [],
  hand: [],
  grave: [],
  reach: false,
  firstTurnDone: true,
});

/** Empty board, both players flush with mana, no cards in hand. */
export const blankState = (ctx: Ctx, mana = 20): GameState => ({
  units: [],
  players: [mkPlayer(ctx.cfg, mana), mkPlayer(ctx.cfg, mana)],
  turnPlayer: 0,
  round: 1,
  nextUid: 1,
  rngState: seedRng(12345),
  winner: null,
  winType: null,
  ended: false,
});

export const place = (
  s: GameState,
  cardId: string,
  owner: PlayerId,
  x: number,
  y: number,
  facing: Facing,
): number => {
  const u: Unit = {
    uid: s.nextUid,
    cardId,
    owner,
    pos: { x, y },
    facing,
    damage: 0,
    attackedThisTurn: false,
    rotatedThisTurn: false,
    summonedThisTurn: false,
    hiddenBy: null,
    atkBuff: 0,
  };
  s.nextUid += 1;
  s.units.push(u);
  return u.uid;
};

export const uid = (s: GameState, index: number): number => s.units[index].uid;
