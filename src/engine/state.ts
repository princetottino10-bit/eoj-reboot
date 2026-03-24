import type { Card, Element } from '../types/card';
import type { Cell, GameState, Player, PlayerId, WinnerReason } from '../types/game';
import { TERRITORY_CONTROL_TARGET, VP_TARGET } from './rules';
import { shuffleArray } from './utils';

const ALL_ELEMENTS: Element[] = ['faust', 'geist', 'licht', 'nacht', 'nicht'];

/**
 * Create a 3×3 board with random elements assigned to each cell.
 * nicht は必ず1枚だけ。残り8マスを faust/geist/licht/nacht からランダムに割り当て。
 */
export function createInitialBoard(): Cell[][] {
  const NON_NICHT: Element[] = ['faust', 'geist', 'licht', 'nacht'];

  // nicht×1 + 他4属性×2ずつ = 9マス（均等配分）
  const elements: Element[] = [
    'nicht',
    'faust', 'faust',
    'geist', 'geist',
    'licht', 'licht',
    'nacht', 'nacht',
  ];
  const shuffled = shuffleArray(elements);

  const board: Cell[][] = [];
  let idx = 0;
  for (let row = 0; row < 3; row++) {
    const rowCells: Cell[] = [];
    for (let col = 0; col < 3; col++) {
      rowCells.push({
        row,
        col,
        element: shuffled[idx++],
        character: null,
      });
    }
    board.push(rowCells);
  }
  return board;
}

/**
 * Create a Player with a shuffled deck, empty hand, and 0 mana.
 */
export function createPlayer(id: PlayerId, name: string, deck: Card[]): Player {
  return {
    id,
    name,
    deck: shuffleArray(deck),
    hand: [],
    discard: [],
    mana: 0,
    vp: 0,
  };
}

/**
 * Create the full initial game state.
 * Phase is 'setup', turn number 1, player 0 goes first.
 */
export function createGameState(
  player1Deck: Card[],
  player2Deck: Card[],
): GameState {
  return {
    board: createInitialBoard(),
    players: [
      createPlayer(0, 'Player 1', player1Deck),
      createPlayer(1, 'Player 2', player2Deck),
    ],
    currentPlayer: 0,
    phase: 'setup',
    turnNumber: 1,
    winner: null,
    winnerReason: null,
    log: [],
    combatEvents: [],
    hasSummonedThisTurn: false,
    summonCountThisTurn: 0,
    attackedThisTurn: [],
    swappedThisTurn: [],
  };
}

/**
 * Draw cards from deck to hand.
 * If the deck is empty, shuffle the discard pile into the deck, then draw.
 * Returns a new Player object (does not mutate the original).
 */
export function drawCards(player: Player, count: number): Player {
  const deck = [...player.deck];
  const hand = [...player.hand];
  const discard = [...player.discard];

  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      if (discard.length === 0) {
        // Nothing left to draw
        break;
      }
      // Shuffle discard into deck
      const reshuffled = shuffleArray(discard);
      deck.push(...reshuffled);
      discard.length = 0;
    }
    hand.push(deck.pop()!);
  }

  return {
    ...player,
    deck,
    hand,
    discard,
  };
}

/**
 * Count how many cells on the board a given player controls
 * (i.e., has a character with matching owner).
 */
export function countControlledCells(state: GameState, playerId: PlayerId): number {
  let count = 0;
  for (const row of state.board) {
    for (const cell of row) {
      if (cell.character !== null && cell.character.owner === playerId) {
        count++;
      }
    }
  }
  return count;
}

export function getWinnerReason(
  state: GameState,
  winner: PlayerId | null,
  checkTerritory: boolean = false,
): WinnerReason | null {
  if (winner === null) return null;
  if (state.players[winner].vp >= VP_TARGET) return 'vp';
  if (checkTerritory && countControlledCells(state, winner) >= TERRITORY_CONTROL_TARGET) {
    return 'territory';
  }
  if (state.turnNumber >= 50) return 'timeout';
  return null;
}

/**
 * v2勝利条件チェック
 * - VP15: いつでも即勝利
 * - 5マス占拠: checkTerritory=true（ターン終了時のみ）の場合のみ判定
 * - 50ターン: VP多い方が勝利、同数なら引分
 */
export function checkWinCondition(state: GameState, checkTerritory: boolean = false): PlayerId | null {
  // VP15 即勝利（常時チェック）
  for (const pid of [0, 1] as PlayerId[]) {
    if (state.players[pid].vp >= VP_TARGET) {
      return pid;
    }
  }
  // 5マス占拠 — ターン終了時のみ判定
  if (checkTerritory) {
    for (const pid of [0, 1] as PlayerId[]) {
      if (countControlledCells(state, pid) >= TERRITORY_CONTROL_TARGET) {
        return pid;
      }
    }
  }
  // 50ターンタイムアウト
  if (state.turnNumber >= 50) {
    const p0vp = state.players[0].vp;
    const p1vp = state.players[1].vp;
    if (p0vp > p1vp) return 0;
    if (p1vp > p0vp) return 1;
    // 同数ならマス数
    const p0cells = countControlledCells(state, 0);
    const p1cells = countControlledCells(state, 1);
    if (p0cells > p1cells) return 0;
    if (p1cells > p0cells) return 1;
    return null; // 完全引分
  }
  return null;
}
