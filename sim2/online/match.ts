// One online match: the rules config, the flow state machine (src/flow.ts)
// and the game record written when it ends. The flow holds the "waiting for a
// player's choice" states (mulligan / tm07 / discard); the engine is called
// synchronously once the choice is in, never made async.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyCardOverrides, cardChanges } from "../src/card-overrides.ts";
import type { CardChange, CardOverrides } from "../src/card-overrides.ts";
import type { CardPack } from "../src/cards.ts";
import { applyConfigPatch, configChanges } from "../src/config-schema.ts";
import type { ConfigChange } from "../src/config-schema.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { createFlow, replayFlow, submit } from "../src/flow.ts";
import type { Flow, FlowInput, FlowOptions, RecordedInput, SubmitResult } from "../src/flow.ts";
import { isPlayablePack, RULE_PRESETS } from "../src/presets.ts";
import type { RulePresetId } from "../src/presets.ts";
import { cloneSettings, settingsConfig, settingsPack } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import { makeCtx } from "../src/state.ts";
import type { Config, GameEvent, PlayerId, WinType } from "../src/types.ts";

/** A match is fully described by its settings (preset + changes + card numbers). */
export type MatchSettings = GameSettings;

export type Match = {
  no: number;
  settings: MatchSettings;
  flow: Flow;
  names: [string, string];
  startedAt: string;
  endedAt: string | null;
  recordPath: string | null;
};

const packCache = new Map<string, CardPack>();

export const packFor = (name: string): CardPack => {
  const hit = packCache.get(name);
  if (hit !== undefined) return hit;
  const pack = loadPack(packPath(name));
  packCache.set(name, pack);
  return pack;
};

/** The printed pack by name, or null for a name that is not playable. */
export const printedPack = (name: string): CardPack | null => (isPlayablePack(name) ? packFor(name) : null);

export const matchConfig = (settings: MatchSettings): Config => settingsConfig(settings);

export const createMatch = (
  settings: MatchSettings,
  no: number,
  seed: number,
  names: [string, string],
  now: Date,
  opts: FlowOptions = {},
): Match => {
  const own = cloneSettings(settings);
  const ctx = makeCtx(matchConfig(own), settingsPack(own, packFor(own.pack)));
  return {
    no,
    settings: own,
    flow: createFlow(ctx, seed, opts),
    names,
    startedAt: now.toISOString(),
    endedAt: null,
    recordPath: null,
  };
};

export const matchOver = (m: Match): boolean => m.flow.phase.kind === "over";

export const matchSubmit = (m: Match, seat: PlayerId, input: FlowInput, now: Date): SubmitResult => {
  if (matchOver(m)) return { ok: false, code: "phase", error: "試合は終了しています" };
  const r = submit(m.flow, seat, input);
  if (r.ok && matchOver(m) && m.endedAt === null) m.endedAt = now.toISOString();
  return r;
};

// ------------------------------------------------------------------ record

export const RECORD_FORMAT = "sim2-online-record";

export type MatchRecord = {
  format: typeof RECORD_FORMAT;
  /** 1: no mid-match changes, no card overrides. 2: adds `cards`, `configChanges` and `cardChanges`. */
  version: 1 | 2;
  /**
   * The match never reached its end: the room was closed or swept while it was
   * running, so the record stops at the last input. It replays exactly like a
   * finished one, only shorter (`result` is the position it was left in).
   */
  unfinished?: boolean;
  room: string;
  matchNo: number;
  startedAt: string;
  endedAt: string | null;
  rule: RulePresetId;
  ruleLabel: string;
  pack: string;
  effects: boolean;
  /** The rules the match STARTED with. Mid-match changes are "config" inputs. */
  config: Config;
  /** Card number overrides the match was played with (version 2). */
  cards?: CardOverrides;
  /** Readable summary of the mid-match rule changes, in order (version 2). */
  configChanges?: { inputIndex: number; seat: PlayerId; changes: ConfigChange[] }[];
  /** Mid-match card changes, for reading (a replay needs only `inputs`). */
  cardChanges?: { inputIndex: number; seat: PlayerId; changes: CardChange[] }[];
  seed: number;
  names: [string, string];
  inputs: RecordedInput[];
  result: {
    winner: PlayerId | null;
    winType: WinType | null;
    resignedBy: PlayerId | null;
    round: number;
    life: [number, number];
  };
  events: GameEvent[];
};

export const buildRecord = (m: Match, room: string, unfinished = false): MatchRecord => {
  const s = m.flow.state;
  const changes: NonNullable<MatchRecord["configChanges"]> = [];
  let cfg = m.flow.initialCfg;
  const cardLog: NonNullable<MatchRecord["cardChanges"]> = [];
  let pack = applyCardOverrides(packFor(m.settings.pack), m.settings.cards);
  m.flow.inputs.forEach((rec, i) => {
    if (rec.input.type === "cards") {
      cardLog.push({ inputIndex: i, seat: rec.seat, changes: cardChanges(pack, rec.input.edits) });
      pack = applyCardOverrides(pack, rec.input.edits);
      return;
    }
    if (rec.input.type !== "config") return;
    const next = applyConfigPatch(cfg, rec.input.patch);
    changes.push({ inputIndex: i, seat: rec.seat, changes: configChanges(cfg, next) });
    cfg = next;
  });
  return {
    format: RECORD_FORMAT,
    version: 2,
    ...(unfinished ? { unfinished: true as const } : {}),
    room,
    matchNo: m.no,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    rule: m.settings.rule,
    ruleLabel: RULE_PRESETS[m.settings.rule].label,
    pack: m.settings.pack,
    effects: m.flow.initialCfg.effects,
    config: m.flow.initialCfg,
    cards: m.settings.cards,
    configChanges: changes,
    cardChanges: cardLog,
    seed: m.flow.seed,
    names: [m.names[0], m.names[1]],
    inputs: m.flow.inputs,
    result: {
      winner: s.winner,
      winType: s.winType,
      resignedBy: m.flow.resignedBy,
      round: s.round,
      life: [s.players[0].life, s.players[1].life],
    },
    events: m.flow.events,
  };
};

const stamp = (iso: string): string => iso.replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");

/** Records kept on disk; the oldest go first (file names start with the start time). */
export const MAX_RECORDS = 500;

export const pruneRecords = (dir: string, max = MAX_RECORDS): void => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  for (const f of files.slice(0, Math.max(0, files.length - max))) rmSync(join(dir, f), { force: true });
};

/**
 * Makes sure the record directory exists and can be written to. On Fly the
 * directory is a volume that is empty (and, until it is seeded, may be
 * read-only for the app user) the first time the machine boots, so a failure
 * here must never stop the server: it is reported and the games are played
 * without records.
 */
export const checkRecordDir = (dir: string): { ok: true } | { ok: false; error: string } => {
  const probe = join(dir, ".writable");
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(probe, "", "utf8");
    rmSync(probe, { force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

/**
 * Writes the record once. Returns the path, or null if writing failed.
 * `unfinished`: the match was cut short (room closed or swept); the file gets a
 * `-unfinished` suffix and the record an `unfinished: true` field. The name
 * still starts with the match's start time, so pruning keeps ordering by age.
 */
export const saveRecord = (m: Match, room: string, dir: string, unfinished = false): string | null => {
  if (m.recordPath !== null) return m.recordPath;
  const path = join(dir, `${stamp(m.startedAt)}-${room}-g${m.no}${unfinished ? "-unfinished" : ""}.json`);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, `${JSON.stringify(buildRecord(m, room, unfinished), null, 2)}\n`, "utf8");
    pruneRecords(dir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`online: could not save record ${path}: ${msg}\n`);
    return null;
  }
  m.recordPath = path;
  return path;
};

/** Re-runs a saved record with the same config, pack, seed and inputs. */
export const replayRecord = (rec: MatchRecord, opts: FlowOptions = {}): Flow => {
  const pack = applyCardOverrides(packFor(rec.pack), rec.cards ?? {});
  return replayFlow(makeCtx(rec.config, pack), rec.seed, rec.inputs, opts);
};
