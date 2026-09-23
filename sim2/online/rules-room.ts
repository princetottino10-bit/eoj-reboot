// The settings page (/rules?for=room&code=…&seat=N) for an online room: finds
// the seat token this tab plays with, reads the room through it and sends the
// owner's proposal. Loaded by play/rules-page.ts only in that mode, so the
// local play server (which does not serve online/) never needs it.
import { cardChangeCount } from "../src/card-overrides.ts";
import { applyConfigPatch, configChanges, describeChange } from "../src/config-schema.ts";
import { settingsConfig } from "../src/settings.ts";
import type { PlayerId } from "../src/types.ts";
import type { ClientInput, StateMessage } from "./protocol.ts";
import { storedTokens, tabToken } from "./storage.ts";

export type RoomForRules =
  /** The owner's view of a room with both seats taken and a match (running or over). */
  | { kind: "owner"; token: string; msg: StateMessage }
  /** No editing here: why, in words for the page. */
  | { kind: "denied"; text: string };

const api = (code: string): string => `/api/rooms/${encodeURIComponent(code)}`;

const GONE = "部屋が見つかりません(サーバーが再起動した可能性があります)。";

/** The token-less room lookup: false = no such room; null = could not tell. */
const roomExists = async (code: string): Promise<boolean | null> => {
  try {
    const res = await fetch(api(code), { cache: "no-store" });
    return res.ok ? true : res.status === 404 ? false : null;
  } catch {
    return null;
  }
};

type ViewResult = { status: number; msg: StateMessage | null; error: string };

const view = async (code: string, token: string): Promise<ViewResult> => {
  try {
    const res = await fetch(`${api(code)}/view`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Partial<StateMessage> & { error?: string };
    const ok = res.ok && json.room !== undefined && json.you !== undefined;
    return { status: res.status, msg: ok ? (json as StateMessage) : null, error: json.error ?? "" };
  } catch {
    return { status: 0, msg: null, error: "サーバーに接続できません" };
  }
};

/**
 * The tokens to try, in order. This tab's own token comes first and is
 * normally the only one: the page was opened from the room screen of this tab,
 * so it acts as the seat that opened it. A tab without one (the link opened in
 * a fresh tab) falls back to the browser's tokens, and then only the seat the
 * link names may edit — a browser sitting in both seats does not slip into the
 * owner's seat from the other seat's tab.
 */
const candidates = (code: string): string[] => {
  const tab = tabToken(code);
  return tab === null ? storedTokens(code) : [tab, ...storedTokens(code).filter((t) => t !== tab)];
};

/**
 * Whether this tab may propose settings for the room, and the room as the
 * owner sees it. Mirrors the room page's rule for showing the button: the
 * owner's seat, both seats taken, a match started. `seat` is the seat that
 * opened the page (from the URL); null when the link did not say.
 */
export const roomForRules = async (code: string, seat: PlayerId | null = null): Promise<RoomForRules> => {
  let seen: StateMessage | null = null;
  const tab = tabToken(code);
  for (const token of candidates(code)) {
    const r = await view(code, token);
    if (r.status === 404) return { kind: "denied", text: GONE };
    if (r.msg === null) {
      if (r.status === 401) continue;
      return { kind: "denied", text: `部屋を読み込めません: ${r.error || `(${r.status})`}` };
    }
    const msg = r.msg;
    const own = token === tab;
    // a token of another tab of this browser only counts as the seat the link named
    if (!own && seat !== null && msg.you.seat !== seat) continue;
    seen ??= msg;
    if (msg.you.role !== "player" || msg.you.seat === null || msg.room.owner !== msg.you.seat) {
      // this tab's own seat decides: it does not borrow another tab's seat to edit
      if (own) break;
      continue;
    }
    if (!msg.room.seats[0].taken || !msg.room.seats[1].taken) return { kind: "denied", text: "相手が席に着いてから、ルールとカードの変更を提案できます。" };
    if (msg.game === null) return { kind: "denied", text: "試合が始まってから提案できます。" };
    return { kind: "owner", token, msg };
  }
  if (seen === null) {
    return (await roomExists(code)) === false
      ? { kind: "denied", text: GONE }
      : { kind: "denied", text: "このブラウザはこの部屋の席についていません。部屋の画面から開いてください。" };
  }
  return {
    kind: "denied",
    text: seen.you.role === "spectator" ? "観戦中は設定を変えられません。変更を提案できるのは部屋を作った人だけです。" : "ルールとカードの変更を提案できるのは部屋を作った人だけです。",
  };
};

/** A proposal still waiting for the other seat's answer, in words for the page. */
export type PendingProposal = { id: number; scope: "now" | "next"; at: number; lines: string[] };

/** What the room's pending proposal changes (null: none pending). */
export const pendingProposal = (msg: StateMessage): PendingProposal | null => {
  const p = msg.room.proposal;
  if (p === null) return null;
  const at = typeof p.at === "number" ? p.at : 0;
  if (p.scope === "now") {
    const g = msg.game;
    const lines = g === null ? [] : configChanges(g.config, applyConfigPatch(g.config, p.patch)).map(describeChange);
    const cards = cardChangeCount(p.cards);
    return { id: p.id, scope: "now", at, lines: cards === 0 ? lines : [...lines, `カードの数値 ${cards}件`] };
  }
  const from = settingsConfig(msg.room.settings);
  const lines = configChanges(from, settingsConfig(p.settings)).map(describeChange);
  const base =
    p.settings.rule === msg.room.settings.rule && p.settings.pack === msg.room.settings.pack
      ? []
      : [`基準: ${msg.room.settings.rule}/${msg.room.settings.pack} → ${p.settings.rule}/${p.settings.pack}`];
  const cards = cardChangeCount(p.settings.cards);
  return { id: p.id, scope: "next", at, lines: [...base, ...lines, ...(cards === 0 ? [] : [`カードの数値 ${cards}件`])] };
};

/** What the server said about an input: `ok`, or its status and reason. */
export type SendResult = { ok: true } | { ok: false; status: number; error: string };

/** Sends the proposal (or a withdrawal); resolves to ok when the server took it. */
export const sendRoomInput = async (code: string, token: string, input: ClientInput): Promise<SendResult> => {
  try {
    const res = await fetch(`${api(code)}/input`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (res.ok) return { ok: true };
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, status: res.status, error: json.error ?? `送信できませんでした (${res.status})` };
  } catch {
    return { ok: false, status: 0, error: "送信できませんでした(接続を確認してください)" };
  }
};
