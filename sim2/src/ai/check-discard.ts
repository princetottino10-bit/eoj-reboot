// 王手を意識した手札整理: under コールド勝ち by unit count (5体目で即勝ち), a
// side ending its turn one or two units short keeps the cheapest shikigami it
// needs to finish next turn and redraws everything else. Without it the AIs
// kept "anything affordable" and sat on a check with a 7-cost card in hand:
// from 3 units they placed the last two only 14-47% of the time, against
// 39-77% when digging (sim2/scripts/speed-sweep.ts, 2026-10-04).
import { cardOf } from "../cards.ts";
import type { Ctx } from "../state.ts";
import type { DiscardChooser } from "../turn.ts";
import type { GameState, PlayerId } from "../types.ts";

/** How many more units p needs for the unit-count コールド勝ち; null when that rule is off or it is not close. */
const shortBy = (ctx: Ctx, s: GameState, p: PlayerId): number | null => {
  const target = ctx.cfg.instantWinCells;
  if (target === null || ctx.cfg.instantWinCount !== "units") return null;
  const mine = s.units.filter((u) => u.owner === p && u.hiddenBy === null).length;
  const need = target - mine;
  if (need < 1 || need > 2) return null;
  const empty = ctx.cfg.boardCells - s.units.length;
  return need <= empty ? need : null;
};

/**
 * Wraps a discard policy: close to the コールド勝ち, keep the `need` cheapest
 * shikigami when together they fit next turn's 霊力 (one on the 太極 when it is
 * free) and pitch the rest; otherwise the wrapped policy decides.
 */
export const checkAwareDiscard = (base: DiscardChooser): DiscardChooser => (ctx, s, p) => {
  const need = shortBy(ctx, s, p);
  if (need === null) return base(ctx, s, p);
  const hand = s.players[p].hand;
  const shiki = hand
    .map((id, i) => ({ i, cost: cardOf(ctx.pack, id) }))
    .filter((x) => x.cost.kind === "shikigami")
    .map((x) => ({ i: x.i, cost: x.cost.summonCost }))
    .sort((a, b) => a.cost - b.cost)
    .slice(0, need);
  if (shiki.length < need) {
    // not enough shikigami to finish: keep the ones there are (cheap ones only) and dig for the rest
    const keep = new Set(shiki.filter((x) => x.cost <= 5).map((x) => x.i));
    return hand.map((_, i) => i).filter((i) => !keep.has(i));
  }
  const taijiFree = !s.units.some((u) => u.pos.x === 1 && u.pos.y === 1);
  const costs = shiki.map((x) => x.cost);
  const dearest = costs[costs.length - 1];
  const total = costs.reduce((a, b) => a + b, 0) - (taijiFree ? dearest - Math.max(ctx.cfg.taijiFloor, dearest - ctx.cfg.taijiDiscount) : 0);
  // under turn_end income the tick is already in; turn_start adds it next turn
  const mana = s.players[p].mana + (ctx.cfg.incomeTiming === "turn_start" ? ctx.cfg.baseIncome : 0);
  if (total > mana) {
    // the pair does not fit yet: keep the cheapest one if it is cheap, dig for a partner
    const keep = new Set(shiki.slice(0, 1).filter((x) => x.cost <= 5).map((x) => x.i));
    return hand.map((_, i) => i).filter((i) => !keep.has(i));
  }
  const keep = new Set(shiki.map((x) => x.i));
  return hand.map((_, i) => i).filter((i) => !keep.has(i));
};
