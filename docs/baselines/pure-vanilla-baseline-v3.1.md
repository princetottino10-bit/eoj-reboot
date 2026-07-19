> **[strict紀元]** 旧配置ルール(自軍隣接のみ)での測定。2026-07-19の紙ルール改元以前の基準であり、現行の判断にはpaper紀元の測定を使うこと。

# Pure Vanilla Baseline v3.1

Date: 2026-07-07T15:52:06.945Z

## Frozen Configuration

| Item | Value |
|---|---|
| Plan | R1 adoption path |
| HP curve | hybrid: 2/3/4/6/7/8 |
| ATK curve | high: 1/2/2/3/3/4 |
| Reactivation curve | heavy: 2/3/3/3/3/4 |
| Rotate-attack rule | enabled: one quarter-turn immediately before attack, consumes rotation and attack slots |
| Distribution | lowmid: C2:4 C3:4 C4:4 C5:2 C6:1 C7:1 |
| START_MANA_FIRST | 3 |
| START_MANA_SECOND | 4 |
| DESTROY_MANA_GAIN | 1 |
| Items/effects | Not implemented in this pure-body baseline |

## Reproduction

```powershell
node scripts\explore-stat-curves.cjs --v31-freeze-and-items --seed 20260702
```

| Artifact | Value |
|---|---|
| Repo HEAD | `f91a33e91f4f6b7285b93568e29a19d4b5bbcf73` |
| Script SHA256 | `ba28da7647994db61e1c8270da7eddc455141f8b0d64c611e12ca5b21f485aa7` |
| Result JSON SHA256 | `0cdf2a8753f887df615d471628d821ba3cb2980c850c70b2cf044c8aae54ce32` |
| Result JSON | `C:\Projects\codex\eoj-reboot\docs\baselines\pure-vanilla-baseline-v3.1-results.json` |
| Center samples | 2000 |
| Robustness samples / variant | 1000 |
| Seed | 20260702 |
| Oracle / depth | yes / 6 |

## Rule Notes

- Choice 2 is enabled: an attack reactivation may rotate one quarter-turn immediately before resolving the attack for the same single reactivation cost.
- Choice 2 consumes both the attack slot and rotation slot; it does not apply to summon attacks and adds no post-attack rotation.
- Rotation remains limited to once per creature per turn.
- A creature destroyed during destruction judgment does not counterattack.
- The owner of a creature sent from board to discard gains `DESTROY_MANA_GAIN=1`.
- New measurement: player-slots that failed at least one 4-check response are tracked with their eventual win rate.
- No gate judgement or next action decision is made in this file.

## Center Mirror

Samples: 2000

| KPI | Role | Value |
|---|---|---:|
| Avg rounds | reported | 8.31 |
| P90 rounds | reported | 11.5 |
| Territory win | reported | 99.9% |
| Life win | reported | 0.1% |
| Timeout | reported | 0.0% |
| P0 win | reported | 48.8% |
| 4-check return | reported | 52.9% |
| Oracle realization | reported | 100.0% |
| Kills/game | reported | 5.0 |
| Attack family/game | attack-only + choice 2 | 3.56 |
| Attack-only/game | reported | 2.85 |
| Choice2/game | reported | 0.71 |
| Rotate-only/game | reported | 0.04 |
| Weak kill | reported | 41.0% |
| Summon stall | reported | 19.6% |
| Mana utilization | reported | 91.4% |
| Board3 median | reported | 3.5 |
| Return-slot win | reported | 47.4% |
| Failed-slot win | reported | 7.4% |
| Deck reshuffle | reported | 1.7% |

## v3 Difference Summary

| KPI | v3 | v3.1 | Delta |
|---|---:|---:|---:|
| Avg rounds | 7.64 | 8.31 | +0.67 |
| P90 rounds | 10.0 | 11.5 | +1.5 |
| Territory win | 100.0% | 99.9% | -0.1pt |
| Life win | 0.0% | 0.1% | +0.1pt |
| P0 win | 48.4% | 48.8% | +0.4pt |
| 4-check return | 51.2% | 52.9% | +1.7pt |
| Kills/game | 4.2 | 5.0 | +0.9 |
| Attack family/game | 2.38 | 3.56 | +1.18 |
| Attack-only/game | 2.38 | 2.85 | +0.47 |
| Rotate-only/game | 0.30 | 0.04 | -0.27 |
| Choice2/game | 0.00 | 0.71 | +0.71 |
| Summon stall | 16.5% | 19.6% | +3.2pt |
| Mana use | 90.3% | 91.4% | +1.1pt |

## Center Diagnostics

| Run | AvgR | dAvgR | P90 | Terr | P0 | dP0 | 4Ret | d4Ret | Kills | dKills | AtkFamily | Attack3 | Rotate1 | Choice2 | Unused | Stall | ManaUse |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| v31 heavy with 2 dm1 | 8.31 | +0.00 | 11.5 | 99.9% | 48.8% | +0.0pt | 52.9% | +0.0pt | 5.0 | +0.0 | 3.56 | 2.85 | 0.04 | 0.71 | 68.7% | 19.6% | 91.4% |

| Run | Winner attack3 | Winner rotate1 | Winner choice2 | Loser attack3 | Loser rotate1 | Loser choice2 |
|---|---:|---:|---:|---:|---:|---:|
| v31 heavy with 2 dm1 | 1.24 | 0.00 | 0.17 | 1.61 | 0.03 | 0.54 |

| Run | Check return player-slots/game | Win rate after returning at least one check | Check fail player-slots/game | Win rate after failing at least one check response | Returned check turns/game | Failed response turns/game |
|---|---:|---:|---:|---:|---:|---:|
| v31 heavy with 2 dm1 | 0.98 | 47.4% | 1.08 | 7.4% | 1.52 | 1.36 |

| Run | Plans/game | Summon | Attack3 | Rotate1 | Choice2 | Multi-step | Avg steps |
|---|---:|---:|---:|---:|---:|---:|---:|
| v31 heavy with 2 dm1 | 1.52 | 0.88 (57.6%) | 0.57 (37.6%) | 0.00 (0.0%) | 0.12 (7.7%) | 0.08 (5.0%) | 1.05 |

| Run | Response turns | Returned | Failed | Attack family total | Attack3 returned | Attack3 failed | Choice2 returned | Choice2 failed | Rotate1 returned | Rotate1 failed |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| v31 heavy with 2 dm1 | 2.88 | 1.52 | 1.36 | 1.20 | 0.60 | 0.18 | 0.12 | 0.29 | 0.00 | 0.01 |

| Run | Returnable checks/game | React unnecessary | Attack-family required | Rotate1 required | Either/both required | Choice2 required |
|---|---:|---:|---:|---:|---:|---:|
| v31 heavy with 2 dm1 | 1.52 | 0.85 (100.0%) | 0.67 (100.0%) | 0.00 (0.0%) | 0.00 (0.0%) | 0.11 (100.0%) |

## Robustness Results

Samples per variant: 1000

Neighborhood rules match the v3 freeze: 4 neighbor mirrors plus 8 cross matchups against the center distribution.

| Rank | Variant | Score | AvgR | P90 | Terr | Life | Timeout | P0 | 4Ret | Oracle | Realized | Kills | AtkReact | WeakKill | Stall | ManaUse | Board3Med | Rot | Reshuffle | Notes |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | R_mirror_heavier_step1 | 1.96 | 8.40 | 12.0 | 99.4% | 0.6% | 0.0% | 49.6% | 52.7% | 52.8% | 100.0% | 4.8 | 3.5 | 42.8% | 21.4% | 92.0% | 3.5 | 0.0 | 2.1% | Move two cards from the lowest available costs up by one cost. Mirror: C2:2 C3:6 C4:4 C5:2 C6:1 C7:1 |
| 2 | R_cross_center_vs_heavier_step1 | 2.62 | 8.37 | 12.0 | 99.8% | 0.2% | 0.0% | 50.8% | 52.8% | 52.8% | 99.9% | 5.0 | 3.5 | 41.3% | 20.2% | 91.7% | 3.5 | 0.0 | 1.9% | P0 center vs P1 heavier_step1. Move two cards from the lowest available costs up by one cost. |
| 3 | R_cross_center_vs_lighter_step2 | 3.12 | 8.19 | 11.5 | 99.9% | 0.1% | 0.0% | 48.9% | 53.2% | 53.2% | 100.0% | 4.9 | 3.4 | 42.8% | 19.2% | 91.5% | 3.5 | 0.0 | 2.1% | P0 center vs P1 lighter_step2. Move two cards from the highest available costs down by two costs. |
| 4 | R_mirror_lighter_step2 | 3.74 | 8.04 | 11.0 | 99.8% | 0.2% | 0.0% | 48.7% | 52.4% | 52.4% | 100.0% | 4.7 | 3.3 | 42.5% | 18.9% | 91.5% | 3.5 | 0.0 | 0.8% | Move two cards from the highest available costs down by two costs. Mirror: C2:4 C3:4 C4:5 C5:3 C6:0 C7:0 |
| 5 | R_cross_lighter_step2_vs_center | 5.05 | 8.15 | 11.5 | 99.9% | 0.1% | 0.0% | 48.1% | 51.9% | 51.9% | 100.0% | 4.8 | 3.4 | 41.1% | 19.3% | 91.5% | 3.5 | 0.0 | 1.0% | P0 lighter_step2 vs P1 center. Move two cards from the highest available costs down by two costs. |
| 6 | R_cross_center_vs_lighter_step1 | 5.15 | 8.30 | 11.5 | 99.9% | 0.1% | 0.0% | 48.1% | 52.6% | 52.7% | 100.0% | 5.0 | 3.6 | 41.2% | 19.6% | 91.6% | 3.5 | 0.0 | 2.1% | P0 center vs P1 lighter_step1. Move two cards from the highest available costs down by one cost. |
| 7 | R_mirror_lighter_step1 | 5.58 | 8.32 | 11.5 | 99.8% | 0.2% | 0.0% | 47.9% | 51.5% | 51.5% | 100.0% | 5.0 | 3.7 | 40.6% | 20.1% | 91.7% | 3.5 | 0.0 | 1.7% | Move two cards from the highest available costs down by one cost. Mirror: C2:4 C3:4 C4:4 C5:3 C6:1 C7:0 |
| 8 | R_cross_lighter_step1_vs_center | 5.86 | 8.32 | 12.0 | 99.8% | 0.2% | 0.0% | 48.0% | 52.0% | 52.0% | 100.0% | 5.1 | 3.6 | 40.3% | 19.9% | 91.6% | 3.5 | 0.0 | 1.4% | P0 lighter_step1 vs P1 center. Move two cards from the highest available costs down by one cost. |
| 9 | R_mirror_heavier_step2 | 6.08 | 8.70 | 12.0 | 99.9% | 0.1% | 0.0% | 46.6% | 49.0% | 49.1% | 100.0% | 4.9 | 3.5 | 41.2% | 24.5% | 92.1% | 4.0 | 0.0 | 1.1% | Move two cards from the lowest available costs up by two costs. Mirror: C2:2 C3:4 C4:6 C5:2 C6:1 C7:1 |
| 10 | R_cross_heavier_step1_vs_center | 6.87 | 8.33 | 12.0 | 99.7% | 0.3% | 0.0% | 45.6% | 52.1% | 52.2% | 99.9% | 4.9 | 3.5 | 41.5% | 20.5% | 91.6% | 3.5 | 0.0 | 2.0% | P0 heavier_step1 vs P1 center. Move two cards from the lowest available costs up by one cost. |
| 11 | R_cross_center_vs_heavier_step2 | 8.91 | 8.43 | 12.0 | 100.0% | 0.0% | 0.0% | 58.7% | 50.2% | 50.2% | 100.0% | 4.9 | 3.5 | 40.4% | 21.6% | 91.7% | 3.5 | 0.0 | 1.3% | P0 center vs P1 heavier_step2. Move two cards from the lowest available costs up by two costs. |
| 12 | R_cross_heavier_step2_vs_center | 16.35 | 8.44 | 11.5 | 99.7% | 0.3% | 0.0% | 35.2% | 50.1% | 50.1% | 99.9% | 4.8 | 3.5 | 42.8% | 22.6% | 91.5% | 3.5 | 0.0 | 0.8% | P0 heavier_step2 vs P1 center. Move two cards from the lowest available costs up by two costs. |

## Robustness Follow-Through

| Row | Return slots/game | Return-slot win | Failed slots/game | Failed-slot win | Returned turns/game | Failed turns/game |
|---|---:|---:|---:|---:|---:|---:|
| baseline_v31_center_hybrid-high-heavy-rotateAttack_lowmid_m4_dm1 | 0.98 | 47.4% | 1.08 | 7.4% | 1.52 | 1.36 |
| R_mirror_heavier_step1 | 1.05 | 52.5% | 1.10 | 8.9% | 1.53 | 1.37 |
| R_cross_center_vs_heavier_step1 | 1.02 | 50.0% | 1.10 | 9.4% | 1.55 | 1.39 |
| R_cross_center_vs_lighter_step2 | 0.99 | 49.0% | 1.09 | 7.9% | 1.48 | 1.30 |
| R_mirror_lighter_step2 | 0.95 | 49.8% | 1.08 | 7.4% | 1.40 | 1.27 |
| R_cross_lighter_step2_vs_center | 0.95 | 49.6% | 1.07 | 7.1% | 1.42 | 1.32 |
| R_cross_center_vs_lighter_step1 | 0.98 | 47.7% | 1.08 | 7.9% | 1.50 | 1.35 |
| R_mirror_lighter_step1 | 0.95 | 46.0% | 1.07 | 6.5% | 1.44 | 1.35 |
| R_cross_lighter_step1_vs_center | 0.97 | 47.9% | 1.08 | 7.6% | 1.49 | 1.37 |
| R_mirror_heavier_step2 | 0.97 | 46.9% | 1.10 | 9.0% | 1.48 | 1.53 |
| R_cross_heavier_step1_vs_center | 0.99 | 51.0% | 1.09 | 8.6% | 1.50 | 1.38 |
| R_cross_center_vs_heavier_step2 | 0.97 | 46.8% | 1.09 | 8.3% | 1.46 | 1.45 |
| R_cross_heavier_step2_vs_center | 0.94 | 47.8% | 1.07 | 7.1% | 1.41 | 1.40 |

## Robustness Difference From v3

| Variant | dAvgR | dP90 | dP0 | d4Ret | dKills | dAtkFamily | dChoice2 | dStall | Notable |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| R_mirror_heavier_step1 | +0.77 | +1.5 | -2.3pt | +2.2pt | +0.9 | +1.12 | +0.61 | +3.0pt | yes |
| R_cross_center_vs_heavier_step1 | +0.77 | +1.5 | -2.5pt | +3.1pt | +1.0 | +1.20 | +0.66 | +3.2pt | yes |
| R_cross_center_vs_lighter_step2 | +0.65 | +1.5 | -2.3pt | +3.4pt | +0.8 | +1.13 | +0.67 | +2.7pt | yes |
| R_mirror_lighter_step2 | +0.48 | +1.0 | +0.3pt | +3.0pt | +0.8 | +0.95 | +0.63 | +2.0pt | yes |
| R_cross_lighter_step2_vs_center | +0.61 | +1.5 | -2.2pt | +2.6pt | +0.8 | +1.08 | +0.68 | +2.9pt | yes |
| R_cross_center_vs_lighter_step1 | +0.77 | +1.5 | -2.1pt | +1.4pt | +0.9 | +1.29 | +0.72 | +3.7pt | yes |
| R_mirror_lighter_step1 | +0.77 | +1.5 | -1.0pt | +2.0pt | +1.0 | +1.35 | +0.74 | +3.9pt | yes |
| R_cross_lighter_step1_vs_center | +0.62 | +1.5 | -0.1pt | +2.2pt | +0.8 | +1.13 | +0.73 | +2.9pt | yes |
| R_mirror_heavier_step2 | +0.50 | +1.0 | -2.8pt | +2.7pt | +0.7 | +0.96 | +0.69 | +1.3pt | yes |
| R_cross_heavier_step1_vs_center | +0.64 | +1.5 | +1.2pt | +1.9pt | +0.8 | +1.03 | +0.62 | +2.3pt | yes |
| R_cross_center_vs_heavier_step2 | +0.64 | +1.5 | -2.7pt | +1.0pt | +0.8 | +1.13 | +0.70 | +2.9pt | yes |
| R_cross_heavier_step2_vs_center | +0.52 | +0.5 | +2.0pt | +2.6pt | +0.6 | +0.98 | +0.66 | +2.1pt | yes |

## Output

JSON: `C:\Projects\codex\eoj-reboot\docs\baselines\pure-vanilla-baseline-v3.1-results.json`
