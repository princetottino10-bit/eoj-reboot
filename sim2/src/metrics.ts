import type { GameEvent, PlayerId, WinType } from "./types.ts";

export type Pair = [number, number];

export type GameRecord = {
  seed: number;
  winner: PlayerId | null;
  winType: WinType;
  rounds: number;
  turns: Pair;
  finalLife: Pair;
  finalChips: Pair;
  finalChipDiff: number;
  maxOccupied: Pair;
  /** Occupied cells for [p0, p1] at the end of each completed round. */
  occupiedByRound: Pair[];
  chipsByRound: Pair[];
  /** Round number at which each individual chip was gained. */
  chipGainRounds: [number[], number[]];
  summons: Pair;
  taijiSummons: Pair;
  unitsLost: Pair;
  t1EndUnits: Pair;
  attacks: Pair;
  aoeAttacks: Pair;
  blindAttacks: Pair;
  counterEvents: Pair;
  counterDamage: Pair;
  aoeEnemyHits: Pair;
  aoeAllyHits: Pair;
  manaSummon: Pair;
  manaAttack: Pair;
  manaRotate: Pair;
  reachDeclared: Pair;
  reachBroken: Pair;
  reachConverted: Pair;
  /** Rounds where the occupation gap was >= 2 and then narrowed / flipped. */
  gapNarrowed: number;
  gapFlipped: number;
  maxGap: number;
  /** Times a player fell from >=4 occupied cells back to <=3. */
  dropFrom4: Pair;
  /** Reigu plays, keyed by cardId. */
  reiguUses: Record<string, number>;
  /** Card-effect triggers, keyed by the cardId that owns the effect. */
  effectTriggers: Record<string, number>;
  /** Attack-variant usage (tm09 konshin, tm06 heal). */
  variantUses: Record<string, number>;
};

const pair = (): Pair => [0, 0];

const bump = (p: Pair, i: PlayerId, n = 1): void => {
  p[i] += n;
};

export const buildRecord = (seed: number, events: GameEvent[]): GameRecord => {
  const rec: GameRecord = {
    seed,
    winner: null,
    winType: "turn_limit",
    rounds: 0,
    turns: pair(),
    finalLife: pair(),
    finalChips: pair(),
    finalChipDiff: 0,
    maxOccupied: pair(),
    occupiedByRound: [],
    chipsByRound: [],
    chipGainRounds: [[], []],
    summons: pair(),
    taijiSummons: pair(),
    unitsLost: pair(),
    t1EndUnits: pair(),
    attacks: pair(),
    aoeAttacks: pair(),
    blindAttacks: pair(),
    counterEvents: pair(),
    counterDamage: pair(),
    aoeEnemyHits: pair(),
    aoeAllyHits: pair(),
    manaSummon: pair(),
    manaAttack: pair(),
    manaRotate: pair(),
    reachDeclared: pair(),
    reachBroken: pair(),
    reachConverted: pair(),
    gapNarrowed: 0,
    gapFlipped: 0,
    maxGap: 0,
    dropFrom4: pair(),
    reiguUses: {},
    effectTriggers: {},
    variantUses: {},
  };
  const tally = (rec2: Record<string, number>, key: string): void => {
    rec2[key] = (rec2[key] ?? 0) + 1;
  };

  const reachState: [boolean, boolean] = [false, false];
  const lastOcc: Pair = [0, 0];
  const pendingOcc: Pair = [0, 0];
  const pendingChips: Pair = [0, 0];
  const seenTurnEnd: [boolean, boolean] = [false, false];
  let prevGap: number | null = null;

  for (const e of events) {
    switch (e.t) {
      case "turnStart": {
        bump(rec.turns, e.player);
        if (reachState[e.player]) {
          bump(rec.reachBroken, e.player);
          reachState[e.player] = false;
        }
        break;
      }
      case "summon": {
        bump(rec.summons, e.player);
        bump(rec.manaSummon, e.player, e.cost);
        if (e.taiji) bump(rec.taijiSummons, e.player);
        break;
      }
      case "rotate": {
        bump(rec.manaRotate, e.player, e.cost);
        break;
      }
      case "reigu": {
        tally(rec.reiguUses, e.cardId);
        bump(rec.manaSummon, e.player, e.cost);
        break;
      }
      case "effect": {
        tally(rec.effectTriggers, e.source);
        break;
      }
      case "attack": {
        if (e.variant !== "normal") tally(rec.variantUses, `${e.cardId}:${e.variant}`);
        bump(rec.attacks, e.player);
        bump(rec.manaAttack, e.player, e.cost);
        if (e.aoe) bump(rec.aoeAttacks, e.player);
        if (e.hits.some((h) => h.blind)) bump(rec.blindAttacks, e.player);
        if (e.counterCount > 0) {
          bump(rec.counterEvents, e.player, e.counterCount);
          bump(rec.counterDamage, e.player, e.counterTotal);
        }
        if (e.aoe) {
          for (const h of e.hits) {
            if (h.ally) bump(rec.aoeAllyHits, e.player);
            else bump(rec.aoeEnemyHits, e.player);
          }
        }
        break;
      }
      case "destroy": {
        bump(rec.unitsLost, e.owner);
        break;
      }
      case "turnEnd": {
        pendingOcc[e.player] = e.occupied;
        pendingChips[e.player] = e.chips;
        seenTurnEnd[e.player] = true;
        if (e.occupied > rec.maxOccupied[e.player]) rec.maxOccupied[e.player] = e.occupied;
        for (let i = 0; i < e.chipGained; i++) rec.chipGainRounds[e.player].push(e.round);
        if (e.round === 1) rec.t1EndUnits[e.player] = e.occupied;
        if (lastOcc[e.player] >= 4 && e.occupied <= 3) bump(rec.dropFrom4, e.player);
        lastOcc[e.player] = e.occupied;
        if (e.reach && !reachState[e.player]) bump(rec.reachDeclared, e.player);
        reachState[e.player] = e.reach;

        if (e.player === 1 && seenTurnEnd[0]) {
          rec.occupiedByRound.push([pendingOcc[0], pendingOcc[1]]);
          rec.chipsByRound.push([pendingChips[0], pendingChips[1]]);
          const gap = pendingOcc[0] - pendingOcc[1];
          if (Math.abs(gap) > rec.maxGap) rec.maxGap = Math.abs(gap);
          if (prevGap !== null && Math.abs(prevGap) >= 2) {
            if (Math.abs(gap) < Math.abs(prevGap)) rec.gapNarrowed += 1;
            if (Math.sign(gap) !== 0 && Math.sign(gap) !== Math.sign(prevGap)) rec.gapFlipped += 1;
          }
          prevGap = gap;
        }
        break;
      }
      case "gameEnd": {
        rec.winner = e.winner;
        rec.winType = e.winType;
        rec.rounds = e.round;
        if (e.winType === "control" && e.winner !== null) bump(rec.reachConverted, e.winner);
        break;
      }
      default:
        break;
    }
  }

  rec.finalChips = [pendingChips[0], pendingChips[1]];
  rec.finalChipDiff = Math.abs(pendingChips[0] - pendingChips[1]);
  return rec;
};

// ------------------------------------------------------------ aggregate

const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

const mergeCounts = (maps: Record<string, number>[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const m of maps) {
    for (const [k, v] of Object.entries(m)) out[k] = (out[k] ?? 0) + v;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
};

const histogram = (xs: number[]): Record<string, number> => {
  const h: Record<string, number> = {};
  for (const x of xs) {
    const k = String(x);
    h[k] = (h[k] ?? 0) + 1;
  }
  return h;
};

export type Summary = ReturnType<typeof summarise>;

export const summarise = (label: string, records: GameRecord[]) => {
  const n = records.length;
  const byType = (t: WinType): number => records.filter((r) => r.winType === t).length;
  const totalTurns = sum(records.map((r) => r.turns[0] + r.turns[1]));
  const totalSummons = sum(records.map((r) => r.summons[0] + r.summons[1]));
  const totalLost = sum(records.map((r) => r.unitsLost[0] + r.unitsLost[1]));
  const totalAttacks = sum(records.map((r) => r.attacks[0] + r.attacks[1]));

  // chip diff x win type: the pre-registered prediction
  const chipDiffByWinType: Record<string, { games: number; meanChipDiff: number }> = {};
  for (const t of ["control", "life", "turn_limit"] as WinType[]) {
    const g = records.filter((r) => r.winType === t);
    chipDiffByWinType[t] = { games: g.length, meanChipDiff: mean(g.map((r) => r.finalChipDiff)) };
  }
  const winTypeByChipDiff: Record<string, Record<string, number>> = {};
  for (const r of records) {
    const bucket = r.finalChipDiff >= 3 ? "3+" : String(r.finalChipDiff);
    const b = winTypeByChipDiff[bucket] ?? { control: 0, life: 0, turn_limit: 0 };
    b[r.winType] += 1;
    winTypeByChipDiff[bucket] = b;
  }

  const decisive = records.filter((r) => r.winner !== null);
  const firstChipRound = (i: 0 | 1, k: number): number[] =>
    records.map((r) => r.chipGainRounds[i][k - 1]).filter((v) => v !== undefined);

  return {
    label,
    games: n,
    winTypes: {
      control: byType("control"),
      life: byType("life"),
      turn_limit: byType("turn_limit"),
    },
    winTypeShare: {
      control: n === 0 ? 0 : byType("control") / n,
      life: n === 0 ? 0 : byType("life") / n,
      turn_limit: n === 0 ? 0 : byType("turn_limit") / n,
    },
    meanRounds: mean(records.map((r) => r.rounds)),
    roundsHistogram: histogram(records.map((r) => r.rounds)),
    firstPlayerWinRate: decisive.length === 0
      ? null
      : decisive.filter((r) => r.winner === 0).length / decisive.length,
    decisiveGames: decisive.length,
    netBoardGrowthPerTurn: totalTurns === 0 ? 0 : (totalSummons - totalLost) / totalTurns,
    meanSummonsPerTurn: totalTurns === 0 ? 0 : totalSummons / totalTurns,
    meanLossesPerTurn: totalTurns === 0 ? 0 : totalLost / totalTurns,
    meanUnitsLostPerGame: mean(records.map((r) => r.unitsLost[0] + r.unitsLost[1])),
    meanUnitsLostPerPlayer: [
      mean(records.map((r) => r.unitsLost[0])),
      mean(records.map((r) => r.unitsLost[1])),
    ],
    meanAttacksPerGame: mean(records.map((r) => r.attacks[0] + r.attacks[1])),
    meanMaxOccupied: mean(records.map((r) => Math.max(r.maxOccupied[0], r.maxOccupied[1]))),
    meanFinalChips: [
      mean(records.map((r) => r.finalChips[0])),
      mean(records.map((r) => r.finalChips[1])),
    ],
    meanFinalChipDiff: mean(records.map((r) => r.finalChipDiff)),
    chipDiffByWinType,
    winTypeByChipDiff,
    meanRoundOfChip: {
      p0_3rd: mean(firstChipRound(0, 3)),
      p0_4th: mean(firstChipRound(0, 4)),
      p1_3rd: mean(firstChipRound(1, 3)),
      p1_4th: mean(firstChipRound(1, 4)),
    },
    meanT1EndUnits: [
      mean(records.map((r) => r.t1EndUnits[0])),
      mean(records.map((r) => r.t1EndUnits[1])),
    ],
    taijiSummonsPerGame: mean(records.map((r) => r.taijiSummons[0] + r.taijiSummons[1])),
    blindAttackShare: totalAttacks === 0
      ? 0
      : sum(records.map((r) => r.blindAttacks[0] + r.blindAttacks[1])) / totalAttacks,
    counterPerAttack: totalAttacks === 0
      ? 0
      : sum(records.map((r) => r.counterEvents[0] + r.counterEvents[1])) / totalAttacks,
    aoeHits: {
      enemy: sum(records.map((r) => r.aoeEnemyHits[0] + r.aoeEnemyHits[1])),
      ally: sum(records.map((r) => r.aoeAllyHits[0] + r.aoeAllyHits[1])),
      attacks: sum(records.map((r) => r.aoeAttacks[0] + r.aoeAttacks[1])),
    },
    reach: {
      declared: sum(records.map((r) => r.reachDeclared[0] + r.reachDeclared[1])),
      broken: sum(records.map((r) => r.reachBroken[0] + r.reachBroken[1])),
      converted: sum(records.map((r) => r.reachConverted[0] + r.reachConverted[1])),
    },
    manaSpend: {
      summon: sum(records.map((r) => r.manaSummon[0] + r.manaSummon[1])),
      attack: sum(records.map((r) => r.manaAttack[0] + r.manaAttack[1])),
      rotate: sum(records.map((r) => r.manaRotate[0] + r.manaRotate[1])),
    },
    reiguUses: mergeCounts(records.map((r) => r.reiguUses)),
    effectTriggers: mergeCounts(records.map((r) => r.effectTriggers)),
    variantUses: mergeCounts(records.map((r) => r.variantUses)),
    reiguUsesPerGame:
      n === 0
        ? 0
        : sum(records.map((r) => Object.values(r.reiguUses).reduce((a, b) => a + b, 0))) / n,
    gap: {
      meanMaxGap: mean(records.map((r) => r.maxGap)),
      narrowedTotal: sum(records.map((r) => r.gapNarrowed)),
      flippedTotal: sum(records.map((r) => r.gapFlipped)),
      gamesWithNarrowing: records.filter((r) => r.gapNarrowed > 0).length,
      dropFrom4Total: sum(records.map((r) => r.dropFrom4[0] + r.dropFrom4[1])),
    },
  };
};
