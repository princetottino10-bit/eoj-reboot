/**
 * AI vs AI シミュレーション
 * ヘッドレスで対戦を実行し、結果を返す
 */
import type { Card, CharacterCard, ItemCard, Direction } from '../types/card';
import { isCharacter, isItem } from '../types/card';
import type { GameState, Position, PlayerId, BoardCharacter } from '../types/game';
import { ALL_CHARACTERS, ALL_ITEMS, ITEM_SETS } from '../data/cards';
import { createGameState, drawCards, checkWinCondition, countControlledCells } from './state';
import { startTurn, executeSummon, executeAttack, executeItem, endTurn, getAttackTargets } from './actions';
import { getAdjacentPositions, calculateHpBonus } from './utils';
import { getValidTargetCells, getAttackTargets as getRangeTargets, isBlindSpot } from './range';
import { runMinimaxTurn } from './minimax-ai';

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
): SummonCandidate {
  const cell = state.board[pos.row][pos.col];
  const dir = chooseBestDirection(state, pos, card, pid);

  let score = 0;

  // ★最重要: 盤面支配数の増加（1マス確定で増える + 5マス勝利に近づくほど高得点）
  const currentControl = countControlledCells(state, pid);
  const controlAfter = currentControl + 1; // この召喚で1マス増える
  score += controlAfter * 10; // 4→5マスなら50点、超重要
  if (controlAfter >= 5) score += 100; // 勝利確定
  if (controlAfter === 4) score += 30; // Check到達

  // 味方の隣に配置（陣形を固める＝Checkを強固に）
  const adj = getAdjacentPositions(pos);
  const adjacentAllies = adj.filter(a => {
    const c = state.board[a.row][a.col].character;
    return c && c.owner === pid;
  }).length;
  score += adjacentAllies * 6;

  // 属性ボーナス（生存力）
  score += calculateHpBonus(card.element, cell.element) * 4;

  // 基礎パワー（HP重視＝場持ち重要）
  score += card.hp / 2 + card.atk / 3;

  // 攻撃パターンが敵をカバーする数（防御目的：相手のCheckを崩す圧力）
  score += countEnemiesInRange(state, pos, card, dir, pid) * 3;

  // 中央ボーナス（支配に有利）
  if (pos.row === 1 && pos.col === 1) score += 5;

  // 相手のCheck脅威への対応：敵が4マス支配なら敵の隣に置く（崩す）
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

/** 攻撃可能なキャラ一覧 */
function getAttackCandidates(state: GameState, pid: PlayerId): { pos: Position; char: BoardCharacter; score: number }[] {
  const candidates: { pos: Position; char: BoardCharacter; score: number }[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cell = state.board[row][col];
      if (
        cell.character &&
        cell.character.owner === pid &&
        !cell.character.hasActedThisTurn
      ) {
        const targets = getAttackTargets(state, { row, col }, cell.character);
        if (targets.length > 0) {
          candidates.push({ pos: { row, col }, char: cell.character, score: cell.character.card.atk });
        }
      }
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

/** 攻撃で敵を倒しそうか判定（簡易予測） */
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

/**
 * 改良AIターン実行（シミュレーション用）
 * 敵CHECK時は攻撃最優先 → 通常は召喚優先 → 攻撃で削り
 */
function runAiTurnSim(state: GameState): GameState {
  const pid = state.currentPlayer;
  const mana = () => state.players[pid].mana;
  const enemyId: PlayerId = pid === 0 ? 1 : 0;

  // --- Phase 0: アイテム使用（召喚前にバフ/デバフ） ---
  if (state.phase !== 'game_over') {
    state = aiUseItemsSim(state, pid);
  }

  // --- Phase 0.5: 敵CHECK(4マス)時は攻撃を最優先 ---
  if (state.phase !== 'game_over') {
    const enemyControl = countControlledCells(state, enemyId);
    if (enemyControl >= 4) {
      const attackCandidates = getAttackCandidates(state, pid);
      for (const candidate of attackCandidates) {
        if (state.phase === 'game_over') break;
        let cost = candidate.char.card.activateCost ?? 3;
        for (const buff of candidate.char.buffs) {
          if (buff.type === 'atk_cost_reduction') cost -= buff.value;
          if (buff.type === 'action_tax') cost += buff.value;
        }
        cost = Math.max(0, cost);
        const adjPosE = getAdjacentPositions(candidate.pos);
        for (const ap of adjPosE) {
          const ac = state.board[ap.row]?.[ap.col];
          if (ac?.character && ac.character.owner !== pid
            && ac.character.card.keywords.includes('pressure')) {
            cost += 1; break;
          }
        }
        if (mana() < cost) continue;
        try {
          state = executeAttack(state, candidate.pos);
        } catch { /* skip */ }
      }
    }
  }

  // --- Phase 1: 召喚（盤面を埋める） ---
  if (state.phase !== 'game_over') {
    const currentHand = state.players[pid].hand;
    const nowSummonable = currentHand
      .filter((c) => isCharacter(c) && c.manaCost <= mana());
    const validPositions = getValidSummonPositions(state);

    // エース温存判定
    const aceInHand = currentHand.filter(
      (c) => isCharacter(c) && (c as CharacterCard).manaCost >= 4,
    ) as CharacterCard[];
    const bestAceCost = aceInHand.length > 0
      ? Math.min(...aceInHand.map(c => c.manaCost))
      : 999;
    const canAffordAceNextTurn = mana() + 2 >= bestAceCost;
    const canAffordAceNow = mana() >= bestAceCost;
    const myCells = countControlledCells(state, pid);
    const enemyCells = countControlledCells(state, enemyId);
    const shouldSaveForAce = aceInHand.length > 0
      && canAffordAceNextTurn
      && !canAffordAceNow
      && myCells >= enemyCells;

    if (canAffordAceNow && validPositions.length > 0) {
      // エースが出せるなら最優先で出す
      const candidates: SummonCandidate[] = [];
      for (const ace of aceInHand.filter(c => c.manaCost <= mana())) {
        for (const pos of validPositions) {
          candidates.push(scoreSummonCandidate(state, ace, pos, pid));
        }
      }
      candidates.sort((a, b) => b.score - a.score);
      if (candidates.length > 0) {
        try {
          state = executeSummon(state, candidates[0].card.id, candidates[0].pos, candidates[0].dir);
        } catch { /* fall through */ }
      }
    } else if (nowSummonable.length > 0 && validPositions.length > 0 && !shouldSaveForAce) {
      const candidates: SummonCandidate[] = [];
      for (const card of nowSummonable) {
        for (const pos of validPositions) {
          candidates.push(scoreSummonCandidate(state, card as CharacterCard, pos, pid));
        }
      }
      candidates.sort((a, b) => b.score - a.score);
      if (candidates.length > 0) {
        try {
          state = executeSummon(state, candidates[0].card.id, candidates[0].pos, candidates[0].dir);
        } catch { /* fall through */ }
      }
    }
  }

  // --- Phase 2: 攻撃（敵Checkを崩す or 削り） ---
  if (state.phase !== 'game_over') {
    const enemyControl = countControlledCells(state, enemyId);
    const myControl = countControlledCells(state, pid);
    // キル許可: 敵がCheck(4マス) or 後半戦 or 敵の方が支配多い
    const allowKill = enemyControl >= 4 || state.turnNumber >= 20 || enemyControl > myControl;

    const attackCandidates = getAttackCandidates(state, pid);
    for (const candidate of attackCandidates) {
      if (state.phase === 'game_over') return state;
      let cost = candidate.char.card.activateCost ?? 3;
      for (const buff of candidate.char.buffs) {
        if (buff.type === 'atk_cost_reduction') cost -= buff.value;
        if (buff.type === 'action_tax') cost += buff.value;
      }
      cost = Math.max(0, cost);
      // pressure: 隣接に敵のpressure持ちがいればコスト+1
      const adjPosS = getAdjacentPositions(candidate.pos);
      for (const ap of adjPosS) {
        const ac = state.board[ap.row]?.[ap.col];
        if (ac?.character && ac.character.owner !== pid
          && ac.character.card.keywords.includes('pressure')) {
          cost += 1; break;
        }
      }
      if (mana() < cost) continue;

      // キル許可でなければ、倒しそうな攻撃はスキップ（低コスト再行動は除く）
      const isLowCostReact = cost <= 1;
      if (!allowKill && !isLowCostReact && wouldKillAnyTarget(state, candidate.pos, candidate.char, pid)) {
        continue;
      }

      try {
        // 常に単体ターゲット: 最低HPの敵を選択
        const targets = getAttackTargets(state, candidate.pos, candidate.char);
        if (targets.length === 0) continue;
        let bestTarget = targets[0];
        let bestHp = Infinity;
        for (const t of targets) {
          const tc = state.board[t.row][t.col].character;
          if (tc && tc.currentHp < bestHp) {
            bestHp = tc.currentHp;
            bestTarget = t;
          }
        }
        state = executeAttack(state, candidate.pos, bestTarget);
      } catch {
        // skip
      }
    }
  }

  if (state.phase !== 'game_over') {
    state = endTurn(state);
  }
  return state;
}

// --- アイテム使用AI ---
function aiUseItemsSim(state: GameState, pid: PlayerId): GameState {
  const player = () => state.players[pid];
  const items = player().hand.filter(c => isItem(c)) as ItemCard[];

  for (const item of items) {
    if (state.phase === 'game_over') break;
    if (player().mana < item.manaCost) continue;

    const targetType = getItemTargetTypeSim(item);
    let targetPos: Position | undefined;

    if (targetType === 'ally') {
      targetPos = findBestAllyTargetSim(state, pid, item);
      if (!targetPos) continue;
    } else if (targetType === 'enemy') {
      targetPos = findBestEnemyTargetSim(state, pid);
      if (!targetPos) continue;
    }

    try {
      state = executeItem(state, item.id, targetPos);
    } catch { /* skip */ }
  }
  return state;
}

function getItemTargetTypeSim(item: ItemCard): 'none' | 'ally' | 'enemy' | 'cell' {
  for (const effect of item.effects) {
    if (effect.target === 'target_enemy') return 'enemy';
    if (effect.target === 'target_ally') return 'ally';
    if (effect.target === 'target_cell') return 'cell';
  }
  return 'none';
}

function findBestAllyTargetSim(state: GameState, pid: PlayerId, item: ItemCard): Position | undefined {
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

function findBestEnemyTargetSim(state: GameState, pid: PlayerId): Position | undefined {
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

/** デッキ構築（2派閥×12 + アイテム6 = 30枚） */
function buildDualFactionDeck(
  faction1Chars: CharacterCard[],
  faction2Chars: CharacterCard[],
  items: ItemCard[],
): Card[] {
  // 各派閥12枚ずつ（重複IDを振る）
  const chars: Card[] = [];
  for (const c of faction1Chars) {
    chars.push({ ...c, id: `${c.id}_d0` });
  }
  for (const c of faction2Chars) {
    chars.push({ ...c, id: `${c.id}_d1` });
  }
  // アイテム6枚
  const itemCards: Card[] = items.map((item, i) => ({ ...item, id: `${item.id}_d${i}` }));
  return [...chars, ...itemCards];
}

export interface CardStats {
  cardId: string;       // 元のカードID（_d0/_d1サフィックス除去）
  cardName: string;
  faction: string;
  manaCost: number;
  summons: number;      // 召喚回数
  kills: number;        // 撃破数
  deaths: number;       // 被撃破数
  survivedTurns: number; // 生存ターン数合計
  inWinningDeck: number; // 勝利デッキに含まれた回数
  inLosingDeck: number;  // 敗北デッキに含まれた回数
  summonWins: number;    // 召喚された試合で勝った回数
  summonLosses: number;  // 召喚された試合で負けた回数
}

export interface SimulationResult {
  winner: PlayerId | null;
  turns: number;
  p0Faction: string;
  p1Faction: string;
  p0ItemSet?: string;
  p1ItemSet?: string;
  p0CellsControlled: number;
  p1CellsControlled: number;
  p0VP: number;
  p1VP: number;
  winnerReason: 'vp' | 'territory' | 'timeout' | null;
  winType: 'vp' | 'territory' | 'timeout' | 'draw';
  timeout: boolean;
  /** 中盤(ターン4時点)でリードしていたプレイヤー */
  midLeader: PlayerId | null;
  /** 中盤リーダーと勝者が異なる場合 true（逆転） */
  comeback: boolean;
  /** カード別統計（このゲーム内） */
  cardEvents: { cardId: string; cardName: string; faction: string; manaCost: number; owner: PlayerId; event: 'summon' | 'kill' | 'death'; turn: number }[];
}

/**
 * 1ゲーム分のシミュレーションを実行（2派閥+アイテムセット）
 */
export function simulateGame(
  p0Factions: [string, string],
  p1Factions: [string, string],
  p0ItemSetKey?: string,
  p1ItemSetKey?: string,
  maxTurns: number = 50,
  characterPool?: CharacterCard[],
): SimulationResult {
  const chars = characterPool || ALL_CHARACTERS;
  const p0Chars1 = chars.filter((c) => c.faction === p0Factions[0]);
  const p0Chars2 = chars.filter((c) => c.faction === p0Factions[1]);
  const p1Chars1 = chars.filter((c) => c.faction === p1Factions[0]);
  const p1Chars2 = chars.filter((c) => c.faction === p1Factions[1]);

  const p0Items = p0ItemSetKey ? ITEM_SETS[p0ItemSetKey as keyof typeof ITEM_SETS] : ALL_ITEMS.slice(0, 6);
  const p1Items = p1ItemSetKey ? ITEM_SETS[p1ItemSetKey as keyof typeof ITEM_SETS] : ALL_ITEMS.slice(0, 6);

  const deck1 = buildDualFactionDeck(p0Chars1, p0Chars2, p0Items);
  const deck2 = buildDualFactionDeck(p1Chars1, p1Chars2, p1Items);

  let state = createGameState(deck1, deck2);

  // 初期ドロー
  const p0 = drawCards(state.players[0], 5);
  const p1 = drawCards(state.players[1], 5);
  state = { ...state, players: [p0, p1] };

  // P0最初のターン開始
  state = startTurn(state);

  // カードイベント追跡
  type CardEvent = { cardId: string; cardName: string; faction: string; manaCost: number; owner: PlayerId; event: 'summon' | 'kill' | 'death'; turn: number };
  const cardEvents: CardEvent[] = [];
  let processedCombatEvents = 0;

  // ボードスナップショット: カードIDのSet（盤面にいるキャラを追跡）
  function snapshotBoard(s: GameState): Map<string, { name: string; faction: string; cost: number; owner: PlayerId; pos: { row: number; col: number } }> {
    const map = new Map<string, { name: string; faction: string; cost: number; owner: PlayerId; pos: { row: number; col: number } }>();
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const ch = s.board[r][c].character;
        if (ch) {
          const baseId = ch.card.id.replace(/_d\d+$/, '');
          map.set(`${baseId}_${ch.owner}_${r}_${c}`, {
            name: ch.card.name, faction: (ch.card as CharacterCard).faction,
            cost: ch.card.manaCost, owner: ch.owner, pos: { row: r, col: c },
          });
        }
      }
    }
    return map;
  }

  // ゲームループ
  let safetyCounter = 0;
  const maxIterations = maxTurns * 2;
  let midLeader: PlayerId | null = null;

  while (state.phase !== 'game_over' && safetyCounter < maxIterations) {
    // 中盤(ターン4)のリード記録
    if (state.turnNumber === 4 && midLeader === null) {
      const p0Cells = countControlledCells(state, 0);
      const p1Cells = countControlledCells(state, 1);
      if (p0Cells > p1Cells) midLeader = 0;
      else if (p1Cells > p0Cells) midLeader = 1;
    }

    const beforeBoard = snapshotBoard(state);
    const turnNum = state.turnNumber;

    try {
      state = runMinimaxTurn(state, 2);
    } catch {
      try {
        if (state.phase !== 'game_over') {
          state = endTurn(state);
        }
      } catch {
        break;
      }
    }

    // ボード差分からイベント検出
    const afterBoard = snapshotBoard(state);

    // 新しく現れたキャラ = 召喚
    for (const [key, info] of afterBoard) {
      if (!beforeBoard.has(key)) {
        cardEvents.push({ cardId: info.name, cardName: info.name, faction: info.faction, manaCost: info.cost, owner: info.owner, event: 'summon', turn: turnNum });
      }
    }
    // 消えたキャラ = 撃破された
    for (const [key, info] of beforeBoard) {
      if (!afterBoard.has(key)) {
        cardEvents.push({ cardId: info.name, cardName: info.name, faction: info.faction, manaCost: info.cost, owner: info.owner, event: 'death', turn: turnNum });
      }
    }
    for (const ev of state.combatEvents.slice(processedCombatEvents)) {
      cardEvents.push({
        cardId: ev.attacker.cardId,
        cardName: ev.attacker.cardName,
        faction: ev.attacker.faction,
        manaCost: ev.attacker.manaCost,
        owner: ev.attacker.owner,
        event: 'kill',
        turn: ev.turn,
      });
    }
    processedCombatEvents = state.combatEvents.length;

    safetyCounter++;
  }

  const winner = state.winner;
  const comeback = midLeader !== null && winner !== null && midLeader !== winner;

  return {
    winner,
    turns: state.turnNumber,
    p0Faction: `${p0Factions[0]}+${p0Factions[1]}`,
    p1Faction: `${p1Factions[0]}+${p1Factions[1]}`,
    p0ItemSet: p0ItemSetKey,
    p1ItemSet: p1ItemSetKey,
    p0CellsControlled: countControlledCells(state, 0),
    p1CellsControlled: countControlledCells(state, 1),
    p0VP: state.players[0].vp,
    p1VP: state.players[1].vp,
    winnerReason: state.winnerReason,
    winType: winner === null ? 'draw' : (state.winnerReason ?? 'timeout'),
    timeout: safetyCounter >= maxIterations && state.winner === null,
    midLeader,
    comeback,
    cardEvents,
  };
}

export type DeckConfig = { factions: [string, string]; itemSet: string };

export interface FullSimResult {
  results: SimulationResult[];
  deckWinRates: Record<string, { wins: number; losses: number; draws: number; rate: number }>;
  factionWinRates: Record<string, { wins: number; losses: number; draws: number; rate: number }>;
  itemSetWinRates: Record<string, { wins: number; losses: number; draws: number; rate: number }>;
  cardStats: Record<string, CardStats>;
}

/**
 * ランダム抽出シミュレーション（高速版）
 * 60デッキからランダムにマッチアップを選び、先後入替で2試合ずつ実施
 */
export function runSampledSimulation(totalGames: number = 200, characterPool?: CharacterCard[]): FullSimResult {
  const factions = ['aggro', 'tank', 'control', 'synergy', 'snipe', 'trick'];
  const itemSetKeys = ['A', 'B', 'C', 'D'];

  const decks: DeckConfig[] = [];
  for (let i = 0; i < factions.length; i++) {
    for (let j = i + 1; j < factions.length; j++) {
      for (const itemKey of itemSetKeys) {
        decks.push({ factions: [factions[i], factions[j]], itemSet: itemKey });
      }
    }
  }

  const results: SimulationResult[] = [];
  const deckStats: Record<string, { wins: number; losses: number; draws: number }> = {};
  const factionStats: Record<string, { wins: number; losses: number; draws: number }> = {};
  const itemStats: Record<string, { wins: number; losses: number; draws: number }> = {};

  for (const d of decks) {
    deckStats[`${d.factions[0]}+${d.factions[1]}_${d.itemSet}`] = { wins: 0, losses: 0, draws: 0 };
  }
  for (const f of factions) factionStats[f] = { wins: 0, losses: 0, draws: 0 };
  for (const k of itemSetKeys) itemStats[k] = { wins: 0, losses: 0, draws: 0 };

  // ランダム抽出（2試合ずつ先後入替）
  const pairsNeeded = Math.ceil(totalGames / 2);
  for (let p = 0; p < pairsNeeded; p++) {
    let i = Math.floor(Math.random() * decks.length);
    let j = Math.floor(Math.random() * (decks.length - 1));
    if (j >= i) j++;

    for (let g = 0; g < 2; g++) {
      if (results.length >= totalGames) break;
      const swap = g % 2 === 1;
      const p0 = swap ? decks[j] : decks[i];
      const p1 = swap ? decks[i] : decks[j];
      const kP0 = `${p0.factions[0]}+${p0.factions[1]}_${p0.itemSet}`;
      const kP1 = `${p1.factions[0]}+${p1.factions[1]}_${p1.itemSet}`;

      const result = simulateGame(p0.factions, p1.factions, p0.itemSet, p1.itemSet, 50, characterPool);
      results.push(result);

      if (result.winner === 0) {
        deckStats[kP0].wins++; deckStats[kP1].losses++;
        factionStats[p0.factions[0]].wins++; factionStats[p0.factions[1]].wins++;
        factionStats[p1.factions[0]].losses++; factionStats[p1.factions[1]].losses++;
        itemStats[p0.itemSet].wins++; itemStats[p1.itemSet].losses++;
      } else if (result.winner === 1) {
        deckStats[kP1].wins++; deckStats[kP0].losses++;
        factionStats[p1.factions[0]].wins++; factionStats[p1.factions[1]].wins++;
        factionStats[p0.factions[0]].losses++; factionStats[p0.factions[1]].losses++;
        itemStats[p1.itemSet].wins++; itemStats[p0.itemSet].losses++;
      } else {
        deckStats[kP0].draws++; deckStats[kP1].draws++;
        factionStats[p0.factions[0]].draws++; factionStats[p0.factions[1]].draws++;
        factionStats[p1.factions[0]].draws++; factionStats[p1.factions[1]].draws++;
        itemStats[p0.itemSet].draws++; itemStats[p1.itemSet].draws++;
      }
    }
  }

  // カード統計集計（runFullSimulationと同じロジック）
  const cardStats: Record<string, CardStats> = {};
  const ensureCard = (name: string, faction: string, cost: number) => {
    if (!cardStats[name]) {
      cardStats[name] = { cardId: name, cardName: name, faction, manaCost: cost, summons: 0, kills: 0, deaths: 0, survivedTurns: 0, inWinningDeck: 0, inLosingDeck: 0, summonWins: 0, summonLosses: 0 };
    }
  };

  const charPool = characterPool || ALL_CHARACTERS;
  for (const r of results) {
    const p0Facs = r.p0Faction.split('+');
    const p1Facs = r.p1Faction.split('+');
    const p0Cards = charPool.filter(c => p0Facs.includes(c.faction));
    const p1Cards = charPool.filter(c => p1Facs.includes(c.faction));
    for (const c of p0Cards) {
      ensureCard(c.name, c.faction, c.manaCost);
      if (r.winner === 0) cardStats[c.name].inWinningDeck++;
      else if (r.winner === 1) cardStats[c.name].inLosingDeck++;
    }
    for (const c of p1Cards) {
      ensureCard(c.name, c.faction, c.manaCost);
      if (r.winner === 1) cardStats[c.name].inWinningDeck++;
      else if (r.winner === 0) cardStats[c.name].inLosingDeck++;
    }
    const summonedByOwner = new Map<PlayerId, Set<string>>();
    summonedByOwner.set(0, new Set());
    summonedByOwner.set(1, new Set());
    for (const ev of r.cardEvents) {
      ensureCard(ev.cardName, ev.faction, ev.manaCost);
      if (ev.event === 'summon') {
        cardStats[ev.cardName].summons++;
        summonedByOwner.get(ev.owner)!.add(ev.cardName);
      }
      else if (ev.event === 'kill') cardStats[ev.cardName].kills++;
      else if (ev.event === 'death') cardStats[ev.cardName].deaths++;
    }
    for (const [owner, cards] of summonedByOwner) {
      for (const cardName of cards) {
        if (r.winner === owner) cardStats[cardName].summonWins++;
        else if (r.winner !== null) cardStats[cardName].summonLosses++;
      }
    }
  }

  const calcRate = (s: { wins: number; losses: number; draws: number }) => ({
    ...s,
    rate: s.wins + s.losses > 0 ? Math.round((s.wins / (s.wins + s.losses)) * 1000) / 10 : 0,
  });

  return {
    results,
    deckWinRates: Object.fromEntries(Object.entries(deckStats).map(([k, v]) => [k, calcRate(v)])),
    factionWinRates: Object.fromEntries(Object.entries(factionStats).map(([k, v]) => [k, calcRate(v)])),
    itemSetWinRates: Object.fromEntries(Object.entries(itemStats).map(([k, v]) => [k, calcRate(v)])),
    cardStats,
  };
}

/**
 * 全60デッキの総当たりシミュレーション
 */
export function runFullSimulation(gamesPerMatchup: number = 2): FullSimResult {
  const factions = ['aggro', 'tank', 'control', 'synergy', 'snipe', 'trick'];
  const itemSetKeys = ['A', 'B', 'C', 'D'];

  // 全60デッキ構成
  const decks: DeckConfig[] = [];
  for (let i = 0; i < factions.length; i++) {
    for (let j = i + 1; j < factions.length; j++) {
      for (const itemKey of itemSetKeys) {
        decks.push({ factions: [factions[i], factions[j]], itemSet: itemKey });
      }
    }
  }

  const results: SimulationResult[] = [];
  const deckStats: Record<string, { wins: number; losses: number; draws: number }> = {};
  const factionStats: Record<string, { wins: number; losses: number; draws: number }> = {};
  const itemStats: Record<string, { wins: number; losses: number; draws: number }> = {};

  // 初期化
  for (const d of decks) {
    const key = `${d.factions[0]}+${d.factions[1]}_${d.itemSet}`;
    deckStats[key] = { wins: 0, losses: 0, draws: 0 };
  }
  for (const f of factions) {
    factionStats[f] = { wins: 0, losses: 0, draws: 0 };
  }
  for (const k of itemSetKeys) {
    itemStats[k] = { wins: 0, losses: 0, draws: 0 };
  }

  // 総当たり（先後入替: 奇数戦目はi先手、偶数戦目はj先手）
  for (let i = 0; i < decks.length; i++) {
    for (let j = i + 1; j < decks.length; j++) {
      for (let g = 0; g < gamesPerMatchup; g++) {
        // 偶数g: decks[i]が先手、奇数g: decks[j]が先手
        const swap = g % 2 === 1;
        const p0 = swap ? decks[j] : decks[i];
        const p1 = swap ? decks[i] : decks[j];
        const kP0 = `${p0.factions[0]}+${p0.factions[1]}_${p0.itemSet}`;
        const kP1 = `${p1.factions[0]}+${p1.factions[1]}_${p1.itemSet}`;

        const result = simulateGame(p0.factions, p1.factions, p0.itemSet, p1.itemSet);
        results.push(result);

        if (result.winner === 0) {
          deckStats[kP0].wins++;
          deckStats[kP1].losses++;
          factionStats[p0.factions[0]].wins++;
          factionStats[p0.factions[1]].wins++;
          factionStats[p1.factions[0]].losses++;
          factionStats[p1.factions[1]].losses++;
          itemStats[p0.itemSet].wins++;
          itemStats[p1.itemSet].losses++;
        } else if (result.winner === 1) {
          deckStats[kP1].wins++;
          deckStats[kP0].losses++;
          factionStats[p1.factions[0]].wins++;
          factionStats[p1.factions[1]].wins++;
          factionStats[p0.factions[0]].losses++;
          factionStats[p0.factions[1]].losses++;
          itemStats[p1.itemSet].wins++;
          itemStats[p0.itemSet].losses++;
        } else {
          deckStats[kP0].draws++;
          deckStats[kP1].draws++;
          factionStats[p0.factions[0]].draws++;
          factionStats[p0.factions[1]].draws++;
          factionStats[p1.factions[0]].draws++;
          factionStats[p1.factions[1]].draws++;
          itemStats[p0.itemSet].draws++;
          itemStats[p1.itemSet].draws++;
        }
      }
    }
  }

  // カード統計集計
  const cardStats: Record<string, CardStats> = {};
  const ensureCard = (name: string, faction: string, cost: number) => {
    if (!cardStats[name]) {
      cardStats[name] = { cardId: name, cardName: name, faction, manaCost: cost, summons: 0, kills: 0, deaths: 0, survivedTurns: 0, inWinningDeck: 0, inLosingDeck: 0, summonWins: 0, summonLosses: 0 };
    }
  };

  // デッキに含まれるカードの勝敗カウント
  for (const r of results) {
    const p0Facs = r.p0Faction.split('+');
    const p1Facs = r.p1Faction.split('+');
    const p0Cards = (ALL_CHARACTERS as CharacterCard[]).filter(c => p0Facs.includes(c.faction));
    const p1Cards = (ALL_CHARACTERS as CharacterCard[]).filter(c => p1Facs.includes(c.faction));
    for (const c of p0Cards) {
      ensureCard(c.name, c.faction, c.manaCost);
      if (r.winner === 0) cardStats[c.name].inWinningDeck++;
      else if (r.winner === 1) cardStats[c.name].inLosingDeck++;
    }
    for (const c of p1Cards) {
      ensureCard(c.name, c.faction, c.manaCost);
      if (r.winner === 1) cardStats[c.name].inWinningDeck++;
      else if (r.winner === 0) cardStats[c.name].inLosingDeck++;
    }

    // イベント集計
    const summonedByOwner = new Map<PlayerId, Set<string>>();
    summonedByOwner.set(0, new Set());
    summonedByOwner.set(1, new Set());
    for (const ev of r.cardEvents) {
      ensureCard(ev.cardName, ev.faction, ev.manaCost);
      if (ev.event === 'summon') {
        cardStats[ev.cardName].summons++;
        summonedByOwner.get(ev.owner)!.add(ev.cardName);
      }
      else if (ev.event === 'kill') cardStats[ev.cardName].kills++;
      else if (ev.event === 'death') cardStats[ev.cardName].deaths++;
    }
    // 召喚されたカードの勝敗追跡
    for (const [owner, cards] of summonedByOwner) {
      for (const cardName of cards) {
        if (r.winner === owner) cardStats[cardName].summonWins++;
        else if (r.winner !== null) cardStats[cardName].summonLosses++;
      }
    }
  }

  const calcRate = (s: { wins: number; losses: number; draws: number }) => ({
    ...s,
    rate: s.wins + s.losses > 0 ? Math.round((s.wins / (s.wins + s.losses)) * 1000) / 10 : 0,
  });

  return {
    results,
    deckWinRates: Object.fromEntries(Object.entries(deckStats).map(([k, v]) => [k, calcRate(v)])),
    factionWinRates: Object.fromEntries(Object.entries(factionStats).map(([k, v]) => [k, calcRate(v)])),
    itemSetWinRates: Object.fromEntries(Object.entries(itemStats).map(([k, v]) => [k, calcRate(v)])),
    cardStats,
  };
}
