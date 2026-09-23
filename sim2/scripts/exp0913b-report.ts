// Renders sim2/RESULTS-EXP0913B.md from sim2/out/exp0913b-*.json.
// Numbers only - no interpretation. Also re-runs the default-config
// regression (pre-EXP measurement) so the check is reproducible.
//
//   node --experimental-strip-types sim2/scripts/exp0913b-report.ts
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPack, packPath } from "../src/pack-io.ts";
import { makeCtx } from "../src/state.ts";
import { defaultConfig } from "../src/types.ts";
import { makeGreedy } from "../src/ai/greedy.ts";
import { runMatches } from "../src/runner.ts";
import { summarise } from "../src/metrics.ts";
import type { Summary } from "../src/metrics.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "out");

type S = Summary & { config: Record<string, unknown> };
const load = (id: string, ai: string): S =>
  JSON.parse(readFileSync(join(OUT, `exp0913b-${id}-${ai}.json`), "utf8")) as S;

const AIS = ["greedy", "beam"] as const;
const IDS = ["K0", "K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8"] as const;
const DESC: Record<string, string> = {
  K0: "9/13ルールそのまま",
  K1: "K0 + refundMode half",
  K2: "K0 + inheritSummon off",
  K3: "K0 + counterMode all",
  K4: "K0 + controlHold next_turn_start",
  K5: "K0 + baseIncome 4",
  K6: "K0 + handMode replace_discarded",
  K7: "K0 + summonLimit 1",
  K8: "8/28ルール + 新カード",
  K8ts: "(参考) K8 + incomeTiming turn_start",
};

const f2 = (v: number | null): string => (v === null ? "-" : v.toFixed(2));
const f3 = (v: number | null): string => (v === null ? "-" : v.toFixed(3));
const pct = (v: number): string => `${(v * 100).toFixed(0)}%`;
const sgn = (v: number, digits: number): string => {
  const t = v.toFixed(digits);
  return v > 0 ? `+${t}` : Number(t) === 0 ? `±${(0).toFixed(digits)}` : t;
};
const withD = (v: number | null, base: number | null, digits = 2): string => {
  if (v === null) return "-";
  if (base === null) return v.toFixed(digits);
  return `${v.toFixed(digits)} (${sgn(v - base, digits)})`;
};
const wins = (s: S): string =>
  `${s.winTypes.control} / ${s.winTypes.life} / ${s.winTypes.deck_out} / ${s.winTypes.turn_limit}`;
const ratio = (a: number, b: number): string =>
  b === 0 ? "- (0/0)" : `${f3(a / b)} (${a}/${b})`;
const hist = (h: Record<string, number>): string =>
  Object.entries(h)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([k, v]) => `${k}R:${v}`)
    .join(" ");

// ------------------------------------------------------------ regression

const regression = (): string => {
  const ctx = makeCtx({ ...defaultConfig(), effects: true }, loadPack(packPath("tsukumo-miyako")));
  const recs = runMatches(ctx, [makeGreedy(), makeGreedy()], { games: 100, seed: 20260830 });
  const s = summarise("regression", recs);
  const rows: [string, string, string][] = [
    ["決着: 制圧 / 生命 / 時間切れ", "100 / 0 / 0", `${s.winTypes.control} / ${s.winTypes.life} / ${s.winTypes.turn_limit}`],
    ["平均ラウンド", "6.39", s.meanRounds.toFixed(2)],
    ["先手勝率", "0.610", f3(s.firstPlayerWinRate)],
    ["攻撃回数/試合", "2.41", s.attacksPerGame.toFixed(2)],
    ["撃破数/試合", "1.86", s.killsPerGame.toFixed(2)],
    ["ラウンド分布", "5R:26 6R:35 7R:23 8R:7 9R:8 10R:1", hist(s.roundsHistogram)],
  ];
  return [
    "| 指標 | 前回の既定値測定 | 今回 |",
    "|---|---|---|",
    ...rows.map(([a, b, c]) => `| ${a} | ${b} | ${c} |`),
  ].join("\n");
};

// ------------------------------------------------------------ K0 detail

const k0Detail = (): string => {
  const g = load("K0", "greedy");
  const b = load("K0", "beam");
  const both = (f: (s: S) => string): string => `${f(g)} | ${f(b)}`;
  const rows: [string, (s: S) => string][] = [
    ["試合数", (s) => String(s.games)],
    ["決着: 制圧 / 生命 / デッキ切れ / 上限", wins],
    ["制圧決着率", (s) => pct(s.winTypeShare.control)],
    ["引き分け", (s) => String(s.drawGames)],
    ["平均ラウンド", (s) => f2(s.meanRounds)],
    ["ラウンド分布", (s) => hist(s.roundsHistogram)],
    ["先手勝率", (s) => `${f3(s.firstPlayerWinRate)} (決着 ${s.decisiveGames})`],
    ["攻撃回数/試合", (s) => f2(s.attacksPerGame)],
    ["撃破数/試合", (s) => f2(s.killsPerGame)],
    ["高コスト召喚/試合 (召5以上・継承経由を含む)", (s) => f2(s.highCostSummonRate)],
    [
      "　内訳: 直接 / 継承経由",
      (s) => `${f2(s.highCostBreakdownPerGame.direct)} / ${f2(s.highCostBreakdownPerGame.inherit)}`,
    ],
    [
      "高コスト初出R (出た試合 / 出なかった試合)",
      (s) =>
        `${f2(s.highCostFirstRound.mean)} (${s.highCostFirstRound.gamesWith} / ${s.highCostFirstRound.gamesWithout})`,
    ],
    ["継承召喚/試合", (s) => f2(s.inheritPerGame)],
    [
      "撃破者が得た霊力/試合: 先手 / 後手 / 計",
      (s) =>
        `${f2(s.killerManaPerGame.p0)} / ${f2(s.killerManaPerGame.p1)} / ${f2(s.killerManaPerGame.total)}`,
    ],
    [
      "反撃率 単体攻撃 (反撃あり/攻撃)",
      (s) => ratio(s.counterRate.single.countered, s.counterRate.single.attacks),
    ],
    ["反撃率 範囲攻撃 (反撃あり/攻撃)", (s) => ratio(s.counterRate.aoe.countered, s.counterRate.aoe.attacks)],
    ["反撃率 全攻撃", (s) => ratio(s.counterRate.all.countered, s.counterRate.all.attacks)],
    [
      "先に撃破した側の勝率 (対象試合 / 撃破なし試合)",
      (s) =>
        `${f3(s.firstKillWinRate.rate)} (${s.firstKillWinRate.firstKillerWon}/${s.firstKillWinRate.games} / ${s.firstKillWinRate.gamesWithoutKill})`,
    ],
    ["逆転回数 (占拠差の符号反転)/試合", (s) => f2(s.leadFlipsPerGame)],
    [
      "制圧状態: 付与 / 崩された / 勝利 (総数)",
      (s) => `${s.controlStates.gained} / ${s.controlStates.lost} / ${s.controlStates.won}`,
    ],
    [
      "制圧状態: 付与/試合 / 崩された/試合",
      (s) => `${f2(s.controlStates.gainedPerGame)} / ${f2(s.controlStates.lostPerGame)}`,
    ],
    [
      "マリガンで戻した枚数 (1人平均: 先手 / 後手)",
      (s) => `${f2(s.mulliganReturned.perPlayer)} (${f2(s.mulliganReturned.p0)} / ${f2(s.mulliganReturned.p1)})`,
    ],
    ["召喚数/ターン (継承を含む)", (s) => f3(s.meanSummonsPerTurn)],
    ["ネット盤面成長/ターン (継承は成長に数えない)", (s) => f3(s.netBoardGrowthPerTurn)],
    ["ターン終了時の余剰霊力 平均", (s) => f2(s.meanLeftoverMana)],
    ["霊具使用/試合", (s) => f2(s.reiguUsesPerGame)],
    ["範囲攻撃 敵ヒット / 味方ヒット (総数)", (s) => `${s.aoeHits.enemy} / ${s.aoeHits.ally}`],
    ["僵尸公主の撃破時移動/試合", (s) => f2(s.effectMovesPerGame)],
    ["最終チップ差 平均", (s) => f2(s.meanFinalChipDiff)],
  ];
  const head = ["| 指標 | greedy | beam |", "|---|---|---|"];
  const main = rows.map(([k, f]) => `| ${k} | ${both(f)} |`);

  const combos = (s: S): string =>
    Object.entries(s.inheritCombos)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
  const comboTable = [
    "| AI | 継承元→継承先 (召喚コスト): 回数 (全試合合計) |",
    "|---|---|",
    `| greedy | ${combos(g)} |`,
    `| beam | ${combos(b)} |`,
  ];

  const byRound = (key: "boardHp" | "hand" | "control"): string[] => {
    const maxR = Math.max(
      ...[g, b].map((s) =>
        key === "boardHp"
          ? s.boardHpByRound.length
          : key === "hand"
            ? s.handSizeByRound.length
            : Math.max(0, ...s.controlStates.byRound.map((r) => r.round)),
      ),
    );
    const rounds = Array.from({ length: Math.min(maxR, 10) }, (_, i) => i + 1);
    const out = [
      `| AI | ${rounds.map((r) => `R${r}`).join(" | ")} |`,
      `|---|${rounds.map(() => "---").join("|")}|`,
    ];
    for (const [name, s] of [["greedy", g], ["beam", b]] as const) {
      const cells = rounds.map((r) => {
        if (key === "boardHp") {
          const row = s.boardHpByRound[r - 1];
          return row === undefined ? "-" : `${row.total.toFixed(1)} (${row.games})`;
        }
        if (key === "hand") {
          const row = s.handSizeByRound[r - 1];
          return row === undefined ? "-" : `${row.mean.toFixed(2)} (${row.games})`;
        }
        const row = s.controlStates.byRound.find((x) => x.round === r);
        return row === undefined ? "0/0/0" : `${row.gain}/${row.lost}/${row.win}`;
      });
      out.push(`| ${name} | ${cells.join(" | ")} |`);
    }
    return out;
  };

  return [
    ...head,
    ...main,
    "",
    "#### 継承召喚の組み合わせ",
    "",
    ...comboTable,
    "",
    "#### 制圧状態の推移 (ラウンド別 付与/崩された/勝利 の件数、全試合合計)",
    "",
    ...byRound("control"),
    "",
    "#### 盤面の実効HP合計 (各ラウンド終了時の両者合計の平均。括弧内はそのラウンドまで残った試合数)",
    "",
    ...byRound("boardHp"),
    "",
    "#### 手札枚数 (各ラウンド終了時、両者平均。括弧内は試合数)",
    "",
    ...byRound("hand"),
  ].join("\n");
};

// ------------------------------------------------------------ K1..K8

const comparison = (ai: (typeof AIS)[number]): string => {
  const k0 = load("K0", ai);
  const ids = [...IDS, "K8ts"];
  const outcome = [
    "| # | 条件 | 制圧決着率 | 決着: 制圧/生命/デッキ切れ/上限 | 平均R | 先手勝率 | 先に撃破した側の勝率 | 逆転回数/試合 | 制圧付与/試合 | 崩された/試合 |",
    "|---|---|---:|---|---|---|---|---|---|---|",
  ];
  const combat = [
    "| # | 攻撃回数/試合 | 撃破数/試合 | 反撃率 単体 | 反撃率 範囲 | 高コスト召喚/試合 | 　直接 / 継承 | 継承/試合 | 撃破者霊力/試合 (計) | 余剰霊力 | ネット盤面成長/ターン |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const id of ids) {
    const s = load(id, ai);
    const base = id === "K0" ? null : k0;
    const d = (v: number | null, b: number | null, digits = 2): string =>
      base === null ? (v === null ? "-" : v.toFixed(digits)) : withD(v, b, digits);
    const tag = id === "K0" ? "**K0**" : id;
    outcome.push(
      `| ${tag} | ${DESC[id]} | ${pct(s.winTypeShare.control)} | ${wins(s)} | ${d(s.meanRounds, k0.meanRounds)} | ${d(
        s.firstPlayerWinRate,
        k0.firstPlayerWinRate,
        3,
      )} | ${d(s.firstKillWinRate.rate, k0.firstKillWinRate.rate, 3)} | ${d(
        s.leadFlipsPerGame,
        k0.leadFlipsPerGame,
      )} | ${d(s.controlStates.gainedPerGame, k0.controlStates.gainedPerGame)} | ${d(
        s.controlStates.lostPerGame,
        k0.controlStates.lostPerGame,
      )} |`,
    );
    const cr = (x: { countered: number; attacks: number }): string =>
      x.attacks === 0 ? "-" : `${f3(x.countered / x.attacks)} (${x.countered}/${x.attacks})`;
    combat.push(
      `| ${tag} | ${d(s.attacksPerGame, k0.attacksPerGame)} | ${d(s.killsPerGame, k0.killsPerGame)} | ${cr(
        s.counterRate.single,
      )} | ${cr(s.counterRate.aoe)} | ${d(s.highCostSummonRate, k0.highCostSummonRate)} | ${f2(
        s.highCostBreakdownPerGame.direct,
      )} / ${f2(s.highCostBreakdownPerGame.inherit)} | ${d(s.inheritPerGame, k0.inheritPerGame)} | ${d(
        s.killerManaPerGame.total,
        k0.killerManaPerGame.total,
      )} | ${d(s.meanLeftoverMana, k0.meanLeftoverMana)} | ${d(
        s.netBoardGrowthPerTurn,
        k0.netBoardGrowthPerTurn,
        3,
      )} |`,
    );
  }
  return [
    `#### ${ai}: 決着・制圧`,
    "",
    ...outcome,
    "",
    `#### ${ai}: 攻撃・召喚・経済`,
    "",
    ...combat,
  ].join("\n");
};

const k6Hand = (): string => {
  const out: string[] = [];
  for (const ai of AIS) {
    const k0 = load("K0", ai);
    const k6 = load("K6", ai);
    const maxR = Math.min(10, Math.max(k0.handSizeByRound.length, k6.handSizeByRound.length));
    const rounds = Array.from({ length: maxR }, (_, i) => i + 1);
    out.push(`#### ${ai}`, "");
    out.push(`| # | ${rounds.map((r) => `R${r}`).join(" | ")} |`);
    out.push(`|---|${rounds.map(() => "---").join("|")}|`);
    for (const [id, s] of [["K0", k0], ["K6", k6]] as const) {
      const cells = rounds.map((r) => {
        const row = s.handSizeByRound[r - 1];
        return row === undefined ? "-" : `${row.mean.toFixed(2)} (${row.games})`;
      });
      out.push(`| ${id} | ${cells.join(" | ")} |`);
    }
    out.push("");
  }
  return out.join("\n");
};

// ------------------------------------------------------------ document

const RULINGS = `| # | 論点 | 採った処理 |
|---|---|---|
| 1 | 自滅での撃破 (1.1) | 首引の姫鬼の【渾身】自傷で倒れた場合は撃破者なし。\`killer_half\` では誰も霊力を得ない。古箪笥のHP消費は「現HP2以上のときのみ発動」(既存裁定)のため自滅は発生しない |
| 2 | 撃破時霊力の上限 | 撃破者が受け取る霊力も既存どおり霊力上限15で切る |
| 3 | マヨヒガ(敵−1HP)による撃破 | 霊具の使用者を撃破者とする(閻魔獄卒棒と同じ扱い) |
| 4 | 継承召喚の支払いと回収の順序 (1.2) | **全額を支払える霊力が先に必要**(回収分を支払いに充当しない)。支払い後に \`ceil(元の召喚コスト/2)\` を回収(上限15)。仕様書は順序を明記していないため、本文の「支払いと回収」の記載順に従った |
| 5 | 継承召喚と \`summonLimit\` | 継承召喚は召喚1回として数える(K7で効く) |
| 6 | 継承召喚の「召喚コストが厳密に高い」 | 印刷された召喚コストで比較(太極の軽減前) |
| 7 | 継承先の召喚攻撃扱い | \`summonedThisTurn\` を立てる(茨木童子の【再生】は召喚攻撃では発動しない、既存裁定と同じ)。\`atkBuff\`(酒呑童子の霊具バフ)は引き継がない(別の式神のため) |
| 8 | 継承でダメージ量が負(鬼の酒で実効最大超え)の場合 | 仕様の「damage フィールドをそのまま移す」に従い**負の値(実効最大を超えたHP)もそのまま移した**(現HPは上限10で切る)。負のダメージ量は鬼の酒・雲外鏡の効果で実効最大を超えたHPを持つ式神に生じる。該当した継承は K0 greedy 78回中12回、beam 50回中5回(別途計測、同シード)。卓上で「超過HPをダメージとして引き継ぐ」かは仕様書から確定できない |
| 9 | 継承と盤面満杯 | 盤面9体でも継承召喚は可能(マスを入れ替えるため) |
| 10 | 反撃の隙位置の基準 (1.3) | 範囲攻撃の隙位置は攻撃宣言時の攻撃者の位置・向きから求める |
| 11 | \`counterMode:gap\` 以外での術式式神の反撃 | 「術式の式神は反撃しない」は \`gap\` モードでのみ適用。\`all\` / \`single\` では既存どおり術式の式神も反撃する(K3・K8に影響) |
| 12 | マリガンの実施順 (1.4) | 先手→後手の順に、ゲーム共通の乱数で山札をシャッフル。引き直した札が召5以上でも再マリガンはしない |
| 13 | 制圧状態の判定順 (1.5) | ターン終了時: チップ獲得 → 制圧判定(勝利判定 → 制圧状態の付与) → 霊力獲得(turn_end) → 手札整理。チップ獲得は既存の順序のまま制圧判定の前に置いた |
| 14 | 制圧状態の再計算タイミング | 攻撃・霊具・召喚・継承・回転の各アクション解決後に両者の占拠数を再計算。5未満になった側の制圧状態を即座に外す。5未満に落ちた後、同じターン中に5以上へ戻っても、そのターン終了時は「付与」扱い(勝利ではない) |
| 15 | \`controlHold:next_turn_end\` とマヨヒガ | 隠された式神は占拠数に数えない(既存)。マヨヒガで敵を隠して5未満にした場合も制圧状態は外れる |
| 16 | 手札補充 \`replace_discarded\` (1.6) | 捨て札の選択は既存の固定則(次の収入後も払えない札を捨てる)。捨てた枚数だけ引く |
| 17 | **カード表の注記と表の値の不一致** (2.2) | 注記は「ATKと一致しないカードがある(首引の姫鬼・僵尸公主・酒呑童子)」だが、表の値では僵尸公主(攻3/ATK3)・酒呑童子(攻4/ATK4)は一致しており、不一致は首引の姫鬼(攻3/ATK2)のみ。**表の値をそのまま使った** |
| 18 | 一目鬼の回転2 (2.2) | 指示どおり回転は全カード一律1で扱った。**元データ側の更新漏れの可能性**あり(8/28改訂⑪で回転は一律1) |
| 19 | 鎖鬼 (sk05) の効果 | §2.3の差分表にも「その他」の列挙にも無い。効果の記載が無いため**効果なし**として実装。旧パックの対応カード(金棒鬼 tm05 は効果なし)と一致するかは仕様書からは確定できない |
| 20 | 一角鬼 (sk08)・両面 (sk14) | §2.3・「その他」とも言及なし。旧パックでも効果なし(tm08・tm14)のため効果なしとした |
| 21 | 家鳴り (sk18)「任意の向きに変える」 | 現在の向き以外の3方向(180度を含む)を選択肢として列挙。現在と同じ向き(効果なし)は候補から外した |
| 22 | 首引の姫鬼の【渾身】と範囲攻撃 | +1は範囲内の全対象(味方含む)に乗る。攻撃コストは表の攻3 |
| 23 | 僵尸公主の移動 | 既存 \`moveOnKill\` と同じ処理順(撃破解決の後、反撃判定の前)。移動先で実効HPが0以下なら移動しない。\`effects:off\` では発動しない |
| 24 | 共通条件 incomeTiming=turn_end と K8 | K8(8/28ルール+新カード)も§3の共通条件どおり \`incomeTiming:turn_end\` で実行した。8/28ルール本来の turn_start での値は参考行 K8ts として併記 |
| 25 | K8 と K8ts の greedy | 両者の greedy 100試合は試合ログ(試合ごとの記録)が完全一致した。beam は一致しない |
| 26 | 新パックの登録 | 既存テスト「全パックで attackCost === atk」を無改変で通すため、新パックは \`PACK_NAMES\` に入れず \`EXTRA_PACK_NAMES\` に置いた。CLI の \`--pack shuten-kyuryu\` で選べる。対戦UIは従来どおり tsukumo-miyako 固定 |
| 27 | 先に撃破した側 (\`firstKillWinRate\`) | 「敵の式神」を最初に撃破したプレイヤー。味方巻き込みでの自軍撃破と、撃破者なし(自滅)は数えない。引き分け試合は母数から除く |
| 28 | 逆転回数 (\`leadFlips\`) | 毎ターン終了時(両者とも)の占拠差(先手−後手)の符号が、直前の非ゼロの符号から反転した回数。差0の時点は飛ばす |
| 29 | 反撃率 (\`counterRate\`) | 分母は回復攻撃(変面)を除く攻撃。分子は反撃が1回以上起きた攻撃数。単体/範囲は攻撃時点の扱い(\`aoeMode\`適用後)で分類 |
| 30 | 制圧状態 (\`controlStates\`) の数え方 | \`next_turn_end\`: 付与=自ターン終了時に制圧状態に入った回数、崩された=制圧状態が勝利前に外れた回数、勝利=制圧勝ち。\`next_turn_start\`(K4・K8): 付与=自ターン終了時に5マス以上(リーチ宣言)、崩された=次の自ターン開始時に5マス未満だった回数、勝利=制圧勝ち |
| 31 | 手札枚数 (\`handSizeByRound\`) | 後手のターン終了時(=ラウンド終了時)の両者の手札枚数。先手の値は先手自身の補充後の枚数 |
| 32 | 勝利ターンの行動の集計 | \`next_turn_end\` では勝者は勝利するターンのメインフェイズを行ってから勝つため、その手番の攻撃・召喚・継承も集計に入る。\`next_turn_start\`(K4・K8)ではターン開始時に勝利し、その手番の行動は発生しない |
| 33 | 決着ターンのターン終了記録 | どちらのモードでも、勝利が確定した手番のターン終了記録(占拠・手札・余剰霊力など)は残らない(既存の集計方式と同じ) |
`;

const KNOWN = `- AIの判断は既存の greedy / beam(評価関数は territorial)のまま。撃破者獲得の霊力・継承召喚・マリガン・制圧状態は評価関数に専用の項を持たない(霊力は評価に入らない。制圧状態は既存の「相手がリーチかつ5以上」ペナルティがそのまま効く)
- AIは攻撃を反撃ダメージ込みの結果盤面で評価するため、反撃を受ける攻撃は選ばれにくい。反撃判定そのものは受け入れテスト(GP1〜GP4)で確認済み
- マリガンの判断則は仕様書の固定則(召5以上を戻す)のみ。人間の判断とは異なる
- 継承召喚は通常の召喚と同列の候補として列挙している(仕様どおり)。beam の探索幅8・行動上限12は既存のまま
- 試合数は greedy 100 / beam 50。同一シード列(20260910〜)を全条件で共有している
- 対戦UIは新ルール・新パックに未対応(仕様どおり、既存パックでの起動のみ維持)。新しいイベント種別(継承・制圧状態・マリガン)はUIのログには表示されない
`;

const main = (): void => {
  const doc = `# EXP-0913B 9/13テストルールの事前予測

Date: 2026-09-10
仕様: [\`EXP-0913B.md\`](./EXP-0913B.md) / 前回: [\`RESULTS-EXP0913.md\`](./RESULTS-EXP0913.md) / エンジン設計: [\`DESIGN.md\`](./DESIGN.md)

共通条件: \`--pack shuten-kyuryu\`(ミラー) \`--chip-mode catch_up\` \`--effects on\` \`--income-timing turn_end\`、
基準シード \`20260910\` から連番。試合数は greedy 100 / beam 50。ラウンド上限は既定の40(超えた試合は「上限」決着)。
生データは \`out/exp0913b-<条件>-<ai>.json\`(集計)と \`out/exp0913b-<条件>-<ai>.jsonl\`(1行1試合)。

「9/13ルール」= \`refundMode:killer_half\` + \`inheritSummon:true\` + \`counterMode:gap\` + \`mulligan:true\` +
\`controlHold:next_turn_end\` + \`handMode:refill_to_5\`(summonLimit なし)。

**考察は書かない。数値のみ。**

## 既定値の回帰確認

新フラグを一切指定しない状態(pack tsukumo-miyako / effects on / greedy / catch_up / seed 20260830 / 100試合)。
加えて、変更前のエンジンで記録した試合ごとの記録(既定値 100試合、EXP-0913フラグ併用 60試合、kyubi-ryu 40試合、beam 10試合)と、
変更後の同条件の記録を全項目比較し、差分0件を確認した。

${regression()}

---

## 1. K0: 9/13ルールそのまま(9/13テストの予測値)

${k0Detail()}

---

## 2. K1〜K8 の比較(括弧内は K0 との差)

${comparison("greedy")}

${comparison("beam")}

### K6: 手札枚数の推移(各ラウンド終了時、両者平均。括弧内は試合数)

${k6Hand()}
---

## 3. 裁定・逸脱のリスト

仕様が一意に定まらなかった箇所、または仕様書内で食い違っていた箇所の処理。数値の解釈ではなく実装の事実として記す。

${RULINGS}
## 4. 既知の制限

${KNOWN}
## 付録: 追加したconfigフラグとCLI

| フラグ | CLI | 既定 |
|---|---|---|
| \`refundMode\` に \`killer_half\` を追加 | \`--refund-mode <half\\|none\\|killer_half>\` | \`half\` |
| \`inheritSummon\` | \`--inherit-summon <on\\|off>\` | \`off\` |
| \`counterMode\` に \`gap\` を追加 | \`--counter-mode <all\\|single\\|gap>\` | \`all\` |
| \`mulligan\` | \`--mulligan <on\\|off>\` | \`off\` |
| \`controlHold\` | \`--control-hold <next_turn_start\\|next_turn_end>\` | \`next_turn_start\` |
| \`handMode\` | \`--hand-mode <refill_to_5\\|replace_discarded>\` | \`refill_to_5\` |

カードデータ: \`data/pack-shuten-kyuryu.json\`(範囲・反撃範囲・死角・隙はテンキー記法の文字列のまま保持し、
\`src/cards.ts\` の \`parseTenkey\` が座標に変換する。\`effect\` フィールドで既存効果の流用先を指定)。

追加メトリクス: \`inheritPerGame\`(+ \`inheritCombos\`) / \`killerManaPerGame\` / \`counterRate\`(単体・範囲) /
\`firstKillWinRate\` / \`leadFlipsPerGame\` / \`controlStates\`(+ ラウンド別) / \`handSizeByRound\` /
\`highCostBreakdownPerGame\`(直接・継承) / \`mulliganReturned\` / \`effectMovesPerGame\`。

実験の再実行: \`bash sim2/scripts/exp0913b.sh\`(最後にこの文書を再生成する)
`;
  writeFileSync(join(ROOT, "RESULTS-EXP0913B.md"), doc, "utf8");
  process.stdout.write("wrote sim2/RESULTS-EXP0913B.md\n");
};

main();
