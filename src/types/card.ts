// ========================================
// 属性 (Element)
// ========================================
export type Element = 'faust' | 'geist' | 'licht' | 'nacht' | 'nicht';

export const ELEMENT_LABELS: Record<Element, { kanji: string; ruby: string }> = {
  faust: { kanji: '拳', ruby: 'ファウスト' },
  geist: { kanji: '念', ruby: 'ガイスト' },
  licht: { kanji: '光', ruby: 'リヒト' },
  nacht: { kanji: '闇', ruby: 'ナハト' },
  nicht: { kanji: '虚', ruby: 'ニヒト' },
};

/** 対立ペア。虚(nicht)は中立なのでペアなし */
export const ELEMENT_OPPOSITIONS: [Element, Element][] = [
  ['faust', 'geist'],
  ['licht', 'nacht'],
];

// ========================================
// 学科 (Class)
// ========================================
export type SchoolClass = 'combat' | '射撃' | 'intel' | 'medic' | 'strategy';

export const CLASS_LABELS: Record<SchoolClass, string> = {
  combat:   '戦闘科',
  '射撃':   '射撃科',
  intel:    '情報科',
  medic:    '医療科',
  strategy: '戦略科',
};

// ========================================
// 陣営 (Faction)
// ========================================
export type Faction = 'aggro' | 'tank' | 'control' | 'synergy' | 'snipe' | 'trick';

export const FACTION_LABELS: Record<Faction, string> = {
  aggro:   'A: アグロ',
  tank:    'B: タンク',
  control: 'C: コントロール',
  synergy: 'D: シナジー',
  snipe:   'E: スナイプ',
  trick:   'F: トリック',
};

// ========================================
// 向き (Direction)
// ========================================
export type Direction = 'up' | 'right' | 'down' | 'left';

export const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left'];

// ========================================
// 攻撃範囲 (Attack Range)
// ========================================
/**
 * 攻撃範囲タイプ。範囲内から1体を選択して攻撃する。
 * - front1: 正面1マス（基本/多数派）
 * - front_back: 前後1マス（背後の味方にもあたる）
 * - front2_line: 前方直線2マス（槍系）
 * - front_row: 正面行3マスから1体選択
 * - magic: 全域から1体選択（魔法専用）
 * - front_left: 正面+左の2マスの敵全員に同時攻撃
 * - front_right: 正面+右の2マスの敵全員に同時攻撃
 */
export type AttackRange = 'front1' | 'front_back' | 'front2_line' | 'front_row' | 'magic' | 'snipe' | 'cross' | 'front_left' | 'front_right';

/**
 * ブラインドスポットパターン。
 * ブラインド = 反撃不可 + ダメージ+1 のアングル。
 * - none: ブラインドなし
 * - back: 背中のみ
 * - sides: 左右のみ
 * - back_sides: 背中＋左右
 * - all: 隣接全方向（正面含む）
 */
export type BlindPattern = 'none' | 'back' | 'sides' | 'back_sides' | 'all';

/** @deprecated 旧パターン型。attackRange に移行済み */
export type AttackPattern = [
  [boolean, boolean, boolean],
  [boolean, boolean, boolean],
  [boolean, boolean, boolean],
];

// ========================================
// 攻撃タイプ
// ========================================
export type AttackType = 'physical' | 'magic';

// ========================================
// キーワード能力
// ========================================
export type Keyword =
  | 'protection'      // 物理ダメージ軽減
  | 'dodge'           // 物理攻撃を受けない（魔法・貫通は通る）
  | 'quickness'       // 先制反撃
  | 'fortress'        // 自ら攻撃不可、反撃のみ
  | 'piercing'        // 貫通（protection無視）
  | 'summoning_lock'  // 盤面4体以上で召喚可能
  | 'reflect'         // 魔法攻撃を反射する（魔法ダメージを攻撃者に返す）
  | 'anchor'          // push/pull/moveで動かせない
  | 'damage_link'     // 受けたダメージの半分を隣接味方に分散
  | 'cover'           // 隣接味方への攻撃を代わりに受ける
  | 'stealth'         // 攻撃が常にブラインド扱い（反撃不可+ダメージ+1）
  | 'pressure'        // 周囲の敵の再行動コスト+1
  ;

// ========================================
// カード効果 (トリガー/ターゲット/エフェクト/値)
// ========================================
export type EffectTrigger =
  | 'on_summon'       // 召喚時
  | 'on_attack'       // 攻撃時
  | 'on_damaged'      // ダメージを受けた時
  | 'on_destroyed'    // 撃破時
  | 'on_kill'         // 敵撃破時（このキャラが敵を倒した時）
  | 'on_ally_destroyed' // 味方破壊時（味方が倒された時）
  | 'on_turn_start'   // ターン開始時
  | 'on_turn_end'     // ターン終了時
  | 'on_use'          // アイテム使用時
  | 'on_discard'      // 手札を捨てた時
  ;

export type EffectTarget =
  | 'self'
  | 'target_enemy'
  | 'adjacent_enemy'
  | 'target_ally'
  | 'all_enemies'
  | 'all_allies'
  | 'adjacent_allies'
  | 'adjacent_enemies'
  | 'any_cell'
  | 'target_cell'
  ;

export type EffectType =
  | 'damage'
  | 'heal'
  | 'buff_atk'
  | 'debuff_atk'
  | 'field_quake'       // 属性反転
  | 'field_swap'        // 2つのマスの属性を入れ替え
  | 'rotate'            // 向き回転
  | 'move'              // 位置移動（ランダム空きマスへ）
  | 'swap'              // 位置入替（自分と対象を入れ替え）
  | 'push'              // 押し出し（ソースから離れる方向に1マス、端なら2ダメージ）
  | 'pull'              // 引き寄せ（ソースに向かって1マス移動）
  | 'draw'              // ドロー
  | 'gain_mana'         // マナ獲得
  | 'seal'              // 封印（能力無効化）
  | 'destroy_self'      // 自壊
  | 'discard_random'    // 相手の手札をランダムに捨てさせる
  | 'copy_atk'          // 対象のATKを自分にコピー
  | 'hp_swap'           // HP交換（自分と対象の現在HPを入替え）
  | 'brainwash'         // 洗脳（対象を行動済みにする）
  | 'freeze'            // 凍結（対象を次ターン行動不能に）
  | 'direction_lock'    // 向き固定（対象を回転不可に）
  | 'element_corrupt'   // 属性汚染（対象マスとnichtマスの属性を入替）
  | 'piercing_damage'   // 貫通ダメージ（protection無視）
  | 'swap_enemies'      // 敵同士の位置を入替え
  | 'grant_dodge'       // 【回避】付与（物理攻撃を受けない。魔法・貫通は通る）
  | 'grant_protection'  // 【防護】付与（物理ダメージ-1、1回消費）
  | 'grant_piercing'    // 【貫通】付与（次の攻撃で防護無視、1回消費）
  | 'grant_quickness'   // 【先制】付与（反撃時に先に殴れる、1回消費）
  | 'consume_markers'   // マーカー消費（味方のキーワードマーカーを任意数取り除き効果発動）
  | 'discard_draw'      // 手札をvalue枚捨てて(value+1)枚ドロー
  | 'skip_draw'         // ドロースキップ（このキャラがいる間、ターン開始時のドローをスキップ）
  | 'reduce_activate_cost' // 攻撃コスト減少（そのターンのみ、value分だけ減少、最低0。回転は対象外）
  | 'range_expand'      // 攻撃範囲拡張（条件付きで攻撃範囲を変更）
  | 'action_tax'        // v2: action_tax付与（再行動コスト+value）
    | 'mark'              // v2: マーク付与（スナイプ用）
    | 'steal_mana'        // v2: 相手マナ-value、自分マナ+value
    | 'exhaust_attack'    // このターン攻撃できない（攻撃済みにする）
    // NOTE: 'regenerate' は廃止。毎ターン回復は原則禁止
    ;

// ========================================
// 条件 (Condition) — 効果の発動条件
// ========================================
export type EffectCondition =
  | { type: 'always' }
  | { type: 'ally_count_gte'; value: number }      // 味方がN体以上
  | { type: 'ally_count_lte'; value: number }      // 味方がN体以下
  | { type: 'hp_pct_lte'; value: number }           // 自分HPがN%以下
  | { type: 'hp_pct_gte'; value: number }           // 自分HPがN%以上
  | { type: 'enemy_count_gte'; value: number }      // 敵がN体以上
  | { type: 'blind_spot' }                          // 死角から攻撃時
  | { type: 'attacked_from_front' }                 // 正面から攻撃された時
  | { type: 'attacked_from_non_blind' }             // 死角以外から攻撃された時
  | { type: 'same_element_cell' }                   // 自属性マスにいる時
  | { type: 'on_element'; value: string }            // 指定属性マスにいる時
  | { type: 'target_element'; value: string }        // 対象が指定属性の時
  | { type: 'target_hp_lte'; value: number }        // 対象HPがN以下
  | { type: 'hand_count_lte'; value: number }       // 手札がN枚以下
  | { type: 'hp_lte'; value: number }               // 自分HPがN以下
  | { type: 'mana_gte'; value: number }             // マナがN以上
  | { type: 'ace_condition_gte'; value: number }    // エース回収条件がN以上（派閥自動判定）
  | { type: 'target_has_debuff' }                   // 対象がデバフ状態の時
  | { type: 'in_corner' }                           // 四隅にいる時
  | { type: 'empty_cells_gte'; value: number }      // 空きマスがN個以上
  | { type: 'ally_markers_gte'; value: number }     // マーカー持ち味方がN体以上
  | { type: 'has_acted_this_turn' }                 // このキャラが既にこのターン攻撃済み
  | { type: 'has_swapped_this_turn' }               // このキャラがこのターン位置入替済み
  ;

export interface CardEffect {
  trigger: EffectTrigger;
  target: EffectTarget;
  effect: EffectType;
  value: number;
  condition?: EffectCondition;  // 省略時は always
  handCost?: number;  // 手札コスト（効果発動前に手札をN枚捨てる。手札不足なら不発）
  /** 日本語テキスト。UIに直接表示する（パーサーの代わり） */
  description?: string;
}

// ========================================
// キャラクターカード
// ========================================
export interface CharacterCard {
  id: string;
  name: string;
  type: 'character';
  faction: Faction;
  element: Element;
  schoolClass: SchoolClass;
  hp: number;            // 基本HP (3〜9)
  atk: number;           // 攻撃力
  manaCost: number;      // 召喚コスト
  activateCost?: number; // 再行動コスト (省略時=3)
  attackRange: AttackRange;
  attackType: AttackType;
  blindPattern?: BlindPattern; // 省略時: 物理='back', 魔法='all'
  keywords: Keyword[];
  effects: CardEffect[];
  flavorText?: string;
}

// ========================================
// アイテムカード
// ========================================
export interface ItemCard {
  id: string;
  name: string;
  type: 'item';
  manaCost: number;
  effects: CardEffect[];
  flavorText?: string;
  freeAction?: boolean; // trueなら使用後もターン継続（召喚制限に影響しない）
}

// ========================================
// ユニオン型
// ========================================
export type Card = CharacterCard | ItemCard;

export function isCharacter(card: Card): card is CharacterCard {
  return card.type === 'character';
}

export function isItem(card: Card): card is ItemCard {
  return card.type === 'item';
}
