const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'data', 'cards.ts');
let content = fs.readFileSync(filePath, 'utf8');

// =====================================================
// 1. Update existing items: マナ結晶 +1→+2, 緊急補給 1→2ドロー
// =====================================================
// item01: 緊急補給 draw 1→2
content = content.replace(
  "name: '\u7dca\u6025\u88dc\u7d66',\n  type: 'item',\n  manaCost: 0,\n  effects: [\n    { trigger: 'on_use', target: 'self', effect: 'draw', value: 1 },",
  "name: '\u7dca\u6025\u88dc\u7d66',\n  type: 'item',\n  manaCost: 0,\n  effects: [\n    { trigger: 'on_use', target: 'self', effect: 'draw', value: 2,\n      description: '2\u679a\u30c9\u30ed\u30fc' },",
);
console.log('[OK] item01: draw 1->2');

// item02: マナ結晶 mana 1→2
content = content.replace(
  "name: '\u30de\u30ca\u7d50\u6676',\n  type: 'item',\n  manaCost: 0,\n  effects: [\n    { trigger: 'on_use', target: 'self', effect: 'gain_mana', value: 1 },",
  "name: '\u30de\u30ca\u7d50\u6676',\n  type: 'item',\n  manaCost: 0,\n  effects: [\n    { trigger: 'on_use', target: 'self', effect: 'gain_mana', value: 2,\n      description: '\u30de\u30ca+2' },",
);
console.log('[OK] item02: mana 1->2');

// =====================================================
// 2. Add new item cards
// =====================================================
const newItems = `
/** コスト2。属性一致で手札のキャラと場のキャラを入替える */
const item_element_swap: ItemCard = {
  id: 'item_element_swap',
  name: '\u5c5e\u6027\u53ec\u559a',
  type: 'item',
  manaCost: 2,
  effects: [
    { trigger: 'on_use', target: 'target_ally', effect: 'swap', value: 0,
      description: '\u5c5e\u6027\u4e00\u81f4\u3067\u624b\u672d\u306e\u30ad\u30e3\u30e9\u3068\u5834\u306e\u30ad\u30e3\u30e9\u3092\u5165\u66ff\u3048\u308b' },
  ],
};

/** コスト2。敵C2以下のキャラを持ち主の手札に戻す */
const item_bounce_enemy: ItemCard = {
  id: 'item_bounce_enemy',
  name: '\u5e30\u9084\u306e\u98a8',
  type: 'item',
  manaCost: 2,
  effects: [
    { trigger: 'on_use', target: 'target_enemy', effect: 'move', value: 0,
      description: '\u6575C2\u4ee5\u4e0b\u306e\u30ad\u30e3\u30e9\u3092\u6301\u3061\u4e3b\u306e\u624b\u672d\u306b\u623b\u3059' },
  ],
};

/** コスト1。味方1体を手札に戻す（再召喚でon_summon再発動） */
const item_self_bounce: ItemCard = {
  id: 'item_self_bounce',
  name: '\u518d\u8d77\u306e\u5370',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_ally', effect: 'move', value: 0,
      description: '\u5473\u65b91\u4f53\u3092\u624b\u672d\u306b\u623b\u3059\uff08\u518d\u53ec\u559a\u3067\u52b9\u679c\u518d\u767a\u52d5\uff09' },
  ],
};

/** コスト1。味方1体を再行動可能にする */
const item_reactivate: ItemCard = {
  id: 'item_reactivate',
  name: '\u6b21\u5143\u6b6a\u66f2',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_ally', effect: 'reduce_activate_cost', value: 99,
      description: '\u5473\u65b91\u4f53\u3092\u518d\u884c\u52d5\u53ef\u80fd\u306b\u3059\u308b' },
  ],
};

/** コスト1。任意のマスの属性を好きな属性に変更 */
const item_element_write: ItemCard = {
  id: 'item_element_write',
  name: '\u5730\u8108\u66f8\u63db',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_cell', effect: 'field_swap', value: 0,
      description: '\u4efb\u610f\u306e\u30de\u30b9\u306e\u5c5e\u6027\u3092\u597d\u304d\u306a\u5c5e\u6027\u306b\u5909\u66f4' },
  ],
};

/** コスト1。味方1体に【防護】を付与 */
const item_grant_protection: ItemCard = {
  id: 'item_grant_protection',
  name: '\u52a0\u8b77\u306e\u7d0b\u7ae0',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_ally', effect: 'grant_protection', value: 1,
      description: '\u5473\u65b91\u4f53\u306b\u3010\u9632\u8b77\u3011\u3092\u4ed8\u4e0e' },
  ],
};

/** コスト1。味方1体に【貫通】を付与 */
const item_grant_piercing: ItemCard = {
  id: 'item_grant_piercing',
  name: '\u8cab\u901a\u306e\u77e2',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_ally', effect: 'grant_piercing', value: 1,
      description: '\u5473\u65b91\u4f53\u306b\u3010\u8cab\u901a\u3011\u3092\u4ed8\u4e0e' },
  ],
};
`;

// Insert new items before the ALL_ITEMS array
const allItemsMarker = 'export const ALL_ITEMS: ItemCard[] = [';
const allItemsIdx = content.indexOf(allItemsMarker);
if (allItemsIdx === -1) { console.error('ALL_ITEMS not found'); process.exit(1); }
content = content.substring(0, allItemsIdx) + newItems + '\n' + content.substring(allItemsIdx);
console.log('[OK] New items added');

// =====================================================
// 3. Update ALL_ITEMS to include new items
// =====================================================
const oldAllItems = content.match(/export const ALL_ITEMS: ItemCard\[\] = \[[\s\S]*?\];/);
if (!oldAllItems) { console.error('ALL_ITEMS pattern not found'); process.exit(1); }

const newAllItems = `export const ALL_ITEMS: ItemCard[] = [
  item01, item02, item03, item04, item05, item06,
  item07, item08, item09, item10, item11, item12,
  item13, item14, item15, item16, item17, item18,
  item20, item21, item22, item23, item24,
  item25, item26, item27, item28, item29, item30,
  item_element_swap, item_bounce_enemy, item_self_bounce,
  item_reactivate, item_element_write, item_grant_protection, item_grant_piercing,
];`;
content = content.replace(oldAllItems[0], newAllItems);
console.log('[OK] ALL_ITEMS updated');

// =====================================================
// 4. Replace item sets
// =====================================================
const setsStart = content.indexOf('// ========================================\n// \u30a2\u30a4\u30c6\u30e0\u30bb\u30c3\u30c8');
const setsEndMarker = '} as const;';
const setsEndIdx = content.indexOf(setsEndMarker, setsStart);
if (setsStart === -1 || setsEndIdx === -1) { console.error('Item sets not found'); process.exit(1); }

const newSets = `// ========================================
// \u30a2\u30a4\u30c6\u30e0\u30bb\u30c3\u30c8 (4\u30bb\u30c3\u30c8 \u00d7 6\u679a)
// \u5171\u901a: \u30de\u30ca\u7d50\u6676(\u30de\u30ca+2) + \u7dca\u6025\u88dc\u7d66(2\u30c9\u30ed\u30fc)
// ========================================

/** \u30bb\u30c3\u30c8A: \u6a5f\u52d5\u578b \u2014 \u30d0\u30a6\u30f3\u30b9+\u518d\u53ec\u559a\u3067on_summon\u4f7f\u3044\u56de\u3057\u3001\u518d\u884c\u52d5\u3067\u8ffd\u6483 */
export const ITEM_SET_A: ItemCard[] = [
  item02, // \u30de\u30ca\u7d50\u6676 (\u30de\u30ca+2)
  item01, // \u7dca\u6025\u88dc\u7d66 (2\u30c9\u30ed\u30fc)
  item_self_bounce, // \u518d\u8d77\u306e\u5370 (\u5473\u65b9\u2192\u624b\u672d)
  item_element_swap, // \u5c5e\u6027\u53ec\u559a (\u5c5e\u6027\u4e00\u81f4\u4ea4\u63db)
  item20, // \u6df7\u4e71\u30ac\u30b9 (90\u00b0\u56de\u8ee2)
  item_reactivate, // \u6b21\u5143\u6b6a\u66f2 (\u518d\u884c\u52d5)
];

/** \u30bb\u30c3\u30c8B: \u5f37\u5316\u578b \u2014 \u30de\u30fc\u30ab\u30fc+ATK\u30d0\u30d5+\u56de\u5fa9\u3067\u6b63\u9762\u304b\u3089\u6bbf\u308a\u52dd\u3064 */
export const ITEM_SET_B: ItemCard[] = [
  item02, // \u30de\u30ca\u7d50\u6676 (\u30de\u30ca+2)
  item01, // \u7dca\u6025\u88dc\u7d66 (2\u30c9\u30ed\u30fc)
  item04, // \u5f37\u5316\u5f3e (ATK+2)
  item_grant_protection, // \u52a0\u8b77\u306e\u7d0b\u7ae0 (\u9632\u8b77\u4ed8\u4e0e)
  item_grant_piercing, // \u8cab\u901a\u306e\u77e2 (\u8cab\u901a\u4ed8\u4e0e)
  item03, // \u5fdc\u6025\u30ad\u30c3\u30c8 (HP3\u56de\u5fa9)
];

/** \u30bb\u30c3\u30c8C: \u59a8\u5bb3\u578b \u2014 \u30d0\u30a6\u30f3\u30b9+\u56de\u8ee2+\u5411\u304d\u56fa\u5b9a\u3067\u76e4\u9762\u3092\u5d29\u3059 */
export const ITEM_SET_C: ItemCard[] = [
  item02, // \u30de\u30ca\u7d50\u6676 (\u30de\u30ca+2)
  item01, // \u7dca\u6025\u88dc\u7d66 (2\u30c9\u30ed\u30fc)
  item_bounce_enemy, // \u5e30\u9084\u306e\u98a8 (\u6575C2\u4ee5\u4e0b\u30d0\u30a6\u30f3\u30b9)
  item14, // \u62d8\u675f\u93c8 (\u56de\u8ee2+\u5411\u304d\u56fa\u5b9a)
  item20, // \u6df7\u4e71\u30ac\u30b9 (90\u00b0\u56de\u8ee2)
  item_element_write, // \u5730\u8108\u66f8\u63db (\u5c5e\u6027\u5909\u66f4)
];

/** \u30bb\u30c3\u30c8D: \u30ea\u30bd\u30fc\u30b9\u578b \u2014 \u30c9\u30ed\u30fc\u00d73\u679a\u4f53\u5236+\u5c5e\u6027\u4ea4\u63db\u3067\u30ea\u30bd\u30fc\u30b9\u5dee\u3067\u5727\u6bba */
export const ITEM_SET_D: ItemCard[] = [
  item02, // \u30de\u30ca\u7d50\u6676 (\u30de\u30ca+2)
  item01, // \u7dca\u6025\u88dc\u7d66 (2\u30c9\u30ed\u30fc)
  item25, // \u624b\u672d\u4ea4\u63db (2\u6368\u30663\u30c9\u30ed\u30fc)
  item_element_swap, // \u5c5e\u6027\u53ec\u559a (\u5c5e\u6027\u4e00\u81f4\u4ea4\u63db)
  item_reactivate, // \u6b21\u5143\u6b6a\u66f2 (\u518d\u884c\u52d5)
  item03, // \u5fdc\u6025\u30ad\u30c3\u30c8 (HP3\u56de\u5fa9)
];`;

content = content.substring(0, setsStart) + newSets + '\n\n' + content.substring(setsEndIdx + setsEndMarker.length);
console.log('[OK] Item sets replaced');

// =====================================================
// 5. Kaiser: add adjacent summon draw trigger
// =====================================================
// Find Kaiser's effects array and add the draw-on-adjacent-summon
// Current last effect is range_expand
const kaiserDrawOld = "description: '\u624b\u672d0\u679a\u306e\u6642\u3001\u653b\u6483\u7bc4\u56f2\u304c\u524d\u5f8c\u5de6\u53f3(\u5341\u5b57)\u306b\u62e1\u5f35' },";
const kaiserDrawNew = "description: '\u624b\u672d0\u679a\u306e\u6642\u3001\u653b\u6483\u7bc4\u56f2\u304c\u524d\u5f8c\u5de6\u53f3(\u5341\u5b57)\u306b\u62e1\u5f35' },\n    { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,\n      description: '\u30ab\u30a4\u30b6\u30fc\u306e\u96a3\u63a5\u30de\u30b9\u306b\u30ad\u30e3\u30e9\u304c\u53ec\u559a\u3055\u308c\u305f\u6642\u30011\u679a\u30c9\u30ed\u30fc\uff08\u30d1\u30c3\u30b7\u30d6\uff09' },";
if (content.includes(kaiserDrawOld)) {
  content = content.replace(kaiserDrawOld, kaiserDrawNew);
  console.log('[OK] Kaiser: adjacent summon draw added');
} else {
  console.error('[MISS] Kaiser draw effect not found');
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('\nDone!');
