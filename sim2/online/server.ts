// Online match server: static files, the JSON API and Server-Sent Events.
// Zero dependencies (node:http). Static serving and type stripping reuse
// play/server.ts.
//
//   node --experimental-strip-types sim2/online/server.ts [--port 8788] [--host 127.0.0.1]
//        [--record-dir sim2/out/online] [--trust-proxy]
//
// API (JSON; POST bodies must be application/json and at most 16KB):
//   POST /api/rooms                  create -> { code, token, seat }
//                                    { rule, pack, seat, effects?, name?, config?, cards? }
//   GET  /api/rooms/:code            public room info (no tokens)
//   POST /api/rooms/:code/join       -> { token, role, seat }
//   GET  /api/rooms/:code/whoami     (Bearer token) -> { role, seat, connections }
//   GET  /api/rooms/:code/view       (Bearer token) -> StateMessage (full log)
//   GET  /api/rooms/:code/stream     (Bearer token) SSE "state" messages
//   POST /api/rooms/:code/input      (Bearer token) ClientInput: flow inputs, rematch,
//                                    propose (now | next) / answer / withdraw (settings changes)
//   POST /api/rooms/:code/close      (Bearer token, a seat) deletes the room
//   GET  /healthz                    { ok, rooms, streams, uptime } for the host's health check
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { isImagePath, serveFile, serveImage } from "../play/server.ts";
import type { Served, ServedBytes } from "../play/server.ts";
import { isPlayablePack, isRulePresetId } from "../src/presets.ts";
import { checkRecordDir, packFor } from "./match.ts";
import { parseClientInput, parseCreateRoom, parseJoin } from "./protocol.ts";
import {
  allowHit,
  API_PER_WINDOW,
  attachClient,
  authenticate,
  closeRoom,
  createLobby,
  createRoom,
  detachClient,
  findRoom,
  joinRoom,
  MAX_STREAMS_PER_IP,
  MAX_STREAMS_PER_MEMBER,
  MAX_STREAMS_TOTAL,
  normalizeCode,
  PEEK_PER_WINDOW,
  roomInput,
  roomView,
  STATIC_PER_WINDOW,
  stateMessage,
  STREAM_OPENS_PER_WINDOW,
  streamCount,
  sweep,
} from "./rooms.ts";
import type { Lobby, LobbyOptions, Outcome } from "./rooms.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_RECORD_DIR = join(HERE, "..", "out", "online");
export const MAX_BODY_BYTES = 16 * 1024;
export const DEFAULT_PORT = 8788;
export const DEFAULT_HOST = "127.0.0.1";
const SSE_PING_MS = 20_000;
export const SWEEP_MS = 5 * 60 * 1000;
/** Static assets (stripped modules, CSS, pack JSON) may sit in the browser cache this long. */
export const STATIC_MAX_AGE_S = 300;
/**
 * Card art (play/art/) may be cached for a day: it does not have to match the
 * modules of one deploy, and it is the bulk of what a page downloads.
 */
export const ART_MAX_AGE_S = 86400;
/** Smaller than this, gzip costs more than it saves. */
const GZIP_MIN_BYTES = 1024;

/** flyProxy: running on Fly.io (FLY_APP_NAME is set), where only Fly-Client-IP is trustworthy. */
export type OnlineApp = {
  lobby: Lobby;
  trustProxy: boolean;
  flyProxy: boolean;
  /** Open SSE responses, so a restart can say goodbye to every one of them. */
  streams: Set<ServerResponse>;
  startedAt: number;
  /** Set by shutdown(): new requests are turned away with 503 while the process winds down. */
  shuttingDown: boolean;
};

export const createOnlineApp = (
  opts: Partial<LobbyOptions> & { trustProxy?: boolean; flyProxy?: boolean } = {},
): OnlineApp => {
  const lobby = createLobby({ ...opts, recordDir: opts.recordDir ?? DEFAULT_RECORD_DIR });
  return {
    lobby,
    trustProxy: opts.trustProxy === true,
    flyProxy: opts.flyProxy ?? (typeof process.env.FLY_APP_NAME === "string" && process.env.FLY_APP_NAME.length > 0),
    streams: new Set(),
    startedAt: lobby.opts.now(),
    shuttingDown: false,
  };
};

// ---------------------------------------------------------------- API core

export type ApiRequest = {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  /** Raw body text; null when there is none. */
  body: string | null;
  bodyTooLarge?: boolean;
  ip: string;
};

export type ApiResponse = { status: number; body: unknown };

const json = (status: number, body: unknown): ApiResponse => ({ status, body });
const err = (status: number, error: string): ApiResponse => json(status, { ok: false, error });
const fromOutcome = <T>(o: Outcome<T>): ApiResponse =>
  o.ok ? json(200, { ok: true, ...(o.value ?? {}) }) : err(o.status, o.error);

const bearer = (headers: ApiRequest["headers"]): string => {
  const h = headers.authorization ?? "";
  const m = /^Bearer ([A-Za-z0-9_-]{16,128})$/.exec(h.trim());
  return m === null ? "" : m[1];
};

/** Parses a POST body: size, content type, JSON. */
const readJson = (req: ApiRequest): { ok: true; value: unknown } | { ok: false; res: ApiResponse } => {
  if (req.bodyTooLarge === true) return { ok: false, res: err(400, "リクエストが大きすぎます") };
  const type = (req.headers["content-type"] ?? "").toLowerCase();
  if (!type.startsWith("application/json")) {
    return { ok: false, res: err(400, "Content-Type は application/json にしてください") };
  }
  if (req.body === null || Buffer.byteLength(req.body) > MAX_BODY_BYTES) {
    return { ok: false, res: err(400, req.body === null ? "本文がありません" : "リクエストが大きすぎます") };
  }
  try {
    return { ok: true, value: JSON.parse(req.body) as unknown };
  } catch {
    return { ok: false, res: err(400, "JSON を解釈できません") };
  }
};

const ROOM_ROUTE = /^\/api\/rooms\/([^/]+)(?:\/(join|whoami|view|input|stream|close))?$/;

/** Liveness for the host's health check: cheap counters, no room codes, no names. */
export const healthBody = (app: OnlineApp): { ok: true; rooms: number; streams: number; uptime: number } => ({
  ok: true,
  rooms: app.lobby.rooms.size,
  streams: streamCount(app.lobby),
  uptime: Math.max(0, Math.round((app.lobby.opts.now() - app.startedAt) / 1000)),
});

/**
 * Every API route except the SSE stream (which needs the raw response).
 * Returns null for paths that are not API routes.
 */
export const handleApi = (app: OnlineApp, req: ApiRequest): ApiResponse | null => {
  const { lobby } = app;
  if (req.path === "/healthz") {
    return req.method === "GET" ? json(200, healthBody(app)) : err(405, "method not allowed");
  }
  if (req.path === "/api/rooms") {
    if (req.method !== "POST") return err(405, "method not allowed");
    const body = readJson(req);
    if (!body.ok) return body.res;
    const parsed = parseCreateRoom(body.value, isRulePresetId, isPlayablePack, packFor);
    if (!parsed.ok) return err(400, parsed.error);
    return fromOutcome(createRoom(lobby, parsed.value, req.ip));
  }
  const m = ROOM_ROUTE.exec(req.path);
  if (m === null) return req.path.startsWith("/api/") ? err(404, "not found") : null;
  const code = normalizeCode(decodeURIComponentSafe(m[1]));
  if (code === null) return err(404, "部屋が見つかりません");
  const sub = m[2];

  if (sub === undefined) {
    if (req.method !== "GET") return err(405, "method not allowed");
    // token-less lookups are the one way to probe for room codes
    if (!allowHit(lobby, `peek:${req.ip}`, PEEK_PER_WINDOW)) return err(429, "部屋の確認が多すぎます。少し待ってください");
    const room = findRoom(lobby, code);
    return room === null ? err(404, "部屋が見つかりません") : json(200, { ok: true, room: roomView(room) });
  }
  if (sub === "join") {
    if (req.method !== "POST") return err(405, "method not allowed");
    const body = readJson(req);
    if (!body.ok) return body.res;
    const parsed = parseJoin(body.value);
    if (!parsed.ok) return err(400, parsed.error);
    return fromOutcome(joinRoom(lobby, code, parsed.value, req.ip));
  }

  const ms = authenticate(lobby, code, bearer(req.headers));
  if (ms === null) {
    return findRoom(lobby, code) === null ? err(404, "部屋が見つかりません") : err(401, "席トークンが無効です");
  }
  if (sub === "whoami") {
    if (req.method !== "GET") return err(405, "method not allowed");
    return json(200, { ok: true, role: ms.role, seat: ms.seat, name: ms.member.name, connections: ms.member.connections });
  }
  if (sub === "view") {
    if (req.method !== "GET") return err(405, "method not allowed");
    return json(200, { ok: true, ...stateMessage(ms.room, ms.seat, ms.role, null) });
  }
  if (sub === "input") {
    if (req.method !== "POST") return err(405, "method not allowed");
    const body = readJson(req);
    if (!body.ok) return body.res;
    const parsed = parseClientInput(body.value);
    if (!parsed.ok) return err(400, parsed.error);
    return fromOutcome(roomInput(lobby, ms, parsed.value));
  }
  if (sub === "close") {
    // no body to read: holding a seat token IS the authorisation
    if (req.method !== "POST") return err(405, "method not allowed");
    return fromOutcome(closeRoom(lobby, ms));
  }
  return err(405, "use the stream endpoint with a streaming request");
};

const decodeURIComponentSafe = (s: string): string => {
  try {
    return decodeURIComponent(s);
  } catch {
    return "";
  }
};

// ------------------------------------------------------------------ static

const STATIC_FILES = new Set([
  // the AI table runs entirely in the browser, so the online server can host it at /ai
  "play/index.html",
  // the settings page (/rules) serves the AI table, the lobby and the rooms
  "play/rules.html",
  "online/lobby.html",
  "online/room.html",
  "online/lobby.ts",
  "online/client.ts",
  "online/room-tools.ts",
  "online/rules-room.ts",
  "online/storage.ts",
]);

/** Browser modules of the shared table (play/), never the local play server itself. */
const PLAY_BROWSER = /^play\/(?!server\.ts$)[a-z-]+\.(ts|css)$/;

/** Card art cut from the print kit: play/art/<set>/<file>.webp|.jpg, nothing deeper. */
const PLAY_ART = /^play\/art\/[a-z0-9-]+\/[A-Za-z0-9-]+\.(webp|jpg)$/;

/** Engine modules and pack data are public; of online/ and play/ only the browser files. */
export const onlineStaticAllowed = (rel: string): boolean => {
  const head = rel.split("/")[0];
  if (head === "src" || head === "data") return true;
  return STATIC_FILES.has(rel) || PLAY_BROWSER.test(rel) || PLAY_ART.test(rel);
};

export const staticTarget = (path: string): string => {
  if (path === "/" || path === "") return "/online/lobby.html";
  if (/^\/room\/[^/]+\/?$/.test(path)) return "/online/room.html";
  if (path === "/ai" || path === "/ai/") return "/play/index.html";
  if (path === "/rules" || path === "/rules/") return "/play/rules.html";
  return path;
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // the only external resource: the Google Fonts stylesheet and its font files
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Cache-Control": "no-store",
  "Content-Security-Policy": CSP,
};

/** Behind a TLS-terminating proxy (--trust-proxy) the site is HTTPS-only, so browsers may pin that. */
const headersFor = (app: OnlineApp): Record<string, string> =>
  app.trustProxy ? { ...SECURITY_HEADERS, "Strict-Transport-Security": "max-age=31536000" } : SECURITY_HEADERS;

/**
 * The HTML entry pages stay `no-store`: they are tiny, and they are what ties a
 * browser to a deploy. Everything they pull in (stripped .ts modules, CSS, pack
 * JSON) may be reused for STATIC_MAX_AGE_S — long enough that a reload costs
 * nothing, short enough that a browser cannot keep mixing modules from two
 * deploys (the specifiers carry no hash, so only time separates them).
 */
export const staticCacheControl = (target: string): string => {
  if (target.endsWith(".html")) return "no-store";
  return isImagePath(target) ? `public, max-age=${ART_MAX_AGE_S}` : `public, max-age=${STATIC_MAX_AGE_S}`;
};

/** gzip of a served body, reused while the body is unchanged (mtime-keyed strip cache above it). */
const gzipCache = new Map<string, { src: string; gz: Buffer }>();

const gzipFor = (target: string, body: string): Buffer => {
  const hit = gzipCache.get(target);
  if (hit !== undefined && hit.src.length === body.length && hit.src === body) return hit.gz;
  const gz = gzipSync(body);
  gzipCache.set(target, { src: body, gz });
  return gz;
};

export const acceptsGzip = (headers: IncomingMessage["headers"]): boolean => {
  const raw = headers["accept-encoding"];
  const value = Array.isArray(raw) ? raw.join(",") : (raw ?? "");
  return /(?:^|,)\s*gzip\s*(?:;|,|$)/i.test(value);
};

/** Static response: security headers, the cache rule for its kind, gzip when asked for, no body for HEAD. */
const sendStatic = (
  app: OnlineApp,
  req: IncomingMessage,
  res: ServerResponse,
  target: string,
  served: Served | ServedBytes,
  headOnly: boolean,
): void => {
  const headers: Record<string, string> = {
    ...headersFor(app),
    "Content-Type": served.type,
    "Cache-Control": served.code === 200 ? staticCacheControl(target) : "no-store",
    Vary: "Accept-Encoding",
  };
  const body = served.body;
  const bytes = Buffer.byteLength(body);
  // SSE never comes through here; a body this small is not worth a gzip header,
  // and images (the only binary bodies) are compressed already
  const gz = served.code === 200 && typeof body === "string" && bytes >= GZIP_MIN_BYTES && acceptsGzip(req.headers) ? gzipFor(target, body) : null;
  if (gz !== null) headers["Content-Encoding"] = "gzip";
  headers["Content-Length"] = String(gz === null ? bytes : gz.length);
  res.writeHead(served.code, headers);
  if (headOnly) res.end();
  else res.end(gz ?? body);
};

/** A stream whose reader stopped reading is dropped once this much is queued for it. */
const MAX_STREAM_BACKLOG = 512 * 1024;

// -------------------------------------------------------------------- http

export const clientIp = (app: OnlineApp, req: IncomingMessage): string => {
  if (app.trustProxy && app.flyProxy) {
    // Fly's proxy sets Fly-Client-IP itself; any other forwarding header could come from the client
    const fly = req.headers["fly-client-ip"];
    return typeof fly === "string" && fly.length > 0 ? fly.trim() : (req.socket.remoteAddress ?? "unknown");
  }
  if (app.trustProxy) {
    const cf = req.headers["cf-connecting-ip"];
    if (typeof cf === "string" && cf.length > 0) return cf.trim();
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
};

const flatHeaders = (req: IncomingMessage): Record<string, string | undefined> => {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(req.headers)) out[k] = Array.isArray(v) ? v.join(",") : v;
  return out;
};

const readBody = (req: IncomingMessage): Promise<{ text: string | null; tooLarge: boolean }> =>
  new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      req.resume();
      resolve({ text: null, tooLarge: true });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) tooLarge = true;
      else chunks.push(c);
    });
    req.on("end", () =>
      resolve({ text: tooLarge ? null : size === 0 ? null : Buffer.concat(chunks).toString("utf8"), tooLarge }),
    );
    req.on("error", reject);
  });

const sendJson = (res: ServerResponse, r: ApiResponse, app?: OnlineApp, headOnly = false): void => {
  const body = JSON.stringify(r.body);
  res.writeHead(r.status, {
    ...(app === undefined ? SECURITY_HEADERS : headersFor(app)),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(Buffer.byteLength(body)),
  });
  if (headOnly) res.end();
  else res.end(body);
};

const openStream = (app: OnlineApp, req: IncomingMessage, res: ServerResponse, code: string, ip: string): void => {
  const ms = authenticate(app.lobby, code, bearer(flatHeaders(req)));
  if (ms === null) {
    sendJson(res, findRoom(app.lobby, code) === null ? err(404, "部屋が見つかりません") : err(401, "席トークンが無効です"), app);
    return;
  }
  if (ms.member.connections >= MAX_STREAMS_PER_MEMBER) {
    sendJson(res, err(429, "この席で開いている画面が多すぎます。使っていないタブを閉じてください"), app);
    return;
  }
  if (streamCount(app.lobby, ip) >= MAX_STREAMS_PER_IP) {
    sendJson(res, err(429, `この接続元で開いている画面が多すぎます(${MAX_STREAMS_PER_IP}まで)。使っていないタブを閉じてください`), app);
    return;
  }
  if (streamCount(app.lobby) >= MAX_STREAMS_TOTAL) {
    sendJson(res, err(503, "サーバーが混み合っています。少し待ってから開き直してください"), app);
    return;
  }
  res.writeHead(200, {
    ...headersFor(app),
    "Content-Type": "text/event-stream; charset=utf-8",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  app.streams.add(res);
  res.write(": connected\n\n");
  // a reader that never drains would make every broadcast pile up in memory: cut it off instead
  const send = (chunk: string): void => {
    if (res.writableLength > MAX_STREAM_BACKLOG) {
      res.destroy();
      return;
    }
    res.write(chunk);
  };
  const endStream = (): void => {
    if (!res.writableEnded) res.end();
  };
  const client = attachClient(app.lobby, ms, (msg) => send(`event: state\ndata: ${JSON.stringify(msg)}\n\n`), ip, endStream);
  const ping = setInterval(() => send(": ping\n\n"), SSE_PING_MS);
  ping.unref();
  const close = (): void => {
    clearInterval(ping);
    app.streams.delete(res);
    detachClient(app.lobby, ms.room, client);
  };
  req.on("close", close);
  res.on("close", close);
};

const route = async (app: OnlineApp, req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = url.pathname;
  const method = req.method ?? "GET";
  const ip = clientIp(app, req);
  if (app.shuttingDown) {
    sendJson(res, err(503, RESTART_NOTICE), app, method === "HEAD");
    return;
  }
  const stream = /^\/api\/rooms\/([^/]+)\/stream$/.exec(path);
  const [bucket, limit] =
    stream !== null ? ["stream", STREAM_OPENS_PER_WINDOW] : path.startsWith("/api/") ? ["api", API_PER_WINDOW] : ["static", STATIC_PER_WINDOW];
  if (!allowHit(app.lobby, `${bucket}:${ip}`, limit)) {
    sendJson(res, err(429, "アクセスが多すぎます。少し待ってください"), app);
    return;
  }
  if (stream !== null) {
    if (method !== "GET") {
      sendJson(res, err(405, "method not allowed"), app);
      return;
    }
    const code = normalizeCode(decodeURIComponentSafe(stream[1]));
    if (code === null) {
      sendJson(res, err(404, "部屋が見つかりません"));
      return;
    }
    openStream(app, req, res, code, ip);
    return;
  }
  if (path.startsWith("/api/") || path === "/healthz") {
    // HEAD answers exactly like GET, minus the body
    const headOnly = method === "HEAD";
    const asMethod = headOnly ? "GET" : method;
    const body = asMethod === "POST" ? await readBody(req) : { text: null, tooLarge: false };
    const r = handleApi(app, {
      method: asMethod,
      path,
      headers: flatHeaders(req),
      body: body.text,
      bodyTooLarge: body.tooLarge,
      ip,
    });
    sendJson(res, r ?? err(404, "not found"), app, headOnly);
    return;
  }
  if (method !== "GET" && method !== "HEAD") {
    sendJson(res, err(405, "method not allowed"), app);
    return;
  }
  const target = staticTarget(path);
  const served = isImagePath(target) ? await serveImage(target, onlineStaticAllowed) : await serveFile(target, onlineStaticAllowed);
  sendStatic(app, req, res, target, served, method === "HEAD");
};

export const createOnlineServer = (app: OnlineApp): Server =>
  createServer((req, res) => {
    route(app, req, res).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`online: error on ${req.method} ${req.url}: ${msg}\n`);
      if (!res.headersSent) sendJson(res, err(500, "internal error"));
      else res.end();
    });
  });

// ------------------------------------------------------- sweep / shutdown

/**
 * The idle sweep, on a timer. A throw inside a timer callback has no handler
 * above it and takes the whole process down with it (shown by
 * out/audit-ops/timer-crash.ts), so it is caught, reported, and the next tick
 * runs as usual.
 */
export const startSweep = (app: OnlineApp, ms: number = SWEEP_MS): ReturnType<typeof setInterval> => {
  const timer = setInterval(() => {
    try {
      sweep(app.lobby);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.stack ?? e.message : String(e);
      process.stderr.write(`online: sweep failed (the timer keeps running): ${msg}\n`);
    }
  }, ms);
  timer.unref();
  return timer;
};

/** What a page shows while the server is being replaced. */
export const RESTART_NOTICE = "サーバーを更新しています。まもなく再接続します";

/** SSE frame sent to every open stream on SIGTERM/SIGINT; client.ts turns it into RESTART_NOTICE. */
export const RESTART_EVENT = `event: bye\ndata: ${JSON.stringify({ reason: "restart", message: RESTART_NOTICE })}\n\n`;

/**
 * A redeploy (Fly sends SIGTERM, then kills after kill_timeout = 5s): say
 * goodbye on every open stream so the pages show "the server is updating"
 * instead of a bare disconnect, stop taking new requests, and be gone well
 * inside the 5 seconds.
 */
export const shutdown = (
  app: OnlineApp,
  server: Server,
  exit: (code: number) => void,
  graceMs = 1500,
): void => {
  if (app.shuttingDown) return;
  app.shuttingDown = true;
  process.stdout.write(`online: shutting down — rooms=${app.lobby.rooms.size} streams=${app.streams.size}\n`);
  for (const res of [...app.streams]) {
    app.streams.delete(res);
    try {
      if (!res.writableEnded) {
        res.write(RESTART_EVENT);
        res.end();
      }
    } catch (e: unknown) {
      process.stderr.write(`online: could not close a stream: ${e instanceof Error ? e.message : String(e)}\n`);
    }
  }
  let done = false;
  const finish = (): void => {
    if (done) return;
    done = true;
    exit(0);
  };
  server.close(finish);
  server.closeIdleConnections();
  const timer = setTimeout(() => {
    server.closeAllConnections();
    finish();
  }, graceMs);
  timer.unref();
};

// --------------------------------------------------------------------- cli

const argValue = (argv: string[], key: string): string | undefined => {
  const i = argv.indexOf(key);
  return i === -1 ? undefined : argv[i + 1];
};

export const parseServerArgs = (
  argv: string[],
): { port: number; host: string; recordDir: string; trustProxy: boolean } => {
  const portArg = argValue(argv, "--port");
  const port = portArg === undefined ? DEFAULT_PORT : Number(portArg);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`--port must be an integer 1..65535, got "${portArg}"`);
  }
  const host = argValue(argv, "--host") ?? DEFAULT_HOST;
  const recordDir = argValue(argv, "--record-dir") ?? DEFAULT_RECORD_DIR;
  return { port, host, recordDir, trustProxy: argv.includes("--trust-proxy") };
};

const isEntry = (): boolean => {
  const arg = process.argv[1];
  return arg !== undefined && normalize(arg) === normalize(fileURLToPath(import.meta.url));
};

if (isEntry()) {
  const args = parseServerArgs(process.argv.slice(2));
  const app = createOnlineApp({
    recordDir: args.recordDir,
    trustProxy: args.trustProxy,
    log: (line) => process.stdout.write(`${line}\n`),
  });
  // the record directory is a mounted volume in production: empty, and possibly
  // not writable, the first time the machine boots. Say so and keep serving.
  const rec = checkRecordDir(args.recordDir);
  if (!rec.ok) {
    process.stderr.write(`online: records are NOT being saved to ${args.recordDir}: ${rec.error}\n`);
  }
  startSweep(app);
  const server = createOnlineServer(app);
  for (const sig of ["SIGTERM", "SIGINT"] as const) {
    process.on(sig, () => shutdown(app, server, (code) => process.exit(code)));
  }
  server.listen(args.port, args.host, () => {
    const shown = args.host === "0.0.0.0" ? "localhost" : args.host;
    process.stdout.write(`sim2 online: http://${shown}:${args.port}/  (records: ${args.recordDir}${rec.ok ? "" : " — UNWRITABLE"})\n`);
  });
}
