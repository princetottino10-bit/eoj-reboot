# Phase2a Main Search

Date: 2026-07-05T10:15:38.072Z

## Command

```powershell
node scripts\explore-stat-curves.cjs --phase2a-main-search --seed 20260702
```

## Implementation Notes

- `scoreSummary` is aligned to the confirmed KPI bands in `docs/kpi-design-pure-vanilla.md`.
- Rotation metrics are logged but not included in the score.
- Rotation remains once per creature per turn.
- Destroyed creatures do not counterattack because attack resolution returns immediately on defender destruction.
- When a creature goes from board to discard through destruction, its owner gains the variant's `DESTROY_MANA_GAIN`.
- Pure body items are not implemented in this phase.
- No final design decision is made here; this file is a result handoff.

## Primary Ranking

| Rank | Variant | Score | AvgR | P90 | Terr | Life | Timeout | P0 | 4Ret | Oracle | Realized | Kills | AtkReact | WeakKill | Stall | ManaUse | Board3Med | Rot | Reshuffle | Notes |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | P1_hybrid-high-heavy_lowbal_m4_dm1 | 3.23 | 7.66 | 10.5 | 100.0% | 0.0% | 0.0% | 51.8% | 48.8% | 48.8% | 100.0% | 4.2 | 2.4 | 44.5% | 16.7% | 90.5% | 3.5 | 0.3 | 0.3% |  |
| 2 | P1_lean-high-heavy_lowbal_m4_dm1 | 3.66 | 7.73 | 10.5 | 99.9% | 0.1% | 0.0% | 49.8% | 51.4% | 51.5% | 100.0% | 4.4 | 2.4 | 44.2% | 16.6% | 90.6% | 3.5 | 0.3 | 0.8% |  |
| 3 | P1_hybrid-high-heavy_lowmid_m4_dm1 | 4.29 | 7.61 | 10.0 | 100.0% | 0.0% | 0.0% | 48.5% | 49.5% | 49.5% | 100.0% | 4.1 | 2.4 | 47.2% | 16.4% | 90.4% | 3.5 | 0.3 | 0.2% |  |
| 4 | P1_lean-high-heavy_lowmid_m4_dm1 | 4.44 | 7.62 | 10.5 | 100.0% | 0.0% | 0.0% | 48.8% | 50.2% | 50.2% | 100.0% | 4.2 | 2.4 | 46.5% | 16.3% | 90.4% | 3.5 | 0.3 | 0.4% |  |
| 5 | P1_hybrid-high-heavy_balance_m4_dm1 | 4.45 | 8.09 | 11.0 | 100.0% | 0.0% | 0.0% | 48.9% | 47.4% | 47.4% | 100.0% | 4.4 | 2.6 | 40.2% | 20.6% | 90.9% | 3.5 | 0.3 | 0.5% |  |
| 6 | P1_hybrid-high-heavy_light_m4_dm1 | 5.55 | 7.21 | 10.0 | 100.0% | 0.0% | 0.0% | 52.4% | 50.6% | 50.6% | 100.0% | 3.8 | 2.2 | 52.2% | 14.4% | 89.3% | 3.5 | 0.2 | 0.2% |  |
| 7 | P1_lean-high-heavy_balance_m4_dm1 | 5.90 | 8.21 | 11.5 | 99.8% | 0.2% | 0.0% | 46.0% | 50.2% | 50.3% | 100.0% | 4.6 | 2.6 | 42.3% | 20.6% | 91.0% | 3.5 | 0.3 | 0.7% |  |
| 8 | P1_hybrid-high-standard_balance_m4_dm1 | 7.25 | 8.57 | 12.0 | 99.7% | 0.3% | 0.0% | 49.7% | 50.5% | 50.5% | 99.9% | 5.2 | 3.4 | 37.6% | 21.5% | 91.8% | 3.5 | 0.5 | 1.5% |  |
| 9 | P1_lean-high-heavy_light_m4_dm1 | 7.28 | 7.13 | 10.0 | 100.0% | 0.0% | 0.0% | 50.4% | 51.8% | 51.8% | 100.0% | 3.7 | 2.1 | 51.3% | 13.4% | 89.4% | 3.5 | 0.2 | 0.4% |  |
| 10 | P1_hybrid-high-standard_lowbal_m4_dm1 | 7.29 | 8.08 | 11.0 | 99.9% | 0.1% | 0.0% | 47.1% | 52.3% | 52.3% | 100.0% | 5.0 | 3.2 | 40.7% | 17.7% | 91.2% | 3.5 | 0.4 | 1.2% |  |
| 11 | P1_lean-high-standard_lowbal_m4_dm1 | 7.46 | 8.02 | 11.5 | 99.6% | 0.4% | 0.0% | 46.6% | 52.9% | 52.9% | 100.0% | 5.0 | 3.1 | 42.0% | 17.0% | 91.2% | 3.5 | 0.4 | 1.6% |  |
| 12 | P1_hybrid-high-standard_lowmid_m4_dm1 | 7.78 | 7.90 | 11.0 | 99.8% | 0.2% | 0.0% | 45.5% | 52.6% | 52.6% | 100.0% | 4.7 | 3.0 | 42.9% | 17.0% | 91.2% | 3.5 | 0.4 | 1.6% |  |
| 13 | P1_hybrid-high-standard_light_m4_dm1 | 7.87 | 7.35 | 10.0 | 100.0% | 0.0% | 0.0% | 45.9% | 52.2% | 52.2% | 100.0% | 4.3 | 2.7 | 47.4% | 13.7% | 89.8% | 3.5 | 0.3 | 0.5% |  |
| 14 | P1_lean-high-standard_lowmid_m4_dm1 | 8.42 | 7.84 | 11.0 | 99.7% | 0.3% | 0.0% | 45.2% | 53.0% | 53.0% | 99.9% | 4.8 | 2.8 | 43.4% | 15.9% | 91.2% | 3.5 | 0.3 | 1.0% |  |
| 15 | P1_lean-high-standard_light_m4_dm1 | 8.97 | 7.33 | 10.0 | 99.6% | 0.4% | 0.0% | 45.2% | 54.3% | 54.3% | 100.0% | 4.4 | 2.6 | 47.6% | 13.0% | 90.0% | 3.5 | 0.3 | 0.7% |  |
| 16 | P1_lean-standard-standard_balance_m4_dm1 | 9.87 | 7.13 | 9.5 | 100.0% | 0.0% | 0.0% | 51.2% | 44.3% | 44.3% | 100.0% | 3.2 | 2.0 | 56.1% | 16.0% | 88.8% | 3.5 | 0.2 | 0.1% |  |
| 17 | P1_hybrid-standard-standard_balance_m4_dm1 | 9.91 | 7.14 | 9.5 | 100.0% | 0.0% | 0.0% | 51.6% | 44.7% | 44.7% | 100.0% | 3.2 | 1.9 | 56.2% | 16.2% | 88.7% | 3.5 | 0.2 | 0.5% |  |
| 18 | P1_lean-high-standard_balance_m4_dm1 | 10.84 | 8.65 | 12.5 | 99.5% | 0.5% | 0.0% | 47.1% | 51.6% | 51.6% | 100.0% | 5.4 | 3.3 | 39.2% | 21.0% | 92.0% | 3.5 | 0.5 | 1.6% |  |
| 19 | P1_lean-standard-heavy_balance_m4_dm1 | 13.51 | 7.06 | 9.5 | 100.0% | 0.0% | 0.0% | 50.0% | 43.7% | 43.7% | 100.0% | 3.1 | 1.8 | 56.9% | 16.3% | 88.8% | 3.5 | 0.2 | 0.0% |  |
| 20 | P1_lean-standard-standard_lowmid_m4_dm1 | 14.26 | 6.87 | 9.0 | 100.0% | 0.0% | 0.0% | 51.4% | 47.6% | 47.6% | 100.0% | 3.3 | 1.9 | 59.7% | 12.2% | 88.7% | 3.5 | 0.2 | 0.1% |  |
| 21 | P1_hybrid-standard-standard_lowmid_m4_dm1 | 16.15 | 6.82 | 8.5 | 100.0% | 0.0% | 0.0% | 51.1% | 47.5% | 47.5% | 100.0% | 3.2 | 1.8 | 59.9% | 12.4% | 88.9% | 3.5 | 0.2 | 0.2% |  |
| 22 | P1_lean-standard-heavy_lowmid_m4_dm1 | 17.80 | 6.84 | 9.0 | 100.0% | 0.0% | 0.0% | 51.6% | 46.6% | 46.6% | 100.0% | 3.1 | 1.7 | 60.1% | 13.2% | 88.4% | 3.5 | 0.2 | 0.2% |  |
| 23 | P1_hybrid-standard-standard_lowbal_m4_dm1 | 19.84 | 6.75 | 8.5 | 100.0% | 0.0% | 0.0% | 50.3% | 46.3% | 46.3% | 100.0% | 3.1 | 1.8 | 58.3% | 12.3% | 88.4% | 3.5 | 0.2 | 0.1% |  |
| 24 | P1_lean-standard-standard_lowbal_m4_dm1 | 20.37 | 6.75 | 9.0 | 99.9% | 0.1% | 0.0% | 48.6% | 47.7% | 47.7% | 100.0% | 3.2 | 1.8 | 59.4% | 11.7% | 88.5% | 3.5 | 0.2 | 0.1% |  |
| 25 | P1_hybrid-standard-heavy_balance_m4_dm1 | 20.82 | 6.91 | 9.0 | 100.0% | 0.0% | 0.0% | 52.5% | 41.8% | 41.8% | 100.0% | 2.9 | 1.6 | 56.9% | 15.6% | 88.3% | 3.5 | 0.2 | 0.0% |  |
| 26 | P1_lean-standard-heavy_lowbal_m4_dm1 | 22.18 | 6.73 | 8.5 | 100.0% | 0.0% | 0.0% | 51.9% | 44.8% | 44.8% | 100.0% | 3.0 | 1.7 | 60.0% | 12.8% | 88.1% | 3.5 | 0.2 | 0.1% |  |
| 27 | P1_hybrid-standard-heavy_lowmid_m4_dm1 | 22.43 | 6.72 | 8.5 | 100.0% | 0.0% | 0.0% | 52.4% | 45.0% | 45.0% | 100.0% | 3.0 | 1.6 | 61.2% | 12.0% | 88.2% | 3.5 | 0.2 | 0.0% |  |
| 28 | P1_hybrid-standard-standard_light_m4_dm1 | 25.75 | 6.54 | 8.5 | 100.0% | 0.0% | 0.0% | 49.9% | 47.6% | 47.6% | 100.0% | 3.0 | 1.8 | 63.5% | 10.0% | 87.8% | 3.0 | 0.2 | 0.0% |  |
| 29 | P1_hybrid-standard-heavy_lowbal_m4_dm1 | 27.08 | 6.64 | 8.5 | 100.0% | 0.0% | 0.0% | 49.3% | 45.0% | 45.0% | 100.0% | 2.9 | 1.5 | 59.7% | 12.3% | 87.9% | 3.0 | 0.2 | 0.0% |  |
| 30 | P1_lean-standard-standard_light_m4_dm1 | 27.87 | 6.49 | 8.0 | 100.0% | 0.0% | 0.0% | 50.4% | 48.8% | 48.8% | 100.0% | 3.0 | 1.7 | 62.3% | 9.6% | 87.7% | 3.5 | 0.2 | 0.1% |  |
| 31 | P1_lean-standard-heavy_light_m4_dm1 | 28.83 | 6.50 | 8.5 | 100.0% | 0.0% | 0.0% | 49.6% | 47.3% | 47.3% | 100.0% | 2.9 | 1.6 | 64.8% | 10.2% | 87.9% | 3.0 | 0.2 | 0.0% |  |
| 32 | P1_hybrid-standard-heavy_light_m4_dm1 | 30.90 | 6.46 | 8.0 | 100.0% | 0.0% | 0.0% | 51.6% | 47.1% | 47.1% | 100.0% | 2.8 | 1.6 | 65.8% | 10.3% | 87.7% | 3.0 | 0.2 | 0.1% |  |

## Secondary Sweep

Top 3 primary variants were swept across `START_MANA_SECOND={3,4,5}` and `DESTROY_MANA_GAIN={0,1,2}` with the full cartesian grid.

| Rank | Variant | Score | AvgR | P90 | Terr | Life | Timeout | P0 | 4Ret | Oracle | Realized | Kills | AtkReact | WeakKill | Stall | ManaUse | Board3Med | Rot | Reshuffle | Notes |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | P2_r3_hybrid-high-heavy_lowmid_m3_dm0 | 2.55 | 8.29 | 12.0 | 99.9% | 0.1% | 0.0% | 50.9% | 50.7% | 50.7% | 100.0% | 4.6 | 2.7 | 41.4% | 21.6% | 90.6% | 3.5 | 0.4 | 1.6% |  |
| 2 | P2_r1_hybrid-high-heavy_lowbal_m3_dm0 | 3.07 | 8.54 | 12.5 | 99.9% | 0.1% | 0.0% | 51.9% | 50.7% | 50.7% | 100.0% | 4.9 | 2.9 | 40.6% | 22.7% | 90.6% | 3.5 | 0.4 | 1.7% |  |
| 3 | P2_r2_lean-high-heavy_lowbal_m3_dm0 | 3.66 | 8.53 | 12.5 | 99.9% | 0.1% | 0.0% | 49.8% | 51.2% | 51.2% | 100.0% | 4.9 | 2.8 | 40.1% | 22.4% | 90.7% | 3.5 | 0.4 | 1.6% |  |
| 4 | P2_r2_lean-high-heavy_lowbal_m4_dm1 | 4.37 | 7.66 | 10.5 | 100.0% | 0.1% | 0.0% | 49.7% | 50.9% | 50.9% | 100.0% | 4.3 | 2.3 | 44.0% | 16.6% | 90.5% | 3.5 | 0.3 | 0.4% |  |
| 5 | P2_r3_hybrid-high-heavy_lowmid_m4_dm1 | 4.41 | 7.61 | 10.0 | 100.0% | 0.0% | 0.0% | 48.4% | 49.3% | 49.3% | 100.0% | 4.1 | 2.4 | 46.2% | 16.6% | 90.3% | 3.5 | 0.3 | 0.5% |  |
| 6 | P2_r3_hybrid-high-heavy_lowmid_m4_dm2 | 4.52 | 7.41 | 10.0 | 100.0% | 0.1% | 0.0% | 53.6% | 50.0% | 50.0% | 100.0% | 4.1 | 2.4 | 45.5% | 14.5% | 90.2% | 3.5 | 0.3 | 0.4% |  |
| 7 | P2_r1_hybrid-high-heavy_lowbal_m4_dm2 | 4.98 | 7.42 | 9.5 | 100.0% | 0.1% | 0.0% | 53.7% | 47.7% | 47.7% | 100.0% | 4.1 | 2.5 | 43.9% | 14.8% | 90.3% | 3.5 | 0.3 | 0.1% |  |
| 8 | P2_r1_hybrid-high-heavy_lowbal_m4_dm1 | 5.40 | 7.56 | 10.0 | 100.0% | 0.0% | 0.0% | 48.9% | 49.1% | 49.1% | 100.0% | 4.1 | 2.3 | 43.9% | 16.7% | 90.3% | 3.5 | 0.3 | 0.3% |  |
| 9 | P2_r2_lean-high-heavy_lowbal_m4_dm0 | 6.36 | 8.38 | 12.5 | 100.0% | 0.1% | 0.0% | 45.0% | 50.7% | 50.7% | 100.0% | 4.8 | 2.7 | 43.1% | 21.3% | 90.6% | 3.5 | 0.4 | 1.8% |  |
| 10 | P2_r2_lean-high-heavy_lowbal_m4_dm2 | 7.03 | 7.50 | 10.0 | 99.8% | 0.3% | 0.0% | 54.1% | 52.2% | 52.2% | 100.0% | 4.3 | 2.4 | 42.9% | 14.4% | 90.7% | 3.5 | 0.3 | 0.5% |  |
| 11 | P2_r3_hybrid-high-heavy_lowmid_m5_dm2 | 7.69 | 7.43 | 9.5 | 99.9% | 0.1% | 0.0% | 46.8% | 51.0% | 51.0% | 100.0% | 4.3 | 2.4 | 52.6% | 13.2% | 90.3% | 3.5 | 0.2 | 0.3% |  |
| 12 | P2_r1_hybrid-high-heavy_lowbal_m5_dm1 | 7.90 | 7.77 | 10.5 | 100.0% | 0.0% | 0.0% | 45.0% | 49.6% | 49.6% | 100.0% | 4.6 | 2.5 | 51.7% | 15.9% | 90.6% | 3.5 | 0.3 | 0.4% |  |
| 13 | P2_r2_lean-high-heavy_lowbal_m5_dm2 | 7.98 | 7.42 | 10.0 | 99.9% | 0.1% | 0.0% | 49.1% | 52.0% | 52.0% | 100.0% | 4.5 | 2.2 | 50.0% | 12.3% | 90.9% | 3.5 | 0.3 | 0.4% |  |
| 14 | P2_r1_hybrid-high-heavy_lowbal_m4_dm0 | 8.13 | 8.29 | 12.0 | 99.9% | 0.1% | 0.0% | 42.6% | 50.3% | 50.4% | 100.0% | 4.7 | 2.7 | 44.0% | 21.1% | 90.5% | 3.5 | 0.4 | 1.1% |  |
| 15 | P2_r3_hybrid-high-heavy_lowmid_m4_dm0 | 8.90 | 8.08 | 11.5 | 100.0% | 0.0% | 0.0% | 41.1% | 49.8% | 49.8% | 100.0% | 4.4 | 2.6 | 45.5% | 20.2% | 90.3% | 3.5 | 0.3 | 1.1% |  |
| 16 | P2_r2_lean-high-heavy_lowbal_m5_dm1 | 9.28 | 7.74 | 10.5 | 100.0% | 0.0% | 0.0% | 44.6% | 50.7% | 50.7% | 100.0% | 4.6 | 2.4 | 51.0% | 15.4% | 90.7% | 3.5 | 0.3 | 0.5% |  |
| 17 | P2_r1_hybrid-high-heavy_lowbal_m5_dm2 | 9.48 | 7.59 | 10.0 | 99.8% | 0.2% | 0.0% | 44.1% | 49.9% | 49.9% | 100.0% | 4.6 | 2.6 | 51.4% | 13.9% | 90.9% | 3.5 | 0.3 | 0.1% |  |
| 18 | P2_r2_lean-high-heavy_lowbal_m3_dm1 | 10.04 | 7.74 | 10.5 | 100.0% | 0.0% | 0.0% | 56.8% | 51.3% | 51.3% | 100.0% | 4.4 | 2.3 | 40.6% | 17.0% | 90.6% | 3.5 | 0.3 | 0.5% |  |
| 19 | P2_r3_hybrid-high-heavy_lowmid_m5_dm1 | 10.50 | 7.63 | 10.5 | 100.0% | 0.0% | 0.0% | 43.0% | 50.8% | 50.8% | 100.0% | 4.4 | 2.4 | 52.7% | 15.4% | 90.5% | 3.5 | 0.3 | 0.6% |  |
| 20 | P2_r3_hybrid-high-heavy_lowmid_m3_dm1 | 10.74 | 7.57 | 10.0 | 100.0% | 0.0% | 0.0% | 58.7% | 49.4% | 49.4% | 100.0% | 4.1 | 2.3 | 42.7% | 16.9% | 90.2% | 3.5 | 0.3 | 0.4% |  |
| 21 | P2_r1_hybrid-high-heavy_lowbal_m3_dm1 | 10.87 | 7.63 | 10.5 | 100.0% | 0.0% | 0.0% | 58.5% | 49.7% | 49.7% | 100.0% | 4.2 | 2.3 | 42.0% | 16.9% | 90.4% | 3.5 | 0.3 | 0.1% |  |
| 22 | P2_r2_lean-high-heavy_lowbal_m5_dm0 | 12.24 | 8.28 | 12.0 | 99.9% | 0.1% | 0.0% | 37.9% | 50.5% | 50.5% | 100.0% | 4.9 | 2.6 | 49.3% | 19.8% | 90.9% | 3.5 | 0.3 | 1.5% |  |
| 23 | P2_r3_hybrid-high-heavy_lowmid_m5_dm0 | 12.41 | 7.95 | 11.5 | 99.9% | 0.1% | 0.0% | 38.4% | 49.1% | 49.1% | 100.0% | 4.5 | 2.5 | 50.8% | 18.6% | 90.5% | 3.5 | 0.3 | 1.3% |  |
| 24 | P2_r1_hybrid-high-heavy_lowbal_m5_dm0 | 13.88 | 8.11 | 11.5 | 100.0% | 0.1% | 0.0% | 36.6% | 49.1% | 49.1% | 100.0% | 4.7 | 2.5 | 49.3% | 19.1% | 90.5% | 3.5 | 0.3 | 0.8% |  |
| 25 | P2_r1_hybrid-high-heavy_lowbal_m3_dm2 | 15.36 | 7.36 | 9.5 | 100.0% | 0.1% | 0.0% | 60.6% | 47.8% | 47.8% | 100.0% | 4.1 | 2.3 | 40.5% | 14.8% | 90.2% | 3.5 | 0.3 | 0.1% |  |
| 26 | P2_r3_hybrid-high-heavy_lowmid_m3_dm2 | 18.17 | 7.32 | 9.5 | 100.0% | 0.0% | 0.0% | 63.8% | 48.3% | 48.3% | 100.0% | 4.0 | 2.3 | 40.8% | 14.8% | 90.1% | 3.5 | 0.3 | 0.1% |  |
| 27 | P2_r2_lean-high-heavy_lowbal_m3_dm2 | 20.12 | 7.35 | 9.5 | 100.0% | 0.1% | 0.0% | 63.6% | 49.9% | 49.9% | 100.0% | 4.2 | 2.2 | 39.9% | 14.3% | 90.4% | 3.5 | 0.3 | 0.2% |  |

## Robustness Test

Best secondary variant: `P2_r3_hybrid-high-heavy_lowmid_m3_dm0`

Center distribution: `C2:4 C3:4 C4:4 C5:2 C6:1 C7:1`

Neighborhood rules:

- `lighter_step1`: move two cards from the highest available costs down by one cost.
- `lighter_step2`: move two cards from the highest available costs down by two costs.
- `heavier_step1`: move two cards from the lowest available costs up by one cost.
- `heavier_step2`: move two cards from the lowest available costs up by two costs.

| Rank | Variant | Score | AvgR | P90 | Terr | Life | Timeout | P0 | 4Ret | Oracle | Realized | Kills | AtkReact | WeakKill | Stall | ManaUse | Board3Med | Rot | Reshuffle | Notes |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | R_mirror_lighter_step2 | 1.63 | 8.28 | 11.5 | 100.0% | 0.0% | 0.0% | 50.5% | 50.8% | 50.8% | 100.0% | 4.6 | 2.7 | 42.7% | 21.5% | 90.8% | 3.5 | 0.4 | 1.3% | Move two cards from the highest available costs down by two costs. Mirror: C2:4 C3:4 C4:5 C5:3 C6:0 C7:0 |
| 2 | R_cross_lighter_step2_vs_center | 2.19 | 8.28 | 12.0 | 99.9% | 0.1% | 0.0% | 53.4% | 49.2% | 49.2% | 100.0% | 4.6 | 2.7 | 42.4% | 21.8% | 90.3% | 3.5 | 0.4 | 1.4% | P0 lighter_step2 vs P1 center. Move two cards from the highest available costs down by two costs. |
| 3 | R_cross_center_vs_lighter_step1 | 2.33 | 8.21 | 12.0 | 99.9% | 0.1% | 0.0% | 52.3% | 50.8% | 50.8% | 100.0% | 4.5 | 2.6 | 41.7% | 21.2% | 90.6% | 3.5 | 0.3 | 1.5% | P0 center vs P1 lighter_step1. Move two cards from the highest available costs down by one cost. |
| 4 | R_cross_lighter_step1_vs_center | 2.64 | 8.52 | 12.5 | 99.8% | 0.2% | 0.0% | 49.3% | 50.7% | 50.7% | 99.9% | 4.8 | 2.9 | 42.2% | 22.5% | 91.0% | 3.5 | 0.4 | 2.0% | P0 lighter_step1 vs P1 center. Move two cards from the highest available costs down by one cost. |
| 5 | R_cross_center_vs_lighter_step2 | 2.93 | 8.29 | 12.0 | 99.9% | 0.1% | 0.0% | 52.7% | 52.1% | 52.1% | 100.0% | 4.6 | 2.7 | 40.8% | 21.8% | 90.7% | 3.5 | 0.3 | 1.3% | P0 center vs P1 lighter_step2. Move two cards from the highest available costs down by two costs. |
| 6 | R_mirror_heavier_step1 | 3.59 | 8.85 | 13.0 | 99.9% | 0.1% | 0.0% | 50.5% | 49.5% | 49.5% | 100.0% | 4.8 | 3.0 | 39.9% | 26.2% | 91.3% | 3.5 | 0.3 | 1.5% | Move two cards from the lowest available costs up by one cost. Mirror: C2:2 C3:6 C4:4 C5:2 C6:1 C7:1 |
| 7 | R_mirror_lighter_step1 | 4.10 | 8.33 | 12.0 | 100.0% | 0.0% | 0.0% | 53.9% | 50.5% | 50.5% | 100.0% | 4.6 | 2.7 | 40.4% | 22.2% | 90.9% | 3.5 | 0.4 | 0.7% | Move two cards from the highest available costs down by one cost. Mirror: C2:4 C3:4 C4:4 C5:3 C6:1 C7:0 |
| 8 | R_mirror_heavier_step2 | 4.26 | 9.25 | 13.0 | 99.9% | 0.1% | 0.0% | 51.3% | 44.1% | 44.1% | 100.0% | 4.5 | 2.8 | 40.2% | 31.1% | 90.8% | 4.0 | 0.3 | 0.4% | Move two cards from the lowest available costs up by two costs. Mirror: C2:2 C3:4 C4:6 C5:2 C6:1 C7:1 |
| 9 | R_cross_center_vs_heavier_step1 | 8.23 | 8.45 | 12.0 | 100.0% | 0.0% | 0.0% | 58.7% | 50.0% | 50.0% | 100.0% | 4.6 | 2.7 | 41.4% | 23.5% | 91.0% | 3.5 | 0.3 | 2.0% | P0 center vs P1 heavier_step1. Move two cards from the lowest available costs up by one cost. |
| 10 | R_cross_heavier_step1_vs_center | 10.27 | 8.70 | 13.0 | 100.0% | 0.0% | 0.0% | 43.9% | 52.0% | 52.0% | 100.0% | 4.8 | 3.0 | 39.0% | 24.7% | 91.3% | 3.5 | 0.4 | 1.0% | P0 heavier_step1 vs P1 center. Move two cards from the lowest available costs up by one cost. |
| 11 | R_cross_center_vs_heavier_step2 | 19.35 | 8.58 | 12.5 | 100.0% | 0.0% | 0.0% | 69.8% | 47.9% | 47.9% | 100.0% | 4.5 | 2.7 | 41.4% | 25.7% | 90.4% | 3.5 | 0.3 | 1.5% | P0 center vs P1 heavier_step2. Move two cards from the lowest available costs up by two costs. |
| 12 | R_cross_heavier_step2_vs_center | 19.63 | 8.69 | 12.5 | 99.9% | 0.1% | 0.0% | 32.7% | 46.6% | 46.6% | 100.0% | 4.6 | 2.8 | 41.7% | 26.3% | 90.5% | 3.5 | 0.4 | 0.7% | P0 heavier_step2 vs P1 center. Move two cards from the lowest available costs up by two costs. |

## Output

JSON: `C:\Projects\codex\eoj-reboot\docs\baselines\phase2a-main-search-results.json`
