import type { GameState, GameScreen } from '../engine/types.js';
import { renderTitle } from './title.js';
import { renderDraft, type DraftUiState } from './draft.js';
import { renderPass } from './pass.js';
import { renderGame, type GameUiExtra } from './game.js';
import { renderOver } from './over.js';

export interface AppState {
  screen: GameScreen;
  draftUi: DraftUiState;
  gameState: GameState | null;
  /** extra transient UI state for the game screen */
  gameUiExtra: GameUiExtra;
  /** next player shown on the pass screen */
  passForPlayer: 0 | 1;
}

const INITIAL_DRAFT_UI: DraftUiState = {
  step: 'faction',
  pickIndex: 0,
  p0Factions: [],
  p1Factions: [],
  p0Item: '',
  p1Item: '',
  hoveredFaction: null,
  hoveredItem: null,
};

const INITIAL_GAME_UI_EXTRA: GameUiExtra = {
  dirPickerCell: null,
  summonHandIdx: null,
  selectedBoardIdx: null,
  mode: 'idle',
  validCells: [],
  pendingCardId: null,
  pendingCellIdx: null,
  discardContext: null,
  effectDirContext: null,
  itemHandIdx: null,
};

let state: AppState = {
  screen: 'title',
  draftUi: { ...INITIAL_DRAFT_UI },
  gameState: null,
  gameUiExtra: { ...INITIAL_GAME_UI_EXTRA },
  passForPlayer: 0,
};

const root = document.getElementById('app')!;

export function getState(): AppState { return state; }

export function setState(partial: Partial<AppState>): void {
  state = { ...state, ...partial };
  render();
}

export function resetGameUiExtra(): GameUiExtra {
  return { ...INITIAL_GAME_UI_EXTRA };
}

function render(): void {
  root.innerHTML = '';
  switch (state.screen) {
    case 'title':
      root.appendChild(renderTitle());
      break;
    case 'draft':
      root.appendChild(renderDraft(state.draftUi));
      break;
    case 'pass':
      root.appendChild(renderPass(state.passForPlayer));
      break;
    case 'game':
      if (state.gameState) root.appendChild(renderGame(state.gameState, state.gameUiExtra));
      break;
    case 'over':
      if (state.gameState) root.appendChild(renderOver(state.gameState));
      break;
  }
}

export function startApp(): void {
  render();
}
