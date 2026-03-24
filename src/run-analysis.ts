/**
 * 軽量分析シミュレーション（300〜500試合）
 * npx vite-node src/run-analysis.ts
 */
import type { CharacterCard, ItemCard } from './types/card';
import { isCharacter, isItem } from './types/card';
import type { GameState, PlayerId, BoardCharacter } from './types/game';
import { ALL_CHARACTERS, ALL_ITEMS, ITEM_SETS } from './data/cards';
import { createGameState, drawCards, countControlledCells } from './engine/state';
import { startTurn, endTurn } from './engine/actions';
import { runMinimaxTurn } from './engine/minimax-ai';
import type { Card } from './types/card';

// ========================================
// 型定義
// ========================================

interface TurnSnapshot {
  turn: number;
  player: PlayerId;
  cellsStart: [number, number];   // [p0, p1] ターン開始時
  cellsEnd: [number, number];     // [p0, p1] ターン終了時
  summoned: string[];             // 召喚したカード名
  itemsUsed: number;
  handSize: [number, number];     // ターン終了時
  mana: [number, number];         // ターン終了時
}

interface GameAnalysis {
  // 基本
  p0Factions: string;
  p1Factions: string;
  p0ItemSet: string;
  p1ItemSet: string;
  winner: PlayerId | null;
  turns: number;
  timeout: boolean;
  finalCells: [number, number];
  finalMana: [number, number];
  maxMana: [number, number];

  // 召喚/撃破
  summons: [number, number];
  itemsUsed: [number, number];
  kills: [number, number];
  deaths: [number, number];

  // エース
  aceDrawn: [boolean, boolean];
  aceSummoned: [boolean, boolean];
  aceNames: [string[], string[]];
  aceTurns: [number[], number[]];

  // ターン推移
  turnSnapshots: TurnSnapshot[];

  // 状態異常・戦術カウンター
  freezeCount: number;
  sealCount: number;
  brainwashCount: number;
  dirLockCount: number;
  blindAttackCount: number;
  counterAttackCount: number;
  noCounterAttackCount: number;
  coverCount: number;

  // カードイベント
  cardEvents: { name: string; faction: string; cost: number; owner: PlayerId; event: 'summon' | 'death' | 'item'; turn: number }[];
}

// ========================================
// ゲーム実行 + 詳細収集
// ========================================

function buildDeck(facs: [string, string], itemSetKey: string): Card[] {
  const chars1 = ALL_CHARACTERS.filter(c => c.faction === facs[0]);
  const chars2 = ALL_CHARACTERS.filter(c => c.faction === facs[1]);
  const items = ITEM_SETS[itemSetKey as keyof typeof ITEM_SETS];
  const cards: Card[] = [];
  for (const c of chars1) cards.push({ ...c, id: `${c.id}_d0` });
  for (const c of chars2) cards.push({ ...c, id: `${c.id}_d1` });
  for (let i = 0; i < items.length; i++) cards.push({ ...items[i], id: `${items[i].id}_d${i}` });
  return cards;
}

function snapshotBoard(state: GameState): Map<string, { name: string; faction: string; cost: number; owner: PlayerId }> {
  const map = new Map();
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const ch = state.board[r][c].character;
      if (ch) {
        map.set(`${ch.card.id}_${ch.owner}_${r}_${c}`, {
          name: ch.card.name, faction: (ch.card as CharacterCard).faction,
          cost: ch.card.manaCost, owner: ch.owner,
        });
      }
    }
  }
  return map;
}

function parseLogCounters(logs: GameState['log'], startIdx: number, endIdx: number) {
  let freeze = 0, seal = 0, brainwash = 0, dirLock = 0;
  let blind = 0, counter = 0, noCounter = 0, cover = 0;
  for (let i = startIdx; i < endIdx; i++) {
    const msg = logs[i].message;
    if (msg.includes('凍結')) freeze++;
    if (msg.includes('封印')) seal++;
    if (msg.includes('洗脳')) brainwash++;
    if (msg.includes('固定')) dirLock++;
    if (msg.includes('blind spot')) blind++;
    if (msg.includes('counter-attack')) counter++;
    if (msg.includes('カバー')) cover++;
  }
  // noCounter = blind attacks (blind = no counter possible)
  noCounter = blind;
  return { freeze, seal, brainwash, dirLock, blind, counter, noCounter, cover };
}

function runAnalysisGame(
  p0Facs: [string, string], p1Facs: [string, string],
  p0ItemSet: string, p1ItemSet: string,
): GameAnalysis {
  const deck0 = buildDeck(p0Facs, p0ItemSet);
  const deck1 = buildDeck(p1Facs, p1ItemSet);

  let state = createGameState(deck0, deck1);
  const p0 = drawCards(state.players[0], 5);
  const p1 = drawCards(state.players[1], 5);
  state = { ...state, players: [p0, p1] };
  state = startTurn(state);

  // トラッキング
  const maxMana: [number, number] = [state.players[0].mana, state.players[1].mana];
  const summons: [number, number] = [0, 0];
  const itemsUsed: [number, number] = [0, 0];
  const kills: [number, number] = [0, 0];
  const deaths: [number, number] = [0, 0];
  const aceDrawn: [boolean, boolean] = [false, false];
  const aceSummoned: [boolean, boolean] = [false, false];
  const aceNames: [string[], string[]] = [[], []];
  const aceTurns: [number[], number[]] = [[], []];
  const turnSnapshots: TurnSnapshot[] = [];
  const cardEvents: GameAnalysis['cardEvents'] = [];

  // エース判定（5コスト以上）
  const isAce = (card: { manaCost?: number; cost?: number }) => (card.manaCost ?? card.cost ?? 0) >= 5;

  // 初期手札のエースチェック
  for (const pid of [0, 1] as PlayerId[]) {
    if (state.players[pid].hand.some(c => isCharacter(c) && isAce(c))) {
      aceDrawn[pid] = true;
    }
  }

  let totalFreeze = 0, totalSeal = 0, totalBrainwash = 0, totalDirLock = 0;
  let totalBlind = 0, totalCounter = 0, totalNoCounter = 0, totalCover = 0;

  let safety = 0;
  const maxIter = 100;

  while (state.phase !== 'game_over' && safety < maxIter) {
    const pid = state.currentPlayer;
    const turnNum = state.turnNumber;
    const logStart = state.log.length;

    const cellsStart: [number, number] = [countControlledCells(state, 0), countControlledCells(state, 1)];
    const beforeBoard = snapshotBoard(state);
    const beforeHand = [state.players[0].hand.length, state.players[1].hand.length];
    const beforeItems = state.players[pid].hand.filter(c => isItem(c)).length;

    // エース: ドローで手札に入ったか
    for (const p of [0, 1] as PlayerId[]) {
      if (!aceDrawn[p] && state.players[p].hand.some(c => isCharacter(c) && isAce(c))) {
        aceDrawn[p] = true;
      }
    }

    try {
      state = runMinimaxTurn(state, 2);
    } catch {
      try { if (state.phase !== 'game_over') state = endTurn(state); } catch { break; }
    }

    const afterBoard = snapshotBoard(state);
    const logEnd = state.log.length;

    // 召喚検出
    const turnSummoned: string[] = [];
    for (const [key, info] of afterBoard) {
      if (!beforeBoard.has(key)) {
        summons[info.owner]++;
        turnSummoned.push(info.name);
        cardEvents.push({ name: info.name, faction: info.faction, cost: info.cost, owner: info.owner, event: 'summon', turn: turnNum });
        if (isAce(info)) {
          aceSummoned[info.owner] = true;
          aceNames[info.owner].push(info.name);
          aceTurns[info.owner].push(turnNum);
        }
      }
    }
    // 撃破検出
    for (const [key, info] of beforeBoard) {
      if (!afterBoard.has(key)) {
        deaths[info.owner]++;
        kills[info.owner === 0 ? 1 : 0]++;
        cardEvents.push({ name: info.name, faction: info.faction, cost: info.cost, owner: info.owner, event: 'death', turn: turnNum });
      }
    }

    // アイテム使用検出（手札のアイテム数が減った分）
    const afterItems = state.players[pid].hand.filter(c => isItem(c)).length;
    const usedItems = Math.max(0, beforeItems - afterItems);
    itemsUsed[pid] += usedItems;
    if (usedItems > 0) {
      // ログからアイテム名を特定するのは困難なので数だけ
      for (let i = 0; i < usedItems; i++) {
        cardEvents.push({ name: '(item)', faction: '', cost: 0, owner: pid, event: 'item', turn: turnNum });
      }
    }

    // マナ追跡
    for (const p of [0, 1] as PlayerId[]) {
      if (state.players[p].mana > maxMana[p]) maxMana[p] = state.players[p].mana;
    }

    // ログ解析
    const counters = parseLogCounters(state.log, logStart, logEnd);
    totalFreeze += counters.freeze;
    totalSeal += counters.seal;
    totalBrainwash += counters.brainwash;
    totalDirLock += counters.dirLock;
    totalBlind += counters.blind;
    totalCounter += counters.counter;
    totalNoCounter += counters.noCounter;
    totalCover += counters.cover;

    const cellsEnd: [number, number] = [countControlledCells(state, 0), countControlledCells(state, 1)];

    turnSnapshots.push({
      turn: turnNum,
      player: pid,
      cellsStart,
      cellsEnd,
      summoned: turnSummoned,
      itemsUsed: usedItems,
      handSize: [state.players[0].hand.length, state.players[1].hand.length],
      mana: [state.players[0].mana, state.players[1].mana],
    });

    safety++;
  }

  return {
    p0Factions: `${p0Facs[0]}+${p0Facs[1]}`,
    p1Factions: `${p1Facs[0]}+${p1Facs[1]}`,
    p0ItemSet, p1ItemSet,
    winner: state.winner,
    turns: state.turnNumber,
    timeout: safety >= maxIter && state.winner === null,
    finalCells: [countControlledCells(state, 0), countControlledCells(state, 1)],
    finalMana: [state.players[0].mana, state.players[1].mana],
    maxMana,
    summons, itemsUsed, kills, deaths,
    aceDrawn, aceSummoned, aceNames, aceTurns,
    turnSnapshots,
    freezeCount: totalFreeze, sealCount: totalSeal,
    brainwashCount: totalBrainwash, dirLockCount: totalDirLock,
    blindAttackCount: totalBlind, counterAttackCount: totalCounter,
    noCounterAttackCount: totalNoCounter, coverCount: totalCover,
    cardEvents,
  };
}

// ========================================
// サンプリング: 各陣営ペアが均等に出るように
// ========================================

function generateMatchups(targetGames: number): { p0Facs: [string, string]; p1Facs: [string, string]; p0Item: string; p1Item: string }[] {
  const factions = ['aggro', 'tank', 'control', 'synergy', 'snipe', 'trick'];
  const itemKeys = ['A', 'B', 'C', 'D'];

  // 全15ペア
  const pairs: [string, string][] = [];
  for (let i = 0; i < factions.length; i++) {
    for (let j = i + 1; j < factions.length; j++) {
      pairs.push([factions[i], factions[j]]);
    }
  }

  // 15ペア × 15ペア の全対戦からランダムサンプル
  // ただし同一ペア同士の対戦も含む（ミラーマッチ）
  const matchups: { p0Facs: [string, string]; p1Facs: [string, string]; p0Item: string; p1Item: string }[] = [];

  // 各ペアが最低 targetGames / 15 回は出るようにラウンドロビン
  const gamesPerPair = Math.ceil(targetGames / pairs.length);
  for (const pair of pairs) {
    for (let g = 0; g < gamesPerPair; g++) {
      // 対戦相手はランダム
      const opponent = pairs[Math.floor(Math.random() * pairs.length)];
      // 先手後手ランダム
      const swap = Math.random() < 0.5;
      matchups.push({
        p0Facs: swap ? opponent : pair,
        p1Facs: swap ? pair : opponent,
        p0Item: itemKeys[Math.floor(Math.random() * itemKeys.length)],
        p1Item: itemKeys[Math.floor(Math.random() * itemKeys.length)],
      });
    }
  }

  // シャッフル
  for (let i = matchups.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [matchups[i], matchups[j]] = [matchups[j], matchups[i]];
  }

  return matchups.slice(0, targetGames);
}

// ========================================
// レポート出力
// ========================================

const FACTION_NAMES: Record<string, string> = {
  aggro: 'アグロ', tank: 'タンク', control: 'コントロール',
  synergy: 'シナジー', snipe: 'スナイプ', trick: 'トリック',
};
const ITEM_NAMES: Record<string, string> = { A: '万能', B: '攻撃', C: '戦術', D: '持久' };

function factionLabel(facs: string): string {
  const [f1, f2] = facs.split('+');
  return `${FACTION_NAMES[f1]}+${FACTION_NAMES[f2]}`;
}

function printReport(games: GameAnalysis[]) {
  const N = games.length;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  軽量分析レポート（${N}試合）`);
  console.log(`${'═'.repeat(60)}\n`);

  // ========================================
  // 1. 全体サマリー
  // ========================================
  console.log('【1】全体サマリー');
  console.log('─'.repeat(50));

  const p0Wins = games.filter(g => g.winner === 0).length;
  const p1Wins = games.filter(g => g.winner === 1).length;
  const draws = games.filter(g => g.winner === null).length;
  const p0Rate = p0Wins + p1Wins > 0 ? (p0Wins / (p0Wins + p1Wins) * 100).toFixed(1) : '-';
  console.log(`  先手勝率: ${p0Rate}% (${p0Wins}勝) / 後手: ${(100 - parseFloat(p0Rate as string)).toFixed(1)}% (${p1Wins}勝) / 引分: ${draws}`);

  const avgTurns = (games.reduce((s, g) => s + g.turns, 0) / N).toFixed(1);
  const medTurns = games.map(g => g.turns).sort((a, b) => a - b)[Math.floor(N / 2)];
  console.log(`  平均ターン: ${avgTurns} / 中央値: ${medTurns}`);

  const avgSummon = [(games.reduce((s, g) => s + g.summons[0], 0) / N).toFixed(1), (games.reduce((s, g) => s + g.summons[1], 0) / N).toFixed(1)];
  const avgKills = [(games.reduce((s, g) => s + g.kills[0], 0) / N).toFixed(1), (games.reduce((s, g) => s + g.kills[1], 0) / N).toFixed(1)];
  const avgItems = [(games.reduce((s, g) => s + g.itemsUsed[0], 0) / N).toFixed(1), (games.reduce((s, g) => s + g.itemsUsed[1], 0) / N).toFixed(1)];
  const avgMaxMana = [(games.reduce((s, g) => s + g.maxMana[0], 0) / N).toFixed(1), (games.reduce((s, g) => s + g.maxMana[1], 0) / N).toFixed(1)];
  console.log(`  平均召喚数: P0=${avgSummon[0]} / P1=${avgSummon[1]}`);
  console.log(`  平均撃破数: P0=${avgKills[0]} / P1=${avgKills[1]}`);
  console.log(`  平均アイテム使用: P0=${avgItems[0]} / P1=${avgItems[1]}`);
  console.log(`  平均最大マナ: P0=${avgMaxMana[0]} / P1=${avgMaxMana[1]}`);

  // ========================================
  // 2. 陣営ペア別サマリー
  // ========================================
  console.log(`\n【2】陣営ペア別サマリー`);
  console.log('─'.repeat(50));

  // 陣営ペアの出現回数と勝率
  const pairStats: Record<string, { wins: number; losses: number; games: number; kills: number; deaths: number; summons: number; turns: number }> = {};
  for (const g of games) {
    for (const pid of [0, 1] as PlayerId[]) {
      const facs = pid === 0 ? g.p0Factions : g.p1Factions;
      if (!pairStats[facs]) pairStats[facs] = { wins: 0, losses: 0, games: 0, kills: 0, deaths: 0, summons: 0, turns: 0 };
      pairStats[facs].games++;
      pairStats[facs].turns += g.turns;
      pairStats[facs].kills += g.kills[pid];
      pairStats[facs].deaths += g.deaths[pid];
      pairStats[facs].summons += g.summons[pid];
      if (g.winner === pid) pairStats[facs].wins++;
      else if (g.winner !== null) pairStats[facs].losses++;
    }
  }

  const sortedPairs = Object.entries(pairStats)
    .map(([facs, s]) => ({ facs, rate: s.wins + s.losses > 0 ? s.wins / (s.wins + s.losses) * 100 : 0, ...s }))
    .sort((a, b) => b.rate - a.rate);

  console.log(`  ${'陣営ペア'.padEnd(20)} 勝率    試合  勝  敗  召喚  撃破  被撃破  平均T`);
  for (const p of sortedPairs) {
    const avgT = (p.turns / p.games).toFixed(0);
    console.log(`  ${factionLabel(p.facs).padEnd(18)} ${p.rate.toFixed(1).padStart(5)}%  ${p.games.toString().padStart(4)}  ${p.wins.toString().padStart(3)}  ${p.losses.toString().padStart(3)}  ${p.summons.toString().padStart(4)}  ${p.kills.toString().padStart(4)}  ${p.deaths.toString().padStart(4)}    ${avgT}`);
  }

  // ========================================
  // 3. エース着地率 / 着地後勝率
  // ========================================
  console.log(`\n【3】エース着地率 / 着地後勝率`);
  console.log('─'.repeat(50));

  let totalAceDrawn = 0, totalAceSummoned = 0, aceWins = 0, aceGames = 0;
  const aceStats: Record<string, { summoned: number; wins: number; avgTurn: number; totalTurn: number }> = {};

  for (const g of games) {
    for (const pid of [0, 1] as PlayerId[]) {
      if (g.aceDrawn[pid]) totalAceDrawn++;
      if (g.aceSummoned[pid]) {
        totalAceSummoned++;
        aceGames++;
        if (g.winner === pid) aceWins++;
        for (let i = 0; i < g.aceNames[pid].length; i++) {
          const name = g.aceNames[pid][i];
          const turn = g.aceTurns[pid][i];
          if (!aceStats[name]) aceStats[name] = { summoned: 0, wins: 0, avgTurn: 0, totalTurn: 0 };
          aceStats[name].summoned++;
          aceStats[name].totalTurn += turn;
          if (g.winner === pid) aceStats[name].wins++;
        }
      }
    }
  }

  const totalSlots = N * 2;
  console.log(`  エース引いた: ${totalAceDrawn}/${totalSlots} (${(totalAceDrawn / totalSlots * 100).toFixed(1)}%)`);
  console.log(`  エース召喚: ${totalAceSummoned}/${totalSlots} (${(totalAceSummoned / totalSlots * 100).toFixed(1)}%)`);
  console.log(`  エース召喚時の勝率: ${aceGames > 0 ? (aceWins / aceGames * 100).toFixed(1) : '-'}%`);

  console.log(`\n  ${'エース名'.padEnd(14)} 召喚  勝率    平均着地T`);
  const sortedAces = Object.entries(aceStats).sort((a, b) => b[1].summoned - a[1].summoned);
  for (const [name, s] of sortedAces) {
    const wr = s.summoned > 0 ? (s.wins / s.summoned * 100).toFixed(1) : '-';
    const avgT = (s.totalTurn / s.summoned).toFixed(1);
    console.log(`  ${name.padEnd(14)} ${s.summoned.toString().padStart(4)}  ${wr.padStart(5)}%  ${avgT.padStart(6)}`);
  }

  // ========================================
  // 4. カード使用率 / 使用時勝率
  // ========================================
  console.log(`\n【4】カード使用率 / 使用時勝率`);
  console.log('─'.repeat(50));

  const cardUsage: Record<string, { faction: string; cost: number; drawn: number; used: number; usedWins: number; usedGames: number; totalTurn: number }> = {};

  for (const g of games) {
    const usedByOwner: Map<PlayerId, Set<string>> = new Map([[0, new Set()], [1, new Set()]]);
    for (const ev of g.cardEvents) {
      if (ev.event === 'item') continue;
      if (!cardUsage[ev.name]) cardUsage[ev.name] = { faction: ev.faction, cost: ev.cost, drawn: 0, used: 0, usedWins: 0, usedGames: 0, totalTurn: 0 };
      if (ev.event === 'summon') {
        cardUsage[ev.name].used++;
        cardUsage[ev.name].totalTurn += ev.turn;
        usedByOwner.get(ev.owner)!.add(ev.name);
      }
    }
    for (const [owner, cards] of usedByOwner) {
      for (const name of cards) {
        cardUsage[name].usedGames++;
        if (g.winner === owner) cardUsage[name].usedWins++;
      }
    }
  }

  const cardList = Object.entries(cardUsage)
    .filter(([, s]) => s.used >= 3)
    .map(([name, s]) => ({
      name, ...s,
      winRate: s.usedGames > 0 ? s.usedWins / s.usedGames * 100 : 0,
      avgTurn: s.used > 0 ? s.totalTurn / s.used : 0,
    }));

  // 使用時勝率TOP10
  const byWinRate = [...cardList].sort((a, b) => b.winRate - a.winRate);
  console.log(`\n  ◆ 召喚時勝率 TOP10（3回以上召喚）`);
  console.log(`  ${'カード名'.padEnd(14)} [派閥]     C  召喚  勝率    平均T`);
  for (let i = 0; i < Math.min(10, byWinRate.length); i++) {
    const c = byWinRate[i];
    console.log(`  ${c.name.padEnd(14)} [${(FACTION_NAMES[c.faction] || c.faction).padEnd(6)}] ${c.cost}  ${c.used.toString().padStart(4)}  ${c.winRate.toFixed(1).padStart(5)}%  ${c.avgTurn.toFixed(1).padStart(5)}`);
  }

  console.log(`\n  ◆ 召喚時勝率 BOTTOM10（3回以上召喚）`);
  const byWinRateBot = [...cardList].sort((a, b) => a.winRate - b.winRate);
  for (let i = 0; i < Math.min(10, byWinRateBot.length); i++) {
    const c = byWinRateBot[i];
    console.log(`  ${c.name.padEnd(14)} [${(FACTION_NAMES[c.faction] || c.faction).padEnd(6)}] ${c.cost}  ${c.used.toString().padStart(4)}  ${c.winRate.toFixed(1).padStart(5)}%  ${c.avgTurn.toFixed(1).padStart(5)}`);
  }

  // 召喚回数TOP10
  const byUsage = [...cardList].sort((a, b) => b.used - a.used);
  console.log(`\n  ◆ 召喚回数 TOP10`);
  for (let i = 0; i < Math.min(10, byUsage.length); i++) {
    const c = byUsage[i];
    console.log(`  ${c.name.padEnd(14)} [${(FACTION_NAMES[c.faction] || c.faction).padEnd(6)}] C${c.cost}  召喚${c.used.toString().padStart(4)}回  勝率${c.winRate.toFixed(1)}%`);
  }

  // ========================================
  // 5. 状態異常・ブラインド・カバー統計
  // ========================================
  console.log(`\n【5】状態異常・戦術要素の発生統計`);
  console.log('─'.repeat(50));

  const totalFreeze = games.reduce((s, g) => s + g.freezeCount, 0);
  const totalSeal = games.reduce((s, g) => s + g.sealCount, 0);
  const totalBrainwash = games.reduce((s, g) => s + g.brainwashCount, 0);
  const totalDirLock = games.reduce((s, g) => s + g.dirLockCount, 0);
  const totalBlind = games.reduce((s, g) => s + g.blindAttackCount, 0);
  const totalCounter = games.reduce((s, g) => s + g.counterAttackCount, 0);
  const totalNoCounter = games.reduce((s, g) => s + g.noCounterAttackCount, 0);
  const totalCover = games.reduce((s, g) => s + g.coverCount, 0);

  console.log(`  凍結:       ${totalFreeze}回 (${(totalFreeze / N).toFixed(2)}/試合)`);
  console.log(`  封印:       ${totalSeal}回 (${(totalSeal / N).toFixed(2)}/試合)`);
  console.log(`  洗脳:       ${totalBrainwash}回 (${(totalBrainwash / N).toFixed(2)}/試合)`);
  console.log(`  向き固定:   ${totalDirLock}回 (${(totalDirLock / N).toFixed(2)}/試合)`);
  console.log(`  ブラインド: ${totalBlind}回 (${(totalBlind / N).toFixed(2)}/試合)`);
  console.log(`  反撃:       ${totalCounter}回 (${(totalCounter / N).toFixed(2)}/試合)`);
  console.log(`  反撃不可:   ${totalNoCounter}回 (${(totalNoCounter / N).toFixed(2)}/試合)`);
  console.log(`  カバー:     ${totalCover}回 (${(totalCover / N).toFixed(2)}/試合)`);

  // ========================================
  // 6. 強すぎる/弱すぎる陣営ペア候補
  // ========================================
  console.log(`\n【6】バランス懸念: 強すぎ/弱すぎ候補`);
  console.log('─'.repeat(50));

  const strongPairs = sortedPairs.filter(p => p.rate >= 60 && p.games >= 10);
  const weakPairs = sortedPairs.filter(p => p.rate <= 40 && p.games >= 10);

  if (strongPairs.length > 0) {
    console.log('  ■ 強すぎ候補（勝率60%超, 10試合以上）');
    for (const p of strongPairs) {
      const kd = p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : '∞';
      console.log(`    ${factionLabel(p.facs).padEnd(18)} ${p.rate.toFixed(1)}% (${p.games}試合) K/D=${kd}`);
    }
  } else {
    console.log('  ■ 強すぎ候補: なし');
  }

  if (weakPairs.length > 0) {
    console.log('  ■ 弱すぎ候補（勝率40%未満, 10試合以上）');
    for (const p of weakPairs) {
      const kd = p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : '∞';
      console.log(`    ${factionLabel(p.facs).padEnd(18)} ${p.rate.toFixed(1)}% (${p.games}試合) K/D=${kd}`);
    }
  } else {
    console.log('  ■ 弱すぎ候補: なし');
  }

  // ========================================
  // 7. 深掘り候補
  // ========================================
  console.log(`\n【7】次に重ログで深掘りすべきペア候補`);
  console.log('─'.repeat(50));

  const investigate = [
    ...strongPairs.slice(0, 2).map(p => ({ facs: p.facs, reason: `強すぎ (${p.rate.toFixed(1)}%)` })),
    ...weakPairs.slice(-2).map(p => ({ facs: p.facs, reason: `弱すぎ (${p.rate.toFixed(1)}%)` })),
  ];
  // 最も差が大きい対戦を追加
  if (sortedPairs.length >= 2) {
    const top = sortedPairs[0];
    const bot = sortedPairs[sortedPairs.length - 1];
    if (!investigate.some(i => i.facs === top.facs)) {
      investigate.push({ facs: top.facs, reason: `最強ペア (${top.rate.toFixed(1)}%)` });
    }
    if (!investigate.some(i => i.facs === bot.facs)) {
      investigate.push({ facs: bot.facs, reason: `最弱ペア (${bot.rate.toFixed(1)}%)` });
    }
  }

  for (let i = 0; i < Math.min(5, investigate.length); i++) {
    console.log(`  ${i + 1}. ${factionLabel(investigate[i].facs)} — ${investigate[i].reason}`);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  レポート完了');
  console.log(`${'═'.repeat(60)}`);
}

// ========================================
// メイン
// ========================================

const TARGET_GAMES = 390; // 15ペア × 26試合
console.log(`サンプリング中... (${TARGET_GAMES}試合)\n`);

const matchups = generateMatchups(TARGET_GAMES);
const results: GameAnalysis[] = [];
const start = Date.now();

for (let i = 0; i < matchups.length; i++) {
  const m = matchups[i];
  results.push(runAnalysisGame(m.p0Facs, m.p1Facs, m.p0Item, m.p1Item));
  if ((i + 1) % 50 === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    const eta = ((Date.now() - start) / (i + 1) * (matchups.length - i - 1) / 1000).toFixed(0);
    process.stdout.write(`  ${i + 1}/${matchups.length} 完了 (${elapsed}s経過, 残り約${eta}s)\n`);
  }
}

const totalTime = ((Date.now() - start) / 1000).toFixed(1);
console.log(`\n全${results.length}試合完了 (${totalTime}秒)\n`);

printReport(results);
