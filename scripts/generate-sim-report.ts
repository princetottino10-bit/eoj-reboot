/**
 * シミュレーション結果(sim-results.json)をdocxレポートとして出力
 * Usage: npx vite-node scripts/generate-sim-report.ts
 * 事前に npx vite-node src/run-simulation.ts でJSONを生成しておくこと
 */
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, HeadingLevel } from 'docx';
import { readFileSync, writeFileSync } from 'fs';
import type { CardStats, SimulationResult } from '../src/engine/simulation';

// ========================================
// JSON読み込み
// ========================================
const jsonPath = process.argv[2] || 'sim-results.json';
console.log(`読み込み: ${jsonPath}`);
const sim = JSON.parse(readFileSync(jsonPath, 'utf-8')) as {
  timestamp: string;
  gamesPerMatchup: number;
  elapsedSeconds: number;
  results: SimulationResult[];
  deckWinRates: Record<string, { wins: number; losses: number; draws: number; rate: number }>;
  factionWinRates: Record<string, { wins: number; losses: number; draws: number; rate: number }>;
  itemSetWinRates: Record<string, { wins: number; losses: number; draws: number; rate: number }>;
  cardStats: Record<string, CardStats>;
};
const elapsed = sim.elapsedSeconds.toFixed(1);
console.log(`データ: ${sim.results.length}試合 / 実行時間${elapsed}秒 / ${sim.timestamp}`);

const results = sim.results;
const cardStats = sim.cardStats;

// ========================================
// ヘルパー
// ========================================
const FACTION_JP: Record<string, string> = {
  aggro: 'アグロ', tank: 'タンク', control: 'コントロール',
  synergy: 'シナジー', snipe: 'スナイプ', trick: 'トリック',
};
const ITEM_JP: Record<string, string> = { A: '攻撃型', B: '持久型', C: '戦術型', D: '万能型' };

function pct(n: number, d: number): string {
  return d === 0 ? '-' : (n / d * 100).toFixed(1) + '%';
}

function text(s: string, opts?: { bold?: boolean; size?: number; color?: string }): TextRun {
  return new TextRun({ text: s, bold: opts?.bold, size: opts?.size ?? 20, color: opts?.color, font: 'Meiryo' });
}

function heading(s: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel] = HeadingLevel.HEADING_1): Paragraph {
  return new Paragraph({ heading: level, children: [text(s, { bold: true, size: level === HeadingLevel.HEADING_1 ? 28 : 24 })] });
}

function para(s: string, opts?: { bold?: boolean }): Paragraph {
  return new Paragraph({ children: [text(s, opts)], spacing: { after: 80 } });
}

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const thinBorder = { style: BorderStyle.SINGLE, size: 1, color: '999999' };
const borders = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

function cell(s: string, opts?: { bold?: boolean; width?: number; shading?: string }): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [text(s, { bold: opts?.bold, size: 18 })], alignment: AlignmentType.CENTER })],
    width: opts?.width ? { size: opts.width, type: WidthType.DXA } : undefined,
    shading: opts?.shading ? { fill: opts.shading } : undefined,
    borders,
  });
}

function headerCell(s: string, width?: number): TableCell {
  return cell(s, { bold: true, width, shading: '2B579A' });
}

// ========================================
// 1. 基本統計
// ========================================
const totalGames = results.length;
const p0Wins = results.filter(r => r.winner === 0).length;
const p1Wins = results.filter(r => r.winner === 1).length;
const draws = results.filter(r => r.winner === null).length;
const turns = results.map(r => r.turns);
const avgTurn = (turns.reduce((a, b) => a + b, 0) / turns.length).toFixed(1);
const medianTurn = turns.sort((a, b) => a - b)[Math.floor(turns.length / 2)];
const comebacks = results.filter(r => r.comeback).length;
const midLeads = results.filter(r => r.midLeader !== null).length;

// ========================================
// 2. 派閥勝率
// ========================================
const factionEntries = Object.entries(sim.factionWinRates)
  .sort((a, b) => (b[1] as any).rate - (a[1] as any).rate);

// ========================================
// 3. 派閥対面マッチアップ表
// ========================================
const factions = ['aggro', 'tank', 'control', 'synergy', 'snipe', 'trick'];
const matchupMap: Record<string, { wins: number; losses: number }> = {};
for (const f1 of factions) {
  for (const f2 of factions) {
    matchupMap[`${f1}_${f2}`] = { wins: 0, losses: 0 };
  }
}
for (const r of results) {
  const p0fs = r.p0Faction.split('+');
  const p1fs = r.p1Faction.split('+');
  if (r.winner === 0) {
    for (const f of p0fs) for (const e of p1fs) { matchupMap[`${f}_${e}`].wins++; }
    for (const f of p1fs) for (const e of p0fs) { matchupMap[`${f}_${e}`].losses++; }
  } else if (r.winner === 1) {
    for (const f of p1fs) for (const e of p0fs) { matchupMap[`${f}_${e}`].wins++; }
    for (const f of p0fs) for (const e of p1fs) { matchupMap[`${f}_${e}`].losses++; }
  }
}

// ========================================
// 4. アイテムセット勝率
// ========================================
const itemEntries = Object.entries(sim.itemSetWinRates)
  .sort((a, b) => (b[1] as any).rate - (a[1] as any).rate);

// ========================================
// 5. デッキ勝率
// ========================================
const deckEntries = Object.entries(sim.deckWinRates)
  .sort((a, b) => (b[1] as any).rate - (a[1] as any).rate);

// ========================================
// 6. カード統計
// ========================================
const allCards = Object.values(cardStats).filter(c => c.summons > 0);
const byWinRate = [...allCards].sort((a, b) =>
  (b.summonWins / (b.summonWins + b.summonLosses || 1)) - (a.summonWins / (a.summonWins + a.summonLosses || 1))
);
const bySummons = [...allCards].sort((a, b) => b.summons - a.summons);
const byDeaths = [...allCards].sort((a, b) => b.deaths - a.deaths);
const byDeckRate = [...allCards].sort((a, b) =>
  (b.inWinningDeck / (b.inWinningDeck + b.inLosingDeck || 1)) - (a.inWinningDeck / (a.inWinningDeck + a.inLosingDeck || 1))
);

// ========================================
// ドキュメント生成
// ========================================
const sections: Paragraph[] = [];
const tables: (Paragraph | Table)[] = [];

// タイトル
const content: (Paragraph | Table)[] = [];
content.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [text('異能学園総選挙 シミュレーションレポート', { bold: true, size: 36 })],
}));
content.push(para(`実行日時: ${new Date().toLocaleString('ja-JP')}　|　試合数: ${totalGames}　|　実行時間: ${elapsed}秒`));
content.push(new Paragraph({ children: [], spacing: { after: 200 } }));

// ── 1. 基本統計 ──
content.push(heading('1. 基本統計'));
content.push(para(`総試合数: ${totalGames}　/　先手勝利: ${p0Wins} (${pct(p0Wins, totalGames)})　/　後手勝利: ${p1Wins} (${pct(p1Wins, totalGames)})　/　引分: ${draws}`));
content.push(para(`平均ターン: ${avgTurn}　/　中央値: ${medianTurn}　/　最短: ${turns[0]}　/　最長: ${turns[turns.length - 1]}`));
content.push(para(`逆転率: ${pct(comebacks, midLeads)}（中盤リードあり${midLeads}試合中${comebacks}回逆転）`));
content.push(new Paragraph({ children: [], spacing: { after: 200 } }));

// ── 2. 派閥勝率 ──
content.push(heading('2. 派閥勝率'));
const factionRows = [
  new TableRow({ children: [headerCell('派閥', 2000), headerCell('勝率', 1200), headerCell('勝', 1000), headerCell('負', 1000), headerCell('引分', 1000)] }),
];
for (const [name, stats] of factionEntries) {
  const s = stats as any;
  factionRows.push(new TableRow({ children: [
    cell(FACTION_JP[name] || name), cell(`${s.rate}%`), cell(`${s.wins}`), cell(`${s.losses}`), cell(`${s.draws}`),
  ] }));
}
content.push(new Table({ rows: factionRows, width: { size: 6200, type: WidthType.DXA } }));
content.push(new Paragraph({ children: [], spacing: { after: 200 } }));

// ── 3. 派閥対面マッチアップ ──
content.push(heading('3. 派閥対面マッチアップ'));
content.push(para('横軸=対戦相手、数値=勝率（自派閥視点）'));
const muHeader = [headerCell('', 1600)];
for (const f of factions) muHeader.push(headerCell(FACTION_JP[f] || f, 1200));
const muRows = [new TableRow({ children: muHeader })];
for (const f1 of factions) {
  const cells = [cell(FACTION_JP[f1] || f1, { bold: true })];
  for (const f2 of factions) {
    if (f1 === f2) {
      cells.push(cell('-', { shading: 'DDDDDD' }));
    } else {
      const m = matchupMap[`${f1}_${f2}`];
      const total = m.wins + m.losses;
      const rate = total > 0 ? (m.wins / total * 100).toFixed(1) : '-';
      const shade = total > 0 && m.wins / total >= 0.55 ? 'D4EDDA' : total > 0 && m.wins / total <= 0.45 ? 'F8D7DA' : undefined;
      cells.push(cell(`${rate}%`, { shading: shade }));
    }
  }
  muRows.push(new TableRow({ children: cells }));
}
content.push(new Table({ rows: muRows, width: { size: 8800, type: WidthType.DXA } }));
content.push(new Paragraph({ children: [], spacing: { after: 200 } }));

// ── 4. アイテムセット勝率 ──
content.push(heading('4. アイテムセット勝率'));
const itemRows = [
  new TableRow({ children: [headerCell('セット', 2000), headerCell('勝率', 1200), headerCell('勝', 1000), headerCell('負', 1000), headerCell('引分', 1000)] }),
];
for (const [name, stats] of itemEntries) {
  const s = stats as any;
  itemRows.push(new TableRow({ children: [
    cell(ITEM_JP[name] || name), cell(`${s.rate}%`), cell(`${s.wins}`), cell(`${s.losses}`), cell(`${s.draws}`),
  ] }));
}
content.push(new Table({ rows: itemRows, width: { size: 6200, type: WidthType.DXA } }));
content.push(new Paragraph({ children: [], spacing: { after: 200 } }));

// ── 5. デッキ勝率 TOP15 / BOTTOM15 ──
content.push(heading('5. デッキ勝率 TOP15'));
function deckTable(entries: [string, any][]): Table {
  const rows = [
    new TableRow({ children: [headerCell('#', 500), headerCell('デッキ', 3500), headerCell('勝率', 1000), headerCell('W', 700), headerCell('L', 700), headerCell('D', 700)] }),
  ];
  entries.forEach(([key, s], i) => {
    const parts = key.split('_');
    const facs = parts[0].split('+').map(f => FACTION_JP[f] || f).join('+');
    const item = ITEM_JP[parts[1]] || parts[1];
    rows.push(new TableRow({ children: [
      cell(`${i + 1}`), cell(`${facs} [${item}]`), cell(`${s.rate}%`), cell(`${s.wins}`), cell(`${s.losses}`), cell(`${s.draws}`),
    ] }));
  });
  return new Table({ rows, width: { size: 7100, type: WidthType.DXA } });
}
content.push(deckTable(deckEntries.slice(0, 15)));
content.push(new Paragraph({ children: [], spacing: { after: 200 } }));
content.push(heading('5b. デッキ勝率 BOTTOM15'));
content.push(deckTable(deckEntries.slice(-15).reverse()));
content.push(new Paragraph({ children: [], spacing: { after: 200 } }));

// ── 6. カード別統計: 召喚勝率 TOP/BOTTOM ──
content.push(heading('6. カード別 召喚勝率 TOP15'));
function cardTable(cards: CardStats[]): Table {
  const rows = [
    new TableRow({ children: [
      headerCell('#', 400), headerCell('カード名', 2400), headerCell('派閥', 1200),
      headerCell('C', 500), headerCell('勝率', 900), headerCell('召喚', 800),
      headerCell('被撃破', 800), headerCell('デッキ勝率', 1000),
    ] }),
  ];
  cards.forEach((c, i) => {
    const wr = pct(c.summonWins, c.summonWins + c.summonLosses);
    const dr = pct(c.inWinningDeck, c.inWinningDeck + c.inLosingDeck);
    rows.push(new TableRow({ children: [
      cell(`${i + 1}`), cell(c.cardName), cell(FACTION_JP[c.faction] || c.faction),
      cell(`${c.manaCost}`), cell(wr), cell(`${c.summons}`),
      cell(`${c.deaths}`), cell(dr),
    ] }));
  });
  return new Table({ rows, width: { size: 8000, type: WidthType.DXA } });
}
content.push(cardTable(byWinRate.slice(0, 15)));
content.push(new Paragraph({ children: [], spacing: { after: 200 } }));
content.push(heading('6b. カード別 召喚勝率 BOTTOM15'));
content.push(cardTable(byWinRate.slice(-15).reverse()));
content.push(new Paragraph({ children: [], spacing: { after: 200 } }));

// ── 7. カード別統計: デッキ含有勝率 TOP/BOTTOM ──
content.push(heading('7. カード別 デッキ含有勝率 TOP15'));
content.push(para('※そのカードがデッキに含まれている（召喚の有無問わず）試合の勝率'));
content.push(cardTable(byDeckRate.slice(0, 15)));
content.push(new Paragraph({ children: [], spacing: { after: 200 } }));
content.push(heading('7b. カード別 デッキ含有勝率 BOTTOM15'));
content.push(cardTable(byDeckRate.slice(-15).reverse()));
content.push(new Paragraph({ children: [], spacing: { after: 200 } }));

// ── 8. 派閥別全カード一覧 ──
content.push(heading('8. 派閥別 全カード一覧'));
for (const faction of factions) {
  content.push(heading(`${FACTION_JP[faction]}`, HeadingLevel.HEADING_2));
  const fCards = Object.values(cardStats)
    .filter(c => c.faction === faction)
    .sort((a, b) => a.manaCost - b.manaCost || a.cardName.localeCompare(b.cardName));
  const rows = [
    new TableRow({ children: [
      headerCell('カード名', 2400), headerCell('C', 500),
      headerCell('召喚', 800), headerCell('召喚勝率', 1000),
      headerCell('被撃破', 800), headerCell('デッキ勝率', 1000),
    ] }),
  ];
  for (const c of fCards) {
    const wr = pct(c.summonWins, c.summonWins + c.summonLosses);
    const dr = pct(c.inWinningDeck, c.inWinningDeck + c.inLosingDeck);
    rows.push(new TableRow({ children: [
      cell(c.cardName), cell(`${c.manaCost}`),
      cell(`${c.summons}`), cell(wr),
      cell(`${c.deaths}`), cell(dr),
    ] }));
  }
  content.push(new Table({ rows, width: { size: 6500, type: WidthType.DXA } }));
  content.push(new Paragraph({ children: [], spacing: { after: 150 } }));
}

// ── 9. ターン分布 ──
content.push(heading('9. ターン分布'));
const turnBuckets: Record<string, number> = {};
for (const t of turns) {
  const bucket = `${Math.floor((t - 1) / 3) * 3 + 1}-${Math.floor((t - 1) / 3) * 3 + 3}`;
  turnBuckets[bucket] = (turnBuckets[bucket] || 0) + 1;
}
const turnRows = [
  new TableRow({ children: [headerCell('ターン帯', 1500), headerCell('試合数', 1000), headerCell('割合', 1000)] }),
];
for (const [bucket, count] of Object.entries(turnBuckets)) {
  turnRows.push(new TableRow({ children: [
    cell(bucket), cell(`${count}`), cell(pct(count, totalGames)),
  ] }));
}
content.push(new Table({ rows: turnRows, width: { size: 3500, type: WidthType.DXA } }));

// ========================================
// 出力
// ========================================
const doc = new Document({
  sections: [{ children: content }],
  styles: {
    default: {
      document: { run: { font: 'Meiryo', size: 20 } },
    },
  },
});

Packer.toBuffer(doc).then(buffer => {
  const outPath = 'simulation-report.docx';
  writeFileSync(outPath, buffer);
  console.log(`レポート出力: ${outPath}`);
});
