// AI registry: the one place that knows every AI kind, its UI label and how
// to build it. The CLI (`--ai`), the runner, the play UI's setup card and the
// test helpers all go through makeAi. Pure: no node builtins.
import { makeGreedy } from "./greedy.ts";
import type { Ai } from "./greedy.ts";
import { makeBeam } from "./beam.ts";
import { profileWeights } from "./eval.ts";
import { makeStrong } from "./strong.ts";
import type { StrongOptions } from "./strong.ts";
import { strongProfileWeights } from "./strong-eval.ts";
import type { DiscardChooser, MulliganChooser } from "../turn.ts";
import type { TansuChooser } from "../effects.ts";
import type { CounterOrderChooser } from "./counter-order.ts";

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
  if (kind === "greedy") return makeGreedy(profileWeights(evalName));
  if (kind === "beam") return makeBeam({ weights: profileWeights(evalName) });
  return makeStrong({ ...opts.strong, weights: strongProfileWeights(evalName), seed: opts.seed ?? 0 });
};
