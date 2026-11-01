/** AI プレイヤー（lv1〜lv7）。
 *
 * Agent は「状態を受け取り Command を返す」。合法手は getLegalCommands から導く
 * （pending choice 中は resolveChoice のみが返る）。タイブレークは自前のシード付き
 * 乱数のみで決定的に行い、エンジンの乱数（state.rngCalls）には触れない。
 *
 * 探索（search.ts）と評価関数（evaluate.ts）は分離している。
 */

import {
  applyCommand,
  attributeModifier,
  cellSetContains,
  cloneMatchState,
  effectiveCommandCost,
  getLegalCommands,
  getShikigami,
  previewAttack,
  type Command,
  type Facing,
  type MatchContext,
  type MatchState,
  type PlayerId,
  type UnitState,
} from "@3x3duel/engine";
import { BASE_WEIGHTS, CONTROL_WEIGHTS, RICH_WEIGHTS } from "./evaluate.ts";
import { createRng, mixSeed, type Rng } from "./rng.ts";
import {
  chooseByIterativeDeepening,
  chooseByMinimax,
  chooseGreedy,
  decisionPlayer,
  type IterativeSearchConfig,
  type SearchConfig,
} from "./search.ts";

export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type AgentLevel = Level | "C";
export const LEVELS: Level[] = [1, 2, 3, 4, 5, 6, 7];

export interface Agent {
  readonly level: AgentLevel;
  /** 現在の決定者（手番 or 選択者）として 1 手を返す。 */
  decide(ctx: MatchContext, state: MatchState): Command;
}

/** lv ごとの探索設定（minimax 系）。lv1 は greedy で別扱い。 */
function searchConfig(level: Level): SearchConfig {
  switch (level) {
    case 2:
      return { depth: 1, depthUnit: "command", beam: null, weights: BASE_WEIGHTS };
    case 3:
      return { depth: 1, depthUnit: "command", beam: null, weights: RICH_WEIGHTS };
    case 4:
      return { depth: 2, depthUnit: "command", beam: 8, weights: RICH_WEIGHTS };
    case 5:
      return { depth: 2, depthUnit: "turn", beam: 8, weights: CONTROL_WEIGHTS };
    default:
      return { depth: 1, depthUnit: "command", beam: null, weights: BASE_WEIGHTS };
  }
}

class GreedyAgent implements Agent {
  readonly level: Level = 1;
  private readonly rng: Rng;
  constructor(rng: Rng) {
    this.rng = rng;
  }
  decide(ctx: MatchContext, state: MatchState): Command {
    return chooseGreedy(ctx, state, decisionPlayer(state), this.rng);
  }
}

class SearchAgent implements Agent {
  readonly level: Level;
  private readonly cfg: SearchConfig;
  private readonly rng: Rng;
  constructor(level: Level, cfg: SearchConfig, rng: Rng) {
    this.level = level;
    this.cfg = cfg;
    this.rng = rng;
  }
  decide(ctx: MatchContext, state: MatchState): Command {
    return chooseByMinimax(ctx, state, decisionPlayer(state), this.cfg, this.rng);
  }
}

class IterativeSearchAgent implements Agent {
  readonly level: Level;
  private readonly cfg: IterativeSearchConfig;
  private readonly rng: Rng;
  constructor(level: 6 | 7, rng: Rng, overrides?: IterativeSearchOverrides) {
    this.level = level;
    this.rng = rng;
    this.cfg = {
      maxDepth: 3,
      nodeBudget: 5_000,
      depthUnit: "turn",
      beam: 8,
      weights: CONTROL_WEIGHTS,
      useTranspositionTable: true,
      quiescenceDepth: 0,
      ...(level === 7 ? { tacticalSlots: 2 } : {}),
      ...overrides,
    };
  }
  decide(ctx: MatchContext, state: MatchState): Command {
    return chooseByIterativeDeepening(ctx, state, decisionPlayer(state), this.cfg, this.rng);
  }
}

// ---------------------------------------------------------------------------
// Lv-C: eoj-reboot の通常グリーディ + 王手時 depth-6 DFS
// ---------------------------------------------------------------------------

const LV_C_CHECK_DEPTH = 6;

function commandKey(command: Command): string {
  return JSON.stringify(command);
}

function controlled(state: MatchState, player: PlayerId): number {
  return state.units.filter((unit) => unit.owner === player).length;
}

function opponent(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

function unitById(state: MatchState, id: number): UnitState | undefined {
  return state.units.find((unit) => unit.instanceId === id);
}

function isAdjacent(a: UnitState["pos"], b: UnitState["pos"]): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

function withFacing(state: MatchState, unitId: number, facing: Facing): MatchState {
  const next = cloneMatchState(state);
  const unit = unitById(next, unitId);
  if (unit) unit.facing = facing;
  return next;
}

function scoreAttackTarget(
  ctx: MatchContext,
  state: MatchState,
  attackerId: number,
  targetId: number,
  source: "summon" | "reactivation",
): number {
  const attacker = unitById(state, attackerId);
  const defender = unitById(state, targetId);
  const preview = previewAttack(ctx, state, attackerId, targetId);
  if (!attacker || !defender || !preview) return -Infinity;

  const oppControl = controlled(state, opponent(attacker.owner));
  let score = preview.damage * 4;
  if (preview.blindSpot) score += 10;
  if (preview.targetDestroyed) {
    score += 38 + preview.targetLifeLoss * 5;
    if (oppControl >= 4) score += 80;
    else if (oppControl === 3) score += 35;
  } else if (oppControl >= 4) {
    score += preview.damage * 5;
  }
  if (preview.counter?.attackerDestroyed) score -= preview.targetDestroyed ? 18 : 42;
  if (preview.counter && !preview.counter.attackerDestroyed) score -= preview.counter.damage * 2;
  if (source === "summon") score += 6;
  return score;
}

function scoreAttackCommand(ctx: MatchContext, state: MatchState, command: Command): number {
  if (command.type === "attack") {
    const attacker = unitById(state, command.unit);
    if (!attacker) return -Infinity;
    return (
      scoreAttackTarget(ctx, state, command.unit, command.target, "reactivation") -
      effectiveCommandCost(ctx, state, attacker, "attack") * 4
    );
  }
  if (command.type === "rotateAttack") {
    const rotated = withFacing(state, command.unit, command.facing);
    const attacker = unitById(rotated, command.unit);
    if (!attacker) return -Infinity;
    return (
      scoreAttackTarget(ctx, rotated, command.unit, command.target, "reactivation") +
      4 -
      effectiveCommandCost(ctx, state, attacker, "attack") * 4
    );
  }
  return -Infinity;
}

function scoreRotation(ctx: MatchContext, state: MatchState, command: Command): number {
  if (command.type !== "rotate") return -Infinity;
  const original = unitById(state, command.unit);
  if (!original || original.facing === command.facing) return -Infinity;
  const rotated = withFacing(state, command.unit, command.facing);
  const unit = unitById(rotated, command.unit);
  if (!unit) return -Infinity;
  const def = getShikigami(ctx, unit.cardId);
  const enemies = rotated.units.filter((candidate) => candidate.owner !== unit.owner);
  const targets = enemies.filter((candidate) => cellSetContains(def.attackRange, unit.pos, unit.facing, candidate.pos));

  let score = targets.length * 8;
  if (controlled(state, opponent(unit.owner)) >= 3) score += targets.length * 5;
  for (const target of targets) {
    const preview = previewAttack(ctx, rotated, unit.instanceId, target.instanceId);
    if (preview?.targetDestroyed) score += controlled(state, target.owner) >= 4 ? 35 : 15;
    if (preview?.blindSpot) score += 5;
  }
  const enemiesThreateningBlind = enemies.filter((enemy) =>
    cellSetContains(def.blindSpots, unit.pos, unit.facing, enemy.pos),
  ).length;
  score -= enemiesThreateningBlind * 6;
  return score - effectiveCommandCost(ctx, state, original, "rotate") * 3;
}

function scoreSummonTarget(ctx: MatchContext, state: MatchState, targetId: number): number {
  const attackerId = state.pendingChoice?.attackerId;
  if (attackerId === null || attackerId === undefined) return -Infinity;
  return scoreAttackTarget(ctx, state, attackerId, targetId, "summon");
}

function scoreSummon(ctx: MatchContext, state: MatchState, command: Command): number {
  if (command.type !== "summon") return -Infinity;
  const card = getShikigami(ctx, command.cardId);
  const hpDelta = attributeModifier(ctx, card.attribute, command.pos);
  const center = command.pos.x === 1 && command.pos.y === 1;
  if (card.hp + hpDelta <= 0) return -200 - card.lifeValue * 20 + (center ? 2 : 0);

  const active = state.currentPlayer;
  const opp = opponent(active);
  const currentControl = controlled(state, active);
  const afterControl = currentControl + 1;
  let score = afterControl * 12;
  if (afterControl >= 5) score += 1000;
  if (afterControl === 4) score += 55;
  if (controlled(state, opp) >= 4) {
    score += state.units.filter((unit) => unit.owner === opp && isAdjacent(unit.pos, command.pos)).length * 12;
  }
  if (hpDelta > 0) score += 26;
  else if (hpDelta < 0) score -= 34;
  if (center) score += 6;
  score += state.units.filter((unit) => unit.owner === active && isAdjacent(unit.pos, command.pos)).length * 5;
  score += card.hp * 2 + card.atk * 3 - card.summonCost * 2;

  const child = applyCommand(ctx, state, command).state;
  if (child.pendingChoice?.purpose === "summon_attack") {
    let best = -Infinity;
    for (const candidate of child.pendingChoice.candidates) {
      if (typeof candidate === "number") best = Math.max(best, scoreSummonTarget(ctx, child, candidate));
    }
    if (Number.isFinite(best)) score += best * 0.9;
  }
  return score;
}

function checkReturnedOrWon(state: MatchState, checkOwner: PlayerId, responder: PlayerId, winControl: number): boolean {
  return (
    controlled(state, checkOwner) < winControl - 1 ||
    controlled(state, responder) >= winControl ||
    state.winner === responder
  );
}

function oracleStateKey(state: MatchState, depth: number): string {
  return JSON.stringify([
    depth,
    state.currentPlayer,
    state.players,
    state.units,
    state.winner,
    state.pendingChoice,
    state.jobs,
    state.triggerQueue,
    state.activeClause,
    state.tempModifiers,
  ]);
}

function oracleCommands(ctx: MatchContext, state: MatchState): Command[] {
  const legal = getLegalCommands(ctx, state);
  if (state.pendingChoice) return legal;
  const summons = legal.filter((command) => command.type === "summon");
  const recommands = legal.filter(
    (command) => command.type === "attack" || command.type === "rotateAttack" || command.type === "rotate",
  );
  return [...summons, ...recommands];
}

function findLvCReturnPlan(
  ctx: MatchContext,
  state: MatchState,
  checkOwner: PlayerId,
  maxDepth = LV_C_CHECK_DEPTH,
): Command[] | null {
  const responder = state.currentPlayer;
  const memo = new Set<string>();

  const dfs = (node: MatchState, depth: number): Command[] | null => {
    if (checkReturnedOrWon(node, checkOwner, responder, ctx.constants.WIN_CONTROL)) return [];
    if (depth >= maxDepth || node.winner !== null) return null;
    const key = oracleStateKey(node, depth);
    if (memo.has(key)) return null;
    memo.add(key);

    for (const command of oracleCommands(ctx, node)) {
      const child = applyCommand(ctx, node, command).state;
      const nextDepth = command.type === "resolveChoice" ? depth : depth + 1;
      if (
        child.currentPlayer !== responder &&
        child.pendingChoice?.player !== responder &&
        !checkReturnedOrWon(child, checkOwner, responder, ctx.constants.WIN_CONTROL)
      ) {
        continue;
      }
      const suffix = dfs(child, nextDepth);
      if (suffix !== null) return [command, ...suffix];
    }
    return null;
  };

  return dfs(cloneMatchState(state), 0);
}

function choosePendingChoice(ctx: MatchContext, state: MatchState): Command {
  const legal = getLegalCommands(ctx, state);
  if (state.pendingChoice?.purpose === "summon_attack") {
    let best = legal[0]!;
    let bestScore = -Infinity;
    for (const command of legal) {
      if (command.type !== "resolveChoice" || typeof command.selection !== "number") continue;
      const score = scoreSummonTarget(ctx, state, command.selection);
      if (score > bestScore) {
        best = command;
        bestScore = score;
      }
    }
    return best;
  }
  if (state.pendingChoice?.purpose === "hand_discard") {
    let best = legal[0]!;
    let bestScore = Infinity;
    for (const command of legal) {
      if (command.type !== "resolveChoice" || typeof command.selection !== "string") continue;
      const card = ctx.cards.get(command.selection);
      if (!card || card.cardType !== "shikigami") continue;
      const score = card.hp * 2 + card.atk * 3 - card.summonCost * 2;
      if (score < bestScore) {
        best = command;
        bestScore = score;
      }
    }
    return best;
  }
  return legal[0]!;
}

class LvCAgent implements Agent {
  readonly level = "C" as const;
  private queuedPlan: Command[] = [];

  decide(ctx: MatchContext, state: MatchState): Command {
    const legal = getLegalCommands(ctx, state);
    if (this.queuedPlan.length > 0) {
      const next = this.queuedPlan[0]!;
      if (legal.some((command) => commandKey(command) === commandKey(next))) {
        this.queuedPlan.shift();
        return next;
      }
      this.queuedPlan = [];
    }

    if (state.pendingChoice) return choosePendingChoice(ctx, state);

    const me = state.currentPlayer;
    const checkOwner = opponent(me);
    if (controlled(state, checkOwner) >= ctx.constants.WIN_CONTROL - 1) {
      const plan = findLvCReturnPlan(ctx, state, checkOwner);
      if (plan && plan.length > 0) {
        const [first, ...rest] = plan;
        this.queuedPlan = rest;
        return first!;
      }
    }

    let bestRecommand: Command | null = null;
    let bestRecommandScore = -Infinity;
    for (const command of legal) {
      const score =
        command.type === "attack" || command.type === "rotateAttack"
          ? scoreAttackCommand(ctx, state, command)
          : command.type === "rotate"
            ? scoreRotation(ctx, state, command)
            : -Infinity;
      const threshold = command.type === "rotate" ? 14 : 10;
      if (score > threshold && score > bestRecommandScore) {
        bestRecommand = command;
        bestRecommandScore = score;
      }
    }
    if (bestRecommand) return bestRecommand;

    let bestSummon: Command | null = null;
    let bestSummonScore = -Infinity;
    for (const command of legal) {
      if (command.type !== "summon") continue;
      const score = scoreSummon(ctx, state, command);
      if (score > bestSummonScore) {
        bestSummon = command;
        bestSummonScore = score;
      }
    }
    if (bestSummon) return bestSummon;

    return legal.find((command) => command.type === "endTurn") ?? legal[0]!;
  }
}

export function createLvCAgent(): Agent {
  return new LvCAgent();
}

/** lv6/lv7 の探索設定の部分上書き。
 *
 * 対戦の強さを測る用途では使わない。合法性・終了性のように「探索の深さに依らない
 * 性質」を検証するテストが、予算を絞って同じコードパスを短時間で通すための口。
 */
export type IterativeSearchOverrides = Partial<Pick<IterativeSearchConfig, "maxDepth" | "nodeBudget">>;

/** 決定的なシードで Agent を作る。 */
export function createAgent(level: Level, seed: number, overrides?: IterativeSearchOverrides): Agent {
  const rng = createRng(mixSeed(seed, level));
  if (level === 1) return new GreedyAgent(rng);
  if (level === 6 || level === 7) return new IterativeSearchAgent(level, rng, overrides);
  return new SearchAgent(level, searchConfig(level), rng);
}

/** 対戦用のシードから、プレイヤーごとに独立した Agent シードを導く。 */
export function agentSeed(matchSeed: number, player: PlayerId, level: Level): number {
  return mixSeed(matchSeed, player + 1, level);
}
