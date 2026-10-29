// 10/26案「召喚攻撃は召喚してすぐだけ」 (summonAttackTiming "right_after"):
// a unit summoned (or inherit-summoned) this turn may attack only as the very
// next action. Any other action in between - another summon, another unit's
// command, a reigu, even turning the summoned unit itself - and it may not
// attack this turn. Units summoned on earlier turns (再攻撃) are not touched.
// "any_time" (the default, and every ruleset up to 10/7決定) keeps the old rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG_SCHEMA } from "../src/config-schema.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { DEFAULT_RULE_PRESET, OFFERED_RULE_IDS, presetConfig, RULE_PRESET_IDS, RULE_PRESETS } from "../src/presets.ts";
import { applyAction, isLegal, legalActions } from "../src/rules.ts";
import { cloneState } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import { endTurn, startTurn } from "../src/turn.ts";
import { defaultConfig } from "../src/types.ts";
import type { Action, Config, GameEvent, GameState } from "../src/types.ts";
import { blankState, mkCtx, place } from "./helpers.ts";

const P13 = loadPack(packPath("adopted-1013"));
const ctxOf = (timing: Config["summonAttackTiming"], over: Partial<Config> = {}): Ctx =>
  mkCtx({ effects: true, inheritSummon: true, summonAttackTiming: timing, ...over }, P13);

const attacksBy = (ctx: Ctx, s: GameState, uid: number): Action[] =>
  legalActions(ctx, s).filter((a) => a.kind === "attack" && a.uid === uid);

/** Player 0 summons 影鬼 at (1,0) facing the enemy 影鬼 at (1,1); returns the state and the new uid. */
const summonFacingFoe = (ctx: Ctx, s: GameState): { state: GameState; uid: number } => {
  s.players[0].hand = ["ac03", ...s.players[0].hand];
  const a = legalActions(ctx, s).find(
    (x) => x.kind === "summon" && x.handIndex === 0 && x.pos.x === 1 && x.pos.y === 0 && attacksAfter(ctx, s, x),
  );
  assert.ok(a !== undefined, "a summon that can attack at once");
  const r = applyAction(ctx, s, a);
  return { state: r.state, uid: r.state.nextUid - 1 };
};
const attacksAfter = (ctx: Ctx, s: GameState, a: Action): boolean => {
  const r = applyAction(ctx, s, a);
  return attacksBy(ctx, r.state, r.state.nextUid - 1).length > 0;
};

/** Enemy 影鬼 in the middle, an own 影鬼 (summoned earlier) at (0,1) with the enemy beside it. */
const board = (ctx: Ctx): { s: GameState; veteran: number } => {
  const s = blankState(ctx, 30);
  place(s, "ac03", 1, 1, 1, 0);
  const veteran = place(s, "ac03", 0, 0, 1, 1);
  return { s, veteran };
};

const firstRotate = (ctx: Ctx, s: GameState, uid: number): Action => {
  const a = legalActions(ctx, s).find((x) => x.kind === "rotate" && x.uid === uid);
  assert.ok(a !== undefined, `a rotate of ${uid}`);
  return a;
};

// ------------------------------------------------------------- presets

test("1026案: r1026 is 10/7決定 + right_after, the default and first offered; older rulesets keep any_time", () => {
  assert.equal(defaultConfig().summonAttackTiming, "any_time");
  assert.equal(DEFAULT_RULE_PRESET, "r1026");
  assert.equal(RULE_PRESET_IDS[0], "r1026");
  assert.equal(OFFERED_RULE_IDS[0], "r1026");
  assert.ok(OFFERED_RULE_IDS.includes("r1007"), "10/7決定 stays selectable");
  assert.equal(RULE_PRESETS.r1026.label, "10/26案");
  assert.equal(RULE_PRESETS.r1026.defaultPack, RULE_PRESETS.r1007.defaultPack);
  assert.deepEqual(presetConfig("r1026"), { ...presetConfig("r1007"), summonAttackTiming: "right_after" });
  for (const id of RULE_PRESET_IDS) if (id !== "r1026") assert.equal(presetConfig(id).summonAttackTiming, "any_time", id);
  const f = CONFIG_SCHEMA.find((x) => x.key === "summonAttackTiming");
  assert.ok(f !== undefined && f.kind === "choice");
});

// ------------------------------------------------------------- the rule

test("right_after: the summoned unit may attack as the very next action", () => {
  const ctx = ctxOf("right_after");
  const { state, uid } = summonFacingFoe(ctx, board(ctx).s);
  const atk = attacksBy(ctx, state, uid);
  assert.ok(atk.length > 0);
  assert.ok(isLegal(ctx, state, atk[0]));
  const r = applyAction(ctx, state, atk[0]);
  assert.ok(r.events.some((e: GameEvent) => e.t === "attack"));
});

test("right_after: another unit's command in between ends the summon attack; the veteran's 再攻撃 is untouched", () => {
  const ctx = ctxOf("right_after");
  const { s, veteran } = board(ctx);
  const { state, uid } = summonFacingFoe(ctx, s);
  const keep = attacksBy(ctx, state, uid)[0];
  // the veteran (summoned on an earlier turn) attacks first
  const vAtk = attacksBy(ctx, state, veteran);
  assert.ok(vAtk.length > 0, "a 再攻撃 is open even right after a summon");
  const after = applyAction(ctx, state, vAtk[0]).state;
  if (after.units.some((u) => u.uid === uid) && after.units.some((u) => u.owner === 1)) {
    assert.deepEqual(attacksBy(ctx, after, uid), []);
    assert.equal(isLegal(ctx, after, keep), false);
  }
  // turning the veteran instead also ends it
  const turned = applyAction(ctx, state, firstRotate(ctx, state, veteran)).state;
  assert.deepEqual(attacksBy(ctx, turned, uid), []);
  assert.equal(isLegal(ctx, turned, keep), false);
  // and the veteran may still attack after anything (here: another summon)
  const s3 = cloneState(state);
  s3.players[0].hand = ["ac01"];
  const summon3 = legalActions(ctx, s3).find((a) => a.kind === "summon");
  assert.ok(summon3 !== undefined);
  assert.ok(attacksBy(ctx, applyAction(ctx, s3, summon3).state, veteran).length > 0);
});

test("right_after: turning the summoned unit itself, or a second summon, also ends it", () => {
  const ctx = ctxOf("right_after");
  const { state, uid } = summonFacingFoe(ctx, board(ctx).s);
  const facing = state.units.find((u) => u.uid === uid)!.facing;
  const self = applyAction(ctx, state, firstRotate(ctx, state, uid)).state;
  // face the enemy again by hand (as if it had turned twice): still no attack
  self.units.find((u) => u.uid === uid)!.facing = facing;
  self.units.find((u) => u.uid === uid)!.rotatedThisTurn = false;
  assert.deepEqual(attacksBy(ctx, self, uid), []);

  const s2 = cloneState(state);
  s2.players[0].hand = ["ac01"];
  const summon2 = legalActions(ctx, s2).find((a) => a.kind === "summon");
  assert.ok(summon2 !== undefined);
  const two = applyAction(ctx, s2, summon2).state;
  assert.deepEqual(attacksBy(ctx, two, uid), []);
});

test("right_after: the window survives cloneState; the summoned unit attacks normally next turn", () => {
  const ctx = ctxOf("right_after");
  const { state, uid } = summonFacingFoe(ctx, board(ctx).s);
  assert.ok(attacksBy(ctx, cloneState(state), uid).length > 0);
  const turned = applyAction(ctx, state, firstRotate(ctx, state, uid)).state;
  const t = cloneState(turned);
  const ev: GameEvent[] = [];
  endTurn(ctx, t, ev);
  startTurn(ctx, t, ev);
  endTurn(ctx, t, ev);
  startTurn(ctx, t, ev);
  assert.equal(t.turnPlayer, 0);
  t.players[0].mana = 30;
  const u = t.units.find((x) => x.uid === uid)!;
  u.facing = 0;
  assert.ok(attacksBy(ctx, t, uid).length > 0, "a 再攻撃 on the next own turn");
});

test("right_after: 継承召喚 is a summon too: attack at once or not this turn", () => {
  const ctx = ctxOf("right_after");
  const { s, veteran } = board(ctx);
  s.players[0].hand = ["ac06", "ac07", "ac08", "ac09", "ac12", "ac14"];
  const inh = legalActions(ctx, s).find(
    (a) => a.kind === "inherit" && a.targetUid === veteran && attacksAfter(ctx, s, a),
  );
  assert.ok(inh !== undefined, "an inherit-summon onto the veteran that can attack");
  const r = applyAction(ctx, s, inh).state;
  const fresh = r.nextUid - 1;
  assert.ok(attacksBy(ctx, r, fresh).length > 0);
  const other = place(r, "ac01", 0, 2, 2, 0);
  void other;
  const turned = applyAction(ctx, r, firstRotate(ctx, r, other)).state;
  assert.deepEqual(attacksBy(ctx, turned, fresh), []);
});

test("any_time (10/7決定 and older): the summoned unit may still attack after other actions", () => {
  const ctx = ctxOf("any_time");
  const { s, veteran } = board(ctx);
  const { state, uid } = summonFacingFoe(ctx, s);
  const turned = applyAction(ctx, state, firstRotate(ctx, state, veteran)).state;
  assert.ok(attacksBy(ctx, turned, uid).length > 0);
});

test("right_after works with 召喚したら必ず攻撃 (the forced attack is that very next action)", () => {
  const ctx = ctxOf("right_after", { summonAttackForced: true });
  const { state, uid } = summonFacingFoe(ctx, board(ctx).s);
  const all = legalActions(ctx, state);
  assert.ok(all.length > 0 && all.every((a) => a.kind === "attack" && a.uid === uid));
});
