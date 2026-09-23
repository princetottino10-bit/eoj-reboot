// Rooms: creation / joining, seat tokens, live connections, rematches and the
// idle sweep. Players are identified by their seat token ONLY - knowing a room
// code lets you look and join a free seat, never act for someone else.
// Everything lives in memory; a server restart drops every room.
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { applyCardOverrides, cardChangeCount, cloneCardOverrides, overridesBetween, parseCardOverrides } from "../src/card-overrides.ts";
import type { CardOverrides } from "../src/card-overrides.ts";
import { applyConfigPatch, configChanges, diffPatch } from "../src/config-schema.ts";
import type { ConfigPatch } from "../src/config-schema.ts";
import type { FlowOptions } from "../src/flow.ts";
import { cloneSettings, normalizeSettings, settingsConfig } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import { opponent } from "../src/state.ts";
import type { PlayerId } from "../src/types.ts";
import { createMatch, matchOver, matchSubmit, packFor, saveRecord } from "./match.ts";
import type { Match, MatchSettings } from "./match.ts";
import type {
  ClientInput,
  CreateRoomRequest,
  JoinRequest,
  ProposalView,
  Role,
  RoomView,
  SeatPref,
  StateMessage,
} from "./protocol.ts";
import { gameView, logView } from "./view.ts";

/** No 0/O, 1/I/L. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
export const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;
export const IDLE_MS = 2 * 60 * 60 * 1000;
/**
 * A room whose match never started (nobody ever took the second seat) is a tab
 * that was opened and closed: it goes after ten minutes with no connection, so
 * it stops holding one of the six rooms this address may have alive.
 */
export const EMPTY_ROOM_MS = 10 * 60 * 1000;
export const MAX_ROOMS = 100;
/** Rooms one client IP may have alive at once (they go when the idle sweep removes them). */
export const MAX_ROOMS_PER_IP = 6;
export const MAX_SPECTATORS = 8;
export const RATE_WINDOW_MS = 60 * 1000;
export const CREATE_PER_WINDOW = 5;
/** Per IP per minute: static files (a page load is ~50 modules), API calls, stream opens, token-less room lookups. */
export const STATIC_PER_WINDOW = 900;
export const API_PER_WINDOW = 600;
export const STREAM_OPENS_PER_WINDOW = 60;
export const PEEK_PER_WINDOW = 60;
/** Live event streams: per seat / spectator token (a few tabs), and in total (under the host's connection limit). */
export const MAX_STREAMS_PER_MEMBER = 4;
export const MAX_STREAMS_TOTAL = 240;
/** Live event streams from one client IP, so one address cannot hold every slot. */
export const MAX_STREAMS_PER_IP = 24;
export const JOIN_PER_WINDOW = 30;

export type Member = { token: string; name: string; connections: number };

export type RoomSettings = MatchSettings & { seatPref: SeatPref };

export type Cursor = { nextSeq: number; matchNo: number };

export type Client = {
  id: number;
  token: string;
  ip: string;
  cursor: Cursor | null;
  send: (msg: StateMessage) => void;
  /** Ends the underlying transport (the SSE response). Set by the HTTP layer. */
  end: () => void;
};

/** The answer to the last proposal, kept until the next accepted input. `by` is the proposer's seat. */
export type LastAnswer = { id: number; scope: "now" | "next"; by: PlayerId; accepted: boolean; at: number };

/**
 * A pending change proposed by the room owner. `by` is the owner's seat at
 * proposal time, `at` when it was made and `replaced` whether it took the
 * place of a proposal that was still waiting for an answer.
 */
export type Proposal =
  | { id: number; scope: "now"; by: PlayerId; at: number; replaced: boolean; matchNo: number; patch: ConfigPatch; cards: CardOverrides }
  | { id: number; scope: "next"; by: PlayerId; at: number; replaced: boolean; settings: GameSettings };

export type Room = {
  code: string;
  /** Settings the next match starts with. */
  settings: RoomSettings;
  /** Token of the player who created the room; seats swap on rematch, the owner does not. */
  ownerToken: string;
  proposal: Proposal | null;
  proposalSeq: number;
  lastAnswer: LastAnswer | null;
  createdAt: number;
  /** Client IP that created the room (never sent to anyone; for MAX_ROOMS_PER_IP). */
  creatorIp: string;
  seats: [Member | null, Member | null];
  spectators: Member[];
  match: Match | null;
  matchCount: number;
  rematch: [boolean, boolean];
  clients: Set<Client>;
  /** When the room last had no live connection; null while someone is connected. */
  idleSince: number | null;
};

export type LobbyOptions = {
  recordDir: string;
  now?: () => number;
  maxRooms?: number;
  idleMs?: number;
  /** Match seed source. Default: node:crypto. The game itself stays mulberry32. */
  seed?: () => number;
  coin?: () => PlayerId;
  /** Test hook passed to every new match's flow. */
  flowOptions?: FlowOptions;
  /**
   * One line of operational log per room created / seat joined / match
   * finished. Default: dropped, so tests and the simulators stay quiet; the
   * server CLI points it at stdout.
   */
  log?: (line: string) => void;
};

export type Lobby = {
  opts: Required<Omit<LobbyOptions, "flowOptions">> & { flowOptions: FlowOptions };
  rooms: Map<string, Room>;
  hits: Map<string, number[]>;
  nextClientId: number;
};

export type Membership = { room: Room; member: Member; role: Role; seat: PlayerId | null };

export type Outcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const no = <T>(status: number, error: string): Outcome<T> => ({ ok: false, status, error });

export const newCode = (): string => {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
};

export const newToken = (): string => randomBytes(32).toString("base64url");

export const createLobby = (opts: LobbyOptions): Lobby => ({
  opts: {
    recordDir: opts.recordDir,
    now: opts.now ?? (() => Date.now()),
    maxRooms: opts.maxRooms ?? MAX_ROOMS,
    idleMs: opts.idleMs ?? IDLE_MS,
    seed: opts.seed ?? (() => randomInt(1, 2 ** 31)),
    coin: opts.coin ?? (() => randomInt(2) as PlayerId),
    flowOptions: opts.flowOptions ?? {},
    log: opts.log ?? (() => {}),
  },
  rooms: new Map(),
  hits: new Map(),
  nextClientId: 1,
});

/** Sliding-window rate limit. Returns false when `key` is over `limit`. */
export const allowHit = (lobby: Lobby, key: string, limit: number): boolean => {
  const now = lobby.opts.now();
  const recent = (lobby.hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= limit) {
    lobby.hits.set(key, recent);
    return false;
  }
  recent.push(now);
  lobby.hits.set(key, recent);
  return true;
};

// ------------------------------------------------------------------ rooms

const roomsCreatedBy = (lobby: Lobby, ip: string): number => {
  let n = 0;
  for (const room of lobby.rooms.values()) if (room.creatorIp === ip) n += 1;
  return n;
};

const defaultName = (seatIndex: number): string => `プレイヤー${seatIndex + 1}`;

export const createRoom = (
  lobby: Lobby,
  req: CreateRoomRequest,
  ip: string,
): Outcome<{ code: string; token: string; seat: PlayerId }> => {
  if (!allowHit(lobby, `create:${ip}`, CREATE_PER_WINDOW)) {
    return no(429, "部屋の作成が多すぎます。1分ほど待ってください");
  }
  if (roomsCreatedBy(lobby, ip) >= MAX_ROOMS_PER_IP) {
    return no(
      429,
      `この接続元から作った部屋が多すぎます(同時に${MAX_ROOMS_PER_IP}部屋まで)。使わない部屋は対戦室の「部屋を閉じる」で閉じてください(誰も接続していない状態が、対戦の始まっていない部屋は${EMPTY_ROOM_MS / 60000}分、始まった部屋は${IDLE_MS / 3600000}時間続くと自動で消えます)`,
    );
  }
  if (lobby.rooms.size >= lobby.opts.maxRooms) return no(503, "部屋数が上限に達しています");
  let code = newCode();
  for (let i = 0; lobby.rooms.has(code); i++) {
    if (i > 20) return no(503, "部屋コードを発行できませんでした");
    code = newCode();
  }
  const seat: PlayerId =
    req.seat === "first" ? 0 : req.seat === "second" ? 1 : lobby.opts.coin();
  const member: Member = { token: newToken(), name: req.name || defaultName(0), connections: 0 };
  const seats: [Member | null, Member | null] = [null, null];
  seats[seat] = member;
  const room: Room = {
    code,
    settings: { ...cloneSettings(req.settings), seatPref: req.seat },
    ownerToken: member.token,
    proposal: null,
    proposalSeq: 0,
    lastAnswer: null,
    createdAt: lobby.opts.now(),
    creatorIp: ip,
    seats,
    spectators: [],
    match: null,
    matchCount: 0,
    rematch: [false, false],
    clients: new Set(),
    idleSince: lobby.opts.now(),
  };
  lobby.rooms.set(code, room);
  lobby.opts.log(`room ${code} created seat=${seat} rule=${room.settings.rule} pack=${room.settings.pack} rooms=${lobby.rooms.size}`);
  return { ok: true, value: { code, token: member.token, seat } };
};

export const normalizeCode = (raw: string): string | null => {
  const code = raw.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
};

export const findRoom = (lobby: Lobby, rawCode: string): Room | null => {
  const code = normalizeCode(rawCode);
  return code === null ? null : (lobby.rooms.get(code) ?? null);
};

const startMatch = (lobby: Lobby, room: Room): void => {
  const [a, b] = room.seats;
  if (a === null || b === null) return;
  room.matchCount += 1;
  room.rematch = [false, false];
  room.proposal = null;
  room.match = createMatch(
    room.settings,
    room.matchCount,
    lobby.opts.seed(),
    [a.name, b.name],
    new Date(lobby.opts.now()),
    lobby.opts.flowOptions,
  );
};

export const joinRoom = (
  lobby: Lobby,
  rawCode: string,
  req: JoinRequest,
  ip: string,
): Outcome<{ token: string; role: Role; seat: PlayerId | null }> => {
  if (!allowHit(lobby, `join:${ip}`, JOIN_PER_WINDOW)) return no(429, "参加の試行が多すぎます");
  const room = findRoom(lobby, rawCode);
  if (room === null) return no(404, "部屋が見つかりません");
  const free = room.seats.findIndex((s) => s === null);
  if (!req.spectate && free !== -1) {
    const seat = free as PlayerId;
    // the creator is プレイヤー1 by default, whoever joins second プレイヤー2
    const fallback = defaultName(room.seats[opponent(seat)] === null ? 0 : 1);
    const member: Member = { token: newToken(), name: req.name || fallback, connections: 0 };
    room.seats[seat] = member;
    if (room.match === null) startMatch(lobby, room);
    lobby.opts.log(`room ${room.code} seat ${seat} joined match=${room.match === null ? "none" : room.match.no}`);
    broadcast(room);
    return { ok: true, value: { token: member.token, role: "player", seat } };
  }
  if (room.spectators.length >= MAX_SPECTATORS) {
    // free the slot of a spectator who is no longer connected
    const idle = room.spectators.findIndex((m) => m.connections === 0);
    if (idle === -1) return no(409, "観戦者の上限に達しています");
    room.spectators = room.spectators.filter((_, i) => i !== idle);
  }
  const member: Member = { token: newToken(), name: req.name || "観戦者", connections: 0 };
  room.spectators.push(member);
  lobby.opts.log(`room ${room.code} spectator joined spectators=${room.spectators.length}`);
  broadcast(room);
  return { ok: true, value: { token: member.token, role: "spectator", seat: null } };
};

const sameToken = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export const authenticate = (lobby: Lobby, rawCode: string, token: string): Membership | null => {
  const room = findRoom(lobby, rawCode);
  if (room === null || token.length === 0) return null;
  for (const seat of [0, 1] as PlayerId[]) {
    const m = room.seats[seat];
    if (m !== null && sameToken(m.token, token)) return { room, member: m, role: "player", seat };
  }
  const spec = room.spectators.find((m) => sameToken(m.token, token));
  return spec === undefined ? null : { room, member: spec, role: "spectator", seat: null };
};

// ------------------------------------------------------------------- views

export const roomView = (room: Room): RoomView => {
  const seatView = (m: Member | null) => ({
    taken: m !== null,
    name: m === null ? "" : m.name,
    connected: m !== null && m.connections > 0,
  });
  const status = room.match === null ? "waiting" : matchOver(room.match) ? "over" : "playing";
  const settings = cloneSettings(room.settings);
  return {
    code: room.code,
    rule: settings.rule,
    pack: settings.pack,
    effects: settingsConfig(settings).effects,
    seatPref: room.settings.seatPref,
    status,
    seats: [seatView(room.seats[0]), seatView(room.seats[1])],
    spectators: room.spectators.length,
    rematch: [room.rematch[0], room.rematch[1]],
    matchNo: room.match === null ? 0 : room.match.no,
    owner: ownerSeat(room),
    settings,
    proposal: proposalView(room.proposal),
    lastAnswer: room.lastAnswer === null ? null : { ...room.lastAnswer },
  };
};

export const ownerSeat = (room: Room): PlayerId | null => {
  for (const seat of [0, 1] as PlayerId[]) {
    const m = room.seats[seat];
    if (m !== null && m.token === room.ownerToken) return seat;
  }
  return null;
};

const proposalView = (p: Proposal | null): ProposalView | null => {
  if (p === null) return null;
  const head = { id: p.id, by: p.by, at: p.at, replaced: p.replaced };
  if (p.scope === "now") return { ...head, scope: "now", patch: copyPatch(p.patch), cards: cloneCardOverrides(p.cards) };
  return { ...head, scope: "next", settings: cloneSettings(p.settings) };
};

/** Builds a state message and advances `cursor` (null = full log). */
export const stateMessage = (room: Room, seat: PlayerId | null, role: Role, cursor: Cursor | null): StateMessage => {
  const m = room.match;
  if (m === null) {
    return { room: roomView(room), you: { role, seat }, game: null, log: [], logReset: cursor === null };
  }
  const reset = cursor === null || cursor.matchNo !== m.no;
  const from = reset || cursor === null ? 0 : cursor.nextSeq;
  const msg: StateMessage = {
    room: roomView(room),
    you: { role, seat },
    game: gameView({ flow: m.flow, matchNo: m.no, rule: m.settings.rule, pack: m.settings.pack, printed: packFor(m.settings.pack) }, seat),
    log: logView(m.flow.log, seat, from),
    logReset: reset,
  };
  if (cursor !== null) {
    cursor.nextSeq = m.flow.log.length;
    cursor.matchNo = m.no;
  }
  return msg;
};

/** Seat of a token at send time (seats swap on rematch). */
const locate = (room: Room, token: string): { role: Role; seat: PlayerId | null } | null => {
  for (const seat of [0, 1] as PlayerId[]) {
    const m = room.seats[seat];
    if (m !== null && m.token === token) return { role: "player", seat };
  }
  return room.spectators.some((m) => m.token === token) ? { role: "spectator", seat: null } : null;
};

export const broadcast = (room: Room): void => {
  for (const c of room.clients) {
    const who = locate(room, c.token);
    if (who === null) continue;
    if (c.cursor === null) c.cursor = { nextSeq: 0, matchNo: -1 };
    try {
      c.send(stateMessage(room, who.seat, who.role, c.cursor));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`online: send failed in ${room.code}: ${msg}\n`);
    }
  }
};

// ------------------------------------------------------------ connections

/** Event streams open across every room; with `ip`, only those from that client IP. */
export const streamCount = (lobby: Lobby, ip?: string): number => {
  let n = 0;
  for (const room of lobby.rooms.values()) {
    if (ip === undefined) n += room.clients.size;
    else for (const c of room.clients) if (c.ip === ip) n += 1;
  }
  return n;
};

export const attachClient = (lobby: Lobby, ms: Membership, send: Client["send"], ip: string, end: Client["end"] = () => {}): Client => {
  const client: Client = { id: lobby.nextClientId, token: ms.member.token, ip, cursor: null, send, end };
  lobby.nextClientId += 1;
  ms.member.connections += 1;
  ms.room.clients.add(client);
  ms.room.idleSince = null;
  broadcast(ms.room); // first message to the new client has logReset: true
  return client;
};

export const detachClient = (lobby: Lobby, room: Room, client: Client): void => {
  if (!room.clients.delete(client)) return;
  const all = [room.seats[0], room.seats[1], ...room.spectators];
  const m = all.find((x) => x !== null && x.token === client.token);
  if (m !== undefined && m !== null) m.connections = Math.max(0, m.connections - 1);
  if (room.clients.size === 0) room.idleSince = lobby.opts.now();
  broadcast(room);
};

/**
 * A room that is about to disappear while a match was running leaves an
 * unfinished record, so an abandoned game is still readable and replayable
 * instead of vanishing with the room. Nothing to save when no input was ever
 * made, and a finished match has saved itself already (`recordPath`).
 */
const saveUnfinished = (lobby: Lobby, room: Room): void => {
  const m = room.match;
  if (m === null || m.recordPath !== null || m.flow.inputs.length === 0) return;
  if (matchOver(m)) {
    saveRecord(m, room.code, lobby.opts.recordDir);
    return;
  }
  saveRecord(m, room.code, lobby.opts.recordDir, true);
  lobby.opts.log(`room ${room.code} match ${m.no} unfinished inputs=${m.flow.inputs.length} round=${m.flow.state.round}`);
};

/**
 * Deletes rooms nobody has been connected to for idleMs, and rooms whose match
 * never started after the much shorter EMPTY_ROOM_MS (an opened-and-closed tab
 * must not hold one of the six rooms an address may have). Returns their codes.
 */
export const sweep = (lobby: Lobby): string[] => {
  const now = lobby.opts.now();
  const gone: string[] = [];
  for (const [code, room] of lobby.rooms) {
    if (room.clients.size !== 0 || room.idleSince === null) continue;
    const idle = now - room.idleSince;
    if (idle < (room.matchCount === 0 ? EMPTY_ROOM_MS : lobby.opts.idleMs)) continue;
    saveUnfinished(lobby, room);
    lobby.rooms.delete(code);
    gone.push(code);
  }
  for (const [key, times] of lobby.hits) {
    if (times.every((t) => now - t >= RATE_WINDOW_MS)) lobby.hits.delete(key);
  }
  return gone;
};

/**
 * A seated player closes their room: it is deleted at once (freeing one of the
 * six rooms their address may have) and every open stream is ended, so the
 * other seat's page reconnects, is told the room is gone and offers the lobby.
 * Spectators may not close a room they only watch.
 */
export const closeRoom = (lobby: Lobby, ms: Membership): Outcome<{ code: string }> => {
  if (ms.role !== "player" || ms.seat === null) return no(403, "部屋を閉じられるのは席に着いている人だけです");
  const { room } = ms;
  if (!lobby.rooms.delete(room.code)) return no(404, "部屋が見つかりません");
  saveUnfinished(lobby, room);
  lobby.opts.log(`room ${room.code} closed by seat ${ms.seat} matches=${room.matchCount} streams=${room.clients.size}`);
  for (const c of [...room.clients]) {
    room.clients.delete(c);
    try {
      c.end();
    } catch (err) {
      process.stderr.write(`online: could not end a stream of ${room.code}: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
  return { ok: true, value: { code: room.code } };
};

// ------------------------------------------------------------------ input

const copyPatch = (patch: ConfigPatch): ConfigPatch => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) out[k] = Array.isArray(v) ? v.slice() : v;
  return out as ConfigPatch;
};

/**
 * Both seats voted for a rematch: swap first / second player and start. A
 * proposal still waiting for its answer holds the start and the votes stay;
 * answering or withdrawing it starts the match.
 */
const startRematchIfReady = (lobby: Lobby, room: Room): void => {
  if (!room.rematch[0] || !room.rematch[1] || room.proposal !== null) return;
  room.seats = [room.seats[1], room.seats[0]];
  if (room.lastAnswer !== null) room.lastAnswer = { ...room.lastAnswer, by: opponent(room.lastAnswer.by) };
  startMatch(lobby, room);
};

const rematch = (lobby: Lobby, room: Room, seat: PlayerId): Outcome<null> => {
  const m = room.match;
  if (m === null || !matchOver(m)) return no(409, "試合が終わってから選べます");
  room.rematch[seat] = true;
  startRematchIfReady(lobby, room);
  return { ok: true, value: null };
};

/**
 * The room owner proposes a change.
 *   now:  rule variables and card edits for the running match; validated
 *         (mid-match rules, cards against the cards in play) and checked to
 *         change something, applied only when the other seat agrees
 *   next: full settings for the next match, only between matches; resets the
 *         rematch votes so nobody starts a match on settings they have not seen
 *
 * A proposal still waiting for its answer is never replaced by accident: the
 * new one must name it in `replaces` (the settings page asks for that), so the
 * other seat is never left answering something that quietly changed.
 */
const propose = (lobby: Lobby, room: Room, seat: PlayerId, input: Extract<ClientInput, { type: "propose" }>): Outcome<null> => {
  if (room.ownerToken !== room.seats[seat]?.token) return no(403, "設定の変更を提案できるのは部屋を作った人だけです");
  const waiting = room.proposal;
  if (waiting !== null && input.replaces !== waiting.id) {
    return no(409, "回答待ちの提案があります。取り下げるか、その提案を置き換えることを選んでください");
  }
  if (waiting === null && input.replaces !== undefined) {
    return no(409, "置き換えようとした提案は、もう回答されたか取り下げられています。部屋の画面で確かめてください");
  }
  const m = room.match;
  const id = room.proposalSeq + 1;
  const head = { id, by: seat, at: lobby.opts.now(), replaced: waiting !== null };
  if (input.scope === "now") {
    if (m === null || matchOver(m)) return no(409, "試合中だけ提案できます(試合の間は「次の試合の設定」を提案してください)");
    const next = applyConfigPatch(m.flow.ctx.cfg, input.patch);
    const effective = diffPatch(m.flow.ctx.cfg, next);
    const cards = parseCardOverrides(input.cards, m.flow.ctx.pack);
    if (!cards.ok) return no(422, cards.error);
    const edits = overridesBetween(m.flow.ctx.pack, applyCardOverrides(m.flow.ctx.pack, cards.value));
    if (configChanges(m.flow.ctx.cfg, next).length === 0 && cardChangeCount(edits) === 0) return no(422, "今のルールとカードから変わる項目がありません");
    room.proposal = { ...head, scope: "now", matchNo: m.no, patch: effective, cards: edits };
    room.proposalSeq = id;
    return { ok: true, value: null };
  }
  if (m !== null && !matchOver(m)) return no(409, "次の試合の設定は、試合が終わってから提案できます");
  const cards = parseCardOverrides(input.settings.cards, packFor(input.settings.pack));
  if (!cards.ok) return no(422, cards.error);
  const settings = normalizeSettings({ ...input.settings, cards: cards.value }, packFor(input.settings.pack));
  room.proposal = { ...head, scope: "next", settings };
  room.proposalSeq = id;
  room.rematch = [false, false];
  return { ok: true, value: null };
};

/** The other seat agrees to (or turns down) the pending proposal. */
const answer = (lobby: Lobby, room: Room, seat: PlayerId, id: number, accept: boolean): Outcome<null> => {
  const p = room.proposal;
  if (p !== null && p.id !== id) return no(409, "提案が差し替えられました。新しい内容を確かめてから答えてください");
  if (p === null) return no(409, "その提案はもうありません");
  if (p.by === seat) return no(403, "自分の提案には同意できません。相手の同意を待ってください");
  room.proposal = null;
  const answered: LastAnswer = { id: p.id, scope: p.scope, by: p.by, accepted: accept, at: lobby.opts.now() };
  if (p.scope === "next") {
    if (accept) room.settings = { ...cloneSettings(p.settings), seatPref: room.settings.seatPref };
    room.lastAnswer = answered;
    // proposing clears the rematch votes, so a vote still here was cast with this proposal on screen
    startRematchIfReady(lobby, room);
    return { ok: true, value: null };
  }
  if (!accept) {
    room.lastAnswer = answered;
    return { ok: true, value: null };
  }
  const m = room.match;
  if (m === null || m.no !== p.matchNo || matchOver(m)) return no(409, "その試合はもう終わっています");
  const now = new Date(lobby.opts.now());
  // nothing else can change the rules or cards between proposal and answer, so both still apply
  if (Object.keys(p.patch).length > 0) {
    const r = matchSubmit(m, p.by, { type: "config", patch: p.patch }, now);
    if (!r.ok) return no(r.code === "illegal" ? 422 : 409, r.error);
  }
  if (cardChangeCount(p.cards) > 0) {
    const r = matchSubmit(m, p.by, { type: "cards", edits: p.cards }, now);
    if (!r.ok) return no(r.code === "illegal" ? 422 : 409, r.error);
  }
  room.lastAnswer = answered;
  return { ok: true, value: null };
};

const withdraw = (lobby: Lobby, room: Room, seat: PlayerId, id: number): Outcome<null> => {
  const p = room.proposal;
  if (p === null || p.id !== id) return no(409, "その提案はもうありません");
  if (p.by !== seat) return no(403, "取り下げられるのは提案した人だけです");
  room.proposal = null;
  startRematchIfReady(lobby, room);
  return { ok: true, value: null };
};

export const roomInput = (lobby: Lobby, ms: Membership, input: ClientInput): Outcome<null> => {
  const { room } = ms;
  if (ms.role !== "player" || ms.seat === null) return no(403, "観戦者は操作できません");
  if (room.clients.size === 0) room.idleSince = lobby.opts.now();
  const proposalBefore = room.proposal;
  const answerBefore = room.lastAnswer;
  let out: Outcome<null>;
  if (input.type === "rematch") out = rematch(lobby, room, ms.seat);
  else if (input.type === "propose") out = propose(lobby, room, ms.seat, input);
  else if (input.type === "answer") out = answer(lobby, room, ms.seat, input.id, input.accept);
  else if (input.type === "withdraw") out = withdraw(lobby, room, ms.seat, input.id);
  else {
    const m = room.match;
    if (m === null) return no(409, "対戦相手を待っています");
    const r = matchSubmit(m, ms.seat, input, new Date(lobby.opts.now()));
    if (!r.ok) return no(r.code === "illegal" ? 422 : r.code === "forbidden" ? 403 : 409, r.error);
    out = { ok: true, value: null };
  }
  // the answer notice lasts until the next accepted input (a new proposal included)
  if (out.ok && room.lastAnswer === answerBefore) room.lastAnswer = null;
  const m = room.match;
  if (m !== null && matchOver(m)) {
    if (room.proposal !== null && room.proposal.scope === "now") room.proposal = null;
    const fresh = m.recordPath === null;
    saveRecord(m, room.code, lobby.opts.recordDir);
    if (fresh) {
      const s = m.flow.state;
      lobby.opts.log(
        `room ${room.code} match ${m.no} finished rounds=${s.round} winner=${s.winner ?? "none"} winType=${s.winType ?? (m.flow.resignedBy === null ? "none" : "resign")} record=${m.recordPath === null ? "FAILED" : "ok"}`,
      );
    }
  }
  if (out.ok || room.proposal !== proposalBefore) broadcast(room);
  return out;
};
