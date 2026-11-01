# sim2 — 8/28ルール対応シミュレーションエンジン 設計書

Status: 設計確定(実装待ち)
Date: 2026-08-30
設計: Fable / 実装: Opus
ルールの正: [`../docs/rules-current-2026-08-28.md`](../docs/rules-current-2026-08-28.md)

---

## 0. 目的

2026-08-28ルール改訂第1弾を実装した**新規の自己対戦シミュレータ**を作る。9/5の人間テストの前に、事前登録した予測(決着内訳・チップ差と決着種別の相関・盤面成長率)を機械で先に測るための道具。

**旧シミュ(`scripts/explore-stat-curves.cjs`)や正本(`C:/Projects/3x3_duel`)の改修ではない。** ルールが根本から変わったため、新規に小さく作るほうが速くて安全。

## 1. 技術方針

| 項目 | 決定 |
|---|---|
| 言語 | TypeScript(**erasable syntaxのみ**: enum/namespace/デコレータ禁止、import は `.ts` 拡張子付き) |
| 実行 | `node --experimental-strip-types`(ビルド不要。正本と同じ方式で、このマシンで動作確認済み) |
| 依存 | **ゼロ**。テストは `node:test` + `node:assert` |
| 乱数 | シード付き(mulberry32)。同じシードから同じ試合が再現されること |
| 配置場所 | `sim2/` 以下で完結。既存の `scripts/` `docs/` に触らない(本書と実装レポートを除く) |

```
sim2/
  DESIGN.md            (本書)
  src/
    rng.ts             シード付き乱数
    types.ts           型定義すべて
    cards.ts           カードデータの読み込み・検証
    board.ts           盤面幾何(座標・回転・範囲セル・死角セル・属性)
    state.ts           GameState 生成・clone
    rules.ts           合法手列挙・コスト計算・チップ・リーチ・勝利判定
    combat.ts          攻撃解決(単体/範囲・死角・反撃・撃破・還付)
    turn.ts            ターン進行(開始/メイン/終了)
    ai/eval.ts         盤面評価関数
    ai/greedy.ts       貪欲AI(1手ずつΔ評価)
    ai/beam.ts         ターン内ビームサーチAI
    metrics.ts         試合ログ→KPI集計
    runner.ts          N試合実行
    cli.ts             コマンドライン
  data/
    pack-placeholder22.json
  test/
    *.test.ts
  out/                 (生成物。gitignore)
```

## 2. データモデル

```ts
type Attr = "yin" | "yang" | "none";          // none = 空・太極
type PlayerId = 0 | 1;
type Facing = 0 | 1 | 2 | 3;                  // 0=北(相対座標+yが前)。90度単位
type Pos = { x: number; y: number };          // 0..2

type CardDef = {
  id: string;
  name: string;
  summonCost: number;        // HP由来。2..7
  attackCost: number;        // ATK由来。1..4
  atk: number;
  hp: number;                // 基礎HP
  lifeValue: number;         // 生命価
  attribute: Attr;           // yin | yang
  attackRange: Pos[];        // 前方=+y の相対セル
  blindSpots: Pos[];         // 同上
  aoe: boolean;              // true=範囲内すべてに命中(味方含む) / false=範囲内の敵1体を選択
};

type Unit = {
  uid: number;
  cardId: string;
  owner: PlayerId;
  pos: Pos;
  facing: Facing;
  damage: number;            // 受けた累積ダメージ。実効HP = min(MAX_HP, hp + attrMod) - damage
  attackedThisTurn: boolean;
  rotatedThisTurn: boolean;
};

type PlayerState = {
  life: number;
  mana: number;
  chips: number;
  deck: string[];            // cardId列。先頭から引く
  hand: string[];
  grave: string[];
  reach: boolean;            // 前の自ターン終了時に5マス以上だったか
};

type GameState = {
  units: Unit[];
  players: [PlayerState, PlayerState];
  turnPlayer: PlayerId;
  round: number;             // 両者1手番で1ラウンド
  rngState: number;
  winner: PlayerId | null;
  winType: "control" | "life" | "turn_limit" | null;
};

type Config = {
  chipMode: "one_per_turn" | "catch_up";   // ★未決の裁定。両方実装しCLIで切替
  startLife: number;          // 15
  startMana: [number, number]; // [3, 4]
  baseIncome: number;         // 3
  chipIncomeSteps: number[];  // [3, 4] = 3枚目で+1、4枚目で+1
  manaCap: number;            // 15
  handRefill: number;         // 5
  maxHp: number;              // 10
  blindBonus: number;         // 2
  attrBonus: number;          // 2
  taijiDiscount: number;      // 2
  taijiFloor: number;         // 1
  rotateCost: number;         // 1
  controlWin: number;         // 5
  roundLimit: number;         // 40
};
```

### 属性修正の扱い

移動効果が無いv1では、属性修正は**位置が決まった時点の定数**。実効最大HP = `min(MAX_HP, hp + attrMod(pos, attribute))`、attrMod = 同属性+2 / 対立−2 / それ以外0。太極(中央)と空(四隅)は0。撃破判定は `実効最大HP - damage <= 0`。

### 盤面属性(固定)

```
(0,2)空  (1,2)陰  (2,2)空
(0,1)陰  (1,1)太極 (2,1)陽
(0,0)空  (1,0)陽  (2,0)空
```

## 3. ルール実装マッピング

### 3.1 コスト

| 行為 | コスト |
|---|---|
| 召喚 | `summonCost`。太極(1,1)なら `max(taijiFloor, summonCost - taijiDiscount)` |
| 攻撃(召喚攻撃・再攻撃とも) | `attackCost` |
| 回転(90度) | `rotateCost` = 1 |

### 3.2 召喚

- 回数無制限。メインフェイズ中いつでも
- **配置自由**(隣接制約なし)。向き自由
- 禁止: 対象マスに既にユニットがいる / 盤面9体で満杯 / **実効最大HPが0以下になるマス**(召2のHP2を対立属性に置くと0 → 禁止)
- 召喚攻撃: 召喚直後、攻撃範囲に敵がいれば `attackCost` を払って攻撃**できる**(任意)。これはそのユニットの「ターン中の攻撃1回」を**消費する**

### 3.3 ユニットの行動制限

- 1ターンに攻撃1回・回転1回まで
- **攻撃した時点でそのユニットの行動終了**(`attackedThisTurn=true` のユニットは回転不可)
- 回転→攻撃は可。召喚ターンの回転も可(無意味だが合法)

### 3.4 戦闘解決(1回の攻撃)

1. 攻撃コスト支払い
2. 対象決定: 単体= 範囲内の敵1体を選択(味方は選べない) / AoE= **範囲内の全ユニット(敵味方とも)**
3. 各対象へのダメージ = `atk + (攻撃者が対象の死角セルに立っていれば blindBonus)`。**死角は対象ごとに個別判定**
4. 全ダメージを同時適用 → 撃破判定を同時解決(撃破: 持ち主が `lifeValue` 失う + `floor(summonCost/2)` 霊力獲得、盤面から墓地へ)
5. **反撃**: 生存している**敵**対象のうち、(a)死角から撃たれておらず (b)攻撃者が自分の攻撃範囲内にいる ものは、攻撃者に `atk` ダメージ(無償・死角ボーナスなし・反撃への反撃なし)。複数対象からの反撃は合算して同時適用 → 攻撃者の撃破判定
6. 味方に当たった分は反撃を発生させない
7. 生命が0以下になったプレイヤーがいれば即座に敗北(両者同時なら手番側の勝ち — 裁定フラグ、デフォルトはこれ)

### 3.5 ターン進行

```
startTurn(p):
  1. リーチ勝利判定: players[p].reach && occupied(p) >= 5 → control勝ち
  2. 収入: mana = min(manaCap, mana + baseIncome + chipBonus(chips))
mainPhase(p): AIがアクション列を実行(summon/attack/rotate/pass)
endTurn(p):
  1. チップ獲得:
     one_per_turn: occupied(p) > chips なら chips += 1
     catch_up:     chips = max(chips, occupied(p))
  2. リーチ更新: players[p].reach = occupied(p) >= controlWin
  3. 手札整理: 任意枚数捨てる → handRefill枚まで引く(デッキ切れ時は墓地シャッフル)
  4. round更新(後手の終了時に+1)、手番交代
```

`chipBonus(chips)` = chipIncomeSteps のうち chips 以上の要素数(chips>=3で+1、>=4で+2)。

### 3.6 確定裁定リスト(実装で迷わないための決定)

| # | 論点 | 採用 | 根拠 |
|---|---|---|---|
| R1 | チップは1枚/ターンか占拠数まで追いつくか | **裁定確定(2026-08-30): `catch_up` が正**(占拠数まで複数枚まとめて獲得)。デフォルトを catch_up にする。one_per_turn も比較用に残す | チーム確認済み |
| R2 | リーチ勝利の判定 | 次の自ターン**開始時の状態**が5以上(途中で割られて戻った場合も勝ち) | 「維持していれば」の最簡解釈 |
| R3 | 召喚攻撃は攻撃1回を消費するか | **する** | 「各式神は攻撃1回」に一本化された |
| R4 | 反撃範囲 | 攻撃範囲と同一 | 分離は第2弾に見送り済み |
| R5 | 反撃の死角ボーナス | **なし** | 反撃は位置選択を伴わない |
| R6 | AoEで味方に当たった場合 | ダメージあり・反撃なし・撃破時は生命価/還付とも通常どおり自分に発生 | |
| R7 | 霊力上限 | 15(旧ルール据え置き。8/28に言及なし) | configで変更可 |
| R8 | 両者の生命が同時に0 | 手番側の勝ち | 暫定。configフラグ化 |
| R9 | 手札上限 | なし(引くのは5枚まで補充のみ) | ⑧ |

## 4. カードデータ(placeholder22)

**実デッキ(鬼一門・付喪神一門)は未入手のため、コスト表の帯から合成した仮デッキ。** 効果なし。目的はルール層のKPI測定であり、カードバランスの測定ではない。

| 枚数 | summonCost | attackCost | HP/ATK | lifeValue | 範囲 | 死角 | aoe |
|---:|---:|---:|---|---:|---|---|---|
| 6 | 2 | 1 | 2/1 | 1 | 前1 | 後1 | no |
| 6 | 3 | 2 | 3/2 | 1 | 前1 | 後1 | no |
| 3 | 4 | 2 | 5/2 | 1 | 前1 | 後1 | no |
| 2 | 4 | 2 | 5/2 | 1 | 前1+前2(槍型) | 左右 | no |
| 2 | 5 | 3 | 6/3 | 3 | 前1 | 後1 | no |
| 1 | 5 | 3 | 6/3 | 3 | 前+左右3マス | 後1 | **yes** |
| 1 | 6 | 3 | 7/3 | 3 | 前1+斜め前2+左右(5マス) | 後1 | **yes** |
| 1 | 7 | 4 | 8/4 | 4 | 前1+前2+左右(4マス) | 後1 | no |

計22枚。属性は陰11/陽11を機械的に交互割当。範囲セルは前=+y の相対座標で `data/pack-placeholder22.json` に記述する。

## 5. AI設計

分岐爆発(複数召喚×自由配置×向き4)への対策として、**ターンをアトミックアクションの逐次選択**として扱う。

### 5.1 評価関数(`ai/eval.ts`)

手番側から見たスカラー。重みは定数オブジェクトで公開(後で調整可能に)。

```
eval(s, p) =
  + W.occ    * (occupied(p) - occupied(o))
  + W.chip   * (chips(p) - chips(o))
  + W.life   * (life(p) - life(o))
  + W.boardHp* (盤上実効HP合計(p) - 同(o))
  + W.reach  * (自分が5マス以上なら大ボーナス、相手なら大ペナルティ)
  + W.threat * (次の相手手番で失いうるHPの近似ペナルティ)
初期値: W = { occ: 30, chip: 12, life: 8, boardHp: 3, reach: 200, threat: 2 }
```

### 5.2 greedy(浅い方)

メインフェイズ中、全合法アトミックアクション(召喚は カード×空マス×向き4、攻撃はユニット×対象、回転はユニット×左右)を列挙し、**適用後のevalが最大**のものを実行。改善が閾値未満ならpass。手札整理は「召喚コストが(現在霊力+次収入)を超えるカードのうち評価の低いものを捨てる」程度の単純則。

### 5.3 beam(深い方)

ターン内ビームサーチ: 状態×アクション列をビーム幅8で展開し、pass到達状態を「eval − 相手の最善greedy応手1手分の損失」で評価。最良列を実行する。**深さは霊力が尽きるまで**(アクション数の上限12で保険)。

greedy vs beam の自己対戦・相互対戦が、「決着種別はプレイヤーの読み深度の関数」仮説の検証装置になる。

## 6. メトリクス(`metrics.ts`)

試合ごとに記録 → 集計してJSON出力。**チームの測定項目表に1対1対応させる。**

| 記録 | 対応する測定項目 |
|---|---|
| 勝者・決着種別・決着ラウンド | 決着ラウンド数と内訳 |
| 毎ラウンドの両者占拠数 | 占拠差の推移・逆転(差2以上開いた後に縮んだ/裏返った回数) |
| 毎ラウンドの両者チップ数、各チップの獲得ラウンド | チップ取得タイミング |
| **最終チップ差 × 決着種別** | ★事前登録予測「チップ差がつくと制圧、並ぶと生命」の検証 |
| 召喚数・被撃破数/ターン | ネット盤面成長率(目標+0.7〜0.8) |
| 死角攻撃回数・反撃回数・AoEの敵/味方ヒット数 | 範囲攻撃の実効値 |
| T1終了時の両者体数、太極召喚回数 | 太極下限1の検証 |
| リーチ宣言回数・返された回数・通った回数 | リーチ攻防 |
| 霊力使途内訳(召喚/攻撃/回転) | 経済の流れ先 |
| 先手勝率 | 危険信号(旧実測55%) |

出力: `out/<name>-results.json`(集計) + `out/<name>-games.jsonl`(1行1試合、任意)。

## 7. CLI

```
node --experimental-strip-types sim2/src/cli.ts selfplay \
  --games 500 --seed 20260830 --ai greedy,greedy \
  --chip-mode one_per_turn --round-limit 40 --out sim2/out/base.json
```

- `--ai a,b`: 先手,後手のAI(greedy|beam)。4組(greedy/greedy, beam/beam, greedy/beam, beam/greedy)を回すシェル例をREADMEに書く
- `--chip-mode`: one_per_turn | catch_up
- 進捗は50試合ごとにstderr

## 8. 受け入れテスト(全部 `node:test`。これが仕様の最終定義)

1. コスト表: 各帯の召喚/攻撃/回転コストが§4どおり
2. 太極: 召2→1、召3→1、召4→2(−2と下限1)
3. 通常マス召喚で属性修正: 陽カードを陽マスに置くと実効最大HP=hp+2(cap 10)
4. **実効最大HPが0以下になるマスへの召喚が非合法**(HP2の陰カードを陽マスに置く=対立−2→0→禁止)
5. 盤面9体で召喚不可
6. 召喚攻撃: 任意・attackCost支払い・攻撃1回を消費(その後の再攻撃不可)
7. 攻撃→回転が非合法、回転→攻撃が合法
8. 回転は1ターン1回(2回目が非合法)
9. 死角: 攻撃者が対象の死角セルにいるとき+2、反撃なし
10. 死角でないとき: 攻撃者が対象の攻撃範囲内なら反撃(素のATK、同時適用)
11. 撃破されたユニットは反撃しない(致死ダメージ→反撃発生せず)
12. AoE: 範囲内の敵味方全員に命中、死角は対象ごと個別、味方は反撃しない
13. 撃破: 持ち主が lifeValue 失う + floor(summonCost/2) 霊力獲得
14. チップ one_per_turn: 占拠3で終了しても+1枚のみ
15. チップ catch_up: 占拠3で終了すると一気に3枚
16. チップは占拠が減っても減らない
17. 収入: chips=3で4、chips=4で5、それ以上増えない
18. リーチ→維持→次自ターン開始時に勝利
19. リーチ→相手に4マス以下へ崩される→開始時勝利せず、次の自ターン終了時にreach再判定
20. 手札整理: 捨てる→5枚まで引く。デッキ切れで墓地シャッフル
21. 生命0で即敗北(相手手番中でも)
22. 同一シード2回実行で全ログが一致(決定性)

## 9. 実装順序

| 段階 | 内容 | 完了条件 |
|---|---|---|
| P0 | rng/types/board/cards/state | boardの範囲・死角・属性のユニットテスト通過 |
| P1 | rules/combat/turn + テスト1〜21 | **全受け入れテスト green** |
| P2 | eval/greedy/runner/metrics/cli | `--games 20` が完走し、集計JSONに§6の全項目が出る |
| P3 | beam + chip-mode比較 | greedy vs beam 各50試合 × chipMode 2種 = 4条件のスモーク結果を `sim2/RESULTS-SMOKE.md` に表で残す |

P3まで終わったら、実測の解釈は設計側で引き取る(実装側は数値の考察を書かなくてよい)。

## 10. 非スコープ(v1でやらないこと)

- カード効果(再生・透明化などのDSL) — 構造上 `CardDef` に効果フィールドを足せる余地だけ残す
- 実デッキ(鬼・付喪神)のデータ入力 — JSON差し替えで対応できる形にする
- 正本エンジン(`C:/Projects/3x3_duel`)への統合・変更 — **触らない**
- 術式レイヤー — ルール確定後にv2
- 並列ワーカー — 500試合程度なら単スレで足りる想定。遅ければ後付け
