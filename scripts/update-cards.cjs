const fs = require('fs');
let c = fs.readFileSync('src/data/cards.ts', 'utf-8');

function replaceCard(content, varName, newBlock) {
  const marker = 'const ' + varName + ':';
  const start = content.indexOf(marker);
  if (start === -1) { console.log('NOT FOUND: ' + varName); return content; }
  let commentStart = content.lastIndexOf('/**', start);
  const prevNewline = content.lastIndexOf('\n', commentStart - 1);
  commentStart = prevNewline + 1;
  let endIdx = content.indexOf('};', start);
  endIdx = content.indexOf('\n', endIdx) + 1;
  return content.substring(0, commentStart) + newBlock + '\n' + content.substring(endIdx);
}

// ===== SYNERGY 01-10 =====

c = replaceCard(c, 'synergy01', `/** 召喚時、隣接味方1体に【防護】を与える。最軽量の接続札 */
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
    { trigger: 'on_summon', target: 'target_ally', effect: 'grant_protection', value: 1,
      description: '召喚時、隣接味方1体に【防護】を与える（味方なしなら自分）' },
  ],
};`);

c = replaceCard(c, 'synergy02', `/** 召喚時、隣接味方1体に【先制】を与える。先制マーカーの起点 */
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
};`);

c = replaceCard(c, 'synergy03', `/** 召喚時、味方2体以上なら隣接味方全員に【回避】。条件付き多体付与 */
const synergy03: CharacterCard = {
  id: 'synergy_03',
  name: '絆のツムギ',
  type: 'character',
  faction: 'synergy',
  element: 'geist',
  schoolClass: 'medic',
  hp: 3, atk: 2, manaCost: 2, activateCost: 2,
  attackRange: 'magic', attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'adjacent_allies', effect: 'grant_dodge', value: 1,
      condition: { type: 'ally_count_gte', value: 2 },
      description: '召喚時、味方2体以上なら隣接味方全員に【回避】を与える' },
  ],
};`);

c = replaceCard(c, 'synergy04', `/** 召喚時、自分に【貫通】。隣接味方がいればその味方1体にも【貫通】 */
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
    { trigger: 'on_summon', target: 'self', effect: 'grant_piercing', value: 1,
      description: '召喚時、自分に【貫通】を得る' },
    { trigger: 'on_summon', target: 'target_ally', effect: 'grant_piercing', value: 1,
      condition: { type: 'ally_count_gte', value: 1 },
      description: '隣接味方がいればその味方1体にも【貫通】を与える' },
  ],
};`);

c = replaceCard(c, 'synergy05', `/** 召喚時、味方1体を引き寄せ、その味方に【防護】を与える */
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
};`);

c = replaceCard(c, 'synergy06', `/** 撃破された時、隣接味方全員に【先制】を与える。犠牲の接続札 */
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
    { trigger: 'on_destroyed', target: 'adjacent_allies', effect: 'grant_quickness', value: 1,
      description: '撃破された時、隣接味方全員に【先制】を与える' },
  ],
};`);

c = replaceCard(c, 'synergy07', `/** 召喚時、隣接味方HP1回復。自属性マスなら隣接味方全員に【防護】 */
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
};`);

c = replaceCard(c, 'synergy08', `/** 味方のマーカー総数2個以上なら自分に【貫通】【先制】を得る変換札 */
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
};`);

c = replaceCard(c, 'synergy09', `/** 被ダメージ時、隣接味方1体に【回避】を与える（1Tに1回） */
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
    { trigger: 'on_damaged', target: 'target_ally', effect: 'grant_dodge', value: 1,
      description: '被ダメージ時、隣接味方1体に【回避】を与える（1Tに1回）' },
  ],
};`);

c = replaceCard(c, 'synergy10', `/** 【盟約の収穫】味方のマーカーを消費→反撃不可+ATK+回転。シナジーの顔 */
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
      description: '召喚時、味方のマーカーを任意数消費。1個以上:反撃不可、2個以上:ATK+2、3個以上:対象を90°回転、4個以上:さらにATK+2' },
  ],
};`);

// ===== SYNERGY 11-13 (in later section) =====

c = replaceCard(c, 'synergy11', `/** 攻撃時、隣接味方2体以上なら味方1体に【貫通】を与える */
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
};`);

c = replaceCard(c, 'synergy12', `/** 撃破された時、隣接味方全員に【防護】を与え、1ドロー */
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
    { trigger: 'on_destroyed', target: 'adjacent_allies', effect: 'grant_protection', value: 1,
      description: '撃破された時、隣接味方全員に【防護】を与える' },
    { trigger: 'on_destroyed', target: 'self', effect: 'draw', value: 1,
      description: '撃破された時、1枚ドロー' },
  ],
};`);

// synergy13 (リリア) - no change needed, just keep as is

// ===== SNIPE 01-12 =====

c = replaceCard(c, 'snipe01', `/** HP1の脆い狙撃手。死角から攻撃時ATK+1 */
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
};`);

c = replaceCard(c, 'snipe02', `/** 召喚時、敵1体を90°回転させる。死角を作る条件づくり役 */
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
};`);

c = replaceCard(c, 'snipe03', `/** 射程2。死角から攻撃時に【貫通】を得る。ATK-1デバフ付き */
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
};`);

c = replaceCard(c, 'snipe04', `/** 魔法全域。自属性マスにいるなら【貫通】を得る */
const snipe04: CharacterCard = {
  id: 'snipe_04',
  name: '念穿のヴァルト',
  type: 'character',
  faction: 'snipe',
  element: 'geist',
  schoolClass: 'intel',
  hp: 4, atk: 3, manaCost: 3, activateCost: 2,
  attackRange: 'magic', attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_attack', target: 'self', effect: 'grant_piercing', value: 1,
      condition: { type: 'same_element_cell' },
      description: '自属性マスにいるなら【貫通】を得る' },
  ],
};`);

c = replaceCard(c, 'snipe05', `/** 射程2。HP2以下の敵に【貫通】。撃破でドロー。止め専門 */
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
};`);

c = replaceCard(c, 'snipe06', `/** HP1の紙。死角から攻撃時ATK+2で化ける */
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
    { trigger: 'on_attack', target: 'self', effect: 'buff_atk', value: 2,
      condition: { type: 'blind_spot' },
      description: '死角から攻撃時、ATK+2' },
  ],
};`);

c = replaceCard(c, 'snipe07', `/** 攻撃時、対象マスと虚マスの属性を入替。自属性マスならマナ+1 */
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
};`);

c = replaceCard(c, 'snipe08', `/** 撃破された時、味方1体に【貫通】を与え、1ドロー */
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
};`);

c = replaceCard(c, 'snipe09', `/** 【隠密】全方向ブラインドの狙撃エース。死角ATK+2、自属性マスで貫通 */
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
};`);

c = replaceCard(c, 'snipe10', `/** 魔法で異なる敵2体を攻撃。自属性+四隅でATK+1。面制圧型エース */
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
      description: '自属性マスかつ四隅にいるならATK+1' },
  ],
};`);

// snipe11 (シャドウ) - add kill direction change
c = replaceCard(c, 'snipe11', `/** 死角ATK+2。撃破時に向き変更可能。暗殺者の連続キル */
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
};`);

// snipe12 (ブレイズ) - remove piercing+summon damage, add conditional piercing, C4
c = replaceCard(c, 'snipe12', `/** 敵3体以上で【貫通】を得る中盤の安定砲台 */
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
};`);

// ===== CONTROL: ヤミカ + クロノ =====

c = replaceCard(c, 'control05', `/** 召喚時、敵1体を1ターン封印する。軽い妨害の時間稼ぎ */
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
};`);

c = replaceCard(c, 'control11', `/** 召喚時、敵1体を1ターン封印。HP4の硬い妨害置物 */
const control11: CharacterCard = {
  id: 'control_11',
  name: '時縛のクロノ',
  type: 'character',
  faction: 'control',
  element: 'nicht',
  schoolClass: 'intel',
  hp: 4, atk: 2, manaCost: 4, activateCost: 2,
  attackRange: 'magic', attackType: 'magic',
  keywords: [],
  effects: [
    { trigger: 'on_summon', target: 'target_enemy', effect: 'seal', value: 1,
      description: '召喚時、敵1体を1ターン封印する' },
  ],
};`);

// ===== TANK: ガルド C3→C4 =====
c = replaceCard(c, 'tank01', `/** 防護+貫通+不動。鉄壁の中盤の柱 */
const tank01: CharacterCard = {
  id: 'tank_01',
  name: '鉄壁のガルド',
  type: 'character',
  faction: 'tank',
  element: 'faust',
  schoolClass: 'combat',
  hp: 4, atk: 3, manaCost: 4,
  attackRange: 'front2_line', attackType: 'physical',
  keywords: ['protection', 'piercing', 'anchor'],
  effects: [],
};`);

// ===== TRICK: カゲロウ C3→C4 =====
c = replaceCard(c, 'trick03', `/** 位置入替+180°回転で死角を作る。C4の中継ぎトリッカー */
const trick03: CharacterCard = {
  id: 'trick_03',
  name: '転位のカゲロウ',
  type: 'character',
  faction: 'trick',
  element: 'geist',
  schoolClass: 'intel',
  hp: 2, atk: 2, manaCost: 4,
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
};`);

// Verify all changes
const checks = [
  '守紋のシルト', '疾風のヴィント', '絆のツムギ', '念波のコダマ', '共鳴のハルカ',
  '蝕連のシュウ', '護陣のミナト', '光絆のアカリ', '幻霧のネーベル', '盟約のアルス',
  '連陣のレン', '遺志のユズリハ',
  '鋭眼のマルコ', '旋弾のガウス', '念弾のリーゼ', '念穿のヴァルト', '穿孔のアッシュ',
  '蝕弾のニドル', '地脈のエリス', '継弾のフィーネ', '終焉のイグニス', '虚眼のゼクス',
  '暗撃のシャドウ', '徹弾のブレイズ',
  '蝕縛のヤミカ', '時縛のクロノ', '鉄壁のガルド', '転位のカゲロウ',
];
let ok = 0, fail = 0;
checks.forEach(n => { if (c.includes(n)) { ok++; } else { console.log('FAIL: ' + n); fail++; } });
console.log(`\n${ok}/${checks.length} cards verified OK` + (fail > 0 ? `, ${fail} FAILED` : ''));

fs.writeFileSync('src/data/cards.ts', c, 'utf-8');
console.log('File written successfully.');
