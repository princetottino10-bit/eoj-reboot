import { setState, getState, resetGameUiExtra } from './app.js';
import type { GameState, CellIndex, Direction, Board } from '../engine/types.js';
import {
  getCharDef, getItemDef, isCharCard, getCardName, getCardCost, CARD_DB, FACTION_NAMES,
} from '../data/cards.js';
import { getAttackCells, getAdjacentCells } from '../engine/board.js';
import { resolveAttack } from '../engine/combat.js';
import { createCharInstance, attributeHpBonus } from '../engine/gamestate.js';
import { applyAutoEffects, resolveSummonAutoAttack, getSummonEffect } from '../engine/effects.js';
import { startTurnPhase, drawStep, endTurnCleanup } from '../engine/turn.js';
import { evalVictory } from '../engine/victory.js';

export interface GameUiExtra {
  mode: 'idle' | 'hand_selected' | 'summon_dir_pending' | 'char_selected' | 'attack_targeting' | 'effect_targeting';
  validCells: CellIndex[];
  dirPickerCell: CellIndex | null;
  summonHandIdx: number | null;
  selectedBoardIdx: CellIndex | null;
  pendingCardId: string | null;
  pendingCellIdx: CellIndex | null;
}

const DIR_ARROWS = ['↑', '→', '↓', '←'] as const;

function dirArrow(dir: Direction): string { return DIR_ARROWS[dir]; }

function markerStr(char: NonNullable<Board[number]>): string {
  const parts: string[] = [];
  if (char.markers.protection > 0) parts.push(`防${char.markers.protection}`);
  if (char.markers.evasion > 0) parts.push(`回${char.markers.evasion}`);
  if (char.markers.piercing > 0) parts.push(`貫${char.markers.piercing}`);
  if (char.markers.quickness > 0) parts.push(`先${char.markers.quickness}`);
  if (char.keywords.includes('防護')) parts.push('防護');
  if (char.keywords.includes('回避')) parts.push('回避');
  if (char.keywords.includes('貫通')) parts.push('貫通');
  if (char.keywords.includes('先制')) parts.push('先制');
  if (char.keywords.includes('不動')) parts.push('不動');
  if (char.keywords.includes('カバー')) parts.push('カバー');
  if (char.keywords.includes('要塞')) parts.push('要塞');
  return parts.join(' ');
}

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
      <div class="${p0Class}" id="p0-info">
        <div class="player-label p0-color">プレイヤー1</div>
        <div class="player-stat">VP: ${state.players[0].vp} / マナ: ${state.players[0].mana}</div>
        <div style="font-size:0.7rem;color:#888;">手札: ${state.players[0].hand.length}枚 / デッキ: ${state.players[0].deck.length}枚</div>
      </div>
      <div class="turn-info">
        <div class="turn-num">ターン ${state.turn + 1}</div>
        <div class="active-label">P${active + 1}のターン</div>
      </div>
      <div class="${p1Class}" id="p1-info">
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
    const cell = buildCell(state, ui, i as CellIndex);
    boardEl.appendChild(cell);
  }
  boardContainer.appendChild(boardEl);
  div.appendChild(boardContainer);

  // ── Action panel (mode-dependent) ──
  const actionPanel = document.createElement('div');
  actionPanel.className = 'action-panel';

  if (ui.mode === 'char_selected' && ui.selectedBoardIdx !== null) {
    const char = state.board[ui.selectedBoardIdx];
    if (char && char.owner === active) {
      const labelEl = document.createElement('div');
      labelEl.className = 'action-label';
      labelEl.textContent = `${char.keywords.includes('要塞') ? '[要塞] ' : ''}${getCardName(char.cardId)} の行動:`;
      actionPanel.appendChild(labelEl);

      // Attack button
      if (!char.hasActed && !char.keywords.includes('要塞')) {
        const attackBtn = document.createElement('button');
        attackBtn.className = 'btn btn-danger';
        attackBtn.textContent = '攻撃';
        attackBtn.addEventListener('click', () => onAttackClick(state, ui));
        actionPanel.appendChild(attackBtn);
      }

      // Rotate buttons
      if (!char.hasRotated && char.status.dirLocked === 0) {
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
          rotBtn.title = ['上', '右', '下', '左'][d]!;
          rotBtn.addEventListener('click', () => onRotateClick(state, ui, d as Direction));
          actionPanel.appendChild(rotBtn);
        }
      }

      // Cancel
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-secondary';
      cancelBtn.textContent = 'キャンセル';
      cancelBtn.addEventListener('click', () => setState({ gameUiExtra: resetGameUiExtra() }));
      actionPanel.appendChild(cancelBtn);
    }
  } else if (ui.mode === 'hand_selected' || ui.mode === 'attack_targeting' || ui.mode === 'effect_targeting') {
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.addEventListener('click', () => setState({ gameUiExtra: resetGameUiExtra() }));
    actionPanel.appendChild(cancelBtn);

    const hint = document.createElement('div');
    hint.className = 'action-label';
    if (ui.mode === 'hand_selected') hint.textContent = '召喚先のマスを選択';
    else if (ui.mode === 'attack_targeting') hint.textContent = '攻撃対象を選択';
    else hint.textContent = '効果の対象を選択';
    actionPanel.appendChild(hint);
  }

  div.appendChild(actionPanel);

  // ── Hand ──
  const handSection = document.createElement('div');
  handSection.className = 'hand-section';

  // Active player's hand
  const handTitle = document.createElement('h4');
  handTitle.innerHTML = `<span class="${active === 0 ? 'p0-color' : 'p1-color'}">P${active + 1}の手札</span>`;
  handSection.appendChild(handTitle);

  const handCards = document.createElement('div');
  handCards.className = 'hand-cards';

  state.players[active].hand.forEach((cardId, idx) => {
    const cost = getCardCost(cardId);
    const canAfford = state.players[active].mana >= cost;
    const isChar = isCharCard(cardId);
    const isSelected = ui.mode === 'hand_selected' && ui.summonHandIdx === idx;
    const cardEl = document.createElement('div');
    cardEl.className = 'hand-card' + (isSelected ? ' selected' : '') + (!canAfford ? ' disabled' : '');
    cardEl.innerHTML = `
      <div class="card-name">${getCardName(cardId)}</div>
      <div class="card-cost">コスト: ${cost}</div>
      <div class="card-type">${isChar ? '【キャラ】' : '【アイテム】'}</div>
    `;
    if (canAfford) {
      cardEl.addEventListener('click', () => onHandCardClick(state, idx));
    }
    handCards.appendChild(cardEl);
  });
  handSection.appendChild(handCards);

  // Opponent hand (face down)
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
  div.appendChild(handSection);

  // ── Log ──
  const logSection = document.createElement('div');
  logSection.className = 'log-section';
  const recent = state.log.slice(-8).reverse();
  recent.forEach(entry => {
    const el = document.createElement('div');
    el.className = 'log-entry ' + entry.type;
    el.textContent = entry.text;
    logSection.appendChild(el);
  });
  div.appendChild(logSection);

  // ── Controls ──
  const controls = document.createElement('div');
  controls.className = 'game-controls';
  const endTurnBtn = document.createElement('button');
  endTurnBtn.className = 'btn';
  endTurnBtn.textContent = 'ターン終了';
  endTurnBtn.addEventListener('click', () => onEndTurn(state));
  controls.appendChild(endTurnBtn);
  div.appendChild(controls);

  // ── Direction picker overlay ──
  if (ui.mode === 'summon_dir_pending' && ui.dirPickerCell !== null) {
    div.appendChild(buildDirPicker(state, ui));
  }

  return div;
}

function buildCell(state: GameState, ui: GameUiExtra, idx: CellIndex): HTMLElement {
  const char = state.board[idx];
  const cell = document.createElement('div');
  const attr = state.boardAttrs[idx] ?? '';

  let classes = 'cell';
  if (char) classes += ` owner-${char.owner}`;
  if (ui.validCells.includes(idx)) {
    classes += ui.mode === 'attack_targeting' ? ' attack-target' : ' valid';
  }
  if (ui.selectedBoardIdx === idx) classes += ' selected';
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

  cell.addEventListener('click', () => onCellClick(state, ui, idx));
  return cell;
}

function buildDirPicker(state: GameState, ui: GameUiExtra): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'dir-picker-overlay';
  const picker = document.createElement('div');
  picker.className = 'dir-picker';
  picker.innerHTML = `<h3>向きを選択</h3>`;

  const grid = document.createElement('div');
  grid.className = 'dir-grid';

  const positions = [
    null, { dir: 0 as Direction, label: '↑' }, null,
    { dir: 3 as Direction, label: '←' }, null, { dir: 1 as Direction, label: '→' },
    null, { dir: 2 as Direction, label: '↓' }, null,
  ];

  positions.forEach(pos => {
    const btn = document.createElement('div');
    if (!pos) {
      btn.className = 'dir-btn center';
    } else {
      btn.className = 'dir-btn';
      btn.textContent = pos.label;
      btn.addEventListener('click', () => {
        onDirPicked(state, ui, pos.dir);
      });
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

  if (!isCharCard(cardId)) {
    // Item handling: for now mark as TODO
    addLog('アイテム効果は未実装です', 'system');
    return;
  }

  // Find valid (empty) cells
  const validCells: CellIndex[] = state.board
    .map((c, i) => (c === null ? i : -1))
    .filter(i => i >= 0) as CellIndex[];

  setState({
    gameUiExtra: {
      ...getState().gameUiExtra,
      mode: 'hand_selected',
      summonHandIdx: handIdx,
      validCells,
      selectedBoardIdx: null,
    },
  });
}

function onCellClick(state: GameState, ui: GameUiExtra, idx: CellIndex): void {
  const active = state.active;

  if (ui.mode === 'hand_selected') {
    if (!ui.validCells.includes(idx)) return;
    // Proceed to direction picking
    setState({
      gameUiExtra: {
        ...ui,
        mode: 'summon_dir_pending',
        dirPickerCell: idx,
        validCells: [],
      },
    });
    return;
  }

  if (ui.mode === 'attack_targeting') {
    if (!ui.validCells.includes(idx)) return;
    doAttack(state, ui, idx);
    return;
  }

  if (ui.mode === 'effect_targeting') {
    if (!ui.validCells.includes(idx)) return;
    doResolveEffect(state, ui, idx);
    return;
  }

  // idle or char_selected: select own char
  const char = state.board[idx];
  if (char && char.owner === active) {
    setState({
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: 'char_selected',
        selectedBoardIdx: idx,
      },
    });
    return;
  }

  // Deselect
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

  setState({
    gameUiExtra: {
      ...ui,
      mode: 'attack_targeting',
      validCells: targetIdxs,
    },
  });
}

function onRotateClick(state: GameState, ui: GameUiExtra, newDir: Direction): void {
  if (ui.selectedBoardIdx === null) return;
  const char = state.board[ui.selectedBoardIdx];
  if (!char) return;

  const newBoard = [...state.board] as Board;
  newBoard[ui.selectedBoardIdx] = { ...char, dir: newDir, hasRotated: true };

  const newState = appendLog(
    { ...state, board: newBoard },
    `${getCardName(char.cardId)} が ${DIR_ARROWS[newDir]} を向いた`,
    'info',
  );

  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
}

function onDirPicked(state: GameState, ui: GameUiExtra, dir: Direction): void {
  const cellIdx = ui.dirPickerCell;
  const handIdx = ui.summonHandIdx;
  if (cellIdx === null || handIdx === null) return;

  doSummon(state, handIdx, cellIdx, dir);
}

function onEndTurn(state: GameState): void {
  const active = state.active;
  let newState = endTurnCleanup(state);
  newState = applyVictoryCheck(newState, active);

  if (newState.winner !== null) {
    setState({ gameState: newState, screen: 'over' });
    return;
  }

  // Start next player's turn
  newState = startTurnPhase(newState);
  newState = drawStep(newState);
  newState = applyVictoryCheck(newState, null);

  if (newState.winner !== null) {
    setState({ gameState: newState, screen: 'over' });
    return;
  }

  setState({
    gameState: newState,
    screen: 'pass',
    passForPlayer: newState.active,
    gameUiExtra: resetGameUiExtra(),
  });
}

// ============================================================
// Game actions
// ============================================================

function doSummon(state: GameState, handIdx: number, cellIdx: CellIndex, dir: Direction): void {
  const active = state.active;
  const cardId = state.players[active].hand[handIdx]!;
  const def = getCharDef(cardId);
  if (!def) return;

  const cost = def.cost;
  const cellAttr = state.boardAttrs[cellIdx] ?? '虚';
  const hpBonus = attributeHpBonus(def.attribute, cellAttr);

  let instance = createCharInstance(def, active, dir);
  const bonusedHp = Math.max(1, instance.hp + hpBonus);
  instance = { ...instance, hp: bonusedHp, maxHp: bonusedHp };

  const newBoard = [...state.board] as Board;
  newBoard[cellIdx] = instance;

  const newHand = [...state.players[active].hand];
  newHand.splice(handIdx, 1);

  const newPlayers: typeof state.players = [
    { ...state.players[0] },
    { ...state.players[1] },
  ];
  newPlayers[active] = { ...newPlayers[active], hand: newHand, mana: newPlayers[active].mana - cost };

  let newState = appendLog(
    { ...state, board: newBoard, players: newPlayers },
    `P${active + 1}: ${def.name} を ${cellIdx + 1}番マスに召喚 (${DIR_ARROWS[dir]})` +
      (hpBonus !== 0 ? ` HP${hpBonus > 0 ? '+' : ''}${hpBonus}` : ''),
    'info',
  );

  // Apply auto effects
  const effect = getSummonEffect(cardId);
  if (effect.autoEffects.length > 0) {
    const r = applyAutoEffects(newState.board, newState.players, cellIdx, active, effect.autoEffects);
    newState = { ...newState, board: r.board, players: r.players };
  }

  // Auto attack
  const { board: boardAfterAtk, results } = resolveSummonAutoAttack(
    newState.board,
    cellIdx,
    def,
    newState.teamDR,
    (id) => getCharDef(id)?.cost ?? 1,
  );
  newState = { ...newState, board: boardAfterAtk };

  let vpGained = 0;
  for (const { result } of results) {
    if (!result.blocked) {
      if (result.defenderDamage > 0) {
        newState = appendLog(newState, `  → ${result.defenderDamage}ダメージ`, 'damage');
      }
      if (result.vpAwarded > 0) {
        vpGained += result.vpAwarded;
        newState = appendLog(newState, `  → 撃破！ ${result.vpAwarded}VP獲得`, 'system');
      }
    }
    if (result.counterDamage > 0) {
      newState = appendLog(newState, `  ← 反撃 ${result.counterDamage}ダメージ`, 'damage');
    }
  }

  if (vpGained > 0) {
    const ps = [...newState.players] as typeof newState.players;
    ps[active] = { ...ps[active], vp: ps[active].vp + vpGained };
    newState = { ...newState, players: ps };
  }

  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) {
    setState({ gameState: newState, screen: 'over' });
    return;
  }

  // Pending effect
  if (effect.hasPending) {
    const { validCells, hint } = getPendingTargets(newState, cardId, cellIdx);
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
    return;
  }

  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
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
  const defenderCost = getCharDef(targetChar.cardId)?.cost ?? 1;

  const workBoard = state.board.map(c =>
    c === null ? null : { ...c, keywords: [...c.keywords], markers: { ...c.markers }, status: { ...c.status } },
  ) as Board;

  const result = resolveAttack(workBoard, attackerIdx, targetIdx, {
    teamDR: state.teamDR,
    ...(def.weakness_cells !== undefined ? { weaknessCells: def.weakness_cells as import('../engine/types.js').RelCoord[] } : {}),
    attackType: def.attack_type === '魔法' ? 'magic' : 'physical',
    defenderCost,
  });

  let newState = { ...state, board: workBoard };

  // Mark attacker as acted
  if (workBoard[attackerIdx]) {
    workBoard[attackerIdx] = { ...workBoard[attackerIdx]!, hasActed: true };
  }

  const atkName = getCardName(attacker.cardId);
  const defName = getCardName(targetChar.cardId);

  if (result.blocked) {
    newState = appendLog(newState, `${atkName} の攻撃がブロックされた`, 'info');
  } else if (result.evaded) {
    newState = appendLog(newState, `${defName} が攻撃を回避！`, 'info');
  } else {
    newState = appendLog(newState, `${atkName} → ${defName}: ${result.defenderDamage}ダメージ${result.isBlind ? ' [B位置]' : ''}`, 'damage');
    if (result.counterDamage > 0) {
      newState = appendLog(newState, `${defName} ← 反撃: ${result.counterDamage}ダメージ`, 'damage');
    }
    if (result.vpAwarded > 0) {
      const ps = [...newState.players] as typeof newState.players;
      ps[active] = { ...ps[active], vp: ps[active].vp + result.vpAwarded };
      newState = { ...newState, players: ps };
      newState = appendLog(newState, `${defName} 撃破！ ${result.vpAwarded}VP`, 'system');
    }
  }

  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) {
    setState({ gameState: newState, screen: 'over' });
    return;
  }

  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
}

function doResolveEffect(state: GameState, ui: GameUiExtra, targetIdx: CellIndex): void {
  const cardId = ui.pendingCardId;
  const summonIdx = ui.pendingCellIdx;
  if (!cardId || summonIdx === null) {
    setState({ gameUiExtra: resetGameUiExtra() });
    return;
  }

  const active = state.active;
  let newState = applyPendingEffect(state, cardId, summonIdx, targetIdx, active);
  newState = applyVictoryCheck(newState, null);

  if (newState.winner !== null) {
    setState({ gameState: newState, screen: 'over' });
    return;
  }

  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
}

function applyPendingEffect(
  state: GameState,
  cardId: string,
  summonIdx: CellIndex,
  targetIdx: CellIndex,
  active: 0 | 1,
): GameState {
  const newBoard = [...state.board] as Board;

  const giveMarker = (marker: 'protection' | 'evasion' | 'piercing' | 'quickness') => {
    const c = newBoard[targetIdx];
    if (c && c.owner === active) {
      newBoard[targetIdx] = { ...c, markers: { ...c.markers, [marker]: c.markers[marker] + 1 } };
    }
  };

  switch (cardId) {
    // Tank
    case 'tank_v2_11': {
      // rotate ally: targetIdx = the ally to rotate
      // Direction is not selectable here — we just rotate to face the summoner
      // Simplified: rotate clockwise
      const c = newBoard[targetIdx];
      if (c && c.owner === active) {
        const newDir = ((c.dir + 1) % 4) as Direction;
        newBoard[targetIdx] = { ...c, dir: newDir, hasRotated: true };
      }
      return appendLog({ ...state, board: newBoard }, '味方の向きを変えた', 'info');
    }
    // Synergy
    case 'synergy_v2_01':
    case 'synergy_v2_04':
      giveMarker('protection');
      return appendLog({ ...state, board: newBoard }, '防護マーカーを付与した', 'info');
    case 'synergy_v2_02':
      giveMarker('evasion');
      return appendLog({ ...state, board: newBoard }, '回避マーカーを付与した', 'info');
    case 'synergy_v2_03':
      giveMarker('piercing');
      return appendLog({ ...state, board: newBoard }, '貫通マーカーを付与した', 'info');
    case 'synergy_v2_09': {
      const c = newBoard[targetIdx];
      if (c && c.owner === active) {
        newBoard[targetIdx] = { ...c, hp: Math.min(c.hp + 1, c.maxHp) };
      }
      return appendLog({ ...state, board: newBoard }, 'HPを1回復させた', 'heal');
    }
    case 'trick_v2_04': {
      // Swap positions with an ally
      const summoned = newBoard[summonIdx];
      const target = newBoard[targetIdx];
      newBoard[summonIdx] = target ?? null;
      newBoard[targetIdx] = summoned ?? null;
      return appendLog({ ...state, board: newBoard }, '味方と位置を入れ替えた', 'info');
    }
    // Control cards that are PENDING — simplified effects
    // These are complex effects; for now we apply a simplified version
    case 'control_v2_01':
    case 'control_v2_02':
    case 'control_v2_03':
    case 'control_v2_04':
    case 'control_v2_05':
    case 'control_v2_07':
    case 'control_v2_08':
    case 'control_v2_09':
    case 'control_v2_10':
    case 'control_v2_11':
      return appendLog(state, `${cardId} の効果（未実装）をスキップ`, 'system');
    case 'aggro_v2_03':
    case 'aggro_v2_10':
    case 'snipe_v2_07':
      return appendLog(state, `${cardId} の効果（未実装）をスキップ`, 'system');
    default:
      return appendLog(state, `${cardId} の効果（未実装）をスキップ`, 'system');
  }
}

function getPendingTargets(
  state: GameState,
  cardId: string,
  summonIdx: CellIndex,
): { validCells: CellIndex[]; hint: string } {
  const active = state.active;
  const adjIdxs = getAdjacentCells(summonIdx);
  const allAllies = state.board
    .map((c, i) => (c !== null && c.owner === active && i !== summonIdx ? i : -1))
    .filter(i => i >= 0) as CellIndex[];
  const adjAllies = adjIdxs.filter(i => {
    const c = state.board[i];
    return c != null && c.owner === active;
  }) as CellIndex[];

  switch (cardId) {
    case 'tank_v2_11':
      return { validCells: allAllies, hint: '向きを変える味方を選択' };
    case 'synergy_v2_01':
    case 'synergy_v2_04':
      return { validCells: allAllies, hint: '防護を付与する味方を選択' };
    case 'synergy_v2_02':
      return { validCells: adjAllies, hint: '隣接味方1体に回避付与' };
    case 'synergy_v2_03':
      return { validCells: adjAllies, hint: '隣接味方1体に貫通付与' };
    case 'synergy_v2_09':
      return { validCells: adjAllies, hint: '隣接味方1体のHP+1' };
    case 'trick_v2_04':
      return { validCells: adjAllies, hint: '位置を入れ替える隣接味方を選択' };
    default:
      return { validCells: [], hint: `${cardId} の効果対象選択（未実装）` };
  }
}

// ============================================================
// Helpers
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

function appendLog(state: GameState, text: string, type: 'system' | 'damage' | 'heal' | 'info'): GameState {
  return { ...state, log: [...state.log, { text, type }] };
}

function addLog(text: string, type: 'system' | 'damage' | 'heal' | 'info'): void {
  const { gameState } = getState();
  if (!gameState) return;
  setState({ gameState: appendLog(gameState, text, type) });
}
