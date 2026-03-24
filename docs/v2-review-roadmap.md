# EoJ Reboot v2 Review Roadmap

## Purpose

This note is a pre-written review guide for the first serious v2 simulation pass.
Use it after the next batch of results to decide what to change next without re-litigating the whole design from scratch.

## v2 Assumptions

- Board character limit: 5
- Second summon per turn allowed with +1 mana surcharge
- 15 VP wins immediately
- 5-cell control wins at end of turn
- VP is earned from kills
- Control debuff core: `atk_down`, `action_tax`, `brainwashed`
- Ace payoff conditions:
  - Aggro: number of allies that attacked this turn
  - Tank: number of allies currently being covered
  - Control: number of enemies with `atk_down`, `action_tax`, or `brainwashed`
  - Synergy: number of allies holding markers
  - Snipe: number of enemies that cannot counterattack allies
  - Trick: number of allies in enemy blind spots

## What To Read First In The Results

1. Win route split
- How many games ended by VP
- How many games ended by 5-cell control
- Average VP at game end
- Average controlled cells at game end

2. Pace
- Average turns
- Median turns
- Distribution of games ending in 4 or fewer turns
- Distribution of games reaching 15+ turns

3. Faction spread
- Highest and lowest faction win rate
- Gap between highest and lowest
- Whether each faction mostly wins by VP, board, or both

4. Ace relevance
- Summon rate of each ace
- Win rate when each ace is summoned
- Average turn when each ace is summoned
- Whether low-cost packages still outperform the ace plan

## Healthy Outcome Targets

These are not hard laws, just working targets.

- Win route split:
  - VP wins: 30% to 60%
  - Board wins: 40% to 70%
  - If either route is below 20%, it is likely not pulling its weight

- Pace:
  - Average turns: 7 to 11
  - Too low: game is still dominated by cheap tempo
  - Too high: both routes may be too hard to close

- Faction spread:
  - Best to worst gap ideally below 12%
  - Above 15% probably needs immediate faction intervention

- Ace relevance:
  - Each ace should be realistically summonable
  - Each ace should materially improve win odds when summoned
  - If an ace is rarely summoned and weak when summoned, that faction structure is failing

## Decision Tree

### A. VP Wins Are Too Rare

Symptoms:
- VP wins below 20%
- 5-cell wins dominate
- Control and Snipe remain weak

Likely causes:
- VP target too high
- Kill VP pacing too slow
- Board route still closes too quickly

Actions:
- Lower VP target from 15 to 12 or 13
- Raise kill VP for C5-C6 by +1
- Slightly reduce low-cost board pressure
- Increase ace summon frequency before touching ace power

### B. VP Wins Are Too Common

Symptoms:
- VP wins above 70%
- Board control feels secondary
- Snipe/Control dominate by attrition

Likely causes:
- VP target too low relative to kill density
- Kill VP rewards too generous
- High-cost kills overly decisive

Actions:
- Raise VP target from 15 to 18
- Reduce kill VP for C3-C4 or C5-C6 by 1
- Make board wins easier to hold at end of turn
- Nerf safe ranged execution patterns before nerfing whole factions

### C. Low-Cost Tempo Still Dominates

Symptoms:
- Trick or Aggro still closes games before aces matter
- Average turns too low
- Aces are rarely summoned

Likely causes:
- Cheap connectors still too self-sufficient
- Second summon rule helps cheap decks more than ace decks

Actions:
- Raise cost of strongest C1/C2 connectors
- Reduce card draw or mana acceleration on low-cost setup cards
- Restrict second summon further if needed
- Increase ace payoff, not just ace cost reduction

### D. Aces Are Summoned But Do Not Matter

Symptoms:
- Ace summon rate is acceptable
- Ace summon win rate is mediocre

Likely causes:
- Payoff is too mild
- Ace condition is too easy, so the reward was tuned too low
- Ace enters too late without stabilizing the board

Actions:
- Increase ace swing on summon
- Improve ace resilience or immediate payoff
- Add one stronger threshold at condition 3+
- Avoid flat stat buffs only; reward the faction's real gameplan

### E. Control Feels Miserable

Symptoms:
- Players or observers report "nothing happens" games
- Control win rate is good but disliked

Likely causes:
- Too much hard denial
- `brainwashed` appears too often
- `action_tax` stacks too aggressively

Actions:
- Keep `brainwashed` rare and mostly elite-only
- Cap `action_tax` stacking
- Shift power from denial to resource drag and board disadvantage
- Favor `atk_down` over full action suppression

## Faction-Specific Tuning Hooks

### Trick
- Main lever: strongest C1/C2 connectors
- Second lever: blind-spot conversion cards
- Third lever: ace swing size

### Tank
- Main lever: cover density and reward
- Second lever: ability to maintain end-of-turn control
- Third lever: ace survivability

### Control
- Main lever: `action_tax` intensity and uptime
- Second lever: `atk_down` coverage
- Third lever: ace payoff per debuffed enemy

### Synergy
- Main lever: marker spread speed
- Second lever: payoff scaling at 3+ marked allies
- Third lever: ace all-team payoff

### Snipe
- Main lever: safe attack frequency
- Second lever: multi-target execution
- Third lever: mark consistency

### Aggro
- Main lever: attack-count enablement
- Second lever: cheap attack patterns
- Third lever: ace cost reduction cap

## Metrics That Deserve Their Own Export

Add these if they are missing:

- Number of VP wins vs board wins
- VP earned per player per game
- Turn when VP victory occurs
- Turn when board victory occurs
- Ace summon turn by card
- Ace summon count by faction
- Number of blind-spot attacks by faction
- Number of `action_tax` applications
- Number of cover relationships active at end of turn
- Number of marked allies for synergy ace turns

## Likely Immediate Patch Categories

When tomorrow's results come in, classify fixes into one of these buckets:

- Route tuning
  - VP target
  - VP payout
  - board victory timing

- Pace tuning
  - low-cost connectors
  - second summon friction
  - draw/mana acceleration

- Faction tuning
  - per-faction cheap package
  - ace reliability
  - ace reward

- Engine tuning
  - AI value function for VP
  - AI value function for ace setup
  - debuff accounting bugs

## Working Principle

Do not immediately buff weak factions by flat stats.
First ask:

1. Is their route viable
2. Is their ace reachable
3. Does the AI understand their route
4. Is a stronger cheap package masking the issue

The cleanest changes are the ones that restore route clarity, not just raw power.
