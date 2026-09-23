// Card effects for pack-tsukumo-miyako. Spec: sim2/EFFECTS-SPEC.md (the
// authority - if this file disagrees with it, this file is wrong).
//
// cardId-keyed hooks, no DSL. Every entry point is a no-op when
// ctx.cfg.effects is false, so `--effects off` reproduces the rules-only
// baseline exactly.
//
// tm04 Ko-Oni "rotate costs 0" was a dead letter after the 2026-08-28
// revision (11) fixed rotation at 1; the team ruled on 2026-09-14 that the
// card's own rotate command does cost 0 (rotateIsFree). Runs before that
// (RESULTS-EFFECTS.md, EXP-0913/0913B) did not have it.
//
// This module must not import combat.ts (combat.ts imports it). Range
// geometry that effects need is limited to the front cell and the forward
// line / neighbours of a unit (the adopted 9/22 reigu), computed here.
//
// Adopted 9/22 set (pack-adopted-0922, effect keys ad*): new keys for every
// card whose effect changed, so no tm* / sk* behaviour moves under an older
// pack. ad01 灯籠 +2, ad07 変面 heal ceil(ATK/2), ad13 僵尸 also moves after a
// counter kill, ad15 茨木【再生】 / ad16 酒呑【飲酒】 paid attack variants,
// ad21 茨木の左腕 拳/握, ad22 閻魔獄卒棒 (酒呑一門, a neighbour outside its blind spots).
import { inBoard, posEq, rotateRel, toBoardCells } from "./board.ts";
import { cardOf, effectKeyOf } from "./cards.ts";
import { healUnit, isHidden, unitAt, unitHp, unitMaxHp, visibleUnitAt } from "./state.ts";
import type { Ctx } from "./state.ts";
import type { AttackVariant, GameEvent, GameState, PlayerId, Pos, ReiguMode, Unit } from "./types.ts";

/** Own-key lookup in a parameter table (never reaches Object.prototype). */
const param = <T>(table: Record<string, T>, key: string): T | undefined =>
  Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;

export const effectsOn = (ctx: Ctx): boolean => ctx.cfg.effects;

/**
 * Effect key of a card. Hooks below switch on this, never on the raw card id,
 * so a pack can map a new card onto an existing effect (shuten-kyuryu reuses
 * most tsukumo-miyako effects under sk ids). tsukumo-miyako: key === id.
 */
export const fxOf = (ctx: Ctx, cardId: string): string => effectKeyOf(ctx.pack, cardId);

/** tm04: this unit's own rotate command (and a proxy rotate it makes) costs no mana. */
export const rotateIsFree = (ctx: Ctx, u: Unit): boolean => effectsOn(ctx) && fxOf(ctx, u.cardId) === "tm04";

/**
 * Player-facing effect text, keyed by cardId. Cards absent from this map have
 * no effect. Summarised from EFFECTS-SPEC.md section 1 and 2.
 */
export const EFFECT_TEXT: Record<string, string> = {
  tm01: "ダメージを与えられない。撃破された時、味方1体(召喚コスト最大)のHP+1",
  tm02: "陰属性の相手を対象とする場合、ATK+1",
  tm03: "【影討ち】死角からの攻撃時、ATK+1(死角+2と累積)",
  tm04: "この式神の回転命令に必要な霊力は0",
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
  tm19: "【霊具】1体を隠す(使用者の次ターン開始まで対象外・継承召喚もできない・占拠/リーチ/チップのカウント外)。味方+1HP / 敵-1HP",
  tm20: "【霊具】自軍盤上全体のHP+2",
  tm21: "【霊具】自分のユニット1体の現HPを7にする(実効最大を超えてよい)",
  tm22: "【霊具】自分のユニット1体を選び、その正面のユニットに4ダメージ(反撃・死角の対象外)",
  // pack-shuten-kyuryu (EXP-0913B Sec.2.3)
  sk01: "ダメージを与えられない。撃破された時、味方1体(召喚コスト最大)のHP+1",
  sk02: "陰属性の相手を対象とする場合、ATK+1",
  sk03: "【影討ち】死角からの攻撃時、ATK+1(死角+2と累積)",
  sk04: "この式神の回転命令に必要な霊力は0",
  sk06: "攻撃の代わりに、範囲内の味方1体のHPをATK分回復できる",
  sk07: "自分の手番開始時、HPを1減らして「霊力+1」か「1ドロー」を選べる",
  sk09: "【巨撃】自身のほうが現在HPが多い対象には、ダメージ+1",
  sk10: "召喚時、正面に式神がいた場合、そのHPと同じHPで召喚される",
  sk11: "正面マスの式神が物理攻撃なら、自身のATKはそのATKを使用する",
  sk12: "【渾身】攻撃時にATK+1してよい(範囲内の全対象に乗る)。その場合、攻撃後に自身のHP-1",
  sk13: "攻撃で対象のHPを0にした場合、同じ向きのままその位置へ移動する(属性効果を受け直す)",
  sk15: "【再生】再攻撃(召喚攻撃を除く)のたびにHP+1",
  sk16: "自身に霊具が使用された際、そのターンATK+1(敵味方どちらの霊具でも)",
  sk17: "相手は回転命令を使えない(効果による回転は可)。自身の回転命令で、代わりに他の1体を90度回転できる",
  sk18: "【霊具】任意のユニット1体を任意の向きに変える",
  sk19: "【霊具】1体を隠す(使用者の次ターン開始まで対象外・継承召喚もできない・占拠/リーチ/チップのカウント外)。味方+1HP / 敵-1HP",
  sk20: "【霊具】自軍盤上全体のHP+1",
  sk21: "【霊具】自分のユニット1体の現HPを7にする(実効最大を超えてよい)",
  sk22: "【霊具】自分のユニット1体を選び、その正面のユニットに3ダメージ(反撃・死角の対象外)",
  // pack-adopted-0922 (採用 9/22). ad* = new or changed effect, the rest reuse tm* / sk*.
  ad01: "この式神はダメージを与えられない。撃破された時、味方1体(召喚コスト最大)のHP+2",
  ad02: "陰属性の相手を対象とする場合、ATK+1",
  ad03: "【影討ち】死角からの攻撃時、ATK+1(死角+2と累積)",
  ad05: "自分の手番開始時、HPを1減らして「霊力+1」か「1ドロー」を選べる",
  ad07: "召喚攻撃・再攻撃の対象を味方にできる。その場合ダメージの代わりに、ATKの1/2(切り上げ)だけ対象のHP+",
  ad09: "【巨撃】攻撃の際、自身のほうが現在HPが多い対象には、ダメージ+1",
  ad10: "召喚時、正面に式神がいた場合、そのHPと同じHPで召喚される",
  ad11: "正面マスの式神が物理攻撃なら、自身のATKはそのATKを使用する(範囲は自身のもの)",
  ad12: "【渾身】攻撃時にATK+1してよい(範囲内の全対象に乗る)。その場合、攻撃後に自身のHP-1",
  ad13: "攻撃・反撃で対象のHPを0にした場合、同じ向きのままその位置へ移動する(属性効果を受け直す)",
  ad15: "【再生】攻撃の際、追加で霊力1を払うと、攻撃の後に自身のHP+1",
  ad16: "【飲酒】攻撃時、追加で霊力2を払うと、その攻撃のATK+1",
  ad17: "相手は回転命令を使えない(効果による回転は可)。自身の回転命令で、代わりに他の1体を90度回転できる",
  ad18: "【霊具】任意の式神1体を任意の向きに変える",
  ad19: "【霊具】1体を隠す(使用者の次ターン開始まで対象外・継承召喚もできない・占拠/リーチ/チップのカウント外)。味方+1HP / 敵-1HP",
  ad20: "【霊具】自軍盤上全体のHP+1",
  ad21: "【霊具】自分の式神1体の正面方向で直近の敵に3ダメージ。【拳】空いていれば1マス遠ざける /【握】空いていれば1マス近づける(反撃・死角なし)",
  ad22: "【霊具】酒呑一門の自分の式神1体を選び、隣(斜めを含む)の死角以外のマスの敵1体に5ダメージ(反撃なし)",
};

/** Reigu parameter tables: same effect shape, different numbers per pack. */
const HEAL_ALL_AMOUNT: Record<string, number> = { tm20: 2, sk20: 1 };
const FRONT_STRIKE_DAMAGE: Record<string, number> = { tm22: 4, sk22: 3 };
/** 灯籠の精: HP given to one ally on death. */
const DEATH_HEAL: Record<string, number> = { tm01: 1, ad01: 2 };
/** Paid attack variants: the extra mana on top of the attack cost. */
const REGEN_EXTRA_COST: Record<string, number> = { ad15: 1 };
const DRINK_EXTRA_COST: Record<string, number> = { ad16: 2 };
/** 茨木の左腕 damage, 閻魔獄卒棒 damage and the clan its user must belong to. */
const ARM_DAMAGE: Record<string, number> = { ad21: 3 };
const CLUB_DAMAGE: Record<string, number> = { ad22: 5 };
const CLUB_CLAN: Record<string, string> = { ad22: "酒呑一門" };

/** Damage a front-strike reigu (閻魔獄卒棒) deals; 0 for any other card. */
export const frontStrikeDamage = (ctx: Ctx, cardId: string): number => FRONT_STRIKE_DAMAGE[fxOf(ctx, cardId)] ?? 0;

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
  if (fxOf(ctx, u.cardId) === "tm12") {
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
  if (!effectsOn(ctx) || fxOf(ctx, u.cardId) !== "tm12") return null;
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
    if (variant === "drink") atk += 1; // ad16【飲酒】
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
  const fx = fxOf(ctx, attacker.cardId);
  if (fx === "tm02" && tCard.attribute === "yin") bonus += 1;
  if (fx === "tm03" && blind) bonus += 1;
  if (fx === "tm10" && unitHp(ctx, attacker) > unitHp(ctx, target)) bonus += 1;
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
  const fx = fxOf(ctx, attacker.cardId);
  if (fx === "tm02" && tCard.attribute === "yin") {
    out.push(`提灯お化け: 陰属性の${tCard.nameJa}へダメージ+1`);
  }
  if (fx === "tm03" && blind) out.push("【影討ち】影鬼: 死角からの攻撃でダメージ+1");
  if (fx === "tm10" && unitHp(ctx, attacker) > unitHp(ctx, target)) {
    out.push(
      `【巨撃】一目鬼: HP差(${unitHp(ctx, attacker)} > ${unitHp(ctx, target)})によりダメージ+1`,
    );
  }
  return out;
};

// ------------------------------------------------------------ attack hooks

/** An unknown variant (untrusted input) is never usable. */
export const canUseVariant = (
  ctx: Ctx,
  u: Unit,
  variant: AttackVariant,
): boolean => {
  if (variant === "normal") return true;
  if (!effectsOn(ctx)) return false;
  const fx = fxOf(ctx, u.cardId);
  if (variant === "konshin") return fx === "tm09";
  if (variant === "heal") return fx === "tm06" || fx === "ad07";
  if (variant === "regen") return param(REGEN_EXTRA_COST, fx) !== undefined;
  if (variant === "drink") return param(DRINK_EXTRA_COST, fx) !== undefined;
  return false;
};

/** Mana a paid variant costs on top of the attack cost (ad15【再生】 +1, ad16【飲酒】 +2); 0 otherwise. */
export const variantExtraCost = (ctx: Ctx, u: Unit, variant: AttackVariant): number => {
  if (!effectsOn(ctx)) return 0;
  const fx = fxOf(ctx, u.cardId);
  if (variant === "regen") return param(REGEN_EXTRA_COST, fx) ?? 0;
  if (variant === "drink") return param(DRINK_EXTRA_COST, fx) ?? 0;
  return 0;
};

/** tm06: the heal-attack restores ATK worth of HP to one ally in range. ad07 (adopted 9/22): ceil(ATK / 2). */
export const healAttackAmount = (ctx: Ctx, s: GameState, u: Unit): number => {
  const atk = effectiveAtk(ctx, s, u);
  return fxOf(ctx, u.cardId) === "ad07" ? Math.ceil(atk / 2) : atk;
};

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
    log(events, attacker.owner, attacker.cardId, attacker.uid, "渾身: 自身に1ダメージ");
    if (unitHp(ctx, attacker) <= 0) {
      destroy(attacker);
      return;
    }
  }

  // tm15 Ibaraki-Doji: regenerates on a RE-attack only, never a summon-attack.
  if (fxOf(ctx, attacker.cardId) === "tm15" && !wasSummonAttack && variant !== "heal" && alive()) {
    if (unitHp(ctx, attacker) < unitMaxHp(ctx, attacker)) {
      healUnit(attacker, 1);
      log(events, attacker.owner, attacker.cardId, attacker.uid, "再生: HP+1");
    }
  }

  // ad15【再生】 (adopted 9/22): paid for with 1 extra mana, applied once the
  // exchange (counters included) is over, if it survived; capped at its max.
  if (variant === "regen" && alive()) {
    const before = unitHp(ctx, attacker);
    healUnit(attacker, 1);
    const gained = unitHp(ctx, attacker) - before;
    log(events, attacker.owner, attacker.cardId, attacker.uid, gained > 0 ? "【再生】HP+1" : "【再生】HPは最大のまま");
  }
};

// ------------------------------------------------------------ other hooks

/**
 * tm11 Ungaikyo: the HP a freshly summoned `u` is set to on arrival (the
 * current HP of whatever it faces), or null when no on-summon HP overwrite
 * applies. `s` is the board with `u` already standing on it.
 */
export const summonHpOverwrite = (ctx: Ctx, s: GameState, u: Unit): number | null => {
  if (!effectsOn(ctx)) return null;
  if (fxOf(ctx, u.cardId) !== "tm11") return null;
  const front = frontUnit(s, u);
  if (front === undefined) return null;
  return Math.max(1, Math.min(ctx.cfg.maxHp, unitHp(ctx, front)));
};

/** tm11 Ungaikyo: arrives with the current HP of whatever it faces. */
export const onSummon = (ctx: Ctx, s: GameState, u: Unit, events: GameEvent[]): void => {
  const target = summonHpOverwrite(ctx, s, u);
  if (target === null) return;
  u.damage = unitMaxHp(ctx, u) - target;
  log(events, u.owner, u.cardId, u.uid, `雲外鏡: 正面のHPを写して HP${target} で召喚`);
};

/**
 * tm01 Toro-no-Sei: on death, +1 HP to the owner's priciest survivor. Units
 * destroyed in the same resolution are removed one at a time and still stand
 * at 0 HP here; they are not survivors, whatever their board order.
 */
export const onUnitDestroyed = (
  ctx: Ctx,
  s: GameState,
  u: Unit,
  events: GameEvent[],
): void => {
  if (!effectsOn(ctx)) return;
  const amount = param(DEATH_HEAL, fxOf(ctx, u.cardId));
  if (amount === undefined) return;
  const friends = s.units.filter(
    (x) => x.owner === u.owner && x.uid !== u.uid && !isHidden(x) && unitHp(ctx, x) > 0,
  );
  if (friends.length === 0) return;
  let best = friends[0];
  for (const f of friends) {
    const a = cardOf(ctx.pack, f.cardId).summonCost;
    const b = cardOf(ctx.pack, best.cardId).summonCost;
    if (a > b || (a === b && f.uid < best.uid)) best = f;
  }
  if (unitHp(ctx, best) >= unitMaxHp(ctx, best)) return;
  const before = unitHp(ctx, best);
  healUnit(best, amount);
  const gained = unitHp(ctx, best) - before;
  log(events, u.owner, u.cardId, best.uid, `灯籠の精: ${cardOf(ctx.pack, best.cardId).nameJa} にHP+${gained}`);
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
    .filter(
      (u) => u.owner === p && fxOf(ctx, u.cardId) === "tm07" && !isHidden(u) && unitHp(ctx, u) >= 2,
    )
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
      log(events, p, u.cardId, u.uid, `古箪笥: HP-1 で${drew ? "1ドロー" : "ドロー(山札切れ)"}`);
      continue;
    }
    u.damage += 1;
    s.players[p].mana = Math.min(ctx.cfg.manaCap, s.players[p].mana + 1);
    log(events, p, u.cardId, u.uid, "古箪笥: HP-1 で霊力+1");
  }
};

/**
 * tm17 Kuryugai: while an enemy Kuryugai is on the board, this player cannot
 * issue rotate COMMANDS. Rotations from effects and reigu still work.
 */
export const rotateCommandLocked = (ctx: Ctx, s: GameState, p: PlayerId): boolean => {
  if (!effectsOn(ctx)) return false;
  return s.units.some((u) => u.owner !== p && fxOf(ctx, u.cardId) === "tm17" && !isHidden(u));
};

export const isProxyRotator = (ctx: Ctx, u: Unit): boolean =>
  effectsOn(ctx) && fxOf(ctx, u.cardId) === "tm17";

/**
 * sk13 Kyonshi-Kojo: after its attack brings the target to 0 HP it steps onto
 * that cell, keeping its facing (the moveOnKill mechanics, as a card effect).
 */
export const movesOnKill = (ctx: Ctx, u: Unit): boolean => {
  if (!effectsOn(ctx)) return false;
  const fx = fxOf(ctx, u.cardId);
  return fx === "sk13" || fx === "ad13";
};

/** ad13 僵尸公主 (adopted 9/22): a counter that destroys the attacker also moves it onto that cell. */
export const movesOnCounterKill = (ctx: Ctx, u: Unit): boolean => effectsOn(ctx) && fxOf(ctx, u.cardId) === "ad13";

// ------------------------------------------------- adopted 9/22 reigu geometry

/** The board direction a unit faces, as one step. */
const forwardStep = (u: Unit): Pos => rotateRel({ x: 0, y: 1 }, u.facing);

/**
 * ad21 茨木の左腕: the nearest enemy on the cells straight ahead of `u`
 * (「正面方向の直近の敵」). Empty cells, allies and hidden units do not stop the
 * look (ruling: allies do not block). null when no enemy is in that line.
 */
export const forwardEnemy = (s: GameState, u: Unit): { victim: Unit; dist: number } | null => {
  const d = forwardStep(u);
  for (let k = 1; ; k++) {
    const c = { x: u.pos.x + d.x * k, y: u.pos.y + d.y * k };
    if (!inBoard(c)) return null;
    const v = visibleUnitAt(s, c);
    if (v !== undefined && v.owner !== u.owner) return { victim: v, dist: k };
  }
};

/**
 * ad21: where 【拳】 (one cell further along the user's facing) or 【握】 (one
 * cell back toward the user) puts the struck enemy, or null when that cell is
 * off the board or taken by anything (a hidden unit or the user included).
 */
export const armDestination = (s: GameState, user: Unit, victim: Unit, mode: ReiguMode): Pos | null => {
  const d = forwardStep(user);
  const sign = mode === "ken" ? 1 : -1;
  const c = { x: victim.pos.x + d.x * sign, y: victim.pos.y + d.y * sign };
  if (!inBoard(c) || unitAt(s, c) !== undefined) return null;
  return c;
};

/** Damage 茨木の左腕 deals; 0 for any other card. */
export const armDamage = (ctx: Ctx, cardId: string): number => param(ARM_DAMAGE, fxOf(ctx, cardId)) ?? 0;

/** Damage 閻魔獄卒棒 (ad22) deals; 0 for any other card. */
export const clubDamage = (ctx: Ctx, cardId: string): number => param(CLUB_DAMAGE, fxOf(ctx, cardId)) ?? 0;

/**
 * ad22 閻魔獄卒棒: the enemies `u` can strike - on the 8 cells around it
 * (orthogonal and diagonal: ruling), not on one of its own blind-spot cells,
 * and not hidden.
 */
export const clubVictims = (ctx: Ctx, s: GameState, u: Unit): Unit[] => {
  const blind = toBoardCells(cardOf(ctx.pack, u.cardId).blindSpots, u.pos, u.facing);
  return s.units.filter(
    (v) =>
      v.owner !== u.owner &&
      !isHidden(v) &&
      Math.max(Math.abs(v.pos.x - u.pos.x), Math.abs(v.pos.y - u.pos.y)) === 1 &&
      !blind.some((b) => posEq(b, v.pos)),
  );
};

// ------------------------------------------------------------------ reigu

export const REIGU_IDS = ["tm18", "tm19", "tm20", "tm21", "tm22"] as const;

/**
 * unit-own-mode: an own unit, then 【拳】 or 【握】 (ad21 茨木の左腕).
 * unit-own-victim: an own unit, then an enemy next to it (ad22 閻魔獄卒棒).
 */
export type ReiguTargeting = "unit-any" | "unit-any-facing" | "unit-own" | "unit-own-mode" | "unit-own-victim" | "none";

/**
 * Every IMPLEMENTED reigu effect, keyed by effect key, with how it targets.
 * The single source of truth for "this reigu does something": a reigu whose
 * effect key is not listed (kyubi-ryu kr17-kr22) has no implementation, so it
 * is never legal and counts as a dead card whatever the effects flag says.
 * A new reigu effect adds its key here, its cases in reiguTargetOk /
 * applyReigu and its EFFECT_TEXT.
 */
const REIGU_TARGETING: ReadonlyMap<string, ReiguTargeting> = new Map<string, ReiguTargeting>([
  ["tm18", "unit-any-facing"], // rotate any unit, direction chosen
  ["sk18", "unit-any-facing"],
  ["tm19", "unit-any"],
  ["tm20", "none"],
  ["sk20", "none"],
  ["tm21", "unit-own"],
  ["tm22", "unit-own"],
  ["sk22", "unit-own"],
  ["ad21", "unit-own-mode"],
  ["ad22", "unit-own-victim"],
]);

/** The modes a unit-own-mode reigu offers. */
export const REIGU_MODES: readonly ReiguMode[] = ["ken", "aku"];

export const REIGU_MODE_LABEL: Record<ReiguMode, string> = { ken: "拳", aku: "握" };

/** Effect keys of the implemented reigu (REIGU_TARGETING). */
export const IMPLEMENTED_REIGU_EFFECTS: readonly string[] = [...REIGU_TARGETING.keys()];

/** Is this card a reigu whose effect is implemented? */
export const reiguImplemented = (ctx: Ctx, cardId: string): boolean =>
  cardOf(ctx.pack, cardId).kind === "reigu" && REIGU_TARGETING.has(fxOf(ctx, cardId));

/** Takes an EFFECT KEY (for tsukumo-miyako that is simply the card id); "none" for an unimplemented one. */
export const reiguTargeting = (key: string): ReiguTargeting => REIGU_TARGETING.get(key) ?? "none";

/** Can this reigu legally be pointed at this unit right now? */
export const reiguTargetOk = (ctx: Ctx, s: GameState, cardId: string, target: Unit): boolean => {
  if (isHidden(target)) return false; // hidden units cannot be chosen
  const p = s.turnPlayer;
  switch (fxOf(ctx, cardId)) {
    case "tm18":
    case "sk18":
    case "tm19":
      return true;
    case "tm21":
      return target.owner === p && unitHp(ctx, target) < 7;
    case "tm22":
    case "sk22": {
      if (target.owner !== p) return false;
      const c = frontCell(target);
      if (c === undefined) return false;
      return visibleUnitAt(s, c) !== undefined;
    }
    case "ad21":
      return target.owner === p && forwardEnemy(s, target) !== null;
    case "ad22": {
      if (target.owner !== p) return false;
      if (cardOf(ctx.pack, target.cardId).clan !== param(CLUB_CLAN, "ad22")) return false;
      return clubVictims(ctx, s, target).length > 0;
    }
    default:
      return false;
  }
};

/** What a reigu action chooses beyond its target: ad21's mode, ad22's enemy. */
export type ReiguChoice = { mode?: ReiguMode; victimUid?: number };

/**
 * The extra choice is exactly what this reigu asks for (and nothing more):
 * ad21 a mode, ad22 one of the target's clubVictims, every other reigu none.
 */
export const reiguChoiceOk = (ctx: Ctx, s: GameState, cardId: string, target: Unit | null, choice: ReiguChoice): boolean => {
  const targeting = reiguTargeting(fxOf(ctx, cardId));
  if (targeting === "unit-own-mode") {
    return choice.victimUid === undefined && choice.mode !== undefined && REIGU_MODES.includes(choice.mode);
  }
  if (targeting === "unit-own-victim") {
    if (choice.mode !== undefined || choice.victimUid === undefined || target === null) return false;
    return clubVictims(ctx, s, target).some((v) => v.uid === choice.victimUid);
  }
  return choice.mode === undefined && choice.victimUid === undefined;
};

/** An unimplemented reigu never is; tm20 needs at least one of the player's own units on the board. */
export const reiguUsable = (ctx: Ctx, s: GameState, cardId: string): boolean => {
  if (!reiguImplemented(ctx, cardId)) return false;
  const fx = fxOf(ctx, cardId);
  if (fx !== "tm20" && fx !== "sk20") return true;
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
  choice: ReiguChoice = {},
): void => {
  const p = s.turnPlayer;
  const nameOf = (u: Unit): string => cardOf(ctx.pack, u.cardId).nameJa;

  // tm16 Shuten-Doji: ATK+1 this turn whenever a reigu is aimed at it,
  // from either side.
  if (target !== null && fxOf(ctx, target.cardId) === "tm16") {
    target.atkBuff += 1;
    log(events, target.owner, target.cardId, target.uid, "酒呑童子: 霊具を受けて このターンATK+1");
  }

  const fx = fxOf(ctx, cardId);
  switch (fx) {
    case "tm18":
    case "sk18": {
      if (target === null || facing === null) return;
      const from = target.facing;
      target.facing = facing as Unit["facing"];
      events.push({ t: "effect", player: p, source: cardId, uid: target.uid, text: `家鳴り: ${nameOf(target)} を回転`, from, to: target.facing });
      return;
    }
    case "tm19": {
      if (target === null) return;
      target.hiddenBy = p;
      const friendly = target.owner === p;
      if (friendly) {
        healUnit(target, 1);
        log(events, p, cardId, target.uid, `マヨヒガ: 味方 ${nameOf(target)} を隠す (HP+1)`);
      } else {
        target.damage += 1;
        log(events, p, cardId, target.uid, `マヨヒガ: 敵 ${nameOf(target)} を隠す (HP-1)`);
        if (unitHp(ctx, target) <= 0) destroy(target);
      }
      return;
    }
    case "tm20":
    case "sk20": {
      const amount = HEAL_ALL_AMOUNT[fx];
      for (const u of s.units) {
        if (u.owner !== p || isHidden(u)) continue;
        healUnit(u, amount);
      }
      log(events, p, cardId, null, `琵琶牧々: 自軍全体にHP+${amount}`);
      return;
    }
    case "tm21": {
      if (target === null) return;
      // set current HP to exactly 7, allowed to exceed the effective max
      target.damage = unitMaxHp(ctx, target) - 7;
      log(events, p, cardId, target.uid, `鬼の酒: ${nameOf(target)} のHPを7に`);
      return;
    }
    case "tm22":
    case "sk22": {
      if (target === null) return;
      const c = frontCell(target);
      if (c === undefined) return;
      const victim = visibleUnitAt(s, c);
      if (victim === undefined) return;
      const dmg = FRONT_STRIKE_DAMAGE[fx];
      victim.damage += dmg;
      log(
        events,
        p,
        cardId,
        victim.uid,
        `閻魔獄卒棒: ${nameOf(victim)} に${dmg}ダメージ (反撃なし)`,
      );
      if (unitHp(ctx, victim) <= 0) destroy(victim);
      return;
    }
    case "ad21": {
      if (target === null) return;
      const hit = forwardEnemy(s, target);
      if (hit === null) return;
      const victim = hit.victim;
      const mode = choice.mode ?? "ken";
      const word = REIGU_MODE_LABEL[mode];
      const dmg = armDamage(ctx, cardId);
      victim.damage += dmg;
      log(events, p, cardId, victim.uid, `茨木の左腕【${word}】: ${nameOf(victim)} に${dmg}ダメージ (反撃なし)`);
      // destroyed by the blow: nothing moves
      if (unitHp(ctx, victim) <= 0) {
        destroy(victim);
        return;
      }
      const dest = armDestination(s, target, victim, mode);
      if (dest === null) {
        log(events, p, cardId, victim.uid, `茨木の左腕【${word}】: ${mode === "ken" ? "奥" : "手前"}のマスが空いていないので動かない`);
        return;
      }
      const from = { x: victim.pos.x, y: victim.pos.y };
      victim.pos = { x: dest.x, y: dest.y };
      events.push({ t: "move", player: p, uid: victim.uid, from, to: { x: dest.x, y: dest.y }, source: cardId });
      log(events, p, cardId, victim.uid, `茨木の左腕【${word}】: ${nameOf(victim)} を1マス${mode === "ken" ? "遠ざけた" : "引き寄せた"}`);
      // the new cell's attribute applies at once: an opposing cell can finish it (ruling)
      if (unitHp(ctx, victim) <= 0) destroy(victim);
      return;
    }
    case "ad22": {
      if (target === null || choice.victimUid === undefined) return;
      const victim = clubVictims(ctx, s, target).find((v) => v.uid === choice.victimUid);
      if (victim === undefined) return;
      const dmg = clubDamage(ctx, cardId);
      victim.damage += dmg;
      log(events, p, cardId, victim.uid, `閻魔獄卒棒: ${nameOf(target)}の隣の ${nameOf(victim)} に${dmg}ダメージ (反撃なし)`);
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
