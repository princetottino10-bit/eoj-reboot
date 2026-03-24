import { runFullSimulation } from './src/engine/simulation';

const t0 = Date.now();
const result = runFullSimulation(2); // gamesPerMatchup=2 for round-robin
const elapsed = Date.now() - t0;

console.log(`\n=== シミュレーション完了 (${elapsed}ms, ${result.results.length}試合) ===\n`);

// 陣営別勝率
console.log('【陣営別勝率】');
const factionEntries = Object.entries(result.factionWinRates)
  .sort((a, b) => (b[1] as any).rate - (a[1] as any).rate);
for (const [name, stats] of factionEntries) {
  const s = stats as any;
  console.log(`  ${name.padEnd(10)} ${s.rate}% (${s.wins}W/${s.losses}L/${s.draws}D)`);
}

// アイテムセット別勝率
console.log('\n【アイテムセット別勝率】');
const itemEntries = Object.entries(result.itemSetWinRates)
  .sort((a, b) => (b[1] as any).rate - (a[1] as any).rate);
for (const [name, stats] of itemEntries) {
  const s = stats as any;
  console.log(`  ${name.padEnd(10)} ${s.rate}% (${s.wins}W/${s.losses}L/${s.draws}D)`);
}

// デッキ別勝率 (上位10, 下位10)
console.log('\n【デッキ別勝率 TOP10】');
const deckEntries = Object.entries(result.deckWinRates)
  .sort((a, b) => (b[1] as any).rate - (a[1] as any).rate);
for (const [name, stats] of deckEntries.slice(0, 10)) {
  const s = stats as any;
  console.log(`  ${name.padEnd(30)} ${s.rate}% (${s.wins}W/${s.losses}L/${s.draws}D)`);
}
console.log('\n【デッキ別勝率 BOTTOM10】');
for (const [name, stats] of deckEntries.slice(-10)) {
  const s = stats as any;
  console.log(`  ${name.padEnd(30)} ${s.rate}% (${s.wins}W/${s.losses}L/${s.draws}D)`);
}

// 平均ターン数
const avgTurns = result.results.reduce((sum, r) => sum + r.turns, 0) / result.results.length;
console.log(`\n平均ターン数: ${avgTurns.toFixed(1)}`);

// 先攻/後攻勝率
const p0Wins = result.results.filter(r => r.winner === 0).length;
const p1Wins = result.results.filter(r => r.winner === 1).length;
const drawCount = result.results.filter(r => r.winner === null).length;
const total = result.results.length;
console.log(`先攻(P0)勝率: ${(p0Wins / total * 100).toFixed(1)}% (${p0Wins}勝)`);
console.log(`後攻(P1)勝率: ${(p1Wins / total * 100).toFixed(1)}% (${p1Wins}勝)`);
console.log(`引き分け率: ${(drawCount / total * 100).toFixed(1)}%`);

// ターン数分布
const turnDist: Record<number, number> = {};
for (const r of result.results) {
  turnDist[r.turns] = (turnDist[r.turns] || 0) + 1;
}
console.log('\n【ターン数分布】');
for (const [t, count] of Object.entries(turnDist).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  const bar = '█'.repeat(Math.round(count / total * 100));
  console.log(`  T${t.padStart(2)}: ${String(count).padStart(4)} (${(count / total * 100).toFixed(1)}%) ${bar}`);
}

// 逆転率
const comebacks = result.results.filter(r => r.comeback).length;
const gamesWithMidLeader = result.results.filter(r => r.midLeader !== null).length;
console.log(`\n逆転率: ${gamesWithMidLeader > 0 ? (comebacks / gamesWithMidLeader * 100).toFixed(1) : 0}% (${comebacks}/${gamesWithMidLeader})`);

// 死亡率サマリ
const totalSummons = Object.values(result.cardStats).reduce((s, c) => s + c.summons, 0);
const totalDeaths = Object.values(result.cardStats).reduce((s, c) => s + c.deaths, 0);
console.log(`\n全体死亡率: ${(totalDeaths / totalSummons * 100).toFixed(1)}% (${totalDeaths}死亡/${totalSummons}召喚)`);

// カード別統計
console.log('\n【カード別統計 — 召喚数TOP20】');
const cardEntries = Object.values(result.cardStats)
  .sort((a, b) => b.summons - a.summons);
console.log(`  ${'カード名'.padEnd(16)} ${'陣営'.padEnd(8)} コスト 召喚  死亡  デッキ勝率`);
console.log(`  ${'─'.repeat(70)}`);
for (const c of cardEntries.slice(0, 20)) {
  const deckRate = c.inWinningDeck + c.inLosingDeck > 0
    ? Math.round((c.inWinningDeck / (c.inWinningDeck + c.inLosingDeck)) * 1000) / 10
    : 0;
  console.log(`  ${c.cardName.padEnd(16)} ${c.faction.padEnd(8)} ${String(c.manaCost).padStart(3)}   ${String(c.summons).padStart(4)}  ${String(c.deaths).padStart(4)}  ${deckRate}%`);
}

console.log('\n【カード別統計 — 召喚数BOTTOM20（使われないカード）】');
for (const c of cardEntries.slice(-20)) {
  const deckRate = c.inWinningDeck + c.inLosingDeck > 0
    ? Math.round((c.inWinningDeck / (c.inWinningDeck + c.inLosingDeck)) * 1000) / 10
    : 0;
  console.log(`  ${c.cardName.padEnd(16)} ${c.faction.padEnd(8)} ${String(c.manaCost).padStart(3)}   ${String(c.summons).padStart(4)}  ${String(c.deaths).padStart(4)}  ${deckRate}%`);
}

// デッキ勝率でソート（エースカード）
console.log('\n【エースカード（コスト5-6）召喚時勝率】');
const aces = Object.values(result.cardStats)
  .filter(c => c.manaCost >= 5)
  .sort((a, b) => {
    const rA = a.summonWins + a.summonLosses > 0 ? a.summonWins / (a.summonWins + a.summonLosses) : 0;
    const rB = b.summonWins + b.summonLosses > 0 ? b.summonWins / (b.summonWins + b.summonLosses) : 0;
    return rB - rA;
  });
console.log(`  ${'カード名'.padEnd(16)} ${'陣営'.padEnd(8)} コスト 召喚  死亡  召喚時勝率  デッキ勝率`);
console.log(`  ${'─'.repeat(75)}`);
for (const c of aces) {
  const deckRate = c.inWinningDeck + c.inLosingDeck > 0
    ? Math.round((c.inWinningDeck / (c.inWinningDeck + c.inLosingDeck)) * 1000) / 10
    : 0;
  const summonRate = c.summonWins + c.summonLosses > 0
    ? Math.round((c.summonWins / (c.summonWins + c.summonLosses)) * 1000) / 10
    : 0;
  console.log(`  ${c.cardName.padEnd(16)} ${c.faction.padEnd(8)} ${String(c.manaCost).padStart(3)}   ${String(c.summons).padStart(4)}  ${String(c.deaths).padStart(4)}  ${String(summonRate).padStart(5)}%      ${deckRate}%`);
}
