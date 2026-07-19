> **[strict紀元]** 旧配置ルール(自軍隣接のみ)での測定。2026-07-19の紙ルール改元以前の基準であり、現行の判断にはpaper紀元の測定を使うこと。

# Phase2b Pure Item Layer v3.1

Date: 2026-07-07T15:58:19.019Z

## Reproduction

```powershell
node scripts\explore-stat-curves.cjs --v31-freeze-and-items --seed 20260702
```

| Artifact | Value |
|---|---|
| Repo HEAD | `f91a33e91f4f6b7285b93568e29a19d4b5bbcf73` |
| Script SHA256 | `ba28da7647994db61e1c8270da7eddc455141f8b0d64c611e12ca5b21f485aa7` |
| Result JSON SHA256 | `0bcbcee03c5eeccafd4434760e53fb33dd0d0829f5de3addf2df0ebe5c3b3e75` |
| Result JSON | `C:\Projects\codex\eoj-reboot\docs\baselines\phase2b-item-layer-v31-results.json` |
| B1' samples | 2000 |
| B2' samples | 1000 |
| B3' samples | 1000 |
| Seed | 20260702 |
| Oracle / depth | yes / 6 |

## Implementation Notes

- B0 v3.1 body is quoted from the v3.1 freeze JSON generated earlier in the same command.
- Old B1 is quoted from the previous v3 Phase2b JSON when available, for the requested side-by-side comparison.
- B1'/B2'/B3' keep the v3.1 body configuration fixed: hybrid HP, high ATK, heavy 2/3/3/3/3/4 reactivation, choice 2 enabled, lowmid distribution, second-player starting mana 4, destroy mana gain 1.
- Items are represented as deck cards, go to discard when used, and can be reshuffled when the deck is empty.
- Items are used only before summon. Once a summon happens, the main phase is treated as over.
- Removal items are included in both oracle and executable check-return search.
- New measurement from v3.1 is retained: failed 4-check response player-slots and their eventual win rate.
- No gate judgement or next action decision is made in this file.

## B1' KPI Material

| KPI | Band / Role | B1 value |
|---|---|---:|
| Average rounds | 8.5-10 gate material | 9.78 |
| P90 rounds | <=14 | 14.0 |
| Territory win rate | >=95% | 99.5% |
| Life win rate | reported | 0.5% |
| Timeout rate | 0% | 0.0% |
| P0 win rate | 50-53% | 47.5% |
| 4-check return rate | 45-55% | 56.3% |
| Oracle returnable | reported | 55.8% |
| Actual/oracle ratio | diagnostic; can exceed 100% | 100.9% |
| Kills/game | 3.5-6 | 6.4 |
| Attack reactivations/game | 2.5-4.5 | 3.8 |
| Weak kill rate | >=45% | 32.4% |
| Summon stall rate | reported | 25.7% |
| Mana utilization | >=87% | 93.7% |
| Board3 median round | <=4 | 4.0 |
| Items used/game | reported | 7.1 |
| Removal item kills/game | reported | 0.9 |
| Item dead rate | reported | 56.8% |

## v3.1 Body / Old B1 / B1' / B2' / B3' Comparison

| Run | Source | Mix | Games | AvgR | P90 | Terr | Life | Timeout | P0 | 4Ret | Kills | AtkFamily | Attack3 | Choice2 | WeakKill | Stall | ManaUse | Items | RemKills | Dead |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| B0 v3.1 body | v3.1 freeze | none | 2000 | 8.31 | 11.5 | 99.9% | 0.1% | 0.0% | 48.8% | 52.9% | 5.0 | 3.56 | 2.85 | 0.71 | 41.0% | 19.6% | 91.4% | 0.0 | 0.0 | 0.0% |
| old B1 | old v3 phase2b | removal:2 economy:2 buff:2 draw:2 | 2000 | 8.91 | 12.5 | 99.9% | 0.1% | 0.0% | 49.0% | 55.2% | 5.3 | 2.39 | 2.39 | 0.00 | 37.2% | 23.4% | 92.8% | 6.8 | 0.9 | 58.0% |
| B1' | v3.1 rerun | removal:2 economy:2 buff:2 draw:2 | 2000 | 9.78 | 14.0 | 99.5% | 0.5% | 0.0% | 47.5% | 56.3% | 6.4 | 3.77 | 2.91 | 0.86 | 32.4% | 25.7% | 93.7% | 7.1 | 0.9 | 56.8% |
| B2' | v3.1 rerun | removal:4 economy:2 buff:1 draw:1 | 1000 | 10.83 | 16.0 | 97.3% | 2.7% | 0.0% | 48.9% | 64.3% | 7.8 | 4.22 | 3.21 | 1.01 | 28.8% | 27.1% | 94.3% | 6.8 | 1.6 | 59.7% |
| B3' | v3.1 rerun | removal:0 economy:3 buff:3 draw:2 | 1000 | 8.74 | 12.5 | 99.5% | 0.5% | 0.0% | 48.6% | 48.4% | 5.2 | 3.60 | 2.88 | 0.72 | 37.8% | 23.0% | 93.1% | 6.8 | 0.0 | 58.1% |

## Check Return Follow-Through

| Run | Return slots/game | Return-slot win | Failed slots/game | Failed-slot win | Returned turns/game | Failed turns/game |
|---|---:|---:|---:|---:|---:|---:|
| B0 v3.1 body | 0.98 | 47.4% | 1.08 | 7.4% | 1.52 | 1.36 |
| old B1 | - | - | - | - | - | - |
| B1' | 1.18 | 42.0% | 1.13 | 11.4% | 2.16 | 1.68 |
| B2' | 1.37 | 39.4% | 1.10 | 9.5% | 2.96 | 1.64 |
| B3' | 0.95 | 46.6% | 1.13 | 11.1% | 1.53 | 1.63 |

## Item Usage

| Run | Removal use | Economy use | Buff use | Draw use | Removal kills | Buff HP | Draw cards | Check item plan | Check removal plan | Dead removal | Dead economy | Dead buff | Dead draw |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| B1' | 1.21 | 1.87 | 1.83 | 2.19 | 0.87 | 3.63 | 2.19 | 36.3% | 36.3% | 70.9% | 54.4% | 55.5% | 46.4% |
| B2' | 2.57 | 2.08 | 1.00 | 1.14 | 1.58 | 1.98 | 1.14 | 51.7% | 51.7% | 70.0% | 50.1% | 52.1% | 45.3% |
| B3' | 0.00 | 2.54 | 2.23 | 2.03 | 0.00 | 4.42 | 2.03 | 0.0% | 0.0% | 0.0% | 58.3% | 63.4% | 50.0% |

## Item Mixes

| Run | Mix |
|---|---|
| B1' | removal:2 economy:2 buff:2 draw:2 |
| B2' | removal:4 economy:2 buff:1 draw:1 |
| B3' | removal:0 economy:3 buff:3 draw:2 |

## Output

JSON: `C:\Projects\codex\eoj-reboot\docs\baselines\phase2b-item-layer-v31-results.json`
