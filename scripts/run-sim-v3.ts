/**
 * 軽量シミュレーション v3
 * 6陣営総当たり（30ペア × 各14試合 = 420試合）
 */
import { simulateGame, type SimulationResult } from '../src/engine/simulation';
import { ALL_CHARACTERS } from '../src/data/cards';

const FACTIONS = ['aggro', 'tank', 'control', 'synergy', 'snipe', 'trick'] as const;
const ITEM_KEYS = ['A', 'B', 'C', 'D'] as const;

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface GameRecord {
  p0Primary: string;
  p1Primary: string;
  result: SimulationResult;
}

const results: GameRecord[] = [];
const factionStats: Record<string, { wins: number; losses: number; draws: number }> = {};
const factionPairStats: Record<string, { p0wins: number; p1wins: number; draws: number; turns: number[] }> = {};

interface CardStat {
  name: string; faction: string; cost: number;
  summoned: number; summonWins: number; summonLosses: number; deaths: number;
  summonTurns: number[];
}
const cardStats: Record<string, CardStat> = {};

for (const f of FACTIONS) {
  factionStats[f] = { wins: 0, losses: 0, draws: 0 };
}

const GAMES_PER_MATCHUP = 40;
let totalGames = 0;
let errors = 0;

console.log(`Running ~${30 * GAMES_PER_MATCHUP} games...`);

for (let i = 0; i < FACTIONS.length; i++) {
  for (let j = i + 1; j < FACTIONS.length; j++) {
    const f0 = FACTIONS[i];
    const f1 = FACTIONS[j];

    for (let g = 0; g < GAMES_PER_MATCHUP; g++) {
      // 先手/後手を交互に
      const swap = g % 2 === 1;
      const primary0 = swap ? f1 : f0;
      const primary1 = swap ? f0 : f1;

      // 第2陣営はランダム
      const sec0 = pickRandom(FACTIONS.filter(f => f !== primary0));
      const sec1 = pickRandom(FACTIONS.filter(f => f !== primary1));
      const iKey0 = pickRandom(ITEM_KEYS);
      const iKey1 = pickRandom(ITEM_KEYS);

      let result: SimulationResult;
      try {
        result = simulateGame(
          [primary0, sec0],
          [primary1, sec1],
          iKey0,
          iKey1,
          40,
        );
      } catch {
        errors++;
        continue;
      }

      totalGames++;
      results.push({ p0Primary: primary0, p1Primary: primary1, result });

      // Faction stats
      if (result.winner === 0) {
        factionStats[primary0].wins++;
        factionStats[primary1].losses++;
      } else if (result.winner === 1) {
        factionStats[primary1].wins++;
        factionStats[primary0].losses++;
      } else {
        factionStats[primary0].draws++;
        factionStats[primary1].draws++;
      }

      // Pair stats
      const pairKey = `${f0} vs ${f1}`;
      if (!factionPairStats[pairKey]) {
        factionPairStats[pairKey] = { p0wins: 0, p1wins: 0, draws: 0, turns: [] };
      }
      const ps = factionPairStats[pairKey];
      // Track by original pair order (f0=先手 in non-swapped games)
      if (result.winner === 0) { swap ? ps.p1wins++ : ps.p0wins++; }
      else if (result.winner === 1) { swap ? ps.p0wins++ : ps.p1wins++; }
      else { ps.draws++; }
      ps.turns.push(result.turns);

      // Card events
      for (const ev of result.cardEvents) {
        if (!cardStats[ev.cardName]) {
          cardStats[ev.cardName] = {
            name: ev.cardName, faction: ev.faction, cost: ev.manaCost,
            summoned: 0, summonWins: 0, summonLosses: 0, deaths: 0,
            summonTurns: [],
          };
        }
        const cs = cardStats[ev.cardName];
        if (ev.event === 'summon') {
          cs.summoned++;
          cs.summonTurns.push(ev.turn);
          if ((ev.owner === 0 && result.winner === 0) || (ev.owner === 1 && result.winner === 1)) {
            cs.summonWins++;
          } else if (result.winner !== null) {
            cs.summonLosses++;
          }
        }
        if (ev.event === 'death') cs.deaths++;
      }
    }
  }
}

console.log(`\nCompleted: ${totalGames} games (errors: ${errors})\n`);

// ========================================
// 1. 全体サマリー
// ========================================
console.log('=== 1. 全体サマリー ===');
const allTurns = results.map(r => r.result.turns);
const avgTurns = (allTurns.reduce((a, b) => a + b, 0) / allTurns.length).toFixed(1);
const timeouts = results.filter(r => r.result.timeout).length;
const p0Wins = results.filter(r => r.result.winner === 0).length;
const p1Wins = results.filter(r => r.result.winner === 1).length;
const drawCount = results.filter(r => r.result.winner === null).length;
console.log(`総試合数: ${totalGames}`);
console.log(`平均ターン数: ${avgTurns}`);
console.log(`先手勝率: ${(p0Wins / totalGames * 100).toFixed(1)}%  後手勝率: ${(p1Wins / totalGames * 100).toFixed(1)}%  引分: ${(drawCount / totalGames * 100).toFixed(1)}%`);
console.log(`タイムアウト: ${timeouts} (${(timeouts / totalGames * 100).toFixed(1)}%)`);

// ========================================
// 2. 陣営別勝率
// ========================================
console.log('\n=== 2. 陣営別勝率 ===');
const factionRanking = FACTIONS.map(f => {
  const s = factionStats[f];
  const total = s.wins + s.losses;
  const rate = total > 0 ? (s.wins / total * 100).toFixed(1) : '0.0';
  return { faction: f, ...s, rate };
}).sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate));

for (const f of factionRanking) {
  console.log(`  ${f.faction.padEnd(10)} ${f.rate}% (${f.wins}W/${f.losses}L/${f.draws}D)`);
}

// ========================================
// 3. 陣営ペア別サマリー
// ========================================
console.log('\n=== 3. 陣営ペア別勝率 ===');
const pairEntries = Object.entries(factionPairStats)
  .map(([key, v]) => {
    const total = v.p0wins + v.p1wins;
    const rate = total > 0 ? (v.p0wins / total * 100).toFixed(1) : '50.0';
    const avgT = v.turns.length > 0 ? (v.turns.reduce((a, b) => a + b, 0) / v.turns.length).toFixed(1) : '0';
    return { key, ...v, total: v.p0wins + v.p1wins + v.draws, rate, avgT };
  })
  .sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate));

for (const p of pairEntries) {
  const [f0, f1] = p.key.split(' vs ');
  console.log(`  ${p.key.padEnd(22)} ${f0}=${p.rate}% (${p.p0wins}/${p.p1wins}/${p.draws}) 平均${p.avgT}T`);
}

// ========================================
// 4. カード使用率・使用時勝率 TOP10/BOTTOM10
// ========================================
console.log('\n=== 4. カード召喚時勝率 TOP10 ===');
const cardRanking = Object.values(cardStats)
  .filter(c => c.summoned >= 3)
  .map(c => {
    const total = c.summonWins + c.summonLosses;
    const winRate = total > 0 ? (c.summonWins / total * 100).toFixed(1) : '50.0';
    const avgTurn = c.summonTurns.length > 0 ? (c.summonTurns.reduce((a, b) => a + b, 0) / c.summonTurns.length).toFixed(1) : '-';
    return { ...c, winRate, avgTurn };
  })
  .sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate));

for (const c of cardRanking.slice(0, 10)) {
  console.log(`  ${c.name.padEnd(18)} ${c.winRate}% (${c.summonWins}W/${c.summonLosses}L) 召喚${c.summoned}回 C${c.cost} [${c.faction}] 平均T${c.avgTurn}`);
}

console.log('\n=== 4b. カード召喚時勝率 BOTTOM10 ===');
for (const c of cardRanking.slice(-10).reverse()) {
  console.log(`  ${c.name.padEnd(18)} ${c.winRate}% (${c.summonWins}W/${c.summonLosses}L) 召喚${c.summoned}回 C${c.cost} [${c.faction}] 平均T${c.avgTurn}`);
}

// ========================================
// 5. エース着地率・着地後勝率
// ========================================
console.log('\n=== 5. エース着地率・着地後勝率 ===');
const aceCards = Object.values(cardStats)
  .filter(c => c.cost >= 5)
  .sort((a, b) => {
    const aRate = (a.summonWins + a.summonLosses) > 0 ? a.summonWins / (a.summonWins + a.summonLosses) : 0;
    const bRate = (b.summonWins + b.summonLosses) > 0 ? b.summonWins / (b.summonWins + b.summonLosses) : 0;
    return bRate - aRate;
  });

for (const ace of aceCards) {
  const total = ace.summonWins + ace.summonLosses;
  const rate = total > 0 ? (ace.summonWins / total * 100).toFixed(1) : '-';
  const avgT = ace.summonTurns.length > 0 ? (ace.summonTurns.reduce((a, b) => a + b, 0) / ace.summonTurns.length).toFixed(1) : '-';
  console.log(`  ${ace.name.padEnd(18)} 着地${ace.summoned}回 着地後勝率${rate}% 平均着地T${avgT} [${ace.faction}]`);
}

// ========================================
// 6. バランス懸念
// ========================================
console.log('\n=== 6. バランス懸念カード ===');
console.log('  ■ 強すぎ候補 (召喚時勝率65%+):');
for (const c of cardRanking.filter(c => parseFloat(c.winRate) >= 65)) {
  console.log(`    ${c.name} ${c.winRate}% C${c.cost} [${c.faction}]`);
}
console.log('  ■ 弱すぎ候補 (召喚時勝率35%-):');
for (const c of cardRanking.filter(c => parseFloat(c.winRate) <= 35)) {
  console.log(`    ${c.name} ${c.winRate}% C${c.cost} [${c.faction}]`);
}

// ========================================
// 7. 深掘り候補ペア
// ========================================
console.log('\n=== 7. 深掘り候補ペア ===');
const sortedByBias = [...pairEntries].sort((a, b) => Math.abs(parseFloat(b.rate) - 50) - Math.abs(parseFloat(a.rate) - 50));
for (const p of sortedByBias.slice(0, 5)) {
  console.log(`  ${p.key} — 勝率偏り${p.rate}% (${p.p0wins}/${p.p1wins}/${p.draws})`);
}

console.log('\n=== DONE ===');
