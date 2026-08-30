// Static server for the play UI. Zero dependencies: node:http plus
// node:module's stripTypeScriptTypes so the browser can import the engine
// modules directly, with no build step and no duplicated rules code.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
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

/** Only these prefixes are reachable, and only with a known extension. */
const ALLOWED_PREFIXES = ["play", "src", "data"];

const resolveSafe = (urlPath: string): string | null => {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const rel = normalize(clean.replace(/^\/+/, "")).replace(/^(\.\.[/\\])+/, "");
  if (rel.length === 0 || rel.startsWith("..")) return null;
  const head = rel.split(/[/\\]/)[0];
  if (!ALLOWED_PREFIXES.includes(head)) return null;
  if (TYPES[extname(rel)] === undefined) return null;
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

export const serve = async (
  urlPath: string,
): Promise<{ code: number; body: string; type: string }> => {
  const target = urlPath === "/" || urlPath === "" ? "/play/index.html" : urlPath;
  const abs = resolveSafe(target);
  if (abs === null) return { code: 404, body: "not found", type: "text/plain; charset=utf-8" };
  let raw: string;
  try {
    raw = await readFile(abs, "utf8");
  } catch {
    return { code: 404, body: "not found", type: "text/plain; charset=utf-8" };
  }
  const ext = extname(abs);
  if (ext === ".ts") {
    // strip only - the import specifiers keep their .ts suffix and this
    // server resolves them, so the browser loads the very same modules the
    // simulator and the tests use.
    return { code: 200, body: stripTypeScriptTypes(raw, { mode: "strip" }), type: TYPES[".ts"] };
  }
  return { code: 200, body: raw, type: TYPES[ext] };
};

export const createPlayServer = () =>
  createServer((req, res) => {
    const url = req.url ?? "/";
    serve(url)
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
