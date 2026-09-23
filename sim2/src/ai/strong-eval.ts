// Evaluation for the strong AI (strong.ts). Kept apart from eval.ts on
// purpose: greedy / beam score positions with eval.ts and past simulation
// results depend on those exact numbers, so nothing here is shared with them.
//
// What this eval sees that eval.ts does not:
//   - mana left over (it carries to the next turn under every income timing)
//   - what each side can kill next turn (direct, or after one rotate), so
//     chip damage that sets up a kill and facing that enables one count
//   - hidden (Mayohiga) units neither threaten nor are threatened
//   - the control state: a player holding it is one turn from winning
import { toBoardCells, turnFacing } from "../board.ts";
import { canAttack, cardOf } from "../cards.ts";
import type { CardPack } from "../cards.ts";
import { attackCostOf, isBlindShot } from "../combat.ts";
import { damageBonus, effectiveAtk, rotateCommandLocked } from "../effects.ts";
import { incomeFor, rotateCostOf } from "../rules.ts";
import { isHidden, occupied, opponent, unitHp } from "../state.ts";
import type { Ctx } from "../state.ts";
import type { Facing, GameState, PlayerId, Pos, Unit } from "../types.ts";

export type StrongWeights = {
  /** Per occupied cell (hidden units are off the count, as the rules say). */
  occ: number;
  /** Per HP on the board (hidden units included: they come back). */
  hp: number;
  /** Per ATK point on the board. */
  atk: number;
  /** Per chip and per point of income the chips buy. */
  chip: number;
  income: number;
  life: number;
  /** Per mana carried over. */
  mana: number;
  /** Standing on controlWin cells (own / opponent). */
  reach: number;
  /** Holding the control state after the opponent's best reply. */
  holdControl: number;
  /** The opponent holds the control state at the end of our turn: a loss. */
  oppControl: number;
  /** Per point of damage the opponent can land next turn. */
  threat: number;
  /** Fraction of a unit's value lost when the opponent can kill it next turn. */
  killable: number;
  /** Fraction of a unit's value gained when we can kill it next turn. */
  kill: number;
};

export const STRONG_WEIGHTS: StrongWeights = {
  occ: 30,
  hp: 3,
  atk: 2,
  chip: 4,
  income: 10,
  life: 8,
  mana: 4,
  reach: 200,
  holdControl: 500,
  oppControl: 2000,
  threat: 2,
  killable: 0.6,
  kill: 0.45,
};

/** Same profile names as eval.ts so `--eval` / the UI select keep working. */
export const STRONG_PROFILES: Record<string, StrongWeights> = {
  territorial: STRONG_WEIGHTS,
  aggressive: { ...STRONG_WEIGHTS, occ: 24, life: 30, threat: 3, kill: 0.6, killable: 0.5 },
  balanced: { ...STRONG_WEIGHTS, life: 16, kill: 0.5 },
};

export const strongProfileWeights = (name: string): StrongWeights => {
  const w = STRONG_PROFILES[name];
  if (w === undefined) {
    throw new Error(`unknown eval profile "${name}" (expected ${Object.keys(STRONG_PROFILES).join("|")})`);
  }
  return w;
};

export const STRONG_WIN = 1_000_000;

// ------------------------------------------------------------ range cache

const cellCache = new WeakMap<CardPack, Map<string, Pos[]>>();

/** Board cells a card's attack range covers from pos at facing. Cached per pack. */
export const rangeCells = (ctx: Ctx, cardId: string, pos: Pos, facing: Facing): Pos[] => {
  let m = cellCache.get(ctx.pack);
  if (m === undefined) {
    m = new Map();
    cellCache.set(ctx.pack, m);
  }
  const key = `${cardId}|${pos.x}${pos.y}|${facing}`;
  const hit = m.get(key);
  if (hit !== undefined) return hit;
  const cells = toBoardCells(cardOf(ctx.pack, cardId).attackRange, pos, facing);
  m.set(key, cells);
  return cells;
};

const covers = (cells: Pos[], pos: Pos): boolean => {
  for (const c of cells) if (c.x === pos.x && c.y === pos.y) return true;
  return false;
};

// ------------------------------------------------------------- material

const hpOf = (ctx: Ctx, u: Unit): number => Math.max(0, unitHp(ctx, u));

export const unitValue = (ctx: Ctx, u: Unit, w: StrongWeights): number =>
  w.occ + hpOf(ctx, u) * w.hp + cardOf(ctx.pack, u.cardId).atk * w.atk;

// ------------------------------------------------------------- potential

type Hit = { attacker: number; dmg: number; cost: number };

export type Potential = {
  /** Largest single hit without turning. */
  maxDirect: number;
  /** Dead next turn to attacks from current facings, within the attacker's mana. */
  killDirect: boolean;
  /** Dead next turn if one attacker first rotates (rotate cost included). */
  killRotated: boolean;
};

/** Can `hits` (one entry per attacker) reach `hp` within `mana`? Greedy by damage. */
const reaches = (hits: Hit[], hp: number, mana: number): boolean => {
  const used = new Set<number>();
  let dmg = 0;
  let cost = 0;
  for (const h of hits) {
    if (used.has(h.attacker)) continue;
    used.add(h.attacker);
    dmg += h.dmg;
    cost += h.cost;
    if (cost > mana) return false;
    if (dmg >= hp) return true;
  }
  return false;
};

/**
 * What `attackerOwner` could do to the other side's units on their next turn
 * with `mana`: per victim uid, the biggest direct hit and whether the unit
 * can be finished, directly or after one rotate. Counters are ignored (an
 * over-estimate that keeps the search careful).
 */
export const offensePotential = (
  ctx: Ctx,
  s: GameState,
  attackerOwner: PlayerId,
  mana: number,
): Map<number, Potential> => {
  const out = new Map<number, Potential>();
  const victims: Unit[] = [];
  for (const u of s.units) if (u.owner !== attackerOwner && !isHidden(u)) victims.push(u);
  if (victims.length === 0) return out;
  const direct = new Map<number, Hit[]>();
  const any = new Map<number, Hit[]>();
  const locked = rotateCommandLocked(ctx, s, attackerOwner);
  for (const a of s.units) {
    if (a.owner !== attackerOwner || isHidden(a)) continue;
    const card = cardOf(ctx.pack, a.cardId);
    if (!canAttack(card)) continue;
    const ac = attackCostOf(ctx, card);
    if (ac > mana) continue;
    // the turn-scoped buff is gone by the next turn
    const atk = effectiveAtk(ctx, s, a) - a.atkBuff;
    const rc = rotateCostOf(ctx, a);
    const facings: { f: Facing; cost: number; turned: boolean }[] = [{ f: a.facing, cost: ac, turned: false }];
    if (!locked && ac + rc <= mana) {
      facings.push({ f: turnFacing(a.facing, 1), cost: ac + rc, turned: true });
      facings.push({ f: turnFacing(a.facing, -1), cost: ac + rc, turned: true });
    }
    for (const fc of facings) {
      const cells = rangeCells(ctx, a.cardId, a.pos, fc.f);
      for (const v of victims) {
        if (!covers(cells, v.pos)) continue;
        const blind = isBlindShot(ctx, a, v);
        const dmg = atk + (blind ? ctx.cfg.blindBonus : 0) + damageBonus(ctx, s, a, v, blind);
        if (dmg <= 0) continue;
        const hit: Hit = { attacker: a.uid, dmg, cost: fc.cost };
        const list = any.get(v.uid);
        if (list === undefined) any.set(v.uid, [hit]);
        else list.push(hit);
        if (!fc.turned) {
          const d = direct.get(v.uid);
          if (d === undefined) direct.set(v.uid, [hit]);
          else d.push(hit);
        }
      }
    }
  }
  const byDmg = (x: Hit, y: Hit): number => y.dmg - x.dmg || x.cost - y.cost;
  for (const v of victims) {
    const d = direct.get(v.uid) ?? [];
    const al = any.get(v.uid) ?? [];
    if (d.length === 0 && al.length === 0) continue;
    d.sort(byDmg);
    al.sort(byDmg);
    const hp = hpOf(ctx, v);
    const killDirect = reaches(d, hp, mana);
    out.set(v.uid, {
      maxDirect: d.length === 0 ? 0 : d[0].dmg,
      killDirect,
      killRotated: killDirect || reaches(al, hp, mana),
    });
  }
  return out;
};

// ------------------------------------------------------------- the eval

/** Mana each side will hold on its next turn under the configured timing. */
const nextTurnMana = (ctx: Ctx, s: GameState, p: PlayerId): number => {
  const ps = s.players[p];
  if (ctx.cfg.incomeTiming === "turn_end") return ps.mana;
  return Math.min(ctx.cfg.manaCap, ps.mana + incomeFor(ctx, ps.chips));
};

/** Board HP counting hidden units too (they come back and still block their cell). */
const hpTotalAll = (ctx: Ctx, s: GameState, p: PlayerId): number => {
  let n = 0;
  for (const u of s.units) if (u.owner === p) n += hpOf(ctx, u);
  return n;
};

const atkTotal = (ctx: Ctx, s: GameState, p: PlayerId): number => {
  let n = 0;
  for (const u of s.units) if (u.owner === p) n += cardOf(ctx.pack, u.cardId).atk;
  return n;
};

/**
 * Scalar score from `p`'s point of view. `nextMana` overrides what each side
 * is assumed to spend on its next turn (the deep eval passes projected
 * budgets); by default it is each side's current mana plus, under
 * turn_start income, the coming tick.
 */
export const strongEvaluate = (
  ctx: Ctx,
  s: GameState,
  p: PlayerId,
  w: StrongWeights = STRONG_WEIGHTS,
  nextMana?: [number, number],
): number => {
  if (s.ended) {
    if (s.winner === null) return 0;
    return s.winner === p ? STRONG_WIN : -STRONG_WIN;
  }
  const o = opponent(p);
  const cw = ctx.cfg.controlWin;
  const occP = occupied(s, p);
  const occO = occupied(s, o);
  const pp = s.players[p];
  const po = s.players[o];
  let score = 0;
  score += w.occ * (occP - occO);
  score += w.hp * (hpTotalAll(ctx, s, p) - hpTotalAll(ctx, s, o));
  score += w.atk * (atkTotal(ctx, s, p) - atkTotal(ctx, s, o));
  score += w.chip * (pp.chips - po.chips);
  score += w.income * (incomeFor(ctx, pp.chips) - incomeFor(ctx, po.chips));
  if (ctx.cfg.lifeValueEnabled) score += w.life * (pp.life - po.life);
  score += w.mana * (pp.mana - po.mana);

  if (occP >= cw) score += w.reach;
  if (occO >= cw) score -= w.reach;
  if (pp.reach && occP >= cw) score += w.holdControl;
  if (po.reach && occO >= cw) score -= w.oppControl;

  const manaP = nextMana === undefined ? nextTurnMana(ctx, s, p) : nextMana[p];
  const manaO = nextMana === undefined ? nextTurnMana(ctx, s, o) : nextMana[o];
  const against = offensePotential(ctx, s, o, manaO);
  for (const [uid, pot] of against) {
    const u = s.units.find((x) => x.uid === uid);
    if (u === undefined) continue;
    const v = unitValue(ctx, u, w);
    if (pot.killDirect) score -= w.killable * v;
    else if (pot.killRotated) score -= w.killable * 0.6 * v;
    else score -= w.threat * Math.min(pot.maxDirect, hpOf(ctx, u));
  }
  const mine = offensePotential(ctx, s, p, manaP);
  for (const [uid, pot] of mine) {
    const u = s.units.find((x) => x.uid === uid);
    if (u === undefined) continue;
    const v = unitValue(ctx, u, w);
    if (pot.killDirect) score += w.kill * v;
    else if (pot.killRotated) score += w.kill * 0.6 * v;
    else score += w.threat * 0.5 * Math.min(pot.maxDirect, hpOf(ctx, u));
  }
  return score;
};

/** Is `p` in the control state (declared reach and still on controlWin cells)? */
export const hasControl = (ctx: Ctx, s: GameState, p: PlayerId): boolean =>
  s.players[p].reach && occupied(s, p) >= ctx.cfg.controlWin;

/** Does the range cover the cell? Exported for the candidate pruning in strong-search.ts. */
export const cellCovers = covers;
