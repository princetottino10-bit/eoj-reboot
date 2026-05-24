import { setState, getState, resetGameUiExtra } from './app.js';
import type { GameState, CellIndex, Direction, Board } from '../engine/types.js';
import type { RelCoord } from '../engine/types.js';
import { appendLog } from '../engine/types.js';
import {
  getCharDef, getItemDef, isCharCard, getCardName, getCardCost,
} from '../data/cards.js';
import {
  getAttackCells, getAdjacentCells, getValidSummonCells,
} from '../engine/board.js';
import { resolveAttack } from '../engine/combat.js';
import { createCharInstance, attributeHpBonus } from '../engine/gamestate.js';
import { applyAutoEffects, resolveSummonAutoAttack, getSummonEffect } from '../engine/effects.js';
import { getUltSpec } from '../engine/effectSpecs.js';
import { startTurnPhase, drawStep, endTurnCleanup, spendReactivationMana } from '../engine/turn.js';
import { evalVictory } from '../engine/victory.js';
import { applyItemEffect } from '../engine/items.js';
import { applyPendingEffect, applyDiscardEffect } from '../engine/pendingEffects.js';
import { applyUltDirectEffect, applyUltTargetEffect } from '../engine/ults.js';
import { calcCostReduction, countAlliesInBPosition } from '../engine/cost.js';

export interface GameUiExtra {
  mode: 'idle' | 'hand_selected' | 'summon_dir_pending' | 'char_selected'
      | 'attack_targeting' | 'effect_targeting' | 'effect_dir_pending' | 'discard_pending'
      | 'ult_targeting' | 'ult_dir_pending'
      | 'element_swap_ally_pending' | 'element_swap_hand_pending';
  validCells: CellIndex[];
  dirPickerCell: CellIndex | null;
  summonHandIdx: number | null;
  selectedBoardIdx: CellIndex | null;
  pendingCardId: string | null;
  pendingCellIdx: CellIndex | null;
  /** Two-step effect: after target chosen, show direction picker */
  effectDirContext: { cardId: string; summonIdx: CellIndex; targetIdx: CellIndex } | null;
  /** Discard-from-hand effect context */
  discardContext: { cardId: string; cellIdx: CellIndex; mandatory: boolean } | null;
  /** Index of item card being played (in active player's hand) */
  itemHandIdx: number | null;
  /** Ult caster's board index (for multi-step ult flows) */
  ultCasterIdx: CellIndex | null;
  /** Board index selected in element_swap step 1 */
  elementSwapBoardIdx: CellIndex | null;
}

const DIR_ARROWS = ['↑', '→', '↓', '←'] as const;

function dirArrow(dir: Direction): string { return DIR_ARROWS[dir]!; }

function markerStr(char: NonNullable<Board[number]>): string {
  const parts: string[] = [];
  if (char.markers.protection > 0) parts.push(`防${char.markers.protection}`);
  if (char.markers.evasion > 0) parts.push(`回${char.markers.evasion}`);
  if (char.markers.piercing > 0) parts.push(`貫${char.markers.piercing}`);
  if (char.markers.quickness > 0) parts.push(`先${char.markers.quickness}`);
  if (char.status.brainwashedTurns > 0) parts.push(`洗脳${char.status.brainwashedTurns}`);
  if (char.status.actionTax > 0) parts.push(`再+${char.status.actionTax}`);
  if (char.keywords.includes('防護')) parts.push('防護');
  if (char.keywords.includes('回避')) parts.push('回避');
  if (char.keywords.includes('貫通')) parts.push('貫通');
  if (char.keywords.includes('先制')) parts.push('先制');
  if (char.keywords.includes('不動')) parts.push('不動');
  if (char.keywords.includes('カバー')) parts.push('カバー');
  if (char.keywords.includes('要塞')) parts.push('要塞');
  return parts.join(' ');
}

// ============================================================
// Rendering
// ============================================================

export function renderGame(state: GameState, ui: GameUiExtra): HTMLElement {
  const active = state.active;
  const opp = (1 - active) as 0 | 1;
  const div = document.createElement('div');
  div.className = 'screen-game';

  // ── Header ──
  const p0Class = active === 0 ? 'player-info active-player' : 'player-info';
  const p1Class = active === 1 ? 'player-info active-player' : 'player-info';
  div.innerHTML = `
    <div class="game-header">
      <div class="${p0Class}">
        <div class="player-label p0-color">プレイヤー1</div>
        <div class="player-stat">VP: ${state.players[0].vp} / マナ: ${state.players[0].mana}</div>
        <div style="font-size:0.7rem;color:#888;">手札: ${state.players[0].hand.length}枚 / デッキ: ${state.players[0].deck.length}枚</div>
      </div>
      <div class="turn-info">
        <div class="turn-num">ターン ${state.turn + 1}</div>
        <div class="active-label">P${active + 1}のターン</div>
      </div>
      <div class="${p1Class}">
        <div class="player-label p1-color">プレイヤー2</div>
        <div class="player-stat">VP: ${state.players[1].vp} / マナ: ${state.players[1].mana}</div>
        <div style="font-size:0.7rem;color:#888;">手札: ${state.players[1].hand.length}枚 / デッキ: ${state.players[1].deck.length}枚</div>
      </div>
    </div>
  `;

  // ── Board ──
  const boardContainer = document.createElement('div');
  boardContainer.className = 'board-container';
  const boardEl = document.createElement('div');
  boardEl.className = 'board';
  for (let i = 0; i < 9; i++) {
    boardEl.appendChild(buildCell(state, ui, i as CellIndex));
  }
  boardContainer.appendChild(boardEl);
  div.appendChild(boardContainer);

  // ── Action panel ──
  div.appendChild(buildActionPanel(state, ui));

  // ── Hand ──
  div.appendChild(buildHandSection(state, ui, active, opp));

  // ── Log ──
  const logSection = document.createElement('div');
  logSection.className = 'log-section';
  state.log.slice(-8).reverse().forEach(entry => {
    const el = document.createElement('div');
    el.className = 'log-entry ' + entry.type;
    el.textContent = entry.text;
    logSection.appendChild(el);
  });
  div.appendChild(logSection);

  // ── Controls ──
  const { online, myPlayerIndex } = getState();
  const isMyTurn = !online || state.active === myPlayerIndex;

  const controls = document.createElement('div');
  controls.className = 'game-controls';

  if (online && !isMyTurn) {
    const waitLabel = document.createElement('div');
    waitLabel.className = 'action-label';
    waitLabel.style.cssText = 'width:100%;text-align:center;color:#888;padding:8px;';
    waitLabel.textContent = `P${state.active + 1}のターン（相手が操作中）`;
    controls.appendChild(waitLabel);
  } else {
    const endTurnBtn = document.createElement('button');
    endTurnBtn.className = 'btn';
    endTurnBtn.textContent = 'ターン終了';
    endTurnBtn.addEventListener('click', () => onEndTurn(state));
    controls.appendChild(endTurnBtn);
  }
  div.appendChild(controls);

  // ── Overlays ──
  if (ui.mode === 'summon_dir_pending' && ui.dirPickerCell !== null) {
    div.appendChild(buildDirPickerOverlay(
      '向きを選択（召喚）',
      (dir) => onDirPicked(state, ui, dir),
    ));
  }
  if (ui.mode === 'effect_dir_pending' && ui.effectDirContext !== null) {
    div.appendChild(buildDirPickerOverlay(
      '向きを選択',
      (dir) => onEffectDirPicked(state, ui, dir),
    ));
  }
  if (ui.mode === 'ult_dir_pending' && ui.pendingCellIdx !== null) {
    div.appendChild(buildDirPickerOverlay(
      '向きを選択（ウルト）',
      (dir) => onUltDirPicked(state, ui, dir),
    ));
  }

  return div;
}

function buildActionPanel(state: GameState, ui: GameUiExtra): HTMLElement {
  const active = state.active;
  const actionPanel = document.createElement('div');
  actionPanel.className = 'action-panel';

  const cancel = (label = 'キャンセル') => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.textContent = label;
    btn.addEventListener('click', () => setState({ gameUiExtra: resetGameUiExtra() }));
    return btn;
  };

  if (ui.mode === 'char_selected' && ui.selectedBoardIdx !== null) {
    const char = state.board[ui.selectedBoardIdx];
    if (char && char.owner === active) {
      const labelEl = document.createElement('div');
      labelEl.className = 'action-label';
      labelEl.textContent = `${char.keywords.includes('要塞') ? '[要塞] ' : ''}${getCardName(char.cardId)} の行動:`;
      actionPanel.appendChild(labelEl);

      if (!char.hasActed && !char.keywords.includes('要塞') && char.status.brainwashedTurns === 0) {
        const attackBtn = document.createElement('button');
        attackBtn.className = 'btn btn-danger';
        attackBtn.textContent = '攻撃';
        attackBtn.addEventListener('click', () => onAttackClick(state, ui));
        actionPanel.appendChild(attackBtn);
      }

      if (!char.hasRotated && char.status.dirLocked === 0 && char.status.brainwashedTurns === 0) {
        const rotLabel = document.createElement('div');
        rotLabel.className = 'action-label';
        rotLabel.style.width = '100%';
        rotLabel.textContent = '向きを変える:';
        actionPanel.appendChild(rotLabel);
        for (let d = 0; d < 4; d++) {
          if (d === char.dir) continue;
          const rotBtn = document.createElement('button');
          rotBtn.className = 'btn btn-secondary';
          rotBtn.textContent = DIR_ARROWS[d as Direction]!;
          rotBtn.addEventListener('click', () => onRotateClick(state, ui, d as Direction));
          actionPanel.appendChild(rotBtn);
        }
      }

      const ultSpec = getUltSpec(char.cardId);
      if (ultSpec !== null && !char.ultUsed && state.players[active].vp >= ultSpec.vpCost) {
        const timingOk = ultSpec.timing === 'immediate' || state.turn > char.summonedOnTurn;
        if (timingOk) {
          const ultBtn = document.createElement('button');
          ultBtn.className = 'btn btn-warning';
          ultBtn.textContent = `ウルト (${ultSpec.vpCost}VP)`;
          ultBtn.addEventListener('click', () => onUltClick(state, ui));
          actionPanel.appendChild(ultBtn);
        }
      }

      actionPanel.appendChild(cancel());
    }
  } else if (ui.mode === 'discard_pending') {
    const ctx = ui.discardContext;
    if (ctx) {
      const hint = document.createElement('div');
      hint.className = 'action-label';
      hint.style.width = '100%';
      hint.textContent = ctx.mandatory ? '手札を1枚捨てる（必須）' : '手札を1枚捨てる（スキップ可）';
      actionPanel.appendChild(hint);
      if (!ctx.mandatory) {
        const skipBtn = document.createElement('button');
        skipBtn.className = 'btn btn-secondary';
        skipBtn.textContent = 'スキップ';
        skipBtn.addEventListener('click', () => onDiscardSkip(state, ui));
        actionPanel.appendChild(skipBtn);
      }
    }
  } else if (
    ui.mode === 'hand_selected' || ui.mode === 'attack_targeting' ||
    ui.mode === 'effect_targeting' || ui.mode === 'effect_dir_pending'
  ) {
    actionPanel.appendChild(cancel());
    const hint = document.createElement('div');
    hint.className = 'action-label';
    if (ui.mode === 'hand_selected') hint.textContent = '召喚先のマスを選択';
    else if (ui.mode === 'attack_targeting') hint.textContent = '攻撃対象を選択';
    else if (ui.mode === 'effect_dir_pending') hint.textContent = '向きを選択してください（オーバーレイ）';
    else hint.textContent = ui.itemHandIdx !== null ? 'アイテム効果の対象を選択' : '効果の対象を選択';
    actionPanel.appendChild(hint);
  } else if (ui.mode === 'ult_targeting') {
    actionPanel.appendChild(cancel());
    const hint = document.createElement('div');
    hint.className = 'action-label';
    const ultName = ui.pendingCardId ? getCardName(ui.pendingCardId) : 'ウルト';
    hint.textContent = `${ultName}のウルト: 対象を選択`;
    actionPanel.appendChild(hint);
  } else if (ui.mode === 'ult_dir_pending') {
    const hint = document.createElement('div');
    hint.className = 'action-label';
    hint.textContent = '向きを選択してください（オーバーレイ）';
    actionPanel.appendChild(hint);
  } else if (ui.mode === 'element_swap_ally_pending') {
    actionPanel.appendChild(cancel());
    const hint = document.createElement('div');
    hint.className = 'action-label';
    hint.textContent = '入れ替える盤面の味方を選択';
    actionPanel.appendChild(hint);
  } else if (ui.mode === 'element_swap_hand_pending') {
    actionPanel.appendChild(cancel());
    const hint = document.createElement('div');
    hint.className = 'action-label';
    hint.textContent = '入れ替える手札のキャラを選択（緑枠）';
    actionPanel.appendChild(hint);
  }

  return actionPanel;
}

function buildHandSection(state: GameState, ui: GameUiExtra, active: 0 | 1, opp: 0 | 1): HTMLElement {
  const handSection = document.createElement('div');
  handSection.className = 'hand-section';

  const handTitle = document.createElement('h4');
  handTitle.innerHTML = `<span class="${active === 0 ? 'p0-color' : 'p1-color'}">P${active + 1}の手札</span>`;
  handSection.appendChild(handTitle);

  const handCards = document.createElement('div');
  handCards.className = 'hand-cards';
  const isDiscardMode = ui.mode === 'discard_pending';
  const isElementSwapMode = ui.mode === 'element_swap_hand_pending';

  const { online: isOnline, myPlayerIndex } = getState();
  const isMyTurn = !isOnline || myPlayerIndex === active;

  state.players[active].hand.forEach((cardId, idx) => {
    const cost = getCardCost(cardId);
    const isChar = isCharCard(cardId);
    const def = isChar ? getCharDef(cardId) : null;
    const reduction = def ? calcCostReduction(def, state.board, active) : 0;
    const effectiveCost = isChar ? Math.max(2, cost - reduction) : cost;
    const canAfford = state.players[active].mana >= effectiveCost;
    const isSelected = ui.mode === 'hand_selected' && ui.summonHandIdx === idx;
    const isItemSel = ui.mode === 'effect_targeting' && ui.itemHandIdx === idx;
    const isValidSwap = isElementSwapMode && ui.validCells.includes(idx);
    const cardEl = document.createElement('div');
    let cls = 'hand-card';
    if (isSelected || isItemSel) cls += ' selected';
    if (!isDiscardMode && !isElementSwapMode && !canAfford) cls += ' disabled';
    if (isElementSwapMode && !isValidSwap) cls += ' disabled';
    cardEl.className = cls;

    if (isChar && def) {
      const kw = def.keywords.join(' ');
      const costDisplay = reduction > 0 ? `コスト${effectiveCost}(${cost}→${effectiveCost})` : `コスト${cost}`;
      cardEl.innerHTML = `
        <div class="card-name">${getCardName(cardId)}</div>
        <div class="card-cost">${def.attribute} ${costDisplay}</div>
        <div class="card-stats">HP ${def.hp} / ATK ${def.atk}</div>
        ${kw ? `<div class="card-keywords">${kw}</div>` : ''}
        <div class="card-effect">${def.effect}</div>
      `;
    } else {
      const def = getItemDef(cardId);
      cardEl.innerHTML = `
        <div class="card-name">${getCardName(cardId)}</div>
        <div class="card-cost">【アイテム】 コスト${cost}</div>
        <div class="card-effect">${def?.effect ?? ''}</div>
      `;
    }
    if (isElementSwapMode && isMyTurn && isValidSwap) {
      cardEl.style.borderColor = '#00cc66';
      cardEl.addEventListener('click', () => doElementSwap(state, ui, idx));
    } else if (isDiscardMode && isMyTurn) {
      cardEl.style.borderColor = '#ff6b6b';
      cardEl.addEventListener('click', () => onDiscardCardClick(state, ui, idx));
    } else if (!isElementSwapMode && canAfford && isMyTurn) {
      cardEl.addEventListener('click', () => onHandCardClick(state, idx));
    }
    handCards.appendChild(cardEl);
  });
  handSection.appendChild(handCards);

  const oppHandTitle = document.createElement('h4');
  oppHandTitle.innerHTML = `<span class="${opp === 0 ? 'p0-color' : 'p1-color'}">P${opp + 1}の手札</span>: ${state.players[opp].hand.length}枚`;
  handSection.appendChild(oppHandTitle);

  const oppHandCards = document.createElement('div');
  oppHandCards.className = 'hand-cards';
  for (let i = 0; i < state.players[opp].hand.length; i++) {
    const back = document.createElement('div');
    back.className = 'hand-back';
    back.textContent = '?';
    oppHandCards.appendChild(back);
  }
  handSection.appendChild(oppHandCards);
  return handSection;
}

function buildCell(state: GameState, ui: GameUiExtra, idx: CellIndex): HTMLElement {
  const char = state.board[idx];
  const attr = state.boardAttrs[idx] ?? '';
  const cell = document.createElement('div');

  let classes = 'cell';
  if (char) classes += ` owner-${char.owner}`;
  if (ui.validCells.includes(idx) && ui.mode !== 'element_swap_hand_pending') {
    classes += ui.mode === 'attack_targeting' ? ' attack-target' : ' valid';
  }
  if (ui.selectedBoardIdx === idx || ui.effectDirContext?.targetIdx === idx) classes += ' selected';
  cell.className = classes;

  const attrEl = document.createElement('div');
  attrEl.className = 'cell-attr';
  attrEl.textContent = attr;
  cell.appendChild(attrEl);

  if (char) {
    const charDiv = document.createElement('div');
    charDiv.className = 'cell-char';
    const markers = markerStr(char);
    const dimmed = char.hasActed ? 'opacity:0.6;' : '';
    charDiv.innerHTML = `
      <div class="char-dir" style="${dimmed}">${dirArrow(char.dir)}</div>
      <div class="char-name" style="${dimmed}">${getCardName(char.cardId)}</div>
      <div class="char-hp" style="${dimmed}">HP: ${char.hp}/${char.maxHp}</div>
      <div class="char-atk" style="${dimmed}">ATK: ${char.atk}</div>
      ${markers ? `<div class="char-markers">${markers}</div>` : ''}
    `;
    cell.appendChild(charDiv);
  }

  const { online: cellOnline, myPlayerIndex: cellMyIdx } = getState();
  if (!cellOnline || state.active === cellMyIdx) {
    cell.addEventListener('click', () => onCellClick(state, ui, idx));
  }
  return cell;
}

function buildDirPickerOverlay(title: string, onPick: (dir: Direction) => void): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'dir-picker-overlay';
  const picker = document.createElement('div');
  picker.className = 'dir-picker';
  picker.innerHTML = `<h3>${title}</h3>`;

  const grid = document.createElement('div');
  grid.className = 'dir-grid';
  const positions = [
    null, { dir: 0 as Direction, label: '↑' }, null,
    { dir: 3 as Direction, label: '←' }, null, { dir: 1 as Direction, label: '→' },
    null, { dir: 2 as Direction, label: '↓' }, null,
  ];
  positions.forEach(pos => {
    const btn = document.createElement('div');
    btn.className = pos ? 'dir-btn' : 'dir-btn center';
    if (pos) {
      btn.textContent = pos.label;
      btn.addEventListener('click', () => onPick(pos.dir));
    }
    grid.appendChild(btn);
  });
  picker.appendChild(grid);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.style.marginTop = '12px';
  cancelBtn.textContent = 'キャンセル';
  cancelBtn.addEventListener('click', () => setState({ gameUiExtra: resetGameUiExtra() }));
  picker.appendChild(cancelBtn);

  overlay.appendChild(picker);
  return overlay;
}

// ============================================================
// Event handlers
// ============================================================

function onHandCardClick(state: GameState, handIdx: number): void {
  const active = state.active;
  const cardId = state.players[active].hand[handIdx]!;

  if (isCharCard(cardId)) {
    const def = getCharDef(cardId);
    const reduction = def ? calcCostReduction(def, state.board, active) : 0;
    const effectiveCost = Math.max(2, (def?.cost ?? 0) - reduction);
    if (state.players[active].mana < effectiveCost) return;
    const validCells = getValidSummonCells(state.board, active);
    setState({
      gameUiExtra: {
        ...getState().gameUiExtra,
        mode: 'hand_selected',
        summonHandIdx: handIdx,
        validCells,
        selectedBoardIdx: null,
      },
    });
    return;
  }

  // Item card
  const itemDef = getItemDef(cardId);
  if (!itemDef) return;

  const cost = itemDef.cost;
  if (state.players[active].mana < cost) return;

  // Immediate items (no target needed)
  if (cardId === 'item_01' || cardId === 'item_02') {
    doApplyImmediateItem(state, handIdx, cardId);
    return;
  }

  if (cardId === 'item_element_swap') {
    const allAllies = state.board
      .map((c, i) => (c !== null && c.owner === active ? i : -1))
      .filter(i => i >= 0) as CellIndex[];
    if (allAllies.length === 0) { addLog('味方がいません', 'system'); return; }
    setState({
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: 'element_swap_ally_pending',
        validCells: allAllies,
        itemHandIdx: handIdx,
        pendingCardId: cardId,
      },
    });
    return;
  }

  // Items needing a target — figure out valid cells
  const { validCells, hint } = getItemTargets(state, cardId, active);
  setState({
    gameUiExtra: {
      ...resetGameUiExtra(),
      mode: 'effect_targeting',
      validCells,
      itemHandIdx: handIdx,
      pendingCardId: cardId,
    },
  });
  addLog(`アイテム効果: ${hint}`, 'info');
}

function onCellClick(state: GameState, ui: GameUiExtra, idx: CellIndex): void {
  const active = state.active;

  if (ui.mode === 'hand_selected') {
    if (!ui.validCells.includes(idx)) return;
    setState({ gameUiExtra: { ...ui, mode: 'summon_dir_pending', dirPickerCell: idx, validCells: [] } });
    return;
  }
  if (ui.mode === 'attack_targeting') {
    if (!ui.validCells.includes(idx)) return;
    doAttack(state, ui, idx);
    return;
  }
  if (ui.mode === 'effect_targeting') {
    if (!ui.validCells.includes(idx)) return;
    if (ui.itemHandIdx !== null) {
      doResolveItemEffect(state, ui, idx);
    } else {
      doResolveEffect(state, ui, idx);
    }
    return;
  }
  if (ui.mode === 'ult_targeting') {
    if (!ui.validCells.includes(idx)) return;
    onUltTargetClick(state, ui, idx);
    return;
  }
  if (ui.mode === 'element_swap_ally_pending') {
    if (!ui.validCells.includes(idx)) return;
    onElementSwapAllyClick(state, ui, idx);
    return;
  }

  const char = state.board[idx];
  if (char && char.owner === active) {
    setState({ gameUiExtra: { ...resetGameUiExtra(), mode: 'char_selected', selectedBoardIdx: idx } });
    return;
  }
  setState({ gameUiExtra: resetGameUiExtra() });
}

function onAttackClick(state: GameState, ui: GameUiExtra): void {
  if (ui.selectedBoardIdx === null) return;
  const char = state.board[ui.selectedBoardIdx];
  if (!char) return;
  const def = getCharDef(char.cardId);
  if (!def) return;

  const opp = (1 - char.owner) as 0 | 1;
  let targetIdxs: CellIndex[];

  if (def.attack_cells === 'all') {
    targetIdxs = state.board
      .map((c, i) => (c !== null && c.owner === opp ? i : -1))
      .filter(i => i >= 0) as CellIndex[];
  } else if (def.attack_cells === null) {
    targetIdxs = [];
  } else {
    const cells = getAttackCells(ui.selectedBoardIdx, def.attack_cells, char.dir);
    targetIdxs = (cells ?? []).filter(i => {
      const c = state.board[i];
      return c != null && c.owner === opp;
    }) as CellIndex[];
  }

  setState({ gameUiExtra: { ...ui, mode: 'attack_targeting', validCells: targetIdxs } });
}

function onRotateClick(state: GameState, ui: GameUiExtra, newDir: Direction): void {
  if (ui.selectedBoardIdx === null) return;
  const char = state.board[ui.selectedBoardIdx];
  if (!char) return;
  const def = getCharDef(char.cardId);
  if (!def) return;

  const newBoard = [...state.board] as Board;
  newBoard[ui.selectedBoardIdx] = { ...char, dir: newDir, hasRotated: true };
  let newState = appendLog(
    { ...state, board: newBoard },
    `${getCardName(char.cardId)} が ${DIR_ARROWS[newDir]} を向いた`,
    'info',
  );
  newState = spendReactivationMana(newState, ui.selectedBoardIdx, def.reactivation_cost);
  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
}

function onDirPicked(state: GameState, ui: GameUiExtra, dir: Direction): void {
  const cellIdx = ui.dirPickerCell;
  const handIdx = ui.summonHandIdx;
  if (cellIdx === null || handIdx === null) return;
  doSummon(state, handIdx, cellIdx, dir);
}

function onEffectDirPicked(state: GameState, ui: GameUiExtra, dir: Direction): void {
  const ctx = ui.effectDirContext;
  if (!ctx) return;
  const { cardId, summonIdx, targetIdx } = ctx;
  const active = state.active;

  const newBoard = [...state.board] as Board;
  const target = newBoard[targetIdx];
  if (!target) {
    setState({ gameUiExtra: resetGameUiExtra() });
    return;
  }

  newBoard[targetIdx] = { ...target, dir, hasRotated: true };
  let newState = appendLog({ ...state, board: newBoard }, `${getCardName(target.cardId)} を ${DIR_ARROWS[dir]} に向けた`, 'info');

  // trick_v2_12 conditional draw
  if (cardId === 'trick_v2_12') {
    const count = countAlliesInBPosition(newState.board, active);
    if (count >= 3) {
      newState = drawStep(newState);
      newState = appendLog(newState, 'B位置3体以上 → 1ドロー', 'info');
    }
  }

  void summonIdx;
  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) {
    setState({ gameState: newState, screen: 'over' });
    return;
  }
  onEndTurn(newState);
}

function onDiscardCardClick(state: GameState, ui: GameUiExtra, handIdx: number): void {
  const ctx = ui.discardContext;
  if (!ctx) return;
  const { cardId, cellIdx, mandatory } = ctx;
  const active = state.active;

  // Discard the chosen card
  const newHand = [...state.players[active].hand];
  const discarded = newHand.splice(handIdx, 1)[0]!;
  const newDiscard = [...state.players[active].discard, discarded];
  const ps = [...state.players] as typeof state.players;
  ps[active] = { ...ps[active], hand: newHand, discard: newDiscard };
  let newState = appendLog({ ...state, players: ps }, `${getCardName(discarded)} を捨てた`, 'info');

  // Ult discard flow (snipe_v2_09): proceed to enemy targeting
  if (ui.ultCasterIdx !== null) {
    const opp = (1 - active) as 0 | 1;
    const allEnemies = newState.board
      .map((c, i) => (c !== null && c.owner === opp ? i : -1))
      .filter(i => i >= 0) as CellIndex[];
    newState = applyVictoryCheck(newState, null);
    if (newState.winner !== null) { setState({ gameState: newState, screen: 'over' }); return; }
    setState({
      gameState: newState,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: 'ult_targeting',
        validCells: allEnemies,
        ultCasterIdx: ui.ultCasterIdx,
        pendingCardId: ui.pendingCardId,
      },
    });
    return;
  }

  // Apply the effect that required discard
  newState = applyDiscardEffect(newState, cardId, cellIdx, active, true);
  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) {
    setState({ gameState: newState, screen: 'over' });
    return;
  }
  // ultCasterIdx === null means this is a summon-triggered discard effect
  onEndTurn(newState);
  void mandatory;
}

function onDiscardSkip(state: GameState, ui: GameUiExtra): void {
  const ctx = ui.discardContext;
  if (!ctx) {
    setState({ gameUiExtra: resetGameUiExtra() });
    return;
  }
  // Skip: no effect
  setState({ gameState: appendLog(state, 'スキップした', 'info'), gameUiExtra: resetGameUiExtra() });
}

function onEndTurn(state: GameState): void {
  const active = state.active;
  let newState = endTurnCleanup(state);
  newState = applyVictoryCheck(newState, active);
  if (newState.winner !== null) { setState({ gameState: newState, screen: 'over' }); return; }

  newState = startTurnPhase(newState);
  newState = drawStep(newState);
  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) { setState({ gameState: newState, screen: 'over' }); return; }

  const { online } = getState();
  if (online) {
    // オンラインモード: パス画面不要。Firestore 経由で相手に通知
    setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
  } else {
    setState({ gameState: newState, screen: 'pass', passForPlayer: newState.active, gameUiExtra: resetGameUiExtra() });
  }
}

// ============================================================
// Core game actions
// ============================================================

function doSummon(state: GameState, handIdx: number, cellIdx: CellIndex, dir: Direction): void {
  const active = state.active;
  const cardId = state.players[active].hand[handIdx]!;
  const def = getCharDef(cardId);
  if (!def) return;

  const reduction = calcCostReduction(def, state.board, active);
  const effectiveCost = Math.max(2, def.cost - reduction);

  const cellAttr = state.boardAttrs[cellIdx] ?? '虚';
  const hpBonus = attributeHpBonus(def.attribute, cellAttr);
  let instance = createCharInstance(def, active, dir);
  const bonusedHp = Math.max(1, instance.hp + hpBonus);
  instance = { ...instance, hp: bonusedHp, maxHp: bonusedHp, summonedOnTurn: state.turn };

  const newBoard = [...state.board] as Board;
  newBoard[cellIdx] = instance;
  const newHand = [...state.players[active].hand];
  newHand.splice(handIdx, 1);
  const ps = [...state.players] as typeof state.players;
  ps[active] = { ...ps[active], hand: newHand, mana: ps[active].mana - effectiveCost };

  let newState = appendLog(
    { ...state, board: newBoard, players: ps },
    `P${active + 1}: ${def.name} を ${cellIdx + 1}番マスに召喚 (${DIR_ARROWS[dir]})` +
      (hpBonus !== 0 ? ` HP${hpBonus > 0 ? '+' : ''}${hpBonus}` : ''),
    'info',
  );

  // Auto effects
  const effect = getSummonEffect(cardId);
  const r = applyAutoEffects(newState, cellIdx, active, effect.clauses, def.attribute);
  newState = { ...newState, board: r.board, players: r.players };

  // Auto attack
  const { board: boardAfterAtk, results } = resolveSummonAutoAttack(
    newState.board, cellIdx, def, newState.teamDR,
    (id) => {
      const d = getCharDef(id);
      return {
        cost: d?.cost ?? 1,
        attackCells: (d?.attack_cells ?? null) as 'all' | null | [number, number][],
        weaknessCells: (d?.weakness_cells ?? [[-1, 0]]) as [number, number][],
      };
    },
  );
  newState = { ...newState, board: boardAfterAtk };

  let vpGained = 0;
  let oppVpGained = 0;
  for (const { result } of results) {
    if (!result.blocked) {
      if (result.defenderDamage > 0) newState = appendLog(newState, `  → ${result.defenderDamage}ダメージ`, 'damage');
      if (result.vpAwarded > 0) {
        vpGained += result.vpAwarded;
        newState = appendLog(newState, `  → 撃破！ ${result.vpAwarded}VP`, 'system');
      }
    }
    if (result.counterDamage > 0) newState = appendLog(newState, `  ← 反撃 ${result.counterDamage}ダメージ`, 'damage');
    if (result.counterVpAwarded > 0) {
      oppVpGained += result.counterVpAwarded;
      newState = appendLog(newState, `  ← 撃破（反撃）！ ${result.counterVpAwarded}VP`, 'system');
    }
  }
  if (vpGained > 0) {
    const np = [...newState.players] as typeof newState.players;
    np[active] = { ...np[active], vp: np[active].vp + vpGained };
    newState = { ...newState, players: np };
  }
  if (oppVpGained > 0) {
    const opp = (1 - active) as 0 | 1;
    const np = [...newState.players] as typeof newState.players;
    np[opp] = { ...np[opp], vp: np[opp].vp + oppVpGained };
    newState = { ...newState, players: np };
  }

  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) { setState({ gameState: newState, screen: 'over' }); return; }

  if (!effect.hasPending) {
    onEndTurn(newState);
    return;
  }

  // Discard-first effects
  if (cardId === 'aggro_v2_03' || cardId === 'trick_v2_03' || cardId === 'snipe_v2_07') {
    setState({
      gameState: newState,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: 'discard_pending',
        discardContext: { cardId, cellIdx, mandatory: false },
      },
    });
    return;
  }
  if (cardId === 'aggro_v2_10') {
    // Draw 1 first, then mandatory discard
    newState = drawStep(newState);
    newState = appendLog(newState, '1枚ドローした', 'info');
    setState({
      gameState: newState,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: 'discard_pending',
        discardContext: { cardId, cellIdx, mandatory: true },
      },
    });
    return;
  }

  // Target-selection effects
  const { validCells, hint } = getPendingTargets(newState, cardId, cellIdx);
  if (validCells.length === 0) {
    onEndTurn(newState);
    return;
  }
  newState = appendLog(newState, `効果: ${hint}`, 'info');
  setState({
    gameState: newState,
    gameUiExtra: {
      ...resetGameUiExtra(),
      mode: 'effect_targeting',
      validCells,
      pendingCardId: cardId,
      pendingCellIdx: cellIdx,
    },
  });
}

function doAttack(state: GameState, ui: GameUiExtra, targetIdx: CellIndex): void {
  const active = state.active;
  const attackerIdx = ui.selectedBoardIdx;
  if (attackerIdx === null) return;
  const attacker = state.board[attackerIdx];
  if (!attacker) return;
  const def = getCharDef(attacker.cardId);
  if (!def) return;
  const targetChar = state.board[targetIdx];
  if (!targetChar) return;

  const workBoard = state.board.map(c =>
    c === null ? null : { ...c, keywords: [...c.keywords], markers: { ...c.markers }, status: { ...c.status } },
  ) as Board;

  const defDef = getCharDef(targetChar.cardId);
  const result = resolveAttack(workBoard, attackerIdx, targetIdx, {
    teamDR: state.teamDR,
    weaknessCells: (defDef?.weakness_cells ?? [[-1, 0]]) as RelCoord[],
    attackType: def.attack_type === '魔法' ? 'magic' : 'physical',
    defenderCost: defDef?.cost ?? 1,
    attackerCost: def.cost,
    defenderAttackCells: (defDef?.attack_cells ?? null) as 'all' | null | [number, number][],
  });

  // Mark attacker as acted
  if (workBoard[attackerIdx]) workBoard[attackerIdx] = { ...workBoard[attackerIdx]!, hasActed: true };

  let newState = spendReactivationMana({ ...state, board: workBoard }, attackerIdx, def.reactivation_cost);
  const atkName = getCardName(attacker.cardId);
  const defName = getCardName(targetChar.cardId);

  if (result.blocked) {
    newState = appendLog(newState, `${atkName} の攻撃がブロックされた`, 'info');
  } else if (result.evaded) {
    newState = appendLog(newState, `${defName} が攻撃を回避！`, 'info');
  } else {
    newState = appendLog(newState, `${atkName} → ${defName}: ${result.defenderDamage}ダメージ${result.isBlind ? ' [B位置]' : ''}`, 'damage');
    if (result.counterDamage > 0) newState = appendLog(newState, `${defName} ← 反撃: ${result.counterDamage}ダメージ`, 'damage');
    if (result.vpAwarded > 0) {
      const np = [...newState.players] as typeof newState.players;
      np[active] = { ...np[active], vp: np[active].vp + result.vpAwarded };
      newState = { ...newState, players: np };
      newState = appendLog(newState, `${defName} 撃破！ ${result.vpAwarded}VP`, 'system');
    }
    if (result.counterVpAwarded > 0) {
      const opp = (1 - active) as 0 | 1;
      const np = [...newState.players] as typeof newState.players;
      np[opp] = { ...np[opp], vp: np[opp].vp + result.counterVpAwarded };
      newState = { ...newState, players: np };
      newState = appendLog(newState, `${atkName} 撃破（反撃）！ ${result.counterVpAwarded}VP`, 'system');
    }
  }

  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) { setState({ gameState: newState, screen: 'over' }); return; }
  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
}

function doResolveEffect(state: GameState, ui: GameUiExtra, targetIdx: CellIndex): void {
  const cardId = ui.pendingCardId;
  const summonIdx = ui.pendingCellIdx;
  if (!cardId || summonIdx === null) { setState({ gameUiExtra: resetGameUiExtra() }); return; }

  const active = state.active;

  // Two-step effects: transition to direction picker
  if (cardId === 'tank_v2_11' || cardId === 'trick_v2_09' || cardId === 'trick_v2_12') {
    setState({
      gameState: state,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: 'effect_dir_pending',
        effectDirContext: { cardId, summonIdx, targetIdx },
      },
    });
    return;
  }

  let newState = applyPendingEffect(state, cardId, summonIdx, targetIdx, active);
  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) { setState({ gameState: newState, screen: 'over' }); return; }
  onEndTurn(newState);
}

function doResolveItemEffect(state: GameState, ui: GameUiExtra, targetIdx: CellIndex): void {
  const cardId = ui.pendingCardId;
  const handIdx = ui.itemHandIdx;
  if (!cardId || handIdx === null) { setState({ gameUiExtra: resetGameUiExtra() }); return; }
  const active = state.active;

  // Pay cost and discard item from hand
  const cost = getItemDef(cardId)?.cost ?? 0;
  const newHand = [...state.players[active].hand];
  newHand.splice(handIdx, 1);
  const newDiscard = [...state.players[active].discard, cardId];
  const ps = [...state.players] as typeof state.players;
  ps[active] = { ...ps[active], hand: newHand, discard: newDiscard, mana: ps[active].mana - cost };
  let newState = { ...state, players: ps };

  newState = applyItemEffect(newState, cardId, targetIdx, active);
  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) { setState({ gameState: newState, screen: 'over' }); return; }
  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
}

// ============================================================
// Immediate item (no target)
// ============================================================

function doApplyImmediateItem(state: GameState, handIdx: number, cardId: string): void {
  const active = state.active;
  const cost = getItemDef(cardId)?.cost ?? 0;
  const newHand = [...state.players[active].hand];
  newHand.splice(handIdx, 1);
  const newDiscard = [...state.players[active].discard, cardId];
  const ps = [...state.players] as typeof state.players;
  ps[active] = { ...ps[active], hand: newHand, discard: newDiscard, mana: ps[active].mana - cost };
  let newState = { ...state, players: ps };

  if (cardId === 'item_01') {
    newState = drawStep(newState);
    newState = drawStep(newState);
    newState = appendLog(newState, '2枚ドロー！', 'info');
  } else if (cardId === 'item_02') {
    const np = [...newState.players] as typeof newState.players;
    np[active] = { ...np[active], mana: np[active].mana + 1 };
    newState = { ...newState, players: np };
    newState = appendLog(newState, 'マナ+1！', 'info');
  }
  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
}

// ============================================================
// Effect application
// ============================================================

function getPendingTargets(
  state: GameState,
  cardId: string,
  summonIdx: CellIndex,
): { validCells: CellIndex[]; hint: string } {
  const active = state.active;
  const opp = (1 - active) as 0 | 1;
  const adjIdxs = getAdjacentCells(summonIdx);

  const allAllies = state.board
    .map((c, i) => (c !== null && c.owner === active && i !== summonIdx ? i : -1))
    .filter(i => i >= 0) as CellIndex[];
  const adjAllies = adjIdxs.filter(i => { const c = state.board[i]; return c != null && c.owner === active; }) as CellIndex[];
  const adjEnemies = adjIdxs.filter(i => { const c = state.board[i]; return c != null && c.owner === opp; }) as CellIndex[];
  const allEnemies = state.board
    .map((c, i) => (c !== null && c.owner === opp ? i : -1))
    .filter(i => i >= 0) as CellIndex[];

  switch (cardId) {
    // Synergy
    case 'synergy_v2_01': case 'synergy_v2_04': return { validCells: allAllies, hint: '防護を付与する味方を選択' };
    case 'synergy_v2_02': return { validCells: adjAllies, hint: '隣接味方1体に回避付与' };
    case 'synergy_v2_03': return { validCells: adjAllies, hint: '隣接味方1体に貫通付与' };
    case 'synergy_v2_09': return { validCells: adjAllies, hint: '隣接味方1体のHP+1' };
    // Trick
    case 'trick_v2_04': return { validCells: adjAllies, hint: '位置を入れ替える隣接味方を選択' };
    case 'trick_v2_01': return { validCells: allEnemies, hint: '90°回転させる敵を選択' };
    case 'trick_v2_02': return { validCells: adjEnemies, hint: '隣接する敵1体を90°回転' };
    case 'trick_v2_06': return { validCells: adjEnemies, hint: '後退させる隣接敵を選択' };
    case 'trick_v2_09': return { validCells: adjEnemies, hint: '向きを変える隣接敵を選択（→方向選択）' };
    case 'trick_v2_12': return { validCells: allEnemies, hint: '向きを変える敵を選択（→方向選択）' };
    // Tank
    case 'tank_v2_11': return { validCells: allAllies, hint: '向きを変える味方を選択（→方向選択）' };
    // Control
    case 'control_v2_01': return { validCells: adjEnemies, hint: '隣接敵のATK-1' };
    case 'control_v2_02': case 'control_v2_04': case 'control_v2_11': return { validCells: adjEnemies, hint: '隣接敵の再行動コスト+1' };
    case 'control_v2_03': return { validCells: adjEnemies, hint: '隣接敵のATK-2' };
    case 'control_v2_05': case 'control_v2_08': return { validCells: adjEnemies, hint: '隣接敵を90°回転' };
    case 'control_v2_07': return { validCells: allEnemies, hint: '洗脳する敵を選択' };
    case 'control_v2_10': return { validCells: adjEnemies, hint: '隣接敵のATK-1（条件付きドロー・ダメ）' };
    default: return { validCells: [], hint: `${cardId} 効果対象選択（未実装）` };
  }
}

function getItemTargets(
  state: GameState,
  itemId: string,
  active: 0 | 1,
): { validCells: CellIndex[]; hint: string } {
  const opp = (1 - active) as 0 | 1;
  const allAllies = state.board
    .map((c, i) => (c !== null && c.owner === active ? i : -1))
    .filter(i => i >= 0) as CellIndex[];
  const allEnemies = state.board
    .map((c, i) => (c !== null && c.owner === opp ? i : -1))
    .filter(i => i >= 0) as CellIndex[];

  switch (itemId) {
    case 'item_03': return { validCells: allAllies, hint: '味方1体のHP+3' };
    case 'item_04': return { validCells: allAllies, hint: '味方1体のATK+2（このターン）' };
    case 'item_grant_piercing': return { validCells: allAllies, hint: '貫通マーカーを付与する味方を選択' };
    case 'item_grant_protection': return { validCells: allAllies, hint: '防護マーカーを付与する味方を選択' };
    case 'item_reactivate': return { validCells: allAllies, hint: '再行動させる味方を選択' };
    case 'item_self_bounce': return { validCells: allAllies, hint: '手札に戻す味方を選択' };
    case 'item_05': return { validCells: allEnemies, hint: '敵1体のATK-2' };
    case 'item_06': return { validCells: allEnemies, hint: '敵1体に2ダメ' };
    case 'item_14': return { validCells: allEnemies, hint: '180°回転・向き固定する敵を選択' };
    case 'item_20': return { validCells: allEnemies, hint: '90°回転する敵を選択' };
    case 'item_bounce_enemy': {
      const costLE2 = allEnemies.filter(i => {
        const c = state.board[i];
        return c != null && (getCharDef(c.cardId)?.cost ?? 99) <= 2;
      });
      return { validCells: costLE2, hint: 'コスト2以下の敵を手札に戻す' };
    }
    default: return { validCells: [], hint: `${itemId} 対象選択` };
  }
}

// ============================================================
// Ult handlers
// ============================================================

function onUltClick(state: GameState, ui: GameUiExtra): void {
  const casterIdx = ui.selectedBoardIdx;
  if (casterIdx === null) return;
  const caster = state.board[casterIdx];
  if (!caster) return;
  const spec = getUltSpec(caster.cardId);
  if (!spec) return;
  const active = state.active;
  const opp = (1 - active) as 0 | 1;

  // Spend VP, mark used
  const np = [...state.players] as typeof state.players;
  np[active] = { ...np[active], vp: np[active].vp - spec.vpCost };
  const nb = [...state.board] as Board;
  nb[casterIdx] = { ...caster, ultUsed: true };
  let newState = appendLog({ ...state, board: nb, players: np }, `${getCardName(caster.cardId)} がウルト発動！（${spec.vpCost}VP消費）`, 'system');

  // snipe_v2_09: mandatory discard, then select enemy
  if (caster.cardId === 'snipe_v2_09') {
    setState({
      gameState: newState,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: 'discard_pending',
        discardContext: { cardId: caster.cardId, cellIdx: casterIdx, mandatory: true },
        ultCasterIdx: casterIdx,
        pendingCardId: caster.cardId,
      },
    });
    return;
  }

  // snipe_v2_12: self damage 2, then select enemy
  if (caster.cardId === 'snipe_v2_12') {
    const updCaster = newState.board[casterIdx];
    if (updCaster) {
      const nb2 = [...newState.board] as Board;
      const newHp = updCaster.hp - 2;
      nb2[casterIdx] = newHp <= 0 ? null : { ...updCaster, hp: newHp };
      newState = appendLog({ ...newState, board: nb2 }, `自身に2ダメ（ウルトコスト）`, 'damage');
    }
    const allEnemies = newState.board
      .map((c, i) => (c !== null && c.owner === opp ? i : -1))
      .filter(i => i >= 0) as CellIndex[];
    setState({
      gameState: newState,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: 'ult_targeting',
        validCells: allEnemies,
        ultCasterIdx: casterIdx,
        pendingCardId: caster.cardId,
      },
    });
    return;
  }

  // control_v2_09: atk_steal from select_enemy
  if (caster.cardId === 'control_v2_09') {
    const allEnemies = newState.board
      .map((c, i) => (c !== null && c.owner === opp ? i : -1))
      .filter(i => i >= 0) as CellIndex[];
    setState({
      gameState: newState,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: 'ult_targeting',
        validCells: allEnemies,
        ultCasterIdx: casterIdx,
        pendingCardId: caster.cardId,
      },
    });
    return;
  }

  // trick_v2_09: swap_positions with select_any (excluding self)
  if (caster.cardId === 'trick_v2_09') {
    const allUnits = newState.board
      .map((c, i) => (c !== null && i !== casterIdx ? i : -1))
      .filter(i => i >= 0) as CellIndex[];
    setState({
      gameState: newState,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: 'ult_targeting',
        validCells: allUnits,
        ultCasterIdx: casterIdx,
        pendingCardId: caster.cardId,
      },
    });
    return;
  }

  // Direct effects (no target selection)
  newState = applyUltDirectEffect(newState, casterIdx, active);
  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) { setState({ gameState: newState, screen: 'over' }); return; }
  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
}

function onUltTargetClick(state: GameState, ui: GameUiExtra, targetIdx: CellIndex): void {
  const casterIdx = ui.ultCasterIdx;
  if (casterIdx === null) return;
  const casterCardId = ui.pendingCardId ?? state.board[casterIdx]?.cardId;
  if (!casterCardId) return;
  const active = state.active;

  const { newState: afterEffect, continueToDir } = applyUltTargetEffect(state, casterIdx, casterCardId, targetIdx, active);

  if (continueToDir) {
    const checked = applyVictoryCheck(afterEffect, null);
    if (checked.winner !== null) { setState({ gameState: checked, screen: 'over' }); return; }
    setState({
      gameState: checked,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: 'ult_dir_pending',
        pendingCellIdx: casterIdx,
        ultCasterIdx: casterIdx,
      },
    });
    return;
  }

  const newState = applyVictoryCheck(afterEffect, null);
  if (newState.winner !== null) { setState({ gameState: newState, screen: 'over' }); return; }
  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
}

function onUltDirPicked(state: GameState, ui: GameUiExtra, dir: Direction): void {
  const targetCellIdx = ui.pendingCellIdx;
  if (targetCellIdx === null) { setState({ gameUiExtra: resetGameUiExtra() }); return; }
  const nb = [...state.board] as Board;
  const unit = nb[targetCellIdx];
  if (!unit) { setState({ gameUiExtra: resetGameUiExtra() }); return; }
  nb[targetCellIdx] = { ...unit, dir };
  const newState = appendLog({ ...state, board: nb }, `${getCardName(unit.cardId)} を ${DIR_ARROWS[dir]} に向けた`, 'info');
  const checked = applyVictoryCheck(newState, null);
  if (checked.winner !== null) { setState({ gameState: checked, screen: 'over' }); return; }
  setState({ gameState: checked, gameUiExtra: resetGameUiExtra() });
}

// ============================================================
// Element swap (item_element_swap)
// ============================================================

function onElementSwapAllyClick(state: GameState, ui: GameUiExtra, boardIdx: CellIndex): void {
  const handIdx = ui.itemHandIdx;
  if (handIdx === null) return;
  const active = state.active;
  const boardChar = state.board[boardIdx];
  if (!boardChar) return;
  const boardCharDef = getCharDef(boardChar.cardId);
  if (!boardCharDef) return;
  const boardAttr = boardCharDef.attribute;

  const matchingHandIdxs = state.players[active].hand
    .map((cId, i) => {
      if (!isCharCard(cId)) return -1;
      const def = getCharDef(cId);
      return (def && def.attribute === boardAttr) ? i : -1;
    })
    .filter(i => i >= 0) as number[];

  if (matchingHandIdxs.length === 0) {
    addLog(`同属性（${boardAttr}）の手札キャラがいません`, 'system');
    setState({ gameUiExtra: resetGameUiExtra() });
    return;
  }

  setState({
    gameUiExtra: {
      ...resetGameUiExtra(),
      mode: 'element_swap_hand_pending',
      validCells: matchingHandIdxs as CellIndex[],
      itemHandIdx: handIdx,
      pendingCardId: 'item_element_swap',
      pendingCellIdx: boardIdx,
      elementSwapBoardIdx: boardIdx,
    },
  });
  addLog(`同属性（${boardAttr}）の手札キャラを選択してください`, 'info');
}

function doElementSwap(state: GameState, ui: GameUiExtra, swapHandIdx: number): void {
  const itemHandIdx = ui.itemHandIdx;
  const boardIdx = ui.elementSwapBoardIdx ?? ui.pendingCellIdx;
  if (itemHandIdx === null || boardIdx === null) { setState({ gameUiExtra: resetGameUiExtra() }); return; }
  const active = state.active;

  const boardChar = state.board[boardIdx];
  if (!boardChar) { setState({ gameUiExtra: resetGameUiExtra() }); return; }

  const newHand = [...state.players[active].hand];
  const itemCard = newHand.splice(itemHandIdx, 1)[0]!;
  const newDiscard = [...state.players[active].discard, itemCard];

  // Adjust swapHandIdx after item removal
  const adjustedSwapIdx = swapHandIdx > itemHandIdx ? swapHandIdx - 1 : swapHandIdx;
  const swapCardId = newHand[adjustedSwapIdx]!;
  newHand.splice(adjustedSwapIdx, 1);
  newHand.push(boardChar.cardId);

  const cost = getItemDef(itemCard)?.cost ?? 0;
  const ps = [...state.players] as typeof state.players;
  ps[active] = { ...ps[active], hand: newHand, discard: newDiscard, mana: ps[active].mana - cost };

  const swapDef = getCharDef(swapCardId);
  if (!swapDef) { setState({ gameUiExtra: resetGameUiExtra() }); return; }
  const newInstance = { ...createCharInstance(swapDef, active, boardChar.dir), summonedOnTurn: state.turn };
  const newBoard = [...state.board] as Board;
  newBoard[boardIdx] = newInstance;

  let newState = appendLog({ ...state, board: newBoard, players: ps },
    `${getCardName(boardChar.cardId)} と ${getCardName(swapCardId)} を入れ替えた`, 'info');
  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) { setState({ gameState: newState, screen: 'over' }); return; }
  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
}

// ============================================================
// Utility helpers
// ============================================================

function applyVictoryCheck(state: GameState, endOfTurnPlayer: 0 | 1 | null): GameState {
  const winner = evalVictory(state, endOfTurnPlayer);
  if (winner === null) return state;
  let reason: string;
  if (winner === -1) reason = '引き分け（時間切れ）';
  else if (endOfTurnPlayer !== null) reason = `P${endOfTurnPlayer + 1}が5マス支配`;
  else reason = `P${winner + 1}がVP15達成`;
  return { ...state, winner, winReason: reason };
}

function addLog(text: string, type: 'system' | 'damage' | 'heal' | 'info'): void {
  const { gameState } = getState();
  if (!gameState) return;
  setState({ gameState: appendLog(gameState, text, type) });
}
