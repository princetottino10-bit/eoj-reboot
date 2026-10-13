// 古箪笥 tm07b (10/13) for every AI kind: its attack command (耐久-1 → 霊力+1, or
// draw 1) is decided by a fixed rule, never by search (a searched draw would
// peek at the deck). The searches skip those actions (isTansuAction); this
// wrapper puts the rule's choice into the plan: at the start of the turn for
// the 古箪笥 already on the board, and right after a summon / 継承召喚 that
// places one (its 召喚攻撃).
//
// The rule: 霊力 when the unit has 耐久 3+ and one more 霊力 reaches a card in
// hand that the current 霊力 does not; otherwise draw. Never 耐久-1 at 耐久1-2
// with nothing to gain, so the AI never destroys its own 古箪笥.
// Deterministic. Pure: no node builtins.
import { cardOf } from "../cards.ts";
import { hasTansuAttack } from "../effects.ts";
import { applyActionInPlace, baseSummonCost, isLegal } from "../rules.ts";
import { cloneState, unitHp } from "../state.ts";
import type { Ctx } from "../state.ts";
import type { Action, GameEvent, GameState, Unit } from "../types.ts";
import type { Ai } from "./greedy.ts";

/** 耐久 the AI keeps after paying 1 for 霊力 (it pays only from this much). */
export const TANSU_MANA_MIN_HP = 3;

/** The AI's pick for one 古箪笥 tm07b attack. */
export const tansuAttackChoice = (ctx: Ctx, s: GameState, u: Unit): "tansuMana" | "tansuDraw" => {
  const ps = s.players[u.owner];
  if (unitHp(ctx, u) < TANSU_MANA_MIN_HP || ps.mana >= ctx.cfg.manaCap) return "tansuDraw";
  const need = ps.mana + 1;
  const short = ps.hand.some((id) => {
    const card = cardOf(ctx.pack, id);
    const cost = card.kind === "shikigami" ? baseSummonCost(ctx, card) : card.summonCost;
    return cost === need;
  });
  return short ? "tansuMana" : "tansuDraw";
};

/** The 古箪笥 attacks the rule takes now, applied to `s` in place and returned in order. */
const takeTansu = (ctx: Ctx, s: GameState, sink: GameEvent[]): Action[] => {
  const out: Action[] = [];
  const own = s.units.filter((u) => u.owner === s.turnPlayer && hasTansuAttack(ctx, u)).map((u) => u.uid);
  for (const uid of own) {
    if (s.ended) break;
    const u = s.units.find((x) => x.uid === uid);
    if (u === undefined) continue;
    const a: Action = { kind: "attack", uid, targetUid: null, variant: tansuAttackChoice(ctx, s, u) };
    if (!isLegal(ctx, s, a)) continue;
    applyActionInPlace(ctx, s, a, sink);
    out.push(a);
  }
  return out;
};

/** Wraps a planner so its plans include the 古箪笥 tm07b attacks the rule takes. */
export const withTansuPolicy = <T extends Ai>(ai: T): T => ({
  ...ai,
  planTurn: (ctx: Ctx, s: GameState): Action[] => {
    if (!ctx.cfg.effects) return ai.planTurn(ctx, s);
    const sink: GameEvent[] = [];
    const cur = cloneState(s);
    const out = takeTansu(ctx, cur, sink);
    if (cur.ended) return [...out, { kind: "pass" }];
    for (const a of ai.planTurn(ctx, cur)) {
      if (a.kind === "pass" || cur.ended || !isLegal(ctx, cur, a)) break;
      applyActionInPlace(ctx, cur, a, sink);
      out.push(a);
      if (a.kind === "summon" || a.kind === "inherit") out.push(...takeTansu(ctx, cur, sink));
    }
    out.push({ kind: "pass" });
    return out;
  },
});
