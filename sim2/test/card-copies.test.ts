// 枚数 (card copies per deck) as a card edit, and the 初手の見込み count that
// reads the deck it makes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCardOverrides, cardChanges, MIN_DECK, parseCardOverrides } from "../src/card-overrides.ts";
import { openingOdds } from "../src/opening-odds.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig } from "../src/presets.ts";
import { createGame, makeCtx } from "../src/state.ts";

const AC = loadPack(packPath("adopted-1003"));

test("枚数: a printed pack has one of each; an edit repeats the card in the deck (0 leaves it out), and the game deals from that", () => {
  assert.equal(AC.deckList.length, AC.cards.length);
  assert.ok(AC.cards.every((c) => c.copies === 1));
  const ed = applyCardOverrides(AC, { ac04: { copies: 3 }, ac17: { copies: 0 } });
  assert.equal(ed.deckList.filter((id) => id === "ac04").length, 3);
  assert.ok(!ed.deckList.includes("ac17"));
  assert.equal(ed.deckList.length, AC.cards.length + 2 - 1);
  assert.deepEqual(cardChanges(AC, { ac04: { copies: 3 } }).map((c) => [c.label, c.from, c.to]), [["枚数", "1", "3"]]);
  const s = createGame(makeCtx(presetConfig("r1003"), ed), 7);
  for (const p of [0, 1] as const) assert.equal(s.players[p].hand.length + s.players[p].deck.length, ed.deckList.length);
  // back to 1: the printed pack again
  assert.equal(applyCardOverrides(ed, { ac04: { copies: 1 }, ac17: { copies: 1 } }), AC);
});

test("枚数: 0..4 per card, and the deck must keep at least MIN_DECK cards", () => {
  assert.equal(parseCardOverrides({ ac04: { copies: 5 } }, AC).ok, false);
  assert.equal(parseCardOverrides({ ac04: { copies: 2 } }, AC).ok, true);
  const most = Object.fromEntries(AC.cards.slice(0, AC.cards.length - (MIN_DECK - 1)).map((c) => [c.id, { copies: 0 }]));
  const r = parseCardOverrides(most, AC);
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.error, /10枚以上/);
});

test("初手の見込み: fixed seed (same numbers every time), 後手 with more 霊力 does better, cheap copies raise 先手's two-unit chance", () => {
  const cfg = presetConfig("r1003");
  const [a, b] = openingOdds(cfg, AC, 4000);
  assert.deepEqual(openingOdds(cfg, AC, 4000), [a, b]);
  assert.equal(a.mana, 6);
  assert.equal(b.mana, 8);
  assert.ok(b.two >= a.two);
  assert.ok(a.two >= a.twoAsDealt, "the mulligan only helps");
  const cheap = openingOdds(cfg, applyCardOverrides(AC, { ac03: { copies: 2 }, ac04: { copies: 2 } }), 4000);
  assert.ok(cheap[0].two > a.two + 0.03, `${cheap[0].two} vs ${a.two}`);
  // one summon per turn: two is never possible
  const one = openingOdds({ ...cfg, summonLimit: 1 }, AC, 1000);
  assert.equal(one[0].two, 0);
});
