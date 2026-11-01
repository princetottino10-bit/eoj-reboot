> **[旧エンジン紀元]** 仕様準拠改元前のエンジン（旧太極軽減、再命令の攻撃/回転別枠、全方向回転、霊力上限15、致死属性召喚不可、80手番上限）での測定。再現時は `--legacy-engine` を指定する。

# v4.1 Tuning Sweep

> This report is superseded. It was generated before the v4.1 HP correction to C2=3 and C3=4. Do not use its measurements as the current baseline.

Status: proposal material only; no adoption decision was made.
Generated: 2026-07-19T12:05:36.837Z

## KPI Comparison

| Metric | v4-paper ref | R0 | H1 | L1 | L2 | L3 |
|---|---:|---:|---:|---:|---:|---:|
| Average rounds | 13.37 | 13.93 | 13.81 | 15.12 | 15.73 | 14.98 |
| Median rounds | 14.0 | 14.5 | 14.0 | 15.5 | 16.0 | 15.5 |
| P90 rounds | 17.0 | 17.5 | 17.0 | 19.5 | 21.5 | 19.5 |
| First-player win rate | 55.3% | 55.1% | 51.2% | 57.5% | 57.1% | 56.2% |
| Life win rate | 38.6% | 46.6% | 48.8% | 34.2% | 28.1% | 35.4% |
| Territory win rate | 60.4% | 52.8% | 50.4% | 65.0% | 70.9% | 63.7% |
| Timeout rate | 0.9% | 0.7% | 0.8% | 0.9% | 1.1% | 0.8% |
| 4-checks per game | 4.57 | 4.46 | 4.44 | 5.34 | 5.79 | 5.19 |
| 4-check return rate | 77.5% | 79.6% | 79.5% | 79.6% | 79.3% | 79.5% |
| Oracle returnable rate | 78.4% | 80.6% | 80.5% | 80.2% | 79.7% | 80.2% |
| Kills per game | 14.12 | 15.17 | 15.21 | 16.63 | 17.37 | 16.46 |
| Weak-point attack rate | 44.7% | 45.1% | 46.1% | 44.3% | 43.9% | 44.4% |
| Weak-point kill rate | 39.7% | 39.3% | 41.2% | 38.4% | 38.0% | 38.5% |
| Attack reactivations per game | 10.04 | 10.67 | 10.54 | 11.79 | 12.37 | 11.65 |
| Rotate-attacks per game | 4.09 | 4.96 | 5.17 | 5.55 | 5.86 | 5.49 |
| Rotations per game | 1.40 | 1.29 | 1.38 | 1.51 | 1.65 | 1.48 |
| Summon stall rate | 24.9% | 24.7% | 24.0% | 25.5% | 26.0% | 25.4% |
| Mana utilization | 94.7% | 94.9% | 94.7% | 95.4% | 95.6% | 95.3% |
| Deck-empty game rate | 59.9% | 67.2% | 67.1% | 69.3% | 69.3% | 69.4% |
| Deck reshuffle game rate | 45.3% | 53.5% | 52.6% | 61.5% | 61.6% | 61.7% |
| Destroy mana gained per game | 28.24 | 30.35 | 30.41 | 33.27 | 34.74 | 32.93 |
| Taiji occupancy | 59.3% | 55.4% | 54.8% | 56.2% | 56.5% | 56.0% |
| Taiji occupancy P0 | 32.8% | 31.4% | 27.1% | 31.5% | 31.4% | 31.3% |
| Taiji occupancy P1 | 26.5% | 24.0% | 27.7% | 24.8% | 25.1% | 24.7% |
| Taiji discounts per game | 3.76 | 3.84 | 4.11 | 4.31 | 4.54 | 4.24 |
| Taiji discounts P0 per game | 2.21 | 2.32 | 2.02 | 2.56 | 2.67 | 2.52 |
| Taiji discounts P1 per game | 1.55 | 1.52 | 2.09 | 1.75 | 1.87 | 1.72 |
| Yin/Yang +2 applications per game | 9.61 | 10.55 | 10.59 | 11.32 | 11.73 | 11.23 |
| Yin/Yang -2 applications per game | 0.57 | 0.35 | 0.33 | 0.41 | 0.44 | 0.40 |

## Dose Response

| Run | Life total | Life rule | Avg R | Life win | Territory win | P0 win |
|---|---:|---|---:|---:|---:|---:|
| R0 | 15 | 134 | 13.93 | 46.6% | 52.8% | 55.1% |
| L1 | 18 | 134 | 15.12 | 34.2% | 65.0% | 57.5% |
| L2 | 20 | 134 | 15.73 | 28.1% | 70.9% | 57.1% |
| L3 | 15 | 112223 | 14.98 | 35.4% | 63.7% | 56.2% |

## Analysis

All L runs remained above 20% life wins, so C1 was held as instructed. L2 reduced life wins the most but also produced the longest games. H1 brought first-player win rate closest to 50% among the tested mana settings.

## Implementation Notes

Dedicated --v41-tuning mode; only starting mana, life total, and life-value curve were varied. Existing paper placement and AI/oracle behavior were retained.

## Reproducibility

```powershell
node scripts\explore-stat-curves.cjs --v41-tuning --seed 20260702
```

Repo HEAD: 36515c86c74bb8a966537a4798b5880455695c28
Script SHA256: df48ca8fb689fbf895c0b3fdbe918e51c17a39accdc4865a3f543aada9566678
Result JSON SHA256: f72c53e18f91afd75f7a6816d5a7f30e5d739623028374a5e72a5c4a5d139b62
Games per run: 2000
Seed: 20260702
Oracle / depth: yes / 6
