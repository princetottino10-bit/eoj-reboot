#!/usr/bin/env bash
# EXP-0913 Sec.2 experiment menu.
# All conditions: pack tsukumo-miyako mirror, chipMode catch_up, effects on,
# base seed 20260906 (consecutive per game). greedy 100 games / beam 50.
set -euo pipefail
cd "$(dirname "$0")/../.."

RUN="node --experimental-strip-types sim2/src/cli.ts selfplay"
SEED=20260906
OUT=sim2/out

run() {
  local id="$1"; shift
  for ai in greedy beam; do
    local games=100
    [ "$ai" = beam ] && games=50
    echo "== $id / $ai" >&2
    $RUN --games "$games" --seed "$SEED" --pack tsukumo-miyako \
      --ai "$ai,$ai" --chip-mode catch_up --effects on \
      --label "$id/$ai" --out "$OUT/exp0913-$id-$ai.json" "$@" >/dev/null
  done
}

# A: summon limit 1 (the primary question)
run A0
run A1 --summon-limit 1 --income-timing turn_end
run A2 --summon-limit 1 --income-timing turn_end --aoe-mode off
run A3 --summon-limit 1 --income-timing turn_end --aoe-mode no_ff

# B: one prescription at a time, all with unlimited summons
run B1 --attack-cost-delta -1
run B2 --counter-mode single
run B3 --refund-mode none --summon-cost-scale half
run B4 --move-on-kill on
run B5 --aoe-mode no_ff
run B6 --base-income 4

# C: decisions independent of the branch
run C1 --life-value off --deck-out-mode second
run C2 --life-value off --deck-out-mode second --summon-limit 1
