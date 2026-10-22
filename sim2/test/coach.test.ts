// はじめての1局 (10/18): the first-turn steps follow what the player has done so far.
import test from "node:test";
import assert from "node:assert/strict";
import { coachHtml, coachStep } from "../play/coach.ts";

const base = { main: true, sel: "none", mine: 0, canAttack: 0, attacked: false };

test("the steps: hand → cell → facing → attack → end", () => {
  assert.equal(coachStep(base), "hand");
  assert.equal(coachStep({ ...base, sel: "hand" }), "cell");
  assert.equal(coachStep({ ...base, sel: "place" }), "facing");
  assert.equal(coachStep({ ...base, mine: 1, canAttack: 1 }), "attack");
  assert.equal(coachStep({ ...base, mine: 1, canAttack: 1, attacked: true }), "end");
  assert.equal(coachStep({ ...base, mine: 1 }), "end");
});

test("nothing while it is not my main step, or mid-way through another action", () => {
  assert.equal(coachStep({ ...base, main: false }), null);
  assert.equal(coachStep({ ...base, sel: "aim" }), null);
});

test("the note can be closed", () => {
  assert.match(coachHtml("hand"), /data-act="coach-off"/);
  assert.match(coachHtml("end"), /ターン終了/);
});
