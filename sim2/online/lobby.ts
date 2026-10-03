// Lobby page: create a room with the rules (preset + changed variables +
// card numbers), or join one by code. The rules are edited on the settings
// page (/rules?for=lobby), which returns here with ?s=; a ?s= share link
// pre-fills them the same way.
import { parsePack } from "../src/cards.ts";
import type { CardPack } from "../src/cards.ts";
import type { PlayablePack } from "../src/presets.ts";
import { decodeSettings, defaultSettings, encodeSettings, settingsConfig } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import { entryTopHtml, rulesBlockHtml } from "../play/entry-shell.ts";
import { bindModeSwitch } from "../play/mode-switch.ts";
import { rulesHref } from "../play/rules-url.ts";
import { rememberToken, NAME_KEY } from "./storage.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing #${id}`);
  return el as T;
};

const showError = (msg: string): void => {
  $("error").textContent = msg;
};

const packs = new Map<string, CardPack>();
const loadPack = async (name: PlayablePack): Promise<CardPack> => {
  const hit = packs.get(name);
  if (hit !== undefined) return hit;
  const res = await fetch(`/data/pack-${encodeURIComponent(name)}.json`);
  if (!res.ok) throw new Error(`パック ${name} を読み込めません`);
  const pack = parsePack(await res.json());
  packs.set(name, pack);
  return pack;
};

let settings: GameSettings = defaultSettings();

/** The seat choice survives the trip to the settings page (this tab only). */
const SEAT_KEY = "sim2online:lobby-seat";

const editHref = (): string => rulesHref({ for: "lobby", s: encodeSettings(settings) });

/**
 * The switch to AIと対戦 / 観戦 carries the rules only when they differ from
 * the defaults, so a plain visit to the lobby does not reset the rules the AI
 * table remembers.
 */
const renderModeSwitch = (): void => {
  const s = encodeSettings(settings);
  $("entryTop").innerHTML = entryTopHtml("online", s === encodeSettings(defaultSettings()) ? null : s);
};

/** The shared rules-and-cards block (play/entry-shell.ts), as on the AI and spectate screens. */
const renderRules = (): void => {
  const look = {
    rule: settings.rule,
    pack: settings.pack,
    cfg: settingsConfig(settings),
    cards: settings.cards,
    printed: packs.get(settings.pack) ?? null,
  };
  $("rulesBlock").innerHTML = rulesBlockHtml(look, editHref());
  renderModeSwitch();
};

const remember = (): void => {
  try {
    sessionStorage.setItem(SEAT_KEY, $<HTMLSelectElement>("seat").value);
    localStorage.setItem(NAME_KEY, $<HTMLInputElement>("name").value.trim());
  } catch {
    // storage unavailable: the choices are only a convenience
  }
};

/** Settings from a ?s= share link, validated against the printed pack. */
const fromShareLink = async (): Promise<void> => {
  const shared = new URLSearchParams(location.search).get("s");
  if (shared === null) return;
  const first = decodeSettings(shared, null);
  if (!first.ok) {
    showError(`共有された設定を読めません: ${first.error}`);
    return;
  }
  const printed = await loadPack(first.value.pack).catch(() => null);
  const checked = decodeSettings(shared, () => printed);
  if (checked.ok) settings = checked.value;
  else showError(`共有された設定を読めません: ${checked.error}`);
};

/** One room per press: the button is out of action from the click until the server answers, and stays so once a room exists. */
let creating = false;

const create = async (): Promise<void> => {
  if (creating) return;
  creating = true;
  const button = $<HTMLButtonElement>("create");
  button.disabled = true;
  showError("");
  const name = $<HTMLInputElement>("name").value.trim();
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
  const body = {
    rule: settings.rule,
    pack: settings.pack,
    seat: $<HTMLSelectElement>("seat").value,
    config: settings.config,
    cards: settings.cards,
    name,
  };
  const failed = (text: string): void => {
    showError(text);
    creating = false;
    button.disabled = false;
  };
  let res: Response;
  try {
    res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return failed("サーバーに接続できません");
  }
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; code?: string; token?: string; error?: string };
  if (!res.ok || json.code === undefined || json.token === undefined) {
    return failed(json.error ?? `部屋を作れませんでした (${res.status})`);
  }
  rememberToken(json.code, json.token, true);
  $("code").textContent = json.code;
  $<HTMLInputElement>("invite").value = `${location.origin}/room/${json.code}`;
  $<HTMLAnchorElement>("enter").href = `/room/${json.code}`;
  $("created").hidden = false;
  // the room is made: another press would only make a second, empty one (they count against the per-address cap)
  button.textContent = "部屋を作りました(下の「部屋に入る」へ)";
};

const init = async (): Promise<void> => {
  // drawn at once (no jump when the pack arrives), then again with the shared settings checked
  renderRules();
  bindModeSwitch($("entryTop"), remember);
  await fromShareLink();
  await loadPack(settings.pack).catch(() => null);
  renderRules();
  const nameInput = $<HTMLInputElement>("name");
  try {
    nameInput.value = localStorage.getItem(NAME_KEY) ?? "";
    const seat = sessionStorage.getItem(SEAT_KEY);
    const seatSelect = $<HTMLSelectElement>("seat");
    if (seat !== null && [...seatSelect.options].some((o) => o.value === seat)) seatSelect.value = seat;
  } catch {
    // storage unavailable: the name is optional
  }
  nameInput.addEventListener("change", remember);
  $("seat").addEventListener("change", remember);
  // leaving for the settings page keeps the name and seat
  $("rulesBlock").addEventListener("click", (ev) => {
    if ((ev.target as HTMLElement).closest("[data-edit-rules]") !== null) remember();
  });
  $("create").addEventListener("click", () => void create());
  $("copy").addEventListener("click", () => {
    const inv = $<HTMLInputElement>("invite");
    inv.select();
    void navigator.clipboard?.writeText(inv.value).then(
      () => ($("copy").textContent = "コピーしました"),
      () => ($("copy").textContent = "選択したのでコピーしてください"),
    );
  });
  const go = (spectate: boolean): void => {
    const code = $<HTMLInputElement>("joinCode").value.trim().toUpperCase();
    if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(code)) {
      showError("部屋コードは6文字です");
      return;
    }
    location.href = `/room/${code}${spectate ? "?watch=1" : ""}`;
  };
  $("join").addEventListener("click", () => go(false));
  $("watch").addEventListener("click", () => go(true));
};

// Back from the settings page may show a cached lobby with the settings it had before
window.addEventListener("pageshow", (ev) => {
  if (ev.persisted) location.reload();
});

void init();
