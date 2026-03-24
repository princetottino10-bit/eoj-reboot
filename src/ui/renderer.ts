import type { AttackRange, AttackType, BlindPattern, Direction, Element } from '../types/card';
import { isCharacter } from '../types/card';
import type { GameState, Position, PlayerId, BoardCharacter } from '../types/game';
import { getValidTargetCells, getBlindPositions, getEffectiveBlindPattern, getRangeOffsets } from '../engine/range';
import { describeKeywords, describeEffects, getCardTooltip } from './card-text';

const ELEMENT_COLORS: Record<Element, string> = {
  faust: '#e74c3c',
  geist: '#e84393',
  licht: '#f1c40f',
  nacht: '#2c3e6b',
  nicht: '#95a5a6',
};

const ELEMENT_KANJI: Record<Element, string> = {
  faust: '拳',
  geist: '念',
  licht: '光',
  nacht: '闇',
  nicht: '虚',
};

const DIRECTION_ARROWS: Record<Direction, string> = {
  up: '↑',
  right: '→',
  down: '↓',
  left: '←',
};

const PLAYER_COLORS: Record<PlayerId, string> = {
  0: '#3498db',
  1: '#e74c3c',
};

export class GameRenderer {
  private container: HTMLElement;
  private cellClickCallback: ((pos: Position) => void) | null = null;
  private cardClickCallback: ((cardId: string) => void) | null = null;
  private actionButtonCallback: ((action: string) => void) | null = null;
  private contextMenuCallback: ((pos: Position) => void) | null = null;
  private messageTimeout: number | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  onCellClick(callback: (pos: Position) => void): void {
    this.cellClickCallback = callback;
  }

  onCellRightClick(callback: (pos: Position) => void): void {
    this.contextMenuCallback = callback;
  }

  onCardClick(callback: (cardId: string) => void): void {
    this.cardClickCallback = callback;
  }

  onActionButton(callback: (action: string) => void): void {
    this.actionButtonCallback = callback;
  }

  render(state: GameState): void {
    // Remove any lingering tooltips from previous render
    document.querySelectorAll('.board-tooltip').forEach(el => el.remove());
    this.container.innerHTML = '';

    // Title
    const title = document.createElement('h1');
    title.className = 'game-title';
    title.textContent = '異能学園総選挙';
    this.container.appendChild(title);

    // Player 2 hand (opponent, face-down)
    this.container.appendChild(this.renderOpponentHand(state, 1));

    // Player 2 info
    this.container.appendChild(this.renderPlayerInfo(state, 1));

    // Board
    this.container.appendChild(this.renderBoard(state));

    // Player 1 info
    this.container.appendChild(this.renderPlayerInfo(state, 0));

    // Player 1 hand (visible)
    this.container.appendChild(this.renderPlayerHand(state, 0));

    // Game log
    this.container.appendChild(this.renderGameLog(state));

    // Action buttons
    this.container.appendChild(this.renderActionButtons(state));

    // Message area
    const msgArea = document.createElement('div');
    msgArea.id = 'message-area';
    this.container.appendChild(msgArea);
  }

  private renderOpponentHand(state: GameState, playerId: PlayerId): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'hand-area opponent-hand';
    const label = document.createElement('div');
    label.className = 'hand-label';
    label.textContent = `${state.players[playerId].name} の手札`;
    wrap.appendChild(label);

    const cards = document.createElement('div');
    cards.className = 'hand-cards';
    const hand = state.players[playerId].hand;
    for (let i = 0; i < hand.length; i++) {
      const cardEl = document.createElement('div');
      cardEl.className = 'card card-back';
      cardEl.innerHTML = '<span class="card-back-icon">?</span>';
      cards.appendChild(cardEl);
    }
    wrap.appendChild(cards);
    return wrap;
  }

  private renderPlayerHand(state: GameState, playerId: PlayerId): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'hand-area player-hand';
    const label = document.createElement('div');
    label.className = 'hand-label';
    label.textContent = `${state.players[playerId].name} の手札`;
    wrap.appendChild(label);

    const cards = document.createElement('div');
    cards.className = 'hand-cards';
    const hand = state.players[playerId].hand;
    for (const card of hand) {
      const cardEl = document.createElement('div');
      cardEl.className = 'card card-face';
      if (state.currentPlayer === playerId) {
        cardEl.classList.add('clickable');
      }

      cardEl.title = getCardTooltip(card);

      if (isCharacter(card)) {
        const kwText = card.keywords.length > 0
          ? `<div class="card-keywords">${describeKeywords(card.keywords)}</div>` : '';
        const fxText = card.effects.length > 0
          ? `<div class="card-effect-text">${describeEffects(card.effects)}</div>` : '';
        const rangeHtml = this.renderAttackRangeHtml(card.attackRange, 'up', card.attackType, card.blindPattern);
        const atkTypeLabel = card.attackType === 'magic' ? '魔' : '物';
        cardEl.innerHTML = `
          <div class="card-header">
            <span class="card-cost-badge">💎${card.manaCost}</span>
            <span class="card-element-badge" style="color:${ELEMENT_COLORS[card.element]}">${ELEMENT_KANJI[card.element]}</span>
          </div>
          <div class="card-name">${card.name}</div>
          <div class="card-body">
            <div class="card-pattern-wrap">${rangeHtml}</div>
            <div class="card-stat-col">
              <div class="card-hp-big">HP ${card.hp}</div>
              <div class="card-atk-big">ATK ${card.atk}</div>
              <div class="card-atktype">${atkTypeLabel}</div>
            </div>
          </div>
          <div class="card-react-cost">再行動: 💎${card.activateCost ?? 3}</div>
          ${kwText}${fxText}
        `;
      } else {
        const fxText = describeEffects(card.effects);
        cardEl.innerHTML = `
          <div class="card-header">
            <span class="card-cost-badge">💎${card.manaCost}</span>
            <span class="card-element-badge" style="opacity:0.4">ITEM</span>
          </div>
          <div class="card-name">${card.name}</div>
          <div class="card-effect-text card-item-fx">${fxText}</div>
        `;
      }

      cardEl.addEventListener('click', () => {
        if (this.cardClickCallback && state.currentPlayer === playerId) {
          this.cardClickCallback(card.id);
        }
      });
      cards.appendChild(cardEl);
    }
    wrap.appendChild(cards);
    return wrap;
  }

  private renderPlayerInfo(state: GameState, playerId: PlayerId): HTMLElement {
    const player = state.players[playerId];
    const isCurrent = state.currentPlayer === playerId;
    const info = document.createElement('div');
    info.className = `player-info ${isCurrent ? 'current-player' : ''}`;
    info.style.borderColor = PLAYER_COLORS[playerId];

    info.innerHTML = `
      <span class="player-name" style="color:${PLAYER_COLORS[playerId]}">${player.name}</span>
      <span class="player-mana">💎 ${player.mana}</span>
      <span class="player-deck">🃏 ${player.deck.length}</span>
      ${isCurrent ? `<span class="phase-indicator">${this.phaseLabel(state.phase)}</span>` : ''}
    `;
    return info;
  }

  private phaseLabel(phase: string): string {
    switch (phase) {
      case 'action': return 'アクションフェイズ';
      case 'summon': return '召喚フェイズ';
      case 'resolution': return 'リゾリューション';
      case 'game_over': return 'ゲーム終了';
      default: return phase;
    }
  }

  private renderBoard(state: GameState): HTMLElement {
    const boardWrap = document.createElement('div');
    boardWrap.className = 'board-container';

    const board = document.createElement('div');
    board.className = 'board';

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const cell = state.board[row][col];
        const cellEl = document.createElement('div');
        cellEl.className = 'cell';
        cellEl.dataset.row = String(row);
        cellEl.dataset.col = String(col);

        // Element background
        const elColor = ELEMENT_COLORS[cell.element];
        cellEl.style.backgroundColor = this.hexToRgba(elColor, 0.15);

        // Element icon in corner
        const elemIcon = document.createElement('div');
        elemIcon.className = 'cell-element';
        elemIcon.style.color = elColor;
        elemIcon.textContent = ELEMENT_KANJI[cell.element];
        cellEl.appendChild(elemIcon);

        if (cell.character) {
          cellEl.appendChild(this.renderBoardCharacter(cell.character));
          cellEl.style.borderColor = PLAYER_COLORS[cell.character.owner];
          cellEl.classList.add(`owner-p${cell.character.owner}`);
          this.attachCellTooltip(cellEl, cell.character);
        }

        cellEl.addEventListener('click', () => {
          if (this.cellClickCallback) {
            this.cellClickCallback({ row, col });
          }
        });

        cellEl.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (this.contextMenuCallback) {
            this.contextMenuCallback({ row, col });
          }
        });

        board.appendChild(cellEl);
      }
    }

    boardWrap.appendChild(board);
    return boardWrap;
  }

  private renderBoardCharacter(ch: BoardCharacter): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'board-char';
    if (ch.hasActedThisTurn) wrap.classList.add('char-acted');
    wrap.title = getCardTooltip(ch.card);

    // Header: element + name
    const header = document.createElement('div');
    header.className = 'char-header';
    const elemSpan = document.createElement('span');
    elemSpan.className = 'char-element';
    elemSpan.style.color = ELEMENT_COLORS[ch.card.element];
    elemSpan.textContent = ELEMENT_KANJI[ch.card.element];
    header.appendChild(elemSpan);
    const nameSpan = document.createElement('span');
    nameSpan.className = 'char-name';
    nameSpan.textContent = ch.card.name;
    header.appendChild(nameSpan);
    wrap.appendChild(header);

    if (ch.card.keywords.length > 0) {
      const kw = document.createElement('div');
      kw.className = 'char-keywords';
      kw.textContent = describeKeywords(ch.card.keywords);
      wrap.appendChild(kw);
    }

    const stats = document.createElement('div');
    stats.className = 'char-stats';

    const hpRatio = ch.currentHp / (ch.card.hp + 2);
    const hpColor = hpRatio > 0.6 ? '#2ecc71' : hpRatio > 0.3 ? '#f39c12' : '#e74c3c';

    stats.innerHTML = `
      <span class="char-hp" style="color:${hpColor}">HP${ch.currentHp}</span>
      <span class="char-atk">ATK${this.getEffectiveAtk(ch)}</span>
    `;
    wrap.appendChild(stats);

    // Direction + react cost
    const bottomRow = document.createElement('div');
    bottomRow.className = 'char-bottom';
    const dir = document.createElement('span');
    dir.className = 'char-direction';
    dir.textContent = DIRECTION_ARROWS[ch.direction];
    bottomRow.appendChild(dir);
    const reactCost = ch.card.activateCost ?? 3;
    const reactSpan = document.createElement('span');
    reactSpan.className = 'char-react-cost';
    reactSpan.textContent = `💎${reactCost}`;
    bottomRow.appendChild(reactSpan);
    wrap.appendChild(bottomRow);

    return wrap;
  }

  private attachCellTooltip(cellEl: HTMLElement, ch: BoardCharacter): void {
    let tooltip: HTMLElement | null = null;

    cellEl.addEventListener('mouseenter', (e) => {
      tooltip = this.createBoardTooltip(ch);
      document.body.appendChild(tooltip);
      this.positionTooltip(tooltip, cellEl);
    });

    cellEl.addEventListener('mouseleave', () => {
      if (tooltip) {
        tooltip.remove();
        tooltip = null;
      }
    });
  }

  private positionTooltip(tooltip: HTMLElement, anchor: HTMLElement): void {
    const rect = anchor.getBoundingClientRect();
    const gap = 8;

    // Default: show to the right of the cell
    let left = rect.right + gap;
    let top = rect.top;

    // After rendering, check if it goes off-screen and adjust
    requestAnimationFrame(() => {
      const tipRect = tooltip.getBoundingClientRect();

      // If goes off the right edge, show to the left
      if (left + tipRect.width > window.innerWidth - 8) {
        left = rect.left - tipRect.width - gap;
      }
      // If still off-screen (left), center horizontally below
      if (left < 8) {
        left = Math.max(8, rect.left + rect.width / 2 - tipRect.width / 2);
        top = rect.bottom + gap;
      }
      // If goes off the bottom, shift up
      if (top + tipRect.height > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - tipRect.height - 8);
      }

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    });

    // Set initial position (may be adjusted above)
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  private createBoardTooltip(ch: BoardCharacter): HTMLElement {
    const card = ch.card;
    const el = document.createElement('div');
    el.className = 'board-tooltip';

    const effectiveAtk = this.getEffectiveAtk(ch);
    const maxHp = card.hp + 2; // same formula used in renderBoardCharacter
    const atkTypeLabel = card.attackType === 'magic' ? '魔法' : '物理';
    const elemColor = ELEMENT_COLORS[card.element];
    const elemKanji = ELEMENT_KANJI[card.element];

    // Keywords
    const kwHtml = card.keywords.length > 0
      ? `<div class="tip-keywords">${describeKeywords(card.keywords)}</div>` : '';

    // Effects
    const fxHtml = card.effects.length > 0
      ? `<div class="tip-effects">${describeEffects(card.effects)}</div>` : '';

    // Buffs
    let buffsHtml = '';
    if (ch.buffs.length > 0) {
      const buffLines = ch.buffs.map(b => {
        const durText = b.duration !== undefined ? ` (${b.duration}T)` : '';
        switch (b.type) {
          case 'atk_up':   return `<span class="tip-buff-up">ATK+${b.value}${durText}</span>`;
          case 'atk_down': return `<span class="tip-buff-down">ATK-${b.value}${durText}</span>`;
          case 'sealed':   return `<span class="tip-buff-down">封印${durText}</span>`;
          default:         return '';
        }
      }).filter(Boolean);
      if (buffLines.length > 0) {
        buffsHtml = `<div class="tip-buffs">${buffLines.join(' ')}</div>`;
      }
    }

    // Attack range display
    const rangeHtml = this.renderAttackRangeHtml(card.attackRange, ch.direction, card.attackType, card.blindPattern);

    el.innerHTML = `
      <div class="tip-header">
        <span class="tip-name">${card.name}</span>
        <span class="tip-element" style="color:${elemColor}">${elemKanji}</span>
      </div>
      <div class="tip-stats">
        <span class="tip-hp">HP ${ch.currentHp} / ${maxHp}</span>
        <span class="tip-atk">ATK ${effectiveAtk}${effectiveAtk !== card.atk ? ` (base ${card.atk})` : ''}</span>
        <span class="tip-atktype">${atkTypeLabel}</span>
      </div>
      ${kwHtml}${fxHtml}${buffsHtml}
      <div class="tip-pattern-label">攻撃範囲</div>
      <div class="tip-pattern">${rangeHtml}</div>
    `;

    return el;
  }

  private getEffectiveAtk(ch: BoardCharacter): number {
    let atk = ch.card.atk;
    for (const buff of ch.buffs) {
      if (buff.type === 'atk_up') atk += buff.value;
      if (buff.type === 'atk_down') atk -= buff.value;
    }
    return Math.max(0, atk);
  }

  private renderGameLog(state: GameState): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'game-log';
    const label = document.createElement('div');
    label.className = 'log-label';
    label.textContent = 'Game Log';
    wrap.appendChild(label);

    const logList = document.createElement('div');
    logList.className = 'log-list';
    const entries = state.log.slice(-10);
    for (const entry of entries) {
      const line = document.createElement('div');
      line.className = 'log-entry';
      line.innerHTML = `<span class="log-turn">T${entry.turn}</span> <span style="color:${PLAYER_COLORS[entry.player]}">P${entry.player + 1}</span> ${entry.message}`;
      logList.appendChild(line);
    }
    wrap.appendChild(logList);

    // Auto scroll to bottom
    requestAnimationFrame(() => {
      logList.scrollTop = logList.scrollHeight;
    });

    return wrap;
  }

  private renderActionButtons(state: GameState): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'action-buttons';

    if (state.phase === 'game_over') {
      const winBtn = document.createElement('button');
      winBtn.className = 'btn btn-primary';
      winBtn.textContent = '🎉 New Game';
      winBtn.addEventListener('click', () => {
        if (this.actionButtonCallback) this.actionButtonCallback('new_game');
      });
      wrap.appendChild(winBtn);
      return wrap;
    }

    const endTurnBtn = document.createElement('button');
    endTurnBtn.className = 'btn btn-end-turn';
    endTurnBtn.textContent = 'ターン終了';
    endTurnBtn.addEventListener('click', () => {
      if (this.actionButtonCallback) this.actionButtonCallback('end_turn');
    });
    wrap.appendChild(endTurnBtn);

    return wrap;
  }

  highlightCells(positions: Position[], className: string): void {
    for (const pos of positions) {
      const cell = this.container.querySelector(
        `.cell[data-row="${pos.row}"][data-col="${pos.col}"]`,
      );
      if (cell) {
        cell.classList.add(className);
      }
    }
  }

  clearHighlights(): void {
    const cells = this.container.querySelectorAll('.cell');
    cells.forEach((cell) => {
      cell.classList.remove('highlight-summon', 'highlight-attack', 'highlight-rotate');
    });
  }

  showDirectionPicker(pos: Position, callback: (dir: Direction) => void): void {
    // Remove any existing picker
    this.removeDirectionPicker();

    const cell = this.container.querySelector(
      `.cell[data-row="${pos.row}"][data-col="${pos.col}"]`,
    );
    if (!cell) return;

    const overlay = document.createElement('div');
    overlay.className = 'direction-picker';

    const directions: { dir: Direction; label: string; cls: string }[] = [
      { dir: 'up', label: '↑', cls: 'dir-up' },
      { dir: 'right', label: '→', cls: 'dir-right' },
      { dir: 'down', label: '↓', cls: 'dir-down' },
      { dir: 'left', label: '←', cls: 'dir-left' },
    ];

    for (const { dir, label, cls } of directions) {
      const btn = document.createElement('button');
      btn.className = `dir-btn ${cls}`;
      btn.textContent = label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeDirectionPicker();
        callback(dir);
      });
      overlay.appendChild(btn);
    }

    cell.appendChild(overlay);
  }

  private removeDirectionPicker(): void {
    const existing = this.container.querySelector('.direction-picker');
    if (existing) existing.remove();
  }

  showMessage(msg: string): void {
    let msgArea = document.getElementById('message-area');
    if (!msgArea) {
      msgArea = document.createElement('div');
      msgArea.id = 'message-area';
      this.container.appendChild(msgArea);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    msgArea.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-fade');
      setTimeout(() => toast.remove(), 500);
    }, 2500);
  }

  showWinOverlay(state: GameState): void {
    const overlay = document.createElement('div');
    overlay.className = 'win-overlay';

    const winnerName = state.winner !== null ? state.players[state.winner].name : '???';
    const winnerColor = state.winner !== null ? PLAYER_COLORS[state.winner] : '#fff';

    overlay.innerHTML = `
      <div class="win-content">
        <h2 class="win-title">Game Over</h2>
        <p class="win-player" style="color:${winnerColor}">${winnerName} の勝利!</p>
        <button class="btn btn-primary win-btn" id="win-new-game">New Game</button>
      </div>
    `;

    this.container.appendChild(overlay);

    const btn = overlay.querySelector('#win-new-game');
    if (btn) {
      btn.addEventListener('click', () => {
        overlay.remove();
        if (this.actionButtonCallback) this.actionButtonCallback('new_game');
      });
    }
  }

  private renderAttackRangeHtml(range: AttackRange, direction: Direction = 'up', attackType: AttackType = 'physical', blindPattern?: BlindPattern): string {
    const RANGE_LABELS: Record<AttackRange, string> = {
      'front1': '正面1',
      'front_back': '前後1',
      'front2_line': '槍2',
      'front_row': '正面3',
      'magic': '全域',
      'snipe': '狙撃',
      'cross': '十字',
      'front_left': 'L字左',
      'front_right': 'L字右',
    };

    // === 左: 攻撃範囲グリッド ===
    const offsets = getRangeOffsets(range);
    // snipe は5x5、それ以外は3x3（front2_lineは自キャラを下段に置いて3x3に収める）
    const needsLarge = range === 'snipe';
    const atkGridSize = needsLarge ? 5 : 3;
    const atkCenterCol = Math.floor(atkGridSize / 2);
    // front2_line: 自キャラを下段（row=2）に配置して前方2マスを表現
    const atkCenterRow = (!needsLarge && range === 'front2_line') ? atkGridSize - 1 : Math.floor(atkGridSize / 2);

    const attackGrid: boolean[][] = Array.from({ length: atkGridSize }, () => Array(atkGridSize).fill(false));
    if (range === 'magic') {
      for (let r = 0; r < atkGridSize; r++) {
        for (let c = 0; c < atkGridSize; c++) {
          if (r !== atkCenterRow || c !== atkCenterCol) attackGrid[r][c] = true;
        }
      }
    } else {
      for (const { relRow, relCol } of offsets) {
        let dr: number, dc: number;
        switch (direction) {
          case 'up':    dr = relRow; dc = relCol; break;
          case 'down':  dr = -relRow; dc = -relCol; break;
          case 'right': dr = relCol; dc = -relRow; break;
          case 'left':  dr = -relCol; dc = relRow; break;
        }
        const ar = atkCenterRow + dr;
        const ac = atkCenterCol + dc;
        if (ar >= 0 && ar < atkGridSize && ac >= 0 && ac < atkGridSize) {
          attackGrid[ar][ac] = true;
        }
      }
    }

    const activeClass = attackType === 'magic' ? 'pat-magic' : 'pat-active';
    let atkHtml = `<div class="atk-pattern${needsLarge ? ' atk-pattern-5x5' : ''}">`;
    for (let r = 0; r < atkGridSize; r++) {
      for (let c = 0; c < atkGridSize; c++) {
        const isSelf = r === atkCenterRow && c === atkCenterCol;
        const isActive = attackGrid[r][c];
        let cls = needsLarge ? 'pat-cell pat-cell-sm' : 'pat-cell';
        if (isSelf) cls += ' pat-self';
        else if (isActive) cls += ` ${activeClass}`;
        atkHtml += `<div class="${cls}"></div>`;
      }
    }
    atkHtml += '</div>';

    // === 右: 防御グリッド (反撃範囲 + ブラインド) 常に3x3 ===
    const pattern = getEffectiveBlindPattern({ attackType, blindPattern });
    const blindCells = getBlindPositions({ row: 1, col: 1 }, direction, pattern);
    const blindGrid: boolean[][] = [[false,false,false],[false,false,false],[false,false,false]];
    for (const bc of blindCells) {
      blindGrid[bc.row][bc.col] = true;
    }

    // 反撃範囲 = 攻撃範囲のうち隣接セルのみ（3x3で表示）
    const counterGrid: boolean[][] = [[false,false,false],[false,false,false],[false,false,false]];
    if (range === 'magic') {
      // 魔法: 反撃範囲は全隣接（ただしブラインドでないセルのみ反撃可能）
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          if (r === 1 && c === 1) continue;
          if (Math.abs(r - 1) + Math.abs(c - 1) === 1 && !blindGrid[r][c]) {
            counterGrid[r][c] = true;
          }
        }
      }
    } else {
      // 物理: 攻撃範囲内の隣接セルが反撃可能
      const cells3x3 = getValidTargetCells({ row: 1, col: 1 }, direction, range);
      for (const cell of cells3x3) {
        if (Math.abs(cell.row - 1) + Math.abs(cell.col - 1) === 1 && !blindGrid[cell.row][cell.col]) {
          counterGrid[cell.row][cell.col] = true;
        }
      }
    }

    let defHtml = '<div class="atk-pattern">';
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const isSelf = r === 1 && c === 1;
        const isCounter = counterGrid[r][c];
        const isBlind = blindGrid[r][c];
        let cls = 'pat-cell';
        let label = '';
        if (isSelf) cls += ' pat-self';
        else if (isBlind) { cls += ' pat-blind'; label = 'B'; }
        else if (isCounter) cls += ' pat-counter';
        defHtml += `<div class="${cls}">${label}</div>`;
      }
    }
    defHtml += '</div>';

    const ffWarning = range === 'front_back' ? '<div class="ff-warning">⚠ 味方にも当たる</div>' : '';
    return `<div class="atk-range-label">${RANGE_LABELS[range]}</div>
      <div class="dual-grid-wrap">
        <div class="dual-grid-col"><div class="grid-label">攻撃</div>${atkHtml}</div>
        <div class="dual-grid-col"><div class="grid-label">防御</div>${defHtml}</div>
      </div>${ffWarning}`;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
}
