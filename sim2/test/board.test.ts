import test from "node:test";
import assert from "node:assert/strict";
import {
  allCells,
  attrMod,
  cellAttr,
  effMaxHp,
  inBoard,
  posKey,
  rotateRel,
  toBoardCells,
  turnFacing,
} from "../src/board.ts";
import { loadPack } from "../src/pack-io.ts";
import type { Facing, Pos } from "../src/types.ts";

const keys = (cells: Pos[]): string[] => cells.map(posKey).sort();

test("inBoard / allCells", () => {
  assert.equal(allCells().length, 9);
  assert.ok(inBoard({ x: 0, y: 0 }));
  assert.ok(inBoard({ x: 2, y: 2 }));
  assert.ok(!inBoard({ x: -1, y: 0 }));
  assert.ok(!inBoard({ x: 3, y: 1 }));
});

test("rotateRel rotates forward (+y) clockwise through all 4 facings", () => {
  const fwd = { x: 0, y: 1 };
  assert.deepEqual(rotateRel(fwd, 0), { x: 0, y: 1 });
  assert.deepEqual(rotateRel(fwd, 1), { x: 1, y: 0 });
  assert.deepEqual(rotateRel(fwd, 2), { x: 0, y: -1 });
  assert.deepEqual(rotateRel(fwd, 3), { x: -1, y: 0 });
  // right-hand cell follows the same rotation
  const right = { x: 1, y: 0 };
  assert.deepEqual(rotateRel(right, 0), { x: 1, y: 0 });
  assert.deepEqual(rotateRel(right, 1), { x: 0, y: -1 });
  assert.deepEqual(rotateRel(right, 2), { x: -1, y: 0 });
  assert.deepEqual(rotateRel(right, 3), { x: 0, y: 1 });
});

test("toBoardCells: front-1 range from centre, all 4 facings", () => {
  const rel = [{ x: 0, y: 1 }];
  const c = { x: 1, y: 1 };
  assert.deepEqual(toBoardCells(rel, c, 0), [{ x: 1, y: 2 }]);
  assert.deepEqual(toBoardCells(rel, c, 1), [{ x: 2, y: 1 }]);
  assert.deepEqual(toBoardCells(rel, c, 2), [{ x: 1, y: 0 }]);
  assert.deepEqual(toBoardCells(rel, c, 3), [{ x: 0, y: 1 }]);
});

test("toBoardCells: clips off-board cells", () => {
  const spear = [
    { x: 0, y: 1 },
    { x: 0, y: 2 },
  ];
  // from (1,1) facing north, (1,3) is off-board
  assert.deepEqual(toBoardCells(spear, { x: 1, y: 1 }, 0), [{ x: 1, y: 2 }]);
  // from (1,0) facing north both cells fit
  assert.deepEqual(toBoardCells(spear, { x: 1, y: 0 }, 0), [
    { x: 1, y: 1 },
    { x: 1, y: 2 },
  ]);
  // facing south from (1,0): nothing on the board
  assert.deepEqual(toBoardCells(spear, { x: 1, y: 0 }, 2), []);
});

test("toBoardCells: 5-cell AoE from centre, all 4 facings", () => {
  const aoe5 = [
    { x: 0, y: 1 },
    { x: -1, y: 1 },
    { x: 1, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];
  const c = { x: 1, y: 1 };
  assert.deepEqual(keys(toBoardCells(aoe5, c, 0)), keys([
    { x: 1, y: 2 },
    { x: 0, y: 2 },
    { x: 2, y: 2 },
    { x: 0, y: 1 },
    { x: 2, y: 1 },
  ]));
  assert.deepEqual(keys(toBoardCells(aoe5, c, 1)), keys([
    { x: 2, y: 1 },
    { x: 2, y: 2 },
    { x: 2, y: 0 },
    { x: 1, y: 2 },
    { x: 1, y: 0 },
  ]));
  assert.deepEqual(keys(toBoardCells(aoe5, c, 2)), keys([
    { x: 1, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: 0 },
    { x: 2, y: 1 },
    { x: 0, y: 1 },
  ]));
  assert.deepEqual(keys(toBoardCells(aoe5, c, 3)), keys([
    { x: 0, y: 1 },
    { x: 0, y: 0 },
    { x: 0, y: 2 },
    { x: 1, y: 0 },
    { x: 1, y: 2 },
  ]));
});

test("blind spot (back-1) rotates with facing", () => {
  const back = [{ x: 0, y: -1 }];
  const c = { x: 1, y: 1 };
  assert.deepEqual(toBoardCells(back, c, 0), [{ x: 1, y: 0 }]);
  assert.deepEqual(toBoardCells(back, c, 1), [{ x: 0, y: 1 }]);
  assert.deepEqual(toBoardCells(back, c, 2), [{ x: 1, y: 2 }]);
  assert.deepEqual(toBoardCells(back, c, 3), [{ x: 2, y: 1 }]);
});

test("turnFacing wraps both directions", () => {
  const seq: Facing[] = [0, 1, 2, 3];
  for (const f of seq) {
    assert.equal(turnFacing(f, 1), ((f + 1) % 4) as Facing);
    assert.equal(turnFacing(f, -1), ((f + 3) % 4) as Facing);
  }
});

test("cellAttr matches the fixed board layout", () => {
  assert.equal(cellAttr({ x: 1, y: 1 }), "taiji");
  assert.equal(cellAttr({ x: 1, y: 2 }), "yin");
  assert.equal(cellAttr({ x: 0, y: 1 }), "yin");
  assert.equal(cellAttr({ x: 2, y: 1 }), "yang");
  assert.equal(cellAttr({ x: 1, y: 0 }), "yang");
  for (const c of [
    { x: 0, y: 0 },
    { x: 2, y: 0 },
    { x: 0, y: 2 },
    { x: 2, y: 2 },
  ]) {
    assert.equal(cellAttr(c), "empty");
  }
});

test("attrMod: same +2, opposing -2, taiji/empty 0", () => {
  assert.equal(attrMod({ x: 0, y: 1 }, "yin", 2), 2);
  assert.equal(attrMod({ x: 0, y: 1 }, "yang", 2), -2);
  assert.equal(attrMod({ x: 2, y: 1 }, "yang", 2), 2);
  assert.equal(attrMod({ x: 2, y: 1 }, "yin", 2), -2);
  assert.equal(attrMod({ x: 1, y: 1 }, "yin", 2), 0);
  assert.equal(attrMod({ x: 0, y: 0 }, "yang", 2), 0);
});

test("effMaxHp applies attribute modifier and the cap", () => {
  assert.equal(effMaxHp(2, { x: 0, y: 1 }, "yin", 2, 10), 4);
  assert.equal(effMaxHp(2, { x: 2, y: 1 }, "yin", 2, 10), 0);
  assert.equal(effMaxHp(8, { x: 1, y: 0 }, "yang", 2, 10), 10);
  assert.equal(effMaxHp(9, { x: 1, y: 0 }, "yang", 2, 10), 10);
  assert.equal(effMaxHp(6, { x: 1, y: 1 }, "yin", 2, 10), 6);
});

test("placeholder22 pack loads with 22 cards and 11/11 attributes", () => {
  const pack = loadPack();
  assert.equal(pack.cards.length, 22);
  assert.equal(pack.cards.filter((c) => c.attribute === "yin").length, 11);
  assert.equal(pack.cards.filter((c) => c.attribute === "yang").length, 11);
  assert.equal(pack.deckList.length, 22);
});
