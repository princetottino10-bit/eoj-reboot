/**
 * やばいカード抽出スクリプト
 * 派閥平均勝率との乖離でカード個体の強さ/弱さを判定
 */

// 3540試合フル版のデータ（手動転記）
const FACTION_AVG: Record<string, number> = {
  aggro: 52.7,
  tank: 51.3,
  control: 40.0,
  synergy: 54.6,
  snipe: 57.7,
  trick: 43.7,
};

const FACTION_NAMES: Record<string, string> = {
  aggro: 'アグロ', tank: 'タンク', control: 'コントロール',
  synergy: 'シナジー', snipe: 'スナイプ', trick: 'トリック',
};

interface CardData {
  name: string;
  faction: string;
  cost: number;
  summons: number;
  winRate: number;
  deaths: number;
}

// 3540試合フル版の全カードデータ
const cards: CardData[] = [
  // アグロ
  { name: '迅刃のレイ', faction: 'aggro', cost: 1, summons: 1120, winRate: 56.5, deaths: 1044 },
  { name: '雷鳴のライカ', faction: 'aggro', cost: 1, summons: 1408, winRate: 57.5, deaths: 1107 },
  { name: '崩蝕のエンマ', faction: 'aggro', cost: 1, summons: 1228, winRate: 54.9, deaths: 1017 },
  { name: '虚影のゼロ', faction: 'aggro', cost: 1, summons: 1341, winRate: 55.7, deaths: 1036 },
  { name: '烈火のカグラ', faction: 'aggro', cost: 2, summons: 1369, winRate: 57.0, deaths: 1119 },
  { name: '雷迅のジンガ', faction: 'aggro', cost: 2, summons: 1396, winRate: 58.0, deaths: 1027 },
  { name: '蝕牙のドク', faction: 'aggro', cost: 2, summons: 1369, winRate: 53.7, deaths: 988 },
  { name: '連撃のハヤテ', faction: 'aggro', cost: 2, summons: 1364, winRate: 53.6, deaths: 936 },
  { name: '閃光のヒカリ', faction: 'aggro', cost: 3, summons: 1429, winRate: 56.0, deaths: 861 },
  { name: '爆裂のノヴァ', faction: 'aggro', cost: 3, summons: 1393, winRate: 53.4, deaths: 1049 },
  { name: '光刃のセラ', faction: 'aggro', cost: 5, summons: 774, winRate: 62.4, deaths: 426 },
  { name: '覇王のカイザー', faction: 'aggro', cost: 5, summons: 543, winRate: 38.0, deaths: 482 },

  // タンク
  { name: '癒しのミコト', faction: 'tank', cost: 1, summons: 944, winRate: 53.3, deaths: 698 },
  { name: '虚壁のムゲン', faction: 'tank', cost: 1, summons: 1072, winRate: 56.8, deaths: 718 },
  { name: '剛拳のイワオ', faction: 'tank', cost: 2, summons: 1020, winRate: 54.2, deaths: 524 },
  { name: '念盾のアオイ', faction: 'tank', cost: 2, summons: 1159, winRate: 54.9, deaths: 835 },
  { name: '蝕耐のヴェノ', faction: 'tank', cost: 2, summons: 1259, winRate: 56.1, deaths: 668 },
  { name: '苔壁のモス', faction: 'tank', cost: 2, summons: 1106, winRate: 54.2, deaths: 680 },
  { name: '鉄壁のガルド', faction: 'tank', cost: 3, summons: 1139, winRate: 57.0, deaths: 540 },
  { name: '念壁のシオン', faction: 'tank', cost: 3, summons: 1089, winRate: 55.2, deaths: 694 },
  { name: '蝕霧のカスミ', faction: 'tank', cost: 3, summons: 1243, winRate: 54.2, deaths: 654 },
  { name: '報復のガレス', faction: 'tank', cost: 3, summons: 1166, winRate: 58.8, deaths: 619 },
  { name: '聖盾のルミナ', faction: 'tank', cost: 5, summons: 436, winRate: 59.3, deaths: 163 },
  { name: '虚鎮のナギサ', faction: 'tank', cost: 5, summons: 72, winRate: 40.3, deaths: 25 },

  // コントロール
  { name: '蝕変のアルマ', faction: 'control', cost: 1, summons: 1018, winRate: 43.3, deaths: 720 },
  { name: '虚空のスイ', faction: 'control', cost: 1, summons: 1166, winRate: 44.3, deaths: 950 },
  { name: '惑わしのシズク', faction: 'control', cost: 2, summons: 813, winRate: 46.6, deaths: 437 },
  { name: '地裂のドルン', faction: 'control', cost: 2, summons: 912, winRate: 41.9, deaths: 581 },
  { name: '念縛のリン', faction: 'control', cost: 2, summons: 1136, winRate: 44.4, deaths: 826 },
  { name: '蝕縛のヤミカ', faction: 'control', cost: 2, summons: 1120, winRate: 41.1, deaths: 923 },
  { name: '侵蝕のロア', faction: 'control', cost: 2, summons: 1142, winRate: 40.2, deaths: 877 },
  { name: '念断のゲッカ', faction: 'control', cost: 3, summons: 1241, winRate: 44.1, deaths: 773 },
  { name: '光鎖のレティ', faction: 'control', cost: 3, summons: 1111, winRate: 45.2, deaths: 552 },
  { name: '時縛のクロノ', faction: 'control', cost: 3, summons: 1010, winRate: 40.2, deaths: 690 },
  { name: '威圧のオウガ', faction: 'control', cost: 3, summons: 1149, winRate: 42.4, deaths: 552 },
  { name: '虚無のカラン', faction: 'control', cost: 5, summons: 490, winRate: 42.1, deaths: 232 },
  { name: '蝕心のミスズ', faction: 'control', cost: 6, summons: 137, winRate: 49.2, deaths: 90 },

  // シナジー
  { name: '鼓舞のユイ', faction: 'synergy', cost: 1, summons: 1218, winRate: 56.2, deaths: 922 },
  { name: '蝕連のシュウ', faction: 'synergy', cost: 1, summons: 977, winRate: 58.7, deaths: 656 },
  { name: '虚和のソラ', faction: 'synergy', cost: 1, summons: 1014, winRate: 57.1, deaths: 673 },
  { name: '魔泉のリリア', faction: 'synergy', cost: 1, summons: 1057, winRate: 58.5, deaths: 821 },
  { name: '闘魂のレンジ', faction: 'synergy', cost: 2, summons: 1144, winRate: 55.8, deaths: 774 },
  { name: '絆のツムギ', faction: 'synergy', cost: 2, summons: 1124, winRate: 58.2, deaths: 840 },
  { name: '念波のコダマ', faction: 'synergy', cost: 2, summons: 1221, winRate: 57.2, deaths: 938 },
  { name: '共鳴のハルカ', faction: 'synergy', cost: 2, summons: 1060, winRate: 57.2, deaths: 804 },
  { name: '連陣のレン', faction: 'synergy', cost: 2, summons: 986, winRate: 56.9, deaths: 549 },
  { name: '遺志のユズリハ', faction: 'synergy', cost: 2, summons: 1083, winRate: 53.1, deaths: 832 },
  { name: '癒連のミナト', faction: 'synergy', cost: 3, summons: 1338, winRate: 62.0, deaths: 613 },
  { name: '光絆のアカリ', faction: 'synergy', cost: 3, summons: 1189, winRate: 57.6, deaths: 619 },
  { name: '盟約のアルス', faction: 'synergy', cost: 6, summons: 233, winRate: 63.8, deaths: 77 },

  // スナイプ
  { name: '鋭眼のマルコ', faction: 'snipe', cost: 1, summons: 1246, winRate: 63.7, deaths: 945 },
  { name: '蝕弾のニドル', faction: 'snipe', cost: 1, summons: 1269, winRate: 62.9, deaths: 992 },
  { name: '癒射のフィーネ', faction: 'snipe', cost: 1, summons: 1186, winRate: 61.6, deaths: 765 },
  { name: '裂拳のガウス', faction: 'snipe', cost: 2, summons: 1339, winRate: 61.2, deaths: 1045 },
  { name: '念弾のリーゼ', faction: 'snipe', cost: 2, summons: 1333, winRate: 60.5, deaths: 941 },
  { name: '光弾のエリス', faction: 'snipe', cost: 2, summons: 1237, winRate: 58.6, deaths: 953 },
  { name: '暗撃のシャドウ', faction: 'snipe', cost: 2, summons: 1271, winRate: 59.7, deaths: 926 },
  { name: '念穿のヴァルト', faction: 'snipe', cost: 3, summons: 1305, winRate: 60.7, deaths: 939 },
  { name: '穿孔のアッシュ', faction: 'snipe', cost: 3, summons: 1409, winRate: 62.1, deaths: 766 },
  { name: '徹弾のブレイズ', faction: 'snipe', cost: 3, summons: 1421, winRate: 63.9, deaths: 911 },
  { name: '終焉のイグニス', faction: 'snipe', cost: 5, summons: 366, winRate: 53.9, deaths: 291 },
  { name: '虚眼のゼクス', faction: 'snipe', cost: 5, summons: 535, winRate: 69.6, deaths: 272 },

  // トリック
  { name: '旋風のツバキ', faction: 'trick', cost: 1, summons: 1077, winRate: 47.6, deaths: 758 },
  { name: '蝕戯のピエロ', faction: 'trick', cost: 1, summons: 896, winRate: 42.9, deaths: 673 },
  { name: '瞬光のハク', faction: 'trick', cost: 1, summons: 1066, winRate: 47.9, deaths: 742 },
  { name: '虚遁のカイト', faction: 'trick', cost: 1, summons: 1119, winRate: 45.7, deaths: 799 },
  { name: '瞬転のリップル', faction: 'trick', cost: 1, summons: 1146, winRate: 46.5, deaths: 832 },
  { name: '拳舞のシュラ', faction: 'trick', cost: 2, summons: 1142, winRate: 44.8, deaths: 829 },
  { name: '幻影のシノブ', faction: 'trick', cost: 2, summons: 1197, winRate: 46.4, deaths: 882 },
  { name: '策謀のルシア', faction: 'trick', cost: 2, summons: 1122, winRate: 45.5, deaths: 878 },
  { name: '反転のジェミニ', faction: 'trick', cost: 2, summons: 1126, winRate: 45.1, deaths: 901 },
  { name: '転位のカゲロウ', faction: 'trick', cost: 3, summons: 672, winRate: 45.1, deaths: 310 },
  { name: '幻惑のマボロシ', faction: 'trick', cost: 3, summons: 1066, winRate: 44.5, deaths: 453 },
  { name: '光遁のミラージュ', faction: 'trick', cost: 3, summons: 1250, winRate: 48.0, deaths: 816 },
  { name: '虚幻のジョーカー', faction: 'trick', cost: 5, summons: 734, winRate: 44.1, deaths: 345 },
];

// ========================================
// 分析
// ========================================

console.log('═'.repeat(60));
console.log('  やばいカード抽出（派閥平均との乖離分析）');
console.log('  3540試合フル版データ');
console.log('═'.repeat(60));

// 各カードの派閥平均との差分
const analyzed = cards.map(c => ({
  ...c,
  factionAvg: FACTION_AVG[c.faction],
  diff: c.winRate - FACTION_AVG[c.faction],
  survivalRate: c.summons > 0 ? ((c.summons - c.deaths) / c.summons * 100) : 0,
}));

// ========================================
// 1. 派閥平均より著しく強いカード（+5%以上）
// ========================================
console.log('\n🔴 派閥平均より著しく強い（+5%以上）= ナーフ候補');
console.log('─'.repeat(55));
console.log(`  ${'カード名'.padEnd(16)} [派閥]     C  勝率   派閥平均  乖離   召喚  生存率`);

const tooStrong = analyzed.filter(c => c.diff >= 5).sort((a, b) => b.diff - a.diff);
for (const c of tooStrong) {
  const label = `${FACTION_NAMES[c.faction]}`.padEnd(6);
  console.log(`  ${c.name.padEnd(16)} [${label}] ${c.cost}  ${c.winRate.toFixed(1).padStart(5)}%  ${c.factionAvg.toFixed(1).padStart(5)}%  ${c.diff >= 0 ? '+' : ''}${c.diff.toFixed(1).padStart(5)}  ${c.summons.toString().padStart(5)}  ${c.survivalRate.toFixed(0)}%`);
}

// ========================================
// 2. 派閥平均より著しく弱いカード（-5%以下）
// ========================================
console.log('\n🔵 派閥平均より著しく弱い（-5%以下）= バフ候補');
console.log('─'.repeat(55));
console.log(`  ${'カード名'.padEnd(16)} [派閥]     C  勝率   派閥平均  乖離   召喚  生存率`);

const tooWeak = analyzed.filter(c => c.diff <= -5).sort((a, b) => a.diff - b.diff);
for (const c of tooWeak) {
  const label = `${FACTION_NAMES[c.faction]}`.padEnd(6);
  console.log(`  ${c.name.padEnd(16)} [${label}] ${c.cost}  ${c.winRate.toFixed(1).padStart(5)}%  ${c.factionAvg.toFixed(1).padStart(5)}%  ${c.diff >= 0 ? '+' : ''}${c.diff.toFixed(1).padStart(5)}  ${c.summons.toString().padStart(5)}  ${c.survivalRate.toFixed(0)}%`);
}

// ========================================
// 3. エース（C5-6）の個別分析
// ========================================
console.log('\n⭐ エース（C5-6）個別分析');
console.log('─'.repeat(55));
console.log(`  ${'カード名'.padEnd(16)} [派閥]     C  勝率   派閥平均  乖離   召喚  生存率  判定`);

const aces = analyzed.filter(c => c.cost >= 5).sort((a, b) => b.diff - a.diff);
for (const c of aces) {
  const label = `${FACTION_NAMES[c.faction]}`.padEnd(6);
  let verdict = '';
  if (c.diff >= 10) verdict = '⚠ 強すぎ';
  else if (c.diff >= 5) verdict = '△ やや強';
  else if (c.diff >= -3) verdict = '○ 適正';
  else if (c.diff >= -8) verdict = '△ やや弱';
  else verdict = '⚠ 弱すぎ';
  console.log(`  ${c.name.padEnd(16)} [${label}] ${c.cost}  ${c.winRate.toFixed(1).padStart(5)}%  ${c.factionAvg.toFixed(1).padStart(5)}%  ${c.diff >= 0 ? '+' : ''}${c.diff.toFixed(1).padStart(5)}  ${c.summons.toString().padStart(5)}  ${c.survivalRate.toFixed(0)}%    ${verdict}`);
}

// ========================================
// 4. 派閥内の格差（同コスト帯での比較）
// ========================================
console.log('\n📊 派閥内の格差（コスト帯別 最強-最弱）');
console.log('─'.repeat(55));

const factions = ['aggro', 'tank', 'control', 'synergy', 'snipe', 'trick'];
for (const fac of factions) {
  const facCards = analyzed.filter(c => c.faction === fac);
  const costBands = [[1, 1], [2, 2], [3, 3], [5, 6]];

  console.log(`\n  【${FACTION_NAMES[fac]}】(派閥平均: ${FACTION_AVG[fac]}%)`);
  for (const [lo, hi] of costBands) {
    const band = facCards.filter(c => c.cost >= lo && c.cost <= hi).sort((a, b) => b.winRate - a.winRate);
    if (band.length === 0) continue;
    const best = band[0];
    const worst = band[band.length - 1];
    const gap = best.winRate - worst.winRate;
    const label = lo === hi ? `C${lo}` : `C${lo}-${hi}`;
    if (band.length === 1) {
      console.log(`    ${label}: ${best.name} ${best.winRate.toFixed(1)}% (${best.diff >= 0 ? '+' : ''}${best.diff.toFixed(1)})`);
    } else {
      const flag = gap >= 5 ? ' ← 格差あり' : '';
      console.log(`    ${label}: ${best.name} ${best.winRate.toFixed(1)}% ↔ ${worst.name} ${worst.winRate.toFixed(1)}% (差${gap.toFixed(1)}%)${flag}`);
    }
  }
}

// ========================================
// 5. 生存率ワーストランキング（脆すぎるカード）
// ========================================
console.log('\n\n💀 生存率ワースト10（召喚されて死にすぎ）');
console.log('─'.repeat(55));

const bySurvival = [...analyzed].filter(c => c.summons >= 100).sort((a, b) => a.survivalRate - b.survivalRate);
for (let i = 0; i < Math.min(10, bySurvival.length); i++) {
  const c = bySurvival[i];
  console.log(`  ${(i+1).toString().padStart(2)}. ${c.name.padEnd(16)} [${FACTION_NAMES[c.faction]}] C${c.cost}  生存率${c.survivalRate.toFixed(0)}%  (${c.summons}召喚/${c.deaths}被撃破)`);
}

// ========================================
// 6. 総合まとめ
// ========================================
console.log('\n\n' + '═'.repeat(60));
console.log('  総合まとめ: 即対応が必要なカード');
console.log('═'.repeat(60));

console.log('\n  【ナーフ優先度: 高】');
for (const c of tooStrong.filter(c2 => c2.diff >= 7)) {
  console.log(`    ${c.name} [${FACTION_NAMES[c.faction]}/C${c.cost}] 勝率${c.winRate}% (派閥平均+${c.diff.toFixed(1)})`);
}

console.log('\n  【バフ優先度: 高】');
for (const c of tooWeak.filter(c2 => c2.diff <= -8)) {
  console.log(`    ${c.name} [${FACTION_NAMES[c.faction]}/C${c.cost}] 勝率${c.winRate}% (派閥平均${c.diff.toFixed(1)})`);
}

console.log('\n  【派閥全体の調整が必要】');
console.log(`    コントロール: 派閥勝率40.0% → 全体的にバフが必要`);
console.log(`    トリック: 派閥勝率43.7% → 全体的にバフが必要`);
console.log(`    スナイプ: 派閥勝率57.7% → 全体的にナーフが必要`);

console.log('\n' + '═'.repeat(60));
