# sim2

2026-08-28 ルール改訂第1弾を実装した自己対戦シミュレータ。
仕様は [`DESIGN.md`](./DESIGN.md)、ルールの正本は [`../docs/rules-current-2026-08-28.md`](../docs/rules-current-2026-08-28.md)。

- TypeScript / 外部依存ゼロ / ビルド不要(`node --experimental-strip-types`)
- 乱数はシード付き mulberry32 のみ。同じシードは同じ試合になる

## テスト

```bash
node --experimental-strip-types --test sim2/test/*.test.ts
```

グロブが効かない環境ではファイルを列挙する:

```bash
node --experimental-strip-types --test \
  sim2/test/board.test.ts \
  sim2/test/acceptance-combat.test.ts \
  sim2/test/acceptance-turn.test.ts \
  sim2/test/carddata.test.ts \
  sim2/test/runner.test.ts \
  sim2/test/effects.test.ts \
  sim2/test/play.test.ts \
  sim2/test/exp0913.test.ts \
  sim2/test/exp0913b.test.ts \
  sim2/test/online-view.test.ts \
  sim2/test/online-server.test.ts
```

## 自己対戦

```bash
node --experimental-strip-types sim2/src/cli.ts selfplay \
  --games 500 --seed 20260830 --ai greedy,greedy \
  --pack tsukumo-miyako --chip-mode catch_up \
  --round-limit 40 --out sim2/out/base.json
```

オプションは `node --experimental-strip-types sim2/src/cli.ts help`。
`--preset r0914`(現行ルール = 9/13テストルール + チップ3/4/5枚で収入+1/+2/+3)/
`--preset r0913`(9/13テストルール = EXP-0913B K0)/ `--preset r0828`(8/28ルール = K8ts)で
ルール一式を土台にでき、個別フラグはその上に上書きされる。
**どのプリセットも太極の軽減は1**(チームの基本)。実験 K0/K8ts は2で回したが、実験スクリプトはプリセットを使わず
個別フラグで条件を作るので再現には影響しない。プリセットを使わないときのエンジン既定値は8/28仕様どおり2。
r0913 / r0914 では**術式・範囲の攻撃は味方に当たらない**(9/13の手順。`--jutsu-aoe-spares-allies`、エンジン既定値はオフ)。
shuten-kyuryu に術式・範囲のカードはないので K0 の結果は変わらない(該当は tsukumo-miyako の玖龍街 tm17 のみ)。

### 4条件を回す

```bash
for ai in greedy beam; do
  for cm in catch_up one_per_turn; do
    node --experimental-strip-types sim2/src/cli.ts selfplay \
      --games 500 --seed 20260830 --pack tsukumo-miyako \
      --ai "$ai,$ai" --chip-mode "$cm" \
      --out "sim2/out/$ai-$cm.json"
  done
done
```

AIの読み深度差を見るなら `--ai greedy,beam` / `--ai beam,greedy` を追加。

### 評価プロファイル

`--eval <p0>,<p1>` で方策の型を切り替える(既定 `territorial,territorial`)。

| profile | 特徴 |
|---|---|
| `territorial` | 占拠最優先(occ 30 / life 8)。設計書§5.1の初期値 |
| `aggressive` | 撃破・生命削り優先(occ 12 / life 40) |
| `balanced` | 中間(occ 20 / life 20) |

結果は [`RESULTS-EVAL.md`](./RESULTS-EVAL.md)。

### ルールバリエーション(EXP-0913)

`--summon-limit` `--aoe-mode` `--counter-mode` `--attack-cost-delta` `--refund-mode`
`--summon-cost-scale` `--move-on-kill` `--life-value` `--deck-out-mode` `--income-timing`
`--base-income` でルールを差し替えられる。**既定値はいずれも改訂前の挙動と完全一致**する。
一覧は `cli.ts help`、実験メニューは `scripts/exp0913.sh`、結果は
[`RESULTS-EXP0913.md`](./RESULTS-EXP0913.md)。

### 9/13テストルール(EXP-0913B)

`--refund-mode killer_half` `--inherit-summon on` `--counter-mode gap` `--mulligan on`
`--control-hold next_turn_end` `--hand-mode replace_discarded` を追加。**既定値はいずれも従来挙動と完全一致**する。
仕様は [`EXP-0913B.md`](./EXP-0913B.md)、実験メニューは `scripts/exp0913b.sh`(最後に
`scripts/exp0913b-report.ts` が結果文書を再生成)、結果は [`RESULTS-EXP0913B.md`](./RESULTS-EXP0913B.md)。

## 採用ルール 9/22(既定)

新しい部屋・対AI・設定ページの既定は **採用ルール 9/22(`r0923`)+ パック `adopted-0922`**。
それまでの基準ルール(9/14ルール=旧・現行 `r0914`、9/13テストルール `r0913`、8/28ルール `r0828`)とパックはすべて選べる。
カードと効果・裁定の正本は [`EFFECTS-SPEC.md`](./EFFECTS-SPEC.md) §5、元データは `out/adopted-0922-spec.json`。

- 初期霊力 先手6/後手8、毎ターン収入6 → ラチェット2段で7 → 8、太極−1、属性±2、死角+2、最大HP15、霊力上限15
- **生命価なし**: 撃破した側が、その札の**霊力価**(カードの新しい数値 `manaValue`。カード編集の「霊」列)を得る。生命の増減・生命勝ちはない
- **隙なし・案A**: 反撃範囲に入っている被弾者は全員反撃し、1体ずつ、**反撃する側が選んだ順**に解決する。攻撃側が撃破されたら残りは反撃しない。
  順番で結果が変わるとき(いまは僵尸公主を含む2体以上の反撃が撃破するとき)だけ、反撃する側に順番の確認が出る(`flow` の `counterOrder` 段階・入力 `{ "type": "counterOrder", "order": [...] }`、棋譜に残り再生で再現)
- 新しい攻撃の種類: 茨木童子【再生】(+霊力1で攻撃後HP+1)・酒呑童子【飲酒】(+霊力2でATK+1)。新しい霊具: 茨木の左腕(拳/握)・閻魔獄卒棒

**ラチェットの段**: 占拠チップ3枚で収入7、4枚で8(`chipIncomeSteps [3, 4]`、9/23 決定。最初の仮置きは `[4, 5]` だった)。
変えるには `/rules` の「霊力の出入り(主要)」→「収入が増える占拠チップ数」に並びを入れる(例 `4,5` なら4枚で7・5枚で8、`3,4,5` なら3段)。
対局中でも変えられる(対AIは「ルール・カードを変える」、部屋では作った人の「ルール・カード変更を提案」→相手が同意した次の操作から)。
同じ場所で「複数の反撃の解決」(1体ずつ・反撃側が順番を選ぶ / まとめて同時に)、「撃破報酬の額」(カードの霊力価 / 半額…)、「生命価」も切り替えられる。

```bash
# 採用ルールの自己対戦(バランス検証用)
node --experimental-strip-types sim2/src/cli.ts selfplay --preset r0923 --pack adopted-0922 --ai strong,strong --games 200 --seed 20260923 --out sim2/out/adopted/sim-strong.json
#   --counter-resolve sum|chosen   --kill-reward-base half_floor|half_ceil|full|zero|card   で比較もできる
```

## 対戦UI(ブラウザ)

```bash
node --experimental-strip-types sim2/play/server.ts          # 既定ポート 8787
node --experimental-strip-types sim2/play/server.ts --port 9000
```

ブラウザで `http://localhost:8787/` を開く。ビルド不要・依存ゼロ(見出しと本文の書体だけ Google Fonts を `<link>` で読む。読めなくても明朝/ゴシックの代替で崩れない)。
サーバは `.ts` を返すときに `node:module` の `stripTypeScriptTypes()` で型だけを剥がすため、
**ブラウザは `src/` のエンジンモジュールをそのまま読み込む**(ルール実装の複製はしていない)。

画面の設計は [`DESIGN-UI-V2.md`](./DESIGN-UI-V2.md)(夜の卓上・漆塗りの九宮盤・墨と金の札)。

- 開始時は小さな「対局の準備」: 自分の席・AI・AIの方針・シードと、今のルールの「+N項目変更」。
  「ルールとカードを編集」で**設定ページ `/rules`** に移り、基準ルール(採用ルール 9/22 = 既定 / 9/14ルール(旧・現行)/ 9/13テストルール / 8/28ルール)・パック(ミラー。基準ルールを替えると、そのルールの既定パックを使っていればパックも替わる)、
  **ルールの変数(`CONFIG_SCHEMA` の全項目。先頭の「霊力の出入り」に収入・チップの段・攻撃コスト・撃破報酬)**と
  **カード(召喚コスト・攻撃コスト・HP・ATK・生命価・霊力価・属性・物理/術式・範囲/単体・攻撃範囲・死角・隙)**を決めて戻る
  (見出しの「調整案」から、チームの調整案をまとめて反映することもできる。下の「組み込みの調整案」)
- 設定ページは URL で開き方が決まる: `/rules?s=…`(単独。「この設定で対AI」「この設定で部屋を作る」)・`?for=ai`(対局の準備から)・
  `?for=lobby`(ロビーから)・`?for=ai-game`(対AIの対局中の変更)・`?for=room&code=XXXXXX`(部屋を作った人の提案)。
  「戻る」は変更せずに元の画面へ。ブラウザの戻るも使える
- 対AIの対局は入力のたびにブラウザに保存し(`sessionStorage` と `localStorage`、`play/ai-store.ts`)、開き直すと入力を再生して同じ局面に戻る。
  設定ページから戻ったとき・再読み込みでは続きから再開。別のタブや開き直したブラウザでは「対局の準備」に「続きから」が出る(終わった対局は出ない)
- カードは表のチェックで選んで**まとめて変更**(±1・値をそろえる・攻撃範囲のコピー・印刷どおりに戻す。
  「式神」「陰」「変更したカード」などで一括選択)。表の名前を押すと、5×5のマスを塗って攻撃範囲・死角・隙を編集できる
- 札には攻撃範囲の図(緑=攻撃範囲、赤×=死角、黄の斜線=隙、中央の▲=前)。盤上の札は駒の向きに回る。霊具は手札の札に効果文
- 手札の札を選ぶと置けるマスが光り、継承できる自分の駒は紫の破線。マスを選ぶと盤上の矢印で向きを選ぶ
- 自分の駒を選ぶと丸いメニュー(攻撃・渾身・再生・飲酒・回復・回転左右・代理回転。再生・飲酒は追加の霊力込みのコスト)。使えない命令は暗く、理由をツールチップで表示
  (「霊力が足りない(あと1)」「攻撃済み」「玖龍街により回転不可」など。理由と可否はエンジンの `src/commands.ts` が出す)
- 攻撃対象を選ぶと、**与ダメージ・撃破・死角・反撃を盤上に重ねて表示**してから確定。範囲攻撃は対象選択なしで予測を表示
- 選択中の駒の攻撃範囲(緑の実線)・死角(赤の破線)・隙位置(橙の斜線「隙」)
- 演出(召喚・継承召喚・攻撃・死角・反撃・撃破・霊力増減・チップ・回転・手番交代・制圧・決着・マリガン)は
  エンジンのイベント列から作る。AIの手は1手ずつ演出が終わってから次を見せる。自分の操作は待たされない。
  OSの「視差効果を減らす」(`prefers-reduced-motion`)では演出を全部止める
- キーボード: `Esc` 選択解除 / `Enter` ターン終了の確認(もう一度 `Enter` で終了) / `Z` 直前の選択に戻る
- 上部の「現行ルール +3項目変更」を押すと基準からの差分。「ルール・カードを変える」(設定ページ)で**対局中にルールの変数とカードを変更**
  (次の操作から有効。盤上の式神にもすぐ反映。初期霊力・初期生命・マリガンだけは次の対局から)
- 1280px 基準。1024px では右の列(札の詳細・記録)を盤の下に回し、手札の列を画面下に固定する

進行はオンライン対戦と同じ状態機械(`src/flow.ts`)で動き、描画は `play/table.ts` ほかの共通部品を共有する。

## その場で変えられる変数

変数の一覧・日本語名・説明・範囲は `src/config-schema.ts` の `CONFIG_SCHEMA` が唯一の定義で、
CLI の `help`・対戦画面・ロビー・対戦室の設定パネルとサーバーの検証がすべてこれを読む(`node --experimental-strip-types sim2/src/cli.ts help`)。
`boardCells`(盤は3×3固定)と `maxActionsPerTurn`(AIの安全上限)はルールの変数ではないので含めない。

| いつ | ルールの変数 | カード(数値・攻撃範囲など) | 誰が |
|---|---|---|---|
| 部屋を作るとき(ロビー) | ○ | ○ | 部屋を作った人 |
| 試合と試合の間 | ○ | ○ | 部屋を作った人が提案 → 相手が同意すると次の試合から |
| 試合の途中 | ○(初期霊力・初期生命・マリガンを除く) | ○ | 部屋を作った人が提案 → 相手の同意で即反映。記録に「ルール変更: 毎ターン収入 3→4」「カード変更: 影鬼のATK 2→3」 |
| ローカルのAI対戦 | いつでも○ | いつでも○ | 自分 |

- 途中変更は**次の操作から有効**。最大HP・属性ボーナスが変わったら、実効最大HPが下がった駒は現在HPを上限で切り、上がった駒は現在HPを増やさない。
  変更で駒が撃破されることはない(現在HPは1以上に保つ)。霊力上限が下がったら霊力も上限で切る
- 途中変更は棋譜の入力(`{"type":"config","patch":...}` / `{"type":"cards","edits":...}`)として記録され、再生すると同じ結果になる。
  カードの途中変更は盤上の式神にもその場で効く(HPは最大HPの変更と同じ扱い: 下がれば切り、上がっても回復しない、撃破はしない)
- カードの変更はパックを複製して値を差し替えたものを試合に使う(読み込んだパックJSONは変更しない)。
  攻撃範囲を変えたカードは、反撃範囲も新しい攻撃範囲になる(反撃範囲を別に持つカードを除く)。
  攻撃範囲と死角は同じマスにできず、範囲攻撃の隙は攻撃範囲のマスに置く(サーバーも同じ検証をする)
- 撃破報酬 = 「撃破報酬の額」(半額・切り捨て / 半額・切り上げ / 全額 / なし / カードの霊力価)+「撃破報酬の加算」(0未満にはならない)。
  受け取る側は「撃破報酬を受け取る側」
- 設定は名前を付けてブラウザに保存でき、**共有URL**(`?s=` に基準からの差分だけを埋め込む)で「この設定で遊んで」と送れる。
  ロビー・対戦画面・設定ページがこの形式を読む(対局の準備で作った共有URLは `/ai?s=`、それ以外は設定ページ `/rules?s=`)
- パックに `"clan": "酒呑"` などを書くと札の地模様が一門別になる(`adopted-0922` は一門つき。一門の情報がないパックは式神=波・霊具=格子)

### 組み込みの調整案(設定のまとまり)

チームの調整案は `src/setting-presets.ts` に **基準ルール + ルールの差分 + カードの差分** の3点セットで持っている。
設定ページ `/rules` の見出しにある「調整案」から選ぶと、ルールとカードがまとめてその案の値になる
(手で入力したのとまったく同じ扱い: 「+N項目変更」に数えられ、共有URLにも乗り、試合の途中なら変えられる項目だけが反映される)。
選んだあとに1項目でも触ると、表示は「(なし)」に戻る。

| id | 名前 | 基準 | パック | 内容 |
|---|---|---|---|---|
| `adj15` | 調整案1.5倍 | 現行ルール(r0914) | shuten-kyuryu | 9/15「デッキ(一門)設計」シートの調整タブ(霊力1.5倍・能力1.5倍)。攻撃コスト=ATKの50%(四捨五入)、属性効果±3、初期霊力6/8、毎ターン収入6から、太極−1、最大HP15(シートに無いがチーム判断: 現行の10だと茨木11+3・酒呑12+3・玖龍街15が頭打ちになるため)。sk01〜sk17の召喚コスト・攻撃コスト・HP・ATK・生命価を差し替え(霊具の使用コストは据え置き)。差分は **ルール4項目 + カード50項目** |

| `adj15life` | 調整案1.5倍+生命22 | 現行ルール(r0914) | shuten-kyuryu | `adj15` と同じ数値で、シートが据え置いた**初期生命を15→22**(1.5倍)にした版。AI検証(2026-09-21、各条件2000試合)では、強いAI同士で 制圧勝ち/生命勝ち が 39.5/60.5% → **61.1/38.9%**(現行ルールは68.4/31.7%)に戻り、試合が 9.5→11.0ラウンドに伸びる副次効果で 茨木38.0→49.8% / 酒呑13.9→22.2% / 玖龍街6.1→11.4% と大型が盤に出るようになる。霊力上限は同じ検証で一度も制約になっていなかったので15のまま。差分は **ルール5項目 + カード50項目** |

調整案は**新しい基準ルールではない**。`RULE_PRESETS` のどれかを基準にした差分として持つので、
現行ルールそのものは動かず、共有URL・差分バッジ・試合中の提案がそのまま使える。

足すには:

1. `src/setting-presets.ts` の `SETTING_PRESET_IDS` に id を足し、`SETTING_PRESETS` に
   `{ id, label(日本語名), note(由来と要点), rule, pack, config, cards }` を書く。
   `config` のキーは `CONFIG_SCHEMA`、`cards` のキーはパックのカードidで、モジュールの読み込み時に検証される(不正ならその場で例外)
2. 基準ルールと同じ値・印刷どおりの値も書いてよい(差分からは自動で落ちる)。シートの表をそのまま残せる
3. `test/setting-presets.test.ts` に数値の突き合わせを足す(パックに通る・試合が動く・共有URLが往復する)

adj15 で表現していないもの: 鎖鬼の反撃範囲123、僵尸公主→玖龍公主の改名、収入のラチェットを2段にする案。

## オンライン対戦(人間どうし)

設計は [`DESIGN-ONLINE.md`](./DESIGN-ONLINE.md)。サーバーが唯一のゲーム状態を持ち、ブラウザには
**そのプレイヤーから見える情報だけ**を送る(相手の手札は枚数のみ、山札は枚数のみ、乱数状態とシードは送らない)。

```bash
node --experimental-strip-types sim2/online/server.ts                       # http://127.0.0.1:8788/
node --experimental-strip-types sim2/online/server.ts --port 8788 --host 0.0.0.0 --trust-proxy
```

| オプション | 既定 | 内容 |
|---|---|---|
| `--port` | 8788 | 待ち受けポート(vs AI 画面の 8787 と分ける) |
| `--host` | 127.0.0.1 | 外部から直接つなぐ場合のみ `0.0.0.0` |
| `--record-dir` | `sim2/out/online` | 棋譜JSONの保存先(試合終了時と、中断された部屋を片付けるとき)。起動時に作成を試し、書けなければ警告して対戦だけ続ける |
| `--trust-proxy` | off | トンネル/リバースプロキシ経由のとき、`CF-Connecting-IP` / `X-Forwarded-For` を部屋作成の頻度制限に使う |

### ローカルで2タブで遊ぶ(動作確認)

1. サーバーを起動し、`http://localhost:8788/` を開く
2. ルール・パック・席を選んで「部屋を作る」→「部屋に入る」
3. **別のタブ**で招待URL(`http://localhost:8788/room/XXXXXX`)を開く → 空いている席に着く
   (席トークンはタブごとに `sessionStorage`、ブラウザ全体に `localStorage` で保持するので、同じブラウザの2タブで別々の席になる)
4. 両者がマリガンを確定すると対戦開始。3つ目のタブ以降(または `?watch=1`)は観戦

### 離れた相手と遊ぶ(外部公開)

**公開はPCの持ち主が自分の判断で行うこと。** 部屋コードと席トークンで最低限の保護はあるが、認証はない。

- 候補A: Cloudflare の一時トンネル(アカウント不要。PCを起動している間だけ有効)
  ```bash
  node --experimental-strip-types sim2/online/server.ts --trust-proxy   # 127.0.0.1:8788 のまま
  cloudflared tunnel --url http://localhost:8788
  ```
  表示された `https://....trycloudflare.com` をロビーとして開き、部屋を作って招待URLをLINEで送る。
  トンネルを止めれば外からは届かなくなる
- 候補B: Render / Fly.io などにデプロイ。依存ゼロなので Node 24 のイメージで次を起動するだけ:
  `node --experimental-strip-types sim2/online/server.ts --host 0.0.0.0 --port $PORT --trust-proxy`
- **Fly.io に置いてある**(`sim2/fly.toml`、東京1台)。更新は `sim2/` で `fly deploy --remote-only --ha=false`。
  部屋はメモリにあるので**デプロイし直すと進行中の部屋は消える**が、更新時(SIGTERM)は開いている画面すべてに
  「サーバーを更新しています。まもなく再接続します」を流してから終了するので、黙って切れることはない。
  部屋を分けないため台数は必ず1台のまま。対AIの卓は同じURLの `/ai`、死活監視は `/healthz`

### 棋譜の取り出し(Fly.io)

棋譜は `--record-dir /app/out/online` に書かれる。`fly.toml` の `[mounts]` が `/app/out` にボリューム
`records` を載せているので、**デプロイやマシンの入れ替えでも残る**(新しい500件まで)。
ボリュームは最初の一度だけ作る:

```bash
fly volumes create records -r nrt -n 1 -s 1   # 東京・1個だけ(2個作ると2台目が起動して部屋が割れる)
```

棋譜はHTTPでは配信しない(静的配信の許可リストが `out/` を拒否する)。取り出しは ssh で:

```bash
fly ssh console -C "ls -la /app/out/online"           # 一覧
fly ssh console -C "ls /app/out/online | tail -5"     # 直近5件
fly ssh sftp get /app/out/online/<ファイル名>          # 1件ダウンロード
```

落としたJSONはそのまま `online/match.ts` の `replayRecord()` に渡せば同じ試合が再生される。

```bash
# リポジトリのルートで(落とした棋譜ファイルを引数に)
node --experimental-strip-types --input-type=module -e '
import { readFileSync } from "node:fs";
import { replayRecord } from "./sim2/online/match.ts";
const rec = JSON.parse(readFileSync(process.argv[1], "utf8"));
const f = replayRecord(rec);
console.log(rec.room, `g${rec.matchNo}`, rec.unfinished === true ? "(中断)" : "(完了)", "round", f.state.round, f.phase.kind, "winner", f.state.winner);
' <ファイル名>
```

中断された試合(部屋を閉じた・放置されて掃除された)は `...-g<n>-unfinished.json` という名前で
`"unfinished": true` が付き、最後の入力までがそのまま再生できる(短いだけで形式は同じ)。
ボリュームが空だったり書き込めない状態で起動したときは、起動ログに
`online: records are NOT being saved to ...` と出したうえで対戦自体は動き続ける。
そのログが出たらボリュームの所有者がコンテナの実行ユーザー(`node`)になっていないので、一度だけ:

```bash
fly ssh console -C "chown -R node:node /app/out"   # rootで入って直す。以後は不要
```

### 仕様の要点

- 部屋: 6文字コード(0/O・1/I/L なし)。参加者は32バイトの席トークンでのみ識別
- 切断: 席は保持。同じタブのリロード、閉じたタブを開き直す(同じブラウザ)で同じ席に戻る。
  満席の部屋を同じブラウザの別タブで開くと、観戦ではなくそのブラウザの席を共有する。
  席の確認がアクセス制限・サーバーエラーで失敗しても席トークンは捨てず、間隔をあけて再試行する(捨てるのは401のときだけ)。
  手番の時間制限なし。投了ボタンあり
- 部屋の片付け: 接続が1つもない状態が2時間続いた部屋は削除。**対戦が一度も始まっていない部屋は10分**
  (開いて閉じただけのタブが、1IPあたり6部屋の枠を2時間持ち続けないため)。
  席に着いている人は `POST /api/rooms/:code/close`(席トークン。観戦者は403)でその場で閉じられる。
  画面では待機中カードと、対局終了後のツール列に「部屋を閉じる」が出る
- 試合終了: 棋譜 `out/online/<開始日時>-<部屋>-g<n>.json`(ルール・設定・シード・全入力・全イベント)。
  `online/match.ts` の `replayRecord()` で同じ結果が再生される。「もう一戦」は両者が押すと先後を入れ替えて開始
  (次の試合の設定の提案が未回答のあいだは始まらず、同意・拒否・取り下げのあとに始まる)。提案が断られた/同意されたことは提案者に表示する
- 制限: 部屋数100(1IPあたり同時6部屋)、1IPあたり部屋作成5回/分、参加30回/分、観戦8人/部屋、イベントストリーム240(1IPあたり24・1席あたり4)、リクエスト本文16KB。「収入のタイミング」は試合の途中では変えられない
- API: `online/server.ts` 冒頭のコメント参照(JSON + Server-Sent Events)。部屋作成は `config`(基準からの変数)と `cards`(カードの数値)も受け取る。
  対戦室の入力に `propose`(`scope: "now"` 途中変更 / `"next"` 次の試合の設定)・`answer`(同意/拒否)・`withdraw`(取り下げ)。
  検証はすべてサーバーで行い、範囲外や試合中に変えられない変数は拒否する
- 棋譜は version 2: `config` は開始時のルール、`cards` はカードの数値、`configChanges` は途中変更の一覧(読みやすさのため。再生は `inputs` だけで決まる)。
  途中で終わった試合は `unfinished: true` とファイル名の `-unfinished` が付く
- 運用: 部屋作成・着席・試合終了を標準出力に1行ずつ出す(部屋コード・席・手数・決着種別のみ。名前は出さない)。
  `GET /healthz` は `{ok, rooms, streams, uptime}` を返し、Fly のヘルスチェックはこれを見ている。
  掃除タイマーは例外を捕まえて標準エラーに出す(落ちない)。SIGTERM/SIGINT では全ストリームに更新中を伝えてから終了する
- 配信: 静的ファイルは `Accept-Encoding: gzip` があれば gzip(1KB以上、SSEは絶対に圧縮しない)。
  HTMLの入口ページだけ `no-store`(デプロイ間で古いモジュールと混ざらないため)、
  読み込まれる `.ts`/`.css`/パックJSONは `Cache-Control: public, max-age=300`。API・SSEは `no-store`。
  `HEAD` は本文のない `GET` として答える

## カードパック

`data/pack-<name>.json` を `--pack <name>` で選ぶ。

| name | 内容 |
|---|---|
| `placeholder22` | 設計書§4のコスト帯から合成した仮デッキ。効果なし |
| `tsukumo-miyako` | 付喪神+京鬼 22枚(霊具5枚を含む) |
| `kyubi-ryu` | 九尾+龍 22枚(霊具6枚を含む) |
| `shuten-kyuryu` | 玖龍街一門+酒呑一門 22枚(霊具5枚を含む、EXP-0913B)。範囲などはテンキー記法の文字列で記述し `cards.ts` の `parseTenkey` が座標化。効果は `effect` フィールドで既存実装を流用 |
| `adopted-0922` | **既定**。採用 9/22 の玖龍街一門+酒呑一門 22枚(霊具5枚、一門 `clan` と霊力価 `manaValue` つき)。変わった効果は新しい効果キー `ad*`(EFFECTS-SPEC.md §5) |

## カード効果

`tsukumo-miyako` のカード効果と霊具5枚は実装済み。仕様の正本は [`EFFECTS-SPEC.md`](./EFFECTS-SPEC.md)、
実装は `src/effects.ts`(cardIdベースのフック)、測定結果は [`RESULTS-EFFECTS.md`](./RESULTS-EFFECTS.md)。

- `--effects on|off`(既定 on)。**off はルールのみの挙動**で、効果導入前と完全一致する
- 霊具はアトミックアクション(コスト支払い→効果解決→墓地)。1ターンの使用回数制限なし
- `placeholder22` / `kyubi-ryu` には効果を持つカードは無いため、`--effects` は実質無影響

`placeholder22` と `kyubi-ryu` の効果は未実装(`kyubi-ryu` の霊具6枚は召喚不可の死に札のまま)。
既知バイアスは [`RESULTS-SMOKE.md`](./RESULTS-SMOKE.md) と [`RESULTS-EFFECTS.md`](./RESULTS-EFFECTS.md) を参照。

## 構成

```
src/rng.ts       シード付き乱数
src/types.ts     型定義とデフォルト設定
src/board.ts     盤面幾何(回転・範囲・死角・属性)
src/cards.ts     カードデータの検証(node非依存。ブラウザからも使う)
src/pack-io.ts   パックJSONのファイル読み込み(node専用)
src/state.ts     GameState 生成・clone・派生値
src/rules.ts     コスト・合法手列挙・アクション適用
src/combat.ts    戦闘解決(同時ダメージ→同時撃破→反撃)
src/turn.ts      ターン進行(開始/終了・チップ・リーチ・手札整理)
src/effects.ts   カード効果と霊具(cardIdベースのフック)
src/ai/eval.ts   盤面評価関数
src/ai/greedy.ts 貪欲AI
src/ai/beam.ts   ターン内ビームサーチAI
src/metrics.ts   試合ログ→KPI集計
src/runner.ts    N試合実行
src/cli.ts       コマンドライン
src/presets.ts   ルールプリセット(現行ルール / 9/13テストルール=K0 / 8/28ルール=K8ts)。CLI・対戦画面・オンライン共通
src/flow.ts      入力駆動の試合進行(マリガン・古箪笥・捨て札の選択待ち・途中のルール変更を含む状態機械、棋譜の再生)
src/preview.ts   攻撃・継承召喚の予測(エンジンを複製上で実行)
src/commands.ts  駒の命令メニュー(可否は合法手から、使えない理由も)
src/config-schema.ts CONFIG_SCHEMA(変数の名前・説明・範囲・途中変更の可否)と検証
src/card-overrides.ts カードの上書き(数値・属性・攻撃範囲など。パックを複製して差し替え)と検証
src/card-edits.ts カード編集の操作(マスを塗る・まとめて変更・範囲のコピー・一括選択)
src/settings.ts  設定(基準プリセット+変数の差分+カードの数値)の検証と共有URLの符号化
src/rule-change.ts 途中変更の適用(HP・霊力の上限処理)
play/server.ts   対戦UIの静的サーバ(.tsの型剥がし付き)
play/index.html  対戦画面(vs AI)
play/ui.ts       vs AI の進行(flow + AI席)・対局の準備
play/ai-store.ts vs AI の対局の保存と再生による復元
play/rules.html / rules-page.ts 設定ページ /rules(開き方 ?for= ごとの画面と戻り先)
play/rules-url.ts 設定ページの URL(開き方の解釈・戻り先・共有URL)
play/table.ts    卓の骨組み・選択の状態機械・キー操作(合法手リストと命令メニューだけを使う)
play/select.ts   選択に応じた光るマス・メニュー項目・予測の抽出
play/board-view.ts 九宮盤・駒・丸いメニュー・向き選択・盤上の予測
play/cards-view.ts 札の意匠(手札・駒・詳細で共通。中央の絵は illustrationHtml の1箇所で差し替え)
play/hand-view.ts 手札の扇形
play/hud.ts      名札・山札と墓地・相手の手札・手番表示・札の詳細・記録
play/prompt-view.ts 盤の下の案内と確定ボタン
play/fx.ts / fx-play.ts 演出のキューとイベント別の演出
play/settings-panel.ts 設定パネル(部屋作成・試合間・途中変更・ローカル共通。設定ページにもダイアログにも置ける)
play/settings-badge.ts / saved-settings.ts 「+N項目変更」の表示と差分、名前を付けた保存
play/render.ts   ログ文・予測の文言などの文字列部品
play/table.css / panel.css / fx.css 共通スタイル(配色と書体はCSS変数)
online/server.ts HTTP・SSE・API・静的配信
online/rooms.ts  部屋・席トークン・接続・掃除・頻度制限
online/match.ts  1試合(flow)と棋譜の保存・再生
online/view.ts   プレイヤー別ビュー(隠し情報を落とす唯一の場所)
online/protocol.ts ブラウザとの通信型と入力の検証
src/input-parse.ts 盤の入力(行動・マリガン・途中変更など)の厳密な検証(protocol と対局の保存で共用)
online/lobby.html / lobby.ts   ロビー
online/room.html / client.ts   対戦室
online/room-tools.ts          対戦室の「+N項目変更」・設定ページへのリンク・同意の帯
online/rules-room.ts          設定ページの部屋モード(席トークンで部屋を読み、提案を送る)
online/storage.ts             席トークンのブラウザ保存
```
