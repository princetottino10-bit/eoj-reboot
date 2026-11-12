// The supporters' gate (online/access.ts): one shared password, a /login page,
// a signed HttpOnly cookie, and nothing but /healthz and the login page served
// without it. Off unless ACCESS_PASSWORD_HASH and ACCESS_COOKIE_SECRET are set.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import {
  ACCESS_COOKIE,
  ACCESS_MAX_AGE_S,
  LOGIN_FAILS_PER_WINDOW,
  LOGIN_WINDOW_MS,
  accessExempt,
  accessGateFromEnv,
  createAccessGate,
  hasAccess,
  hashPassword,
  issueCookie,
  loginPage,
  parsePasswordHash,
  safeNext,
  tryLogin,
  verifyPassword,
} from "../online/access.ts";
import { createOnlineServer } from "../online/server.ts";
import { newApp, testRecordDir } from "./online-api-helpers.ts";

const DIR = testRecordDir("access");
const SECRET = "x".repeat(48);
const PASSWORD = "kyuuguu-2027";

test.after(() => {
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
});

// a cheap hash keeps the suite fast; the real one uses the default cost
const HASH = hashPassword(PASSWORD, { cost: 1024 });

test("access: the hash is self-describing, salted, and never the password", async () => {
  assert.match(HASH, /^scrypt:1024:8:1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
  assert.ok(!HASH.includes(PASSWORD));
  assert.notEqual(hashPassword(PASSWORD, { cost: 1024 }), HASH, "a new salt each time");
  assert.match(hashPassword(PASSWORD), /^scrypt:16384:8:1:/);
  const parsed = parsePasswordHash(HASH);
  assert.ok(parsed !== null);
  assert.equal(await verifyPassword(parsed, PASSWORD), true);
  assert.equal(await verifyPassword(parsed, "kyuuguu-2026"), false);
  assert.equal(await verifyPassword(parsed, ""), false);
});

test("access: broken hashes and short secrets are refused at start-up", () => {
  for (const bad of ["", "plain", "scrypt:1024:8:1:abc", "bcrypt:1024:8:1:a:b", "scrypt:1000:8:1:abcdabcdabcdabcd:abcd"]) {
    assert.equal(parsePasswordHash(bad), null, bad);
  }
  assert.throws(() => createAccessGate({ passwordHash: "plain", cookieSecret: SECRET }), /ACCESS_PASSWORD_HASH/);
  assert.throws(() => createAccessGate({ passwordHash: HASH, cookieSecret: "short" }), /ACCESS_COOKIE_SECRET/);
});

test("access: off without the secrets, and half of them is an error (never silently open)", () => {
  assert.equal(accessGateFromEnv({}), null);
  assert.throws(() => accessGateFromEnv({ ACCESS_PASSWORD_HASH: HASH }), /ACCESS_COOKIE_SECRET/);
  assert.throws(() => accessGateFromEnv({ ACCESS_COOKIE_SECRET: SECRET }), /ACCESS_PASSWORD_HASH/);
  assert.ok(accessGateFromEnv({ ACCESS_PASSWORD_HASH: HASH, ACCESS_COOKIE_SECRET: SECRET }) !== null);
});

test("access: the cookie is signed, HttpOnly, Secure, SameSite=Lax and lasts 30 days", () => {
  let now = 1_800_000_000_000;
  const gate = createAccessGate({ passwordHash: HASH, cookieSecret: SECRET, now: () => now });
  const set = issueCookie(gate);
  assert.match(set, new RegExp(`^${ACCESS_COOKIE}=[^;]+; Path=/; Max-Age=${ACCESS_MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax$`));
  assert.ok(ACCESS_MAX_AGE_S >= 7 * 86400 && ACCESS_MAX_AGE_S <= 30 * 86400);
  const pair = set.split(";")[0];
  assert.equal(hasAccess(gate, pair), true);
  assert.equal(hasAccess(gate, `other=1; ${pair}; more=2`), true);
  assert.equal(hasAccess(gate, undefined), false);
  assert.equal(hasAccess(gate, ""), false);
  // tampering with the expiry or the signature
  const [exp, sig] = pair.split("=")[1].split(".");
  assert.equal(hasAccess(gate, `${ACCESS_COOKIE}=${Number(exp) + 999999}.${sig}`), false);
  assert.equal(hasAccess(gate, `${ACCESS_COOKIE}=${exp}.${sig.slice(0, -2)}AA`), false);
  assert.equal(hasAccess(gate, `${ACCESS_COOKIE}=${exp}`), false);
  // another server's secret
  const other = createAccessGate({ passwordHash: HASH, cookieSecret: "y".repeat(48), now: () => now });
  assert.equal(hasAccess(other, pair), false);
  // a new password signs everyone out
  const changed = createAccessGate({ passwordHash: hashPassword("new-one-2027", { cost: 1024 }), cookieSecret: SECRET, now: () => now });
  assert.equal(hasAccess(changed, pair), false);
  // expiry
  now += (ACCESS_MAX_AGE_S - 1) * 1000;
  assert.equal(hasAccess(gate, pair), true);
  now += 2000;
  assert.equal(hasAccess(gate, pair), false);
});

test("access: wrong passwords are limited per address", async () => {
  let now = 1_800_000_000_000;
  const gate = createAccessGate({ passwordHash: HASH, cookieSecret: SECRET, now: () => now });
  for (let i = 0; i < LOGIN_FAILS_PER_WINDOW; i++) assert.equal(await tryLogin(gate, "10.0.0.1", "nope"), "wrong");
  assert.equal(await tryLogin(gate, "10.0.0.1", PASSWORD), "limited", "even the right one waits");
  assert.equal(await tryLogin(gate, "10.0.0.2", PASSWORD), "ok", "another address is not affected");
  now += LOGIN_WINDOW_MS + 1;
  assert.equal(await tryLogin(gate, "10.0.0.1", PASSWORD), "ok");
});

test("access: only the health check, the login page and its logo are open", () => {
  for (const p of ["/healthz", "/login", "/logout", "/play/art/site/logo.webp"]) assert.equal(accessExempt(p), true, p);
  for (const p of ["/", "/ai", "/online", "/rules", "/records", "/room/ABCD", "/api/rooms", "/api/rooms/ABCD/stream", "/play/art/face/O-009.webp", "/src/flow.ts", "/login/x", "/healthz/"]) {
    assert.equal(accessExempt(p), false, p);
  }
});

test("access: after login only same-site paths are followed", () => {
  assert.equal(safeNext("/room/ABCD"), "/room/ABCD");
  assert.equal(safeNext("/ai?x=1"), "/ai?x=1");
  for (const bad of [null, "", "https://evil.example/", "//evil.example/", "/\\evil.example", "ai", "/login", "/logout"]) assert.equal(safeNext(bad), "/", String(bad));
});

test("access: the login page escapes what it echoes and posts to /login", () => {
  const html = loginPage({ next: '/a"><script>', error: "パスワードが違います" });
  assert.match(html, /<form method="post" action="\/login"/);
  assert.match(html, /type="password"/);
  assert.match(html, /パスワードが違います/);
  assert.ok(!html.includes('"><script>'));
  assert.ok(!html.includes("<script"), "no script: the CSP allows none inline");
});

// ------------------------------------------------------------------ http

const listen = async (server: Server): Promise<string> => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const a = server.address();
  assert.ok(a !== null && typeof a === "object");
  return `http://127.0.0.1:${a.port}`;
};

const withServer = async (fn: (base: string) => Promise<void>, gated = true): Promise<void> => {
  const access = gated ? createAccessGate({ passwordHash: HASH, cookieSecret: SECRET }) : null;
  const server = createOnlineServer(newApp(DIR, { access }));
  const base = await listen(server);
  try {
    await fn(base);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
};

const login = (base: string, password: string, next = "/"): Promise<Response> =>
  fetch(`${base}/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password, next }).toString(),
  });

test("access over http: without the cookie pages go to /login, the API says 401, /healthz answers", async () => {
  await withServer(async (base) => {
    const page = await fetch(`${base}/room/ABCD?x=1`, { redirect: "manual" });
    assert.equal(page.status, 302);
    assert.equal(page.headers.get("location"), "/login?next=%2Froom%2FABCD%3Fx%3D1");
    for (const p of ["/api/rooms/ABCD", "/api/rooms/ABCD/stream"]) {
      const api = await fetch(`${base}${p}`);
      assert.equal(api.status, 401, p);
      assert.equal(((await api.json()) as { ok: boolean }).ok, false);
    }
    const create = await fetch(`${base}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(create.status, 401);
    const asset = await fetch(`${base}/src/flow.ts`, { redirect: "manual" });
    assert.equal(asset.status, 302);
    const health = await fetch(`${base}/healthz`);
    assert.equal(health.status, 200);
    assert.equal(((await health.json()) as { rooms: number }).rooms, 0);
    const form = await fetch(`${base}/login`);
    assert.equal(form.status, 200);
    assert.match(await form.text(), /type="password"/);
    assert.equal(form.headers.get("cache-control"), "no-store");
  });
});

test("access over http: the right password sets the cookie and opens everything", async () => {
  await withServer(async (base) => {
    const bad = await login(base, "nope", "/ai");
    assert.equal(bad.status, 401);
    assert.equal(bad.headers.get("set-cookie"), null);
    assert.match(await bad.text(), /パスワードが違います/);
    const ok = await login(base, PASSWORD, "/ai");
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.get("location"), "/ai");
    const set = ok.headers.get("set-cookie") ?? "";
    assert.match(set, /HttpOnly; Secure; SameSite=Lax/);
    const cookie = set.split(";")[0];
    const page = await fetch(`${base}/ai`, { headers: { cookie } });
    assert.equal(page.status, 200);
    const api = await fetch(`${base}/api/rooms/ABCD`, { headers: { cookie } });
    assert.equal(api.status, 404, "past the gate: the room simply does not exist");
    const out = await fetch(`${base}/logout`, { redirect: "manual", headers: { cookie } });
    assert.equal(out.status, 303);
    assert.match(out.headers.get("set-cookie") ?? "", new RegExp(`^${ACCESS_COOKIE}=; Path=/; Max-Age=0`));
  });
});

test("access over http: too many wrong passwords get 429", async () => {
  await withServer(async (base) => {
    for (let i = 0; i < LOGIN_FAILS_PER_WINDOW; i++) assert.equal((await login(base, "nope")).status, 401);
    const r = await login(base, PASSWORD);
    assert.equal(r.status, 429);
    assert.equal(r.headers.get("set-cookie"), null);
  });
});

test("access over http: behind the gate / is the supporters' front page, the lobby stays at /online", async () => {
  await withServer(async (base) => {
    const ok = await login(base, PASSWORD);
    const cookie = (ok.headers.get("set-cookie") ?? "").split(";")[0];
    const top = await fetch(`${base}/`, { headers: { cookie } });
    assert.equal(top.status, 200);
    const html = await top.text();
    assert.match(html, /ありがとうございます！！<\/span><\/h1>/);
    for (const href of ["/ai", "/online", "/guide", "/rules", "/watch", "/logout"]) assert.ok(html.includes(`href="${href}"`), href);
    const lobby = await fetch(`${base}/online`, { headers: { cookie } });
    assert.match(await lobby.text(), /<title>式神符陣 オンライン対戦/);
  });
});

test("access over http: without a gate nothing changes", async () => {
  await withServer(async (base) => {
    assert.equal((await fetch(`${base}/ai`)).status, 200);
    assert.equal((await fetch(`${base}/login`)).status, 404);
    assert.match(await (await fetch(`${base}/`)).text(), /<title>式神符陣 オンライン対戦/, "the team's / is still the lobby");
  }, false);
});
