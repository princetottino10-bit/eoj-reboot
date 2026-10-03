// 「ラウンド数も計測できるように」 (10/3): the match summary (deciding round and
// seat, turns, kind of end, the round each seat's chips reached each income
// step), its one-line copy text, the online records' `summary`, the /records
// page and CSV, and the AI table's local result list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { csvCell, durationText, sideStatsOf, summarizeMatch, summaryLine } from "../src/match-summary.ts";
import type { SummaryInput } from "../src/match-summary.ts";
import { settingPresetSettings, settingsLabel } from "../src/setting-presets.ts";
import { settingsHash } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import type { GameEvent } from "../src/types.ts";
import type { MatchRecord } from "../online/match.ts";
import { printedPack } from "../online/match.ts";
import { loadRecordRows, recordsCsv, recordsHtml, recordsResponse } from "../online/records.ts";
import { staticCacheControl } from "../online/server.ts";
import { addHistory, historyCsv, historyHtml, readHistory, RESULT_HISTORY_KEY, RESULT_HISTORY_MAX } from "../play/result-history.ts";
import type { HistoryEntry } from "../play/result-history.ts";
import { resultStatsHtml } from "../play/result-stats.ts";
import { call, flowOf, newApp, nextAiInput, seatTwo, testRecordDir } from "./online-api-helpers.ts";

const DIR = testRecordDir("records");
test.after(() => {
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
});

const turnEnd = (player: 0 | 1, round: number, chips: number): GameEvent => ({
  t: "turnEnd", player, round, occupied: chips, chips, chipGained: 0, reach: false, discarded: 0, drawn: 0,
  boardHp: 0, manaLeft: 0, occBoth: [0, 0], handBoth: [5, 5],
});

const base = (over: Partial<SummaryInput>): SummaryInput => ({
  events: [],
  round: 1,
  turnPlayer: 0,
  ended: true,
  winner: 0,
  winType: "control",
  chipIncomeSteps: [4, 5, 5],
  ...over,
});

// ------------------------------------------------------------- summary

test("summary: deciding round and seat, turns, end, and the first round each seat's chips reached each step", () => {
  const events: GameEvent[] = [
    turnEnd(0, 1, 2), turnEnd(1, 1, 2), turnEnd(0, 2, 3), turnEnd(1, 2, 3),
    turnEnd(0, 3, 4), turnEnd(1, 3, 3), turnEnd(0, 4, 4), turnEnd(1, 4, 4),
    turnEnd(0, 5, 5), turnEnd(1, 5, 4), turnEnd(0, 6, 5), turnEnd(1, 6, 4),
    { t: "gameEnd", winner: 0, winType: "control", round: 7 },
  ];
  const s = summarizeMatch(base({ events, round: 7, turnPlayer: 1 }));
  assert.equal(s.finished, true);
  assert.equal(s.round, 7);
  assert.equal(s.turnPlayer, 1);
  assert.equal(s.turns, 14);
  assert.equal(s.end, "control");
  assert.equal(s.endLabel, "制圧勝利");
  assert.equal(s.first, "win");
  assert.deepEqual(s.steps, [4, 5], "repeated steps count once");
  assert.deepEqual(s.stepRounds, [[3, 5], [4, null]]);
  assert.equal(
    summaryLine(s, "10/3テスト案+5体目で即勝ち"),
    "ルール: 10/3テスト案+5体目で即勝ち | 第7ラウンド 後手の手番で決着(14手番) | 制圧勝利 先手 | 4枚到達 先手 第3ラウンド/後手 第4ラウンド | 5枚 先手 第5ラウンド/後手 —",
  );
  // the panel: 「届かず」 for a step never reached, and the line in a copyable field
  const html = resultStatsHtml(s, "10/3テスト案");
  assert.ok(html.includes("第7ラウンド(後手の手番)・14手番"));
  assert.ok(html.includes("制圧勝利"));
  assert.ok(html.includes("届かず"));
  assert.ok(html.includes("結果をコピー"));
  assert.ok(html.includes('data-result-line>ルール: 10/3テスト案 | 第7ラウンド'));
});

test("summary: コールド勝ち, 投了, the round limit and an unfinished match", () => {
  const cold = summarizeMatch(base({
    events: [{ t: "gameEnd", winner: 1, winType: "control", round: 4, cold: { count: 5, by: "units", timing: "immediate", placed: true } }],
    round: 4, turnPlayer: 1, winner: 1,
  }));
  assert.equal(cold.endLabel, "コールド勝ち");
  assert.equal(cold.first, "lose");
  assert.equal(cold.turns, 8);
  const resign = summarizeMatch(base({ events: [{ t: "resign", player: 0, round: 3 }], round: 3, winner: 1, winType: null }));
  assert.equal(resign.end, "resign");
  assert.equal(resign.winner, 1);
  assert.ok(summaryLine(resign, "x").includes("| 投了 後手 |"));
  // also when only the caller knows who resigned (the flow's resignedBy)
  assert.equal(summarizeMatch(base({ resignedBy: 1, winner: 0, winType: null })).end, "resign");
  // the round limit is checked before R41's first turn: the last turn played was R40 後手
  const limit = summarizeMatch(base({ round: 41, turnPlayer: 0, winner: null, winType: "turn_limit" }));
  assert.equal(limit.round, 40);
  assert.equal(limit.turnPlayer, 1);
  assert.equal(limit.turns, 80);
  assert.equal(limit.first, "draw");
  assert.ok(summaryLine(limit, "x").includes("ラウンド上限 引き分け"));
  const open = summarizeMatch(base({ ended: false, winner: null, winType: null, round: 2 }));
  assert.equal(open.finished, false);
  assert.equal(open.endLabel, "対局中");
  assert.equal(open.first, null);
});

test("settings label and hash: base rule + bundle, overlay on any ruleset, or the number of changes", () => {
  const plain: GameSettings = { rule: "r1003", pack: "adopted-1003", config: {}, cards: {} };
  assert.equal(settingsLabel(plain, null), "10/3テスト案");
  const five: GameSettings = { ...plain, config: { instantWinCells: 5, instantWinTiming: "immediate", instantWinCount: "units" } };
  assert.equal(settingsLabel(five, null), "10/3テスト案+5体目で即勝ち");
  assert.equal(settingsLabel({ ...five, config: { ...five.config, startLife: 20 } }, null), "10/3テスト案+5体目で即勝ち+他1項目");
  assert.equal(settingsLabel({ ...plain, config: { startLife: 20, roundLimit: 30 } }, null), "10/3テスト案+2項目変更");
  const adj = settingPresetSettings("adj15", printedPack("shuten-kyuryu"));
  assert.equal(settingsLabel(adj, printedPack("shuten-kyuryu")), "9/14ルール(旧・現行)+調整案1.5倍");
  assert.match(settingsHash(plain, null), /^[0-9a-f]{8}$/);
  assert.equal(settingsHash(plain, null), settingsHash({ ...plain, config: { startLife: 15 } }, null), "a no-op change is the same settings");
  assert.notEqual(settingsHash(plain, null), settingsHash(five, null));
});

test("CSV cells: commas, quotes and line breaks are quoted; a leading = + - @ is defused", () => {
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(7), "7");
});

// ------------------------------------------------------------- online records

/** A room under these settings played to its end by greedy inputs (or until `cap` inputs). */
const playRoom = (dir: string, body: Record<string, unknown>, resignAfter: number | null = null) => {
  const app = newApp(dir);
  const s = seatTwo(app, body);
  const f = flowOf(s);
  const per = { key: "", n: 0 };
  for (let i = 0; i < 3000; i++) {
    if (resignAfter !== null && i === resignAfter) {
      assert.equal(call(app, "POST", `/api/rooms/${s.code}/input`, { type: "resign" }, s.tokens[0]).status, 200);
      break;
    }
    const nx = nextAiInput(f, per);
    if (nx === null) break;
    assert.equal(call(app, "POST", `/api/rooms/${s.code}/input`, nx[1], s.tokens[nx[0]]).status, 200);
  }
  assert.equal(f.phase.kind, "over");
  return { app, s, f };
};

test("online records carry the summary: rounds, deciding turn, end, ruleset label, settings hash, step rounds, first player's result", () => {
  const dir = join(DIR, "fields");
  rmSync(dir, { recursive: true, force: true });
  const { s, f } = playRoom(dir, {
    rule: "r1003", pack: "adopted-1003", effects: true,
    config: { instantWinCells: 5, instantWinTiming: "immediate", instantWinCount: "units" },
  });
  const room = s.app.lobby.rooms.get(s.code);
  const path = room?.match?.recordPath;
  assert.ok(typeof path === "string");
  const rec = JSON.parse(readFileSync(path, "utf8")) as MatchRecord;
  const sum = rec.summary;
  assert.ok(sum !== undefined);
  assert.equal(sum.rules, "10/3テスト案+5体目で即勝ち");
  assert.equal(sum.bundle, "5体目で即勝ち");
  assert.match(sum.settingsHash, /^[0-9a-f]{8}$/);
  assert.equal(sum.finished, true);
  assert.equal(sum.round, f.state.round);
  assert.equal(sum.turnPlayer, f.state.turnPlayer);
  assert.equal(sum.turns, (f.state.round - 1) * 2 + f.state.turnPlayer + 1);
  assert.equal(sum.winner, f.state.winner);
  assert.equal(sum.first, f.state.winner === null ? "draw" : f.state.winner === 0 ? "win" : "lose");
  assert.deepEqual(sum.steps, [...new Set(f.ctx.cfg.chipIncomeSteps)].sort((a, b) => a - b));
  assert.equal(sum.stepRounds.length, 2);
  assert.ok(["制圧勝利", "コールド勝ち", "生命勝ち", "2回目の山札切れ", "ラウンド上限"].includes(sum.endLabel), sum.endLabel);
});

test("/records and /records.csv: newest first, filterable by ruleset, no names / room codes / tokens; old records are summarized too", () => {
  const dir = join(DIR, "page");
  rmSync(dir, { recursive: true, force: true });
  const a = playRoom(dir, { rule: "r1003", pack: "adopted-1003", effects: true, name: "ひみつの名前" });
  const b = playRoom(dir, {
    rule: "r1003", pack: "adopted-1003", effects: true, name: "ひみつの名前",
    config: { instantWinCells: 5, instantWinTiming: "immediate", instantWinCount: "units" },
  }, 6);
  // a record from before `summary` existed
  const bPath = b.s.app.lobby.rooms.get(b.s.code)?.match?.recordPath;
  assert.ok(typeof bPath === "string");
  const old = JSON.parse(readFileSync(bPath, "utf8")) as MatchRecord;
  delete old.summary;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "20000101-000000-OLDOLD-g1.json"), JSON.stringify(old));
  writeFileSync(join(dir, "20000101-000001-JUNK-g1.json"), "{ not json");

  const rows = loadRecordRows(dir, printedPack);
  assert.equal(rows.length, 3, "the broken file is skipped");
  assert.equal(rows[2].summary.endLabel, "投了", "the legacy record is rebuilt");
  assert.equal(rows[2].summary.rules, "10/3テスト案+5体目で即勝ち");

  const all = recordsResponse("/records.csv", new URLSearchParams(), dir, printedPack);
  assert.ok(all !== null && all.type.startsWith("text/csv") && all.download === "records.csv");
  const lines = all.body.replace(/^﻿/, "").trimEnd().split("\r\n");
  assert.equal(lines.length, 4, "header + 3 games");
  assert.ok(lines[0].startsWith("終了日時(日本時間),対局番号,ルール,基準ルール,パック,調整案,設定ハッシュ,状態,決着ラウンド,決着の手番,手番数,対戦時間,決着の仕方,勝者,先手の結果"));
  assert.ok(lines[0].includes("先手4枚,後手4枚"), lines[0]);
  const filtered = recordsResponse("/records.csv", new URLSearchParams({ rules: "10/3テスト案+5体目で即勝ち" }), dir, printedPack);
  assert.ok(filtered !== null);
  assert.equal(filtered.body.trimEnd().split("\r\n").length, 3);
  assert.ok(filtered.body.includes("投了"));

  const page = recordsResponse("/records", new URLSearchParams(), dir, printedPack);
  assert.ok(page !== null && page.type.startsWith("text/html"));
  assert.ok(page.body.includes("対局の記録"));
  assert.ok(page.body.includes("CSV をダウンロード"));
  assert.ok(page.body.includes('<option value="10/3テスト案+5体目で即勝ち"'));
  assert.ok(!page.body.includes("<script"), "no script");
  for (const body of [page.body, all.body]) {
    assert.ok(!body.includes("ひみつの名前") && !body.includes('"B"'), "no player names");
    for (const code of [a.s.code, b.s.code, "OLDOLD"]) assert.ok(!body.includes(code), "no room codes or file names");
    for (const t of [...a.s.tokens, ...b.s.tokens]) assert.ok(!body.includes(t), "no tokens");
  }
  assert.equal(recordsResponse("/recordsX", new URLSearchParams(), dir, printedPack), null);
  assert.equal(staticCacheControl("/records"), "no-store");
  assert.equal(staticCacheControl("/records.csv"), "no-store");
  // an empty or missing directory lists nothing
  assert.equal(recordsHtml([], "").includes("まだ記録がありません"), true);
  assert.equal(recordsCsv([]).replace(/^﻿/, "").split("\r\n")[0].startsWith("終了日時"), true);
  assert.deepEqual(loadRecordRows(join(dir, "nope"), printedPack), []);
});

// ------------------------------------------------------------- AI table history

const memStore = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

const entry = (id: string): HistoryEntry => ({
  id, at: "2026-10-03T05:00:00.000Z", rules: "10/3テスト案", hash: "0123abcd", line: `ルール: 10/3テスト案 | R3 先手の手番で決着(5手番) | 制圧勝利 先手 | ${id}`,
  human: 0, ai: "強い", round: 3, turnPlayer: 0, turns: 5, endLabel: "制圧勝利", winner: 0, first: "win", steps: [4, 5], stepRounds: [[2, 3], [null, null]],
});

test("AI table history: once per match, newest first, at most 50, validated, CSV and the start card's list", () => {
  const st = memStore();
  assert.deepEqual(readHistory(st), []);
  assert.equal(historyHtml([]), "");
  addHistory(st, entry("a"));
  addHistory(st, entry("a"));
  addHistory(st, entry("b"));
  assert.deepEqual(readHistory(st).map((e) => e.id), ["b", "a"]);
  for (let i = 0; i < 60; i++) addHistory(st, entry(`g${i}`));
  assert.equal(readHistory(st).length, RESULT_HISTORY_MAX);
  // anything malformed is dropped
  st.setItem(RESULT_HISTORY_KEY, JSON.stringify([entry("ok"), { id: "bad" }, { ...entry("x"), stepRounds: [[1], [2]] }]));
  assert.deepEqual(readHistory(st).map((e) => e.id), ["ok"]);
  st.setItem(RESULT_HISTORY_KEY, "not json");
  assert.deepEqual(readHistory(st), []);
  const csv = historyCsv([entry("c")]).replace(/^﻿/, "").trimEnd().split("\r\n");
  assert.equal(csv.length, 2);
  assert.ok(csv[0].includes("先手4枚,後手4枚,先手5枚,後手5枚,まとめ"));
  assert.ok(csv[1].includes("2026-10-03 14:00"), "Japan time");
  assert.ok(csv[1].includes(",2,,3,,"), csv[1]);
  const html = historyHtml([entry("c")]);
  assert.ok(html.includes("最近の結果") && html.includes("CSVで保存"));
});

test("result numbers: each side's summons, attacks, kills, losses, damage, best 占拠, 霊力 spent, 制圧中; the match time", () => {
  const ev = [
    { t: "summon", player: 0, uid: 1, cardId: "a", pos: { x: 0, y: 0 }, facing: 0, cost: 4, taiji: false, baseCost: 4 },
    { t: "summon", player: 1, uid: 2, cardId: "b", pos: { x: 0, y: 1 }, facing: 2, cost: 5, taiji: false, baseCost: 5 },
    { t: "attack", player: 0, uid: 1, cardId: "a", aoe: false, cost: 3, hits: [{ uid: 2, cardId: "b", owner: 1, blind: false, dmg: 4, destroyed: true, ally: false }], counterTotal: 2, counterCount: 1, attackerDestroyed: false, variant: "normal" },
    { t: "destroy", owner: 1, uid: 2, cardId: "b", lifeLoss: 0, manaGain: 1, killer: 0 },
    { t: "rotate", player: 1, uid: 9, cost: 1, cardId: "c", from: 0, to: 1 },
    { t: "turnEnd", player: 0, round: 1, occupied: 3, chips: 1, chipGained: 1, reach: false, discarded: 0, drawn: 0, boardHp: 5, manaLeft: 0 },
    { t: "turnEnd", player: 0, round: 2, occupied: 2, chips: 2, chipGained: 1, reach: false, discarded: 0, drawn: 0, boardHp: 5, manaLeft: 0 },
    { t: "control", player: 0, change: "gain", need: 5, hold: "next_turn_end" },
  ] as unknown as GameEvent[];
  const [a, b] = sideStatsOf(ev);
  assert.deepEqual(a, { summons: 1, attacks: 1, kills: 1, lost: 0, damage: 4, maxOcc: 3, manaSpent: 7, reaches: 1 });
  assert.deepEqual(b, { summons: 1, attacks: 0, kills: 0, lost: 1, damage: 2, maxOcc: 0, manaSpent: 6, reaches: 0 });
  assert.equal(durationText(45_000), "45秒");
  assert.equal(durationText(754_000), "12分34秒");
  assert.equal(durationText(3_780_000), "1時間3分");
});
