// Action previews for the UIs: "what happens if I confirm this?". Computed by
// running the real engine on a clone, so there is no second copy of the
// damage / counter / inherit maths. Attacks and inherits never touch the
// deck or the rng, so a preview reveals nothing that is not already public.
// Pure: no node builtins, importable from the browser.
import { cardOf } from "./cards.ts";
import { counterOrderChoice } from "./counter-order.ts";
import { armDamage, clubDamage, forwardEnemy, fxOf, reiguTargeting, summonHpOverwrite } from "./effects.ts";
import { applyAction, legalActions } from "./rules.ts";
import { inheritRefund, summonCostAt } from "./rules.ts";
import { unitByUid, unitHp, unitMaxHp } from "./state.ts";
import type { Ctx } from "./state.ts";
import type { Action, AttackVariant, GameEvent, GameState, PlayerId, Pos } from "./types.ts";

export type HitPreview = {
  uid: number;
  cardId: string;
  owner: PlayerId;
  /** Damage dealt; for a heal-attack minus the HP really restored (hpAfter - HP before). */
  dmg: number;
  blind: boolean;
  ally: boolean;
  destroyed: boolean;
  /** Remaining HP after the exchange (0 when destroyed). */
  hpAfter: number;
};

export type AttackPreview = {
  kind: "attack";
  cost: number;
  heal: boolean;
  /** The attack variant previewed (normal / konshin / heal / regen / drink). */
  variant?: AttackVariant;
  hits: HitPreview[];
  counterTotal: number;
  counterCount: number;
  attackerDestroyed: boolean;
  attackerHpBefore: number;
  /** Attacker HP after counters and self-damage (0 when destroyed). */
  attackerHpAfter: number;
  /** Life lost per player by destructions in this exchange. */
  lifeLoss: [number, number];
  /** Mana gained per player from destructions (refund / killer_half). */
  manaGain: [number, number];
  movedTo: Pos | null;
  /** Game-ending result of the exchange, if any. */
  ends: { winner: PlayerId | null } | null;
  /**
   * 案A: several counters whose order changes the result; the countering side
   * chooses it, and this preview shows the engine order. Absent = no choice.
   */
  counterOrderOpen?: boolean;
  /** Units moved by effects in the exchange (僵尸公主 after a kill or a counter kill). */
  moves?: MovePreview[];
};

export type MovePreview = { uid: number; cardId: string; from: Pos; to: Pos };

/**
 * A damaging reigu of the adopted set (茨木の左腕 / 閻魔獄卒棒), run on a copy:
 * every unit whose HP changed (damage, or the attribute of the cell it was
 * moved to), the moves, and what the destructions paid.
 */
export type ReiguPreview = {
  kind: "reigu";
  cost: number;
  /**
   * dmg: the reigu's damage for the unit it strikes (the HP change can differ
   * when the unit is then moved onto another attribute), else the HP change.
   */
  hits: (HitPreview & { hpBefore: number })[];
  moves: MovePreview[];
  lifeLoss: [number, number];
  manaGain: [number, number];
  ends: { winner: PlayerId | null } | null;
};

export type InheritPreview = {
  kind: "inherit";
  fromCardId: string;
  toCardId: string;
  cost: number;
  refund: number;
  manaBefore: number;
  manaAfter: number;
  /**
   * Damage the new unit really carries over: the old unit's damage after the
   * max-HP cap, and 0 when an on-summon HP overwrite (雲外鏡) replaces it.
   */
  carriedDamage: number;
  hpAfter: number;
  maxHpAfter: number;
};

export type ActionPreview = AttackPreview | InheritPreview | ReiguPreview;

/** A legal action together with its preview (attacks and inherits only). */
export type LegalEntry = { action: Action; preview: ActionPreview | null };

const hpOrZero = (ctx: Ctx, s: GameState, uid: number): number => {
  const u = unitByUid(s, uid);
  return u === undefined ? 0 : Math.max(0, unitHp(ctx, u));
};

export const previewAttack = (ctx: Ctx, s: GameState, a: Action): AttackPreview | null => {
  if (a.kind !== "attack") return null;
  const attacker = unitByUid(s, a.uid);
  if (attacker === undefined) return null;
  const { state: next, events } = applyAction(ctx, s, a);
  const ev = events.find((e) => e.t === "attack");
  if (ev === undefined || ev.t !== "attack") return null;
  const lifeLoss: [number, number] = [0, 0];
  const manaGain: [number, number] = [0, 0];
  let movedTo: Pos | null = null;
  for (const e of events) {
    if (e.t === "destroy") {
      lifeLoss[e.owner] += e.lifeLoss;
      if (e.manaTo !== undefined && e.manaTo !== null) manaGain[e.manaTo] += e.manaGain;
    }
    if (e.t === "move" && e.uid === a.uid) movedTo = { x: e.to.x, y: e.to.y };
  }
  const moves = movesOf(events);
  const end = events.find((e) => e.t === "gameEnd");
  return {
    kind: "attack",
    cost: ev.cost,
    heal: ev.variant === "heal",
    variant: ev.variant,
    hits: ev.hits.map((h) => ({
      uid: h.uid,
      cardId: h.cardId,
      owner: h.owner,
      dmg: h.dmg,
      blind: h.blind,
      ally: h.ally,
      destroyed: h.destroyed,
      hpAfter: hpOrZero(ctx, next, h.uid),
    })),
    counterTotal: ev.counterTotal,
    counterCount: ev.counterCount,
    attackerDestroyed: unitByUid(next, a.uid) === undefined,
    attackerHpBefore: Math.max(0, unitHp(ctx, attacker)),
    attackerHpAfter: hpOrZero(ctx, next, a.uid),
    lifeLoss,
    manaGain,
    movedTo,
    ends: end !== undefined && end.t === "gameEnd" ? { winner: end.winner } : null,
    ...(moves.length > 0 ? { moves } : {}),
    ...(counterOrderChoice(ctx, s, a) !== null ? { counterOrderOpen: true } : {}),
  };
};

/** Effect moves in an attack's events (a card effect moves its own unit: the source is that unit's card). */
const movesOf = (events: GameEvent[]): MovePreview[] => {
  const out: MovePreview[] = [];
  for (const e of events) {
    if (e.t !== "move" || e.source === undefined || e.source === "rule") continue;
    out.push({ uid: e.uid, cardId: e.source, from: { x: e.from.x, y: e.from.y }, to: { x: e.to.x, y: e.to.y } });
  }
  return out;
};

/** Effect keys whose reigu get a ReiguPreview in the legal list. */
const PREVIEWED_REIGU = new Set(["unit-own-mode", "unit-own-victim"]);

export const previewReigu = (ctx: Ctx, s: GameState, a: Action): ReiguPreview | null => {
  if (a.kind !== "reigu") return null;
  const cardId = s.players[s.turnPlayer].hand[a.handIndex];
  if (cardId === undefined || !PREVIEWED_REIGU.has(reiguTargeting(fxOf(ctx, cardId)))) return null;
  const { state: next, events } = applyAction(ctx, s, a);
  // the unit the reigu strikes, and for how much
  const user = a.targetUid === null ? undefined : unitByUid(s, a.targetUid);
  const struck = a.victimUid ?? (user === undefined ? undefined : forwardEnemy(s, user)?.victim.uid);
  const printed = armDamage(ctx, cardId) + clubDamage(ctx, cardId);
  const hits: (HitPreview & { hpBefore: number })[] = [];
  for (const u of s.units) {
    const after = unitByUid(next, u.uid);
    const hpBefore = Math.max(0, unitHp(ctx, u));
    const hpAfter = after === undefined ? 0 : Math.max(0, unitHp(ctx, after));
    if (after !== undefined && hpAfter === hpBefore) continue;
    const dmg = u.uid === struck && printed > 0 ? printed : hpBefore - hpAfter;
    hits.push({ uid: u.uid, cardId: u.cardId, owner: u.owner, dmg, blind: false, ally: u.owner === s.turnPlayer, destroyed: after === undefined, hpAfter, hpBefore });
  }
  const lifeLoss: [number, number] = [0, 0];
  const manaGain: [number, number] = [0, 0];
  for (const e of events) {
    if (e.t !== "destroy") continue;
    lifeLoss[e.owner] += e.lifeLoss;
    if (e.manaTo !== undefined && e.manaTo !== null) manaGain[e.manaTo] += e.manaGain;
  }
  const moves: MovePreview[] = events.flatMap((e) =>
    e.t === "move" ? [{ uid: e.uid, cardId: unitByUid(s, e.uid)?.cardId ?? "", from: { x: e.from.x, y: e.from.y }, to: { x: e.to.x, y: e.to.y } }] : [],
  );
  const end = events.find((e) => e.t === "gameEnd");
  return {
    kind: "reigu",
    cost: cardOf(ctx.pack, cardId).summonCost,
    hits,
    moves,
    lifeLoss,
    manaGain,
    ends: end !== undefined && end.t === "gameEnd" ? { winner: end.winner } : null,
  };
};

export const previewInherit = (ctx: Ctx, s: GameState, a: Action): InheritPreview | null => {
  if (a.kind !== "inherit") return null;
  const ps = s.players[s.turnPlayer];
  const cardId = ps.hand[a.handIndex];
  const old = unitByUid(s, a.targetUid);
  if (cardId === undefined || old === undefined) return null;
  const card = cardOf(ctx.pack, cardId);
  const { state: next, events } = applyAction(ctx, s, a);
  const ev = events.find((e) => e.t === "summon");
  if (ev === undefined || ev.t !== "summon") return null;
  const fresh = unitByUid(next, ev.uid);
  return {
    kind: "inherit",
    fromCardId: old.cardId,
    toCardId: cardId,
    cost: summonCostAt(ctx, card, old.pos),
    // after the mana cap, as the event reports it
    refund: ev.inheritedFrom?.refund ?? inheritRefund(cardOf(ctx.pack, old.cardId)),
    manaBefore: ps.mana,
    manaAfter: next.players[s.turnPlayer].mana,
    carriedDamage: fresh === undefined || summonHpOverwrite(ctx, next, fresh) !== null ? 0 : fresh.damage,
    hpAfter: fresh === undefined ? 0 : unitHp(ctx, fresh),
    maxHpAfter: fresh === undefined ? 0 : unitMaxHp(ctx, fresh),
  };
};

export const previewAction = (ctx: Ctx, s: GameState, a: Action): ActionPreview | null => {
  if (a.kind === "attack") return previewAttack(ctx, s, a);
  if (a.kind === "inherit") return previewInherit(ctx, s, a);
  if (a.kind === "reigu") return previewReigu(ctx, s, a);
  return null;
};

/** legalActions for the turn player, each with its preview. */
export const legalEntries = (ctx: Ctx, s: GameState): LegalEntry[] =>
  legalActions(ctx, s).map((action) => ({ action, preview: previewAction(ctx, s, action) }));
