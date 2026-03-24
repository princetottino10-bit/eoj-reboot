import { isCharacter, isItem } from '../types/card';
import type { CharacterCard, ItemCard, Direction } from '../types/card';
import type { GameState, Position, PlayerId, BoardCharacter } from '../types/game';
import { executeSummon, executeAttack, executeItem, endTurn, getAttackTargets } from '../engine/actions';
import { getAdjacentPositions, calculateHpBonus } from '../engine/utils';
import { getValidTargetCells, isBlindSpot } from '../engine/range';
import { countControlledCells } from '../engine/state';

const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left'];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getValidSummonPositions(state: GameState): Position[] {
  const pid = state.currentPlayer;
  const positions: Position[] = [];

  let hasChars = false;
  for (const row of state.board) {
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
      const cell = state.board[row][col];
      if (cell.character !== null) continue;
      if (!hasChars) {
        positions.push({ row, col });
      } else {
        const adj = getAdjacentPositions({ row, col });
        if (adj.some((p) => state.board[p.row][p.col].character !== null)) {
          positions.push({ row, col });
        }
      }
    }
  }
  return positions;
}

/** 攻撃範囲で敵を何体カバーできるか */
function countEnemiesInRange(
  state: GameState,
  pos: Position,
  card: CharacterCard,
  dir: Direction,
  pid: PlayerId,
): number {
  const cells = getValidTargetCells(pos, dir, card.attackRange);
  let count = 0;
  for (const c of cells) {
    const cell = state.board[c.row][c.col];
    if (cell.character && cell.character.owner !== pid) count++;
  }
  return count;
}

/** 全方向から最もスコアの高い向きを選ぶ */
function chooseBestDirection(
  state: GameState,
  pos: Position,
  card: CharacterCard,
  pid: PlayerId,
): Direction {
  if (card.attackRange === 'magic') return 'up';

  let bestDir: Direction = pickRandom(DIRECTIONS);
  let bestScore = -999;

  for (const dir of DIRECTIONS) {
    const enemiesHit = countEnemiesInRange(state, pos, card, dir, pid);
    const score = enemiesHit * 10;
    if (score > bestScore) {
      bestScore = score;
      bestDir = dir;
    }
  }
  return bestDir;
}

interface SummonCandidate {
  card: CharacterCard;
  pos: Position;
  dir: Direction;
  score: number;
}

function scoreSummonCandidate(
  state: GameState,
  card: CharacterCard,
  pos: Position,
  pid: PlayerId,
): SummonCandidate | null {
  const cell = state.board[pos.row][pos.col];
  const dir = chooseBestDirection(state, pos, card, pid);

  let score = 0;
  const currentControl = countControlledCells(state, pid);
  const controlAfter = currentControl + 1;
  score += controlAfter * 10;
  if (controlAfter >= 5) score += 100;
  if (controlAfter === 4) score += 30;

  const adj = getAdjacentPositions(pos);
  const adjacentAllies = adj.filter(a => {
    const c = state.board[a.row][a.col].character;
    return c && c.owner === pid;
  }).length;
  score += adjacentAllies * 6;

  const hpBonus = calculateHpBonus(card.element, cell.element);
  score += hpBonus * 4;
  score += card.hp / 2 + card.atk / 3;
  score += countEnemiesInRange(state, pos, card, dir, pid) * 3;

  if (pos.row === 1 && pos.col === 1) score += 5;

  const enemyId: PlayerId = pid === 0 ? 1 : 0;
  const enemyControl = countControlledCells(state, enemyId);
  if (enemyControl >= 4) {
    const adjacentEnemies = adj.filter(a => {
      const c = state.board[a.row][a.col].character;
      return c && c.owner !== pid;
    }).length;
    score += adjacentEnemies * 8;
  }

  return { card, pos, dir, score };
}

function getAttackCandidates(state: GameState, pid: PlayerId) {
  const candidates: { pos: Position; char: BoardCharacter; score: number }[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cell = state.board[row][col];
      if (cell.character && cell.character.owner === pid && !cell.character.hasActedThisTurn) {
        const targets = getAttackTargets(state, { row, col }, cell.character);
        if (targets.length > 0) {
          candidates.push({ pos: { row, col }, char: cell.character, score: cell.character.card.atk });
        }
      }
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

function wouldKillAnyTarget(state: GameState, attackerPos: Position, attacker: BoardCharacter, pid: PlayerId): boolean {
  const targets = getAttackTargets(state, attackerPos, attacker);
  let atk = attacker.card.atk;
  for (const b of attacker.buffs) {
    if (b.type === 'atk_up') atk += b.value;
    if (b.type === 'atk_down') atk -= b.value;
  }
  atk = Math.max(0, atk);

  for (const t of targets) {
    const target = state.board[t.row][t.col].character;
    if (target && target.owner !== pid) {
      const blind = isBlindSpot(t, target, attackerPos);
      let dmg = atk + (blind ? 1 : 0);
      if (target.card.keywords.includes('protection') && attacker.card.attackType === 'physical') {
        dmg = Math.max(0, dmg - 1);
      }
      if (target.currentHp <= dmg) return true;
    }
  }
  return false;
}

export function runAiTurn(state: GameState): GameState {
  const pid = state.currentPlayer;
  const mana = () => state.players[pid].mana;
  const enemyId: PlayerId = pid === 0 ? 1 : 0;

  if (state.phase !== 'game_over') {
    state = aiUseItems(state, pid);
  }

  if (state.phase !== 'game_over') {
    const currentHand = state.players[pid].hand;
    const nowSummonable = currentHand.filter((c) => isCharacter(c) && c.manaCost <= mana());
    const validPositions = getValidSummonPositions(state);

    const aceInHand = currentHand.filter(
      (c) => isCharacter(c) && (c as CharacterCard).manaCost >= 4,
    ) as CharacterCard[];
    const bestAceCost = aceInHand.length > 0 ? Math.min(...aceInHand.map(c => c.manaCost)) : 999;
    const canAffordAceNextTurn = mana() + 2 >= bestAceCost;
    const canAffordAceNow = mana() >= bestAceCost;
    const myCells = countControlledCells(state, pid);
    const enemyCells = countControlledCells(state, enemyId);
    const shouldSaveForAce = aceInHand.length > 0 && canAffordAceNextTurn && !canAffordAceNow && myCells >= enemyCells;

    if (canAffordAceNow && validPositions.length > 0) {
      const candidates: SummonCandidate[] = [];
      for (const ace of aceInHand.filter(c => c.manaCost <= mana())) {
        for (const pos of validPositions) {
          const c = scoreSummonCandidate(state, ace, pos, pid);
          if (c) candidates.push(c);
        }
      }
      candidates.sort((a, b) => b.score - a.score);
      if (candidates.length > 0) {
        try { state = executeSummon(state, candidates[0].card.id, candidates[0].pos, candidates[0].dir); } catch {}
      }
    } else if (nowSummonable.length > 0 && validPositions.length > 0 && !shouldSaveForAce) {
      const candidates: SummonCandidate[] = [];
      for (const card of nowSummonable) {
        for (const pos of validPositions) {
          const c = scoreSummonCandidate(state, card as CharacterCard, pos, pid);
          if (c) candidates.push(c);
        }
      }
      candidates.sort((a, b) => b.score - a.score);
      if (candidates.length > 0) {
        try { state = executeSummon(state, candidates[0].card.id, candidates[0].pos, candidates[0].dir); } catch {}
      }
    }
  }

  if (state.phase !== 'game_over') {
    const enemyControl = countControlledCells(state, enemyId);
    const myControl = countControlledCells(state, pid);
    const allowKill = enemyControl >= 4 || state.turnNumber >= 20 || enemyControl > myControl;

    const attackCandidates = getAttackCandidates(state, pid);
    for (const candidate of attackCandidates) {
      if (state.phase === 'game_over') return state;
      const cost = candidate.char.card.activateCost ?? 3;
      if (mana() < cost) continue;

      const isLowCostReact = cost <= 1;
      if (!allowKill && !isLowCostReact && wouldKillAnyTarget(state, candidate.pos, candidate.char, pid)) continue;

      try {
        const targets = getAttackTargets(state, candidate.pos, candidate.char);
        if (targets.length === 0) continue;
        let bestTarget = targets[0];
        let bestHp = Infinity;
        for (const t of targets) {
          const tc = state.board[t.row][t.col].character;
          if (tc && tc.currentHp < bestHp) { bestHp = tc.currentHp; bestTarget = t; }
        }
        state = executeAttack(state, candidate.pos, bestTarget);
      } catch {}
    }
  }

  if (state.phase !== 'game_over') {
    state = endTurn(state);
  }
  return state;
}

function aiUseItems(state: GameState, pid: PlayerId): GameState {
  const player = () => state.players[pid];
  const items = player().hand.filter(c => isItem(c)) as ItemCard[];

  for (const item of items) {
    if (state.phase === 'game_over') break;
    if (player().mana < item.manaCost) continue;

    const targetType = getItemTargetType(item);
    let targetPos: Position | undefined;

    if (targetType === 'ally') {
      targetPos = findBestAllyTarget(state, pid, item);
      if (!targetPos) continue;
    } else if (targetType === 'enemy') {
      targetPos = findBestEnemyTarget(state, pid);
      if (!targetPos) continue;
    }

    try { state = executeItem(state, item.id, targetPos); } catch {}
  }
  return state;
}

function getItemTargetType(item: ItemCard): 'none' | 'ally' | 'enemy' | 'cell' {
  for (const effect of item.effects) {
    if (effect.target === 'target_enemy') return 'enemy';
    if (effect.target === 'target_ally') return 'ally';
    if (effect.target === 'target_cell') return 'cell';
  }
  return 'none';
}

function findBestAllyTarget(state: GameState, pid: PlayerId, item: ItemCard): Position | undefined {
  const allies: { pos: Position; char: BoardCharacter }[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ch = state.board[r][c].character;
      if (ch && ch.owner === pid) allies.push({ pos: { row: r, col: c }, char: ch });
    }
  }
  if (allies.length === 0) return undefined;
  const isHeal = item.effects.some(e => e.effect === 'heal');
  if (isHeal) {
    let best = allies[0];
    for (const a of allies) {
      if ((a.char.card.hp - a.char.currentHp) > (best.char.card.hp - best.char.currentHp)) best = a;
    }
    if (best.char.currentHp >= best.char.card.hp) return undefined;
    return best.pos;
  }
  let best = allies[0];
  for (const a of allies) { if (a.char.card.atk > best.char.card.atk) best = a; }
  return best.pos;
}

function findBestEnemyTarget(state: GameState, pid: PlayerId): Position | undefined {
  const enemies: { pos: Position; char: BoardCharacter }[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ch = state.board[r][c].character;
      if (ch && ch.owner !== pid) enemies.push({ pos: { row: r, col: c }, char: ch });
    }
  }
  if (enemies.length === 0) return undefined;
  let best = enemies[0];
  for (const e of enemies) { if (e.char.currentHp < best.char.currentHp) best = e; }
  return best.pos;
}
