// Strict parsers for flow inputs from untrusted JSON: what a browser sends to
// the online server, and what the AI table reads back from browser storage to
// replay a match. They rebuild each value from known fields only; legality is
// still decided by the flow (submit). Pure: no node builtins.
import { parseCardOverrides } from "./card-overrides.ts";
import { parseConfigPatch } from "./config-schema.ts";
import type { Parsed } from "./config-schema.ts";
import type { FlowInput, RecordedInput, TansuAnswer } from "./flow.ts";
import type { Action, AttackVariant, Facing, PlayerId, ReiguMode } from "./types.ts";

const bad = <T>(error: string): Parsed<T> => ({ ok: false, error });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const isInt = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

const MAX_UID = 1_000_000;
const MAX_HAND = 64;
/** A 3x3 board holds at most 8 units around an attacker. */
const MAX_COUNTERERS = 8;
const ATTACK_VARIANTS: readonly AttackVariant[] = ["normal", "konshin", "heal", "regen", "drink"];

const intList = (v: unknown, hi: number): number[] | null => {
  if (!Array.isArray(v) || v.length > MAX_HAND) return null;
  const out: number[] = [];
  for (const x of v) {
    if (!isInt(x, 0, hi)) return null;
    out.push(x);
  }
  return out;
};

const facing = (v: unknown): Facing | null => (isInt(v, 0, 3) ? (v as Facing) : null);
const uidOrNull = (v: unknown): number | null | undefined => (v === null ? null : isInt(v, 0, MAX_UID) ? v : undefined);

/** Rebuilds an Action from untrusted JSON, copying only known fields. */
export const parseAction = (v: unknown): Parsed<Action> => {
  if (!isObj(v) || typeof v.kind !== "string") return bad("action.kind がありません");
  switch (v.kind) {
    case "pass":
      return { ok: true, value: { kind: "pass" } };
    case "summon": {
      const f = facing(v.facing);
      const pos = v.pos;
      if (!isInt(v.handIndex, 0, MAX_HAND) || f === null || !isObj(pos)) return bad("summon の形式が不正です");
      if (!isInt(pos.x, 0, 2) || !isInt(pos.y, 0, 2)) return bad("summon の座標が不正です");
      return { ok: true, value: { kind: "summon", handIndex: v.handIndex, pos: { x: pos.x, y: pos.y }, facing: f } };
    }
    case "inherit":
      if (!isInt(v.handIndex, 0, MAX_HAND) || !isInt(v.targetUid, 0, MAX_UID)) return bad("inherit の形式が不正です");
      return { ok: true, value: { kind: "inherit", handIndex: v.handIndex, targetUid: v.targetUid } };
    case "attack": {
      const t = uidOrNull(v.targetUid);
      if (!isInt(v.uid, 0, MAX_UID) || t === undefined) return bad("attack の形式が不正です");
      const variant = v.variant === undefined ? "normal" : v.variant;
      if (typeof variant !== "string" || !(ATTACK_VARIANTS as readonly string[]).includes(variant)) return bad("attack.variant が不正です");
      const attack: Extract<Action, { kind: "attack" }> = { kind: "attack", uid: v.uid, targetUid: t, variant: variant as AttackVariant };
      if (v.counterOrder !== undefined) {
        const order = intList(v.counterOrder, MAX_UID);
        if (order === null || order.length > MAX_COUNTERERS) return bad("attack.counterOrder が不正です");
        attack.counterOrder = order;
      }
      return { ok: true, value: attack };
    }
    case "rotate": {
      const f = facing(v.facing);
      if (!isInt(v.uid, 0, MAX_UID) || f === null) return bad("rotate の形式が不正です");
      return { ok: true, value: { kind: "rotate", uid: v.uid, facing: f } };
    }
    case "proxyRotate": {
      const f = facing(v.facing);
      if (!isInt(v.uid, 0, MAX_UID) || !isInt(v.targetUid, 0, MAX_UID) || f === null) {
        return bad("proxyRotate の形式が不正です");
      }
      return { ok: true, value: { kind: "proxyRotate", uid: v.uid, targetUid: v.targetUid, facing: f } };
    }
    case "reigu": {
      const t = uidOrNull(v.targetUid);
      const f = v.facing === null ? null : facing(v.facing);
      if (!isInt(v.handIndex, 0, MAX_HAND) || t === undefined || (v.facing !== null && f === null)) {
        return bad("reigu の形式が不正です");
      }
      const reigu: Extract<Action, { kind: "reigu" }> = { kind: "reigu", handIndex: v.handIndex, targetUid: t, facing: f };
      if (v.mode !== undefined) {
        if (v.mode !== "ken" && v.mode !== "aku") return bad("reigu.mode が不正です");
        reigu.mode = v.mode as ReiguMode;
      }
      if (v.victimUid !== undefined) {
        if (!isInt(v.victimUid, 0, MAX_UID)) return bad("reigu.victimUid が不正です");
        reigu.victimUid = v.victimUid;
      }
      return { ok: true, value: reigu };
    }
    default:
      return bad("不明な action.kind です");
  }
};

/**
 * A flow input: action / mulligan / discard / tansu / resign always; the
 * mid-match "config" and "cards" inputs only with `changes` (the online server
 * never takes them from a browser: they come from an agreed proposal).
 * Returns null for any other type, so the caller can parse its own inputs.
 */
export const parseFlowInput = (v: unknown, opts: { changes: boolean }): Parsed<FlowInput> | null => {
  if (!isObj(v) || typeof v.type !== "string") return bad("type がありません");
  switch (v.type) {
    case "action": {
      const a = parseAction(v.action);
      return a.ok ? { ok: true, value: { type: "action", action: a.value } } : a;
    }
    case "mulligan":
    case "discard": {
      const idx = intList(v.indices, MAX_HAND);
      if (idx === null) return bad("indices が不正です");
      return { ok: true, value: { type: v.type, indices: idx } };
    }
    case "tansu": {
      if (!Array.isArray(v.answers) || v.answers.length > 9) return bad("answers が不正です");
      const answers: TansuAnswer[] = [];
      for (const a of v.answers) {
        if (!isObj(a) || !isInt(a.uid, 0, MAX_UID)) return bad("answers が不正です");
        if (a.choice !== "mana" && a.choice !== "draw" && a.choice !== "skip") return bad("choice が不正です");
        answers.push({ uid: a.uid, choice: a.choice });
      }
      return { ok: true, value: { type: "tansu", answers } };
    }
    case "counterOrder": {
      const order = intList(v.order, MAX_UID);
      if (order === null || order.length > MAX_COUNTERERS) return bad("order が不正です");
      return { ok: true, value: { type: "counterOrder", order } };
    }
    case "resign":
      return { ok: true, value: { type: "resign" } };
    case "config": {
      if (!opts.changes) return null;
      const patch = parseConfigPatch(v.patch, { midGame: true });
      return patch.ok ? { ok: true, value: { type: "config", patch: patch.value } } : patch;
    }
    case "cards": {
      if (!opts.changes) return null;
      // card ids and range relations are checked against the cards in play when the input is submitted
      const edits = parseCardOverrides(v.edits, null);
      return edits.ok ? { ok: true, value: { type: "cards", edits: edits.value } } : edits;
    }
    default:
      return null;
  }
};

/** Longest recorded input list accepted from storage (a long match is a few hundred). */
export const MAX_RECORDED_INPUTS = 20_000;

/** A recorded input list (seat + input), every input with the mid-match changes allowed. */
export const parseRecordedInputs = (v: unknown): Parsed<RecordedInput[]> => {
  if (!Array.isArray(v) || v.length > MAX_RECORDED_INPUTS) return bad("入力の記録が不正です");
  const out: RecordedInput[] = [];
  for (const [i, rec] of v.entries()) {
    if (!isObj(rec) || (rec.seat !== 0 && rec.seat !== 1)) return bad(`入力 #${i} の席が不正です`);
    const input = parseFlowInput(rec.input, { changes: true });
    if (input === null) return bad(`入力 #${i} の種類が不正です`);
    if (!input.ok) return bad(`入力 #${i}: ${input.error}`);
    out.push({ seat: rec.seat as PlayerId, input: input.value });
  }
  return { ok: true, value: out };
};
