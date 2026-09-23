// DESIGN-UI-V2 Sec.4.1 tests 2-6 and 8 through the online API: settings at
// room creation, mid-match proposals and consent, between-match settings,
// the saved record with rule changes, and hidden information on the new paths.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createFlow } from "../src/flow.ts";
import type { Flow } from "../src/flow.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig } from "../src/presets.ts";
import { makeCtx } from "../src/state.ts";
import type { PlayerId } from "../src/types.ts";
import { packFor, replayRecord } from "../online/match.ts";
import type { MatchRecord } from "../online/match.ts";
import type { StateMessage } from "../online/protocol.ts";
import {
  bothKeep,
  call,
  flowOf,
  newApp,
  nextAiInput,
  roomOf,
  seatTwo,
  send,
  testRecordDir,
  view,
} from "./online-api-helpers.ts";
import type { Seated } from "./online-api-helpers.ts";
import { SPLIT_PACK, splitDeal } from "./online-helpers.ts";

const DIR = testRecordDir("config");

test.after(() => {
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
});

const app = () => newApp(DIR);

test("UI-V2 test 2: rooms with out-of-range settings are refused; valid settings reach the match", () => {
  const a = app();
  const base = { rule: "r0913", pack: "shuten-kyuryu", seat: "first", effects: true };
  for (const extra of [
    { config: { baseIncome: -1 } },
    { config: { maxHp: 0 } },
    { config: { startMana: [3, 99] } },
    { config: { boardCells: 4 } },
    { config: "baseIncome=4" },
    { cards: { sk03: { hp: 0 } } },
    { cards: { sk03: { atk: -1 } } },
    { cards: { nope: { hp: 3 } } },
    { cards: { sk19: { atk: 2 } } },
    { cards: { sk03: { attackRange: [{ x: 3, y: 0 }] } } },
    { cards: { sk03: { blindSpots: [{ x: 0, y: 1 }] } } },
    { cards: { sk18: { attackRange: [{ x: 0, y: 1 }] } } },
  ]) {
    const r = call(a, "POST", "/api/rooms", { ...base, ...extra }, undefined, `1.0.0.${Math.random()}`);
    assert.equal(r.status, 400, JSON.stringify(extra));
    assert.equal(r.json.ok, false);
  }
  const s = seatTwo(a, { config: { baseIncome: 4, counterMode: "all" }, cards: { sk03: { hp: 4 } }, effects: false });
  const v = view(s, s.tokens[1]);
  assert.equal(v.room.settings.config.baseIncome, 4);
  assert.equal(v.room.settings.config.effects, false, "effects=false folded into the settings");
  assert.equal(v.room.effects, false);
  assert.deepEqual(v.room.settings.cards, { sk03: { hp: 4 } });
  assert.equal(v.game?.config.baseIncome, 4);
  assert.equal(v.game?.config.counterMode, "all");
  assert.deepEqual(v.game?.cards, { sk03: { hp: 4 } });
  assert.equal(flowOf(s).ctx.pack.byId.get("sk03")?.hp, 4);
  assert.equal(v.room.owner, 0);
  // a no-op override is dropped, so the "changed" count stays honest
  const t = seatTwo(a, { config: { baseIncome: 3 }, cards: { sk03: { hp: 2 } } });
  assert.deepEqual(view(t, t.tokens[0]).room.settings, { rule: "r0913", pack: "shuten-kyuryu", config: {}, cards: {} });
  // the current rules and a painted range travel through the room into the match
  const range = [{ x: 0, y: 2 }, { x: -1, y: 1 }];
  const r = seatTwo(a, { rule: "r0914", config: { killRewardBase: "full" }, cards: { sk03: { attackRange: range, attribute: "yang" } } });
  const rv = view(r, r.tokens[1]);
  assert.equal(rv.game?.config.taijiDiscount, 1);
  assert.equal(rv.game?.config.killRewardBase, "full");
  assert.deepEqual(flowOf(r).ctx.pack.byId.get("sk03")?.attackRange, [{ x: -1, y: 1 }, { x: 0, y: 2 }].sort((p, q) => q.y - p.y || p.x - q.x));
  assert.equal(flowOf(r).ctx.pack.byId.get("sk03")?.attribute, "yang");
});

test("UI-V2 test 2/3: mid-match proposals are validated; start-only variables and broken card edits are refused", () => {
  const s = seatTwo(app());
  bothKeep(s);
  const owner = s.tokens[0];
  const bad: [Record<string, unknown>, number][] = [
    [{ type: "propose", scope: "now", patch: { maxHp: 0 } }, 400],
    [{ type: "propose", scope: "now", patch: { baseIncome: 99 } }, 400],
    [{ type: "propose", scope: "now", patch: { startLife: 20 } }, 400],
    [{ type: "propose", scope: "now", patch: { startMana: [4, 4] } }, 400],
    [{ type: "propose", scope: "now", patch: { mulligan: false } }, 400],
    [{ type: "propose", scope: "now", patch: {}, cards: { sk03: { hp: 0 } } }, 400],
    [{ type: "propose", scope: "now", patch: {}, cards: { sk99: { hp: 3 } } }, 422],
    [{ type: "propose", scope: "now", patch: {}, cards: { sk03: { blindSpots: [{ x: 0, y: 1 }] } } }, 422],
    [{ type: "propose", scope: "now", patch: { baseIncome: 3 }, cards: { sk03: { hp: 2 } } }, 422],
    [{ type: "propose", scope: "now", patch: { baseIncome: 3 } }, 422],
    [{ type: "cards", edits: { sk03: { hp: 4 } } }, 400],
    [{ type: "propose", scope: "next", settings: { rule: "r0913", pack: "shuten-kyuryu", config: {}, cards: {} } }, 409],
    [{ type: "propose", scope: "sometime", patch: {} }, 400],
    [{ type: "config", patch: { baseIncome: 4 } }, 400],
  ];
  for (const [body, status] of bad) {
    const r = send(s, owner, body);
    assert.equal(r.status, status, JSON.stringify(body));
  }
  assert.equal(send(s, s.tokens[1], { type: "propose", scope: "now", patch: { baseIncome: 4 } }).status, 403, "only the owner proposes");
  const spec = call(s.app, "POST", `/api/rooms/${s.code}/join`, { spectate: true }).json.token as string;
  assert.equal(send(s, spec, { type: "propose", scope: "now", patch: { baseIncome: 4 } }).status, 403);
  assert.equal(roomOf(s).proposal, null);
  assert.equal(flowOf(s).ctx.cfg.baseIncome, 3);
  assert.ok(!flowOf(s).log.some((e) => e.event.t === "config"));
});

test("UI-V2 test 4: a mid-match change waits for the opponent's consent, then applies from the next input", () => {
  const s = seatTwo(app());
  bothKeep(s);
  const f = flowOf(s);
  assert.equal(send(s, s.tokens[0], { type: "propose", scope: "now", patch: { baseIncome: 4 } }).status, 200);
  const pending = view(s, s.tokens[1]).room.proposal;
  assert.ok(pending !== null && pending.scope === "now");
  assert.deepEqual(pending.patch, { baseIncome: 4 });
  assert.equal(f.ctx.cfg.baseIncome, 3, "not applied before consent");
  assert.equal(view(s, s.tokens[0]).game?.config.baseIncome, 3);
  assert.equal(send(s, s.tokens[0], { type: "answer", id: pending.id, accept: true }).status, 403, "the proposer cannot agree to it");
  assert.equal(send(s, s.tokens[1], { type: "answer", id: pending.id + 1, accept: true }).status, 409, "stale id");

  // declined: nothing changes
  assert.equal(send(s, s.tokens[1], { type: "answer", id: pending.id, accept: false }).status, 200);
  assert.equal(view(s, s.tokens[0]).room.proposal, null);
  assert.equal(f.ctx.cfg.baseIncome, 3);

  // proposed again and accepted: effective at once, logged for everybody
  assert.equal(send(s, s.tokens[0], { type: "propose", scope: "now", patch: { baseIncome: 4 } }).status, 200);
  const again = view(s, s.tokens[1]).room.proposal;
  assert.ok(again !== null);
  const manaBefore = f.state.players[0].mana;
  assert.equal(send(s, s.tokens[1], { type: "answer", id: again.id, accept: true }).status, 200);
  assert.equal(f.ctx.cfg.baseIncome, 4);
  assert.equal(f.state.players[0].mana, manaBefore, "past results are not recomputed");
  for (const token of s.tokens) {
    const v = view(s, token);
    assert.equal(v.game?.config.baseIncome, 4);
    const line = v.log.find((l) => l.event.t === "config");
    assert.ok(line !== undefined && line.event.t === "config");
    assert.deepEqual(line.event.changes, [{ key: "baseIncome", from: 3, to: 4 }]);
    assert.equal(v.room.proposal, null);
  }
  // r0913 pays income at turn end: 3 (turn-1 mana) + 4 (new income, 0 chips)
  assert.equal(send(s, s.tokens[0], { type: "action", action: { kind: "pass" } }).status, 200);
  assert.equal(send(s, s.tokens[0], { type: "discard", indices: [] }).status, 200);
  assert.equal(f.state.players[0].mana, 3 + 4);
  const last = f.inputs.filter((x) => x.input.type === "config");
  assert.equal(last.length, 1, "the agreed change is one recorded input");
  assert.equal(last[0].seat, 0, "recorded under the proposing seat");
});

/** Plays the room's match to the end with greedy inputs; `hook` runs before each. */
const playRoom = (s: Seated, hook?: (step: number) => void): void => {
  const perTurn = { key: "", n: 0 };
  for (let i = 0; i < 4000; i++) {
    if (hook !== undefined) hook(i);
    const next = nextAiInput(flowOf(s), perTurn);
    if (next === null) return;
    const r = send(s, s.tokens[next[0]], next[1]);
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }
  throw new Error("match did not finish");
};

const agree = (s: Seated, patch: object, cards?: object): void => {
  assert.equal(send(s, s.tokens[0], { type: "propose", scope: "now", patch, cards }).status, 200, JSON.stringify({ patch, cards }));
  const id = roomOf(s).proposal?.id ?? -1;
  assert.equal(send(s, s.tokens[1], { type: "answer", id, accept: true }).status, 200);
};

test("UI-V2 test 5 and 6: a saved record with rule changes and card overrides replays identically", () => {
  const s = seatTwo(app(), { cards: { sk05: { hp: 5 }, sk16: { atk: 5, summonCost: 5 } } });
  const pristine = JSON.stringify(loadPack(packPath("shuten-kyuryu")).cards);
  playRoom(s, (i) => {
    if (i === 12) agree(s, { baseIncome: 4, maxHp: 9 });
    if (i === 40 && flowOf(s).phase.kind !== "over") agree(s, { counterMode: "all", attackCostDelta: 1 });
    if (i === 25 && flowOf(s).phase.kind !== "over") agree(s, {}, { sk03: { attackRange: [{ x: 0, y: 2 }, { x: 0, y: 1 }], hp: 1 }, sk05: { hp: 3 } });
  });
  const m = roomOf(s).match;
  assert.ok(m !== null && m.recordPath !== null);
  const rec = JSON.parse(readFileSync(m.recordPath, "utf8")) as MatchRecord;
  assert.equal(rec.version, 2);
  assert.equal(rec.config.baseIncome, 3, "the record keeps the starting rules");
  assert.deepEqual(rec.cards, { sk05: { hp: 5 }, sk16: { atk: 5, summonCost: 5 } });
  assert.ok((rec.configChanges ?? []).length >= 1);
  assert.deepEqual(rec.configChanges?.[0].changes.map((c) => c.key), ["baseIncome", "maxHp"]);
  assert.ok((rec.cardChanges ?? []).length >= 1, "mid-match card changes are listed in the record");
  assert.deepEqual(rec.cardChanges?.[0].changes.map((c) => `${c.cardId}.${c.field}`), ["sk03.hp", "sk03.attackRange", "sk05.hp"]);
  const replayed = replayRecord(rec);
  assert.deepEqual(replayed.state, m.flow.state);
  assert.deepEqual(replayed.ctx.pack.byId.get("sk03"), m.flow.ctx.pack.byId.get("sk03"));
  assert.deepEqual(replayed.events, m.flow.events);
  assert.deepEqual(replayed.ctx.cfg, m.flow.ctx.cfg);
  // the printed pack in the server cache is untouched
  assert.equal(JSON.stringify(packFor("shuten-kyuryu").cards), pristine);
  assert.equal(packFor("shuten-kyuryu").byId.get("sk05")?.hp, 3);
  assert.equal(m.flow.ctx.pack.byId.get("sk05")?.hp, 3, "the mid-match change set it back to 3");
  assert.equal(m.flow.ctx.pack.byId.get("sk03")?.hp, 1);
});

test("mid-match card change: consent first, then units in play take the new card at once and every view shows it", () => {
  const s = seatTwo(app());
  bothKeep(s);
  const f = flowOf(s);
  const edits = { sk03: { attackRange: [{ x: 0, y: 2 }], atk: 4 } };
  assert.equal(send(s, s.tokens[0], { type: "propose", scope: "now", patch: { baseIncome: 4 }, cards: edits }).status, 200);
  const pending = view(s, s.tokens[1]).room.proposal;
  assert.ok(pending !== null && pending.scope === "now");
  assert.deepEqual(pending.cards, { sk03: { atk: 4, attackRange: [{ x: 0, y: 2 }] } });
  assert.equal(f.ctx.pack.byId.get("sk03")?.atk, 2, "not applied before consent");
  assert.equal(send(s, s.tokens[1], { type: "answer", id: pending.id, accept: true }).status, 200);
  assert.equal(f.ctx.cfg.baseIncome, 4);
  assert.equal(f.ctx.pack.byId.get("sk03")?.atk, 4);
  assert.deepEqual(f.ctx.pack.byId.get("sk03")?.attackRange, [{ x: 0, y: 2 }]);
  assert.deepEqual(packFor("shuten-kyuryu").byId.get("sk03")?.attackRange, [{ x: 0, y: 1 }], "the printed pack is untouched");
  for (const token of s.tokens) {
    const v = view(s, token);
    assert.deepEqual(v.game?.cards, { sk03: { atk: 4, attackRange: [{ x: 0, y: 2 }] } });
    const line = v.log.find((l) => l.event.t === "cards");
    assert.ok(line !== undefined && line.event.t === "cards");
    assert.deepEqual(line.event.changes.map((c) => `${c.label} ${c.from}→${c.to}`), ["ATK 2→4", "攻撃範囲 前(2)→前2(-2)"]);
  }
  assert.deepEqual(f.inputs.slice(-2).map((x) => x.input.type), ["config", "cards"], "one recorded input each, rules first");
  // a later proposal is judged against the cards now in play: asking for the same again changes nothing
  assert.equal(send(s, s.tokens[0], { type: "propose", scope: "now", patch: {}, cards: edits }).status, 422);
});

test("between matches: the owner proposes the next settings, the opponent agrees, the rematch uses them", () => {
  const s = seatTwo(app());
  playRoom(s);
  const next = { rule: "r0913", pack: "shuten-kyuryu", config: { baseIncome: 4, startLife: 12 }, cards: { sk03: { hp: 3 } } };
  assert.equal(send(s, s.tokens[1], { type: "rematch" }).status, 200);
  assert.equal(send(s, s.tokens[1], { type: "propose", scope: "next", settings: next }).status, 403, "only the owner");
  assert.equal(send(s, s.tokens[0], { type: "propose", scope: "next", settings: { ...next, cards: { sk99: { hp: 3 } } } }).status, 422);
  assert.equal(send(s, s.tokens[0], { type: "propose", scope: "next", settings: next }).status, 200);
  const v = view(s, s.tokens[1]);
  assert.deepEqual(v.room.rematch, [false, false], "a new proposal resets the rematch votes");
  assert.ok(v.room.proposal !== null && v.room.proposal.scope === "next");
  assert.deepEqual(v.room.settings.config, {}, "not applied before consent");
  assert.equal(send(s, s.tokens[1], { type: "answer", id: v.room.proposal.id, accept: true }).status, 200);
  assert.deepEqual(view(s, s.tokens[0]).room.settings.config, { baseIncome: 4, startLife: 12 });
  assert.equal(send(s, s.tokens[0], { type: "rematch" }).status, 200);
  assert.equal(send(s, s.tokens[1], { type: "rematch" }).status, 200);
  const g = view(s, s.tokens[0]);
  assert.equal(g.room.matchNo, 2);
  assert.equal(g.game?.config.startLife, 12);
  assert.equal(g.game?.board.players[0].life, 12);
  assert.deepEqual(g.game?.cards, { sk03: { hp: 3 } });
  assert.equal(g.room.owner, 1, "the owner follows the token when seats swap");
  assert.equal(send(s, s.tokens[0], { type: "propose", scope: "now", patch: { baseIncome: 5 } }).status, 200, "still the owner");
});

// ------------------------------------------------------ hidden information

const SEED = 987654321;

const secretIds = (f: Flow, p: PlayerId, revealed: Set<string>): string[] =>
  [...f.state.players[p].hand, ...f.state.players[p].deck].filter((id) => !revealed.has(id));

const assertClean = (blob: string, f: Flow, victim: PlayerId, revealed: Set<string>, where: string): void => {
  for (const id of secretIds(f, victim, revealed)) {
    assert.ok(!blob.includes(`"${id}"`), `${where}: ${id} of seat ${victim} leaked`);
  }
  assert.ok(!blob.includes(String(f.state.rngState)), `${where}: rngState value leaked`);
  assert.ok(!blob.includes(String(SEED)), `${where}: seed leaked`);
  assert.ok(!blob.includes("rngState") && !blob.includes('"seed"'), `${where}: rng / seed key present`);
  assert.ok(!/"deck"\s*:/.test(blob), `${where}: a deck array is present`);
};

test("UI-V2 test 8: proposals, consent and rule-change log lines leak no hand, deck, rng or seed", () => {
  const s = seatTwo(app());
  const spec = call(s.app, "POST", `/api/rooms/${s.code}/join`, { spectate: true }).json.token as string;
  const m = roomOf(s).match;
  assert.ok(m !== null);
  // swap in a flow on the split pack so every card id belongs to exactly one seat
  m.flow = createFlow(makeCtx(presetConfig("r0913"), SPLIT_PACK), SEED, { prepare: (st) => splitDeal(st) });
  const f = m.flow;
  const revealed = new Set<string>();
  const check = (where: string): void => {
    for (const u of f.state.units) revealed.add(u.cardId);
    for (const ps of f.state.players) for (const id of ps.grave) revealed.add(id);
    const blobs: [string, PlayerId][] = [
      [JSON.stringify(view(s, s.tokens[1])), 0],
      [JSON.stringify(view(s, s.tokens[0])), 1],
      [JSON.stringify(view(s, spec)), 0],
      [JSON.stringify(view(s, spec)), 1],
      [JSON.stringify(call(s.app, "GET", `/api/rooms/${s.code}`).json), 0],
      [JSON.stringify(call(s.app, "GET", `/api/rooms/${s.code}`).json), 1],
    ];
    for (const [blob, victim] of blobs) assertClean(blob, f, victim, revealed, where);
  };
  const patches = [
    { baseIncome: 4 }, { maxHp: 8 }, { handRefill: 6 }, { handMode: "replace_discarded" }, { manaCap: 12, rotateCost: 2 },
    { baseIncome: 3 }, { maxHp: 10 }, { handRefill: 5 }, { handMode: "refill_to_5" }, { manaCap: 15, rotateCost: 1 },
  ];
  let proposals = 0;
  const perTurn = { key: "", n: 0 };
  for (let i = 0; i < 4000; i++) {
    if (i % 5 === 2 && f.phase.kind !== "over") {
      const patch = patches[proposals % patches.length];
      const r = send(s, s.tokens[0], { type: "propose", scope: "now", patch });
      if (r.status === 200) {
        check(`step ${i} proposed`);
        const id = roomOf(s).proposal?.id ?? -1;
        // refusals carry no state either
        const refused = send(s, s.tokens[0], { type: "answer", id, accept: true });
        assertClean(JSON.stringify(refused.json), f, 1, revealed, `step ${i} refusal`);
        assert.equal(send(s, s.tokens[1], { type: "answer", id, accept: proposals % 3 !== 2 }).status, 200);
        check(`step ${i} answered`);
        proposals += 1;
      }
    }
    const next = nextAiInput(f, perTurn);
    if (next === null) break;
    assert.equal(send(s, s.tokens[next[0]], next[1]).status, 200);
    check(`step ${i}`);
  }
  assert.equal(f.phase.kind, "over");
  assert.ok(proposals >= 5, `proposals made: ${proposals}`);
  assert.ok(f.log.filter((e) => e.event.t === "config").length >= 3, "several changes were applied");
  const logs = (view(s, s.tokens[0]) as StateMessage).log.filter((l) => l.event.t === "config");
  assert.ok(logs.every((l) => l.event.t === "config" && Object.keys(l.event).sort().join() === "changes,player,round,t"));
});
