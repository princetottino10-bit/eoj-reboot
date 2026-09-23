// Online room page. Holds no game state of its own: it takes the seat's view
// from the server (SSE), draws it with the shared table and POSTs inputs.
// The browser never sees the opponent's hand, any deck order or the rng.
import { applyCardOverrides } from "../src/card-overrides.ts";
import { parsePack } from "../src/cards.ts";
import type { CardPack } from "../src/cards.ts";
import type { FlowInput } from "../src/flow.ts";
import { makeCtx } from "../src/state.ts";
import type { PlayerId } from "../src/types.ts";
import { createTable } from "../play/table.ts";
import type { TableModel, TablePrompt } from "../play/table.ts";
import { esc, seatWord } from "../play/render.ts";
import type { Names } from "../play/render.ts";
import { createRoomTools } from "./room-tools.ts";
import type { ClientInput, LogItem, StateMessage } from "./protocol.ts";
import { chooseSeatToken, forgetToken, rememberToken, savedName, storedTokens, tabToken } from "./storage.ts";
import type { TokenCheck } from "./storage.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing #${id}`);
  return el as T;
};

const CODE = (location.pathname.split("/")[2] ?? "").toUpperCase();
const WATCH = new URLSearchParams(location.search).get("watch") === "1";
const API = `/api/rooms/${encodeURIComponent(CODE)}`;
const BASE_TITLE = document.title;

let token: string | null = null;
let last: StateMessage | null = null;
let log: LogItem[] = [];
let stopped = false;
const packs = new Map<string, CardPack>();

const setError = (msg: string): void => {
  $("error").textContent = msg;
  $("error").hidden = msg === "";
};

const authHeaders = (t: string): Record<string, string> => ({ authorization: `Bearer ${t}` });

// ------------------------------------------------------------- identity

const whoami = async (t: string): Promise<TokenCheck> => {
  try {
    const res = await fetch(`${API}/whoami`, { headers: authHeaders(t), cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Omit<TokenCheck, "status">;
    return { status: res.status, ...json };
  } catch {
    return { status: 0 };
  }
};

/** A token to play with; "retry" = the server could not be asked right now (nothing is forgotten). */
type Resolved = { kind: "token"; token: string } | { kind: "gone" } | { kind: "failed" } | { kind: "retry"; why: string };

/** This tab shares its seat with another tab of this browser: it may ask for the free seat instead. */
let sharedSeat = false;

const busyText = (status: number): string =>
  status === 429 ? "アクセスが多すぎます" : status === 0 ? "サーバーに接続できません" : `サーバーが応答しません (${status})`;

/** See chooseSeatToken (storage.ts): which stored token this tab uses, or join the room. */
const resolveToken = async (): Promise<Resolved> => {
  const choice = await chooseSeatToken({
    watch: WATCH,
    tab: tabToken(CODE),
    stored: storedTokens(CODE),
    check: whoami,
    forget: (t) => forgetToken(CODE, t),
  });
  if (choice.kind === "gone") return choice;
  if (choice.kind === "retry") return { kind: "retry", why: busyText(choice.status) };
  if (choice.kind === "use") {
    sharedSeat = choice.shared === true;
    rememberToken(CODE, choice.token, true);
    return { kind: "token", token: choice.token };
  }
  return joinRoom();
};

/** Joins the room as this tab: the free seat (or a spectator seat), with a token of its own. */
const joinRoom = async (): Promise<Resolved> => {
  let res: Response;
  try {
    res = await fetch(`${API}/join`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: savedName(), spectate: WATCH }),
    });
  } catch {
    return { kind: "retry", why: busyText(0) };
  }
  const json = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (res.status === 404) return { kind: "gone" };
  if (res.status === 429 || res.status >= 500) return { kind: "retry", why: json.error ?? busyText(res.status) };
  if (!res.ok || json.token === undefined) {
    setError(json.error ?? `参加できませんでした (${res.status})`);
    return { kind: "failed" };
  }
  sharedSeat = false;
  rememberToken(CODE, json.token, true);
  return { kind: "token", token: json.token };
};

/**
 * 「この端末で2人目として参加する」: this browser already sits in a seat and the
 * tab is only watching it; the player says so explicitly before the free seat
 * (the one the invited friend is meant to take) is filled from here.
 */
const joinSecondSeat = async (): Promise<void> => {
  const r = await joinRoom();
  if (r.kind !== "token") {
    if (r.kind === "gone") setError(GONE);
    else if (r.kind === "retry") setError(r.why);
    return;
  }
  token = r.token;
  log = [];
  last = null;
  restartStream();
};

// ---------------------------------------------------------------- table

/** An input that gets no answer in this long counts as not sent (the table gives the choice back). */
const SEND_TIMEOUT_MS = 15_000;

const send = async (input: ClientInput): Promise<boolean> => {
  const t = token;
  if (t === null) return false;
  setError("");
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/input`, {
      method: "POST",
      headers: { ...authHeaders(t), "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: abort.signal,
    });
    if (res.ok) return true;
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setError(json.error ?? `送信できませんでした (${res.status})`);
  } catch {
    setError("送信できませんでした(接続を確認してください)");
  } finally {
    clearTimeout(timer);
  }
  return false;
};

/**
 * Closes the room for everyone: the server deletes it and ends the open
 * streams. Only a seat may do this (the server refuses spectators).
 */
const closeRoom = async (): Promise<boolean> => {
  const t = token;
  if (t === null) return false;
  setError("");
  try {
    const res = await fetch(`${API}/close`, { method: "POST", headers: authHeaders(t) });
    if (res.ok || res.status === 404) return true; // already gone is the wanted end state
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    setError(json.error ?? `部屋を閉じられませんでした (${res.status})`);
  } catch {
    setError("部屋を閉じられませんでした(接続を確認してください)");
  }
  return false;
};

const askCloseRoom = async (): Promise<void> => {
  if (!window.confirm("この部屋を閉じますか? もう一度使うことはできません。")) return;
  if (!(await closeRoom())) return;
  stopped = true;
  if (token !== null) forgetToken(CODE, token);
  location.href = "/";
};

/** A button pressed once: it stays disabled until its answer (no double sends from a double click). */
const once = (b: HTMLButtonElement, act: () => Promise<unknown>): void => {
  b.addEventListener("click", () => {
    if (b.disabled) return;
    b.disabled = true;
    void act().finally(() => {
      // the next state message redraws the controls; a refusal gives this one back
      b.disabled = false;
    });
  });
};

const table = createTable($("table"), {
  send: (input: FlowInput) => send(input as ClientInput),
  extraControls: (box) => {
    const msg = last;
    if (msg === null || msg.you.role !== "player" || msg.you.seat === null || msg.game === null) return;
    const seat = msg.you.seat;
    if (msg.game.phase.kind === "over") {
      const mine = msg.room.rematch[seat];
      const theirs = msg.room.rematch[seat === 0 ? 1 : 0];
      // the server holds the rematch while a next-match proposal waits for its answer
      const held = mine && theirs && msg.room.proposal !== null;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-gold";
      b.textContent = held ? "もう一戦: 設定の提案への回答待ち" : mine ? "もう一戦: 相手を待っています" : "もう一戦(先後入れ替え)";
      b.disabled = mine;
      once(b, () => send({ type: "rematch" }));
      box.appendChild(b);
      const noteText = held
        ? msg.room.proposal?.by === seat
          ? "次の試合の設定の提案に相手が答えると始まります(取り下げても始まります)"
          : "次の試合の設定の提案に答えると始まります"
        : theirs && !mine
          ? "相手がもう一戦を希望しています"
          : "";
      if (noteText !== "") {
        const note = document.createElement("span");
        note.className = "muted";
        note.textContent = noteText;
        box.appendChild(note);
      }
      return;
    }
    const r = document.createElement("button");
    r.type = "button";
    r.className = "btn btn-quiet";
    r.textContent = "投了";
    once(r, async () => (window.confirm("投了しますか?") ? send({ type: "resign" }) : false));
    box.appendChild(r);
  },
});

const tools = createRoomTools({
  slots: table.slots,
  send,
  closeRoom: () => void askCloseRoom(),
  packOf: (name) => packs.get(name) ?? null,
  loadPack: (name) => loadPack(name),
});

const namesOf = (msg: StateMessage): Names =>
  [0, 1].map((p) => {
    const s = msg.room.seats[p];
    return `${s.name}${msg.you.seat === p ? "(あなた)" : ""}`;
  }) as Names;

const phaseText = (msg: StateMessage, names: Names): string => {
  const ph = msg.game?.phase;
  if (ph === undefined) return "";
  if (ph.kind === "mulligan") return "マリガン";
  if (ph.kind === "over") return "対局終了";
  const what = ph.kind === "discard" ? "手札整理" : ph.kind === "tansu" ? "古箪笥の選択" : ph.kind === "counterOrder" ? "反撃の順番を選択" : "行動中";
  return msg.you.seat === ph.player ? what : `${names[ph.player]}が${what}`;
};

const promptOf = (msg: StateMessage, names: Names): TablePrompt => {
  const g = msg.game;
  if (g === null) return { kind: "idle", text: "対戦相手を待っています" };
  const ph = g.phase;
  const seat = msg.you.seat;
  if (ph.kind === "over") {
    const result =
      ph.resignedBy !== null
        ? `${names[ph.resignedBy]}が投了 — ${ph.winner === null ? "" : `${names[ph.winner]}の勝ち`}`
        : ph.winner === null
          ? "引き分け"
          : `${names[ph.winner]}の勝ち`;
    return { kind: "over", text: `対局終了 — ${result}`, winner: ph.winner };
  }
  if (ph.kind === "mulligan") {
    if (seat !== null && !ph.submitted[seat]) return { kind: "mulligan" };
    return { kind: "idle", text: seat === null ? "両者のマリガン待ち" : "相手のマリガン待ち…" };
  }
  if (ph.kind === "counterOrder" && ph.player !== seat) {
    return { kind: "idle", text: seat === ph.attacker ? "相手が反撃の順番を選んでいます…" : `${names[ph.player]}が反撃の順番を選んでいます…` };
  }
  if (seat === null || ph.player !== seat) {
    const what = ph.kind === "discard" ? "手札整理中" : ph.kind === "tansu" ? "古箪笥の選択中" : "手番です";
    return { kind: "idle", text: `${names[ph.player]}の${what}…` };
  }
  if (ph.kind === "counterOrder") return { kind: "counterOrder", attackerUid: ph.action.uid, uids: ph.uids, outcomes: ph.outcomes };
  if (ph.kind === "tansu") return { kind: "tansu", uids: ph.uids };
  if (ph.kind === "discard") return { kind: "discard" };
  return { kind: "main", legal: g.legal ?? [], commands: g.commands ?? {} };
};

const loadPack = async (name: string): Promise<CardPack> => {
  const hit = packs.get(name);
  if (hit !== undefined) return hit;
  const res = await fetch(`/data/pack-${encodeURIComponent(name)}.json`);
  if (!res.ok) throw new Error(`パック ${name} を読み込めません`);
  const pack = parsePack(await res.json());
  packs.set(name, pack);
  return pack;
};

const renderRoom = (msg: StateMessage): void => {
  const r = msg.room;
  const waiting = r.status === "waiting";
  $("waiting").hidden = !waiting;
  $<HTMLInputElement>("invite").value = `${location.origin}/room/${r.code}`;
  $("waitCode").textContent = r.code;
  // this browser's seat is open in another tab too: the free seat is taken from here only when asked for
  $("second").hidden = !(waiting && sharedSeat && msg.you.role === "player" && r.seats.some((s) => !s.taken));
  // a room nobody is going to use should not keep one of this address's six slots
  $("closeRoom").hidden = msg.you.role !== "player";
  $("table").hidden = msg.game === null;
  const g = msg.game;
  const myTurn =
    g !== null && msg.you.seat !== null && g.phase.kind !== "over" &&
    (g.phase.kind === "mulligan" ? !g.phase.submitted[msg.you.seat] : g.phase.player === msg.you.seat);
  document.title = `${myTurn ? "【あなたの番】" : ""}${BASE_TITLE} ${r.code}`;
  table.slots.header.innerHTML = `<div class="brand room-brand"><a class="brand-mark" href="/" title="ロビーへ">符</a>
    <span class="room-code" title="部屋コード">${esc(r.code)}</span>
    <span class="room-seats">${([0, 1] as PlayerId[])
      .map((p) => {
        const s = r.seats[p];
        return `<span class="seat-dot o${p}${s.connected ? " on" : ""}" title="${seatWord(p)}: ${s.taken ? esc(s.name) : "空席"}${s.taken && !s.connected ? "(切断中)" : ""}"></span>`;
      })
      .join("")}<span class="muted">観戦${r.spectators}</span></span>
    <span class="room-you">${msg.you.role === "spectator" ? "観戦中" : msg.you.seat === null ? "" : `あなた: ${seatWord(msg.you.seat)}`}</span></div>`;
  tools.render(msg);
};

const renderGame = async (msg: StateMessage): Promise<void> => {
  const g = msg.game;
  if (g === null) return;
  let printed: CardPack;
  try {
    printed = await loadPack(g.pack);
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
    return;
  }
  if (last !== msg) return; // a newer message arrived while loading
  const names = namesOf(msg);
  const model: TableModel = {
    key: `${msg.room.code}-${g.matchNo}`,
    ctx: makeCtx(g.config, applyCardOverrides(printed, g.cards)),
    board: g.board,
    viewer: g.viewer,
    hand: g.hand,
    names,
    prompt: promptOf(msg, names),
    log,
    cardMods: g.cards,
    printed: (id) => printed.byId.get(id),
    phaseText: phaseText(msg, names),
  };
  table.update(model);
};

const onState = (msg: StateMessage): void => {
  if (msg.logReset) log = [];
  const lastSeq = log.length === 0 ? -1 : log[log.length - 1].seq;
  log = [...log, ...msg.log.filter((l) => l.seq > lastSeq)];
  last = msg;
  renderRoom(msg);
  void renderGame(msg);
};

// --------------------------------------------------------------- stream

const setConn = (text: string, bad: boolean): void => {
  const el = $("conn");
  el.textContent = text;
  el.className = bad ? "conn bad" : "conn";
};

/** Why the last stream could not open (the server's message), shown with the retry countdown. */
let streamRefusal = "";

/** What a restarting server says on its way out (server.ts RESTART_NOTICE). */
const RESTARTING = "サーバーを更新しています。まもなく再接続します";
/** After a "bye" the reconnect attempts keep saying "updating" for this long, not "切断". */
const RESTART_STICKY_MS = 30_000;
let restartingUntil = 0;

/** The stream being read now: aborted when this tab changes seat. */
let streamAbort: AbortController | null = null;
const restartStream = (): void => streamAbort?.abort();

const readStream = async (t: string, onLive: () => void): Promise<"retry" | "reauth" | "gone"> => {
  let res: Response;
  streamRefusal = "";
  const abort = new AbortController();
  streamAbort = abort;
  try {
    res = await fetch(`${API}/stream`, { headers: authHeaders(t), cache: "no-store", signal: abort.signal });
  } catch {
    return "retry";
  }
  if (res.status === 401) return "reauth";
  if (res.status === 404) return "gone";
  if (!res.ok || res.body === null) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    streamRefusal = json.error ?? "";
    return "retry";
  }
  setConn("", false);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return "retry";
      buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let idx = buf.indexOf("\n\n");
      while (idx !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const lines = chunk.split("\n");
        // the server is being replaced: it says so before it goes, so the page
        // shows "updating" and retries with the usual backoff instead of a bare drop
        if (lines.includes("event: bye")) {
          restartingUntil = Date.now() + RESTART_STICKY_MS;
          return "retry";
        }
        if (lines.includes("event: state")) {
          const data = lines.filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
          onLive(); // a stream that carries state is a healthy one: the retry wait starts over
          onState(JSON.parse(data) as StateMessage);
        }
        idx = buf.indexOf("\n\n");
      }
    }
  } catch {
    return "retry";
  }
};

const GONE = "部屋が見つかりません(サーバーが再起動した可能性があります)。ロビーから作り直してください。";

const run = async (): Promise<void> => {
  if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(CODE)) {
    setError("部屋コードが正しくありません");
    return;
  }
  const FIRST_DELAY = 1000;
  let delay = FIRST_DELAY;
  const wait = async (why: string): Promise<void> => {
    setConn(`${why} — ${Math.round(delay / 1000)}秒後に再接続します`, true);
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(10_000, delay * 2);
  };
  while (!stopped) {
    if (token === null) {
      const r = await resolveToken().catch((): Resolved => ({ kind: "retry", why: busyText(0) }));
      if (r.kind === "retry") {
        await wait(r.why);
        continue;
      }
      if (r.kind !== "token") {
        if (r.kind === "gone") setError(GONE);
        setConn("未接続", true);
        return;
      }
      token = r.token;
    }
    const held = token;
    // a stream that ran healthily starts the waiting over: a drop after hours is not the fifth in a row
    const outcome = await readStream(token, () => {
      delay = FIRST_DELAY;
    });
    if (token !== held) continue; // this tab took another seat: connect with the new token at once
    if (outcome === "gone") {
      setError(GONE);
      setConn("未接続", true);
      return;
    }
    if (outcome === "reauth") {
      forgetToken(CODE, token);
      token = null;
      continue;
    }
    await wait(streamRefusal !== "" ? streamRefusal : Date.now() < restartingUntil ? RESTARTING : "切断");
  }
};

once($<HTMLButtonElement>("secondJoin"), () => joinSecondSeat());
once($<HTMLButtonElement>("closeRoom"), () => askCloseRoom());
$("copy").addEventListener("click", () => {
  const inv = $<HTMLInputElement>("invite");
  inv.select();
  void navigator.clipboard?.writeText(inv.value).then(
    () => ($("copy").textContent = "コピーしました"),
    () => ($("copy").textContent = "選択済み"),
  );
});
window.addEventListener("pagehide", () => {
  stopped = true;
});
// back from the settings page, a page kept in the back-forward cache has its stream stopped: start over
window.addEventListener("pageshow", (ev) => {
  if (ev.persisted) location.reload();
});

void run();
