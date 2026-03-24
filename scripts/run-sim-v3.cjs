/**
 * 軽量シミュレーション v3
 * 6陣営の総当たり（mirror含む）× 各12試合 = 432試合
 * 各陣営はミラーマッチで2陣営分のデッキを組む（同陣営×2は不可なので、ランダムに第2陣営を追加）
 */

// TypeScript→JS compilation
const { execSync } = require('child_process');
const path = require('path');

// Build first
console.log('Building...');
try {
  execSync('npx tsc --outDir dist --skipLibCheck', { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
} catch (e) {
  // Try with looser settings
  execSync('npx tsc --outDir dist --skipLibCheck --noEmit false --declaration false', { cwd: path.join(__dirname, '..'), stdio: 'pipe' });
}
console.log('Build done.');

const { simulateGame } = require('../dist/engine/simulation');
const { ALL_CHARACTERS } = require('../dist/data/cards');

const FACTIONS = ['aggro', 'tank', 'control', 'synergy', 'snipe', 'trick'];
const ITEM_KEYS = ['A', 'B', 'C', 'D'];

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ========================================
// Data collection
// ========================================
const results = [];
const factionPairStats = {}; // "aggro vs tank" → {p0wins, p1wins, draws, turns[], ...}
const cardStats = {};        // cardName → {drawn, summoned, summonWins, summonLosses, avgSummonTurn, ...}
const statusCounts = { freeze: 0, seal: 0, brainwash: 0, direction_lock: 0, blind_attack: 0, counter: 0, no_counter: 0, cover: 0 };

// Per-faction stats
const factionStats = {};
for (const f of FACTIONS) {
  factionStats[f] = { wins: 0, losses: 0, draws: 0 };
}

// Run simulation
const GAMES_PER_MATCHUP = 12;
let totalGames = 0;

console.log(`Running ${FACTIONS.length * FACTIONS.length * GAMES_PER_MATCHUP} games...`);

for (const f0 of FACTIONS) {
  for (const f1 of FACTIONS) {
    if (f0 === f1) continue; // Skip mirror matches (can't use same faction twice)

    for (let g = 0; g < GAMES_PER_MATCHUP; g++) {
      // Each player uses the faction as primary + a random secondary
      const p0Secondary = pickRandom(FACTIONS.filter(f => f !== f0));
      const p1Secondary = pickRandom(FACTIONS.filter(f => f !== f1));
      const p0ItemSet = pickRandom(ITEM_KEYS);
      const p1ItemSet = pickRandom(ITEM_KEYS);

      let result;
      try {
        result = simulateGame(
          [f0, p0Secondary],
          [f1, p1Secondary],
          p0ItemSet,
          p1ItemSet,
          40
        );
      } catch (e) {
        continue; // Skip errored games
      }

      totalGames++;
      results.push({
        p0Primary: f0,
        p1Primary: f1,
        result,
      });

      // Faction stats (primary faction only)
      if (result.winner === 0) {
        factionStats[f0].wins++;
        factionStats[f1].losses++;
      } else if (result.winner === 1) {
        factionStats[f1].wins++;
        factionStats[f0].losses++;
      } else {
        factionStats[f0].draws++;
        factionStats[f1].draws++;
      }

      // Faction pair stats
      const pairKey = `${f0} vs ${f1}`;
      if (!factionPairStats[pairKey]) {
        factionPairStats[pairKey] = { p0wins: 0, p1wins: 0, draws: 0, turns: [], p0Cells: [], p1Cells: [] };
      }
      const ps = factionPairStats[pairKey];
      if (result.winner === 0) ps.p0wins++;
      else if (result.winner === 1) ps.p1wins++;
      else ps.draws++;
      ps.turns.push(result.turns);
      ps.p0Cells.push(result.p0CellsControlled);
      ps.p1Cells.push(result.p1CellsControlled);

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
          // Track win for summoned cards
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

console.log(`\nCompleted: ${totalGames} games\n`);

// ========================================
// 1. 全体サマリー
// ========================================
console.log('=== 1. 全体サマリー ===');
const allTurns = results.map(r => r.result.turns);
const avgTurns = (allTurns.reduce((a, b) => a + b, 0) / allTurns.length).toFixed(1);
const timeouts = results.filter(r => r.result.timeout).length;
const p0WinRate = results.filter(r => r.result.winner === 0).length;
const p1WinRate = results.filter(r => r.result.winner === 1).length;
const draws = results.filter(r => r.result.winner === null).length;
console.log(`総試合数: ${totalGames}`);
console.log(`平均ターン数: ${avgTurns}`);
console.log(`先手勝率: ${(p0WinRate / totalGames * 100).toFixed(1)}%  後手勝率: ${(p1WinRate / totalGames * 100).toFixed(1)}%  引分: ${(draws / totalGames * 100).toFixed(1)}%`);
console.log(`タイムアウト: ${timeouts} (${(timeouts / totalGames * 100).toFixed(1)}%)`);

// ========================================
// 2. 陣営別勝率
// ========================================
console.log('\n=== 2. 陣営別勝率 ===');
const factionRanking = FACTIONS.map(f => {
  const s = factionStats[f];
  const total = s.wins + s.losses;
  return { faction: f, ...s, rate: total > 0 ? (s.wins / total * 100).toFixed(1) : '0.0' };
}).sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate));

for (const f of factionRanking) {
  console.log(`  ${f.faction.padEnd(10)} ${f.rate}% (${f.wins}W/${f.losses}L/${f.draws}D)`);
}

// ========================================
// 3. 陣営ペア別サマリー (主要ペア)
// ========================================
console.log('\n=== 3. 陣営ペア別サマリー ===');
const pairEntries = Object.entries(factionPairStats)
  .map(([key, v]) => {
    const total = v.p0wins + v.p1wins + v.draws;
    const rate = total > 0 ? (v.p0wins / (v.p0wins + v.p1wins) * 100).toFixed(1) : '50.0';
    const avgT = v.turns.length > 0 ? (v.turns.reduce((a, b) => a + b, 0) / v.turns.length).toFixed(1) : '0';
    return { key, ...v, total, rate, avgT };
  })
  .sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate));

console.log('  先手勝率が高い順:');
for (const p of pairEntries.slice(0, 10)) {
  console.log(`    ${p.key.padEnd(25)} 先手${p.rate}% (${p.p0wins}/${p.p1wins}/${p.draws}) 平均${p.avgT}T`);
}
console.log('  先手勝率が低い順:');
for (const p of pairEntries.slice(-10).reverse()) {
  console.log(`    ${p.key.padEnd(25)} 先手${p.rate}% (${p.p0wins}/${p.p1wins}/${p.draws}) 平均${p.avgT}T`);
}

// ========================================
// 4. カード使用率・使用時勝率 TOP10/BOTTOM10
// ========================================
console.log('\n=== 4. カード使用率・使用時勝率 ===');
const cardRanking = Object.values(cardStats)
  .filter(c => c.summoned >= 3) // 3回以上召喚
  .map(c => {
    const total = c.summonWins + c.summonLosses;
    const winRate = total > 0 ? (c.summonWins / total * 100).toFixed(1) : '50.0';
    const avgTurn = c.summonTurns.length > 0 ? (c.summonTurns.reduce((a, b) => a + b, 0) / c.summonTurns.length).toFixed(1) : '-';
    return { ...c, winRate, avgTurn };
  })
  .sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate));

console.log('  TOP10 (召喚時勝率):');
for (const c of cardRanking.slice(0, 10)) {
  console.log(`    ${c.name.padEnd(20)} ${c.winRate}% (${c.summonWins}W/${c.summonLosses}L) 召喚${c.summoned}回 C${c.cost} [${c.faction}] 平均T${c.avgTurn}`);
}
console.log('  BOTTOM10 (召喚時勝率):');
for (const c of cardRanking.slice(-10).reverse()) {
  console.log(`    ${c.name.padEnd(20)} ${c.winRate}% (${c.summonWins}W/${c.summonLosses}L) 召喚${c.summoned}回 C${c.cost} [${c.faction}] 平均T${c.avgTurn}`);
}

// ========================================
// 5. エース着地率・着地後勝率
// ========================================
console.log('\n=== 5. エース着地率・着地後勝率 ===');
const aceCards = Object.values(cardStats).filter(c => c.cost >= 5);
for (const ace of aceCards.sort((a, b) => parseFloat(b.winRate || '0') - parseFloat(a.winRate || '0'))) {
  const total = ace.summonWins + ace.summonLosses;
  const rate = total > 0 ? (ace.summonWins / total * 100).toFixed(1) : '-';
  const avgT = ace.summonTurns.length > 0 ? (ace.summonTurns.reduce((a, b) => a + b, 0) / ace.summonTurns.length).toFixed(1) : '-';
  console.log(`  ${ace.name.padEnd(20)} 着地${ace.summoned}回 着地後勝率${rate}% 平均着地T${avgT} [${ace.faction}]`);
}

// ========================================
// 6. 強すぎ/弱すぎ候補
// ========================================
console.log('\n=== 6. バランス懸念カード ===');
console.log('  ■ 強すぎ候補 (勝率65%+):');
for (const c of cardRanking.filter(c => parseFloat(c.winRate) >= 65)) {
  console.log(`    ${c.name} ${c.winRate}% C${c.cost} [${c.faction}]`);
}
console.log('  ■ 弱すぎ候補 (勝率35%-):');
for (const c of cardRanking.filter(c => parseFloat(c.winRate) <= 35)) {
  console.log(`    ${c.name} ${c.winRate}% C${c.cost} [${c.faction}]`);
}

// ========================================
// 7. 次に深掘りすべきペア
// ========================================
console.log('\n=== 7. 深掘り候補ペア ===');
const extremePairs = pairEntries.filter(p => {
  const rate = parseFloat(p.rate);
  return rate >= 70 || rate <= 30;
});
if (extremePairs.length > 0) {
  for (const p of extremePairs.slice(0, 5)) {
    console.log(`  ${p.key} — 先手${p.rate}% (偏りが大きい)`);
  }
} else {
  // Most extreme pairs
  const top3 = pairEntries.slice(0, 3);
  const bot3 = pairEntries.slice(-3);
  console.log('  先手有利:');
  for (const p of top3) console.log(`    ${p.key} — 先手${p.rate}%`);
  console.log('  後手有利:');
  for (const p of bot3) console.log(`    ${p.key} — 先手${p.rate}%`);
}

console.log('\n=== Done ===');
