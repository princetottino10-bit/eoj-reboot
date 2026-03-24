import type { Card, CharacterCard, Direction } from '../types/card';
import { isCharacter, isItem } from '../types/card';
import type { GameState, Position, PlayerId } from '../types/game';
import { ALL_CHARACTERS, ALL_ITEMS, ITEM_SETS } from '../data/cards';
import { createGameState, drawCards } from '../engine/state';
import { startTurn, executeSummon, executeAttack, executeRotate, executeItem, endTurn, getAttackTargets } from '../engine/actions';
import { getAdjacentPositions } from '../engine/utils';
import { GameRenderer } from './renderer';
import { runAiTurn } from './simple-ai';

type ItemTargetType = 'none' | 'ally' | 'enemy' | 'cell';

type UIMode =
  | { type: 'idle' }
  | { type: 'summon'; cardId: string }
  | { type: 'attack' }
  | { type: 'select_target'; attackerPos: Position; targets: Position[] }
  | { type: 'item'; cardId: string; targetType: ItemTargetType };

export class GameController {
  private state: GameState;
  private renderer: GameRenderer;
  private mode: UIMode = { type: 'idle' };
  private aiVsAi: boolean = false;
  private aiVsAiRunning: boolean = false;

  constructor(container: HTMLElement) {
    this.renderer = new GameRenderer(container);
    this.state = this.createInitialState();

    this.renderer.onCellClick((pos) => this.handleCellClick(pos));
    this.renderer.onCellRightClick((pos) => this.handleRightClick(pos));
    this.renderer.onCardClick((cardId) => this.handleCardClick(cardId));
    this.renderer.onActionButton((action) => this.handleActionButton(action));
  }

  start(): void {
    // Draw initial 5 cards for each player
    const p0 = drawCards(this.state.players[0], 5);
    const p1 = drawCards(this.state.players[1], 5);
    this.state = {
      ...this.state,
      players: [p0, p1],
    };

    // Start player 0's first turn
    this.state = startTurn(this.state);
    this.renderState();
  }

  private createInitialState(): GameState {
    // P1: aggro+snipe セットB / P2: tank+control セットD
    const deck1 = this.buildDualDeck(['aggro', 'snipe'], 'B');
    const deck2 = this.buildDualDeck(['tank', 'control'], 'D');

    return createGameState(deck1, deck2);
  }

  private buildDualDeck(factions: [string, string], itemSetKey: string): Card[] {
    const chars1 = ALL_CHARACTERS.filter((c) => c.faction === factions[0]);
    const chars2 = ALL_CHARACTERS.filter((c) => c.faction === factions[1]);
    const items = ITEM_SETS[itemSetKey as keyof typeof ITEM_SETS];

    const charCards: Card[] = [
      ...chars1.map((c, i) => ({ ...c, id: `${c.id}_d${i}` })),
      ...chars2.map((c, i) => ({ ...c, id: `${c.id}_d${i}` })),
    ];
    const itemCards: Card[] = items.map((item, i) => ({ ...item, id: `${item.id}_d${i}` }));

    return [...charCards, ...itemCards];
  }

  /** AI vs AI モードを有効化 */
  startAiVsAi(): void {
    this.aiVsAi = true;
    this.aiVsAiRunning = true;
    this.runAiVsAiLoop();
  }

  private runAiVsAiLoop(): void {
    if (!this.aiVsAiRunning || this.state.phase === 'game_over') {
      this.renderer.render(this.state);
      if (this.state.phase === 'game_over') {
        this.renderer.showWinOverlay(this.state);
      }
      return;
    }

    this.state = runAiTurn(this.state);
    this.renderer.render(this.state);

    if (this.state.phase === 'game_over') {
      this.renderer.showWinOverlay(this.state);
      return;
    }

    setTimeout(() => this.runAiVsAiLoop(), 500);
  }

  private renderState(): void {
    this.renderer.render(this.state);

    if (this.state.phase === 'game_over') {
      this.renderer.showWinOverlay(this.state);
      return;
    }

    // AI vs AI モードなら両方AI
    if (this.aiVsAi) return; // ループが別で管理

    // Player 2 (AI) のターンなら自動実行
    if (this.state.currentPlayer === 1) {
      setTimeout(() => {
        this.state = runAiTurn(this.state);
        this.renderer.render(this.state);
        if (this.state.phase === 'game_over') {
          this.renderer.showWinOverlay(this.state);
        }
      }, 800);
    }
  }

  private handleCardClick(cardId: string): void {
    if (this.state.phase === 'game_over') return;

    const pid = this.state.currentPlayer;
    const player = this.state.players[pid];
    const card = player.hand.find((c) => c.id === cardId);
    if (!card) return;

    if (isCharacter(card)) {
      // Enter summon mode
      this.mode = { type: 'summon', cardId };
      this.renderer.clearHighlights();

      const validPositions = this.getValidSummonPositions();
      this.renderer.highlightCells(validPositions, 'highlight-summon');
      this.renderer.showMessage(`${card.name} を召喚: セルを選択してください`);
    } else if (isItem(card)) {
      // Check mana
      if (player.mana < card.manaCost) {
        this.renderer.showMessage(`マナ不足（コスト: 💎${card.manaCost}）`);
        return;
      }

      // Determine target requirement from effects
      const targetType = this.getItemTargetType(card);

      if (targetType === 'none') {
        // No target needed — use immediately
        this.doItem(cardId);
      } else {
        // Enter item targeting mode
        this.mode = { type: 'item', cardId, targetType };
        this.renderer.clearHighlights();

        const validTargets = this.getItemTargets(targetType);
        if (validTargets.length === 0) {
          this.renderer.showMessage('有効な対象がいません');
          this.mode = { type: 'idle' };
          return;
        }
        const highlightClass = targetType === 'ally' ? 'highlight-summon' : 'highlight-attack';
        this.renderer.highlightCells(validTargets, highlightClass);
        this.renderer.showMessage(`${card.name}: 対象を選択してください`);
      }
    }
  }

  private getItemTargetType(card: { effects: { target: string }[] }): ItemTargetType {
    for (const effect of card.effects) {
      if (effect.target === 'target_enemy') return 'enemy';
      if (effect.target === 'target_ally') return 'ally';
      if (effect.target === 'target_cell') return 'cell';
    }
    return 'none';
  }

  private getItemTargets(targetType: ItemTargetType): Position[] {
    const pid = this.state.currentPlayer;
    const positions: Position[] = [];

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const cell = this.state.board[row][col];
        if (targetType === 'ally' && cell.character && cell.character.owner === pid) {
          positions.push({ row, col });
        } else if (targetType === 'enemy' && cell.character && cell.character.owner !== pid) {
          positions.push({ row, col });
        } else if (targetType === 'cell') {
          positions.push({ row, col });
        }
      }
    }
    return positions;
  }

  private handleCellClick(pos: Position): void {
    if (this.state.phase === 'game_over') return;
    const pid = this.state.currentPlayer;

    if (this.mode.type === 'summon') {
      // Attempt to summon at this position
      const validPositions = this.getValidSummonPositions();
      const isValid = validPositions.some((p) => p.row === pos.row && p.col === pos.col);
      if (!isValid) {
        this.renderer.showMessage('そのセルには召喚できません');
        return;
      }

      // Show direction picker
      this.renderer.clearHighlights();
      const cardId = this.mode.cardId;
      this.renderer.showDirectionPicker(pos, (dir: Direction) => {
        this.doSummon(cardId, pos, dir);
      });
      return;
    }

    // In item targeting mode: click on valid target to use item
    if (this.mode.type === 'item') {
      const validTargets = this.getItemTargets(this.mode.targetType);
      const isValid = validTargets.some(t => t.row === pos.row && t.col === pos.col);
      if (isValid) {
        this.doItem(this.mode.cardId, pos);
        return;
      }
      // Click elsewhere cancels
      this.mode = { type: 'idle' };
      this.renderer.clearHighlights();
      this.renderer.showMessage('アイテム使用をキャンセルしました');
      return;
    }

    // In target selection mode: click on highlighted enemy to attack
    if (this.mode.type === 'select_target') {
      const isTarget = this.mode.targets.some(t => t.row === pos.row && t.col === pos.col);
      if (isTarget) {
        this.doAttack(this.mode.attackerPos, pos);
        return;
      }
      // Click elsewhere cancels target selection
      this.mode = { type: 'idle' };
      this.renderer.clearHighlights();
      this.renderer.showMessage('攻撃をキャンセルしました');
      return;
    }

    // Click on own character on the board -> attack mode
    const cell = this.state.board[pos.row][pos.col];
    if (cell.character && cell.character.owner === pid) {
      if (cell.character.hasActedThisTurn) {
        this.renderer.showMessage('このキャラクターは既に行動済みです');
        return;
      }
      const activateCost = cell.character.card.activateCost ?? 3;
      if (this.state.players[pid].mana < activateCost) {
        this.renderer.showMessage(`マナ不足（再行動コスト: 💎${activateCost}）`);
        return;
      }
      // 常にターゲット選択（全攻撃が単体選択）
      const targets = getAttackTargets(this.state, pos, cell.character);
      if (targets.length === 0) {
        this.renderer.showMessage('攻撃範囲に敵がいません');
        return;
      }
      this.renderer.clearHighlights();
      this.renderer.highlightCells(targets, 'highlight-attack');
      this.renderer.showMessage(`${cell.character.card.name}: 攻撃対象を選択（💎${activateCost}）`);
      this.mode = { type: 'select_target', attackerPos: pos, targets };
    }
  }

  private handleRightClick(pos: Position): void {
    if (this.state.phase === 'game_over') return;
    const pid = this.state.currentPlayer;

    const cell = this.state.board[pos.row][pos.col];
    if (cell.character && cell.character.owner === pid) {
      if (cell.character.hasRotatedThisTurn) {
        this.renderer.showMessage('このキャラクターは既に回転済みです');
        return;
      }
      // Show direction picker for rotate
      this.renderer.showDirectionPicker(pos, (dir: Direction) => {
        this.doRotate(pos, dir);
      });
    }
  }

  private handleActionButton(action: string): void {
    if (action === 'end_turn') {
      this.doEndTurn();
    } else if (action === 'new_game') {
      this.state = this.createInitialState();
      this.mode = { type: 'idle' };
      this.start();
    }
  }

  private doSummon(cardId: string, pos: Position, dir: Direction): void {
    try {
      this.state = executeSummon(this.state, cardId, pos, dir);
      this.mode = { type: 'idle' };

      // Summoning always ends the turn
      if (this.state.phase !== 'game_over') {
        this.state = endTurn(this.state);
      }
      this.renderState();
    } catch (e: any) {
      this.renderer.showMessage(e.message || 'エラーが発生しました');
      this.mode = { type: 'idle' };
      this.renderState();
    }
  }

  private doAttack(pos: Position, targetPos?: Position): void {
    try {
      this.state = executeAttack(this.state, pos, targetPos);
      this.mode = { type: 'idle' };
      this.renderer.clearHighlights();
      this.renderState();
    } catch (e: any) {
      this.renderer.showMessage(e.message || 'エラーが発生しました');
    }
  }

  private doItem(cardId: string, targetPos?: Position): void {
    try {
      this.state = executeItem(this.state, cardId, targetPos);
      this.mode = { type: 'idle' };
      this.renderer.clearHighlights();
      this.renderState();
    } catch (e: any) {
      this.renderer.showMessage(e.message || 'エラーが発生しました');
      this.mode = { type: 'idle' };
    }
  }

  private doRotate(pos: Position, dir: Direction): void {
    try {
      this.state = executeRotate(this.state, pos, dir);
      this.mode = { type: 'idle' };
      this.renderState();
    } catch (e: any) {
      this.renderer.showMessage(e.message || 'エラーが発生しました');
    }
  }

  private doEndTurn(): void {
    try {
      this.state = endTurn(this.state);
      this.mode = { type: 'idle' };
      this.renderState();
    } catch (e: any) {
      this.renderer.showMessage(e.message || 'エラーが発生しました');
    }
  }

  private getValidSummonPositions(): Position[] {
    const pid = this.state.currentPlayer;
    const positions: Position[] = [];

    // Check if player has any characters on the board
    let hasChars = false;
    for (const row of this.state.board) {
      for (const cell of row) {
        if (cell.character && cell.character.owner === pid) {
          hasChars = true;
          break;
        }
      }
      if (hasChars) break;
    }

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const cell = this.state.board[row][col];
        if (cell.character !== null) continue; // occupied

        if (!hasChars) {
          // No characters on board: can summon anywhere empty
          positions.push({ row, col });
        } else {
          // Must be adjacent to any existing character (any player's)
          const adj = getAdjacentPositions({ row, col });
          const adjacentToChar = adj.some(
            (p) => this.state.board[p.row][p.col].character !== null,
          );
          if (adjacentToChar) {
            positions.push({ row, col });
          }
        }
      }
    }

    return positions;
  }
}
