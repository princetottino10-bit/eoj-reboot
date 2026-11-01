/**
 * 印刷用カードキット生成スクリプト
 * 実行: npx vite-node scripts/generate-print-kit.ts
 * 出力: print-kit.html をブラウザで開いて印刷
 */

import { V2_CHARACTERS } from '../src/data/cards-v2';
import { ITEM_SET_A, ITEM_SET_B, ITEM_SET_C, ITEM_SET_D } from '../src/data/cards';
import type { CharacterCard, ItemCard } from '../src/types/card';
import * as fs from 'fs';

// ========================================
// 定数
// ========================================

const FACTION_LABELS: Record<string, string> = {
  aggro: 'アグロ',
  tank: 'タンク',
  control: 'コントロール',
  synergy: 'シナジー',
  snipe: 'スナイプ',
  trick: 'トリック',
};

const FACTION_COLORS: Record<string, string> = {
  aggro: '#c0392b',
  tank: '#2980b9',
  control: '#8e44ad',
  synergy: '#27ae60',
  snipe: '#d35400',
  trick: '#2c3e50',
};

const ELEMENT_LABELS: Record<string, string> = {
  faust: '拳',
  geist: '念',
  licht: '光',
  nacht: '闇',
  nicht: '虚',
};

const ELEMENT_COLORS: Record<string, string> = {
  faust: '#e74c3c',
  geist: '#3498db',
  licht: '#f1c40f',
  nacht: '#9b59b6',
  nicht: '#95a5a6',
};

const RANGE_LABELS: Record<string, string> = {
  front1: '前1',
  front_back: '前後',
  front2_line: '前2直線',
  front_row: '前列',
  magic: '魔法(任意)',
  snipe: '狙撃',
  cross: '十字',
  front_left: '前+左',
  front_right: '前+右',
};

const KEYWORD_LABELS: Record<string, string> = {
  protection: '防護',
  cover: 'カバー',
  piercing: '貫通',
  quickness: '先制',
  dodge: '回避',
  stealth: '隠密',
  anchor: '不動',
  fortress: '要塞',
};

const KEYWORD_DESC: Record<string, string> = {
  protection: 'ダメージ-1（最低0）。消費しない。',
  cover: '隣接味方への攻撃を代わりに受ける',
  piercing: '防護・回避を無視してダメージ',
  quickness: '反撃時、相手より先にダメージを与える',
  dodge: '物理攻撃を1回無効（消費）',
  stealth: '常にB位置扱いで攻撃',
  anchor: '押し出し・引き寄せ無効',
  fortress: '自分から攻撃不可、反撃のみ',
};

const BLIND_LABELS: Record<string, string> = {
  none: '死角なし',
  back: '背面',
  sides: '左右',
  back_sides: '背面+左右',
  all: '全方向死角',
};

// ========================================
// 攻撃範囲 / ブラインド ビジュアライズ（3×3グリッド）
// ========================================

function getAdjacentAtkOffsets(range: string): { r: number; c: number }[] {
  switch (range) {
    case 'front1':       return [{ r: -1, c: 0 }];
    case 'front_back':   return [{ r: -1, c: 0 }, { r: 1, c: 0 }];
    case 'front2_line':  return [{ r: -1, c: 0 }];
    case 'front_row':    return [{ r: -1, c: -1 }, { r: -1, c: 0 }, { r: -1, c: 1 }];
    case 'snipe':        return [{ r: -1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }];
    case 'cross':        return [{ r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }];
    case 'front_left':   return [{ r: -1, c: 0 }, { r: 0, c: -1 }];
    case 'front_right':  return [{ r: -1, c: 0 }, { r: 0, c: 1 }];
    case 'magic':        return [
      { r: -1, c: -1 }, { r: -1, c: 0 }, { r: -1, c: 1 },
      { r: 0, c: -1 }, { r: 0, c: 1 },
      { r: 1, c: -1 }, { r: 1, c: 0 }, { r: 1, c: 1 },
    ];
    default:             return [];
  }
}

function getBlindDirs(pattern: string): { r: number; c: number }[] {
  switch (pattern) {
    case 'none':       return [];
    case 'back':       return [{ r: 1, c: 0 }];
    case 'sides':      return [{ r: 0, c: -1 }, { r: 0, c: 1 }];
    case 'back_sides': return [{ r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }];
    case 'all':        return [{ r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }];
    default:           return [{ r: 1, c: 0 }];
  }
}

function hasExtendedRange(range: string): boolean {
  return range === 'front2_line' || range === 'snipe';
}

function gridToHtml(cells: { cls: string; label: string }[][], title: string): string {
  const classMap: Record<string, string> = {
    '': 'rg-empty', self: 'rg-self', atk: 'rg-atk', counter: 'rg-counter', blind: 'rg-blind',
  };
  let html = `<div class="grid-box"><div class="grid-title">${title}</div>`;
  html += '<table class="range-grid"><tr><td class="rg-dir" colspan="3">▲前</td></tr>';
  for (const row of cells) {
    html += '<tr>';
    for (const { cls, label } of row) {
      html += `<td class="${classMap[cls] || 'rg-empty'}">${label}</td>`;
    }
    html += '</tr>';
  }
  html += '</table></div>';
  return html;
}

function renderRangeGrids(attackRange: string, attackType: string, blindPattern?: string): string {
  const effectiveBlind = blindPattern ?? (attackType === 'magic' ? 'all' : 'back');
  const SIZE = 3, CY = 1, CX = 1;

  const atkOffsets = getAdjacentAtkOffsets(attackRange);
  const blindOffsets = getBlindDirs(effectiveBlind);
  const atkSet = new Set(atkOffsets.map(o => `${o.r},${o.c}`));
  const blindSet = new Set(blindOffsets.map(o => `${o.r},${o.c}`));

  // 攻撃グリッド（magicの場合、★を左下隅に配置して全域を示す）
  const isMagic = attackRange === 'magic';
  const selfR = isMagic ? SIZE - 1 : CY;
  const selfC = isMagic ? 0 : CX;
  const atkCells = Array.from({ length: SIZE }, (_, r) =>
    Array.from({ length: SIZE }, (_, c) => {
      if (r === selfR && c === selfC) return { cls: 'self', label: '★' };
      if (isMagic) return { cls: 'atk', label: '●' };
      const key = `${r - CY},${c - CX}`;
      if (atkSet.has(key)) return { cls: 'atk', label: '●' };
      return { cls: '', label: '' };
    })
  );

  // 反撃/Bグリッド（隣接4方向のみ）
  const defCells = Array.from({ length: SIZE }, (_, r) =>
    Array.from({ length: SIZE }, (_, c) => {
      if (r === CY && c === CX) return { cls: 'self', label: '★' };
      const dr = r - CY, dc = c - CX;
      const isAdj = Math.abs(dr) + Math.abs(dc) === 1;
      if (!isAdj) return { cls: '', label: '' };
      const key = `${dr},${dc}`;
      if (blindSet.has(key)) return { cls: 'blind', label: 'B' };
      if (atkSet.has(key)) return { cls: 'counter', label: '反' };
      return { cls: '', label: '' };
    })
  );

  let html = '<div class="range-pair">';
  html += gridToHtml(atkCells, '攻撃範囲');
  html += gridToHtml(defCells, '反撃/B');
  html += '</div>';
  if (hasExtendedRange(attackRange)) {
    const label = attackRange === 'front2_line' ? '＋前方1マス' : '＋各方向1マス';
    html += `<div class="range-ext">${label}</div>`;
  }
  return html;
}

// ========================================
// 属性盤ランダム生成
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

function renderElementBoards(): string {
  const elements = ['虚', '拳', '拳', '念', '念', '光', '光', '闇', '闇'];
  const colorMap: Record<string, string> = {
    '拳': '#e74c3c', '念': '#3498db', '光': '#f1c40f', '闇': '#9b59b6', '虚': '#95a5a6',
  };
  const textColor: Record<string, string> = {
    '拳': '#fff', '念': '#fff', '光': '#333', '闇': '#fff', '虚': '#fff',
  };

  let html = '';
  // 8枚の属性盤を生成（seed違い）
  for (let s = 0; s < 8; s++) {
    const shuffled = shuffleWithSeed(elements, 20260404 + s * 7);
    html += '<table class="elem-board">';
    for (let r = 0; r < 3; r++) {
      html += '<tr>';
      for (let c = 0; c < 3; c++) {
        const el = shuffled[r * 3 + c];
        const bg = colorMap[el];
        const fg = textColor[el];
        html += `<td style="background:${bg};color:${fg}">${el}</td>`;
      }
      html += '</tr>';
    }
    html += '</table>';
  }

  return `
    <div class="board-page page-break">
      <h2>属性盤（ランダム8パターン）</h2>
      <p>ゲーム開始時、いずれかの盤を選ぶ（虚×1 拳×2 念×2 光×2 闇×2）</p>
      <div class="elem-boards-grid">${html}</div>
      ${renderMarkersInline()}
    </div>`;
}

// ========================================
// フィールドマット生成（A4×4枚タイル）
// ========================================

function renderFieldMats(): string {
  // 属性配置: nicht×1 + faust×2 + geist×2 + licht×2 + nacht×2 = 9マス
  // デフォルト配置を印刷（ユーザーがタイルを入れ替えて使う）
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

  function cellHtml(r: number, c: number): string {
    const elem = defaultElements[r][c];
    const label = ELEMENT_LABELS[elem] || elem;
    const color = ELEMENT_COLORS[elem] || '#333';
    return `<td>
      <div class="cell-inner">
        <div class="cell-elem-badge" style="background:${color}">${label}</div>
        <span class="cell-coord">${coords[r][c]}</span>
      </div>
    </td>`;
  }

  // ページ1: 上2行 (row 0-1)
  let page1 = `
    <div class="field-tile-page page-break">
      <div>
        <div class="tile-label">フィールドマット — 上段（P1側から見て1-2列目）</div>
        <div class="field-direction p1">▼ P1（後手）前方 ▼</div>
        <table class="field-tile">`;
  for (let r = 0; r < 2; r++) {
    page1 += '<tr>';
    for (let c = 0; c < 3; c++) {
      page1 += cellHtml(r, c);
    }
    page1 += '</tr>';
  }
  page1 += `</table>
        <div class="tile-align-mark">↓ 下段と接続 ↓</div>
      </div>
    </div>`;

  // ページ2: 下1行 (row 2)
  let page2 = `
    <div class="field-tile-page page-break">
      <div>
        <div class="tile-label">フィールドマット — 下段（P0側から見て1列目）</div>
        <div class="tile-align-mark">↑ 上段と接続 ↑</div>
        <table class="field-tile">
          <tr>`;
  for (let c = 0; c < 3; c++) {
    page2 += cellHtml(2, c);
  }
  page2 += `</tr>
        </table>
        <div class="field-direction p0">▲ P0（先手）前方 ▲</div>
      </div>
    </div>`;

  return page1 + page2;
}

// ========================================
// マーカー（トークン）
// ========================================

const MARKER_DATA = [
  { label: 'ATK+1',  bg: '#e74c3c', count: 12 },
  { label: 'ATK-1',  bg: '#2c3e50', count: 8 },
  { label: 'HP+1',   bg: '#27ae60', count: 8 },
  { label: '防護',   bg: '#2980b9', count: 8 },
  { label: '回避',   bg: '#1abc9c', count: 6 },
  { label: '貫通',   bg: '#c0392b', count: 6 },
  { label: '先制',   bg: '#f39c12', count: 4 },
  { label: '照準',   bg: '#d35400', count: 8 },
  { label: '封印',   bg: '#8e44ad', count: 4 },
  { label: '洗脳',   bg: '#9b59b6', count: 4 },
  { label: '再+1',   bg: '#7f8c8d', count: 4 },
  { label: 'VP 1',   bg: '#f1c40f', count: 10, fg: '#333' },
  { label: 'VP 2',   bg: '#f1c40f', count: 6, fg: '#333' },
  { label: 'VP 3',   bg: '#f1c40f', count: 4, fg: '#333' },
] as { label: string; bg: string; count: number; fg?: string }[];

function buildMarkerHtml(): string {
  const allTokens = MARKER_DATA.flatMap(m => Array(m.count).fill(m));
  const COLS = 7;
  let html = '';
  for (let i = 0; i < allTokens.length; i += COLS) {
    const row = allTokens.slice(i, i + COLS);
    html += '<div class="marker-row">';
    for (const t of row) {
      html += `<div class="marker-token" style="background:${t.bg};color:${t.fg || '#fff'}">${t.label}</div>`;
    }
    html += '</div>';
  }
  return html;
}

function renderMarkersInline(): string {
  const legend = MARKER_DATA.map(m => `${m.label}×${m.count}`).join('　');
  return `
    <h3 style="margin-top:12mm;">マーカー（切り取って使用）</h3>
    <div class="marker-grid">${buildMarkerHtml()}</div>
    <p class="marker-legend" style="font-size:7pt;">${legend}</p>`;
}

// ========================================
// HTML生成
// ========================================

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderCharacterCard(card: CharacterCard): string {
  const faction = FACTION_LABELS[card.faction] || card.faction;
  const factionColor = FACTION_COLORS[card.faction] || '#333';
  const element = ELEMENT_LABELS[card.element] || card.element;
  const elementColor = ELEMENT_COLORS[card.element] || '#333';
  const range = RANGE_LABELS[card.attackRange] || card.attackRange;
  const atkType = card.attackType === 'magic' ? '魔' : '物';
  const keywordsHtml = card.keywords
    .map(k => `<b>【${KEYWORD_LABELS[k] || k}】</b>${KEYWORD_DESC[k] || ''}`)
    .join('<br>');
  const effects = card.effects.map(e => escapeHtml(e.description || '')).join('<br>');

  return `
    <div class="card character-card">
      <div class="card-header" style="background:${factionColor}">
        <span class="card-cost">C${card.manaCost}</span>
        <span class="card-name">${escapeHtml(card.name)}</span>
        <span class="card-element" style="background:${elementColor}">${element}</span>
      </div>
      <div class="card-stats">
        <span class="stat">HP <b>${card.hp}</b></span>
        <span class="stat">ATK <b>${card.atk}</b></span>
        <span class="stat">再行動 <b>${card.activateCost}</b></span>
        <span class="stat-sep">|</span>
        <span class="stat">${range}</span>
        <span class="stat">${atkType}</span>
        <span class="stat-sep">|</span>
        <span class="stat vp-badge">${card.manaCost <= 2 ? 1 : card.manaCost <= 4 ? 2 : 3}VP</span>
      </div>
      ${keywordsHtml ? `<div class="card-keywords">${keywordsHtml}</div>` : ''}
      <div class="card-effects">${effects || '<span class="vanilla">— バニラ —</span>'}</div>
      <div class="card-bottom">
        <div class="card-grids">
          ${renderRangeGrids(card.attackRange, card.attackType, card.blindPattern)}
        </div>
        <div class="card-footer">${faction}</div>
      </div>
    </div>`;
}

function renderItemCard(card: ItemCard): string {
  const effects = card.effects.map(e => escapeHtml(e.description || '')).join('<br>');
  const free = card.freeAction ? ' [フリー]' : '';
  return `
    <div class="card item-card">
      <div class="card-header" style="background:#7f8c8d">
        <span class="card-cost">C${card.manaCost}</span>
        <span class="card-name">${escapeHtml(card.name)}${free}</span>
        <span class="card-element" style="background:#bdc3c7">道具</span>
      </div>
      <div class="card-effects item-effects">${effects}</div>
    </div>`;
}

function renderRules(): string {
  return `
    <div class="rules-section page-break">
      <h1>異能学園総選挙 — ルールサマリー</h1>

      <h2>勝利条件</h2>
      <ul>
        <li><b>VP勝利</b>: 15VP到達で即座に勝利</li>
        <li><b>5マス占拠</b>: ターン終了時、盤面9マス中5マス以上を占拠していれば勝利</li>
        <li><b>タイムアウト</b>: 50ターン経過でVP差→占拠数差→引分</li>
      </ul>

      <h2>ターンの流れ</h2>
      <ol>
        <li>マナ+2（毎ターン自動）</li>
        <li>アクション: 召喚（最大2体/ターン、2体目は+1マナ）、攻撃、再行動、アイテム使用</li>
        <li>ターン終了時: 5マス占拠チェック</li>
      </ol>

      <h2>VP獲得</h2>
      <table class="rules-table">
        <tr><th>撃破キャラのコスト</th><th>VP</th></tr>
        <tr><td>C1〜C2</td><td>1 VP</td></tr>
        <tr><td>C3〜C4</td><td>2 VP</td></tr>
        <tr><td>C5</td><td>3 VP</td></tr>
      </table>
      <p>撃破時にマナ+1</p>

      <h2>属性ボーナス</h2>
      <p>キャラの属性とマスの属性が一致 → HP+1（虚属性は補正なし）</p>

      <h2>B位置（ブラインド）</h2>
      <p>カードごとに設定された死角方向。B位置から攻撃するとダメージ+1、反撃を受けない。</p>
      <table class="rules-table">
        <tr><th>パターン</th><th>死角</th><th>デフォルト</th></tr>
        <tr><td>back</td><td>背面のみ</td><td>物理キャラ</td></tr>
        <tr><td>all</td><td>全方向死角（どこからでもB扱い）</td><td>魔法キャラ</td></tr>
        <tr><td>sides</td><td>左右</td><td>—</td></tr>
        <tr><td>back_sides</td><td>背面+左右</td><td>—</td></tr>
        <tr><td>none</td><td>死角なし</td><td>—</td></tr>
      </table>

      <h2>照準（カード効果で付与）</h2>
      <p>照準が付いた敵への攻撃: ATK+1、反撃を受けない。スナイプ派閥のキャラが攻撃した時に消費。<br>
      ※ B位置は「位置取り」で作る盤面スキル。照準は「カード効果」で付与する使い切りデバフ。効果は似ているが発生源が異なる。</p>

      <h2>キーワード一覧</h2>
      <table class="rules-table">
        <tr><th>キーワード</th><th>効果</th></tr>
        <tr><td>防護</td><td>受けるダメージ-1（最低0）。物理・魔法問わず。消費しない。</td></tr>
        <tr><td>回避</td><td>物理攻撃を1回無効化。消費。魔法は通る。</td></tr>
        <tr><td>貫通</td><td>防護・回避を無視してダメージを与える</td></tr>
        <tr><td>先制</td><td>反撃時、相手より先にダメージを与える（B位置からの攻撃には無効）</td></tr>
        <tr><td>カバー</td><td>隣接味方への攻撃を代わりに受ける</td></tr>
        <tr><td>不動</td><td>押し出し・引き寄せ無効</td></tr>
        <tr><td>要塞</td><td>自分から攻撃できず、反撃のみ行う</td></tr>
        <tr><td>隠密</td><td>攻撃時、常にB位置扱い</td></tr>
      </table>

      <h2>カード範囲グリッドの見方</h2>
      <table class="rules-table">
        <tr><th colspan="2">攻撃範囲グリッド</th></tr>
        <tr><td style="background:#333;color:#fff;text-align:center;width:30px">★</td><td>自分の位置</td></tr>
        <tr><td style="background:#e74c3c;color:#fff;text-align:center">●</td><td>攻撃可能なマス</td></tr>
      </table>
      <table class="rules-table" style="margin-top:4px">
        <tr><th colspan="2">反撃/Bグリッド</th></tr>
        <tr><td style="background:#333;color:#fff;text-align:center;width:30px">★</td><td>自分の位置</td></tr>
        <tr><td style="background:#2ecc71;color:#fff;text-align:center">反</td><td>この方向から殴られたら反撃できる</td></tr>
        <tr><td style="background:#f39c12;color:#fff;text-align:center">B</td><td>死角（ダメージ+1される・反撃不可）</td></tr>
      </table>

      <h2>デッキ構築</h2>
      <p>派閥1つ（12枚）+ アイテムセット1つ（6枚）= 18枚</p>
    </div>`;
}

// ========================================
// メイン
// ========================================

const factions = ['aggro', 'tank', 'control', 'synergy', 'snipe', 'trick'] as const;

const allCharCards = factions.flatMap(f => V2_CHARACTERS.filter(c => c.faction === f));
const CARDS_PER_PAGE = 9;

function chunkCards<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

const characterPages = chunkCards(allCharCards, CARDS_PER_PAGE);
let characterSections = '';
for (const page of characterPages) {
  characterSections += `
    <div class="card-sheet page-break">
      <div class="card-grid">
        ${page.map(renderCharacterCard).join('\n')}
      </div>
    </div>`;
}

const allItems = [
  ...new Map(ITEM_SET_A.map(i => [i.id, i])).values(),
  ...new Map(ITEM_SET_B.map(i => [i.id, i])).values(),
  ...new Map(ITEM_SET_C.map(i => [i.id, i])).values(),
  ...new Map(ITEM_SET_D.map(i => [i.id, i])).values(),
];
const itemPages = chunkCards([...allItems], CARDS_PER_PAGE);
let itemSections = '';
for (const page of itemPages) {
  itemSections += `
    <div class="card-sheet page-break">
      <div class="card-grid">
        ${page.map(renderItemCard).join('\n')}
      </div>
    </div>`;
}

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>異能学園総選挙 — 印刷用カードキット</title>
<style>
  @page { margin: 2mm; size: A4 portrait; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', sans-serif;
    color: #222;
    background: #fff;
  }
  h1 { font-size: 18px; margin: 8px 0; text-align: center; }
  h2 { font-size: 14px; margin: 8px 0 4px; }
  .page-break { page-break-before: always; }

  /* ===== カードシート: 3×3、63×88mm ===== */
  .card-sheet {
    display: flex;
    justify-content: center;
  }
  .card-grid {
    display: grid;
    grid-template-columns: repeat(3, 63mm);
    grid-auto-rows: 88mm;
    gap: 0;
  }

  /* ===== カード共通 ===== */
  .card {
    width: 63mm;
    height: 88mm;
    border: 0.3px solid #999;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: #fff;
  }

  /* ヘッダー: コスト・名前・属性 */
  .card-header {
    display: flex;
    align-items: center;
    padding: 1.2mm 1.5mm;
    color: #fff;
    font-weight: bold;
    font-size: 3.5mm;
    gap: 1mm;
    flex-shrink: 0;
  }
  .card-cost {
    background: rgba(0,0,0,0.3);
    border-radius: 50%;
    width: 6mm; height: 6mm;
    display: flex; align-items: center; justify-content: center;
    font-size: 4mm;
    flex-shrink: 0;
  }
  .card-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-element {
    border-radius: 1mm;
    padding: 0.5mm 1.5mm;
    font-size: 3mm;
    flex-shrink: 0;
  }

  /* ステータス行 */
  .card-stats {
    display: flex;
    gap: 2mm;
    padding: 1mm 1.5mm;
    background: #f5f5f5;
    border-bottom: 0.3mm solid #ddd;
    font-size: 3mm;
    flex-shrink: 0;
    align-items: baseline;
  }
  .card-stats b { font-size: 4mm; }
  .stat-sep { color: #ccc; }

  /* キーワード（説明付き） */
  .card-keywords {
    padding: 1mm 1.5mm;
    font-size: 2.8mm;
    line-height: 1.4;
    color: #2980b9;
    border-bottom: 0.2mm dashed #ccc;
    flex-shrink: 0;
  }

  /* 効果テキスト */
  .card-effects {
    padding: 1mm 1.5mm;
    font-size: 2.8mm;
    line-height: 1.4;
    flex: 1;
    overflow: hidden;
  }
  .vanilla { color: #999; font-style: italic; font-size: 3mm; }

  /* カード下部: グリッド＋フッター */
  .card-bottom {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding: 0.5mm 1.5mm 1mm;
    flex-shrink: 0;
    border-top: 0.2mm solid #eee;
  }
  .card-grids { display: flex; }
  .card-footer {
    font-size: 2mm;
    color: #999;
    text-align: right;
  }

  /* ===== 範囲グリッド 3×3 ×2 ===== */
  .range-pair {
    display: flex;
    gap: 1.5mm;
  }
  .grid-box { text-align: center; }
  .grid-title {
    font-size: 1.6mm;
    color: #666;
    margin-bottom: 0.3mm;
  }
  .range-grid {
    border-collapse: collapse;
    table-layout: fixed;
  }
  .range-grid td {
    width: 3.5mm; height: 3.5mm;
    text-align: center;
    font-size: 1.8mm;
    font-weight: bold;
    border: 0.15mm solid #aaa;
    padding: 0;
    line-height: 3.5mm;
  }
  .rg-dir {
    border: none !important;
    font-size: 1.4mm;
    color: #999;
    height: 2mm !important;
    line-height: 2mm !important;
    font-weight: normal;
  }
  .rg-empty { background: #f5f5f5; color: transparent; }
  .rg-self { background: #333; color: #fff; }
  .rg-atk { background: #e74c3c; color: #fff; }
  .rg-blind { background: #f39c12; color: #fff; }
  .rg-counter { background: #2ecc71; color: #fff; }
  .range-ext {
    font-size: 1.6mm;
    color: #e74c3c;
    text-align: center;
    margin-top: 0.3mm;
  }

  /* ===== アイテムカード ===== */
  .item-card .card-effects { font-size: 3mm; padding: 1.5mm; flex: 1; }

  /* ===== ルール ===== */
  .rules-section { font-size: 11px; line-height: 1.6; padding: 10px; }
  .rules-section h2 { margin-top: 12px; border-bottom: 1px solid #333; }
  .rules-section ul, .rules-section ol { margin-left: 18px; }
  .rules-section li { margin: 3px 0; }
  .rules-table { border-collapse: collapse; margin: 6px 0; }
  .rules-table th, .rules-table td { border: 1px solid #999; padding: 3px 10px; font-size: 10px; }
  .rules-table th { background: #eee; }

  /* ===== 属性盤 ===== */
  .board-page { padding: 10px; }
  .board-page h2 { margin-bottom: 4px; }
  .board-page p { font-size: 11px; margin-bottom: 8px; }
  .elem-boards-grid {
    display: grid;
    grid-template-columns: repeat(4, auto);
    gap: 12px;
    justify-content: start;
  }
  .elem-board {
    border-collapse: collapse;
  }
  .elem-board td {
    width: 18mm; height: 18mm;
    border: 0.5mm solid #333;
    text-align: center;
    font-size: 5mm;
    font-weight: bold;
  }

  /* ===== フィールドマット ===== */
  .field-page {
    padding: 5mm;
  }
  .field-page h2 {
    font-size: 14px;
    margin-bottom: 2mm;
    text-align: center;
  }
  .field-page p {
    font-size: 10px;
    text-align: center;
    margin-bottom: 4mm;
    color: #666;
  }
  .field-grid-wrap {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
  }
  .field-direction {
    font-size: 4mm;
    font-weight: bold;
    text-align: center;
    padding: 2mm 0;
    letter-spacing: 2mm;
  }
  .field-direction.p1 { color: #c0392b; }
  .field-direction.p0 { color: #2980b9; }
  .field-grid {
    border-collapse: collapse;
  }
  .field-grid td {
    width: 90mm;
    height: 90mm;
    border: 0.8mm solid #333;
    vertical-align: top;
    padding: 1.5mm;
    position: relative;
    background: #fafafa;
  }
  .field-grid td .cell-coord {
    position: absolute;
    bottom: 1mm;
    right: 2mm;
    font-size: 3mm;
    color: #bbb;
    font-weight: bold;
  }
  .field-grid td .cell-elem-slot {
    width: 12mm;
    height: 12mm;
    border: 0.4mm dashed #aaa;
    border-radius: 1mm;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3mm;
    color: #999;
  }

  /* A4タイル版: 2×2分割で各ページにフィールドの1/4を印刷 */
  .field-tile-page {
    padding: 5mm;
    display: block;
    text-align: center;
  }
  .field-tile-page .tile-label {
    font-size: 10px;
    color: #999;
    text-align: center;
    margin-bottom: 2mm;
  }
  .field-tile {
    border-collapse: collapse;
  }
  .field-tile {
    border-collapse: collapse;
    table-layout: fixed;
    width: calc(90mm * 3);
  }
  .field-tile td {
    width: 90mm;
    height: 90mm;
    border: 0.8mm solid #333;
    padding: 0;
    background: #fafafa;
    overflow: hidden;
  }
  .cell-inner {
    width: 90mm;
    height: 90mm;
    position: relative;
    padding: 1.5mm;
    box-sizing: border-box;
  }
  .cell-inner .cell-coord {
    position: absolute;
    bottom: 1mm;
    right: 2mm;
    font-size: 3.5mm;
    color: #bbb;
    font-weight: bold;
  }
  .cell-inner .cell-elem-badge {
    width: 16mm;
    height: 16mm;
    border-radius: 2mm;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 7mm;
    color: #fff;
    font-weight: bold;
    margin: 2mm;
  }
  .elem-tiles-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4mm;
    justify-content: center;
    padding: 4mm;
  }
  .elem-tile {
    width: 30mm;
    height: 30mm;
    border: 0.8mm solid #333;
    border-radius: 2mm;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .elem-tile-label {
    width: 22mm;
    height: 22mm;
    border-radius: 2mm;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10mm;
    color: #fff;
    font-weight: bold;
  }
  .tile-align-mark {
    font-size: 8px;
    color: #ccc;
    text-align: center;
    margin-top: 1mm;
  }

  /* ===== VPバッジ ===== */
  .vp-badge {
    background: #f1c40f;
    color: #333;
    padding: 0 1mm;
    border-radius: 0.5mm;
    font-weight: bold;
    font-size: 2.8mm;
  }

  /* ===== マーカー ===== */
  .marker-page { padding: 10px; }
  .marker-page h2 { margin-bottom: 6px; }
  .marker-grid { }
  .marker-row {
    display: flex;
    gap: 0;
  }
  .marker-token {
    width: 22mm;
    height: 22mm;
    border: 0.3mm dashed #999;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3.5mm;
    font-weight: bold;
  }
  .marker-legend {
    font-size: 9px;
    color: #888;
    margin-top: 4mm;
  }

  @media print {
    .page-break { page-break-before: always; }
    body { background: #fff; }
  }
</style>
</head>
<body>

${characterSections}

${itemSections}

${renderElementBoards()}

${renderFieldMats()}

</body>
</html>`;

fs.writeFileSync('print-kit.html', html, 'utf-8');

// PDF変換
async function toPdf() {
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.default.launch();
  const page = await browser.newPage();
  const filePath = 'file:///' + process.cwd().replace(/\\/g, '/') + '/print-kit.html';
  await page.goto(filePath, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: 'print-kit.pdf',
    format: 'A4',
    margin: { top: '2mm', bottom: '2mm', left: '2mm', right: '2mm' },
    printBackground: true,
  });
  await browser.close();
  console.log('✅ print-kit.pdf を生成しました。');
}

toPdf().catch(e => { console.error(e); process.exit(1); });
