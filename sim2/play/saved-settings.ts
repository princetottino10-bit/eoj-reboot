// Named settings saved in this browser (localStorage). Stored as the same
// compact string as the share URL and decoded (validated) when listed.
import { decodeSettings, encodeSettings } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";

const KEY = "sim2:saved-settings";
const MAX = 30;

type Stored = { name: string; code: string };

const read = (): Stored[] => {
  try {
    const raw = localStorage.getItem(KEY);
    const list: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(list)
      ? list.filter((x): x is Stored => typeof x === "object" && x !== null && typeof x.name === "string" && typeof x.code === "string")
      : [];
  } catch {
    return [];
  }
};

const write = (list: Stored[]): boolean => {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    return true;
  } catch {
    return false;
  }
};

/** Saved entries; `settings` is null when an entry no longer decodes. */
export const listSaved = (): { name: string; settings: GameSettings | null }[] =>
  read().map((s) => {
    const d = decodeSettings(s.code, null);
    return { name: s.name, settings: d.ok ? d.value : null };
  });

export const saveNamed = (name: string, settings: GameSettings): boolean =>
  write([{ name: name.slice(0, 24), code: encodeSettings(settings) }, ...read().filter((s) => s.name !== name)]);

export const deleteSaved = (name: string): void => {
  write(read().filter((s) => s.name !== name));
};
