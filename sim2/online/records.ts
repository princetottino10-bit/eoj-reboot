// The online games' result numbers: the `summary` each saved record carries
// (match.ts buildRecord), and the read-only /records page and /records.csv
// that list the recent finished games with them, filterable by ruleset label.
//
// Nothing here names a player or a room: seats are 先手 / 後手, there is no
// room code, file name, token, seed or input list in the page or the CSV.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { CardPack } from "../src/cards.ts";
import { diffPatch } from "../src/config-schema.ts";
import type { Flow } from "../src/flow.ts";
import { csvLine, SEAT_WORD, stepCells, stepHeaders, summarizeMatch } from "../src/match-summary.ts";
import type { EndKind, MatchSummary } from "../src/match-summary.ts";
import { isPlayablePack, isRulePresetId, presetConfig, RULE_PRESETS } from "../src/presets.ts";
import { matchingSettingPreset, SETTING_PRESETS, settingsLabel } from "../src/setting-presets.ts";
import { settingsHash } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import type { PlayerId } from "../src/types.ts";
import type { MatchRecord } from "./match.ts";

/** What a record says about how its game went, for comparing rule variants. */
export type RecordSummary = {
  /** The starting settings in a few words (「10/3テスト案+5体目で即勝ち」). */
  rules: string;
  /** The bundle (調整案) the starting settings are, or null. */
  bundle: string | null;
  /** settingsHash of the starting settings: equal hashes = the very same settings. */
  settingsHash: string;
  finished: boolean;
  round: number;
  turnPlayer: PlayerId;
  turns: number;
  end: EndKind | null;
  endLabel: string;
  winner: PlayerId | null;
  first: MatchSummary["first"];
  steps: number[];
  stepRounds: MatchSummary["stepRounds"];
};

/** The summary of a match: its starting settings, and how the flow went (the steps in force at the end). */
export const recordSummary = (settings: GameSettings, printed: CardPack | null, flow: Flow): RecordSummary => {
  const s = flow.state;
  const sum = summarizeMatch({
    events: flow.events,
    resignedBy: flow.resignedBy,
    round: s.round,
    turnPlayer: s.turnPlayer,
    ended: s.ended,
    winner: s.winner,
    winType: s.winType,
    chipIncomeSteps: flow.ctx.cfg.chipIncomeSteps,
  });
  const bundle = matchingSettingPreset(settings, printed);
  return {
    rules: settingsLabel(settings, printed),
    bundle: bundle === null ? null : SETTING_PRESETS[bundle].label,
    settingsHash: settingsHash(settings, printed),
    finished: sum.finished,
    round: sum.round,
    turnPlayer: sum.turnPlayer,
    turns: sum.turns,
    end: sum.end,
    endLabel: sum.endLabel,
    winner: sum.winner,
    first: sum.first,
    steps: sum.steps,
    stepRounds: sum.stepRounds,
  };
};

// ------------------------------------------------------------------ rows

/** One listed game. */
export type RecordRow = {
  endedAt: string | null;
  startedAt: string;
  matchNo: number;
  ruleLabel: string;
  pack: string;
  unfinished: boolean;
  summary: RecordSummary;
};

/**
 * A record written before records carried `summary`: rebuilt from what it
 * does carry. The round and seat come from the events (the last turn begun or
 * ended); a game decided at a turn start shows the turn before it.
 */
const legacySummary = (rec: MatchRecord, printed: (name: string) => CardPack | null): RecordSummary => {
  const settings: GameSettings = {
    rule: rec.rule,
    pack: rec.pack as GameSettings["pack"],
    config: diffPatch(presetConfig(rec.rule), rec.config),
    cards: rec.cards ?? {},
  };
  const pk = printed(rec.pack);
  let turnPlayer: PlayerId = 0;
  for (const e of rec.events) if (e.t === "turnStart" || e.t === "turnEnd") turnPlayer = e.player;
  const sum = summarizeMatch({
    events: rec.events,
    resignedBy: rec.result.resignedBy,
    round: rec.result.round,
    turnPlayer,
    ended: rec.unfinished !== true && (rec.result.winType !== null || rec.result.resignedBy !== null),
    winner: rec.result.winner,
    winType: rec.result.winType,
    chipIncomeSteps: rec.config.chipIncomeSteps,
  });
  const bundle = matchingSettingPreset(settings, pk);
  return {
    rules: settingsLabel(settings, pk),
    bundle: bundle === null ? null : SETTING_PRESETS[bundle].label,
    settingsHash: settingsHash(settings, pk),
    finished: sum.finished,
    round: sum.round,
    turnPlayer: sum.turnPlayer,
    turns: sum.turns,
    end: sum.end,
    endLabel: sum.endLabel,
    winner: sum.winner,
    first: sum.first,
    steps: sum.steps,
    stepRounds: sum.stepRounds,
  };
};

/** A parsed record as a row, or null when it is not one of ours (or too broken to read). */
export const recordRow = (raw: unknown, printed: (name: string) => CardPack | null): RecordRow | null => {
  if (typeof raw !== "object" || raw === null) return null;
  const rec = raw as MatchRecord;
  if (rec.format !== "sim2-online-record" || !isRulePresetId(rec.rule) || !isPlayablePack(rec.pack)) return null;
  try {
    return {
      endedAt: rec.endedAt,
      startedAt: rec.startedAt,
      matchNo: rec.matchNo,
      ruleLabel: RULE_PRESETS[rec.rule].label,
      pack: rec.pack,
      unfinished: rec.unfinished === true,
      summary: rec.summary ?? legacySummary(rec, printed),
    };
  } catch {
    return null;
  }
};

/** Rows kept per file: a record is written once, so the name and mtime say it is the same. */
const rowCache = new Map<string, { mtimeMs: number; row: RecordRow | null }>();

/** The newest `limit` records in `dir` as rows, newest first. A missing or unreadable directory lists nothing. */
export const loadRecordRows = (dir: string, printed: (name: string) => CardPack | null, limit = 300): RecordRow[] => {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit);
  } catch {
    return [];
  }
  const rows: RecordRow[] = [];
  for (const f of files) {
    const path = join(dir, f);
    try {
      const mtimeMs = statSync(path).mtimeMs;
      const hit = rowCache.get(path);
      let row: RecordRow | null;
      if (hit !== undefined && hit.mtimeMs === mtimeMs) row = hit.row;
      else {
        row = recordRow(JSON.parse(readFileSync(path, "utf8")) as unknown, printed);
        rowCache.set(path, { mtimeMs, row });
      }
      if (row !== null) rows.push(row);
    } catch {
      continue; // a file being written or removed right now
    }
  }
  return rows;
};

// ------------------------------------------------------------- page / CSV

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** Rows whose ruleset label is `rules` ("" = all). */
export const filterRows = (rows: readonly RecordRow[], rules: string): RecordRow[] =>
  rules === "" ? rows.slice() : rows.filter((r) => r.summary.rules === rules);

/** Every income step that appears, smallest first (the step columns). */
const allSteps = (rows: readonly RecordRow[]): number[] =>
  [...new Set(rows.flatMap((r) => r.summary.steps))].sort((a, b) => a - b);

const FIRST_WORD = { win: "勝ち", lose: "負け", draw: "引き分け" } as const;

/** 「2026-10-03 14:05」 in Japan time (the records are UTC ISO strings). */
const when = (iso: string | null): string => {
  if (iso === null) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
};

const COLUMNS = ["終了日時(日本時間)", "対局番号", "ルール", "基準ルール", "パック", "調整案", "設定ハッシュ", "状態", "決着ラウンド", "決着の手番", "手番数", "決着の仕方", "勝者", "先手の結果"];

const rowCells = (r: RecordRow, steps: readonly number[]): (string | number | null)[] => {
  const s = r.summary;
  return [
    when(r.endedAt ?? r.startedAt),
    r.matchNo,
    s.rules,
    r.ruleLabel,
    r.pack,
    s.bundle ?? "",
    s.settingsHash,
    r.unfinished || !s.finished ? "中断" : "終了",
    s.round,
    SEAT_WORD[s.turnPlayer],
    s.turns,
    s.endLabel,
    s.winner === null ? (s.finished ? "引き分け" : "") : SEAT_WORD[s.winner],
    s.first === null ? "" : FIRST_WORD[s.first],
    ...stepCells(s, steps),
  ];
};

/** CSV with a BOM (so a spreadsheet opens the Japanese as UTF-8) and CRLF lines. */
export const recordsCsv = (rows: readonly RecordRow[]): string => {
  const steps = allSteps(rows);
  const lines = [csvLine([...COLUMNS, ...stepHeaders(steps)]), ...rows.map((r) => csvLine(rowCells(r, steps)))];
  return `﻿${lines.join("\r\n")}\r\n`;
};

/** The /records page: a filter, a CSV link and the table. No script. */
export const recordsHtml = (all: readonly RecordRow[], rules: string): string => {
  const rows = filterRows(all, rules);
  const steps = allSteps(rows);
  const labels = [...new Set(all.map((r) => r.summary.rules))].sort();
  const options = [`<option value="">すべて(${all.length}局)</option>`]
    .concat(labels.map((l) => `<option value="${esc(l)}"${l === rules ? " selected" : ""}>${esc(l)}(${all.filter((r) => r.summary.rules === l).length}局)</option>`))
    .join("");
  const csvHref = `/records.csv${rules === "" ? "" : `?rules=${encodeURIComponent(rules)}`}`;
  const head = [...COLUMNS, ...steps.flatMap((n) => [`先手${n}枚`, `後手${n}枚`])].map((c) => `<th scope="col">${esc(c)}</th>`).join("");
  const body = rows
    .map((r) => `<tr${r.unfinished || !r.summary.finished ? ' class="cut"' : ""}>${rowCells(r, steps)
      .map((c, i) => `<td${i >= COLUMNS.length ? ' class="n"' : ""}>${esc(c === null ? (i >= COLUMNS.length ? "—" : "") : typeof c === "number" && i >= COLUMNS.length ? `第${c}ラウンド` : String(c))}</td>`)
      .join("")}</tr>`)
    .join("");
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>対局の記録 — 陰陽符陣(仮)</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='31' fill='%230b0b0e'/%3E%3Ccircle cx='32' cy='32' r='27.5' fill='none' stroke='%23d7b565' stroke-width='3'/%3E%3Ccircle cx='32' cy='32' r='23' fill='%231b2340'/%3E%3Cpath d='M32 9A23 23 0 0 1 32 55A11.5 11.5 0 0 1 32 32A11.5 11.5 0 0 0 32 9Z' fill='%23f5f1e2'/%3E%3Ccircle cx='32' cy='43.5' r='4.4' fill='%231b2340'/%3E%3Ccircle cx='32' cy='20.5' r='4.4' fill='%23f5f1e2'/%3E%3C/svg%3E">
<style>
:root { color-scheme: dark; --bg: #14151b; --text: #e8e2d4; --dim: #a39d90; --gold: #d8b766; --line: #2c2e38; }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, "Hiragino Sans", "Yu Gothic UI", sans-serif; }
h1 { font-size: 20px; margin: 0 0 4px; color: var(--gold); }
p.note { margin: 0 0 12px; color: var(--dim); font-size: 13px; }
form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 12px; }
select, button, a.btn { font: inherit; padding: 4px 10px; color: var(--text); background: #22242d; border: 1px solid #3a3d4a; border-radius: 4px; text-decoration: none; }
.wrap { overflow-x: auto; }
table { border-collapse: collapse; font-variant-numeric: tabular-nums; white-space: nowrap; }
th, td { padding: 4px 8px; border-bottom: 1px solid var(--line); text-align: left; }
th { position: sticky; top: 0; background: #1b1c23; color: var(--dim); font-weight: 600; }
td.n { text-align: center; }
tr.cut td { color: var(--dim); }
</style></head>
<body>
<h1>対局の記録</h1>
<p class="note">オンライン対局の新しい順(最大300局)。ラウンド数・決着の仕方・占拠チップが収入段階に届いたラウンドを、ルールごとに比べられます。席は先手・後手だけを表示します。</p>
<form method="get" action="/records"><label>ルール <select name="rules">${options}</select></label><button type="submit">絞り込む</button><a class="btn" href="${esc(csvHref)}" download>CSV をダウンロード</a></form>
${rows.length === 0 ? "<p>まだ記録がありません。</p>" : `<div class="wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`}
</body></html>
`;
};

/** The longest ruleset label taken from a query (anything longer cannot be one of ours). */
const MAX_RULES_PARAM = 200;

/**
 * GET /records and /records.csv: the response, or null for any other path.
 * `rules` comes from the query string; an unknown label simply lists nothing.
 */
export const recordsResponse = (
  path: string,
  query: URLSearchParams,
  dir: string,
  printed: (name: string) => CardPack | null,
): { code: number; body: string; type: string; download?: string } | null => {
  const isPage = path === "/records" || path === "/records/";
  const isCsv = path === "/records.csv";
  if (!isPage && !isCsv) return null;
  const rules = (query.get("rules") ?? "").slice(0, MAX_RULES_PARAM);
  const rows = loadRecordRows(dir, printed);
  if (isCsv) return { code: 200, body: recordsCsv(filterRows(rows, rules)), type: "text/csv; charset=utf-8", download: "records.csv" };
  return { code: 200, body: recordsHtml(rows, rules), type: "text/html; charset=utf-8" };
};
