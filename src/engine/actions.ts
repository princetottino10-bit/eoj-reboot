import type { CharacterCard, Direction, ItemCard } from '../types/card';
import type {
  BoardCharacter,
  Cell,
  CombatEvent,
  GameLogEntry,
  GameState,
  PlayerId,
  Player,
  Position,
} from '../types/game';
import { calculateHpBonus, getAdjacentPositions } from './utils';
import { getAttackTargets as getRangeTargets, isInAttackRange, isBlindSpot } from './range';
import { drawCards, checkWinCondition, getWinnerReason } from './state';
import { resolveEffects, resolveGlobalTrigger, tickBuffDurations, resolveItemEffects, findCharacters } from './effects';
import {
  EXTRA_SUMMON_MANA_COST,
  MAX_CHARACTERS_PER_PLAYER,
  MAX_SUMMONS_PER_TURN,
  getAceEffectiveCost,
  getKillVpForManaCost,
} from './rules';

// ========================================
// Helpers: deep-clone & logging
// ========================================

function cloneState(state: GameState): GameState {
  return structuredClone(state);
}

function addLog(state: GameState, message: string): GameState {
  const entry: GameLogEntry = {
    turn: state.turnNumber,
    player: state.currentPlayer,
    message,
  };
  return {
    ...state,
    log: [...state.log, entry],
  };
}

function addCombatEvent(state: GameState, event: CombatEvent): GameState {
  return {
    ...state,
    combatEvents: [...state.combatEvents, event],
  };
}

function applyWinnerIfAny(state: GameState, checkTerritory: boolean = false): GameState {
  const winner = checkWinCondition(state, checkTerritory);
  if (winner === null) {
    return state;
  }
  return {
    ...state,
    winner,
    winnerReason: getWinnerReason(state, winner, checkTerritory),
    phase: 'game_over',
  };
}

// ========================================
// Board helpers
// ========================================

function getCell(state: GameState, pos: Position): Cell {
  return state.board[pos.row][pos.col];
}

function setCell(state: GameState, pos: Position, cell: Cell): GameState {
  const newBoard = state.board.map((row, r) =>
    row.map((c, col) => (r === pos.row && col === pos.col ? cell : c)),
  );
  return { ...state, board: newBoard };
}

function setCharacterOnCell(
  state: GameState,
  pos: Position,
  character: BoardCharacter | null,
): GameState {
  const cell = getCell(state, pos);
  return setCell(state, pos, { ...cell, character });
}

function updatePlayer(state: GameState, playerId: PlayerId, updates: Partial<Player>): GameState {
  const players: [Player, Player] = [
    playerId === 0 ? { ...state.players[0], ...updates } : state.players[0],
    playerId === 1 ? { ...state.players[1], ...updates } : state.players[1],
  ];
  return { ...state, players };
}

function hasCharactersOnBoard(state: GameState, playerId: PlayerId): boolean {
  for (const row of state.board) {
    for (const cell of row) {
      if (cell.character && cell.character.owner === playerId) {
        return true;
      }
    }
  }
  return false;
}

function isAdjacentToAnyCharacter(state: GameState, pos: Position): boolean {
  const adjacent = getAdjacentPositions(pos);
  for (const adj of adjacent) {
    if (state.board[adj.row][adj.col].character !== null) {
      return true;
    }
  }
  return false;
}

// ========================================
// Combat internals
// ========================================

/**
 * 攻撃範囲内の有効ターゲットを返す。
 * range.ts の getAttackTargets を利用。
 */
export function getAttackTargets(
  state: GameState,
  position: Position,
  character: BoardCharacter,
): Position[] {
  // range_expand チェック: 条件を満たせば攻撃範囲を差し替え
  const expandEffect = character.card.effects.find(e => e.effect === 'range_expand');
  if (expandEffect && !character.buffs.some(b => b.type === 'sealed')) {
    const condMet = expandEffect.condition
      ? evaluateRangeExpandCondition(state, expandEffect.condition, character)
      : true;
    if (condMet) {
      // 範囲を cross に差し替えたキャラとして扱う
      const expanded = {
        ...character,
        card: { ...character.card, attackRange: 'cross' as const },
      };
      return getRangeTargets(state, position, expanded);
    }
  }
  return getRangeTargets(state, position, character);
}

/** range_expand 用の簡易条件評価 */
function evaluateRangeExpandCondition(
  state: GameState,
  condition: { type: string; value?: number | string },
  character: BoardCharacter,
): boolean {
  switch (condition.type) {
    case 'hand_count_lte': {
      const handSize = state.players[character.owner].hand.length;
      return handSize <= (typeof condition.value === 'number' ? condition.value : 0);
    }
    case 'always':
      return true;
    default:
      return false;
  }
}

/**
 * Compute effective ATK for a character including buffs.
 */
function getEffectiveAtk(character: BoardCharacter): number {
  let atk = character.card.atk;
  for (const buff of character.buffs) {
    if (buff.type === 'atk_up') atk += buff.value;
    if (buff.type === 'atk_down') atk -= buff.value;
  }
  return Math.max(0, atk);
}

/**
 * Remove a character from the board, give 1 mana to its owner,
 * and add the card to the owner's discard pile.
 */
function removeCharacter(state: GameState, pos: Position, killer?: BoardCharacter): GameState {
  const cell = getCell(state, pos);
  const character = cell.character;
  if (!character) return state;

  // on_destroyed: resolve effects BEFORE removing (character still on board)
  const destroyedEffects = character.card.effects.filter(e => e.trigger === 'on_destroyed');
  if (destroyedEffects.length > 0) {
    state = resolveEffects(state, 'on_destroyed', {
      sourcePos: pos,
      sourceChar: character,
    });
  }

  // Re-read cell (effects may have changed state)
  const cell2 = getCell(state, pos);
  const char2 = cell2.character;
  if (!char2) return state; // already removed by effect

  const owner = char2.owner;
  const player = state.players[owner];

  state = setCharacterOnCell(state, pos, null);
  state = updatePlayer(state, owner, {
    mana: player.mana + 1,
    discard: [...player.discard, char2.card],
  });
  // v2: VP付与（敵を撃破した場合）
  if (killer && killer.owner !== owner) {
    const killVP = getKillVpForManaCost(char2.card.manaCost);
    const newVp = state.players[killer.owner].vp + killVP;
    state = updatePlayer(state, killer.owner, { vp: newVp });
    state = addLog(state, `Player ${killer.owner} gains ${killVP} VP (total: ${newVp})`);
  }
  if (killer && killer.owner !== owner) {
    state = addCombatEvent(state, {
      turn: state.turnNumber,
      attacker: {
        cardId: killer.card.id,
        cardName: killer.card.name,
        faction: killer.card.faction,
        manaCost: killer.card.manaCost,
        owner: killer.owner,
      },
      defender: {
        cardId: char2.card.id,
        cardName: char2.card.name,
        faction: char2.card.faction,
        manaCost: char2.card.manaCost,
        owner,
      },
    });
  }
  state = addLog(state, `${char2.card.name} was destroyed at (${pos.row},${pos.col})`);

  // マーカー付与元が撃破された場合、付与したマーカーを全て消滅させる
  const destroyedCardId = char2.card.id;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ch = state.board[r][c].character;
      if (ch && ch.buffs.some(b => b.grantedBy === destroyedCardId)) {
        const cleaned = ch.buffs.filter(b => b.grantedBy !== destroyedCardId);
        state = setCharacterOnCell(state, { row: r, col: c }, { ...ch, buffs: cleaned as any });
        state = addLog(state, `${ch.card.name} のマーカーが消滅した（付与元 ${char2.card.name} 撃破）`);
      }
    }
  }

  // ミスズ等が死亡した場合、相手の洗脳バフを全解除
  if (char2.card.effects.some(e => e.effect === 'brainwash')) {
    const enemyId: PlayerId = owner === 0 ? 1 : 0;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const ch = state.board[r][c].character;
        if (ch && ch.owner === enemyId && ch.buffs.some(b => b.type === 'brainwashed')) {
          const cleaned = ch.buffs.filter(b => b.type !== 'brainwashed');
          state = setCharacterOnCell(state, { row: r, col: c }, { ...ch, buffs: cleaned as any });
          state = addLog(state, `${ch.card.name} の洗脳が解除された`);
        }
      }
    }
  }

  // on_kill: キラーがいる場合、キラーの on_kill エフェクトを発動
  if (killer && killer.owner !== owner) {
    // キラーの現在位置を探す
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const ch = state.board[r][c].character;
        if (ch && ch.card.id === killer.card.id && ch.owner === killer.owner) {
          const killEffects = ch.card.effects.filter(e => e.trigger === 'on_kill');
          if (killEffects.length > 0) {
            state = resolveEffects(state, 'on_kill', {
              sourcePos: { row: r, col: c },
              sourceChar: ch,
            });
          }
          break;
        }
      }
    }
  }

  // on_ally_destroyed: 味方全員の on_ally_destroyed エフェクトを発動
  const allyChars = findCharacters(state, owner);
  for (const { pos: allyPos, char: allyChar } of allyChars) {
    const allyDestroyedEffects = allyChar.card.effects.filter(e => e.trigger === 'on_ally_destroyed');
    if (allyDestroyedEffects.length > 0) {
      state = resolveEffects(state, 'on_ally_destroyed', {
        sourcePos: allyPos,
        sourceChar: allyChar,
      });
    }
  }

  return state;
}

/**
 * Calculate damage, applying keywords.
 * Returns the final damage value.
 */
function calculateDamage(
  atk: number,
  attackerChar: BoardCharacter,
  defenderChar: BoardCharacter,
  isBlindSpot: boolean,
): number {
  let damage = atk;

  // Blind spot: +1 damage
  if (isBlindSpot) {
    damage += 1;
  }

  // Protection: reduce physical damage by 1 (ignored by piercing)
  const hasProtection = defenderChar.card.keywords.includes('protection') || defenderChar.buffs.some(b => b.type === 'has_protection');
  const hasPiercing = attackerChar.card.keywords.includes('piercing') || attackerChar.buffs.some(b => b.type === 'has_piercing');
  if (
    hasProtection &&
    attackerChar.card.attackType === 'physical' &&
    !hasPiercing
  ) {
    damage = Math.max(0, damage - 1);
  }

  // Damage link: halve damage (other half goes to adjacent ally later)
  if (defenderChar.card.keywords.includes('damage_link')) {
    damage = Math.ceil(damage / 2);
  }

  return damage;
}

/**
 * Resolve all attacks from a character at attackerPos against enemies in range.
 * Handles quickness, fortress, blind spot, protection, and counter-attacks.
 */
function resolveAttack(
  state: GameState,
  attackerPos: Position,
  attackerChar: BoardCharacter,
  singleTarget: Position,
): GameState {
  // Fortress: cannot initiate attacks
  if (attackerChar.card.keywords.includes('fortress')) {
    state = addLog(state, `${attackerChar.card.name} has fortress and cannot initiate attacks`);
    return state;
  }

  let targets = getAttackTargets(state, attackerPos, attackerChar);
  const attackerAtk = getEffectiveAtk(attackerChar);

  // single-target mode: filter to only the chosen target
  if (singleTarget) {
    targets = targets.filter(t => t.row === singleTarget.row && t.col === singleTarget.col);
  }

  for (const targetPos of targets) {
    // Re-read attacker in case it died from a previous counter
    const currentAttackerCell = getCell(state, attackerPos);
    if (!currentAttackerCell.character) break; // attacker is dead
    const currentAttacker = currentAttackerCell.character;
    const currentAtk = getEffectiveAtk(currentAttacker);

    const defenderCell = getCell(state, targetPos);
    if (!defenderCell.character) continue; // target already dead
    let defender = defenderCell.character;
    let actualTargetPos = targetPos;

    // Cover: 隣接にcoverキーワード持ちの味方がいたら、そちらがダメージを受ける
    const adjacents = getAdjacentPositions(targetPos);
    for (const adj of adjacents) {
      const adjCell = getCell(state, adj);
      if (adjCell.character
        && adjCell.character.owner === defender.owner
        && adjCell.character.card.keywords.includes('cover')
        && !(adj.row === targetPos.row && adj.col === targetPos.col)) {
        // カバー発動: ターゲットを差し替え
        state = addLog(state, `${adjCell.character.card.name} が ${defender.card.name} をカバー！`);
        // 守った味方にATK+1バフ
        const coveredChar = getCell(state, targetPos).character;
        if (coveredChar) {
          const newBuffs = [...coveredChar.buffs, { type: 'atk_up' as const, value: 1, duration: 99 }];
          state = setCharacterOnCell(state, targetPos, { ...coveredChar, buffs: newBuffs });
          state = addLog(state, `${coveredChar.card.name} のATK+1（カバーの恩恵）`);
        }
        actualTargetPos = adj;
        defender = adjCell.character;
        break;
      }
    }

    // Dodge: 回避マーカーがあれば物理攻撃を無効化（魔法・貫通は通る）
    const defHasDodge = defender.card.keywords.includes('dodge') || defender.buffs.some(b => b.type === 'has_dodge');
    const atkHasPiercing = currentAttacker.card.keywords.includes('piercing') || currentAttacker.buffs.some(b => b.type === 'has_piercing');
    if (defHasDodge && currentAttacker.card.attackType === 'physical' && !atkHasPiercing) {
      state = addLog(state, `${defender.card.name} が【回避】で攻撃を無効化！`);
      // Consume dodge marker buff
      const cleanedBuffs = defender.buffs.filter(b => b.type !== 'has_dodge');
      state = setCharacterOnCell(state, actualTargetPos, { ...defender, buffs: cleanedBuffs as any });
      continue; // skip this target
    }

    // Determine blind spot: attacker's position is NOT in defender's attack range
    // Stealth: 攻撃が常にブラインド扱い
    const blindSpot = currentAttacker.card.keywords.includes('stealth')
      || isBlindSpot(actualTargetPos, defender, attackerPos);

    // Check quickness: counter-attack happens FIRST
    const hasQuickness = defender.card.keywords.includes('quickness') || defender.buffs.some(b => b.type === 'has_quickness');

    if (hasQuickness && !blindSpot) {
      // Counter-attack first
      const counterAtk = getEffectiveAtk(defender);
      const counterDamage = calculateDamage(counterAtk, defender, currentAttacker, false);

      state = addLog(
        state,
        `${defender.card.name} counter-attacks first (quickness) dealing ${counterDamage} damage to ${currentAttacker.card.name}`,
      );

      const newAttackerHp = currentAttacker.currentHp - counterDamage;
      if (newAttackerHp <= 0) {
        state = removeCharacter(state, attackerPos, defender);
        return state; // attacker dead, stop
      }
      state = setCharacterOnCell(state, attackerPos, {
        ...currentAttacker,
        currentHp: newAttackerHp,
      });
    }

    // Re-read attacker again after possible quickness counter
    const atkAfterCounter = getCell(state, attackerPos).character;
    if (!atkAfterCounter) return state;

    let atkValue = getEffectiveAtk(atkAfterCounter);

    // Main attack
    const damage = calculateDamage(
      atkValue,
      atkAfterCounter,
      defender,
      blindSpot,
    );

    state = addLog(
      state,
      `${atkAfterCounter.card.name} attacks ${defender.card.name} for ${damage} damage${blindSpot ? ' (blind spot!)' : ''}`,
    );

    const newDefHp = defender.currentHp - damage;

    // Reflect: 魔法攻撃を反射（defender はダメージを受けず、attacker に全ダメージ）
    if (damage > 0 && defender.card.keywords.includes('reflect') && atkAfterCounter.card.attackType === 'magic') {
      const curAtk2 = getCell(state, attackerPos).character;
      if (curAtk2) {
        const reflectHp = curAtk2.currentHp - damage;
        state = addLog(state, `${defender.card.name} が魔法攻撃を反射！${damage}ダメージを ${curAtk2.card.name} に返す`);
        if (reflectHp <= 0) {
          state = removeCharacter(state, attackerPos, defender);
        } else {
          state = setCharacterOnCell(state, attackerPos, { ...curAtk2, currentHp: reflectHp });
        }
        // defender はダメージを受けない → ループを次へ
        continue;
      }
    }

    if (newDefHp <= 0) {
      state = removeCharacter(state, actualTargetPos, atkAfterCounter);
      continue; // defender dead, no counter
    }

    // Update defender HP
    state = setCharacterOnCell(state, actualTargetPos, {
      ...defender,
      currentHp: newDefHp,
    });

    // on_damaged trigger
    const damagedChar = getCell(state, actualTargetPos).character;
    if (damagedChar && damage > 0) {
      const damagedEffects = damagedChar.card.effects.filter(e => e.trigger === 'on_damaged');
      if (damagedEffects.length > 0) {
        state = resolveEffects(state, 'on_damaged', {
          sourcePos: actualTargetPos,
          sourceChar: damagedChar,
        });
      }
    }

    // Counter-attack (if not blind spot and not already done via quickness)
    if (!blindSpot && !hasQuickness) {
      const survivingDefender = getCell(state, actualTargetPos).character;
      if (!survivingDefender) continue;

      if (isInAttackRange(actualTargetPos, survivingDefender, attackerPos)) { // range.ts版
        const counterAtk = getEffectiveAtk(survivingDefender);
        const latestAttacker = getCell(state, attackerPos).character;
        if (!latestAttacker) return state;

        const counterDamage = calculateDamage(counterAtk, survivingDefender, latestAttacker, false);

        state = addLog(
          state,
          `${survivingDefender.card.name} counter-attacks ${latestAttacker.card.name} for ${counterDamage} damage`,
        );

        const newAtkHp = latestAttacker.currentHp - counterDamage;
        if (newAtkHp <= 0) {
          state = removeCharacter(state, attackerPos, survivingDefender);
          return state; // attacker dead, stop
        }
        state = setCharacterOnCell(state, attackerPos, {
          ...latestAttacker,
          currentHp: newAtkHp,
        });
      }
    }

    // Consume single-use marker buffs after attack
    const postAtkChar = getCell(state, attackerPos).character;
    if (postAtkChar) {
      const consumedBuffs = postAtkChar.buffs.filter(b =>
        b.type !== 'has_piercing' && b.type !== 'has_quickness'
      );
      if (consumedBuffs.length !== postAtkChar.buffs.length) {
        state = setCharacterOnCell(state, attackerPos, { ...postAtkChar, buffs: consumedBuffs as any });
      }
    }
    // Consume protection marker from defender if it reduced damage
    const postDefChar = getCell(state, actualTargetPos).character;
    if (postDefChar && postDefChar.buffs.some(b => b.type === 'has_protection')) {
      const cleanedDef = postDefChar.buffs.filter(b => b.type !== 'has_protection');
      state = setCharacterOnCell(state, actualTargetPos, { ...postDefChar, buffs: cleanedDef as any });
    }
  }

  return state;
}

// ========================================
// Exported game actions
// ========================================

/**
 * Begin a turn: draw 1 card + gain 2 mana.
 * Set phase to 'action'. Reset all action flags.
 */
export function startTurn(state: GameState): GameState {
  state = cloneState(state);
  state = { ...state, hasSummonedThisTurn: false, summonCountThisTurn: 0, attackedThisTurn: [], swappedThisTurn: [] };
  const pid = state.currentPlayer;

  // Draw 1 card
  const updatedPlayer = drawCards(state.players[pid], 1);
  state = updatePlayer(state, pid, {
    deck: updatedPlayer.deck,
    hand: updatedPlayer.hand,
  });

  // Gain 2 mana
  state = updatePlayer(state, pid, {
    mana: state.players[pid].mana + 2,
  });

  // Set phase
  state = { ...state, phase: 'action' };

  // Reset all hasActedThisTurn / hasRotatedThisTurn flags on the board
  // Frozen characters stay acted.
  const newBoard = state.board.map((row) =>
    row.map((cell) => {
      if (cell.character && cell.character.owner === pid) {
        const isFrozen = cell.character.buffs.some(b => b.type === 'frozen');
        const isBrainwashed = cell.character.buffs.some(b => b.type === 'brainwashed');
        const cantAct = isFrozen || isBrainwashed;
        return {
          ...cell,
          character: {
            ...cell.character,
            hasActedThisTurn: cantAct,
            hasRotatedThisTurn: cantAct,
          },
        };
      }
      return cell;
    }),
  );
  state = { ...state, board: newBoard };

  state = addLog(
    state,
    `Player ${pid} starts turn ${state.turnNumber}`,
  );

  // バフ持続ターン減算
  state = tickBuffDurations(state, pid);

  // on_turn_start エフェクト解決
  state = resolveGlobalTrigger(state, 'on_turn_start', pid);

  // ターン開始エフェクトでVP勝利が決まる可能性（5マスはターン終了時のみ）
  const winnerAfterStart = checkWinCondition(state, false);
  if (winnerAfterStart !== null) {
    return applyWinnerIfAny(state, false);
  }

  return state;
}

/**
 * Summon a character card onto the board.
 */
export function executeSummon(
  state: GameState,
  cardId: string,
  position: Position,
  direction: Direction,
): GameState {
  state = cloneState(state);
  const pid = state.currentPlayer;
  const player = state.players[pid];

  // v2: 1ターン2回まで召喚可能（2回目は追加+1マナ）
  if (state.summonCountThisTurn >= MAX_SUMMONS_PER_TURN) {
    throw new Error(`Already summoned ${MAX_SUMMONS_PER_TURN} times this turn`);
  }

  // v2: 盤面上限5体
  const myCharCount = state.board.flat().filter(c => c.character?.owner === pid).length;
  if (myCharCount >= MAX_CHARACTERS_PER_PLAYER) {
    throw new Error(`Board character limit reached (max ${MAX_CHARACTERS_PER_PLAYER})`);
  }

  // Find card in hand
  const cardIndex = player.hand.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) {
    throw new Error(`Card ${cardId} not found in player ${pid}'s hand`);
  }
  const card = player.hand[cardIndex];
  if (card.type !== 'character') {
    throw new Error(`Card ${cardId} is not a character card`);
  }
  const charCard = card as CharacterCard;

  // Validate position is empty
  const targetCell = getCell(state, position);
  if (targetCell.character !== null) {
    throw new Error(`Cell (${position.row},${position.col}) is already occupied`);
  }

  // v2: エースコスト軽減（C5+は条件1つにつき-1、最低2）+ 2回目召喚は追加1マナ
  const baseCost = getAceEffectiveCost(state, pid, charCard);
  const extraSummonCost = state.summonCountThisTurn >= 1 ? EXTRA_SUMMON_MANA_COST : 0;
  const totalSummonCost = baseCost + extraSummonCost;

  // Validate mana
  if (player.mana < totalSummonCost) {
    throw new Error(
      `Not enough mana: need ${totalSummonCost}, have ${player.mana}`,
    );
  }

  // Validate placement: adjacent to any existing character, or anywhere if no characters on board
  if (hasCharactersOnBoard(state, pid)) {
    if (!isAdjacentToAnyCharacter(state, position)) {
      throw new Error(
        `Position (${position.row},${position.col}) must be adjacent to an existing character`,
      );
    }
  }

  // Deduct mana (v2: includes extra summon cost), remove card from hand
  const newHand = [...player.hand];
  newHand.splice(cardIndex, 1);
  state = updatePlayer(state, pid, {
    mana: player.mana - totalSummonCost,
    hand: newHand,
  });

  // Calculate HP with element bonus
  const hpBonus = calculateHpBonus(charCard.element, targetCell.element);
  const startingHp = charCard.hp + hpBonus;

  state = addLog(
    state,
    `Player ${pid} summons ${charCard.name} at (${position.row},${position.col}) facing ${direction}${hpBonus !== 0 ? ` (HP ${hpBonus > 0 ? '+' : ''}${hpBonus})` : ''}`,
  );

  // Check if character dies immediately from element penalty
  if (startingHp <= 0) {
    state = addLog(state, `${charCard.name} dies immediately from element penalty`);
    state = updatePlayer(state, pid, {
      mana: state.players[pid].mana + 1,
      discard: [...state.players[pid].discard, charCard],
    });
    state = { ...state, phase: 'resolution' };
    const winner = checkWinCondition(state, false); // v2: VPのみチェック
    if (winner !== null) {
      state = { ...state, winner, winnerReason: getWinnerReason(state, winner, false), phase: 'game_over' };
    }
    return state;
  }

  // Place character on board
  const boardChar: BoardCharacter = {
    card: charCard,
    owner: pid,
    currentHp: startingHp,
    direction,
    buffs: [],
    hasActedThisTurn: false,
    hasRotatedThisTurn: false,
  };
  state = setCharacterOnCell(state, position, boardChar);
  state = { ...state, hasSummonedThisTurn: true, summonCountThisTurn: state.summonCountThisTurn + 1 };

  // カイザー隣接召喚ドロー: 隣接にaggro_10がいたら1ドロー
  const adjForKaiser = getAdjacentPositions(position);
  for (const adj of adjForKaiser) {
    const adjCell = getCell(state, adj);
    if (adjCell.character
      && adjCell.character.owner === pid
      && adjCell.character.card.id === 'aggro_10'
      && !(adj.row === position.row && adj.col === position.col)
      && !adjCell.character.buffs.some(b => b.type === 'sealed')
    ) {
      const drawnPlayer = drawCards(state.players[pid], 1);
      state = updatePlayer(state, pid, { deck: drawnPlayer.deck, hand: drawnPlayer.hand });
      state = addLog(state, `${adjCell.character.card.name} の効果: 隣接召喚で1枚ドロー`);
      break; // 1回だけ
    }
  }

  // on_summon エフェクト解決
  const hasDamageEffect = charCard.effects.some(
    e => e.trigger === 'on_summon' && (e.effect === 'damage' || e.effect === 'piercing_damage'),
  );
  state = resolveEffects(state, 'on_summon', {
    sourcePos: position,
    sourceChar: boardChar,
  });

  // on_summonでダメージ効果を発動したキャラは攻撃済みとする
  if (hasDamageEffect) {
    const postEffectCell = getCell(state, position);
    if (postEffectCell.character) {
      state = setCharacterOnCell(state, position, {
        ...postEffectCell.character,
        hasActedThisTurn: true,
      });
    }
  }

  // 召喚後にキャラが生存しているか確認（自傷で死ぬ場合）
  const postSummonCell = getCell(state, position);
  if (!postSummonCell.character) {
    state = { ...state, phase: 'resolution' };
    const winner = checkWinCondition(state, false); // v2: VPのみ
    if (winner !== null) {
      state = { ...state, winner, winnerReason: getWinnerReason(state, winner, false), phase: 'game_over' };
    }
    return state;
  }

  // Auto-attack: newly summoned character attacks first enemy in range
  const postSummonChar = postSummonCell.character;
    const summonTargets = getAttackTargets(state, position, postSummonChar);
    if (!postSummonChar.hasActedThisTurn && summonTargets.length > 0) {
    state = resolveAttack(state, position, postSummonChar, summonTargets[0]);

    const survivorCell = getCell(state, position);
    if (survivorCell.character) {
      const summonAttackerId = survivorCell.character.card.id;
      const attacked = Array.isArray(state.attackedThisTurn) ? [...state.attackedThisTurn] : [];
      if (!attacked.includes(summonAttackerId)) attacked.push(summonAttackerId);
      state = setCharacterOnCell(state, position, {
        ...survivorCell.character,
        hasActedThisTurn: true,
      });
      state = { ...state, attackedThisTurn: attacked };
    }
  }

  // Set phase to resolution
  state = { ...state, phase: 'resolution' };

  // v2: Check win condition (VP only, territory at end of turn)
  const winner = checkWinCondition(state, false);
  if (winner !== null) {
    state = { ...state, winner, winnerReason: getWinnerReason(state, winner, false), phase: 'game_over' };
  }

  return state;
}

/**
 * Activate an existing character to attack.
 * Costs 1 mana.
 */
export function executeAttack(state: GameState, position: Position, targetPos?: Position): GameState {
  state = cloneState(state);
  const pid = state.currentPlayer;
  const player = state.players[pid];

  const cell = getCell(state, position);
  if (!cell.character) {
    throw new Error(`No character at (${position.row},${position.col})`);
  }
  if (cell.character.owner !== pid) {
    throw new Error(`Character at (${position.row},${position.col}) does not belong to player ${pid}`);
  }
  if (cell.character.hasActedThisTurn) {
    throw new Error(`Character at (${position.row},${position.col}) has already acted this turn`);
  }
  if (cell.character.buffs.some(b => b.type === 'frozen')) {
    throw new Error(`Character at (${position.row},${position.col}) is frozen and cannot act`);
  }
  let activateCost = cell.character.card.activateCost ?? 3;
  // atk_cost_reduction バフ: 攻撃コストのみ減少（回転には適用されない）
  for (const b of cell.character.buffs) {
    if (b.type === 'atk_cost_reduction') activateCost -= b.value;
  }
  activateCost = Math.max(0, activateCost);
  // v2: action_tax: 攻撃コスト+value（各action_taxバフごと）
  for (const b of cell.character.buffs) {
    if (b.type === 'action_tax') activateCost += b.value;
  }
  // pressure: 隣接に敵のpressure持ちがいれば再行動コスト+1
  const adjPos = getAdjacentPositions(position);
  for (const ap of adjPos) {
    const adjCell = getCell(state, ap);
    if (adjCell.character && adjCell.character.owner !== pid
      && adjCell.character.card.keywords.includes('pressure')) {
      activateCost += 1;
      break; // 複数いても+1まで
    }
  }
  if (player.mana < activateCost) {
    throw new Error(`Not enough mana to attack (costs ${activateCost})`);
  }

  // Deduct activate cost
  state = updatePlayer(state, pid, { mana: player.mana - activateCost });

  const attacker = cell.character;

  state = addLog(state, `Player ${pid} activates ${attacker.card.name} at (${position.row},${position.col}) to attack`);

  // on_attack エフェクト解決
  state = resolveEffects(state, 'on_attack', {
    sourcePos: position,
    sourceChar: attacker,
  });

  // エフェクトでキャラが死亡していないか確認
  const postEffectCell = getCell(state, position);
  if (!postEffectCell.character) {
    const w = checkWinCondition(state, false); // v2: VPのみ
    if (w !== null) state = { ...state, winner: w, phase: 'game_over' };
    return state;
  }

  // Resolve attack
  const isZekus = postEffectCell.character.card.id === 'snipe_10'; // 虚眼のゼクス: 異なる敵2体攻撃
  const isLShape = postEffectCell.character.card.attackRange === 'front_left' || postEffectCell.character.card.attackRange === 'front_right';

  if (isLShape) {
    // L字攻撃: 範囲内の全敵に同時攻撃
    const allTargets = getAttackTargets(state, position, postEffectCell.character);
    for (const tgt of allTargets) {
      const atkStill = getCell(state, position).character;
      if (!atkStill) break;
      state = resolveAttack(state, position, atkStill, tgt);
    }
  } else if (!targetPos) {
    const possibleTargets = getAttackTargets(state, position, postEffectCell.character);
    if (possibleTargets.length > 0) {
      state = resolveAttack(state, position, postEffectCell.character, possibleTargets[0]);
      // Zekus: 2nd target (different from first)
      if (isZekus && possibleTargets.length > 1) {
        const atkStill = getCell(state, position).character;
        if (atkStill) {
          state = resolveAttack(state, position, atkStill, possibleTargets[1]);
        }
      }
    }
  } else {
    state = resolveAttack(state, position, postEffectCell.character, targetPos);
    // Zekus: 2nd target
    if (isZekus) {
      const atkStill = getCell(state, position).character;
      if (atkStill) {
        const allTargets = getAttackTargets(state, position, atkStill);
        const secondTarget = allTargets.find(t => !(t.row === targetPos.row && t.col === targetPos.col));
        if (secondTarget) {
          state = resolveAttack(state, position, atkStill, secondTarget);
        }
      }
    }
  }

  // ミスズ特殊: 洗脳状態の敵全員にも攻撃
  const postMisuzuChar = getCell(state, position).character;
  if (postMisuzuChar && postMisuzuChar.card.id === 'control_07') {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const bwCell = state.board[r][c].character;
        if (bwCell && bwCell.owner !== pid && bwCell.buffs.some(b => b.type === 'brainwashed')) {
          const bwPos = { row: r, col: c };
          // 既にメイン攻撃で攻撃済みの対象はスキップ
          if (targetPos && bwPos.row === targetPos.row && bwPos.col === targetPos.col) continue;
          const atkStill = getCell(state, position).character;
          if (atkStill) {
            state = addLog(state, `${atkStill.card.name} が洗脳中の ${bwCell.card.name} を攻撃`);
            state = resolveAttack(state, position, atkStill, bwPos);
          }
        }
      }
    }
  }

  // Mark as acted (if attacker is still alive)
  const updatedCell = getCell(state, position);
  if (updatedCell.character) {
    state = setCharacterOnCell(state, position, {
      ...updatedCell.character,
      hasActedThisTurn: true,
    });
    // v2: このターン攻撃した味方を記録（アグロエース条件用）
    const atkId = updatedCell.character.card.id;
    const attacked = Array.isArray(state.attackedThisTurn) ? [...state.attackedThisTurn] : [];
    if (!attacked.includes(atkId)) attacked.push(atkId);
    state = { ...state, attackedThisTurn: attacked };
  }

  // v2: Check win condition (VP only, territory at end of turn)
  const winner = checkWinCondition(state, false);
  if (winner !== null) {
      state = { ...state, winner, winnerReason: getWinnerReason(state, winner, false), phase: 'game_over' };
  }

  return state;
}

/**
 * Rotate a character to face a new direction.
 * Costs 1 mana.
 */
export function executeRotate(
  state: GameState,
  position: Position,
  newDirection: Direction,
): GameState {
  state = cloneState(state);
  const pid = state.currentPlayer;
  const player = state.players[pid];

  const cell = getCell(state, position);
  if (!cell.character) {
    throw new Error(`No character at (${position.row},${position.col})`);
  }
  if (cell.character.owner !== pid) {
    throw new Error(`Character at (${position.row},${position.col}) does not belong to player ${pid}`);
  }
  if (cell.character.hasRotatedThisTurn) {
    throw new Error(`Character at (${position.row},${position.col}) has already rotated this turn`);
  }
  if (cell.character.buffs.some(b => b.type === 'direction_locked')) {
    throw new Error(`Character at (${position.row},${position.col}) has direction locked`);
  }
  if (cell.character.buffs.some(b => b.type === 'frozen')) {
    throw new Error(`Character at (${position.row},${position.col}) is frozen and cannot act`);
  }
  if (player.mana < 1) {
    throw new Error('Not enough mana to rotate (costs 1)');
  }

  // Deduct 1 mana
  state = updatePlayer(state, pid, { mana: player.mana - 1 });

  // Rotate and mark
  state = setCharacterOnCell(state, position, {
    ...cell.character,
    direction: newDirection,
    hasRotatedThisTurn: true,
  });

  state = addLog(
    state,
    `Player ${pid} rotates ${cell.character.card.name} at (${position.row},${position.col}) to face ${newDirection}`,
  );

  return state;
}

/**
 * Use an item card from hand.
 * Costs the item's manaCost. Item is discarded after use.
 */
export function executeItem(
  state: GameState,
  cardId: string,
  targetPos?: Position,
): GameState {
  state = cloneState(state);
  const pid = state.currentPlayer;
  const player = state.players[pid];

  // Find item in hand
  const cardIndex = player.hand.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) {
    throw new Error(`Card ${cardId} not found in player ${pid}'s hand`);
  }
  const card = player.hand[cardIndex];
  if (card.type !== 'item') {
    throw new Error(`Card ${cardId} is not an item card`);
  }
  const itemCard = card as ItemCard;

  // ノア (control_v2_11) のオーラ: 相手にノアがいる場合、アイテムコスト+1
  const enemyId: PlayerId = pid === 0 ? 1 : 0;
  let itemCostExtra = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ch = state.board[r][c].character;
      if (ch && ch.owner === enemyId && ch.card.id === 'control_v2_11') {
        itemCostExtra += 1;
      }
    }
  }
  const totalItemCost = itemCard.manaCost + itemCostExtra;

  // Validate mana
  if (player.mana < totalItemCost) {
    throw new Error(
      `Not enough mana: need ${totalItemCost}, have ${player.mana}`,
    );
  }

  // Deduct mana, remove card from hand
  const newHand = [...player.hand];
  newHand.splice(cardIndex, 1);
  state = updatePlayer(state, pid, {
    mana: player.mana - totalItemCost,
    hand: newHand,
    discard: [...player.discard, itemCard],
  });

  state = addLog(state, `Player ${pid} uses item ${itemCard.name}`);

  // Resolve item effects
  state = resolveItemEffects(state, itemCard, {
    owner: pid,
    targetPos,
  });

  // v2: Check win condition (VP only)
  const winner = checkWinCondition(state, false);
  if (winner !== null) {
    state = { ...state, winner, winnerReason: getWinnerReason(state, winner, false), phase: 'game_over' };
  }

  return state;
}

/**
 * ドロー返上: 手札1枚をデッキに戻し、skip_draw持ちキャラに攻撃コスト減バフを付与。
 * 1ターンに1回まで。
 */
export function executeSkipDraw(state: GameState, cardIdToReturn: string): GameState {
  state = cloneState(state);
  const pid = state.currentPlayer;
  const player = state.players[pid];

  // 手札にそのカードがあるか
  const cardIndex = player.hand.findIndex(c => c.id === cardIdToReturn);
  if (cardIndex === -1) {
    throw new Error(`Card ${cardIdToReturn} not found in hand`);
  }

  // 盤面に skip_draw 効果持ちの味方がいるか
  let skipDrawCharPos: Position | null = null;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ch = state.board[r][c].character;
      if (ch && ch.owner === pid && !ch.buffs.some(b => b.type === 'sealed')) {
        if (ch.card.effects.some(e => e.effect === 'skip_draw')) {
          skipDrawCharPos = { row: r, col: c };
        }
      }
    }
  }
  if (!skipDrawCharPos) {
    throw new Error('No skip_draw character on board');
  }

  // 既にこのターンでドロー返上済みか（atk_cost_reduction バフがあれば使用済み）
  const skipChar = state.board[skipDrawCharPos.row][skipDrawCharPos.col].character!;
  if (skipChar.buffs.some(b => b.type === 'atk_cost_reduction')) {
    throw new Error('Skip draw already used this turn');
  }

  // 手札からカードを取り除き、デッキに戻す
  const newHand = [...player.hand];
  const [returnedCard] = newHand.splice(cardIndex, 1);
  const newDeck = [...player.deck, returnedCard];
  state = updatePlayer(state, pid, { hand: newHand, deck: newDeck });

  // skip_draw キャラに攻撃コスト減バフを付与
  const costReduction = skipChar.card.effects.find(e => e.effect === 'reduce_activate_cost');
  const reductionValue = costReduction?.value ?? 2;
  const newBuffs = [...skipChar.buffs, { type: 'atk_cost_reduction' as const, value: reductionValue, duration: 1 }];
  state = setCharacterOnCell(state, skipDrawCharPos, { ...skipChar, buffs: newBuffs });

  state = addLog(state, `${skipChar.card.name}: ドロー返上 → このターンの攻撃コスト-${reductionValue}（${returnedCard.name} をデッキに戻した）`);

  return state;
}

/**
 * End the current player's turn.
 * Enforce hand limit of 7, check win condition, switch player, start next turn.
 */
export function endTurn(state: GameState): GameState {
  state = cloneState(state);
  const pid = state.currentPlayer;
  const player = state.players[pid];

  state = addLog(state, `Player ${pid} ends their turn`);

  // on_turn_end エフェクト解決
  state = resolveGlobalTrigger(state, 'on_turn_end', pid);

  // v2: ターン終了時 — VP + 5マス占拠の両方をチェック
  const winnerAfterEnd = checkWinCondition(state, true);
  if (winnerAfterEnd !== null) {
    return { ...state, winner: winnerAfterEnd, winnerReason: getWinnerReason(state, winnerAfterEnd, true), phase: 'game_over' };
  }

  // Hand limit: discard down to 7 (from end of hand)
  const currentPlayer = state.players[pid];
  if (currentPlayer.hand.length > 7) {
    const excess = currentPlayer.hand.slice(7);
    const trimmedHand = currentPlayer.hand.slice(0, 7);
    state = updatePlayer(state, pid, {
      hand: trimmedHand,
      discard: [...currentPlayer.discard, ...excess],
    });
    state = addLog(state, `Player ${pid} discards ${excess.length} card(s) to hand limit`);
  }

  // v2: Check win condition again (VP + territory)
  const winner = checkWinCondition(state, true);
  if (winner !== null) {
    return { ...state, winner, winnerReason: getWinnerReason(state, winner, true), phase: 'game_over' };
  }

  // Switch current player
  const nextPlayer: PlayerId = pid === 0 ? 1 : 0;
  state = { ...state, currentPlayer: nextPlayer };

  // Increment turn number when cycling back to player 0
  if (nextPlayer === 0) {
    state = { ...state, turnNumber: state.turnNumber + 1 };
  }

  // Start next player's turn
  state = startTurn(state);

  return state;
}
