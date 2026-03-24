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
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'self', effect: 'buff_atk', value: 1, description: '召喚時、ATK+1を得る。' },
    ],
  },
  {
    id: 'aggro_v2_02', name: '念連のナギ', type: 'character',
    faction: 'aggro', element: 'geist', schoolClass: 'strategy',
    hp: 2, atk: 1, manaCost: 2, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_turn_start', target: 'self', effect: 'gain_mana', value: 1, handCost: 1,
        description: 'ターン開始時、手札を1枚捨ててもよい。そうしたならマナ+1。' },
    ],
  },
  {
    id: 'aggro_v2_03', name: '烈火のカグラ', type: 'character',
    faction: 'aggro', element: 'licht', schoolClass: 'combat',
    hp: 2, atk: 2, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: ['quickness'],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'push', value: 1, handCost: 1,
        description: '召喚時、手札を1枚捨ててもよい。そうしたなら敵1体を1マス押し出す。' },
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
        description: '敵を撃破した時、ATK+1を得る。' },
    ],
  },
  {
    id: 'aggro_v2_05', name: '連撃のハヤテ', type: 'character',
    faction: 'aggro', element: 'nicht', schoolClass: 'combat',
    hp: 2, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'front_left', attackType: 'physical', keywords: ['quickness'],
    effects: [],
  },
  {
    id: 'aggro_v2_06', name: '爆裂のノヴァ', type: 'character',
    faction: 'aggro', element: 'faust', schoolClass: 'combat',
    hp: 4, atk: 3, manaCost: 3, activateCost: 3,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'damage', value: 2, handCost: 2,
        description: '召喚時、手札を2枚まで捨てる。捨てた枚数だけ敵1体にダメージ。' },
    ],
  },
  {
    id: 'aggro_v2_07', name: '破軍のレオ', type: 'character',
    faction: 'aggro', element: 'geist', schoolClass: 'combat',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // このターン攻撃しているならATK+1（再行動時ボーナス）
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'has_acted_this_turn' },
        description: 'このターン既に攻撃済みならATK+1。' },
    ],
  },
  {
    id: 'aggro_v2_08', name: '紅蓮のヒカリ', type: 'character',
    faction: 'aggro', element: 'licht', schoolClass: 'combat',
    hp: 4, atk: 3, manaCost: 3, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_destroyed', target: 'adjacent_allies', effect: 'heal', value: 2,
        description: '破壊時、隣接味方を2回復。' },
      { trigger: 'on_destroyed', target: 'adjacent_allies', effect: 'buff_atk', value: 1,
        description: '破壊時、隣接味方にATK+1。' },
    ],
  },
  {
    id: 'aggro_v2_09', name: '圧殺のセラ', type: 'character',
    faction: 'aggro', element: 'nacht', schoolClass: 'combat',
    hp: 5, atk: 3, manaCost: 4, activateCost: 3,
    attackRange: 'front_row', attackType: 'physical', keywords: ['piercing'],
    effects: [
      { trigger: 'on_attack', target: 'self', effect: 'gain_mana', value: 1,
        description: '攻撃した時、マナ+1。' },
    ],
  },
  {
    id: 'aggro_v2_10', name: '断空のゼロ', type: 'character',
    faction: 'aggro', element: 'nicht', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
        description: '召喚時、1ドローし、その後手札を1枚捨てる。' },
    ],
  },
  {
    id: 'aggro_v2_11', name: '覇王のカイザー', type: 'character',
    faction: 'aggro', element: 'faust', schoolClass: 'combat',
    hp: 6, atk: 4, manaCost: 4, activateCost: 3,
    attackRange: 'front2_line', attackType: 'physical', keywords: [],
    effects: [
      // 無条件: 召喚時に隣接敵に3ダメージ（即時価値）
      { trigger: 'on_summon', target: 'adjacent_enemies', effect: 'damage', value: 3,
        description: '召喚時、隣接する敵に3ダメージ。' },
      { trigger: 'on_summon', target: 'self', effect: 'buff_atk', value: 1,
        description: '召喚時、ATK+1。' },
      // エース条件: 3体以上ならさらにATK+2
      { trigger: 'on_summon', target: 'self', effect: 'buff_atk', value: 2,
        condition: { type: 'ace_condition_gte', value: 3 },
        description: 'このターン攻撃した味方が3体以上なら召喚時ATK+2。' },
    ],
  },
  {
    id: 'aggro_v2_12', name: '終焉のガルド', type: 'character',
    faction: 'aggro', element: 'geist', schoolClass: 'combat',
    hp: 6, atk: 4, manaCost: 5, activateCost: 3,
    attackRange: 'front_row', attackType: 'physical', keywords: [],
    effects: [
      // エース条件: 攻撃した味方4体以上なら再行動コスト-2
      { trigger: 'on_summon', target: 'self', effect: 'reduce_activate_cost', value: 2,
        condition: { type: 'ace_condition_gte', value: 4 },
        description: 'エース条件4以上で再行動コスト-2。' },
    ],
  },
];

// ========================================
// B: タンク — 守って固めて5マス勝利
// ========================================

const tank_v2: CharacterCard[] = [
  {
    id: 'tank_v2_01', name: '堅壁のガルド', type: 'character',
    faction: 'tank', element: 'faust', schoolClass: 'combat',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: ['protection'],
    effects: [],
  },
  {
    id: 'tank_v2_02', name: '護輪のイヴ', type: 'character',
    faction: 'tank', element: 'geist', schoolClass: 'medic',
    hp: 2, atk: 2, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'grant_protection', value: 1,
        description: '召喚時、隣接味方に防護を与える。' },
    ],
  },
  {
    id: 'tank_v2_03', name: '鋼盾のロア', type: 'character',
    faction: 'tank', element: 'licht', schoolClass: 'combat',
    hp: 3, atk: 2, manaCost: 2, activateCost: 2,
    attackRange: 'front2_line', attackType: 'physical', keywords: ['cover'],
    effects: [],
  },
  {
    id: 'tank_v2_04', name: '不落のミナ', type: 'character',
    faction: 'tank', element: 'nacht', schoolClass: 'combat',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // 自属性マスならHP+2
        { trigger: 'on_summon', target: 'self', effect: 'heal', value: 1,
          condition: { type: 'same_element_cell' },
          description: '自属性マスに召喚されたならHP+1を得る。' },
    ],
  },
  {
    id: 'tank_v2_05', name: '聖壁のノエル', type: 'character',
    faction: 'tank', element: 'nicht', schoolClass: 'medic',
    hp: 3, atk: 2, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'heal', value: 1,
        description: '召喚時、隣接味方を1回復する。' },
    ],
  },
  {
    id: 'tank_v2_06', name: '鉄陣のヴァル', type: 'character',
    faction: 'tank', element: 'faust', schoolClass: 'combat',
    hp: 5, atk: 3, manaCost: 3, activateCost: 2,
    attackRange: 'front2_line', attackType: 'physical', keywords: ['protection'],
    effects: [
      // 隣接味方がいるならATK+1 → on_attack condition
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'ally_count_gte', value: 2 },
        description: '隣接味方が2体以上いるならATK+1。' },
    ],
  },
  {
    id: 'tank_v2_07', name: '護角のバルク', type: 'character',
    faction: 'tank', element: 'geist', schoolClass: 'combat',
    hp: 4, atk: 2, manaCost: 3, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: ['anchor'],
    effects: [],
  },
  {
    id: 'tank_v2_08', name: '聖盾のルミナ', type: 'character',
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
    id: 'tank_v2_09', name: '障壁のセルマ', type: 'character',
    faction: 'tank', element: 'nacht', schoolClass: 'strategy',
    hp: 5, atk: 2, manaCost: 4, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'grant_protection', value: 1,
        description: '召喚時、隣接味方に防護を与える。' },
    ],
  },
  {
    id: 'tank_v2_10', name: '虚鎮のナギサ', type: 'character',
    faction: 'tank', element: 'nicht', schoolClass: 'combat',
    hp: 6, atk: 4, manaCost: 5, activateCost: 3,
    attackRange: 'front1', attackType: 'physical', keywords: ['fortress', 'cover'],
    effects: [
      { trigger: 'on_destroyed', target: 'all_allies', effect: 'buff_atk', value: 1,
        description: '破壊時、味方全体はATK+1。' },
    ],
  },
  {
    id: 'tank_v2_11', name: '守護のアーク', type: 'character',
    faction: 'tank', element: 'faust', schoolClass: 'strategy',
    hp: 2, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // 味方1体を正面向きにする → rotate target_ally
      { trigger: 'on_summon', target: 'target_ally', effect: 'rotate', value: 0,
        description: '召喚時、味方1体を正面向きにする。' },
    ],
  },
  {
    id: 'tank_v2_12', name: '天城のバスティア', type: 'character',
    faction: 'tank', element: 'geist', schoolClass: 'combat',
    hp: 6, atk: 3, manaCost: 4, activateCost: 3,
    attackRange: 'front1', attackType: 'physical', keywords: ['cover'],
    effects: [
      // 無条件: 召喚時に隣接味方1回復 + 自身に防護（即時価値）
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'heal', value: 1,
        description: '召喚時、隣接味方を1回復。' },
      { trigger: 'on_summon', target: 'self', effect: 'grant_protection', value: 1,
        description: '召喚時、自身に防護を与える。' },
      // エース条件: カバー味方2体以上で隣接味方を追加回復+防護
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'heal', value: 1,
        condition: { type: 'ace_condition_gte', value: 2 },
        description: 'エース条件2以上で隣接味方をさらに1回復。' },
      { trigger: 'on_summon', target: 'adjacent_allies', effect: 'grant_protection', value: 1,
        condition: { type: 'ace_condition_gte', value: 2 },
        description: 'エース条件2以上で隣接味方に防護を与える。' },
    ],
  },
];

// ========================================
// C: コントロール — デバフで相手の効率を落とす
// 主軸: atk_down / action_tax / brainwashed
// ========================================

const control_v2: CharacterCard[] = [
  {
    id: 'control_v2_01', name: '鈍刃のレン', type: 'character',
    faction: 'control', element: 'geist', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'debuff_atk', value: 2,
          description: '召喚時、隣接する敵1体にATK-1を与える。' },
    ],
  },
  {
    id: 'control_v2_02', name: '遅滞のユキ', type: 'character',
    faction: 'control', element: 'nacht', schoolClass: 'intel',
    hp: 2, atk: 2, manaCost: 2, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'action_tax', value: 2,
          description: '召喚時、隣接する敵1体にaction_taxを与える。' },
    ],
  },
  {
    id: 'control_v2_03', name: '蝕印のメア', type: 'character',
    faction: 'control', element: 'licht', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      // デバフ状態の敵を攻撃時ATK+1
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'target_has_debuff' },
        description: 'デバフ状態の敵を攻撃する時、ATK+1。' },
    ],
  },
  {
    id: 'control_v2_04', name: '時鈍のクロノ', type: 'character',
    faction: 'control', element: 'nicht', schoolClass: 'intel',
    hp: 4, atk: 2, manaCost: 3, activateCost: 3,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'action_tax', value: 2,
          description: '召喚時、隣接する敵1体にaction_taxを与える。' },
    ],
  },
  {
    id: 'control_v2_05', name: '転律のエコー', type: 'character',
    faction: 'control', element: 'faust', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'rotate', value: 1,
          description: '召喚時、敵1体を90度回転させる。' },
        { trigger: 'on_summon', target: 'self', effect: 'exhaust_attack', value: 1,
          description: 'このターン攻撃できない。' },
      ],
    },
  {
    id: 'control_v2_06', name: '侵心のリラ', type: 'character',
    faction: 'control', element: 'geist', schoolClass: 'intel',
    hp: 3, atk: 3, manaCost: 3, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'debuff_atk', value: 2,
          description: '召喚時、隣接する敵1体にATK-2を与える。' },
    ],
  },
  {
    id: 'control_v2_07', name: '洗脳のセツナ', type: 'character',
    faction: 'control', element: 'nacht', schoolClass: 'intel',
    hp: 3, atk: 2, manaCost: 4, activateCost: 2,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'brainwash', value: 1,
          description: '隣接する敵1体にbrainwashedを与える。' },
    ],
  },
  {
    id: 'control_v2_08', name: '黒幕のヴェラ', type: 'character',
    faction: 'control', element: 'licht', schoolClass: 'intel',
    hp: 3, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1, handCost: 1,
          description: '召喚時、手札を1枚捨て、その後1ドロー。' },
        { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'debuff_atk', value: 1,
          description: '召喚時、隣接する敵1体にATK-1を与える。' },
      ],
    },
  {
    id: 'control_v2_09', name: '搾取のオルド', type: 'character',
    faction: 'control', element: 'nicht', schoolClass: 'intel',
    hp: 5, atk: 3, manaCost: 5, activateCost: 3,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'self', effect: 'steal_mana', value: 2,
        description: '召喚時、相手のマナ-2、自分のマナ+2。' },
      { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
        description: '召喚時、1ドロー。' },
    ],
  },
  {
    id: 'control_v2_10', name: '蝕心のミスズ', type: 'character',
    faction: 'control', element: 'faust', schoolClass: 'intel',
    hp: 5, atk: 4, manaCost: 4, activateCost: 3,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      // 無条件: 召喚時に敵全体ATK-1 + action_tax（即時価値）
      { trigger: 'on_summon', target: 'all_enemies', effect: 'debuff_atk', value: 1,
        description: '召喚時、敵全体にATK-1。' },
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'action_tax', value: 1,
        description: '召喚時、隣接する敵1体にaction_taxを与える。' },
      // エース条件: デバフ敵2体以上で追加ダメージ
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'damage', value: 3,
        condition: { type: 'ace_condition_gte', value: 2 },
        description: 'エース条件2以上で敵1体に3ダメージ。' },
    ],
  },
  {
    id: 'control_v2_11', name: '沈黙のノア', type: 'character',
    faction: 'control', element: 'geist', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      // 相手アイテムコスト+1のオーラ（エンジン実装済み: control_v2_11 ID参照）
      { trigger: 'on_summon', target: 'self', effect: 'buff_atk', value: 0,
        description: '相手アイテムの使用コストを+1するオーラを持つ。' },
    ],
  },
  {
    id: 'control_v2_12', name: '支配のイデア', type: 'character',
    faction: 'control', element: 'nacht', schoolClass: 'intel',
    hp: 5, atk: 4, manaCost: 4, activateCost: 3,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      // エース条件: デバフ敵2体以上でターン終了時ドロー
      { trigger: 'on_turn_end', target: 'self', effect: 'draw', value: 1,
        condition: { type: 'ace_condition_gte', value: 2 },
        description: 'エース条件2以上でターン終了時に1ドロー。' },
    ],
  },
];

// ========================================
// D: シナジー — マーカーで展開して爆発
// ========================================

const synergy_v2: CharacterCard[] = [
  {
    id: 'synergy_v2_01', name: '刻印のアルト', type: 'character',
    faction: 'synergy', element: 'faust', schoolClass: 'strategy',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'target_ally', effect: 'grant_protection', value: 1,
        description: '召喚時、味方1体に防護マーカーを与える。' },
    ],
  },
  {
    id: 'synergy_v2_02', name: '迅符のミウ', type: 'character',
    faction: 'synergy', element: 'geist', schoolClass: 'strategy',
    hp: 1, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'target_ally', effect: 'grant_quickness', value: 1,
        description: '召喚時、味方1体に先制マーカーを与える。' },
    ],
  },
  {
    id: 'synergy_v2_03', name: '穿符のレオナ', type: 'character',
    faction: 'synergy', element: 'licht', schoolClass: 'strategy',
    hp: 2, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'target_ally', effect: 'grant_piercing', value: 1,
          description: '召喚時、味方1体に貫通マーカーを与える。' },
        { trigger: 'on_summon', target: 'self', effect: 'exhaust_attack', value: 1,
          description: 'このターン攻撃できない。' },
      ],
    },
  {
    id: 'synergy_v2_04', name: '避符のシロ', type: 'character',
    faction: 'synergy', element: 'nacht', schoolClass: 'strategy',
    hp: 2, atk: 2, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'target_ally', effect: 'grant_dodge', value: 1,
        description: '召喚時、味方1体に回避マーカーを与える。' },
    ],
  },
  {
    id: 'synergy_v2_05', name: '共鳴のセナ', type: 'character',
    faction: 'synergy', element: 'nicht', schoolClass: 'strategy',
    hp: 2, atk: 2, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // 隣接味方1体につきATK+1 → on_attack, ally_count dependent
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'ally_count_gte', value: 1 },
        description: '隣接味方1体につきATK+1。' },
    ],
  },
  {
    id: 'synergy_v2_06', name: '継承のユラ', type: 'character',
    faction: 'synergy', element: 'faust', schoolClass: 'strategy',
    hp: 3, atk: 2, manaCost: 3, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // 味方破壊時マーカー継承 → on_ally_destroyed でマーカー取得
      { trigger: 'on_ally_destroyed', target: 'self', effect: 'grant_protection', value: 1,
        description: '味方が破壊された時、防護マーカーを1つ継承する。' },
    ],
  },
  {
    id: 'synergy_v2_07', name: '連環のフィオ', type: 'character',
    faction: 'synergy', element: 'geist', schoolClass: 'strategy',
    hp: 3, atk: 3, manaCost: 3, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // マーカー持ち味方全体ATK+1 → on_summon all_allies buff_atk
      { trigger: 'on_summon', target: 'all_allies', effect: 'buff_atk', value: 1,
        description: 'マーカーを持つ味方全体はATK+1。' },
    ],
  },
  {
    id: 'synergy_v2_08', name: '結晶のアム', type: 'character',
    faction: 'synergy', element: 'licht', schoolClass: 'medic',
    hp: 4, atk: 3, manaCost: 4, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // マーカー持ち味方を2回復 → all_allies heal
      { trigger: 'on_summon', target: 'all_allies', effect: 'heal', value: 2,
        description: '召喚時、マーカーを持つ味方を2回復する。' },
    ],
  },
  {
    id: 'synergy_v2_09', name: '触媒のレム', type: 'character',
    faction: 'synergy', element: 'nacht', schoolClass: 'strategy',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1, handCost: 1,
          description: '召喚時、手札を1枚捨て、その後1ドロー。' },
      ],
    },
  {
    id: 'synergy_v2_10', name: '統合のアリア', type: 'character',
    faction: 'synergy', element: 'nicht', schoolClass: 'strategy',
    hp: 5, atk: 4, manaCost: 5, activateCost: 3,
    attackRange: 'front2_line', attackType: 'physical', keywords: [],
    effects: [
      // マーカー持ち味方2体以上でATK+1、3体以上で味方全体回復
      { trigger: 'on_summon', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'ally_markers_gte', value: 2 },
        description: 'マーカー持ち味方が2体以上ならATK+1。' },
      { trigger: 'on_summon', target: 'all_allies', effect: 'heal', value: 1,
        condition: { type: 'ally_markers_gte', value: 3 },
        description: 'マーカー持ち味方が3体以上なら味方全体を1回復。' },
    ],
  },
  {
    id: 'synergy_v2_11', name: '集星のアルス', type: 'character',
    faction: 'synergy', element: 'faust', schoolClass: 'strategy',
    hp: 5, atk: 4, manaCost: 4, activateCost: 3,
    attackRange: 'front2_line', attackType: 'physical', keywords: [],
    effects: [
      // 無条件: 召喚時に味方全体にマーカー（貫通）付与 + 1回復（即時価値）
      { trigger: 'on_summon', target: 'all_allies', effect: 'grant_piercing', value: 1,
        description: '召喚時、味方全体に貫通を付与。' },
      { trigger: 'on_summon', target: 'all_allies', effect: 'heal', value: 1,
        description: '召喚時、味方全体を1回復。' },
      // エース条件: マーカー味方3体以上で味方全体ATK+1
      { trigger: 'on_summon', target: 'all_allies', effect: 'buff_atk', value: 1,
        condition: { type: 'ace_condition_gte', value: 3 },
        description: 'エース条件3以上で味方全体はATK+1。' },
    ],
  },
  {
    id: 'synergy_v2_12', name: '共振のイリス', type: 'character',
    faction: 'synergy', element: 'geist', schoolClass: 'strategy',
    hp: 4, atk: 4, manaCost: 5, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // エース条件: マーカー味方3体以上でATK+1+ドロー
      { trigger: 'on_summon', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'ace_condition_gte', value: 3 },
        description: 'エース条件3以上でATK+1。' },
      { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
        condition: { type: 'ace_condition_gte', value: 3 },
        description: 'エース条件3以上で1ドロー。' },
    ],
  },
];

// ========================================
// E: スナイプ — 安全に撃てる敵を増やして処刑
// ========================================

const snipe_v2: CharacterCard[] = [
  {
    id: 'snipe_v2_01', name: '照準のユウ', type: 'character',
    faction: 'snipe', element: 'geist', schoolClass: '射撃',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'mark', value: 1,
          description: '召喚時、敵1体をマークする。' },
        { trigger: 'on_summon', target: 'self', effect: 'exhaust_attack', value: 1,
          description: 'このターン攻撃できない。' },
      ],
    },
  {
    id: 'snipe_v2_02', name: '遠雷のシグ', type: 'character',
    faction: 'snipe', element: 'licht', schoolClass: '射撃',
    hp: 2, atk: 2, manaCost: 2, activateCost: 2,
    attackRange: 'front2_line', attackType: 'physical', keywords: [],
    effects: [],
  },
  {
    id: 'snipe_v2_03', name: '透視のミナト', type: 'character',
    faction: 'snipe', element: 'nacht', schoolClass: '射撃',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      // 死角の敵を攻撃時ATK+1（B位置≒ブラインドスポット）
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'blind_spot' },
        description: '死角の敵を攻撃する時、ATK+1。' },
    ],
  },
  {
    id: 'snipe_v2_04', name: '狙撃のハル', type: 'character',
    faction: 'snipe', element: 'nicht', schoolClass: '射撃',
    hp: 2, atk: 2, manaCost: 2, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      // マーク敵攻撃時ATK+1
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        description: 'マークされた敵を攻撃する時、ATK+1。' },
    ],
  },
  {
    id: 'snipe_v2_05', name: '偏差のレイ', type: 'character',
    faction: 'snipe', element: 'faust', schoolClass: '射撃',
    hp: 2, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'target_ally', effect: 'rotate', value: 1,
        description: '召喚時、味方1体を回転させる。' },
    ],
  },
  {
    id: 'snipe_v2_06', name: '鷹眼のトワ', type: 'character',
    faction: 'snipe', element: 'geist', schoolClass: '射撃',
    hp: 3, atk: 3, manaCost: 3, activateCost: 2,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      // 遠距離ヒット時マーク → on_attack mark target_enemy
      { trigger: 'on_attack', target: 'target_enemy', effect: 'mark', value: 1,
        description: '遠距離ヒット時、その敵を再マークする。' },
    ],
  },
  {
    id: 'snipe_v2_07', name: '断空のキリ', type: 'character',
    faction: 'snipe', element: 'licht', schoolClass: '射撃',
    hp: 3, atk: 3, manaCost: 3, activateCost: 2,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      // 四隅にいるならATK+1
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'in_corner' },
        description: '四隅にいるならATK+1。' },
    ],
  },
  {
    id: 'snipe_v2_08', name: '追尾のナオ', type: 'character',
    faction: 'snipe', element: 'nacht', schoolClass: '射撃',
    hp: 4, atk: 3, manaCost: 4, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      // マーク敵に追加1ダメージ → on_attack damage target_enemy
      { trigger: 'on_attack', target: 'target_enemy', effect: 'damage', value: 1,
        description: 'マークされた敵に追加1ダメージ。' },
    ],
  },
  {
    id: 'snipe_v2_09', name: '虚眼のゼクス', type: 'character',
    faction: 'snipe', element: 'nicht', schoolClass: '射撃',
    hp: 4, atk: 2, manaCost: 5, activateCost: 3,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      // 異なる敵2体を攻撃 → v1のゼクス特殊処理を再利用（id: snipe_v2_09）
    ],
  },
  {
    id: 'snipe_v2_10', name: '滅線のアイン', type: 'character',
    faction: 'snipe', element: 'faust', schoolClass: '射撃',
    hp: 4, atk: 4, manaCost: 4, activateCost: 3,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      // 無条件: 召喚時に敵1体に2ダメージ + 自身1ドロー（即時価値）
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'damage', value: 3,
        description: '召喚時、敵1体に3ダメージ。' },
      { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
        description: '召喚時、1ドロー。' },
      // エース条件: 反撃不能敵2体以上で追加マーク+ドロー
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'mark', value: 1,
        condition: { type: 'ace_condition_gte', value: 2 },
        description: 'エース条件2以上で敵1体にマークを付与。' },
      { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
        condition: { type: 'ace_condition_gte', value: 2 },
        description: 'エース条件2以上で1ドロー。' },
    ],
  },
  {
    id: 'snipe_v2_11', name: '観測のソラ', type: 'character',
    faction: 'snipe', element: 'geist', schoolClass: '射撃',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1, handCost: 1,
          description: '召喚時、手札を1枚捨て、その後1ドロー。' },
      ],
    },
  {
    id: 'snipe_v2_12', name: '天測のロギア', type: 'character',
    faction: 'snipe', element: 'licht', schoolClass: '射撃',
    hp: 4, atk: 4, manaCost: 4, activateCost: 3,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
        description: '召喚時、1ドロー。' },
      // エース条件: 反撃不能敵3体以上で貫通付与+ATK+1
      { trigger: 'on_summon', target: 'self', effect: 'grant_piercing', value: 1,
        condition: { type: 'ace_condition_gte', value: 3 },
        description: 'エース条件3以上で貫通を得る。' },
      { trigger: 'on_summon', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'ace_condition_gte', value: 3 },
        description: 'エース条件3以上でATK+1。' },
    ],
  },
];

// ========================================
// F: トリック — B位置を作って盤面を崩す
// ========================================

const trick_v2: CharacterCard[] = [
  {
    id: 'trick_v2_01', name: '旋風のツバキ', type: 'character',
    faction: 'trick', element: 'faust', schoolClass: 'intel',
    hp: 1, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'rotate', value: 1,
          description: '召喚時、敵1体を90度回転させる。' },
        { trigger: 'on_summon', target: 'self', effect: 'exhaust_attack', value: 1,
          description: 'このターン攻撃できない。' },
      ],
    },
  {
    id: 'trick_v2_02', name: '瞬光のハク', type: 'character',
    faction: 'trick', element: 'geist', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1, handCost: 1,
          description: '召喚時、手札を1枚捨て、その後1ドロー。' },
      ],
    },
  {
    id: 'trick_v2_03', name: '虚遁のカイト', type: 'character',
    faction: 'trick', element: 'licht', schoolClass: 'intel',
    hp: 1, atk: 1, manaCost: 1, activateCost: 2,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'self', effect: 'gain_mana', value: 1, handCost: 1,
          description: '召喚時、手札を1枚捨ててもよい。そうしたならマナ+1。' },
        { trigger: 'on_summon', target: 'self', effect: 'exhaust_attack', value: 1,
          description: 'このターン攻撃できない。' },
      ],
    },
  {
    id: 'trick_v2_04', name: '瞬転のリップル', type: 'character',
    faction: 'trick', element: 'nacht', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
        { trigger: 'on_summon', target: 'target_ally', effect: 'swap', value: 1,
          description: '召喚時、味方1体と位置を入れ替える。' },
        { trigger: 'on_summon', target: 'self', effect: 'exhaust_attack', value: 1,
          description: 'このターン攻撃できない。' },
      ],
    },
  {
    id: 'trick_v2_05', name: '幻影のシノブ', type: 'character',
    faction: 'trick', element: 'nicht', schoolClass: 'intel',
    hp: 2, atk: 2, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: ['dodge'],
    effects: [
      // B位置の敵を攻撃時ATK+1
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        description: 'B位置の敵を攻撃する時、ATK+1。' },
    ],
  },
  {
    id: 'trick_v2_06', name: '策謀のルシア', type: 'character',
    faction: 'trick', element: 'faust', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 2, activateCost: 2,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'push', value: 1,
        description: '召喚時、敵1体を1マス押し出す。' },
    ],
  },
  {
    id: 'trick_v2_07', name: '光遁のミラージュ', type: 'character',
    faction: 'trick', element: 'geist', schoolClass: 'intel',
    hp: 3, atk: 2, manaCost: 3, activateCost: 2,
    attackRange: 'front_left', attackType: 'physical', keywords: [],
    effects: [
      // B位置敵に追加1ダメージ → on_attack damage
      { trigger: 'on_attack', target: 'target_enemy', effect: 'damage', value: 1,
        description: 'B位置の敵に追加1ダメージ。' },
    ],
  },
  {
    id: 'trick_v2_08', name: '拳舞のシュラ', type: 'character',
    faction: 'trick', element: 'licht', schoolClass: 'combat',
    hp: 2, atk: 2, manaCost: 2, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // 位置入替していたらATK+1
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'has_swapped_this_turn' },
        description: 'このターン位置入れ替えを行っているならATK+1。' },
    ],
  },
  {
    id: 'trick_v2_09', name: '虚幻のジョーカー', type: 'character',
    faction: 'trick', element: 'nacht', schoolClass: 'intel',
    hp: 5, atk: 3, manaCost: 5, activateCost: 3,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      // 敵2体の位置or向きを崩す → on_summon rotate 2体
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'rotate', value: 1,
        description: '召喚時、敵2体の位置か向きを崩す。(シム: 敵1体回転)' },
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'push', value: 1,
        description: '敵1体を押し出す。' },
    ],
  },
  {
    id: 'trick_v2_10', name: '迷陣のアオイ', type: 'character',
    faction: 'trick', element: 'nicht', schoolClass: 'intel',
    hp: 4, atk: 3, manaCost: 4, activateCost: 2,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      // 空きマスが5個以上ならATK+1
      { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
        condition: { type: 'empty_cells_gte', value: 5 },
        description: '空きマスが5個以上ならATK+1。' },
    ],
  },
  {
    id: 'trick_v2_11', name: '裏界のカレン', type: 'character',
    faction: 'trick', element: 'faust', schoolClass: 'intel',
    hp: 2, atk: 1, manaCost: 1, activateCost: 1,
    attackRange: 'front1', attackType: 'physical', keywords: [],
    effects: [
      // 死角の敵攻撃時1ドロー（B位置≒ブラインドスポット）
      { trigger: 'on_attack', target: 'self', effect: 'draw', value: 1,
        condition: { type: 'blind_spot' },
        description: '死角の敵を攻撃した時、1ドロー。' },
    ],
  },
  {
    id: 'trick_v2_12', name: '転界のオボロ', type: 'character',
    faction: 'trick', element: 'geist', schoolClass: 'intel',
    hp: 4, atk: 4, manaCost: 4, activateCost: 3,
    attackRange: 'magic', attackType: 'magic', keywords: [],
    effects: [
      // 無条件: 召喚時に敵1体を回転+押し出し+1ドロー（即時価値）
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'rotate', value: 1,
        description: '召喚時、敵1体を回転。' },
      { trigger: 'on_summon', target: 'adjacent_enemy', effect: 'push', value: 2,
        description: '召喚時、敵1体を押し出す（壁なら2ダメージ）。' },
      { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
        description: '召喚時、1ドロー。' },
      // エース条件: 3体以上でさらに1ドロー
      { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
        condition: { type: 'ace_condition_gte', value: 3 },
        description: 'エース条件3以上で1ドロー。' },
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
