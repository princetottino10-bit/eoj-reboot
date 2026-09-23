// Changing rule variables or cards in the middle of a match (DESIGN-UI-V2
// Sec.2.2). The change takes effect from the next input; past results stay as
// they are.
// Only state that a cap would otherwise leave inconsistent is adjusted:
//   - a unit whose effective max HP went DOWN is cut to the new max
//   - a unit whose effective max HP went UP keeps its current HP
//   - a change never destroys a unit: current HP is kept at 1 or more
//   - mana above a lowered mana cap is cut to the cap
// Pure: no node builtins.
import { applyCardOverrides, cardChanges } from "./card-overrides.ts";
import type { CardChange, CardOverrides } from "./card-overrides.ts";
import { applyConfigPatch, configChanges } from "./config-schema.ts";
import type { ConfigChange, ConfigPatch } from "./config-schema.ts";
import { makeCtx, unitMaxHp } from "./state.ts";
import type { Ctx } from "./state.ts";
import type { GameState } from "./types.ts";

export type RuleChangeResult = { ctx: Ctx; changes: ConfigChange[] };

/**
 * Applies `patch` (already validated) and returns the new context. Mutates
 * `s` only for the HP / mana adjustments listed above. The old context and
 * its Config object are not modified.
 */
export const applyRuleChange = (ctx: Ctx, s: GameState, patch: ConfigPatch): RuleChangeResult => {
  const cfg = applyConfigPatch(ctx.cfg, patch);
  const next = makeCtx(cfg, ctx.pack);
  keepHpConsistent(ctx, next, s);
  for (const ps of s.players) ps.mana = Math.min(ps.mana, cfg.manaCap);
  return { ctx: next, changes: configChanges(ctx.cfg, cfg) };
};

export type CardChangeResult = { ctx: Ctx; changes: CardChange[] };

/**
 * Applies card edits (already validated against ctx.pack; values replace the
 * current ones) and returns the new context. Units already on the board take
 * the new numbers, range and attribute at once; their HP follows the same rule
 * as a max HP change (cut when the max goes down, kept when it goes up, never
 * destroyed).
 */
export const applyCardChange = (ctx: Ctx, s: GameState, edits: CardOverrides): CardChangeResult => {
  const changes = cardChanges(ctx.pack, edits);
  const next = makeCtx(ctx.cfg, applyCardOverrides(ctx.pack, edits));
  keepHpConsistent(ctx, next, s);
  return { ctx: next, changes };
};

/** HP of every unit after its effective max HP moved from `before` to `after`. */
const keepHpConsistent = (before: Ctx, after: Ctx, s: GameState): void => {
  for (const u of s.units) {
    const oldMax = unitMaxHp(before, u);
    const newMax = unitMaxHp(after, u);
    if (oldMax === newMax) continue;
    const oldHp = oldMax - u.damage;
    const cut = newMax < oldMax ? Math.min(oldHp, newMax) : oldHp;
    const hp = Math.max(1, cut);
    u.damage = newMax - hp;
  }
};
