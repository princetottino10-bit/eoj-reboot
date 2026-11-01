import { posEq, toBoardCells } from "./board.ts";
import { cardOfUnit, healUnit, isHidden, occupied, unitByUid, unitHp } from "./state.ts";
import type { Ctx } from "./state.ts";
import type {
  AttackVariant,
  GameEvent,
  GameState,
  HitRecord,
  PlayerId,
  Pos,
  Unit,
} from "./types.ts";
import { cardOf } from "./cards.ts";
import {
  atkReplacementNote,
  damageBonus,
  damageBonusReasons,
  effectiveAtk,
  healAttackAmount,
  onAfterAttack,
  onUnitDestroyed,
} from "./effects.ts";

export const attackCells = (ctx: Ctx, u: Unit): Pos[] => {
  const c = cardOfUnit(ctx, u);
  return toBoardCells(c.attackRange, u.pos, u.facing);
};

export const blindCells = (ctx: Ctx, u: Unit): Pos[] => {
  const c = cardOfUnit(ctx, u);
  return toBoardCells(c.blindSpots, u.pos, u.facing);
};

export const counterCells = (ctx: Ctx, u: Unit): Pos[] => {
  const c = cardOfUnit(ctx, u);
  return toBoardCells(c.counterRange, u.pos, u.facing);
};

/** Only physical attacks can be blind shots; jutsu ignores blind spots. */
export const isBlindShot = (ctx: Ctx, attacker: Unit, target: Unit): boolean => {
  if (cardOfUnit(ctx, attacker).attackType !== "phys") return false;
  return blindCells(ctx, target).some((c) => posEq(c, attacker.pos));
};

export const inAttackRange = (ctx: Ctx, u: Unit, pos: Pos): boolean =>
  attackCells(ctx, u).some((c) => posEq(c, pos));

export const inCounterRange = (ctx: Ctx, u: Unit, pos: Pos): boolean =>
  counterCells(ctx, u).some((c) => posEq(c, pos));

/** Units currently standing in the attacker's range cells. */
/** Hidden (Mayohiga) units are invisible to targeting and to AoE. */
export const unitsInRange = (ctx: Ctx, s: GameState, attacker: Unit): Unit[] => {
  const cells = attackCells(ctx, attacker);
  return s.units.filter(
    (u) => u.uid !== attacker.uid && !isHidden(u) && cells.some((c) => posEq(c, u.pos)),
  );
};

export const enemiesInRange = (ctx: Ctx, s: GameState, attacker: Unit): Unit[] =>
  unitsInRange(ctx, s, attacker).filter((u) => u.owner !== attacker.owner);

export const alliesInRange = (ctx: Ctx, s: GameState, attacker: Unit): Unit[] =>
  unitsInRange(ctx, s, attacker).filter((u) => u.owner === attacker.owner);

/**
 * Removes a unit from the board: owner loses lifeValue, owner gains
 * floor(summonCost / 2) mana, card goes to the owner's grave.
 */
export const destroyUnit = (ctx: Ctx, s: GameState, u: Unit, events: GameEvent[]): void => {
  const card = cardOf(ctx.pack, u.cardId);
  const owner = s.players[u.owner];
  const manaGain = Math.floor(card.summonCost / 2);
  owner.life -= card.lifeValue;
  owner.mana = Math.min(ctx.cfg.manaCap, owner.mana + manaGain);
  owner.grave.push(u.cardId);
  s.units = s.units.filter((x) => x.uid !== u.uid);
  events.push({
    t: "destroy",
    owner: u.owner,
    uid: u.uid,
    cardId: u.cardId,
    lifeLoss: card.lifeValue,
    manaGain,
  });
  onUnitDestroyed(ctx, s, u, events);
};

/** Ends the game if a player's life reached 0. R8: simultaneous -> turn player. */
export const checkLifeLoss = (ctx: Ctx, s: GameState, events: GameEvent[]): void => {
  if (s.ended) return;
  const dead0 = s.players[0].life <= 0;
  const dead1 = s.players[1].life <= 0;
  if (!dead0 && !dead1) return;
  let winner: PlayerId;
  if (dead0 && dead1) {
    winner = ctx.cfg.simultaneousDeathTurnPlayerWins ? s.turnPlayer : (s.turnPlayer === 0 ? 1 : 0);
  } else {
    winner = dead0 ? 1 : 0;
  }
  s.ended = true;
  s.winner = winner;
  s.winType = "life";
  events.push({ t: "gameEnd", winner, winType: "life", round: s.round });
};

/** Ends the game if the turn player already holds the control-win threshold. */
export const checkControlAtStart = (ctx: Ctx, s: GameState, events: GameEvent[]): boolean => {
  const p = s.turnPlayer;
  if (!s.players[p].reach) return false;
  if (occupied(s, p) < ctx.cfg.controlWin) return false;
  s.ended = true;
  s.winner = p;
  s.winType = "control";
  events.push({ t: "gameEnd", winner: p, winType: "control", round: s.round });
  return true;
};

/**
 * DESIGN Sec.3.4. Mutates `s` in place; caller owns the clone.
 * Order: pay -> pick targets -> damage applied simultaneously ->
 * destructions resolved simultaneously -> surviving enemy targets counter
 * (summed, simultaneous) -> attacker destruction check.
 */
export const resolveAttack = (
  ctx: Ctx,
  s: GameState,
  attackerUid: number,
  targetUid: number | null,
  events: GameEvent[],
  variant: AttackVariant = "normal",
): void => {
  const attacker = unitByUid(s, attackerUid);
  if (attacker === undefined) throw new Error(`resolveAttack: no unit ${attackerUid}`);
  const card = cardOfUnit(ctx, attacker);
  const wasSummonAttack = attacker.summonedThisTurn;

  s.players[attacker.owner].mana -= card.attackCost;
  attacker.attackedThisTurn = true;

  // tm06 heal-attack: restores an ally instead of striking. No damage, no
  // destruction, no counter - so it short-circuits the whole exchange.
  if (variant === "heal") {
    if (targetUid === null) throw new Error("resolveAttack: heal needs a target");
    const ally = unitByUid(s, targetUid);
    if (ally === undefined) throw new Error(`resolveAttack: no target ${targetUid}`);
    const amount = healAttackAmount(ctx, s, attacker);
    healUnit(ally, amount);
    events.push({
      t: "attack",
      player: attacker.owner,
      uid: attacker.uid,
      cardId: attacker.cardId,
      aoe: false,
      cost: card.attackCost,
      hits: [
        {
          uid: ally.uid,
          cardId: ally.cardId,
          owner: ally.owner,
          blind: false,
          dmg: -amount,
          destroyed: false,
          ally: true,
        },
      ],
      counterTotal: 0,
      counterCount: 0,
      attackerDestroyed: false,
      variant,
    });
    return;
  }

  const atk = effectiveAtk(ctx, s, attacker, variant);
  const swap = atkReplacementNote(ctx, s, attacker);
  if (swap !== null) {
    events.push({
      t: "effect",
      player: attacker.owner,
      source: attacker.cardId,
      uid: attacker.uid,
      text: swap,
    });
  }

  const targets: Unit[] = card.aoe
    ? unitsInRange(ctx, s, attacker)
    : (() => {
        if (targetUid === null) throw new Error("resolveAttack: single attack needs a target");
        const t = unitByUid(s, targetUid);
        if (t === undefined) throw new Error(`resolveAttack: no target ${targetUid}`);
        return [t];
      })();

  // 1. compute every hit before applying anything
  const plan = targets.map((t) => {
    const blind = isBlindShot(ctx, attacker, t);
    const reasons = damageBonusReasons(ctx, s, attacker, t, blind);
    for (const r of reasons) {
      events.push({ t: "effect", player: attacker.owner, source: attacker.cardId, uid: t.uid, text: r });
    }
    return {
      unit: t,
      blind,
      dmg: atk + (blind ? ctx.cfg.blindBonus : 0) + damageBonus(ctx, s, attacker, t, blind),
    };
  });

  // 2. apply all damage simultaneously
  for (const h of plan) h.unit.damage += h.dmg;

  // 3. resolve destructions simultaneously
  const destroyed = plan.filter((h) => unitHp(ctx, h.unit) <= 0);
  const hits: HitRecord[] = plan.map((h) => ({
    uid: h.unit.uid,
    cardId: h.unit.cardId,
    owner: h.unit.owner,
    blind: h.blind,
    dmg: h.dmg,
    destroyed: destroyed.includes(h),
    ally: h.unit.owner === attacker.owner,
  }));
  for (const h of destroyed) destroyUnit(ctx, s, h.unit, events);

  // 4. counter-attacks from surviving, non-blind-hit ENEMY targets only.
  //    jutsu attacks never draw a counter; a jutsu unit can still counter.
  let counterTotal = 0;
  let counterCount = 0;
  if (card.attackType === "phys") {
    for (const h of plan) {
      if (destroyed.includes(h)) continue;
      if (h.unit.owner === attacker.owner) continue; // R6: allies never counter
      if (h.blind) continue; // blind shots take no counter
      const hc = cardOfUnit(ctx, h.unit);
      if (hc.atk <= 0 || hc.counterRange.length === 0) continue;
      if (!inCounterRange(ctx, h.unit, attacker.pos)) continue;
      counterTotal += hc.atk;
      counterCount += 1;
    }
  }

  let attackerDestroyed = false;
  if (counterTotal > 0) {
    attacker.damage += counterTotal;
    if (unitHp(ctx, attacker) <= 0) {
      attackerDestroyed = true;
      destroyUnit(ctx, s, attacker, events);
    }
  }

  events.push({
    t: "attack",
    player: attacker.owner,
    uid: attacker.uid,
    cardId: attacker.cardId,
    aoe: card.aoe,
    cost: card.attackCost,
    hits,
    counterTotal,
    counterCount,
    attackerDestroyed,
    variant,
  });

  // 5. post-attack effects (konshin self-damage, Ibaraki regen)
  if (!attackerDestroyed) {
    onAfterAttack(ctx, s, attacker, wasSummonAttack, variant, events, (victim) =>
      destroyUnit(ctx, s, victim, events),
    );
  }

  checkLifeLoss(ctx, s, events);
};
