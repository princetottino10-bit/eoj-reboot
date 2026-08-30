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
  sim2/test/play.test.ts
```

## 自己対戦

```bash
node --experimental-strip-types sim2/src/cli.ts selfplay \
  --games 500 --seed 20260830 --ai greedy,greedy \
  --pack tsukumo-miyako --chip-mode catch_up \
  --round-limit 40 --out sim2/out/base.json
```

オプションは `node --experimental-strip-types sim2/src/cli.ts help`。

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

## 対戦UI(ブラウザ)

```bash
node --experimental-strip-types sim2/play/server.ts          # 既定ポート 8787
node --experimental-strip-types sim2/play/server.ts --port 9000
```

ブラウザで `http://localhost:8787/` を開く。ビルド不要・依存ゼロ。
サーバは `.ts` を返すときに `node:module` の `stripTypeScriptTypes()` で型だけを剥がすため、
**ブラウザは `src/` のエンジンモジュールをそのまま読み込む**(ルール実装の複製はしていない)。

- 盤面クリックで召喚(マスハイライト→向き選択→召喚攻撃の可否を提示)
- ユニット選択で攻撃範囲(緑)と死角(赤)を表示。敵ユニットも確認可
- ターン終了→捨て札を選んで確定→5枚まで補充→AI手番(1アクション300ms間隔でログ)
- 設定: 自分の席 / AI(greedy|beam) / eval プロファイル / chipMode / シード。パックは tsukumo-miyako ミラー固定

## カードパック

`data/pack-<name>.json` を `--pack <name>` で選ぶ。

| name | 内容 |
|---|---|
| `placeholder22` | 設計書§4のコスト帯から合成した仮デッキ。効果なし |
| `tsukumo-miyako` | 付喪神+京鬼 22枚(霊具5枚を含む) |
| `kyubi-ryu` | 九尾+龍 22枚(霊具6枚を含む) |

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
play/server.ts   対戦UIの静的サーバ(.tsの型剥がし付き)
play/index.html  対戦画面
play/ui.ts       UI本体(エンジンをimportするだけ。ルール実装は持たない)
```
