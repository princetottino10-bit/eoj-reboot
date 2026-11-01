/**
 * シミュレーション実行スクリプト（バランス評価版）
 * npx vite-node src/run-simulation.ts          → 200試合サンプル（高速）
 * npx vite-node src/run-simulation.ts 500      → 500試合サンプル
 * npx vite-node src/run-simulation.ts full      → 3540試合総当たり
 * 結果は sim-results.json に保存される
 */
import { writeFileSync } from 'fs';
import { runFullSimulation, runSampledSimulation } from './engine/simulation';

const arg = process.argv[2];
const isFullMode = arg === 'full';
const sampleSize = !isFullMode ? parseInt(arg || '200', 10) : 0;

console.log('=== 異能学園総選挙 バランス評価レポート ===');
if (isFullMode) {
  console.log('モード: 総当たり（60デッキ × 先後入替 = 3540試合）\n');
} else {
  console.log(`モード: ランダム抽出（${sampleSize}試合 / 先後入替あり）\n`);
}

const start = Date.now();
const { results, deckWinRates, factionWinRates, itemSetWinRates, cardStats } = isFullMode
  ? runFullSimulation(2)
  : runSampledSimulation(sampleSize);
const elapsed = ((Date.now() - start) / 1000).toFixed(1);

console.log(`実行時間: ${elapsed}秒 / 全${results.length}試合\n`);

// ========================================
// 1. 先手/後手バランス
// ========================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【1】先手/後手バランス');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const p0Wins = results.filter(r => r.winner === 0).length;
const p1Wins = results.filter(r => r.winner === 1).length;
const draws = results.filter(r => r.winner === null).length;
const p0Rate = ((p0Wins / (p0Wins + p1Wins)) * 100).toFixed(1);
console.log(`  先手(P0): ${p0Wins}勝 (${p0Rate}%)`);
console.log(`  後手(P1): ${p1Wins}勝 (${(100 - parseFloat(p0Rate)).toFixed(1)}%)`);
console.log(`  引分: ${draws}`);
const fairness = Math.abs(parseFloat(p0Rate) - 50);
console.log(`  → 公平性: ${fairness < 3 ? '◎ 良好' : fairness < 7 ? '○ 許容範囲' : '△ 要調整'} (偏差${fairness.toFixed(1)}%)\n`);

// ========================================
// 2. 試合ターン数の分布
// ========================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【2】試合ターン数の分布');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const turns = results.map(r => r.turns).sort((a, b) => a - b);
const avgTurns = (turns.reduce((s, t) => s + t, 0) / turns.length).toFixed(1);
const medianTurns = turns[Math.floor(turns.length / 2)];
const minTurns = turns[0];
const maxTurns = turns[turns.length - 1];
const stdDev = Math.sqrt(turns.reduce((s, t) => s + (t - parseFloat(avgTurns)) ** 2, 0) / turns.length).toFixed(1);

console.log(`  平均: ${avgTurns}ターン / 中央値: ${medianTurns} / 標準偏差: ${stdDev}`);
console.log(`  最短: ${minTurns} / 最長: ${maxTurns}`);

// ヒストグラム
const buckets: Record<string, number> = {};
for (const t of turns) {
  const bucket = `${Math.floor(t / 3) * 3}-${Math.floor(t / 3) * 3 + 2}`;
  buckets[bucket] = (buckets[bucket] || 0) + 1;
}
console.log('  ターン分布:');
for (const [range, count] of Object.entries(buckets)) {
  const bar = '█'.repeat(Math.round(count / results.length * 100));
  console.log(`    ${range.padStart(5)}T: ${bar} ${count} (${((count / results.length) * 100).toFixed(1)}%)`);
}

const shortGames = results.filter(r => r.turns <= 4).length;
const longGames = results.filter(r => r.turns >= 15).length;
console.log(`  → 瞬殺(≤4T): ${shortGames} (${((shortGames / results.length) * 100).toFixed(1)}%)`);
console.log(`  → 長期戦(≥15T): ${longGames} (${((longGames / results.length) * 100).toFixed(1)}%)`);
const paceRating = parseFloat(avgTurns) >= 6 && parseFloat(avgTurns) <= 12 ? '◎ 良好' :
  parseFloat(avgTurns) >= 4 && parseFloat(avgTurns) <= 15 ? '○ 許容範囲' : '△ 要調整';
console.log(`  → テンポ評価: ${paceRating}\n`);

// ========================================
// 3. デッキ勝率の偏差（バランス）
// ========================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【3】デッキ勝率の偏差');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const rates = Object.values(deckWinRates).map(d => d.rate);
const avgRate = (rates.reduce((s, r) => s + r, 0) / rates.length).toFixed(1);
const rateStdDev = Math.sqrt(rates.reduce((s, r) => s + (r - parseFloat(avgRate)) ** 2, 0) / rates.length).toFixed(1);
const maxRate = Math.max(...rates);
const minRate = Math.min(...rates);
const within45_55 = rates.filter(r => r >= 45 && r <= 55).length;
const over60 = rates.filter(r => r > 60).length;
const under40 = rates.filter(r => r < 40).length;

console.log(`  平均勝率: ${avgRate}% / 標準偏差: ${rateStdDev}%`);
console.log(`  最高: ${maxRate}% / 最低: ${minRate}%`);
console.log(`  45-55%帯: ${within45_55}/60 (${((within45_55 / 60) * 100).toFixed(0)}%)`);
console.log(`  60%超(強すぎ): ${over60}デッキ / 40%未満(弱すぎ): ${under40}デッキ`);
const balanceRating = parseFloat(rateStdDev) < 8 ? '◎ 良好' :
  parseFloat(rateStdDev) < 12 ? '○ 許容範囲' : '△ 要調整';
console.log(`  → バランス評価: ${balanceRating}\n`);

// ========================================
// 4. 派閥多様性
// ========================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【4】派閥多様性');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const factionNames: Record<string, string> = {
  aggro: 'アグロ', tank: 'タンク', control: 'コントロール',
  synergy: 'シナジー', snipe: 'スナイプ', trick: 'トリック',
};
const itemSetNames: Record<string, string> = {
  A: '万能型', B: '攻撃型', C: '戦術型', D: '持久型',
};

const sortedFactions = Object.entries(factionWinRates).sort((a, b) => b[1].rate - a[1].rate);
for (const [f, stats] of sortedFactions) {
  console.log(`  ${(factionNames[f] || f).padEnd(10)} 勝率 ${stats.rate}%`);
}
const fRates = sortedFactions.map(([, s]) => s.rate);
const fSpread = fRates[0] - fRates[fRates.length - 1];
console.log(`  最大差: ${fSpread.toFixed(1)}%`);

// TOP10に含まれる派閥
const sortedDecks = Object.entries(deckWinRates).sort((a, b) => b[1].rate - a[1].rate);
const top10Factions = new Set<string>();
for (let i = 0; i < 10; i++) {
  const [deck] = sortedDecks[i];
  const [facs] = deck.split('_');
  facs.split('+').forEach(f => top10Factions.add(f));
}
console.log(`  TOP10に登場する派閥: ${top10Factions.size}/6 (${[...top10Factions].map(f => factionNames[f] || f).join(', ')})`);
const diversityRating = fSpread < 10 ? '◎ 良好' : fSpread < 15 ? '○ 許容範囲' : '△ 要調整';
console.log(`  → 多様性評価: ${diversityRating}\n`);

// ========================================
// 5. 逆転率
// ========================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【5】逆転率（中盤リードからの逆転）');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const gamesWithMidLead = results.filter(r => r.midLeader !== null && r.winner !== null);
const comebacks = results.filter(r => r.comeback);
const comebackRate = gamesWithMidLead.length > 0
  ? ((comebacks.length / gamesWithMidLead.length) * 100).toFixed(1) : '0';
console.log(`  中盤リードあり: ${gamesWithMidLead.length}試合`);
console.log(`  逆転: ${comebacks.length}試合 (${comebackRate}%)`);
const cbRate = parseFloat(comebackRate as string);
const comebackRating = cbRate >= 25 && cbRate <= 45 ? '◎ 良好' :
  cbRate >= 15 && cbRate <= 55 ? '○ 許容範囲' : '△ 要調整';
console.log(`  → 逆転性評価: ${comebackRating}`);
console.log(`    (理想: 25-45%。低すぎ=先行ゲー、高すぎ=序盤無意味)\n`);

// ========================================
// 6. アイテムセット影響度
// ========================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【6】アイテムセット影響度');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const sortedItems = Object.entries(itemSetWinRates).sort((a, b) => b[1].rate - a[1].rate);
for (const [k, stats] of sortedItems) {
  console.log(`  ${(itemSetNames[k] || k).padEnd(8)} 勝率 ${stats.rate}%`);
}
const iRates = sortedItems.map(([, s]) => s.rate);
const iSpread = iRates[0] - iRates[iRates.length - 1];
console.log(`  最大差: ${iSpread.toFixed(1)}%`);
const itemRating = iSpread < 10 ? '◎ 良好' : iSpread < 20 ? '○ 許容範囲' : '△ 要調整';
console.log(`  → アイテムバランス: ${itemRating}\n`);

// ========================================
// 総合スコア
// ========================================
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【総合評価】');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const scores = [
  { name: '先手/後手バランス', score: fairness < 3 ? 3 : fairness < 7 ? 2 : 1 },
  { name: 'テンポ', score: paceRating.startsWith('◎') ? 3 : paceRating.startsWith('○') ? 2 : 1 },
  { name: 'デッキバランス', score: balanceRating.startsWith('◎') ? 3 : balanceRating.startsWith('○') ? 2 : 1 },
  { name: '派閥多様性', score: diversityRating.startsWith('◎') ? 3 : diversityRating.startsWith('○') ? 2 : 1 },
  { name: '逆転性', score: comebackRating.startsWith('◎') ? 3 : comebackRating.startsWith('○') ? 2 : 1 },
  { name: 'アイテムバランス', score: itemRating.startsWith('◎') ? 3 : itemRating.startsWith('○') ? 2 : 1 },
];
const totalScore = scores.reduce((s, x) => s + x.score, 0);
const maxScore = scores.length * 3;
for (const s of scores) {
  console.log(`  ${s.name.padEnd(16)} ${'★'.repeat(s.score)}${'☆'.repeat(3 - s.score)}`);
}
console.log(`\n  総合: ${totalScore}/${maxScore} (${((totalScore / maxScore) * 100).toFixed(0)}%)`);

// TOP5 / BOTTOM5
console.log('\n--- デッキ TOP 5 ---');
for (let i = 0; i < 5; i++) {
  const [deck, stats] = sortedDecks[i];
  const [facs, itemKey] = deck.split('_');
  const [f1, f2] = facs.split('+');
  console.log(`  ${i + 1}. ${factionNames[f1]}+${factionNames[f2]} [${itemSetNames[itemKey]}]  勝率${stats.rate}%`);
}
console.log('\n--- デッキ BOTTOM 5 ---');
for (let i = sortedDecks.length - 1; i >= sortedDecks.length - 5; i--) {
  const [deck, stats] = sortedDecks[i];
  const [facs, itemKey] = deck.split('_');
  const [f1, f2] = facs.split('+');
  console.log(`  ${sortedDecks.length - i}. ${factionNames[f1]}+${factionNames[f2]} [${itemSetNames[itemKey]}]  勝率${stats.rate}%`);
}

// ========================================
// 7. カード別統計（召喚勝率・撃破数）
// ========================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【7】カード別統計');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const cardEntries = Object.values(cardStats).filter(c => c.summons > 0);

// 召喚勝率TOP10
const byWinRate = cardEntries
  .filter(c => c.summons >= 10) // 最低10回は召喚されたカードのみ
  .map(c => ({ ...c, winRate: c.summonWins + c.summonLosses > 0 ? c.summonWins / (c.summonWins + c.summonLosses) * 100 : 0 }))
  .sort((a, b) => b.winRate - a.winRate);

console.log('\n  ◆ 召喚勝率 TOP10（召喚10回以上）');
for (let i = 0; i < Math.min(10, byWinRate.length); i++) {
  const c = byWinRate[i];
  console.log(`    ${(i + 1).toString().padStart(2)}. ${c.cardName.padEnd(8)} [${factionNames[c.faction] || c.faction}] C${c.manaCost}  勝率${c.winRate.toFixed(1)}%  召喚${c.summons}回  撃破${c.kills}  被撃破${c.deaths}`);
}

console.log('\n  ◆ 召喚勝率 BOTTOM10（召喚10回以上）');
for (let i = byWinRate.length - 1; i >= Math.max(0, byWinRate.length - 10); i--) {
  const c = byWinRate[i];
  console.log(`    ${(byWinRate.length - i).toString().padStart(2)}. ${c.cardName.padEnd(8)} [${factionNames[c.faction] || c.faction}] C${c.manaCost}  勝率${c.winRate.toFixed(1)}%  召喚${c.summons}回  撃破${c.kills}  被撃破${c.deaths}`);
}

// 召喚回数TOP10
const bySummons = [...cardEntries].sort((a, b) => b.summons - a.summons);
console.log('\n  ◆ 召喚回数 TOP10');
for (let i = 0; i < Math.min(10, bySummons.length); i++) {
  const c = bySummons[i];
  const wr = c.summonWins + c.summonLosses > 0 ? (c.summonWins / (c.summonWins + c.summonLosses) * 100).toFixed(1) : '-';
  console.log(`    ${(i + 1).toString().padStart(2)}. ${c.cardName.padEnd(8)} [${factionNames[c.faction] || c.faction}] C${c.manaCost}  召喚${c.summons}回  勝率${wr}%`);
}

// 派閥別カード統計
console.log('\n  ◆ 派閥別カード一覧');
const factionOrder = ['aggro', 'tank', 'control', 'synergy', 'snipe', 'trick'];
for (const fac of factionOrder) {
  const facCards = Object.values(cardStats)
    .filter(c => c.faction === fac)
    .sort((a, b) => a.manaCost - b.manaCost);
  if (facCards.length === 0) continue;
  console.log(`\n  【${factionNames[fac] || fac}】`);
  console.log(`  ${'名前'.padEnd(8)} C  召喚  勝率    撃破  被撃破  K/D`);
  for (const c of facCards) {
    const wr = c.summonWins + c.summonLosses > 0 ? (c.summonWins / (c.summonWins + c.summonLosses) * 100).toFixed(1) + '%' : '  - ';
    const kd = c.deaths > 0 ? (c.kills / c.deaths).toFixed(2) : c.kills > 0 ? '∞' : '-';
    console.log(`  ${c.cardName.padEnd(8)} ${c.manaCost}  ${c.summons.toString().padStart(4)}  ${wr.padStart(6)}  ${c.kills.toString().padStart(4)}  ${c.deaths.toString().padStart(4)}    ${kd}`);
  }
}

// ========================================
// JSON保存（レポート再利用用）
// ========================================
const jsonPath = 'sim-results.json';
writeFileSync(jsonPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  mode: isFullMode ? 'full' : 'sampled',
  totalGames: results.length,
  elapsedSeconds: parseFloat(elapsed),
  results,
  deckWinRates,
  factionWinRates,
  itemSetWinRates,
  cardStats,
}, null, 2), 'utf-8');
console.log(`\n結果を ${jsonPath} に保存しました`);

console.log('\n=== レポート完了 ===');
