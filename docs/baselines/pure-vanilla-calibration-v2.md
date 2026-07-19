> **[strict紀元]** 旧配置ルール(自軍隣接のみ)での測定。2026-07-19の紙ルール改元以前の基準であり、現行の判断にはpaper紀元の測定を使うこと。

# Pure Vanilla Calibration v2

Date: 2026-07-05

This run replaces the previous `pure-vanilla-calibration-results.json`. The older run is treated as invalid because the engine was not yet synced with RULE_SPEC.

## Inputs

- RULE_SPEC source: `C:\Users\princ\.codex\attachments\a2e72f60-bb0d-4b66-af1d-26fe7f1a501f\pasted-text.txt`
- Task spec: `C:\Projects\codex\eoj-reboot\docs\codex-task-phase0-spec-sync.md`
- Roadmap: `C:\Projects\codex\eoj-reboot\docs\balance-roadmap.md`
- Calibration spec: `C:\Projects\codex\eoj-reboot\docs\codex-task-pure-vanilla-calibration.md`

## Command

```powershell
node scripts\explore-stat-curves.cjs --pure --samples 1000 --seed 20260702 --oracle --check-search-depth 6
```

Output JSON:

```text
C:\Projects\codex\eoj-reboot\docs\baselines\pure-vanilla-calibration-v2-results.json
```

## Engine Sync Notes

- Deck exhaustion now shuffles discard into a new deck. No fatigue damage or deck-out loss is applied in pure vanilla v2.
- Rotation remains one rotation per creature per turn, following the already-decided exception.
- Summon placement now uses own-creature adjacency only. If the player has no creatures, any empty cell is legal.
- Destroyed creatures go to their owner's discard, and the destroyed creature's owner gains `DESTROY_MANA_GAIN=1`.
- Pure attributes use `earth/water/fire/wind/neutral`, with fixed board layout: `water fire wind / earth neutral water / fire wind earth`.
- Attribute HP modifiers are applied on summon and capped by `MAX_HP=10`. Pure vanilla has no movement effects, so apply/remove-on-move is not exercised here.
- Life value is card data in generated pure cards: C2-C4=1, C5-C6=3, C7=4.
- Mana refill happens at turn end before hand refill. Initial mana is first player 3, second player 4. Mana cap remains 15.
- If a check-search return plan uses summon, the main phase ends and normal reactivation is skipped.

## Implementation Notes

- If both deck and discard are empty during hand refill, drawing simply stops; no loss is generated.
- "Stall turn rate" follows the calibration spec literally: no creature in hand, or creature in hand but all are unaffordable. A turn with no legal adjacent summon cell is not counted as mana/card stall unless one of those two conditions is true. Own 5-creature board states are excluded.
- The old non-pure card path keeps the existing card attributes and older options for compatibility. The v2 pure path uses the fixed RULE_SPEC attributes.
- Score functions, band judgments, and rankings are not emitted for pure vanilla output.

## Variant KPI Table

| Variant | AvgR | Med | P90 | Territory | Life | Timeout | P0 | 4Ret | Oracle | Realized | Kills | AtkReact | Rot | RotShare | WeakKill | Stall | ManaUse | FirstSummonMed | Board3Med | DeckEmpty | EmptyMed | Reshuffle | ReshuffleMed | DestroyMana | ReactUnused |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| curveA/light | 6.55 | 6.5 | 8.5 | 100.0% | 0.0% | 0.0% | 47.2% | 46.2% | 46.2% | 100.0% | 2.5 | 2.0 | 0.1 | 5.0% | 67.7% | 13.5% | 87.2% | 0.5 | 3.0 | 0.0% | - | 0.0% | - | 2.5 | 74.2% |
| curveA/lowmid | 6.62 | 6.5 | 9.0 | 100.0% | 0.0% | 0.0% | 50.0% | 45.4% | 45.4% | 100.0% | 2.6 | 2.0 | 0.1 | 4.6% | 64.2% | 14.7% | 88.0% | 0.5 | 3.0 | 0.0% | - | 0.0% | - | 2.6 | 74.8% |
| curveA/balance | 7.06 | 7.0 | 9.5 | 100.0% | 0.0% | 0.0% | 48.8% | 41.6% | 41.6% | 100.0% | 2.8 | 2.2 | 0.1 | 4.8% | 56.0% | 18.8% | 88.7% | 0.5 | 3.5 | 0.1% | 14.5 | 0.0% | - | 2.8 | 73.7% |
| curveA/midheavy | 8.14 | 7.5 | 11.0 | 100.0% | 0.0% | 0.0% | 47.1% | 35.4% | 35.4% | 100.0% | 3.1 | 2.5 | 0.1 | 4.9% | 47.7% | 30.3% | 89.7% | 0.5 | 3.5 | 0.0% | - | 0.0% | - | 3.1 | 73.7% |
| curveA/heavy | 8.96 | 8.5 | 12.5 | 100.0% | 0.0% | 0.0% | 52.2% | 32.6% | 32.6% | 100.0% | 3.3 | 2.9 | 0.1 | 4.8% | 46.8% | 35.8% | 90.4% | 0.5 | 3.5 | 0.0% | - | 0.0% | - | 3.3 | 72.9% |
| curveB/light | 7.20 | 7.0 | 9.5 | 100.0% | 0.0% | 0.0% | 48.4% | 51.3% | 51.3% | 100.0% | 3.9 | 2.1 | 0.2 | 9.9% | 51.8% | 13.6% | 89.4% | 0.5 | 3.5 | 0.5% | 12.5 | 0.3% | 14.5 | 3.9 | 72.7% |
| curveB/lowmid | 7.49 | 7.0 | 10.0 | 99.9% | 0.1% | 0.0% | 48.8% | 50.7% | 50.7% | 100.0% | 4.0 | 2.2 | 0.3 | 10.6% | 49.0% | 15.8% | 90.4% | 0.5 | 3.5 | 0.8% | 12.5 | 0.2% | 17.0 | 4.0 | 72.6% |
| curveB/balance | 8.15 | 8.0 | 11.5 | 99.9% | 0.1% | 0.0% | 48.2% | 49.2% | 49.3% | 100.0% | 4.6 | 2.6 | 0.3 | 11.2% | 41.6% | 20.2% | 91.1% | 0.5 | 3.5 | 2.2% | 14.0 | 0.8% | 14.0 | 4.6 | 70.7% |
| curveB/midheavy | 9.76 | 9.0 | 14.5 | 99.2% | 0.8% | 0.0% | 48.0% | 43.9% | 44.0% | 99.8% | 5.2 | 3.2 | 0.4 | 10.6% | 36.6% | 31.9% | 92.0% | 0.5 | 4.0 | 2.7% | 16.0 | 1.2% | 19.0 | 5.2 | 70.3% |
| curveB/heavy | 10.82 | 10.0 | 15.5 | 98.3% | 1.7% | 0.0% | 48.5% | 41.2% | 41.3% | 99.7% | 5.6 | 3.6 | 0.4 | 10.2% | 35.1% | 37.5% | 92.7% | 0.5 | 4.5 | 2.9% | 16.0 | 0.6% | 18.5 | 5.6 | 69.2% |
| curveC/light | 6.54 | 6.5 | 8.5 | 100.0% | 0.0% | 0.0% | 48.3% | 47.8% | 47.8% | 100.0% | 2.8 | 2.4 | 0.1 | 4.3% | 63.6% | 11.9% | 87.9% | 0.5 | 3.0 | 0.1% | 10.0 | 0.1% | 11.0 | 2.8 | 70.3% |
| curveC/lowmid | 6.65 | 6.5 | 9.0 | 100.0% | 0.0% | 0.0% | 46.9% | 43.7% | 43.7% | 100.0% | 2.8 | 2.3 | 0.1 | 4.5% | 61.6% | 14.2% | 88.3% | 0.5 | 3.0 | 0.1% | 10.0 | 0.0% | - | 2.8 | 71.4% |
| curveC/balance | 7.07 | 7.0 | 9.5 | 100.0% | 0.0% | 0.0% | 48.3% | 42.2% | 42.2% | 100.0% | 3.0 | 2.5 | 0.1 | 4.8% | 52.5% | 18.5% | 89.2% | 0.5 | 3.5 | 0.1% | 15.5 | 0.1% | 16.5 | 3.0 | 71.7% |
| curveC/midheavy | 8.29 | 8.0 | 11.5 | 99.9% | 0.1% | 0.0% | 48.6% | 37.6% | 37.6% | 99.9% | 3.5 | 3.0 | 0.2 | 5.1% | 46.4% | 30.0% | 90.5% | 0.5 | 3.5 | 0.3% | 15.0 | 0.1% | 16.0 | 3.5 | 71.3% |
| curveC/heavy | 9.28 | 8.5 | 13.5 | 99.3% | 0.7% | 0.0% | 49.8% | 36.8% | 36.9% | 99.7% | 3.7 | 3.4 | 0.2 | 5.0% | 42.5% | 36.4% | 91.1% | 0.5 | 3.5 | 0.4% | 18.0 | 0.0% | - | 3.7 | 71.5% |
| curveD/light | 6.35 | 6.0 | 8.0 | 100.0% | 0.0% | 0.0% | 39.4% | 48.2% | 48.2% | 100.0% | 2.8 | 2.5 | 0.2 | 6.4% | 63.0% | 10.4% | 87.6% | 0.5 | 3.0 | 0.3% | 11.0 | 0.1% | 17.0 | 2.8 | 69.3% |
| curveD/lowmid | 6.63 | 6.5 | 9.0 | 99.8% | 0.2% | 0.0% | 41.1% | 46.8% | 46.8% | 100.0% | 2.9 | 2.5 | 0.2 | 6.6% | 61.1% | 13.2% | 87.9% | 0.5 | 3.0 | 0.4% | 12.0 | 0.3% | 12.0 | 2.9 | 71.3% |
| curveD/balance | 6.99 | 6.5 | 9.5 | 99.9% | 0.1% | 0.0% | 42.5% | 45.1% | 45.1% | 100.0% | 3.1 | 2.7 | 0.2 | 6.1% | 55.2% | 17.6% | 89.2% | 0.5 | 3.5 | 0.3% | 13.0 | 0.0% | - | 3.1 | 70.0% |
| curveD/midheavy | 8.68 | 8.0 | 12.5 | 99.6% | 0.4% | 0.0% | 44.2% | 40.6% | 40.6% | 99.9% | 4.0 | 3.7 | 0.2 | 5.9% | 43.4% | 30.3% | 91.3% | 0.5 | 3.5 | 0.9% | 15.0 | 0.3% | 18.0 | 4.0 | 68.9% |
| curveD/heavy | 9.77 | 9.0 | 14.5 | 98.4% | 1.6% | 0.0% | 45.4% | 39.2% | 39.4% | 99.6% | 4.3 | 4.4 | 0.3 | 5.6% | 38.6% | 36.7% | 91.5% | 0.5 | 4.0 | 1.8% | 17.0 | 0.3% | 17.0 | 4.3 | 68.5% |

## KPI Ranges

| KPI | Min | Max |
|---|---:|---:|
| AvgR | 6.35 (curveD/light) | 10.82 (curveB/heavy) |
| MedianR | 6.0 (curveD/light) | 10.0 (curveB/heavy) |
| P90R | 8.0 (curveD/light) | 15.5 (curveB/heavy) |
| Territory | 98.3% (curveB/heavy) | 100.0% (curveD/light) |
| Life | 0.0% (curveA/light) | 1.7% (curveB/heavy) |
| Timeout | 0.0% (curveA/light) | 0.0% (curveD/heavy) |
| P0 win | 39.4% (curveD/light) | 52.2% (curveA/heavy) |
| 4-check return | 32.6% (curveA/heavy) | 51.3% (curveB/light) |
| Oracle returnable | 32.6% (curveA/heavy) | 51.3% (curveB/light) |
| Kills/game | 2.5 (curveA/light) | 5.6 (curveB/heavy) |
| Weak kill | 35.1% (curveB/heavy) | 67.7% (curveA/light) |
| Attack react/game | 2.0 (curveA/lowmid) | 4.4 (curveD/heavy) |
| Rotations/game | 0.1 (curveA/lowmid) | 0.4 (curveB/heavy) |
| Rotation share | 4.3% (curveC/light) | 11.2% (curveB/balance) |
| Stall turn rate | 10.4% (curveD/light) | 37.5% (curveB/heavy) |
| Mana use | 87.2% (curveA/light) | 92.7% (curveB/heavy) |
| Deck empty game | 0.0% (curveA/light) | 2.9% (curveB/heavy) |
| Reshuffle game | 0.0% (curveA/light) | 1.2% (curveB/midheavy) |
| Destroy mana/game | 2.5 (curveA/light) | 5.6 (curveB/heavy) |
| React unused | 68.5% (curveD/heavy) | 74.8% (curveA/lowmid) |
