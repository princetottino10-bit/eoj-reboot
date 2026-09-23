import { effMaxHp, posEq, toBoardCells } from "./board.ts";
import {
  cardOfUnit,
  cloneState,
  controlCount,
  gainMana,
  healUnit,
  isHidden,
  opponent,
  unitByUid,
  unitHp,
} from "./state.ts";
import type { Ctx } from "./state.ts";
import type {
  CardDef,
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
  movesOnCounterKill,
  movesOnKill,
  onAfterAttack,
  onUnitDestroyed,
  variantExtraCost,
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

/** EXP-0913 attackCostDelta shifts every attack cost, floored at 1. */
export const attackCostOf = (ctx: Ctx, card: CardDef): number =>
  Math.max(1, card.attackCost + ctx.cfg.attackCostDelta);

/** What one attack by `u` with `variant` costs: the attack cost plus a paid variant's extra (再生 +1, 飲酒 +2). */
export const attackCostFor = (ctx: Ctx, u: Unit, variant: AttackVariant = "normal"): number =>
  attackCostOf(ctx, cardOfUnit(ctx, u)) + variantExtraCost(ctx, u, variant);

/**
 * EXP-0913 aoeMode. "off" downgrades range cards to single-target attacks;
 * "on" and "no_ff" keep them area attacks (they differ in who gets hit).
 */
export const isAoeAttack = (ctx: Ctx, card: CardDef): boolean =>
  card.aoe && ctx.cfg.aoeMode !== "off";

/** Does this card's area attack skip allies? aoeMode no_ff, or a jutsu card under jutsuAoeSparesAllies. */
export const aoeSparesAllies = (ctx: Ctx, card: CardDef): boolean =>
  ctx.cfg.aoeMode === "no_ff" || (ctx.cfg.jutsuAoeSparesAllies && card.attackType === "jutsu");

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
 * Who receives the destruction refund. half: the owner. none: nobody.
 * killer_half (EXP-0913B 1.1): whoever caused the destruction - which is the
 * owner themself for friendly fire, and nobody for a self-inflicted death.
 */
const refundRecipient = (ctx: Ctx, u: Unit, killer: PlayerId | null): PlayerId | null => {
  if (ctx.cfg.refundMode === "none") return null;
  if (ctx.cfg.refundMode === "killer_half") return killer;
  return u.owner;
};

/**
 * Mana a destruction pays: killRewardBase of the summon cost (or, for "card",
 * the card's printed 霊力価) + killRewardBonus, never below 0.
 */
export const killReward = (ctx: Ctx, card: CardDef): number => {
  const c = card.summonCost;
  const kb = ctx.cfg.killRewardBase;
  const base =
    kb === "card" ? card.manaValue : kb === "half_ceil" ? Math.ceil(c / 2) : kb === "full" ? c : kb === "zero" ? 0 : Math.floor(c / 2);
  return Math.max(0, base + ctx.cfg.killRewardBonus);
};

/**
 * What destroyed a unit, for killRewardCondition. cost: the printed summon
 * cost of the destroying unit (the attacker, or the countering unit), or the
 * reigu's use cost; null = unknown (no upset bonus). behind: the "behind"
 * verdict when it must be taken before any of several simultaneous kills left
 * the board (an area attack); absent = judged at this kill.
 */
export type KillSource = { cost: number | null; behind?: boolean };

/** killRewardCondition "behind": is the destroyer's 占拠 at most the opponent's right now? */
export const killerBehind = (ctx: Ctx, s: GameState, killer: PlayerId): boolean =>
  controlCount(ctx, s, killer) <= controlCount(ctx, s, opponent(killer));

type Reward = { amount: number; denied: boolean; upset: number };

/**
 * The destruction mana after killRewardCondition. The condition only touches
 * a reward paid to the destroyer (refundMode killer_half); a refund to the
 * owner and a death nobody caused pay killReward as before.
 */
const rewardFor = (ctx: Ctx, s: GameState, card: CardDef, killer: PlayerId | null, source: KillSource | undefined): Reward => {
  const base = killReward(ctx, card);
  const cond = ctx.cfg.killRewardCondition;
  if (cond === "always" || killer === null || ctx.cfg.refundMode !== "killer_half") return { amount: base, denied: false, upset: 0 };
  if (cond === "behind") {
    const ok = source?.behind ?? killerBehind(ctx, s, killer);
    return ok ? { amount: base, denied: false, upset: 0 } : { amount: 0, denied: true, upset: 0 };
  }
  const from = source?.cost ?? null;
  const upset = from === null ? 0 : Math.max(0, Math.floor((card.summonCost - from) / 2));
  return { amount: base + upset, denied: false, upset };
};

/**
 * Removes a unit from the board: owner loses lifeValue, the destruction mana
 * (killReward, by default floor(summonCost / 2), then killRewardCondition)
 * goes to refundRecipient, card goes to the owner's grave. `killer` = the
 * player whose attack / reigu caused it, null if nobody. `source` = what
 * destroyed it (killRewardCondition only).
 */
export const destroyUnit = (
  ctx: Ctx,
  s: GameState,
  u: Unit,
  events: GameEvent[],
  killer: PlayerId | null,
  source?: KillSource,
): void => {
  const card = cardOf(ctx.pack, u.cardId);
  const owner = s.players[u.owner];
  const reward = rewardFor(ctx, s, card, killer, source);
  const manaTo = reward.denied ? null : refundRecipient(ctx, u, killer);
  const lifeLoss = ctx.cfg.lifeValueEnabled ? card.lifeValue : 0;
  owner.life -= lifeLoss;
  // the event reports what the mana cap let through, not the nominal reward
  const manaGain = manaTo === null ? 0 : gainMana(s.players[manaTo], reward.amount, ctx.cfg.manaCap);
  owner.grave.push(u.cardId);
  s.units = s.units.filter((x) => x.uid !== u.uid);
  events.push({
    t: "destroy",
    owner: u.owner,
    uid: u.uid,
    cardId: u.cardId,
    lifeLoss,
    manaGain,
    killer,
    manaTo,
    killerRefund: ctx.cfg.refundMode === "killer_half" && manaTo !== null,
    ...(reward.denied ? { rewardDenied: true } : {}),
    ...(reward.upset > 0 ? { upsetBonus: reward.upset } : {}),
  });
  onUnitDestroyed(ctx, s, u, events);
};

/** Ends the game if a player's life reached 0. R8: simultaneous -> turn player. */
export const checkLifeLoss = (ctx: Ctx, s: GameState, events: GameEvent[]): void => {
  if (s.ended) return;
  if (!ctx.cfg.lifeValueEnabled) return; // EXP-0913: no life-based defeat
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

/** A control event with the threshold and hold mode in force when it happened (the log describes it with those later). */
export const controlEvent = (ctx: Ctx, player: PlayerId, change: "gain" | "lost" | "win"): GameEvent => ({
  t: "control",
  player,
  change,
  need: ctx.cfg.controlWin,
  hold: ctx.cfg.controlHold,
});

/**
 * R2 (controlHold "next_turn_start"): ends the game if the turn player
 * declared reach last turn and still holds the control-win threshold.
 * Under "next_turn_end" the win is checked at turn end instead (turn.ts).
 */
export const checkControlAtStart = (ctx: Ctx, s: GameState, events: GameEvent[]): boolean => {
  if (ctx.cfg.controlHold === "next_turn_end") return false;
  const p = s.turnPlayer;
  if (!s.players[p].reach) return false;
  if (controlCount(ctx, s, p) < ctx.cfg.controlWin) {
    // lost: the flag goes with it (the next turn end re-declares it)
    s.players[p].reach = false;
    events.push(controlEvent(ctx, p, "lost"));
    return false;
  }
  events.push(controlEvent(ctx, p, "win"));
  s.ended = true;
  s.winner = p;
  s.winType = "control";
  events.push({ t: "gameEnd", winner: p, winType: "control", round: s.round });
  return true;
};

/**
 * EXP-0913B controlHold "next_turn_end": the control state is lost the moment
 * its holder drops below controlWin - on either player's turn. Called after
 * every action. A no-op under the default mode. The count is controlCount, so
 * under controlCount "hp" damage that takes a unit below the threshold breaks
 * control without a kill.
 */
export const recheckControl = (ctx: Ctx, s: GameState, events: GameEvent[]): void => {
  if (ctx.cfg.controlHold !== "next_turn_end" || s.ended) return;
  for (const p of [0, 1] as PlayerId[]) {
    const ps = s.players[p];
    if (ps.reach && controlCount(ctx, s, p) < ctx.cfg.controlWin) {
      ps.reach = false;
      events.push(controlEvent(ctx, p, "lost"));
    }
  }
};

/**
 * EXP-0913B counterMode "gap": is `defender` standing on the attacker's gap?
 * Single-target: the whole range is gap. Area: only the card's gapCell, and an
 * area card without one never draws a counter. Computed from the attacker's
 * position and facing at the moment it attacked.
 */
const onGap = (
  ctx: Ctx,
  card: CardDef,
  aoe: boolean,
  from: Pos,
  facing: Unit["facing"],
  defender: Unit,
): boolean => {
  if (!aoe) return true;
  const g = card.gapCell ?? null;
  if (g === null) return false;
  const cell = toBoardCells([g], from, facing)[0];
  return cell !== undefined && posEq(cell, defender.pos);
};

export type AttackOptions = {
  /** counterResolve "chosen": the countering side's order (uids). Ignored unless it is exactly the counterers. */
  counterOrder?: readonly number[];
  /** Told the counterers (in engine order) once the hits have resolved; used by counterersOf. */
  onCounterers?: (uids: number[]) => void;
};

/** A permutation of `units` by uid, or the engine order when `order` is not exactly their uids. */
const orderedCounters = (units: Unit[], order: readonly number[] | undefined): Unit[] => {
  if (order === undefined || order.length !== units.length) return units;
  const out: Unit[] = [];
  for (const uid of order) {
    const u = units.find((x) => x.uid === uid);
    if (u === undefined || out.includes(u)) return units;
    out.push(u);
  }
  return out;
};

/**
 * ad13 僵尸公主 (adopted 9/22): its counter destroyed the attacker, so it steps
 * onto the attacker's cell with the same facing - the same HP check as the
 * attack-kill move (skipped when it would stand there at 0 HP or less).
 */
const counterKillMove = (ctx: Ctx, s: GameState, u: Unit, at: Pos, events: GameEvent[]): void => {
  if (!movesOnCounterKill(ctx, u) || !s.units.includes(u)) return;
  if (s.units.some((x) => posEq(x.pos, at))) return;
  const c = cardOfUnit(ctx, u);
  if (effMaxHp(c.hp, at, c.attribute, ctx.cfg.attrBonus, ctx.cfg.maxHp) - u.damage <= 0) return;
  const from = { x: u.pos.x, y: u.pos.y };
  u.pos = { x: at.x, y: at.y };
  events.push({ t: "move", player: u.owner, uid: u.uid, from, to: { x: at.x, y: at.y }, source: u.cardId });
  events.push({ t: "effect", player: u.owner, source: u.cardId, uid: u.uid, text: `${c.nameJa}: 反撃で撃破した位置へ移動` });
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
  opts: AttackOptions = {},
): void => {
  const attacker = unitByUid(s, attackerUid);
  if (attacker === undefined) throw new Error(`resolveAttack: no unit ${attackerUid}`);
  const card = cardOfUnit(ctx, attacker);
  const wasSummonAttack = attacker.summonedThisTurn;

  const attackCost = attackCostFor(ctx, attacker, variant);
  s.players[attacker.owner].mana -= attackCost;
  attacker.attackedThisTurn = true;

  // tm06 heal-attack: restores an ally instead of striking. No damage, no
  // destruction, no counter - so it short-circuits the whole exchange.
  if (variant === "heal") {
    if (targetUid === null) throw new Error("resolveAttack: heal needs a target");
    const ally = unitByUid(s, targetUid);
    if (ally === undefined) throw new Error(`resolveAttack: no target ${targetUid}`);
    const hpBefore = unitHp(ctx, ally);
    healUnit(ally, healAttackAmount(ctx, s, attacker));
    // what was really restored: the effective max (or an over-heal) can cut it
    const healed = unitHp(ctx, ally) - hpBefore;
    events.push({
      t: "attack",
      player: attacker.owner,
      uid: attacker.uid,
      cardId: attacker.cardId,
      aoe: false,
      cost: attackCost,
      hits: [
        {
          uid: ally.uid,
          cardId: ally.cardId,
          owner: ally.owner,
          blind: false,
          dmg: 0 - healed, // negative = HP restored (0 - x keeps a zero heal at +0)
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
  const attackFrom: Pos = { x: attacker.pos.x, y: attacker.pos.y };
  const attackFacing = attacker.facing;
  const aoeAttack = isAoeAttack(ctx, card);
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

  const targets: Unit[] = isAoeAttack(ctx, card)
    ? aoeSparesAllies(ctx, card)
      ? enemiesInRange(ctx, s, attacker)
      : unitsInRange(ctx, s, attacker)
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
  // EXP-0913B 1.1: the attacker's side is the killer, friendly fire included.
  // killRewardCondition "behind" is judged once, before any of them leaves the board.
  const killSource: KillSource = {
    cost: card.summonCost,
    ...(destroyed.length > 0 && ctx.cfg.killRewardCondition === "behind" ? { behind: killerBehind(ctx, s, attacker.owner) } : {}),
  };
  for (const h of destroyed) destroyUnit(ctx, s, h.unit, events, attacker.owner, killSource);

  // 3b. EXP-0913 moveOnKill: exactly one ENEMY died -> the attacker takes the
  //     cell. Facing is unchanged. Runs before counters, so the counter check
  //     uses the new square. Skipped when the move would leave the attacker at
  //     0 effective HP or less. sk13 Kyonshi-Kojo does the same as a card
  //     effect (EXP-0913B 2.3; it is single-target, so "exactly one" holds).
  const cardMove = movesOnKill(ctx, attacker);
  if ((ctx.cfg.moveOnKill || cardMove) && destroyed.length === 1) {
    const victim = destroyed[0].unit;
    if (victim.owner !== attacker.owner && s.units.every((u) => !posEq(u.pos, victim.pos))) {
      const ac = cardOfUnit(ctx, attacker);
      const newMax = effMaxHp(
        ac.hp,
        victim.pos,
        ac.attribute,
        ctx.cfg.attrBonus,
        ctx.cfg.maxHp,
      );
      if (newMax - attacker.damage > 0) {
        const from = { x: attacker.pos.x, y: attacker.pos.y };
        attacker.pos = { x: victim.pos.x, y: victim.pos.y };
        const source = ctx.cfg.moveOnKill ? "rule" : attacker.cardId;
        events.push({
          t: "move",
          player: attacker.owner,
          uid: attacker.uid,
          from,
          to: { x: attacker.pos.x, y: attacker.pos.y },
          source,
        });
        if (source !== "rule") {
          events.push({
            t: "effect",
            player: attacker.owner,
            source,
            uid: attacker.uid,
            text: `${ac.nameJa}: 撃破した位置へ移動`,
          });
        }
      }
    }
  }

  // 4. counter-attacks from surviving, non-blind-hit ENEMY targets only.
  //    jutsu attacks never draw a counter; a jutsu unit can still counter
  //    (except under counterMode "gap", EXP-0913B 1.3, and counterResolve
  //    "chosen", adopted 9/22: only a physical attacker type counters).
  let counterTotal = 0;
  let counterCount = 0;
  const counterUids: number[] = [];
  let attackerDestroyed = false;
  /** The counter that destroyed the attacker, and where: its on-kill move follows the attack event. */
  let counterKill: { unit: Unit; at: Pos } | null = null;
  if (card.attackType === "phys") {
    const gapMode = ctx.cfg.counterMode === "gap";
    const chosen = ctx.cfg.counterResolve === "chosen";
    const eligible: Unit[] = [];
    for (const h of plan) {
      if (destroyed.includes(h)) continue;
      if (h.unit.owner === attacker.owner) continue; // R6: allies never counter
      if (h.blind) continue; // blind shots take no counter
      const hc = cardOfUnit(ctx, h.unit);
      if (hc.atk <= 0 || hc.counterRange.length === 0) continue;
      if ((gapMode || chosen) && hc.attackType !== "phys") continue; // jutsu units never counter
      if (gapMode && !onGap(ctx, card, aoeAttack, attackFrom, attackFacing, h.unit)) continue;
      if (!inCounterRange(ctx, h.unit, attacker.pos)) continue;
      eligible.push(h.unit);
    }
    // EXP-0913 counterMode "single": only the healthiest defender answers.
    // Ties break on the lowest uid so the result stays deterministic.
    const answering =
      ctx.cfg.counterMode === "single" && eligible.length > 1
        ? [
            eligible.reduce((best, u) => {
              const bh = unitHp(ctx, best);
              const uh = unitHp(ctx, u);
              if (uh > bh) return u;
              if (uh === bh && u.uid < best.uid) return u;
              return best;
            }),
          ]
        : eligible;
    opts.onCounterers?.(answering.map((u) => u.uid));
    const order = orderedCounters(answering, opts.counterOrder);
    // the counter-attacking side destroys it
    const defender: PlayerId = attacker.owner === 0 ? 1 : 0;
    if (chosen) {
      // 案A: one at a time in the countering side's order; the rest are
      // skipped once the attacker is gone
      for (const u of order) {
        const dmg = cardOfUnit(ctx, u).atk;
        counterTotal += dmg;
        counterCount += 1;
        counterUids.push(u.uid);
        attacker.damage += dmg;
        if (unitHp(ctx, attacker) <= 0) {
          attackerDestroyed = true;
          counterKill = { unit: u, at: { x: attacker.pos.x, y: attacker.pos.y } };
          destroyUnit(ctx, s, attacker, events, defender, { cost: cardOfUnit(ctx, u).summonCost });
          break;
        }
      }
    } else {
      for (const u of order) {
        counterTotal += cardOfUnit(ctx, u).atk;
        counterCount += 1;
        counterUids.push(u.uid);
      }
      if (counterTotal > 0) {
        const hpBefore = unitHp(ctx, attacker);
        attacker.damage += counterTotal;
        if (unitHp(ctx, attacker) <= 0) {
          attackerDestroyed = true;
          // simultaneous: the counter that brought the running total to the attacker's HP counts as the kill
          let run = 0;
          const killer = order.find((u) => (run += cardOfUnit(ctx, u).atk) >= hpBefore);
          if (killer !== undefined) counterKill = { unit: killer, at: { x: attacker.pos.x, y: attacker.pos.y } };
          destroyUnit(ctx, s, attacker, events, defender, { cost: killer === undefined ? null : cardOfUnit(ctx, killer).summonCost });
        }
      }
    }
  }

  events.push({
    t: "attack",
    player: attacker.owner,
    uid: attacker.uid,
    cardId: attacker.cardId,
    aoe: isAoeAttack(ctx, card),
    cost: attackCost,
    hits,
    counterTotal,
    counterCount,
    counterUids,
    attackerDestroyed,
    variant,
  });

  // 4b. ad13 僵尸公主 steps onto the cell of the attacker its counter destroyed
  if (counterKill !== null) counterKillMove(ctx, s, counterKill.unit, counterKill.at, events);

  // 5. post-attack effects (konshin self-damage, Ibaraki regen)
  if (!attackerDestroyed) {
    // the only death in here is konshin self-damage: nobody is the killer
    onAfterAttack(ctx, s, attacker, wasSummonAttack, variant, events, (victim) =>
      destroyUnit(ctx, s, victim, events, null),
    );
  }

  checkLifeLoss(ctx, s, events);
};

/**
 * The units that will counter this attack, in engine order (the order a
 * counterOrder permutes), found by resolving it on a scratch copy. [] when
 * nobody counters. Call it for a legal attack only.
 */
export const counterersOf = (ctx: Ctx, s: GameState, a: { uid: number; targetUid: number | null; variant?: AttackVariant }): number[] => {
  let out: number[] = [];
  resolveAttack(ctx, cloneState(s), a.uid, a.targetUid, [], a.variant ?? "normal", {
    onCounterers: (uids) => {
      out = uids;
    },
  });
  return out;
};
