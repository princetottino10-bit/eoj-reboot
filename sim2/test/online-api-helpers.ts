// API-level helpers for the online tests that drive handleApi without sockets.
import assert from "node:assert/strict";
import { join } from "node:path";
import { bestSingleAction } from "../src/ai/greedy.ts";
import { DEFAULT_WEIGHTS } from "../src/ai/eval.ts";
import type { Flow } from "../src/flow.ts";
import { defaultDiscardPolicy, defaultMulliganPolicy } from "../src/turn.ts";
import type { PlayerId } from "../src/types.ts";
import type { ClientInput, StateMessage } from "../online/protocol.ts";
import type { Room } from "../online/rooms.ts";
import { createOnlineApp, handleApi } from "../online/server.ts";
import type { ApiResponse, OnlineApp } from "../online/server.ts";

export type Body = Record<string, unknown>;

export const testRecordDir = (tag: string): string =>
  join(import.meta.dirname, "..", "out", `online-test-${tag}-${process.pid}`);

export const call = (
  app: OnlineApp,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  ip = "10.0.0.1",
): ApiResponse & { json: Body } => {
  const headers: Record<string, string | undefined> = {};
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  if (method === "POST") headers["content-type"] = "application/json";
  const r = handleApi(app, { method, path, headers, body: body === undefined ? null : JSON.stringify(body), ip });
  assert.ok(r !== null, `${path} is an API route`);
  return { ...r, json: r.body as Body };
};

export const newApp = (recordDir: string, over: Parameters<typeof createOnlineApp>[0] = {}): OnlineApp =>
  createOnlineApp({ recordDir, seed: () => 20260913, ...over });

export type Seated = { app: OnlineApp; code: string; tokens: [string, string] };

/** Creates a room (creator = first player, the owner) and seats a second player. */
export const seatTwo = (app: OnlineApp, body: Body = {}): Seated => {
  const c = call(app, "POST", "/api/rooms", { rule: "r0913", pack: "shuten-kyuryu", seat: "first", effects: true, name: "A", ...body });
  assert.equal(c.status, 200, JSON.stringify(c.json));
  const code = c.json.code as string;
  const j = call(app, "POST", `/api/rooms/${code}/join`, { name: "B" });
  assert.equal(j.status, 200);
  return { app, code, tokens: [c.json.token as string, j.json.token as string] };
};

export const view = (s: Seated, token: string): StateMessage => {
  const r = call(s.app, "GET", `/api/rooms/${s.code}/view`, undefined, token);
  assert.equal(r.status, 200);
  return r.json as unknown as StateMessage;
};

export const send = (s: Seated, token: string, body: ClientInput | Body): ApiResponse & { json: Body } =>
  call(s.app, "POST", `/api/rooms/${s.code}/input`, body, token);

export const roomOf = (s: Seated): Room => {
  const r = s.app.lobby.rooms.get(s.code);
  assert.ok(r !== undefined);
  return r;
};

export const flowOf = (s: Seated): Flow => {
  const m = roomOf(s).match;
  assert.ok(m !== null);
  return m.flow;
};

export const bothKeep = (s: Seated): void => {
  assert.equal(send(s, s.tokens[0], { type: "mulligan", indices: [] }).status, 200);
  assert.equal(send(s, s.tokens[1], { type: "mulligan", indices: [] }).status, 200);
};

/** One greedy input for whoever owes one, computed on the server's flow. */
export const nextAiInput = (f: Flow, perTurn: { key: string; n: number }): [PlayerId, ClientInput] | null => {
  const ph = f.phase;
  if (ph.kind === "over") return null;
  if (ph.kind === "mulligan") {
    const seat: PlayerId = ph.submitted[0] ? 1 : 0;
    return [seat, { type: "mulligan", indices: defaultMulliganPolicy(f.ctx, f.state, seat) }];
  }
  if (ph.kind === "tansu") return [ph.player, { type: "tansu", answers: ph.uids.map((uid) => ({ uid, choice: "mana" })) }];
  if (ph.kind === "discard") return [ph.player, { type: "discard", indices: defaultDiscardPolicy(f.ctx, f.state, ph.player) }];
  if (ph.kind === "counterOrder") return [ph.player, { type: "counterOrder", order: ph.uids.slice() }];
  const key = `${f.state.round}:${ph.player}`;
  if (perTurn.key !== key) {
    perTurn.key = key;
    perTurn.n = 0;
  }
  const pick = perTurn.n < f.ctx.cfg.maxActionsPerTurn ? bestSingleAction(f.ctx, f.state, ph.player, DEFAULT_WEIGHTS) : null;
  perTurn.n += 1;
  return [ph.player, { type: "action", action: pick === null ? { kind: "pass" } : pick.action }];
};
