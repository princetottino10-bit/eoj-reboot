import type { CharacterCard, ItemCard, Card, Element } from '../types/card';

// ========================================
// v2 カードデータ
// docs/v2-sim-spec.json に準拠
// ========================================

const ELEMENTS: Element[] = ['faust', 'geist', 'licht', 'nacht', 'nicht'];
function el(i: number): Element { return ELEMENTS[i % 5]; }

// ========================================
// A: アグロ — 接敵と総攻勢で押し切る
// ========================================

const aggro_v2: CharacterCard[] = [
  {
    id: 'aggro_v2_01', name: '烈刃のライ', type: 'character',
    faction: 'aggro', element: 'faust', schoolClass: 'combat',
    hp: 1, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'self', effect: 'buff_atk', value: 1, description: '召喚時、このキャラのATKを+1する。' },
    ],
  },
  {
    id: 'aggro_v2_02', name: '奔流のナギ', type: 'character',
    faction: 'aggro', element: 'geist', schoolClass: 'strategy',
    hp: 2, atk: 1, manaCost: 2, activateCost: 2,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      { trigger: 'on_turn_start', target: 'self', effect: 'gain_mana', value: 1, handCost: 1,
        description: 'ターン開始時、手札を1枚捨ててもよい。そうしたならマナ+1。' },
    ],
  },
  {
    id: 'aggro_v2_03', name: '烈火のカグラ', type: 'character',
    faction: 'aggro', element: 'licht', schoolClass: 'combat',
    hp: 2, atk: 2, manaCost: 2, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: ['quickness'],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'push', value: 1, handCost: 1,
          description: '召喚時、手札を1枚捨ててもよい。捨てたなら隣接する敵1体を1マス押し出す。' },
    ],
  },
  {
    id: 'aggro_v2_04', name: '蝕牙のドク', type: 'character',
    faction: 'aggro', element: 'nacht', schoolClass: 'combat',
    hp: 2, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // 敵撃破時ATK+1
      { trigger: 'on_kill', target: 'self', effect: 'buff_atk', value: 1,
          description: 'このキャラが敵を撃破した時、このキャラのATKを+1する。' },
    ],
  },
  {
    id: 'aggro_v2_05', name: '迅刃のハヤテ', type: 'character',
    faction: 'aggro', element: 'nicht', schoolClass: 'combat',
    hp: 3, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'front_left', attackType: 'physical', keywords: ['quickness'],
    effects: [],
  },
  {
    id: 'aggro_v2_06', name: '爆裂のノヴァ', type: 'character',
    faction: 'aggro', element: 'faust', schoolClass: 'combat',
    hp: 4, atk: 4, manaCost: 3, activateCost: 2,
    attackRange: 'cross', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'damage', value: 2, handCost: 2,
          description: '召喚時、手札を0〜2枚捨てる。捨てた枚数と同じ値のダメージを、隣接する敵1体に与える。' },
    ],
  },
  {
    id: 'aggro_v2_07', name: '破軍のレオ', type: 'character',
    faction: 'aggro', element: 'geist', schoolClass: 'combat',
    hp: 1, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // このターン攻撃しているならATK+1（再行動時ボーナス）
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'has_acted_this_turn' },
          description: 'このターン、すでにこのキャラが攻撃しているなら、攻撃時にATKを+1する。' },
    ],
  },
  {
    id: 'aggro_v2_08', name: '紅蓮のヒカリ', type: 'character',
    faction: 'aggro', element: 'licht', schoolClass: 'combat',
    hp: 4, atk: 3, manaCost: 3, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_destroyed', target: 'adjacent_allies', effect: 'heal', value: 2,
          description: 'このキャラが破壊された時、隣接する味方すべてのHPを2回復する。' },
      { trigger: 'on_destroyed', target: 'adjacent_allies', effect: 'buff_atk', value: 1,
          description: 'このキャラが破壊された時、隣接する味方すべてのATKを+1する。' },
    ],
  },
  {
    id: 'aggro_v2_09', name: '穿陣のセラ', type: 'character',
    faction: 'aggro', element: 'nacht', schoolClass: 'combat',
    hp: 5, atk: 4, manaCost: 4, activateCost: 2,
    attackRange: 'front_row', attackType: 'physical', keywords: ['piercing'],
    blindPattern: 'back_sides',
    effects: [
      { trigger: 'on_attack', target: 'self', effect: 'gain_mana', value: 1,
          description: 'このキャラが攻撃した時、マナを+1する。' },
    ],
  },
  {
    id: 'aggro_v2_10', name: '瞬閃のゼロ', type: 'character',
    faction: 'aggro', element: 'nicht', schoolClass: 'intel',
    hp: 3, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
          description: '召喚時、カードを1枚引き、その後手札を1枚捨てる。' },
    ],
  },
  {
    id: 'aggro_v2_11', name: '覇王のカイザー', type: 'character',
    faction: 'aggro', element: 'faust', schoolClass: 'combat',
    hp: 6, atk: 4, manaCost: 4, activateCost: 3,
    attackRange: 'front2_line', attackType: 'physical', keywords: [],
    blindPattern: 'sides',
    effects: [
      // 無条件: 召喚時に隣接敵に3ダメージ（即時価値）
      { trigger: 'on_summon', target: 'adjacent_enemies', effect: 'damage', value: 3,
          description: '召喚時、隣接する敵それぞれに3ダメージを与える。' },
        // このターン攻撃した味方が2体以上ならさらにATK+2
      { trigger: 'on_summon', target: 'self', effect: 'buff_atk', value: 2,
        condition: { type: 'ace_condition_gte', value: 2 },
          description: 'このターン攻撃した味方が2体以上なら、このキャラのATKを+2する。' },
    ],
  },
  {
    id: 'aggro_v2_12', name: '終焉のジーク', type: 'character',
    faction: 'aggro', element: 'geist', schoolClass: 'combat',
    hp: 6, atk: 5, manaCost: 5, activateCost: 3,
    attackRange: 'front_row', attackType: 'physical', keywords: [],
    effects: [
        // このターン攻撃した味方が4体以上なら再行動コスト-2
      { trigger: 'on_summon', target: 'self', effect: 'reduce_activate_cost', value: 2,
        condition: { type: 'ace_condition_gte', value: 3 },
          description: 'このターン攻撃した味方が4体以上なら、このキャラの再行動コストを2下げる。' },
    ],
  },
];

// ========================================
// B: タンク — 守って固めて5マス勝利
// ========================================

const tank_v2: CharacterCard[] = [
  {
    id: 'tank_v2_01', name: '磐石のガルド', type: 'character',
    faction: 'tank', element: 'faust', schoolClass: 'combat',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: ['protection'],
    effects: [],
  },
  {
    id: 'tank_v2_02', name: '祈護のイヴ', type: 'character',
    faction: 'tank', element: 'geist', schoolClass: 'medic',
    hp: 2, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'grant_protection', value: 1,
        description: '召喚時、隣接味方に防護を与える。' },
    ],
  },
  {
    id: 'tank_v2_03', name: '剛槍のロア', type: 'character',
    faction: 'tank', element: 'licht', schoolClass: 'combat',
    hp: 2, atk: 1, manaCost: 2, activateCost: 2,
    attackRange: 'front2_line', attackType: 'physical', keywords: ['protection'],
    effects: [],
  },
  {
    id: 'tank_v2_04', name: '地脈のミナ', type: 'character',
    faction: 'tank', element: 'nacht', schoolClass: 'combat',
    hp: 1, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // 自属性マスならHP+2
        { trigger: 'on_summon', target: 'self', effect: 'heal', value: 1,
          condition: { type: 'same_element_cell' },
          description: '自属性マスに召喚されたならHP+1を得る。' },
    ],
  },
  {
    id: 'tank_v2_05', name: '慈光のノエル', type: 'character',
    faction: 'tank', element: 'nicht', schoolClass: 'medic',
    hp: 3, atk: 2, manaCost: 2, activateCost: 2,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'heal', value: 1,
        description: '召喚時、隣接味方を1回復する。' },
    ],
  },
  {
    id: 'tank_v2_06', name: '豪陣のヴァル', type: 'character',
    faction: 'tank', element: 'faust', schoolClass: 'combat',
    hp: 3, atk: 3, manaCost: 3, activateCost: 2,
    attackRange: 'front2_line', attackType: 'physical', keywords: ['protection'],
    effects: [
      // 隣接味方がいるならATK+1 → on_attack condition
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'ally_count_gte', value: 2 },
        description: '隣接味方が2体以上いるならATK+1。' },
    ],
  },
  {
    id: 'tank_v2_07', name: '憤怒のバルク', type: 'character',
    faction: 'tank', element: 'geist', schoolClass: 'combat',
    hp: 4, atk: 2, manaCost: 3, activateCost: 2,
    attackRange: 'cross', attackType: 'physical', keywords: ['anchor'],
    effects: [
      // 被ダメージ時ATK+1（怒りの反撃）
      { trigger: 'on_damaged', target: 'self', effect: 'buff_atk', value: 1,
        description: 'ダメージを受けた時、ATK+1。' },
    ],
  },
  {
    id: 'tank_v2_08', name: '誓盾のルミナ', type: 'character',
    faction: 'tank', element: 'licht', schoolClass: 'combat',
    hp: 5, atk: 4, manaCost: 5, activateCost: 3,
    attackRange: 'front1', attackType: 'physical', keywords: ['cover'],
    effects: [
      // カバー発動（被ダメ）時に隣接味方ATK+1（coverキーワード持ちなので被ダメ≒カバー発動）
      { trigger: 'on_damaged', target: 'adjacent_allies', effect: 'buff_atk', value: 1,
        description: '味方をカバーするたび、隣接味方はATK+1を得る。' },
    ],
  },
  {
    id: 'tank_v2_09', name: '聖域のセルマ', type: 'character',
    faction: 'tank', element: 'nacht', schoolClass: 'strategy',
    hp: 5, atk: 3, manaCost: 4, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: ['cover'],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'grant_protection', value: 1,
        description: '召喚時、隣接味方に防護を与える。' },
      { trigger: 'on_summon', target: 'self', effect: 'grant_protection', value: 1,
        description: '召喚時、自分にも防護を得る。' },
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'heal', value: 1,
        description: '召喚時、隣接味方を1回復する。' },
    ],
  },
  {
    id: 'tank_v2_10', name: '不動のナギサ', type: 'character',
    faction: 'tank', element: 'nicht', schoolClass: 'combat',
    hp: 7, atk: 4, manaCost: 5, activateCost: 3,
    attackRange: 'front1', attackType: 'physical', keywords: ['fortress', 'cover'],
    blindPattern: 'none',
    effects: [
      { trigger: 'on_destroyed', target: 'adjacent_allies', effect: 'buff_atk', value: 1,
        description: '破壊時、隣接する味方全体のATK+1。' },
    ],
  },
  {
    id: 'tank_v2_11', name: '導陣のアーク', type: 'character',
    faction: 'tank', element: 'faust', schoolClass: 'strategy',
    hp: 1, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // 味方1体を正面向きにする → rotate target_ally
      { trigger: 'on_summon', target: 'target_ally', effect: 'rotate', value: 0,
        description: '召喚時、味方1体を正面向きにする。' },
    ],
  },
  {
    id: 'tank_v2_12', name: '凱城のバスティア', type: 'character',
    faction: 'tank', element: 'geist', schoolClass: 'combat',
    hp: 4, atk: 3, manaCost: 4, activateCost: 3,
    attackRange: 'front_back', attackType: 'physical', keywords: ['cover'],
    effects: [
      // 無条件: 召喚時に隣接味方1回復 + 自身に防護（即時価値）
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'heal', value: 1,
        description: '召喚時、隣接味方を1回復。' },
        // 2体以上をカバーしているなら隣接味方を追加回復+防護
        { trigger: 'on_summon', target: 'adjacent_allies', effect: 'heal', value: 1,
          condition: { type: 'ace_condition_gte', value: 2 },
          description: 'このキャラが2体以上をカバーしているなら、隣接する味方をさらに1回復する。' },
        { trigger: 'on_summon', target: 'adjacent_allies', effect: 'grant_protection', value: 1,
          condition: { type: 'ace_condition_gte', value: 2 },
          description: 'このキャラが2体以上をカバーしているなら、隣接する味方に防護を与える。' },
    ],
  },
];

// ========================================
// C: コントロール — デバフで相手の効率を落とす
    // 主軸: ATK低下 / 再行動コスト増加 / 洗脳
// ========================================

const control_v2: CharacterCard[] = [
  {
    id: 'control_v2_01', name: '錯声のレン', type: 'character',
    faction: 'control', element: 'geist', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'debuff_atk', value: 1,
        description: '召喚時、隣接する敵1体のATK-1。' },
    ],
  },
  {
    id: 'control_v2_02', name: '遅滞のユキ', type: 'character',
    faction: 'control', element: 'nacht', schoolClass: 'intel',
    hp: 2, atk: 2, manaCost: 2, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'action_tax', value: 1,
        description: '召喚時、隣接する敵1体の再行動コスト+1。' },
    ],
  },
  {
    id: 'control_v2_03', name: '蝕刃のメア', type: 'character',
    faction: 'control', element: 'licht', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'debuff_atk', value: 2,
        description: '召喚時、隣接する敵1体のATK-2。' },
    ],
  },
  {
    id: 'control_v2_04', name: '刻鎖のクロノ', type: 'character',
    faction: 'control', element: 'nicht', schoolClass: 'intel',
    hp: 5, atk: 3, manaCost: 3, activateCost: 2,
    attackRange: 'front2_line', attackType: 'physical', keywords: [],
    blindPattern: 'back',
    effects: [
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'action_tax', value: 1,
        description: '召喚時、隣接する敵1体の再行動コスト+1。' },
    ],
  },
  {
    id: 'control_v2_05', name: '歪律のエコー', type: 'character',
    faction: 'control', element: 'faust', schoolClass: 'intel',
    hp: 1, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'rotate', value: 1,
        description: '召喚時、隣接する敵1体を90°回転させる。' },
    ],
  },
  {
    id: 'control_v2_06', name: '断弦のリラ', type: 'character',
    faction: 'control', element: 'geist', schoolClass: 'intel',
    hp: 3, atk: 2, manaCost: 3, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [],
  },
  {
    id: 'control_v2_07', name: '魅了のセツナ', type: 'character',
    faction: 'control', element: 'nacht', schoolClass: 'intel',
    hp: 4, atk: 2, manaCost: 4, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'target_enemy', effect: 'brainwash', value: 1,
        description: '召喚時、敵1体を洗脳（行動不能にする）する。' },
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'debuff_atk', value: 1,
        description: '召喚時、隣接する敵1体のATK-1。' },
    ],
  },
  {
    id: 'control_v2_08', name: '暗躍のヴェラ', type: 'character',
    faction: 'control', element: 'licht', schoolClass: 'intel',
    hp: 3, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'rotate', value: 1,
        description: '召喚時、隣接する敵1体を90°回転させる。' },
    ],
  },
  {
    id: 'control_v2_09', name: '簒奪のオルド', type: 'character',
    faction: 'control', element: 'nicht', schoolClass: 'intel',
    hp: 6, atk: 4, manaCost: 5, activateCost: 3,
    attackRange: 'front2_line', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'self', effect: 'steal_mana', value: 2,
        description: '召喚時、相手のマナを2奪う。' },
      { trigger: 'on_attack', target: 'adjacent_enemy', effect: 'action_tax', value: 1,
        description: '攻撃時、隣接する敵1体の再行動コスト+1。' },
    ],
  },
  {
    id: 'control_v2_10', name: '崩心のミスズ', type: 'character',
    faction: 'control', element: 'faust', schoolClass: 'intel',
    hp: 6, atk: 4, manaCost: 4, activateCost: 3,
    attackRange: 'cross', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'debuff_atk', value: 1,
        description: '召喚時、隣接する敵1体のATK-1。' },
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'damage', value: 1,
        condition: { type: 'ace_condition_gte', value: 3 },
        description: 'デバフ持ちの敵が3体以上いるなら、隣接する敵1体に1ダメージ。' },
      { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
        condition: { type: 'ace_condition_gte', value: 1 },
        description: 'デバフ持ちの敵が1体以上いるなら、カードを1枚引く。' },
    ],
  },
  {
    id: 'control_v2_11', name: '禁域のノア', type: 'character',
    faction: 'control', element: 'geist', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'action_tax', value: 1,
        description: '召喚時、隣接する敵1体の再行動コスト+1。' },
    ],
  },
  {
    id: 'control_v2_12', name: '掌握のイデア', type: 'character',
    faction: 'control', element: 'licht', schoolClass: 'intel',
    hp: 5, atk: 4, manaCost: 4, activateCost: 3,
    attackRange: 'cross', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_turn_end', target: 'self', effect: 'draw', value: 1,
        condition: { type: 'ace_condition_gte', value: 2 },
        description: 'デバフ持ちの敵が2体以上いるなら、カードを1枚引く。' },
      { trigger: 'on_turn_end', target: 'self', effect: 'gain_mana', value: 1,
        condition: { type: 'ace_condition_gte', value: 3 },
        description: 'デバフ持ちの敵が3体以上いるなら、マナ+1。' },
    ],
  },
];

// ========================================
// D: シナジー — バフ連鎖で味方を強化する
// ========================================

const synergy_v2: CharacterCard[] = [
  {
    id: 'synergy_v2_01', name: '護刻のアルト', type: 'character',
    faction: 'synergy', element: 'faust', schoolClass: 'strategy',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'target_ally', effect: 'grant_protection', value: 1,
        description: '召喚時、味方1体に防護（受けるダメージ-1）を付与。' },
    ],
  },
  {
    id: 'synergy_v2_02', name: '風刻のミウ', type: 'character',
    faction: 'synergy', element: 'geist', schoolClass: 'strategy',
    hp: 1, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_ally', effect: 'grant_dodge', value: 1,
        description: '召喚時、隣接する味方1体に回避（物理攻撃を1回無効化）を付与。' },
    ],
  },
  {
    id: 'synergy_v2_03', name: '穿光のレオナ', type: 'character',
    faction: 'synergy', element: 'licht', schoolClass: 'strategy',
    hp: 2, atk: 2, manaCost: 2, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_ally', effect: 'grant_piercing', value: 1,
        description: '召喚時、隣接する味方1体に貫通（防護・回避を無視）を付与。' },
    ],
  },
  {
    id: 'synergy_v2_04', name: '霞纏のシロ', type: 'character',
    faction: 'synergy', element: 'nacht', schoolClass: 'strategy',
    hp: 2, atk: 2, manaCost: 2, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'target_ally', effect: 'grant_dodge', value: 1,
        description: '召喚時、味方1体に回避（物理攻撃を1回無効化）を付与。' },
    ],
  },
  {
    id: 'synergy_v2_05', name: '律動のセナ', type: 'character',
    faction: 'synergy', element: 'nicht', schoolClass: 'strategy',
    hp: 3, atk: 2, manaCost: 2, activateCost: 2,
    attackRange: 'cross', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'ally_markers_gte', value: 3 },
        description: 'マーカーバフ持ちの味方が3体以上いるなら、攻撃時ATK+1。' },
      { trigger: 'on_turn_end', target: 'adjacent_allies', effect: 'heal', value: 1,
        condition: { type: 'ally_markers_gte', value: 4 },
        description: 'マーカーバフ持ちの味方が4体以上いるなら、ターン終了時、隣接味方を1回復。' },
    ],
  },
  {
    id: 'synergy_v2_06', name: '遺志のユラ', type: 'character',
    faction: 'synergy', element: 'faust', schoolClass: 'strategy',
    hp: 3, atk: 2, manaCost: 3, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_ally_destroyed', target: 'self', effect: 'grant_protection', value: 1,
        description: '味方が破壊された時、自分に防護を得る。' },
    ],
  },
  {
    id: 'synergy_v2_07', name: '鼓舞のフィオ', type: 'character',
    faction: 'synergy', element: 'geist', schoolClass: 'strategy',
    hp: 3, atk: 3, manaCost: 3, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'buff_atk', value: 1,
        description: '召喚時、隣接する味方全体のATK+1。' },
    ],
  },
  {
    id: 'synergy_v2_08', name: '凝光のアム', type: 'character',
    faction: 'synergy', element: 'licht', schoolClass: 'medic',
    hp: 4, atk: 4, manaCost: 4, activateCost: 2,
    attackRange: 'front2_line', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'heal', value: 1,
        description: '召喚時、隣接する味方全体を1回復。' },
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'buff_atk', value: 1,
        condition: { type: 'ace_condition_gte', value: 3 },
        description: 'マーカーバフ持ちの味方が3体以上いるなら、隣接する味方全体のATK+1。' },
    ],
  },
  {
    id: 'synergy_v2_09', name: '残影のレム', type: 'character',
    faction: 'synergy', element: 'nacht', schoolClass: 'strategy',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_ally', effect: 'buff_hp', value: 1,
        description: '召喚時、隣接する味方1体のHP+1。' },
    ],
  },
  {
    id: 'synergy_v2_10', name: '調和のアリア', type: 'character',
    faction: 'synergy', element: 'nicht', schoolClass: 'strategy',
    hp: 5, atk: 4, manaCost: 5, activateCost: 3,
    attackRange: 'front2_line', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'ally_markers_gte', value: 2 },
        description: 'マーカーバフ持ちの味方が2体以上いるなら、自分のATK+1。' },
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'heal', value: 1,
        condition: { type: 'ally_markers_gte', value: 3 },
        description: 'マーカーバフ持ちの味方が3体以上いるなら、隣接味方全体を1回復。' },
    ],
  },
  {
    id: 'synergy_v2_11', name: '星導のアルス', type: 'character',
    faction: 'synergy', element: 'faust', schoolClass: 'strategy',
    hp: 5, atk: 4, manaCost: 4, activateCost: 3,
    attackRange: 'front2_line', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'grant_piercing', value: 1,
        condition: { type: 'ace_condition_gte', value: 3 },
        description: 'マーカーバフ持ちの味方が3体以上いるなら、隣接する味方に貫通（防護・回避を無視）を付与する。' },
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'heal', value: 1,
        description: '召喚時、隣接する味方全体を1回復。' },
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'buff_atk', value: 1,
        condition: { type: 'ace_condition_gte', value: 3 },
        description: 'マーカーバフ持ちの味方が3体以上いるなら、隣接する味方全体のATK+1。' },
    ],
  },
  {
    id: 'synergy_v2_12', name: '輝陣のイリス', type: 'character',
    faction: 'synergy', element: 'geist', schoolClass: 'strategy',
    hp: 5, atk: 4, manaCost: 5, activateCost: 2,
    attackRange: 'front_right', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'buff_atk', value: 1,
        description: '召喚時、隣接する味方全体のATK+1。' },
      { trigger: 'on_summon', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'ace_condition_gte', value: 3 },
        description: 'マーカーバフ持ちの味方が3体以上いるなら、自分のATK+1。' },
      { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
        condition: { type: 'ace_condition_gte', value: 3 },
        description: 'マーカーバフ持ちの味方が3体以上いるなら、カードを1枚引く。' },
    ],
  },
];

// ========================================
// E: スナイプ — 照準で狙い撃つ
// ========================================

const snipe_v2: CharacterCard[] = [
  {
    id: 'snipe_v2_01', name: '烙印のユウ', type: 'character',
    faction: 'snipe', element: 'geist', schoolClass: '射撃',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'mark', value: 1,
          description: '召喚時、隣接する敵1体に照準（マーカー。参照して効果を得るキャラがいる）を付ける。' },
        { trigger: 'on_summon', target: 'self', effect: 'damage', value: 1,
          description: '召喚時、自分に1ダメージ。' },
      ],
    },
  {
    id: 'snipe_v2_02', name: '轟雷のシグ', type: 'character',
    faction: 'snipe', element: 'licht', schoolClass: '射撃',
    hp: 2, atk: 2, manaCost: 2, activateCost: 2,
    attackRange: 'snipe', attackType: 'physical', keywords: [],
    effects: [
      // 照準付き敵を攻撃時ATK+1
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'target_has_debuff' },
        description: '照準が付いた敵を攻撃する時、ATK+1。' },
      // 攻撃した敵に照準を付ける
      { trigger: 'on_attack', target: 'target_enemy', effect: 'mark', value: 1,
        description: '攻撃した敵に照準（マーカー。参照して効果を得るキャラがいる）を付ける。' },
    ],
  },
  {
    id: 'snipe_v2_03', name: '看破のミナト', type: 'character',
    faction: 'snipe', element: 'nacht', schoolClass: '射撃',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'snipe', attackType: 'physical', keywords: [],
    effects: [
      // 召喚時、敵1体に照準を付ける
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'mark', value: 1,
        description: '召喚時、敵1体に照準（マーカー。参照して効果を得るキャラがいる）を付ける。' },
    ],
  },
  {
    id: 'snipe_v2_04', name: '鋭射のハル', type: 'character',
    faction: 'snipe', element: 'nicht', schoolClass: '射撃',
    hp: 3, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'snipe', attackType: 'physical', keywords: [],
    effects: [
      // 照準が付いた敵を攻撃時ATK+1
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        description: '照準が付いた敵を攻撃する時、ATK+1。' },
    ],
  },
  {
    id: 'snipe_v2_05', name: '曲射のレイ', type: 'character',
    faction: 'snipe', element: 'faust', schoolClass: '射撃',
    hp: 2, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'snipe', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'target_ally', effect: 'rotate', value: 1,
        description: '召喚時、味方1体を回転させる。' },
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'mark', value: 1,
        description: '召喚時、敵1体に照準（マーカー。参照して効果を得るキャラがいる）を付ける。' },
    ],
  },
  {
    id: 'snipe_v2_06', name: '隼眼のトワ', type: 'character',
    faction: 'snipe', element: 'geist', schoolClass: '射撃',
    hp: 3, atk: 3, manaCost: 3, activateCost: 2,
    attackRange: 'snipe', attackType: 'physical', keywords: [],
    effects: [
      // 攻撃した敵に照準を付ける（次の味方が有利に）
      { trigger: 'on_attack', target: 'target_enemy', effect: 'mark', value: 1,
        description: '攻撃した敵に照準（マーカー。参照して効果を得るキャラがいる）を付ける。' },
    ],
  },
  {
    id: 'snipe_v2_07', name: '貫穿のキリ', type: 'character',
    faction: 'snipe', element: 'licht', schoolClass: '射撃',
    hp: 3, atk: 4, manaCost: 3, activateCost: 2,
    attackRange: 'snipe', attackType: 'physical', keywords: [],
    effects: [
      // 四隅にいるならATK+1
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'in_corner' },
        description: '四隅にいるならATK+1。' },
      // 照準が付いた敵を攻撃時さらにATK+1
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'target_has_debuff' },
        description: '照準が付いた敵を攻撃する時、さらにATK+1。' },
    ],
  },
  {
    id: 'snipe_v2_08', name: '必中のナオ', type: 'character',
    faction: 'snipe', element: 'nacht', schoolClass: '射撃',
    hp: 5, atk: 4, manaCost: 4, activateCost: 3,
    attackRange: 'snipe', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'damage', value: 2,
        description: '召喚時、隣接する敵1体に2ダメージを与える。' },
      // 照準が付いた敵に追加1ダメージ
      { trigger: 'on_attack', target: 'target_enemy', effect: 'damage', value: 1,
        description: '照準が付いた敵を攻撃した時、その敵に追加で1ダメージを与える。' },
    ],
  },
  {
    id: 'snipe_v2_09', name: '灼眼のゼクス', type: 'character',
    faction: 'snipe', element: 'nicht', schoolClass: '射撃',
    hp: 6, atk: 4, manaCost: 4, activateCost: 2,
    attackRange: 'snipe', attackType: 'physical', keywords: [],
    effects: [
      // 異なる敵2体を攻撃 → v1のゼクス特殊処理を再利用（id: snipe_v2_09）
    ],
  },
  {
    id: 'snipe_v2_10', name: '殲滅のアイン', type: 'character',
    faction: 'snipe', element: 'faust', schoolClass: '射撃',
    hp: 5, atk: 4, manaCost: 4, activateCost: 3,
    attackRange: 'snipe', attackType: 'physical', keywords: [],
    effects: [
      // 無条件: 召喚時に敵1体に2ダメージ + 自身1ドロー（即時価値）
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'damage', value: 3,
        description: '召喚時、敵1体に3ダメージ。' },
      { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
        description: '召喚時、1ドロー。' },
        // 照準付きの敵が2体以上なら追加ダメージ+ドロー
        { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'damage', value: 1,
          condition: { type: 'ace_condition_gte', value: 2 },
          description: '照準付きの敵が2体以上いるなら、隣接する敵1体に追加で1ダメージを与える。' },
        { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
          condition: { type: 'ace_condition_gte', value: 2 },
          description: '照準付きの敵が2体以上いるなら、カードを1枚引く。' },
    ],
  },
  {
    id: 'snipe_v2_11', name: '天眼のソラ', type: 'character',
    faction: 'snipe', element: 'geist', schoolClass: '射撃',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'mark', value: 1,
          description: '召喚時、隣接する敵1体に照準（マーカー。参照して効果を得るキャラがいる）を付ける。' },
      ],
    },
  {
    id: 'snipe_v2_12', name: '天弧のロギア', type: 'character',
    faction: 'snipe', element: 'licht', schoolClass: '射撃',
    hp: 4, atk: 4, manaCost: 4, activateCost: 3,
    attackRange: 'snipe', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
        description: '召喚時、1ドロー。' },
        // 照準付きの敵が2体以上なら貫通付与+ATK+1
        { trigger: 'on_summon', target: 'self', effect: 'grant_piercing', value: 1,
          condition: { type: 'ace_condition_gte', value: 1 },
          description: '照準付きの敵が1体以上いるなら、このキャラは貫通（防護・回避を無視）を得る。' },
        { trigger: 'on_summon', target: 'self', effect: 'buff_atk', value: 1,
          condition: { type: 'ace_condition_gte', value: 1 },
          description: '照準付きの敵が1体以上いるなら、このキャラのATKを+1する。' },
    ],
  },
];

// ========================================
// F: トリック — 弱点を作って盤面を崩す
// ========================================

const trick_v2: CharacterCard[] = [
  {
    id: 'trick_v2_01', name: '旋風のツバキ', type: 'character',
    faction: 'trick', element: 'faust', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'rotate', value: 1,
          description: '召喚時、敵1体を90度回転させる。' },
      ],
    },
  {
    id: 'trick_v2_02', name: '翻弄のハク', type: 'character',
    faction: 'trick', element: 'geist', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'rotate', value: 1,
          description: '召喚時、隣接する敵1体を90度回転させる。' },
      ],
    },
  {
    id: 'trick_v2_03', name: '空蝉のカイト', type: 'character',
    faction: 'trick', element: 'licht', schoolClass: 'intel',
    hp: 1, atk: 1, manaCost: 1, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'self', effect: 'gain_mana', value: 1, handCost: 1,
          description: '召喚時、手札を1枚捨ててもよい。そうしたならマナ+1。' },
      ],
    },
  {
    id: 'trick_v2_04', name: '転位のリップル', type: 'character',
    faction: 'trick', element: 'nacht', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'target_ally', effect: 'swap', value: 1,
          description: '召喚時、味方1体と位置を入れ替える。' },
      ],
    },
  {
    id: 'trick_v2_05', name: '幻影のシノブ', type: 'character',
    faction: 'trick', element: 'nicht', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: ['dodge'],
    effects: [
      // 相手の弱点から攻撃時ATK+1
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        description: '相手の弱点から攻撃する時、ATK+1。' },
    ],
  },
  {
    id: 'trick_v2_06', name: '謀略のルシア', type: 'character',
    faction: 'trick', element: 'faust', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 2, activateCost: 2,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'push', value: 1,
        description: '召喚時、敵1体を1マス押し出す。' },
    ],
  },
  {
    id: 'trick_v2_07', name: '灼影のミラージュ', type: 'character',
    faction: 'trick', element: 'geist', schoolClass: 'intel',
    hp: 3, atk: 4, manaCost: 3, activateCost: 2,
    attackRange: 'front_left', attackType: 'physical', keywords: [],
    effects: [
      // 相手の弱点から攻撃時、追加1ダメージ
      { trigger: 'on_attack', target: 'target_enemy', effect: 'damage', value: 1,
        description: '相手の弱点から攻撃した時、追加で1ダメージを与える。' },
    ],
  },
  {
    id: 'trick_v2_08', name: '転刃のシュラ', type: 'character',
    faction: 'trick', element: 'licht', schoolClass: 'combat',
    hp: 3, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // 位置入替していたらATK+1
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'has_swapped_this_turn' },
        description: 'このターン位置入れ替えを行っているならATK+1。' },
    ],
  },
  {
    id: 'trick_v2_09', name: '狂宴のジョーカー', type: 'character',
    faction: 'trick', element: 'nacht', schoolClass: 'intel',
    hp: 5, atk: 4, manaCost: 5, activateCost: 3,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // 敵2体の位置or向きを崩す → on_summon rotate 2体
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'rotate', value: 1,
        description: '召喚時、敵2体の位置か向きを崩す。(シム: 敵1体回転)' },
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'push', value: 2,
        description: '敵1体を2マス押し出す。' },
    ],
  },
  {
    id: 'trick_v2_10', name: '霧中のアオイ', type: 'character',
    faction: 'trick', element: 'nicht', schoolClass: 'intel',
    hp: 5, atk: 3, manaCost: 4, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // 空きマスが5個以上ならATK+1
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'empty_cells_gte', value: 5 },
        description: '空きマスが5個以上ならATK+1。' },
    ],
  },
  {
    id: 'trick_v2_11', name: '暗転のカレン', type: 'character',
    faction: 'trick', element: 'faust', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      // 弱点から攻撃時1ドロー
      { trigger: 'on_attack', target: 'self', effect: 'draw', value: 1,
        condition: { type: 'blind_spot' },
        description: '弱点から攻撃した時、1ドロー。' },
    ],
  },
  {
    id: 'trick_v2_12', name: '朧月のオボロ', type: 'character',
    faction: 'trick', element: 'geist', schoolClass: 'intel',
    hp: 4, atk: 4, manaCost: 4, activateCost: 3,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // 召喚時に敵1体を回転+押し出し
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'rotate', value: 1,
        description: '召喚時、敵1体を回転。' },
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'push', value: 2,
        description: '召喚時、隣接する敵1体を1マス押し出す。' },
        // 相手キャラの弱点にいる味方が3体以上なら1ドロー
        { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
          condition: { type: 'ace_condition_gte', value: 3 },
          description: '相手キャラの弱点にいる味方が3体以上いるなら、カードを1枚引く。' },
    ],
  },
];

// ========================================
// エクスポート
// ========================================

export const V2_CHARACTERS: CharacterCard[] = [
  ...aggro_v2,
  ...tank_v2,
  ...control_v2,
  ...synergy_v2,
  ...snipe_v2,
  ...trick_v2,
];

// v2用のアイテムセットはv1と同じものを流用（ITEM_SETSはcards.tsからインポート）
