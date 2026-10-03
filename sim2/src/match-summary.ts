// How long a match ran and how it ended, for comparing rule variants: the
// round and seat it was decided on, the turns played, the kind of end, and
// for each player the round their 占拠チップ first reached each income step
// (chipIncomeSteps). Read off the event log and the final state, so the AI
// table, the spectate page, the online rooms and the server's records all
// count the same way. Pure: no node builtins.
import type { FlowEvent } from "./flow.ts";
import type { GameEvent, PlayerId, WinType } from "./types.ts";

/** How a match ended. cold: a コールド勝ち (winType "control" with gameEnd.cold). */
export type EndKind = "control" | "cold" | "life" | "deck_out" | "turn_limit" | "resign";

export type MatchSummary = {
  /** false: the match is still running (or was cut short): the fields describe where it stands. */
  finished: boolean;
  /** The round, and whose turn it was, when it was decided. */
  round: number;
  turnPlayer: PlayerId;
  /** Turns played up to and including the deciding one (先手 R1 = 1, 後手 R1 = 2, ...). */
  turns: number;
  winner: PlayerId | null;
  end: EndKind | null;
  /** 制圧勝利 / コールド勝ち / 生命勝ち / 2回目の山札切れ / ラウンド上限 / 投了 / 対局中. */
  endLabel: string;
  /** The first player's (先手's) result. */
  first: "win" | "lose" | "draw" | null;
  /** The distinct chip counts that raise the income, smallest first. */
  steps: number[];
  /** stepRounds[p][i]: the round p's chips first reached steps[i] at a turn end; null = never. */
  stepRounds: [(number | null)[], (number | null)[]];
};

export type SummaryInput = {
  /** The match's events (engine and flow events, in order; private ones may be missing). */
  events: readonly (GameEvent | FlowEvent)[];
  round: number;
  turnPlayer: PlayerId;
  ended: boolean;
  winner: PlayerId | null;
  winType: WinType | null;
  /** The income steps in force (Config.chipIncomeSteps). */
  chipIncomeSteps: readonly number[];
  /** Who resigned, when the caller knows it apart from the events (a flow's resignedBy). */
  resignedBy?: PlayerId | null;
};

export const SEAT_WORD: readonly [string, string] = ["先手", "後手"];

const END_LABEL: Record<EndKind, string> = {
  control: "制圧勝利",
  cold: "コールド勝ち",
  life: "生命勝ち",
  deck_out: "2回目の山札切れ",
  turn_limit: "ラウンド上限",
  resign: "投了",
};

export const endLabelOf = (end: EndKind | null): string => (end === null ? "対局中" : END_LABEL[end]);

export const summarizeMatch = (m: SummaryInput): MatchSummary => {
  let resignedBy: PlayerId | null = m.resignedBy ?? null;
  let cold = false;
  for (const e of m.events) {
    if (e.t === "resign") resignedBy = e.player;
    if (e.t === "gameEnd" && e.cold !== undefined) cold = true;
  }
  const finished = m.ended || resignedBy !== null;
  const end: EndKind | null = !finished
    ? null
    : resignedBy !== null
      ? "resign"
      : m.winType === "control" && cold
        ? "cold"
        : m.winType;
  const winner = resignedBy !== null ? (resignedBy === 0 ? 1 : 0) : m.winner;
  // the round limit is checked before the next round's first turn: the last turn played was 後手's
  let round = m.round;
  let turnPlayer = m.turnPlayer;
  if (end === "turn_limit" && turnPlayer === 0 && round > 1) {
    round -= 1;
    turnPlayer = 1;
  }
  const steps = [...new Set(m.chipIncomeSteps)].sort((a, b) => a - b);
  const stepRounds: [(number | null)[], (number | null)[]] = [steps.map(() => null), steps.map(() => null)];
  for (const e of m.events) {
    if (e.t !== "turnEnd") continue;
    const mine = stepRounds[e.player];
    steps.forEach((n, i) => {
      if (mine[i] === null && e.chips >= n) mine[i] = e.round;
    });
  }
  return {
    finished,
    round,
    turnPlayer,
    turns: (round - 1) * 2 + turnPlayer + 1,
    winner: finished ? winner : null,
    end,
    endLabel: endLabelOf(end),
    first: !finished ? null : winner === null ? "draw" : winner === 0 ? "win" : "lose",
    steps,
    stepRounds,
  };
};

/** 「R3」, or `none` when the step was never reached. */
const stepAt = (r: number | null, none: string): string => (r === null ? none : `R${r}`);

/** 「第7ラウンド(後手の手番)」 */
export const decidedText = (s: MatchSummary): string => `第${s.round}ラウンド(${SEAT_WORD[s.turnPlayer]}の手番)`;

/** 「制圧勝利 先手」 / 「ラウンド上限 引き分け」 / 「投了 先手」 (the winner; 投了 names the side that won). */
export const resultText = (s: MatchSummary): string =>
  `${s.endLabel} ${s.winner === null ? (s.finished ? "引き分け" : "") : SEAT_WORD[s.winner]}`.trim();

/** Per step, both players: 「4枚 先R3/後R4」, the first with 到達 (「4枚到達 先R3/後R4」). */
export const stepsText = (s: MatchSummary, none = "—"): string[] =>
  s.steps.map(
    (n, i) => `${n}枚${i === 0 ? "到達" : ""} 先${stepAt(s.stepRounds[0][i], none)}/後${stepAt(s.stepRounds[1][i], none)}`,
  );

/** The round one player's chips reached a step, for the result panel: 「R3」 / 「届かず」. */
export const stepCell = (s: MatchSummary, p: PlayerId, i: number): string => stepAt(s.stepRounds[p][i], "届かず");

/**
 * One line to paste into a sheet:
 * 「ルール: 10/3テスト案+5体目で即勝ち | R7 後手の手番で決着(13手番) | 制圧勝利 先手 | 4枚到達 先R3/後R4 | 5枚 先R5/後—」
 */
export const summaryLine = (s: MatchSummary, rules: string): string =>
  [
    `ルール: ${rules}`,
    s.finished ? `R${s.round} ${SEAT_WORD[s.turnPlayer]}の手番で決着(${s.turns}手番)` : `R${s.round} ${SEAT_WORD[s.turnPlayer]}の手番で中断(${s.turns}手番)`,
    resultText(s),
    ...stepsText(s),
  ].join(" | ");

// ------------------------------------------------------------------ CSV

/** One cell: quoted when it holds a comma, a quote or a line break; a leading =+-@ is defused for spreadsheets. */
export const csvCell = (v: string | number | null): string => {
  let t = v === null ? "" : String(v);
  if (/^[=+\-@]/.test(t)) t = `'${t}`;
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export const csvLine = (cells: readonly (string | number | null)[]): string => cells.map(csvCell).join(",");

/** Step columns shared by every CSV: 「先手4枚」「後手4枚」... for the steps given. */
export const stepHeaders = (steps: readonly number[]): string[] =>
  steps.flatMap((n) => [`先手${n}枚`, `後手${n}枚`]);

/** The step cells for `steps` (a summary with other steps leaves the missing ones empty). */
export const stepCells = (s: MatchSummary, steps: readonly number[]): (number | null)[] =>
  steps.flatMap((n) => {
    const i = s.steps.indexOf(n);
    return i < 0 ? [null, null] : [s.stepRounds[0][i], s.stepRounds[1][i]];
  });
