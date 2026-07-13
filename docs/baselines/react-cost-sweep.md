# Reactivation Cost Sweep

Date: 2026-07-06T11:21:57.805Z

## Reproduction

```powershell
node scripts\explore-stat-curves.cjs --react-cost-sweep --seed 20260702
```

| Artifact | Value |
|---|---|
| Repo HEAD | `f91a33e91f4f6b7285b93568e29a19d4b5bbcf73` |
| Script SHA256 | `0f7bb779b19554bdf7dd296bec8b5454b5feee16f1593be9514fd78c700ee40d` |
| Result JSON SHA256 | `afc7109734c1c55193b2f20dddbac15fe42e7265406123ddf6e7591b0f1446a3` |
| Result JSON | `C:\Projects\codex\eoj-reboot\docs\baselines\react-cost-sweep-results.json` |
| Samples / variant | 2000 |
| Seed | 20260702 |
| Oracle / depth | yes / 6 |

## Implementation Notes

- All v3 baseline values are fixed except the reactivation/rotation cost curve.
- Rotation cost is always the same as attack reactivation cost, and each creature may rotate at most once per turn.
- Measurement C records attack reactivations and rotations used during the turn that responds to a pending 4-check, then splits those counts by whether the check was returned.
- Measurement D first requires the normal depth-6 return plan to exist. From that same state, the oracle is rerun with attack reactivation disabled, rotation disabled, and both disabled. The resulting classification is therefore independent of the default search order that tries summon plans first.
- All four cost levels use the same seed sequence (`seed + gameIndex * 9176`) so deltas against heavy+ are paired comparisons.
- No score ranking or adoption judgement is made here.

## KPI Comparison

| Level | Curve | AvgR | dAvgR | P90 | dP90 | Terr | P0 | dP0 | 4Ret | d4Ret | Kills | dKills | AtkReact | dAtk | Rot | dRot | RotShare | Unused | Stall | ManaUse |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| light | 1/2/2/2/2/3 | 7.93 | +0.33 | 11.0 | +1.0 | 99.6% | 46.9% | -2.4pt | 57.5% | +7.2pt | 5.1 | +1.0 | 3.52 | +1.16 | 0.47 | +0.19 | 11.7% | 68.2% | 14.5% | 90.7% |
| standard | 2/2/2/3/3/3 | 7.93 | +0.32 | 11.0 | +1.0 | 99.9% | 47.0% | -2.3pt | 53.5% | +3.2pt | 4.9 | +0.8 | 3.27 | +0.91 | 0.39 | +0.12 | 10.7% | 68.2% | 16.2% | 90.9% |
| heavy | 2/3/3/3/3/4 | 7.95 | +0.35 | 11.0 | +1.0 | 100.0% | 51.2% | +1.9pt | 51.5% | +1.2pt | 4.5 | +0.4 | 2.92 | +0.56 | 0.32 | +0.04 | 9.7% | 69.3% | 18.7% | 91.1% |
| heavy+ | 2/3/3/4/4/5 | 7.61 | +0.00 | 10.0 | +0.0 | 100.0% | 49.3% | +0.0pt | 50.3% | +0.0pt | 4.1 | +0.0 | 2.36 | +0.00 | 0.27 | +0.00 | 10.4% | 72.7% | 16.6% | 90.2% |

## B. Check Return Plan Mix

| Level | Check plans/game | Summon plan | Attack react plan | Rotation plan | Multi-step | Avg steps |
|---|---:|---:|---:|---:|---:|---:|
| light | 1.74 | 1.01 (58.0%) | 0.80 (45.7%) | 0.10 (5.5%) | 0.32 (18.5%) | 1.21 |
| standard | 1.51 | 0.89 (59.0%) | 0.65 (43.0%) | 0.05 (3.0%) | 0.16 (10.6%) | 1.11 |
| heavy | 1.40 | 0.84 (60.0%) | 0.57 (40.7%) | 0.01 (0.4%) | 0.03 (2.4%) | 1.02 |
| heavy+ | 1.33 | 0.87 (65.7%) | 0.46 (34.7%) | 0.01 (0.5%) | 0.03 (2.2%) | 1.02 |

## C. Reactivation Use During Check Response

| Level | Response turns/game | Returned turns | Failed turns | Attack total | Attack returned | Attack failed | Rotation total | Rotation returned | Rotation failed |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| light | 3.03 | 1.74 | 1.28 | 1.30 | 1.01 | 0.29 | 0.17 | 0.12 | 0.05 |
| standard | 2.82 | 1.51 | 1.31 | 1.05 | 0.75 | 0.30 | 0.12 | 0.05 | 0.06 |
| heavy | 2.72 | 1.40 | 1.32 | 0.90 | 0.59 | 0.31 | 0.09 | 0.01 | 0.09 |
| heavy+ | 2.63 | 1.33 | 1.31 | 0.61 | 0.48 | 0.14 | 0.07 | 0.01 | 0.07 |

## D. Reactivation Necessity Oracle

| Level | Returnable checks/game | React unnecessary | Attack required | Rotation required | Either/both required |
|---|---:|---:|---:|---:|---:|
| light | 1.74 | 0.95 (100.0%) | 0.70 (100.0%) | 0.00 (0.0%) | 0.10 (100.0%) |
| standard | 1.51 | 0.86 (100.0%) | 0.60 (100.0%) | 0.00 (0.0%) | 0.05 (100.0%) |
| heavy | 1.40 | 0.83 (100.0%) | 0.57 (100.0%) | 0.00 (0.0%) | 0.01 (100.0%) |
| heavy+ | 1.33 | 0.87 (100.0%) | 0.45 (100.0%) | 0.00 (0.0%) | 0.01 (100.0%) |

## Output

JSON: `C:\Projects\codex\eoj-reboot\docs\baselines\react-cost-sweep-results.json`
