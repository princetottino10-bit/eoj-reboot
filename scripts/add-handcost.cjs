/**
 * カードデータにhandCostフィールドを追加するスクリプト
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'data', 'cards.ts');
let content = fs.readFileSync(filePath, 'utf-8');

const replacements = [
  // ナギ (aggro_02): on_turn_start gain_mana - handCost: 1
  {
    old: "{ trigger: 'on_turn_start', target: 'self', effect: 'gain_mana', value: 1,\n      description: 'ターン開始時、手札を1枚捨ててマナ+1（手札がなければ不発）' }",
    new: "{ trigger: 'on_turn_start', target: 'self', effect: 'gain_mana', value: 1, handCost: 1,\n      description: 'ターン開始時、手札を1枚捨ててマナ+1（手札がなければ不発）' }",
  },
  // カグラ (aggro_03): on_summon push - handCost: 1
  {
    old: "{ trigger: 'on_summon', target: 'target_enemy', effect: 'push', value: 2,\n      description: '召喚時、手札を1枚捨てて敵1体を押し出す（壁なら2ダメージ。手札がなければ不発）' }",
    new: "{ trigger: 'on_summon', target: 'target_enemy', effect: 'push', value: 2, handCost: 1,\n      description: '召喚時、手札を1枚捨てて敵1体を押し出す（壁なら2ダメージ。手札がなければ不発）' }",
  },
  // ゼロ (aggro_09): on_summon discard_draw - handCost: 1
  {
    old: "{ trigger: 'on_summon', target: 'self', effect: 'discard_draw', value: 1,\n      description: '召喚時、手札を1枚捨てて2枚ドロー' }",
    new: "{ trigger: 'on_summon', target: 'self', effect: 'discard_draw', value: 1, handCost: 1,\n      description: '召喚時、手札を1枚捨てて2枚ドロー' }",
  },
];

// 「召喚時、手札を1枚捨ててマナ+1」のパターン（シルト、ニドル、カイト、モス）
// これらは全て同じeffect行構造
const manaPattern = "{ trigger: 'on_summon', target: 'self', effect: 'gain_mana', value: 1,\n      description: '召喚時、手札を1枚捨ててマナ+1（手札がなければ不発）' }";
const manaReplacement = "{ trigger: 'on_summon', target: 'self', effect: 'gain_mana', value: 1, handCost: 1,\n      description: '召喚時、手札を1枚捨ててマナ+1（手札がなければ不発）' }";

// アイテム: discard_draw (手札2枚捨てて3枚ドロー)
replacements.push({
  old: "{ trigger: 'on_use', target: 'self', effect: 'discard_draw', value: 2,\n      description: '使用時: 手札を2枚捨てて3枚ドロー' }",
  new: "{ trigger: 'on_use', target: 'self', effect: 'discard_draw', value: 2, handCost: 2,\n      description: '使用時: 手札を2枚捨てて3枚ドロー' }",
});

// アイテム: 手札1枚捨てて再行動
replacements.push({
  old: "{ trigger: 'on_use', target: 'target_ally', effect: 'buff_atk', value: 0,\n      description: '使用時: 手札を1枚捨てて味方1体を再行動可能にする' }",
  new: "{ trigger: 'on_use', target: 'target_ally', effect: 'buff_atk', value: 0, handCost: 1,\n      description: '使用時: 手札を1枚捨てて味方1体を再行動可能にする' }",
});

// アイテム: 手札2枚捨ててマナ+3
replacements.push({
  old: "{ trigger: 'on_use', target: 'self', effect: 'gain_mana', value: 3,\n      description: '使用時: 手札を2枚捨ててマナ+3' }",
  new: "{ trigger: 'on_use', target: 'self', effect: 'gain_mana', value: 3, handCost: 2,\n      description: '使用時: 手札を2枚捨ててマナ+3' }",
});

// 召喚時手札最大2枚捨てダメージ
replacements.push({
  old: "{ trigger: 'on_summon', target: 'target_enemy', effect: 'damage', value: 0,\n      description: '召喚時、手札を最大2枚捨て、捨てた枚数だけ敵1体にダメージ' }",
  new: "{ trigger: 'on_summon', target: 'target_enemy', effect: 'damage', value: 0, handCost: 2,\n      description: '召喚時、手札を最大2枚捨て、捨てた枚数だけ敵1体にダメージ' }",
});

let count = 0;

// Apply unique replacements
for (const r of replacements) {
  if (content.includes(r.old)) {
    content = content.replace(r.old, r.new);
    count++;
  } else {
    console.log('NOT FOUND:', r.old.substring(0, 60));
  }
}

// Apply repeated pattern (gain_mana with hand discard on_summon) - replace all occurrences
while (content.includes(manaPattern)) {
  content = content.replace(manaPattern, manaReplacement);
  count++;
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log(`Done: ${count} replacements made`);
