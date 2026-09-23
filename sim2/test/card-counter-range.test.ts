// Counter ranges under card edits. Whether a card's counter range follows its
// attack range is decided by the PRINTED card, and a pack edited in several
// steps is the printed pack plus the combined edits - so the server (edited
// step by step) and the browser (printed pack + the view's diff) always build
// the same card. Evidence: out/review-online/p1-counter-range.test.ts.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { applyCardOverrides, editedCard, overridesBetween } from "../src/card-overrides.ts";
import type { CardOverrides } from "../src/card-overrides.ts";
import type { CardPack } from "../src/cards.ts";
import { previewAttack } from "../src/preview.ts";
import { makeCtx } from "../src/state.ts";
import type { GameEvent, GameState, Pos, Unit } from "../src/types.ts";
import { packFor } from "../online/match.ts";
import { bothKeep, flowOf, newApp, roomOf, seatTwo, send, testRecordDir, view } from "./online-api-helpers.ts";
import type { Seated } from "./online-api-helpers.ts";
import { SK } from "./online-helpers.ts";

const DIR = testRecordDir("counter-range");

test.after(() => {
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
});

const p = (x: number, y: number): Pos => ({ x, y });
const card = (pack: CardPack, id: string) => {
  const c = pack.byId.get(id);
  assert.ok(c !== undefined, id);
  return c;
};

/** The cards whose printed counter range is not their attack range. */
const NARROW = ["sk09", "sk12", "sk14", "sk15", "sk16", "sk17"];

test("the printed pack records which cards' counter range follows the attack range", () => {
  for (const c of SK.cards) {
    assert.equal(c.counterFollowsAttack, !NARROW.includes(c.id), c.id);
  }
});

test("an attack range edited and changed back leaves exactly the printed card, in any number of steps", () => {
  for (const id of NARROW) {
    const printed = card(SK, id);
    const front: CardOverrides = { [id]: { attackRange: [p(0, 1)], gapCell: p(0, 1) } };
    const back: CardOverrides = { [id]: { attackRange: printed.attackRange, gapCell: printed.gapCell ?? null } };
    const once = applyCardOverrides(SK, front);
    assert.deepEqual(card(once, id).counterRange, printed.counterRange, `${id}: a narrower attack range keeps the printed counter range`);
    const twice = applyCardOverrides(once, back);
    assert.equal(card(twice, id), printed, `${id}: back to printed is the printed card`);
    // an edited card handed to editedCard directly still uses the printed decision
    assert.deepEqual(editedCard(card(once, id), back[id]).counterRange, printed.counterRange, id);
  }
  // a card whose counter range IS its attack range keeps following it
  const oni = card(SK, "sk03");
  const far = applyCardOverrides(SK, { sk03: { attackRange: [p(0, 2), p(0, 1)] } });
  assert.deepEqual(card(far, "sk03").counterRange, [p(0, 2), p(0, 1)]);
  const near = applyCardOverrides(far, { sk03: { attackRange: [p(0, 1)] } });
  assert.equal(card(near, "sk03"), oni);
});

test("the same final edits give the same card whatever the order; the browser's rebuild equals the server's pack", () => {
  const a: CardOverrides = { sk14: { attackRange: [p(0, 1)], gapCell: p(0, 1) }, sk16: { hp: 5 } };
  const b: CardOverrides = { sk14: { attackRange: [p(0, 1), p(1, 1)], gapCell: p(1, 1) }, sk09: { attackRange: [p(0, 1), p(-1, 0)], gapCell: p(-1, 0) } };
  const c: CardOverrides = { sk14: { attackRange: [p(0, 1), p(0, -1)], gapCell: p(0, -1) }, sk16: { atk: 2 } };
  const orders = [
    [a, b, c],
    [b, a, c],
    [a, c, b, c],
  ];
  const packs = orders.map((steps) => steps.reduce((pack, ov) => applyCardOverrides(pack, ov), SK));
  for (const pack of packs) {
    for (const id of ["sk09", "sk14", "sk16"]) assert.deepEqual(card(pack, id), card(packs[0], id), id);
    const rebuilt = applyCardOverrides(SK, overridesBetween(SK, pack));
    for (const c2 of pack.cards) assert.deepEqual(card(rebuilt, c2.id), c2, `rebuild of ${c2.id}`);
  }
  assert.equal(card(packs[0], "sk14"), card(SK, "sk14"), "sk14 ended on its printed values");
});

// ---------------------------------------------------------------- online

const unit = (uid: number, cardId: string, owner: 0 | 1, x: number, y: number, facing: 0 | 1 | 2 | 3): Unit => ({
  uid, cardId, owner, pos: { x, y }, facing, damage: 0,
  attackedThisTurn: false, rotatedThisTurn: false, summonedThisTurn: false, hiddenBy: null, atkBuff: 0,
});

// P1's 両面 (sk14, printed: attack front and back, counter front only) facing
// north; P0's 影鬼 (sk03) directly behind it, facing it.
const prepare = (s: GameState): void => {
  s.units.push(unit(1, "sk14", 1, 1, 1, 0), unit(2, "sk03", 0, 1, 0, 0));
  s.nextUid = 3;
};

const FRONT_ONLY = { sk14: { attackRange: [p(0, 1)], gapCell: p(0, 1) } };
const PRINTED_SHAPE = { sk14: { attackRange: [p(0, 1), p(0, -1)], gapCell: p(0, -1) } };
const ATTACK = { kind: "attack", uid: 2, targetUid: 1 } as const;

const agree = (s: Seated, cards: object): number => {
  const r = send(s, s.tokens[0], { type: "propose", scope: "now", patch: {}, cards });
  if (r.status !== 200) return r.status;
  return send(s, s.tokens[1], { type: "answer", id: roomOf(s).proposal!.id, accept: true }).status;
};

/** Server card == browser card, and the browser's prediction == what the server then does. */
const assertInSync = (s: Seated): void => {
  const g = view(s, s.tokens[0]).game!;
  const printed = packFor("shuten-kyuryu");
  const clientPack = applyCardOverrides(printed, g.cards);
  const f = flowOf(s);
  assert.deepEqual(g.cards, {}, "views say the printed card");
  assert.deepEqual(card(f.ctx.pack, "sk14"), card(printed, "sk14"), "server card is the printed card");
  assert.deepEqual(card(clientPack, "sk14"), card(f.ctx.pack, "sk14"), "browser card == server card");
  const predicted = previewAttack(makeCtx(g.config, clientPack), f.state, ATTACK)!;
  assert.equal(send(s, s.tokens[0], { type: "action", action: ATTACK }).status, 200);
  const done = f.events.filter((e): e is Extract<GameEvent, { t: "attack" }> => e.t === "attack").at(-1)!;
  assert.equal(done.counterTotal, predicted.counterTotal);
  assert.equal(done.counterTotal, 0, "両面 does not counter from behind");
  assert.equal(f.state.units.some((u) => u.uid === 2), !predicted.attackerDestroyed);
};

test("online: two mid-match card edits that end on the printed card keep server, view and browser in sync", () => {
  const s = seatTwo(newApp(DIR, { flowOptions: { prepare } }));
  bothKeep(s);
  assert.equal(agree(s, FRONT_ONLY), 200);
  assert.equal(agree(s, PRINTED_SHAPE), 200, "back to printed is a change from front-only");
  assertInSync(s);
});

test("online: a room created with an edited card, changed back to printed mid-match", () => {
  const s = seatTwo(newApp(DIR, { flowOptions: { prepare } }), { cards: FRONT_ONLY });
  bothKeep(s);
  assert.deepEqual(view(s, s.tokens[1]).game!.cards, FRONT_ONLY);
  assert.equal(agree(s, PRINTED_SHAPE), 200);
  assertInSync(s);
  // asking for the printed card again now changes nothing
  assert.equal(send(s, s.tokens[0], { type: "propose", scope: "now", patch: {}, cards: PRINTED_SHAPE }).status, 422);
});
