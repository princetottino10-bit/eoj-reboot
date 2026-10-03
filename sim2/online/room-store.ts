// Rooms on disk, so a restart (every redeploy) does not end the games being
// played. One JSON file per room under <record dir>/rooms/: the seat tokens,
// the settings and, for the match, only what a replay needs (settings, seed and
// inputs - the same thing a game record keeps). On boot every file is read
// back and each match is replayed to the position it was left in; the pages
// reconnect with the tokens they already hold and carry on.
//
// Off unless LobbyOptions.roomDir is set (the server CLI sets it), so tests and
// the simulators never touch the disk.
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RecordedInput } from "../src/flow.ts";
import { replayFlow } from "../src/flow.ts";
import { cloneSettings, settingsPack } from "../src/settings.ts";
import { makeCtx } from "../src/state.ts";
import type { PlayerId } from "../src/types.ts";
import { matchConfig, packFor } from "./match.ts";
import type { Match } from "./match.ts";
import type { LastAnswer, Lobby, Member, Proposal, Room, RoomSettings } from "./rooms.ts";

export const ROOM_FILE_FORMAT = "sim2-online-room";

type SavedMember = { token: string; name: string };

type SavedMatch = {
  no: number;
  settings: Match["settings"];
  seed: number;
  names: [string, string];
  startedAt: string;
  endedAt: string | null;
  recordPath: string | null;
  inputs: RecordedInput[];
};

export type SavedRoom = {
  format: typeof ROOM_FILE_FORMAT;
  version: 1;
  savedAt: string;
  code: string;
  settings: RoomSettings;
  ownerToken: string;
  proposal: Proposal | null;
  proposalSeq: number;
  lastAnswer: LastAnswer | null;
  createdAt: number;
  creatorIp: string;
  seats: [SavedMember | null, SavedMember | null];
  spectators: SavedMember[];
  matchCount: number;
  rematch: [boolean, boolean];
  match: SavedMatch | null;
};

const member = (m: Member): SavedMember => ({ token: m.token, name: m.name });

export const snapshotRoom = (room: Room, now: Date): SavedRoom => {
  const m = room.match;
  return {
    format: ROOM_FILE_FORMAT,
    version: 1,
    savedAt: now.toISOString(),
    code: room.code,
    settings: { ...cloneSettings(room.settings), seatPref: room.settings.seatPref },
    ownerToken: room.ownerToken,
    proposal: room.proposal,
    proposalSeq: room.proposalSeq,
    lastAnswer: room.lastAnswer,
    createdAt: room.createdAt,
    creatorIp: room.creatorIp,
    seats: [room.seats[0] === null ? null : member(room.seats[0]), room.seats[1] === null ? null : member(room.seats[1])],
    spectators: room.spectators.map(member),
    matchCount: room.matchCount,
    rematch: [room.rematch[0], room.rematch[1]],
    match:
      m === null
        ? null
        : {
            no: m.no,
            settings: m.settings,
            seed: m.flow.seed,
            names: [m.names[0], m.names[1]],
            startedAt: m.startedAt,
            endedAt: m.endedAt,
            recordPath: m.recordPath,
            inputs: m.flow.inputs,
          },
  };
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const readMember = (v: unknown): Member | null => {
  if (!isObj(v) || typeof v.token !== "string" || v.token.length === 0 || typeof v.name !== "string") return null;
  return { token: v.token, name: v.name, connections: 0 };
};

/** A saved room back in memory, its match replayed. Throws on a file that does not hold together. */
export const restoreRoom = (raw: unknown, lobby: Lobby): Room => {
  if (!isObj(raw) || raw.format !== ROOM_FILE_FORMAT || raw.version !== 1) throw new Error("not a saved room");
  const s = raw as unknown as SavedRoom;
  if (typeof s.code !== "string" || typeof s.ownerToken !== "string" || !Array.isArray(s.seats) || s.seats.length !== 2) {
    throw new Error("missing fields");
  }
  const seats: [Member | null, Member | null] = [
    s.seats[0] === null ? null : readMember(s.seats[0]),
    s.seats[1] === null ? null : readMember(s.seats[1]),
  ];
  if ((s.seats[0] !== null && seats[0] === null) || (s.seats[1] !== null && seats[1] === null)) throw new Error("bad seat");
  const spectators = (Array.isArray(s.spectators) ? s.spectators : []).map(readMember).filter((m): m is Member => m !== null);
  let match: Match | null = null;
  if (s.match !== null) {
    const sm = s.match;
    const own = cloneSettings(sm.settings);
    const ctx = makeCtx(matchConfig(own), settingsPack(own, packFor(own.pack)));
    match = {
      no: sm.no,
      settings: own,
      flow: replayFlow(ctx, sm.seed, sm.inputs, lobby.opts.flowOptions),
      names: [sm.names[0], sm.names[1]],
      startedAt: sm.startedAt,
      endedAt: sm.endedAt,
      recordPath: sm.recordPath,
    };
  }
  const now = lobby.opts.now();
  return {
    code: s.code,
    settings: { ...cloneSettings(s.settings), seatPref: s.settings.seatPref },
    ownerToken: s.ownerToken,
    proposal: s.proposal,
    proposalSeq: s.proposalSeq,
    lastAnswer: s.lastAnswer,
    createdAt: s.createdAt,
    creatorIp: s.creatorIp,
    seats,
    spectators,
    match,
    matchCount: s.matchCount,
    rematch: [s.rematch[0] === true, s.rematch[1] === true],
    clients: new Set(),
    // the idle clock starts over at boot: nobody could connect while the server was down
    idleSince: now,
  };
};

const fileOf = (dir: string, code: string): string => join(dir, `${code}.json`);

const report = (what: string, err: unknown): void => {
  process.stderr.write(`online: ${what}: ${err instanceof Error ? err.message : String(err)}\n`);
};

/** Writes the room's file (write to a temporary name, then rename, so a crash never leaves half a file). */
export const saveRoom = (lobby: Lobby, room: Room): void => {
  const dir = lobby.opts.roomDir;
  if (dir === null) return;
  const path = fileOf(dir, room.code);
  const tmp = `${path}.tmp`;
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(tmp, JSON.stringify(snapshotRoom(room, new Date(lobby.opts.now()))), "utf8");
    renameSync(tmp, path);
  } catch (err) {
    report(`could not save room ${room.code}`, err);
  }
};

export const forgetRoom = (lobby: Lobby, code: string): void => {
  const dir = lobby.opts.roomDir;
  if (dir === null) return;
  try {
    rmSync(fileOf(dir, code), { force: true });
  } catch (err) {
    report(`could not remove room file ${code}`, err);
  }
};

export const saveAllRooms = (lobby: Lobby): number => {
  for (const room of lobby.rooms.values()) saveRoom(lobby, room);
  return lobby.rooms.size;
};

/**
 * Reads every saved room back. A file that cannot be read or replayed is kept
 * under a `.bad` name (for a look later) and its room is skipped; the server
 * starts either way. Returns the codes restored.
 */
export const loadRooms = (lobby: Lobby): string[] => {
  const dir = lobby.opts.roomDir;
  if (dir === null) return [];
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => /^[A-Z0-9]{6}\.json$/.test(f));
  } catch {
    return [];
  }
  const restored: string[] = [];
  for (const f of files) {
    const path = join(dir, f);
    try {
      const room = restoreRoom(JSON.parse(readFileSync(path, "utf8")) as unknown, lobby);
      if (lobby.rooms.has(room.code) || `${room.code}.json` !== f) throw new Error("code does not match");
      lobby.rooms.set(room.code, room);
      restored.push(room.code);
    } catch (err) {
      report(`could not restore ${f}`, err);
      try {
        renameSync(path, `${path}.bad`);
      } catch (e) {
        report(`could not set aside ${f}`, e);
      }
    }
  }
  return restored;
};

/** For the log line: where each restored room's match stands. */
export const restoredSummary = (room: Room): string => {
  const m = room.match;
  if (m === null) return `${room.code} waiting`;
  const seat = (p: PlayerId): string => (room.seats[p] === null ? "-" : "x");
  return `${room.code} match=${m.no} inputs=${m.flow.inputs.length} round=${m.flow.state.round} seats=${seat(0)}${seat(1)}`;
};
