> **[strict紀元]** 旧配置ルール(自軍隣接のみ)での測定。2026-07-19の紙ルール改元以前の基準であり、現行の判断にはpaper紀元の測定を使うこと。

# Phase2d Rotate-Attack Rule Sweep

Date: 2026-07-07T12:53:08.798Z

## Reproduction

```powershell
node scripts\explore-stat-curves.cjs --phase2d-rotate-attack --seed 20260702
```

| Artifact | Value |
|---|---|
| Repo HEAD | `f91a33e91f4f6b7285b93568e29a19d4b5bbcf73` |
| Script SHA256 | `4adde15df7ffb6cdb59c8485872c6f84a46e41edd1ce03d137c613bb73d07e8c` |
| Result JSON SHA256 | `d7b843e325360c84a04bb24c84555d3edcbb8b34f5ea0415891d3d912dfac75c` |
| Result JSON | `C:\Projects\codex\eoj-reboot\docs\baselines\phase2d-rotate-attack-results.json` |
| Samples / run | 2000 |
| Seed | 20260702 |
| Oracle / depth | yes / 6 |

## Implementation Notes

- Choice 2 rotates one quarter-turn immediately before resolving the attack, then marks both `hasActed` and `hasRotated` if the attacker remains on board.
- Choice 2 costs the same as one attack reactivation. It does not apply to summon attacks.
- The normal AI scores choice 2 by temporarily rotating, evaluating the best post-rotation target, and comparing it against attack-only and rotate-only choices.
- The check-return search and oracle include choice 2 whenever the run enables the rule.
- Measurement D treats choice 2 as part of the attack family for attack-required classification, and also reports a separate choice-2-required restricted oracle.
- Rotate-only behavior is otherwise left as the existing v3 engine behavior so R0a remains the phase2c/v3 paired-control rerun.
- No score ranking or adoption judgement is made here.

## Run Setup

| Run | Cost | Choice 2 | DM | Purpose |
|---|---|---:|---:|---|
| R0a | heavy+ 2/3/3/4/4/5 | no | 1 | Control: v3 heavy+ cost without rotate-attack rule. |
| R0b | heavy 2/3/3/3/3/4 | no | 1 | Cost-effect control: heavy cost without rotate-attack rule. |
| R1 | heavy 2/3/3/3/3/4 | yes | 1 | Main candidate: heavy cost with rotate-attack rule. |
| R2 | heavy+ 2/3/3/4/4/5 | yes | 1 | Rule-effect isolation at current heavy+ cost. |
| R3 | standard 2/2/2/3/3/3 | no | 1 | Standard cost rerun for winner/loser and check-return follow-through metrics. |
| R4 | light 1/2/2/2/2/3 | no | 1 | Light cost rerun for winner/loser and check-return follow-through metrics. |
| R5 | standard 2/2/2/3/3/3 | no | 2 | Standard cost with DESTROY_MANA_GAIN=2. |
| R6 | standard 2/2/2/3/3/3 | yes | 2 | Standard cost plus rotate-attack rule with DESTROY_MANA_GAIN=2. |

## KPI Comparison

| Run | AvgR | dAvgR | P90 | Terr | P0 | dP0 | 4Ret | d4Ret | Kills | dKills | AtkFamily | Attack3 | Rotate1 | Choice2 | Unused | Stall | ManaUse |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| R0a heavy+ no 2 dm1 | 7.64 | +0.00 | 10.0 | 100.0% | 48.4% | +0.0pt | 51.2% | +0.0pt | 4.2 | +0.0 | 2.38 | 2.38 | 0.30 | 0.00 | 71.9% | 16.5% | 90.3% |
| R0b heavy no 2 dm1 | 7.97 | +0.33 | 11.0 | 100.0% | 49.9% | +1.5pt | 51.3% | +0.1pt | 4.5 | +0.4 | 2.92 | 2.92 | 0.31 | 0.00 | 69.3% | 18.6% | 90.9% |
| R1 heavy with 2 dm1 | 8.19 | +0.56 | 11.5 | 99.8% | 50.0% | +1.6pt | 52.2% | +1.0pt | 4.9 | +0.8 | 3.47 | 2.80 | 0.03 | 0.67 | 68.8% | 19.3% | 91.4% |
| R2 heavy+ with 2 dm1 | 7.70 | +0.06 | 10.5 | 100.0% | 47.9% | -0.6pt | 51.2% | +0.0pt | 4.3 | +0.1 | 2.65 | 2.20 | 0.03 | 0.45 | 72.8% | 16.5% | 90.5% |
| R3 standard no 2 dm1 | 7.92 | +0.28 | 10.5 | 99.8% | 46.9% | -1.5pt | 53.4% | +2.3pt | 4.9 | +0.7 | 3.25 | 3.25 | 0.38 | 0.00 | 68.7% | 16.6% | 91.0% |
| R4 light no 2 dm1 | 7.88 | +0.24 | 11.0 | 99.9% | 48.3% | -0.2pt | 56.8% | +5.7pt | 5.1 | +0.9 | 3.42 | 3.42 | 0.46 | 0.00 | 68.4% | 14.1% | 90.7% |
| R5 standard no 2 dm2 | 7.82 | +0.18 | 10.5 | 99.7% | 53.6% | +5.2pt | 53.8% | +2.7pt | 4.9 | +0.8 | 3.45 | 3.45 | 0.39 | 0.00 | 66.4% | 15.1% | 91.1% |
| R6 standard with 2 dm2 | 8.10 | +0.46 | 11.0 | 99.3% | 52.9% | +4.5pt | 55.3% | +4.1pt | 5.5 | +1.3 | 4.54 | 3.26 | 0.07 | 1.28 | 63.3% | 16.3% | 91.8% |

## Winner/Loser Reactivation Use

| Run | Winner attack3 | Winner rotate1 | Winner choice2 | Loser attack3 | Loser rotate1 | Loser choice2 |
|---|---:|---:|---:|---:|---:|---:|
| R0a heavy+ no 2 dm1 | 1.05 | 0.07 | 0.00 | 1.34 | 0.23 | 0.00 |
| R0b heavy no 2 dm1 | 1.22 | 0.07 | 0.00 | 1.70 | 0.24 | 0.00 |
| R1 heavy with 2 dm1 | 1.17 | 0.00 | 0.16 | 1.63 | 0.03 | 0.50 |
| R2 heavy+ with 2 dm1 | 0.97 | 0.00 | 0.13 | 1.23 | 0.03 | 0.32 |
| R3 standard no 2 dm1 | 1.42 | 0.10 | 0.00 | 1.83 | 0.28 | 0.00 |
| R4 light no 2 dm1 | 1.54 | 0.12 | 0.00 | 1.88 | 0.35 | 0.00 |
| R5 standard no 2 dm2 | 1.39 | 0.09 | 0.00 | 2.06 | 0.30 | 0.00 |
| R6 standard with 2 dm2 | 1.43 | 0.01 | 0.24 | 1.83 | 0.06 | 1.05 |

## Check Return Follow-Through

| Run | Check return player-slots/game | Win rate after returning at least one check | Returned check turns/game | Failed response turns/game |
|---|---:|---:|---:|---:|
| R0a heavy+ no 2 dm1 | 1.00 | 55.8% | 1.39 | 1.32 |
| R0b heavy no 2 dm1 | 1.00 | 50.9% | 1.41 | 1.34 |
| R1 heavy with 2 dm1 | 0.95 | 46.9% | 1.43 | 1.31 |
| R2 heavy+ with 2 dm1 | 0.97 | 57.0% | 1.33 | 1.27 |
| R3 standard no 2 dm1 | 0.97 | 47.2% | 1.50 | 1.30 |
| R4 light no 2 dm1 | 1.03 | 50.4% | 1.69 | 1.28 |
| R5 standard no 2 dm2 | 0.93 | 46.5% | 1.46 | 1.25 |
| R6 standard with 2 dm2 | 0.86 | 37.3% | 1.59 | 1.28 |

## B. Check Return Plan Mix

| Run | Plans/game | Summon | Attack3 | Rotate1 | Choice2 | Multi-step | Avg steps |
|---|---:|---:|---:|---:|---:|---:|---:|
| R0a heavy+ no 2 dm1 | 1.39 | 0.91 (66.0%) | 0.48 (34.4%) | 0.01 (0.6%) | 0.00 (0.0%) | 0.03 (2.4%) | 1.03 |
| R0b heavy no 2 dm1 | 1.41 | 0.87 (61.8%) | 0.55 (38.8%) | 0.01 (0.5%) | 0.00 (0.0%) | 0.04 (2.9%) | 1.03 |
| R1 heavy with 2 dm1 | 1.43 | 0.82 (57.4%) | 0.54 (37.8%) | 0.00 (0.1%) | 0.11 (7.4%) | 0.07 (4.5%) | 1.05 |
| R2 heavy+ with 2 dm1 | 1.33 | 0.88 (65.9%) | 0.40 (29.8%) | 0.00 (0.0%) | 0.08 (5.9%) | 0.04 (3.4%) | 1.03 |
| R3 standard no 2 dm1 | 1.50 | 0.86 (57.7%) | 0.67 (44.7%) | 0.04 (2.4%) | 0.00 (0.0%) | 0.15 (10.0%) | 1.11 |
| R4 light no 2 dm1 | 1.69 | 1.01 (59.7%) | 0.74 (43.5%) | 0.09 (5.2%) | 0.00 (0.0%) | 0.29 (17.0%) | 1.19 |
| R5 standard no 2 dm2 | 1.46 | 0.86 (59.3%) | 0.64 (44.0%) | 0.05 (3.7%) | 0.00 (0.0%) | 0.19 (13.1%) | 1.15 |
| R6 standard with 2 dm2 | 1.59 | 0.89 (55.7%) | 0.71 (44.4%) | 0.01 (0.3%) | 0.18 (11.2%) | 0.29 (18.2%) | 1.19 |

## C. Reactivation Use During Check Response

| Run | Response turns | Returned | Failed | Attack family total | Attack3 returned | Attack3 failed | Choice2 returned | Choice2 failed | Rotate1 returned | Rotate1 failed |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| R0a heavy+ no 2 dm1 | 2.71 | 1.39 | 1.32 | 0.63 | 0.50 | 0.13 | 0.00 | 0.00 | 0.01 | 0.08 |
| R0b heavy no 2 dm1 | 2.74 | 1.41 | 1.34 | 0.86 | 0.57 | 0.28 | 0.00 | 0.00 | 0.01 | 0.09 |
| R1 heavy with 2 dm1 | 2.74 | 1.43 | 1.31 | 1.16 | 0.56 | 0.20 | 0.11 | 0.28 | 0.00 | 0.01 |
| R2 heavy+ with 2 dm1 | 2.60 | 1.33 | 1.27 | 0.72 | 0.42 | 0.10 | 0.08 | 0.12 | 0.00 | 0.01 |
| R3 standard no 2 dm1 | 2.80 | 1.50 | 1.30 | 1.09 | 0.76 | 0.33 | 0.00 | 0.00 | 0.04 | 0.07 |
| R4 light no 2 dm1 | 2.97 | 1.69 | 1.28 | 1.23 | 0.92 | 0.30 | 0.00 | 0.00 | 0.11 | 0.05 |
| R5 standard no 2 dm2 | 2.71 | 1.46 | 1.25 | 1.27 | 0.77 | 0.51 | 0.00 | 0.00 | 0.06 | 0.07 |
| R6 standard with 2 dm2 | 2.87 | 1.59 | 1.28 | 2.08 | 0.81 | 0.30 | 0.21 | 0.76 | 0.01 | 0.01 |

## D. Reactivation Necessity Oracle

| Run | Returnable checks/game | React unnecessary | Attack-family required | Rotate1 required | Either/both required | Choice2 required |
|---|---:|---:|---:|---:|---:|---:|
| R0a heavy+ no 2 dm1 | 1.39 | 0.91 (100.0%) | 0.47 (100.0%) | 0.00 (0.0%) | 0.01 (100.0%) | 0.00 (0.0%) |
| R0b heavy no 2 dm1 | 1.41 | 0.86 (100.0%) | 0.54 (100.0%) | 0.00 (0.0%) | 0.01 (100.0%) | 0.00 (0.0%) |
| R1 heavy with 2 dm1 | 1.43 | 0.81 (100.0%) | 0.63 (100.0%) | 0.00 (0.0%) | 0.00 (100.0%) | 0.10 (100.0%) |
| R2 heavy+ with 2 dm1 | 1.33 | 0.87 (100.0%) | 0.47 (100.0%) | 0.00 (0.0%) | 0.00 (0.0%) | 0.07 (100.0%) |
| R3 standard no 2 dm1 | 1.50 | 0.83 (100.0%) | 0.63 (100.0%) | 0.00 (0.0%) | 0.04 (100.0%) | 0.00 (0.0%) |
| R4 light no 2 dm1 | 1.69 | 0.95 (100.0%) | 0.65 (100.0%) | 0.00 (0.0%) | 0.09 (100.0%) | 0.00 (0.0%) |
| R5 standard no 2 dm2 | 1.46 | 0.82 (100.0%) | 0.59 (100.0%) | 0.00 (0.0%) | 0.05 (100.0%) | 0.00 (0.0%) |
| R6 standard with 2 dm2 | 1.59 | 0.77 (100.0%) | 0.81 (100.0%) | 0.00 (0.0%) | 0.01 (100.0%) | 0.13 (100.0%) |

## Output

JSON: `C:\Projects\codex\eoj-reboot\docs\baselines\phase2d-rotate-attack-results.json`
