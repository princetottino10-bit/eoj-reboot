import type { Card, CharacterCard, Direction, Element } from './card';

export interface BoardCharacter {
  card: CharacterCard;
  owner: PlayerId;
  currentHp: number;
  direction: Direction;
  buffs: Buff[];
  hasActedThisTurn: boolean;
  hasRotatedThisTurn: boolean;
}

export interface Buff {
  type:
    | 'atk_up'
    | 'atk_down'
    | 'sealed'
    | 'frozen'
    | 'direction_locked'
    | 'atk_cost_reduction'
    | 'has_protection'
    | 'has_dodge'
    | 'has_piercing'
    | 'has_quickness'
    | 'brainwashed'
    | 'action_tax'
    | 'marked';
  value: number;
  duration?: number;
  grantedBy?: string;
}

export interface Cell {
  row: number;
  col: number;
  element: Element;
  character: BoardCharacter | null;
}

export interface Position {
  row: number;
  col: number;
}

export type PlayerId = 0 | 1;

export interface Player {
  id: PlayerId;
  name: string;
  deck: Card[];
  hand: Card[];
  discard: Card[];
  mana: number;
  vp: number;
}

export type GamePhase =
  | 'setup'
  | 'draw'
  | 'action'
  | 'summon'
  | 'resolution'
  | 'game_over';

export type WinnerReason = 'vp' | 'territory' | 'timeout';

export interface GameState {
  board: Cell[][];
  players: [Player, Player];
  currentPlayer: PlayerId;
  phase: GamePhase;
  turnNumber: number;
  winner: PlayerId | null;
  winnerReason: WinnerReason | null;
  log: GameLogEntry[];
  combatEvents: CombatEvent[];
  hasSummonedThisTurn: boolean;
  summonCountThisTurn: number;
  attackedThisTurn: string[];
  swappedThisTurn: string[];
}

export interface GameLogEntry {
  turn: number;
  player: PlayerId;
  message: string;
}

export interface CombatEvent {
  turn: number;
  attacker: {
    cardId: string;
    cardName: string;
    faction: string;
    manaCost: number;
    owner: PlayerId;
  };
  defender: {
    cardId: string;
    cardName: string;
    faction: string;
    manaCost: number;
    owner: PlayerId;
  };
}

export type PlayerAction =
  | { type: 'summon'; cardId: string; position: Position; direction: Direction }
  | { type: 'attack'; position: Position }
  | { type: 'rotate'; position: Position; direction: Direction }
  | { type: 'use_item'; cardId: string; targetPosition?: Position }
  | { type: 'skip_draw'; cardId: string }
  | { type: 'end_turn' };
