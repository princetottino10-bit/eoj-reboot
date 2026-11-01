/**
 * activateCost 漏れ修正スクリプト
 * manaCost の直後に activateCost がない CharacterCard を検出し、
 * コスト帯に応じた activateCost を挿入する。
 * C1=1, C2=1, C3-C4=2, C5-C6=3
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'data', 'cards.ts');
let src = fs.readFileSync(filePath, 'utf-8');

// manaCost: N, の直後に activateCost がない行を探す
// 2パターン:
// 1) manaCost: N,\n  attackRange  (改行あり)
// 2) manaCost: N,\n  hp: ... manaCost: N, activateCost ... (インラインはOK)

// パターン1: 独立行で manaCost: N, の次行が attackRange
const pattern1 = /manaCost: (\d+),\n(\s+)attackRange:/g;
// パターン2: インライン hp: N, atk: N, manaCost: N,\n  attackRange
const pattern2 = /manaCost: (\d+),\n(\s+)attackRange:/g;

function getActivateCost(manaCost) {
  if (manaCost <= 2) return 1;
  if (manaCost <= 4) return 2;
  return 3; // C5-C6
}

let count = 0;
src = src.replace(pattern1, (match, manaCostStr, indent) => {
  const manaCost = parseInt(manaCostStr);
  const aC = getActivateCost(manaCost);
  count++;
  return `manaCost: ${manaCost},\n${indent}activateCost: ${aC},\n${indent}attackRange:`;
});

fs.writeFileSync(filePath, src, 'utf-8');
console.log(`${count}件のactivateCost漏れを修正しました`);

// 検証: activateCost がないキャラカードを再チェック
const src2 = fs.readFileSync(filePath, 'utf-8');
const remaining = (src2.match(/manaCost: \d+,\n\s+attackRange:/g) || []);
if (remaining.length > 0) {
  console.error(`まだ${remaining.length}件の漏れがあります！`);
} else {
  console.log('全キャラカードにactivateCostが設定されています ✓');
}
