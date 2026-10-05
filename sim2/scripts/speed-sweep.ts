// 決着の速さの感度分析: move one rule / card variable at a time from 10/3テスト案,
// play every variant with the same seeds (the same shuffles) under several AIs
// of different depth and style, and report how much each variable moves the
// deciding round - only trusting a direction all the AIs agree on.
//
//   node --experimental-strip-types sim2/scripts/speed-sweep.ts [--games 1200] [--out sim2/out/speed-sweep]
//
// Writes results.json and report.html into --out. Runs the games in child
// processes (one per core but two); `--job` is that child's entry point.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyCardOverrides } from "../src/card-overrides.ts";
import type { CardOverrides } from "../src/card-overrides.ts";
import type { CardPack } from "../src/cards.ts";
import { makeAi } from "../src/ai/index.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig } from "../src/presets.ts";
import { runGame } from "../src/runner.ts";
import { makeCtx } from "../src/state.ts";
import type { Config } from "../src/types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED0 = 20261004;

// ------------------------------------------------------------------ what to vary

type Variant = { id: string; label: string; cfg?: Partial<Config>; cards?: (p: CardPack) => CardOverrides };

const costAtLeast = (n: number, dh: number) => (p: CardPack): CardOverrides =>
  Object.fromEntries(p.cards.filter((c) => c.kind === "shikigami" && c.summonCost >= n).map((c) => [c.id, { hp: Math.max(1, c.hp + dh) }]));

export const VARIANTS: readonly Variant[] = [
  { id: "base", label: "10/3テスト案(基準)" },
  { id: "inc5", label: "毎ターン収入 6→5", cfg: { baseIncome: 5 } },
  { id: "inc7", label: "毎ターン収入 6→7", cfg: { baseIncome: 7 } },
  { id: "stepsEarly", label: "収入の段 4・5枚→3・4枚", cfg: { chipIncomeSteps: [3, 4, 4] } },
  { id: "stepsLate", label: "収入の段 4・5枚→5・6枚", cfg: { chipIncomeSteps: [5, 6, 6] } },
  { id: "dial", label: "ラチェット→ダイヤル", cfg: { incomeMode: "current" } },
  { id: "manaDown", label: "初期霊力 6/8→5/7", cfg: { startMana: [5, 7] } },
  { id: "manaUp", label: "初期霊力 6/8→7/9", cfg: { startMana: [7, 9] } },
  { id: "ctl4", label: "制圧マス 5→4", cfg: { controlWin: 4 } },
  { id: "ctl6", label: "制圧マス 5→6", cfg: { controlWin: 6 } },
  { id: "holdStart", label: "制圧の判定 次の自ターン終了→開始", cfg: { controlHold: "next_turn_start" } },
  { id: "countCells", label: "HP11以上の2マス数え なし", cfg: { controlCount: "cells" } },
  { id: "cold5", label: "5体目で即勝ち", cfg: { instantWinCells: 5, instantWinTiming: "immediate", instantWinCount: "units" } },
  { id: "attr1", label: "属性ボーナス ±2→±1", cfg: { attrBonus: 1 } },
  { id: "attr3", label: "属性ボーナス ±2→±3", cfg: { attrBonus: 3 } },
  { id: "blind1", label: "死角ボーナス +2→+1", cfg: { blindBonus: 1 } },
  { id: "blind3", label: "死角ボーナス +2→+3", cfg: { blindBonus: 3 } },
  { id: "taiji1", label: "太極の軽減 −2→−1", cfg: { taijiDiscount: 1 } },
  { id: "taiji3", label: "太極の軽減 −2→−3", cfg: { taijiDiscount: 3 } },
  { id: "atkUp", label: "攻撃コスト 全部+1", cfg: { attackCostDelta: 1 } },
  { id: "atkDown", label: "攻撃コスト 全部−1", cfg: { attackCostDelta: -1 } },
  { id: "freeAtk", label: "召喚した手番の攻撃はコストなし", cfg: { freeSummonAttack: "optional", freeSummonAttackInherit: true } },
  { id: "rewardZero", label: "撃破報酬 霊力価→なし", cfg: { killRewardBase: "zero" } },
  { id: "rewardPlus", label: "撃破報酬 +1", cfg: { killRewardBonus: 1 } },
  { id: "bigHpUp", label: "召喚コスト7以上のHP +1", cards: costAtLeast(7, 1) },
  { id: "bigHpDown", label: "召喚コスト7以上のHP −1", cards: costAtLeast(7, -1) },
  { id: "cheapMore", label: "影鬼・鉞鬼を2枚ずつ(23→25枚)", cards: () => ({ ac03: { copies: 2 }, ac04: { copies: 2 } }) },
  { id: "noMulligan", label: "マリガンなし", cfg: { mulligan: false } },
];

const FREE = { freeSummonAttack: "optional", freeSummonAttackInherit: true } as const;
const COLD5 = { instantWinCells: 5, instantWinTiming: "immediate", instantWinCount: "units" } as const;

/** 召喚した手番の攻撃はコストなし を軸に: 速さと先後の釣り合いを戻す組み合わせ (2026-10-04). */
export const FREE_ATK_COMBOS: readonly Variant[] = [
  { id: "base", label: "10/3テスト案(基準)" },
  { id: "cold5", label: "5体目で即勝ち(参考)", cfg: { ...COLD5 } },
  { id: "free", label: "召喚攻撃無料", cfg: { ...FREE } },
  { id: "freeNoInh", label: "召喚攻撃無料(継承召喚は除く)", cfg: { ...FREE, freeSummonAttackInherit: false } },
  { id: "freeCold5", label: "召喚攻撃無料+5体目で即勝ち", cfg: { ...FREE, ...COLD5 } },
  { id: "freeCtl4", label: "召喚攻撃無料+制圧4マス", cfg: { ...FREE, controlWin: 4 } },
  { id: "freeAtkUp", label: "召喚攻撃無料+攻撃コスト+1", cfg: { ...FREE, attackCostDelta: 1 } },
  { id: "freeAtkUpCold5", label: "召喚攻撃無料+攻撃コスト+1+5体目で即勝ち", cfg: { ...FREE, attackCostDelta: 1, ...COLD5 } },
  { id: "freeMana67", label: "召喚攻撃無料+初期霊力 6/7", cfg: { ...FREE, startMana: [6, 7] } },
  { id: "freeMana67Cold5", label: "召喚攻撃無料+初期霊力 6/7+5体目で即勝ち", cfg: { ...FREE, startMana: [6, 7], ...COLD5 } },
  { id: "freeMana78Cold5", label: "召喚攻撃無料+初期霊力 7/8+5体目で即勝ち", cfg: { ...FREE, startMana: [7, 8], ...COLD5 } },
  { id: "freeNoInhCold5", label: "召喚攻撃無料(継承除く)+5体目で即勝ち", cfg: { ...FREE, freeSummonAttackInherit: false, ...COLD5 } },
  { id: "freeInc7Cold5", label: "召喚攻撃無料+収入7+5体目で即勝ち", cfg: { ...FREE, baseIncome: 7, ...COLD5 } },
  { id: "freeAttr3Cold5", label: "召喚攻撃無料+属性±3+5体目で即勝ち", cfg: { ...FREE, attrBonus: 3, ...COLD5 } },
];

const COMBO = { ...FREE, baseIncome: 7, ...COLD5 } as const;
const CHEAP2 = ["ac03", "ac04"];
const CHEAP4 = ["ac01", "ac02", "ac03", "ac04"];
const copiesOf = (ids: readonly string[], n: number): CardOverrides => Object.fromEntries(ids.map((id) => [id, { copies: n }]));
const everyCard = (n: number) => (p: CardPack): CardOverrides => copiesOf(p.cards.map((c) => c.id), n);
const without = (pred: (c: CardPack["cards"][number]) => boolean) => (p: CardPack): CardOverrides => copiesOf(p.cards.filter(pred).map((c) => c.id), 0);

/** The deck itself as the variable: more cost-3 shikigami, and the deck's size (2026-10-04). Both on 10/3 and on the 召喚攻撃無料+収入7+5体目で即勝ち combo. */
export const DECK_SET: readonly Variant[] = [
  { id: "base", label: "10/3テスト案(基準・23枚)" },
  { id: "base3x2", label: "10/3: 影鬼・鉞鬼を2枚ずつ(25枚)", cards: () => copiesOf(CHEAP2, 2) },
  { id: "base3x4", label: "10/3: コスト3の4種を2枚ずつ(27枚)", cards: () => copiesOf(CHEAP4, 2) },
  { id: "baseDouble", label: "10/3: 全部2枚ずつ(46枚)", cards: everyCard(2) },
  { id: "baseNoReigu", label: "10/3: 霊具を抜く(17枚)", cards: without((c) => c.kind === "reigu") },
  { id: "combo", label: "組み合わせ(召喚攻撃無料+収入7+5体目即勝ち・23枚)", cfg: { ...COMBO } },
  { id: "combo3x2", label: "組み合わせ+影鬼・鉞鬼を2枚ずつ(25枚)", cfg: { ...COMBO }, cards: () => copiesOf(CHEAP2, 2) },
  { id: "combo3x4", label: "組み合わせ+コスト3の4種を2枚ずつ(27枚)", cfg: { ...COMBO }, cards: () => copiesOf(CHEAP4, 2) },
  { id: "combo3swap", label: "組み合わせ+コスト3を2枚ずつ・玖龍街と酒呑童子を抜く(25枚)", cfg: { ...COMBO }, cards: (p) => ({ ...copiesOf(CHEAP4, 2), ...without((c) => c.id === "ac16" || c.id === "ac17")(p) }) },
  { id: "comboNoTop", label: "組み合わせ+コスト8以上を抜く(19枚)", cfg: { ...COMBO }, cards: without((c) => c.kind === "shikigami" && c.summonCost >= 8) },
  { id: "comboNoReigu", label: "組み合わせ+霊具を抜く(17枚)", cfg: { ...COMBO }, cards: without((c) => c.kind === "reigu") },
  { id: "comboDouble", label: "組み合わせ+全部2枚ずつ(46枚)", cfg: { ...COMBO }, cards: everyCard(2) },
];

const COLD6 = { ...COLD5, instantWinCells: 6 } as const;

/** The combo was too short (1 player ~4 turns): a little longer, the balance kept (2026-10-04). */
export const LENGTH_SET: readonly Variant[] = [
  { id: "base", label: "10/3テスト案(基準)" },
  { id: "combo", label: "組み合わせ(召喚攻撃無料+収入7+5体目即勝ち)", cfg: { ...COMBO } },
  { id: "freeCold5", label: "召喚攻撃無料+5体目即勝ち(収入6のまま)", cfg: { ...FREE, ...COLD5 } },
  { id: "freeInc7Cold6", label: "召喚攻撃無料+収入7+6体目即勝ち", cfg: { ...FREE, baseIncome: 7, ...COLD6 } },
  { id: "freeCold6", label: "召喚攻撃無料+6体目即勝ち(収入6)", cfg: { ...FREE, ...COLD6 } },
  { id: "freeCold6Occ", label: "召喚攻撃無料+6体目即勝ち(占拠で数える・HP11以上は2)", cfg: { ...FREE, ...COLD6, instantWinCount: "occupation" } },
  { id: "freeInc7Cold6Occ", label: "召喚攻撃無料+収入7+6マス即勝ち(占拠で数える)", cfg: { ...FREE, baseIncome: 7, ...COLD6, instantWinCount: "occupation" } },
  { id: "freeInc7Ctl4", label: "召喚攻撃無料+収入7+制圧4マス(即勝ちなし)", cfg: { ...FREE, baseIncome: 7, controlWin: 4 } },
  { id: "freeCtl4", label: "召喚攻撃無料+制圧4マス(収入6)", cfg: { ...FREE, controlWin: 4 } },
  { id: "freeInc7Cold6Mana67", label: "召喚攻撃無料+収入7+6体目即勝ち+初期霊力6/7", cfg: { ...FREE, baseIncome: 7, ...COLD6, startMana: [6, 7] } },
  { id: "freeInc7Cold6Cheap", label: "召喚攻撃無料+収入7+6体目即勝ち+影鬼・鉞鬼2枚", cfg: { ...FREE, baseIncome: 7, ...COLD6 }, cards: () => copiesOf(CHEAP2, 2) },
  { id: "cold6", label: "6体目即勝ちだけ(参考)", cfg: { ...COLD6 } },
];

const COMBO6 = { ...FREE, baseIncome: 7, ...COLD6 } as const;
/** Area attack exactly for the shikigami costing `from` or more (the rest single target), optionally only turning heavies into area. */
const aoeFrom = (from: number, lightSingle: boolean) => (p: CardPack): CardOverrides =>
  Object.fromEntries(
    p.cards
      .filter((c) => c.kind === "shikigami" && c.attackRange.length > 0)
      .flatMap((c): [string, { aoe: boolean }][] => (c.summonCost >= from && !c.aoe ? [[c.id, { aoe: true }]] : lightSingle && c.summonCost < from && c.aoe ? [[c.id, { aoe: false }]] : [])),
  );
const withCheap = (f: (p: CardPack) => CardOverrides) => (p: CardPack): CardOverrides => ({ ...f(p), ...copiesOf(CHEAP2, 2) });

/** 軽いのを並べて、重いので倒す: area attacks only on the heavy cards; 5体目で即勝ち fixed (2026-10-04). */
export const HEAVY_SET: readonly Variant[] = [
  { id: "base", label: "10/3テスト案(基準)" },
  { id: "cold5", label: "5体目で即勝ちだけ(参考)", cfg: { ...COLD5 } },
  { id: "cold5aoe7only", label: "5体目即勝ち+範囲はコスト7以上だけ", cfg: { ...COLD5 }, cards: aoeFrom(7, true) },
  { id: "combo", label: "組み合わせ(召喚攻撃無料+収入7+5体目即勝ち)", cfg: { ...COMBO } },
  { id: "comboAoe7", label: "組み合わせ+コスト7以上を全部範囲に(僵尸公主・茨木童子)", cfg: { ...COMBO }, cards: aoeFrom(7, false) },
  { id: "comboAoe7only", label: "組み合わせ+範囲はコスト7以上だけ(鎖鬼・一目鬼は単体に)", cfg: { ...COMBO }, cards: aoeFrom(7, true) },
  { id: "comboAoe6only", label: "組み合わせ+範囲はコスト6以上だけ(雲外鏡・照魔鏡も範囲)", cfg: { ...COMBO }, cards: aoeFrom(6, true) },
  { id: "comboAoe7onlyCheap", label: "組み合わせ+範囲はコスト7以上だけ+影鬼・鉞鬼2枚", cfg: { ...COMBO }, cards: withCheap(aoeFrom(7, true)) },
  { id: "comboAoe7onlyBigHp", label: "組み合わせ+範囲はコスト7以上だけ+コスト7以上のHP+1", cfg: { ...COMBO }, cards: (p) => {
    const a = aoeFrom(7, true)(p);
    const h = costAtLeast(7, 1)(p);
    return Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(h)])].map((id) => [id, { ...(a[id] ?? {}), ...(h[id] ?? {}) }]));
  } },
  { id: "comboAoe7onlyAtkDown", label: "組み合わせ+範囲はコスト7以上だけ+攻撃コスト−1", cfg: { ...COMBO, attackCostDelta: -1 }, cards: aoeFrom(7, true) },
  { id: "freeCold5Aoe7only", label: "召喚攻撃無料+5体目即勝ち(収入6)+範囲はコスト7以上だけ", cfg: { ...FREE, ...COLD5 }, cards: aoeFrom(7, true) },
];

/** 5体目で即勝ち fixed: lengthen by capping summons per turn (2026-10-04). */
export const LIMIT_SET: readonly Variant[] = [
  { id: "base", label: "10/3テスト案(基準)" },
  { id: "combo", label: "組み合わせ(召喚攻撃無料+収入7+5体目即勝ち)", cfg: { ...COMBO } },
  { id: "comboL2", label: "組み合わせ+召喚は1ターン2体まで", cfg: { ...COMBO, summonLimit: 2 } },
  { id: "comboL1", label: "組み合わせ+召喚は1ターン1体まで", cfg: { ...COMBO, summonLimit: 1 } },
  { id: "comboL1Aoe7only", label: "組み合わせ+1ターン1体まで+範囲はコスト7以上だけ", cfg: { ...COMBO, summonLimit: 1 }, cards: aoeFrom(7, true) },
  { id: "freeCold5L1", label: "召喚攻撃無料+5体目即勝ち(収入6)+1ターン1体まで", cfg: { ...FREE, ...COLD5, summonLimit: 1 } },
  { id: "freeCold5L1Aoe7only", label: "召喚攻撃無料+5体目即勝ち(収入6)+1体まで+範囲はコスト7以上だけ", cfg: { ...FREE, ...COLD5, summonLimit: 1 }, cards: aoeFrom(7, true) },
  { id: "cold5L1", label: "5体目即勝ち+1ターン1体まで(召喚攻撃は有料)", cfg: { ...COLD5, summonLimit: 1 } },
  { id: "comboL1Mana67", label: "組み合わせ+1ターン1体まで+初期霊力6/7", cfg: { ...COMBO, summonLimit: 1, startMana: [6, 7] } },
];

const L2 = { ...COLD5, summonLimit: 2 } as const;

/** Fixed (2026-10-04): 5体目で即勝ち and at most 2 summons a turn. What else to put on top. */
export const LIMIT2_SET: readonly Variant[] = [
  { id: "base", label: "10/3テスト案(基準)" },
  { id: "l2", label: "5体目即勝ち+召喚2体まで", cfg: { ...L2 } },
  { id: "l2Free", label: "+召喚攻撃無料(収入6)", cfg: { ...L2, ...FREE } },
  { id: "l2FreeInc7", label: "+召喚攻撃無料+収入7", cfg: { ...L2, ...FREE, baseIncome: 7 } },
  { id: "l2FreeInc7Aoe7", label: "+召喚攻撃無料+収入7+範囲はコスト7以上だけ", cfg: { ...L2, ...FREE, baseIncome: 7 }, cards: aoeFrom(7, true) },
  { id: "l2FreeInc7Aoe6", label: "+召喚攻撃無料+収入7+範囲はコスト6以上だけ", cfg: { ...L2, ...FREE, baseIncome: 7 }, cards: aoeFrom(6, true) },
  { id: "l2FreeInc7Cheap", label: "+召喚攻撃無料+収入7+影鬼・鉞鬼2枚", cfg: { ...L2, ...FREE, baseIncome: 7 }, cards: () => copiesOf(CHEAP2, 2) },
  { id: "l2FreeInc7Mana67", label: "+召喚攻撃無料+収入7+初期霊力6/7", cfg: { ...L2, ...FREE, baseIncome: 7, startMana: [6, 7] } },
  { id: "l2FreeInc7AtkDown", label: "+召喚攻撃無料+収入7+攻撃コスト−1", cfg: { ...L2, ...FREE, baseIncome: 7, attackCostDelta: -1 } },
  { id: "l2Aoe7", label: "+範囲はコスト7以上だけ(召喚攻撃は有料)", cfg: { ...L2 }, cards: aoeFrom(7, true) },
  { id: "l2Mana67", label: "+初期霊力6/7(召喚攻撃は有料)", cfg: { ...L2, startMana: [6, 7] } },
];

const COST3 = ["ac01", "ac02", "ac03", "ac04"];
const merge = (...fs: ((p: CardPack) => CardOverrides)[]) => (p: CardPack): CardOverrides => {
  const out: CardOverrides = {};
  for (const f of fs) for (const [id, e] of Object.entries(f(p))) out[id] = { ...(out[id] ?? {}), ...e };
  return out;
};
const cost3to4 = (): CardOverrides => Object.fromEntries(COST3.map((id) => [id, { summonCost: 4 }]));
/** 鬼の範囲を減らす: 首引の姫鬼・両面を単体に (鬼の範囲は鎖鬼・一目鬼・酒呑童子の3枚), 出番の少ない両面 HP+2・酒呑童子 HP+1. */
const oniLessArea = (): CardOverrides => ({ ac12: { aoe: false }, ac14: { aoe: false, hp: 10 }, ac16: { hp: 12 } });
const HOLD_POINTS3 = { controlWinMode: "hold_points", controlPointsToWin: 3 } as const;

/** The 2026-10-05 team ideas, side by side (お祈り度 and the 制圧 conversion in the report). */
export const TEAM_SET: readonly Variant[] = [
  { id: "base", label: "10/3テスト案(基準)" },
  { id: "cold5", label: "5体目で即勝ち", cfg: { ...COLD5 } },
  { id: "cold5Cost4", label: "5体目即勝ち+3コスを無くす(4種を4コストに)", cfg: { ...COLD5 }, cards: cost3to4 },
  { id: "baseCost4", label: "10/3: 3コスを無くす(4種を4コストに)", cards: cost3to4 },
  { id: "cold5LightHeavy", label: "5体目即勝ち+低コスは単体・高コスは範囲+低コス4種を2枚ずつ", cfg: { ...COLD5 }, cards: merge(aoeFrom(7, true), () => copiesOf(COST3, 2)) },
  { id: "comboLightHeavy", label: "上+召喚攻撃無料+収入7", cfg: { ...COMBO }, cards: merge(aoeFrom(7, true), () => copiesOf(COST3, 2)) },
  { id: "oni", label: "10/3: 鬼の範囲を減らす(姫鬼・両面を単体に)+両面HP+2・酒呑HP+1", cards: oniLessArea },
  { id: "oniDial", label: "上+ダイヤル", cfg: { incomeMode: "current" }, cards: oniLessArea },
  { id: "cold5Oni", label: "5体目即勝ち+鬼の範囲を減らす", cfg: { ...COLD5 }, cards: oniLessArea },
  { id: "dial", label: "10/3: ダイヤル", cfg: { incomeMode: "current" } },
  { id: "valid3", label: "10/3: 制圧を渡すたびに有効、有効3回でも勝ち", cfg: { ...HOLD_POINTS3 } },
  { id: "valid2", label: "10/3: 有効2回でも勝ち", cfg: { ...HOLD_POINTS3, controlPointsToWin: 2 } },
  { id: "valid3Oni", label: "有効3回+鬼の範囲を減らす", cfg: { ...HOLD_POINTS3 }, cards: oniLessArea },
  { id: "valid3Dial", label: "有効3回+ダイヤル", cfg: { ...HOLD_POINTS3, incomeMode: "current" } },
];

/** りゅー案: 低コスは単体で並べる、高コスは範囲で倒す (5体目で即勝ち・召喚2体まで fixed). */
const RYU = { ...COLD5, summonLimit: 2 } as const;
const ryuCards = merge(aoeFrom(7, true), () => copiesOf(COST3, 2));
const heavyCost = (d: number) => (p: CardPack): CardOverrides =>
  Object.fromEntries(p.cards.filter((c) => c.kind === "shikigami" && c.summonCost >= 7).map((c) => [c.id, { summonCost: c.summonCost + d }]));
const UNDER = (n: number) => ({ underdogDiscount: n, underdogDiscountMinCost: 7, underdogBy: "cells" }) as const;

export const RYU_SET: readonly Variant[] = [
  { id: "base", label: "10/3テスト案(基準)" },
  { id: "ryu", label: "りゅー案(5体目・2体まで・低コス単体×2枚・高コス範囲)", cfg: { ...RYU }, cards: ryuCards },
  { id: "ryuU2", label: "+負けている側は高コス−2", cfg: { ...RYU, ...UNDER(2) }, cards: ryuCards },
  { id: "ryuU3", label: "+負けている側は高コス−3", cfg: { ...RYU, ...UNDER(3) }, cards: ryuCards },
  { id: "ryuH1", label: "+高コスを全部−1", cfg: { ...RYU }, cards: merge(ryuCards, heavyCost(-1)) },
  { id: "ryuH1U2", label: "+高コス全部−1+負けている側は−2", cfg: { ...RYU, ...UNDER(2) }, cards: merge(ryuCards, heavyCost(-1)) },
  { id: "ryuU2Free", label: "+負けている側は高コス−2+召喚攻撃無料", cfg: { ...RYU, ...UNDER(2), ...FREE }, cards: ryuCards },
  { id: "ryuU3Free", label: "+負けている側は高コス−3+召喚攻撃無料", cfg: { ...RYU, ...UNDER(3), ...FREE }, cards: ryuCards },
  { id: "ryuU2FreeInc7", label: "+負けている側は高コス−2+召喚攻撃無料+収入7", cfg: { ...RYU, ...UNDER(2), ...FREE, baseIncome: 7 }, cards: ryuCards },
  { id: "ryuU3FreeMana67", label: "+負けている側は高コス−3+召喚攻撃無料+初期霊力6/7", cfg: { ...RYU, ...UNDER(3), ...FREE, startMana: [6, 7] }, cards: ryuCards },
  { id: "ryuU2Mana69", label: "+負けている側は高コス−2+後手の初期霊力9", cfg: { ...RYU, ...UNDER(2), startMana: [6, 9] }, cards: ryuCards },
  { id: "ryu1copyU2", label: "りゅー案(低コス1枚のまま)+負けている側は高コス−2", cfg: { ...RYU, ...UNDER(2) }, cards: aoeFrom(7, true) },
];

const SETS: Record<string, readonly Variant[]> = { single: VARIANTS, freeAtk: FREE_ATK_COMBOS, deck: DECK_SET, length: LENGTH_SET, heavy: HEAVY_SET, limit: LIMIT_SET, limit2: LIMIT2_SET, team: TEAM_SET, ryu: RYU_SET };
const SET_NAME = (() => {
  const i = process.argv.indexOf("--set");
  return i === -1 ? "single" : (process.argv[i + 1] ?? "single");
})();
const V: readonly Variant[] = SETS[SET_NAME] ?? VARIANTS;

/** The AIs: depth (速い / 深い / 強い) x style (陣取り / 攻め / 均衡). */
export const AIS: readonly { id: string; label: string; kind: "greedy" | "beam" | "strong"; style: string }[] = [
  { id: "greedy-terr", label: "速い・陣取り", kind: "greedy", style: "territorial" },
  { id: "greedy-aggr", label: "速い・攻め", kind: "greedy", style: "aggressive" },
  { id: "beam-bal", label: "深い・均衡", kind: "beam", style: "balanced" },
  { id: "strong-terr", label: "強い・陣取り", kind: "strong", style: "territorial" },
  { id: "strong-aggr", label: "強い・攻め", kind: "strong", style: "aggressive" },
];

// ------------------------------------------------------------------ one game

/**
 * checkTurns / checkWins: own turns begun on 3 units under the unit-count コールド勝ち, and how many of them
 * that player won before the turn passed (お祈り度: a low share = the check often fails on the draw).
 * reachGains / reachWins: 制圧 handed over at an own turn end, and how many were then won (held or by 制圧点).
 */
type Game = {
  seed: number; round: number; winner: 0 | 1 | null; end: string; kills: number; checkTurns: number; checkWins: number; reachGains: number; reachWins: number;
  /** Kills made by attacks of shikigami costing 7 or more. */
  heavyKills?: number;
  /** The winner was 2+ units behind at one of its own turn starts after round 1 (巻き返し). */
  comeback?: boolean;
};

const runJob = (vi: number, ai: number, from: number, to: number): Game[] => {
  const v = V[vi];
  const a = AIS[ai];
  const printed = loadPack(packPath("adopted-1003"));
  const pack = v.cards === undefined ? printed : applyCardOverrides(printed, v.cards(printed));
  const ctx = makeCtx(presetConfig("r1003", v.cfg ?? {}), pack);
  const out: Game[] = [];
  for (let seed = from; seed < to; seed++) {
    const mk = () => makeAi(a.kind, a.style, { strong: { timeLimitMs: 60000 } });
    const { events, state } = runGame(ctx, [mk(), mk()], seed, true);
    let round = state.round;
    let kills = 0;
    let checkTurns = 0;
    let checkWins = 0;
    let reachGains = 0;
    let reachWins = 0;
    const alive = new Map<number, number>();
    let heavyKills = 0;
    const behindAt: [boolean, boolean] = [false, false];
    let checking: number | null = null;
    const unitWin = ctx.cfg.instantWinCells > 0 && ctx.cfg.instantWinCount === "units";
    for (const e of events) {
      if (e.t === "gameEnd") {
        round = e.round;
        if (checking !== null && e.winner === checking) checkWins += 1;
      }
      if (e.t === "destroy") {
        kills += 1;
        alive.delete(e.uid);
      }
      if (e.t === "summon") {
        if (e.inheritedFrom !== undefined) alive.delete(e.inheritedFrom.uid);
        alive.set(e.uid, e.player);
      }
      if (e.t === "attack" && (ctx.pack.byId.get(e.cardId)?.summonCost ?? 0) >= 7) heavyKills += e.hits.filter((h) => h.destroyed && h.owner !== e.player).length;
      if (e.t === "turnStart" && e.round > 1) {
        const mine = [...alive.values()].filter((o) => o === e.player).length;
        const theirs = [...alive.values()].filter((o) => o !== e.player).length;
        if (theirs - mine >= 2) behindAt[e.player] = true;
      }
      if (e.t === "turnStart") {
        checking = unitWin && [...alive.values()].filter((o) => o === e.player).length === ctx.cfg.instantWinCells - 2 ? e.player : null;
        if (checking !== null) checkTurns += 1;
      }
      // under the unit-count コールド勝ち the win events are not 制圧 conversions
      if (!unitWin && e.t === "control" && e.change === "gain") reachGains += 1;
      if (!unitWin && e.t === "control" && e.change === "win") reachWins += 1;
    }
    const winner = state.winner as 0 | 1 | null;
    out.push({ seed, round, winner, end: state.winType ?? "none", kills, checkTurns, checkWins, reachGains, reachWins, heavyKills, comeback: winner !== null && behindAt[winner] });
  }
  return out;
};

// ------------------------------------------------------------------ numbers

const median = (xs: number[]): number => {
  const a = xs.slice().sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 === 1 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const quantile = (xs: number[], q: number): number => xs.slice().sort((x, y) => x - y)[Math.min(xs.length - 1, Math.floor(q * xs.length))];
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Mean of the paired differences and its 95% interval (bootstrap over seeds, fixed RNG). */
const pairedDelta = (a: number[], b: number[]): { d: number; lo: number; hi: number } => {
  const diffs = a.map((x, i) => b[i] - x);
  let r = 12345;
  const rnd = (): number => {
    r = (Math.imul(r, 1103515245) + 12345) >>> 0;
    return r / 4294967296;
  };
  const boots: number[] = [];
  for (let k = 0; k < 1000; k++) {
    let s = 0;
    for (let i = 0; i < diffs.length; i++) s += diffs[Math.floor(rnd() * diffs.length)];
    boots.push(s / diffs.length);
  }
  boots.sort((x, y) => x - y);
  return { d: mean(diffs), lo: boots[25], hi: boots[974] };
};

type Cell = {
  games: number;
  median: number;
  p90: number;
  mean: number;
  long: number;
  firstWin: number;
  draws: number;
  ends: Record<string, number>;
  kills: number;
  /** お祈り度: of the turns begun on 3 units (5体目で即勝ち), the share won that turn; null when the rule is off. */
  checkRate: number | null;
  /** Of the 制圧 handed over, the share that went on to win. */
  reachRate: number | null;
  /** Share of all kills made by the heavy (cost 7+) shikigami. */
  heavyKillShare: number;
  /** Share of decided games the winner had been 2+ units behind (巻き返し). */
  comebackRate: number;
  delta: { d: number; lo: number; hi: number } | null;
  firstWinDelta: number | null;
};

const cellOf = (gs: Game[], base: Game[] | null): Cell => {
  const rounds = gs.map((g) => g.round);
  const decided = gs.filter((g) => g.winner !== null);
  const ends: Record<string, number> = {};
  for (const g of gs) ends[g.end] = (ends[g.end] ?? 0) + 1 / gs.length;
  const firstWin = decided.length === 0 ? 0 : decided.filter((g) => g.winner === 0).length / decided.length;
  const baseFirst = base === null ? null : (() => {
    const d = base.filter((g) => g.winner !== null);
    return d.length === 0 ? 0 : d.filter((g) => g.winner === 0).length / d.length;
  })();
  return {
    games: gs.length,
    median: median(rounds),
    p90: quantile(rounds, 0.9),
    mean: mean(rounds),
    long: gs.filter((g) => g.round > 10).length / gs.length,
    firstWin,
    draws: 1 - decided.length / gs.length,
    ends,
    kills: mean(gs.map((g) => g.kills)),
    heavyKillShare: (() => {
      const k = gs.reduce((n, g) => n + g.kills, 0);
      return k === 0 ? 0 : gs.reduce((n, g) => n + (g.heavyKills ?? 0), 0) / k;
    })(),
    comebackRate: decided.length === 0 ? 0 : decided.filter((g) => g.comeback === true).length / decided.length,
    checkRate: (() => {
      const t = gs.reduce((n, g) => n + (g.checkTurns ?? 0), 0);
      return t === 0 ? null : gs.reduce((n, g) => n + (g.checkWins ?? 0), 0) / t;
    })(),
    reachRate: (() => {
      const t = gs.reduce((n, g) => n + (g.reachGains ?? 0), 0);
      return t === 0 ? null : gs.reduce((n, g) => n + (g.reachWins ?? 0), 0) / t;
    })(),
    delta: base === null ? null : pairedDelta(base.map((g) => g.round), rounds),
    firstWinDelta: baseFirst === null ? null : firstWin - baseFirst,
  };
};

// ------------------------------------------------------------------ report

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
const pct = (x: number): string => `${Math.round(x * 100)}%`;
const sgn = (x: number, digits = 2): string => `${x > 0 ? "+" : x < 0 ? "−" : "±"}${Math.abs(x).toFixed(digits)}`;

/** Agree: every AI's interval is on the same side of 0. */
const verdict = (cells: Cell[]): "faster" | "slower" | "split" | "none" => {
  const ds = cells.map((c) => c.delta!);
  if (ds.every((d) => d.hi < 0)) return "faster";
  if (ds.every((d) => d.lo > 0)) return "slower";
  if (ds.every((d) => d.lo <= 0 && d.hi >= 0)) return "none";
  return ds.some((d) => d.hi < 0) && ds.some((d) => d.lo > 0) ? "split" : "none";
};

const VERDICT_TEXT = { faster: "速くなる(全AI一致)", slower: "遅くなる(全AI一致)", split: "AIで向きが割れる", none: "はっきりした差なし" } as const;

const reportHtml = (res: Cell[][], games: number, seconds: number): string => {
  const rows = V.map((v, vi) => ({ v, cells: res[vi] })).slice(1);
  const avgAbs = (cells: Cell[]): number => mean(cells.map((c) => Math.abs(c.delta!.d)));
  rows.sort((a, b) => avgAbs(b.cells) - avgAbs(a.cells));
  const maxD = Math.max(0.5, ...rows.flatMap((r) => r.cells.map((c) => Math.max(Math.abs(c.delta!.lo), Math.abs(c.delta!.hi)))));
  const bar = (c: Cell): string => {
    const d = c.delta!;
    const x = (v: number): number => 50 + (v / maxD) * 50;
    const sure = d.hi < 0 || d.lo > 0;
    return `<div class="bar" title="${sgn(d.d)}ラウンド(95%: ${sgn(d.lo)}〜${sgn(d.hi)})"><i class="zero"></i><i class="ci" style="left:${x(Math.min(d.lo, d.hi))}%;width:${Math.max(0.6, x(Math.max(d.lo, d.hi)) - x(Math.min(d.lo, d.hi)))}%"></i><i class="pt ${d.d < 0 ? "fast" : "slow"}${sure ? "" : " unsure"}" style="left:${x(d.d)}%"></i></div><span class="num">${sgn(d.d)}</span>`;
  };
  const baseRow = res[0];
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>決着の速さの感度</title>
<style>
:root{--bg:#14151b;--fg:#ece6d6;--dim:#9a9486;--line:#2c2e38;--gold:#d7b565;--fast:#5fb8a8;--slow:#d9785b;}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){--bg:#f7f3ea;--fg:#22201b;--dim:#6d675b;--line:#ddd4c2;--gold:#9a7424;--fast:#1f8a78;--slow:#b8532f;}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.6 "Zen Kaku Gothic New","Hiragino Sans",sans-serif;padding:24px 16px 60px}
h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:28px 0 8px;color:var(--gold)} p.note{color:var(--dim);margin:4px 0;max-width:72em}
.wrap{overflow-x:auto} table{border-collapse:collapse;font-variant-numeric:tabular-nums;min-width:980px}
th,td{padding:5px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle;white-space:nowrap}
thead th{font-weight:400;color:var(--dim);font-size:12px}
td.ai{min-width:150px}.bar{position:relative;display:inline-block;width:110px;height:12px;vertical-align:middle}
.bar .zero{position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:var(--dim)}
.bar .ci{position:absolute;top:4px;height:4px;background:var(--line)}
.bar .pt{position:absolute;top:1px;width:10px;height:10px;margin-left:-5px;border-radius:50%}
.pt.fast{background:var(--fast)}.pt.slow{background:var(--slow)}.pt.unsure{opacity:.35}
.num{display:inline-block;width:46px;text-align:right;font-size:12px;color:var(--dim)}
.v-faster{color:var(--fast);font-weight:700}.v-slower{color:var(--slow);font-weight:700}.v-split{color:var(--gold);font-weight:700}.v-none{color:var(--dim)}
.fw{font-size:12px;color:var(--dim)}
</style></head><body>
<h1>${SET_NAME === "single" ? "決着の速さの感度(10/3テスト案から1つずつ動かす)" : SET_NAME === "deck" ? "デッキの構成と枚数(10/3テスト案と比べる)" : SET_NAME === "length" ? "組み合わせ案を少し長くする(10/3テスト案と比べる)" : SET_NAME === "heavy" ? "軽いのを並べて重いので倒す: 範囲攻撃を重い札に(10/3テスト案と比べる)" : SET_NAME === "limit" ? "5体目で即勝ちのまま、1ターンの召喚数で長さを調える(10/3テスト案と比べる)" : SET_NAME === "limit2" ? "5体目で即勝ち・召喚2体まで(固定)の上に何を足すか(10/3テスト案と比べる)" : SET_NAME === "team" ? "10/5のチームの案を並べる(10/3テスト案と比べる)" : SET_NAME === "ryu" ? "低コスを並べて勝つ・高コスで倒して巻き返す、を通す調整(10/3テスト案と比べる)" : "召喚攻撃無料を軸にした組み合わせ(10/3テスト案と比べる)"}</h1>
<p class="note">各案・各AIで${games}局ずつ。どの案も同じ乱数の種(同じ配り)で対局させ、基準との差を局ごとに取っています。数字は決着ラウンドの平均の差(マイナス=速く決着)。点がうすいのは95%の幅が0をまたぐ(差があると言い切れない)もの。全部のAIで同じ向きに言い切れた変数だけ「一致」と書きます。計算 ${Math.round(seconds / 60)}分。</p>
<h2>基準(10/3テスト案)</h2>
<div class="wrap"><table><thead><tr><th>AI</th><th>決着ラウンド 中央値</th><th>遅い1割</th><th>第10ラウンド超</th><th>先手勝率</th><th>引き分け</th><th>撃破/局</th><th>決着の仕方</th></tr></thead><tbody>
${AIS.map((a, ai) => {
  const c = baseRow[ai];
  return `<tr><td>${esc(a.label)}</td><td>第${c.median}ラウンド</td><td>第${c.p90}ラウンド</td><td>${pct(c.long)}</td><td>${pct(c.firstWin)}</td><td>${pct(c.draws)}</td><td>${c.kills.toFixed(1)}</td><td class="fw">${Object.entries(c.ends).map(([k, x]) => `${END_WORD[k] ?? k} ${pct(x)}`).join("・")}</td></tr>`;
}).join("")}
</tbody></table></div>
<h2>効きの大きい順</h2>
<div class="wrap"><table><thead><tr><th>変えたもの</th><th>判定</th>${AIS.map((a) => `<th>${esc(a.label)}</th>`).join("")}<th>先手勝率(AIごと)</th><th>3体からその番に決めた割合(AIごと)</th><th>渡した制圧が勝ちになった割合(AIごと)</th><th>撃破のうち重い札(7+)によるもの</th><th>2体以上負けていた側の逆転</th></tr></thead><tbody>
${rows.map(({ v, cells }) => {
  const vd = verdict(cells);
  return `<tr><td>${esc(v.label)}</td><td class="v-${vd}">${VERDICT_TEXT[vd]}</td>${cells.map((c) => `<td class="ai">${bar(c)}</td>`).join("")}<td class="fw">${cells.map((c) => pct(c.firstWin)).join(" / ")}<br>(基準から ${cells.map((c) => sgn((c.firstWinDelta ?? 0) * 100, 0)).join(" / ")})</td><td class="fw">${cells.map((c) => (c.checkRate === null ? "—" : pct(c.checkRate))).join(" / ")}</td><td class="fw">${cells.map((c) => (c.reachRate === null ? "—" : pct(c.reachRate))).join(" / ")}</td><td class="fw">${cells.map((c) => pct(c.heavyKillShare ?? 0)).join(" / ")}</td><td class="fw">${cells.map((c) => pct(c.comebackRate ?? 0)).join(" / ")}</td></tr>`;
}).join("")}
</tbody></table></div>
<p class="note">読み方: 「速くなる(全AI一致)」はAIの癖に左右されにくい結果。「AIで向きが割れる」はAIの打ち方しだいで逆の結果になったもので、人のテストで確かめる必要があります。先手勝率の変化が大きいものは、速くなっても先後の釣り合いを崩します。</p>
</body></html>`;
};

const END_WORD: Record<string, string> = { control: "制圧", deck_out: "山札切れ", life: "生命", turn_limit: "ラウンド上限", none: "決着なし" };

// ------------------------------------------------------------------ driver

const argOf = (k: string, d: string): string => {
  const i = process.argv.indexOf(k);
  return i === -1 ? d : (process.argv[i + 1] ?? d);
};

const runChild = (args: string[]): Promise<Game[]> =>
  new Promise((ok, fail) => {
    const p = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", fileURLToPath(import.meta.url), ...args, "--set", SET_NAME], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    p.stdout.on("data", (b: Buffer) => (out += b.toString()));
    p.on("close", (code) => (code === 0 ? ok(JSON.parse(out) as Game[]) : fail(new Error(`job ${args.join(" ")} exited ${code}`))));
  });

const main = async (): Promise<void> => {
  const games = Number(argOf("--games", "1200"));
  const outDir = resolve(argOf("--out", join(HERE, "..", "out", SET_NAME === "single" ? "speed-sweep" : `speed-sweep-${SET_NAME}`)));
  const chunk = 300;
  const jobs: { vi: number; ai: number; from: number; to: number }[] = [];
  for (let vi = 0; vi < V.length; vi++)
    for (let ai = 0; ai < AIS.length; ai++)
      for (let from = SEED0; from < SEED0 + games; from += chunk) jobs.push({ vi, ai, from, to: Math.min(SEED0 + games, from + chunk) });
  // the slow ones first, so the pool does not end on one long job
  jobs.sort((a, b) => (AIS[b.ai].kind === "strong" ? 1 : 0) - (AIS[a.ai].kind === "strong" ? 1 : 0));
  const got: Game[][][] = V.map(() => AIS.map(() => []));
  const started = Date.now();
  let next = 0;
  let done = 0;
  const lanes = Math.max(1, availableParallelism() - 2);
  await Promise.all(
    Array.from({ length: lanes }, async () => {
      while (next < jobs.length) {
        const j = jobs[next++];
        const gs = await runChild(["--job", String(j.vi), String(j.ai), String(j.from), String(j.to)]);
        got[j.vi][j.ai].push(...gs);
        done += 1;
        if (done % 20 === 0 || done === jobs.length) process.stderr.write(`${done}/${jobs.length} jobs, ${Math.round((Date.now() - started) / 1000)}s\n`);
      }
    }),
  );
  for (const row of got) for (const cell of row) cell.sort((a, b) => a.seed - b.seed);
  const res: Cell[][] = got.map((row, vi) => row.map((gs, ai) => cellOf(gs, vi === 0 ? null : got[0][ai])));
  const seconds = (Date.now() - started) / 1000;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "results.json"), JSON.stringify({ games, seed: SEED0, variants: V.map(({ id, label, cfg }) => ({ id, label, cfg })), ais: AIS, cells: res }, null, 1));
  writeFileSync(join(outDir, "report.html"), reportHtml(res, games, seconds));
  process.stderr.write(`wrote ${outDir} in ${Math.round(seconds)}s\n`);
};

if (process.argv[2] === "--job") {
  const [vi, ai, from, to] = process.argv.slice(3).map(Number);
  process.stdout.write(JSON.stringify(runJob(vi, ai, from, to)));
} else {
  void main();
}
