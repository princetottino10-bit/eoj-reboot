import type { GameScreen, GameState } from "../engine/types.js";
import { onAuthStateChanged, type User } from "../firebase/auth.js";
import {
  type RoomDoc,
  subscribeRoom,
  writeRoomState,
} from "../firebase/room.js";
import { type DraftUiState, renderDraft } from "./draft.js";
import { type GameUiExtra, renderGame } from "./game.js";
import { renderLobby } from "./lobby.js";
import { renderLogin } from "./login.js";
import { renderOver } from "./over.js";
import { renderPass } from "./pass.js";
import { renderTitle } from "./title.js";
import { renderWaiting } from "./waiting.js";

export interface AppState {
  screen: GameScreen;
  draftUi: DraftUiState;
  gameState: GameState | null;
  gameUiExtra: GameUiExtra;
  passForPlayer: 0 | 1;
  // Online
  online: boolean;
  roomId: string | null;
  myPlayerIndex: 0 | 1 | null;
  // Auth
  currentUser: User | null;
  authError: string | null;
}

const INITIAL_DRAFT_UI: DraftUiState = {
  step: "faction",
  pickIndex: 0,
  p0Factions: [],
  p1Factions: [],
  p0Item: "",
  p1Item: "",
  hoveredFaction: null,
  hoveredItem: null,
};

const INITIAL_GAME_UI_EXTRA: GameUiExtra = {
  dirPickerCell: null,
  summonHandIdx: null,
  selectedBoardIdx: null,
  mode: "idle",
  validCells: [],
  pendingCardId: null,
  pendingCellIdx: null,
  discardContext: null,
  effectDirContext: null,
  effectRotateContext: null,
  itemRotateContext: null,
  itemHandIdx: null,
  ultCasterIdx: null,
  elementSwapBoardIdx: null,
  magicAttackContext: null,
  onAttackContext: null,
  physicalSummonAttackContext: null,
};

let state: AppState = {
  screen: "login",
  draftUi: { ...INITIAL_DRAFT_UI },
  gameState: null,
  gameUiExtra: { ...INITIAL_GAME_UI_EXTRA },
  passForPlayer: 0,
  online: false,
  roomId: null,
  myPlayerIndex: null,
  currentUser: null,
  authError: null,
};

let firestoreUnsub: (() => void) | null = null;

const root = document.getElementById("app") as HTMLElement;

export function getState(): AppState {
  return state;
}

// remote=true のとき Firestore への書き戻しをスキップ（ループ防止）
export function setState(
  partial: Partial<AppState>,
  { remote = false } = {},
): void {
  state = { ...state, ...partial };
  render();
  if (!remote && state.online && state.roomId) {
    void syncToFirestore();
  }
}

export function resetGameUiExtra(): GameUiExtra {
  return { ...INITIAL_GAME_UI_EXTRA };
}

// ── Firestore 同期 ────────────────────────────────────────────

async function syncToFirestore(): Promise<void> {
  if (!state.roomId) return;
  const { draftUi, gameState, screen } = state;

  const phase =
    screen === "draft"
      ? "draft"
      : screen === "game"
        ? "game"
        : screen === "over"
          ? "over"
          : undefined;

  const draftSync = draftUi
    ? {
        step: draftUi.step,
        pickIndex: draftUi.pickIndex,
        p0Factions: draftUi.p0Factions,
        p1Factions: draftUi.p1Factions,
        p0Item: draftUi.p0Item,
        p1Item: draftUi.p1Item,
      }
    : null;

  const update: Record<string, unknown> = { draftUi: draftSync, gameState };
  if (phase) update.phase = phase;

  await writeRoomState(state.roomId, update);
}

// Firestore のスナップショットをローカル状態に適用
function applyRoomDoc(doc: RoomDoc): void {
  const currentScreen = state.screen;

  // waiting → draft: 対戦相手が参加した
  if (currentScreen === "waiting" && doc.phase === "draft") {
    setState(
      {
        screen: "draft",
        draftUi: doc.draftUi
          ? { ...INITIAL_DRAFT_UI, ...doc.draftUi }
          : { ...INITIAL_DRAFT_UI },
      },
      { remote: true },
    );
    return;
  }

  if (doc.phase === "draft" && doc.draftUi) {
    setState(
      {
        draftUi: { ...state.draftUi, ...doc.draftUi },
      },
      { remote: true },
    );
    return;
  }

  if ((doc.phase === "game" || doc.phase === "over") && doc.gameState) {
    const gs = doc.gameState as unknown as GameState;
    setState(
      {
        screen: doc.phase === "over" ? "over" : "game",
        gameState: gs,
        gameUiExtra: resetGameUiExtra(),
      },
      { remote: true },
    );
  }
}

export function startOnlineRoom(roomId: string, _myPlayerIndex: 0 | 1): void {
  firestoreUnsub?.();
  firestoreUnsub = subscribeRoom(roomId, applyRoomDoc);
}

export function stopOnlineRoom(): void {
  firestoreUnsub?.();
  firestoreUnsub = null;
  state = { ...state, online: false, roomId: null, myPlayerIndex: null };
}

// ── レンダリング ──────────────────────────────────────────────

function render(): void {
  root.innerHTML = "";
  switch (state.screen) {
    case "login":
      root.appendChild(renderLogin(state.authError));
      break;
    case "title":
      root.appendChild(renderTitle(state.currentUser));
      break;
    case "lobby":
      root.appendChild(renderLobby());
      break;
    case "waiting":
      root.appendChild(renderWaiting(state.roomId ?? ""));
      break;
    case "draft":
      root.appendChild(renderDraft(state.draftUi));
      break;
    case "pass":
      root.appendChild(renderPass(state.passForPlayer));
      break;
    case "game":
      if (state.gameState)
        root.appendChild(renderGame(state.gameState, state.gameUiExtra));
      break;
    case "over":
      if (state.gameState) root.appendChild(renderOver(state.gameState));
      break;
  }
}

export function startApp(): void {
  root.innerHTML = '<div class="loading">読み込み中…</div>';

  onAuthStateChanged((user, authError) => {
    if (!user) {
      state = {
        ...state,
        screen: "login",
        currentUser: null,
        authError: authError ?? null,
      };
      render();
    } else if (!state.currentUser) {
      state = { ...state, screen: "title", currentUser: user, authError: null };
      render();
    } else {
      state = { ...state, currentUser: user };
    }
  });
}
