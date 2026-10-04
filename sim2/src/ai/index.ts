// AI registry: the one place that knows every AI kind, its UI label and how
// to build it. The CLI (`--ai`), the runner, the play UI's setup card and the
// test helpers all go through makeAi. Pure: no node builtins.
import { makeGreedy } from "./greedy.ts";
import type { Ai } from "./greedy.ts";
import { makeBeam } from "./beam.ts";
import { profileWeights } from "./eval.ts";
import type { Weights } from "./eval.ts";
import { makeStrong } from "./strong.ts";
import type { StrongOptions } from "./strong.ts";
import { strongProfileWeights } from "./strong-eval.ts";
import type { DiscardChooser, MulliganChooser } from "../turn.ts";
import type { TansuChooser } from "../effects.ts";
import type { CounterOrderChooser } from "./counter-order.ts";
import type { LanternChooser } from "../lantern-choice.ts";
import { bestLanternPick } from "./lantern.ts";
import type { KyonshiChooser } from "../kyonshi-choice.ts";
import { checkAwareDiscard } from "./check-discard.ts";
import { defaultDiscardPolicy } from "../turn.ts";
import { bestKyonshiTurn } from "./kyonshi.ts";

export const AI_KINDS = ["greedy", "beam", "strong"] as const;
export type AiKind = (typeof AI_KINDS)[number];

/** Labels for the UI select (the kind itself is shown next to it). */
export const AI_LABELS: Record<AiKind, string> = {
  greedy: "速い",
  beam: "深い",
  strong: "強い",
};

export const isAiKind = (v: unknown): v is AiKind =>
  typeof v === "string" && (AI_KINDS as readonly string[]).includes(v);

/**
 * What a seat can be asked for. greedy / beam only plan the main phase and
 * leave the rest to the engine's default policies (the fields are absent);
 * strong answers all of them.
 */
export type AiSeat = Ai & {
  discard?: DiscardChooser;
  mulligan?: MulliganChooser;
  tansu?: TansuChooser;
  /** 案A counter order when this seat counters (absent = ai/counter-order.ts bestCounterOrder). */
  counterOrder?: CounterOrderChooser;
  /** 灯籠の精: the ally this seat heals when its lantern is destroyed (absent = ai/lantern.ts bestLanternPick). */
  lantern?: LanternChooser;
  /** 僵尸公主 (10/3): the facing after its move (absent = ai/kyonshi.ts bestKyonshiTurn). */
  kyonshi?: KyonshiChooser;
};

export type MakeAiOptions = {
  /** strong only: perturbs exact score ties (0 / absent = plain deterministic order). */
  seed?: number;
  /** strong only: search knobs (width, replyCandidates, maxApplies, timeLimitMs). */
  strong?: Partial<Omit<StrongOptions, "weights">>;
};

/** Builds an AI seat. Throws on an unknown kind or eval profile. */
export const makeAi = (kind: string, evalName = "territorial", opts: MakeAiOptions = {}): AiSeat => {
  if (!isAiKind(kind)) throw new Error(`unknown ai "${kind}" (expected ${AI_KINDS.join("|")})`);
  const w = (): Weights => profileWeights(evalName);
  // every kind digs for the last units when one or two short of the 5体目で即勝ち (check-discard.ts)
  const seat = (): AiSeat =>
    kind === "greedy"
      ? { ...makeGreedy(w()), lantern: bestLanternPick(w()), kyonshi: bestKyonshiTurn(w()) }
      : kind === "beam"
        ? { ...makeBeam({ weights: w() }), lantern: bestLanternPick(w()), kyonshi: bestKyonshiTurn(w()) }
        : makeStrong({ ...opts.strong, weights: strongProfileWeights(evalName), seed: opts.seed ?? 0 });
  const s = seat();
  return { ...s, discard: checkAwareDiscard(s.discard ?? defaultDiscardPolicy) };
};
