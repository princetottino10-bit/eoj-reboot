# Standard Mana Handicap Sweep

Date: 2026-07-07T13:53:11.693Z

## Reproduction

```powershell
node scripts\explore-stat-curves.cjs --standard-mana-handicap --seed 20260702
```

| Artifact | Value |
|---|---|
| Repo HEAD | `f91a33e91f4f6b7285b93568e29a19d4b5bbcf73` |
| Script SHA256 | `34277c857a4e06d1c978ac8a6fb8a69d514721d8bc282bdbaa991785ce85a231` |
| Result JSON SHA256 | `3c6fc0dfbeffa23679a8712ebf7de3098e8ca076dfffbc74e70bcbcf99b4e8a6` |
| Result JSON | `C:\Projects\codex\eoj-reboot\docs\baselines\standard-mana-handicap-results.json` |
| Samples / run | 2000 |
| Seed | 20260702 |
| Oracle / depth | yes / 6 |

## Implementation Notes

- All S runs fix standard reactivation cost `2/2/2/3/3/3` and `DESTROY_MANA_GAIN=1`.
- The phase2d R3 row is loaded from `phase2d-rotate-attack-results.json` and shown as the requested reference: standard, second-player +1, no choice 2, dm1.
- Measurement is identical to phase2d: full KPI set, winner/loser reactivation use, check-return follow-through, and B/C/D oracle diagnostics.
- All newly simulated S runs use the same seed sequence (`seed + gameIndex * 9176`) for paired comparison.
- No adoption judgement is made here.

## Run Setup

| Run | Source | Initial mana | Handicap | Choice 2 | DM | Purpose |
|---|---|---:|---:|---:|---:|---|
| S1 | simulated | 3/3 | 0 | no | 1 | No second-player starting mana handicap, no choice 2. |
| S2 | simulated | 3/3 | 0 | yes | 1 | No second-player starting mana handicap, with choice 2. |
| R3-ref | phase2d R3 | 3/4 | 1 | no | 1 | Reference from phase2d: standard, second-player +1, no choice 2, dm1. |
| S3 | simulated | 3/4 | 1 | yes | 1 | Current second-player +1 starting mana handicap, with choice 2. |
| S4 | simulated | 3/5 | 2 | no | 1 | Second-player +2 starting mana handicap, no choice 2. |

## First-Player Win Sensitivity

| Row | Choice 2 | Handicap | Initial mana | P0 win | AvgR | 4Ret | Attack family | Choice2 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| S1 | no | 0 | 3/3 | 55.9% | 8.00 | 54.0% | 3.27 | 0.00 |
| S2 | yes | 0 | 3/3 | 54.9% | 8.33 | 53.6% | 4.45 | 1.30 |
| R3-ref | no | 1 | 3/4 | 46.9% | 7.92 | 53.4% | 3.25 | 0.00 |
| S3 | yes | 1 | 3/4 | 45.2% | 8.30 | 54.3% | 4.49 | 1.27 |
| S4 | no | 2 | 3/5 | 42.7% | 7.88 | 53.9% | 3.18 | 0.00 |

## KPI Comparison

| Run | AvgR | dAvgR | P90 | Terr | P0 | dP0 | 4Ret | d4Ret | Kills | dKills | AtkFamily | Attack3 | Rotate1 | Choice2 | Unused | Stall | ManaUse |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| S1 standard no 2 dm1 | 8.00 | +0.00 | 11.0 | 99.9% | 55.9% | +0.0pt | 54.0% | +0.0pt | 4.8 | +0.0 | 3.27 | 3.27 | 0.40 | 0.00 | 68.3% | 17.6% | 91.0% |
| S2 standard with 2 dm1 | 8.33 | +0.33 | 11.5 | 99.7% | 54.9% | -1.0pt | 53.6% | -0.3pt | 5.4 | +0.6 | 4.45 | 3.15 | 0.07 | 1.30 | 63.8% | 19.7% | 92.0% |
| R3-ref standard no 2 dm1 | 7.92 | -0.08 | 10.5 | 99.8% | 46.9% | -8.9pt | 53.4% | -0.5pt | 4.9 | +0.0 | 3.25 | 3.25 | 0.38 | 0.00 | 68.7% | 16.6% | 91.0% |
| S3 standard with 2 dm1 | 8.30 | +0.30 | 11.5 | 99.8% | 45.2% | -10.6pt | 54.3% | +0.3pt | 5.5 | +0.7 | 4.49 | 3.22 | 0.06 | 1.27 | 63.7% | 18.6% | 92.0% |
| S4 standard no 2 dm1 | 7.88 | -0.12 | 11.0 | 99.8% | 42.7% | -13.2pt | 53.9% | -0.0pt | 5.1 | +0.3 | 3.18 | 3.18 | 0.40 | 0.00 | 68.0% | 15.1% | 91.1% |

## Winner/Loser Reactivation Use

| Run | Winner attack3 | Winner rotate1 | Winner choice2 | Loser attack3 | Loser rotate1 | Loser choice2 |
|---|---:|---:|---:|---:|---:|---:|
| S1 standard no 2 dm1 | 1.36 | 0.10 | 0.00 | 1.92 | 0.30 | 0.00 |
| S2 standard with 2 dm1 | 1.42 | 0.01 | 0.27 | 1.73 | 0.07 | 1.03 |
| R3-ref standard no 2 dm1 | 1.42 | 0.10 | 0.00 | 1.83 | 0.28 | 0.00 |
| S3 standard with 2 dm1 | 1.48 | 0.01 | 0.23 | 1.74 | 0.06 | 1.04 |
| S4 standard no 2 dm1 | 1.47 | 0.11 | 0.00 | 1.72 | 0.28 | 0.00 |

## Check Return Follow-Through

| Run | Check return player-slots/game | Win rate after returning at least one check | Returned check turns/game | Failed response turns/game |
|---|---:|---:|---:|---:|
| S1 standard no 2 dm1 | 0.99 | 48.2% | 1.54 | 1.31 |
| S2 standard with 2 dm1 | 0.89 | 38.0% | 1.56 | 1.34 |
| R3-ref standard no 2 dm1 | 0.97 | 47.2% | 1.50 | 1.30 |
| S3 standard with 2 dm1 | 0.91 | 37.4% | 1.60 | 1.34 |
| S4 standard no 2 dm1 | 1.01 | 47.7% | 1.52 | 1.30 |

## B. Check Return Plan Mix

| Run | Plans/game | Summon | Attack3 | Rotate1 | Choice2 | Multi-step | Avg steps |
|---|---:|---:|---:|---:|---:|---:|---:|
| S1 standard no 2 dm1 | 1.54 | 0.90 (58.8%) | 0.67 (43.4%) | 0.04 (2.4%) | 0.00 (0.0%) | 0.15 (10.1%) | 1.11 |
| S2 standard with 2 dm1 | 1.56 | 0.83 (53.5%) | 0.69 (44.4%) | 0.00 (0.2%) | 0.16 (10.1%) | 0.23 (14.7%) | 1.15 |
| R3-ref standard no 2 dm1 | 1.50 | 0.86 (57.7%) | 0.67 (44.7%) | 0.04 (2.4%) | 0.00 (0.0%) | 0.15 (10.0%) | 1.11 |
| S3 standard with 2 dm1 | 1.60 | 0.84 (52.8%) | 0.72 (44.8%) | 0.01 (0.4%) | 0.16 (10.2%) | 0.24 (14.8%) | 1.15 |
| S4 standard no 2 dm1 | 1.52 | 0.90 (59.1%) | 0.67 (43.9%) | 0.05 (3.2%) | 0.00 (0.0%) | 0.16 (10.6%) | 1.11 |

## C. Reactivation Use During Check Response

| Run | Response turns | Returned | Failed | Attack family total | Attack3 returned | Attack3 failed | Choice2 returned | Choice2 failed | Rotate1 returned | Rotate1 failed |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| S1 standard no 2 dm1 | 2.85 | 1.54 | 1.31 | 1.08 | 0.77 | 0.31 | 0.00 | 0.00 | 0.04 | 0.07 |
| S2 standard with 2 dm1 | 2.90 | 1.56 | 1.34 | 1.90 | 0.78 | 0.18 | 0.18 | 0.76 | 0.01 | 0.01 |
| R3-ref standard no 2 dm1 | 2.80 | 1.50 | 1.30 | 1.09 | 0.76 | 0.33 | 0.00 | 0.00 | 0.04 | 0.07 |
| S3 standard with 2 dm1 | 2.94 | 1.60 | 1.34 | 1.99 | 0.81 | 0.21 | 0.19 | 0.78 | 0.01 | 0.01 |
| S4 standard no 2 dm1 | 2.83 | 1.52 | 1.30 | 1.04 | 0.75 | 0.29 | 0.00 | 0.00 | 0.06 | 0.06 |

## D. Reactivation Necessity Oracle

| Run | Returnable checks/game | React unnecessary | Attack-family required | Rotate1 required | Either/both required | Choice2 required |
|---|---:|---:|---:|---:|---:|---:|
| S1 standard no 2 dm1 | 1.54 | 0.87 (100.0%) | 0.63 (100.0%) | 0.00 (0.0%) | 0.04 (100.0%) | 0.00 (0.0%) |
| S2 standard with 2 dm1 | 1.56 | 0.76 (100.0%) | 0.79 (100.0%) | 0.00 (0.0%) | 0.00 (100.0%) | 0.12 (100.0%) |
| R3-ref standard no 2 dm1 | 1.50 | 0.83 (100.0%) | 0.63 (100.0%) | 0.00 (0.0%) | 0.04 (100.0%) | 0.00 (0.0%) |
| S3 standard with 2 dm1 | 1.60 | 0.78 (100.0%) | 0.81 (100.0%) | 0.00 (0.0%) | 0.01 (100.0%) | 0.13 (100.0%) |
| S4 standard no 2 dm1 | 1.52 | 0.85 (100.0%) | 0.62 (100.0%) | 0.00 (0.0%) | 0.05 (100.0%) | 0.00 (0.0%) |

## Output

JSON: `C:\Projects\codex\eoj-reboot\docs\baselines\standard-mana-handicap-results.json`
