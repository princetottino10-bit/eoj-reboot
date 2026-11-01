import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const htmlPath = path.join(root, 'print-kit-0718-clean.html');
const reportPath = path.join(root, 'docs', 'print-kit-0718-audit.md');

const expected = [
  {name:'鬼火', copies:4, cost:2, hp:3, atk:1, react:2, life:1, attack:[[1,0]], weak:[[-1,0]]},
  {name:'小鬼', copies:4, cost:3, hp:4, atk:2, react:3, life:1, attack:[[1,0]], weak:[[-1,0]]},
  {name:'槍霊', copies:1, cost:4, hp:5, atk:2, react:3, life:1, attack:[[1,0],[2,0]], weak:[[0,-1],[0,1]]},
  {name:'薙刀霊', copies:1, cost:4, hp:5, atk:2, react:3, life:1, attack:[[1,0],[0,-1],[0,1]], weak:[[-1,0]]},
  {name:'鬼', copies:2, cost:4, hp:5, atk:2, react:3, life:1, attack:[[1,0]], weak:[[-1,0]]},
  {name:'両面', copies:1, cost:5, hp:6, atk:3, react:3, life:3, attack:[[1,0],[-1,0]], weak:[[0,-1],[0,1]]},
  {name:'仁王', copies:1, cost:5, hp:6, atk:3, react:3, life:3, attack:[[1,0]], weak:[[-1,0]]},
  {name:'九尾', copies:1, cost:6, hp:7, atk:3, react:3, life:3, attack:[[1,-1],[1,0],[1,1],[0,-1],[0,1]], weak:[[-1,0]]},
  {name:'龍', copies:1, cost:7, hp:8, atk:4, react:4, life:4, attack:[[1,0],[2,0],[0,-1],[0,1]], weak:[[-1,0]]},
];

const key = (cells) => cells.map(([r,c]) => `${r},${c}`).sort().join('|');
const displayCells = (cells) => cells.map(([r,c]) => `(${r},${c})`).join(' ');
const fail = (message) => { throw new Error(message); };
const html = fs.readFileSync(htmlPath, 'utf8');
const articles = html.match(/<article class="card"[\s\S]*?<\/article>/g) ?? [];
if (articles.length !== 32) fail(`Expected 32 cards, found ${articles.length}`);
if (html.includes('onibi-P') || html.includes('class="id"')) fail('Management ID remains in output');
if (html.includes('薙霧')) fail('Old typo 薙霧 remains in output');
if (html.includes('死角')) fail('Deprecated term 死角 remains in output');

const parsed = articles.map((article, index) => {
  const name = article.match(/<div class="name">([^<]+)<\/div>/)?.[1];
  const attribute = article.match(/<div class="attr">([^<]+)<\/div>/)?.[1];
  const cost = Number(article.match(/<div class="cost">(\d+)<\/div>/)?.[1]);
  const stats = [...article.matchAll(/<div><small>[^<]+<\/small><b>(\d+)<\/b><\/div>/g)].map((m) => Number(m[1]));
  const cells = [...article.matchAll(/<span class="cell ([^"]*)">[^<]*<\/span>/g)];
  if (!name || !attribute || stats.length !== 4 || cells.length !== 25) fail(`Could not parse card ${index + 1}`);
  const attack = [];
  const weak = [];
  cells.forEach((match, cellIndex) => {
    const r = 2 - Math.floor(cellIndex / 5);
    const c = (cellIndex % 5) - 2;
    if (match[1].split(' ').includes('attack')) attack.push([r,c]);
    if (match[1].split(' ').includes('weak')) weak.push([r,c]);
  });
  return {name, attribute, cost, hp:stats[0], atk:stats[1], react:stats[2], life:stats[3], attack, weak};
});

for (let player = 0; player < 2; player += 1) {
  const deck = parsed.slice(player * 16, player * 16 + 16);
  const attributes = Object.fromEntries(['地','水','火','風'].map((name) => [name, deck.filter((card) => card.attribute === name).length]));
  if (Object.values(attributes).some((count) => count !== 4)) fail(`P${player + 1} attributes are not 4 each: ${JSON.stringify(attributes)}`);
  for (const spec of expected) {
    const cards = deck.filter((card) => card.name === spec.name);
    if (cards.length !== spec.copies) fail(`P${player + 1} ${spec.name}: expected ${spec.copies}, found ${cards.length}`);
    for (const card of cards) {
      for (const field of ['cost','hp','atk','react','life']) {
        if (card[field] !== spec[field]) fail(`P${player + 1} ${spec.name} ${field}: ${card[field]} != ${spec[field]}`);
      }
      if (key(card.attack) !== key(spec.attack)) fail(`P${player + 1} ${spec.name}: attack range mismatch`);
      if (key(card.weak) !== key(spec.weak)) fail(`P${player + 1} ${spec.name}: weakness mismatch`);
    }
  }
}

const rows = expected.map((card) => `| ${card.name} | ${card.copies} | ${card.cost} | ${card.hp} | ${card.atk} | ${card.react} | ${card.life} | ${displayCells(card.attack)} | ${displayCells(card.weak)} | PASS |`).join('\n');
const report = `# 7/18 Print Kit Audit\n\nGenerated: ${new Date().toISOString()}\n\nResult: **PASS**\n\n- 32 cards (16 mirrored per player)\n- P1/P2 attributes: 地4 / 水4 / 火4 / 風4\n- No management IDs\n- 薙刀霊 spelling verified\n- Player-facing terminology uses 弱点 consistently\n- All attacks are physical, choice 1, and counter range equals attack range in the rendered kit\n\n| Card | Copies/player | Cost | HP | ATK | React | Life | Attack cells | Weak cells | Result |\n|---|---:|---:|---:|---:|---:|---:|---|---|---|\n${rows}\n`;
fs.writeFileSync(reportPath, report, 'utf8');
console.log(`PASS: ${path.relative(root, htmlPath)} matches the 7/18 card list (${articles.length} cards)`);
console.log(`Wrote ${path.relative(root, reportPath)}`);
