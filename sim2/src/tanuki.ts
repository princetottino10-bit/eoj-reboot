// 狸一門 (packs tanuki-1022k / tanuki-1022s). Design notes: the project files
// new-ichimon-1016/狸一門_1016案3.md and 狸一門_袋叩き案_1025.md.
//
// 【加勢】(条件) - 10/25 袋叩き案: a 狸 summoned where its condition holds lets
// a neighbouring ally attack at once, free of attack cost, even one that has
// attacked this turn (Unit.kasei; spent in combat.ts). Some 狸 grant more.
// The 10/22案 discount is gone. 狸囃子 (tn10) makes the next summon (every
// summon this turn with 腹鼓の子狸 on the board) count as meeting the condition.
// "隣" is the 8 cells around (orthogonal and diagonal), as for 閻魔獄卒棒.
// 豆狸 (tn01) counts as 2 wherever 【加勢】 counts allies.
//
// Keyed by effect key, like effects.ts. Cards without an entry have no 【加勢】.
import { blindCells } from "./combat.ts";
import { fxOf } from "./effects.ts";
import { cardOfUnit, isHidden, occupied, opponent, unitAt } from "./state.ts";
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
  tn03: { max: 1, label: "味方1体以上の隣", amount: (ctx, s, p, pos) => (allyWeight(ctx, around(s, pos, p)) >= 1 ? 1 : 0) },
  tn04: {
    max: 1,
    label: "敵の隙のマス",
    amount: (ctx, s, p, pos) =>
      s.units.some((u) => u.owner !== p && !isHidden(u) && blindCells(ctx, u).some((c) => posEq(c, pos))) ? 1 : 0,
  },
  tn05: { max: 2, label: "敵1体以上の隣", amount: (_ctx, s, p, pos) => (around(s, pos, opponent(p)).length >= 1 ? 2 : 0) },
  tn06: { max: 2, label: "味方2体以上の隣", amount: (ctx, s, p, pos) => (allyWeight(ctx, around(s, pos, p)) >= 2 ? 2 : 0) },
  tn07: { max: 3, label: "相手がリーチ中", amount: (_ctx, s, p) => (s.players[opponent(p)].reach ? 3 : 0) },
  tn08: {
    max: 3,
    label: "相手の式神の方が多い/小鷹狸の隣",
    amount: (ctx, s, p, pos) =>
      occupied(s, opponent(p)) > occupied(s, p) || around(s, pos, p).some((u) => fxOf(ctx, u.cardId) === "tn05") ? 3 : 0,
  },
  tn09: {
    max: 1,
    label: "盤上の自分の式神2体以上",
    amount: (ctx, s, p) => (allyWeight(ctx, s.units.filter((u) => u.owner === p && !isHidden(u))) >= 2 ? 1 : 0),
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

/** A group id no grant this turn uses yet (and the map to hold it). */
const freshGroup = (s: GameState): number => {
  s.kaseiLeft ??= {};
  let g = 1;
  while (s.kaseiLeft[g] !== undefined) g += 1;
  return g;
};

/**
 * 【加勢】の連鎖: p's 【加勢】 attack by `from` (standing at `pos` when it struck)
 * destroyed an enemy. One ally next to `pos` that holds no 【加勢】 attack yet
 * may attack next, free - which may chain again.
 */
export const chainKasei = (ctx: Ctx, s: GameState, p: PlayerId, from: number, fromCard: string, pos: Pos, events: GameEvent[]): void => {
  if (!ctx.cfg.effects) return;
  const pool = around(s, pos, p).filter((a) => a.uid !== from && a.kasei === undefined && cardOfUnit(ctx, a).atk > 0);
  if (pool.length === 0) return;
  const g = freshGroup(s);
  s.kaseiLeft![g] = 1;
  for (const a of pool) a.kasei = { src: "chain", group: g };
  events.push({ t: "effect", player: p, source: fromCard, uid: from, text: "【加勢】連鎖: 倒した味方の隣の味方1体が、続けて攻撃霊力なしで攻撃できる" });
};

/** 化け狸: what it may copy from the unit in front - a card that attacks, not one with 全域. */
const copiable = (card: CardDef): boolean =>
  card.kind === "shikigami" && card.atk > 0 && card.attackRange.length > 0 && card.attackRange.length < parseTenkey(TENKEY_ALL).length;

/**
 * The 狸's on-summon effects, after the summon was paid. `kasei`: its
 * 【加勢】 condition held (or 狸囃子 made it hold): grant the free attacks.
 */
export const onTanukiSummon = (ctx: Ctx, s: GameState, u: Unit, kasei: boolean, events: GameEvent[]): void => {
  if (!ctx.cfg.effects) return;
  const fx = fxOf(ctx, u.cardId);
  const nameOf = (x: Unit): string => cardOf(ctx.pack, x.cardId).nameJa;
  if (fx === "tn04") {
    const front = toBoardCells([{ x: 0, y: 1 }], u.pos, u.facing)[0];
    const f = front === undefined ? undefined : unitAt(s, front);
    const from = f === undefined || isHidden(f) ? undefined : cardOf(ctx.pack, f.borrow ?? f.cardId);
    if (from !== undefined && copiable(from)) {
      u.borrow = from.id;
      log(events, u, `化け狸: 正面の${from.nameJa}に化けて、その間合・反撃間合・${from.aoe ? "範囲" : "単体"}を使う`);
    }
  }
  if (!kasei || !hasKasei(ctx, cardOf(ctx.pack, u.cardId))) return;
  // who may take the free attack: allies that can attack at all
  const attackers = (us: Unit[]): Unit[] => us.filter((a) => a.uid !== u.uid && cardOfUnit(ctx, a).atk > 0);
  const allies = attackers(around(s, u.pos, u.owner));
  if (fx === "tn08") for (const a of allies) a.atkBuff += 1;
  // tn06 太三郎 / tn07 団三郎: every neighbour attacks. tn05 小鷹: it may take
  // the one attack itself. tn09 隠神刑部: three of its own, anywhere.
  const pool =
    fx === "tn09" ? attackers(s.units.filter((a) => a.owner === u.owner && !isHidden(a))) : fx === "tn05" ? [...allies, u] : allies;
  if (pool.length === 0) return;
  const each = fx === "tn06" || fx === "tn07";
  const count = fx === "tn09" ? 3 : 1;
  const shared = freshGroup(s);
  s.kaseiLeft![shared] = count;
  for (const a of pool) {
    const group = each && a !== pool[0] ? freshGroup(s) : shared;
    a.kasei = { src: fx, group };
    s.kaseiLeft![group] = each ? 1 : count;
  }
  const who = each ? "隣の味方全員" : fx === "tn09" ? "自分の式神から3体まで" : fx === "tn05" ? "隣の味方かこの式神の1体" : "隣の味方1体";
  log(events, u, `${nameOf(u)}【加勢】: ${who}が攻撃霊力なしで攻撃できる${fx === "tn08" ? "(この手番、隣の味方全員の攻撃力+1)" : ""}`);
};
