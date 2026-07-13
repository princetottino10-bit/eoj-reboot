import {
  applyOnTurnEndEffects,
  applyOnTurnStartEffects,
} from "./effects.js";
import type { CellIndex, GameState } from "./types.js";
import { assertNonNull } from "./types.js";

export const END_TURN_HAND_SIZE = 5;

// ============================================================
// 再行動マナ消費
// ============================================================

/**
 * 再行動（攻撃または回転）のマナコストを消費する。
 * 総コスト = baseCost + char.status.actionTax
 */
export function spendReactivationMana(
  state: GameState,
  charIdx: CellIndex,
  baseCost: number,
): GameState {
  const active = state.active;
  const char = state.board[charIdx];
  const totalCost = baseCost + (char?.status.actionTax ?? 0);
  const newPlayers = [
    { ...state.players[0] },
    { ...state.players[1] },
  ] as typeof state.players;
  newPlayers[active] = {
    ...newPlayers[active],
    mana: newPlayers[active].mana - totalCost,
  };
  return { ...state, players: newPlayers };
}

// ============================================================
// ターン開始フェーズ
// ============================================================

/**
 * ターン開始: 現在プレイヤーのキャラのフラグをリセットし、
 * そのキャラのステータス効果をtick（duration-1）する。
 */
export function startTurnPhase(state: GameState): GameState {
  const active = state.active;
  const newBoard = state.board.map((char) => {
    if (char === null) return null;
    if (char.owner !== active) return char;

    const s = char.status;
    const brainwashedTurns =
      s.brainwashedTurns > 0 ? s.brainwashedTurns - 1 : 0;
    const newStatus = {
      ...s,
      brainwashedTurns,
      brainwashedBy: brainwashedTurns === 0 ? null : s.brainwashedBy,
      dirLocked: s.dirLocked > 0 ? s.dirLocked - 1 : 0,
      immune: s.immune > 0 ? s.immune - 1 : 0,
    };
    return { ...char, status: newStatus, hasActed: false, hasRotated: false };
  });
  const afterFlags = { ...state, board: newBoard };
  const { board: boardAfterTrigger, players: playersAfterTrigger } =
    applyOnTurnStartEffects(afterFlags);
  return { ...afterFlags, board: boardAfterTrigger, players: playersAfterTrigger };
}

// ============================================================
// マナ獲得・ドロー
// ============================================================

/** マナ+2、デッキトップから1ドロー（デッキ空の場合はスキップ）。 */
export function drawStep(state: GameState): GameState {
  const p = state.active;
  const newPlayers = [
    { ...state.players[0] },
    { ...state.players[1] },
  ] as typeof state.players;
  newPlayers[p] = { ...newPlayers[p], mana: newPlayers[p].mana + 2 };

  const deck = [...newPlayers[p].deck];
  const hand = [...newPlayers[p].hand];
  if (deck.length > 0) {
    hand.push(assertNonNull(deck.pop()));
  }
  newPlayers[p] = { ...newPlayers[p], deck, hand };

  return { ...state, players: newPlayers };
}

// ============================================================
// ターン終了クリーンアップ
// ============================================================

/**
 * ターン終了:
 * 1. 手札上限チェック（超過分を捨て札へ）
 * 2. 相手のチームDRをクリア（ルミナウルト効果の期限切れ）
 * 3. アクティブプレイヤー切替
 * 4. ターン数+1
 */
export function endTurnCleanup(state: GameState): GameState {
  const p = state.active;
  const opp = (1 - p) as 0 | 1;

  // on_turn_end 自動エフェクト（アクティブプレイヤーのキャラ分）
  const { board: boardAfterEnd, players: playersAfterEnd } =
    applyOnTurnEndEffects(state);

  const newPlayers = [
    { ...playersAfterEnd[0] },
    { ...playersAfterEnd[1] },
  ] as typeof state.players;
  const deck = [...newPlayers[p].deck];
  const hand = [...newPlayers[p].hand];
  const discard = [...newPlayers[p].discard];
  while (hand.length < END_TURN_HAND_SIZE && deck.length > 0) {
    hand.push(assertNonNull(deck.pop()));
  }
  if (hand.length > END_TURN_HAND_SIZE) {
    discard.push(...hand.splice(END_TURN_HAND_SIZE));
  }
  newPlayers[p] = { ...newPlayers[p], deck, hand, discard };

  const newTeamDR: [boolean, boolean] = [state.teamDR[0], state.teamDR[1]];
  newTeamDR[opp] = false;

  // 現プレイヤーのキャラのtempAtkBuffをリセット
  const newBoard = boardAfterEnd.map((char) => {
    if (char === null || char.owner !== p) return char;
    return char.tempAtkBuff > 0 ? { ...char, tempAtkBuff: 0 } : char;
  });

  return {
    ...state,
    board: newBoard,
    players: newPlayers,
    teamDR: newTeamDR,
    active: opp,
    turn: state.turn + 1,
  };
}
