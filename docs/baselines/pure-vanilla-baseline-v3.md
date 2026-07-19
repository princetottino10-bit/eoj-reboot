> **[strict紀元]** 旧配置ルール(自軍隣接のみ)での測定。2026-07-19の紙ルール改元以前の基準であり、現行の判断にはpaper紀元の測定を使うこと。

# Pure Vanilla Baseline v3

Date: 2026-07-05T13:23:27.607Z

## Frozen Configuration

| Item | Value |
|---|---|
| Plan | A |
| HP curve | hybrid: 2/3/4/6/7/8 |
| ATK curve | high: 1/2/2/3/3/4 |
| Reactivation curve | heavy: 2/3/3/4/4/5 |
| Distribution | lowmid: C2:4 C3:4 C4:4 C5:2 C6:1 C7:1 |
| START_MANA_FIRST | 3 |
| START_MANA_SECOND | 4 |
| DESTROY_MANA_GAIN | 1 |
| Items/effects | Not implemented in this pure-body baseline |

## Reproduction

```powershell
node scripts\explore-stat-curves.cjs --phase2a-freeze-a --seed 20260702
```

| Artifact | Value |
|---|---|
| Repo HEAD | `f91a33e91f4f6b7285b93568e29a19d4b5bbcf73` |
| Script SHA256 | `ece9776e4c06df1744b258763cb3de2c5aa25b401bb31def50ce029aa34c446e` |
| Result JSON SHA256 | `de870c8a6f6e657f889c5210c7936a60d09dc832b67d84e6291d07a1dab82568` |
| Result JSON | `C:\Projects\codex\eoj-reboot\docs\baselines\pure-vanilla-baseline-v3-results.json` |
| Seed | 20260702 |
| Oracle / depth | yes / 6 |

## Rule Notes

- Rotation is limited to once per creature per turn.
- A creature destroyed during destruction judgment does not counterattack.
- The owner of a creature sent from board to discard gains `DESTROY_MANA_GAIN`.
- This is a pure-body baseline with no items, shapes, or effects. Average rounds are lower-side by design; Phase2b will test pure item inclusion with a target of roughly 8.5-10R.

## Center Mirror

Samples: 2000

| KPI | Confirmed Band | Value | Status |
|---|---:|---:|---|
| Avg rounds | 7-10 | 7.64 | inside |
| P90 rounds | <=14 | 10.0 | inside |
| Territory win | >=95% | 100.0% | inside |
| Timeout | 0% | 0.0% | inside |
| P0 win | 50-53% | 48.4% | outside |
| 4-check return | 45-55% | 51.2% | inside |
| Oracle realization | >=95% | 100.0% | inside |
| Kills/game | 3.5-6 | 4.2 | inside |
| Attack reactivation/game | 2.5-4.5 | 2.4 | outside |
| Weak kill | >=45% | 46.0% | inside |
| Stall turn | <=20% | 16.5% | inside |
| Mana utilization | >=87% | 90.3% | inside |
| Board3 median | <=4R | 3.5 | inside |
| Life win | logged | 0.0% | log |
| Rotations/game | logged only | 0.3 | log |
| Deck reshuffle | logged | 0.1% | log |

## Robustness Results

Samples per variant: 1000

Neighborhood rules match the Phase2a robustness test: 4 neighbor mirrors plus 8 cross matchups against the center distribution.

| Rank | Variant | Score | AvgR | P90 | Terr | Life | Timeout | P0 | 4Ret | Oracle | Realized | Kills | AtkReact | WeakKill | Stall | ManaUse | Board3Med | Rot | Reshuffle | Notes |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | R_mirror_heavier_step1 | 1.70 | 7.63 | 10.5 | 100.0% | 0.0% | 0.0% | 51.9% | 50.5% | 50.5% | 100.0% | 3.9 | 2.4 | 47.3% | 18.3% | 90.9% | 3.5 | 0.2 | 0.2% | Move two cards from the lowest available costs up by one cost. Mirror: C2:2 C3:6 C4:4 C5:2 C6:1 C7:1 |
| 2 | R_mirror_heavier_step2 | 1.78 | 8.20 | 11.0 | 100.0% | 0.0% | 0.0% | 49.4% | 46.3% | 46.3% | 100.0% | 4.1 | 2.6 | 43.3% | 23.2% | 91.0% | 3.5 | 0.3 | 0.3% | Move two cards from the lowest available costs up by two costs. Mirror: C2:2 C3:4 C4:6 C5:2 C6:1 C7:1 |
| 3 | R_cross_lighter_step2_vs_center | 3.43 | 7.55 | 10.0 | 99.9% | 0.1% | 0.0% | 50.3% | 49.3% | 49.3% | 100.0% | 4.0 | 2.3 | 47.0% | 16.5% | 90.2% | 3.5 | 0.3 | 0.7% | P0 lighter_step2 vs P1 center. Move two cards from the highest available costs down by two costs. |
| 4 | R_cross_lighter_step1_vs_center | 3.70 | 7.70 | 10.5 | 100.0% | 0.0% | 0.0% | 48.1% | 49.8% | 49.8% | 100.0% | 4.2 | 2.5 | 46.2% | 17.1% | 90.5% | 3.5 | 0.3 | 0.6% | P0 lighter_step1 vs P1 center. Move two cards from the highest available costs down by one cost. |
| 5 | R_cross_center_vs_lighter_step2 | 3.71 | 7.54 | 10.0 | 100.0% | 0.0% | 0.0% | 51.2% | 49.8% | 49.8% | 100.0% | 4.1 | 2.3 | 47.2% | 16.4% | 90.5% | 3.5 | 0.3 | 0.3% | P0 center vs P1 lighter_step2. Move two cards from the highest available costs down by two costs. |
| 6 | R_cross_center_vs_heavier_step1 | 3.91 | 7.60 | 10.5 | 100.0% | 0.0% | 0.0% | 53.3% | 49.7% | 49.7% | 100.0% | 4.0 | 2.3 | 46.0% | 17.0% | 90.6% | 3.5 | 0.3 | 0.3% | P0 center vs P1 heavier_step1. Move two cards from the lowest available costs up by one cost. |
| 7 | R_cross_center_vs_lighter_step1 | 4.15 | 7.53 | 10.0 | 100.0% | 0.0% | 0.0% | 50.2% | 51.2% | 51.2% | 100.0% | 4.1 | 2.3 | 46.5% | 15.8% | 90.3% | 3.5 | 0.2 | 0.3% | P0 center vs P1 lighter_step1. Move two cards from the highest available costs down by one cost. |
| 8 | R_mirror_lighter_step2 | 4.61 | 7.56 | 10.0 | 100.0% | 0.0% | 0.0% | 48.4% | 49.4% | 49.4% | 100.0% | 3.9 | 2.4 | 47.7% | 16.9% | 90.2% | 3.5 | 0.3 | 0.5% | Move two cards from the highest available costs down by two costs. Mirror: C2:4 C3:4 C4:5 C5:3 C6:0 C7:0 |
| 9 | R_mirror_lighter_step1 | 4.90 | 7.54 | 10.0 | 100.0% | 0.0% | 0.0% | 48.9% | 49.4% | 49.4% | 100.0% | 4.0 | 2.3 | 46.2% | 16.2% | 90.2% | 3.5 | 0.3 | 0.0% | Move two cards from the highest available costs down by one cost. Mirror: C2:4 C3:4 C4:4 C5:3 C6:1 C7:0 |
| 10 | R_cross_heavier_step1_vs_center | 6.68 | 7.68 | 10.5 | 100.0% | 0.0% | 0.0% | 44.4% | 50.3% | 50.3% | 100.0% | 4.0 | 2.5 | 45.4% | 18.2% | 90.8% | 3.5 | 0.3 | 0.5% | P0 heavier_step1 vs P1 center. Move two cards from the lowest available costs up by one cost. |
| 11 | R_cross_center_vs_heavier_step2 | 10.14 | 7.79 | 10.5 | 99.9% | 0.1% | 0.0% | 61.4% | 49.2% | 49.2% | 100.0% | 4.1 | 2.4 | 45.0% | 18.8% | 90.7% | 3.5 | 0.3 | 0.3% | P0 center vs P1 heavier_step2. Move two cards from the lowest available costs up by two costs. |
| 12 | R_cross_heavier_step2_vs_center | 16.80 | 7.92 | 11.0 | 100.0% | 0.0% | 0.0% | 33.2% | 47.4% | 47.4% | 100.0% | 4.1 | 2.5 | 46.1% | 20.5% | 90.4% | 3.5 | 0.3 | 0.4% | P0 heavier_step2 vs P1 center. Move two cards from the lowest available costs up by two costs. |

## Difference From Previous Plan B Robustness

Previous robustness was run on the Phase2a secondary winner (`START_MANA_SECOND=3`, `DESTROY_MANA_GAIN=0`). The table below compares same-named robustness rows against this Plan A freeze run. `Notable` is a mechanical flag only, not a design judgment.

| Variant | dAvgR | dP90 | dP0 | d4Ret | dKills | dStall | Notable |
|---|---:|---:|---:|---:|---:|---:|---|
| R_mirror_heavier_step1 | -1.22 | -2.5 | +1.4pt | +1.0pt | -0.9 | -7.9pt | yes |
| R_mirror_heavier_step2 | -1.05 | -2.0 | -1.9pt | +2.2pt | -0.4 | -7.8pt | yes |
| R_cross_lighter_step2_vs_center | -0.73 | -2.0 | -3.1pt | +0.1pt | -0.5 | -5.3pt | yes |
| R_cross_lighter_step1_vs_center | -0.81 | -2.0 | -1.2pt | -0.9pt | -0.6 | -5.4pt | yes |
| R_cross_center_vs_lighter_step2 | -0.75 | -2.0 | -1.5pt | -2.3pt | -0.5 | -5.4pt | yes |
| R_cross_center_vs_heavier_step1 | -0.85 | -1.5 | -5.4pt | -0.3pt | -0.7 | -6.4pt | yes |
| R_cross_center_vs_lighter_step1 | -0.68 | -2.0 | -2.1pt | +0.4pt | -0.4 | -5.4pt | yes |
| R_mirror_lighter_step2 | -0.73 | -1.5 | -2.1pt | -1.4pt | -0.7 | -4.6pt | yes |
| R_mirror_lighter_step1 | -0.79 | -2.0 | -5.0pt | -1.1pt | -0.6 | -6.0pt | yes |
| R_cross_heavier_step1_vs_center | -1.02 | -2.5 | +0.5pt | -1.7pt | -0.8 | -6.5pt | yes |
| R_cross_center_vs_heavier_step2 | -0.80 | -2.0 | -8.4pt | +1.4pt | -0.4 | -6.9pt | yes |
| R_cross_heavier_step2_vs_center | -0.77 | -1.5 | +0.5pt | +0.8pt | -0.4 | -5.8pt | yes |
