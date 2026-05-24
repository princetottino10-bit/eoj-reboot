import type { GameState, CellIndex, Board } from './types.js';
import { appendLog } from './types.js';
import { getAdjacentCells, getFrontRowCells } from './board.js';
import { clearAffiliatedEffects } from './combat.js';
import { getCharDef, getCardName } from '../data/cards.js';

export function applyUltDirectEffect(state: GameState, casterIdx: CellIndex, active: 0 | 1): GameState {
  const nb = [...state.board] as Board;
  const opp = (1 - active) as 0 | 1;
  const caster = nb[casterIdx];
  if (!caster) return state;
  const cardId = caster.cardId;

  switch (cardId) {
    case 'aggro_v2_09': {
      nb[casterIdx] = { ...caster, markers: { ...caster.markers, piercing: caster.markers.piercing + 1 } };
      return appendLog({ ...state, board: nb }, '貫通マーカーを1枚獲得', 'info');
    }
    case 'aggro_v2_12': {
      const frontCells = getFrontRowCells(nb, casterIdx, caster.dir, opp);
      const np = [...state.players] as typeof state.players;
      for (const ci of frontCells) {
        const target = nb[ci];
        if (target && target.owner === opp) {
          const newHp = target.hp - 5;
          if (newHp <= 0) {
            nb[ci] = null;
            clearAffiliatedEffects(nb, target.cardId);
            np[active] = { ...np[active], vp: np[active].vp + (getCharDef(target.cardId)?.vp ?? 1) };
          } else {
            nb[ci] = { ...target, hp: newHp };
          }
        }
      }
      nb[casterIdx] = { ...caster, hp: 1 };
      return appendLog({ ...state, board: nb, players: np }, `前列の敵に5ダメ・自身HP1に設定`, 'damage');
    }
    case 'tank_v2_08': {
      const newTeamDR: [boolean, boolean] = [state.teamDR[0], state.teamDR[1]];
      newTeamDR[active] = true;
      return appendLog({ ...state, teamDR: newTeamDR }, 'チームダメージ軽減発動', 'system');
    }
    case 'tank_v2_10': {
      const adjIdxs = getAdjacentCells(casterIdx);
      for (const ai of adjIdxs) {
        const ally = nb[ai];
        if (ally && ally.owner === active) {
          nb[ai] = { ...ally, hp: ally.maxHp, markers: { ...ally.markers, protection: ally.markers.protection + 1 } };
        }
      }
      return appendLog({ ...state, board: nb }, '隣接味方全快＋防護マーカー付与', 'info');
    }
    case 'control_v2_10': {
      for (let i = 0; i < 9; i++) {
        const c = nb[i];
        if (c && c.owner === opp) nb[i] = { ...c, atk: Math.max(0, c.atk - 1), baseAtk: Math.max(0, c.baseAtk - 1) };
      }
      return appendLog({ ...state, board: nb }, '全敵のATKを永続-1', 'info');
    }
    case 'synergy_v2_10': {
      for (let i = 0; i < 9; i++) {
        const c = nb[i];
        if (c && c.owner === active) nb[i] = { ...c, atk: c.atk + 1, baseAtk: c.baseAtk + 1, hp: c.hp + 1, maxHp: c.maxHp + 1 };
      }
      return appendLog({ ...state, board: nb }, '全味方のATK+1・最大HP+1（永続）', 'info');
    }
    case 'synergy_v2_12': {
      for (let i = 0; i < 9; i++) {
        const c = nb[i];
        if (c && c.owner === active) {
          nb[i] = { ...c, markers: { protection: c.markers.protection + 1, evasion: c.markers.evasion + 1, piercing: c.markers.piercing + 1, quickness: c.markers.quickness + 1, aim: c.markers.aim } };
        }
      }
      return appendLog({ ...state, board: nb }, '全味方に4種マーカーを付与', 'info');
    }
    case 'trick_v2_12': {
      nb[casterIdx] = { ...caster, status: { ...caster.status, immune: caster.status.immune + 1 } };
      return appendLog({ ...state, board: nb }, '無敵1ターン付与', 'info');
    }
    default:
      return appendLog(state, `${cardId} ウルト効果（未実装）`, 'system');
  }
}

export function applyUltTargetEffect(
  state: GameState,
  casterIdx: CellIndex,
  casterCardId: string,
  targetIdx: CellIndex,
  active: 0 | 1,
): { newState: GameState; continueToDir: boolean } {
  const opp = (1 - active) as 0 | 1;
  let newState = state;

  switch (casterCardId) {
    case 'snipe_v2_09':
    case 'snipe_v2_12': {
      const dmg = casterCardId === 'snipe_v2_09' ? 4 : 5;
      const nb = [...newState.board] as Board;
      const target = nb[targetIdx];
      if (target && target.owner === opp) {
        const newHp = target.hp - dmg;
        if (newHp <= 0) {
          nb[targetIdx] = null;
          clearAffiliatedEffects(nb, target.cardId);
          const np2 = [...newState.players] as typeof newState.players;
          np2[active] = { ...np2[active], vp: np2[active].vp + (getCharDef(target.cardId)?.vp ?? 1) };
          newState = appendLog({ ...newState, board: nb, players: np2 }, `${getCardName(target.cardId)} に${dmg}ダメ（貫通）撃破！VP獲得`, 'system');
        } else {
          nb[targetIdx] = { ...target, hp: newHp };
          newState = appendLog({ ...newState, board: nb }, `${getCardName(target.cardId)} に${dmg}ダメ（貫通）`, 'damage');
        }
      }
      return { newState, continueToDir: false };
    }
    case 'control_v2_09': {
      const nb = [...newState.board] as Board;
      const target = nb[targetIdx];
      const casterChar = nb[casterIdx];
      if (target && target.owner === opp && casterChar) {
        const steal = Math.min(2, target.atk);
        nb[targetIdx] = { ...target, atk: Math.max(0, target.atk - steal), baseAtk: Math.max(0, target.baseAtk - steal) };
        nb[casterIdx] = { ...casterChar, atk: casterChar.atk + steal, baseAtk: casterChar.baseAtk + steal };
        newState = appendLog({ ...newState, board: nb }, `${getCardName(target.cardId)} のATKを${steal}奪った`, 'info');
      }
      return { newState, continueToDir: false };
    }
    case 'trick_v2_09': {
      const nb = [...newState.board] as Board;
      const casterChar = nb[casterIdx];
      const targetChar = nb[targetIdx];
      nb[casterIdx] = targetChar ?? null;
      nb[targetIdx] = casterChar ?? null;
      newState = appendLog({ ...newState, board: nb },
        `${getCardName(casterChar?.cardId ?? '')} と ${getCardName(targetChar?.cardId ?? '')} の位置を入れ替えた`, 'info');
      return { newState, continueToDir: true };
    }
    default:
      return { newState, continueToDir: false };
  }
}
