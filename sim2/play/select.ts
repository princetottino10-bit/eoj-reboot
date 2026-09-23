// Selection helpers for the table: filtering the legal-action list for what
// is selected, the board glow marks, the command-menu items and the attack
// prediction. Pure functions over the model; every "can I do this" answer
// comes from the legal list or the command menu, never from rules code here.
import { attackCells, blindCells, counterCells, isAoeAttack } from "../src/combat.ts";
import { frontCell, frontStrikeDamage, fxOf, reiguTargeting } from "../src/effects.ts";
import { cardOfUnit, isHidden, unitHp, unitMaxHp } from "../src/state.ts";
import type { CommandInfo, UnitCommands } from "../src/commands.ts";
import type { AttackPreview, LegalEntry, ReiguPreview } from "../src/preview.ts";
import type { Action, AttackVariant, Facing, PlayerId, Pos, ReiguMode, Unit } from "../src/types.ts";
import type { Ctx } from "../src/state.ts";
import type { BoardView } from "../online/protocol.ts";
import { posKey } from "./board-view.ts";
import type { CellMark, Prediction, RadialItem } from "./board-view.ts";
import { counterCellsOf } from "./cards-view.ts";
import { gapCells, unitById } from "./render.ts";

export type Sel =
  | { kind: "none" }
  /** A hand shikigami: pick a cell (or an own unit to inherit onto). */
  | { kind: "hand"; handIndex: number }
  /** A cell was picked: pick the facing. */
  | { kind: "place"; handIndex: number; pos: Pos }
  | { kind: "inherit"; handIndex: number; targetUid: number }
  /** A unit is selected: own units in the main phase open the command menu. */
  | { kind: "unit"; uid: number; summonAttack: boolean }
  /** An attack variant is armed: pick a target, then confirm. */
  | { kind: "aim"; uid: number; mode: AttackVariant; targetUid: number | null; area: boolean; summonAttack: boolean }
  | { kind: "proxy"; uid: number; targetUid: number | null }
  /**
   * A reigu from the hand: pick its target, then (adopted 9/22) 茨木の左腕's
   * 【拳】/【握】 (`mode`) or 閻魔獄卒棒's enemy (`victimUid`), then confirm.
   */
  | { kind: "reigu"; handIndex: number; targetUid: number | null; mode?: ReiguMode | null; victimUid?: number | null };

export const NONE: Sel = { kind: "none" };

/** Identical cards in hand share one representative index in legalActions. */
export const repIndex = (hand: string[], i: number): number => hand.indexOf(hand[i]);

const withHand = (a: Action, i: number): Action =>
  a.kind === "summon" || a.kind === "inherit" || a.kind === "reigu" ? { ...a, handIndex: i } : a;

export const handEntries = (legal: LegalEntry[], hand: string[], i: number, kind: "summon" | "inherit" | "reigu"): LegalEntry[] => {
  const rep = repIndex(hand, i);
  return legal
    .filter((e) => e.action.kind === kind && "handIndex" in e.action && e.action.handIndex === rep)
    .map((e) => ({ action: withHand(e.action, i), preview: e.preview }));
};

export const unitEntries = (legal: LegalEntry[], uid: number, kind: Action["kind"]): LegalEntry[] =>
  legal.filter((e) => e.action.kind === kind && "uid" in e.action && e.action.uid === uid);

export const attackEntries = (legal: LegalEntry[], uid: number, mode: AttackVariant): LegalEntry[] =>
  unitEntries(legal, uid, "attack").filter((e) => e.action.kind === "attack" && (e.action.variant ?? "normal") === mode);

export const handPlayable = (legal: LegalEntry[], hand: string[], i: number, isReigu: boolean): boolean =>
  isReigu
    ? handEntries(legal, hand, i, "reigu").length > 0
    : handEntries(legal, hand, i, "summon").length + handEntries(legal, hand, i, "inherit").length > 0;

const targetMark = (board: BoardView, uid: number | null, out: Map<string, CellMark>, mark: CellMark): void => {
  if (uid === null) return;
  const t = unitById(board, uid);
  if (t !== undefined) out.set(posKey(t.pos), mark);
};

/** Glowing, clickable cells for the current selection. */
export const cellMarks = (board: BoardView, legal: LegalEntry[], hand: string[], sel: Sel): Map<string, CellMark> => {
  const out = new Map<string, CellMark>();
  if (sel.kind === "hand") {
    for (const e of handEntries(legal, hand, sel.handIndex, "summon")) if (e.action.kind === "summon") out.set(posKey(e.action.pos), "summon");
    for (const e of handEntries(legal, hand, sel.handIndex, "inherit")) {
      if (e.action.kind === "inherit") targetMark(board, e.action.targetUid, out, "inherit");
    }
  } else if (sel.kind === "aim" && !sel.area && sel.targetUid === null) {
    for (const e of attackEntries(legal, sel.uid, sel.mode)) {
      if (e.action.kind === "attack") targetMark(board, e.action.targetUid, out, sel.mode === "heal" ? "heal" : "target");
    }
  } else if (sel.kind === "proxy" && sel.targetUid === null) {
    for (const e of unitEntries(legal, sel.uid, "proxyRotate")) {
      if (e.action.kind === "proxyRotate") targetMark(board, e.action.targetUid, out, "proxy");
    }
  } else if (sel.kind === "reigu" && sel.targetUid === null) {
    for (const e of handEntries(legal, hand, sel.handIndex, "reigu")) {
      if (e.action.kind === "reigu") targetMark(board, e.action.targetUid, out, "target");
    }
  } else if (sel.kind === "reigu" && (sel.mode ?? null) !== null) {
    // 茨木の左腕: where the chosen 【拳】/【握】 puts the struck enemy
    const e = reiguEntry(legal, hand, sel);
    if (e?.preview?.kind === "reigu") for (const m of e.preview.moves) out.set(posKey(m.to), "move");
  } else if (sel.kind === "reigu" && (sel.victimUid ?? null) === null) {
    // 閻魔獄卒棒: the enemies next to the chosen unit
    for (const e of handEntries(legal, hand, sel.handIndex, "reigu")) {
      if (e.action.kind === "reigu" && e.action.targetUid === sel.targetUid && e.action.victimUid !== undefined) {
        targetMark(board, e.action.victimUid, out, "target");
      }
    }
  }
  return out;
};

/** How a reigu card targets (the prompt and the controller branch on it). */
export const reiguKind = (ctx: Ctx, cardId: string): ReturnType<typeof reiguTargeting> => reiguTargeting(fxOf(ctx, cardId));

/** The legal reigu entry the current selection points at (target, then the mode / enemy the card asks for). */
export const reiguEntry = (legal: LegalEntry[], hand: string[], sel: Sel): LegalEntry | undefined => {
  if (sel.kind !== "reigu") return undefined;
  return handEntries(legal, hand, sel.handIndex, "reigu").find(
    (e) =>
      e.action.kind === "reigu" &&
      e.action.targetUid === sel.targetUid &&
      e.action.facing === null &&
      (e.action.mode ?? null) === (sel.mode ?? null) &&
      (e.action.victimUid ?? null) === (sel.victimUid ?? null),
  );
};

/** The board badges for a reigu run on a copy (茨木の左腕 / 閻魔獄卒棒). */
export const reiguPreviewPrediction = (pv: ReiguPreview): Prediction => ({
  attackerUid: null,
  heal: false,
  hits: pv.hits.map((h) => ({ uid: h.uid, dmg: h.dmg, blind: false, destroyed: h.destroyed, ally: h.ally, heal: h.dmg < 0, hpAfter: h.hpAfter })),
  counterTotal: 0,
  counterCount: 0,
  attackerDestroyed: false,
  attackerHpAfter: 0,
});

/** The ranges of the unit being looked at, as board cells (the board draws them like the card's diagram). */
export type RangeSets = { attack: Set<string>; blind: Set<string>; gap: Set<string>; counter: Set<string>; aoe: boolean };

/** Attack range / counter range / blind spots / gap cells of the unit being looked at. */
export const rangeSets = (ctx: Ctx, u: Unit | undefined): RangeSets | null => {
  if (u === undefined) return null;
  const card = cardOfUnit(ctx, u);
  const counters = counterCellsOf(ctx.cfg, card).length > 0 ? counterCells(ctx, u) : [];
  return {
    attack: new Set(attackCells(ctx, u).map(posKey)),
    blind: new Set(blindCells(ctx, u).map(posKey)),
    gap: new Set(gapCells(ctx, u).map(posKey)),
    counter: new Set(counters.map(posKey)),
    aoe: isAoeAttack(ctx, card),
  };
};

const MODE_OF: Partial<Record<CommandInfo["id"], AttackVariant>> = { attack: "normal", konshin: "konshin", regen: "regen", drink: "drink", heal: "heal" };

export const commandMode = (id: CommandInfo["id"]): AttackVariant | null => MODE_OF[id] ?? null;

export const radialItems = (commands: UnitCommands, uid: number, mana: number, sel: Sel): RadialItem[] =>
  (commands[String(uid)] ?? []).map((c) => ({
    id: c.id,
    label: c.label,
    cost: c.cost,
    enabled: c.enabled,
    reason: c.reason,
    affordable: mana >= c.cost,
    active:
      (sel.kind === "aim" && commandMode(c.id) === sel.mode) || (sel.kind === "proxy" && c.id === "proxyRotate"),
  }));

/** The legal attack entry the current aim points at (target or area). */
export const aimedEntry = (legal: LegalEntry[], sel: Sel): LegalEntry | undefined => {
  if (sel.kind !== "aim" || (!sel.area && sel.targetUid === null)) return undefined;
  return attackEntries(legal, sel.uid, sel.mode).find((e) => e.action.kind === "attack" && e.action.targetUid === sel.targetUid);
};

// ------------------------------------------------------------------ reigu

/**
 * What a targeted reigu will do, for the confirm step. Legal entries carry no
 * preview for reigu, so this reads the board view with the engine's own
 * helpers (frontCell, unitHp); the amounts are the card's printed effect.
 */
export type ReiguForecast =
  | { kind: "strike"; target: Unit; victim: Unit | null; dmg: number; before: number; after: number; destroyed: boolean; ally: boolean; lifeLoss: number; buffed: boolean }
  | { kind: "setHp"; target: Unit; before: number; after: number; buffed: boolean }
  | { kind: "hide"; target: Unit; friendly: boolean; before: number; after: number; destroyed: boolean; buffed: boolean }
  | { kind: "other"; target: Unit; buffed: boolean };


export const reiguForecast = (ctx: Ctx, board: BoardView, cardId: string, targetUid: number, user: PlayerId | null): ReiguForecast | null => {
  const target = unitById(board, targetUid);
  if (target === undefined) return null;
  const fx = fxOf(ctx, cardId);
  const hp = (u: Unit): number => Math.max(0, unitHp(ctx, u));
  const buffed = ctx.cfg.effects && fxOf(ctx, target.cardId) === "tm16";
  if (fx === "tm22" || fx === "sk22") {
    const c = frontCell(target);
    const victim = c === undefined ? undefined : board.units.find((u) => u.pos.x === c.x && u.pos.y === c.y && !isHidden(u));
    const dmg = frontStrikeDamage(ctx, cardId);
    if (victim === undefined) return { kind: "strike", target, victim: null, dmg, before: 0, after: 0, destroyed: false, ally: false, lifeLoss: 0, buffed };
    const left = unitHp(ctx, victim) - dmg;
    const destroyed = left <= 0;
    const lifeLoss = destroyed && ctx.cfg.lifeValueEnabled ? cardOfUnit(ctx, victim).lifeValue : 0;
    return { kind: "strike", target, victim, dmg, before: hp(victim), after: Math.max(0, left), destroyed, ally: victim.owner === (user ?? target.owner), lifeLoss, buffed };
  }
  if (fx === "tm21") return { kind: "setHp", target, before: hp(target), after: 7, buffed };
  if (fx === "tm19") {
    const friendly = target.owner === user;
    const damage = friendly ? Math.max(Math.min(0, target.damage), target.damage - 1) : target.damage + 1;
    const left = unitMaxHp(ctx, target) - damage;
    return { kind: "hide", target, friendly, before: hp(target), after: Math.max(0, left), destroyed: left <= 0, buffed };
  }
  return { kind: "other", target, buffed };
};

/** The board badges for a reigu forecast (no attacker, so no counter badge). */
export const reiguPrediction = (f: ReiguForecast): Prediction | null => {
  const base = { attackerUid: null, counterTotal: 0, counterCount: 0, attackerDestroyed: false, attackerHpAfter: 0 };
  if (f.kind === "strike" && f.victim !== null) {
    return { ...base, heal: false, hits: [{ uid: f.victim.uid, dmg: f.dmg, blind: false, destroyed: f.destroyed, ally: f.ally, heal: false, hpAfter: f.after }] };
  }
  if (f.kind === "setHp" || (f.kind === "hide" && f.friendly)) {
    return { ...base, heal: true, hits: [{ uid: f.target.uid, dmg: f.before - f.after, blind: false, destroyed: false, ally: false, heal: true, hpAfter: f.after }] };
  }
  if (f.kind === "hide") {
    return { ...base, heal: false, hits: [{ uid: f.target.uid, dmg: f.before - f.after, blind: false, destroyed: f.destroyed, ally: false, heal: false, hpAfter: f.after }] };
  }
  return null;
};

export const predictionOf = (uid: number, pv: AttackPreview): Prediction => ({
  attackerUid: uid,
  heal: pv.heal,
  hits: pv.hits.map((h) => ({ uid: h.uid, dmg: h.dmg, blind: h.blind, destroyed: h.destroyed, ally: h.ally, heal: pv.heal, hpAfter: h.hpAfter })),
  counterTotal: pv.counterTotal,
  counterCount: pv.counterCount,
  attackerDestroyed: pv.attackerDestroyed,
  attackerHpAfter: pv.attackerHpAfter,
});

export const summonFacings = (legal: LegalEntry[], hand: string[], handIndex: number, pos: Pos): { facing: Facing; entry: LegalEntry | undefined }[] => {
  const entries = handEntries(legal, hand, handIndex, "summon").filter(
    (e) => e.action.kind === "summon" && e.action.pos.x === pos.x && e.action.pos.y === pos.y,
  );
  return ([0, 1, 2, 3] as Facing[]).map((f) => ({
    facing: f,
    entry: entries.find((e) => e.action.kind === "summon" && e.action.facing === f),
  }));
};

/** Is the selection still meaningful against a fresh legal list / board? */
export const selStillValid = (sel: Sel, board: BoardView, hand: string[] | null, legal: LegalEntry[]): boolean => {
  switch (sel.kind) {
    case "none":
      return true;
    case "unit":
      return unitById(board, sel.uid) !== undefined;
    case "aim":
      return attackEntries(legal, sel.uid, sel.mode).length > 0;
    case "proxy":
      return unitEntries(legal, sel.uid, "proxyRotate").length > 0;
    default:
      return hand !== null && sel.handIndex < hand.length;
  }
};
