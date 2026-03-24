const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'data', 'cards.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Replace item sets section
const setStart = content.indexOf('// ========================================\n// アイテムセット (4セット');
const setEnd = content.indexOf("} as const;\n", setStart);

if (setStart === -1 || setEnd === -1) {
  console.error('Item set section not found');
  process.exit(1);
}

const newSets = `// ========================================
// アイテムセット (4セット × 6枚)
// 全デッキ共通: マナ加速(item02) + ドロー(item01)
// 残り4枠がデッキコンセプトを決める
// ========================================

/** セットA: バランス型 — 回復・バフ・除去・妨害を1枚ずつ */
export const ITEM_SET_A: ItemCard[] = [
  item02, // マナ結晶 (マナ+1)
  item01, // 緊急補給 (1ドロー)
  item03, // 応急キット (HP3回復)
  item04, // 強化弾 (ATK+2)
  item06, // 手榴弾 (2ダメージ)
  item09, // 封印の札 (封印+回転)
];

/** セットB: アグレッシブ型 — 火力・貫通・再行動で畳み掛ける */
export const ITEM_SET_B: ItemCard[] = [
  item02, // マナ結晶 (マナ+1)
  item01, // 緊急補給 (1ドロー)
  item16, // 貫通砲 (貫通2ダメージ)
  item04, // 強化弾 (ATK+2)
  item26, // 奮起の号令 (手札1枚→再行動)
  item06, // 手榴弾 (2ダメージ)
];

/** セットC: コントロール型 — 封印・凍結・回転・位置入替で盤面を支配 */
export const ITEM_SET_C: ItemCard[] = [
  item02, // マナ結晶 (マナ+1)
  item01, // 緊急補給 (1ドロー)
  item13, // 氷結弾 (凍結)
  item09, // 封印の札 (封印+回転)
  item14, // 拘束鎖 (回転+向き固定)
  item17, // 転送装置 (敵位置入替)
];

/** セットD: リソース型 — 手札交換・マナ変換・地形操作でアドバンテージ */
export const ITEM_SET_D: ItemCard[] = [
  item02, // マナ結晶 (マナ+1)
  item01, // 緊急補給 (1ドロー)
  item25, // 手札交換 (2枚捨て3枚ドロー)
  item28, // マナ増幅器 (マナ+2&1ドロー)
  item15, // 虚無の種 (マス属性変更)
  item03, // 応急キット (HP3回復)
];`;

content = content.substring(0, setStart) + newSets + content.substring(setEnd + "} as const;\n".length);

fs.writeFileSync(filePath, content, 'utf8');
console.log('[OK] Item sets redesigned (4 decks x 6 cards, mana+draw shared)');
