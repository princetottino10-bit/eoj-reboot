const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, PageOrientation,
  HeadingLevel, BorderStyle, WidthType, ShadingType,
  PageNumber, PageBreak, LevelFormat
} = require('docx');

// ========================================
// Helpers
// ========================================
const border = { style: BorderStyle.SINGLE, size: 1, color: 'AAAAAA' };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

function headerCell(text, width) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: { fill: '2C3E50', type: ShadingType.CLEAR },
    margins: cellMargins,
    verticalAlign: 'center',
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, color: 'FFFFFF', font: 'Meiryo', size: 18 })] })],
  });
}

function cell(text, width, opts = {}) {
  const runs = [];
  if (opts.bold) {
    runs.push(new TextRun({ text, bold: true, font: 'Meiryo', size: 18, color: opts.color || '000000' }));
  } else {
    runs.push(new TextRun({ text, font: 'Meiryo', size: 18, color: opts.color || '000000' }));
  }
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: opts.fill ? { fill: opts.fill, type: ShadingType.CLEAR } : undefined,
    margins: cellMargins,
    children: [new Paragraph({ children: runs })],
  });
}

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, bold: true, font: 'Meiryo', size: 32, color: '2C3E50' })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, bold: true, font: 'Meiryo', size: 26, color: '34495E' })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, bold: true, font: 'Meiryo', size: 22, color: '7F8C8D' })],
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, font: 'Meiryo', size: 18, ...opts })],
  });
}

function pBold(text) {
  return p(text, { bold: true });
}

function emptyLine() {
  return new Paragraph({ spacing: { after: 40 }, children: [] });
}

function simpleTable(headers, rows, colWidths) {
  const totalWidth = colWidths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({
    children: headers.map((h, i) => headerCell(h, colWidths[i])),
  });
  const dataRows = rows.map(row =>
    new TableRow({
      children: row.map((text, i) => cell(text, colWidths[i])),
    })
  );
  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows],
  });
}

// ========================================
// Content sections
// ========================================

function buildTitlePage() {
  return [
    emptyLine(), emptyLine(), emptyLine(), emptyLine(),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: '異能学園総選挙', bold: true, font: 'Meiryo', size: 56, color: '2C3E50' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: 'ゲームルール＆デザイン基盤ドキュメント', font: 'Meiryo', size: 28, color: '7F8C8D' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [new TextRun({ text: `Ver.1.0 — ${new Date().toISOString().slice(0, 10)}`, font: 'Meiryo', size: 20, color: '95A5A6' })],
    }),
    new PageBreak(),
  ];
}

function buildSection1() {
  return [
    h1('■1. 勝利条件'),
    pBold('自分のターン終了時に5マス以上を支配していれば勝利'),
    p('・3×3盤面（9マス）のうち5マス以上にキャラクターを配置した状態でターン終了すると勝利'),
    p('・召喚や攻撃で一瞬5マスになっても、ターン終了時に維持できていなければ勝ちにならない'),
    p('・4マス支配の状態を「CHECK」と呼ぶ（特別なルール効果はない）'),
    p('・最大50ターンで決着しなければドロー'),
    emptyLine(),
    pBold('勝ち筋の主役（重要度順）：'),
    p('1. 向きと死角の読み合い'),
    p('2. 混色シナジー発見'),
    p('3. 派手なコンボ'),
    p('4. 盤面支配レース'),
    p('5. 位置操作'),
    p('6. エース着地の達成感'),
    p('7. 属性マスの取り合い'),
    p('8. 低コストの接続'),
  ];
}

function buildSection2() {
  return [
    h1('■2. 盤面ルール'),
    simpleTable(
      ['項目', '内容'],
      [
        ['盤面サイズ', '3×3（9マス）'],
        ['配置ルール', '初手は任意のマス。2体目以降は既存キャラに隣接するマスのみ'],
        ['隣接の定義', '上下左右のみ（斜め含まない）'],
        ['向きの概念', '4方向(上/右/下/左)。召喚時に指定'],
        ['死角(ブラインド)', '攻撃者が防御者の攻撃範囲外→反撃不可+ダメージ+1'],
        ['初期属性マス', 'nicht×1, faust×2, geist×2, licht×2, nacht×2（ランダム配置）'],
      ],
      [3000, 7360]
    ),
  ];
}

function buildSection3() {
  return [
    h1('■3. 1ターンの流れ'),
    h2('ターン開始フェイズ'),
    p('1. 1ドロー（T1先攻のみドローなし）'),
    p('2. マナ+2'),
    p('3. 凍結・再生等のバフ処理'),
    p('4. on_turn_start効果解決'),
    emptyLine(),
    h2('アクションフェイズ（順不同、マナが続く限り）'),
    simpleTable(
      ['アクション', '回数制限', 'コスト', '備考'],
      [
        ['召喚', '1ターン1体', 'カードのmanaCost', '召喚直後、正面に敵がいれば自動攻撃'],
        ['攻撃（再行動）', 'マナ続く限り何体でも', 'activateCost（デフォルト3）', '低コストキャラは1マナ'],
        ['回転', '1キャラ1回/T', '1マナ', '向き変更。凍結/向き固定中は不可'],
        ['アイテム', '制限なし', 'カードのmanaCost', '手札からアイテムを使用'],
      ],
      [2200, 2200, 2500, 3460]
    ),
    emptyLine(),
    h2('ターン終了フェイズ'),
    p('1. on_turn_end効果解決'),
    p('2. 手札上限7枚チェック（超過分捨て）'),
    p('3. 勝利条件判定（5マス支配でターン終了なら勝利）'),
    p('4. 相手ターンへ'),
    emptyLine(),
    pBold('重要な仕様:'),
    p('・通常移動は存在しない。位置変更はpush/pull/swap効果のみ'),
    p('・出したターンに攻撃できる（召喚→自動攻撃が発生）'),
    p('・凍結中のキャラは攻撃も回転も不可'),
  ];
}

function buildSection4() {
  return [
    h1('■4. コスト・リソース'),
    simpleTable(
      ['項目', '値'],
      [
        ['初期マナ', '0'],
        ['毎ターン増加', '+2（固定）'],
        ['マナ上限', 'なし（無限に溜まる）'],
        ['持ち越し', 'あり（使い残しは次ターンに加算）'],
        ['キャラ撃破時', '撃破された側のオーナーにマナ+1'],
        ['初期手札', '5枚'],
        ['毎ターンドロー', '1枚（先攻T1のみドローなし）'],
        ['手札上限', '7枚（ターン終了時に超過分を捨てる）'],
        ['デッキ切れ', '捨て札をシャッフルして山に戻す'],
      ],
      [3500, 6860]
    ),
    emptyLine(),
    h2('コスト感の基準（マナ経済）'),
    p('T1: マナ2 → 1コスト出して残1、または2コスト1体'),
    p('T2: マナ3〜 → 3コスト圏'),
    p('T3: マナ5〜 → 5コスト圏（エース最速着地）'),
    p('T4: マナ5〜7 → 6コスト圏 or エース+再行動'),
    emptyLine(),
    p('1コスト＝T1から出せる。マナ効率◎'),
    p('3コスト＝T2で出せる中核'),
    p('5コスト＝最速T3。溜めが必要'),
    p('6コスト＝最速T3（T1-T2全貯め）。通常T4'),
  ];
}

function buildSection5() {
  return [
    h1('■5. デッキ構築ルール'),
    simpleTable(
      ['項目', '内容'],
      [
        ['陣営選択', '6陣営から2陣営を選ぶ'],
        ['カード採用', '選んだ2陣営の全キャラカードが自動で入る（固定）'],
        ['枚数調整', 'なし。選んだ陣営のカードが全部入る'],
        ['同名複数', 'なし。各カード1枚ずつ'],
        ['エース枚数制限', '特になし。各陣営に2枚ずつのエース(5-6コスト)'],
        ['アイテム', '4つのアイテムセット(A/B/C/D)から1つ選ぶ。6枚固定'],
        ['デッキ総枚数', '30枚（12キャラ×2陣営 + 6アイテム）'],
      ],
      [3000, 7360]
    ),
  ];
}

function buildSection6() {
  return [
    h1('■6. 属性マスルール'),
    h2('属性体系'),
    p('5属性: faust(拳), geist(念), licht(光), nacht(闇), nicht(虚)'),
    p('対立ペア: faust(拳) ↔ geist(念)、licht(光) ↔ nacht(闇)'),
    p('nicht(虚)は中立。ボーナスもペナルティもなし'),
    emptyLine(),
    h2('属性一致ボーナス/ペナルティ'),
    simpleTable(
      ['キャラ属性 vs マス属性', 'HP修正'],
      [
        ['一致', 'HP+2'],
        ['対立', 'HP−2'],
        ['その他/nicht', '±0'],
      ],
      [5180, 5180]
    ),
    emptyLine(),
    p('・HP修正は召喚時のみ適用。配置後にマスが変わってもHPは変動しない'),
    p('・HP1のキャラを対立マスに出すとHP−1で即死'),
    emptyLine(),
    h2('地形変更'),
    p('・field_quake(属性反転): 対立属性に変更。nichtは変化なし'),
    p('・field_swap(属性入替): 2つのマスの属性を交換'),
    p('・element_corrupt(属性汚染): 対象マスとnichtマスの属性を入替'),
    p('・召喚でマスの属性は変わらない（マスの属性はカードとは独立）'),
  ];
}

function buildSection7() {
  return [
    h1('■7. ステータス基準'),
    h2('コスト別の標準スタッツ'),
    simpleTable(
      ['コスト', 'HP', 'ATK', '備考'],
      [
        ['1', '1〜2', '1', '紙。1仕事して退場前提'],
        ['2', '2', '2', '基本戦力。小粒'],
        ['3', '4', '2〜3', '中核。それなりに粘る'],
        ['5', '4〜6', '3〜4', 'エース。決定力あり'],
        ['6', '6〜7', '4', '大エース。制圧力'],
      ],
      [1500, 1500, 1500, 5860]
    ),
    emptyLine(),
    h2('数値の重さ'),
    simpleTable(
      ['数値', '重さの感覚'],
      [
        ['1ダメージ', '軽い。1コストのHP半分。2コストには1/2'],
        ['2ダメージ', '中程度。1コスト即死、2コストも危険域'],
        ['3ダメージ', '重い。3コスト(HP4)を一撃圏内に'],
        ['ATK+1', '意味はある。2コスト同士の殴り合いで1発分の差'],
        ['ATK+2', '大きい。2コスト(ATK2)の倍にする'],
        ['ATK-2', '致命的。2コスト(ATK2)を0にして無力化'],
        ['HP1回復', '小さいが1ダメージ1回分の延命。毎ターンなら大きい'],
        ['HP3回復', '大きい。2コスト(HP2)をフル回復以上'],
      ],
      [2500, 7860]
    ),
  ];
}

function buildSection8() {
  return [
    h1('■8. キーワード能力の定義'),
    emptyLine(),
    simpleTable(
      ['キーワード', '日本語名', '効果'],
      [
        ['protection', '防護', '物理ダメージ−1。貫通(piercing)で無視される'],
        ['cover', 'カバー', '隣接味方が攻撃された時、代わりにダメージを受ける。守った味方にATK+1'],
        ['fortress', '要塞', '自分から攻撃できない。反撃のみ可能'],
        ['damage_link', '分散', '受けるダメージを半分に（切上げ）。残り半分は隣接味方に分散'],
        ['reflect', '反射', 'ダメージを受けた時、攻撃者に1ダメージ返す'],
        ['regenerate', '再生', 'バフとして付与。毎ターン開始時にHP+value回復'],
        ['piercing', '貫通', '防護(protection)を無視してダメージを与える'],
        ['quickness', '先制', '攻撃された時（死角以外）、相手より先に反撃する。反撃で攻撃者が死ねば攻撃不発'],
        ['anchor', '不動', 'push/pull/move/swapで移動させられない'],
        ['perfect_dodge', '完全回避', '物理攻撃無効。魔法・貫通は受ける'],
        ['lifesteal', '吸収', '与ダメージの半分(切上げ)だけ自分のHP回復'],
        ['blind_dodge', '回避', 'ブラインドスポットからの+1ダメージボーナスを無効化'],
        ['stealth', '隠密', '攻撃が常にブラインド扱い（反撃不可+ダメージ+1）'],
        ['loner', '孤高', '隣接(上下左右)に味方がいない場合ATK+2'],
        ['pressure', '威圧', '隣接する敵の再行動コスト+1（複数いても+1まで）'],
      ],
      [2000, 1600, 6760]
    ),
    emptyLine(),
    h2('状態異常'),
    simpleTable(
      ['名称', '効果', '解除条件'],
      [
        ['洗脳(brainwash)', '対象を行動済みにする（そのターン攻撃・回転不可）。セル支配権は変わらない', '次のターン開始時に自動解除'],
        ['凍結(freeze)', '対象をNターン行動不能に。攻撃も回転もできない', '持続ターン経過 or 付与者撃破'],
        ['封印(seal)', '対象のキーワード能力と効果をNターン無効化', '持続ターン経過'],
        ['向き固定(direction_lock)', '対象をNターン回転不可にする', '持続ターン経過'],
      ],
      [2600, 4860, 2900]
    ),
    emptyLine(),
    h2('ブラインド（死角）システム'),
    p('・攻撃者が防御者の攻撃範囲外にいる場合「ブラインド」が成立'),
    p('・ブラインド成立時: 反撃不可 + ダメージ+1'),
    p('・blind_dodgeキーワード: +1ダメージボーナスのみ無効化（反撃不可は残る）'),
    p('・stealthキーワード: 攻撃が常にブラインド扱い'),
    p('・物理キャラのデフォルト死角: 背面のみ(back)'),
    p('・魔法キャラのデフォルト死角: 全方向(all) ※全域攻撃なので実質死角なし'),
  ];
}

function buildSection9() {
  return [
    h1('■9. 陣営設計思想'),
    simpleTable(
      ['陣営', 'コンセプト', 'エース', '弱点'],
      [
        ['A: アグロ', '速攻・高ATK・自傷・手札消費', 'セラ(5), カイザー(5)', '息切れ。リソースを使い切ると失速'],
        ['B: タンク', '耐久・防護・カバー・回復', 'ルミナ(5), ナギサ(5)', '攻め手不足。守れるが勝ちに行きにくい'],
        ['C: コントロール', '妨害・洗脳・凍結・地形操作・デバフ', 'カラン(5), ミスズ(6)', '自軍打点が低い。トドメを刺しにくい'],
        ['D: シナジー', '連携・隣接バフ・犠牲・回復', 'アルス(6)', '単体性能が低い。味方が並ばないと弱い'],
        ['E: スナイプ', '狙撃・貫通・高ATK・ガラス耐久', 'イグニス(5), ゼクス(5)', 'HP低い。殴り返されると即死'],
        ['F: トリック', '位置入替・回転・死角操作・完全回避', 'ジョーカー(5)', '効果が状況依存。噛み合わないと何もできない'],
      ],
      [1600, 3200, 2600, 2960]
    ),
    emptyLine(),
    h2('混色の設計思想'),
    p('・各陣営は単独でもある程度回るが、もう片方で欠点を補う前提'),
    p('・混色の理想: 弱点補完 + コンボ拡張の両立'),
    p('・相性差は大きくしたいが、どの組み合わせでも最低限戦える設計'),
  ];
}

function buildSection10() {
  return [
    h1('■10. エース一覧（修正案）'),
    emptyLine(),

    // セラ
    h2('光刃のセラ — アグロ'),
    p('HP6 / ATK4 / コスト5 / 正面行 / 物理'),
    pBold('「攻撃時、自分の向きを任意に変更。攻撃で敵を撃破した場合、追加で1体召喚できる（このターンのみ）」'),
    p('■ 役割: 斬って回転して追加召喚。盤面を「広げる」エース'),
    p('■ 準備: ライカ/ガウスの前削りで撃破圏内に。ツバキ/リンの回転で死角を晒す'),
    p('■ 5マス貢献: 撃破+追加召喚で1ターンに2マス変動（敵-1、味方+1）'),
    p('■ 混色: ×トリック=回転→正面行で刈り取り→追加召喚。×スナイプ=前削り→仕上げ'),
    emptyLine(),

    // カイザー
    h2('覇王のカイザー — アグロ'),
    p('HP7 / ATK4 / コスト5 / 前後1マス / 物理'),
    pBold('「召喚時、味方1体を破壊し、そのATK分だけ自ATK増加。手札0枚の時、攻撃後に隣接する敵を1体押し出す。毎ターン終了時、自分に1ダメージ」'),
    p('■ 役割: 味方を喰らい、全てを使い切って暴れる。盤面を「広げる」エース'),
    p('■ 準備: ゼロ(on_discard)+ノヴァ(手札消費)で手札0に。レイ/ヒカリを破壊対象に'),
    p('■ 5マス貢献: 高ATKで撃破+手札0でpush。殴って退かして5マスを作る'),
    p('■ 混色: ×トリック=カイトの手札消費で手札を減らす。×シナジー=シュウを破壊対象に'),
    emptyLine(),

    // ルミナ
    h2('聖盾のルミナ — タンク'),
    p('HP6 / ATK4 / コスト5 / 正面1 / 物理 / 防護, カバー'),
    pBold('「カバーで味方を守った時、守った味方のHP2回復。隣接に味方が3体以上いる場合、自分は撃破されない（HP0でもHP1で耐える）」'),
    p('■ 役割: 5マス達成後に不死身で守り切る。盤面を「守る」エース'),
    p('■ 準備: ミコト/モスで隣接味方HP維持。ガルドを隣に置いて防護壁ライン形成'),
    p('■ 5マス貢献: 5マス到達後の「守り切り」が本領。隣接3体で不死身化'),
    p('■ 混色: ×シナジー=コダマ/レンジが隣接3体を自然に満たす。×コントロール=洗脳で攻撃手段を奪う'),
    emptyLine(),

    // ナギサ
    h2('虚鎮のナギサ — タンク'),
    p('HP6 / ATK4 / コスト5 / 正面1 / 物理 / 要塞, カバー'),
    pBold('「カバーで味方を守るたび、攻撃者のATK-2。撃破時、味方全体HP+2、ATK+1。毎ターン自分に1ダメージ」'),
    p('■ 役割: 殴ってきた相手を弱体化し、倒れた時に遺産を残す。盤面を「守る」エース'),
    p('■ 準備: ミコトのHP回復で自傷を相殺。ガレスのreflectと合わせて「殴ると痛い壁」'),
    p('■ 5マス貢献: カバー→ATK-2で攻撃を萎縮させ5マスを維持。撃破時全体バフで返しのターンに強い'),
    p('■ 混色: ×コントロール=凍結+ATK-2で攻撃力壊滅。×アグロ=撃破時ATK+1が攻撃陣を強化'),
    emptyLine(),

    // カラン
    h2('虚無のカラン — コントロール'),
    p('HP6 / ATK4 / コスト5 / 正面1 / 物理'),
    pBold('「召喚時、敵1体をカランがいる限り凍結。自分が闇マスにいる場合、さらにもう1体凍結。凍結中の敵の隣接味方はATK-1」'),
    p('■ 役割: 相手の返しを封じる。盤面を「止める」エース'),
    p('■ 準備: アルマ/ピエロで闇マス作成。スイのマナ加速で最速着地'),
    p('■ 5マス貢献: 1〜2体凍結で相手がマスを取り返す手段を封じる'),
    p('■ 混色: ×トリック=ピエロで闇マス→2体凍結。×スナイプ=凍結で動けない敵を狙撃'),
    emptyLine(),

    // ミスズ
    h2('蝕心のミスズ — コントロール'),
    p('HP6 / ATK4 / コスト6 / 魔法(全域) / 魔法'),
    pBold('「召喚時、全敵を洗脳（行動済みにする）。攻撃時、洗脳中の敵も攻撃対象に含められる。敵を撃破するたび、そのマスの属性を闇に変更」'),
    p('■ 役割: 着地した瞬間にゲームが変わる6コストの支配者。盤面を「止める」エース'),
    p('■ 準備: スイ/リリアのマナ加速で6コストを最速着地。事前の洗脳で安全に着地'),
    p('■ 5マス貢献: 全敵洗脳で相手の返しターンを実質スキップ。その間に5マス到達'),
    p('■ 混色: ×スナイプ=全敵洗脳→反撃不能状態でイグニス/ゼクスが安全狙撃。×アグロ=洗脳中にセラで一掃'),
    emptyLine(),

    // アルス
    h2('盟約のアルス — シナジー'),
    p('HP7 / ATK4 / コスト6 / 正面1 / 物理'),
    pBold('「召喚時、撃破された味方の数×2だけATK増加。味方2体以上なら味方全体HP3回復。味方がアルスの隣接にいるたびに、そのキャラのATK+1」'),
    p('■ 役割: 犠牲を勝利に変換するリーダー。盤面を「立て直す」エース'),
    p('■ 準備: シュウ/ユズリハの犠牲で墓地カウント。コダマ/レンジの隣接配置'),
    p('■ 5マス貢献: HP3全体回復で盤面のキャラを延命し5マス維持。隣接バフで突破力も'),
    p('■ 混色: ×タンク=ルミナcover+隣接ATK+1で鉄壁密集陣。×アグロ=犠牲→高ATK着地'),
    emptyLine(),

    // イグニス
    h2('終焉のイグニス — スナイプ'),
    p('HP4 / ATK3 / コスト5 / snipe(前・左・右直線) / 物理 / 貫通, 隠密, 孤高'),
    p('死角パターン: all（全方向ブラインド＝隣接されると反撃不可+被ダメ+1）'),
    pBold('「イグニスに隣接する敵は常にブラインド状態になる（他の味方からの攻撃も反撃不可+ダメ+1）。攻撃で敵を撃破した時、その敵の隣接にいる全敵のATK-2」'),
    p('■ 役割: 孤立狙撃→撃破で周囲が崩壊。盤面を「削る」エース'),
    p('■ 準備: フィーネの全体ATK+1。マルコ/ニドルの前削り。ツバキ/リンの回転'),
    p('■ 5マス貢献: 1体ずつ撃破して盤面を空ける「除去による5マス」'),
    p('■ 弱点: HP4、全方向ブラインドで隣接されると脆い。孤立必須でcoverで守れない'),
    p('■ 混色: ×トリック=死角作り→stealth撃破→周囲ATK-2。×コントロール=凍結で動けない敵を撃破'),
    emptyLine(),

    // ゼクス
    h2('虚眼のゼクス — スナイプ'),
    p('HP6 / ATK4 / コスト5 / 正面1 / 物理 / 貫通'),
    pBold('「自属性(虚)マスにいる時、攻撃ダメージ+4。攻撃で敵を撃破した時、そのマスの属性を虚に変更」'),
    p('■ 役割: 地形を塗り替える狙撃手。盤面を「削る」エース'),
    p('■ 準備: エリス/アルマ/ピエロの地形操作で虚マスを作る'),
    p('■ 5マス貢献: ATK8(4+4)piercingで撃破→空きマスに味方→虚マス増殖で連鎖'),
    p('■ 混色: ×コントロール=アルマで虚マス→撃破→虚増殖。×トリック=カゲロウで敵を虚マスに引き出す'),
    emptyLine(),

    // ジョーカー
    h2('虚幻のジョーカー — トリック'),
    p('HP6 / ATK2 / コスト5 / 正面1 / 物理 / 完全回避'),
    pBold('「召喚時、正面の敵1体のATKを奪取し（自ATKに加算、相手ATKは0に）、その敵を180°回転。死角から攻撃した時、対象を洗脳」'),
    p('■ 役割: 相手エースを奪い取る道化師。盤面を「奪う」エース'),
    p('■ 準備: ツバキ/カゲロウのswap+回転で敵エースをジョーカーの正面に捉える'),
    p('■ 5マス貢献: 相手エースのATK奪取→死角洗脳で行動封じ→返しの脅威を消して5マス維持'),
    p('■ 混色: ×コントロール=リンの回転で向きを崩す→正面に捉えて奪取。×スナイプ=奪取+回転→シャドウが死角から殴る'),
  ];
}

function buildSection11() {
  return [
    h1('■11. 調整方針'),
    simpleTable(
      ['項目', '方針'],
      [
        ['強いカードの許容', 'エースは明確に強くてよい。低コストは条件付きで光る方向'],
        ['理不尽さの許容', 'エース由来の理不尽は許容。ただし事前準備・盤面条件・混色接続の結果として成立するものに限る'],
        ['低コスト(1-2)', '1仕事。エースの準備・橋渡し・犠牲。盤面条件に関わる仕事を持たせる'],
        ['3コスト', '中継ぎ。2仕事まで。エースの勝ち筋を食わない'],
        ['エース(5-6)', '明確な決定力。「出たら試合が動く」。低〜中コストが整えた状況を勝利へ変換する'],
      ],
      [2800, 7560]
    ),
    emptyLine(),
    h2('エースの勝ち方の差別化'),
    simpleTable(
      ['カテゴリ', 'エース', '勝ち方'],
      [
        ['盤面を「広げる」', 'セラ, カイザー', '撃破+追加召喚 / 撃破+push'],
        ['盤面を「守る」', 'ルミナ, ナギサ', '不死身で守り切る / ATK-2で萎縮させる'],
        ['盤面を「止める」', 'カラン, ミスズ', '凍結で動けなくする / 全敵洗脳でスキップ'],
        ['盤面を「立て直す」', 'アルス', '犠牲→高ATK+全体回復+隣接バフ'],
        ['盤面を「削る」', 'イグニス, ゼクス', '連鎖狙撃でデバフ / 条件火力で虚マス増殖'],
        ['盤面を「奪う」', 'ジョーカー', 'ATK奪取+死角洗脳'],
      ],
      [2400, 2800, 5160]
    ),
  ];
}

function buildSection12() {
  return [
    h1('■12. レビュー優先度'),
    simpleTable(
      ['優先度', '項目'],
      [
        ['1', '混色相性'],
        ['2', '勝ち筋コンボの鮮明さ'],
        ['3', 'エースの顔（個性・決定力）'],
        ['4', '陣営内の役割分担'],
        ['5', 'カード単体バランス'],
        ['6', 'キーワード整理'],
        ['7', '数値調整'],
        ['8', '文章の読みやすさ'],
      ],
      [1500, 8860]
    ),
  ];
}

// ========================================
// Build document
// ========================================
async function main() {
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: 'Meiryo', size: 20 } },
      },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 32, bold: true, font: 'Meiryo' },
          paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 26, bold: true, font: 'Meiryo' },
          paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 22, bold: true, font: 'Meiryo' },
          paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ text: '異能学園総選挙 — ゲームルール＆デザイン基盤', font: 'Meiryo', size: 16, color: '95A5A6' })],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: 'Page ', font: 'Meiryo', size: 16, color: '95A5A6' }),
              new TextRun({ children: [PageNumber.CURRENT], font: 'Meiryo', size: 16, color: '95A5A6' }),
            ],
          })],
        }),
      },
      children: [
        ...buildTitlePage(),
        ...buildSection1(),
        new Paragraph({ children: [new PageBreak()] }),
        ...buildSection2(),
        ...buildSection3(),
        new Paragraph({ children: [new PageBreak()] }),
        ...buildSection4(),
        ...buildSection5(),
        new Paragraph({ children: [new PageBreak()] }),
        ...buildSection6(),
        ...buildSection7(),
        new Paragraph({ children: [new PageBreak()] }),
        ...buildSection8(),
        new Paragraph({ children: [new PageBreak()] }),
        ...buildSection9(),
        new Paragraph({ children: [new PageBreak()] }),
        ...buildSection10(),
        new Paragraph({ children: [new PageBreak()] }),
        ...buildSection11(),
        ...buildSection12(),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  const outPath = 'docs/game-rules-design.docx';
  fs.writeFileSync(outPath, buffer);
  console.log(`Generated: ${outPath}`);
}

main().catch(console.error);
