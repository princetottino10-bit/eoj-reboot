// The facing an AI seat gives its 10/3 僵尸公主 after the move (the owner
// chooses: keep, left 90°, right 90°; src/kyonshi.ts). Each option is played
// out on a copy - the whole action, with the 灯籠の精 picks, the turns before it
// and this one - and the result is scored from the owner's side: greedy / beam
// with their eval (占拠, board HP, the threat of the enemy's next attacks, which
// counts blind-side hits), strong with its own (what each side can kill next
// turn, directly or after one rotate). Exact ties keep the facing, then left,
// then right. Always returns one of the three: the seat never stalls.
// Pure: no node builtins.
import type { KyonshiChooser } from "../kyonshi-choice.ts";
import { applyWithChoices } from "../kyonshi-choice.ts";
import { KYONSHI_TURNS } from "../kyonshi.ts";
import type { KyonshiAsk, KyonshiTurn } from "../kyonshi.ts";
import type { Ctx } from "../state.ts";
import type { GameState } from "../types.ts";
import { DEFAULT_WEIGHTS, evaluate } from "./eval.ts";
import type { Weights } from "./eval.ts";
import { STRONG_WEIGHTS, strongEvaluate } from "./strong-eval.ts";
import type { StrongWeights } from "./strong-eval.ts";

type Score = (ctx: Ctx, s: GameState, ask: KyonshiAsk) => number;

const pickBy = (score: Score): KyonshiChooser => (ctx, s, a, picks, turns, ask) => {
  let best: KyonshiTurn = 0;
  let bestScore = -Infinity;
  for (const t of KYONSHI_TURNS) {
    const { result } = applyWithChoices(ctx, s, a, picks, [...turns, t]);
    const v = score(ctx, result.state, ask);
    if (v > bestScore) {
      bestScore = v;
      best = t;
    }
  }
  return best;
};

/** greedy / beam (and any seat without its own chooser). */
export const bestKyonshiTurn = (w: Weights = DEFAULT_WEIGHTS): KyonshiChooser =>
  pickBy((ctx, s, ask) => evaluate(ctx, s, ask.owner, w));

/** strong: its own eval of the board each facing leaves. */
export const strongKyonshiTurn = (w: StrongWeights = STRONG_WEIGHTS): KyonshiChooser =>
  pickBy((ctx, s, ask) => strongEvaluate(ctx, s, ask.owner, w));
