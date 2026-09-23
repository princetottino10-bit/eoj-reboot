// The AI table keeps its match in browser storage so that leaving /ai (the
// settings page, a reload, the browser's Back) does not lose it. A match is
// stored as what it started with plus every accepted input and is rebuilt by
// replaying them (src/flow.ts replayFlow), so the stored form never has to
// describe a board. The start card's choices are kept per tab as well.
//
//   sessionStorage  this tab's match (resumed at once on /ai) and its start card
//   localStorage    the latest match of this browser (offered as 「続きから」)
//
// Every match has an id of its own: two matches started with the same settings
// and seed are still two matches, and a tab follows another tab's record only
// when it is the same match carried further. A record is never overwritten
// with a shorter one of the same match.
//
// Everything read back is validated; anything malformed is ignored.
import { EVAL_PROFILE_NAMES } from "../src/ai/eval.ts";
import { isAiKind } from "../src/ai/index.ts";
import type { AiKind } from "../src/ai/index.ts";
import type { CardPack } from "../src/cards.ts";
import type { Parsed } from "../src/config-schema.ts";
import { replayFlow } from "../src/flow.ts";
import type { Flow, RecordedInput } from "../src/flow.ts";
import { parseRecordedInputs } from "../src/input-parse.ts";
import type { PlayablePack } from "../src/presets.ts";
import { decodeSettings, defaultSettings, encodeSettings, parseSettings, settingsConfig, settingsPack } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import { makeCtx } from "../src/state.ts";
import type { PlayerId } from "../src/types.ts";

export const AI_GAME_VERSION = 1;
export const AI_GAME_KEY = "sim2:ai-game";
export const AI_SETUP_KEY = "sim2:ai-setup";

/** The AI kinds come from the registry (src/ai/index.ts), so a new kind is playable here at once. */
export type { AiKind };

/** A match against the AI: its identity, its start (settings, seats, AI, seed) and every accepted input. */
export type StoredAiGame = {
  version: typeof AI_GAME_VERSION;
  /** Which match this is (random, fixed at its start). */
  id: string;
  /** The settings the match started with (mid-game changes are inputs). */
  settings: GameSettings;
  human: PlayerId;
  ai: AiKind;
  evalName: string;
  seed: number;
  inputs: RecordedInput[];
};

/** The start card's choices; `s` is the encoded settings (as in a share URL). */
export type AiSetup = { s: string; human: PlayerId; ai: AiKind; evalName: string; seed: number; playedSeed: number | null };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isSeed = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isEvalName = (v: unknown): v is string => typeof v === "string" && EVAL_PROFILE_NAMES.includes(v);
const isGameId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(v);

/** A fresh match id (getRandomValues works on plain http too, unlike randomUUID). */
export const newGameId = (): string => {
  const bytes = new Uint8Array(12);
  try {
    globalThis.crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

/** JSON with object keys sorted: equal values give equal text whatever order their keys were built in. */
export const canonicalJson = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    typeof x === "object" && x !== null && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : x,
  );

/** Records from before match ids: an id from the start itself, so every tab still agrees on it. */
const legacyId = (start: Omit<StoredAiGame, "version" | "id" | "inputs">): string => {
  const text = canonicalJson([start.seed, start.human, start.ai, start.evalName, start.settings]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `legacy-${start.seed}-${h.toString(16)}`;
};

export const DEFAULT_EVAL = "territorial";

export const defaultAiSetup = (): AiSetup => ({
  s: encodeSettings(defaultSettings()),
  human: 0,
  ai: "strong",
  evalName: DEFAULT_EVAL,
  seed: 20260913,
  playedSeed: null,
});

/**
 * A stored match from untrusted JSON. `packOf` supplies the printed pack so the
 * card edits can be checked; null checks the shape only (to learn which pack
 * to load first).
 */
export const parseStoredGame = (raw: unknown, packOf: ((name: PlayablePack) => CardPack | null) | null): Parsed<StoredAiGame> => {
  if (!isObj(raw) || raw.version !== AI_GAME_VERSION) return { ok: false, error: "保存された対局の版が違います" };
  const settings = parseSettings(raw.settings, packOf);
  if (!settings.ok) return settings;
  if (raw.human !== 0 && raw.human !== 1) return { ok: false, error: "保存された対局の席が不正です" };
  if (!isAiKind(raw.ai) || !isEvalName(raw.evalName)) return { ok: false, error: "保存された対局のAIが不正です" };
  if (!isSeed(raw.seed)) return { ok: false, error: "保存された対局のシードが不正です" };
  if (raw.id !== undefined && !isGameId(raw.id)) return { ok: false, error: "保存された対局の識別子が不正です" };
  const inputs = parseRecordedInputs(raw.inputs);
  if (!inputs.ok) return inputs;
  const start: Omit<StoredAiGame, "version" | "id" | "inputs"> = {
    settings: settings.value,
    human: raw.human,
    ai: raw.ai,
    evalName: raw.evalName,
    seed: raw.seed,
  };
  return {
    ok: true,
    value: { version: AI_GAME_VERSION, id: isGameId(raw.id) ? raw.id : legacyId(start), ...start, inputs: inputs.value },
  };
};

/**
 * Rebuilds the match: the context from the starting settings, then every
 * input replayed. Any rejected input (or engine error) makes the whole record
 * unusable. The rules and cards in force are the flow's ctx afterwards.
 */
export const restoreStoredGame = (game: StoredAiGame, printed: CardPack): Parsed<Flow> => {
  try {
    const ctx = makeCtx(settingsConfig(game.settings), settingsPack(game.settings, printed));
    return { ok: true, value: replayFlow(ctx, game.seed, game.inputs) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

export const storedGameOf = (start: Omit<StoredAiGame, "version" | "inputs">, flow: Flow): StoredAiGame => ({
  version: AI_GAME_VERSION,
  id: start.id,
  settings: start.settings,
  human: start.human,
  ai: start.ai,
  evalName: start.evalName,
  seed: start.seed,
  inputs: flow.inputs.map((r) => ({ seat: r.seat, input: r.input })),
});

export const parseAiSetup = (raw: unknown): AiSetup | null => {
  if (!isObj(raw) || typeof raw.s !== "string" || !decodeSettings(raw.s, null).ok) return null;
  if (raw.human !== 0 && raw.human !== 1) return null;
  if (!isAiKind(raw.ai) || !isEvalName(raw.evalName) || !isSeed(raw.seed)) return null;
  const playedSeed = isSeed(raw.playedSeed) ? raw.playedSeed : null;
  return { s: raw.s, human: raw.human, ai: raw.ai, evalName: raw.evalName, seed: raw.seed, playedSeed };
};

// ----------------------------------------------------------------- storage

/** The part of Web Storage used here (a Map-backed fake in the tests). */
export type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** A storage area, or null where it is unavailable (privacy modes, sandboxed frames). */
export const storageOr = (get: () => Storage): KeyValueStore | null => {
  try {
    return get();
  } catch {
    return null;
  }
};

const readJson = (store: KeyValueStore | null, key: string): unknown => {
  if (store === null) return null;
  try {
    const text = store.getItem(key);
    return text === null ? null : (JSON.parse(text) as unknown);
  } catch {
    return null;
  }
};

const writeJson = (store: KeyValueStore | null, key: string, value: unknown): boolean => {
  if (store === null) return false;
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const remove = (store: KeyValueStore | null, key: string): void => {
  try {
    store?.removeItem(key);
  } catch {
    // unavailable storage has nothing to remove
  }
};

export type Stores = { session: KeyValueStore | null; local: KeyValueStore | null };

/** A stored match that replays to an unfinished game. `fromTab`: this tab's own match (resumed without asking). */
export type LoadedGame = { game: StoredAiGame; flow: Flow; printed: CardPack; fromTab: boolean };

/** The id and inputs of a stored record, from its shape alone (null: not a record). */
const recordOf = (raw: unknown): StoredAiGame | null => {
  const parsed = parseStoredGame(raw, null);
  return parsed.ok ? parsed.value : null;
};

/** `longer` is the match `shorter` shows, carried further: every input of `shorter`, then more. */
const extendsInputs = (longer: readonly RecordedInput[], shorter: readonly RecordedInput[]): boolean =>
  longer.length > shorter.length && shorter.every((x, i) => canonicalJson(x) === canonicalJson(longer[i]));

/**
 * The stored match to continue: this tab's first (or the browser's copy of it
 * when that one went further), then the browser's latest. A record that does
 * not parse, whose pack does not load, that does not replay or whose match is
 * over is forgotten, and the next one is tried.
 */
export const loadStoredGame = async (stores: Stores, loadPack: (name: PlayablePack) => Promise<CardPack>): Promise<LoadedGame | null> => {
  for (const fromTab of [true, false]) {
    const store = fromTab ? stores.session : stores.local;
    let raw = readJson(store, AI_GAME_KEY);
    if (raw === null) continue;
    if (fromTab) {
      // another tab carried this tab's match further: continue from there (and this tab's copy follows)
      const mine = recordOf(raw);
      const shared = readJson(stores.local, AI_GAME_KEY);
      const theirs = recordOf(shared);
      if (mine !== null && theirs !== null && theirs.id === mine.id && extendsInputs(theirs.inputs, mine.inputs)) {
        raw = shared;
        writeJson(stores.session, AI_GAME_KEY, shared);
      }
    }
    const shape = parseStoredGame(raw, null);
    const printed = shape.ok ? await loadPack(shape.value.settings.pack).catch(() => null) : null;
    if (!shape.ok || printed === null) {
      // an unreadable record goes; one whose pack could not be fetched right now stays for later
      if (!shape.ok) remove(store, AI_GAME_KEY);
      continue;
    }
    const game = parseStoredGame(raw, () => printed);
    const flow = game.ok ? restoreStoredGame(game.value, printed) : null;
    if (!game.ok || flow === null || !flow.ok || flow.value.phase.kind === "over") {
      remove(store, AI_GAME_KEY);
      continue;
    }
    return { game: game.value, flow: flow.value, printed, fromTab };
  }
  return null;
};

/**
 * Stores a match in this tab and as the browser's latest. A store that holds
 * the same match further along keeps its record (a stale screen never writes
 * an older position over a newer one). Returns whether anything was written.
 */
export const writeStoredGame = (stores: Stores, game: StoredAiGame): boolean => {
  let wrote = false;
  for (const store of [stores.session, stores.local]) {
    const held = recordOf(readJson(store, AI_GAME_KEY));
    if (held !== null && held.id === game.id && held.inputs.length > game.inputs.length) continue;
    if (writeJson(store, AI_GAME_KEY, game)) wrote = true;
  }
  return wrote;
};

/**
 * Forgets a match (finished, replaced or unreadable). The browser-wide copy
 * goes only when it is the same match, so another tab's match stays offered.
 */
export const clearStoredGame = (stores: Stores, game: StoredAiGame | null): void => {
  remove(stores.session, AI_GAME_KEY);
  const shared = recordOf(readJson(stores.local, AI_GAME_KEY));
  if (game === null || shared === null || shared.id === game.id) remove(stores.local, AI_GAME_KEY);
};

/** The start of a match (its identity and settings, seats, AI and deal). */
export type AiStart = Omit<StoredAiGame, "version" | "inputs">;

/**
 * Is the stored record still exactly this match at this point? The settings
 * page checks before writing its change, so a match that another screen moved
 * on meanwhile is not overwritten with an older one.
 */
export const storedUnchanged = (stores: Stores, game: StoredAiGame, fromTab: boolean): boolean => {
  const held = recordOf(readJson(fromTab ? stores.session : stores.local, AI_GAME_KEY));
  return held !== null && held.id === game.id && canonicalJson(held.inputs) === canonicalJson(game.inputs);
};

/**
 * A record another screen wrote (a storage event, or the browser's copy read
 * back) that is this very match carried further than the inputs this screen
 * has: the one to adopt. Anything else - another match, the same match gone
 * another way, not further - is null: this screen keeps its own match.
 */
export const newerRecord = (text: string | null, game: { id: string; inputs: readonly RecordedInput[] }): StoredAiGame | null => {
  if (text === null) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const held = recordOf(raw);
  return held !== null && held.id === game.id && extendsInputs(held.inputs, game.inputs) ? held : null;
};

/** The browser's latest record as text (null when there is none or storage is unavailable). */
export const sharedRecordText = (stores: Stores): string | null => {
  try {
    return stores.local?.getItem(AI_GAME_KEY) ?? null;
  } catch {
    return null;
  }
};

/**
 * The start card's settings once a match is left (it ended, or 「新しい対局」):
 * the rules and cards the match ended with carry over — unless other rules
 * were chosen on the start card since that match started (edited on /rules,
 * then 「続きから」): those stay, so a new game uses what was last chosen there.
 * `chosen` is the card's encoded settings, `started` what the match began with.
 */
export const settingsToCarry = (chosen: string, started: GameSettings, inForce: GameSettings): string => {
  const shown = decodeSettings(chosen, null);
  const untouched = !shown.ok || canonicalJson(shown.value) === canonicalJson(started);
  return untouched ? encodeSettings(inForce) : chosen;
};

export const readAiSetup = (stores: Stores): AiSetup | null => parseAiSetup(readJson(stores.session, AI_SETUP_KEY));

export const writeAiSetup = (stores: Stores, setup: AiSetup): void => {
  writeJson(stores.session, AI_SETUP_KEY, setup);
};
