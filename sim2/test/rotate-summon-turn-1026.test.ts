// 召喚したターンは回転できない (11/13 本人「前からそうだった」): a unit summoned
// (or inherit-summoned) this turn cannot take a rotate command that turn, its own
// or 玖龍街-style proxy turning. From its next turn it rotates as usual. Units
// summoned earlier are not touched. Config rotateOnSummonTurn: false in 10/26案;
// the older rulesets keep true (their records replay as they were).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG_SCHEMA } from "../src/config-schema.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig, RULE_PRESET_IDS } from "../src/presets.ts";
import { applyAction, isLegal, legalActions } from "../src/rules.ts";
import { endTurn, startTurn } from "../src/turn.ts";
import type { Action, Facing, GameEvent, GameState } from "../src/types.ts";
import { cloneState } from "../src/state.ts";
import { defaultConfig } from "../src/types.ts";
import { blankState, mkCtx, place } from "./helpers.ts";
import type { Ctx } from "../src/state.ts";

const P13 = loadPack(packPath("adopted-1013"));
const ctxOf = (rotateOnSummonTurn: boolean): Ctx =>
  mkCtx({ effects: true, inheritSummon: true, summonAttackTiming: "right_after", rotateOnSummonTurn }, P13);

const rotatesOf = (ctx: Ctx, s: GameState, uid: number): Action[] =>
  legalActions(ctx, s).filter((a) => (a.kind === "rotate" || a.kind === "proxyRotate") && a.uid === uid);

/** Player 0 summons 影鬼 into an empty corner; an own 影鬼 placed earlier stands at (0,0). */
const summoned = (ctx: Ctx): { state: GameState; uid: number; veteran: number } => {
  const s = blankState(ctx, 30);
  const veteran = place(s, "ac03", 0, 0, 0, 0);
  s.players[0].hand = ["ac03", ...s.players[0].hand];
  const a = legalActions(ctx, s).find((x) => x.kind === "summon" && x.handIndex === 0 && x.pos.x === 2 && x.pos.y === 2);
  assert.ok(a !== undefined);
  const r = applyAction(ctx, s, a);
  return { state: r.state, uid: r.state.nextUid - 1, veteran };
};

test("10/26案: no rotate on the summon turn; the older rulesets and the default config keep it", () => {
  assert.equal(defaultConfig().rotateOnSummonTurn, true);
  assert.equal(presetConfig("r1026").rotateOnSummonTurn, false);
  for (const id of RULE_PRESET_IDS) if (id !== "r1026") assert.equal(presetConfig(id).rotateOnSummonTurn, true, id);
  assert.ok(CONFIG_SCHEMA.some((d) => d.key === "rotateOnSummonTurn"), "the settings page offers it");
});

test("rotateOnSummonTurn false: the new unit cannot turn this turn, the veteran can", () => {
  const ctx = ctxOf(false);
  const { state, uid, veteran } = summoned(ctx);
  assert.deepEqual(rotatesOf(ctx, state, uid), []);
  const u = state.units.find((x) => x.uid === uid)!;
  const bad: Action = { kind: "rotate", uid, facing: ((u.facing + 1) % 4) as Facing };
  assert.equal(isLegal(ctx, state, bad), false);
  assert.ok(rotatesOf(ctx, state, veteran).length > 0);
});

test("rotateOnSummonTurn false: next own turn it turns as usual", () => {
  const ctx = ctxOf(false);
  const { state, uid } = summoned(ctx);
  const s = cloneState(state);
  const ev: GameEvent[] = [];
  endTurn(ctx, s, ev);
  startTurn(ctx, s, ev);
  endTurn(ctx, s, ev);
  startTurn(ctx, s, ev);
  assert.equal(s.turnPlayer, 0);
  assert.ok(rotatesOf(ctx, s, uid).length > 0);
});

test("rotateOnSummonTurn true: the old behaviour (turn right after the summon)", () => {
  const ctx = ctxOf(true);
  const { state, uid } = summoned(ctx);
  assert.ok(rotatesOf(ctx, state, uid).length > 0);
});
