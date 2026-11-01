const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType, PageBreak } = require('docx');

// ============================================================
// Keyword Descriptions
// ============================================================
const KW_TEXT = {
  protection:    '【防護】物理ダメージ-1',
  perfect_dodge: '【完全回避】条件付きで物理攻撃を回避',
  quickness:     '【先制】防御時、相手の攻撃より先に反撃する(死角からは無効)',
  fortress:      '【要塞】自ら攻撃不可、反撃のみ',
  piercing:      '【貫通】防護を無視してダメージ',
  summoning_lock:'【召喚制限】盤面4体以上で召喚可能',
  lifesteal:     '【吸収】与ダメの半分HP回復',
  reflect:       '【反射】被ダメ1を攻撃者に返す',
  anchor:        '【不動】押し引き移動無効',
  damage_link:   '【分散】被ダメの半分を隣接味方に分散',
  blind_dodge:   '【回避】死角攻撃ボーナス無効',
  cover:         '【カバー】隣接味方への攻撃を代わりに受ける＋守った味方ATK+1',
  stealth:       '【隠密】攻撃が常にブラインド扱い(反撃不可+ダメ+1)',
  loner:         '【孤高】隣接味方なしでATK+2',
  pressure:      '【威圧】周囲の敵の再行動コスト+1',
};

const RANGE_LABEL = {
  front1:      '正面1',
  front_back:  '前後',
  front2_line: '前方2直',
  front_row:   '横一列',
  magic:       '全域',
  snipe:       '狙撃(前左右直線)',
};

const BLIND_LABEL = {
  none:       'なし',
  back:       '背面',
  sides:      '側面',
  back_sides: '背+側',
  all:        '全方向',
};

const CLASS_LABEL = {
  combat:   '戦闘',
  '射撃':   '射撃',
  intel:    '情報',
  medic:    '医療',
  strategy: '戦略',
};

// ============================================================
// Card Data — cards.ts 完全準拠
// ============================================================
const factions = [
  {
    name: 'AGGRO（速攻）', color: 'E74C3C',
    desc: '低コスト・高ATK・前方特化。息切れが弱点',
    cards: [
      { name: '迅刃のレイ', el: '拳', cls: '戦闘', cost: 1, hp: 1, atk: 1, act: 1, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:自傷2+ATK+3' },
      { name: '烈火のカグラ', el: '拳', cls: '戦略', cost: 2, hp: 2, atk: 2, act: 1, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:ATK+1。手札2枚以下:さらにATK+2+1ドロー' },
      { name: '雷迅のジンガ', el: '念', cls: '戦闘', cost: 2, hp: 2, atk: 2, act: 1, range: '正面1', type: '物', blind: '背面', kw: ['quickness'], effect: '召喚時:敵1体を押し出す(壁2ダメ)' },
      { name: '雷鳴のライカ', el: '念', cls: '射撃', cost: 1, hp: 2, atk: 1, act: 1, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:敵1体に2ダメ' },
      { name: '蝕牙のドク', el: '闇', cls: '射撃', cost: 2, hp: 2, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '敵撃破時:その敵のATK加算。攻撃後ATK-1' },
      { name: '崩蝕のエンマ', el: '闇', cls: '情報', cost: 1, hp: 2, atk: 1, act: 1, range: '全域', type: '魔', blind: '全方向', kw: ['lifesteal'], effect: '召喚時:敵1体を押し出す(壁2ダメ)' },
      { name: '閃光のヒカリ', el: '光', cls: '医療', cost: 3, hp: 4, atk: 3, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '撃破時:隣接味方HP3回復+ATK+2' },
      { name: '光刃のセラ', el: '光', cls: '戦闘', cost: 5, hp: 6, atk: 4, act: 3, range: '横一列', type: '物', blind: '背面', kw: [], effect: '攻撃時:マナ+2+自分の向き変更' },
      { name: '虚影のゼロ', el: '虚', cls: '情報', cost: 1, hp: 2, atk: 1, act: 1, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:1ドロー。手札を捨てた時:ATK+1' },
      { name: '覇王のカイザー', el: '虚', cls: '戦略', cost: 5, hp: 7, atk: 4, act: 3, range: '前後', type: '物', blind: '背面', kw: [], effect: '召喚時:味方1体を破壊しATK獲得(最低+4)。手札0:1ドロー。毎ターン自傷1' },
      { name: '連撃のハヤテ', el: '光', cls: '戦闘', cost: 2, hp: 2, atk: 1, act: 3, range: '正面1', type: '物', blind: '背面', kw: ['quickness'], effect: '攻撃するたびATK+1' },
      { name: '爆裂のノヴァ', el: '虚', cls: '戦闘', cost: 3, hp: 4, atk: 3, act: 3, range: '全域', type: '魔', blind: '全方向', kw: [], effect: '召喚時:手札を最大2枚捨て、枚数分ダメージ' },
    ]
  },
  {
    name: 'TANK（耐久）', color: '3498DB',
    desc: '高HP・回復・Protection。攻め手不足が弱点',
    cards: [
      { name: '鉄壁のガルド', el: '拳', cls: '戦闘', cost: 3, hp: 4, atk: 3, act: 3, range: '前方2直', type: '物', blind: '背面', kw: ['protection', 'anchor'], effect: 'なし' },
      { name: '剛拳のイワオ', el: '拳', cls: '戦闘', cost: 2, hp: 2, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: ['fortress'], effect: '被ダメ時:受けた値と同じダメージ返す。HP50%以下:ATK+3' },
      { name: '念盾のアオイ', el: '念', cls: '戦略', cost: 2, hp: 2, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: ['reflect'], effect: '召喚時:隣接味方ATK+2' },
      { name: '念壁のシオン', el: '念', cls: '情報', cost: 3, hp: 4, atk: 3, act: 3, range: '全域', type: '魔', blind: '全方向', kw: [], effect: '攻撃時:敵ATK-1+自ATK+1+自HP2回復' },
      { name: '蝕耐のヴェノ', el: '闇', cls: '戦闘', cost: 2, hp: 2, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: ['protection', 'damage_link'], effect: '被ダメ時:攻撃者に2ダメ' },
      { name: '蝕霧のカスミ', el: '闇', cls: '情報', cost: 3, hp: 4, atk: 3, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:敵封印2T+ATK-2' },
      { name: '癒しのミコト', el: '光', cls: '医療', cost: 1, hp: 2, atk: 1, act: 3, range: '全域', type: '魔', blind: '全方向', kw: [], effect: '毎ターン:隣接味方HP2回復' },
      { name: '聖盾のルミナ', el: '光', cls: '医療', cost: 5, hp: 6, atk: 4, act: 3, range: '正面1', type: '物', blind: '背面', kw: ['protection', 'cover'], effect: 'なし' },
      { name: '虚壁のムゲン', el: '虚', cls: '戦略', cost: 1, hp: 2, atk: 1, act: 3, range: '正面1', type: '物', blind: '背面', kw: ['blind_dodge'], effect: '被ダメ時:攻撃者ATK-1+自ATK+1' },
      { name: '虚鎮のナギサ', el: '虚', cls: '射撃', cost: 5, hp: 6, atk: 4, act: 3, range: '正面1', type: '物', blind: '背面', kw: ['fortress', 'cover'], effect: '撃破時:味方全体HP+1,ATK+1。毎ターン自傷1' },
      { name: '報復のガレス', el: '虚', cls: '戦闘', cost: 3, hp: 4, atk: 3, act: 3, range: '正面1', type: '物', blind: '背面', kw: ['protection', 'reflect'], effect: '被ダメ時:ATK+1' },
      { name: '苔壁のモス', el: '光', cls: '医療', cost: 2, hp: 2, atk: 1, act: 3, range: '正面1', type: '物', blind: '背面', kw: ['anchor'], effect: '召喚時:再生(1)' },
    ]
  },
  {
    name: 'CONTROL（妨害）', color: '8E44AD',
    desc: '封印・地形操作・デバフ。自軍打点が弱い',
    cards: [
      { name: '惑わしのシズク', el: '拳', cls: '情報', cost: 2, hp: 2, atk: 2, act: 3, range: '全域', type: '魔', blind: '全方向', kw: [], effect: '召喚時:隣接敵を洗脳' },
      { name: '地裂のドルン', el: '拳', cls: '戦略', cost: 2, hp: 2, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:地形反転。闇マスで攻撃時:洗脳' },
      { name: '念縛のリン', el: '念', cls: '情報', cost: 2, hp: 2, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '攻撃時:敵180°回転' },
      { name: '念断のゲッカ', el: '念', cls: '戦闘', cost: 3, hp: 4, atk: 3, act: 3, range: '横一列', type: '物', blind: '背面', kw: [], effect: '攻撃時:敵ATK-2' },
      { name: '蝕縛のヤミカ', el: '闇', cls: '情報', cost: 2, hp: 2, atk: 2, act: 3, range: '全域', type: '魔', blind: '全方向', kw: [], effect: '召喚時:隣接敵ATK-1+敵1体の向き固定2T' },
      { name: '蝕変のアルマ', el: '闇', cls: '戦略', cost: 1, hp: 1, atk: 1, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:自マスと対象マスの属性入替' },
      { name: '蝕心のミスズ', el: '光', cls: '医療', cost: 6, hp: 6, atk: 4, act: 3, range: '全域', type: '魔', blind: '全方向', kw: [], effect: '洗脳中の敵も攻撃対象に含められる' },
      { name: '光鎖のレティ', el: '光', cls: '戦闘', cost: 3, hp: 4, atk: 3, act: 3, range: '正面1', type: '物', blind: '背面', kw: ['protection'], effect: '被ダメ時:隣接するlicht属性の敵を洗脳' },
      { name: '虚空のスイ', el: '虚', cls: '射撃', cost: 1, hp: 2, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '手札捨て:マナ+1。撃破時:1ドロー' },
      { name: '虚無のカラン', el: '虚', cls: '戦略', cost: 5, hp: 6, atk: 4, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:敵永続凍結(カラン生存中)+ATK-3' },
      { name: '時縛のクロノ', el: '虚', cls: '情報', cost: 3, hp: 4, atk: 2, act: 3, range: '全域', type: '魔', blind: '全方向', kw: [], effect: '召喚時:敵全体の向き2T固定' },
      { name: '侵蝕のロア', el: '虚', cls: '情報', cost: 2, hp: 2, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '攻撃時:対象マスとnichtマスの属性入替+敵マナ-1' },
      { name: '威圧のオウガ', el: '拳', cls: '戦闘', cost: 3, hp: 4, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: ['pressure'], effect: 'なし(周囲敵の再行動コスト+1)' },
    ]
  },
  {
    name: 'SYNERGY（連携）', color: '27AE60',
    desc: '味方バフ・隣接効果。単体性能が弱い',
    cards: [
      { name: '鼓舞のユイ', el: '拳', cls: '戦略', cost: 1, hp: 2, atk: 1, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '味方1体以上:自ATK+1' },
      { name: '闘魂のレンジ', el: '拳', cls: '戦闘', cost: 2, hp: 2, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '攻撃時:隣接味方HP1回復' },
      { name: '絆のツムギ', el: '念', cls: '医療', cost: 2, hp: 2, atk: 2, act: 3, range: '全域', type: '魔', blind: '全方向', kw: ['lifesteal'], effect: '毎ターン:隣接味方HP1回復' },
      { name: '念波のコダマ', el: '念', cls: '情報', cost: 2, hp: 2, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:隣接味方1体につきATK+1。味方0体なら自傷2' },
      { name: '共鳴のハルカ', el: '闇', cls: '戦略', cost: 2, hp: 2, atk: 2, act: 3, range: '全域', type: '魔', blind: '全方向', kw: [], effect: '召喚時:再生(1)+敵引き寄せ+マス属性入替' },
      { name: '蝕連のシュウ', el: '闇', cls: '戦闘', cost: 1, hp: 1, atk: 1, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '撃破時:隣接味方ATK+2+HP2回復+1ドロー' },
      { name: '癒連のミナト', el: '光', cls: '医療', cost: 3, hp: 4, atk: 3, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:味方全体HP2回復' },
      { name: '光絆のアカリ', el: '光', cls: '戦略', cost: 3, hp: 4, atk: 3, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:隣接味方HP3回復' },
      { name: '虚和のソラ', el: '虚', cls: '情報', cost: 1, hp: 2, atk: 1, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:1ドロー。手札捨て:隣接味方HP+1' },
      { name: '盟約のアルス', el: '虚', cls: '戦略', cost: 6, hp: 7, atk: 4, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:撃破味方数x2のATK増。味方2体以上:全体HP3回復' },
      { name: '連陣のレン', el: '光', cls: '戦略', cost: 2, hp: 2, atk: 1, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: 'なし' },
      { name: '遺志のユズリハ', el: '虚', cls: '戦略', cost: 2, hp: 2, atk: 2, act: 3, range: '全域', type: '魔', blind: '全方向', kw: [], effect: '撃破時:味方全体HP+2+1ドロー' },
      { name: '魔泉のリリア', el: '光', cls: '医療', cost: 1, hp: 1, atk: 1, act: 1, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:マナ+2' },
    ]
  },
  {
    name: 'SNIPE（狙撃）', color: 'E67E22',
    desc: '高ATK・Piercing・ガラスの大砲。HP低い',
    cards: [
      { name: '鋭眼のマルコ', el: '拳', cls: '射撃', cost: 1, hp: 2, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:敵1ダメ' },
      { name: '裂拳のガウス', el: '拳', cls: '戦闘', cost: 2, hp: 2, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:敵2ダメ' },
      { name: '念弾のリーゼ', el: '念', cls: '射撃', cost: 2, hp: 2, atk: 2, act: 3, range: '前方2直', type: '物', blind: '背面', kw: ['piercing'], effect: '攻撃時:敵ATK-1' },
      { name: '念穿のヴァルト', el: '念', cls: '情報', cost: 3, hp: 4, atk: 3, act: 3, range: '全域', type: '魔', blind: '全方向', kw: ['piercing'], effect: 'なし' },
      { name: '穿孔のアッシュ', el: '闇', cls: '射撃', cost: 3, hp: 4, atk: 3, act: 3, range: '前方2直', type: '物', blind: '背面', kw: ['piercing'], effect: 'なし' },
      { name: '蝕弾のニドル', el: '闇', cls: '情報', cost: 1, hp: 1, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:敵1ダメ' },
      { name: '光弾のエリス', el: '光', cls: '医療', cost: 2, hp: 2, atk: 2, act: 3, range: '全域', type: '魔', blind: '全方向', kw: [], effect: '攻撃時:マナ+1+敵ATK-1+属性汚染' },
      { name: '癒射のフィーネ', el: '光', cls: '戦略', cost: 1, hp: 2, atk: 1, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '撃破時:味方全体ATK+1' },
      { name: '終焉のイグニス', el: '虚', cls: '射撃', cost: 5, hp: 4, atk: 3, act: 3, range: '狙撃(前左右直線)', type: '物', blind: '全方向', kw: ['piercing', 'stealth', 'loner'], effect: 'なし(全てキーワード効果)' },
      { name: '虚眼のゼクス', el: '虚', cls: '戦闘', cost: 5, hp: 6, atk: 4, act: 3, range: '正面1', type: '物', blind: '背面', kw: ['piercing'], effect: '自属性マスにいる時:追加4ダメ。召喚時:1ドロー' },
      { name: '暗撃のシャドウ', el: '虚', cls: '戦闘', cost: 2, hp: 2, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '死角から攻撃時:ATK+2' },
      { name: '徹弾のブレイズ', el: '光', cls: '射撃', cost: 3, hp: 4, atk: 3, act: 3, range: '正面1', type: '物', blind: '背面', kw: ['piercing'], effect: '召喚時:敵に貫通2ダメ' },
    ]
  },
  {
    name: 'TRICK（撹乱）', color: 'F39C12',
    desc: '位置入替・回転・効果が状況依存',
    cards: [
      { name: '旋風のツバキ', el: '拳', cls: '戦闘', cost: 1, hp: 2, atk: 1, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:敵引寄せ+90°回転。攻撃時:ATK+1' },
      { name: '拳舞のシュラ', el: '拳', cls: '戦闘', cost: 2, hp: 2, atk: 2, act: 3, range: '前後', type: '物', blind: '背面', kw: ['blind_dodge'], effect: '攻撃時:敵180°回転' },
      { name: '転位のカゲロウ', el: '念', cls: '情報', cost: 2, hp: 2, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:敵と位置入替+180°回転。死角攻撃時:ATK+3' },
      { name: '幻影のシノブ', el: '念', cls: '情報', cost: 2, hp: 2, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:敵ATK-1。攻撃時:敵90°回転' },
      { name: '幻惑のマボロシ', el: '闇', cls: '戦略', cost: 3, hp: 4, atk: 3, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:敵と位置入替+180°回転+ATK-1' },
      { name: '蝕戯のピエロ', el: '闇', cls: '戦略', cost: 1, hp: 2, atk: 1, act: 3, range: '全域', type: '魔', blind: '全方向', kw: [], effect: '攻撃時:対象マスの地形反転。召喚時:敵1ダメ' },
      { name: '光遁のミラージュ', el: '光', cls: '医療', cost: 3, hp: 4, atk: 3, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:敵を押し出す(壁3ダメ)' },
      { name: '瞬光のハク', el: '光', cls: '射撃', cost: 1, hp: 2, atk: 1, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:敵ATK-1。攻撃時:敵を凍結' },
      { name: '虚遁のカイト', el: '虚', cls: '情報', cost: 1, hp: 2, atk: 1, act: 3, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:1ドロー。攻撃時:手札1枚捨てて敵90°回転' },
      { name: '虚幻のジョーカー', el: '虚', cls: '戦略', cost: 5, hp: 6, atk: 2, act: 3, range: '正面1', type: '物', blind: '背面', kw: ['perfect_dodge'], effect: '召喚時:最高ATK敵のATKをコピー+その敵ATK0+180°回転' },
      { name: '策謀のルシア', el: '光', cls: '戦略', cost: 2, hp: 2, atk: 2, act: 3, range: '全域', type: '魔', blind: '全方向', kw: [], effect: '召喚時:敵2体の位置入替' },
      { name: '反転のジェミニ', el: '虚', cls: '情報', cost: 2, hp: 2, atk: 2, act: 3, range: '全域', type: '魔', blind: '全方向', kw: [], effect: '自HP50%以下の時:攻撃で対象とHP交換' },
      { name: '瞬転のリップル', el: '念', cls: '戦略', cost: 1, hp: 2, atk: 2, act: 1, range: '正面1', type: '物', blind: '背面', kw: [], effect: '召喚時:味方と位置入替。攻撃時:ATK+1' },
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
// Document Generation
// ============================================================

const border = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 30, bottom: 30, left: 60, right: 60 };

function makeCell(text, width, opts = {}) {
  const runs = [new TextRun({ text, size: opts.size || 16, bold: opts.bold, font: 'Meiryo UI', color: opts.color })];
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({ children: runs, alignment: opts.align || AlignmentType.LEFT })],
  });
}

/** Build rich text cell with keyword highlights + effect */
function makeTextCell(card, width, bg) {
  const runs = [];
  // Keyword effects first
  for (const kw of card.kw) {
    const kwText = KW_TEXT[kw];
    if (kwText) {
      if (runs.length > 0) runs.push(new TextRun({ text: ' ', size: 15, font: 'Meiryo UI' }));
      // keyword label in bold
      const match = kwText.match(/^(【[^】]+】)(.*)$/);
      if (match) {
        runs.push(new TextRun({ text: match[1], size: 15, bold: true, font: 'Meiryo UI', color: '8B4513' }));
        runs.push(new TextRun({ text: match[2], size: 15, font: 'Meiryo UI' }));
      } else {
        runs.push(new TextRun({ text: kwText, size: 15, font: 'Meiryo UI' }));
      }
    }
  }
  // Separator if both exist
  if (card.kw.length > 0 && card.effect && card.effect !== 'なし' && card.effect !== 'なし(全てキーワード効果)' && card.effect !== 'なし(周囲敵の再行動コスト+1)') {
    runs.push(new TextRun({ text: ' / ', size: 15, font: 'Meiryo UI', color: '999999' }));
  }
  // Effect text
  if (card.effect && card.effect !== 'なし' && card.effect !== 'なし(全てキーワード効果)') {
    let effectText = card.effect;
    if (effectText === 'なし(周囲敵の再行動コスト+1)') effectText = ''; // handled by kw
    if (effectText) {
      runs.push(new TextRun({ text: effectText, size: 15, font: 'Meiryo UI' }));
    }
  }
  // If nothing at all
  if (runs.length === 0) {
    runs.push(new TextRun({ text: '-', size: 15, font: 'Meiryo UI', color: '999999' }));
  }

  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    margins: cellMargins,
    shading: bg ? { fill: bg, type: ShadingType.CLEAR } : undefined,
    children: [new Paragraph({ children: runs })],
  });
}

// Column widths for landscape (content area ~14400 DXA at 0.5" margins)
// 名前:1700 属:450 科:500 C:350 HP:350 ATK:400 再:350 攻撃範囲:1100 種:350 死角:550 テキスト:8050
const COL_W = [1700, 450, 500, 350, 350, 400, 350, 1100, 350, 550, 8050];
const TOTAL_W = COL_W.reduce((a, b) => a + b, 0); // 14150

const HEADERS = ['名前', '属性', '学科', 'C', 'HP', 'ATK', '再行', '攻撃範囲', '種', '死角', 'テキスト（キーワード効果 / カード効果）'];

function buildFactionTable(faction) {
  const hdrColor = faction.color;
  const headerRow = new TableRow({
    children: HEADERS.map((h, i) => makeCell(h, COL_W[i], {
      bold: true, shading: hdrColor, size: 14,
      align: i >= 3 && i <= 9 ? AlignmentType.CENTER : AlignmentType.LEFT,
      color: 'FFFFFF',
    })),
  });

  const dataRows = faction.cards.map((c, i) => {
    const bg = i % 2 === 0 ? 'F9F9F9' : 'FFFFFF';
    const isAce = c.cost >= 5;
    return new TableRow({
      children: [
        makeCell(c.name, COL_W[0], { shading: bg, bold: isAce }),
        makeCell(c.el, COL_W[1], { shading: bg, align: AlignmentType.CENTER }),
        makeCell(c.cls, COL_W[2], { shading: bg, align: AlignmentType.CENTER }),
        makeCell(String(c.cost), COL_W[3], { shading: bg, align: AlignmentType.CENTER }),
        makeCell(String(c.hp), COL_W[4], { shading: bg, align: AlignmentType.CENTER }),
        makeCell(String(c.atk), COL_W[5], { shading: bg, align: AlignmentType.CENTER }),
        makeCell(String(c.act), COL_W[6], { shading: bg, align: AlignmentType.CENTER }),
        makeCell(c.range, COL_W[7], { shading: bg, align: AlignmentType.CENTER }),
        makeCell(c.type, COL_W[8], { shading: bg, align: AlignmentType.CENTER }),
        makeCell(c.blind, COL_W[9], { shading: bg, align: AlignmentType.CENTER }),
        makeTextCell(c, COL_W[10], bg),
      ],
    });
  });

  return new Table({
    width: { size: TOTAL_W, type: WidthType.DXA },
    columnWidths: COL_W,
    rows: [headerRow, ...dataRows],
  });
}

function buildItemTable() {
  const headerRow = new TableRow({
    children: [
      makeCell('名前', 2200, { bold: true, shading: '7F8C8D', size: 14, color: 'FFFFFF' }),
      makeCell('C', 400, { bold: true, shading: '7F8C8D', size: 14, align: AlignmentType.CENTER, color: 'FFFFFF' }),
      makeCell('効果', 11550, { bold: true, shading: '7F8C8D', size: 14, color: 'FFFFFF' }),
    ],
  });

  const dataRows = items.map((item, i) => {
    const bg = i % 2 === 0 ? 'F9F9F9' : 'FFFFFF';
    return new TableRow({
      children: [
        makeCell(item.name, 2200, { shading: bg }),
        makeCell(String(item.cost), 400, { shading: bg, align: AlignmentType.CENTER }),
        makeCell(item.effect, 11550, { shading: bg }),
      ],
    });
  });

  return new Table({
    width: { size: TOTAL_W, type: WidthType.DXA },
    columnWidths: [2200, 400, 11550],
    rows: [headerRow, ...dataRows],
  });
}

// ============================================================
// Build Document
// ============================================================
const children = [];

// Title
children.push(new Paragraph({
  heading: HeadingLevel.TITLE,
  alignment: AlignmentType.CENTER,
  children: [new TextRun({ text: '異能学園総選挙 — 全カードリスト（完全版）', size: 36, bold: true, font: 'Meiryo UI' })],
}));
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { after: 200 },
  children: [new TextRun({ text: `生成日: ${new Date().toISOString().split('T')[0]}  |  キャラ ${factions.reduce((s, f) => s + f.cards.length, 0)}枚 + アイテム ${items.length}枚`, size: 18, color: '666666', font: 'Meiryo UI' })],
}));

// Legend
children.push(new Paragraph({
  spacing: { after: 100 },
  children: [
    new TextRun({ text: '凡例: ', size: 16, bold: true, font: 'Meiryo UI' }),
    new TextRun({ text: 'C=召喚コスト  再行=再行動コスト  種=物(物理)/魔(魔法)  死角=ブラインドスポット(被攻撃時に敵にダメ+1＆反撃不可)', size: 16, font: 'Meiryo UI', color: '555555' }),
  ],
}));
children.push(new Paragraph({
  spacing: { after: 100 },
  children: [
    new TextRun({ text: '攻撃範囲: ', size: 16, bold: true, font: 'Meiryo UI' }),
    new TextRun({ text: '正面1=前1マス  前後=前後各1  前方2直=前方直線2マス  横一列=正面行3マス  全域=盤面全体1体選択  狙撃=前・左・右直線', size: 16, font: 'Meiryo UI', color: '555555' }),
  ],
}));
children.push(new Paragraph({
  spacing: { after: 200 },
  children: [
    new TextRun({ text: '死角デフォルト: ', size: 16, bold: true, font: 'Meiryo UI' }),
    new TextRun({ text: '物理=背面のみ  魔法=全方向(反撃されない代わり全方向が死角)', size: 16, font: 'Meiryo UI', color: '555555' }),
  ],
}));

// Faction sections
for (const faction of factions) {
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 200, after: 100 },
    children: [
      new TextRun({ text: faction.name, size: 26, bold: true, font: 'Meiryo UI', color: faction.color }),
      new TextRun({ text: `  ${faction.desc}`, size: 18, font: 'Meiryo UI', color: '888888' }),
    ],
  }));
  children.push(buildFactionTable(faction));
  children.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
}

// Items
children.push(new Paragraph({ children: [new PageBreak()] }));
children.push(new Paragraph({
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 200, after: 100 },
  children: [
    new TextRun({ text: `アイテム（${items.length}枚）`, size: 26, bold: true, font: 'Meiryo UI', color: '7F8C8D' }),
    new TextRun({ text: '  全陣営共通。デッキに4セットから1つ選んで6枚組み込む', size: 18, font: 'Meiryo UI', color: '888888' }),
  ],
}));
children.push(buildItemTable());

// Item Sets
children.push(new Paragraph({ spacing: { before: 300, after: 100 }, children: [
  new TextRun({ text: 'アイテムセット構成', size: 22, bold: true, font: 'Meiryo UI' }),
]}));

const itemSets = [
  { name: 'セットA: 万能型', items: 'マナ増幅器, 強化弾, 手榴弾, 応急キット, 封印の札, 加速装置' },
  { name: 'セットB: 攻撃型', items: 'マナ錬成, 貫通砲, 奮起の号令, 異能爆弾, 属性爆弾, 弱体化ガス' },
  { name: 'セットC: 戦術型', items: '手札交換, 急速充填, 地脈爆弾, 転送装置, 拘束鎖, 反転の鏡' },
  { name: 'セットD: 持久型', items: '広域治療薬, 魔力の種, 氷結弾, 結界石, 治癒の印, 戦術書' },
];

for (const s of itemSets) {
  children.push(new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: s.name, size: 18, bold: true, font: 'Meiryo UI' }),
      new TextRun({ text: `: ${s.items}`, size: 18, font: 'Meiryo UI' }),
    ],
  }));
}

const doc = new Document({
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840, orientation: 'landscape' },
        margin: { top: 500, right: 500, bottom: 500, left: 500 },
      },
    },
    children,
  }],
});

Packer.toBuffer(doc).then(buffer => {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = `C:/Projects/EoJ Reboot/docs/card-list-${ts}.docx`;
  fs.mkdirSync('C:/Projects/EoJ Reboot/docs', { recursive: true });
  fs.writeFileSync(outPath, buffer);
  console.log(`Generated: ${outPath}`);
});
