// The AI table's own results, kept in this browser (localStorage): the last
// 50 finished matches as the one-line summary and its numbers, listed on the
// start card with a CSV download, so rule variants tried against the AI can
// be compared in a sheet like the online records (/records).
//
// Everything read back is validated; anything malformed is dropped.
import { csvLine, SEAT_WORD, stepCells, stepHeaders } from "../src/match-summary.ts";
import type { MatchSummary } from "../src/match-summary.ts";
import type { PlayerId } from "../src/types.ts";
import { esc } from "./cards-view.ts";

export const RESULT_HISTORY_KEY = "sim2:ai-results";
export const RESULT_HISTORY_MAX = 50;

export type HistoryEntry = {
  /** The match id (one entry per match). */
  id: string;
  /** When it ended (ISO). */
  at: string;
  /** settingsLabel of the settings in force. */
  rules: string;
  /** settingsHash of the same settings. */
  hash: string;
  /** The copyable line (summaryLine). */
  line: string;
  human: PlayerId;
  ai: string;
  round: number;
  turnPlayer: PlayerId;
  turns: number;
  endLabel: string;
  winner: PlayerId | null;
  first: MatchSummary["first"];
  steps: number[];
  stepRounds: MatchSummary["stepRounds"];
};

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isSeat = (v: unknown): v is PlayerId => v === 0 || v === 1;
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const isStr = (v: unknown, max = 400): v is string => typeof v === "string" && v.length <= max;
const isRounds = (v: unknown, n: number): v is (number | null)[] =>
  Array.isArray(v) && v.length === n && v.every((x) => x === null || isInt(x));

const validEntry = (v: unknown): HistoryEntry | null => {
  if (!isObj(v)) return null;
  const steps = v.steps;
  if (!Array.isArray(steps) || steps.length > 12 || !steps.every(isInt)) return null;
  const sr = v.stepRounds;
  if (!Array.isArray(sr) || sr.length !== 2 || !isRounds(sr[0], steps.length) || !isRounds(sr[1], steps.length)) return null;
  const ok =
    isStr(v.id, 80) && isStr(v.at, 40) && isStr(v.rules) && isStr(v.hash, 16) && isStr(v.line, 1000) &&
    isSeat(v.human) && isStr(v.ai, 40) && isInt(v.round) && isSeat(v.turnPlayer) && isInt(v.turns) &&
    isStr(v.endLabel, 40) && (v.winner === null || isSeat(v.winner)) &&
    (v.first === null || v.first === "win" || v.first === "lose" || v.first === "draw");
  return ok ? (v as HistoryEntry) : null;
};

/** The stored results, newest first ([] when there are none or storage is off). */
export const readHistory = (store: Store | null): HistoryEntry[] => {
  if (store === null) return [];
  try {
    const raw = JSON.parse(store.getItem(RESULT_HISTORY_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.map(validEntry).filter((e): e is HistoryEntry => e !== null).slice(0, RESULT_HISTORY_MAX);
  } catch {
    return [];
  }
};

/** Adds a finished match (once per id), newest first, keeping RESULT_HISTORY_MAX. Returns the new list. */
export const addHistory = (store: Store | null, e: HistoryEntry): HistoryEntry[] => {
  const before = readHistory(store);
  if (before.some((x) => x.id === e.id)) return before;
  const next = [e, ...before].slice(0, RESULT_HISTORY_MAX);
  try {
    store?.setItem(RESULT_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // storage full or off: the result still shows on the table
  }
  return next;
};

export const clearHistory = (store: Store | null): void => {
  try {
    store?.removeItem(RESULT_HISTORY_KEY);
  } catch {
    // nothing to clear
  }
};

const FIRST_WORD = { win: "勝ち", lose: "負け", draw: "引き分け" } as const;

/** 「2026-10-03 14:05」 in Japan time. */
const when = (iso: string): string => {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ") : "";
};

/** CSV (BOM, CRLF), the same columns as /records.csv where they apply, plus the line itself. */
export const historyCsv = (entries: readonly HistoryEntry[]): string => {
  const steps = [...new Set(entries.flatMap((e) => e.steps))].sort((a, b) => a - b);
  const head = ["終了日時(日本時間)", "ルール", "設定ハッシュ", "あなたの席", "AI", "決着ラウンド", "決着の手番", "手番数", "決着の仕方", "勝者", "先手の結果", ...stepHeaders(steps), "まとめ"];
  const rows = entries.map((e) =>
    csvLine([
      when(e.at),
      e.rules,
      e.hash,
      SEAT_WORD[e.human],
      e.ai,
      e.round,
      SEAT_WORD[e.turnPlayer],
      e.turns,
      e.endLabel,
      e.winner === null ? "引き分け" : SEAT_WORD[e.winner],
      e.first === null ? "" : FIRST_WORD[e.first],
      ...stepCells({ steps: e.steps, stepRounds: e.stepRounds } as MatchSummary, steps),
      e.line,
    ]),
  );
  return `﻿${[csvLine(head), ...rows].join("\r\n")}\r\n`;
};

/** The start card's 「最近の結果」: the newest lines and the buttons; "" while there is nothing. */
export const historyHtml = (entries: readonly HistoryEntry[], shown = 8): string =>
  entries.length === 0
    ? ""
    : `<details class="entry-fold entry-history"><summary>最近の結果(この端末に${entries.length}局・最大${RESULT_HISTORY_MAX})</summary>
      <ol class="entry-history-list">${entries
        .slice(0, shown)
        .map((e) => `<li><time>${esc(when(e.at))}</time> ${esc(e.line)}</li>`)
        .join("")}</ol>
      <div class="entry-history-btns"><button type="button" class="btn btn-quiet" data-history-csv>CSVで保存</button><button type="button" class="btn btn-quiet" data-history-clear>記録を消す</button></div>
    </details>`;

/** Saves text as a file through a temporary link (browser only). */
export const downloadText = (name: string, text: string, type: string): void => {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
