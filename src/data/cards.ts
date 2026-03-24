import type { CharacterCard, ItemCard, Card } from '../types/card';

// ========================================
// A: アグロ陣営 — 速攻
// テーマ: 低コスト・高ATK・前方特化・息切れが弱点
// コスト配分: 1×4, 2×3, 3×2, 4×1
// 属性配分: 拳×2, 念×2, 蝕×2, 闇×2, 虚×2
// ========================================

/** 召喚時に自分のHPを2失い、ATK+3を得る。HP1の紙装甲だが初撃ATK6は序盤で致命的 */
const aggro01: CharacterCard = {
  id: 'aggro_01',
  name: '迅刃のレイ',
  type: 'character',
  faction: 'aggro',
  element: 'faust',
  schoolClass: 'combat',
  hp: 1,
  atk: 1,
  manaCost: 1,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'self', effect: 'damage', value: 2,
      description: '召喚時、自分に2ダメージ' },
    { trigger: 'on_summon', target: 'self', effect: 'buff_atk', value: 1,
      description: 'ATK+1を得る' },
  ],
};

/** ターン開始時、手札を1枚捨ててマナ+1。手札をマナに変換するエコノミーカード */
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
    { trigger: 'on_turn_start', target: 'self', effect: 'gain_mana', value: 1, handCost: 1,
      description: 'ターン開始時、手札を1枚捨ててマナ+1（手札がなければ不発）' },
  ],
};

/** 先制+召喚時に手札1枚を捨てて敵を押し出す。場を荒らす突撃兵 */
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
    { trigger: 'on_summon', target: 'target_enemy', effect: 'push', value: 2, handCost: 1,
      description: '召喚時、手札を1枚捨てて敵1体を押し出す（壁なら2ダメージ。手札がなければ不発）' },
  ],
};

/** C1の高ATK素体。序盤から前線を張るアグロの先兵 */
const aggro04: CharacterCard = {
  id: 'aggro_04',
  name: '雷鳴のライカ',
  type: 'character',
  faction: 'aggro',
  element: 'geist',
  schoolClass: '射撃',
  hp: 2,
  atk: 1,
  manaCost: 1,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [],
};

/** 敵を撃破するとATK+1。攻撃するたびATK-1。ハイリスクな狩人 */
const aggro05: CharacterCard = {
  id: 'aggro_05',
  name: '蝕牙のドク',
  type: 'character',
  faction: 'aggro',
  element: 'nacht',
  schoolClass: '射撃',
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
};

/** C1の魔法射程素体。アグロ唯一のmagic型低コスト */
const aggro06: CharacterCard = {
  id: 'aggro_06',
  name: '崩蝕のエンマ',
  type: 'character',
  faction: 'aggro',
  element: 'nacht',
  schoolClass: 'intel',
  hp: 2,
  atk: 1,
  manaCost: 1,
  activateCost: 1,
  attackRange: 'magic',
  attackType: 'magic',
  keywords: [],
  effects: [],
};

/** 倒されると隣接味方HP3回復+ATK+2。散り際に仲間を奮起させるアグロの殿軍 */
const aggro07: CharacterCard = {
  id: 'aggro_07',
  name: '閃光のヒカリ',
  type: 'character',
  faction: 'aggro',
  element: 'licht',
  schoolClass: 'medic',
  hp: 4,
  atk: 3,
  manaCost: 3,
  activateCost: 2,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_destroyed', target: 'adjacent_allies', effect: 'heal', value: 3 },
    { trigger: 'on_destroyed', target: 'adjacent_allies', effect: 'buff_atk', value: 2 },
  ],
};

/** 正面行を薙ぎ払い、攻撃後に向きを変える剣士。マナ回収で連続展開を支える */
const aggro08: CharacterCard = {
  id: 'aggro_08',
  name: '光刃のセラ',
  type: 'character',
  faction: 'aggro',
  element: 'licht',
  schoolClass: 'combat',
  hp: 6,
  atk: 4,
  manaCost: 5,
  activateCost: 3,
  attackRange: 'front_row',
  attackType: 'physical',
  keywords: ['piercing'],
  effects: [
    { trigger: 'on_attack', target: 'self', effect: 'gain_mana', value: 2,
      description: '攻撃時、マナ+2' },
    { trigger: 'on_attack', target: 'self', effect: 'rotate', value: 0,
      description: '攻撃後、自分の向きを任意に変更' },
  ],
};

/** 召喚時に手札を1枚捨てて2枚ドロー。手札の質を入れ替える軽量ドローエンジン */
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
    { trigger: 'on_summon', target: 'self', effect: 'discard_draw', value: 1, handCost: 1,
      description: '召喚時、手札を1枚捨てて2枚ドロー' },
  ],
};

/** 手札を吐き切って盤面をこじ開けるアグロの顔。ドローを捨てて制圧圧力を広げる暴君 */
const aggro10: CharacterCard = {
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
    { trigger: 'on_turn_start', target: 'self', effect: 'skip_draw', value: 99,
      description: '【選択】手札から任意の枚数をデッキに戻す。1枚以上戻したら攻撃コスト-2' },
    { trigger: 'on_turn_start', target: 'self', effect: 'reduce_activate_cost', value: 2,
      description: '' },
    { trigger: 'on_summon', target: 'self', effect: 'draw', value: 0,
      description: 'カイザーの隣にキャラが召喚された時、1枚ドロー（パッシブ）' },
    { trigger: 'on_attack', target: 'self', effect: 'range_expand', value: 0,
      condition: { type: 'hand_count_lte', value: 0 },
      description: '手札0枚の時、攻撃範囲が前後左右(十字)に拡張' },
    { trigger: 'on_summon', target: 'self', effect: 'draw', value: 1,
      description: 'カイザーの隣接マスにキャラが召喚された時、1枚ドロー（パッシブ）' },
  ],
};

// ========================================
// B: タンク陣営 — 耐久
// テーマ: 高HP・回復・Protection・攻め手不足が弱点
// コスト配分: 1×2, 2×3, 3×3, 4×2
// 属性配分: 拳×2, 念×2, 蝕×2, 闇×2, 虚×2
// ========================================

/** 防護+貫通+不動。鉄壁の中盤の柱 */
const tank01: CharacterCard = {
  id: 'tank_01',
  name: '鉄壁のガルド',
  type: 'character',
  faction: 'tank',
  element: 'faust',
  schoolClass: 'combat',
  hp: 4, atk: 3, manaCost: 4,
  activateCost: 2,
  attackRange: 'front2_line', attackType: 'physical',
  keywords: ['protection', 'piercing', 'anchor'],
  effects: [],
};

/** 要塞+反射。殴れば殴るほど自分が痛い鏡の壁。HP50%以下でATK+3 */
const tank02: CharacterCard = {
  id: 'tank_02',
  name: '剛拳のイワオ',
  type: 'character',
  faction: 'tank',
  element: 'faust',
  schoolClass: 'combat',
  hp: 2,
  atk: 2,
  manaCost: 2,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: ['fortress'],
  effects: [
    { trigger: 'on_damaged', target: 'target_enemy', effect: 'damage', value: 0,
      description: '被ダメ時、受けた値と同じダメージを攻撃者に与える' },
    { trigger: 'on_damaged', target: 'self', effect: 'buff_atk', value: 3,
      condition: { type: 'hp_pct_lte', value: 50 },
      description: 'HP50%以下になった時、ATK+3' },
  ],
};

/** 召喚時に隣接味方ATK+2。タンク陣営の火力源 */
const tank03: CharacterCard = {
  id: 'tank_03',
  name: '念盾のアオイ',
  type: 'character',
  faction: 'tank',
  element: 'geist',
  schoolClass: 'strategy',
  hp: 2,
  atk: 2,
  manaCost: 2,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: ['reflect'],
  effects: [],
};

/** 攻撃時に敵ATK-1。魔法で安全にデバフを撒く持久戦の達人 */
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
};

/** Protection持ち。被ダメ時に攻撃者に2ダメージ返す棘の壁 */
const tank05: CharacterCard = {
  id: 'tank_05',
  name: '蝕耐のヴェノ',
  type: 'character',
  faction: 'tank',
  element: 'nacht',
  schoolClass: 'combat',
  hp: 2,
  atk: 2,
  manaCost: 2,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: ['protection', 'damage_link'],
  effects: [],
};

/** 召喚時に敵を1T封印+ATK-1。妨害特化の中コスト */
const tank06: CharacterCard = {
  id: 'tank_06',
  name: '蝕霧のカスミ',
  type: 'character',
  faction: 'tank',
  element: 'nacht',
  schoolClass: 'intel',
  hp: 4,
  atk: 1,
  manaCost: 3,
  activateCost: 2,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'seal', value: 1,
      description: '召喚時、敵1体を1ターン封印' },
    { trigger: 'on_summon', target: 'target_enemy', effect: 'debuff_atk', value: 1,
      description: 'その敵のATK-1' },
  ],
};

/** 召喚時に隣接味方を1回復し、1枚ドロー。回復とドローの接続札 */
const tank07: CharacterCard = {
  id: 'tank_07',
  name: '癒しのミコト',
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
};

/** エース。カバーで隣接味方を守り、守るたびに味方を奮起させる守護核 */
const tank08: CharacterCard = {
  id: 'tank_08',
  name: '聖盾のルミナ',
  type: 'character',
  faction: 'tank',
  element: 'licht',
  schoolClass: 'medic',
  hp: 6,
  atk: 4,
  manaCost: 5,
  activateCost: 3,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: ['protection', 'cover'],
  effects: [
    { trigger: 'on_summon', target: 'adjacent_allies', effect: 'grant_protection', value: 1,
      description: '召喚時、隣接味方全員に【防護】を付与' },
    { trigger: 'on_damaged', target: 'adjacent_allies', effect: 'buff_atk', value: 1,
      description: '【固有能力】カバーで味方の代わりにダメージを受けた時、守られた味方のATK+1' },
  ],
};

/** 正面からの物理を弾く壁。殴られるほど強くなる逆転の盾 */
const tank09: CharacterCard = {
  id: 'tank_09',
  name: '虚壁のムゲン',
  type: 'character',
  faction: 'tank',
  element: 'nicht',
  schoolClass: 'strategy',
  hp: 2,
  atk: 1,
  manaCost: 1,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  blindPattern: 'back_sides',
  keywords: [],
  effects: [
    { trigger: 'on_damaged', target: 'self', effect: 'grant_dodge', value: 0,
      condition: { type: 'attacked_from_front' },
      description: '正面から物理攻撃された時、【回避】（物理攻撃を受けない。魔法・貫通は通る）' },
  ],
};

/** 要塞+カバーで味方を守り、倒れた時に味方全体を鼓舞する不沈の盾 */
const tank10: CharacterCard = {
  id: 'tank_10',
  name: '虚鎮のナギサ',
  type: 'character',
  faction: 'tank',
  element: 'nicht',
  schoolClass: '射撃',
  hp: 6,
  atk: 4,
  manaCost: 5,
  activateCost: 3,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: ['fortress', 'cover'],
  effects: [
    { trigger: 'on_destroyed', target: 'all_allies', effect: 'heal', value: 1,
      description: '撃破された時、味方全体HP+1' },
    { trigger: 'on_destroyed', target: 'all_allies', effect: 'buff_atk', value: 1,
      description: '味方全体ATK+1' },
    { trigger: 'on_turn_start', target: 'self', effect: 'damage', value: 1,
      description: '毎ターン開始時、自分に1ダメージ' },
  ],
};

// ========================================
// C: コントロール陣営 — 妨害
// テーマ: 封印・地形操作・デバフ・自軍打点が弱い
// コスト配分: 1×2, 2×4, 3×2, 4×2
// 属性配分: 拳×2, 念×2, 蝕×2, 闇×2, 虚×2
// ========================================

/** 全方向死角の洗脳術者。倒せば洗脳解除 */
const control01: CharacterCard = {
  id: 'control_01',
  name: '惑心のシズク',
  type: 'character',
  faction: 'control',
  element: 'faust',
  schoolClass: 'intel',
  hp: 2,
  atk: 0,
  manaCost: 2,
  activateCost: 1,
  attackRange: 'front_row',
  attackType: 'magic',
  blindPattern: 'all',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'adjacent_enemies', effect: 'brainwash', value: 99,
      description: '召喚時、隣接する敵を洗脳（シズクがいる限り持続）' },
  ],
};

/** 全方向死角の洗脳術者。地形反転+闇マスで洗脳。倒せば解除 */
const control02: CharacterCard = {
  id: 'control_02',
  name: '地裂のドルン',
  type: 'character',
  faction: 'control',
  element: 'faust',
  schoolClass: 'strategy',
  hp: 2,
  atk: 1,
  manaCost: 2,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  blindPattern: 'all',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_cell', effect: 'field_quake', value: 0,
      description: '召喚時、対象マスの属性を反転' },
    { trigger: 'on_attack', target: 'target_enemy', effect: 'brainwash', value: 99,
      condition: { type: 'on_element', value: 'nacht' },
      description: '闇マスにいる時、攻撃時に対象を洗脳（ドルンがいる限り持続）' },
  ],
};

/** 攻撃時に敵を180°回転。ブラインドを晒す妨害役 */
const control03: CharacterCard = {
  id: 'control_03',
  name: '念縛のリン',
  type: 'character',
  faction: 'control',
  element: 'geist',
  schoolClass: 'intel',
  hp: 2,
  atk: 2,
  manaCost: 2,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_attack', target: 'target_enemy', effect: 'rotate', value: 2,
      description: '攻撃時、対象を180°回転' },
  ],
};

/** 貫通+攻撃時ATK-2の重デバフ。守護裏のエースにもデバフが届く */
const control04: CharacterCard = {
  id: 'control_04',
  name: '念断のゲッカ',
  type: 'character',
  faction: 'control',
  element: 'geist',
  schoolClass: 'combat',
  hp: 4,
  atk: 3,
  manaCost: 3,
  activateCost: 2,
  attackRange: 'front_left',
  attackType: 'physical',
  keywords: ['piercing'],
  effects: [
    { trigger: 'on_attack', target: 'target_enemy', effect: 'debuff_atk', value: 2 },
  ],
};

/** 召喚時、敵1体を1ターン封印する。軽い妨害の時間稼ぎ */
const control05: CharacterCard = {
  id: 'control_05',
  name: '蝕縛のヤミカ',
  type: 'character',
  faction: 'control',
  element: 'nacht',
  schoolClass: 'intel',
  hp: 2, atk: 2, manaCost: 2, activateCost: 2,
  attackRange: 'magic', attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'seal', value: 1,
      description: '召喚時、敵1体を1ターン封印する' },
  ],
};

/** 召喚時1ドロー。コントロール陣営のドロー加速接続札 */
const control06: CharacterCard = {
  id: 'control_06',
  name: '蝕変のアルマ',
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
};

/** 着地ターンに試合を動かす支配エース。自前でbrainwash対象を生成し仕留める */
const control07: CharacterCard = {
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
};

/** HP1で洗脳が起動する罠壁。殴り切るか放置するかの二択を迫る */
const control08: CharacterCard = {
  id: 'control_08',
  name: '光鎖のレティ',
  type: 'character',
  faction: 'control',
  element: 'licht',
  schoolClass: 'combat',
  hp: 3,
  atk: 2,
  manaCost: 3,
  activateCost: 2,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: ['protection'],
  effects: [
    { trigger: 'on_damaged', target: 'adjacent_enemies', effect: 'brainwash', value: 99,
      condition: { type: 'hp_lte', value: 1 },
      description: 'HPが1になった時、隣接する敵を洗脳（レティがいる限り持続）' },
  ],
};

/** 手札を捨てるたびマナ+1。カランの前衛。手札をマナに変換する錬金術師 */
const control09: CharacterCard = {
  id: 'control_09',
  name: '虚空のスイ',
  type: 'character',
  faction: 'control',
  element: 'nicht',
  schoolClass: '射撃',
  hp: 1,
  atk: 1,
  manaCost: 1,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_discard', target: 'self', effect: 'gain_mana', value: 1,
      description: '手札を捨てるたびマナ+1' },
    { trigger: 'on_destroyed', target: 'self', effect: 'draw', value: 1,
      description: '撃破された時、1ドロー' },
  ],
};

/** カランがいる限り対象は凍結し続ける。盤面を支配する凍結の支配者 */
const control10: CharacterCard = {
  id: 'control_10',
  name: '虚無のカラン',
  type: 'character',
  faction: 'control',
  element: 'nicht',
  schoolClass: 'strategy',
  hp: 6,
  atk: 4,
  manaCost: 5,
  activateCost: 3,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'freeze', value: 99,
      description: '召喚時、敵1体をカランがいる限り凍結' },
    { trigger: 'on_summon', target: 'target_enemy', effect: 'debuff_atk', value: 3,
      description: '対象のATK-3' },
  ],
};

// ========================================
// D: シナジー陣営 — マーカー蓄積
// テーマ: 味方にキーワードマーカーを蓄積し、アルスが消費して勝つ
// 扱うマーカー: 防護 / 回避 / 貫通 / 先制（全て1回消費）
// コスト配分: C1×4, C2×5, C4×2, C6×1
// ========================================

/** 召喚時に手札1枚捨ててマナ+1。シナジー陣営のマナ加速札 */
const synergy01: CharacterCard = {
  id: 'synergy_01',
  name: '守紋のシルト',
  type: 'character',
  faction: 'synergy',
  element: 'faust',
  schoolClass: 'strategy',
  hp: 2, atk: 1, manaCost: 1, activateCost: 1,
  attackRange: 'front1', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'self', effect: 'gain_mana', value: 1, handCost: 1,
      description: '召喚時、手札を1枚捨ててマナ+1（手札がなければ不発）' },
  ],
};

/** 召喚時、隣接味方1体に【先制】を与える。先制マーカーの起点 */
const synergy02: CharacterCard = {
  id: 'synergy_02',
  name: '疾風のヴィント',
  type: 'character',
  faction: 'synergy',
  element: 'faust',
  schoolClass: 'combat',
  hp: 2, atk: 1, manaCost: 1, activateCost: 1,
  attackRange: 'front1', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_ally', effect: 'grant_quickness', value: 1,
      description: '召喚時、隣接味方1体に【先制】を与える（味方なしなら自分）' },
  ],
};

/** 召喚時、味方2体以上なら隣接味方1体に【回避】。条件付き付与 */
const synergy03: CharacterCard = {
  id: 'synergy_03',
  name: '紡絆のツムギ',
  type: 'character',
  faction: 'synergy',
  element: 'geist',
  schoolClass: 'medic',
  hp: 3, atk: 2, manaCost: 2, activateCost: 2,
  attackRange: 'magic', attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_ally', effect: 'grant_dodge', value: 1,
      condition: { type: 'ally_count_gte', value: 2 },
      description: '召喚時、味方2体以上なら隣接味方1体に【回避】を与える' },
  ],
};

/** 召喚時、自分または隣接味方1体に【貫通】を与える */
const synergy04: CharacterCard = {
  id: 'synergy_04',
  name: '念波のコダマ',
  type: 'character',
  faction: 'synergy',
  element: 'geist',
  schoolClass: 'intel',
  hp: 3, atk: 2, manaCost: 2, activateCost: 1,
  attackRange: 'front1', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_ally', effect: 'grant_piercing', value: 1,
      description: '召喚時、自分または隣接味方1体に【貫通】を与える' },
  ],
};

/** 召喚時、味方1体を引き寄せ、その味方に【防護】を与える */
const synergy05: CharacterCard = {
  id: 'synergy_05',
  name: '共鳴のハルカ',
  type: 'character',
  faction: 'synergy',
  element: 'nacht',
  schoolClass: 'strategy',
  hp: 2, atk: 2, manaCost: 2, activateCost: 2,
  attackRange: 'magic', attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_ally', effect: 'pull', value: 0,
      description: '召喚時、味方1体を引き寄せる' },
    { trigger: 'on_summon', target: 'target_ally', effect: 'grant_protection', value: 1,
      description: '引き寄せた味方に【防護】を与える' },
  ],
};

/** 撃破された時、隣接味方1体に【先制】を与える。犠牲の接続札 */
const synergy06: CharacterCard = {
  id: 'synergy_06',
  name: '蝕連のシュウ',
  type: 'character',
  faction: 'synergy',
  element: 'nacht',
  schoolClass: 'combat',
  hp: 1, atk: 1, manaCost: 1, activateCost: 1,
  attackRange: 'front1', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_destroyed', target: 'target_ally', effect: 'grant_quickness', value: 1,
      description: '撃破された時、隣接味方1体に【先制】を与える' },
  ],
};

/** 召喚時、隣接味方HP1回復。自属性マスなら隣接味方全員に【防護】 */
const synergy07: CharacterCard = {
  id: 'synergy_07',
  name: '護陣のミナト',
  type: 'character',
  faction: 'synergy',
  element: 'licht',
  schoolClass: 'medic',
  hp: 4, atk: 2, manaCost: 4, activateCost: 2,
  attackRange: 'front1', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'adjacent_allies', effect: 'heal', value: 1,
      description: '召喚時、隣接味方HP1回復' },
    { trigger: 'on_summon', target: 'adjacent_allies', effect: 'grant_protection', value: 1,
      condition: { type: 'same_element_cell' },
      description: '自属性マスにいるなら隣接味方全員に【防護】を与える' },
  ],
};

/** 味方のマーカー総数2個以上なら自分に【貫通】【先制】を得る変換札 */
const synergy08: CharacterCard = {
  id: 'synergy_08',
  name: '光絆のアカリ',
  type: 'character',
  faction: 'synergy',
  element: 'licht',
  schoolClass: 'strategy',
  hp: 4, atk: 3, manaCost: 4, activateCost: 2,
  attackRange: 'front1', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'self', effect: 'grant_piercing', value: 1,
      condition: { type: 'ally_count_gte', value: 2 },
      description: '召喚時、味方のマーカー2個以上なら【貫通】を得る' },
    { trigger: 'on_summon', target: 'self', effect: 'grant_quickness', value: 1,
      condition: { type: 'ally_count_gte', value: 2 },
      description: '味方のマーカー2個以上なら【先制】を得る' },
  ],
};

/** 召喚時1ドロー。シナジー陣営のドロー加速接続札 */
const synergy09: CharacterCard = {
  id: 'synergy_09',
  name: '幻霧のネーベル',
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
};

/** 【盟約の収穫】味方のマーカーを全て自分に集め、数に応じてATK上昇。シナジーの顔 */
const synergy10: CharacterCard = {
  id: 'synergy_10',
  name: '盟約のアルス',
  type: 'character',
  faction: 'synergy',
  element: 'nicht',
  schoolClass: 'strategy',
  hp: 7, atk: 3, manaCost: 6, activateCost: 3,
  attackRange: 'front_row', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'self', effect: 'consume_markers', value: 0,
      description: '召喚時、味方のマーカーを全て自分に集める。2個以上:ATK+2、4個以上:さらにATK+2' },
  ],
};

// ========================================
// E: スナイプ陣営 — 狙撃
// テーマ: 高ATK・Piercing・ガラスの大砲・HP低い
// コスト配分: 1×3, 2×3, 3×2, 4×2
// 属性配分: 拳×2, 念×2, 蝕×2, 闇×2, 虚×2
// ========================================

/** HP1の脆い狙撃手。死角から攻撃時ATK+1 */
const snipe01: CharacterCard = {
  id: 'snipe_01',
  name: '鋭眼のマルコ',
  type: 'character',
  faction: 'snipe',
  element: 'faust',
  schoolClass: '射撃',
  hp: 1, atk: 2, manaCost: 1, activateCost: 1,
  attackRange: 'front1', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
      condition: { type: 'blind_spot' },
      description: '死角から攻撃時、ATK+1' },
  ],
};

/** 召喚時、敵1体を90°回転させる。死角を作る条件づくり役 */
const snipe02: CharacterCard = {
  id: 'snipe_02',
  name: '旋弾のガウス',
  type: 'character',
  faction: 'snipe',
  element: 'faust',
  schoolClass: 'combat',
  hp: 2, atk: 2, manaCost: 2, activateCost: 1,
  attackRange: 'front1', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'rotate', value: 1,
      description: '召喚時、敵1体を90°回転させる' },
  ],
};

/** 射程2。死角から攻撃時に【貫通】を得る。ATK-1デバフ付き */
const snipe03: CharacterCard = {
  id: 'snipe_03',
  name: '念弾のリーゼ',
  type: 'character',
  faction: 'snipe',
  element: 'geist',
  schoolClass: '射撃',
  hp: 3, atk: 2, manaCost: 2, activateCost: 2,
  attackRange: 'front2_line', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_attack', target: 'self', effect: 'grant_piercing', value: 1,
      condition: { type: 'blind_spot' },
      description: '死角から攻撃時、【貫通】を得る' },
    { trigger: 'on_attack', target: 'target_enemy', effect: 'debuff_atk', value: 1,
      description: '攻撃時、対象ATK-1' },
  ],
};

/** 魔法全域。自属性マスにいるなら【貫通】を得る */
const snipe04: CharacterCard = {
  id: 'snipe_04',
  name: '念穿のヴァルト',
  type: 'character',
  faction: 'snipe',
  element: 'geist',
  schoolClass: 'intel',
  hp: 4, atk: 3, manaCost: 3, activateCost: 3,
  attackRange: 'magic', attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_attack', target: 'self', effect: 'grant_piercing', value: 1,
      condition: { type: 'same_element_cell' },
      description: '自属性マスにいるなら【貫通】を得る' },
  ],
};

/** 射程2。HP2以下の敵に【貫通】。撃破でドロー。止め専門 */
const snipe05: CharacterCard = {
  id: 'snipe_05',
  name: '穿孔のアッシュ',
  type: 'character',
  faction: 'snipe',
  element: 'nacht',
  schoolClass: '射撃',
  hp: 4, atk: 3, manaCost: 4, activateCost: 2,
  attackRange: 'front2_line', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_attack', target: 'self', effect: 'grant_piercing', value: 1,
      condition: { type: 'target_hp_lte', value: 2 },
      description: '対象HP2以下なら【貫通】を得る' },
    { trigger: 'on_attack', target: 'self', effect: 'draw', value: 1,
      description: '攻撃で敵を撃破したら1ドロー' },
  ],
};

/** 召喚時に手札1枚捨ててマナ+1。スナイプ陣営のマナ加速札 */
const snipe06: CharacterCard = {
  id: 'snipe_06',
  name: '蝕弾のニドル',
  type: 'character',
  faction: 'snipe',
  element: 'nacht',
  schoolClass: 'intel',
  hp: 1, atk: 1, manaCost: 1, activateCost: 1,
  attackRange: 'front1', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'self', effect: 'gain_mana', value: 1, handCost: 1,
      description: '召喚時、手札を1枚捨ててマナ+1（手札がなければ不発）' },
  ],
};

/** 攻撃時、対象マスと虚マスの属性を入替。自属性マスならマナ+1 */
const snipe07: CharacterCard = {
  id: 'snipe_07',
  name: '地脈のエリス',
  type: 'character',
  faction: 'snipe',
  element: 'licht',
  schoolClass: 'medic',
  hp: 2, atk: 2, manaCost: 2, activateCost: 2,
  attackRange: 'magic', attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_attack', target: 'target_cell', effect: 'element_corrupt', value: 0,
      description: '攻撃時、対象マスと虚マスの属性を入替える' },
    { trigger: 'on_attack', target: 'self', effect: 'gain_mana', value: 1,
      condition: { type: 'same_element_cell' },
      description: '自属性マスにいるならマナ+1' },
  ],
};

/** 撃破された時、味方1体に【貫通】を与え、1ドロー */
const snipe08: CharacterCard = {
  id: 'snipe_08',
  name: '継弾のフィーネ',
  type: 'character',
  faction: 'snipe',
  element: 'licht',
  schoolClass: 'strategy',
  hp: 1, atk: 1, manaCost: 1, activateCost: 1,
  attackRange: 'front1', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_destroyed', target: 'target_ally', effect: 'grant_piercing', value: 1,
      description: '撃破された時、味方1体に【貫通】を与える' },
    { trigger: 'on_destroyed', target: 'self', effect: 'draw', value: 1,
      description: '撃破された時、1ドロー' },
  ],
};

/** 【隠密】全方向ブラインドの狙撃エース。死角ATK+2、自属性マスで貫通 */
const snipe09: CharacterCard = {
  id: 'snipe_09',
  name: '終焉のイグニス',
  type: 'character',
  faction: 'snipe',
  element: 'nicht',
  schoolClass: '射撃',
  hp: 4, atk: 3, manaCost: 5, activateCost: 3,
  attackRange: 'snipe', attackType: 'physical',
  blindPattern: 'all',
  keywords: ['stealth'],
  effects: [
    { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 2,
      condition: { type: 'blind_spot' },
      description: '死角から攻撃時、ATK+2' },
    { trigger: 'on_attack', target: 'self', effect: 'grant_piercing', value: 1,
      condition: { type: 'same_element_cell' },
      description: '自属性マスにいるなら【貫通】を得る' },
  ],
};

/** 魔法で異なる敵2体を攻撃。自属性+四隅でATK+1。面制圧型エース */
const snipe10: CharacterCard = {
  id: 'snipe_10',
  name: '虚眼のゼクス',
  type: 'character',
  faction: 'snipe',
  element: 'nicht',
  schoolClass: 'combat',
  hp: 4, atk: 2, manaCost: 5, activateCost: 3,
  attackRange: 'magic', attackType: 'magic',
  blindPattern: 'all',
  keywords: [],
  effects: [
    { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 1,
      condition: { type: 'same_element_cell' },
      description: '自属性マスにいるならATK+1' },
  ],
};

// ========================================
// F: トリック陣営 — 奇襲
// テーマ: 位置入替・回転・Perfect Dodge・効果が状況依存
// コスト配分: 1×4, 2×3, 3×2, 4×1
// 属性配分: 拳×2, 念×2, 蝕×2, 闇×2, 虚×2
// ========================================

/** 召喚時に敵を90°回転。死角を作るトリックの接続札 */
const trick01: CharacterCard = {
  id: 'trick_01',
  name: '旋風のツバキ',
  type: 'character',
  faction: 'trick',
  element: 'faust',
  schoolClass: 'combat',
  hp: 2,
  atk: 1,
  manaCost: 1,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'rotate', value: 1,
      description: '召喚時、敵1体を90°回転' },
  ],
};

/** 攻撃時に敵を180°回転。死角以外からの物理を回避する */
const trick02: CharacterCard = {
  id: 'trick_02',
  name: '拳舞のシュラ',
  type: 'character',
  faction: 'trick',
  element: 'faust',
  schoolClass: 'combat',
  hp: 2,
  atk: 2,
  manaCost: 2,
  activateCost: 1,
  attackRange: 'front_back',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_damaged', target: 'self', effect: 'grant_dodge', value: 0,
      condition: { type: 'attacked_from_non_blind' },
      description: '死角以外から物理攻撃された時、【回避】（物理攻撃を受けない。魔法・貫通は通る）' },
    { trigger: 'on_attack', target: 'target_enemy', effect: 'rotate', value: 2,
      description: '攻撃時、対象を180°回転' },
  ],
};

/** 位置入替+180°回転で死角を作る。C4の中継ぎトリッカー */
const trick03: CharacterCard = {
  id: 'trick_03',
  name: '転位のカゲロウ',
  type: 'character',
  faction: 'trick',
  element: 'geist',
  schoolClass: 'intel',
  hp: 2, atk: 2, manaCost: 3,
  activateCost: 2,
  attackRange: 'front1', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'swap', value: 0,
      description: '召喚時、敵1体と位置入替' },
    { trigger: 'on_summon', target: 'target_enemy', effect: 'rotate', value: 2,
      description: 'その敵を180°回転' },
    { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 2,
      condition: { type: 'blind_spot' },
      description: '死角から攻撃時、ATK+2' },
  ],
};

/** Perfect Dodge持ち。攻撃時に敵を回転させ死角を作る */
const trick04: CharacterCard = {
  id: 'trick_04',
  name: '幻影のシノブ',
  type: 'character',
  faction: 'trick',
  element: 'geist',
  schoolClass: 'intel',
  hp: 2,
  atk: 2,
  manaCost: 2,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'debuff_atk', value: 1,
      description: '召喚時、敵1体のATK-1' },
    { trigger: 'on_attack', target: 'target_enemy', effect: 'rotate', value: 1,
      description: '攻撃時、敵を90°回転' },
  ],
};

/** 召喚時に敵と位置入替+180°回転+ATK-1。貫通持ちの陣形破壊役 */
const trick05: CharacterCard = {
  id: 'trick_05',
  name: '幻惑のマボロシ',
  type: 'character',
  faction: 'trick',
  element: 'nacht',
  schoolClass: 'strategy',
  hp: 4,
  atk: 3,
  manaCost: 3,
  activateCost: 2,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: ['piercing'],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'swap', value: 0,
      description: '召喚時、敵1体と位置入替' },
    { trigger: 'on_summon', target: 'target_enemy', effect: 'rotate', value: 2,
      description: 'その敵を180°回転' },
    { trigger: 'on_summon', target: 'target_enemy', effect: 'debuff_atk', value: 1,
      description: 'ATK-1' },
  ],
};

/** 攻撃時に地形反転。フィールドを書き換える嫌がらせ役 */
const trick06: CharacterCard = {
  id: 'trick_06',
  name: '蝕戯のピエロ',
  type: 'character',
  faction: 'trick',
  element: 'nacht',
  schoolClass: 'strategy',
  hp: 2,
  atk: 1,
  manaCost: 1,
  activateCost: 1,
  attackRange: 'magic',
  attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_attack', target: 'target_cell', effect: 'field_quake', value: 0,
      description: '攻撃時、対象マスの属性を反転' },
  ],
};

/** 召喚時に敵1体を押し出す。場を乱す救援部隊 */
const trick07: CharacterCard = {
  id: 'trick_07',
  name: '光遁のミラージュ',
  type: 'character',
  faction: 'trick',
  element: 'licht',
  schoolClass: 'medic',
  hp: 4,
  atk: 3,
  manaCost: 3,
  activateCost: 2,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: ['dodge'],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'push', value: 0,
      description: '召喚時、敵1体を押し出す' },
  ],
};

/** 召喚時1ドロー。トリック陣営のドロー加速接続札 */
const trick08: CharacterCard = {
  id: 'trick_08',
  name: '瞬光のハク',
  type: 'character',
  faction: 'trick',
  element: 'licht',
  schoolClass: '射撃',
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
};

/** 召喚時に手札1枚捨ててマナ+1。トリック陣営のマナ加速札 */
const trick09: CharacterCard = {
  id: 'trick_09',
  name: '虚遁のカイト',
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
    { trigger: 'on_summon', target: 'self', effect: 'gain_mana', value: 1, handCost: 1,
      description: '召喚時、手札を1枚捨ててマナ+1（手札がなければ不発）' },
  ],
};

/** 【回避】物理攻撃を受けない（魔法・貫通は通る）。召喚時に最強の敵のATKを奪い取る道化師 */
const trick10: CharacterCard = {
  id: 'trick_10',
  name: '虚幻のジョーカー',
  type: 'character',
  faction: 'trick',
  element: 'nicht',
  schoolClass: 'strategy',
  hp: 6,
  atk: 2,
  manaCost: 5,
  activateCost: 3,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: ['dodge'],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'copy_atk', value: 0,
      description: '召喚時、最もATKが高い敵のATKを自分にコピー' },
    { trigger: 'on_summon', target: 'target_enemy', effect: 'debuff_atk', value: 99,
      description: 'その敵のATKを0にする' },
    { trigger: 'on_summon', target: 'target_enemy', effect: 'rotate', value: 2,
      description: 'その敵を180°回転させる' },
  ],
};

// ========================================
// アイテムカード (12枚)
// コスト0: 2枚 (テンポカード)
// コスト1: 4枚 (汎用)
// コスト2: 4枚 (中級)
// コスト3: 2枚 (強力)
// ========================================

/** コスト0。1枚ドロー。手札が薄い時のリカバリー */
const item01: ItemCard = {
  id: 'item_01',
  name: '緊急補給',
  type: 'item',
  manaCost: 0,
  effects: [
    { trigger: 'on_use', target: 'self', effect: 'draw', value: 2,
      description: '2枚ドロー' },
  ],
};

/** コスト0。マナ1獲得。次のアクションを1マナ分加速 */
const item02: ItemCard = {
  id: 'item_02',
  name: 'マナ結晶',
  type: 'item',
  manaCost: 0,
  effects: [
    { trigger: 'on_use', target: 'self', effect: 'gain_mana', value: 2,
      description: 'マナ+2' },
  ],
};

/** コスト1。味方1体HP3回復。基本的な回復カード */
const item03: ItemCard = {
  id: 'item_03',
  name: '応急キット',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_ally', effect: 'heal', value: 3 },
  ],
};

/** コスト1。味方1体ATK+2。攻撃前に使って火力増強 */
const item04: ItemCard = {
  id: 'item_04',
  name: '強化弾',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_ally', effect: 'buff_atk', value: 2 },
  ],
};

/** コスト1。敵1体ATK-2。相手の攻撃を弱める防御的カード */
const item05: ItemCard = {
  id: 'item_05',
  name: '弱体化ガス',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_enemy', effect: 'debuff_atk', value: 2 },
  ],
};

/** コスト1。敵1体に2ダメージ。軽い除去・トドメ用 */
const item06: ItemCard = {
  id: 'item_06',
  name: '手榴弾',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_enemy', effect: 'damage', value: 2 },
  ],
};

/** コスト2。対象マス属性反転+そのマスの敵に2ダメージ。地形破壊と攻撃を兼ねる */
const item07: ItemCard = {
  id: 'item_07',
  name: '地脈爆弾',
  type: 'item',
  manaCost: 2,
  effects: [
    { trigger: 'on_use', target: 'target_cell', effect: 'field_quake', value: 0 },
    { trigger: 'on_use', target: 'target_enemy', effect: 'damage', value: 2 },
  ],
};

/** コスト2。味方全体HP2回復。盤面維持のための範囲回復 */
const item08: ItemCard = {
  id: 'item_08',
  name: '広域治療薬',
  type: 'item',
  manaCost: 2,
  effects: [
    { trigger: 'on_use', target: 'all_allies', effect: 'heal', value: 2 },
  ],
};

/** コスト2。敵1体を1T封印+90°回転。能力封じつつ死角も作る呪縛の札 */
const item09: ItemCard = {
  id: 'item_09',
  name: '封印の札',
  type: 'item',
  manaCost: 2,
  effects: [
    { trigger: 'on_use', target: 'target_enemy', effect: 'seal', value: 1 },
    { trigger: 'on_use', target: 'target_enemy', effect: 'rotate', value: 1 },
  ],
};

/** コスト2。2枚ドロー。手札を大量補充して選択肢を広げる */
const item10: ItemCard = {
  id: 'item_10',
  name: '戦術書',
  type: 'item',
  manaCost: 2,
  effects: [
    { trigger: 'on_use', target: 'self', effect: 'draw', value: 2 },
  ],
};

/** コスト3。敵全体に3ダメージ+ATK-1+180°回転。盤面を一瞬で崩壊させる最終兵器 */
const item11: ItemCard = {
  id: 'item_11',
  name: '異能爆弾',
  type: 'item',
  manaCost: 3,
  effects: [
    { trigger: 'on_use', target: 'target_enemy', effect: 'damage', value: 3 },
    { trigger: 'on_use', target: 'target_enemy', effect: 'debuff_atk', value: 1 },
    { trigger: 'on_use', target: 'target_enemy', effect: 'rotate', value: 2 },
  ],
};

/** コスト3。味方全体ATK+2+HP2回復。攻守両面を強化する切り札 */
const item12: ItemCard = {
  id: 'item_12',
  name: '総員強化令',
  type: 'item',
  manaCost: 3,
  effects: [
    { trigger: 'on_use', target: 'all_allies', effect: 'buff_atk', value: 2 },
    { trigger: 'on_use', target: 'all_allies', effect: 'heal', value: 2 },
  ],
};

/** コスト1。敵1体を凍結（次ターン行動不能）。Check崩しを1ターン遅延 */
const item13: ItemCard = {
  id: 'item_13',
  name: '氷結弾',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_enemy', effect: 'freeze', value: 1 },
  ],
};

/** コスト2。敵1体の向きを180°反転+1T向き固定。死角を強制的に作る */
const item14: ItemCard = {
  id: 'item_14',
  name: '拘束鎖',
  type: 'item',
  manaCost: 2,
  effects: [
    { trigger: 'on_use', target: 'target_enemy', effect: 'rotate', value: 2 },
    { trigger: 'on_use', target: 'target_enemy', effect: 'direction_lock', value: 1 },
  ],
};

/** コスト1。対象マスの属性をnichtに。HP有利を消す地形妨害 */
const item15: ItemCard = {
  id: 'item_15',
  name: '虚無の種',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_cell', effect: 'element_corrupt', value: 0 },
  ],
};

/** コスト2。敵1体にprotection無視2ダメージ。壁役を貫く */
const item16: ItemCard = {
  id: 'item_16',
  name: '貫通砲',
  type: 'item',
  manaCost: 2,
  effects: [
    { trigger: 'on_use', target: 'target_enemy', effect: 'piercing_damage', value: 2 },
  ],
};

/** コスト2。敵2体の位置を入替え。Checkの配置を崩す */
const item17: ItemCard = {
  id: 'item_17',
  name: '転送装置',
  type: 'item',
  manaCost: 2,
  effects: [
    { trigger: 'on_use', target: 'target_enemy', effect: 'swap_enemies', value: 0 },
  ],
};

/** コスト1。味方1体HP3回復+ATK+1。前線維持の補給 */
const item18: ItemCard = {
  id: 'item_18',
  name: '治癒の印',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_ally', effect: 'heal', value: 3,
      description: '味方1体HP3回復' },
    { trigger: 'on_use', target: 'target_ally', effect: 'buff_atk', value: 1,
      description: 'ATK+1' },
  ],
};


/** コスト1。全敵の向きをランダムに変更。Check崩しの前準備に */
const item20: ItemCard = {
  id: 'item_20',
  name: '混乱ガス',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_enemy', effect: 'rotate', value: 1,
      description: '敵1体の向きを90°回転' },
  ],
};

// ========================================
// A-11: 追加カード
// ========================================

/** 先制+L字攻撃。正面と左の2マスの敵全員に同時攻撃する */
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
};

/** 召喚時に手札を最大2枚捨て、捨てた枚数だけ敵1体にダメージ。手札を火力に変換する */
const aggro12: CharacterCard = {
  id: 'aggro_12',
  name: '爆裂のノヴァ',
  type: 'character',
  faction: 'aggro',
  element: 'nicht',
  schoolClass: 'combat',
  hp: 4,
  atk: 3,
  manaCost: 3,
  activateCost: 3,
  attackRange: 'magic',
  attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'damage', value: 0, handCost: 2,
      description: '召喚時、手札を最大2枚捨て、捨てた枚数だけ敵1体にダメージ' },
  ],
};

/** 味方が攻撃されると反撃ダメージ。鉄壁の報復者 */
const tank11: CharacterCard = {
  id: 'tank_11',
  name: '報復のガレス',
  type: 'character',
  faction: 'tank',
  element: 'nicht',
  schoolClass: 'combat',
  hp: 4,
  atk: 3,
  manaCost: 4,
  activateCost: 3,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: ['protection', 'reflect'],
  effects: [
    { trigger: 'on_damaged', target: 'self', effect: 'buff_atk', value: 1,
      description: '被ダメ時、ATK+1' },
  ],
};

/** 召喚時に手札1枚捨ててマナ+1。タンク陣営のマナ加速役 */
const tank12: CharacterCard = {
  id: 'tank_12',
  name: '苔壁のモス',
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
    { trigger: 'on_summon', target: 'self', effect: 'gain_mana', value: 1, handCost: 1,
      description: '召喚時、手札を1枚捨ててマナ+1（手札がなければ不発）' },
  ],
};

/** 召喚時、敵1体を1ターン封印。HP4の硬い妨害置物 */
const control11: CharacterCard = {
  id: 'control_11',
  name: '時縛のクロノ',
  type: 'character',
  faction: 'control',
  element: 'nicht',
  schoolClass: 'intel',
  hp: 4, atk: 2, manaCost: 4, activateCost: 3,
  attackRange: 'magic', attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'seal', value: 1,
      description: '召喚時、敵1体を1ターン封印する' },
  ],
};

/** 攻撃で属性汚染。フィールドを書き換える嫌がらせ */
const control12: CharacterCard = {
  id: 'control_12',
  name: '侵蝕のロア',
  type: 'character',
  faction: 'control',
  element: 'nicht',
  schoolClass: 'intel',
  hp: 2,
  atk: 2,
  manaCost: 2,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_attack', target: 'target_cell', effect: 'element_corrupt', value: 0,
      description: '攻撃時、攻撃した敵がいるマスの属性と、盤面上の虚(nicht)マスの属性を入れ替える' },
  ],
};

/** 攻撃時、隣接味方2体以上なら味方1体に【貫通】を与える */
const synergy11: CharacterCard = {
  id: 'synergy_11',
  name: '連陣のレン',
  type: 'character',
  faction: 'synergy',
  element: 'licht',
  schoolClass: 'strategy',
  hp: 3, atk: 2, manaCost: 2, activateCost: 1,
  attackRange: 'front1', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_attack', target: 'target_ally', effect: 'grant_piercing', value: 1,
      condition: { type: 'ally_count_gte', value: 2 },
      description: '攻撃時、隣接味方2体以上なら味方1体に【貫通】を与える' },
  ],
};

/** 撃破された時、隣接味方全員に【防護】を与え、1ドロー */
const synergy12: CharacterCard = {
  id: 'synergy_12',
  name: '遺志のユズリハ',
  type: 'character',
  faction: 'synergy',
  element: 'nicht',
  schoolClass: 'strategy',
  hp: 2, atk: 2, manaCost: 2, activateCost: 2,
  attackRange: 'magic', attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_destroyed', target: 'target_ally', effect: 'grant_protection', value: 1,
      description: '撃破された時、隣接味方1体に【防護】を与える' },
  ],
};

/** 死角ATK+2。撃破時に向き変更可能。暗殺者の連続キル */
const snipe11: CharacterCard = {
  id: 'snipe_11',
  name: '暗撃のシャドウ',
  type: 'character',
  faction: 'snipe',
  element: 'nicht',
  schoolClass: 'combat',
  hp: 2, atk: 2, manaCost: 2, activateCost: 1,
  attackRange: 'front1', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 2,
      condition: { type: 'blind_spot' },
      description: '死角から攻撃時、ATK+2' },
  ],
};

/** 敵3体以上で【貫通】を得る中盤の安定砲台 */
const snipe12: CharacterCard = {
  id: 'snipe_12',
  name: '徹弾のブレイズ',
  type: 'character',
  faction: 'snipe',
  element: 'licht',
  schoolClass: '射撃',
  hp: 4, atk: 3, manaCost: 4, activateCost: 2,
  attackRange: 'front1', attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_attack', target: 'self', effect: 'grant_piercing', value: 1,
      condition: { type: 'enemy_count_gte', value: 3 },
      description: '敵が3体以上いるなら【貫通】を得る' },
  ],
};

/** 召喚時に敵2体の位置を入れ替え。陣形破壊の専門家 */
const trick11: CharacterCard = {
  id: 'trick_11',
  name: '策謀のルシア',
  type: 'character',
  faction: 'trick',
  element: 'licht',
  schoolClass: 'strategy',
  hp: 2,
  atk: 2,
  manaCost: 2,
  activateCost: 1,
  attackRange: 'magic',
  attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'swap_enemies', value: 0,
      description: '召喚時、敵2体の位置を入替' },
  ],
};

/** 攻撃時HP交換。弱ったら交換で延命 */
const trick12: CharacterCard = {
  id: 'trick_12',
  name: '反転のジェミニ',
  type: 'character',
  faction: 'trick',
  element: 'nicht',
  schoolClass: 'intel',
  hp: 2,
  atk: 2,
  manaCost: 2,
  activateCost: 1,
  attackRange: 'magic',
  attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_attack', target: 'target_enemy', effect: 'hp_swap', value: 0,
      condition: { type: 'hp_pct_lte', value: 50 },
      description: '自HP50%以下の時、攻撃前に対象とHP交換してから攻撃する' },
  ],
};

// ========================================
// 追加アイテム (item21-24)
// ========================================

/** 味方のATKと敵のATKを入替。弱い味方と強い敵で使えば逆転 */
const item21: ItemCard = {
  id: 'item_21',
  name: '反転の鏡',
  type: 'item',
  manaCost: 2,
  effects: [
    { trigger: 'on_use', target: 'target_enemy', effect: 'copy_atk', value: 0,
      description: '使用時: 味方1体と敵1体のATKを交換' },
  ],
};

/** 味方1体の行動済み状態を解除。追撃のチャンス */
const item22: ItemCard = {
  id: 'item_22',
  name: '加速装置',
  type: 'item',
  manaCost: 2,
  effects: [
    { trigger: 'on_use', target: 'target_ally', effect: 'buff_atk', value: 1,
      description: '使用時: 味方1体のATK+1、再行動可能に' },
  ],
};

/** 敵全体に属性不一致ペナルティを強制 */
const item23: ItemCard = {
  id: 'item_23',
  name: '属性爆弾',
  type: 'item',
  manaCost: 2,
  effects: [
    { trigger: 'on_use', target: 'target_enemy', effect: 'element_corrupt', value: 0,
      description: '使用時: 敵全員のマスとnichtマスの属性を入替' },
  ],
};

/** 味方1体にHP2回復+不動を付与 */
const item24: ItemCard = {
  id: 'item_24',
  name: '結界石',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_ally', effect: 'heal', value: 2,
      description: '使用時: 味方1体にHP2回復' },
  ],
};

/** コスト1。手札を2枚捨てて3枚ドロー。手札の質を入れ替える。on_discardと好相性 */
const item25: ItemCard = {
  id: 'item_25',
  name: '手札交換',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'self', effect: 'discard_draw', value: 2, handCost: 2,
      description: '使用時: 手札を2枚捨てて3枚ドロー' },
  ],
};

/** コスト0。手札を1枚捨てて味方1体を再行動可能にする。手札コストで追撃 */
const item26: ItemCard = {
  id: 'item_26',
  name: '奮起の号令',
  type: 'item',
  manaCost: 0,
  effects: [
    { trigger: 'on_use', target: 'target_ally', effect: 'buff_atk', value: 0, handCost: 1,
      description: '使用時: 手札を1枚捨てて味方1体を再行動可能にする' },
  ],
};

/** コスト0。手札を2枚捨ててマナ+3。手札をマナに高効率変換 */
const item27: ItemCard = {
  id: 'item_27',
  name: 'マナ錬成',
  type: 'item',
  manaCost: 0,
  effects: [
    { trigger: 'on_use', target: 'self', effect: 'gain_mana', value: 3, handCost: 2,
      description: '使用時: 手札を2枚捨ててマナ+3' },
  ],
};

/** コスト1。マナ+2＋1ドロー。テンポを維持しつつ加速 */
const item28: ItemCard = {
  id: 'item_28',
  name: 'マナ増幅器',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'self', effect: 'gain_mana', value: 2,
      description: '使用時: マナ+2' },
    { trigger: 'on_use', target: 'self', effect: 'draw', value: 1,
      description: '1ドロー' },
  ],
};

/** コスト0。即座にマナ+2、ただし次ターンのマナ増加-1。テンポ重視の前借り */
const item29: ItemCard = {
  id: 'item_29',
  name: '急速充填',
  type: 'item',
  manaCost: 0,
  effects: [
    { trigger: 'on_use', target: 'self', effect: 'gain_mana', value: 2,
      description: '使用時: マナ+2。次ターンのマナ増加-1' },
  ],
};

/** コスト0。次ターン開始時にマナ+2。今は何も起きないが将来に投資 */
const item30: ItemCard = {
  id: 'item_30',
  name: '魔力の種',
  type: 'item',
  manaCost: 0,
  effects: [
    { trigger: 'on_use', target: 'self', effect: 'gain_mana', value: 0,
      description: '使用時: 次ターン開始時にマナ+2' },
  ],
};

// ========================================
// 追加キャラ (13番台) — 新メカニクス
// ========================================

/** 召喚時マナ+1。1コストで出してマナを少し加速する。紙耐久の接続札 */
const synergy13: CharacterCard = {
  id: 'synergy_13',
  name: '魔泉のリリア',
  type: 'character',
  faction: 'synergy',
  element: 'licht',
  schoolClass: 'medic',
  hp: 1,
  atk: 1,
  manaCost: 1,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'self', effect: 'gain_mana', value: 1,
      description: '召喚時、マナ+1' },
  ],
};

/** 威圧オーラで周囲の敵の再行動コスト+1。CHECKを守る盤面制圧役 */
const control13: CharacterCard = {
  id: 'control_13',
  name: '威圧のオウガ',
  type: 'character',
  faction: 'control',
  element: 'faust',
  schoolClass: 'combat',
  hp: 4,
  atk: 2,
  manaCost: 3,
  activateCost: 2,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: ['pressure'],
  effects: [],
};

/** 召喚時に味方と位置入替。陣形再編の接続札 */
const trick13: CharacterCard = {
  id: 'trick_13',
  name: '瞬転のリップル',
  type: 'character',
  faction: 'trick',
  element: 'geist',
  schoolClass: 'strategy',
  hp: 2,
  atk: 2,
  manaCost: 1,
  activateCost: 1,
  attackRange: 'front1',
  attackType: 'physical',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_ally', effect: 'swap', value: 0,
      description: '召喚時、味方1体と位置入替' },
  ],
};

// ========================================
// 全カードリスト
// ========================================
export const ALL_CHARACTERS: CharacterCard[] = [
  aggro01, aggro02, aggro03, aggro04, aggro05,
  aggro06, aggro07, aggro08, aggro09, aggro10,
  aggro11, aggro12,
  tank01, tank02, tank03, tank04, tank05,
  tank06, tank07, tank08, tank09, tank10,
  tank11, tank12,
  control01, control02, control03, control04, control05,
  control06, control07, control08, control09, control10,
  control11, control12, // control13 は除外（データは残存）
  synergy01, synergy02, synergy03, synergy04, synergy05,
  synergy06, synergy07, synergy08, synergy09, synergy10,
  synergy11, synergy12, // synergy13 は除外（データは残存）
  snipe01, snipe02, snipe03, snipe04, snipe05,
  snipe06, snipe07, snipe08, snipe09, snipe10,
  snipe11, snipe12,
  trick01, trick02, trick03, trick04, trick05,
  trick06, trick07, trick08, trick09, trick10,
  trick11, trick13, // trick12 は除外（データは残存）
];


/** コスト2。属性一致で手札のキャラと場のキャラを入替える */
const item_element_swap: ItemCard = {
  id: 'item_element_swap',
  name: '属性召喚',
  type: 'item',
  manaCost: 2,
  freeAction: true, // 使用後もターン継続（召喚制限に影響しない）
  effects: [
    { trigger: 'on_use', target: 'target_ally', effect: 'swap', value: 0,
      description: '属性一致で手札のキャラと場のキャラを入替える' },
  ],
};

/** コスト2。敵C2以下のキャラを持ち主の手札に戻す */
const item_bounce_enemy: ItemCard = {
  id: 'item_bounce_enemy',
  name: '帰還の風',
  type: 'item',
  manaCost: 2,
  effects: [
    { trigger: 'on_use', target: 'target_enemy', effect: 'move', value: 0,
      description: '敵C2以下のキャラを持ち主の手札に戻す' },
  ],
};

/** コスト1。味方1体を手札に戻す（再召喚でon_summon再発動） */
const item_self_bounce: ItemCard = {
  id: 'item_self_bounce',
  name: '再起の印',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_ally', effect: 'move', value: 0,
      description: '味方1体を手札に戻す（再召喚で効果再発動）' },
  ],
};

/** コスト1。味方1体を再行動可能にする */
const item_reactivate: ItemCard = {
  id: 'item_reactivate',
  name: '次元歪曲',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_ally', effect: 'reduce_activate_cost', value: 99,
      description: '味方1体を再行動可能にする' },
  ],
};

/** コスト1。任意のマスの属性を好きな属性に変更 */
const item_element_write: ItemCard = {
  id: 'item_element_write',
  name: '地脈書換',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_cell', effect: 'field_swap', value: 0,
      description: '任意のマスの属性を好きな属性に変更' },
  ],
};

/** コスト1。味方1体に【防護】を付与 */
const item_grant_protection: ItemCard = {
  id: 'item_grant_protection',
  name: '加護の紋章',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_ally', effect: 'grant_protection', value: 1,
      description: '味方1体に【防護】を付与' },
  ],
};

/** コスト1。味方1体に【貫通】を付与 */
const item_grant_piercing: ItemCard = {
  id: 'item_grant_piercing',
  name: '貫通の矢',
  type: 'item',
  manaCost: 1,
  effects: [
    { trigger: 'on_use', target: 'target_ally', effect: 'grant_piercing', value: 1,
      description: '味方1体に【貫通】を付与' },
  ],
};

export const ALL_ITEMS: ItemCard[] = [
  item01, item02, item03, item04, item05, item06,
  item07, item08, item09, item10, item11, item12,
  item13, item14, item15, item16, item17, item18,
  item20, item21, item22, item23, item24,
  item25, item26, item27, item28, item29, item30,
  item_element_swap, item_bounce_enemy, item_self_bounce,
  item_reactivate, item_element_write, item_grant_protection, item_grant_piercing,
];

// ========================================
// アイテムセット (4セット × 6枚)
// 共通: マナ結晶(マナ+2) + 緊急補給(2ドロー)
// ========================================

/** セットA: 機動型 — バウンス+再召喚でon_summon使い回し、再行動で追撃 */
export const ITEM_SET_A: ItemCard[] = [
  item02, // マナ結晶 (マナ+2)
  item01, // 緊急補給 (2ドロー)
  item04, // 強化弾 (ATK+2)
  item06, // 手榴弾 (2ダメージ)
  item20, // 混乱ガス (90°回転)
  item_element_swap, // 属性召喚 (属性一致交換)
];

/** セットB: 強化型 — マーカー+ATKバフ+回復で正面から殿り勝つ */
export const ITEM_SET_B: ItemCard[] = [
  item02, // マナ結晶 (マナ+2)
  item01, // 緊急補給 (2ドロー)
  item04, // 強化弾 (ATK+2)
  item_grant_protection, // 加護の紋章 (防護付与)
  item_grant_piercing, // 貫通の矢 (貫通付与)
  item05, // 弱体化ガス (ATK-2)
];

/** セットC: 妨害型 — バウンス+回転+向き固定で盤面を崩す */
export const ITEM_SET_C: ItemCard[] = [
  item02, // マナ結晶 (マナ+2)
  item01, // 緊急補給 (2ドロー)
  item_bounce_enemy, // 帰還の風 (敵C2以下バウンス)
  item14, // 拘束鏈 (回転+向き固定)
  item06, // 手榴弾 (2ダメージ)
  item_reactivate, // 次元歪曲 (再行動)
];

/** セットD: リソース型 — ドロー×3枚体制+属性交換でリソース差で圧殺 */
export const ITEM_SET_D: ItemCard[] = [
  item02, // マナ結晶 (マナ+2)
  item01, // 緊急補給 (2ドロー)
  item05, // 弱体化ガス (ATK-2)
  item_element_swap, // 属性召喚 (属性一致交換)
  item_self_bounce, // 再起の印 (味方→手札)
  item03, // 応急キット (HP3回復)
];

export const ITEM_SETS = {
  A: ITEM_SET_A,
  B: ITEM_SET_B,
  C: ITEM_SET_C,
  D: ITEM_SET_D,
} as const;

export const ALL_CARDS: Card[] = [...ALL_CHARACTERS, ...ALL_ITEMS];

/** ID検索 */
export function getCardById(id: string): Card | undefined {
  return ALL_CARDS.find(c => c.id === id);
}
