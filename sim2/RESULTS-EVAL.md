# sim2 追加実験 — 評価プロファイル別の決着分布

Date: 2026-08-30
共通条件: `--pack tsukumo-miyako --chip-mode catch_up --seed 20260830`(seed連番)
考察は書かない。数値のみ。

## 0. プロファイル定義(`src/ai/eval.ts`)

| profile | occ | chip | life | boardHp | reach | threat |
|---|---:|---:|---:|---:|---:|---:|
| `territorial` | 30 | 12 | 8 | 3 | 200 | 2 |
| `aggressive` | 12 | 6 | 40 | 4 | 120 | 2 |
| `balanced` | 20 | 10 | 20 | 3 | 160 | 2 |

CLI: `--eval <p0>,<p1>`(既定 `territorial,territorial`)

---

## 1. greedy 5条件(各100試合)

| # | 先手 profile | 後手 profile | 制圧 / 生命 / 時間切れ | 平均R | ラウンド分布 | 先手勝率 |
|---|---|---|---|---:|---|---:|
| E1 | territorial | territorial | **100 / 0 / 0** | 5.65 | 5R:41 6R:54 7R:4 8R:1 | 0.700 |
| E2 | aggressive | aggressive | **100 / 0 / 0** | 5.72 | 5R:40 6R:51 7R:7 8R:1 9R:1 | 0.700 |
| E3 | territorial | aggressive | **100 / 0 / 0** | 5.70 | 5R:40 6R:53 7R:5 8R:1 9R:1 | 0.700 |
| E4 | aggressive | territorial | **100 / 0 / 0** | 5.67 | 5R:41 6R:52 7R:6 8R:1 | 0.700 |
| E5 | balanced | balanced | **100 / 0 / 0** | 5.66 | 5R:41 6R:53 7R:5 8R:1 | 0.700 |

### 方策別勝率(E3・E4)

| # | 対戦 | 先手側の勝ち | 後手側の勝ち |
|---|---|---:|---:|
| E3 | territorial(先) vs aggressive(後) | territorial **70 / 100** | aggressive 30 / 100 |
| E4 | aggressive(先) vs territorial(後) | aggressive **70 / 100** | territorial 30 / 100 |
| E3+E4 合算(先後を相殺) | — | territorial **100 / 200** | aggressive **100 / 200** |

**全100シードで、E1〜E5 の勝者は一致した(sameWinner 100/100)。**
一方で試合ログ自体は一致していない(E1と完全一致した試合数: E2 86/100・E3 89/100・E4 96/100・E5 99/100)。
= プロファイルは着手を変えているが、勝敗は1試合も変えていない。

### 撃破・リーチ・チップ・経済

| # | 撃破数/試合 (先手が失った/後手が失った) | 攻撃回数/試合 | リーチ 宣言/返され/通過 | 最終チップ差の平均 | ネット盤面成長/ターン | 霊力使途 召喚/攻撃/回転 |
|---|---|---:|---|---:|---:|---|
| E1 | 0.29 (0.14 / 0.15) | 1.84 | 120 / 20 / 100 | 0.89 | 0.938 | 2924 / 293 / 46 |
| E2 | 0.40 (0.18 / 0.22) | 2.04 | 127 / 27 / 100 | 0.89 | 0.924 | 2960 / 334 / 44 |
| E3 | 0.37 (0.19 / 0.18) | 2.00 | 126 / 26 / 100 | 0.88 | 0.928 | 2952 / 321 / 45 |
| E4 | 0.32 (0.13 / 0.19) | 1.90 | 121 / 21 / 100 | 0.90 | 0.934 | 2932 / 308 / 44 |
| E5 | 0.31 (0.14 / 0.17) | 1.86 | 121 / 21 / 100 | 0.88 | 0.936 | 2929 / 298 / 46 |

決着種別×チップ差: 全条件とも制圧のみ(平均チップ差 0.88〜0.90)、生命決着 0件。

---

## 2. beam 2条件(各50試合)

| # | 先手 profile | 後手 profile | 制圧 / 生命 / 時間切れ | 平均R | ラウンド分布 | 先手勝率 |
|---|---|---|---|---:|---|---:|
| E6 | aggressive | aggressive | **50 / 0 / 0** | 6.00 | 5R:15 6R:27 7R:5 8R:1 10R:2 | 0.820 |
| E7 | territorial | aggressive | **50 / 0 / 0** | 6.04 | 5R:15 6R:27 7R:5 8R:1 10R:1 12R:1 | 0.780 |

方策別勝率(E7): territorial(先手) **39 / 50**、aggressive(後手) 11 / 50。

| # | 撃破数/試合 (先/後) | 攻撃回数/試合 | リーチ 宣言/返され/通過 | 最終チップ差の平均 | ネット盤面成長/ターン | 霊力使途 召喚/攻撃/回転 |
|---|---|---:|---|---:|---:|---|
| E6 | 1.10 (0.46 / 0.64) | 4.40 | 86 / 36 / 50 | 0.74 | 0.882 | 1513 / 347 / 58 |
| E7 | 1.18 (0.58 / 0.60) | 4.36 | 92 / 42 / 50 | 0.78 | 0.872 | 1532 / 347 / 64 |

生命決着は E6・E7 とも0件。

---

## 3. 参考: 既存スモークとの対応

`RESULTS-SMOKE.md` の条件A(greedy / territorial / catch_up / 50試合)は先手勝率 0.720。
本実験 E1 は同設定を100試合に伸ばしたもので 0.700。

## 4. 再現コマンド

```bash
run() { # $1=p0profile $2=p1profile $3=ai $4=games $5=label
  node --experimental-strip-types sim2/src/cli.ts selfplay \
    --games "$4" --seed 20260830 --pack tsukumo-miyako --chip-mode catch_up \
    --ai "$3,$3" --eval "$1,$2" --label "$5" \
    --out "sim2/out/eval-$5.json" --games-out "sim2/out/eval-$5.jsonl"
}
run territorial territorial greedy 100 E1
run aggressive  aggressive  greedy 100 E2
run territorial aggressive  greedy 100 E3
run aggressive  territorial greedy 100 E4
run balanced    balanced    greedy 100 E5
run aggressive  aggressive  beam    50 E6
run territorial aggressive  beam    50 E7
```

既知バイアスは `RESULTS-SMOKE.md` §0 と同じ(カード効果未実装・霊具が死に札)。
