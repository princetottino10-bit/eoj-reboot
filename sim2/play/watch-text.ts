// The spectate page's words: one step of an AI-vs-AI match (one action with
// what it caused, or one turn end, mulligan or 古箪笥 answer) as short
// Japanese lines, and how much it matters (how long the page lingers on it).
// Seats are named 先手 / 後手 throughout. Pure: no DOM, no rules maths (every
// number comes from the engine events or the rules helpers).
import { cardOf } from "../src/cards.ts";
import type { FlowEvent, FlowInput } from "../src/flow.ts";
import { incomeFor } from "../src/rules.ts";
import { controlWeight, unitHp } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import type { Facing, GameEvent, GameState, PlayerId, Pos } from "../src/types.ts";
import { cellName, describeEvent, FACING_LABEL, seatWord } from "./render.ts";
import { lanternAmount } from "../src/lantern.ts";
import { turnsOnMove } from "../src/kyonshi.ts";
import type { Names } from "./render.ts";

/** main: the action itself / sub: what followed from it / turn: whose turn now / key: a moment worth stopping at. */
export type WatchTone = "main" | "sub" | "turn" | "key";
export type WatchLine = { text: string; tone: WatchTone };

/** normal: an ordinary action / key: linger longer (turn change, income step, heavy unit, control) / end: the match is decided. */
export type WatchLevel = "normal" | "key" | "end";

/** What the board held before the step (units that the step removes are still named from here). */
export type UnitSeen = { cardId: string; owner: PlayerId; weight: number; pos: Pos };
export type Before = { units: Map<number, UnitSeen> };

export type Narration = {
  lines: WatchLine[];
  level: WatchLevel;
  /** The headline of a key step (null for an ordinary one). */
  banner: string | null;
  /** The unit that acted (summoned, attacked, turned), for the board highlight. */
  actor: number | null;
  /** The units it hit or aimed at. */
  targets: number[];
};

export const SEAT_NAMES: Names = [seatWord(0), seatWord(1)];

export const beforeOf = (ctx: Ctx, s: GameState): Before => ({
  units: new Map(s.units.map((u) => [u.uid, { cardId: u.cardId, owner: u.owner, weight: controlWeight(ctx, u), pos: { x: u.pos.x, y: u.pos.y } }])),
});

const cost = (n: number, extra: string[] = []): string => {
  const bits = [...(n > 0 ? [`霊力−${n}`] : []), ...extra];
  return bits.length === 0 ? "" : `(${bits.join("・")})`;
};

/** 「右へ」「左へ」「反対へ」 for a facing change. */
const turnWord = (from: Facing, to: Facing): string => {
  const d = (to - from + 4) % 4;
  return d === 1 ? "右へ" : d === 3 ? "左へ" : d === 2 ? "反対へ" : "";
};

const TANSU_WORD: Record<string, string> = { mana: "霊力を得る", draw: "1枚引く", skip: "使わない" };

type Ev = GameEvent | FlowEvent;

const attackLine = (e: Extract<GameEvent, { t: "attack" }>, seat: string, name: (id: string) => string): string => {
  const who = name(e.cardId);
  if (e.variant === "heal") {
    const h = e.hits[0];
    return `${seat}: ${who}が味方の${h === undefined ? "駒" : name(h.cardId)}を${h === undefined ? 0 : -h.dmg}回復${cost(e.cost)}`;
  }
  const base = e.free === true ? "召喚攻撃" : "攻撃";
  const kind = e.variant === "konshin" ? `渾身の${base}` : e.variant === "regen" ? `${base}【再生】` : e.variant === "drink" ? `${base}【飲酒】` : e.aoe ? `範囲${base}` : base;
  const single = e.hits.length === 1;
  const hits = e.hits.map((h) => {
    const tags = `${h.ally ? "(味方)" : ""}`;
    const blind = h.blind ? "(隙)" : "";
    const dead = h.destroyed ? (single ? "、撃破" : "(撃破)") : "";
    return `${name(h.cardId)}${tags}に${h.dmg}ダメージ${blind}${dead}`;
  });
  const hitText = hits.length === 0 ? "当たらず" : hits.join("・");
  const counter = e.counterTotal > 0 ? ` / 反撃で${e.counterTotal}ダメージ${e.counterCount > 1 ? `(${e.counterCount}体)` : ""}` : "";
  const fell = e.attackerDestroyed ? `、${who}は撃破された` : "";
  // freeSummonAttack: 「先手: 影鬼の召喚攻撃(霊力0) → …」
  const paid = e.free === true && e.cost === 0 ? "(霊力0)" : cost(e.cost);
  return `${seat}: ${who}の${kind}${paid} → ${hitText}${counter}${fell}`;
};

/** A step's own action line from its events (null when the event is not an action). */
const actionLine = (ctx: Ctx, e: Ev, before: Before, name: (id: string) => string): string | null => {
  switch (e.t) {
    case "summon": {
      const seat = seatWord(e.player);
      const where = e.taiji ? "太極" : cellName(e.pos);
      const off = (e.underdogDiscount ?? 0) > 0 ? [`劣勢割引−${e.underdogDiscount}`] : [];
      if (e.inheritedFrom !== undefined) {
        return `${seat}: ${name(e.inheritedFrom.cardId)}から${name(e.cardId)}へ継承召喚${cost(e.cost, [...off, `回収+${e.inheritedFrom.refund}`])}`;
      }
      return `${seat}: ${name(e.cardId)}を${where}に召喚・${FACING_LABEL[e.facing]}向き${cost(e.cost, off)}`;
    }
    case "attack":
      return attackLine(e, seatWord(e.player), name);
    case "rotate": {
      const seat = seatWord(e.player);
      if (e.from === e.to) return `${seat}: ${name(e.cardId)}の代理回転${cost(e.cost)}`;
      return `${seat}: ${name(e.cardId)}を${turnWord(e.from, e.to)}回転・${FACING_LABEL[e.to]}向き${cost(e.cost)}`;
    }
    case "reigu": {
      const target = e.targetUid === null ? undefined : before.units.get(e.targetUid);
      const on = target === undefined ? "" : `を${name(target.cardId)}に`;
      return `${seatWord(e.player)}: 霊具「${name(e.cardId)}」${on === "" ? "を" : on}使用${cost(e.cost)}`;
    }
    case "pass":
      return `${seatWord(e.player)}: ターン終了`;
    default:
      return null;
  }
};

/** The turn-end details: 「占拠3・チップ3枚・2枚補充」. */
const turnEndBits = (e: Extract<GameEvent, { t: "turnEnd" }>): string => {
  const bits = [`占拠${e.occupied}`, `チップ${e.chips}枚`];
  if (e.discarded > 0) bits.push(`${e.discarded}枚捨てて${e.drawn}枚補充`);
  else if (e.drawn > 0) bits.push(`${e.drawn}枚補充`);
  return bits.join("・");
};

/** A turn end that raised the income (ratchet): 「後手のチップが4枚に — 収入 6→7」. */
const incomeStep = (ctx: Ctx, e: Extract<GameEvent, { t: "turnEnd" }>): string | null => {
  if (ctx.cfg.incomeMode !== "ratchet" || e.chipGained <= 0) return null;
  const from = incomeFor(ctx, e.chips - e.chipGained);
  const to = incomeFor(ctx, e.chips);
  return to > from ? `◆ ${seatWord(e.player)}のチップが${e.chips}枚に — 収入 ${from}→${to}` : null;
};

/** Units that now count 2 toward 占拠 and did not before (a heavy summon, a heal over the line). */
const heavyLines = (ctx: Ctx, before: Before, after: GameState): string[] => {
  if (ctx.cfg.controlCount === "cells") return [];
  const out: string[] = [];
  for (const u of after.units) {
    if (controlWeight(ctx, u) < 2 || (before.units.get(u.uid)?.weight ?? 0) >= 2) continue;
    const card = cardOf(ctx.pack, u.cardId);
    const why = ctx.cfg.controlCount === "hp" ? `HP${unitHp(ctx, u)}` : `召喚コスト${card.summonCost}`;
    out.push(`◆ ${seatWord(u.owner)}の${card.nameJa}(${why})は占拠2マス分`);
  }
  return out;
};

/** Lines for the inputs that have no event of their own (mulligan, 古箪笥). */
const inputLines = (seat: PlayerId | null, inputs: readonly FlowInput[], name: (uid: number) => string): string[] => {
  if (seat === null) return [];
  const out: string[] = [];
  for (const input of inputs) {
    if (input.type === "mulligan") {
      out.push(input.indices.length > 0 ? `${seatWord(seat)}: マリガンで${input.indices.length}枚戻して引き直し` : `${seatWord(seat)}: マリガンしない`);
    } else if (input.type === "tansu") {
      const picks = input.answers.map((a) => TANSU_WORD[a.choice] ?? a.choice);
      out.push(`${seatWord(seat)}: ${name(input.answers[0]?.uid ?? -1)}${picks.length > 1 ? `(${picks.length}体)` : ""} — ${picks.join("、")}`);
    }
  }
  return out;
};

/**
 * One step in words. `events` are the public log events the step produced,
 * `inputs` the inputs played in it, `before` the board before it and `after`
 * the state now.
 */
export const narrateStep = (
  ctx: Ctx,
  before: Before,
  after: GameState,
  seat: PlayerId | null,
  inputs: readonly FlowInput[],
  events: readonly Ev[],
): Narration => {
  const name = (id: string): string => cardOf(ctx.pack, id).nameJa;
  const unitName = (uid: number): string => {
    const seen = before.units.get(uid) ?? after.units.find((u) => u.uid === uid);
    return seen === undefined ? "駒" : name(seen.cardId);
  };
  // the step's own action first, then what it caused (the engine files an attack's effects before the attack)
  const head: WatchLine[] = inputLines(seat, inputs, unitName).map((text) => ({ text, tone: "main" }));
  const lines: WatchLine[] = [];
  const keys: [string, number][] = [];
  let banner: string | null = null;
  let level: WatchLevel = "normal";
  let actor: number | null = null;
  const targets: number[] = [];
  let passAt = -1;
  let bannerRank = 0;
  /** The headline is the weightiest key moment of the step: the end, then control, a heavy unit, an income step, the turn. */
  const raise = (to: WatchLevel, text: string, rank: number): void => {
    if (rank > bannerRank) {
      banner = text;
      bannerRank = rank;
    }
    if (level !== "end") level = to;
  };
  for (const e of events) {
    const action = actionLine(ctx, e, before, name);
    if (action !== null) {
      if (e.t === "pass") passAt = head.length;
      head.push({ text: action, tone: head.length === 0 ? "main" : "sub" });
      if (e.t === "summon" || e.t === "attack" || e.t === "rotate") actor ??= e.uid;
      if (e.t === "attack") targets.push(...e.hits.map((h) => h.uid));
      if (e.t === "reigu" && e.targetUid !== null) targets.push(e.targetUid);
      continue;
    }
    switch (e.t) {
      case "turnEnd": {
        const bits = turnEndBits(e);
        if (passAt >= 0) head[passAt] = { text: `${head[passAt].text} — ${bits}`, tone: head[passAt].tone };
        else head.push({ text: `${seatWord(e.player)}: ターン終了 — ${bits}`, tone: head.length === 0 ? "main" : "sub" });
        const up = incomeStep(ctx, e);
        if (up !== null) keys.push([up, 2]);
        break;
      }
      case "turnStart": {
        const income = ctx.cfg.incomeTiming === "turn_start" && e.income > 0 ? `(収入+${e.income})` : "";
        const text = `ラウンド${e.round}・${seatWord(e.player)}の番`;
        lines.push({ text: `── ${text}${income}`, tone: "turn" });
        raise("key", text, 1);
        break;
      }
      case "effect":
        // 灯籠の精: whose light it was (the owner chose the ally) - 「先手: 灯籠の精の灯 → 僵尸公主 HP+2」
        // 僵尸公主 (10/3): whose choice the facing was - 「先手: 僵尸公主が移動 → 右へ90度(下向き)」
        lines.push({ text: lanternAmount(ctx, e.source) !== undefined || turnsOnMove(ctx, e.source) ? `${seatWord(e.player)}: ${e.text}` : `★ ${e.text}`, tone: "sub" });
        if (e.uid !== null && e.text.includes("回転") && actor !== null && e.uid !== actor) targets.push(e.uid);
        break;
      case "move":
        lines.push({ text: `${unitName(e.uid)}が${cellName(e.to)}へ移動`, tone: "sub" });
        break;
      case "destroy": {
        if (e.manaGain > 0 && e.manaTo !== undefined && e.manaTo !== null) {
          lines.push({ text: `撃破で${seatWord(e.manaTo)}の霊力+${e.manaGain}(${name(e.cardId)})`, tone: "sub" });
        }
        if (e.lifeLoss > 0) lines.push({ text: `${seatWord(e.owner)}の生命−${e.lifeLoss}(${name(e.cardId)})`, tone: "sub" });
        break;
      }
      case "counterOrder":
        lines.push({ text: `反撃の順番: ${seatWord(e.player)}が ${e.cards.map((id) => (id === "" ? "?" : name(id))).join(" → ")} に決めた`, tone: "sub" });
        break;
      case "control": {
        const line = describeEvent(ctx, SEAT_NAMES, e);
        if (line === null) break;
        lines.push({ text: line.text, tone: "key" });
        if (e.change !== "lost") raise("key", line.text.replace(/^◆\s*/, ""), 4);
        break;
      }
      case "gameEnd": {
        const line = describeEvent(ctx, SEAT_NAMES, e);
        const text = line === null ? "決着" : line.text.replace(/^◆\s*/, "");
        lines.push({ text: `◆ ${text}`, tone: "key" });
        raise("end", text, 5);
        break;
      }
      case "reshuffle":
        lines.push({ text: `${seatWord(e.player)}: 墓地を山札に戻した(${e.count}回目)`, tone: "sub" });
        break;
      case "mulligan":
      case "mulliganCards":
        // said from the inputs (the events come only once both seats have chosen)
        break;
      default: {
        const line = describeEvent(ctx, SEAT_NAMES, e);
        if (line !== null) lines.push({ text: line.text, tone: "sub" });
      }
    }
  }
  keys.push(...heavyLines(ctx, before, after).map((k): [string, number] => [k, 3]));
  for (const [k, rank] of keys) {
    lines.push({ text: k, tone: "key" });
    raise("key", k.replace(/^◆\s*/, ""), rank);
  }
  return { lines: [...head, ...lines], level, banner, actor, targets: [...new Set(targets)] };
};
