# C3 3/3/2 Probe

This is a single-run probe. The tested card is cost 3 / HP 3 / ATK 2; other v4.1 candidate settings are unchanged.

| Metric | Result |
|---|---:|
| Average rounds | 12.27 |
| Median rounds | 12.0 |
| P90 rounds | 16.5 |
| First-player win rate | 59.0% |
| Territory win rate | 73.6% |
| Life win rate | 25.4% |
| 4-check return rate | 73.7% |
| Kills per game | 12.04 |
| Timeout rate | 1.0% |

## Reproducibility

```powershell
node scripts\explore-stat-curves.cjs --c3-hp3-probe --seed 20260702
```
Repo HEAD: 36515c86c74bb8a966537a4798b5880455695c28
Script SHA256: acc3e633f26494ef70f0f2f8cb4d06227e534c90143e8ebe499a7933cbae92c0
Games: 2000
Seed: 20260702
Oracle / depth: yes / 6

