const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat,
} = require('docx');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'temp-cards.json'), 'utf-8'));

// ========================================
// Label maps
// ========================================
const FACTION_LABELS = {
  aggro: 'A: アグロ（速攻）',
  tank: 'B: タンク（耐久）',
  control: 'C: コントロール（妨害）',
  synergy: 'D: シナジー（連携）',
  snipe: 'E: スナイプ（狙撃）',
  trick: 'F: トリック（撹乱）',
  items: 'アイテムカード',
};

const ELEMENT_LABELS = {
  faust: '拳(ファウスト)',
  geist: '念(ガイスト)',
  licht: '光(リヒト)',
  nacht: '闇(ナハト)',
  nicht: '虚(ニヒト)',
};

const RANGE_LABELS = {
  front1: '正面1',
  front_back: '前後1',
  front2_line: '直線2',
  front_row: '正面行3',
  magic: '全域',
  snipe: '狙撃',
  cross: '十字',
  front_left: 'L字左',
  front_right: 'L字右',
};

const CLASS_LABELS = {
  combat: '戦闘科',
  '射撃': '射撃科',
  intel: '情報科',
  medic: '医療科',
  strategy: '戦略科',
};

const KEYWORD_LABELS = {
  protection: '防護',
  dodge: '回避',
  quickness: '先制',
  fortress: '要塞',
  piercing: '貫通',
  summoning_lock: '召喚制限',
  reflect: '反射',
  anchor: '不動',
  damage_link: 'D.リンク',
  cover: 'カバー',
  stealth: '隠密',
  pressure: '威圧',
};

// ========================================
// Styling constants
// ========================================
const FACTION_COLORS = {
  aggro: 'C0392B',
  tank: '2980B9',
  control: '8E44AD',
  synergy: '27AE60',
  snipe: 'D35400',
  trick: '7F8C8D',
  items: '2C3E50',
};

const borderThin = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin };
const noBorders = {
  top: { style: BorderStyle.NONE, size: 0 },
  bottom: { style: BorderStyle.NONE, size: 0 },
  left: { style: BorderStyle.NONE, size: 0 },
  right: { style: BorderStyle.NONE, size: 0 },
};

const cellMargins = { top: 40, bottom: 40, left: 80, right: 80 };

// Page: A4
const PAGE_W = 11906;
const MARGIN = 1134; // ~0.8 inch
const CONTENT_W = PAGE_W - MARGIN * 2; // 9638

// ========================================
// Helper: build a character card block
// ========================================
function buildCharCard(card, index) {
  const rows = [];
  const factionColor = FACTION_COLORS[card.faction] || '333333';

  // Header row: Name + Cost
  const costText = `C${card.manaCost} / aC${card.activateCost}`;
  rows.push(
    new TableRow({
      children: [
        new TableCell({
          borders,
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnSpan: 2,
          shading: { fill: factionColor, type: ShadingType.CLEAR },
          margins: cellMargins,
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: card.name, bold: true, color: 'FFFFFF', font: 'Meiryo', size: 22 }),
                new TextRun({ text: `　　${costText}`, color: 'FFFFFF', font: 'Meiryo', size: 18 }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // Stats row
  const element = ELEMENT_LABELS[card.element] || card.element;
  const range = RANGE_LABELS[card.attackRange] || card.attackRange;
  const atkType = card.attackType === 'magic' ? '魔法' : '物理';
  const cls = CLASS_LABELS[card.schoolClass] || card.schoolClass;
  const blind = card.blindPattern ? ` / 死角:${card.blindPattern}` : '';
  const statsText = `HP${card.hp} / ATK${card.atk}　｜　${element}　｜　${cls}　｜　${range} ${atkType}${blind}`;

  rows.push(
    new TableRow({
      children: [
        new TableCell({
          borders,
          width: { size: CONTENT_W, type: WidthType.DXA },
          columnSpan: 2,
          shading: { fill: 'F5F5F5', type: ShadingType.CLEAR },
          margins: cellMargins,
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: statsText, font: 'Meiryo', size: 18 }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // Keywords row (if any)
  if (card.keywords && card.keywords.length > 0) {
    const kwText = card.keywords.map(k => `【${KEYWORD_LABELS[k] || k}】`).join(' ');
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: CONTENT_W, type: WidthType.DXA },
            columnSpan: 2,
            shading: { fill: 'FFFDE7', type: ShadingType.CLEAR },
            margins: cellMargins,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: kwText, bold: true, font: 'Meiryo', size: 18, color: '795548' }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  }

  // Effects rows
  if (card.effects && card.effects.length > 0) {
    for (const eff of card.effects) {
      if (!eff.description) continue;
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              borders,
              width: { size: CONTENT_W, type: WidthType.DXA },
              columnSpan: 2,
              margins: cellMargins,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: eff.description, font: 'Meiryo', size: 18 }),
                  ],
                }),
              ],
            }),
          ],
        })
      );
    }
  } else {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: CONTENT_W, type: WidthType.DXA },
            columnSpan: 2,
            margins: cellMargins,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: '（効果なし）', font: 'Meiryo', size: 18, color: '999999', italics: true }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  }

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows,
  });
}

// ========================================
// Helper: build an item card block
// ========================================
function buildItemCard(card) {
  const rows = [];

  rows.push(
    new TableRow({
      children: [
        new TableCell({
          borders,
          width: { size: CONTENT_W, type: WidthType.DXA },
          shading: { fill: '2C3E50', type: ShadingType.CLEAR },
          margins: cellMargins,
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: card.name, bold: true, color: 'FFFFFF', font: 'Meiryo', size: 22 }),
                new TextRun({ text: `　　C${card.manaCost}`, color: 'FFFFFF', font: 'Meiryo', size: 18 }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  if (card.effects && card.effects.length > 0) {
    for (const eff of card.effects) {
      if (!eff.description) continue;
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              borders,
              width: { size: CONTENT_W, type: WidthType.DXA },
              margins: cellMargins,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: eff.description, font: 'Meiryo', size: 18 }),
                  ],
                }),
              ],
            }),
          ],
        })
      );
    }
  }

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows,
  });
}

// ========================================
// Build document sections
// ========================================
const children = [];

// Title
children.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [
      new TextRun({ text: '異能学園総選挙', bold: true, font: 'Meiryo', size: 40 }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [
      new TextRun({ text: 'カードリスト', font: 'Meiryo', size: 32 }),
    ],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [
      new TextRun({ text: `${new Date().toISOString().split('T')[0]} 版`, font: 'Meiryo', size: 20, color: '888888' }),
    ],
  }),
);

// Summary table
const factionOrder = ['aggro', 'tank', 'control', 'synergy', 'snipe', 'trick'];
const summaryRows = [
  new TableRow({
    children: ['陣営', 'キャラ数', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6'].map(h =>
      new TableCell({
        borders,
        width: { size: Math.floor(CONTENT_W / 8), type: WidthType.DXA },
        shading: { fill: '34495E', type: ShadingType.CLEAR },
        margins: cellMargins,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', font: 'Meiryo', size: 16 })] })],
      })
    ),
  }),
];

for (const fKey of factionOrder) {
  const cards = data[fKey] || [];
  const costCounts = [1, 2, 3, 4, 5, 6].map(c => cards.filter(cd => cd.manaCost === c).length);
  summaryRows.push(
    new TableRow({
      children: [
        FACTION_LABELS[fKey].split('（')[0],
        String(cards.length),
        ...costCounts.map(String),
      ].map((t, i) =>
        new TableCell({
          borders,
          width: { size: Math.floor(CONTENT_W / 8), type: WidthType.DXA },
          margins: cellMargins,
          children: [new Paragraph({ alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.CENTER, children: [new TextRun({ text: t, font: 'Meiryo', size: 16 })] })],
        })
      ),
    })
  );
}

children.push(
  new Paragraph({ spacing: { before: 200, after: 200 }, children: [new TextRun({ text: '陣営別カード枚数', bold: true, font: 'Meiryo', size: 24 })] }),
  new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: Array(8).fill(Math.floor(CONTENT_W / 8)),
    rows: summaryRows,
  }),
);

// Each faction
for (const fKey of factionOrder) {
  const cards = data[fKey] || [];
  children.push(new Paragraph({ children: [new PageBreak()] }));
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 300 },
      children: [
        new TextRun({ text: FACTION_LABELS[fKey], bold: true, font: 'Meiryo', size: 30, color: FACTION_COLORS[fKey] }),
        new TextRun({ text: `　（${cards.length}枚）`, font: 'Meiryo', size: 22, color: '888888' }),
      ],
    })
  );

  for (let i = 0; i < cards.length; i++) {
    children.push(buildCharCard(cards[i], i));
    children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
  }
}

// Items
const items = data.items || [];
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(
  new Paragraph({
    spacing: { before: 200, after: 300 },
    children: [
      new TextRun({ text: 'アイテムカード', bold: true, font: 'Meiryo', size: 30, color: '2C3E50' }),
      new TextRun({ text: `　（${items.length}枚）`, font: 'Meiryo', size: 22, color: '888888' }),
    ],
  })
);

for (let i = 0; i < items.length; i++) {
  children.push(buildItemCard(items[i]));
  children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
}

// ========================================
// Create document
// ========================================
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: 'Meiryo', size: 20 } },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: 11906, height: 16838 }, // A4
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: '異能学園総選挙 カードリスト', font: 'Meiryo', size: 16, color: 'AAAAAA' })],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'Page ', font: 'Meiryo', size: 16, color: 'AAAAAA' }),
              new TextRun({ children: [PageNumber.CURRENT], font: 'Meiryo', size: 16, color: 'AAAAAA' }),
            ],
          }),
        ],
      }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buffer => {
  const outPath = path.join(__dirname, '..', 'docs', 'cardlist.docx');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buffer);
  console.log(`カードリスト生成完了: ${outPath}`);
  console.log(`キャラ: ${factionOrder.reduce((s, f) => s + (data[f] || []).length, 0)}枚, アイテム: ${items.length}枚`);
});
