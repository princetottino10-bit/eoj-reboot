> **[strict紀元]** 旧配置ルール(自軍隣接のみ)での測定。2026-07-19の紙ルール改元以前の基準であり、現行の判断にはpaper紀元の測定を使うこと。

> **[破棄・参照禁止]** 非対称fork+全局面強制のアーティファクトにより、Δ−20.7ptは「再命令の損得」を測れていない(ミラー戦なのにOFF勝率53.8%が証拠)。v2で再計測。

# Reactivation Value Forked Comparison

Date: 2026-07-08T10:35:26.553Z

## Reproduction

```powershell
node scripts\explore-stat-curves.cjs --react-value-forked --seed 20260702
```

| Artifact | Value |
|---|---|
| Repo HEAD | `f91a33e91f4f6b7285b93568e29a19d4b5bbcf73` |
| Script SHA256 | `20d53094c12efe67218405ded4de88d2918dd83c62a99404450803d56063e55e` |
| Result JSON SHA256 | `a1a442f304d84a70b93c8176869b886e02c9012a5d72e333940c6d88abdb4a1c` |
| Result JSON | `C:\Projects\codex\eoj-reboot\docs\baselines\react-value-forked-results.json` |
| Base games | 3000 |
| Fork samples | 6000 |
| Seed | 20260702 |
| Oracle / check-search depth | no / 6 |

## Implementation Notes

- Configuration is fixed to R1/v3.1: heavy reactivation cost `2/3/3/3/3/4`, choice 2 rotate-attack enabled, 16 pure creatures, no items.
- Candidate states are captured after `beginTurn`, before check-search, reactivation, item use, or summon.
- A candidate requires at least one legal attack-family reactivation: choice 2 rotate-attack or choice 3 attack-only. Rotate-only is not a trigger.
- Each base game stores all candidates and then samples at most two uniformly without replacement.
- ON forces the highest-scoring attack-family reactivation once, then returns to normal AI. OFF forbids choice 2 and choice 3 for that one turn only, including check-search.
- Forked worlds clone both game state and PRNG state at the sampled point, so paired worlds resume from the same random sequence.
- Oracle metrics are omitted for this task; depth 6 check-return search remains active.
- No adoption judgement is made here.

## Overall

| Category | n | ON win | OFF win | Δ ON-OFF | AvgR ON | AvgR OFF | Normal AI use |
|---|---:|---:|---:|---:|---:|---:|---:|
| ②+③ | 6000 | 33.1% | 53.8% | -20.7pt | 8.77 | 8.24 | 33.8% |
| ②のみ | 1590 | 27.7% | 49.1% | -21.3pt | 8.50 | 7.87 | 0.9% |
| ③のみ | 4410 | 35.1% | 55.6% | -20.5pt | 8.86 | 8.37 | 45.6% |

## Layer Counts

| Layer | ②+③ n | ② n | ③ n | ②vs③ direct n |
|---|---:|---:|---:|---:|
| 劣勢 × 王手被弾中 | 7 | 1 | 6 | 0 |
| 劣勢 × 通常 | 4112 | 397 | 3715 | 4 |
| 互角 × 王手被弾中 | 0 | 0 | 0 | 0 |
| 互角 × 通常 | 1801 | 1161 | 640 | 2 |
| 優勢 × 王手被弾中 | 0 | 0 | 0 | 0 |
| 優勢 × 通常 | 80 | 31 | 49 | 0 |

## ②+③ Combined By Layer

| Layer | n | ON win | OFF win | Δ ON-OFF | AvgR ON | AvgR OFF | Normal AI use |
|---|---:|---:|---:|---:|---:|---:|---:|
| 劣勢 × 王手被弾中 | 7 | 0.0% | 14.3% | -14.3pt | 7.14 | 6.21 | 57.1% |
| 劣勢 × 通常 | 4112 | 31.7% | 50.8% | -19.1pt | 8.82 | 8.39 | 44.0% |
| 互角 × 王手被弾中 | 0 | - | - | - | - | - | - |
| 互角 × 通常 | 1801 | 34.8% | 59.2% | -24.4pt | 8.60 | 7.91 | 11.4% |
| 優勢 × 王手被弾中 | 0 | - | - | - | - | - | - |
| 優勢 × 通常 | 80 | 75.0% | 92.5% | -17.5pt | 9.59 | 7.82 | 7.5% |

## ② Only By Layer

| Layer | n | ON win | OFF win | Δ ON-OFF | AvgR ON | AvgR OFF | Normal AI use |
|---|---:|---:|---:|---:|---:|---:|---:|
| 劣勢 × 王手被弾中 | 1 | 0.0% | 0.0% | +0.0pt | 6.50 | 6.50 | 0.0% |
| 劣勢 × 通常 | 397 | 22.4% | 34.8% | -12.3pt | 9.44 | 8.80 | 2.0% |
| 互角 × 王手被弾中 | 0 | - | - | - | - | - | - |
| 互角 × 通常 | 1161 | 28.7% | 53.0% | -24.3pt | 8.14 | 7.55 | 0.5% |
| 優勢 × 王手被弾中 | 0 | - | - | - | - | - | - |
| 優勢 × 通常 | 31 | 61.3% | 87.1% | -25.8pt | 10.13 | 8.32 | 0.0% |

## ③ Only By Layer

| Layer | n | ON win | OFF win | Δ ON-OFF | AvgR ON | AvgR OFF | Normal AI use |
|---|---:|---:|---:|---:|---:|---:|---:|
| 劣勢 × 王手被弾中 | 6 | 0.0% | 16.7% | -16.7pt | 7.25 | 6.17 | 66.7% |
| 劣勢 × 通常 | 3715 | 32.7% | 52.5% | -19.8pt | 8.76 | 8.35 | 48.5% |
| 互角 × 王手被弾中 | 0 | - | - | - | - | - | - |
| 互角 × 通常 | 640 | 45.8% | 70.5% | -24.7pt | 9.45 | 8.57 | 31.1% |
| 優勢 × 王手被弾中 | 0 | - | - | - | - | - | - |
| 優勢 × 通常 | 49 | 83.7% | 95.9% | -12.2pt | 9.26 | 7.50 | 12.2% |

## ② vs ③ Direct Comparison

Rows only include states where choice 2 was the forced best action and at least one legal attack-only action also existed in the same state.

| Layer | n | ② win | ③ win | Δ ②-③ | AvgR ② | AvgR ③ | AI chose ② | AI chose ③ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Overall | 6 | 16.7% | 33.3% | -16.7pt | 7.58 | 8.33 | 0.0% | 0.0% |
| 劣勢 × 王手被弾中 | 0 | - | - | - | - | - | - | - |
| 劣勢 × 通常 | 4 | 0.0% | 25.0% | -25.0pt | 7.63 | 8.75 | 0.0% | 0.0% |
| 互角 × 王手被弾中 | 0 | - | - | - | - | - | - | - |
| 互角 × 通常 | 2 | 50.0% | 50.0% | +0.0pt | 7.50 | 7.50 | 0.0% | 0.0% |
| 優勢 × 王手被弾中 | 0 | - | - | - | - | - | - | - |
| 優勢 × 通常 | 0 | - | - | - | - | - | - | - |

## Output

JSON: `C:\Projects\codex\eoj-reboot\docs\baselines\react-value-forked-results.json`
