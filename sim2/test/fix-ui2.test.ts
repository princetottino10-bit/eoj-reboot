// Fixes from the 2026-09-17 UI / online bug hunt (out/bughunt-ui/): a proposal
// is replaced only on purpose and the opponent is told; the answer notice and
// the pending proposal carry the server's time; log events carry the facing
// (家鳴り / 玖龍街) and the control threshold they were written with.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { createFlow, submit } from "../src/flow.ts";
import { legalActions } from "../src/rules.ts";
import { makeCtx } from "../src/state.ts";
import { presetConfig } from "../src/presets.ts";
import type { GameEvent, Unit } from "../src/types.ts";
import { encodeSettings } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import { parseClientInput } from "../online/protocol.ts";
import { boardView, logView } from "../online/view.ts";
import { settingsToCarry } from "../play/ai-store.ts";
import { describeEvent } from "../play/render.ts";
import { turnHtml } from "../play/hud.ts";
import { SK } from "./online-helpers.ts";
import { bothKeep, newApp, roomOf, seatTwo, send, testRecordDir, view } from "./online-api-helpers.ts";

const DIR = testRecordDir("fix-ui2");

test.after(() => {
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
});

const ROOM = { rule: "r0914", pack: "shuten-kyuryu", seat: "first" };

// --------------------------------------------------- proposals (10)

test("a proposal waiting for its answer is replaced only on purpose; the replacement says so and old answers are refused", () => {
  const s = seatTwo(newApp(DIR, { now: () => 1_700_000_000_000 }), ROOM);
  bothKeep(s);
  const owner = s.tokens[0];
  assert.equal(send(s, owner, { type: "propose", scope: "now", patch: { baseIncome: 4 } }).status, 200);
  const first = view(s, s.tokens[1]).room.proposal;
  assert.ok(first !== null);
  assert.equal(first.at, 1_700_000_000_000, "when it was made, by the server's clock");
  assert.equal(first.replaced, false);

  // a second proposal without naming the first: refused, the first stays as it is
  const blind = send(s, owner, { type: "propose", scope: "now", patch: { rotateCost: 2 } });
  assert.equal(blind.status, 409);
  assert.match(String(blind.json.error), /回答待ちの提案/);
  assert.equal(view(s, s.tokens[1]).room.proposal?.id, first.id);

  // naming a proposal that is not the pending one: refused as well
  assert.equal(send(s, owner, { type: "propose", scope: "now", patch: { rotateCost: 2 }, replaces: first.id + 5 }).status, 409);

  // an explicit replacement: taken, marked, and the old id no longer answers
  assert.equal(send(s, owner, { type: "propose", scope: "now", patch: { rotateCost: 2 }, replaces: first.id }).status, 200);
  const second = view(s, s.tokens[1]).room.proposal;
  assert.ok(second !== null && second.id !== first.id);
  assert.equal(second.replaced, true, "the other seat is told the contents changed");
  const late = send(s, s.tokens[1], { type: "answer", id: first.id, accept: true });
  assert.equal(late.status, 409);
  assert.match(String(late.json.error), /差し替え/);
  assert.equal(roomOf(s).match?.flow.ctx.cfg.baseIncome, 3, "the replaced proposal never applied");
  assert.equal(send(s, s.tokens[1], { type: "answer", id: second.id, accept: true }).status, 200);
  assert.equal(roomOf(s).match?.flow.ctx.cfg.rotateCost, 2);

  // nothing pending: `replaces` must not be sent (the page's idea of the room is stale)
  assert.equal(send(s, owner, { type: "propose", scope: "now", patch: { baseIncome: 4 }, replaces: second.id }).status, 409);
  assert.equal(send(s, owner, { type: "propose", scope: "now", patch: { baseIncome: 4 } }).status, 200);
  assert.equal(view(s, owner).room.proposal?.replaced, false);
});

test("the wire format: `replaces` is an optional proposal id", () => {
  const ok = parseClientInput({ type: "propose", scope: "now", patch: { baseIncome: 4 }, replaces: 3 });
  assert.ok(ok.ok && ok.value.type === "propose" && ok.value.replaces === 3);
  const none = parseClientInput({ type: "propose", scope: "now", patch: { baseIncome: 4 } });
  assert.ok(none.ok && none.value.type === "propose" && !("replaces" in none.value));
  assert.equal(parseClientInput({ type: "propose", scope: "now", patch: {}, replaces: "3" }).ok, false);
  assert.equal(parseClientInput({ type: "propose", scope: "now", patch: {}, replaces: 0 }).ok, false);
  const next = parseClientInput({ type: "propose", scope: "next", settings: { rule: "r0914", pack: "shuten-kyuryu", config: {}, cards: {} }, replaces: 2 });
  assert.ok(next.ok && next.value.type === "propose" && next.value.replaces === 2);
});

// ------------------------------------------------ log events (16, 17)

const unit = (uid: number, cardId: string, owner: 0 | 1, x: number, y: number, facing: 0 | 1 | 2 | 3): Unit => ({
  uid, cardId, owner, pos: { x, y }, facing, damage: 0, attackedThisTurn: false, rotatedThisTurn: false, summonedThisTurn: false, hiddenBy: null, atkBuff: 0,
});

test("家鳴り and the proxy rotate put the unit's facing on their effect event, and the per-viewer log keeps it", () => {
  const ctx = makeCtx(presetConfig("r0914"), SK);
  // seat 0 holds 家鳴り (sk18) with a unit of each side on the board
  const f = createFlow(ctx, 11, {
    prepare: (st) => {
      st.players[0].hand = ["sk18", ...st.players[0].hand.slice(1)];
      st.players[0].mana = 9;
      st.units.push(unit(1, "sk09", 0, 0, 0, 0), unit(2, "sk03", 1, 2, 2, 2));
      st.nextUid = 3;
    },
  });
  assert.ok(submit(f, 0, { type: "mulligan", indices: [] }).ok);
  assert.ok(submit(f, 1, { type: "mulligan", indices: [] }).ok);
  const reigu = legalActions(f.ctx, f.state).find((a) => a.kind === "reigu" && a.targetUid === 2 && a.facing === 1);
  assert.ok(reigu !== undefined, "家鳴り can turn the enemy unit to the right");
  assert.ok(submit(f, 0, { type: "action", action: reigu }).ok);
  const turned = f.log.map((l) => l.event).find((e): e is Extract<GameEvent, { t: "effect" }> => e.t === "effect" && e.text.includes("家鳴り"));
  assert.ok(turned !== undefined);
  assert.equal(turned.from, 2);
  assert.equal(turned.to, 1);
  // the same words live, after a reload and for a late joiner: the facing comes from the event
  const line = describeEvent(f.ctx, ["あなた", "相手"], turned);
  assert.equal(line?.text, "★ 家鳴り: 影鬼 を回転 → 右向き");
  const sent = logView(f.log, null).map((l) => l.event).find((e) => e.t === "effect" && e.text.includes("家鳴り"));
  assert.deepEqual(sent, turned, "from / to pass the whitelist");
});

test("control events carry the threshold and hold mode of their moment; the log line keeps them after a rule change", () => {
  const cfg = { ...presetConfig("r0914"), controlWin: 2 };
  const ctx = makeCtx(cfg, SK);
  const f = createFlow(ctx, 5, {
    prepare: (st) => {
      st.units.push(unit(1, "sk09", 0, 0, 0, 0), unit(2, "sk03", 0, 2, 0, 0));
      st.nextUid = 3;
    },
  });
  assert.ok(submit(f, 0, { type: "mulligan", indices: [] }).ok);
  assert.ok(submit(f, 1, { type: "mulligan", indices: [] }).ok);
  assert.ok(submit(f, 0, { type: "action", action: { kind: "pass" } }).ok);
  if (f.phase.kind === "discard") assert.ok(submit(f, 0, { type: "discard", indices: [] }).ok);
  const gain = f.log.map((l) => l.event).find((e): e is Extract<GameEvent, { t: "control" }> => e.t === "control" && e.change === "gain");
  assert.ok(gain !== undefined, "two cells at turn end is the control state under controlWin 2");
  assert.equal(gain.need, 2);
  assert.equal(gain.hold, cfg.controlHold);
  const before = describeEvent(f.ctx, ["あなた", "相手"], gain)?.text;
  assert.ok(before !== undefined && before.includes("2マス"), before);
  assert.ok(submit(f, 1, { type: "config", patch: { controlWin: 7 } }).ok);
  assert.equal(f.ctx.cfg.controlWin, 7);
  assert.equal(describeEvent(f.ctx, ["あなた", "相手"], gain)?.text, before, "an old line does not take the new threshold");
  const sent = logView(f.log, 0).map((l) => l.event).find((e) => e.t === "control" && e.change === "gain");
  assert.deepEqual(sent, gain, "need / hold pass the whitelist");
});

// ------------------------------------------------- start card rules (14)

test("a new game uses the rules last chosen on the start card, not the resumed match's", () => {
  const started: GameSettings = { rule: "r0914", pack: "shuten-kyuryu", config: {}, cards: {} };
  const inForce: GameSettings = { ...started, config: { controlWin: 1 } };
  const edited: GameSettings = { ...started, config: { handRefill: 6 } };
  // the card still shows what the match started with: the match's rules (mid-game changes included) carry over
  assert.equal(settingsToCarry(encodeSettings(started), started, inForce), encodeSettings(inForce));
  // the card was edited after the match started (then 続きから): the edit is kept
  assert.equal(settingsToCarry(encodeSettings(edited), started, inForce), encodeSettings(edited));
  // an unreadable card falls back to the match's rules
  assert.equal(settingsToCarry("***", started, inForce), encodeSettings(inForce));
});

// ---------------------------------------------------- turn chip (15)

test("a finished match shows no 制圧中 badges on the turn chip", () => {
  const ctx = makeCtx(presetConfig("r0914"), SK);
  const f = createFlow(ctx, 3);
  f.state.players[0].reach = true;
  f.state.players[1].reach = true;
  const live = turnHtml(ctx, boardView(f.state), ["あなた", "相手"], { phaseText: "行動中" });
  assert.equal((live.match(/turn-ctl /g) ?? []).length, 2, "both badges while the match runs");
  f.state.ended = true;
  f.state.winner = 0;
  f.state.winType = "control";
  const over = turnHtml(ctx, boardView(f.state), ["あなた", "相手"], { phaseText: "対局終了" });
  assert.equal((over.match(/turn-ctl /g) ?? []).length, 0);
  assert.match(over, /対局終了/);
});
