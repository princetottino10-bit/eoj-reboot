// Command menu for the turn player's units: which commands a unit has, what
// they cost, whether they can be used right now and, if not, why. Built from
// the engine's legal-action list, so "enabled" can never disagree with the
// rules; the reasons only explain. Runs where the engine runs (the online
// server, or the local play page), never as a second rules copy.
// Pure: no node builtins.
import { turnFacing } from "./board.ts";
import { canAttack, cardOf } from "./cards.ts";
import { alliesInRange, attackCostFor, enemiesInRange, isAoeAttack } from "./combat.ts";
import { canUseVariant, fxOf, isProxyRotator, rotateCommandLocked } from "./effects.ts";
import { legalActions, rotateCostOf } from "./rules.ts";
import { isHidden } from "./state.ts";
import type { Ctx } from "./state.ts";
import type { Action, AttackVariant, GameState, PlayerId, Unit } from "./types.ts";

export type CommandId = "attack" | "konshin" | "regen" | "drink" | "heal" | "rotateLeft" | "rotateRight" | "proxyRotate";

export type CommandInfo = {
  id: CommandId;
  label: string;
  cost: number;
  enabled: boolean;
  /** Why the command cannot be used now; null when it can. */
  reason: string | null;
  /** Attack commands: an area attack needs no target choice. */
  area: boolean;
};

/** uid -> that unit's commands. Keys are uids as strings (JSON objects). */
export type UnitCommands = Record<string, CommandInfo[]>;

const LABEL: Record<CommandId, string> = {
  attack: "攻撃",
  konshin: "渾身",
  regen: "再生",
  drink: "飲酒",
  heal: "回復",
  rotateLeft: "回転(左)",
  rotateRight: "回転(右)",
  proxyRotate: "代理回転",
};

const short = (need: number, have: number): string => `霊力が足りない(あと${need - have})`;

const lockerName = (ctx: Ctx, s: GameState, p: PlayerId): string => {
  const u = s.units.find((x) => x.owner !== p && fxOf(ctx, x.cardId) === "tm17" && !isHidden(x));
  return u === undefined ? "相手の効果" : cardOf(ctx.pack, u.cardId).nameJa;
};

const attackReason = (ctx: Ctx, s: GameState, u: Unit, variant: AttackVariant): string => {
  const card = cardOf(ctx.pack, u.cardId);
  const mana = s.players[u.owner].mana;
  const cost = attackCostFor(ctx, u, variant);
  if (!canAttack(card)) return "攻撃手段がない";
  if (u.attackedThisTurn) return "攻撃済み";
  if (mana < cost) return short(cost, mana);
  if (variant === "heal") return alliesInRange(ctx, s, u).length === 0 ? "範囲内に味方がいない" : "今は使えない";
  return enemiesInRange(ctx, s, u).length === 0 ? "範囲内に敵がいない" : "今は使えない";
};

const rotateReason = (ctx: Ctx, s: GameState, u: Unit, proxy: boolean): string => {
  const mana = s.players[u.owner].mana;
  const cost = rotateCostOf(ctx, u);
  if (u.attackedThisTurn) return "攻撃済み(このターンは行動終了)";
  if (u.rotatedThisTurn) return "回転済み";
  if (!proxy && rotateCommandLocked(ctx, s, u.owner)) return `${lockerName(ctx, s, u.owner)}により回転不可`;
  if (mana < cost) return short(cost, mana);
  if (proxy) return "回せる式神がいない";
  return "今は使えない";
};

const variantOf = (a: Action): AttackVariant | null => (a.kind === "attack" ? (a.variant ?? "normal") : null);

/** The command menu of one unit of the turn player, given the legal list. */
export const unitCommands = (ctx: Ctx, s: GameState, u: Unit, legal: Action[]): CommandInfo[] => {
  const card = cardOf(ctx.pack, u.cardId);
  const mine = legal.filter((a) => "uid" in a && a.uid === u.uid);
  const hidden = isHidden(u) ? "隠れている(マヨヒガ)" : null;
  const out: CommandInfo[] = [];
  const push = (id: CommandId, cost: number, enabled: boolean, reason: () => string, area = false): void => {
    out.push({ id, label: LABEL[id], cost, enabled, reason: enabled ? null : (hidden ?? reason()), area });
  };
  const area = isAoeAttack(ctx, card);
  const variants: [CommandId, AttackVariant][] = [["attack", "normal"]];
  if (canUseVariant(ctx, u, "konshin")) variants.push(["konshin", "konshin"]);
  // paid variants (adopted 9/22): 再生 +1 / 飲酒 +2 on top of the attack cost
  if (canUseVariant(ctx, u, "regen")) variants.push(["regen", "regen"]);
  if (canUseVariant(ctx, u, "drink")) variants.push(["drink", "drink"]);
  if (canUseVariant(ctx, u, "heal")) variants.push(["heal", "heal"]);
  for (const [id, variant] of variants) {
    const enabled = mine.some((a) => variantOf(a) === variant);
    push(id, attackCostFor(ctx, u, variant), enabled, () => attackReason(ctx, s, u, variant), variant === "heal" ? false : area);
  }
  const rotCost = rotateCostOf(ctx, u);
  for (const [id, dir] of [["rotateLeft", -1], ["rotateRight", 1]] as [CommandId, 1 | -1][]) {
    const facing = turnFacing(u.facing, dir);
    const enabled = mine.some((a) => a.kind === "rotate" && a.facing === facing);
    push(id, rotCost, enabled, () => rotateReason(ctx, s, u, false));
  }
  if (isProxyRotator(ctx, u)) {
    push("proxyRotate", rotCost, mine.some((a) => a.kind === "proxyRotate"), () => rotateReason(ctx, s, u, true));
  }
  return out;
};

/** Commands for every unit of the turn player (hidden ones included, all disabled). */
export const commandsFor = (ctx: Ctx, s: GameState, legal: Action[] = legalActions(ctx, s)): UnitCommands => {
  const out: UnitCommands = {};
  if (s.ended) return out;
  for (const u of s.units) {
    if (u.owner !== s.turnPlayer) continue;
    out[String(u.uid)] = unitCommands(ctx, s, u, legal);
  }
  return out;
};
