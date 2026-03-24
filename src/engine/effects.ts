/**
 * エフェクト条件評価 + 効果解決エンジン
 * CardEffect の condition を評価し、effect を適用する
 */
import type { CardEffect, EffectCondition, CharacterCard, ItemCard } from '../types/card';
import type { GameState, BoardCharacter, Position, PlayerId, Player } from '../types/game';
import { getAdjacentPositions } from './utils';
import { drawCards } from './state';
import { getAceConditionCount } from './rules';

// ========================================
// State helpers (同じパターンを actions.ts と共有)
// ========================================

function getCell(state: GameState, pos: Position) {
  return state.board[pos.row][pos.col];
}

function setCell(state: GameState, pos: Position, cell: GameState['board'][0][0]): GameState {
  const newBoard = state.board.map((row, r) =>
    row.map((c, col) => (r === pos.row && col === pos.col ? cell : c)),
  );
  return { ...state, board: newBoard };
}

function setCharacterOnCell(state: GameState, pos: Position, character: BoardCharacter | null): GameState {
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

function addLog(state: GameState, message: string): GameState {
  return {
    ...state,
    log: [...state.log, { turn: state.turnNumber, player: state.currentPlayer, message }],
  };
}

// ========================================
// 盤面走査ヘルパー
// ========================================

/** 指定プレイヤーの盤上キャラ位置を全取得 */
export function findCharacters(state: GameState, owner: PlayerId): { pos: Position; char: BoardCharacter }[] {
  const result: { pos: Position; char: BoardCharacter }[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cell = state.board[row][col];
      if (cell.character && cell.character.owner === owner) {
        result.push({ pos: { row, col }, char: cell.character });
      }
    }
  }
  return result;
}

const MARKER_TYPES = ['has_protection', 'has_dodge', 'has_piercing', 'has_quickness'] as const;

/** キャラクターがいずれかのマーカーを持っているか */
function hasAnyMarker(char: BoardCharacter): boolean {
  return char.buffs.some(b => (MARKER_TYPES as readonly string[]).includes(b.type));
}

/** 指定プレイヤーの敵を全取得 */
function findEnemies(state: GameState, owner: PlayerId): { pos: Position; char: BoardCharacter }[] {
  const enemyId: PlayerId = owner === 0 ? 1 : 0;
  return findCharacters(state, enemyId);
}

/** 指定プレイヤーの味方を全取得 */
function findAllies(state: GameState, owner: PlayerId): { pos: Position; char: BoardCharacter }[] {
  return findCharacters(state, owner);
}

/** 指定位置の隣接味方を取得 */
function findAdjacentAllies(state: GameState, pos: Position, owner: PlayerId): { pos: Position; char: BoardCharacter }[] {
  const adjPositions = getAdjacentPositions(pos);
  const result: { pos: Position; char: BoardCharacter }[] = [];
  for (const ap of adjPositions) {
    const cell = state.board[ap.row][ap.col];
    if (cell.character && cell.character.owner === owner) {
      result.push({ pos: ap, char: cell.character });
    }
  }
  return result;
}

/** 指定位置の隣接敵を取得 */
function findAdjacentEnemies(state: GameState, pos: Position, owner: PlayerId): { pos: Position; char: BoardCharacter }[] {
  const enemyId: PlayerId = owner === 0 ? 1 : 0;
  const adjPositions = getAdjacentPositions(pos);
  const result: { pos: Position; char: BoardCharacter }[] = [];
  for (const ap of adjPositions) {
    const cell = state.board[ap.row][ap.col];
    if (cell.character && cell.character.owner === enemyId) {
      result.push({ pos: ap, char: cell.character });
    }
  }
  return result;
}

// ========================================
// 条件評価
// ========================================

export interface EffectContext {
  /** エフェクトの発動元キャラの位置 */
  sourcePos: Position;
  /** エフェクトの発動元キャラ */
  sourceChar: BoardCharacter;
  /** 攻撃対象の位置（on_attack時のみ） */
  targetPos?: Position;
  /** 攻撃対象キャラ（on_attack時のみ） */
  targetChar?: BoardCharacter;
  /** ブラインドスポットからの攻撃か（on_attack時のみ） */
  isBlindSpot?: boolean;
}

/**
 * 条件を評価して true/false を返す
 */
export function evaluateCondition(
  state: GameState,
  condition: EffectCondition | undefined,
  ctx: EffectContext,
): boolean {
  if (!condition || condition.type === 'always') return true;

  const owner = ctx.sourceChar.owner;
  const allies = findCharacters(state, owner);
  const enemies = findEnemies(state, owner);

  switch (condition.type) {
    case 'ally_count_gte':
      return allies.length >= condition.value;
    case 'ally_count_lte':
      return allies.length <= condition.value;
    case 'enemy_count_gte':
      return enemies.length >= condition.value;
    case 'hp_pct_lte': {
      const pct = (ctx.sourceChar.currentHp / ctx.sourceChar.card.hp) * 100;
      return pct <= condition.value;
    }
    case 'hp_pct_gte': {
      const pct = (ctx.sourceChar.currentHp / ctx.sourceChar.card.hp) * 100;
      return pct >= condition.value;
    }
    case 'blind_spot':
      return !!ctx.isBlindSpot;
    case 'same_element_cell': {
      const cell = getCell(state, ctx.sourcePos);
      return cell.element === ctx.sourceChar.card.element;
    }
    case 'target_hp_lte': {
      if (!ctx.targetChar) return false;
      return ctx.targetChar.currentHp <= condition.value;
    }
    case 'hand_count_lte': {
      const hand = state.players[owner].hand;
      return hand.length <= condition.value;
    }
    case 'mana_gte': {
      return state.players[owner].mana >= condition.value;
    }
    case 'ace_condition_gte': {
      const faction = ctx.sourceChar?.card.faction || '';
      return getAceConditionCount(state, owner, faction) >= condition.value;
    }
    case 'target_has_debuff': {
      if (!ctx.targetChar) return false;
      const DEBUFF_TYPES = ['atk_down', 'sealed', 'frozen', 'direction_locked', 'brainwashed', 'action_tax', 'marked'];
      return ctx.targetChar.buffs.some(b => DEBUFF_TYPES.includes(b.type));
    }
    case 'in_corner': {
      const { row, col } = ctx.sourcePos;
      return (row === 0 || row === 2) && (col === 0 || col === 2);
    }
    case 'empty_cells_gte': {
      let emptyCount = 0;
      for (const row of state.board) {
        for (const cell of row) {
          if (!cell.character) emptyCount++;
        }
      }
      return emptyCount >= condition.value;
    }
    case 'ally_markers_gte': {
      const markerAllies = allies.filter(a => hasAnyMarker(a.char));
      return markerAllies.length >= condition.value;
    }
    case 'has_acted_this_turn': {
      const charId = ctx.sourceChar.card.id;
      const attacked = Array.isArray(state.attackedThisTurn) ? state.attackedThisTurn : [];
      return attacked.includes(charId);
    }
    case 'has_swapped_this_turn': {
      const charId = ctx.sourceChar.card.id;
      const swapped = Array.isArray((state as any).swappedThisTurn) ? (state as any).swappedThisTurn : [];
      return swapped.includes(charId);
    }
    default:
      return true;
  }
}

// ========================================
// 効果適用
// ========================================

/** キャラを破壊してマナ+1、discardに追加 */
function destroyCharacter(state: GameState, pos: Position): GameState {
  const cell = getCell(state, pos);
  const character = cell.character;
  if (!character) return state;

  const owner = character.owner;
  const player = state.players[owner];
  state = setCharacterOnCell(state, pos, null);
  state = updatePlayer(state, owner, {
    mana: player.mana + 1,
    discard: [...player.discard, character.card],
  });
  state = addLog(state, `${character.card.name} が破壊された (${pos.row},${pos.col})`);
  return state;
}

/** ダメージを与え、HP<=0なら破壊 */
function applyDamage(state: GameState, pos: Position, damage: number): GameState {
  const cell = getCell(state, pos);
  if (!cell.character) return state;
  const char = cell.character;
  const newHp = char.currentHp - damage;
  if (newHp <= 0) {
    state = addLog(state, `${char.card.name} に${damage}ダメージ → 撃破`);
    return destroyCharacter(state, pos);
  }
  state = setCharacterOnCell(state, pos, { ...char, currentHp: newHp });
  state = addLog(state, `${char.card.name} に${damage}ダメージ (残HP: ${newHp})`);
  return state;
}

/** HP回復 */
function applyHeal(state: GameState, pos: Position, amount: number): GameState {
  const cell = getCell(state, pos);
  if (!cell.character) return state;
  const char = cell.character;
  const maxHp = char.card.hp + 2; // 属性ボーナス上限考慮
  const newHp = Math.min(char.currentHp + amount, maxHp);
  state = setCharacterOnCell(state, pos, { ...char, currentHp: newHp });
  state = addLog(state, `${char.card.name} HP+${newHp - char.currentHp} (残HP: ${newHp})`);
  return state;
}

/** ATKバフ付与 */
function applyBuffAtk(state: GameState, pos: Position, value: number): GameState {
  const cell = getCell(state, pos);
  if (!cell.character) return state;
  const char = cell.character;
  const newBuffs = [...char.buffs, { type: 'atk_up' as const, value }];
  state = setCharacterOnCell(state, pos, { ...char, buffs: newBuffs });
  state = addLog(state, `${char.card.name} ATK+${value}`);
  return state;
}

/** ATKデバフ付与 */
function applyDebuffAtk(state: GameState, pos: Position, value: number): GameState {
  const cell = getCell(state, pos);
  if (!cell.character) return state;
  const char = cell.character;
  const newBuffs = [...char.buffs, { type: 'atk_down' as const, value }];
  state = setCharacterOnCell(state, pos, { ...char, buffs: newBuffs });
  state = addLog(state, `${char.card.name} ATK-${value}`);
  return state;
}

/** 封印付与（キーワード無効化） */
function applySeal(state: GameState, pos: Position, duration: number): GameState {
  const cell = getCell(state, pos);
  if (!cell.character) return state;
  const char = cell.character;
  const newBuffs = [...char.buffs, { type: 'sealed' as const, value: 0, duration }];
  state = setCharacterOnCell(state, pos, { ...char, buffs: newBuffs });
  state = addLog(state, `${char.card.name} が${duration}ターン封印された`);
  return state;
}

/** 回転 */
function applyRotate(state: GameState, pos: Position, clicks: number): GameState {
  const cell = getCell(state, pos);
  if (!cell.character) return state;
  const char = cell.character;
  const dirs = ['up', 'right', 'down', 'left'] as const;
  const currentIdx = dirs.indexOf(char.direction);
  const newIdx = (currentIdx + clicks + 4) % 4;
  state = setCharacterOnCell(state, pos, { ...char, direction: dirs[newIdx] });
  state = addLog(state, `${char.card.name} を${clicks * 90}°回転`);
  return state;
}

/** ドロー */
function applyDraw(state: GameState, owner: PlayerId, count: number): GameState {
  const player = drawCards(state.players[owner], count);
  state = updatePlayer(state, owner, { deck: player.deck, hand: player.hand, discard: player.discard });
  state = addLog(state, `Player ${owner} が${count}枚ドロー`);
  return state;
}

/** マナ獲得 */
function applyGainMana(state: GameState, owner: PlayerId, amount: number): GameState {
  const player = state.players[owner];
  const newMana = Math.max(0, player.mana + amount);
  state = updatePlayer(state, owner, { mana: newMana });
  if (amount >= 0) {
    state = addLog(state, `Player ${owner} マナ+${amount}`);
  } else {
    state = addLog(state, `Player ${owner} マナ${amount}`);
  }
  return state;
}

/** ランダムディスカード */
function applyDiscardRandom(state: GameState, targetOwner: PlayerId, count: number): GameState {
  const player = state.players[targetOwner];
  if (player.hand.length === 0) return state;
  const shuffled = [...player.hand].sort(() => Math.random() - 0.5);
  const discarded = shuffled.slice(0, Math.min(count, shuffled.length));
  const remaining = player.hand.filter(c => !discarded.includes(c));
  state = updatePlayer(state, targetOwner, {
    hand: remaining,
    discard: [...player.discard, ...discarded],
  });
  state = addLog(state, `Player ${targetOwner} の手札から${discarded.length}枚捨てられた`);
  return state;
}

/** ATKコピー */
function applyCopyAtk(state: GameState, sourcePos: Position, targetPos: Position): GameState {
  const sourceCell = getCell(state, sourcePos);
  const targetCell = getCell(state, targetPos);
  if (!sourceCell.character || !targetCell.character) return state;

  // ターゲットのeffective ATKを計算
  let targetAtk = targetCell.character.card.atk;
  for (const buff of targetCell.character.buffs) {
    if (buff.type === 'atk_up') targetAtk += buff.value;
    if (buff.type === 'atk_down') targetAtk -= buff.value;
  }
  targetAtk = Math.max(0, targetAtk);

  // ソースの現在のeffective ATKとの差分をバフとして付与
  let sourceAtk = sourceCell.character.card.atk;
  for (const buff of sourceCell.character.buffs) {
    if (buff.type === 'atk_up') sourceAtk += buff.value;
    if (buff.type === 'atk_down') sourceAtk -= buff.value;
  }
  const diff = targetAtk - sourceAtk;
  if (diff > 0) {
    state = applyBuffAtk(state, sourcePos, diff);
  } else if (diff < 0) {
    state = applyDebuffAtk(state, sourcePos, -diff);
  }
  state = addLog(state, `${sourceCell.character.card.name} が ${targetCell.character.card.name} のATK(${targetAtk})をコピー`);
  return state;
}

/** 空きマス一覧を取得 */
function getEmptyPositions(state: GameState): Position[] {
  const empty: Position[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (!state.board[row][col].character) {
        empty.push({ row, col });
      }
    }
  }
  return empty;
}

/** 移動: 対象をランダムな空きマスへ */
function applyMove(state: GameState, pos: Position): GameState {
  const cell = getCell(state, pos);
  if (!cell.character) return state;
  if (cell.character.card.keywords.includes('anchor')) {
    state = addLog(state, `${cell.character.card.name} は不動（anchor）で移動しない`);
    return state;
  }
  const empty = getEmptyPositions(state);
  if (empty.length === 0) return state;
  const dest = empty[Math.floor(Math.random() * empty.length)];
  const char = cell.character;
  state = setCharacterOnCell(state, pos, null);
  state = setCharacterOnCell(state, dest, char);
  state = addLog(state, `${char.card.name} が (${pos.row},${pos.col}) → (${dest.row},${dest.col}) へ移動`);
  return state;
}

/** 位置入替: ソースと対象の位置を交換 */
function applySwap(state: GameState, sourcePos: Position, targetPos: Position): GameState {
  const sourceCell = getCell(state, sourcePos);
  const targetCell = getCell(state, targetPos);
  if (!sourceCell.character || !targetCell.character) return state;
  const sourceChar = sourceCell.character;
  const targetChar = targetCell.character;
  state = setCharacterOnCell(state, sourcePos, targetChar);
  state = setCharacterOnCell(state, targetPos, sourceChar);
  state = addLog(state, `${sourceChar.card.name} と ${targetChar.card.name} の位置を入替`);
  return state;
}

/** 押し出し: ソースから離れる方向に1マス。端なら壁ダメージ */
function applyPush(state: GameState, sourcePos: Position, targetPos: Position, wallDamage: number): GameState {
  const cell = getCell(state, targetPos);
  if (!cell.character) return state;
  if (cell.character.card.keywords.includes('anchor')) {
    state = addLog(state, `${cell.character.card.name} は不動（anchor）で押し出されない`);
    return state;
  }
  const char = cell.character;
  const dr = targetPos.row - sourcePos.row;
  const dc = targetPos.col - sourcePos.col;
  // 押す方向（0の場合はそのまま=押せない）
  const pushR = dr === 0 ? 0 : (dr > 0 ? 1 : -1);
  const pushC = dc === 0 ? 0 : (dc > 0 ? 1 : -1);
  if (pushR === 0 && pushC === 0) return state; // 同じ位置

  const destRow = targetPos.row + pushR;
  const destCol = targetPos.col + pushC;

  // 盤外 = 壁に衝突
  if (destRow < 0 || destRow > 2 || destCol < 0 || destCol > 2) {
    state = applyDamage(state, targetPos, wallDamage);
    state = addLog(state, `${char.card.name} が壁に衝突！ ${wallDamage}ダメージ`);
    return state;
  }

  const destCell = getCell(state, { row: destRow, col: destCol });
  if (destCell.character) {
    // 移動先にキャラがいる = 壁ダメージ
    state = applyDamage(state, targetPos, wallDamage);
    state = addLog(state, `${char.card.name} は押し出せない！ ${wallDamage}ダメージ`);
    return state;
  }

  // 移動実行
  state = setCharacterOnCell(state, targetPos, null);
  state = setCharacterOnCell(state, { row: destRow, col: destCol }, char);
  state = addLog(state, `${char.card.name} が (${targetPos.row},${targetPos.col}) → (${destRow},${destCol}) へ押し出された`);
  return state;
}

/** 引き寄せ: ソースに向かって1マス移動 */
function applyPull(state: GameState, sourcePos: Position, targetPos: Position): GameState {
  const cell = getCell(state, targetPos);
  if (!cell.character) return state;
  if (cell.character.card.keywords.includes('anchor')) {
    state = addLog(state, `${cell.character.card.name} は不動（anchor）で引き寄せられない`);
    return state;
  }
  const char = cell.character;
  const dr = sourcePos.row - targetPos.row;
  const dc = sourcePos.col - targetPos.col;
  const pullR = dr === 0 ? 0 : (dr > 0 ? 1 : -1);
  const pullC = dc === 0 ? 0 : (dc > 0 ? 1 : -1);
  if (pullR === 0 && pullC === 0) return state;

  const destRow = targetPos.row + pullR;
  const destCol = targetPos.col + pullC;
  if (destRow < 0 || destRow > 2 || destCol < 0 || destCol > 2) return state;

  const destCell = getCell(state, { row: destRow, col: destCol });
  if (destCell.character) return state; // 移動先が埋まっている

  state = setCharacterOnCell(state, targetPos, null);
  state = setCharacterOnCell(state, { row: destRow, col: destCol }, char);
  state = addLog(state, `${char.card.name} が (${targetPos.row},${targetPos.col}) → (${destRow},${destCol}) へ引き寄せられた`);
  return state;
}

// ========================================
// ターゲット解決
// ========================================

/**
 * エフェクトのターゲットを解決して、対象位置のリストを返す
 */
function resolveTargets(
  state: GameState,
  effect: CardEffect,
  ctx: EffectContext,
): Position[] {
  const owner = ctx.sourceChar.owner;
  const enemyId: PlayerId = owner === 0 ? 1 : 0;

    switch (effect.target) {
      case 'self':
        return [ctx.sourcePos];
      case 'adjacent_enemy': {
        if (ctx.targetPos) {
          const adj = findAdjacentEnemies(state, ctx.sourcePos, owner).map(e => e.pos);
          return adj.some(p => p.row === ctx.targetPos!.row && p.col === ctx.targetPos!.col) ? [ctx.targetPos] : [];
        }
        const enemies = findAdjacentEnemies(state, ctx.sourcePos, owner);
        if (enemies.length === 0) return [];
        return [enemies[Math.floor(Math.random() * enemies.length)].pos];
      }
      case 'target_enemy': {
        // 攻撃対象がある場合はそれ、なければランダム敵1体
        if (ctx.targetPos) return [ctx.targetPos];
        const enemies = findEnemies(state, owner);
      if (enemies.length === 0) return [];
      // copy_atkの場合は最もATKが高い敵を選ぶ
      if (effect.effect === 'copy_atk') {
        let bestAtk = -1;
        let bestPos: Position | null = null;
        for (const e of enemies) {
          let atk = e.char.card.atk;
          for (const b of e.char.buffs) {
            if (b.type === 'atk_up') atk += b.value;
            if (b.type === 'atk_down') atk -= b.value;
          }
          if (atk > bestAtk) {
            bestAtk = atk;
            bestPos = e.pos;
          }
        }
        return bestPos ? [bestPos] : [];
      }
      // デフォルト: ランダム1体
      const idx = Math.floor(Math.random() * enemies.length);
      return [enemies[idx].pos];
    }
    case 'target_ally': {
      const allies = findCharacters(state, owner).filter(
        a => !(a.pos.row === ctx.sourcePos.row && a.pos.col === ctx.sourcePos.col)
      );
      if (allies.length === 0) return [];
      const idx = Math.floor(Math.random() * allies.length);
      return [allies[idx].pos];
    }
    case 'all_enemies':
      return findEnemies(state, owner).map(e => e.pos);
    case 'all_allies':
      return findCharacters(state, owner).map(a => a.pos);
    case 'adjacent_allies':
      return findAdjacentAllies(state, ctx.sourcePos, owner).map(a => a.pos);
    case 'adjacent_enemies':
      return findAdjacentEnemies(state, ctx.sourcePos, owner).map(a => a.pos);
    default:
      return [];
  }
}

// ========================================
// 単一エフェクト適用
// ========================================

function applySingleEffect(
  state: GameState,
  effect: CardEffect,
  ctx: EffectContext,
): GameState {
  // 条件チェック
  if (!evaluateCondition(state, effect.condition, ctx)) {
    return state;
  }

  const owner = ctx.sourceChar.owner;
  const enemyId: PlayerId = owner === 0 ? 1 : 0;

  // handCost: 手札コスト処理（手札をN枚捨てる。不足なら不発）
  let discardedCount = 0;
  if (effect.handCost && effect.handCost > 0) {
    const player = state.players[owner];
    if (player.hand.length === 0) {
      state = addLog(state, `手札がないため ${ctx.sourceChar.card.name} の効果は不発`);
      return state;
    }
    const toDiscard = Math.min(effect.handCost, player.hand.length);
    discardedCount = toDiscard;
    const discarded = player.hand.slice(0, toDiscard);
    const remaining = player.hand.slice(toDiscard);
    state = updatePlayer(state, owner, {
      hand: remaining,
      discard: [...player.discard, ...discarded],
    });
    state = addLog(state, `手札を${toDiscard}枚捨てた`);
    // on_discardトリガー: 手札を捨てるたびに発動するキャラの効果
    state = fireOnDiscardTriggers(state, owner, toDiscard);
  }

  const targets = resolveTargets(state, effect, ctx);

  switch (effect.effect) {
    case 'damage':
      // handCost付きdamageは捨てた枚数がダメージ値（value=0の場合）
      if (effect.handCost && effect.value === 0) {
        for (const pos of targets) {
          state = applyDamage(state, pos, discardedCount);
        }
        break;
      }
      for (const pos of targets) {
        state = applyDamage(state, pos, effect.value);
      }
      break;

    case 'heal':
      for (const pos of targets) {
        state = applyHeal(state, pos, effect.value);
      }
      break;

    case 'buff_atk':
      for (const pos of targets) {
        state = applyBuffAtk(state, pos, effect.value);
      }
      break;

    case 'debuff_atk':
      for (const pos of targets) {
        state = applyDebuffAtk(state, pos, effect.value);
      }
      break;

    case 'seal':
      for (const pos of targets) {
        state = applySeal(state, pos, effect.value);
      }
      break;

    case 'action_tax':
      // v2: action_tax デバフ付与（再行動コスト+value）
      for (const pos of targets) {
        const ch = state.board[pos.row][pos.col].character;
        if (ch) {
          const newBuffs = [...ch.buffs, { type: 'action_tax' as const, value: effect.value, duration: undefined }];
          const newBoard = state.board.map((row, r) =>
            row.map((cell, c) => r === pos.row && c === pos.col ? { ...cell, character: { ...ch, buffs: newBuffs } } : cell)
          );
          state = { ...state, board: newBoard };
        }
      }
      break;

    case 'mark':
      // v2: マーク付与（スナイプ用、反撃判定に影響）
      for (const pos of targets) {
        const ch = state.board[pos.row][pos.col].character;
        if (ch) {
          const newBuffs = [...ch.buffs, { type: 'marked' as const, value: 1, duration: undefined }];
          const newBoard = state.board.map((row, r) =>
            row.map((cell, c) => r === pos.row && c === pos.col ? { ...cell, character: { ...ch, buffs: newBuffs } } : cell)
          );
          state = { ...state, board: newBoard };
        }
      }
      break;

    case 'rotate':
      for (const pos of targets) {
        state = applyRotate(state, pos, effect.value);
      }
      break;

    case 'draw':
      state = applyDraw(state, owner, effect.value);
      break;

    case 'steal_mana':
      // v2: 相手マナ-value、自分マナ+value
      {
        const enemyMana = state.players[enemyId].mana;
        const stolen = Math.min(effect.value, enemyMana);
        state = { ...state, players: state.players.map((p, i) =>
          i === owner ? { ...p, mana: p.mana + stolen } : i === enemyId ? { ...p, mana: p.mana - stolen } : p
        ) as [any, any] };
      }
      break;

      case 'gain_mana':
        // target が self or all_allies → 自分のマナ
        // target が target_enemy or all_enemies → 敵のマナ（マイナスなら減らす）
        if (effect.target === 'target_enemy' || effect.target === 'all_enemies') {
          state = applyGainMana(state, enemyId, effect.value);
        } else {
          state = applyGainMana(state, owner, effect.value);
        }
        break;

      case 'exhaust_attack': {
        const sourceCell = getCell(state, ctx.sourcePos);
        if (sourceCell.character) {
          state = setCharacterOnCell(state, ctx.sourcePos, {
            ...sourceCell.character,
            hasActedThisTurn: true,
          });
        }
        break;
      }

      case 'discard_draw': {
        // handCostで既に手札を捨て済み → (value+1)枚ドロー
        const drawCount = effect.value + 1;
        state = applyDraw(state, owner, drawCount);
      break;
    }

    case 'destroy_self': {
      // all_allies で自分以外を破壊、self なら自壊
      if (effect.target === 'all_allies') {
        const allies = findCharacters(state, owner).filter(
          a => !(a.pos.row === ctx.sourcePos.row && a.pos.col === ctx.sourcePos.col)
        );
        for (const ally of allies) {
          state = destroyCharacter(state, ally.pos);
        }
      } else {
        for (const pos of targets) {
          state = destroyCharacter(state, pos);
        }
      }
      break;
    }

    case 'discard_random':
      state = applyDiscardRandom(state, enemyId, effect.value);
      break;

    case 'copy_atk': {
      // ターゲットのATKをソースにコピー
      if (targets.length > 0) {
        state = applyCopyAtk(state, ctx.sourcePos, targets[0]);
      }
      break;
    }

    case 'field_quake': {
      // 属性反転（対立属性へ変更）
      for (const pos of targets) {
        const cell = getCell(state, pos);
        const opposites: Record<string, string> = {
          faust: 'geist', geist: 'faust',
          licht: 'nacht', nacht: 'licht',
          nicht: 'nicht',
        };
        const newElement = (opposites[cell.element] || cell.element) as any;
        state = setCell(state, pos, { ...cell, element: newElement });
        state = addLog(state, `(${pos.row},${pos.col}) の属性が ${newElement} に変化`);
      }
      break;
    }

    case 'field_swap': {
      // ソースのマスと対象のマスの属性を入れ替え
      if (targets.length > 0) {
        const srcCell = getCell(state, ctx.sourcePos);
        const tgtCell = getCell(state, targets[0]);
        const srcElem = srcCell.element;
        const tgtElem = tgtCell.element;
        state = setCell(state, ctx.sourcePos, { ...srcCell, element: tgtElem });
        state = setCell(state, targets[0], { ...tgtCell, element: srcElem });
        state = addLog(state, `(${ctx.sourcePos.row},${ctx.sourcePos.col}) と (${targets[0].row},${targets[0].col}) の属性を入替: ${srcElem}↔${tgtElem}`);
      }
      break;
    }

    case 'move': {
      // 対象をランダムな空きマスへ移動
      for (const pos of targets) {
        state = applyMove(state, pos);
      }
      break;
    }

    case 'swap': {
      // ソースと対象の位置を入れ替え
      if (targets.length > 0) {
        state = applySwap(state, ctx.sourcePos, targets[0]);
        // Track swap for has_swapped_this_turn condition
        const swapped = Array.isArray((state as any).swappedThisTurn) ? [...(state as any).swappedThisTurn] : [];
        const srcId = ctx.sourceChar.card.id;
        if (!swapped.includes(srcId)) swapped.push(srcId);
        state = { ...state, swappedThisTurn: swapped } as GameState;
      }
      break;
    }

    case 'push': {
      // ソースから離れる方向に1マス押し出す。端なら壁ダメージ
      for (const pos of targets) {
        state = applyPush(state, ctx.sourcePos, pos, effect.value || 2);
      }
      break;
    }

    case 'pull': {
      // ソースに向かって1マス引き寄せ
      for (const pos of targets) {
        state = applyPull(state, ctx.sourcePos, pos);
      }
      break;
    }

    case 'hp_swap': {
      // 自分と対象のHP交換
      if (targets.length > 0) {
        const targetCell = getCell(state, targets[0]);
        const sourceCell = getCell(state, ctx.sourcePos);
        if (targetCell.character && sourceCell.character) {
          const srcHp = sourceCell.character.currentHp;
          const tgtHp = targetCell.character.currentHp;
          state = setCharacterOnCell(state, ctx.sourcePos, {
            ...sourceCell.character, currentHp: tgtHp,
          });
          state = setCharacterOnCell(state, targets[0], {
            ...targetCell.character, currentHp: srcHp,
          });
          state = addLog(state, `${sourceCell.character.card.name} と ${targetCell.character.card.name} のHPを交換 (${srcHp}↔${tgtHp})`);
        }
      }
      break;
    }

    case 'brainwash': {
      // 対象を行動済みにし、brainwashedバフを付与
      for (const pos of targets) {
        const cell = getCell(state, pos);
        if (cell.character) {
          const dur = effect.value || 1;
          const newBuffs = [...cell.character.buffs, { type: 'brainwashed' as const, value: 1, duration: dur }];
          state = setCharacterOnCell(state, pos, {
            ...cell.character,
            hasActedThisTurn: true,
            hasRotatedThisTurn: true,
            buffs: newBuffs as any,
          });
          state = addLog(state, `${cell.character.card.name} は洗脳された（行動不能）`);
        }
      }
      break;
    }

    case 'freeze': {
      // 凍結バフ付与
      for (const pos of targets) {
        const cell = getCell(state, pos);
        if (cell.character) {
          const newBuffs = [...cell.character.buffs, { type: 'frozen' as const, value: 1, duration: 1 }];
          state = setCharacterOnCell(state, pos, { ...cell.character, buffs: newBuffs });
          state = addLog(state, `${cell.character.card.name} は凍結した`);
        }
      }
      break;
    }

    case 'direction_lock': {
      // 向き固定バフ付与
      for (const pos of targets) {
        const cell = getCell(state, pos);
        if (cell.character) {
          const newBuffs = [...cell.character.buffs, { type: 'direction_locked' as const, value: 1, duration: effect.value }];
          state = setCharacterOnCell(state, pos, { ...cell.character, buffs: newBuffs });
          state = addLog(state, `${cell.character.card.name} の向きが固定された（${effect.value}T）`);
        }
      }
      break;
    }

    case 'element_corrupt': {
      // 対象マスとnichtマスの属性を入替
      for (const pos of targets) {
        const targetCell = getCell(state, pos);
        if (targetCell.element === 'nicht') continue; // 既にnichtなら無視
        // 盤面からnichtマスを探す（対象マス以外）
        let nichtPos: { row: number; col: number } | null = null;
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            const p = { row: r, col: c };
            if (p.row === pos.row && p.col === pos.col) continue;
            if (getCell(state, p).element === 'nicht') { nichtPos = p; break; }
          }
          if (nichtPos) break;
        }
        if (!nichtPos) continue; // nichtマスが無ければ何もしない
        const nichtCell = getCell(state, nichtPos);
        state = setCell(state, pos, { ...targetCell, element: 'nicht' });
        state = setCell(state, nichtPos, { ...nichtCell, element: targetCell.element });
        state = addLog(state, `(${pos.row},${pos.col}) と (${nichtPos.row},${nichtPos.col}) の属性を入替: ${targetCell.element}↔nicht`);
      }
      break;
    }

    case 'piercing_damage': {
      // protection無視ダメージ
      for (const pos of targets) {
        state = applyDamage(state, pos, effect.value);
      }
      break;
    }

    case 'swap_enemies': {
      // 敵2体の位置を入替え（targetsから2体選ぶ）
      const enemies = findEnemies(state, owner);
      if (enemies.length >= 2) {
        const idx1 = Math.floor(Math.random() * enemies.length);
        let idx2 = Math.floor(Math.random() * (enemies.length - 1));
        if (idx2 >= idx1) idx2++;
        state = applySwap(state, enemies[idx1].pos, enemies[idx2].pos);
      }
      break;
    }

    case 'grant_dodge': {
      const sourceCardId = ctx.sourceChar?.card.id;
      for (const pos of targets) {
        const cell = getCell(state, pos);
        if (cell.character && !hasAnyMarker(cell.character)) {
          const newBuffs = [...cell.character.buffs, { type: 'has_dodge' as const, value: 1, duration: 99, grantedBy: sourceCardId }];
          state = setCharacterOnCell(state, pos, { ...cell.character, buffs: newBuffs as any });
          state = addLog(state, `${cell.character.card.name} が【回避】を得た`);
        }
      }
      break;
    }

    case 'skip_draw': {
      // ドロースキップは startTurn() で先読み処理済み。ここではログのみ
      state = addLog(state, `${ctx.sourceChar.card.name} の効果でドローをスキップ`);
      break;
    }

    case 'reduce_activate_cost': {
      // そのターンのみ攻撃コスト減少（バフとして付与、duration=1で自動消滅）
      for (const pos of targets) {
        const cell = getCell(state, pos);
        if (cell.character) {
          // 既存の activate_cost_reduction バフがあれば上書きせず加算
          const newBuffs = [...cell.character.buffs, { type: 'atk_cost_reduction' as const, value: effect.value, duration: 1 }];
          state = setCharacterOnCell(state, pos, { ...cell.character, buffs: newBuffs as any });
          state = addLog(state, `${cell.character.card.name} のこのターンの攻撃コスト-${effect.value}`);
        }
      }
      break;
    }

    case 'range_expand': {
      // 範囲拡張は攻撃解決時に判定。ここではログのみ
      break;
    }

    case 'grant_protection': {
      const sourceCardId = ctx.sourceChar?.card.id;
      for (const pos of targets) {
        const cell = getCell(state, pos);
        if (cell.character && !hasAnyMarker(cell.character)) {
          const newBuffs = [...cell.character.buffs, { type: 'has_protection' as const, value: 1, duration: 99, grantedBy: sourceCardId }];
          state = setCharacterOnCell(state, pos, { ...cell.character, buffs: newBuffs as any });
          state = addLog(state, `${cell.character.card.name} が【防護】マーカーを得た`);
        }
      }
      break;
    }

    case 'grant_piercing': {
      const sourceCardId = ctx.sourceChar?.card.id;
      for (const pos of targets) {
        const cell = getCell(state, pos);
        if (cell.character && !hasAnyMarker(cell.character)) {
          const newBuffs = [...cell.character.buffs, { type: 'has_piercing' as const, value: 1, duration: 99, grantedBy: sourceCardId }];
          state = setCharacterOnCell(state, pos, { ...cell.character, buffs: newBuffs as any });
          state = addLog(state, `${cell.character.card.name} が【貫通】マーカーを得た`);
        }
      }
      break;
    }

    case 'grant_quickness': {
      const sourceCardId = ctx.sourceChar?.card.id;
      for (const pos of targets) {
        const cell = getCell(state, pos);
        if (cell.character && !hasAnyMarker(cell.character)) {
          const newBuffs = [...cell.character.buffs, { type: 'has_quickness' as const, value: 1, duration: 99, grantedBy: sourceCardId }];
          state = setCharacterOnCell(state, pos, { ...cell.character, buffs: newBuffs as any });
          state = addLog(state, `${cell.character.card.name} が【先制】マーカーを得た`);
        }
      }
      break;
    }

    case 'consume_markers': {
      // アルス専用: 味方のマーカーを全て自分に集める
      const allies = findAllies(state, owner);
      const markerTypes = ['has_protection', 'has_dodge', 'has_piercing', 'has_quickness'] as const;
      const collectedMarkers: Array<{ type: string; value: number; duration?: number }> = [];

      // 味方からマーカーを収集（自分は除く）
      for (const ally of allies) {
        if (ally.pos.row === ctx.sourcePos.row && ally.pos.col === ctx.sourcePos.col) continue;
        const aCell = getCell(state, ally.pos);
        if (aCell.character) {
          const kept: typeof aCell.character.buffs = [];
          for (const b of aCell.character.buffs) {
            if ((markerTypes as readonly string[]).includes(b.type)) {
              collectedMarkers.push({ ...b });
            } else {
              kept.push(b);
            }
          }
          if (kept.length !== aCell.character.buffs.length) {
            state = setCharacterOnCell(state, ally.pos, { ...aCell.character, buffs: kept as any });
          }
        }
      }

      const markerCount = collectedMarkers.length;
      state = addLog(state, `盟約の収穫: 味方から${markerCount}個のマーカーを集めた`);

      // マーカーを自分に付与（grantedByをクリアして永続化 — 付与元撃破でも消えない）
      const srcCell = getCell(state, ctx.sourcePos);
      if (srcCell.character && markerCount > 0) {
        const permanentMarkers = collectedMarkers.map(m => ({ ...m, grantedBy: undefined }));
        const newBuffs = [...srcCell.character.buffs, ...permanentMarkers as any];
        // ATKボーナス: 2個以上→+2、4個以上→さらに+2
        let atkBonus = 0;
        if (markerCount >= 2) atkBonus += 2;
        if (markerCount >= 4) atkBonus += 2;
        if (atkBonus > 0) {
          newBuffs.push({ type: 'atk_up' as any, value: atkBonus, duration: 99 });
          state = addLog(state, `ATK+${atkBonus}`);
        }
        state = setCharacterOnCell(state, ctx.sourcePos, { ...srcCell.character, buffs: newBuffs as any });
      }
      break;
    }
  }

  return state;
}

// ========================================
// 公開API: トリガーに応じたエフェクト一括解決
// ========================================

/**
 * 指定トリガーに合致する全エフェクトを順番に解決する
 */
export function resolveEffects(
  state: GameState,
  trigger: CardEffect['trigger'],
  ctx: EffectContext,
): GameState {
  const effects = ctx.sourceChar.card.effects.filter(e => e.trigger === trigger);
  if (effects.length === 0) return state;

  // 封印チェック: sealed状態ならエフェクト発動しない
  const isSealed = ctx.sourceChar.buffs.some(b => b.type === 'sealed');
  if (isSealed) {
    state = addLog(state, `${ctx.sourceChar.card.name} は封印されており効果が発動しない`);
    return state;
  }

  for (const effect of effects) {
    state = applySingleEffect(state, effect, ctx);
    // ソースキャラが死んでいたら残りのエフェクトはスキップ
    const sourceCell = getCell(state, ctx.sourcePos);
    if (!sourceCell.character) break;
  }

  return state;
}

/**
 * on_discardトリガー: 手札を捨てるたびに発動する盤面上のキャラ効果を解決。
 * カラン等の「手札を捨てるたびマナ+1」に対応。
 */
function fireOnDiscardTriggers(state: GameState, playerId: PlayerId, discardCount: number): GameState {
  const chars = findCharacters(state, playerId);
  for (const { pos, char } of chars) {
    const discardEffects = char.card.effects.filter(e => e.trigger === 'on_discard');
    if (discardEffects.length === 0) continue;
    if (char.buffs.some(b => b.type === 'sealed')) continue;

    // 捨てた枚数分だけトリガー発動
    for (let i = 0; i < discardCount; i++) {
      const cell = getCell(state, pos);
      if (!cell.character) break;
      for (const effect of discardEffects) {
        state = applySingleEffect(state, effect, { sourcePos: pos, sourceChar: cell.character });
      }
    }
  }
  return state;
}

/**
 * ターン開始/終了時、盤面全体の該当トリガーを解決
 */
export function resolveGlobalTrigger(
  state: GameState,
  trigger: 'on_turn_start' | 'on_turn_end',
  playerId: PlayerId,
): GameState {
  const chars = findCharacters(state, playerId);
  for (const { pos, char } of chars) {
    // キャラがまだ生存しているか再確認
    const cell = getCell(state, pos);
    if (!cell.character) continue;

    state = resolveEffects(state, trigger, {
      sourcePos: pos,
      sourceChar: cell.character,
    });
  }
  return state;
}

/**
 * バフの持続ターンを減算し、期限切れのバフを除去する
 */
export function tickBuffDurations(state: GameState, playerId: PlayerId): GameState {
  const newBoard = state.board.map((row) =>
    row.map((cell) => {
      if (!cell.character || cell.character.owner !== playerId) return cell;
      const newBuffs = cell.character.buffs
        .map(b => b.duration !== undefined ? { ...b, duration: b.duration - 1 } : b)
        .filter(b => b.duration === undefined || b.duration > 0);
      return { ...cell, character: { ...cell.character, buffs: newBuffs } };
    }),
  );
  return { ...state, board: newBoard };
}

// ========================================
// アイテム効果解決
// ========================================

export interface ItemEffectContext {
  owner: PlayerId;
  targetPos?: Position; // UI/AIで選んだターゲット
}

/**
 * アイテムのon_useエフェクトをすべて解決する。
 * キャラ効果と違い、sourceCharが存在しないため専用パスを使う。
 */
export function resolveItemEffects(
  state: GameState,
  item: ItemCard,
  ctx: ItemEffectContext,
): GameState {
  const effects = item.effects.filter(e => e.trigger === 'on_use');
  const owner = ctx.owner;
  const enemyId: PlayerId = owner === 0 ? 1 : 0;

  for (const effect of effects) {
    // handCost: アイテムの手札コスト処理
    if (effect.handCost && effect.handCost > 0) {
      const player = state.players[owner];
      if (player.hand.length === 0) {
        state = addLog(state, `手札がないため ${item.name} の効果は不発`);
        continue;
      }
      const toDiscard = Math.min(effect.handCost, player.hand.length);
      const discarded = player.hand.slice(0, toDiscard);
      const remaining = player.hand.slice(toDiscard);
      state = updatePlayer(state, owner, {
        hand: remaining,
        discard: [...state.players[owner].discard, ...discarded],
      });
      state = addLog(state, `手札を${toDiscard}枚捨てた`);
      state = fireOnDiscardTriggers(state, owner, toDiscard);
    }

    // ターゲット解決
    const targets = resolveItemTargets(state, effect, owner, ctx.targetPos);

    switch (effect.effect) {
      case 'damage':
        for (const pos of targets) {
          state = applyDamage(state, pos, effect.value);
        }
        break;
      case 'heal':
        for (const pos of targets) {
          state = applyHeal(state, pos, effect.value);
        }
        break;
      case 'buff_atk':
        for (const pos of targets) {
          state = applyBuffAtk(state, pos, effect.value);
        }
        break;
      case 'debuff_atk':
        for (const pos of targets) {
          state = applyDebuffAtk(state, pos, effect.value);
        }
        break;
      case 'seal':
        for (const pos of targets) {
          state = applySeal(state, pos, effect.value);
        }
        break;
      case 'rotate':
        for (const pos of targets) {
          state = applyRotate(state, pos, effect.value);
        }
        break;
      case 'draw':
        state = applyDraw(state, owner, effect.value);
        break;
        case 'gain_mana':
          if (effect.target === 'target_enemy' || effect.target === 'all_enemies') {
            state = applyGainMana(state, enemyId, effect.value);
          } else {
            state = applyGainMana(state, owner, effect.value);
          }
          break;
        case 'field_quake':
          for (const pos of targets) {
            const cell = getCell(state, pos);
          const opposites: Record<string, string> = {
            faust: 'geist', geist: 'faust',
            licht: 'nacht', nacht: 'licht',
            nicht: 'nicht',
          };
          const newElement = (opposites[cell.element] || cell.element) as any;
          state = setCell(state, pos, { ...cell, element: newElement });
          state = addLog(state, `(${pos.row},${pos.col}) の属性が ${newElement} に変化`);
        }
        break;
      case 'move':
        for (const pos of targets) {
          state = applyMove(state, pos);
        }
        break;
      case 'discard_random':
        state = applyDiscardRandom(state, enemyId, effect.value);
        break;
      case 'freeze':
        for (const pos of targets) {
          const cell = getCell(state, pos);
          if (cell.character) {
            const newBuffs = [...cell.character.buffs, { type: 'frozen' as const, value: 1, duration: 1 }];
            state = setCharacterOnCell(state, pos, { ...cell.character, buffs: newBuffs });
            state = addLog(state, `${cell.character.card.name} は凍結した`);
          }
        }
        break;
      case 'brainwash':
        for (const pos of targets) {
          const cell = getCell(state, pos);
          if (cell.character) {
            state = setCharacterOnCell(state, pos, {
              ...cell.character, hasActedThisTurn: true, hasRotatedThisTurn: true,
            });
            state = addLog(state, `${cell.character.card.name} は洗脳された（行動不能）`);
          }
        }
        break;
      case 'direction_lock':
        for (const pos of targets) {
          const cell = getCell(state, pos);
          if (cell.character) {
            const newBuffs = [...cell.character.buffs, { type: 'direction_locked' as const, value: 1, duration: effect.value }];
            state = setCharacterOnCell(state, pos, { ...cell.character, buffs: newBuffs });
            state = addLog(state, `${cell.character.card.name} の向きが固定された（${effect.value}T）`);
          }
        }
        break;
      case 'element_corrupt':
        for (const pos of targets) {
          const tgtCell = getCell(state, pos);
          if (tgtCell.element === 'nicht') continue;
          let nPos: { row: number; col: number } | null = null;
          for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
              const p = { row: r, col: c };
              if (p.row === pos.row && p.col === pos.col) continue;
              if (getCell(state, p).element === 'nicht') { nPos = p; break; }
            }
            if (nPos) break;
          }
          if (!nPos) continue;
          const nCell = getCell(state, nPos);
          state = setCell(state, pos, { ...tgtCell, element: 'nicht' });
          state = setCell(state, nPos, { ...nCell, element: tgtCell.element });
          state = addLog(state, `(${pos.row},${pos.col}) と (${nPos.row},${nPos.col}) の属性を入替: ${tgtCell.element}↔nicht`);
        }
        break;
      case 'piercing_damage':
        for (const pos of targets) {
          state = applyDamage(state, pos, effect.value);
        }
        break;
      case 'swap_enemies': {
        const enemies = findEnemies(state, owner);
        if (enemies.length >= 2) {
          const idx1 = Math.floor(Math.random() * enemies.length);
          let idx2 = Math.floor(Math.random() * (enemies.length - 1));
          if (idx2 >= idx1) idx2++;
          state = applySwap(state, enemies[idx1].pos, enemies[idx2].pos);
        }
        break;
      }
      case 'grant_dodge':
        // 条件付き回避（アイテム経由）
        for (const pos of targets) {
          const cell = getCell(state, pos);
          if (cell.character && !hasAnyMarker(cell.character)) {
            const newBuffs = [...cell.character.buffs, { type: 'has_dodge' as const, value: 1, duration: 99 }];
            state = setCharacterOnCell(state, pos, { ...cell.character, buffs: newBuffs as any });
            state = addLog(state, `${cell.character.card.name} が【回避】を得た`);
          }
        }
        break;
      case 'grant_protection':
        for (const pos of targets) {
          const cell = getCell(state, pos);
          if (cell.character && !hasAnyMarker(cell.character)) {
            const newBuffs = [...cell.character.buffs, { type: 'has_protection' as const, value: 1, duration: 99 }];
            state = setCharacterOnCell(state, pos, { ...cell.character, buffs: newBuffs as any });
            state = addLog(state, `${cell.character.card.name} が【防護】を得た`);
          }
        }
        break;
      case 'grant_piercing':
        for (const pos of targets) {
          const cell = getCell(state, pos);
          if (cell.character && !hasAnyMarker(cell.character)) {
            const newBuffs = [...cell.character.buffs, { type: 'has_piercing' as const, value: 1, duration: 99 }];
            state = setCharacterOnCell(state, pos, { ...cell.character, buffs: newBuffs as any });
            state = addLog(state, `${cell.character.card.name} が【貫通】を得た`);
          }
        }
        break;
      case 'discard_draw': {
        // handCostで既に捨て済み → (value+1)枚ドロー
        const drawCount = effect.value + 1;
        state = applyDraw(state, owner, drawCount);
        break;
      }
      case 'swap': {
        // 属性召喚: 場の味方と手札のキャラを入れ替え（未使用の場合はスキップ）
        // TODO: 属性一致チェック＋手札キャラ選択のフル実装
        state = addLog(state, `${item.name} の入替効果を発動`);
        break;
      }
      case 'reduce_activate_cost':
        for (const pos of targets) {
          const cell = getCell(state, pos);
          if (cell.character) {
            const newBuffs = [
              ...cell.character.buffs,
              { type: 'atk_cost_reduction' as const, value: effect.value, duration: 1 },
            ];
            state = setCharacterOnCell(state, pos, {
              ...cell.character,
              buffs: newBuffs as any,
            });
            state = addLog(state, `${cell.character.card.name} のこのターンの攻撃コスト-${effect.value}`);
          }
        }
        break;
    }
  }

  return state;
}

/**
 * アイテムのターゲット解決（キャラ依存なし版）
 */
function resolveItemTargets(
  state: GameState,
  effect: CardEffect,
  owner: PlayerId,
  selectedTarget?: Position,
): Position[] {
  const enemyId: PlayerId = owner === 0 ? 1 : 0;

    switch (effect.target) {
      case 'self':
        return []; // アイテムのselfはドロー/マナ等、位置不要
      case 'adjacent_enemy': {
        if (selectedTarget) return [selectedTarget];
        const enemies = findEnemies(state, owner);
        if (enemies.length === 0) return [];
        return [enemies[Math.floor(Math.random() * enemies.length)].pos];
      }
      case 'target_enemy': {
        if (selectedTarget) return [selectedTarget];
        const enemies = findEnemies(state, owner);
      if (enemies.length === 0) return [];
      return [enemies[Math.floor(Math.random() * enemies.length)].pos];
    }
    case 'target_ally': {
      if (selectedTarget) return [selectedTarget];
      const allies = findCharacters(state, owner);
      if (allies.length === 0) return [];
      return [allies[Math.floor(Math.random() * allies.length)].pos];
    }
    case 'target_cell': {
      if (selectedTarget) return [selectedTarget];
      return [];
    }
    case 'all_enemies':
      return findEnemies(state, owner).map(e => e.pos);
    case 'all_allies':
      return findCharacters(state, owner).map(a => a.pos);
    case 'adjacent_allies':
      // アイテムは位置がないため全味方を対象
      return findCharacters(state, owner).map(a => a.pos);
    case 'adjacent_enemies':
      return findEnemies(state, owner).map(e => e.pos);
    default:
      return [];
  }
}
