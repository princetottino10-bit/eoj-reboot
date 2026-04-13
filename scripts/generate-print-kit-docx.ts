/**
 * 印刷用カードキット生成スクリプト（Word版）
 * 実行: npx vite-node scripts/generate-print-kit-docx.ts
 * 出力: print-kit.docx
 */

import { V2_CHARACTERS } from '../src/data/cards-v2';
import { ITEM_SET_A, ITEM_SET_B, ITEM_SET_C, ITEM_SET_D } from '../src/data/cards';
import type { CharacterCard, ItemCard } from '../src/types/card';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle,
  PageBreak, ShadingType, TableLayoutType,
  convertMillimetersToTwip, PageOrientation,
} from 'docx';
import * as fs from 'fs';

// ========================================
// 定数
// ========================================

const FACTION_LABELS: Record<string, string> = {
  aggro: 'アグロ', tank: 'タンク', control: 'コントロール',
  synergy: 'シナジー', snipe: 'スナイプ', trick: 'トリック',
};
const FACTION_COLORS: Record<string, string> = {
  aggro: 'c0392b', tank: '2980b9', control: '8e44ad',
  synergy: '27ae60', snipe: 'd35400', trick: '7f8c8d',
};
const ELEMENT_LABELS: Record<string, string> = {
  faust: '拳', geist: '念', licht: '光', nacht: '闇', nicht: '虚',
};
const ELEMENT_COLORS: Record<string, string> = {
  faust: 'e74c3c', geist: '3498db', licht: 'f1c40f', nacht: '9b59b6', nicht: '95a5a6',
};
const RANGE_LABELS: Record<string, string> = {
  front1: '前1', front_back: '前後', front2_line: '前2直線',
  front_row: '前列', snipe: '狙撃', cross: '十字',
  front_left: '前左', front_right: '前右', magic: '全域',
};
const KEYWORD_LABELS: Record<string, string> = {
  protection: '防護', dodge: '回避', piercing: '貫通', quickness: '先制',
  cover: 'カバー', immovable: '不動', fortress: '要塞', stealth: '隠密',
};
const KEYWORD_DESC: Record<string, string> = {
  protection: 'ダメージ-1（最低0）。消費しない。',
  dodge: '物理攻撃を1回無効化。消費。',
  piercing: '防護・回避を無視。',
  quickness: '反撃時、先にダメージ。',
  cover: '隣接味方への攻撃を代わりに受ける。',
  immovable: '押し出し・引き寄せ無効。',
  fortress: '自分から攻撃不可、反撃のみ。',
  stealth: '攻撃時、常にB位置扱い。',
};

const mm = convertMillimetersToTwip;
const FONT = 'Yu Gothic';
const CARD_W = 63; // mm
const CARD_H = 88; // mm

function vpFromCost(cost: number): number {
  if (cost <= 2) return 1;
  if (cost <= 4) return 2;
  return 3;
}

// ========================================
// ユーティリティ
// ========================================

function text(t: string, opts: Partial<{ bold: boolean; size: number; color: string; font: string }> = {}): TextRun {
  return new TextRun({
    text: t,
    bold: opts.bold,
    size: opts.size ? opts.size * 2 : undefined, // half-points
    color: opts.color,
    font: opts.font ?? FONT,
  });
}

function para(runs: TextRun[], opts: Partial<{ align: (typeof AlignmentType)[keyof typeof AlignmentType]; spacing: { before?: number; after?: number } }> = {}): Paragraph {
  return new Paragraph({
    children: runs,
    alignment: opts.align,
    spacing: opts.spacing,
  });
}

const THIN_BORDER = { style: BorderStyle.SINGLE, size: 1, color: '999999' };
const NO_BORDER = { style: BorderStyle.NONE, size: 0 };
const ALL_BORDERS = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };

function cardCell(children: Paragraph[], shading?: string): TableCell {
  return new TableCell({
    children,
    width: { size: mm(CARD_W), type: WidthType.DXA },
    borders: ALL_BORDERS,
    shading: shading ? { type: ShadingType.SOLID, fill: shading, color: shading } : undefined,
  });
}

// ========================================
// ルールサマリー
// ========================================

function buildRulesSection(): Paragraph[] {
  const p: Paragraph[] = [];

  p.push(new Paragraph({
    children: [text('異能学園総選挙 — ルールサマリー', { bold: true, size: 18 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }));

  const h2 = (t: string) => new Paragraph({
    children: [text(t, { bold: true, size: 13 })],
    spacing: { before: 200, after: 80 },
  });
  const bullet = (t: string) => para([text(t, { size: 9 })], { spacing: { after: 40 } });
  const body = (t: string) => para([text(t, { size: 9 })], { spacing: { after: 60 } });

  p.push(h2('勝利条件'));
  p.push(bullet('・VP勝利: 15VP到達で即座に勝利'));
  p.push(bullet('・5マス占拠: ターン終了時、盤面9マス中5マス以上を占拠していれば勝利'));
  p.push(bullet('・タイムアウト: 50ターン経過でVP差→占拠数差→引分'));

  p.push(h2('ターンの流れ'));
  p.push(bullet('1. マナ+2（毎ターン自動）'));
  p.push(bullet('2. アクション: 召喚（最大2体/ターン、2体目は+1マナ）、攻撃、再行動、アイテム使用'));
  p.push(bullet('3. ターン終了時: 5マス占拠チェック'));

  p.push(h2('VP獲得'));
  p.push(bullet('・C1〜C2 → 1VP / C3〜C4 → 2VP / C5 → 3VP'));
  p.push(bullet('・撃破時にマナ+1'));

  p.push(h2('属性ボーナス'));
  p.push(body('キャラの属性とマスの属性が一致 → HP+1（虚属性は補正なし）'));

  p.push(h2('B位置（ブラインド）'));
  p.push(body('カードごとに設定された死角方向。B位置から攻撃するとダメージ+1、反撃を受けない。'));
  p.push(bullet('・back = 背面のみ（物理デフォルト）'));
  p.push(bullet('・all = 全方向死角（魔法デフォルト）'));
  p.push(bullet('・sides = 左右 / back_sides = 背面+左右 / none = 死角なし'));

  p.push(h2('照準（カード効果で付与）'));
  p.push(body('照準が付いた敵への攻撃: ATK+1、反撃を受けない。スナイプ派閥のキャラが攻撃した時に消費。'));
  p.push(body('※ B位置は「位置取り」で作る盤面スキル。照準は「カード効果」で付与する使い切りデバフ。'));

  p.push(h2('キーワード一覧'));
  for (const [k, label] of Object.entries(KEYWORD_LABELS)) {
    p.push(para([
      text(`【${label}】`, { bold: true, size: 9 }),
      text(` ${KEYWORD_DESC[k] || ''}`, { size: 9 }),
    ], { spacing: { after: 30 } }));
  }

  p.push(h2('デッキ構築'));
  p.push(body('派閥1つ（12枚）+ アイテムセット1つ（6枚）= 18枚'));

  return p;
}

// ========================================
// キャラカード生成
// ========================================

function buildCharCardParagraphs(card: CharacterCard): Paragraph[] {
  const faction = FACTION_LABELS[card.faction] || card.faction;
  const fColor = FACTION_COLORS[card.faction] || '333333';
  const element = ELEMENT_LABELS[card.element] || card.element;
  const range = RANGE_LABELS[card.attackRange] || card.attackRange;
  const atkType = card.attackType === 'magic' ? '魔' : '物';
  const ps: Paragraph[] = [];

  // Header: cost + name + element
  ps.push(para([
    text(`C${card.manaCost} `, { bold: true, size: 9, color: 'FFFFFF' }),
    text(card.name, { bold: true, size: 9, color: 'FFFFFF' }),
    text(` [${element}]`, { size: 8, color: 'FFFFFF' }),
  ]));

  // Stats
  const vp = vpFromCost(card.manaCost);
  ps.push(para([
    text(`HP${card.hp} ATK${card.atk} 再${card.activateCost} | ${range} ${atkType} | ${vp}VP`, { size: 7 }),
  ], { spacing: { before: 20, after: 20 } }));

  // Keywords
  if (card.keywords.length > 0) {
    const kwRuns = card.keywords.map(k =>
      text(`【${KEYWORD_LABELS[k] || k}】`, { bold: true, size: 7, color: '2980b9' })
    );
    ps.push(para(kwRuns, { spacing: { after: 20 } }));
  }

  // Effects
  const effectTexts = card.effects
    .map(e => e.description || '')
    .filter(d => d.length > 0);
  if (effectTexts.length > 0) {
    for (const et of effectTexts) {
      ps.push(para([text(et, { size: 7 })], { spacing: { after: 10 } }));
    }
  } else {
    ps.push(para([text('— バニラ —', { size: 7, color: '999999' })], { spacing: { after: 10 } }));
  }

  // Footer
  ps.push(para([text(faction, { size: 6, color: '999999' })], {
    align: AlignmentType.RIGHT,
    spacing: { before: 10 },
  }));

  return ps;
}

function buildCharCardCell(card: CharacterCard): TableCell {
  const fColor = FACTION_COLORS[card.faction] || '333333';
  const ps = buildCharCardParagraphs(card);

  // First paragraph gets colored background via cell shading on a nested table
  // Use a simpler approach: color the first paragraph text, add a shading line
  return new TableCell({
    children: ps,
    width: { size: mm(CARD_W), type: WidthType.DXA },
    borders: ALL_BORDERS,
    shading: { type: ShadingType.SOLID, fill: 'FFFFFF', color: 'FFFFFF' },
  });
}

function buildCharCardHeaderCell(card: CharacterCard): TableCell {
  const fColor = FACTION_COLORS[card.faction] || '333333';
  const element = ELEMENT_LABELS[card.element] || card.element;
  return new TableCell({
    children: [
      para([
        text(`C${card.manaCost} `, { bold: true, size: 9, color: 'FFFFFF' }),
        text(card.name, { bold: true, size: 9, color: 'FFFFFF' }),
        text(` [${element}]`, { size: 8, color: 'FFFFFF' }),
      ]),
    ],
    width: { size: mm(CARD_W), type: WidthType.DXA },
    shading: { type: ShadingType.SOLID, fill: fColor, color: fColor },
    borders: { top: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER, bottom: NO_BORDER },
  });
}

function buildCharCardBodyCell(card: CharacterCard): TableCell {
  const range = RANGE_LABELS[card.attackRange] || card.attackRange;
  const atkType = card.attackType === 'magic' ? '魔' : '物';
  const faction = FACTION_LABELS[card.faction] || card.faction;
  const ps: Paragraph[] = [];

  const vp = vpFromCost(card.manaCost);
  ps.push(para([
    text(`HP${card.hp} ATK${card.atk} 再${card.activateCost} | ${range} ${atkType} | ${vp}VP`, { size: 7 }),
  ], { spacing: { after: 30 } }));

  if (card.keywords.length > 0) {
    for (const k of card.keywords) {
      ps.push(para([
        text(`【${KEYWORD_LABELS[k] || k}】`, { bold: true, size: 7, color: '2980b9' }),
        text(KEYWORD_DESC[k] || '', { size: 7, color: '2980b9' }),
      ], { spacing: { after: 10 } }));
    }
  }

  const effectTexts = card.effects.map(e => e.description || '').filter(Boolean);
  if (effectTexts.length > 0) {
    for (const et of effectTexts) {
      ps.push(para([text(et, { size: 7 })], { spacing: { after: 10 } }));
    }
  } else {
    ps.push(para([text('— バニラ —', { size: 7, color: '999999' })]));
  }

  ps.push(para([text(faction, { size: 6, color: '999999' })], {
    align: AlignmentType.RIGHT,
  }));

  return new TableCell({
    children: ps,
    width: { size: mm(CARD_W), type: WidthType.DXA },
    borders: { top: NO_BORDER, left: THIN_BORDER, right: THIN_BORDER, bottom: THIN_BORDER },
  });
}

function buildCharacterPages(): (Paragraph | Table)[] {
  const factions = ['aggro', 'tank', 'control', 'synergy', 'snipe', 'trick'] as const;
  const elements: (Paragraph | Table)[] = [];

  for (const faction of factions) {
    const cards = V2_CHARACTERS.filter(c => c.faction === faction);
    const fLabel = FACTION_LABELS[faction];
    const fColor = FACTION_COLORS[faction];

    // Faction heading
    elements.push(new Paragraph({
      children: [new PageBreak()],
    }));
    elements.push(new Paragraph({
      children: [text(`${fLabel}（${cards.length}枚）`, { bold: true, size: 16, color: fColor })],
      spacing: { after: 100 },
    }));

    // Cards in rows of 3
    for (let i = 0; i < cards.length; i += 3) {
      const chunk = cards.slice(i, i + 3);

      // Header row (colored)
      const headerRow = new TableRow({
        children: chunk.map(c => buildCharCardHeaderCell(c)),
      });

      // Body row
      const bodyRow = new TableRow({
        children: chunk.map(c => buildCharCardBodyCell(c)),
      });

      const table = new Table({
        rows: [headerRow, bodyRow],
        width: { size: mm(CARD_W * 3 + 2), type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
      });

      elements.push(table);
      elements.push(para([], { spacing: { after: 60 } }));
    }
  }

  return elements;
}

// ========================================
// アイテムカード生成
// ========================================

function buildItemPages(): (Paragraph | Table)[] {
  const sets = [
    { label: 'アイテムセットA（アグロ用）', items: ITEM_SET_A },
    { label: 'アイテムセットB（タンク用）', items: ITEM_SET_B },
    { label: 'アイテムセットC（コントロール用）', items: ITEM_SET_C },
    { label: 'アイテムセットD（シナジー/スナイプ/トリック用）', items: ITEM_SET_D },
  ];
  const elements: (Paragraph | Table)[] = [];

  elements.push(new Paragraph({ children: [new PageBreak()] }));
  elements.push(new Paragraph({
    children: [text('アイテムカード', { bold: true, size: 16 })],
    spacing: { after: 100 },
  }));

  for (const set of sets) {
    elements.push(para([text(set.label, { bold: true, size: 11 })], { spacing: { before: 100, after: 60 } }));

    // Unique items only
    const unique = [...new Map(set.items.map(i => [i.id, i])).values()];

    for (let i = 0; i < unique.length; i += 3) {
      const chunk = unique.slice(i, i + 3);

      const headerRow = new TableRow({
        children: chunk.map(item => new TableCell({
          children: [para([
            text(`C${item.manaCost} `, { bold: true, size: 9, color: 'FFFFFF' }),
            text(item.name + (item.freeAction ? ' [フリー]' : ''), { bold: true, size: 9, color: 'FFFFFF' }),
          ])],
          width: { size: mm(CARD_W), type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, fill: '7f8c8d', color: '7f8c8d' },
          borders: { top: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER, bottom: NO_BORDER },
        })),
      });

      const bodyRow = new TableRow({
        children: chunk.map(item => {
          const desc = item.effects.map(e => e.description || '').filter(Boolean).join('\n') || item.description || '—';
          return new TableCell({
            children: [para([text(desc, { size: 8 })])],
            width: { size: mm(CARD_W), type: WidthType.DXA },
            borders: { top: NO_BORDER, left: THIN_BORDER, right: THIN_BORDER, bottom: THIN_BORDER },
          });
        }),
      });

      elements.push(new Table({
        rows: [headerRow, bodyRow],
        width: { size: mm(CARD_W * 3 + 2), type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
      }));
      elements.push(para([], { spacing: { after: 40 } }));
    }
  }

  return elements;
}

// ========================================
// 属性盤
// ========================================

function shuffleWithSeed(arr: string[], seed: number): string[] {
  const a = [...arr];
  let s = seed;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildElementBoards(): (Paragraph | Table)[] {
  const elems = ['虚', '拳', '拳', '念', '念', '光', '光', '闇', '闇'];
  const colorMap: Record<string, string> = {
    '拳': 'e74c3c', '念': '3498db', '光': 'f1c40f', '闇': '9b59b6', '虚': '95a5a6',
  };
  const textColorMap: Record<string, string> = {
    '拳': 'FFFFFF', '念': 'FFFFFF', '光': '333333', '闇': 'FFFFFF', '虚': 'FFFFFF',
  };

  const elements: (Paragraph | Table)[] = [];
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  elements.push(new Paragraph({
    children: [text('属性盤（ランダム8パターン）', { bold: true, size: 14 })],
    spacing: { after: 40 },
  }));
  elements.push(para([text('ゲーム開始時、いずれかの盤を選ぶ（虚×1 拳×2 念×2 光×2 闇×2）', { size: 9 })], { spacing: { after: 80 } }));

  for (let s = 0; s < 8; s++) {
    const shuffled = shuffleWithSeed(elems, 20260404 + s * 7);
    const rows: TableRow[] = [];
    for (let r = 0; r < 3; r++) {
      const cells: TableCell[] = [];
      for (let c = 0; c < 3; c++) {
        const el = shuffled[r * 3 + c];
        const bg = colorMap[el] || '999999';
        const fg = textColorMap[el] || 'FFFFFF';
        cells.push(new TableCell({
          children: [para([text(el, { bold: true, size: 14, color: fg })], { align: AlignmentType.CENTER })],
          width: { size: mm(18), type: WidthType.DXA },
          shading: { type: ShadingType.SOLID, fill: bg, color: bg },
          borders: ALL_BORDERS,
        }));
      }
      rows.push(new TableRow({ children: cells }));
    }

    elements.push(para([text(`パターン ${s + 1}`, { bold: true, size: 9 })], { spacing: { before: 60, after: 20 } }));
    elements.push(new Table({
      rows,
      width: { size: mm(54), type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
    }));
  }

  return elements;
}

// ========================================
// フィールドマット
// ========================================

function buildFieldMat(): (Paragraph | Table)[] {
  const defaultElements = [
    ['faust', 'geist', 'licht'],
    ['nacht', 'nicht', 'faust'],
    ['geist', 'licht', 'nacht'],
  ];
  const coords = [
    ['A1', 'A2', 'A3'],
    ['B1', 'B2', 'B3'],
    ['C1', 'C2', 'C3'],
  ];

  const CELL_SIZE = 80; // mm (少し縮めてA4に収まるように)

  function fieldCell(r: number, c: number): TableCell {
    const elem = defaultElements[r][c];
    const label = ELEMENT_LABELS[elem] || elem;
    const color = ELEMENT_COLORS[elem] || '999999';
    const fg = elem === 'licht' ? '333333' : 'FFFFFF';

    return new TableCell({
      children: [
        para([text(label, { bold: true, size: 24, color: fg })], {
          align: AlignmentType.CENTER,
          spacing: { before: 40, after: 20 },
        }),
        para([text(coords[r][c], { size: 9, color: '999999' })], {
          align: AlignmentType.RIGHT,
        }),
      ],
      width: { size: mm(CELL_SIZE), type: WidthType.DXA },
      shading: { type: ShadingType.SOLID, fill: color, color: color },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 3, color: '333333' },
        bottom: { style: BorderStyle.SINGLE, size: 3, color: '333333' },
        left: { style: BorderStyle.SINGLE, size: 3, color: '333333' },
        right: { style: BorderStyle.SINGLE, size: 3, color: '333333' },
      },
    });
  }

  const elements: (Paragraph | Table)[] = [];

  // ページ1: 上段 (rows 0-1)
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  elements.push(para([text('フィールドマット — 上段', { bold: true, size: 12 })], {
    align: AlignmentType.CENTER, spacing: { after: 40 },
  }));
  elements.push(para([text('▼ P1（後手）前方 ▼', { bold: true, size: 12, color: 'c0392b' })], {
    align: AlignmentType.CENTER, spacing: { after: 60 },
  }));

  const topRows: TableRow[] = [];
  for (let r = 0; r < 2; r++) {
    topRows.push(new TableRow({
      children: [fieldCell(r, 0), fieldCell(r, 1), fieldCell(r, 2)],
      height: { value: mm(CELL_SIZE), rule: 'exact' as any },
    }));
  }
  elements.push(new Table({
    rows: topRows,
    width: { size: mm(CELL_SIZE * 3), type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
  }));
  elements.push(para([text('↓ 下段と接続 ↓', { size: 8, color: 'CCCCCC' })], {
    align: AlignmentType.CENTER, spacing: { before: 40 },
  }));

  // ページ2: 下段 (row 2)
  elements.push(new Paragraph({ children: [new PageBreak()] }));
  elements.push(para([text('フィールドマット — 下段', { bold: true, size: 12 })], {
    align: AlignmentType.CENTER, spacing: { after: 40 },
  }));
  elements.push(para([text('↑ 上段と接続 ↑', { size: 8, color: 'CCCCCC' })], {
    align: AlignmentType.CENTER, spacing: { after: 40 },
  }));

  const bottomRow = new TableRow({
    children: [fieldCell(2, 0), fieldCell(2, 1), fieldCell(2, 2)],
    height: { value: mm(CELL_SIZE), rule: 'exact' as any },
  });
  elements.push(new Table({
    rows: [bottomRow],
    width: { size: mm(CELL_SIZE * 3), type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
  }));
  elements.push(para([text('▲ P0（先手）前方 ▲', { bold: true, size: 12, color: '2980b9' })], {
    align: AlignmentType.CENTER, spacing: { before: 60 },
  }));

  return elements;
}

// ========================================
// マーカー（トークン）
// ========================================

interface MarkerDef {
  label: string;
  color: string;   // fill
  fg: string;       // text
  count: number;
}

function buildMarkers(): (Paragraph | Table)[] {
  const markers: MarkerDef[] = [
    { label: 'ATK+1',  color: 'e74c3c', fg: 'FFFFFF', count: 12 },
    { label: 'ATK-1',  color: '2c3e50', fg: 'FFFFFF', count: 8 },
    { label: 'HP+1',   color: '27ae60', fg: 'FFFFFF', count: 8 },
    { label: '防護',   color: '2980b9', fg: 'FFFFFF', count: 8 },
    { label: '回避',   color: '1abc9c', fg: 'FFFFFF', count: 6 },
    { label: '貫通',   color: 'c0392b', fg: 'FFFFFF', count: 6 },
    { label: '先制',   color: 'f39c12', fg: 'FFFFFF', count: 4 },
    { label: '照準',   color: 'd35400', fg: 'FFFFFF', count: 8 },
    { label: '封印',   color: '8e44ad', fg: 'FFFFFF', count: 4 },
    { label: '洗脳',   color: '9b59b6', fg: 'FFFFFF', count: 4 },
    { label: '再+1',   color: '7f8c8d', fg: 'FFFFFF', count: 4 },
    { label: 'VP 1',   color: 'f1c40f', fg: '333333', count: 10 },
    { label: 'VP 2',   color: 'f1c40f', fg: '333333', count: 6 },
    { label: 'VP 3',   color: 'f1c40f', fg: '333333', count: 4 },
  ];

  const COLS = 6;
  const TOKEN_SIZE = 25; // mm
  const elements: (Paragraph | Table)[] = [];

  elements.push(new Paragraph({ children: [new PageBreak()] }));
  elements.push(new Paragraph({
    children: [text('マーカー（切り取って使用）', { bold: true, size: 14 })],
    spacing: { after: 60 },
  }));

  // Flatten all markers into individual tokens
  const allTokens: MarkerDef[] = [];
  for (const m of markers) {
    for (let i = 0; i < m.count; i++) allTokens.push(m);
  }

  // Build rows of COLS tokens
  for (let i = 0; i < allTokens.length; i += COLS) {
    const chunk = allTokens.slice(i, i + COLS);
    const cells: TableCell[] = chunk.map(t => new TableCell({
      children: [para([text(t.label, { bold: true, size: 11, color: t.fg })], { align: AlignmentType.CENTER })],
      width: { size: mm(TOKEN_SIZE), type: WidthType.DXA },
      shading: { type: ShadingType.SOLID, fill: t.color, color: t.color },
      borders: {
        top: { style: BorderStyle.DASHED, size: 1, color: '999999' },
        bottom: { style: BorderStyle.DASHED, size: 1, color: '999999' },
        left: { style: BorderStyle.DASHED, size: 1, color: '999999' },
        right: { style: BorderStyle.DASHED, size: 1, color: '999999' },
      },
    }));

    // Pad with empty cells
    while (cells.length < COLS) {
      cells.push(new TableCell({
        children: [para([])],
        width: { size: mm(TOKEN_SIZE), type: WidthType.DXA },
        borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
      }));
    }

    elements.push(new Table({
      rows: [new TableRow({ children: cells, height: { value: mm(TOKEN_SIZE), rule: 'exact' as any } })],
      width: { size: mm(TOKEN_SIZE * COLS), type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
    }));
  }

  // Legend
  elements.push(para([], { spacing: { after: 40 } }));
  const legend = markers.map(m => `${m.label}×${m.count}`).join('  ');
  elements.push(para([text(legend, { size: 8, color: '666666' })], { spacing: { before: 40 } }));

  return elements;
}

// ========================================
// メイン: ドキュメント生成
// ========================================

async function main() {
  const sections: (Paragraph | Table)[] = [];

  // 1. ルールサマリー
  sections.push(...buildRulesSection());

  // 2. キャラカード
  sections.push(...buildCharacterPages());

  // 3. アイテムカード
  sections.push(...buildItemPages());

  // 4. 属性盤
  sections.push(...buildElementBoards());

  // 5. フィールドマット
  sections.push(...buildFieldMat());

  // 6. マーカー
  sections.push(...buildMarkers());

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) },
        },
      },
      children: sections,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync('print-kit.docx', buffer);
  console.log('✅ print-kit.docx を生成しました。');
}

main().catch(e => { console.error(e); process.exit(1); });
