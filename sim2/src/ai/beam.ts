import { applyActionInPlace, incomeFor, legalActions } from "../rules.ts";
import { cloneState, opponent } from "../state.ts";
import type { Ctx } from "../state.ts";
import type { Action, GameEvent, GameState, PlayerId } from "../types.ts";
import { DEFAULT_WEIGHTS, evaluate } from "./eval.ts";
import type { Weights } from "./eval.ts";
import type { Ai } from "./greedy.ts";

export type BeamOptions = {
  width: number;
  /** How many leaves get the (expensive) opponent-reply lookahead. */
  replyCandidates: number;
  weights: Weights;
};

export const DEFAULT_BEAM: BeamOptions = {
  width: 8,
  replyCandidates: 6,
  weights: DEFAULT_WEIGHTS,
};

type Node = { state: GameState; actions: Action[]; score: number };

/**
 * Worst outcome for `p` after the opponent's single best atomic reply.
 * The opponent is given their next income so the estimate is not optimistic.
 */
const opponentReplyScore = (ctx: Ctx, s: GameState, p: PlayerId, w: Weights): number => {
  if (s.ended) return evaluate(ctx, s, p, w);
  const o = opponent(p);
  const probe = cloneState(s);
  probe.turnPlayer = o;
  for (const u of probe.units) {
    if (u.owner === o) {
      u.attackedThisTurn = false;
      u.rotatedThisTurn = false;
    }
  }
  const ps = probe.players[o];
  ps.mana = Math.min(ctx.cfg.manaCap, ps.mana + incomeFor(ctx, ps.chips));

  let worst = evaluate(ctx, probe, p, w);
  const sink: GameEvent[] = [];
  for (const a of legalActions(ctx, probe)) {
    if (a.kind === "pass") continue;
    const next = cloneState(probe);
    sink.length = 0;
    applyActionInPlace(ctx, next, a, sink);
    const sc = evaluate(ctx, next, p, w);
    if (sc < worst) worst = sc;
  }
  return worst;
};

/**
 * Beam search over the turn's atomic action sequences. Leaves are scored by
 * eval minus the loss from the opponent's best single reply.
 */
export const makeBeam = (opts: Partial<BeamOptions> = {}): Ai => {
  const o = { ...DEFAULT_BEAM, ...opts };
  return {
    name: "beam",
    planTurn: (ctx, s) => {
      const p = s.turnPlayer;
      const w = o.weights;
      const sink: GameEvent[] = [];
      let beam: Node[] = [
        { state: cloneState(s), actions: [], score: evaluate(ctx, s, p, w) },
      ];
      const leaves: Node[] = [beam[0]];

      for (let depth = 0; depth < ctx.cfg.maxActionsPerTurn; depth++) {
        const next: Node[] = [];
        for (const node of beam) {
          if (node.state.ended) continue;
          for (const a of legalActions(ctx, node.state)) {
            if (a.kind === "pass") continue;
            const st = cloneState(node.state);
            sink.length = 0;
            applyActionInPlace(ctx, st, a, sink);
            next.push({
              state: st,
              actions: [...node.actions, a],
              score: evaluate(ctx, st, p, w),
            });
          }
        }
        if (next.length === 0) break;
        next.sort((a, b) => b.score - a.score);
        beam = next.slice(0, o.width);
        for (const n of beam) leaves.push(n);
      }

      // rank leaves cheaply, then pay for the reply lookahead on the top few
      leaves.sort((a, b) => b.score - a.score);
      const shortlist = leaves.slice(0, Math.max(1, o.replyCandidates));
      let best = shortlist[0];
      let bestScore = -Infinity;
      for (const leaf of shortlist) {
        const sc = opponentReplyScore(ctx, leaf.state, p, w);
        if (sc > bestScore || (sc === bestScore && leaf.actions.length < best.actions.length)) {
          bestScore = sc;
          best = leaf;
        }
      }
      return [...best.actions, { kind: "pass" }];
    },
  };
};
