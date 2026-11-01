// Node-only pack loading. The browser UI fetches the JSON and calls
// parsePack() from cards.ts instead, so the validation stays single-sourced.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join } from "node:path";
import { parsePack } from "./cards.ts";
import type { CardPack } from "./cards.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(HERE, "..", "data");
export const DEFAULT_PACK_PATH = join(DATA_DIR, "pack-placeholder22.json");

export const packPath = (name: string): string => join(DATA_DIR, `pack-${name}.json`);

export const loadPack = (path: string = DEFAULT_PACK_PATH): CardPack => {
  const abs = isAbsolute(path) ? path : join(process.cwd(), path);
  return parsePack(JSON.parse(readFileSync(abs, "utf8")));
};
