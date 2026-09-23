// The settings page (/rules): the settings panel on a page of its own. The URL
// says who opened it and where it returns (play/rules-url.ts):
//   standalone   play the AI or create a room with the settings; share them
//   for=ai       the AI table's start card            -> /ai?s=…
//   for=lobby    the lobby's room creation            -> /?s=…
//   for=ai-game  mid-game changes to the stored AI match -> /ai (the match resumes)
//   for=room     the room owner's proposal            -> /room/CODE
// 「戻る」 returns without changes; the browser's Back works as well.
import { overridesBetween } from "../src/card-overrides.ts";
import { parsePack } from "../src/cards.ts";
import type { CardPack } from "../src/cards.ts";
import { diffPatch } from "../src/config-schema.ts";
import { submit } from "../src/flow.ts";
import { presetConfig } from "../src/presets.ts";
import type { PlayablePack } from "../src/presets.ts";
import { decodeSettings, defaultSettings, encodeSettings, MAX_ENCODED } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import type { PlayerId } from "../src/types.ts";
import { loadStoredGame, restoreStoredGame, storageOr, storedGameOf, storedUnchanged, writeStoredGame } from "./ai-store.ts";
import type { Stores } from "./ai-store.ts";
import { esc } from "./cards-view.ts";
import { originHref, parseRulesRoute, rulesHref, shareHref } from "./rules-url.ts";
import type { RulesRoute } from "./rules-url.ts";
// types only (erased when served): the module itself is loaded on demand in the room mode
import type { PendingProposal, SendResult } from "../online/rules-room.ts";
import { openSettingsPanel } from "./settings-panel.ts";
import type { PanelResult } from "./settings-panel.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing #${id}`);
  return el as T;
};

const route: RulesRoute = parseRulesRoute(location.search);
const panel = $("panel");

const packs = new Map<string, CardPack>();
const loadPack = async (name: PlayablePack): Promise<CardPack> => {
  const hit = packs.get(name);
  if (hit !== undefined) return hit;
  const res = await fetch(`/data/pack-${encodeURIComponent(name)}.json`);
  if (!res.ok) throw new Error(`パック ${name} を読み込めません (${res.status})`);
  const pack = parsePack(await res.json());
  packs.set(name, pack);
  return pack;
};

const heading = (title: string, sub: string): void => {
  $("pageTitle").textContent = title;
  $("pageSub").textContent = sub;
  document.title = `陰陽符陣(仮) ${title}`;
};

const notice = (text: string): void => {
  $("notice").textContent = text;
  $("notice").hidden = text === "";
};

/** Instead of the panel: why nothing can be edited here, and the way back. */
const message = (title: string, text: string): void => {
  panel.innerHTML = `<section class="rp-message" role="status"><h2>${esc(title)}</h2><p>${esc(text)}</p><p><a class="btn btn-quiet" data-back href="${esc(backHref())}">戻る</a></p></section>`;
};

/** The route when its settings live in the URL (s=), where edits are kept so Back and reload find them; else null. */
const urlRoute = (): Extract<RulesRoute, { for: "standalone" | "ai" | "lobby" }> | null =>
  route.for === "standalone" || route.for === "ai" || route.for === "lobby" ? route : null;

/**
 * The settings the page was opened with (s=), as the origin had them. The URL
 * follows the edits, so the original is kept in the history entry's state
 * (which survives a reload and Back).
 */
const held = history.state as { openedWith?: string | null } | null;
const OPENED_WITH: string | null =
  held !== null && typeof held === "object" && "openedWith" in held ? (held.openedWith ?? null) : (urlRoute()?.s ?? null);

const openedWith = (): string | null => OPENED_WITH;

const backHref = (): string => originHref(route, openedWith());

/**
 * Keeps the edited settings in this page's URL (replacing the entry, so Back
 * still leaves the page). A reload, the browser's Back from where the settings
 * were taken, or a shared link then all show the same edits.
 */
const keepInUrl = (encoded: string): void => {
  const r = urlRoute();
  if (r === null) return;
  if (encoded.length > MAX_ENCODED) return; // too long for a URL: the panel keeps it, the URL stays as it was
  history.replaceState({ openedWith: OPENED_WITH }, "", rulesHref({ for: r.for, s: encoded }));
};

/** Going back to the origin replaces this page in the history: Back from there does not reopen the editor. */
const leave = (href: string): void => location.replace(href);

// ------------------------------------------------------------ settings modes

/** s= validated against its printed pack; defaults (and a notice) when it cannot be read. */
const settingsFromUrl = async (s: string | null): Promise<GameSettings> => {
  if (s === null) return defaultSettings();
  const first = decodeSettings(s, null);
  const printed = first.ok ? await loadPack(first.value.pack).catch(() => null) : null;
  const checked = first.ok ? decodeSettings(s, () => printed) : first;
  if (checked.ok) return checked.value;
  notice(`共有された設定を読めません(基準の設定で開きました): ${checked.error}`);
  return defaultSettings();
};

/**
 * Is the online server here (rooms)? Its home page is the lobby; the local
 * play server's is the AI table (asked this way so neither answers 404).
 */
const onlineHere = async (): Promise<boolean> => {
  try {
    const res = await fetch("/", { cache: "no-store" });
    return res.ok && (await res.text()).includes("/online/lobby.ts");
  } catch {
    return false;
  }
};

const openSettingsMode = async (r: Extract<RulesRoute, { for: "standalone" | "ai" | "lobby" }>): Promise<void> => {
  const settings = await settingsFromUrl(r.s);
  const actions =
    r.for === "standalone"
      ? [{ id: "ai", label: "この設定で対AI", primary: true }, ...((await onlineHere()) ? [{ id: "room", label: "この設定で部屋を作る" }] : [])]
      : [{ id: "use", label: r.for === "ai" ? "この設定で対局の準備へ" : "この設定で部屋の準備へ", primary: true }];
  if (r.for === "standalone") heading("ルールとカード", "変数とカードを決めて、対AIで試すか部屋を作ります。共有URLで同じ設定を渡せます。");
  if (r.for === "ai") heading("対AIのルールとカード", "対局の準備に戻ると、この設定で始められます。");
  if (r.for === "lobby") heading("部屋のルールとカード", "部屋を作る画面に戻ると、この設定で部屋を作れます。");
  await openSettingsPanel(panel, {
    mode: "setup",
    settings,
    actions,
    allowRuleAndPack: true,
    loadPack,
    shareUrl: (enc) => shareHref(location.origin, r, enc),
    onChange: (_next, enc) => keepInUrl(enc),
    onSubmit: ({ action, settings: next }: PanelResult) => {
      const enc = encodeSettings(next);
      if (r.for !== "standalone") return leave(originHref(r, enc));
      // standalone: a new step forward (Back returns to this page)
      location.assign(action === "room" ? `/?s=${enc}` : `/ai?s=${enc}`);
    },
  });
};

// ------------------------------------------------------------- AI match mode

const openAiGameMode = async (): Promise<void> => {
  heading("ルールとカードを変える(対AIの対局中)", "反映すると対局に戻り、次の操作から新しいルールとカードで続きます。");
  const stores: Stores = { session: storageOr(() => sessionStorage), local: storageOr(() => localStorage) };
  const loaded = await loadStoredGame(stores, loadPack);
  if (loaded === null) {
    return message("続きの対局がありません", "このブラウザに、続けられる対AIの対局が保存されていません(終わった対局のルールは変えられません)。");
  }
  const { game: start, flow, printed, fromTab } = loaded;
  const cfg = flow.ctx.cfg;
  const cardsNow = overridesBetween(printed, flow.ctx.pack);
  await openSettingsPanel(panel, {
    mode: "midgame",
    settings: { ...start.settings, config: diffPatch(presetConfig(start.settings.rule), cfg), cards: cardsNow },
    current: cfg,
    currentCards: cardsNow,
    actions: [{ id: "apply", label: "次の操作から反映して対局に戻る", primary: true }],
    allowRuleAndPack: false,
    loadPack,
    shareUrl: null,
    onSubmit: ({ patch, cardEdits }: PanelResult) => {
      // another screen (the table in another tab) moved the match on meanwhile: do not write an older match over it
      if (!storedUnchanged(stores, start, fromTab)) throw new Error("この対局は別の画面で進みました。対局の画面から開き直してください");
      // applied to a fresh replay each time, so a refused change leaves nothing half-applied
      const again = restoreStoredGame(start, printed);
      if (!again.ok) throw new Error("保存された対局を再現できませんでした");
      const f = again.value;
      if (Object.keys(patch).length > 0) {
        const r = submit(f, start.human, { type: "config", patch });
        if (!r.ok) throw new Error(`ルールを変えられませんでした: ${r.error}`);
      }
      if (Object.keys(cardEdits).length > 0) {
        const r = submit(f, start.human, { type: "cards", edits: cardEdits });
        if (!r.ok) throw new Error(`カードを変えられませんでした: ${r.error}`);
      }
      if (!writeStoredGame(stores, storedGameOf(start, f))) throw new Error("ブラウザに保存できませんでした(保存領域が使えません)");
      leave("/ai");
    },
  });
};

// ----------------------------------------------------------------- room mode

/** The page's own area above the panel: what is waiting for the opponent's answer. */
const pendingBox = $("pending");

const MINUTE = 60_000;

/** 「3分前に提案しました」 — the server's clock, so a browser clock that is off never shows a negative age. */
const agoText = (at: number): string => {
  const ms = Date.now() - at;
  if (at <= 0 || ms < MINUTE) return "たった今提案しました";
  const minutes = Math.floor(ms / MINUTE);
  return `${minutes >= 60 ? "1時間以上前" : `${minutes}分前`}に提案しました`;
};

const showPending = (p: PendingProposal | null, onWithdraw: () => void): void => {
  pendingBox.hidden = p === null;
  if (p === null) {
    pendingBox.innerHTML = "";
    return;
  }
  const what = p.scope === "now" ? "試合中のルール・カード変更" : "次の試合の設定";
  const lines = p.lines.length === 0 ? "<li>(内容を読み取れませんでした)</li>" : p.lines.map((l) => `<li>${esc(l)}</li>`).join("");
  pendingBox.innerHTML = `<h2>提案中: ${esc(what)}</h2>
    <p class="muted">${esc(agoText(p.at))}。相手の回答を待っています。</p>
    <ul class="rp-pending-list">${lines}</ul>
    <p class="muted">下で提案し直すと、この提案と置き換わります(相手には差し替えたことが伝わります)。</p>
    <p><button type="button" class="btn btn-quiet" id="withdraw">この提案を取り下げる</button></p>`;
  $("withdraw").addEventListener("click", onWithdraw, { once: true });
};

type RoomCarry = { settings?: GameSettings; notice: string };

const openRoomMode = async (code: string, seat: PlayerId | null, carry?: RoomCarry): Promise<void> => {
  heading("部屋のルールとカード", `部屋 ${code}`);
  const unavailable = (): void => message("部屋の設定は開けません", "このサーバーではオンラインの部屋を扱っていません。");
  if (!(await onlineHere())) return unavailable();
  let mod: typeof import("../online/rules-room.ts");
  try {
    mod = await import("../online/rules-room.ts");
  } catch {
    return unavailable();
  }
  notice(carry?.notice ?? "");
  const room = await mod.roomForRules(code, seat);
  if (room.kind === "denied") {
    showPending(null, () => {});
    return message("ルールとカードを変えられません", room.text);
  }
  const { msg, token } = room;
  const g = msg.game;
  const back = (): void => leave(`/room/${code}`);
  const pending = mod.pendingProposal(msg);
  const withdraw = (): void => {
    void (async () => {
      if (pending === null) return;
      const r = await mod.sendRoomInput(code, token, { type: "withdraw", id: pending.id });
      await openRoomMode(code, seat, { notice: r.ok ? "提案を取り下げました。" : r.error });
    })();
  };
  showPending(pending, withdraw);
  const replaces = pending === null ? {} : { replaces: pending.id };
  const label = (plain: string, replace: string): string => (pending === null ? plain : replace);
  /** The room moved on while this page was open (match over, rematch started, another proposal): show it as it is now. */
  const refusal = async (r: Exclude<SendResult, { ok: true }>, keep?: GameSettings): Promise<void> => {
    if (r.status !== 409) throw new Error(r.error);
    await openRoomMode(code, seat, { settings: keep, notice: `${r.error}(部屋の今の状態で開き直しました)` });
  };
  if (g !== null && g.phase.kind !== "over") {
    heading("ルール・カードの変更を提案(試合中)", `部屋 ${code} — 相手が同意すると、次の操作から反映されます。`);
    await openSettingsPanel(panel, {
      mode: "midgame",
      settings: { rule: g.rule, pack: g.pack as PlayablePack, config: diffPatch(presetConfig(g.rule), g.config), cards: g.cards },
      current: g.config,
      currentCards: g.cards,
      actions: [{ id: "propose", label: label("この変更を相手に提案", "この内容で提案を置き換える"), primary: true }],
      allowRuleAndPack: false,
      loadPack,
      shareUrl: null,
      onSubmit: async ({ patch, cardEdits, settings }: PanelResult) => {
        const r = await mod.sendRoomInput(code, token, { type: "propose", scope: "now", patch, cards: cardEdits, ...replaces });
        // the match ended meanwhile: the edits move to the next match's settings
        if (!r.ok) return refusal(r, settings);
        back();
      },
    });
    return;
  }
  heading("次の試合の設定を提案", `部屋 ${code} — 相手が同意すると、次の試合からこの設定になります。`);
  await openSettingsPanel(panel, {
    mode: "between",
    settings: carry?.settings ?? msg.room.settings,
    actions: [{ id: "propose", label: label("次の試合の設定として提案", "この設定で提案を置き換える"), primary: true }],
    allowRuleAndPack: true,
    loadPack,
    shareUrl: (enc) => shareHref(location.origin, route, enc),
    onSubmit: async ({ settings }: PanelResult) => {
      const r = await mod.sendRoomInput(code, token, { type: "propose", scope: "next", settings, ...replaces });
      if (!r.ok) return refusal(r);
      back();
    },
  });
};

// ---------------------------------------------------------------------- init

/** 「戻る」 (the header's, or a message's): to the origin without changes. */
const goBack = (ev: MouseEvent): void => {
  if (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  ev.preventDefault();
  // standalone has no origin: the previous page if there is one, else home
  if (route.for === "standalone" || route.for === "bad") {
    if (history.length > 1) history.back();
    else location.assign("/");
    return;
  }
  leave(backHref());
};

const init = async (): Promise<void> => {
  // the entry remembers what the page was opened with, so 「戻る」 still goes back without the edits
  history.replaceState({ openedWith: OPENED_WITH }, "", location.href);
  const back = $<HTMLAnchorElement>("back");
  back.href = backHref();
  back.addEventListener("click", goBack);
  panel.addEventListener("click", (ev) => {
    if ((ev.target as HTMLElement).closest("a[data-back]") !== null) goBack(ev);
  });
  switch (route.for) {
    case "bad":
      return message("このページを開けません", route.error);
    case "ai-game":
      return openAiGameMode();
    case "room":
      return openRoomMode(route.code, route.seat);
    default:
      return openSettingsMode(route);
  }
};

// a page restored from the back-forward cache would show a stale match or a submit in progress
window.addEventListener("pageshow", (ev) => {
  if (ev.persisted) location.reload();
});

init().catch((err: unknown) => {
  message("読み込めませんでした", err instanceof Error ? err.message : String(err));
});
