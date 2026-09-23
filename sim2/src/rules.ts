import { allCells, effMaxHp, isBoardCell, isFacing, isTaiji, posEq, turnFacing } from "./board.ts";
import { canAttack, cardOf } from "./cards.ts";
import {
  alliesInRange,
  attackCostFor,
  checkLifeLoss,
  counterersOf,
  destroyUnit,
  enemiesInRange,
  isAoeAttack,
  recheckControl,
  resolveAttack,
} from "./combat.ts";
import { cloneState, controlCount, gainMana, isHidden, occupied, underdogNote, underdogSteps, unitAt, unitByUid } from "./state.ts";
import type { UnderdogView } from "./state.ts";
import type { Ctx } from "./state.ts";
import {
  applyReigu,
  canUseVariant,
  clubVictims,
  effectsOn,
  fxOf,
  isProxyRotator,
  REIGU_MODES,
  reiguChoiceOk,
  reiguTargetOk,
  reiguTargeting,
  reiguUsable,
  onSummon,
  rotateCommandLocked,
  rotateIsFree,
} from "./effects.ts";
import type {
  Action,
  ApplyResult,
  AttackVariant,
  CardDef,
  Facing,
  GameEvent,
  GameState,
  PlayerId,
  Pos,
  Unit,
} from "./types.ts";

// ---------------------------------------------------------------- costs

/**
 * The card's summon cost before positional discounts. EXP-0913
 * summonCostScale:"half" halves it (round up, floor 1).
 */
export const baseSummonCost = (ctx: Ctx, card: CardDef): number =>
  ctx.cfg.summonCostScale === "half"
    ? Math.max(1, Math.ceil(card.summonCost / 2))
    : card.summonCost;

/** DESIGN 3.1: taiji subtracts taijiDiscount with a floor of taijiFloor.
 *  The scale (if any) is applied first, then the taiji discount. */
export const summonCostAt = (ctx: Ctx, card: CardDef, pos: Pos): number => {
  const base = baseSummonCost(ctx, card);
  return isTaiji(pos) ? Math.max(ctx.cfg.taijiFloor, base - ctx.cfg.taijiDiscount) : base;
};

/**
 * 劣勢時の大型割引 for p summoning `card` now: underdogDiscount per 劣勢 step
 * (underdogSteps: underdogBy cells / chips = 0 or 1, both = 0..2) when the
 * card is a shikigami printed at underdogDiscountMinCost or more; else 0.
 */
export const underdogSummonDiscount = (ctx: Ctx, s: UnderdogView, p: PlayerId, card: CardDef): number =>
  ctx.cfg.underdogDiscount > 0 && card.kind === "shikigami" && card.summonCost >= ctx.cfg.underdogDiscountMinCost
    ? ctx.cfg.underdogDiscount * underdogSteps(ctx, s, p)
    : 0;

/**
 * What p pays to summon (or inherit-summon) `card` onto `pos` right now:
 * summonCostAt (scale, then 太極), then 劣勢時の大型割引 on top, floor 1.
 * Every legality check, the apply, the previews and the AI go through this.
 */
export const summonCostFor = (ctx: Ctx, s: UnderdogView, p: PlayerId, card: CardDef, pos: Pos): number => {
  const cost = summonCostAt(ctx, card, pos);
  const off = underdogSummonDiscount(ctx, s, p, card);
  return off === 0 ? cost : Math.max(1, cost - off);
};

// attackCostOf lives in combat.ts (combat must not import rules.ts); it is
// re-exported here so the cost helpers stay findable together.
export { attackCostOf } from "./combat.ts";
/** Mana a rotate (or a proxy rotate) by `u` costs: the rule's rotateCost, 0 for tm04 (爪鬼). */
export const rotateCostOf = (ctx: Ctx, u: Unit): number => (rotateIsFree(ctx, u) ? 0 : ctx.cfg.rotateCost);

/** chipBonus = number of chipIncomeSteps thresholds reached. */
export const chipBonus = (ctx: Ctx, chips: number): number =>
  ctx.cfg.chipIncomeSteps.reduce((n, step) => (chips >= step ? n + 1 : n), 0);

export const incomeFor = (ctx: Ctx, chips: number): number =>
  ctx.cfg.baseIncome + chipBonus(ctx, chips);

/**
 * The chips a player holds after a turn end with 占拠 `occ`. ratchet: they
 * never go down (catch_up jumps to occ, one_per_turn adds at most 1).
 * incomeMode "current": they are simply the count at that turn end.
 */
export const nextChips = (ctx: Ctx, chips: number, occ: number): number => {
  if (ctx.cfg.incomeMode === "current") return occ;
  if (ctx.cfg.chipMode === "one_per_turn") return occ > chips ? chips + 1 : chips;
  return Math.max(chips, occ);
};

/** Anything income can be read from: a GameState, or the browser's BoardView. */
export type IncomeView = UnderdogView;

/** 劣勢ボーナス: underdogIncome per 劣勢 step (underdogBy), judged as income is paid. */
export const underdogBonus = (ctx: Ctx, s: IncomeView, p: PlayerId): number =>
  ctx.cfg.underdogIncome > 0 ? ctx.cfg.underdogIncome * underdogSteps(ctx, s, p) : 0;

/** The chip count the income steps are judged on: the chips (ratchet) or the 占拠 as it stands (current). */
export const incomeChips = (ctx: Ctx, s: IncomeView, p: PlayerId): number =>
  ctx.cfg.incomeMode === "current" ? controlCount(ctx, s, p) : s.players[p].chips;

export type IncomeParts = {
  /** baseIncome + the chip steps reached. */
  steps: number;
  /** 劣勢ボーナス (0 when not behind or off). */
  underdog: number;
  total: number;
};

/** What p would be paid if income were paid now. The engine pays exactly this; the AI and HUD read it. */
export const incomeParts = (ctx: Ctx, s: IncomeView, p: PlayerId): IncomeParts => {
  const steps = incomeFor(ctx, incomeChips(ctx, s, p));
  const underdog = underdogBonus(ctx, s, p);
  return { steps, underdog, total: steps + underdog };
};

export const incomeNow = (ctx: Ctx, s: IncomeView, p: PlayerId): number => incomeParts(ctx, s, p).total;

// ---------------------------------------------------------- legality

/** EXP-0913 summonLimit: has the turn player already used up their summons? */
export const summonsExhausted = (ctx: Ctx, s: GameState): boolean =>
  ctx.cfg.summonLimit !== null && s.summonsThisTurn >= ctx.cfg.summonLimit;

export const canSummonAt = (ctx: Ctx, s: GameState, card: CardDef, pos: Pos): boolean => {
  if (card.kind !== "shikigami") return false; // reigu are unplayable in v1
  if (!isBoardCell(pos)) return false;
  if (summonsExhausted(ctx, s)) return false;
  if (s.units.length >= ctx.cfg.boardCells) return false;
  if (unitAt(s, pos) !== undefined) return false;
  const maxHp = effMaxHp(card.hp, pos, card.attribute, ctx.cfg.attrBonus, ctx.cfg.maxHp);
  if (maxHp <= 0) return false;
  return true;
};

// ---------------------------------------------------- inherit (EXP-0913B 1.2)

/** Either side "none" (空) matches anything; otherwise attributes must match. */
const inheritAttrOk = (a: CardDef, b: CardDef): boolean =>
  a.attribute === "none" || b.attribute === "none" || a.attribute === b.attribute;

/**
 * Can `card` (from the turn player's hand) be inherit-summoned onto `target`?
 * Strictly higher printed summon cost, compatible attribute, the inherited
 * damage must leave it alive, the full cost (taiji discount applies) must be
 * payable BEFORE the ceil(old/2) refund comes back, and the summon counts
 * against summonLimit. Hidden (Mayohiga) units cannot be chosen.
 */
export const canInherit = (ctx: Ctx, s: GameState, card: CardDef, target: Unit): boolean => {
  if (!ctx.cfg.inheritSummon) return false;
  if (card.kind !== "shikigami") return false;
  if (summonsExhausted(ctx, s)) return false;
  if (target.owner !== s.turnPlayer || isHidden(target)) return false;
  const old = cardOf(ctx.pack, target.cardId);
  if (card.summonCost <= old.summonCost) return false;
  if (!inheritAttrOk(card, old)) return false;
  const maxHp = effMaxHp(card.hp, target.pos, card.attribute, ctx.cfg.attrBonus, ctx.cfg.maxHp);
  if (maxHp - target.damage <= 0) return false;
  return s.players[s.turnPlayer].mana >= summonCostFor(ctx, s, s.turnPlayer, card, target.pos);
};

/** The log line of a 劣勢時の大型割引 (a rule line, right after the summon it discounted). */
const underdogDiscountEvent = (p: PlayerId, amount: number): GameEvent => ({
  t: "effect",
  player: p,
  source: "rule",
  uid: null,
  text: `${p === 0 ? "先手" : "後手"}: 劣勢割引 −${amount}`,
});

/** Refund for the replaced unit: ceil(printed summonCost / 2). */
export const inheritRefund = (old: CardDef): number => Math.ceil(old.summonCost / 2);

const applyInherit = (
  ctx: Ctx,
  s: GameState,
  a: { handIndex: number; targetUid: number },
  events: GameEvent[],
): void => {
  const p = s.turnPlayer;
  const ps = s.players[p];
  const cardId = ps.hand[a.handIndex];
  const card = cardOf(ctx.pack, cardId);
  const old = unitByUid(s, a.targetUid);
  if (old === undefined) throw new Error(`inherit: no unit ${a.targetUid}`);
  const oldCard = cardOf(ctx.pack, old.cardId);
  const cost = summonCostFor(ctx, s, p, card, old.pos);
  const discount = summonCostAt(ctx, card, old.pos) - cost;
  ps.mana -= cost;
  // the event carries what the mana cap let through
  const refund = gainMana(ps, inheritRefund(oldCard), ctx.cfg.manaCap);
  ps.hand = ps.hand.filter((_, i) => i !== a.handIndex);
  ps.grave.push(old.cardId); // not a destruction: no life loss, no refund rule
  const maxHp = effMaxHp(card.hp, old.pos, card.attribute, ctx.cfg.attrBonus, ctx.cfg.maxHp);
  const unit: Unit = {
    uid: s.nextUid,
    cardId,
    owner: p,
    pos: { x: old.pos.x, y: old.pos.y },
    facing: old.facing,
    // damage carries over; an over-healed carry-over is capped at maxHp HP
    damage: Math.max(old.damage, maxHp - ctx.cfg.maxHp),
    attackedThisTurn: old.attackedThisTurn,
    rotatedThisTurn: old.rotatedThisTurn,
    summonedThisTurn: true, // any attack it makes this turn is a summon-attack
    hiddenBy: null,
    atkBuff: 0,
  };
  s.nextUid += 1;
  s.units = s.units.map((u) => (u.uid === old.uid ? unit : u));
  s.summonsThisTurn += 1;
  events.push({
    t: "summon",
    player: p,
    uid: unit.uid,
    cardId,
    pos: unit.pos,
    facing: unit.facing,
    cost,
    taiji: isTaiji(unit.pos),
    baseCost: card.summonCost,
    inheritedFrom: { uid: old.uid, cardId: old.cardId, baseCost: oldCard.summonCost, refund },
    ...(discount > 0 ? { underdogDiscount: discount } : {}),
  });
  if (discount > 0) events.push(underdogDiscountEvent(p, discount));
  onSummon(ctx, s, unit, events); // tm11 Ungaikyo overwrites the carried damage
};

/** Facings a turning reigu may set. tm18: 90 degrees either way. sk18: any. */
const reiguFacings = (ctx: Ctx, cardId: string, current: Facing): Facing[] =>
  fxOf(ctx, cardId) === "sk18"
    ? ([0, 1, 2, 3] as Facing[]).filter((f) => f !== current)
    : [turnFacing(current, 1), turnFacing(current, -1)];

/** The card at a hand index; undefined unless the index is a whole number in range. */
const handCardAt = (hand: string[], i: number): string | undefined => (Number.isInteger(i) ? hand[i] : undefined);

export const isLegal = (ctx: Ctx, s: GameState, a: Action): boolean => {
  if (s.ended) return false;
  const p = s.turnPlayer;
  const ps = s.players[p];
  if (a.kind === "pass") return true;
  if (a.kind === "inherit") {
    const cardId = handCardAt(ps.hand, a.handIndex);
    if (cardId === undefined) return false;
    const t = unitByUid(s, a.targetUid);
    if (t === undefined) return false;
    return canInherit(ctx, s, cardOf(ctx.pack, cardId), t);
  }
  if (a.kind === "summon") {
    const cardId = handCardAt(ps.hand, a.handIndex);
    if (cardId === undefined) return false;
    if (!isFacing(a.facing)) return false;
    const card = cardOf(ctx.pack, cardId);
    if (!canSummonAt(ctx, s, card, a.pos)) return false;
    return ps.mana >= summonCostFor(ctx, s, p, card, a.pos);
  }
  if (a.kind === "reigu") {
    if (!effectsOn(ctx)) return false;
    const cardId = handCardAt(ps.hand, a.handIndex);
    if (cardId === undefined) return false;
    const card = cardOf(ctx.pack, cardId);
    if (card.kind !== "reigu") return false;
    if (ps.mana < card.summonCost) return false;
    if (!reiguUsable(ctx, s, cardId)) return false;
    const targeting = reiguTargeting(fxOf(ctx, cardId));
    const choice = { mode: a.mode, victimUid: a.victimUid };
    if (targeting === "none") return a.targetUid === null && a.facing === null && reiguChoiceOk(ctx, s, cardId, null, choice);
    if (a.targetUid === null) return false;
    const t = unitByUid(s, a.targetUid);
    if (t === undefined) return false;
    // only the facings legalActions offers (tm18: 90 degrees either way)
    if (targeting === "unit-any-facing") {
      if (a.facing === null || !reiguFacings(ctx, cardId, t.facing).includes(a.facing)) return false;
    } else if (a.facing !== null) {
      return false;
    }
    return reiguTargetOk(ctx, s, cardId, t) && reiguChoiceOk(ctx, s, cardId, t, choice);
  }
  const u = unitByUid(s, a.uid);
  if (u === undefined || u.owner !== p || isHidden(u)) return false;
  const card = cardOf(ctx.pack, u.cardId);
  if (a.kind === "rotate") {
    if (u.attackedThisTurn) return false; // 3.3: attacking ends the unit's turn
    if (u.rotatedThisTurn) return false;
    if (rotateCommandLocked(ctx, s, p)) return false; // tm17
    if (ps.mana < rotateCostOf(ctx, u)) return false;
    return a.facing === turnFacing(u.facing, 1) || a.facing === turnFacing(u.facing, -1);
  }
  if (a.kind === "proxyRotate") {
    // tm17 spends its own rotate to turn someone else. Not a rotate COMMAND
    // on the victim, so it bypasses its own lock.
    if (!isProxyRotator(ctx, u)) return false;
    if (u.attackedThisTurn || u.rotatedThisTurn) return false;
    if (ps.mana < rotateCostOf(ctx, u)) return false;
    const t = unitByUid(s, a.targetUid);
    if (t === undefined || t.uid === u.uid || isHidden(t)) return false;
    return a.facing === turnFacing(t.facing, 1) || a.facing === turnFacing(t.facing, -1);
  }
  // attack
  const variant = a.variant ?? "normal";
  if (u.attackedThisTurn) return false;
  if (!canAttack(card)) return false;
  if (!canUseVariant(ctx, u, variant)) return false;
  if (ps.mana < attackCostFor(ctx, u, variant)) return false;
  if (variant === "heal") {
    if (a.targetUid === null || a.counterOrder !== undefined) return false;
    return alliesInRange(ctx, s, u).some((f) => f.uid === a.targetUid);
  }
  const foes = enemiesInRange(ctx, s, u);
  if (foes.length === 0) return false;
  if (isAoeAttack(ctx, card)) {
    if (a.targetUid !== null) return false;
  } else if (a.targetUid === null || !foes.some((f) => f.uid === a.targetUid)) {
    return false;
  }
  return a.counterOrder === undefined || counterOrderOk(ctx, s, a, a.counterOrder);
};

/**
 * A counterOrder names every unit that will counter this attack, each once
 * (any order). Checked against the counterers found on a scratch copy.
 */
const counterOrderOk = (
  ctx: Ctx,
  s: GameState,
  a: { uid: number; targetUid: number | null; variant?: AttackVariant },
  order: readonly number[],
): boolean => {
  if (!Array.isArray(order) || !order.every((x) => Number.isInteger(x))) return false;
  const uids = counterersOf(ctx, s, a);
  return order.length === uids.length && new Set(order).size === order.length && order.every((x) => uids.includes(x));
};

// ------------------------------------------------------- enumeration

/** Attack variants that strike enemies like a plain attack (heal targets allies and is listed apart). */
const STRIKE_VARIANTS: readonly AttackVariant[] = ["konshin", "regen", "drink"];

/** All legal atomic actions for the turn player. `pass` is always last. */
export const legalActions = (ctx: Ctx, s: GameState): Action[] => {
  const out: Action[] = [];
  if (s.ended) return [{ kind: "pass" }];
  const p = s.turnPlayer;
  const ps = s.players[p];

  // summons: dedupe identical cards in hand to one representative index
  if (s.units.length < ctx.cfg.boardCells && !summonsExhausted(ctx, s)) {
    const seen = new Set<string>();
    const empties = allCells().filter((c) => unitAt(s, c) === undefined);
    for (let i = 0; i < ps.hand.length; i++) {
      const cardId = ps.hand[i];
      if (seen.has(cardId)) continue;
      seen.add(cardId);
      const card = cardOf(ctx.pack, cardId);
      for (const pos of empties) {
        if (!canSummonAt(ctx, s, card, pos)) continue;
        if (ps.mana < summonCostFor(ctx, s, s.turnPlayer, card, pos)) continue;
        for (const facing of [0, 1, 2, 3] as Facing[]) {
          out.push({ kind: "summon", handIndex: i, pos, facing });
        }
      }
    }
  }

  // EXP-0913B inherit-summons: listed alongside ordinary summons
  if (ctx.cfg.inheritSummon && !summonsExhausted(ctx, s)) {
    const seen = new Set<string>();
    for (let i = 0; i < ps.hand.length; i++) {
      const cardId = ps.hand[i];
      if (seen.has(cardId)) continue;
      seen.add(cardId);
      const card = cardOf(ctx.pack, cardId);
      if (card.kind !== "shikigami") continue;
      for (const t of s.units) {
        if (canInherit(ctx, s, card, t)) out.push({ kind: "inherit", handIndex: i, targetUid: t.uid });
      }
    }
  }

  // reigu, deduped the same way
  if (effectsOn(ctx)) {
    const seenReigu = new Set<string>();
    for (let i = 0; i < ps.hand.length; i++) {
      const cardId = ps.hand[i];
      if (seenReigu.has(cardId)) continue;
      const card = cardOf(ctx.pack, cardId);
      if (card.kind !== "reigu") continue;
      seenReigu.add(cardId);
      if (ps.mana < card.summonCost) continue;
      if (!reiguUsable(ctx, s, cardId)) continue;
      const targeting = reiguTargeting(fxOf(ctx, cardId));
      if (targeting === "none") {
        out.push({ kind: "reigu", handIndex: i, targetUid: null, facing: null });
        continue;
      }
      for (const t of s.units) {
        if (!reiguTargetOk(ctx, s, cardId, t)) continue;
        if (targeting === "unit-any-facing") {
          for (const f of reiguFacings(ctx, cardId, t.facing)) {
            out.push({ kind: "reigu", handIndex: i, targetUid: t.uid, facing: f });
          }
        } else if (targeting === "unit-own-mode") {
          for (const mode of REIGU_MODES) out.push({ kind: "reigu", handIndex: i, targetUid: t.uid, facing: null, mode });
        } else if (targeting === "unit-own-victim") {
          for (const v of clubVictims(ctx, s, t)) out.push({ kind: "reigu", handIndex: i, targetUid: t.uid, facing: null, victimUid: v.uid });
        } else {
          out.push({ kind: "reigu", handIndex: i, targetUid: t.uid, facing: null });
        }
      }
    }
  }

  for (const u of s.units) {
    if (u.owner !== p || isHidden(u)) continue;
    const card = cardOf(ctx.pack, u.cardId);
    if (!u.attackedThisTurn) {
      if (canAttack(card) && ps.mana >= attackCostFor(ctx, u)) {
        const foes = enemiesInRange(ctx, s, u);
        // the striking variants this unit has and can pay for (再生 / 飲酒 cost extra)
        const extra = STRIKE_VARIANTS.filter((v) => canUseVariant(ctx, u, v) && ps.mana >= attackCostFor(ctx, u, v));
        if (foes.length > 0) {
          if (isAoeAttack(ctx, card)) {
            out.push({ kind: "attack", uid: u.uid, targetUid: null });
            for (const variant of extra) out.push({ kind: "attack", uid: u.uid, targetUid: null, variant });
          } else {
            for (const f of foes) {
              out.push({ kind: "attack", uid: u.uid, targetUid: f.uid });
              for (const variant of extra) out.push({ kind: "attack", uid: u.uid, targetUid: f.uid, variant });
            }
          }
        }
        // tm06 heal-attack on an ally in range
        if (canUseVariant(ctx, u, "heal")) {
          for (const f of alliesInRange(ctx, s, u)) {
            out.push({ kind: "attack", uid: u.uid, targetUid: f.uid, variant: "heal" });
          }
        }
      }
      if (!u.rotatedThisTurn && ps.mana >= rotateCostOf(ctx, u)) {
        if (!rotateCommandLocked(ctx, s, p)) {
          out.push({ kind: "rotate", uid: u.uid, facing: turnFacing(u.facing, 1) });
          out.push({ kind: "rotate", uid: u.uid, facing: turnFacing(u.facing, -1) });
        }
        if (isProxyRotator(ctx, u)) {
          for (const t of s.units) {
            if (t.uid === u.uid || isHidden(t)) continue;
            out.push({ kind: "proxyRotate", uid: u.uid, targetUid: t.uid, facing: turnFacing(t.facing, 1) });
            out.push({ kind: "proxyRotate", uid: u.uid, targetUid: t.uid, facing: turnFacing(t.facing, -1) });
          }
        }
      }
    }
  }

  out.push({ kind: "pass" });
  return out;
};

// ------------------------------------------------------------ apply

/**
 * Mutates `s`. Assumes `isLegal` already held. Occupied counts are rechecked
 * after every action (EXP-0913B 1.5; a no-op under the default controlHold).
 */
export const applyActionInPlace = (
  ctx: Ctx,
  s: GameState,
  a: Action,
  events: GameEvent[],
): void => {
  applyActionCore(ctx, s, a, events);
  recheckControl(ctx, s, events);
};

const applyActionCore = (
  ctx: Ctx,
  s: GameState,
  a: Action,
  events: GameEvent[],
): void => {
  const p = s.turnPlayer;
  const ps = s.players[p];
  if (a.kind === "pass") {
    events.push({ t: "pass", player: p });
    return;
  }
  if (a.kind === "inherit") {
    applyInherit(ctx, s, a, events);
    return;
  }
  if (a.kind === "summon") {
    const cardId = ps.hand[a.handIndex];
    const card = cardOf(ctx.pack, cardId);
    const cost = summonCostFor(ctx, s, p, card, a.pos);
    const discount = summonCostAt(ctx, card, a.pos) - cost;
    ps.mana -= cost;
    ps.hand = ps.hand.filter((_, i) => i !== a.handIndex);
    const unit: Unit = {
      uid: s.nextUid,
      cardId,
      owner: p,
      pos: { x: a.pos.x, y: a.pos.y },
      facing: a.facing,
      damage: 0,
      attackedThisTurn: false,
      rotatedThisTurn: false,
      summonedThisTurn: true,
      hiddenBy: null,
      atkBuff: 0,
    };
    s.nextUid += 1;
    s.units.push(unit);
    s.summonsThisTurn += 1;
    events.push({
      t: "summon",
      player: p,
      uid: unit.uid,
      cardId,
      pos: unit.pos,
      facing: unit.facing,
      cost,
      taiji: isTaiji(a.pos),
      baseCost: card.summonCost,
      ...(discount > 0 ? { underdogDiscount: discount } : {}),
    });
    if (discount > 0) events.push(underdogDiscountEvent(p, discount));
    onSummon(ctx, s, unit, events); // tm11 Ungaikyo
    return;
  }
  if (a.kind === "reigu") {
    const cardId = ps.hand[a.handIndex];
    const card = cardOf(ctx.pack, cardId);
    ps.mana -= card.summonCost;
    ps.hand = ps.hand.filter((_, i) => i !== a.handIndex);
    ps.grave.push(cardId);
    events.push({
      t: "reigu",
      player: p,
      cardId,
      targetUid: a.targetUid,
      cost: card.summonCost,
    });
    const target = a.targetUid === null ? null : (unitByUid(s, a.targetUid) ?? null);
    // a reigu kill belongs to the reigu's user (EXP-0913B 1.1)
    applyReigu(
      ctx,
      s,
      cardId,
      target,
      a.facing,
      events,
      // killRewardCondition "upset": the reigu's use cost is the destroying cost
      (victim) => destroyUnit(ctx, s, victim, events, p, { cost: card.summonCost }),
      { mode: a.mode, victimUid: a.victimUid },
    );
    checkLifeLoss(ctx, s, events);
    return;
  }
  if (a.kind === "rotate") {
    const u = unitByUid(s, a.uid);
    if (u === undefined) throw new Error(`rotate: no unit ${a.uid}`);
    ps.mana -= rotateCostOf(ctx, u);
    const from = u.facing;
    u.facing = a.facing;
    u.rotatedThisTurn = true;
    events.push({ t: "rotate", player: p, uid: u.uid, cost: rotateCostOf(ctx, u), cardId: u.cardId, from, to: u.facing });
    return;
  }
  if (a.kind === "proxyRotate") {
    const u = unitByUid(s, a.uid);
    const t = unitByUid(s, a.targetUid);
    if (u === undefined || t === undefined) throw new Error("proxyRotate: missing unit");
    ps.mana -= rotateCostOf(ctx, u);
    u.rotatedThisTurn = true;
    const turnedFrom = t.facing;
    t.facing = a.facing;
    events.push({ t: "rotate", player: p, uid: u.uid, cost: rotateCostOf(ctx, u), cardId: u.cardId, from: u.facing, to: u.facing });
    events.push({
      t: "effect",
      player: p,
      source: u.cardId,
      uid: t.uid,
      text: `玖龍街: ${cardOf(ctx.pack, t.cardId).nameJa} を代理で回転`,
      from: turnedFrom,
      to: t.facing,
    });
    return;
  }
  resolveAttack(ctx, s, a.uid, a.targetUid, events, a.variant ?? "normal", { counterOrder: a.counterOrder });
};

/** Pure wrapper: clones, applies, returns the new state plus its events. */
export const applyAction = (ctx: Ctx, s: GameState, a: Action): ApplyResult => {
  const next = cloneState(s);
  const events: GameEvent[] = [];
  applyActionInPlace(ctx, next, a, events);
  return { state: next, events };
};

export const emptyCells = (s: GameState): Pos[] =>
  allCells().filter((c) => !s.units.some((u) => posEq(u.pos, c)));

export const occupiedCount = occupied;
