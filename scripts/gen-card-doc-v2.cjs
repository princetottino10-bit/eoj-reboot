const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType, PageBreak } = require('docx');

// ============================================================
// Keyword descriptions mapping
// ============================================================

const kwDescriptions = {
  '防護': '物理ダメージ-1',
  'カバー': '隣接味方への攻撃を代わりに受ける。守った味方にATK+1',
  '要塞': '自分から攻撃不可。反撃のみ',
  '分散': '受ダメを半分に。残りは隣接味方に分散',
  '反射': '被ダメ時、攻撃者に1ダメージ',
  '貫通': '防護を無視してダメージ',
  '先制': '攻撃された時、相手より先に反撃',
  '不動': 'push/pull/swapで移動不可',
  '完全回避': '物理攻撃無効。魔法・貫通は受ける',
  '吸収': '与ダメの半分回復',
  '回避': 'ブラインドの+1ダメージを無効化',
  '隠密': '攻撃が常にブラインド(反撃不可+ダメ+1)',
  '孤高': '隣接味方なしでATK+2',
  '威圧': '周囲敵の再行動コスト+1',
};

// ============================================================
// Card Data (updated v2)
// ============================================================

const factions = [
  {
    name: 'AGGRO（速攻）', color: 'E74C3C',
    cards: [
      { name: '迅刃のレイ', el: '拳', cost: 1, hp: 1, atk: 1, range: '正面1', type: '物', kw: '', effect: '召喚時:自傷2,ATK+3' },
      { name: '烈火のカグラ', el: '拳', cost: 2, hp: 2, atk: 2, range: '正面1', type: '物', kw: '', effect: '召喚時:ATK+1。手札2枚以下:さらにATK+2+1ドロー' },
      { name: '雷迅のジンガ', el: '念', cost: 2, hp: 2, atk: 2, range: '正面1', type: '物', kw: '先制', effect: '召喚時:敵を押し出す(壁なら2ダメ)' },
      { name: '雷鳴のライカ', el: '念', cost: 1, hp: 2, atk: 1, range: '正面1', type: '物', kw: '', effect: '召喚時:敵1体に2ダメ' },
      { name: '蝕牙のドク', el: '闇', cost: 2, hp: 2, atk: 2, range: '正面1', type: '物', kw: '', effect: '敵撃破時:その敵のATKを自分に加算。攻撃後ATK-1' },
      { name: '崩蝕のエンマ', el: '闇', cost: 1, hp: 2, atk: 1, range: '全域', type: '魔', kw: '吸収', effect: '召喚時:敵を押し出す(壁2ダメ)' },
      { name: '閃光のヒカリ', el: '光', cost: 3, hp: 4, atk: 3, range: '正面1', type: '物', kw: '', effect: '撃破時:隣接味方HP3回復+ATK+2' },
      { name: '光刃のセラ', el: '光', cost: 5, hp: 6, atk: 4, range: '横一列', type: '物', kw: '', effect: '攻撃時:向きを任意に変更。撃破時:追加で1体召喚可能(このターンのみ)' },
      { name: '虚影のゼロ', el: '虚', cost: 1, hp: 2, atk: 1, range: '正面1', type: '物', kw: '', effect: '召喚時:1ドロー。手札を捨てた場合:ATK+1' },
      { name: '覇王のカイザー', el: '虚', cost: 5, hp: 7, atk: 4, range: '前後', type: '物', kw: '', effect: '召喚時:味方1体を破壊しATK獲得。手札0枚時:攻撃後に隣接敵をpush。毎ターン自傷1' },
      { name: '連撃のハヤテ', el: '光', cost: 2, hp: 2, atk: 1, range: '正面1', type: '物', kw: '先制', effect: '攻撃するたびATK+1' },
      { name: '爆裂のノヴァ', el: '虚', cost: 3, hp: 4, atk: 3, range: '全域', type: '魔', kw: '', effect: '召喚時:手札を最大2枚捨て、枚数分ダメージ' },
    ]
  },
  {
    name: 'TANK（耐久）', color: '3498DB',
    cards: [
      { name: '鉄壁のガルド', el: '拳', cost: 3, hp: 4, atk: 3, range: '前方2', type: '物', kw: '防護,不動', effect: 'なし' },
      { name: '剛拳のイワオ', el: '拳', cost: 2, hp: 2, atk: 2, range: '正面1', type: '物', kw: '要塞', effect: '被ダメ時:受けた値と同じダメージを返す。HP50%以下:ATK+3' },
      { name: '念盾のアオイ', el: '念', cost: 2, hp: 2, atk: 2, range: '正面1', type: '物', kw: '反射', effect: '召喚時:隣接味方ATK+2' },
      { name: '念壁のシオン', el: '念', cost: 3, hp: 4, atk: 3, range: '全域', type: '魔', kw: '', effect: '攻撃時:敵ATK-1+自ATK+1+自HP2回復' },
      { name: '蝕耐のヴェノ', el: '闇', cost: 2, hp: 2, atk: 2, range: '正面1', type: '物', kw: '防護,分散', effect: '被ダメ時:攻撃元に2ダメ' },
      { name: '蝕霧のカスミ', el: '闇', cost: 3, hp: 4, atk: 3, range: '正面1', type: '物', kw: '', effect: '召喚時:敵封印2T+ATK-2' },
      { name: '癒しのミコト', el: '光', cost: 1, hp: 2, atk: 1, range: '全域', type: '魔', kw: '', effect: '毎ターン:隣接味方HP2回復' },
      { name: '聖盾のルミナ', el: '光', cost: 5, hp: 6, atk: 4, range: '正面1', type: '物', kw: '防護,カバー', effect: 'カバー時:守った味方のHP2回復。隣接味方3体以上:自分は撃破されない(HP1で耐える)' },
      { name: '虚壁のムゲン', el: '虚', cost: 1, hp: 2, atk: 1, range: '正面1', type: '物', kw: '回避', effect: '被ダメ時:攻撃元ATK-1+自ATK+1' },
      { name: '虚鎮のナギサ', el: '虚', cost: 5, hp: 6, atk: 4, range: '正面1', type: '物', kw: '要塞,カバー', effect: 'カバー時:攻撃者ATK-2。撃破時:味方全体HP+2,ATK+1。毎ターン自傷1' },
      { name: '報復のガレス', el: '虚', cost: 3, hp: 4, atk: 3, range: '正面1', type: '物', kw: '防護,反射', effect: '被ダメ時:ATK+1' },
      { name: '苔壁のモス', el: '光', cost: 2, hp: 2, atk: 1, range: '正面1', type: '物', kw: '不動', effect: '召喚時:再生(1)' },
    ]
  },
  {
    name: 'CONTROL（妨害）', color: '8E44AD',
    cards: [
      { name: '惑わしのシズク', el: '拳', cost: 2, hp: 2, atk: 2, range: '全域', type: '魔', kw: '', effect: '召喚時:隣接敵を洗脳' },
      { name: '地裂のドルン', el: '拳', cost: 2, hp: 2, atk: 2, range: '正面1', type: '物', kw: '', effect: '召喚時:地形反転。闇マスで攻撃時:洗脳' },
      { name: '念縛のリン', el: '念', cost: 2, hp: 2, atk: 2, range: '正面1', type: '物', kw: '', effect: '攻撃時:敵180°回転' },
      { name: '念断のゲッカ', el: '念', cost: 3, hp: 4, atk: 3, range: '横一列', type: '物', kw: '', effect: '攻撃時:敵ATK-2' },
      { name: '蝕縛のヤミカ', el: '闇', cost: 2, hp: 2, atk: 2, range: '全域', type: '魔', kw: '', effect: '召喚時:隣接敵ATK-1+敵1体の向き固定2T' },
      { name: '蝕変のアルマ', el: '闇', cost: 1, hp: 1, atk: 1, range: '正面1', type: '物', kw: '', effect: '召喚時:自マスと対象マスの属性を入替' },
      { name: '蝕心のミスズ', el: '光', cost: 6, hp: 6, atk: 4, range: '全域', type: '魔', kw: '', effect: '召喚時:全敵を洗脳(行動済みに)。攻撃時:洗脳中の敵も攻撃対象。敵撃破時:そのマスを闇に変更' },
      { name: '光鎖のレティ', el: '光', cost: 3, hp: 4, atk: 3, range: '正面1', type: '物', kw: '防護', effect: '被ダメ時:隣接するlicht属性の敵を洗脳' },
      { name: '虚空のスイ', el: '虚', cost: 1, hp: 2, atk: 2, range: '正面1', type: '物', kw: '', effect: '手札捨て:マナ+1。撃破時:1ドロー' },
      { name: '虚無のカラン', el: '虚', cost: 5, hp: 6, atk: 4, range: '正面1', type: '物', kw: '', effect: '召喚時:敵1体を永続凍結(カラン生存中)。闇マスにいる場合:もう1体凍結。凍結敵の隣接味方はATK-1' },
      { name: '時縛のクロノ', el: '虚', cost: 3, hp: 4, atk: 2, range: '全域', type: '魔', kw: '', effect: '召喚時:敵全体の向き2T固定' },
      { name: '侵蝕のロア', el: '虚', cost: 2, hp: 2, atk: 2, range: '正面1', type: '物', kw: '', effect: '攻撃時:対象マスとnichtマスの属性入替+敵マナ-1' },
      { name: '威圧のオウガ', el: '拳', cost: 3, hp: 4, atk: 2, range: '正面1', type: '物', kw: '威圧', effect: 'なし(周囲敵の再行動コスト+1)' },
    ]
  },
  {
    name: 'SYNERGY（連携）', color: '27AE60',
    cards: [
      { name: '鼓舞のユイ', el: '拳', cost: 1, hp: 2, atk: 1, range: '正面1', type: '物', kw: '', effect: '味方1体以上いる時:自分ATK+1' },
      { name: '闘魂のレンジ', el: '拳', cost: 2, hp: 2, atk: 2, range: '正面1', type: '物', kw: '', effect: '攻撃時:隣接味方HP1回復' },
      { name: '絆のツムギ', el: '念', cost: 2, hp: 2, atk: 2, range: '全域', type: '魔', kw: '吸収', effect: '毎ターン:隣接味方HP1回復' },
      { name: '念波のコダマ', el: '念', cost: 2, hp: 2, atk: 2, range: '正面1', type: '物', kw: '', effect: '召喚時:隣接味方1体につきATK+1。味方0体なら自傷2' },
      { name: '共鳴のハルカ', el: '闇', cost: 2, hp: 2, atk: 2, range: '全域', type: '魔', kw: '', effect: '召喚時:再生(1)+敵引き寄せ+マス属性入替' },
      { name: '蝕連のシュウ', el: '闇', cost: 1, hp: 1, atk: 1, range: '正面1', type: '物', kw: '', effect: '撃破時:隣接味方ATK+2+HP2回復+1ドロー' },
      { name: '癒連のミナト', el: '光', cost: 3, hp: 4, atk: 3, range: '正面1', type: '物', kw: '', effect: '召喚時:味方全体HP2回復' },
      { name: '光絆のアカリ', el: '光', cost: 3, hp: 4, atk: 3, range: '正面1', type: '物', kw: '', effect: '召喚時:隣接味方HP3回復' },
      { name: '虚和のソラ', el: '虚', cost: 1, hp: 2, atk: 1, range: '正面1', type: '物', kw: '', effect: '召喚時:1ドロー。手札捨て:隣接味方HP+1' },
      { name: '盟約のアルス', el: '虚', cost: 6, hp: 7, atk: 4, range: '正面1', type: '物', kw: '', effect: '召喚時:撃破味方数×2のATK増。味方2体以上:全体HP3回復。隣接味方のATK+1' },
      { name: '連陣のレン', el: '光', cost: 2, hp: 2, atk: 1, range: '正面1', type: '物', kw: '', effect: 'なし' },
      { name: '遺志のユズリハ', el: '虚', cost: 2, hp: 2, atk: 2, range: '全域', type: '魔', kw: '', effect: '撃破時:味方全体HP+2+1ドロー' },
      { name: '魔泉のリリア', el: '光', cost: 1, hp: 1, atk: 1, range: '正面1', type: '物', kw: '', effect: '召喚時:マナ+2' },
    ]
  },
  {
    name: 'SNIPE（狙撃）', color: 'E67E22',
    cards: [
      { name: '鋭眼のマルコ', el: '拳', cost: 1, hp: 2, atk: 2, range: '正面1', type: '物', kw: '', effect: '召喚時:敵1ダメ' },
      { name: '裂拳のガウス', el: '拳', cost: 2, hp: 2, atk: 2, range: '正面1', type: '物', kw: '', effect: '召喚時:敵2ダメ' },
      { name: '念弾のリーゼ', el: '念', cost: 2, hp: 2, atk: 2, range: '前方2', type: '物', kw: '貫通', effect: '攻撃時:敵ATK-1' },
      { name: '念穿のヴァルト', el: '念', cost: 3, hp: 4, atk: 3, range: '全域', type: '魔', kw: '貫通', effect: 'なし' },
      { name: '穿孔のアッシュ', el: '闇', cost: 3, hp: 4, atk: 3, range: '前方2', type: '物', kw: '貫通', effect: 'なし' },
      { name: '蝕弾のニドル', el: '闇', cost: 1, hp: 1, atk: 2, range: '正面1', type: '物', kw: '', effect: '召喚時:敵1ダメ' },
      { name: '光弾のエリス', el: '光', cost: 2, hp: 2, atk: 2, range: '全域', type: '魔', kw: '', effect: '攻撃時:マナ+1+敵ATK-1+属性汚染' },
      { name: '癒射のフィーネ', el: '光', cost: 1, hp: 2, atk: 1, range: '正面1', type: '物', kw: '', effect: '撃破時:味方全体ATK+1' },
      { name: '終焉のイグニス', el: '虚', cost: 5, hp: 4, atk: 3, range: '狙撃', type: '物', kw: '貫通,隠密,孤高', effect: '隣接する敵は常にブラインド状態(味方の攻撃も反撃不可+ダメ+1)。撃破時:その敵の隣接全敵ATK-2', note: '死角パターン:全方向(隣接されると反撃不可+被ダメ+1)' },
      { name: '虚眼のゼクス', el: '虚', cost: 5, hp: 6, atk: 4, range: '正面1', type: '物', kw: '貫通', effect: '自属性マスで攻撃ダメ+4。撃破時:そのマスの属性を虚に変更' },
      { name: '暗撃のシャドウ', el: '虚', cost: 2, hp: 2, atk: 2, range: '正面1', type: '物', kw: '', effect: '死角から攻撃時:ATK+2' },
      { name: '徹弾のブレイズ', el: '光', cost: 3, hp: 4, atk: 3, range: '正面1', type: '物', kw: '貫通', effect: '召喚時:敵に貫通2ダメ' },
    ]
  },
  {
    name: 'TRICK（撹乱）', color: 'F39C12',
    cards: [
      { name: '旋風のツバキ', el: '拳', cost: 1, hp: 2, atk: 1, range: '正面1', type: '物', kw: '', effect: '召喚時:敵引寄せ+90°回転。攻撃時:ATK+1' },
      { name: '拳舞のシュラ', el: '拳', cost: 2, hp: 2, atk: 2, range: '前後', type: '物', kw: '回避', effect: '攻撃時:敵180°回転' },
      { name: '転位のカゲロウ', el: '念', cost: 2, hp: 2, atk: 2, range: '正面1', type: '物', kw: '', effect: '召喚時:敵と位置入替+180°回転。死角攻撃時:ATK+3' },
      { name: '幻影のシノブ', el: '念', cost: 2, hp: 2, atk: 2, range: '正面1', type: '物', kw: '', effect: '召喚時:敵ATK-1。攻撃時:敵90°回転' },
      { name: '幻惑のマボロシ', el: '闇', cost: 3, hp: 4, atk: 3, range: '正面1', type: '物', kw: '', effect: '召喚時:敵と位置入替+180°回転+ATK-1' },
      { name: '蝕戯のピエロ', el: '闇', cost: 1, hp: 2, atk: 1, range: '全域', type: '魔', kw: '', effect: '攻撃時:対象マスの地形反転。召喚時:敵1ダメ' },
      { name: '光遁のミラージュ', el: '光', cost: 3, hp: 4, atk: 3, range: '正面1', type: '物', kw: '', effect: '召喚時:敵を押し出す(壁3ダメ)' },
      { name: '瞬光のハク', el: '光', cost: 1, hp: 2, atk: 1, range: '正面1', type: '物', kw: '', effect: '召喚時:敵ATK-1。攻撃時:敵を凍結' },
      { name: '虚遁のカイト', el: '虚', cost: 1, hp: 2, atk: 1, range: '正面1', type: '物', kw: '', effect: '召喚時:1ドロー。攻撃時:手札1枚捨てて敵90°回転' },
      { name: '虚幻のジョーカー', el: '虚', cost: 5, hp: 6, atk: 2, range: '正面1', type: '物', kw: '完全回避', effect: '召喚時:正面の敵1体のATKを奪取(相手ATK0)+180°回転。死角攻撃時:対象を洗脳' },
      { name: '策謀のルシア', el: '光', cost: 2, hp: 2, atk: 2, range: '全域', type: '魔', kw: '', effect: '召喚時:敵2体の位置入替' },
      { name: '反転のジェミニ', el: '虚', cost: 2, hp: 2, atk: 2, range: '全域', type: '魔', kw: '', effect: '自HP50%以下の時:攻撃で対象とHP交換' },
      { name: '瞬転のリップル', el: '念', cost: 1, hp: 2, atk: 2, range: '正面1', type: '物', kw: '', effect: '召喚時:味方と位置入替。攻撃時:ATK+1' },
    ]
  },
];

const items = [
  { name: '緊急補給', cost: 0, effect: '1ドロー' },
  { name: 'マナ結晶', cost: 0, effect: 'マナ+1' },
  { name: '応急キット', cost: 1, effect: '味方1体HP3回復' },
  { name: '強化弾', cost: 1, effect: '味方1体ATK+2' },
  { name: '弱体化ガス', cost: 1, effect: '敵1体ATK-2' },
  { name: '手榴弾', cost: 1, effect: '敵1体に2ダメ' },
  { name: '地脈爆弾', cost: 2, effect: '対象マス地形反転+そのマスの敵に2ダメ' },
  { name: '広域治療薬', cost: 2, effect: '味方全体HP2回復' },
  { name: '封印の札', cost: 2, effect: '敵1体を封印2T+90°回転' },
  { name: '戦術書', cost: 2, effect: '2ドロー' },
  { name: '異能爆弾', cost: 3, effect: '敵1体に3ダメ+ATK-1+180°回転' },
  { name: '総員強化令', cost: 3, effect: '味方全体ATK+2+HP2回復' },
  { name: '氷結弾', cost: 1, effect: '敵1体を凍結(次ターン行動不能)' },
  { name: '拘束鎖', cost: 2, effect: '敵1体を180°回転+向き固定2T' },
  { name: '虚無の種', cost: 1, effect: '対象マスとnichtマスの属性を入替' },
  { name: '貫通砲', cost: 2, effect: '敵1体に防護無視2ダメ' },
  { name: '転送装置', cost: 2, effect: '敵2体の位置を入替' },
  { name: '治癒の印', cost: 1, effect: '味方1体に再生(1)付与' },
  { name: '混乱ガス', cost: 1, effect: '敵1体を90°回転' },
  { name: '反転の鏡', cost: 2, effect: '味方1体と敵1体のATKを交換' },
  { name: '加速装置', cost: 2, effect: '味方1体のATK+1+再行動可能に' },
  { name: '属性爆弾', cost: 2, effect: '敵全員のマスとnichtマスの属性入替' },
  { name: '結界石', cost: 1, effect: '味方1体に再生(1)+不動を付与' },
  { name: '手札交換', cost: 1, effect: '手札を2枚捨てて3枚ドロー' },
  { name: '奮起の号令', cost: 0, effect: '手札1枚捨てて味方1体を再行動可能に' },
  { name: 'マナ錬成', cost: 0, effect: '手札2枚捨ててマナ+3' },
  { name: 'マナ増幅器', cost: 1, effect: 'マナ+2+1ドロー' },
  { name: '急速充填', cost: 0, effect: 'マナ+2(次ターンのマナ増加-1)' },
  { name: '魔力の種', cost: 0, effect: '次ターン開始時にマナ+2' },
];

// ============================================================
// Build inline keyword + effect text
// ============================================================

function buildEffectText(card) {
  let parts = [];

  // Add keyword descriptions inline
  if (card.kw) {
    const keywords = card.kw.split(',').map(k => k.trim()).filter(Boolean);
    for (const kw of keywords) {
      const desc = kwDescriptions[kw];
      if (desc) {
        parts.push(`【${kw}】${desc}`);
      }
    }
  }

  // Add the actual effect text
  if (card.effect && card.effect !== 'なし') {
    parts.push(card.effect);
  }

  // Add note if present
  if (card.note) {
    parts.push(`※${card.note}`);
  }

  return parts.join(' ') || 'なし';
}

// ============================================================
// Document Generation
// ============================================================

const FONT = 'Meiryo';
const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 40, bottom: 40, left: 80, right: 80 };

function makeCell(text, width, opts = {}) {
  const runs = [new TextRun({ text, size: opts.size || 18, bold: opts.bold, font: FONT })];
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({ children: runs, alignment: opts.align || AlignmentType.LEFT })],
  });
}

// Column layout: 名前, 属性, C, HP, ATK, 範囲, 種, 効果テキスト
// Removed キーワード column; keywords are now inline in effect
const COL_NAME  = 1600;
const COL_EL    = 500;
const COL_COST  = 400;
const COL_HP    = 400;
const COL_ATK   = 450;
const COL_RANGE = 800;
const COL_TYPE  = 400;
const COL_EFF   = 5300;
const TABLE_WIDTH = COL_NAME + COL_EL + COL_COST + COL_HP + COL_ATK + COL_RANGE + COL_TYPE + COL_EFF; // 9850

function buildFactionTable(faction) {
  const headerRow = new TableRow({
    children: [
      makeCell('名前', COL_NAME, { bold: true, shading: faction.color, size: 16 }),
      makeCell('属性', COL_EL, { bold: true, shading: faction.color, size: 16, align: AlignmentType.CENTER }),
      makeCell('C', COL_COST, { bold: true, shading: faction.color, size: 16, align: AlignmentType.CENTER }),
      makeCell('HP', COL_HP, { bold: true, shading: faction.color, size: 16, align: AlignmentType.CENTER }),
      makeCell('ATK', COL_ATK, { bold: true, shading: faction.color, size: 16, align: AlignmentType.CENTER }),
      makeCell('範囲', COL_RANGE, { bold: true, shading: faction.color, size: 16, align: AlignmentType.CENTER }),
      makeCell('種', COL_TYPE, { bold: true, shading: faction.color, size: 16, align: AlignmentType.CENTER }),
      makeCell('効果テキスト', COL_EFF, { bold: true, shading: faction.color, size: 16 }),
    ]
  });

  const dataRows = faction.cards.map((c, i) => {
    const bg = i % 2 === 0 ? 'F9F9F9' : 'FFFFFF';
    const isAce = c.cost >= 5;
    const effectText = buildEffectText(c);
    return new TableRow({
      children: [
        makeCell(c.name, COL_NAME, { shading: bg, bold: isAce }),
        makeCell(c.el, COL_EL, { shading: bg, align: AlignmentType.CENTER }),
        makeCell(String(c.cost), COL_COST, { shading: bg, align: AlignmentType.CENTER }),
        makeCell(String(c.hp), COL_HP, { shading: bg, align: AlignmentType.CENTER }),
        makeCell(String(c.atk), COL_ATK, { shading: bg, align: AlignmentType.CENTER }),
        makeCell(c.range, COL_RANGE, { shading: bg, align: AlignmentType.CENTER }),
        makeCell(c.type, COL_TYPE, { shading: bg, align: AlignmentType.CENTER }),
        makeCell(effectText, COL_EFF, { shading: bg, size: 16 }),
      ]
    });
  });

  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [COL_NAME, COL_EL, COL_COST, COL_HP, COL_ATK, COL_RANGE, COL_TYPE, COL_EFF],
    rows: [headerRow, ...dataRows],
  });
}

function buildItemTable() {
  const headerRow = new TableRow({
    children: [
      makeCell('名前', 2000, { bold: true, shading: '95A5A6', size: 16 }),
      makeCell('C', 500, { bold: true, shading: '95A5A6', size: 16, align: AlignmentType.CENTER }),
      makeCell('効果', 7350, { bold: true, shading: '95A5A6', size: 16 }),
    ]
  });

  const dataRows = items.map((item, i) => {
    const bg = i % 2 === 0 ? 'F9F9F9' : 'FFFFFF';
    return new TableRow({
      children: [
        makeCell(item.name, 2000, { shading: bg }),
        makeCell(String(item.cost), 500, { shading: bg, align: AlignmentType.CENTER }),
        makeCell(item.effect, 7350, { shading: bg }),
      ]
    });
  });

  return new Table({
    width: { size: 9850, type: WidthType.DXA },
    columnWidths: [2000, 500, 7350],
    rows: [headerRow, ...dataRows],
  });
}

// Build document
const children = [];

// Title
children.push(new Paragraph({
  heading: HeadingLevel.TITLE,
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '異能学園総選挙 — 全カードリスト', size: 36, bold: true, font: FONT })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 400 },
  children: [new TextRun({ text: `生成日: ${new Date().toISOString().split('T')[0]}`, size: 20, color: '666666', font: FONT })],
}));

// Faction sections
for (const faction of factions) {
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 300, after: 200 },
    children: [new TextRun({ text: faction.name, size: 28, bold: true, font: FONT, color: faction.color })],
  }));
  children.push(buildFactionTable(faction));
  children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
}

// Items
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 300, after: 200 },
  children: [new TextRun({ text: 'アイテム（29枚）', size: 28, bold: true, font: FONT, color: '95A5A6' })],
}));
children.push(buildItemTable());

const doc = new Document({
  sections: [{
    properties: {
      page: {
        size: { width: 15840, height: 12240, orientation: 'landscape' },
        margin: { top: 720, right: 720, bottom: 720, left: 720 },
      }
    },
    children,
  }]
});

const outPath = 'C:/Projects/EoJ Reboot/docs/card-list.docx';
Packer.toBuffer(doc).then(buffer => {
  fs.mkdirSync('C:/Projects/EoJ Reboot/docs', { recursive: true });
  fs.writeFileSync(outPath, buffer);
  console.log(`Generated: ${outPath}`);
});
