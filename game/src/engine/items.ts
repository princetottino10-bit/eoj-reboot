import type { GameState, CellIndex, Board, Direction } from './types.js';
import { appendLog } from './types.js';
import { clearAffiliatedEffects } from './combat.js';
import { getCharDef, getCardName } from '../data/cards.js';

export function applyItemEffect(state: GameState, itemId: string, targetIdx: CellIndex, active: 0 | 1): GameState {
  const opp = (1 - active) as 0 | 1;
  const nb = [...state.board] as Board;

  switch (itemId) {
    case 'item_03': {
      const c = nb[targetIdx];
      if (c && c.owner === active) nb[targetIdx] = { ...c, hp: Math.min(c.hp + 3, c.maxHp) };
      return appendLog({ ...state, board: nb }, `HP+3`, 'heal');
    }
    case 'item_04': {
      const c = nb[targetIdx];
      if (c && c.owner === active) nb[targetIdx] = { ...c, tempAtkBuff: c.tempAtkBuff + 2 };
      return appendLog({ ...state, board: nb }, `このターンATK+2`, 'info');
    }
    case 'item_grant_piercing': {
      const c = nb[targetIdx];
      if (c && c.owner === active) nb[targetIdx] = { ...c, markers: { ...c.markers, piercing: c.markers.piercing + 1 } };
      return appendLog({ ...state, board: nb }, `貫通マーカー付与`, 'info');
    }
    case 'item_grant_protection': {
      const c = nb[targetIdx];
      if (c && c.owner === active) nb[targetIdx] = { ...c, markers: { ...c.markers, protection: c.markers.protection + 1 } };
      return appendLog({ ...state, board: nb }, `防護マーカー付与`, 'info');
    }
    case 'item_reactivate': {
      const c = nb[targetIdx];
      if (c && c.owner === active) nb[targetIdx] = { ...c, hasActed: false };
      return appendLog({ ...state, board: nb }, `再行動可能になった`, 'info');
    }
    case 'item_self_bounce': {
      const c = nb[targetIdx];
      if (c && c.owner === active) {
        nb[targetIdx] = null;
        const np = [...state.players] as typeof state.players;
        np[active] = { ...np[active], hand: [...np[active].hand, c.cardId] };
        return appendLog({ ...state, board: nb, players: np }, `${getCardName(c.cardId)} を手札に戻した`, 'info');
      }
      return state;
    }
    case 'item_05': {
      const c = nb[targetIdx];
      if (c && c.owner === opp) nb[targetIdx] = { ...c, atk: Math.max(0, c.atk - 2) };
      return appendLog({ ...state, board: nb }, `敵ATK-2`, 'info');
    }
    case 'item_06': {
      const c = nb[targetIdx];
      if (c && c.owner === opp) {
        const newHp = c.hp - 2;
        nb[targetIdx] = newHp <= 0 ? null : { ...c, hp: newHp };
        if (newHp <= 0) {
          clearAffiliatedEffects(nb, c.cardId);
          const np = [...state.players] as typeof state.players;
          np[active] = { ...np[active], vp: np[active].vp + 1 };
          return appendLog({ ...state, board: nb, players: np }, `敵に2ダメ（撃破！1VP）`, 'system');
        }
        return appendLog({ ...state, board: nb }, `敵に2ダメ`, 'damage');
      }
      return state;
    }
    case 'item_14': {
      const c = nb[targetIdx];
      if (c && c.owner === opp) {
        nb[targetIdx] = { ...c, dir: ((c.dir + 2) % 4) as Direction, status: { ...c.status, dirLocked: 1 } };
      }
      return appendLog({ ...state, board: nb }, `敵を180°回転・向き固定1ターン`, 'info');
    }
    case 'item_20': {
      const c = nb[targetIdx];
      if (c && c.owner === opp) nb[targetIdx] = { ...c, dir: ((c.dir + 1) % 4) as Direction };
      return appendLog({ ...state, board: nb }, `敵を90°回転`, 'info');
    }
    case 'item_bounce_enemy': {
      const c = nb[targetIdx];
      if (c && c.owner === opp) {
        nb[targetIdx] = null;
        const np = [...state.players] as typeof state.players;
        np[opp] = { ...np[opp], hand: [...np[opp].hand, c.cardId] };
        return appendLog({ ...state, board: nb, players: np }, `${getCardName(c.cardId)} を相手の手札に戻した`, 'system');
      }
      return state;
    }
    default:
      return appendLog(state, `${itemId} は未実装`, 'system');
  }
}
