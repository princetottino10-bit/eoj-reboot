// Search machinery for the strong AI (strong.ts): candidate pruning, a
// deduplicated beam over the turn's action sequences, a two-ply leaf
// evaluation (own turn end -> opponent's best single reply) and a targeted
// search for sequences that break the opponent's control state.
//
// Every candidate comes from rules.ts legalActions, so a plan is legal by
// construction. The opponent's reply is modelled without their hand: a
// playtester's cards are not peeked at, their board units are.
import { toBoardCells } from "../board.ts";
import { canAttack, cardOf } from "../cards.ts";
import { applyActionInPlace, incomeFor, incomeNow, legalActions, underdogBonus } from "../rules.ts";
import { clearExpiredHidden, clearTurnBuffs, fxOf } from "../effects.ts";
import { cloneState, controlCount, controlNeed, isHidden, opponent, unitByUid, unitHp } from "../state.ts";
import type { Ctx } from "../state.ts";
import type { Action, Facing, GameEvent, GameState, PlayerId, Pos, Unit } from "../types.ts";
import { STRONG_WIN, cellCovers, hasControl, rangeCells, strongEvaluate } from "./strong-eval.ts";
import type { StrongWeights } from "./strong-eval.ts";

export type SearchOptions = {
  /** Beam width per depth. */
  width: number;
  /** Leaves that get the two-ply evaluation. */
  replyCandidates: number;
  /** Deterministic work cap: clone+apply calls per turn. */
  maxApplies: number;
  /** Wall-clock emergency stop per turn (ms); the node cap is what normally binds. */
  timeLimitMs: number;
};

export const DEFAULT_SEARCH: SearchOptions = {
  width: 14,
  replyCandidates: 14,
  maxApplies: 30000,
  timeLimitMs: 600,
};

const BREAK_DEPTH = 3;
const BREAK_MAX_RESULTS = 8;
const BREAK_SUMMONS = 6;
/** Assumed cost of the opponent's next summons when their hand is not seen. */
const GENERIC_SUMMON_COST = 3;

/** Work accounting shared by every search of one turn. */
export type Budget = { applies: number; maxApplies: number; deadline: number };

export const makeBudget = (opts: SearchOptions): Budget => ({
  applies: 0,
  maxApplies: opts.maxApplies,
  deadline: performance.now() + opts.timeLimitMs,
});

export const exhausted = (b: Budget): boolean => b.applies >= b.maxApplies || performance.now() > b.deadline;

// ------------------------------------------------------------ state key

/** Positions reached by different action orders collapse to one node. */
export const stateKey = (s: GameState, p: PlayerId): string => {
  const parts: string[] = [];
  for (const u of s.units) {
    parts.push(
      `${u.cardId}${u.owner}${u.pos.x}${u.pos.y}${u.facing}${u.damage}${u.attackedThisTurn ? "a" : ""}${u.rotatedThisTurn ? "r" : ""}${u.summonedThisTurn ? "s" : ""}${u.hiddenBy === null ? "" : `h${u.hiddenBy}`}${u.atkBuff === 0 ? "" : `b${u.atkBuff}`}`,
    );
  }
  parts.sort();
  const o = opponent(p);
  const ps = s.players[p];
  return `${parts.join("|")}#${ps.mana}#${ps.hand.slice().sort().join(",")}#${s.players[o].mana}#${s.players[0].life},${s.players[1].life}#${ps.reach ? 1 : 0}${s.players[o].reach ? 1 : 0}#${s.summonsThisTurn}`;
};

// ------------------------------------------------------------ candidates

const visibleEnemies = (s: GameState, p: PlayerId): Unit[] => {
  const out: Unit[] = [];
  for (const u of s.units) if (u.owner !== p && !isHidden(u)) out.push(u);
  return out;
};

const enemiesCovered = (ctx: Ctx, s: GameState, p: PlayerId, cardId: string, pos: Pos, facing: Facing): number => {
  const cells = rangeCells(ctx, cardId, pos, facing);
  let n = 0;
  for (const e of visibleEnemies(s, p)) if (cellCovers(cells, e.pos)) n += 1;
  return n;
};

const frontOf = (pos: Pos, facing: Facing): Pos | undefined =>
  toBoardCells([{ x: 0, y: 1 }], pos, facing)[0];

const enemyInFront = (s: GameState, p: PlayerId, pos: Pos, facing: Facing): boolean => {
  const f = frontOf(pos, facing);
  if (f === undefined) return false;
  const u = s.units.find((x) => x.pos.x === f.x && x.pos.y === f.y);
  return u !== undefined && u.owner !== p && !isHidden(u);
};

/**
 * Facings worth trying for a summon of `cardId` at `pos`: those that put the
 * most enemies in range (kills first), keep the range on the board, put an
 * enemy in front (閻魔獄卒棒 / 照魔鏡 / 雲外鏡 interactions), and do not hand an
 * enemy attacker a blind-spot shot. At most two, one for a unit that cannot attack.
 */
export const summonFacings = (ctx: Ctx, s: GameState, p: PlayerId, cardId: string, pos: Pos): Facing[] => {
  const card = cardOf(ctx.pack, cardId);
  const enemies = visibleEnemies(s, p);
  const attackers = enemies.filter((e) => canAttack(cardOf(ctx.pack, e.cardId)));
  const scores: number[] = [];
  for (const f of [0, 1, 2, 3] as Facing[]) {
    let sc = 0;
    if (canAttack(card)) {
      const cells = rangeCells(ctx, cardId, pos, f);
      sc += cells.length;
      for (const e of enemies) {
        if (!cellCovers(cells, e.pos)) continue;
        sc += 10;
        if (card.atk >= unitHp(ctx, e)) sc += 15;
      }
    }
    if (enemyInFront(s, p, pos, f)) sc += 2;
    const blind = toBoardCells(card.blindSpots, pos, f);
    for (const a of attackers) if (cellCovers(blind, a.pos)) sc -= 3;
    const counter = toBoardCells(card.counterRange, pos, f);
    for (const a of attackers) {
      if (cellCovers(counter, a.pos) && cellCovers(rangeCells(ctx, a.cardId, a.pos, a.facing), pos)) sc += 2;
    }
    scores.push(sc);
  }
  const best = Math.max(...scores);
  const limit = canAttack(card) ? 2 : 1;
  const out: Facing[] = [];
  for (const f of [0, 1, 2, 3] as Facing[]) {
    if (scores[f] >= best - 1 && out.length < limit) out.push(f);
  }
  return out;
};

/** Does turning `u` (mine) to `facing` gain an enemy in range or in front? */
const turnGains = (ctx: Ctx, s: GameState, p: PlayerId, u: Unit, facing: Facing): boolean => {
  const before = enemiesCovered(ctx, s, p, u.cardId, u.pos, u.facing);
  const after = enemiesCovered(ctx, s, p, u.cardId, u.pos, facing);
  if (after > before) return true;
  return enemyInFront(s, p, u.pos, facing) && !enemyInFront(s, p, u.pos, u.facing);
};

/** Does turning an enemy `u` to `facing` take one of my units out of its range, or expose it to a blind shot? */
const turnHurts = (ctx: Ctx, s: GameState, p: PlayerId, u: Unit, facing: Facing): boolean => {
  const o = opponent(p);
  const before = enemiesCovered(ctx, s, o, u.cardId, u.pos, u.facing);
  const after = enemiesCovered(ctx, s, o, u.cardId, u.pos, facing);
  if (after < before) return true;
  const blind = toBoardCells(cardOf(ctx.pack, u.cardId).blindSpots, u.pos, facing);
  for (const m of s.units) {
    if (m.owner !== p || isHidden(m) || !canAttack(cardOf(ctx.pack, m.cardId))) continue;
    if (cellCovers(blind, m.pos)) return true;
  }
  return false;
};

/**
 * legalActions minus the variants that cannot matter: a summon keeps only
 * its promising facings, a turning reigu only the turns that gain or hurt.
 * `pass` is dropped (the caller treats every node as a possible leaf).
 */
export const candidates = (ctx: Ctx, s: GameState, p: PlayerId): Action[] => {
  const out: Action[] = [];
  const facingsFor = new Map<string, Facing[]>();
  for (const a of legalActions(ctx, s)) {
    if (a.kind === "pass") continue;
    if (a.kind === "summon") {
      const key = `${a.handIndex}:${a.pos.x}${a.pos.y}`;
      let allowed = facingsFor.get(key);
      if (allowed === undefined) {
        allowed = summonFacings(ctx, s, p, s.players[p].hand[a.handIndex], a.pos);
        facingsFor.set(key, allowed);
      }
      if (allowed.includes(a.facing)) out.push(a);
      continue;
    }
    if (a.kind === "reigu" && a.targetUid !== null && a.facing !== null) {
      const t = unitByUid(s, a.targetUid);
      if (t === undefined) continue;
      const keep = t.owner === p ? turnGains(ctx, s, p, t, a.facing) : turnHurts(ctx, s, p, t, a.facing);
      if (keep) out.push(a);
      continue;
    }
    out.push(a);
  }
  return out;
};

// ------------------------------------------------------------ deep eval

type Projection = { win: boolean; reach: boolean; chips: number; mana: number; points: number };

/** The chips after a turn end on `occ` (the same rule as turn.ts endTurn). */
const chipsAfter = (ctx: Ctx, chips: number, occ: number): number => {
  if (ctx.cfg.incomeMode === "current") return occ;
  return ctx.cfg.chipMode === "one_per_turn" ? chips + (occ > chips ? 1 : 0) : Math.max(chips, occ);
};

/** What endTurn would do for `p` from this position, without the draw. */
export const projectTurnEnd = (ctx: Ctx, s: GameState, p: PlayerId): Projection => {
  const ps = s.players[p];
  const occ = controlCount(ctx, s, p);
  const cw = controlNeed(ctx, s);
  const chips = chipsAfter(ctx, ps.chips, occ);
  const pointsMode = ctx.cfg.controlWinMode === "points";
  const points = ps.controlPoints + (pointsMode && occ >= cw ? 1 : 0);
  const cold = ctx.cfg.instantWinCells > 0 && occ >= ctx.cfg.instantWinCells;
  const win =
    cold ||
    (pointsMode
      ? occ >= cw && points >= ctx.cfg.controlPointsToWin
      : ctx.cfg.controlHold === "next_turn_end" && ps.reach && occ >= cw);
  const reach = !pointsMode && occ >= cw;
  const mana =
    ctx.cfg.incomeTiming === "turn_end"
      ? Math.min(ctx.cfg.manaCap, ps.mana + incomeFor(ctx, chips) + underdogBonus(ctx, s, p))
      : ps.mana;
  return { win, reach, chips, mana, points };
};

/** The position handed to the opponent: turn passed, their pieces refreshed, their hand unseen. */
const opponentProbe = (ctx: Ctx, s: GameState, p: PlayerId, proj: Projection): GameState => {
  const o = opponent(p);
  const probe = cloneState(s);
  const mine = probe.players[p];
  mine.chips = proj.chips;
  mine.reach = proj.reach;
  mine.controlPoints = proj.points;
  mine.mana = proj.mana;
  probe.turnPlayer = o;
  probe.summonsThisTurn = 0;
  for (const u of probe.units) {
    if (u.owner === o) {
      u.attackedThisTurn = false;
      u.rotatedThisTurn = false;
      u.summonedThisTurn = false;
    }
  }
  clearTurnBuffs(probe);
  clearExpiredHidden(probe, o, []);
  const theirs = probe.players[o];
  if (ctx.cfg.incomeTiming === "turn_start") {
    if (ctx.cfg.incomeMode === "current") theirs.chips = controlCount(ctx, probe, o);
    theirs.mana = Math.min(ctx.cfg.manaCap, theirs.mana + incomeNow(ctx, probe, o));
  }
  theirs.hand = [];
  return probe;
};

/** Score of a position inside the opponent's turn, from p's side. */
const replyScore = (ctx: Ctx, s: GameState, p: PlayerId, w: StrongWeights): number => {
  if (s.ended) return s.winner === null ? 0 : s.winner === p ? STRONG_WIN : -STRONG_WIN;
  const o = opponent(p);
  const cw = controlNeed(ctx, s);
  const cap = ctx.cfg.manaCap;
  const occO = controlCount(ctx, s, o);
  const theirs = s.players[o];
  const chipsO = ctx.cfg.incomeMode === "current" ? occO : Math.max(theirs.chips, occO);
  const nextO = Math.min(cap, theirs.mana + incomeFor(ctx, chipsO) + underdogBonus(ctx, s, o));
  const mine = s.players[p];
  const nextP = ctx.cfg.incomeTiming === "turn_end" ? mine.mana : Math.min(cap, mine.mana + incomeNow(ctx, s, p));
  let sc = strongEvaluate(ctx, s, p, w, p === 0 ? [nextP, nextO] : [nextO, nextP]);
  // control they would declare at this turn end, with what their unseen hand could add
  // コールド勝ち on their turn end is a loss
  if (ctx.cfg.instantWinCells > 0 && occO >= ctx.cfg.instantWinCells) sc -= w.oppControl;
  // controlWinMode "points": their last 制圧点 on this turn end is a loss
  if (ctx.cfg.controlWinMode === "points" && occO >= cw && theirs.controlPoints + 1 >= ctx.cfg.controlPointsToWin) sc -= w.oppControl;
  if (occO >= cw) sc -= w.reach * 0.5;
  else {
    const empties = ctx.cfg.boardCells - s.units.length;
    const potential = Math.min(empties, Math.floor(theirs.mana / GENERIC_SUMMON_COST));
    if (occO + potential >= cw) sc -= w.reach * 0.8;
  }
  return sc;
};

/**
 * Two-ply value of a leaf of our turn: our turn end is projected (a win
 * there is a win), then the opponent takes their best single action and the
 * worst outcome for us is the score. A control state they already hold is
 * a loss whatever we do afterwards.
 */
export const deepEval = (ctx: Ctx, leaf: GameState, p: PlayerId, w: StrongWeights, budget: Budget): number => {
  if (leaf.ended) return strongEvaluate(ctx, leaf, p, w);
  const o = opponent(p);
  const proj = projectTurnEnd(ctx, leaf, p);
  if (proj.win) return STRONG_WIN;
  const stat = strongEvaluate(ctx, leaf, p, w);
  if (hasControl(ctx, leaf, o)) return -w.oppControl * 2 + stat * 0.1;
  const probe = opponentProbe(ctx, leaf, p, proj);
  let worst = replyScore(ctx, probe, p, w);
  const sink: GameEvent[] = [];
  for (const a of legalActions(ctx, probe)) {
    if (a.kind === "pass") continue;
    if (exhausted(budget)) break;
    const next = cloneState(probe);
    sink.length = 0;
    applyActionInPlace(ctx, next, a, sink);
    budget.applies += 1;
    const sc = replyScore(ctx, next, p, w);
    if (sc < worst) worst = sc;
  }
  return worst;
};

// ------------------------------------------------------------ beam search

type Node = { s: GameState; actions: Action[]; score: number };

export type SearchResult = { actions: Action[]; score: number; leaf: GameState; wins: boolean };

const RESERVED_KINDS: Action["kind"][] = ["attack", "rotate", "proxyRotate", "reigu", "inherit"];
const RESERVED_PER_KIND = 2;

/** Top `width` children by static score, with a couple of slots per non-summon kind so combos survive. */
const selectBeam = (children: Node[], width: number): Node[] => {
  const order = children.map((_, i) => i).sort((a, b) => children[b].score - children[a].score || a - b);
  const picked = new Set<number>();
  for (const kind of RESERVED_KINDS) {
    let n = 0;
    for (const i of order) {
      if (n >= RESERVED_PER_KIND) break;
      const last = children[i].actions[children[i].actions.length - 1];
      if (last.kind !== kind) continue;
      picked.add(i);
      n += 1;
    }
  }
  for (const i of order) {
    if (picked.size >= width) break;
    picked.add(i);
  }
  return order.filter((i) => picked.has(i)).map((i) => children[i]);
};

/** The leaves worth the two-ply evaluation: the best by static score plus the best of every depth. */
const shortlist = (leaves: Node[], n: number): Node[] => {
  const order = leaves.map((_, i) => i).sort((a, b) => leaves[b].score - leaves[a].score || a - b);
  const picked = new Set<number>(order.slice(0, n));
  const bestAtDepth = new Map<number, number>();
  for (const i of order) {
    const d = leaves[i].actions.length;
    if (!bestAtDepth.has(d)) bestAtDepth.set(d, i);
  }
  for (const i of bestAtDepth.values()) picked.add(i);
  return order.filter((i) => picked.has(i)).map((i) => leaves[i]);
};

/**
 * Plans the rest of the turn from `root` (already the turn player's
 * position). Returns the best action sequence found and its two-ply score.
 * `seen` deduplicates positions across calls that share a turn.
 */
export const searchTurn = (
  ctx: Ctx,
  root: GameState,
  p: PlayerId,
  w: StrongWeights,
  opts: SearchOptions,
  budget: Budget,
  seen: Set<string> = new Set(),
): SearchResult => {
  const rootNode: Node = { s: root, actions: [], score: strongEvaluate(ctx, root, p, w) };
  if (root.ended || root.turnPlayer !== p) return { actions: [], score: rootNode.score, leaf: root, wins: false };
  seen.add(stateKey(root, p));
  const sink: GameEvent[] = [];
  let beam: Node[] = [rootNode];
  const leaves: Node[] = [rootNode];
  const maxDepth = Math.max(0, ctx.cfg.maxActionsPerTurn);
  for (let depth = 0; depth < maxDepth; depth++) {
    const children: Node[] = [];
    let stop = false;
    for (const node of beam) {
      if (exhausted(budget)) {
        stop = true;
        break;
      }
      for (const a of candidates(ctx, node.s, p)) {
        const st = cloneState(node.s);
        sink.length = 0;
        applyActionInPlace(ctx, st, a, sink);
        budget.applies += 1;
        if (st.ended) {
          if (st.winner === p) return { actions: [...node.actions, a], score: STRONG_WIN, leaf: st, wins: true };
          continue; // an action that loses or draws on the spot is never worth it
        }
        const key = stateKey(st, p);
        if (seen.has(key)) continue;
        seen.add(key);
        children.push({ s: st, actions: [...node.actions, a], score: strongEvaluate(ctx, st, p, w) });
      }
    }
    if (stop || children.length === 0) break;
    beam = selectBeam(children, opts.width);
    for (const n of beam) leaves.push(n);
  }

  // Leaves are compared on the two-ply score first. Two lines often tie there
  // (the opponent's best reply is the same blow either way), and then the one
  // that is materially ahead is the better gamble - which is what takes the
  // free kill the worst case does not care about.
  let best: Node = rootNode;
  let bestScore = -Infinity;
  let bestStatic = -Infinity;
  for (const leaf of shortlist(leaves, opts.replyCandidates)) {
    const sc = deepEval(ctx, leaf.s, p, w, budget);
    const better =
      sc > bestScore ||
      (sc === bestScore &&
        // a forced win needs no help: take the shortest line and touch nothing else
        (sc >= STRONG_WIN
          ? leaf.actions.length < best.actions.length
          : leaf.score > bestStatic ||
            (leaf.score === bestStatic && leaf.actions.length < best.actions.length)));
    if (better) {
      bestScore = sc;
      bestStatic = leaf.score;
      best = leaf;
    }
  }
  return { actions: best.actions, score: bestScore, leaf: best.s, wins: bestScore >= STRONG_WIN };
};

// ------------------------------------------------------------ control break

/** Did this position (during p's turn) take the control state off the opponent? */
export const controlBroken = (ctx: Ctx, s: GameState, p: PlayerId): boolean =>
  s.ended ? s.winner === p : !hasControl(ctx, s, opponent(p));

const isTurningReigu = (fx: string): boolean => fx === "tm18" || fx === "sk18";
const isDamagingReigu = (fx: string): boolean => fx === "tm19" || fx === "tm22" || fx === "sk22" || fx === "ad21" || fx === "ad22";

/** Actions that can be part of a kill: attacks, damage, and the preparations that bring an enemy into range. */
const breakRelevant = (ctx: Ctx, s: GameState, p: PlayerId, acts: Action[]): Action[] => {
  const out: Action[] = [];
  const summons: { a: Action; key: number }[] = [];
  const hand = s.players[p].hand;
  for (const a of acts) {
    switch (a.kind) {
      case "attack":
        if (a.variant !== "heal") out.push(a);
        break;
      case "reigu": {
        const fx = fxOf(ctx, hand[a.handIndex]);
        if (isDamagingReigu(fx)) out.push(a);
        else if (isTurningReigu(fx) && a.targetUid !== null && a.facing !== null) {
          const t = unitByUid(s, a.targetUid);
          if (t !== undefined && t.owner === p && turnGains(ctx, s, p, t, a.facing)) out.push(a);
        }
        break;
      }
      case "rotate": {
        const u = unitByUid(s, a.uid);
        if (u !== undefined && turnGains(ctx, s, p, u, a.facing)) out.push(a);
        break;
      }
      case "proxyRotate": {
        const t = unitByUid(s, a.targetUid);
        if (t !== undefined && t.owner === p && turnGains(ctx, s, p, t, a.facing)) out.push(a);
        break;
      }
      case "inherit": {
        const t = unitByUid(s, a.targetUid);
        if (t === undefined) break;
        const card = cardOf(ctx.pack, hand[a.handIndex]);
        if (canAttack(card) && enemiesCovered(ctx, s, p, card.id, t.pos, t.facing) > 0) out.push(a);
        break;
      }
      case "summon": {
        const cardId = hand[a.handIndex];
        if (!canAttack(cardOf(ctx.pack, cardId))) break;
        const n = enemiesCovered(ctx, s, p, cardId, a.pos, a.facing);
        if (n > 0) summons.push({ a, key: n });
        break;
      }
      default:
        break;
    }
  }
  summons.sort((x, y) => y.key - x.key);
  for (const sm of summons.slice(0, BREAK_SUMMONS)) out.push(sm.a);
  return out;
};

/**
 * Sequences of up to three actions that take the opponent out of the
 * control state (a kill, or a Mayohiga hide). Depth-first over the actions
 * that can contribute to a kill, so a rotate / 家鳴り / inherit / summon
 * followed by the attack is found even when the first step gains nothing.
 */
export const findControlBreaks = (ctx: Ctx, root: GameState, p: PlayerId, budget: Budget): Action[][] => {
  const results: Action[][] = [];
  if (root.ended || !hasControl(ctx, root, opponent(p))) return results;
  const sink: GameEvent[] = [];
  const dfs = (s: GameState, seq: Action[], depth: number): void => {
    for (const a of breakRelevant(ctx, s, p, candidates(ctx, s, p))) {
      if (results.length >= BREAK_MAX_RESULTS || exhausted(budget)) return;
      const st = cloneState(s);
      sink.length = 0;
      applyActionInPlace(ctx, st, a, sink);
      budget.applies += 1;
      if (controlBroken(ctx, st, p)) {
        results.push([...seq, a]);
        continue;
      }
      if (st.ended) continue;
      if (depth + 1 < BREAK_DEPTH) dfs(st, [...seq, a], depth + 1);
    }
  };
  dfs(root, [], 0);
  return results;
};

// ------------------------------------------------------------ finisher

/**
 * The beam ranks its intermediate nodes by the static eval, so a kill that
 * only becomes available late in the turn (an ally's area attack softened the
 * target, mana freed up by a refund) can fall outside the width. This sweep
 * runs from the chosen leaf and takes any attack or damaging reigu that
 * improves the two-ply score, which is the objective the search optimises
 * anyway. Cheap: only the handful of actions that can change material.
 */
const FINISHER_STEPS = 4;

const finisherCandidates = (ctx: Ctx, s: GameState, p: PlayerId): Action[] => {
  const out: Action[] = [];
  const hand = s.players[p].hand;
  for (const a of legalActions(ctx, s)) {
    if (a.kind === "attack" && a.variant !== "heal") out.push(a);
    else if (a.kind === "reigu" && isDamagingReigu(fxOf(ctx, hand[a.handIndex]))) out.push(a);
  }
  return out;
};

/**
 * Extends `seq` (already applied to reach `leaf`) with material-changing
 * actions that raise the two-ply score. Returns the actions to append.
 */
export const finishTurn = (
  ctx: Ctx,
  leaf: GameState,
  p: PlayerId,
  w: StrongWeights,
  budget: Budget,
  baseScore: number,
): Action[] => {
  const extra: Action[] = [];
  let cur = leaf;
  let score = baseScore;
  let stat = strongEvaluate(ctx, leaf, p, w);
  const sink: GameEvent[] = [];
  for (let step = 0; step < FINISHER_STEPS; step++) {
    if (cur.ended || exhausted(budget)) break;
    let best: Action | null = null;
    let bestState: GameState | null = null;
    let bestScore = score;
    let bestStatic = stat;
    for (const a of finisherCandidates(ctx, cur, p)) {
      if (exhausted(budget)) break;
      const st = cloneState(cur);
      sink.length = 0;
      applyActionInPlace(ctx, st, a, sink);
      budget.applies += 1;
      if (st.ended && st.winner !== p) continue; // never hand the game away
      const sc = deepEval(ctx, st, p, w, budget);
      const stc = strongEvaluate(ctx, st, p, w);
      // as in searchTurn: two-ply first, material as the tie-break
      if (sc > bestScore || (sc === bestScore && stc > bestStatic)) {
        bestScore = sc;
        bestStatic = stc;
        best = a;
        bestState = st;
      }
    }
    if (best === null || bestState === null) break;
    extra.push(best);
    cur = bestState;
    score = bestScore;
    stat = bestStatic;
  }
  return extra;
};

/** Applies a sequence to a clone. */
export const applySequence = (ctx: Ctx, s: GameState, seq: Action[]): GameState => {
  const st = cloneState(s);
  const sink: GameEvent[] = [];
  for (const a of seq) {
    sink.length = 0;
    applyActionInPlace(ctx, st, a, sink);
  }
  return st;
};
