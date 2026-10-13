// 古箪笥 tm07b (10/13, pack-adopted-1013): 「この式神に攻撃を命じた際、ダメージを
// 与える代わりに、次のいずれか1つを行う。・耐久を1消費し、霊力を1得る ・カードを1枚引く」
//
// The attack command of such a unit (an attack action with variant tansuMana /
// tansuDraw, legal in rules.ts) costs no mana, needs no target or range, deals
// no damage and draws no counter. It uses the unit's attack for the turn like
// any attack (attackedThisTurn; a rotate before it is fine, none after), and is
// also what its summon-turn attack (召喚攻撃) may be.
//
// 耐久-1 is allowed at 耐久1: the mana is gained, then the unit is destroyed as
// a self-destruction (killer null, the same path as 首引の姫鬼's 渾身), so no
// opponent kill reward; under refundMode "half" the owner's own refund applies
// exactly as it does for 渾身.
// Pure: no node builtins.
import { checkLifeLoss, destroyUnit } from "./combat.ts";
import { checkDeckOut, drawOne } from "./draw.ts";
import { gainMana, unitByUid, unitHp } from "./state.ts";
import type { Ctx } from "./state.ts";
import { cardOf } from "./cards.ts";
import type { GameEvent, GameState } from "./types.ts";

export const resolveTansuAttack = (
  ctx: Ctx,
  s: GameState,
  uid: number,
  variant: "tansuMana" | "tansuDraw",
  events: GameEvent[],
): void => {
  const u = unitByUid(s, uid);
  if (u === undefined) throw new Error(`resolveTansuAttack: no unit ${uid}`);
  const p = u.owner;
  const free = ctx.cfg.freeSummonAttack === "optional" && u.freeAttack === true;
  u.attackedThisTurn = true;
  delete u.freeAttack;
  events.push({
    t: "attack",
    player: p,
    uid: u.uid,
    cardId: u.cardId,
    aoe: false,
    cost: 0,
    ...(free ? { free: true as const } : {}),
    hits: [],
    counterTotal: 0,
    counterCount: 0,
    attackerDestroyed: false,
    variant,
  });
  const name = cardOf(ctx.pack, u.cardId).nameJa;
  if (variant === "tansuDraw") {
    const drew = drawOne(ctx, s, p, events);
    events.push({ t: "effect", player: p, source: u.cardId, uid: u.uid, text: drew ? `${name}: 1枚引く` : `${name}: 1枚引く(山札も墓地もない)` });
    checkDeckOut(ctx, s, events);
    return;
  }
  u.damage += 1;
  const gained = gainMana(s.players[p], 1, ctx.cfg.manaCap);
  events.push({
    t: "effect",
    player: p,
    source: u.cardId,
    uid: u.uid,
    text: gained > 0 ? `${name}: 耐久-1 で霊力+1` : `${name}: 耐久-1 (霊力は上限${ctx.cfg.manaCap}のまま)`,
  });
  if (unitHp(ctx, u) <= 0) {
    // self-destruction: nobody is the killer (as 渾身)
    destroyUnit(ctx, s, u, events, null);
    checkLifeLoss(ctx, s, events);
  }
};
