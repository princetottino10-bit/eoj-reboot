// Static server for the play UI. Zero dependencies: node:http plus
// node:module's stripTypeScriptTypes so the browser can import the engine
// modules directly, with no build step and no duplicated rules code.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, normalize, sep } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".ts": "text/javascript; charset=utf-8",
};

/**
 * Card art cut from the print kit (see CardDef.art). Served as bytes, only
 * from under ART_PREFIX, with these image types.
 */
const IMAGE_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
};
const ART_PREFIX = "play/art/";

/** Only these prefixes are reachable, and only with a known extension. */
const ALLOWED_PREFIXES = ["play", "src", "data"];

/** Relative path (forward slashes) -> may it be served? */
export type ServeFilter = (rel: string) => boolean;

const defaultFilter: ServeFilter = (rel) => ALLOWED_PREFIXES.includes(rel.split("/")[0]);

const NUL = String.fromCharCode(0);

/**
 * Maps a URL path to an absolute file under sim2/, or null. Rejects anything
 * that normalises outside the root, has an unknown extension, or is refused
 * by `allow`.
 */
export const resolveSafe = (urlPath: string, allow: ServeFilter = defaultFilter): string | null =>
  resolveTyped(urlPath, allow, TYPES);

const resolveTyped = (urlPath: string, allow: ServeFilter, types: Record<string, string>): string | null => {
  let clean: string;
  try {
    clean = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  if (clean.includes(NUL)) return null;
  const rel = normalize(clean.replace(/^\/+/, "")).replace(/^(\.\.[/\\])+/, "");
  if (rel.length === 0 || rel.startsWith("..")) return null;
  const relSlash = rel.split(sep).join("/");
  if (!allow(relSlash)) return null;
  if (types[extname(rel)] === undefined) return null;
  const abs = join(ROOT, rel);
  if (!abs.startsWith(ROOT + sep)) return null;
  return abs;
};

const parsePort = (argv: string[]): number => {
  const i = argv.indexOf("--port");
  if (i === -1) return 8787;
  const n = Number(argv[i + 1]);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`--port must be an integer 1..65535, got "${argv[i + 1]}"`);
  }
  return n;
};

export type Served = { code: number; body: string; type: string };

const NOT_FOUND: Served = { code: 404, body: "not found", type: "text/plain; charset=utf-8" };

/** Stripped modules by absolute path, reused while the file's mtime is unchanged. */
const stripped = new Map<string, { mtimeMs: number; body: string }>();

/** Reads one static file, stripping types from .ts. */
export const serveFile = async (
  urlPath: string,
  allow: ServeFilter = defaultFilter,
): Promise<Served> => {
  const abs = resolveSafe(urlPath, allow);
  if (abs === null) return NOT_FOUND;
  const ext = extname(abs);
  let mtimeMs = -1;
  try {
    mtimeMs = (await stat(abs)).mtimeMs;
  } catch {
    return NOT_FOUND;
  }
  const hit = ext === ".ts" ? stripped.get(abs) : undefined;
  if (hit !== undefined && hit.mtimeMs === mtimeMs) return { code: 200, body: hit.body, type: TYPES[".ts"] };
  let raw: string;
  try {
    raw = await readFile(abs, "utf8");
  } catch {
    return NOT_FOUND;
  }
  if (ext === ".ts") {
    const body = stripTypeScriptTypes(raw, { mode: "strip" });
    stripped.set(abs, { mtimeMs, body });
    // strip only - the import specifiers keep their .ts suffix and this
    // server resolves them, so the browser loads the very same modules the
    // simulator and the tests use.
    return { code: 200, body, type: TYPES[".ts"] };
  }
  return { code: 200, body: raw, type: TYPES[ext] };
};

/** Page routes of the local server: the AI table at / and /ai, the settings page at /rules. */
export const playTarget = (urlPath: string): string => {
  const path = urlPath.split("?")[0].split("#")[0];
  if (path === "/" || path === "" || path === "/ai" || path === "/ai/") return "/play/index.html";
  if (path === "/rules" || path === "/rules/") return "/play/rules.html";
  return path;
};

export const serve = async (urlPath: string): Promise<Served> => serveFile(playTarget(urlPath));

/** A binary answer (card art). Same shape as Served, bytes instead of text. */
export type ServedBytes = { code: number; body: Buffer; type: string };

/** Does this URL path ask for an image (card art) rather than a text file? */
export const isImagePath = (urlPath: string): boolean => IMAGE_TYPES[extname(urlPath.split("?")[0])] !== undefined;

/**
 * Reads one card-art image as bytes. Only files under play/art/ with an image
 * extension, and only if `allow` agrees too; anything else is a 404.
 */
export const serveImage = async (urlPath: string, allow: ServeFilter = defaultFilter): Promise<ServedBytes> => {
  const notFound: ServedBytes = { code: 404, body: Buffer.from(NOT_FOUND.body), type: NOT_FOUND.type };
  const abs = resolveTyped(urlPath, (rel) => rel.startsWith(ART_PREFIX) && allow(rel), IMAGE_TYPES);
  if (abs === null) return notFound;
  try {
    return { code: 200, body: await readFile(abs), type: IMAGE_TYPES[extname(abs)] };
  } catch {
    return notFound;
  }
};

export const createPlayServer = () =>
  createServer((req, res) => {
    const url = req.url ?? "/";
    // local dev server: nothing is stored, so a re-cropped image shows at once too
    const answer: Promise<Served | ServedBytes> = isImagePath(playTarget(url)) ? serveImage(playTarget(url)) : serve(url);
    answer
      .then(({ code, body, type }) => {
        res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
        res.end(body);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`error serving ${url}: ${msg}\n`);
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("internal error");
      });
  });

const isEntry = (): boolean => {
  const arg = process.argv[1];
  if (arg === undefined) return false;
  return normalize(arg) === normalize(fileURLToPath(import.meta.url));
};

if (isEntry()) {
  const port = parsePort(process.argv.slice(2));
  createPlayServer().listen(port, () => {
    process.stdout.write(`sim2 play UI: http://localhost:${port}/\n`);
  });
}
