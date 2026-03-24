/**
 * カードデータ一括更新スクリプト v2
 * 14カード修正 + カイザー追加変更 + ミスズ最終変更 + ミラージュ壁ダメ削除
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'data', 'cards.ts');
let src = fs.readFileSync(filePath, 'utf-8');

function replace(label, oldStr, newStr) {
  const idx = src.indexOf(oldStr);
  if (idx === -1) {
    console.error(`[FAIL] ${label}: old string not found`);
    console.error(`  Looking for: ${oldStr.substring(0, 80)}...`);
    return false;
  }
  // Check uniqueness
  const secondIdx = src.indexOf(oldStr, idx + 1);
  if (secondIdx !== -1) {
    console.error(`[WARN] ${label}: old string found multiple times, replacing first occurrence`);
  }
  src = src.substring(0, idx) + newStr + src.substring(idx + oldStr.length);
  console.log(`[OK] ${label}`);
  return true;
}

// ============================================================
// 1. シルト (synergy_01): 味方なしなら不発に変更
// ============================================================
replace('synergy_01 description',
  `description: '召喚時、隣接味方1体に【防護】を与える（味方なしなら自分）' },`,
  `description: '召喚時、隣接味方1体に【防護】を与える（味方なしなら不発）' },`
);

// ============================================================
// 2. ツムギ (synergy_03): 隣接味方全員→1体
// ============================================================
replace('synergy_03 target+desc',
  `{ trigger: 'on_summon', target: 'adjacent_allies', effect: 'grant_dodge', value: 1,
      condition: { type: 'ally_count_gte', value: 2 },
      description: '召喚時、味方2体以上なら隣接味方全員に【回避】を与える' },`,
  `{ trigger: 'on_summon', target: 'target_ally', effect: 'grant_dodge', value: 1,
      condition: { type: 'ally_count_gte', value: 2 },
      description: '召喚時、味方2体以上なら隣接味方1体に【回避】を与える' },`
);

// ============================================================
// 3. コダマ (synergy_04): 2個→1個（自分or味方1体）
// ============================================================
replace('synergy_04 effects',
  `effects: [
    { trigger: 'on_summon', target: 'self', effect: 'grant_piercing', value: 1,
      description: '召喚時、自分に【貫通】を得る' },
    { trigger: 'on_summon', target: 'target_ally', effect: 'grant_piercing', value: 1,
      condition: { type: 'ally_count_gte', value: 1 },
      description: '隣接味方がいればその味方1体にも【貫通】を与える' },
  ],`,
  `effects: [
    { trigger: 'on_summon', target: 'target_ally', effect: 'grant_piercing', value: 1,
      description: '召喚時、自分または隣接味方1体に【貫通】を与える' },
  ],`
);

// ============================================================
// 4. シュウ (synergy_06): 隣接味方全員→1体
// ============================================================
replace('synergy_06 target+desc',
  `{ trigger: 'on_destroyed', target: 'adjacent_allies', effect: 'grant_quickness', value: 1,
      description: '撃破された時、隣接味方全員に【先制】を与える' },`,
  `{ trigger: 'on_destroyed', target: 'target_ally', effect: 'grant_quickness', value: 1,
      description: '撃破された時、隣接味方1体に【先制】を与える' },`
);

// ============================================================
// 5. ユズリハ (synergy_12): 全員→1体 + ドロー削除
// ============================================================
replace('synergy_12 effects',
  `effects: [
    { trigger: 'on_destroyed', target: 'adjacent_allies', effect: 'grant_protection', value: 1,
      description: '撃破された時、隣接味方全員に【防護】を与える' },
    { trigger: 'on_destroyed', target: 'self', effect: 'draw', value: 1,
      description: '撃破された時、1枚ドロー' },
  ],`,
  `effects: [
    { trigger: 'on_destroyed', target: 'target_ally', effect: 'grant_protection', value: 1,
      description: '撃破された時、隣接味方1体に【防護】を与える' },
  ],`
);

// ============================================================
// 6. アルス (synergy_10): マーカーを全て自分に集める
// ============================================================
replace('synergy_10 comment',
  `/** 【盟約の収穫】味方のマーカーを消費→反撃不可+ATK+回転。シナジーの顔 */`,
  `/** 【盟約の収穫】味方のマーカーを全て自分に集め、数に応じてATK上昇。シナジーの顔 */`
);
replace('synergy_10 effects',
  `effects: [
    { trigger: 'on_summon', target: 'self', effect: 'consume_markers', value: 0,
      description: '召喚時、味方のマーカーを任意数消費。1個以上:反撃不可、2個以上:ATK+2、3個以上:対象を90°回転、4個以上:さらにATK+2' },
  ],`,
  `effects: [
    { trigger: 'on_summon', target: 'self', effect: 'consume_markers', value: 0,
      description: '召喚時、味方のマーカーを全て自分に集める。2個以上:ATK+2、4個以上:さらにATK+2' },
  ],`
);

// ============================================================
// 7. ライカ (aggro_04): ATK 2→1
// ============================================================
replace('aggro_04 atk',
  `id: 'aggro_04',
  name: '雷鳴のライカ',
  type: 'character',
  faction: 'aggro',
  element: 'geist',
  schoolClass: '射撃',
  hp: 2,
  atk: 2,
  manaCost: 1,`,
  `id: 'aggro_04',
  name: '雷鳴のライカ',
  type: 'character',
  faction: 'aggro',
  element: 'geist',
  schoolClass: '射撃',
  hp: 2,
  atk: 1,
  manaCost: 1,`
);

// ============================================================
// 8. カイザー (aggro_10): 全面リワーク
//    - 味方1体破壊→ATKコピー（最低+2）
//    - 任意枚数デッキ戻し→1枚以上で攻撃コスト-2
//    - 隣接にキャラ召喚時1ドロー
//    - 手札0で十字拡張（維持）
// ============================================================
replace('aggro_10 full',
  `const aggro10: CharacterCard = {
  id: 'aggro_10',
  name: '覇王のカイザー',
  type: 'character',
  faction: 'aggro',
  element: 'nicht',
  schoolClass: 'strategy',
  hp: 7,
  atk: 4,
  manaCost: 5,
  activateCost: 3,
  attackRange: 'front_back',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_ally', effect: 'destroy_self', value: 0,
      description: '召喚時、味方1体を破壊する' },
    { trigger: 'on_summon', target: 'self', effect: 'buff_atk', value: 4,
      description: '破壊した味方のATK分だけATK増加（最低+4）' },
    { trigger: 'on_turn_start', target: 'self', effect: 'skip_draw', value: 0,
      description: '【選択】ドロー返上: 手札1枚をデッキに戻すと、このターンの攻撃コスト-2（回転は対象外）' },
    { trigger: 'on_turn_start', target: 'self', effect: 'reduce_activate_cost', value: 2,
      description: '' },
    { trigger: 'on_attack', target: 'self', effect: 'range_expand', value: 0,
      condition: { type: 'hand_count_lte', value: 0 },
      description: '手札0枚の時、攻撃範囲が前後左右(十字)に拡張' },
  ],
};`,
  `const aggro10: CharacterCard = {
  id: 'aggro_10',
  name: '覇王のカイザー',
  type: 'character',
  faction: 'aggro',
  element: 'nicht',
  schoolClass: 'strategy',
  hp: 7,
  atk: 4,
  manaCost: 5,
  activateCost: 3,
  attackRange: 'front_back',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_ally', effect: 'destroy_self', value: 0,
      description: '召喚時、味方1体を破壊する' },
    { trigger: 'on_summon', target: 'self', effect: 'copy_atk', value: 2,
      description: '破壊した味方のATKを自分に加算（最低+2）' },
    { trigger: 'on_turn_start', target: 'self', effect: 'discard_draw', value: 99,
      description: '【選択】手札から任意の枚数をデッキに戻す。1枚以上戻したら攻撃コスト-2' },
    { trigger: 'on_turn_start', target: 'self', effect: 'reduce_activate_cost', value: 2,
      description: '' },
    { trigger: 'on_summon', target: 'self', effect: 'draw', value: 0,
      description: 'カイザーの隣にキャラが召喚された時、1枚ドロー（パッシブ）' },
    { trigger: 'on_attack', target: 'self', effect: 'range_expand', value: 0,
      condition: { type: 'hand_count_lte', value: 0 },
      description: '手札0枚の時、攻撃範囲が前後左右(十字)に拡張' },
  ],
};`
);

// ============================================================
// 9. ミスズ (control_07): 洗脳+全洗脳キャラ攻撃可能、回転削除
// ============================================================
replace('control_07 full',
  `const control07: CharacterCard = {
  id: 'control_07',
  name: '蝕心のミスズ',
  type: 'character',
  faction: 'control',
  element: 'licht',
  schoolClass: 'medic',
  hp: 6,
  atk: 4,
  manaCost: 6,
  attackRange: 'magic',
  attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'brainwash', value: 99,
      description: '召喚時、敵1体を洗脳（ミスズがいる限り持続）' },
    { trigger: 'on_summon', target: 'target_enemy', effect: 'rotate', value: 2,
      description: 'その敵を180°回転' },
    { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 0,
      description: '攻撃時、洗脳中の敵も攻撃対象に含められる' },
  ],
};`,
  `const control07: CharacterCard = {
  id: 'control_07',
  name: '蝕心のミスズ',
  type: 'character',
  faction: 'control',
  element: 'licht',
  schoolClass: 'medic',
  hp: 6,
  atk: 4,
  manaCost: 6,
  activateCost: 3,
  attackRange: 'magic',
  attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'brainwash', value: 99,
      description: '召喚時、敵1体を洗脳（ミスズがいる限り持続）' },
    { trigger: 'on_attack', target: 'all_enemies', effect: 'damage', value: 0,
      description: '洗脳状態の敵全員に攻撃できる' },
  ],
};`
);

// ============================================================
// 10. ロア (control_12): descriptionテキスト明確化
// ============================================================
replace('control_12 desc',
  `description: '攻撃時、対象マスとnichtマスの属性を入替' },`,
  `description: '攻撃時、攻撃した敵がいるマスの属性と、盤面上の虚(nicht)マスの属性を入れ替える' },`
);

// ============================================================
// 11. カゲロウ (trick_03): C4→C3
// ============================================================
replace('trick_03 cost',
  `hp: 2, atk: 2, manaCost: 4,
  attackRange: 'front1', attackType: 'physical',`,
  `hp: 2, atk: 2, manaCost: 3,
  attackRange: 'front1', attackType: 'physical',`
);

// ============================================================
// 12. ジェミニ (trick_12): 攻撃前にHP交換
// ============================================================
replace('trick_12 desc',
  `description: '自HP50%以下の時、攻撃で対象とHP交換' },`,
  `description: '自HP50%以下の時、攻撃前に対象とHP交換してから攻撃する' },`
);

// ============================================================
// 13. ミラージュ (trick_07): dodge付与 + 壁ダメージ削除
// ============================================================
replace('trick_07 full',
  `const trick07: CharacterCard = {
  id: 'trick_07',
  name: '光遁のミラージュ',
  type: 'character',
  faction: 'trick',
  element: 'licht',
  schoolClass: 'medic',
  hp: 4,
  atk: 3,
  manaCost: 3,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'push', value: 3,
      description: '召喚時、敵1体を押し出す（壁なら3ダメージ）' },
  ],
};`,
  `const trick07: CharacterCard = {
  id: 'trick_07',
  name: '光遁のミラージュ',
  type: 'character',
  faction: 'trick',
  element: 'licht',
  schoolClass: 'medic',
  hp: 4,
  atk: 3,
  manaCost: 3,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: ['dodge'],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'push', value: 0,
      description: '召喚時、敵1体を押し出す' },
  ],
};`
);

// ============================================================
// 14. ゼクス (snipe_10): 四隅条件削除
// ============================================================
replace('snipe_10 desc',
  `description: '自属性マスかつ四隅にいるならATK+1' },`,
  `description: '自属性マスにいるならATK+1' },`
);

// ============================================================
// synergy_03 コメント修正
// ============================================================
replace('synergy_03 comment',
  `/** 召喚時、味方2体以上なら隣接味方全員に【回避】。条件付き多体付与 */`,
  `/** 召喚時、味方2体以上なら隣接味方1体に【回避】。条件付き付与 */`
);

// synergy_04 コメント修正
replace('synergy_04 comment',
  `/** 召喚時、自分に【貫通】。隣接味方がいればその味方1体にも【貫通】 */`,
  `/** 召喚時、自分または隣接味方1体に【貫通】を与える */`
);

// synergy_06 コメント修正
replace('synergy_06 comment',
  `/** 撃破された時、隣接味方全員に【先制】を与える。犠牲の接続札 */`,
  `/** 撃破された時、隣接味方1体に【先制】を与える。犠牲の接続札 */`
);

// Write result
fs.writeFileSync(filePath, src, 'utf-8');
console.log('\n=== cards.ts 更新完了 ===');
