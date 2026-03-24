/**
 * カードデータをtemp-cards.jsonに書き出す
 * Usage: npx vite-node scripts/export-cards-json.ts
 */
import { writeFileSync } from 'fs';
import { ALL_CHARACTERS, ITEM_SETS } from '../src/data/cards';

const factions = ['aggro', 'tank', 'control', 'synergy', 'snipe', 'trick'];
const data: Record<string, any[]> = {};

for (const f of factions) {
  data[f] = ALL_CHARACTERS
    .filter(c => c.faction === f)
    .sort((a, b) => a.manaCost - b.manaCost)
    .map(c => ({
      id: c.id,
      name: c.name,
      faction: c.faction,
      element: c.element,
      schoolClass: c.schoolClass,
      hp: c.hp,
      atk: c.atk,
      manaCost: c.manaCost,
      activateCost: c.activateCost ?? 3,
      attackRange: c.attackRange,
      attackType: c.attackType,
      blindPattern: c.blindPattern,
      keywords: c.keywords,
      effects: c.effects,
    }));
}

// アイテム: 全セットのアイテムをユニーク化
const seenItems = new Set<string>();
const items: any[] = [];
for (const [setKey, setItems] of Object.entries(ITEM_SETS)) {
  for (const item of setItems) {
    if (!seenItems.has(item.id)) {
      seenItems.add(item.id);
      items.push({
        id: item.id,
        name: item.name,
        manaCost: item.manaCost,
        freeAction: (item as any).freeAction,
        effects: item.effects,
      });
    }
  }
}
data.items = items;

writeFileSync('temp-cards.json', JSON.stringify(data, null, 2), 'utf-8');
console.log('temp-cards.json 生成完了');
for (const f of factions) {
  console.log(`  ${f}: ${data[f].length}枚`);
}
console.log(`  items: ${items.length}枚`);
