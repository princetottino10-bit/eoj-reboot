// The mid-game position shown on the /world board: a real engine position,
// frozen. r1003 rules + pack adopted-1003, seed 1606, two "速い" (greedy) AIs,
// taken after 4 whole turns (found with sim2/scripts/world-position-search.ts;
// sim2/test/world-page.test.ts replays it and checks it still matches).
// Player 0 plays 玖龍街一門 cards, player 1 酒呑一門 cards here.

export type WorldUnit = {
  printId: string;
  /** board cell, x 0..2 left→right, y 0..2 (player 0's side is y = 0) */
  x: number;
  y: number;
  /** 0 up (+y), 1 right (+x), 2 down, 3 left — as in the engine */
  facing: 0 | 1 | 2 | 3;
  owner: 0 | 1;
  hp: number;
  maxHp: number;
};

export const WORLD_POSITION = {
  rules: "r1003",
  pack: "adopted-1003",
  seed: 1606,
  turns: 4,
  units: [
    { printId: "T-004", x: 1, y: 0, facing: 0, owner: 0, hp: 6, maxHp: 7 },
    { printId: "T-002", x: 1, y: 1, facing: 1, owner: 0, hp: 3, maxHp: 3 },
    { printId: "O-008", x: 0, y: 1, facing: 0, owner: 1, hp: 11, maxHp: 11 },
    { printId: "T-006", x: 0, y: 0, facing: 0, owner: 0, hp: 11, maxHp: 11 },
    { printId: "O-003", x: 1, y: 2, facing: 1, owner: 1, hp: 8, maxHp: 8 },
  ] as WorldUnit[],
} as const;

/** The two hero cards hovering behind the board, one per clan. */
export const WORLD_HEROES = ["T-008", "O-009"] as const;

export const FACING_WORD = ["上", "右", "下", "左"] as const;
