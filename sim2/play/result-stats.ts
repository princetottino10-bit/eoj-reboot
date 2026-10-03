// The numbers under a finished match's result (AI table, spectate, online
// rooms): the round and seat it was decided on, the turns played, how it
// ended, the round each player's chips reached each income step, and one
// line to paste into a sheet (「結果をコピー」). Pure HTML strings.
import { decidedText, durationText, stepCell, summarizeMatch, summaryLine } from "../src/match-summary.ts";
import type { MatchSummary, SideStats } from "../src/match-summary.ts";
import type { Config, PlayerId } from "../src/types.ts";
import type { BoardView, LogItem } from "../online/protocol.ts";
import { esc } from "./cards-view.ts";

/** The summary of a match as a table screen sees it (its log and board). */
export const summaryOfView = (log: readonly LogItem[], board: BoardView, cfg: Config): MatchSummary =>
  summarizeMatch({
    events: log.map((l) => l.event),
    round: board.round,
    turnPlayer: board.turnPlayer,
    ended: board.ended,
    winner: board.winner,
    winType: board.winType,
    chipIncomeSteps: cfg.chipIncomeSteps,
  });

const SEATS: readonly [PlayerId, string][] = [[0, "先手"], [1, "後手"]];

/** The step table: a column per income step, a row per seat (「R3」 / 「届かず」). */
const stepsTable = (s: MatchSummary): string =>
  s.steps.length === 0
    ? ""
    : `<table class="yy-rs-steps"><thead><tr><th scope="col">チップ</th>${s.steps.map((n) => `<th scope="col">${n}枚</th>`).join("")}</tr></thead><tbody>${SEATS.map(
        ([p, w]) => `<tr><th scope="row">${w}</th>${s.steps.map((_, i) => `<td>${esc(stepCell(s, p, i))}</td>`).join("")}</tr>`,
      ).join("")}</tbody></table>`;

/** The side table: a row per number, a column per seat (the bigger number of the two in bold). */
const SIDE_ROWS: readonly [keyof SideStats, string][] = [
  ["summons", "召喚"],
  ["attacks", "攻撃"],
  ["kills", "撃破"],
  ["lost", "失った式神"],
  ["damage", "与えたダメージ"],
  ["maxOcc", "最大占拠"],
  ["manaSpent", "使った霊力"],
  ["reaches", "制圧中になった回数"],
];

const sidesTable = (s: MatchSummary): string =>
  `<table class="yy-rs-sides"><thead><tr><th scope="col"></th>${SEATS.map(([, w]) => `<th scope="col">${w}</th>`).join("")}</tr></thead><tbody>${SIDE_ROWS.map(([k, label]) => {
    const a = s.sides[0][k];
    const b = s.sides[1][k];
    const cell = (v: number, other: number): string => `<td${v > other ? ' class="is-more"' : ""}>${v}</td>`;
    return `<tr><th scope="row">${label}</th>${cell(a, b)}${cell(b, a)}</tr>`;
  }).join("")}</tbody></table>`;

/**
 * The stats block. `rules`: the settings in a few words (settingsLabel) for
 * the copied line. The line sits in a read-only field so it can be selected by
 * hand where the clipboard is not available.
 */
export const resultStatsHtml = (s: MatchSummary, rules: string, shownHow = "", durationMs: number | null = null): string => {
  const line = summaryLine(s, rules, durationMs);
  // the panel's heading already says 「制圧勝利」: the row would only repeat it
  const how = shownHow === s.endLabel ? "" : `
    <div><dt>決着の仕方</dt><dd>${esc(s.endLabel)}</dd></div>`;
  return `<dl class="yy-rs">
    <div><dt>決着</dt><dd>${esc(decidedText(s))}・${s.turns}手番</dd></div>${how}${
      durationMs === null ? "" : `
    <div><dt>対戦時間</dt><dd>${esc(durationText(durationMs))}</dd></div>`
    }
  </dl>${stepsTable(s)}<details class="yy-rs-more"><summary>対戦の数字</summary>${sidesTable(s)}</details><div class="yy-rs-line"><textarea readonly rows="2" aria-label="結果の1行まとめ" data-result-line>${esc(line)}</textarea><button type="button" class="btn btn-quiet" data-copy-result>結果をコピー</button></div>`;
};
