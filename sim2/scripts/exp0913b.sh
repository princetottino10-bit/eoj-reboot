#!/usr/bin/env bash
# EXP-0913B Sec.3 experiment menu.
# Common: pack shuten-kyuryu mirror, chipMode catch_up, effects on,
# incomeTiming turn_end, base seed 20260910 (consecutive per game).
# greedy 100 games / beam 50 games.
# Then renders sim2/RESULTS-EXP0913B.md from the JSON in sim2/out/.
set -euo pipefail
cd "$(dirname "$0")/../.."

RUN="node --experimental-strip-types sim2/src/cli.ts selfplay"
SEED=20260910
OUT=sim2/out

run() {
  local id="$1"; shift
  for ai in greedy beam; do
    local games=100
    [ "$ai" = beam ] && games=50
    echo "== $id / $ai" >&2
    $RUN --games "$games" --seed "$SEED" --pack shuten-kyuryu \
      --ai "$ai,$ai" --chip-mode catch_up --effects on --income-timing turn_end \
      --label "$id/$ai" --out "$OUT/exp0913b-$id-$ai.json" \
      --games-out "$OUT/exp0913b-$id-$ai.jsonl" "$@" >/dev/null
  done
}

# the 9/13 ruleset (summonLimit none)
R913=(--refund-mode killer_half --inherit-summon on --counter-mode gap
      --mulligan on --control-hold next_turn_end --hand-mode refill_to_5)

run K0 "${R913[@]}"
run K1 "${R913[@]}" --refund-mode half
run K2 "${R913[@]}" --inherit-summon off
run K3 "${R913[@]}" --counter-mode all
run K4 "${R913[@]}" --control-hold next_turn_start
run K5 "${R913[@]}" --base-income 4
run K6 "${R913[@]}" --hand-mode replace_discarded
run K7 "${R913[@]}" --summon-limit 1
# 8/28 rules + the new cards (incomeTiming stays turn_end: Sec.3 common)
run K8 --refund-mode half --inherit-summon off --counter-mode all \
  --mulligan off --control-hold next_turn_start
# reference only: K8 with the 8/28 income timing (turn_start)
run K8ts --refund-mode half --inherit-summon off --counter-mode all \
  --mulligan off --control-hold next_turn_start --income-timing turn_start

node --experimental-strip-types sim2/scripts/exp0913b-report.ts
