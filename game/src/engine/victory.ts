import type { Board, GameState, PlayerState } from './types.js';

// ============================================================
// 定数
// ============================================================

export const VP_WIN_THRESHOLD = 15;
export const TERRITORY_WIN_COUNT = 5;
export const TIMEOUT_TURN = 50;

// ============================================================
// 個別勝利チェック
// ============================================================

export function checkVPWin(players: [PlayerState, PlayerState]): 0 | 1 | null {
  if (players[0].vp >= VP_WIN_THRESHOLD) return 0;
  if (players[1].vp >= VP_WIN_THRESHOLD) return 1;
  return null;
}

/**
 * 自ターン終了時のみ呼ぶ。endingPlayer が5マス以上占拠していれば勝利。
 */
export function checkTerritoryWin(board: Board, endingPlayer: 0 | 1): 0 | 1 | null {
  const count = board.filter(c => c !== null && c.owner === endingPlayer).length;
  return count >= TERRITORY_WIN_COUNT ? endingPlayer : null;
}

/** 0 | 1 = 勝者, -1 = 引き分け, null = 未到達 */
export function checkTimeoutWin(
  turn: number,
  players: [PlayerState, PlayerState],
): 0 | 1 | -1 | null {
  if (turn < TIMEOUT_TURN) return null;
  const [p0, p1] = players;
  if (p0.vp > p1.vp) return 0;
  if (p1.vp > p0.vp) return 1;
  return -1;
}

// ============================================================
// 統合チェック
// ============================================================

/**
 * 勝利条件を総合判定する。
 * @param endOfTurnPlayer 自ターン終了したプレイヤー（領土判定用）。null なら領土判定をスキップ。
 * @returns 0 | 1 = 勝者, -1 = 引き分け, null = 未決
 */
export function evalVictory(
  state: GameState,
  endOfTurnPlayer: 0 | 1 | null,
): 0 | 1 | -1 | null {
  const vpResult = checkVPWin(state.players);
  if (vpResult !== null) return vpResult;

  if (endOfTurnPlayer !== null) {
    const terrResult = checkTerritoryWin(state.board, endOfTurnPlayer);
    if (terrResult !== null) return terrResult;
  }

  return checkTimeoutWin(state.turn, state.players);
}
