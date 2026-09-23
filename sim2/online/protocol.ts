// Messages between the browser and the online server, plus the strict parser
// for everything the browser sends. Pure: the browser imports the types
// (erased at serve time) and the server uses the parser.
import { parseCardOverrides } from "../src/card-overrides.ts";
import type { CardOverrides } from "../src/card-overrides.ts";
import type { CardPack } from "../src/cards.ts";
import type { UnitCommands } from "../src/commands.ts";
import type { AttackAction, CounterOrderOutcome } from "../src/counter-order.ts";
import { parseConfigPatch } from "../src/config-schema.ts";
import type { ConfigPatch } from "../src/config-schema.ts";
import type { FlowEvent, FlowInput } from "../src/flow.ts";
import { parseAction, parseFlowInput } from "../src/input-parse.ts";
import type { LegalEntry } from "../src/preview.ts";
import type { PlayablePack, RulePresetId } from "../src/presets.ts";
import { parseSettings } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import type {
  Config,
  GameEvent,
  PlayerId,
  Unit,
  WinType,
} from "../src/types.ts";

// ------------------------------------------------------------------ views

/** Everything about a player that both seats may see. */
export type PublicPlayer = {
  life: number;
  mana: number;
  chips: number;
  /** Control state (next_turn_end) / control reach (next_turn_start). */
  reach: boolean;
  handCount: number;
  deckCount: number;
  grave: string[];
  reshuffleCount: number;
  /** controlWinMode "points": 制圧点 so far (optional so older / local boards without it still type-check). */
  controlPoints?: number;
};

export type BoardView = {
  units: Unit[];
  players: [PublicPlayer, PublicPlayer];
  turnPlayer: PlayerId;
  round: number;
  ended: boolean;
  winner: PlayerId | null;
  winType: WinType | null;
  summonsThisTurn: number;
};

export type PhaseView =
  | { kind: "mulligan"; submitted: [boolean, boolean] }
  | { kind: "tansu"; player: PlayerId; uids: number[] }
  | { kind: "main"; player: PlayerId }
  /**
   * 案A: `attacker` declared `action` (public); `player` puts the counterers
   * (`uids`, engine order = the default) in order. `outcomes`: what each
   * candidate order leads to (public: every number in it is on the board).
   */
  | { kind: "counterOrder"; player: PlayerId; attacker: PlayerId; action: AttackAction; uids: number[]; outcomes: CounterOrderOutcome[] }
  | { kind: "discard"; player: PlayerId }
  | { kind: "over"; winner: PlayerId | null; winType: WinType | null; resignedBy: PlayerId | null };

export type LogItem = { seq: number; event: GameEvent | FlowEvent };

/** One seat's (or a spectator's) view of a match. Never holds the seed. */
export type GameView = {
  matchNo: number;
  /** null = spectator. */
  viewer: PlayerId | null;
  rule: RulePresetId;
  pack: string;
  /** The current rules (mid-match changes included). */
  config: Config;
  /** Card numbers changed for this match (public: both seats play with them). */
  cards: CardOverrides;
  board: BoardView;
  /** The viewer's own hand; null for spectators. */
  hand: string[] | null;
  phase: PhaseView;
  /** Only for the seat that is to act in the main phase. */
  legal: LegalEntry[] | null;
  /** Command menu of that seat's units (availability and reasons), same audience as `legal`. */
  commands: UnitCommands | null;
};

export type SeatPref = "first" | "second" | "random";
export type Role = "player" | "spectator";

export type SeatView = { taken: boolean; name: string; connected: boolean };

/**
 * A pending settings proposal from the room owner. `at` is when it was made
 * (server clock) and `replaced` marks one that took the place of a proposal
 * still waiting, so the other seat is told the contents changed.
 *   now:  rule variables for the running match (applied when the other seat agrees)
 *   next: full settings for the next match (between matches)
 */
export type ProposalView =
  | { id: number; scope: "now"; by: PlayerId; at: number; replaced: boolean; patch: ConfigPatch; cards: CardOverrides }
  | { id: number; scope: "next"; by: PlayerId; at: number; replaced: boolean; settings: GameSettings };

export type RoomView = {
  code: string;
  rule: RulePresetId;
  pack: string;
  effects: boolean;
  seatPref: SeatPref;
  status: "waiting" | "playing" | "over";
  seats: [SeatView, SeatView];
  spectators: number;
  /** Rematch votes, indexed by seat. */
  rematch: [boolean, boolean];
  matchNo: number;
  /** Seat of the player who created the room (the one who may propose changes). */
  owner: PlayerId | null;
  /** Settings the next match will start with. */
  settings: GameSettings;
  proposal: ProposalView | null;
  lastAnswer: AnswerView | null;
};

/**
 * How the other seat answered the last proposal. Sent until the next accepted
 * input (a new proposal included), so the proposer can be told.
 */
export type AnswerView = { id: number; scope: "now" | "next"; by: PlayerId; accepted: boolean; at: number };

export type YouView = { role: Role; seat: PlayerId | null };

/** Payload of every SSE "state" message and of GET /view. */
export type StateMessage = {
  room: RoomView;
  you: YouView;
  game: GameView | null;
  /** Log entries this connection has not received yet. */
  log: LogItem[];
  /** true = drop the log you have (first message, or a new match). */
  logReset: boolean;
};

/** Inputs a browser may send. A raw "config" flow input is server-internal. */
export type ClientInput =
  | Exclude<FlowInput, { type: "config" }>
  | { type: "rematch" }
  /**
   * cards: edits against the cards in play right now (each value replaces the current one).
   * `replaces`: the id of the pending proposal this one takes the place of — a proposal is never
   * replaced by accident, so the other seat never answers something that has quietly changed.
   */
  | { type: "propose"; scope: "now"; patch: ConfigPatch; cards: CardOverrides; replaces?: number }
  | { type: "propose"; scope: "next"; settings: GameSettings; replaces?: number }
  | { type: "answer"; id: number; accept: boolean }
  | { type: "withdraw"; id: number };

export type CreateRoomRequest = {
  settings: GameSettings;
  seat: SeatPref;
  name: string;
};

export type JoinRequest = { name: string; spectate: boolean };

// ----------------------------------------------------------------- parsing

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const bad = <T>(error: string): Parsed<T> => ({ ok: false, error });

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isInt = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

const MAX_UID = 1_000_000;

/** Rebuilds an Action from untrusted JSON (shared with the AI table's stored matches: src/input-parse.ts). */
export { parseAction };

export const parseClientInput = (v: unknown): Parsed<ClientInput> => {
  if (!isObj(v) || typeof v.type !== "string") return bad("type がありません");
  // action / mulligan / discard / tansu / resign; a raw "config" or "cards" flow input is server-internal
  const flow = parseFlowInput(v, { changes: false });
  if (flow !== null) {
    // an attacker never names the countering side's order: that is the other seat's counterOrder input
    if (flow.ok && flow.value.type === "action" && flow.value.action.kind === "attack" && flow.value.action.counterOrder !== undefined) {
      const action = { ...flow.value.action };
      delete action.counterOrder;
      return { ok: true, value: { type: "action", action } };
    }
    return flow as Parsed<ClientInput>;
  }
  switch (v.type) {
    case "rematch":
      return { ok: true, value: { type: "rematch" } };
    case "propose": {
      if (v.replaces !== undefined && !isInt(v.replaces, 1, MAX_UID)) return bad("replaces の形式が不正です");
      const replaces = v.replaces === undefined ? {} : { replaces: v.replaces };
      if (v.scope === "now") {
        if (v.settings !== undefined) return bad("開始時の設定は試合の途中では変更できません");
        const patch = parseConfigPatch(v.patch, { midGame: true });
        if (!patch.ok) return patch;
        // card ids and range relations are checked against the cards in play when the proposal is made
        const cards = parseCardOverrides(v.cards, null);
        if (!cards.ok) return cards;
        return { ok: true, value: { type: "propose", scope: "now", patch: patch.value, cards: cards.value, ...replaces } };
      }
      if (v.scope === "next") {
        // card ids are checked against the pack when the proposal is accepted into the room
        const settings = parseSettings(v.settings, null);
        return settings.ok ? { ok: true, value: { type: "propose", scope: "next", settings: settings.value, ...replaces } } : settings;
      }
      return bad("scope が不正です");
    }
    case "answer":
      if (!isInt(v.id, 1, MAX_UID) || typeof v.accept !== "boolean") return bad("answer の形式が不正です");
      return { ok: true, value: { type: "answer", id: v.id, accept: v.accept } };
    case "withdraw":
      if (!isInt(v.id, 1, MAX_UID)) return bad("withdraw の形式が不正です");
      return { ok: true, value: { type: "withdraw", id: v.id } };
    default:
      return bad("不明な type です");
  }
};

const MAX_NAME = 16;

/** Display names: trimmed, control, zero-width and text-direction characters removed, at most 16 chars. */
export const cleanName = (v: unknown): string => {
  if (typeof v !== "string") return "";
  // eslint-disable-next-line no-control-regex
  const plain = v.replace(/[\x00-\x1f\x7f]/g, "").replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, "");
  return [...plain.trim()].slice(0, MAX_NAME).join("");
};

/**
 * POST /api/rooms. `rule` / `pack` / `effects` are the original fields;
 * `config` (rule variables changed from the preset) and `cards` (card number
 * overrides) are optional. `effects` is applied first, `config` on top.
 */
export const parseCreateRoom = (
  v: unknown,
  isRule: (x: unknown) => x is RulePresetId,
  isPack: (x: unknown) => x is PlayablePack,
  packOf: (name: PlayablePack) => CardPack | null,
): Parsed<CreateRoomRequest> => {
  if (!isObj(v)) return bad("リクエストがオブジェクトではありません");
  if (!isRule(v.rule)) return bad("rule が不正です");
  if (typeof v.pack !== "string" || !isPack(v.pack)) return bad("pack が不正です");
  if (v.seat !== "first" && v.seat !== "second" && v.seat !== "random") return bad("seat が不正です");
  if (v.effects !== undefined && typeof v.effects !== "boolean") return bad("effects が不正です");
  if (v.name !== undefined && typeof v.name !== "string") return bad("name が不正です");
  if (v.config !== undefined && !isObj(v.config)) return bad("config が不正です");
  const config = { ...(v.effects === undefined ? {} : { effects: v.effects }), ...(isObj(v.config) ? v.config : {}) };
  const settings = parseSettings({ rule: v.rule, pack: v.pack, config, cards: v.cards }, packOf);
  if (!settings.ok) return settings;
  return { ok: true, value: { settings: settings.value, seat: v.seat, name: cleanName(v.name) } };
};

export const parseJoin = (v: unknown): Parsed<JoinRequest> => {
  if (!isObj(v)) return bad("リクエストがオブジェクトではありません");
  if (v.name !== undefined && typeof v.name !== "string") return bad("name が不正です");
  if (v.spectate !== undefined && typeof v.spectate !== "boolean") return bad("spectate が不正です");
  return { ok: true, value: { name: cleanName(v.name), spectate: v.spectate === true } };
};
