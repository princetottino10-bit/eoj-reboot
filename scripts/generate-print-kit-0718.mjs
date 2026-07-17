import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const root = process.cwd();
const htmlPath = path.join(root, 'print-kit-0718-clean.html');
const pdfPath = path.join(root, 'print-kit-0718-clean.pdf');
const previewPath = path.join(root, 'print-kit-0718-clean-preview.png');
const jp = (hex) => String.fromCodePoint(...hex.replaceAll(' ', '').match(/.{4}/g).map((x) => parseInt(x, 16)));
const cards = [
  ['onibi', jp('9b3c706b'), 4, 2, 3, 1, 2, 1, ['earth','water','fire','wind'], [[1,0]], [[-1,0]]],
  ['koni', jp('5c0f9b3c'), 4, 3, 4, 2, 3, 1, ['earth','water','fire','wind'], [[1,0]], [[-1,0]]],
  ['sorei', jp('69cd970a'), 1, 4, 5, 2, 3, 1, 'fire', [[1,0],[2,0]], [[0,-1],[0,1]]],
  ['naginatarei', jp('8599 5200 970a'), 1, 4, 5, 2, 3, 1, 'wind', [[1,0],[0,-1],[0,1]], [[-1,0]]],
  ['oni', jp('9b3c'), 2, 4, 5, 2, 3, 1, ['earth','water'], [[1,0]], [[-1,0]]],
  ['ryomen', jp('4e21 9762'), 1, 5, 6, 3, 3, 3, 'water', [[1,0],[-1,0]], [[0,-1],[0,1]]],
  ['nio', jp('4ec1 738b'), 1, 5, 6, 3, 3, 3, 'fire', [[1,0]], [[-1,0]]],
  ['kyubi', jp('4e5d 5c3e'), 1, 6, 7, 3, 3, 3, 'wind', [[1,-1],[1,0],[1,1],[0,-1],[0,1]], [[-1,0]]],
  ['ryu', jp('9f8d'), 1, 7, 8, 4, 4, 4, 'earth', [[1,0],[2,0],[0,-1],[0,1]], [[-1,0]]],
];
const attr = {
  earth: [jp('5730'), '#9a6a3a'], water: [jp('6c34'), '#247bb5'],
  fire: [jp('706b'), '#c94b35'], wind: [jp('98a8'), '#4d8b61'],
};

const esc = (s) => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function range(card) {
  const a = new Set(card[9].map(([r,c]) => `${r},${c}`));
  const w = new Set(card[10].map(([r,c]) => `${r},${c}`));
  let cells = '';
  for (let r = 2; r >= -2; r--) for (let c = -2; c <= 2; c++) {
    const k = `${r},${c}`; const self = r === 0 && c === 0;
    const cls = self ? 'self' : a.has(k) ? 'attack' : w.has(k) ? 'weak' : '';
    cells += `<span class="cell ${cls}">${self ? jp('81ea') : a.has(k) ? '●' : w.has(k) ? '×' : ''}</span>`;
  }
  return `<div class="range"><div class="range-title">${jp('653b6483')} = ${jp('53cd6483')}</div><div class="front">${jp('524d')} ▲</div><div class="grid">${cells}</div><div class="legend"><span class="atk">● ${jp('653b6483')}・${jp('53cd6483')}</span><span class="wk">× ${jp('5f31 70b9')}</span></div></div>`;
}
function cardHtml(card, copyIndex) {
  const attribute = Array.isArray(card[8]) ? card[8][copyIndex] : card[8];
  const [label, color] = attr[attribute];
  return `<article class="card" style="--accent:${color}"><header><div class="cost">${card[3]}</div><div class="name">${esc(card[1])}</div><div class="attr">${label}</div></header><div class="stats"><div><small>HP</small><b>${card[4]}</b></div><div><small>ATK</small><b>${card[5]}</b></div><div><small>${jp('518d547d')}</small><b>${card[6]}</b></div><div><small>${jp('751f547d')}</small><b>${card[7]}</b></div></div><div class="type">${jp('72697406')}　${jp('9078629e')}1体</div>${range(card)}<div class="note">${jp('6b7b89d2')} +2${jp('30c0 30e1 30fc 30b8')} / ${jp('53cd6483')}なし</div></article>`;
}
const deckCards = [1, 2].flatMap(() => cards.flatMap((card) => Array.from({length: card[2]}, (_, copyIndex) => cardHtml(card, copyIndex))));
const sheets = Array.from({length: Math.ceil(deckCards.length / 9)}, (_, i) => `<section class="sheet">${deckCards.slice(i * 9, i * 9 + 9).join('')}</section>`).join('');
const rows = cards.map((c) => `<tr><td>${c[1]}</td><td>${c[3]}</td><td>${c[4]} / ${c[5]} / ${c[6]}</td><td>${c[2]}枚</td></tr>`).join('');
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>7/18 3x3 Duel Print Kit</title><style>
@page{size:A4;margin:0}*{box-sizing:border-box}body{margin:0;background:#d7d9dc;color:#20242a;font-family:"Yu Gothic",Meiryo,sans-serif}.sheet{width:189mm;height:264mm;margin:12mm;background:#fff;display:grid;grid-template-columns:repeat(3,63mm);grid-template-rows:repeat(3,88mm);break-after:page}.card{width:63mm;height:88mm;border:1px solid #20242a;background:#fff;padding:3mm;overflow:hidden;position:relative}.card header{display:flex;align-items:center;border-bottom:2px solid var(--accent);padding-bottom:1.5mm}.cost{width:9mm;height:9mm;border-radius:50%;background:#20242a;color:#fff;display:grid;place-items:center;font-weight:800;font-size:17px}.name{font-size:17px;font-weight:800;margin-left:2mm;flex:1;white-space:nowrap}.attr{font-size:11px;font-weight:700;color:var(--accent)}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1mm;margin-top:1mm}.stats div{border:1px solid #c7ccd1;text-align:center;padding:1mm 0}.stats small{display:block;font-size:7px;color:#5c6670}.stats b{font-size:15px}.type{text-align:center;font-size:9px;font-weight:700;margin:1mm 0}.range{position:relative}.range-title{text-align:center;font-size:8px;font-weight:700;margin-bottom:.5mm}.front{text-align:center;font-size:8px;color:#53606d;height:3mm}.grid{width:32mm;height:32mm;margin:auto;display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #8d969e}.cell{border:1px solid #d7dce0;display:grid;place-items:center;font-size:12px;font-weight:800}.cell.self{background:#27313a;color:#fff;font-size:8px}.cell.attack{background:#f5b7ae;color:#9d271a}.cell.weak{background:#f6df91;color:#5b4700}.legend{display:flex;justify-content:center;gap:3mm;font-size:7px;margin-top:.7mm}.atk{color:#9d271a}.wk{color:#5b4700}.note{border-top:1px solid #c7ccd1;margin-top:1mm;padding-top:.7mm;text-align:center;font-size:7px;color:#4d5963}.rules{width:170mm;min-height:245mm;margin:20mm auto;background:#fff;padding:12mm;break-after:page}.rules h1{font-size:24px;margin:0 0 5mm}.rules h2{font-size:15px;border-bottom:2px solid #27313a;padding-bottom:2mm;margin-top:7mm}.rules p,.rules li{font-size:11px;line-height:1.7}.rules table{border-collapse:collapse;width:100%;font-size:10px}.rules th,.rules td{border:1px solid #aeb6bd;padding:2mm;text-align:left}.rules .sample{display:flex;gap:5mm;align-items:flex-start}.rules .sample .range{transform:scale(1.25);transform-origin:top left;width:44mm;height:48mm}.print-note{text-align:center;font-size:10px;color:#53606d;margin:5mm}
@media print{body{background:#fff}.sheet,.rules{margin:0}.print-note{display:none}}</style></head><body><div class="print-note">ブラウザ印刷: A4 / 倍率100% / 余白なし</div>${sheets}<section class="rules"><h1>7/18 3x3 Duel ルールシート</h1><p>カードは63×88mm。各プレイヤー16枚。向きはカード上部の「前」方向を基準にします。</p><h2>範囲図の読み方</h2><div class="sample"><div>${range(cards[7])}</div><ul><li>● 攻撃範囲。反撃範囲も同じ。</li><li>× 弱点。死角からの攻撃はダメージ+2。</li><li>${jp('81ea')} 自分の式神。▲が前。</li><li>死角からの攻撃には反撃しない。</li></ul></div><h2>デッキ一覧</h2><table><thead><tr><th>カード</th><th>コスト</th><th>HP / ATK / 再命令</th><th>枚数</th></tr></thead><tbody>${rows}</tbody></table><h2>プレイ用メモ</h2><ul><li>攻撃範囲と反撃範囲は全カード共通で同じです。</li><li>属性は地・水・火・風。盤面の属性マスに対応します。</li><li>生命価は勝利条件のライフ計算に使います。</li></ul></section></body></html>`;
fs.writeFileSync(htmlPath, html, 'utf8');
const browser = await puppeteer.launch({headless:true, args:['--no-sandbox','--disable-setuid-sandbox']});
const page = await browser.newPage();
await page.setViewport({width:1240,height:1754,deviceScaleFactor:1});
await page.goto(`file:///${htmlPath.replaceAll('\\','/')}`, {waitUntil:'networkidle0'});
await page.pdf({path:pdfPath, format:'A4', printBackground:true, preferCSSPageSize:true});
await page.screenshot({path:previewPath, fullPage:false});
await browser.close();
console.log(`Generated ${htmlPath}, ${pdfPath}, ${previewPath}`);
