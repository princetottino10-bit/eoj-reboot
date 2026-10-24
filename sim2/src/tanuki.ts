// 狸一門 (10/22案, packs tanuki-1022k / tanuki-1022s). Design note: the project
// file new-ichimon-1016/狸一門_1016案3.md with its 10/22 additions.
//
// 【加勢】(条件で召喚霊力-N): a 狸 summoned where its condition holds costs N less. The
// 太極 discount and 【加勢】 never stack: the larger one applies (rules.ts
// summonCostFor). 狸囃子 (tn10) makes the next summon (every summon this turn
// with 腹鼓の子狸 on the board) count as meeting the condition.
// "隣" is the 8 cells around (orthogonal and diagonal), as for 閻魔獄卒棒.
// 豆狸 (tn01) counts as 2 wherever 【加勢】 counts allies.
//
// Keyed by effect key, like effects.ts. Cards without an entry have no 【加勢】.
import { blindCells } from "./combat.ts";
import { fxOf } from "./effects.ts";
import { healGain, healUnit, isHidden, occupied, opponent, unitAt } from "./state.ts";
import type { Ctx } from "./state.ts";
import { posEq, toBoardCells } from "./board.ts";
import { cardOf, parseTenkey, TENKEY_ALL } from "./cards.ts";
import type { CardDef, GameEvent, GameState, PlayerId, Pos, Unit } from "./types.ts";

export const TANUKI_CLAN = "狸一門";

/** 狸 never arrive by 継承召喚 (a 狸 on the board may still be the one replaced). */
export const noInherit = (card: CardDef): boolean => card.clan === TANUKI_CLAN;

type Kasei = { max: number; label: string; amount: (ctx: Ctx, s: GameState, p: PlayerId, pos: Pos) => number };

const near = (a: Pos, b: Pos): boolean => !posEq(a, b) && Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;

/** The visible units of `owner` on the 8 cells around `pos`. */
const around = (s: GameState, pos: Pos, owner: PlayerId): Unit[] =>
  s.units.filter((u) => u.owner === owner && !isHidden(u) && near(u.pos, pos));

/** Allies as 【加勢】 counts them: 豆狸 is 2. */
const allyWeight = (ctx: Ctx, us: readonly Unit[]): number =>
  us.reduce((n, u) => n + (fxOf(ctx, u.cardId) === "tn01" ? 2 : 1), 0);

const KASEI: Record<string, Kasei> = {
  tn03: { max: 1, label: "味方2体以上の隣", amount: (ctx, s, p, pos) => (allyWeight(ctx, around(s, pos, p)) >= 2 ? 1 : 0) },
  tn04: {
    max: 1,
    label: "敵の隙のマス",
    amount: (ctx, s, p, pos) =>
      s.units.some((u) => u.owner !== p && !isHidden(u) && blindCells(ctx, u).some((c) => posEq(c, pos))) ? 1 : 0,
  },
  tn05: { max: 2, label: "敵2体以上の隣", amount: (_ctx, s, p, pos) => (around(s, pos, opponent(p)).length >= 2 ? 2 : 0) },
  tn06: { max: 2, label: "味方3体以上の隣", amount: (ctx, s, p, pos) => (allyWeight(ctx, around(s, pos, p)) >= 3 ? 2 : 0) },
  tn07: { max: 3, label: "相手がリーチ中", amount: (_ctx, s, p) => (s.players[opponent(p)].reach ? 3 : 0) },
  tn08: {
    max: 3,
    label: "相手の式神の方が多い/小鷹狸の隣",
    amount: (ctx, s, p, pos) =>
      occupied(s, opponent(p)) > occupied(s, p) || around(s, pos, p).some((u) => fxOf(ctx, u.cardId) === "tn05") ? 3 : 0,
  },
  tn09: {
    max: 3,
    label: "味方1体につき",
    amount: (ctx, s, p) => Math.min(3, allyWeight(ctx, s.units.filter((u) => u.owner === p && !isHidden(u)))),
  },
};

/** Does this card have a 【加勢】 at all? */
export const hasKasei = (ctx: Ctx, card: CardDef): boolean =>
  card.kind === "shikigami" && Object.prototype.hasOwnProperty.call(KASEI, fxOf(ctx, card.id));

/** Is 狸囃子 in force for p's next summon? */
const freeFor = (s: GameState, p: PlayerId): boolean => s.kaseiFree?.player === p;

/**
 * 【加勢】 for p summoning `card` onto `pos` now: `amount` off (0 when the
 * condition does not hold or the card has none), `byHayashi` when only 狸囃子
 * made it hold, and the condition's words for the log.
 */
export const kaseiDiscount = (
  ctx: Ctx,
  s: GameState,
  p: PlayerId,
  card: CardDef,
  pos: Pos,
): { amount: number; byHayashi: boolean; label: string } => {
  if (!ctx.cfg.effects || !hasKasei(ctx, card)) return { amount: 0, byHayashi: false, label: "" };
  const k = KASEI[fxOf(ctx, card.id)];
  const own = k.amount(ctx, s, p, pos);
  if (own > 0) return { amount: own, byHayashi: false, label: k.label };
  return freeFor(s, p) ? { amount: k.max, byHayashi: true, label: "狸囃子" } : { amount: 0, byHayashi: false, label: k.label };
};

/** A summon (or 継承召喚) by p happened: a "next summon" 狸囃子 is spent. */
export const spendHayashi = (s: GameState, p: PlayerId): void => {
  if (s.kaseiFree?.player === p && !s.kaseiFree.all) delete s.kaseiFree;
};

const log = (events: GameEvent[], u: Unit, text: string): void => {
  events.push({ t: "effect", player: u.owner, source: u.cardId, uid: u.uid, text });
};

/** 化け狸: what it may copy from the unit in front - a card that attacks, not one with 全域. */
const copiable = (card: CardDef): boolean =>
  card.kind === "shikigami" && card.atk > 0 && card.attackRange.length > 0 && card.attackRange.length < parseTenkey(TENKEY_ALL).length;

/**
 * The 狸's on-summon effects, after the summon was paid. `kasei`: its
 * 【加勢】 condition held (or 狸囃子 made it hold) - the "そうしたとき" effects
 * need it, whichever discount the cost actually took.
 */
export const onTanukiSummon = (ctx: Ctx, s: GameState, u: Unit, kasei: boolean, events: GameEvent[]): void => {
  if (!ctx.cfg.effects) return;
  const fx = fxOf(ctx, u.cardId);
  const nameOf = (x: Unit): string => cardOf(ctx.pack, x.cardId).nameJa;
  if (fx === "tn04") {
    const front = toBoardCells([{ x: 0, y: 1 }], u.pos, u.facing)[0];
    const f = front === undefined ? undefined : unitAt(s, front);
    if (f === undefined || isHidden(f)) return;
    const from = cardOf(ctx.pack, f.borrow ?? f.cardId);
    if (!copiable(from)) return;
    u.borrow = from.id;
    log(events, u, `化け狸: 正面の${from.nameJa}に化けて、その間合・反撃間合・${from.aoe ? "範囲" : "単体"}を使う`);
    return;
  }
  if (!kasei) return;
  const allies = around(s, u.pos, u.owner);
  if (fx === "tn03") {
    // the ally the heal helps most; ties to the earlier summon
    let best: Unit | null = null;
    for (const a of allies) {
      if (healGain(ctx, a, 2) > 0 && (best === null || healGain(ctx, a, 2) > healGain(ctx, best, 2))) best = a;
    }
    if (best === null) return;
    const gain = healGain(ctx, best, 2);
    healUnit(ctx, best, 2);
    log(events, u, `茶釜狸: 隣の${nameOf(best)}の耐久+${gain}`);
    return;
  }
  if (fx === "tn06") {
    for (const a of allies) healUnit(ctx, a, 1);
    if (allies.length > 0) log(events, u, "太三郎狸: 隣の味方全員の耐久+1");
    return;
  }
  if (fx === "tn08") {
    for (const a of allies) a.atkBuff += 1;
    if (allies.length > 0) log(events, u, "金長狸: この手番、隣の味方全員の攻撃力+1");
  }
};
