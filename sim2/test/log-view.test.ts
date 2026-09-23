// The record panel: lines in cause -> effect order and wording that names what happened.
import test from "node:test";
import assert from "node:assert/strict";
import { orderLog } from "../play/log-order.ts";
import { cellName, describeEvent, resultHow } from "../play/render.ts";
import type { Names } from "../play/render.ts";
import { presetConfig } from "../src/presets.ts";
import { applyAction } from "../src/rules.ts";
import { makeCtx } from "../src/state.ts";
import type { GameEvent } from "../src/types.ts";
import { blankState, place } from "./helpers.ts";
import { SK } from "./online-helpers.ts";

const NAMES: Names = ["あなた", "AI greedy"];
const items = (events: GameEvent[]) => events.map((event, seq) => ({ seq, event }));
const kinds = (list: { event: GameEvent }[]): string[] => list.map((l) => l.event.t);

test("an attack line comes before the bonus, the destruction and the move it caused; what follows it stays after", () => {
  const ctx = makeCtx(presetConfig("r0914"), SK);
  const s = blankState(ctx);
  const atk = place(s, "sk09", 0, 1, 0, 0); // 一目鬼 (HP 6, 巨撃) facing up
  place(s, "sk01", 1, 1, 1, 2); // 灯籠の精 (HP 2) in front
  const { events } = applyAction(ctx, s, { kind: "attack", uid: atk, targetUid: null });
  const engine = kinds(items(events));
  assert.ok(engine.indexOf("destroy") < engine.indexOf("attack"), `engine order is ${engine.join(",")}`);
  const shown = orderLog(items(events));
  assert.equal(shown[0].event.t, "attack");
  assert.deepEqual(new Set(kinds(shown)), new Set(engine), "nothing dropped");
  const text = shown.map((l) => describeEvent(ctx, NAMES, l.event)?.text ?? "");
  assert.match(text[0], /一目鬼が範囲攻撃/);
  assert.ok(text.findIndex((t) => t.includes("巨撃")) > 0);
  assert.ok(text.findIndex((t) => t.includes("撃破: AI greedyの灯籠の精")) > 0);
});

test("two attacks in a row keep their own consequences; a post-attack effect is not pulled into the next attack", () => {
  const e = (x: Partial<GameEvent> & { t: GameEvent["t"] }): GameEvent => x as GameEvent;
  const attack = (uid: number, cardId: string, hit: number): GameEvent =>
    e({ t: "attack", player: 0, uid, cardId, aoe: false, cost: 1, hits: [{ uid: hit, cardId: "sk01", owner: 1, blind: false, dmg: 2, destroyed: true, ally: false }], counterTotal: 0, counterCount: 0, attackerDestroyed: false, variant: "normal" });
  const log = items([
    e({ t: "destroy", owner: 1, uid: 7, cardId: "sk01", lifeLoss: 1, manaGain: 0 }),
    attack(1, "sk15", 7),
    e({ t: "effect", player: 0, source: "sk15", uid: 1, text: "再生: HP+1" }),
    e({ t: "effect", player: 0, source: "sk15", uid: 8, text: "【巨撃】一目鬼: HP差によりダメージ+1" }),
    e({ t: "destroy", owner: 1, uid: 8, cardId: "sk02", lifeLoss: 1, manaGain: 0 }),
    attack(1, "sk15", 8),
  ]);
  const shown = orderLog(log).map((l) => `${l.event.t}${"uid" in l.event ? l.event.uid : ""}${l.event.t === "effect" ? l.event.text.slice(0, 2) : ""}`);
  assert.deepEqual(shown, ["attack1", "destroy7", "effect1再生", "attack1", "effect8【巨", "destroy8"]);
});

test("start-of-turn effects follow the turn-start line; the control gain follows the turn-end line", () => {
  const e = (x: Record<string, unknown>): GameEvent => x as GameEvent;
  const log = items([
    e({ t: "pass", player: 0 }),
    e({ t: "control", player: 0, change: "gain" }),
    e({ t: "turnEnd", player: 0, round: 3, occupied: 5, chipGained: 1, chips: 3, discarded: 0, drawn: 1, manaLeft: 0 }),
    e({ t: "effect", player: 1, source: "sk07", uid: 4, text: "古箪笥: HP-1 で霊力+1" }),
    e({ t: "turnStart", player: 1, round: 4, income: 2 }),
    e({ t: "summon", player: 1, uid: 9, cardId: "sk02", pos: { x: 0, y: 2 }, facing: 2, cost: 2, taiji: false, baseCost: 2 }),
  ]);
  assert.deepEqual(kinds(orderLog(log)), ["pass", "turnEnd", "control", "turnStart", "effect", "summon"]);
});

test("wording: cell names instead of coordinates, the control threshold from the rules, rotations with unit and direction, an unambiguous result", () => {
  assert.equal(cellName({ x: 1, y: 1 }), "太極");
  assert.equal(cellName({ x: 2, y: 2 }), "右上の空");
  assert.equal(cellName({ x: 1, y: 2 }), "上の陰");
  assert.equal(cellName({ x: 0, y: 1 }), "左の陰");
  assert.equal(cellName({ x: 1, y: 0 }), "下の陽");
  const ctx = makeCtx({ ...presetConfig("r0914"), controlWin: 3 }, SK);
  const gain = describeEvent(ctx, NAMES, { t: "control", player: 0, change: "gain", need: 3, hold: ctx.cfg.controlHold });
  assert.ok(gain !== null && gain.text.includes("3マス") && !gain.text.includes("5マス"), gain?.text);
  // the line keeps the threshold it was written with, whatever the rules say later
  const older = describeEvent(ctx, NAMES, { t: "control", player: 0, change: "gain", need: 2, hold: "next_turn_end" });
  assert.ok(older !== null && older.text.includes("2マス") && older.text.includes("制圧中"), older?.text);
  const legacy = describeEvent(ctx, NAMES, { t: "control", player: 0, change: "gain" } as unknown as GameEvent);
  assert.ok(legacy !== null && legacy.text.includes("3マス"), "records from before the field fall back to the rules now");
  const rot = describeEvent(ctx, NAMES, { t: "rotate", player: 0, uid: 3, cost: 1, cardId: "sk09", from: 0, to: 1 });
  assert.equal(rot?.text, "あなた: 一目鬼を右へ回転 → 右向き (霊力-1)");
  const left = describeEvent(ctx, NAMES, { t: "rotate", player: 0, uid: 3, cost: 1, cardId: "sk09", from: 0, to: 3 });
  assert.equal(left?.text, "あなた: 一目鬼を左へ回転 → 左向き (霊力-1)");
  const yanari = describeEvent(ctx, NAMES, { t: "effect", player: 0, source: "sk18", uid: 3, text: "家鳴り: 一目鬼 を回転" }, { cardId: "sk09", from: 0, to: 2 });
  assert.equal(yanari?.text, "★ 家鳴り: 一目鬼 を回転 → 下向き");
  // the facing is on the event itself: the same line after a reload or for someone who joined later
  const stored = describeEvent(ctx, NAMES, { t: "effect", player: 0, source: "sk18", uid: 3, text: "家鳴り: 一目鬼 を回転", from: 0, to: 2 });
  assert.equal(stored?.text, "★ 家鳴り: 一目鬼 を回転 → 下向き");
  const win = describeEvent(ctx, NAMES, { t: "gameEnd", winner: 1, winType: "life", round: 6 });
  assert.equal(win?.text, "◆ 決着 (R6): AI greedyの勝ち(あなたの生命が0)");
  const summon = describeEvent(ctx, NAMES, { t: "summon", player: 0, uid: 2, cardId: "sk09", pos: { x: 2, y: 2 }, facing: 0, cost: 4, taiji: false, baseCost: 4 });
  assert.match(summon?.text ?? "", /一目鬼 を 右上の空 に召喚/);
  assert.equal(resultHow("control", 0, NAMES), "制圧勝ち");
  assert.equal(resultHow("life", 0, NAMES), "生命勝ち(AI greedyの生命が0)");
  assert.equal(resultHow(null, 0, NAMES), null);
});
