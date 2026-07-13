# Phase2b Pure Item Layer

Date: 2026-07-05T14:08:19.133Z

## Reproduction

```powershell
node scripts\explore-stat-curves.cjs --phase2b-item-layer --seed 20260702
```

| Artifact | Value |
|---|---|
| Repo HEAD | `f91a33e91f4f6b7285b93568e29a19d4b5bbcf73` |
| Script SHA256 | `e94f36fd3999277e9dd1d9ffcf79647b37335ca8d61ad12cb8aca53c532e08d6` |
| Result JSON SHA256 | `d7728a5495d2661148f2a19faff079dd40f31f4d57450225d8d71d621da36623` |
| Result JSON | `C:\Projects\codex\eoj-reboot\docs\baselines\phase2b-item-layer-results.json` |
| Seed | 20260702 |
| Oracle / depth | yes / 6 |

## Implementation Notes

- B0 is quoted from the frozen v3 JSON and is not rerun here.
- B1/B2/B3 keep the v3 body configuration fixed: hybrid HP, high ATK, heavy reactivation, lowmid distribution, second-player starting mana 4, destroy mana gain 1.
- Items are represented as deck cards, go to discard when used, and can be reshuffled when the deck is empty.
- Items are used only before summon. Once a summon happens, the main phase is treated as over.
- Removal items are included in both oracle and executable check-return search.
- The oracle/check-search item action space intentionally includes removal items only. Economy, buff, and draw can still be used by the normal pre-summon item AI, so actual/oracle realization may exceed 100% in this phase.
- Normal item AI is intentionally minimal: removal kills, economy enabling/spare use, spare buffing, and draw when summonable creatures are scarce.
- No gate judgement or next action decision is made in this file.

## B1 KPI Material

| KPI | Band / Role | B1 value |
|---|---|---:|
| Average rounds | 8.5-10 gate material | 8.91 |
| P90 rounds | <=14 | 12.5 |
| Territory win rate | >=95% | 99.9% |
| Life win rate | reported | 0.1% |
| Timeout rate | 0% | 0.0% |
| P0 win rate | 50-53% | 49.0% |
| 4-check return rate | 45-55% | 55.2% |
| Oracle returnable | reported | 54.5% |
| Actual/oracle ratio | diagnostic; can exceed 100% | 101.3% |
| Kills/game | 3.5-6 | 5.3 |
| Attack reactivations/game | 2.5-4.5 | 2.4 |
| Weak kill rate | >=45% | 37.2% |
| Summon stall rate | reported | 23.4% |
| Mana utilization | >=87% | 92.8% |
| Board3 median round | <=4 | 3.5 |
| Items used/game | reported | 6.8 |
| Removal item kills/game | reported | 0.9 |
| Item dead rate | reported | 58.0% |

## B0/B1/B2/B3 Comparison

| Run | Mix | Games | AvgR | P90 | Terr | Life | Timeout | P0 | 4Ret | Kills | AtkReact | WeakKill | Stall | ManaUse | Items | RemKills | Dead |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| B0 | none | 2000 | 7.64 | 10.0 | 100.0% | 0.0% | 0.0% | 48.4% | 51.2% | 4.2 | 2.4 | 46.0% | 16.5% | 90.3% | - | - | 0.0% |
| B1 | removal:2 economy:2 buff:2 draw:2 | 2000 | 8.91 | 12.5 | 99.9% | 0.1% | 0.0% | 49.0% | 55.2% | 5.3 | 2.4 | 37.2% | 23.4% | 92.8% | 6.8 | 0.9 | 58.0% |
| B2 | removal:4 economy:2 buff:1 draw:1 | 1000 | 9.83 | 14.0 | 99.7% | 0.3% | 0.0% | 46.2% | 63.4% | 6.5 | 2.6 | 31.9% | 24.6% | 93.4% | 6.5 | 1.6 | 60.4% |
| B3 | removal:0 economy:3 buff:3 draw:2 | 1000 | 7.83 | 10.5 | 99.9% | 0.1% | 0.0% | 48.7% | 43.8% | 4.0 | 2.2 | 44.3% | 20.3% | 92.0% | 6.4 | 0.0 | 60.3% |

## Item Usage

| Run | Removal use | Economy use | Buff use | Draw use | Removal kills | Buff HP | Draw cards | Check item plan | Check removal plan | Dead removal | Dead economy | Dead buff | Dead draw |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| B1 | 1.16 | 1.78 | 1.73 | 2.08 | 0.88 | 3.45 | 2.08 | 39.0% | 39.0% | 71.3% | 55.7% | 56.9% | 48.2% |
| B2 | 2.45 | 1.95 | 0.98 | 1.08 | 1.64 | 1.94 | 1.08 | 53.3% | 53.3% | 70.2% | 52.1% | 51.7% | 46.7% |
| B3 | 0.00 | 2.37 | 2.10 | 1.90 | 0.00 | 4.14 | 1.90 | 0.0% | 0.0% | 0.0% | 60.6% | 65.1% | 52.5% |

## Item Mixes

| Run | Mix |
|---|---|
| B1 | removal:2 economy:2 buff:2 draw:2 |
| B2 | removal:4 economy:2 buff:1 draw:1 |
| B3 | removal:0 economy:3 buff:3 draw:2 |

## Output

JSON: `C:\Projects\codex\eoj-reboot\docs\baselines\phase2b-item-layer-results.json`
