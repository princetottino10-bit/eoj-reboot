// Play UI: server routing/type-stripping, and the engine flow the UI drives.
// The UI itself contains no rules logic, so exercising these engine calls in
// the same order is what "one turn through the UI" means.
import test from "node:test";
import assert from "node:assert/strict";
import { createPlayServer, serve } from "../play/server.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { makeCtx, createGame, occupied, unitByUid } from "../src/state.ts";
import { applyActionInPlace, isLegal, legalActions } from "../src/rules.ts";
import { checkRoundLimit, endTurn, startTurn, defaultDiscardPolicy } from "../src/turn.ts";
import { makeGreedy } from "../src/ai/greedy.ts";
import { profileWeights } from "../src/ai/eval.ts";
import { defaultConfig } from "../src/types.ts";
import type { Action, Facing, GameEvent } from "../src/types.ts";
import { allCells } from "../src/board.ts";

const TM = loadPack(packPath("tsukumo-miyako"));

test("server serves index.html at /", async () => {
  const r = await serve("/");
  assert.equal(r.code, 200);
  assert.match(r.type, /text\/html/);
  assert.match(r.body, /<title>陰陽符陣/);
  assert.match(r.body, /src="\/play\/ui\.ts"/);
});

test("server strips types from .ts and serves it as JavaScript", async () => {
  const r = await serve("/src/rules.ts");
  assert.equal(r.code, 200);
  assert.equal(r.type, "text/javascript; charset=utf-8");
  assert.ok(!r.body.includes("import type"), "type-only imports must be gone");
  assert.ok(!/:\s*GameState/.test(r.body), "type annotations must be gone");
  assert.ok(r.body.includes('from "./cards.ts"'), "import specifiers stay resolvable");
  assert.ok(r.body.includes("export const legalActions"));
});

test("server serves the pack JSON and refuses anything else", async () => {
  const ok = await serve("/data/pack-tsukumo-miyako.json");
  assert.equal(ok.code, 200);
  assert.equal(JSON.parse(ok.body).cards.length, 22);
  for (const bad of [
    "/../package.json",
    "/src/../../package.json",
    "/etc/passwd",
    "/DESIGN.md",
    "/src/nope.ts",
  ]) {
    assert.equal((await serve(bad)).code, 404, bad);
  }
});

test("server answers over http", async () => {
  const server = createPlayServer();
  await new Promise<void>((r) => server.listen(0, () => r()));
  const addr = server.address();
  assert.ok(addr !== null && typeof addr === "object");
  const base = `http://127.0.0.1:${addr.port}`;
  try {
    const html = await fetch(`${base}/`);
    assert.equal(html.status, 200);
    assert.match(await html.text(), /陰陽符陣/);
    const js = await fetch(`${base}/play/ui.ts`);
    assert.equal(js.headers.get("content-type"), "text/javascript; charset=utf-8");
    assert.ok(!(await js.text()).includes("import type"));
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("UI flow: human turn via engine APIs, then an AI turn", () => {
  const ctx = makeCtx({ ...defaultConfig(), chipMode: "catch_up" }, TM);
  const state = createGame(ctx, 20260830);
  const events: GameEvent[] = [];
  const ai = makeGreedy(profileWeights("territorial"));
  const humanSeat = 0;

  // --- turn begins exactly as advance() does
  assert.equal(checkRoundLimit(ctx, state, events), false);
  startTurn(ctx, state, events);
  assert.equal(state.ended, false);
  assert.equal(state.turnPlayer, humanSeat);
  assert.equal(state.players[0].mana, 3, "no income on the very first turn");

  // --- the hand-click path: find a summonable card, then its legal cells
  const hand = state.players[humanSeat].hand;
  let handIndex = -1;
  let placement: Action | null = null;
  for (let i = 0; i < hand.length && placement === null; i++) {
    for (const pos of allCells()) {
      for (const f of [0, 1, 2, 3] as Facing[]) {
        const a: Action = { kind: "summon", handIndex: i, pos, facing: f };
        if (isLegal(ctx, state, a)) {
          handIndex = i;
          placement = a;
          break;
        }
      }
      if (placement !== null) break;
    }
  }
  assert.ok(placement !== null, "the opening hand must offer a summon");
  assert.ok(handIndex >= 0);

  const manaBefore = state.players[humanSeat].mana;
  applyActionInPlace(ctx, state, placement, events);
  assert.equal(occupied(state, humanSeat), 1);
  assert.ok(state.players[humanSeat].mana < manaBefore, "the summon was paid for");
  const fresh = state.units[state.units.length - 1];
  assert.ok(unitByUid(state, fresh.uid) !== undefined);

  // the summon-attack offer the UI makes right after placing
  const summonAttacks = legalActions(ctx, state).filter(
    (a) => a.kind === "attack" && a.uid === fresh.uid,
  );
  assert.equal(summonAttacks.length, 0, "nothing to shoot on an empty board");

  // --- end turn with a human-chosen discard set
  const chosen = defaultDiscardPolicy(ctx, state, humanSeat);
  endTurn(ctx, state, events, () => chosen);
  const te = events.filter((e) => e.t === "turnEnd");
  assert.equal(te.length, 1);
  assert.equal(state.players[humanSeat].hand.length, ctx.cfg.handRefill);
  assert.equal(state.turnPlayer, 1, "the turn passed to the AI seat");

  // --- AI turn, applied one atomic action at a time as the UI animates it
  startTurn(ctx, state, events);
  const plan = ai.planTurn(ctx, state);
  assert.equal(plan[plan.length - 1].kind, "pass");
  let taken = 0;
  for (const a of plan) {
    if (a.kind === "pass") break;
    assert.ok(isLegal(ctx, state, a), "the AI plan stays legal while replayed");
    applyActionInPlace(ctx, state, a, events);
    taken += 1;
  }
  assert.ok(taken > 0, "the AI did something on its first turn");
  assert.ok(taken <= ctx.cfg.maxActionsPerTurn);
  endTurn(ctx, state, events);
  assert.equal(state.turnPlayer, humanSeat);
  assert.equal(state.round, 2);
  assert.ok(events.some((e) => e.t === "summon" && e.player === 1));
});

test("a custom discard chooser overrides the default policy", () => {
  const ctx = makeCtx(defaultConfig(), TM);
  const state = createGame(ctx, 7);
  const events: GameEvent[] = [];
  const before = state.players[0].hand.slice();
  endTurn(ctx, state, events, () => [0]);
  assert.equal(state.players[0].grave[0], before[0]);
  assert.ok(!state.players[0].hand.includes(before[0]) || before.filter((c) => c === before[0]).length > 1);
  assert.equal(state.players[0].hand.length, ctx.cfg.handRefill);
});
