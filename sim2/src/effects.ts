// Card effects for pack-tsukumo-miyako. Spec: sim2/EFFECTS-SPEC.md (the
// authority - if this file disagrees with it, this file is wrong).
//
// cardId-keyed hooks, no DSL. Every entry point is a no-op when
// ctx.cfg.effects is false, so `--effects off` reproduces the rules-only
// baseline exactly.
//
// Deliberately NOT implemented:
//   tm04 Ko-Oni "rotate costs 0" - dead letter. The 2026-08-28 revision (11)
//   fixed rotation at 1 for every card, so the card text no longer has a
//   referent. Noted in RESULTS-EFFECTS.md.
//
// This module must not import combat.ts (combat.ts imports it). Range
// geometry that effects need is limited to the front cell, computed here.
import { toBoardCells } from "./board.ts";
import { cardOf } from "./cards.ts";
import { healUnit, isHidden, unitAt, unitHp, unitMaxHp, visibleUnitAt } from "./state.ts";
import type { Ctx } from "./state.ts";
import type { AttackVariant, GameEvent, GameState, PlayerId, Pos, Unit } from "./types.ts";

export const effectsOn = (ctx: Ctx): boolean => ctx.cfg.effects;

/**
 * Player-facing effect text, keyed by cardId. Cards absent from this map have
 * no effect. Summarised from EFFECTS-SPEC.md section 1 and 2.
 */
export const EFFECT_TEXT: Record<string, string> = {
  tm01: "ダメージを与えられない。撃破された時、味方1体(召喚コスト最大)のHP+1",
  tm02: "陰属性の相手を対象とする場合、ATK+1",
  tm03: "【影討ち】死角からの攻撃時、ATK+1(死角+2と累積)",
  tm04: "回転コストの軽減 ─ 本ルールでは効果なし(全カード一律1のため死文)",
  tm06: "攻撃の代わりに、範囲内の味方1体のHPをATK分回復できる",
  tm07: "自分の手番開始時、HPを1減らして「霊力+1」か「1ドロー」を選べる",
  tm09: "【渾身】攻撃時にATK+1してよい。その場合、攻撃後に自身のHP-1",
  tm10: "【巨撃】自身のほうが現在HPが多い対象には、ダメージ+1",
  tm11: "召喚時、正面に式神がいた場合、そのHPと同じHPで召喚される",
  tm12: "正面マスの式神が物理攻撃なら、自身のATKはそのATKを使用する",
  tm15: "【再生】再攻撃(召喚攻撃を除く)のたびにHP+1",
  tm16: "自身に霊具が使用された際、そのターンATK+1(敵味方どちらの霊具でも)",
  tm17: "相手は回転命令を使えない(効果による回転は可)。自身の回転命令で、代わりに他の1体を90度回転できる",
  tm18: "【霊具】任意のユニット1体を90度回転",
  tm19: "【霊具】1体を隠す(使用者の次ターン開始まで対象外・占拠/リーチ/チップのカウント外)。味方+1HP / 敵-1HP",
  tm20: "【霊具】自軍盤上全体のHP+2",
  tm21: "【霊具】自分のユニット1体の現HPを7にする(実効最大を超えてよい)",
  tm22: "【霊具】自分のユニット1体を選び、その正面のユニットに4ダメージ(反撃・死角の対象外)",
};

export const effectTextOf = (cardId: string): string | null => EFFECT_TEXT[cardId] ?? null;

const FRONT: Pos[] = [{ x: 0, y: 1 }];

/** The single cell this unit faces, or undefined if it is off the board. */
export const frontCell = (u: Unit): Pos | undefined => toBoardCells(FRONT, u.pos, u.facing)[0];

const frontUnit = (s: GameState, u: Unit): Unit | undefined => {
  const c = frontCell(u);
  return c === undefined ? undefined : visibleUnitAt(s, c);
};

const log = (
  events: GameEvent[],
  player: PlayerId,
  source: string,
  uid: number | null,
  text: string,
): void => {
  events.push({ t: "effect", player, source, uid, text });
};

// ------------------------------------------------------------ ATK / damage

/**
 * tm12 Shomakyo: while something physical stands in front of it, it borrows
 * that unit's ATK (friend or foe, resolved live). Replacement happens before
 * any additive modifier (spec 3).
 */
const baseAtkOf = (ctx: Ctx, s: GameState, u: Unit): number => {
  const card = cardOf(ctx.pack, u.cardId);
  if (!effectsOn(ctx)) return card.atk;
  if (u.cardId === "tm12") {
    const front = frontUnit(s, u);
    if (front !== undefined) {
      const fc = cardOf(ctx.pack, front.cardId);
      if (fc.attackType === "phys") return fc.atk;
    }
  }
  return card.atk;
};

/** Log line when tm12 borrows an ATK, so the swap is countable. null if not. */
export const atkReplacementNote = (ctx: Ctx, s: GameState, u: Unit): string | null => {
  if (!effectsOn(ctx) || u.cardId !== "tm12") return null;
  const front = frontUnit(s, u);
  if (front === undefined) return null;
  const fc = cardOf(ctx.pack, front.cardId);
  if (fc.attackType !== "phys") return null;
  const own = cardOf(ctx.pack, u.cardId).atk;
  return `照魔鏡: 正面の${fc.nameJa}のATK${fc.atk}を参照 (自身は${own})`;
};

/** Attacker-side ATK after replacement and attacker-level additions. */
export const effectiveAtk = (
  ctx: Ctx,
  s: GameState,
  u: Unit,
  variant: AttackVariant = "normal",
): number => {
  let atk = baseAtkOf(ctx, s, u);
  if (effectsOn(ctx)) {
    atk += u.atkBuff; // tm16, set by a reigu this turn
    if (variant === "konshin") atk += 1; // tm09
  }
  return atk;
};

/** Per-target additive damage modifiers. All of them stack (spec 3). */
export const damageBonus = (
  ctx: Ctx,
  s: GameState,
  attacker: Unit,
  target: Unit,
  blind: boolean,
): number => {
  if (!effectsOn(ctx)) return 0;
  let bonus = 0;
  const tCard = cardOf(ctx.pack, target.cardId);
  if (attacker.cardId === "tm02" && tCard.attribute === "yin") bonus += 1;
  if (attacker.cardId === "tm03" && blind) bonus += 1;
  if (attacker.cardId === "tm10" && unitHp(ctx, attacker) > unitHp(ctx, target)) bonus += 1;
  return bonus;
};

/** Names the modifiers that fired, for the log. */
export const damageBonusReasons = (
  ctx: Ctx,
  s: GameState,
  attacker: Unit,
  target: Unit,
  blind: boolean,
): string[] => {
  if (!effectsOn(ctx)) return [];
  const out: string[] = [];
  const tCard = cardOf(ctx.pack, target.cardId);
  if (attacker.cardId === "tm02" && tCard.attribute === "yin") {
    out.push(`提灯お化け: 陰属性の${tCard.nameJa}へダメージ+1`);
  }
  if (attacker.cardId === "tm03" && blind) out.push("【影討ち】影鬼: 死角からの攻撃でダメージ+1");
  if (attacker.cardId === "tm10" && unitHp(ctx, attacker) > unitHp(ctx, target)) {
    out.push(
      `【巨撃】一目鬼: HP差(${unitHp(ctx, attacker)} > ${unitHp(ctx, target)})によりダメージ+1`,
    );
  }
  return out;
};

// ------------------------------------------------------------ attack hooks

export const canUseVariant = (
  ctx: Ctx,
  u: Unit,
  variant: AttackVariant,
): boolean => {
  if (variant === "normal") return true;
  if (!effectsOn(ctx)) return false;
  if (variant === "konshin") return u.cardId === "tm09";
  return u.cardId === "tm06"; // heal
};

/** tm06: the heal-attack restores ATK worth of HP to one ally in range. */
export const healAttackAmount = (ctx: Ctx, s: GameState, u: Unit): number =>
  effectiveAtk(ctx, s, u);

/**
 * Runs after an attack fully resolves (damage, destructions, counters).
 * Returns true when the attacker died to its own konshin cost.
 */
export const onAfterAttack = (
  ctx: Ctx,
  s: GameState,
  attacker: Unit,
  wasSummonAttack: boolean,
  variant: AttackVariant,
  events: GameEvent[],
  destroy: (u: Unit) => void,
): void => {
  if (!effectsOn(ctx)) return;
  const alive = (): boolean => s.units.some((x) => x.uid === attacker.uid);

  // tm09 Kubihiki: the +1 is paid for with 1 HP, after the attack.
  if (variant === "konshin" && alive()) {
    attacker.damage += 1;
    log(events, attacker.owner, "tm09", attacker.uid, "渾身: 自身に1ダメージ");
    if (unitHp(ctx, attacker) <= 0) {
      destroy(attacker);
      return;
    }
  }

  // tm15 Ibaraki-Doji: regenerates on a RE-attack only, never a summon-attack.
  if (attacker.cardId === "tm15" && !wasSummonAttack && variant !== "heal" && alive()) {
    if (unitHp(ctx, attacker) < unitMaxHp(ctx, attacker)) {
      healUnit(attacker, 1);
      log(events, attacker.owner, "tm15", attacker.uid, "再生: HP+1");
    }
  }
};

// ------------------------------------------------------------ other hooks

/** tm11 Ungaikyo: arrives with the current HP of whatever it faces. */
export const onSummon = (ctx: Ctx, s: GameState, u: Unit, events: GameEvent[]): void => {
  if (!effectsOn(ctx)) return;
  if (u.cardId !== "tm11") return;
  const front = frontUnit(s, u);
  if (front === undefined) return;
  const target = Math.max(1, Math.min(ctx.cfg.maxHp, unitHp(ctx, front)));
  u.damage = unitMaxHp(ctx, u) - target;
  log(events, u.owner, "tm11", u.uid, `雲外鏡: 正面のHPを写して HP${target} で召喚`);
};

/** tm01 Toro-no-Sei: on death, +1 HP to the owner's priciest survivor. */
export const onUnitDestroyed = (
  ctx: Ctx,
  s: GameState,
  u: Unit,
  events: GameEvent[],
): void => {
  if (!effectsOn(ctx)) return;
  if (u.cardId !== "tm01") return;
  const friends = s.units.filter(
    (x) => x.owner === u.owner && x.uid !== u.uid && !isHidden(x),
  );
  if (friends.length === 0) return;
  let best = friends[0];
  for (const f of friends) {
    const a = cardOf(ctx.pack, f.cardId).summonCost;
    const b = cardOf(ctx.pack, best.cardId).summonCost;
    if (a > b || (a === b && f.uid < best.uid)) best = f;
  }
  if (unitHp(ctx, best) >= unitMaxHp(ctx, best)) return;
  healUnit(best, 1);
  log(events, u.owner, "tm01", best.uid, `灯籠の精: ${cardOf(ctx.pack, best.cardId).nameJa} にHP+1`);
};

/**
 * tm07 Furu-Tansu: at its owner's turn start, pay 1 HP for 1 mana.
 * Fixed policy (spec 1): only while it has 2+ HP, and always take the mana -
 * drawing is near worthless under refill-to-5.
 */
export type TansuChoice = "mana" | "draw" | "skip";
export type TansuChooser = (ctx: Ctx, s: GameState, unit: Unit) => TansuChoice;

/** AI / headless default: always take the mana (spec 1). */
export const defaultTansuPolicy: TansuChooser = () => "mana";

/** Units that owe a tm07 decision this turn start. Empty when effects are off. */
export const tansuCandidates = (ctx: Ctx, s: GameState, p: PlayerId): number[] => {
  if (!effectsOn(ctx)) return [];
  return s.units
    .filter((u) => u.owner === p && u.cardId === "tm07" && !isHidden(u) && unitHp(ctx, u) >= 2)
    .map((u) => u.uid);
};

export const onTurnStart = (
  ctx: Ctx,
  s: GameState,
  p: PlayerId,
  events: GameEvent[],
  choose: TansuChooser = defaultTansuPolicy,
  drawOne?: (player: PlayerId) => boolean,
): void => {
  if (!effectsOn(ctx)) return;
  for (const uid of tansuCandidates(ctx, s, p)) {
    const u = s.units.find((x) => x.uid === uid);
    if (u === undefined) continue;
    const choice = choose(ctx, s, u);
    if (choice === "skip") continue;
    if (choice === "draw" && drawOne !== undefined) {
      u.damage += 1;
      const drew = drawOne(p);
      log(events, p, "tm07", u.uid, `古箪笥: HP-1 で${drew ? "1ドロー" : "ドロー(山札切れ)"}`);
      continue;
    }
    u.damage += 1;
    s.players[p].mana = Math.min(ctx.cfg.manaCap, s.players[p].mana + 1);
    log(events, p, "tm07", u.uid, "古箪笥: HP-1 で霊力+1");
  }
};

/**
 * tm17 Kuryugai: while an enemy Kuryugai is on the board, this player cannot
 * issue rotate COMMANDS. Rotations from effects and reigu still work.
 */
export const rotateCommandLocked = (ctx: Ctx, s: GameState, p: PlayerId): boolean => {
  if (!effectsOn(ctx)) return false;
  return s.units.some((u) => u.owner !== p && u.cardId === "tm17" && !isHidden(u));
};

export const isProxyRotator = (ctx: Ctx, u: Unit): boolean =>
  effectsOn(ctx) && u.cardId === "tm17";

// ------------------------------------------------------------------ reigu

export const REIGU_IDS = ["tm18", "tm19", "tm20", "tm21", "tm22"] as const;

export type ReiguTargeting = "unit-any" | "unit-any-facing" | "unit-own" | "none";

export const reiguTargeting = (cardId: string): ReiguTargeting => {
  switch (cardId) {
    case "tm18":
      return "unit-any-facing"; // rotate any unit, direction chosen
    case "tm19":
      return "unit-any";
    case "tm20":
      return "none";
    case "tm21":
    case "tm22":
      return "unit-own";
    default:
      return "none";
  }
};

/** Can this reigu legally be pointed at this unit right now? */
export const reiguTargetOk = (ctx: Ctx, s: GameState, cardId: string, target: Unit): boolean => {
  if (isHidden(target)) return false; // hidden units cannot be chosen
  const p = s.turnPlayer;
  switch (cardId) {
    case "tm18":
    case "tm19":
      return true;
    case "tm21":
      return target.owner === p && unitHp(ctx, target) < 7;
    case "tm22": {
      if (target.owner !== p) return false;
      const c = frontCell(target);
      if (c === undefined) return false;
      return visibleUnitAt(s, c) !== undefined;
    }
    default:
      return false;
  }
};

/** tm20 needs at least one of the player's own units on the board. */
export const reiguUsable = (ctx: Ctx, s: GameState, cardId: string): boolean => {
  if (cardId !== "tm20") return true;
  return s.units.some((u) => u.owner === s.turnPlayer && !isHidden(u));
};

/**
 * Resolves a reigu. `destroy` is passed in so the standard destruction path
 * (life value, refund, grave) stays in combat.ts.
 */
export const applyReigu = (
  ctx: Ctx,
  s: GameState,
  cardId: string,
  target: Unit | null,
  facing: number | null,
  events: GameEvent[],
  destroy: (u: Unit) => void,
): void => {
  const p = s.turnPlayer;
  const nameOf = (u: Unit): string => cardOf(ctx.pack, u.cardId).nameJa;

  // tm16 Shuten-Doji: ATK+1 this turn whenever a reigu is aimed at it,
  // from either side.
  if (target !== null && target.cardId === "tm16") {
    target.atkBuff += 1;
    log(events, target.owner, "tm16", target.uid, "酒呑童子: 霊具を受けて このターンATK+1");
  }

  switch (cardId) {
    case "tm18": {
      if (target === null || facing === null) return;
      target.facing = facing as Unit["facing"];
      log(events, p, "tm18", target.uid, `家鳴り: ${nameOf(target)} を回転`);
      return;
    }
    case "tm19": {
      if (target === null) return;
      target.hiddenBy = p;
      const friendly = target.owner === p;
      if (friendly) {
        healUnit(target, 1);
        log(events, p, "tm19", target.uid, `マヨヒガ: 味方 ${nameOf(target)} を隠す (HP+1)`);
      } else {
        target.damage += 1;
        log(events, p, "tm19", target.uid, `マヨヒガ: 敵 ${nameOf(target)} を隠す (HP-1)`);
        if (unitHp(ctx, target) <= 0) destroy(target);
      }
      return;
    }
    case "tm20": {
      for (const u of s.units) {
        if (u.owner !== p || isHidden(u)) continue;
        healUnit(u, 2);
      }
      log(events, p, "tm20", null, "琵琶牧々: 自軍全体にHP+2");
      return;
    }
    case "tm21": {
      if (target === null) return;
      // set current HP to exactly 7, allowed to exceed the effective max
      target.damage = unitMaxHp(ctx, target) - 7;
      log(events, p, "tm21", target.uid, `鬼の酒: ${nameOf(target)} のHPを7に`);
      return;
    }
    case "tm22": {
      if (target === null) return;
      const c = frontCell(target);
      if (c === undefined) return;
      const victim = visibleUnitAt(s, c);
      if (victim === undefined) return;
      victim.damage += 4;
      log(
        events,
        p,
        "tm22",
        victim.uid,
        `閻魔獄卒棒: ${nameOf(victim)} に4ダメージ (反撃なし)`,
      );
      if (unitHp(ctx, victim) <= 0) destroy(victim);
      return;
    }
    default:
      return;
  }
};

/** Mayohiga expires at the start of the turn of whoever cast it. */
export const clearExpiredHidden = (s: GameState, p: PlayerId, events: GameEvent[]): void => {
  for (const u of s.units) {
    if (u.hiddenBy === p) {
      u.hiddenBy = null;
      events.push({ t: "effect", player: p, source: "tm19", uid: u.uid, text: "マヨヒガ: 効果終了" });
    }
  }
};

export const clearTurnBuffs = (s: GameState): void => {
  for (const u of s.units) u.atkBuff = 0;
};

/** Kept for callers that only have a position. */
export const occupantOf = unitAt;
