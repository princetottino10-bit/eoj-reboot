// 狸一門 (packs tanuki-1022k / tanuki-1022s). Design notes: the project files
// new-ichimon-1016/狸一門_1016案3.md and 狸一門_袋叩き案_1025.md.
//
// 【加勢】(条件で召喚霊力-N): a 狸 summoned where its condition holds costs N
// less. The 太極 discount and 【加勢】 never stack: the larger one applies
// (rules.ts summonCostFor). 狸囃子 (tn10) makes the next summon (every summon
// this turn with 腹鼓の子狸 on the board) count as meeting the condition.
// 【袋叩き】 (10/25, 小鷹・太三郎・団三郎・隠神刑部): summoned by 【加勢】, it lets
// allies that have not attacked this turn attack at once, free of attack cost
// (Unit.kasei; spent in combat.ts). 10/26 dropped the 連鎖 and the second
// attack (狸一門_10_26案.md). 召3 = printed 召喚霊力 3, any clan.
// "隣" is the 8 cells around (orthogonal and diagonal), as for 閻魔獄卒棒.
// 豆狸 (tn01) counts as 2 wherever 【加勢】 counts allies.
//
// Keyed by effect key, like effects.ts. Cards without an entry have no 【加勢】.
import { fxOf } from "./effects.ts";
import { cardOfUnit, healGain, healUnit, isHidden, occupied, opponent, unitAt } from "./state.ts";
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

/**
 * 子狸 (10/25): a unit whose printed 召喚霊力 is 3, of any clan - the swarm the
 * big 狸 count and lead.
 */
export const isSmall = (ctx: Ctx, u: Unit): boolean => cardOf(ctx.pack, u.cardId).summonCost === 3;

/** Allies as 【加勢】 counts them: 豆狸 is 2. */
const allyWeight = (ctx: Ctx, us: readonly Unit[]): number =>
  us.reduce((n, u) => n + (fxOf(ctx, u.cardId) === "tn01" ? 2 : 1), 0);

const KASEI: Record<string, Kasei> = {
  // 10/26: 茶釜狸 (tn03) と化け狸 (tn04) は【加勢】なし、大物の割引は−1か−2 (性能をそろえる)
  tn05: { max: 1, label: "敵1体以上の隣", amount: (_ctx, s, p, pos) => (around(s, pos, opponent(p)).length >= 1 ? 1 : 0) },
  tn06: {
    max: 1,
    label: "召3の味方2体以上の隣",
    amount: (ctx, s, p, pos) => (allyWeight(ctx, around(s, pos, p).filter((u) => isSmall(ctx, u))) >= 2 ? 1 : 0),
  },
  tn07: { max: 2, label: "相手がリーチ中", amount: (_ctx, s, p) => (s.players[opponent(p)].reach ? 2 : 0) },
  tn08: {
    max: 2,
    label: "相手の式神の方が多い/小鷹狸の隣",
    amount: (ctx, s, p, pos) =>
      occupied(s, opponent(p)) > occupied(s, p) || around(s, pos, p).some((u) => fxOf(ctx, u.cardId) === "tn05") ? 2 : 0,
  },
  tn09: {
    max: 2,
    label: "盤上の召3の味方1体につき",
    amount: (ctx, s, p) => Math.min(2, allyWeight(ctx, s.units.filter((u) => u.owner === p && !isHidden(u) && isSmall(ctx, u)))),
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

/** The 狸 with 【袋叩き】 (10/25): on a 【加勢】 summon, allies attack free (Unit.kasei). */
const BUKURO = new Set(["tn05", "tn06", "tn07", "tn09"]);

/** A group id no grant this turn uses yet (and the map to hold it). */
const freshGroup = (s: GameState): number => {
  s.kaseiLeft ??= {};
  let g = 1;
  while (s.kaseiLeft[g] !== undefined) g += 1;
  return g;
};

/** 化け狸: what it may copy from the unit in front - a card that attacks, not one with 全域. */
const copiable = (card: CardDef): boolean =>
  card.kind === "shikigami" && card.atk > 0 && card.attackRange.length > 0 && card.attackRange.length < parseTenkey(TENKEY_ALL).length;

/**
 * The 狸's on-summon effects, after the summon was paid. `kasei`: its
 * 【加勢】 condition held (or 狸囃子 made it hold) - the "【加勢】で召喚したとき"
 * effects need it, whichever discount the cost actually took.
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
  // 茶釜狸 (10/26: 【加勢】なし): 召喚時、隣の味方1体の耐久+2
  if (fx === "tn03") {
    // the ally the heal helps most; ties to the earlier summon
    let best: Unit | null = null;
    for (const a of around(s, u.pos, u.owner)) {
      if (healGain(ctx, a, 2) > 0 && (best === null || healGain(ctx, a, 2) > healGain(ctx, best, 2))) best = a;
    }
    if (best === null) return;
    const gain = healGain(ctx, best, 2);
    healUnit(ctx, best, 2);
    log(events, u, `茶釜狸: 隣の${nameOf(best)}の耐久+${gain}`);
    return;
  }
  if (!kasei || !hasKasei(ctx, cardOf(ctx.pack, u.cardId))) return;
  // the "【加勢】で召喚したとき" effects
  if (fx === "tn08") {
    let n = 0;
    for (const a of s.units) if (a.owner === u.owner && !isHidden(a) && isSmall(ctx, a)) (a.atkBuff += 1), n++;
    if (n > 0) log(events, u, "金長狸: この手番、盤上の召3の味方全員の攻撃力+1");
    return;
  }
  if (!BUKURO.has(fx)) return;
  // 【袋叩き】: who may take the free attack - allies that can attack at all and
  // have not attacked this turn (10/26: no second attack).
  // tn06 太三郎 / tn07 団三郎: every neighbour. tn05 小鷹: one neighbour or
  // itself. tn09 隠神刑部: three 召3 allies, anywhere.
  const attackers = (us: Unit[]): Unit[] => us.filter((a) => a.uid !== u.uid && !a.attackedThisTurn && cardOfUnit(ctx, a).atk > 0);
  const allies = attackers(around(s, u.pos, u.owner));
  const pool =
    fx === "tn09"
      ? attackers(s.units.filter((a) => a.owner === u.owner && !isHidden(a) && isSmall(ctx, a)))
      : fx === "tn05"
        ? [...allies, u]
        : allies;
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
  const who = each ? "隣の味方全員" : fx === "tn09" ? "召3の味方から3体まで" : "隣の味方かこの式神の1体";
  log(events, u, `${nameOf(u)}【袋叩き】: ${who}が攻撃霊力なしで攻撃できる`);
};
