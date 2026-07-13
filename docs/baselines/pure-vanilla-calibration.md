> **[破棄]** 仕様同期前(ファティーグ入り等)の計測。pure-vanilla-calibration-v2.md を参照。

# 純粋バニラ探索 段階1: キャリブレーション結果

Status: result memo, judgment pending
Date: 2026-07-05

## 実行条件

- Mode: pure vanilla calibration
- Variants: 3 curves x 5 cost distributions = 15
- Matchup: mirror only
- Games: 1000 per variant
- Seed: `20260702`
- Oracle: enabled
- Check-search depth: `6`
- Second-player starting mana: `+1`
- Deck: 16 creatures
- Fatigue: enabled
- Score/ranking: not used

Command:

```powershell
node scripts\explore-stat-curves.cjs --pure --samples 1000 --seed 20260702 --p1-mana 1 --oracle --check-search-depth 6
```

## Pure Template

- Attack cells: `[[1, 0]]`
- Attack target count: 1
- Counter cells: `[[1, 0]]`
- Weakness cells: `[[-1, 0]]`
- Attack type: physical
- Keywords/effects: none
- Shape tax: none
- Rotation cost: same as attack reactivation cost
- Attribute assignment: each 16-card deck gets an exactly even shuffled bag of the four non-neutral board attributes

## Full KPI Table

| Variant | AvgR | Med | P90 | Terr | Life | FatigueWin | Timeout | P0 | 4Ret | Oracle | Realized | Kills | WeakKill | AtkReact | Rot | RotShare | ManualAtk | SummonAtk | Overflow | ManaUse | Stuck | ReactUnused | FirstSummonMed | Board3Med | DeckEmpty | EmptyMed | FatigueDmg |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| curveA/light | 8.01 | 7.5 | 11.0 | 99.4% | 0.6% | 0.4% | 0.0% | 56.9% | 60.9% | 60.9% | 100.0% | 4.9 | 63.5% | 3.6 | 0.1 | 3.6% | 3.6 | 10.3 | 0.0 | 96.9% | 18.2% | 63.2% | 0.5 | 3.5 | 2.1% | 13.0 | 0.0 |
| curveA/lowmid | 8.14 | 7.5 | 11.5 | 99.6% | 0.4% | 0.3% | 0.0% | 52.7% | 58.2% | 58.2% | 100.0% | 4.9 | 65.0% | 3.5 | 0.1 | 3.7% | 3.5 | 10.3 | 0.0 | 97.4% | 19.1% | 64.3% | 0.5 | 3.5 | 3.0% | 13.0 | 0.0 |
| curveA/balance | 9.12 | 8.5 | 13.0 | 99.0% | 1.0% | 0.7% | 0.0% | 52.3% | 58.5% | 58.5% | 100.0% | 5.7 | 60.8% | 4.0 | 0.2 | 3.9% | 4.0 | 11.1 | 0.0 | 97.5% | 24.4% | 62.5% | 0.5 | 4.0 | 5.0% | 13.5 | 0.0 |
| curveA/midheavy | 11.09 | 10.5 | 16.0 | 96.4% | 3.6% | 0.8% | 0.0% | 49.1% | 50.7% | 50.9% | 99.6% | 6.7 | 57.1% | 4.8 | 0.2 | 4.8% | 4.8 | 11.7 | 0.0 | 97.5% | 35.7% | 62.3% | 0.5 | 4.5 | 6.5% | 15.5 | 0.0 |
| curveA/heavy | 12.12 | 11.5 | 17.0 | 93.4% | 6.6% | 1.0% | 0.0% | 49.8% | 46.0% | 46.4% | 99.2% | 6.9 | 57.5% | 5.1 | 0.2 | 3.8% | 5.1 | 11.8 | 0.0 | 97.2% | 40.8% | 62.0% | 0.5 | 5.0 | 6.6% | 16.5 | 0.0 |
| curveB/light | 10.41 | 10.0 | 14.5 | 91.2% | 8.8% | 5.1% | 0.0% | 55.9% | 69.2% | 69.3% | 99.9% | 9.2 | 54.6% | 4.6 | 0.5 | 9.7% | 4.6 | 14.1 | 0.0 | 97.5% | 19.1% | 57.6% | 0.5 | 4.5 | 22.4% | 12.0 | 0.3 |
| curveB/lowmid | 10.65 | 10.5 | 14.5 | 91.9% | 8.1% | 4.6% | 0.0% | 52.5% | 69.0% | 69.1% | 100.0% | 9.3 | 54.7% | 4.5 | 0.5 | 9.4% | 4.5 | 14.3 | 0.0 | 97.9% | 20.4% | 58.1% | 0.5 | 4.5 | 22.6% | 12.0 | 0.3 |
| curveB/balance | 11.35 | 11.0 | 15.5 | 85.6% | 14.4% | 7.9% | 0.0% | 50.9% | 66.3% | 66.3% | 100.0% | 9.7 | 51.8% | 4.7 | 0.6 | 11.4% | 4.7 | 14.5 | 0.0 | 98.1% | 24.6% | 57.4% | 0.5 | 4.5 | 28.3% | 12.5 | 0.3 |
| curveB/midheavy | 13.46 | 13.5 | 18.0 | 76.7% | 23.3% | 7.4% | 0.0% | 49.8% | 58.0% | 58.5% | 99.2% | 10.4 | 51.0% | 5.5 | 0.6 | 9.6% | 5.5 | 14.7 | 0.0 | 97.6% | 35.7% | 58.3% | 0.5 | 5.0 | 30.7% | 14.5 | 0.2 |
| curveB/heavy | 14.25 | 14.5 | 18.5 | 73.9% | 26.1% | 4.5% | 0.0% | 48.0% | 53.3% | 54.3% | 98.3% | 10.2 | 49.9% | 5.6 | 0.5 | 8.5% | 5.6 | 14.3 | 0.0 | 97.4% | 40.6% | 58.1% | 0.5 | 5.5 | 23.9% | 15.5 | 0.1 |
| curveC/light | 7.92 | 7.5 | 10.5 | 99.2% | 0.8% | 0.3% | 0.0% | 55.4% | 63.0% | 63.0% | 100.0% | 5.3 | 61.6% | 4.0 | 0.2 | 3.7% | 4.0 | 10.6 | 0.0 | 97.1% | 14.6% | 62.3% | 0.5 | 3.0 | 3.8% | 12.0 | 0.0 |
| curveC/lowmid | 8.37 | 8.0 | 12.0 | 98.8% | 1.2% | 0.8% | 0.0% | 52.9% | 60.6% | 60.6% | 100.0% | 5.5 | 61.8% | 4.2 | 0.2 | 4.0% | 4.2 | 10.9 | 0.0 | 97.4% | 18.3% | 61.7% | 0.5 | 3.5 | 5.0% | 12.5 | 0.0 |
| curveC/balance | 9.39 | 9.0 | 13.5 | 97.6% | 2.4% | 1.6% | 0.0% | 51.3% | 58.2% | 58.3% | 99.9% | 6.4 | 59.4% | 4.8 | 0.3 | 5.3% | 4.8 | 11.5 | 0.0 | 97.7% | 23.8% | 59.9% | 0.5 | 3.5 | 7.1% | 13.0 | 0.1 |
| curveC/midheavy | 11.79 | 11.5 | 17.0 | 91.0% | 9.0% | 1.8% | 0.0% | 46.7% | 51.6% | 52.1% | 99.2% | 7.6 | 55.7% | 6.0 | 0.3 | 4.8% | 6.0 | 12.4 | 0.0 | 97.7% | 36.3% | 59.1% | 0.5 | 4.5 | 12.3% | 14.5 | 0.1 |
| curveC/heavy | 12.81 | 12.5 | 18.0 | 89.4% | 10.6% | 1.3% | 0.0% | 49.7% | 48.3% | 48.7% | 99.2% | 7.7 | 54.8% | 6.3 | 0.4 | 5.4% | 6.3 | 12.3 | 0.0 | 97.5% | 41.7% | 59.7% | 0.5 | 5.0 | 10.5% | 16.5 | 0.0 |

## KPI Value Ranges

| Metric | Min | Min Variant | Max | Max Variant |
|---|---:|---|---:|---|
| Avg R | 7.92 | curveC/light | 14.25 | curveB/heavy |
| Median R | 7.5 | curveA/light | 14.5 | curveB/heavy |
| P90 R | 10.5 | curveC/light | 18.5 | curveB/heavy |
| Territory win | 73.9% | curveB/heavy | 99.6% | curveA/lowmid |
| Life win | 0.4% | curveA/lowmid | 26.1% | curveB/heavy |
| Fatigue win | 0.3% | curveA/lowmid | 7.9% | curveB/balance |
| Timeout | 0.0% | curveA/light | 0.0% | curveA/light |
| First-player win | 46.7% | curveC/midheavy | 56.9% | curveA/light |
| 4-check return | 46.0% | curveA/heavy | 69.2% | curveB/light |
| Oracle returnable | 46.4% | curveA/heavy | 69.3% | curveB/light |
| Oracle realized | 98.3% | curveB/heavy | 100.0% | curveA/lowmid |
| Kills/game | 4.9 | curveA/light | 10.4 | curveB/midheavy |
| Weak kill rate | 49.9% | curveB/heavy | 65.0% | curveA/lowmid |
| Attack reactivations/game | 3.5 | curveA/lowmid | 6.3 | curveC/heavy |
| Rotations/game | 0.1 | curveA/light | 0.6 | curveB/balance |
| Rotation share | 3.6% | curveA/light | 11.4% | curveB/balance |
| Manual attacks/game | 3.5 | curveA/lowmid | 6.3 | curveC/heavy |
| Summon attacks/game | 10.3 | curveA/light | 14.7 | curveB/midheavy |
| Mana overflow/game | 0.0 | curveA/light | 0.0 | curveA/light |
| Mana utilization | 96.9% | curveA/light | 98.1% | curveB/balance |
| Stuck turn rate | 14.6% | curveC/light | 41.7% | curveC/heavy |
| Reactivation unused rate | 57.4% | curveB/balance | 64.3% | curveA/lowmid |
| First summon median R | 0.5 | curveA/light | 0.5 | curveA/light |
| Board3 median R | 3.0 | curveC/light | 5.5 | curveB/heavy |
| Deck-empty game rate | 2.1% | curveA/light | 30.7% | curveB/midheavy |
| Deck-empty median R | 12.0 | curveB/light | 16.5 | curveA/heavy |
| Fatigue damage/game | 0.0 | curveA/lowmid | 0.3 | curveB/balance |

## Implementation Notes

- The pure mode does not read `cards.json`; it generates cards from the template and the selected curve/distribution.
- Each 16-card pure deck receives exactly four cards of each non-neutral board attribute, then shuffles them. This keeps attributes evenly represented while preserving random order.
- Stuck turn rate counts active turns where the player does not already control 5 cells and either has no hand cards or has hand cards but none affordable. It does not count placement blockage separately if an affordable card exists.
- Mana utilization uses total mana spent divided by total mana income, including second-player starting mana, turn income, and kill reward mana. Income is counted before cap overflow is discarded.
- First summon and board-3 rounds use the same `halfTurns / 2` convention as the sim's round reporting, so the first player's opening turn is round `0.0` and the second player's opening turn is round `0.5`.
- Reactivation unused rate is measured after check-search response and before the normal reactivation loop. An opportunity means at least one active creature has an attack target and enough mana for attack reactivation; unused means the normal reactivation loop spent no reactivation.
- Fatigue wins are still included in `lifeWinRate`, but are also separated as `fatigueWinRate` and `fatigueShareOfLifeWins` in the JSON.
- No score function or band judgment is applied in pure mode; variants are saved in curve/distribution definition order.

## Files

- Result JSON: `docs/baselines/pure-vanilla-calibration-results.json`
- Result JSON SHA256: `67BAA61CDBB94BDF2529C51715BBBFB65E2A369801EF7185BFEAD65AFC4758FE`
- Script: `scripts/explore-stat-curves.cjs`
- Script SHA256: `55FE26F5B0432E19AB0924B3005EA5EB2BB7615B43FB168CD8F01EA1FF073F99`
- Repo HEAD at run time: `f91a33e91f4f6b7285b93568e29a19d4b5bbcf73`
- Logs: `pure-vanilla-calibration-1000.out.log`, `pure-vanilla-calibration-1000.err.log`
