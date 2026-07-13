> **[廃案の検証記録]** ファティーグ検証。ルール自体は RULE_SPEC §15 により不採用。

# デッキルール v0 再計測結果

Status: result memo, judgment pending
Date: 2026-07-05

## 実行条件

- Games: 2000 per run
- Seed: `20260702`
- Oracle: enabled
- Check-search depth: `6`
- Base curve: v1.1 R1 rotation-active baseline
- Effects/items: ignored
- Item slots: not included in the vanilla sim

Command:

```powershell
node scripts\explore-stat-curves.cjs --deck-rules-grid --samples 2000 --top 3 --seed 20260702 --p1-mana 1 --oracle --check-search-depth 6
```

## Runs

| Run | Deck | Fatigue |
|---|---|---|
| D0 | 12 creatures | none |
| D1 | 16 creatures, all 10 faction creatures + 6 random duplicates, 2-copy limit | none |
| D2 | 16 creatures, all 10 faction creatures + 6 random duplicates, 2-copy limit | refill fatigue 1 life per turn |

## KPI 比較

| Run | Avg R | Median | P90 | Territory | Life | Fatigue win | Timeout | First win | 4-check return | High-cost 4-return | Kills | Rotations | Weak kill |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| D0 12/no fatigue | 11.38 | 9.0 | 20.5 | 90.6% | 6.3% | 0.0% | 3.1% | 50.9% | 54.1% | 45.5% | 7.2 | 7.1 | 64.3% |
| D1 16/no fatigue | 10.23 | 9.5 | 15.0 | 98.6% | 1.4% | 0.0% | 0.0% | 52.8% | 56.9% | 53.3% | 6.9 | 6.4 | 65.5% |
| D2 16/fatigue | 10.17 | 9.5 | 15.5 | 96.3% | 3.7% | 2.3% | 0.0% | 51.0% | 58.1% | 52.3% | 6.9 | 6.1 | 65.6% |

## デッキ切れ

| Run | Deck-empty games | First empty median R | First empty P90 R | Deck exhaustions/game |
|---|---:|---:|---:|---:|
| D0 12/no fatigue | 67.9% | 7.0 | 9.0 | 1.25 |
| D1 16/no fatigue | 10.7% | 14.0 | 17.0 | 0.11 |
| D2 16/fatigue | 12.2% | 14.5 | 17.0 | 0.12 |

## Fatigue Metrics

| Run | Fatigue damage/game | Fatigue events/game | Fatigue win rate |
|---|---:|---:|---:|
| D0 12/no fatigue | 0.0 | 0.0 | 0.0% |
| D1 16/no fatigue | 0.0 | 0.0 | 0.0% |
| D2 16/fatigue | 0.2 | 0.2 | 2.3% |

## Notes For Review

- D1 isolates the 16-creature deck effect without fatigue.
- D2 isolates the additional fatigue effect on top of D1.
- D0 is the same command-run control, not the older v1.1 snapshot file. It should be compared primarily against D1/D2 in this run.
- The result file includes the full matchup matrix for all three runs.

## Files

- Result JSON: `docs/baselines/deck-rules-v0-results.json`
- Result JSON SHA256: `58A2620751FB8C8D4CA4ABF32242171C913E12036BF42E8D32651409C3DE0C62`
- Script: `scripts/explore-stat-curves.cjs`
- Script SHA256: `478142C56ED89BB13D32C8628FD34DD4BA152728BED0EEFB228CA93CC7277247`
- Repo HEAD at run time: `f91a33e91f4f6b7285b93568e29a19d4b5bbcf73`
- Logs: `deck-rules-v0-2000.out.log`, `deck-rules-v0-2000.err.log`
