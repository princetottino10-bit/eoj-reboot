// The board as the table draws it, taken from a local match's state. The
// flow mutates its state in place and the table compares consecutive boards,
// so this is a copy. Used by the pages that run a match in the browser (the
// AI table and the spectate page). Pure.
import type { GameState } from "../src/types.ts";
import type { BoardView } from "../online/protocol.ts";

export const boardOf = (s: GameState): BoardView => ({
  units: s.units.map((u) => ({ ...u, pos: { ...u.pos } })),
  players: [0, 1].map((p) => {
    const ps = s.players[p];
    return {
      life: ps.life,
      mana: ps.mana,
      chips: ps.chips,
      reach: ps.reach,
      handCount: ps.hand.length,
      deckCount: ps.deck.length,
      grave: ps.grave.slice(),
      reshuffleCount: ps.reshuffleCount,
      controlPoints: ps.controlPoints,
    };
  }) as BoardView["players"],
  turnPlayer: s.turnPlayer,
  round: s.round,
  ended: s.ended,
  winner: s.winner,
  winType: s.winType,
  summonsThisTurn: s.summonsThisTurn,
});
