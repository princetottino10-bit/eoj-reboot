import { allCells, effMaxHp, isTaiji, posEq, turnFacing } from "./board.ts";
import { canAttack, cardOf } from "./cards.ts";
import {
  alliesInRange,
  checkLifeLoss,
  destroyUnit,
  enemiesInRange,
  resolveAttack,
} from "./combat.ts";
import { cloneState, isHidden, occupied, unitAt, unitByUid } from "./state.ts";
import type { Ctx } from "./state.ts";
import {
  applyReigu,
  canUseVariant,
  effectsOn,
  isProxyRotator,
  reiguTargetOk,
  reiguTargeting,
  reiguUsable,
  onSummon,
  rotateCommandLocked,
} from "./effects.ts";
import type {
  Action,
  ApplyResult,
  CardDef,
  Facing,
  GameEvent,
  GameState,
  Pos,
  Unit,
} from "./types.ts";

// ---------------------------------------------------------------- costs

/** DESIGN 3.1: taiji subtracts taijiDiscount with a floor of taijiFloor. */
export const summonCostAt = (ctx: Ctx, card: CardDef, pos: Pos): number =>
  isTaiji(pos)
    ? Math.max(ctx.cfg.taijiFloor, card.summonCost - ctx.cfg.taijiDiscount)
    : card.summonCost;

export const attackCostOf = (card: CardDef): number => card.attackCost;
export const rotateCostOf = (ctx: Ctx): number => ctx.cfg.rotateCost;

/** chipBonus = number of chipIncomeSteps thresholds reached. */
export const chipBonus = (ctx: Ctx, chips: number): number =>
  ctx.cfg.chipIncomeSteps.reduce((n, step) => (chips >= step ? n + 1 : n), 0);

export const incomeFor = (ctx: Ctx, chips: number): number =>
  ctx.cfg.baseIncome + chipBonus(ctx, chips);

// ---------------------------------------------------------- legality

export const canSummonAt = (ctx: Ctx, s: GameState, card: CardDef, pos: Pos): boolean => {
  if (card.kind !== "shikigami") return false; // reigu are unplayable in v1
  if (s.units.length >= ctx.cfg.boardCells) return false;
  if (unitAt(s, pos) !== undefined) return false;
  const maxHp = effMaxHp(card.hp, pos, card.attribute, ctx.cfg.attrBonus, ctx.cfg.maxHp);
  if (maxHp <= 0) return false;
  return true;
};

export const isLegal = (ctx: Ctx, s: GameState, a: Action): boolean => {
  if (s.ended) return false;
  const p = s.turnPlayer;
  const ps = s.players[p];
  if (a.kind === "pass") return true;
  if (a.kind === "summon") {
    const cardId = ps.hand[a.handIndex];
    if (cardId === undefined) return false;
    const card = cardOf(ctx.pack, cardId);
    if (!canSummonAt(ctx, s, card, a.pos)) return false;
    return ps.mana >= summonCostAt(ctx, card, a.pos);
  }
  if (a.kind === "reigu") {
    if (!effectsOn(ctx)) return false;
    const cardId = ps.hand[a.handIndex];
    if (cardId === undefined) return false;
    const card = cardOf(ctx.pack, cardId);
    if (card.kind !== "reigu") return false;
    if (ps.mana < card.summonCost) return false;
    if (!reiguUsable(ctx, s, cardId)) return false;
    const targeting = reiguTargeting(cardId);
    if (targeting === "none") return a.targetUid === null;
    if (a.targetUid === null) return false;
    const t = unitByUid(s, a.targetUid);
    if (t === undefined) return false;
    if (targeting === "unit-any-facing" && a.facing === null) return false;
    return reiguTargetOk(ctx, s, cardId, t);
  }
  const u = unitByUid(s, a.uid);
  if (u === undefined || u.owner !== p || isHidden(u)) return false;
  const card = cardOf(ctx.pack, u.cardId);
  if (a.kind === "rotate") {
    if (u.attackedThisTurn) return false; // 3.3: attacking ends the unit's turn
    if (u.rotatedThisTurn) return false;
    if (rotateCommandLocked(ctx, s, p)) return false; // tm17
    if (ps.mana < rotateCostOf(ctx)) return false;
    return a.facing === turnFacing(u.facing, 1) || a.facing === turnFacing(u.facing, -1);
  }
  if (a.kind === "proxyRotate") {
    // tm17 spends its own rotate to turn someone else. Not a rotate COMMAND
    // on the victim, so it bypasses its own lock.
    if (!isProxyRotator(ctx, u)) return false;
    if (u.attackedThisTurn || u.rotatedThisTurn) return false;
    if (ps.mana < rotateCostOf(ctx)) return false;
    const t = unitByUid(s, a.targetUid);
    if (t === undefined || t.uid === u.uid || isHidden(t)) return false;
    return a.facing === turnFacing(t.facing, 1) || a.facing === turnFacing(t.facing, -1);
  }
  // attack
  const variant = a.variant ?? "normal";
  if (u.attackedThisTurn) return false;
  if (!canAttack(card)) return false;
  if (!canUseVariant(ctx, u, variant)) return false;
  if (ps.mana < card.attackCost) return false;
  if (variant === "heal") {
    if (a.targetUid === null) return false;
    return alliesInRange(ctx, s, u).some((f) => f.uid === a.targetUid);
  }
  const foes = enemiesInRange(ctx, s, u);
  if (foes.length === 0) return false;
  if (card.aoe) return a.targetUid === null;
  if (a.targetUid === null) return false;
  return foes.some((f) => f.uid === a.targetUid);
};

// ------------------------------------------------------- enumeration

/** All legal atomic actions for the turn player. `pass` is always last. */
export const legalActions = (ctx: Ctx, s: GameState): Action[] => {
  const out: Action[] = [];
  if (s.ended) return [{ kind: "pass" }];
  const p = s.turnPlayer;
  const ps = s.players[p];

  // summons: dedupe identical cards in hand to one representative index
  if (s.units.length < ctx.cfg.boardCells) {
    const seen = new Set<string>();
    const empties = allCells().filter((c) => unitAt(s, c) === undefined);
    for (let i = 0; i < ps.hand.length; i++) {
      const cardId = ps.hand[i];
      if (seen.has(cardId)) continue;
      seen.add(cardId);
      const card = cardOf(ctx.pack, cardId);
      for (const pos of empties) {
        if (!canSummonAt(ctx, s, card, pos)) continue;
        if (ps.mana < summonCostAt(ctx, card, pos)) continue;
        for (const facing of [0, 1, 2, 3] as Facing[]) {
          out.push({ kind: "summon", handIndex: i, pos, facing });
        }
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
      const targeting = reiguTargeting(cardId);
      if (targeting === "none") {
        out.push({ kind: "reigu", handIndex: i, targetUid: null, facing: null });
        continue;
      }
      for (const t of s.units) {
        if (!reiguTargetOk(ctx, s, cardId, t)) continue;
        if (targeting === "unit-any-facing") {
          out.push({ kind: "reigu", handIndex: i, targetUid: t.uid, facing: turnFacing(t.facing, 1) });
          out.push({ kind: "reigu", handIndex: i, targetUid: t.uid, facing: turnFacing(t.facing, -1) });
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
      if (canAttack(card) && ps.mana >= card.attackCost) {
        const foes = enemiesInRange(ctx, s, u);
        if (foes.length > 0) {
          if (card.aoe) {
            out.push({ kind: "attack", uid: u.uid, targetUid: null });
            if (canUseVariant(ctx, u, "konshin")) {
              out.push({ kind: "attack", uid: u.uid, targetUid: null, variant: "konshin" });
            }
          } else {
            for (const f of foes) {
              out.push({ kind: "attack", uid: u.uid, targetUid: f.uid });
              if (canUseVariant(ctx, u, "konshin")) {
                out.push({ kind: "attack", uid: u.uid, targetUid: f.uid, variant: "konshin" });
              }
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
      if (!u.rotatedThisTurn && ps.mana >= rotateCostOf(ctx)) {
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

/** Mutates `s`. Assumes `isLegal` already held. */
export const applyActionInPlace = (
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
  if (a.kind === "summon") {
    const cardId = ps.hand[a.handIndex];
    const card = cardOf(ctx.pack, cardId);
    const cost = summonCostAt(ctx, card, a.pos);
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
    events.push({
      t: "summon",
      player: p,
      uid: unit.uid,
      cardId,
      pos: unit.pos,
      facing: unit.facing,
      cost,
      taiji: isTaiji(a.pos),
    });
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
    applyReigu(ctx, s, cardId, target, a.facing, events, (victim) =>
      destroyUnit(ctx, s, victim, events),
    );
    checkLifeLoss(ctx, s, events);
    return;
  }
  if (a.kind === "rotate") {
    const u = unitByUid(s, a.uid);
    if (u === undefined) throw new Error(`rotate: no unit ${a.uid}`);
    ps.mana -= rotateCostOf(ctx);
    u.facing = a.facing;
    u.rotatedThisTurn = true;
    events.push({ t: "rotate", player: p, uid: u.uid, cost: rotateCostOf(ctx) });
    return;
  }
  if (a.kind === "proxyRotate") {
    const u = unitByUid(s, a.uid);
    const t = unitByUid(s, a.targetUid);
    if (u === undefined || t === undefined) throw new Error("proxyRotate: missing unit");
    ps.mana -= rotateCostOf(ctx);
    u.rotatedThisTurn = true;
    t.facing = a.facing;
    events.push({ t: "rotate", player: p, uid: u.uid, cost: rotateCostOf(ctx) });
    events.push({
      t: "effect",
      player: p,
      source: "tm17",
      uid: t.uid,
      text: `玖龍街: ${cardOf(ctx.pack, t.cardId).nameJa} を代理で回転`,
    });
    return;
  }
  resolveAttack(ctx, s, a.uid, a.targetUid, events, a.variant ?? "normal");
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
