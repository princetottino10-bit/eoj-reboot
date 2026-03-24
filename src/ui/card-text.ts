import type { CardEffect, EffectCondition, Keyword, CharacterCard, ItemCard, Card } from '../types/card';
import { isCharacter } from '../types/card';

const TRIGGER_LABELS: Record<string, string> = {
  on_summon:    '召喚時',
  on_attack:    '攻撃時',
  on_damaged:   '被ダメ時',
  on_destroyed: '撃破時',
  on_turn_start:'ターン開始時',
  on_turn_end:  'ターン終了時',
  on_use:       '使用時',
  on_discard:   '手札破棄時',
};

const TARGET_LABELS: Record<string, string> = {
  self:             '自身',
  target_enemy:     '敵1体',
  target_ally:      '味方1体',
  all_enemies:      '敵全体',
  all_allies:       '味方全体',
  adjacent_allies:  '隣接味方',
  adjacent_enemies: '隣接敵',
  any_cell:         '任意マス',
  target_cell:      '対象マス',
};

const EFFECT_LABELS: Record<string, string> = {
  damage:      'ダメージ',
  heal:        'HP回復',
  buff_atk:    'ATK+',
  debuff_atk:  'ATK-',
  field_quake: '属性反転',
  field_swap:  '属性入替',
  rotate:      '回転',
  move:        '移動',
  swap:        '位置入替',
  push:        '押し出し',
  pull:        '引き寄せ',
  draw:        'ドロー',
  gain_mana:   'マナ',
  seal:        '封印',
  destroy_self:'破壊',
  discard_random:'手札破棄',
  copy_atk:    'ATKコピー',
  hp_swap:     'HP交換',
  brainwash:   '洗脳',
  freeze:      '凍結',
  direction_lock:'向き固定',
  element_corrupt:'属性汚染',
  piercing_damage:'貫通ダメージ',
  swap_enemies:'敵位置入替',
  grant_dodge: '回避付与',
  discard_draw:'手札交換',
  skip_draw:'ドロースキップ',
  reduce_activate_cost:'再行動コスト減',
  range_expand:'範囲拡張',
};

const KEYWORD_LABELS: Record<Keyword, string> = {
  protection:     '防護(物理ダメージ-1)',
  dodge:          '回避(物理攻撃を受けない。魔法・貫通は通る)',
  quickness:      '先制(先に攻撃)',
  fortress:       '要塞(反撃のみ可)',
  piercing:       '貫通(防護を無視)',
  summoning_lock: '召喚制限',
  reflect:        '反射(受ダメを返す)',
  anchor:         '不動(移動不可)',
  damage_link:    '分散(隣接味方と分割)',
  cover:          'カバー(隣接味方への攻撃を代わりに受ける)',
  stealth:        '隠密(常にブラインド攻撃)',
  pressure:       '威圧(周囲敵の再行動+1)',
};

/**
 * 条件を人間が読めるテキストに変換する（フォールバック用）。
 */
export function describeCondition(condition: EffectCondition): string {
  switch (condition.type) {
    case 'always':
      return '';
    case 'ally_count_gte':
      return `味方${condition.value}体以上の時`;
    case 'ally_count_lte':
      return `味方${condition.value}体以下の時`;
    case 'hp_pct_lte':
      return `自分HP${condition.value}%以下の時`;
    case 'hp_pct_gte':
      return `自分HP${condition.value}%以上の時`;
    case 'enemy_count_gte':
      return `敵${condition.value}体以上の時`;
    case 'blind_spot':
      return '死角から攻撃時';
    case 'same_element_cell':
      return '自属性マスにいる時';
    case 'target_hp_lte':
      return `対象HP${condition.value}以下の時`;
    case 'hand_count_lte':
      return `手札${condition.value}枚以下の時`;
    case 'mana_gte':
      return `マナ${condition.value}以上の時`;
    default:
      return '';
  }
}

function describeEffect(e: CardEffect): string {
  // description フィールドがあればそのまま使う
  if (e.description) {
    return e.description;
  }

  // フォールバック: trigger/target/effect/value から生成
  const trigger = TRIGGER_LABELS[e.trigger] || e.trigger;
  const target = TARGET_LABELS[e.target] || e.target;
  const effect = EFFECT_LABELS[e.effect] || e.effect;

  // 条件テキスト（あれば先頭に付与）
  const condText = e.condition ? describeCondition(e.condition) : '';
  const prefix = condText ? `[${condText}]` : '';

  let body: string;

  if (e.effect === 'field_quake' || e.effect === 'field_swap') {
    body = `${trigger}: ${target}${effect}`;
  } else if (e.effect === 'rotate') {
    const deg = e.value * 90;
    body = `${trigger}: ${target}を${deg}°${effect}`;
  } else if (e.effect === 'swap' || e.effect === 'move') {
    body = `${trigger}: ${target}と${effect}`;
  } else if (e.effect === 'seal') {
    body = `${trigger}: ${target}を${e.value}T${effect}`;
  } else if (e.effect === 'gain_mana') {
    if (e.value < 0) {
      body = `${trigger}: ${target}マナ${e.value}`;
    } else {
      body = `${trigger}: マナ+${e.value}`;
    }
  } else {
    const sign = (e.effect === 'debuff_atk') ? '' : '';
    body = `${trigger}: ${target}に${effect}${sign}${Math.abs(e.value)}`;
  }

  return prefix ? `${prefix}${body}` : body;
}

export function describeKeywords(keywords: Keyword[]): string {
  return keywords.map(k => KEYWORD_LABELS[k] || k).join(' / ');
}

export function describeEffects(effects: CardEffect[]): string {
  return effects.map(describeEffect).join('。');
}

export function getCardTooltip(card: Card): string {
  const lines: string[] = [];

  if (isCharacter(card)) {
    const c = card as CharacterCard;
    lines.push(`${c.name} [${c.manaCost}マナ]`);
    const rangeLabel: Record<string, string> = {
      front1: '正面1',
      front_back: '前後2',
      front2_line: '正面2直線',
      front_row: '正面行',
      magic: '魔法全域',
      snipe: '狙撃(前左右)',
      cross: '十字(前後左右)',
    };
    const reactCost = c.activateCost ?? 3;
    lines.push(`HP${c.hp} ATK${c.atk} ${c.attackType === 'magic' ? '魔法' : '物理'} [${rangeLabel[c.attackRange] ?? c.attackRange}]`);
    if (c.attackRange === 'front_back') {
      lines.push('⚠ このキャラの攻撃は味方にも当たる');
    }
    lines.push(`再行動: 💎${reactCost}`);
    if (c.keywords.length > 0) {
      lines.push(describeKeywords(c.keywords));
    }
    if (c.effects.length > 0) {
      const effectText = describeEffects(c.effects);
      lines.push(effectText);
    }
  } else {
    const i = card as ItemCard;
    lines.push(`${i.name} [${i.manaCost}マナ] ITEM`);
    if (i.effects.length > 0) {
      const effectText = describeEffects(i.effects);
      lines.push(effectText);
    }
  }

  return lines.join('\n');
}
