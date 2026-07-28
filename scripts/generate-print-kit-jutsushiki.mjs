// 術式(スペル)カードの印刷キット生成
// 使い方: node scripts/generate-print-kit-jutsushiki.mjs
// 出力: print-kit-jutsushiki.html / .pdf / -preview.png
//
// 式神カードの印刷キット(scripts/generate-print-kit-0718.mjs)と同じ判型・面付け:
//   カード 63x88mm / A4に3x3 / シート 189x264mm

import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const root = process.cwd();
const htmlPath = path.join(root, 'print-kit-jutsushiki.html');
const pdfPath = path.join(root, process.env.PRINT_KIT_PDF ?? 'print-kit-jutsushiki.pdf');
const previewPath = path.join(root, 'print-kit-jutsushiki-preview.png');

// copies: 1人分の枚数。ミラー戦のため最終的に×2枚印刷する。
const COPIES_PER_PLAYER = 1;
const PLAYERS = 2;

// true にすると、最終ページのカードの余白にルールシートを刷る。
// false ならカードだけを刷る。
const INCLUDE_RULES = false;

const cards = [
  {
    name: '旋', yomi: 'せん', costType: 'mana', cost: 2,
    text: '盤上の式神1体を、任意の向きに変える。敵味方を問わない。すでに攻撃した式神にも使える。',
    hint: '1ターンで180度回せる唯一の手段',
  },
  {
    name: '傀儡', yomi: 'くぐつ', costType: 'mana', cost: 3,
    text: '敵の式神1体を任意の向きに変え、その式神に攻撃を1回行わせる。対象は使用者が選ぶ(敵味方問わず)。反撃は通常どおり発生する。',
    hint: '相手の駒で相手を殴る',
  },
  {
    name: '相打ち', yomi: 'あいうち', costType: 'mana', cost: 3,
    text: '攻撃範囲が互いに重なっている敵の式神2体を選ぶ。その2体に互いを攻撃させる。戦闘は通常規則で解決する。',
    hint: '相手の配置ミスを咎める',
  },
  {
    name: '逆手', yomi: 'さかて', costType: 'mana', cost: 3,
    text: '隣接する自分の式神1体と敵の式神1体の位置を入れ替える。向きは各自そのまま。',
    hint: '占拠マスの総数は変わらない',
  },
  {
    name: '手繰り', yomi: 'たぐり', costType: 'mana', cost: 2,
    text: '敵の式神1体を、自分の式神に上下左右で隣接する空きマスへ移動する。向きはそのまま。',
    hint: '射程外の敵を間合いへ引き込む',
  },
  {
    name: '窮鼠', yomi: 'きゅうそ', costType: 'mana', cost: 4,
    costNote: '相手が4マス以上占拠中は 1',
    text: '自分の式神1体を、任意の空きマスへ移動する。向きは自由に選ぶ。',
    hint: '追い詰められている時だけ安い',
  },
  {
    name: '守り札', yomi: 'まもりふだ', costType: 'life', cost: 1,
    text: '自分の式神1体のHPを+3する(上限10)。',
    hint: '霊力を使わないので召喚と両立できる',
  },
  {
    name: '大地の怒り', yomi: 'だいちのいかり', costType: 'mana', cost: 2,
    text: '陰か陽を指定する。その属性のマスにいる全ての式神に2ダメージ。敵味方を問わない。',
    hint: '2体以上に当てないと割に合わない',
  },
  {
    name: '楔', yomi: 'くさび', costType: 'mana', cost: 2,
    text: 'マス1つに楔を置く。そのマスへの召喚・移動、そのマスにいる式神の回転・攻撃はコスト+2。太極に置いた場合、召喚の霊力軽減は適用されない。',
    hint: '禁止ではなく値上げ',
  },
  {
    name: '地脈', yomi: 'ちみゃく', costType: 'mana', cost: 2,
    text: '誰も乗っていないマス1つの属性を、陰・陽・空のいずれかに変える。太極は選べない。',
    hint: '空きマス限定(HP再計算を起こさない)',
  },
  {
    name: '地鎮', yomi: 'じちん', costType: 'mana', cost: 0,
    text: '自分の式神1体を撃破する。その式神がいたマスを、その式神と同じ属性に変える。',
    hint: '生命価と盤面の頭数を先払いする',
  },
];

const THEME = {
  mana: { accent: '#4a3a86', tint: '#e7e2f4', label: '霊力' },
  life: { accent: '#a3324b', tint: '#f6dbe1', label: '生命' },
};

const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function cardHtml(c) {
  const t = THEME[c.costType];
  const costNote = c.costNote ? `<div class="cost-note">${esc(c.costNote)}</div>` : '';
  return `<article class="card" style="--accent:${t.accent};--tint:${t.tint}">
<header><div class="cost"><b>${c.cost}</b><small>${t.label}</small></div><div class="title"><div class="name">${esc(c.name)}</div><div class="yomi">${esc(c.yomi)}</div></div><div class="kind">術式</div></header>
${costNote}
<div class="text">${esc(c.text)}</div>
<div class="hint">${esc(c.hint)}</div>
<div class="foot">召喚より前に使用 / 1ターン1枚 / 召喚枠は使わない</div>
</article>`;
}

const deck = Array.from({ length: PLAYERS }, () =>
  cards.flatMap((c) => Array.from({ length: COPIES_PER_PLAYER }, () => cardHtml(c)))
).flat();

// 最終ページはカードの余りとルールシートを同居させる。
// 余りが0枚のときはルールだけのページになる。
const remainder = deck.length % 9 === 0 ? 0 : deck.length % 9;
const fullCount = deck.length - remainder;
const fullSheets = Array.from({ length: fullCount / 9 }, (_, i) =>
  `<section class="sheet">${deck.slice(i * 9, i * 9 + 9).join('')}</section>`
).join('');
const lastRow = remainder ? `<div class="card-row">${deck.slice(fullCount).join('')}</div>` : '';

// カードだけを刷る通常構成。
const plainSheets = Array.from({ length: Math.ceil(deck.length / 9) }, (_, i) =>
  `<section class="sheet">${deck.slice(i * 9, i * 9 + 9).join('')}</section>`
).join('');

// 最終ページの残り高さが限られるため、一覧はカード名とコストだけの圧縮版にする。
// 効果本文は各カードに刷ってあるので重複しない。
const costList = cards.map((c) => {
  const t = THEME[c.costType];
  const cost = c.costNote ? `${t.label}${c.cost}<span class="cond">／${esc(c.costNote)}</span>` : `${t.label}${c.cost}`;
  return `<li><b>${esc(c.name)}</b><span>${cost}</span></li>`;
}).join('');

const style = `
@page{size:A4;margin:0}
*{box-sizing:border-box}
body{margin:0;background:#d7d9dc;color:#20242a;font-family:"Yu Gothic",Meiryo,sans-serif}
.sheet{width:189mm;height:264mm;margin:10mm auto;background:#fff;display:grid;grid-template-columns:repeat(3,63mm);grid-template-rows:repeat(3,88mm);break-after:page}
.card{width:63mm;height:88mm;border:1px solid #20242a;border-bottom:2.5mm solid var(--accent);background:var(--tint);padding:3mm;overflow:hidden;display:flex;flex-direction:column}
.card header{display:flex;align-items:center;background:var(--accent);color:#fff;margin:-3mm -3mm 0;padding:2mm 3mm 1.5mm}
.cost{width:11mm;height:11mm;border:1.5px solid #fff;border-radius:50%;background:#20242a;color:#fff;display:grid;place-items:center;line-height:1;flex:none}
.cost b{font-size:17px;font-weight:800}
.cost small{font-size:6px;letter-spacing:.5px}
.title{margin-left:2mm;flex:1;min-width:0}
.name{font-size:18px;font-weight:800;line-height:1.1;white-space:nowrap}
.yomi{font-size:8px;opacity:.85;margin-top:.3mm}
.kind{min-width:9mm;padding:.8mm 1.4mm;border-radius:2px;background:#fff;color:var(--accent);font-size:11px;font-weight:800;text-align:center;flex:none}
.cost-note{margin-top:1.2mm;text-align:center;font-size:8.5px;font-weight:700;color:#fff;background:var(--accent);border-radius:1mm;padding:.8mm 1mm}
.text{margin-top:2mm;font-size:11.5px;line-height:1.62;font-weight:600;background:rgba(255,255,255,.8);border:1px solid var(--accent);border-radius:1mm;padding:2mm;flex:1}
.hint{margin-top:1.4mm;font-size:8px;color:#4c5660;text-align:center;font-style:italic}
.foot{border-top:1px solid var(--accent);margin-top:1.4mm;padding-top:.8mm;text-align:center;font-size:6.6px;color:#38434c}
/* 最終ページ: カードの余り + ルールシート */
.sheet-mixed{width:189mm;height:264mm;margin:10mm auto;background:#fff;display:flex;flex-direction:column;break-after:page;overflow:hidden}
.card-row{display:grid;grid-template-columns:repeat(3,63mm);grid-auto-rows:88mm;flex:none}
.rules{flex:1;padding:3.5mm 4mm 0;min-height:0}
.rules h1{font-size:14px;margin:0 0 1.5mm}
.rules h2{font-size:9.5px;border-bottom:1.2px solid #27313a;padding-bottom:.7mm;margin:2.4mm 0 1mm}
.rules p,.rules li{font-size:7.6px;line-height:1.45;margin:.4mm 0}
.rules ul{margin:0;padding-left:4.5mm}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:0 6mm}
.two-col h2{margin-top:0}
.costlist{list-style:none;display:grid;grid-template-columns:repeat(4,1fr);gap:.6mm 4mm;margin:0;padding:0}
.costlist li{display:flex;justify-content:space-between;gap:2mm;border-bottom:1px dotted #aeb6bd;font-size:8px;padding-bottom:.4mm}
.costlist b{font-weight:800}
.costlist .cond{font-size:6.6px;color:#4c5660}
.calibration{display:flex;align-items:center;gap:4mm;margin-top:2.5mm}
.calibration-line{display:block;width:50mm;border-top:1mm solid #20242a}
.calibration p{margin:0;font-size:8px}
.print-note{text-align:center;font-size:10px;color:#53606d;margin:5mm}
@media print{body{background:#fff}.sheet,.rules{margin:0}.print-note{display:none}}`;

const rulesPage = `
<section class="sheet-mixed">
${lastRow}
<div class="rules">
<h1>術式 ルールシート</h1>
<div class="two-col">
<div>
<h2>使用ルール</h2>
<ul>
<li>術式は<strong>メインフェイズ中、召喚より前</strong>に使用する。</li>
<li><strong>1ターンに1枚まで。</strong></li>
<li>霊力または生命を消費するが、<strong>召喚枠は消費しない</strong>（術式を使ったターンも召喚できる）。</li>
<li>使用した術式は墓地へ送る。</li>
</ul>
<h2>コスト</h2>
<p>コストは<strong>霊力</strong>（紫）と<strong>生命</strong>（赤）の2種類。霊力は毎ターン+3されるが、<strong>生命は補充されない</strong>。生命を払う術式は召喚テンポを落とさない代わりに、敗北までの距離を縮める。</p>
<p>霊力収入が3なので、コスト2を撃つとC2の式神しか召喚できず、コスト3なら召喚できない。<strong>放っておいても召喚と競合する</strong>。</p>
</div>
<div>
<h2>テストで見てほしいこと</h2>
<ul>
<li>使った瞬間、<strong>盤面で何が起きたか一目でわかったか</strong>。</li>
<li>使いどころを<strong>自分で見つけられたか</strong>（撃つ場面が明らかすぎ／なさすぎではないか）。</li>
<li>相手に<strong>応手が残っていたか</strong>。一方的に決まってしまわなかったか。</li>
<li>コストは高い／安いどちらに感じたか。</li>
<li>1ターン1枚で足りたか、物足りなかったか。</li>
</ul>
<p>気づいたことは<strong>カードの余白に直接</strong>書き込んでください。</p>
<h2>この束について</h2>
<p>カードは63×88mm、式神カードと同じ判型。<strong>1人${cards.length}枚 × ${PLAYERS}人分</strong>で、実際のデッキには使う分だけを入れる。効果本文は各カードに刷ってある。</p>
</div>
</div>
<h2>コスト一覧</h2>
<ul class="costlist">${costList}</ul>
<div class="calibration"><span class="calibration-line"></span><p>この線が50mmなら実寸です。</p></div>
</div>
</section>`;

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>術式 印刷キット — 3x3 Duel</title><style>${style}</style></head><body>
<div class="print-note">印刷設定: A4 / 実際のサイズ（100%）/ 拡大・縮小なし</div>
${INCLUDE_RULES ? fullSheets + rulesPage : plainSheets}
</body></html>`;

fs.writeFileSync(htmlPath, html, 'utf8');

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 1 });
await page.goto(`file:///${htmlPath.replaceAll('\\', '/')}`, { waitUntil: 'networkidle0' });
await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
await page.screenshot({ path: previewPath, fullPage: false });
await browser.close();

console.log(`Generated:
  ${htmlPath}
  ${pdfPath}
  ${previewPath}
  cards=${cards.length} x ${PLAYERS}players = ${deck.length} / sheets=${Math.ceil(deck.length / 9)}`);
