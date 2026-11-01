const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'data', 'cards.ts');
let content = fs.readFileSync(filePath, 'utf8');
let changeCount = 0;

function replaceFirst(old, newStr, label) {
  const idx = content.indexOf(old);
  if (idx === -1) {
    console.error(`[MISS] ${label}: not found`);
    console.error(`  Looking for: ${old.substring(0, 80)}...`);
    return false;
  }
  content = content.substring(0, idx) + newStr + content.substring(idx + old.length);
  changeCount++;
  console.log(`[OK] ${label}`);
  return true;
}

function replaceAll(old, newStr, label) {
  const count = content.split(old).length - 1;
  if (count === 0) {
    console.error(`[MISS] ${label}: not found`);
    return false;
  }
  content = content.split(old).join(newStr);
  changeCount++;
  console.log(`[OK] ${label} (${count} occurrences)`);
  return true;
}

// Helper: replace entire card block (from /** comment to };)
function replaceCardBlock(varName, newBlock, label) {
  // Find `const varName:`
  const constMarker = `const ${varName}:`;
  const constIdx = content.indexOf(constMarker);
  if (constIdx === -1) {
    console.error(`[MISS] ${label}: const ${varName} not found`);
    return false;
  }

  // Find comment start (search backward for /**)
  let blockStart = constIdx;
  const before = content.substring(Math.max(0, constIdx - 500), constIdx);
  const commentIdx = before.lastIndexOf('/**');
  if (commentIdx !== -1) {
    // Make sure there's no other const between the comment and this one
    const between = before.substring(commentIdx);
    if (!between.includes('const ') || between.indexOf('const ') === between.indexOf(constMarker.substring(6))) {
      blockStart = constIdx - (before.length - commentIdx);
    }
  }

  // Find block end (};)
  const endIdx = content.indexOf('};', constIdx);
  if (endIdx === -1) {
    console.error(`[MISS] ${label}: closing }; not found`);
    return false;
  }

  content = content.substring(0, blockStart) + newBlock + content.substring(endIdx + 2);
  changeCount++;
  console.log(`[OK] ${label}`);
  return true;
}

// =====================================================
// 1. aggro_01 (レイ): ATK+3 → ATK+1
// =====================================================
replaceFirst(
  "effect: 'buff_atk', value: 3,\n      description: 'ATK+3",
  "effect: 'buff_atk', value: 1,\n      description: 'ATK+1",
  'aggro01: ATK+3 -> ATK+1'
);

// =====================================================
// 2. aggro_02 (旧カグラ → 念連のナギ): Complete rewrite
// =====================================================
replaceCardBlock('aggro02', `/** ターン開始時、手札を1枚捨ててマナ+1。手札をマナに変換するエコノミーカード */
const aggro02: CharacterCard = {
  id: 'aggro_02',
  name: '念連のナギ',
  type: 'character',
  faction: 'aggro',
  element: 'geist',
  schoolClass: 'strategy',
  hp: 2,
  atk: 2,
  manaCost: 2,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_turn_start', target: 'self', effect: 'gain_mana', value: 1,
      description: 'ターン開始時、手札を1枚捨ててマナ+1（手札がなければ不発）' },
  ],
};`, 'aggro02: rename + new effect');

// =====================================================
// 3. aggro_03 (ジンガ → 烈火のカグラ): rename + element swap
// =====================================================
replaceCardBlock('aggro03', `/** 先制+召喚時に手札1枚を捨てて敵を押し出す。場を荒らす突撃兵 */
const aggro03: CharacterCard = {
  id: 'aggro_03',
  name: '烈火のカグラ',
  type: 'character',
  faction: 'aggro',
  element: 'faust',
  schoolClass: 'combat',
  hp: 2,
  atk: 2,
  manaCost: 2,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: ['quickness'],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'push', value: 2,
      description: '召喚時、手札を1枚捨てて敵1体を押し出す（壁なら2ダメージ。手札がなければ不発）' },
  ],
};`, 'aggro03: rename to カグラ + faust + hand cost');

// =====================================================
// 4. aggro_05 (ドク): 撃破時ATK+1, 攻撃後ATK-1
// =====================================================
replaceCardBlock('aggro05', `/** 敵を撃破するとATK+1。攻撃するたびATK-1。ハイリスクな狩人 */
const aggro05: CharacterCard = {
  id: 'aggro_05',
  name: '蝕牙のドク',
  type: 'character',
  faction: 'aggro',
  element: 'nacht',
  schoolClass: '\u5c04\u6483',
  hp: 2,
  atk: 2,
  manaCost: 2,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
      condition: { type: 'target_hp_lte', value: 0 },
      description: '攻撃後、敵を撃破していたらATK+1' },
    { trigger: 'on_attack', target: 'self', effect: 'debuff_atk', value: 1,
      description: '攻撃後、ATK-1' },
  ],
};`, 'aggro05: kill ATK+1, post-atk ATK-1');

// =====================================================
// 5. aggro_09 (ゼロ → 虚栄のゼロ): 召喚時手札捨て2ドロー
// =====================================================
replaceCardBlock('aggro09', `/** 召喚時に手札を1枚捨てて2枚ドロー。手札の質を入れ替える軽量ドローエンジン */
const aggro09: CharacterCard = {
  id: 'aggro_09',
  name: '虚栄のゼロ',
  type: 'character',
  faction: 'aggro',
  element: 'nicht',
  schoolClass: 'intel',
  hp: 2,
  atk: 1,
  manaCost: 1,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'self', effect: 'discard_draw', value: 1,
      description: '召喚時、手札を1枚捨てて2枚ドロー' },
  ],
};`, 'aggro09: discard_draw');

// =====================================================
// 6. aggro_11 (ハヤテ): ATK+1削除, front_left
// =====================================================
replaceCardBlock('aggro11', `/** 先制+L字攻撃。正面と左の2マスの敵全員に同時攻撃する */
const aggro11: CharacterCard = {
  id: 'aggro_11',
  name: '連撃のハヤテ',
  type: 'character',
  faction: 'aggro',
  element: 'licht',
  schoolClass: 'combat',
  hp: 2,
  atk: 1,
  manaCost: 2,
  activateCost: 1,
  attackRange: 'front_left',
  attackType: 'physical',
  keywords: ['quickness'],
  effects: [],
};`, 'aggro11: front_left, no ATK+1');

// =====================================================
// 7. aggro_12 (ノヴァ): aC+1 (C3 magic)
// =====================================================
replaceFirst(
  "name: '\u7206\u88c2\u306e\u30ce\u30f4\u30a1',\n  type: 'character',\n  faction: 'aggro',\n  element: 'nicht',\n  schoolClass: 'combat',\n  hp: 4,\n  atk: 3,\n  manaCost: 3,\n  activateCost: 2,",
  "name: '\u7206\u88c2\u306e\u30ce\u30f4\u30a1',\n  type: 'character',\n  faction: 'aggro',\n  element: 'nicht',\n  schoolClass: 'combat',\n  hp: 4,\n  atk: 3,\n  manaCost: 3,\n  activateCost: 3,",
  'aggro12: aC 2->3'
);

// =====================================================
// 8. tank_04 (シオン): ATK-1, remove buff/heal, ATK 3->2, aC+1
// =====================================================
replaceCardBlock('tank04', `/** 攻撃時に敵ATK-1。魔法で安全にデバフを撒く持久戦の達人 */
const tank04: CharacterCard = {
  id: 'tank_04',
  name: '念壁のシオン',
  type: 'character',
  faction: 'tank',
  element: 'geist',
  schoolClass: 'intel',
  hp: 4,
  atk: 2,
  manaCost: 3,
  activateCost: 3,
  attackRange: 'magic',
  attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_attack', target: 'target_enemy', effect: 'debuff_atk', value: 1,
      description: '攻撃後、対象のATK-1' },
  ],
};`, 'tank04: ATK2, debuff only, aC3');

// =====================================================
// 9. tank_07 (ミコト): HP1/ATK1, heal + draw
// =====================================================
replaceCardBlock('tank07', `/** 召喚時に隣接味方を1回復し、1枚ドロー。回復とドローの接続札 */
const tank07: CharacterCard = {
  id: 'tank_07',
  name: '\u7652\u3057\u306e\u30df\u30b3\u30c8',
  type: 'character',
  faction: 'tank',
  element: 'licht',
  schoolClass: 'medic',
  hp: 1,
  atk: 1,
  manaCost: 1,
  activateCost: 1,
  attackRange: 'magic',
  attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_ally', effect: 'heal', value: 1,
      description: '召喚時、隣接味方1体にHP1回復' },
    { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
      description: '召喚時、1ドロー' },
  ],
};`, 'tank07: HP1/ATK1, heal+draw');

// =====================================================
// 10. tank_09 (ムゲン): add blindPattern
// =====================================================
replaceFirst(
  "attackType: 'physical',\n  keywords: [],\n  effects: [\n    { trigger: 'on_damaged', target: 'self', effect: 'grant_dodge', value: 0,\n      condition: { type: 'attacked_from_front' },",
  "attackType: 'physical',\n  blindPattern: 'back_sides',\n  keywords: [],\n  effects: [\n    { trigger: 'on_damaged', target: 'self', effect: 'grant_dodge', value: 0,\n      condition: { type: 'attacked_from_front' },",
  'tank09: add blindPattern back_sides'
);

// =====================================================
// 11. tank_11 (ガレス): C4/aC3
// =====================================================
replaceFirst(
  "hp: 4,\n  atk: 3,\n  manaCost: 3,\n  activateCost: 2,\n  attackRange: 'front1',\n  attackType: 'physical',\n  keywords: ['protection', 'reflect'],",
  "hp: 4,\n  atk: 3,\n  manaCost: 4,\n  activateCost: 3,\n  attackRange: 'front1',\n  attackType: 'physical',\n  keywords: ['protection', 'reflect'],",
  'tank11: C4/aC3'
);

// =====================================================
// 12. tank_12 (モス): anchor削除, 手札→マナ+1
// =====================================================
replaceCardBlock('tank12', `/** 召喚時に手札1枚捨ててマナ+1。タンク陣営のマナ加速役 */
const tank12: CharacterCard = {
  id: 'tank_12',
  name: '\u82d4\u58c1\u306e\u30e2\u30b9',
  type: 'character',
  faction: 'tank',
  element: 'licht',
  schoolClass: 'medic',
  hp: 2,
  atk: 1,
  manaCost: 2,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'self', effect: 'gain_mana', value: 1,
      description: '召喚時、手札を1枚捨ててマナ+1（手札がなければ不発）' },
  ],
};`, 'tank12: mana conversion');

// =====================================================
// 13. control_01 (シズク): 惑わし→惑心
// =====================================================
replaceFirst(
  "\u60d1\u308f\u3057\u306e\u30b7\u30ba\u30af",
  "\u60d1\u5fc3\u306e\u30b7\u30ba\u30af",
  'control01: rename'
);

// =====================================================
// 14. control_04 (ゲッカ): front_row → front_left
// =====================================================
replaceFirst(
  "name: '\u5ff5\u65ad\u306e\u30b2\u30c3\u30ab',\n  type: 'character',\n  faction: 'control',\n  element: 'geist',\n  schoolClass: 'combat',\n  hp: 4,\n  atk: 3,\n  manaCost: 3,\n  activateCost: 2,\n  attackRange: 'front_row',",
  "name: '\u5ff5\u65ad\u306e\u30b2\u30c3\u30ab',\n  type: 'character',\n  faction: 'control',\n  element: 'geist',\n  schoolClass: 'combat',\n  hp: 4,\n  atk: 3,\n  manaCost: 3,\n  activateCost: 2,\n  attackRange: 'front_left',",
  'control04: front_left'
);

// =====================================================
// 15. control_06 (アルマ): field_swap → draw
// =====================================================
replaceCardBlock('control06', `/** 召喚時1ドロー。コントロール陣営のドロー加速接続札 */
const control06: CharacterCard = {
  id: 'control_06',
  name: '\u8755\u5909\u306e\u30a2\u30eb\u30de',
  type: 'character',
  faction: 'control',
  element: 'nacht',
  schoolClass: 'strategy',
  hp: 1,
  atk: 1,
  manaCost: 1,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
      description: '召喚時、1ドロー' },
  ],
};`, 'control06: draw C1');

// =====================================================
// 16. control_09 (スイ): HP1/ATK1
// =====================================================
replaceFirst(
  "name: '\u865a\u7a7a\u306e\u30b9\u30a4',\n  type: 'character',\n  faction: 'control',\n  element: 'nicht',\n  schoolClass: '\u5c04\u6483',\n  hp: 2,\n  atk: 2,",
  "name: '\u865a\u7a7a\u306e\u30b9\u30a4',\n  type: 'character',\n  faction: 'control',\n  element: 'nicht',\n  schoolClass: '\u5c04\u6483',\n  hp: 1,\n  atk: 1,",
  'control09: HP1/ATK1'
);

// =====================================================
// 17. control_11 (クロノ): aC+1 (C4 magic)
// =====================================================
replaceFirst(
  "hp: 4, atk: 2, manaCost: 4, activateCost: 2,\n  attackRange: 'magic', attackType: 'magic',",
  "hp: 4, atk: 2, manaCost: 4, activateCost: 3,\n  attackRange: 'magic', attackType: 'magic',",
  'control11: aC 2->3'
);

// =====================================================
// 18. synergy_01 (シルト): 防護付与 → 手札→マナ
// =====================================================
replaceCardBlock('synergy01', `/** 召喚時に手札1枚捨ててマナ+1。シナジー陣営のマナ加速札 */
const synergy01: CharacterCard = {
  id: 'synergy_01',
  name: '\u5b88\u7d0b\u306e\u30b7\u30eb\u30c8',
  type: 'character',
  faction: 'synergy',
  element: 'faust',
  schoolClass: 'strategy',
  hp: 2, atk: 1, manaCost: 1, activateCost: 1,
  attackRange: 'front1', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'self', effect: 'gain_mana', value: 1,
      description: '召喚時、手札を1枚捨ててマナ+1（手札がなければ不発）' },
  ],
};`, 'synergy01: mana conversion');

// =====================================================
// 19. synergy_09 (ネーベル): 被ダメ回避 → 召喚時1ドロー
// =====================================================
replaceCardBlock('synergy09', `/** 召喚時1ドロー。シナジー陣営のドロー加速接続札 */
const synergy09: CharacterCard = {
  id: 'synergy_09',
  name: '\u5e7b\u9727\u306e\u30cd\u30fc\u30d9\u30eb',
  type: 'character',
  faction: 'synergy',
  element: 'nicht',
  schoolClass: 'intel',
  hp: 2, atk: 1, manaCost: 1, activateCost: 1,
  attackRange: 'front1', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
      description: '召喚時、1ドロー' },
  ],
};`, 'synergy09: draw C1');

// =====================================================
// 20. snipe_04 (ヴァルト): aC+1 (C3 magic)
// =====================================================
replaceFirst(
  "hp: 4, atk: 3, manaCost: 3, activateCost: 2,\n  attackRange: 'magic', attackType: 'magic',\n  keywords: [],\n  effects: [\n    { trigger: 'on_attack', target: 'self', effect: 'grant_piercing', value: 1,\n      condition: { type: 'same_element_cell' },",
  "hp: 4, atk: 3, manaCost: 3, activateCost: 3,\n  attackRange: 'magic', attackType: 'magic',\n  keywords: [],\n  effects: [\n    { trigger: 'on_attack', target: 'self', effect: 'grant_piercing', value: 1,\n      condition: { type: 'same_element_cell' },",
  'snipe04: aC 2->3'
);

// =====================================================
// 21. snipe_06 (ニドル): 死角ATK+2 → 手札→マナ
// =====================================================
replaceCardBlock('snipe06', `/** 召喚時に手札1枚捨ててマナ+1。スナイプ陣営のマナ加速札 */
const snipe06: CharacterCard = {
  id: 'snipe_06',
  name: '\u8755\u5f3e\u306e\u30cb\u30c9\u30eb',
  type: 'character',
  faction: 'snipe',
  element: 'nacht',
  schoolClass: 'intel',
  hp: 1, atk: 1, manaCost: 1, activateCost: 1,
  attackRange: 'front1', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'self', effect: 'gain_mana', value: 1,
      description: '召喚時、手札を1枚捨ててマナ+1（手札がなければ不発）' },
  ],
};`, 'snipe06: mana conversion');

// =====================================================
// 22. trick_08 (ハク): 凍結 → 召喚時1ドロー
// =====================================================
replaceCardBlock('trick08', `/** 召喚時1ドロー。トリック陣営のドロー加速接続札 */
const trick08: CharacterCard = {
  id: 'trick_08',
  name: '\u77ac\u5149\u306e\u30cf\u30af',
  type: 'character',
  faction: 'trick',
  element: 'licht',
  schoolClass: '\u5c04\u6483',
  hp: 2,
  atk: 1,
  manaCost: 1,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
      description: '召喚時、1ドロー' },
  ],
};`, 'trick08: draw C1');

// =====================================================
// 23. trick_09 (カイト): 回転 → 手札→マナ
// =====================================================
replaceCardBlock('trick09', `/** 召喚時に手札1枚捨ててマナ+1。トリック陣営のマナ加速札 */
const trick09: CharacterCard = {
  id: 'trick_09',
  name: '\u865a\u9041\u306e\u30ab\u30a4\u30c8',
  type: 'character',
  faction: 'trick',
  element: 'nicht',
  schoolClass: 'intel',
  hp: 2,
  atk: 1,
  manaCost: 1,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'self', effect: 'gain_mana', value: 1,
      description: '召喚時、手札を1枚捨ててマナ+1（手札がなければ不発）' },
  ],
};`, 'trick09: mana conversion');

// =====================================================
// 24. ALL_CHARACTERS: trick_12 → trick_13
// =====================================================
replaceFirst(
  "trick11, trick12, // trick13",
  "trick11, trick13, // trick12",
  'ALL_CHARACTERS: swap trick12->trick13'
);

// =====================================================
// 25. Text fixes: 撃破時 → 撃破された時 (in descriptions)
// =====================================================
// Only fix descriptions, not trigger names or comments
replaceAll(
  "description: '\u6483\u7834\u6642\u3001",
  "description: '\u6483\u7834\u3055\u308c\u305f\u6642\u3001",
  'text: 撃破時→撃破された時'
);

// Write the result
fs.writeFileSync(filePath, content, 'utf8');
console.log(`\nDone! ${changeCount} changes applied.`);
