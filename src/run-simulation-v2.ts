/**
 * v2 シミュレーション実行スクリプト
 * npx vite-node src/run-simulation-v2.ts          → 200試合サンプル
 * npx vite-node src/run-simulation-v2.ts 100      → 100試合サンプル
 * 結果は sim-results-v2.json に保存される
 */
import { writeFileSync } from 'fs';
import { runSampledSimulation } from './engine/simulation';
import { VP_TARGET } from './engine/rules';
import { V2_CHARACTERS } from './data/cards-v2';

const sampleSize = parseInt(process.argv[2] || '200', 10);

console.log('=== 異能学園総選挙 v2 バランス評価レポート ===');
console.log(`モード: ランダム抽出（${sampleSize}試合 / 先後入替あり）`);
console.log(`カードプール: v2 (${V2_CHARACTERS.length}枚)\n`);

const start = Date.now();
const { results, deckWinRates, factionWinRates, itemSetWinRates, cardStats } = runSampledSimulation(sampleSize, V2_CHARACTERS);
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
const totalDecided = p0Wins + p1Wins;
const p0Rate = totalDecided > 0 ? (p0Wins / totalDecided * 100).toFixed(1) : '0';
const p1Rate = totalDecided > 0 ? (p1Wins / totalDecided * 100).toFixed(1) : '0';
console.log(`  先手(P0): ${p0Wins}勝 (${p0Rate}%)`);
console.log(`  後手(P1): ${p1Wins}勝 (${p1Rate}%)`);
console.log(`  引分: ${draws}`);

// ========================================
// 2. 勝利タイプ分布 (v2新規)
// ========================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【2】勝利タイプ分布');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const vpWins = results.filter(r => r.winType === 'vp').length;
const terrWins = results.filter(r => r.winType === 'territory').length;
const timeoutWins = results.filter(r => r.winType === 'timeout').length;
const drawCount = results.filter(r => r.winType === 'draw').length;
console.log(`  VP勝利(${VP_TARGET}VP):     ${vpWins} (${(vpWins / results.length * 100).toFixed(1)}%)`);
console.log(`  5マス占拠:        ${terrWins} (${(terrWins / results.length * 100).toFixed(1)}%)`);
console.log(`  タイムアウト(VP差): ${timeoutWins} (${(timeoutWins / results.length * 100).toFixed(1)}%)`);
console.log(`  引分:             ${drawCount} (${(drawCount / results.length * 100).toFixed(1)}%)`);

// ========================================
// 3. VP統計
// ========================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【3】VP統計');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const allVPs = results.map(r => r.p0VP + r.p1VP);
const avgVP = allVPs.reduce((a, b) => a + b, 0) / allVPs.length;
const maxVP = Math.max(...results.map(r => Math.max(r.p0VP, r.p1VP)));
console.log(`  平均合計VP/試合: ${avgVP.toFixed(1)}`);
console.log(`  最高VP(片方):    ${maxVP}`);

// ========================================
// 4. ターン数
// ========================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【4】試合ターン数');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const turns = results.map(r => r.turns).sort((a, b) => a - b);
const avgTurns = turns.reduce((a, b) => a + b, 0) / turns.length;
const medianTurns = turns[Math.floor(turns.length / 2)];
console.log(`  平均: ${avgTurns.toFixed(1)}ターン / 中央値: ${medianTurns}`);
console.log(`  最短: ${turns[0]} / 最長: ${turns[turns.length - 1]}`);

// ========================================
// 5. 派閥勝率
// ========================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【5】派閥勝率');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const FACTION_NAMES: Record<string, string> = {
  aggro: 'アグロ', tank: 'タンク', control: 'コントロール',
  synergy: 'シナジー', snipe: 'スナイプ', trick: 'トリック',
};
const sortedFactions = Object.entries(factionWinRates)
  .sort((a, b) => b[1].rate - a[1].rate);
for (const [faction, stats] of sortedFactions) {
  const name = FACTION_NAMES[faction] || faction;
  console.log(`  ${name.padEnd(10)} 勝率 ${stats.rate}% (${stats.wins}W/${stats.losses}L/${stats.draws}D)`);
}

// ========================================
// 6. アイテムセット
// ========================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【6】アイテムセット勝率');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const ITEM_NAMES: Record<string, string> = { A: '万能型', B: '攻撃型', C: '戦術型', D: '持久型' };
const sortedItems = Object.entries(itemSetWinRates)
  .sort((a, b) => b[1].rate - a[1].rate);
for (const [key, stats] of sortedItems) {
  console.log(`  ${ITEM_NAMES[key] || key}  勝率 ${stats.rate}%`);
}

// ========================================
// 7. カード別 TOP/BOTTOM
// ========================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【7】カード別統計');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const cardList = Object.values(cardStats)
  .map(c => ({
    ...c,
    summonWinRate: (c.summonWins + c.summonLosses) > 0
      ? Math.round(c.summonWins / (c.summonWins + c.summonLosses) * 1000) / 10
      : 0,
    kd: c.deaths > 0 ? Math.round(c.kills / c.deaths * 100) / 100 : c.kills,
  }));

const summonMin = 5;
const topCards = cardList.filter(c => c.summons >= summonMin)
  .sort((a, b) => b.summonWinRate - a.summonWinRate);

console.log(`\n  ◆ 召喚勝率 TOP10（召喚${summonMin}回以上）`);
topCards.slice(0, 10).forEach((c, i) => {
  console.log(`    ${String(i + 1).padStart(2)}. ${c.cardName.padEnd(12)} [${c.faction}] C${c.manaCost}  勝率${c.summonWinRate}%  召喚${c.summons}回  K/D ${c.kd}`);
});

console.log(`\n  ◆ 召喚勝率 BOTTOM10（召喚${summonMin}回以上）`);
topCards.slice(-10).reverse().forEach((c, i) => {
  console.log(`    ${String(i + 1).padStart(2)}. ${c.cardName.padEnd(12)} [${c.faction}] C${c.manaCost}  勝率${c.summonWinRate}%  召喚${c.summons}回  K/D ${c.kd}`);
});

// 派閥別カード一覧
const factionOrder = ['aggro', 'tank', 'control', 'synergy', 'snipe', 'trick'];
for (const f of factionOrder) {
  console.log(`\n  【${FACTION_NAMES[f]}】`);
  console.log('  名前         C  召喚  勝率    撃破  被撃破  K/D');
  const fCards = cardList.filter(c => c.faction === f).sort((a, b) => a.manaCost - b.manaCost);
  for (const c of fCards) {
    console.log(`  ${c.cardName.padEnd(12)} ${String(c.manaCost).padStart(1)}  ${String(c.summons).padStart(4)}   ${String(c.summonWinRate).padStart(5)}%  ${String(c.kills).padStart(4)}  ${String(c.deaths).padStart(5)}    ${String(c.kd).padStart(4)}`);
  }
}

// ========================================
// 8. 逆転率
// ========================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【8】逆転率');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
const withMidLead = results.filter(r => r.midLeader !== null);
const comebacks = withMidLead.filter(r => r.comeback);
if (withMidLead.length > 0) {
  console.log(`  中盤リードあり: ${withMidLead.length}試合`);
  console.log(`  逆転: ${comebacks.length}試合 (${(comebacks.length / withMidLead.length * 100).toFixed(1)}%)`);
}

// ========================================
// ルール動作確認サマリ
// ========================================
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('【ルール動作確認】');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  VP勝利が発生:     ${vpWins > 0 ? '✅ YES' : '❌ NO'} (${vpWins}件)`);
console.log(`  5マス勝利が発生:  ${terrWins > 0 ? '✅ YES' : '❌ NO'} (${terrWins}件)`);
console.log(`  両タイプ発生:     ${vpWins > 0 && terrWins > 0 ? '✅ YES' : '❌ NO'}`);
console.log(`  50ターンタイムアウト: ${timeoutWins > 0 || drawCount > 0 ? '⚠️ あり' : '✅ なし'} (${timeoutWins + drawCount}件)`);

// VP取得確認
const allVPResults = results.filter(r => r.p0VP > 0 || r.p1VP > 0);
console.log(`  VP取得が発生した試合: ${allVPResults.length}/${results.length}`);

// 召喚回数（2回召喚の検証は間接的にAIの動きで確認）
const avgCellControl = results.reduce((sum, r) => sum + r.p0CellsControlled + r.p1CellsControlled, 0) / results.length;
console.log(`  平均盤面キャラ数(終局時): ${avgCellControl.toFixed(1)}`);

// ========================================
// JSON保存
// ========================================
const jsonPath = 'sim-results-v2.json';
writeFileSync(jsonPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  version: 'v2',
  mode: 'sampled',
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
