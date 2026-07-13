> **[アーカイブ]** 初回バランスレビュー(2026-07-02)用の資料。ルール・数値は当時のもので現行と異なる。

# Claude Balance Review Brief

## Purpose

3x3盤面カードゲームのバランス調整について、外部レビューを依頼するためのブリーフ。

重要: repo内の古いルールブックには現在の会話で決まった変更が反映されていない可能性があるため、このブリーフの「Current Rules」を優先する。

## Attachments To Provide

- `C:\Projects\codex\eoj-reboot\data\cards.json`
- `C:\Projects\codex\eoj-reboot\data\cards.schema.json`
- 必要なら参考資料として `C:\Projects\codex\eoj-reboot\data\card-change-history.json`

## Current Card Data Snapshot

- Total characters: 70
- Total items/spells: 34
- Total faction ults: 5
- Current faction enum: `cip`, `aggro`, `spell`, `inheritance`, `mobility`, `defense`, `meta`
- Current balance discussion target factions: `cip`, `aggro`, `spell`, `defense`
- Target faction creature counts:
  - `cip`: 10
  - `aggro`: 10
  - `spell`: 10
  - `defense`: 10
- Attack types:
  - `物理`: 56
  - `魔道`: 14
- Attack modes:
  - `simultaneous`: 44
  - `choice`: 25
  - `none`: 1

## Current Rules

- Board is 3x3.
- A player wins if they control 5 cells at the end of their turn.
- Life total is 15.
- Mana holding cap is 15. Mana above the cap is lost.
- Destroying a creature deals life damage by cost band:
  - Cost 1-4: 1 life damage
  - Cost 5-6: 2 life damage
  - Cost 7: 3 life damage
- On summon, a creature chooses its facing direction.
- Attribute cell modifiers:
  - Matching attribute cell: HP +2
  - Opposed attribute cell: HP -2
  - Neutral interactions: 0
- Physical attacks from a weakness/blind-side cell deal +2 damage.
- Magic attacks do not receive blind-side damage bonus.
- Magic attackers cannot counterattack.
- Reactivation can be used for either:
  - attack
  - 90-degree rotation
- Attack reactivation and rotation are separate once-per-turn-per-creature actions.
- End of turn hand size is 5:
  - draw up to 5 if below 5
  - discard down to 5 if above 5
- Only one creature can be summoned per turn.
- The current design priority is not life-race lethality, but check/counter-check around 3, 4, and 5 occupied cells.
- Fixed balance constraints for the next review batch:
  - life total 15
  - mana cap 15
  - physical weakness/blind-side bonus +2

## Intended Play Experience

The game should usually end around 8-10 rounds.

The primary win condition should be 5-cell territory occupation, not life damage.

The interesting moments should come from:

- creating a 3-cell or 4-cell occupation check
- answering the opponent's 3-cell or 4-cell check
- deciding whether to attack, summon, or rotate
- using facing and weak-side positioning well
- valuing attribute-matched summon cells

Attack should primarily function as a way to answer checks, not as a way to repeatedly clear the whole board.

## Current Simulation Assumptions

The latest simulations are approximate, effect-light simulations using:

- actual card stat lines from `data/cards.json`
- attack cells, attack mode, attack target count
- physical/magic distinction
- weakness cells
- counter range
- attribute HP modifiers
- blind-side physical damage +2
- 5-cell territory win
- reactivation attack and 90-degree rotation
- AI priority:
  - attribute-matched summon cells are strongly preferred
  - bad attribute cells are avoided when alternatives exist
  - when the opponent has 3 creatures, attacking enemy creatures is weighted higher
  - when the opponent has 4 creatures, attacking/check-breaking is highly prioritized

Card effects are not fully simulated yet. The goal is to find a vanilla-ish baseline before adding effect power.

## Recent Simulation Results

| Variant | Avg rounds | Territory win | Life win | Avg board | 4-checks/game | Reactivation total | Kills/game |
|---|---:|---:|---:|---:|---:|---:|---:|
| Current | 21.2 | 81.5% | 16.9% | 3.51 | 4.17 | 14.7 | 14.0 |
| HP +1 | 17.8 | 94.1% | 3.8% | 3.71 | 4.23 | 14.3 | 9.8 |
| HP +2 | 14.5 | 98.2% | 0.6% | 3.84 | 3.84 | 12.7 | 6.7 |
| ATK -1 | 13.5 | 98.6% | 0.8% | 3.80 | 3.56 | 10.5 | 6.8 |
| HP +1 / ATK -1 | 11.3 | 99.7% | 0.1% | 3.90 | 3.04 | 9.7 | 4.3 |
| HP +2 / ATK -1 | 10.0 | 99.9% | 0.0% | 3.96 | 2.75 | 8.9 | 3.0 |
| HP +1 / ATK -1 / mana +3 | 8.3 | 99.8% | 0.2% | 4.12 | 2.31 | 10.3 | 4.6 |

Current interpretation:

- Current stats are too lethal for a territory game.
- Too many kills prevent the board from accumulating toward 5-cell occupation.
- Increasing durability or lowering ATK shortens the game because creatures remain on board and occupation pressure accumulates.
- `HP +2 / ATK -1` is currently the cleanest baseline candidate near 10 rounds.
- `HP +1 / ATK -1 / mana +3` reaches 8 rounds but changes the economy more aggressively.

## Requested Review Questions

Please review from a game design/balance perspective:

1. What KPI set should be used to evaluate this game?
2. What card-level variables should be tracked and scored?
3. What AI/simulation decision variables should be explicit?
4. What are the risks of adopting `HP +2 / ATK -1` as the vanilla baseline?
5. What simulation variants should be tested next?
6. How should we phrase the design language around:
   - board retention
   - check creation
   - check response
   - removal pressure
   - rotation value
   - attribute value

## Desired Output Format

Please answer in Japanese.

Keep the answer practical and suitable for a design meeting:

- concise KPI list
- concise variable list
- risks/concerns
- next simulation plan
- recommended baseline direction
