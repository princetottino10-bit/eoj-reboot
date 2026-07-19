> **[strict紀元]** 旧配置ルール(自軍隣接のみ)での測定。2026-07-19の紙ルール改元以前の基準であり、現行の判断にはpaper紀元の測定を使うこと。

> **[旧環境・参考値]** 実カード形状込みの感度測定。回転一律1は未採用。

# Rotation Cost Sensitivity v1

Date: 2026-07-05

## Purpose

Keep the vanilla baseline v1 rule structure fixed and test whether numeric rotation-cost reductions can activate rotation/reorientation play.

This started as a sensitivity test. After accepting an average game length around 12 rounds, R1 was promoted to vanilla baseline v1.1. Vanilla baseline v1 remains frozen as the control group.

## Fixed Conditions

- Base curve: `standard/high/heavy/light/life134`
- Games: 2000 per variant
- Seed: `20260702`
- Second player starting mana: `+1`
- Mana gain/cap: `+3` / `15`
- Life: `15`
- Physical blind-spot damage: `+2`
- Check-search depth: `6`
- Oracle metrics: enabled
- Effects/items: ignored

Rotation cost is derived from the final attack reactivation cost after shape tax.

## Variants

| Variant | Attack reactivation | Rotation cost |
|---|---|---|
| A0 | heavy: `2/3/3/4/4/5` | same as attack |
| A1 | standard: `2/2/3/3/4/4` | same as attack |
| A2 | light: `1/2/2/3/3/3` | same as attack |
| R1 | heavy | fixed `1` |
| R2 | heavy | attack cost `-2`, minimum `1` |

## Results

| Variant | Avg R | Median | P90 | Territory | Life | First win | 4-check return | High-cost 4-return | Kills | Rotations | Rotation share | Weak kill |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| A0 | 10.22 | 8.5 | 15.5 | 95.0% | 2.6% | 50.6% | 46.7% | 39.4% | 6.1 | 2.4 | 35.6% | 67.5% |
| A1 | 12.98 | 9.5 | 27.0 | 85.5% | 5.0% | 48.3% | 37.8% | 33.2% | 7.1 | 6.9 | 56.3% | 65.3% |
| A2 | 14.38 | 10.0 | 40.0 | 79.8% | 7.5% | 47.1% | 37.1% | 30.8% | 8.1 | 9.0 | 57.7% | 63.1% |
| R1 | 11.86 | 9.5 | 22.5 | 89.6% | 7.1% | 50.7% | 53.4% | 45.5% | 7.5 | 7.6 | 57.2% | 63.6% |
| R2 | 12.73 | 10.0 | 23.5 | 89.8% | 4.5% | 50.7% | 42.9% | 34.2% | 7.3 | 8.1 | 59.6% | 64.9% |

Raw result file: `docs/baselines/rotation-cost-sensitivity-v1-results.json`

## Reading

- A0 is still the cleanest strict vanilla baseline. It keeps average rounds, first-player rate, territory wins, and 4-check return rate in the original intended band, but rotations stay low at 2.4/game.
- If average 12 rounds is acceptable, R1 becomes the strongest rotation-active candidate. It reaches 7.6 rotations/game while keeping first-player rate stable and improving 4-check return to 53.4%.
- R1's tradeoffs are a longer P90 tail, territory just below 90%, and life wins at 7.1%. These are acceptable only if the design goal shifts from "fastest clean baseline" to "more orientation play."
- R2 also activates rotation, but is worse than R1 for game length and high-cost 4-check return.
- A1/A2 confirm that lowering attack and rotation together is not a good direction. Rotation rises, but games stretch, territory wins fall, first-player rate drops below target, and 4-check return falls out of band.

## Recommendation

Keep vanilla baseline v1 as the frozen control, and use R1 as vanilla baseline v1.1 for rotation-active testing.

R1 is the best answer if the target experience values rotation/reorientation more than a 10-round average. Its dedicated snapshot is `docs/baselines/vanilla-baseline-v1.1-r1.md`.

The current diagnosis is: cost is one cause of low rotation, and fixed rotation cost 1 is the only tested numeric change that clearly solves it. The next useful test is R1 plus the minimum effect/item layer, then compare it against A0 using the same seed and KPI table.
