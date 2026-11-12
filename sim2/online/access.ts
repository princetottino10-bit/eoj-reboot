// The supporters' gate: one shared password in front of the whole site.
//
// On when the host sets BOTH secrets (fly secrets set ...), off otherwise:
//   ACCESS_PASSWORD_HASH   scrypt:N:r:p:<salt>:<hash>   (sim2/scripts/access-secrets.ts makes it)
//   ACCESS_COOKIE_SECRET   32+ random characters, signs the login cookie
// Only the hash is stored, never the password. A right password at /login gets
// a signed HttpOnly, Secure cookie for ACCESS_MAX_AGE_S; without it every page
// redirects to /login and every API call (SSE included) answers 401. /healthz
// stays open for the host's health check. Wrong passwords are limited per address.
import { createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

export const ACCESS_COOKIE = "fujin_access";
/** How long a login lasts: 30 days, so a supporter rarely types it twice. */
export const ACCESS_MAX_AGE_S = 30 * 86400;
/** Wrong passwords allowed per address per window; past that even the right one waits. */
export const LOGIN_FAILS_PER_WINDOW = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
/** scrypt cost (N) for new hashes: about 16MB and a few tens of ms per check. */
export const DEFAULT_COST = 16384;
const KEY_LEN = 32;
const MIN_SECRET_LEN = 32;

export type PasswordHash = { text: string; N: number; r: number; p: number; salt: Buffer; hash: Buffer };

export type AccessGate = {
  hash: PasswordHash;
  key: Buffer;
  now: () => number;
  /** Recent wrong-password times per address. */
  fails: Map<string, number[]>;
};

const b64u = (b: Buffer): string => b.toString("base64url");

export const hashPassword = (password: string, opts: { cost?: number } = {}): string => {
  const N = opts.cost ?? DEFAULT_COST;
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize("NFC"), salt, KEY_LEN, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return `scrypt:${N}:8:1:${b64u(salt)}:${b64u(hash)}`;
};

export const parsePasswordHash = (text: string): PasswordHash | null => {
  const m = /^scrypt:(\d+):(\d+):(\d+):([A-Za-z0-9_-]{16,}):([A-Za-z0-9_-]{32,})$/.exec(text.trim());
  if (m === null) return null;
  const [N, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // N a power of two, and nothing that would eat the machine's memory
  if (N < 1024 || N > 1 << 20 || (N & (N - 1)) !== 0 || r < 1 || r > 32 || p < 1 || p > 16) return null;
  return { text: text.trim(), N, r, p, salt: Buffer.from(m[4], "base64url"), hash: Buffer.from(m[5], "base64url") };
};

export const verifyPassword = (h: PasswordHash, password: string): Promise<boolean> =>
  new Promise((resolve) => {
    scrypt(password.normalize("NFC"), h.salt, h.hash.length, { N: h.N, r: h.r, p: h.p, maxmem: 256 * 1024 * 1024 }, (e, key) => {
      resolve(e === null && key.length === h.hash.length && timingSafeEqual(key, h.hash));
    });
  });

export const createAccessGate = (opts: { passwordHash: string; cookieSecret: string; now?: () => number }): AccessGate => {
  const hash = parsePasswordHash(opts.passwordHash);
  if (hash === null) throw new Error("ACCESS_PASSWORD_HASH is not a hash made by scripts/access-secrets.ts");
  if (opts.cookieSecret.trim().length < MIN_SECRET_LEN) throw new Error(`ACCESS_COOKIE_SECRET must be at least ${MIN_SECRET_LEN} characters`);
  return { hash, key: Buffer.from(opts.cookieSecret.trim(), "utf8"), now: opts.now ?? Date.now, fails: new Map() };
};

/** The gate from the environment: null when neither secret is set, an error when only one is. */
export const accessGateFromEnv = (env: Record<string, string | undefined>): AccessGate | null => {
  const hash = env.ACCESS_PASSWORD_HASH ?? "";
  const secret = env.ACCESS_COOKIE_SECRET ?? "";
  if (hash === "" && secret === "") return null;
  if (hash === "") throw new Error("ACCESS_COOKIE_SECRET is set but ACCESS_PASSWORD_HASH is not: set both, or neither");
  if (secret === "") throw new Error("ACCESS_PASSWORD_HASH is set but ACCESS_COOKIE_SECRET is not: set both, or neither");
  return createAccessGate({ passwordHash: hash, cookieSecret: secret });
};

// ------------------------------------------------------------------ cookie

/** The signature covers the expiry and the password hash, so a new password signs everyone out. */
const sign = (gate: AccessGate, exp: number): string =>
  b64u(createHmac("sha256", gate.key).update(`v1|${exp}|${gate.hash.text}`).digest());

export const issueCookie = (gate: AccessGate): string => {
  const exp = Math.floor(gate.now() / 1000) + ACCESS_MAX_AGE_S;
  return `${ACCESS_COOKIE}=${exp}.${sign(gate, exp)}; Path=/; Max-Age=${ACCESS_MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax`;
};

export const CLEAR_COOKIE = `${ACCESS_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

const cookieValue = (header: string | undefined, name: string): string | null => {
  if (header === undefined) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i !== -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
};

export const hasAccess = (gate: AccessGate, cookieHeader: string | undefined): boolean => {
  const v = cookieValue(cookieHeader, ACCESS_COOKIE);
  const m = v === null ? null : /^(\d{1,12})\.([A-Za-z0-9_-]{43})$/.exec(v);
  if (m === null) return false;
  const exp = Number(m[1]);
  if (exp * 1000 <= gate.now()) return false;
  const want = Buffer.from(sign(gate, exp));
  const got = Buffer.from(m[2]);
  return want.length === got.length && timingSafeEqual(want, got);
};

// ------------------------------------------------------------------- login

export type LoginResult = "ok" | "wrong" | "limited";

const recentFails = (gate: AccessGate, ip: string): number[] => {
  const now = gate.now();
  if (gate.fails.size > 5000) {
    for (const [k, ts] of gate.fails) if (ts.every((t) => now - t >= LOGIN_WINDOW_MS)) gate.fails.delete(k);
  }
  const recent = (gate.fails.get(ip) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS);
  if (recent.length === 0) gate.fails.delete(ip);
  else gate.fails.set(ip, recent);
  return recent;
};

export const tryLogin = async (gate: AccessGate, ip: string, password: string): Promise<LoginResult> => {
  if (recentFails(gate, ip).length >= LOGIN_FAILS_PER_WINDOW) return "limited";
  if (password.length > 0 && password.length <= 256 && (await verifyPassword(gate.hash, password))) return "ok";
  gate.fails.set(ip, [...recentFails(gate, ip), gate.now()]);
  return "wrong";
};

/** What is served without the cookie: the health check, the login page and its logo. */
export const accessExempt = (path: string): boolean =>
  path === "/healthz" || path === "/login" || path === "/logout" || path === "/play/art/site/logo.webp";

/** Where to go after logging in: a path on this site only, never another host, never back to /login. */
export const safeNext = (raw: string | null): string => {
  if (raw === null || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  if (/^\/log(?:in|out)(?:[/?#]|$)/.test(raw)) return "/";
  return raw;
};

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const WRONG_PASSWORD = "パスワードが違います。";
export const TOO_MANY_TRIES = "まちがいが続いたため、しばらく受け付けを止めています。15分ほど待ってからお試しください。";

/** The login page: no script (the CSP allows none inline), a plain form posting to /login. */
export const loginPage = (opts: { next: string; error?: string }): string => `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>式神符陣 支援者向けブラウザ版</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@700&family=Zen+Kaku+Gothic+New:wght@400;700&display=swap">
<style>
:root { color-scheme: dark; --bg: #0b0b0e; --panel: #15161c; --line: #3a3526; --gold: #d7b565; --text: #f5f1e2; --sub: #b9b3a3; --err: #ff9b8a; }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; background: radial-gradient(ellipse at top, #1b2340 0%, var(--bg) 60%); color: var(--text); font-family: "Zen Kaku Gothic New", system-ui, sans-serif; }
main { width: 100%; max-width: 400px; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 28px 24px 24px; text-align: center; box-shadow: 0 12px 40px rgba(0,0,0,.5); }
.logo { width: 220px; max-width: 70%; height: auto; }
h1 { font-family: "Shippori Mincho B1", serif; font-size: 1.15rem; color: var(--gold); margin: 10px 0 6px; letter-spacing: .08em; }
p { color: var(--sub); font-size: .9rem; line-height: 1.7; margin: 0 0 18px; }
label { display: block; text-align: left; font-size: .85rem; margin-bottom: 6px; }
input[type=password] { width: 100%; font-size: 1.1rem; padding: 12px 14px; border-radius: 8px; border: 1px solid var(--line); background: #0e0f14; color: var(--text); }
input[type=password]:focus { outline: 2px solid var(--gold); outline-offset: 1px; }
button { margin-top: 16px; width: 100%; font: inherit; font-weight: 700; font-size: 1rem; padding: 12px; border: 0; border-radius: 8px; background: var(--gold); color: #1a1508; cursor: pointer; }
button:hover { filter: brightness(1.08); }
.err { color: var(--err); font-size: .9rem; margin: 0 0 14px; }
small { display: block; margin-top: 18px; color: var(--sub); font-size: .78rem; line-height: 1.6; }
</style>
</head>
<body>
<main>
<img class="logo" src="/play/art/site/logo.webp" alt="式神符陣" width="1000" height="675">
<h1>支援者向けブラウザ版</h1>
<p>クラウドファンディングでお送りした<br>パスワードを入れてください。</p>
${opts.error === undefined ? "" : `<p class="err" role="alert">${esc(opts.error)}</p>\n`}<form method="post" action="/login">
<input type="hidden" name="next" value="${esc(opts.next)}">
<label for="pw">パスワード</label>
<input id="pw" type="password" name="password" autocomplete="current-password" required autofocus maxlength="256">
<button type="submit">入る</button>
</form>
<small>一度入ると、この端末のこのブラウザでは30日間そのまま遊べます。</small>
</main>
</body>
</html>
`;
