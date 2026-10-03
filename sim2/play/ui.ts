// Local play UI: one human seat against an AI seat, entirely in the browser.
// The match runs on the same flow state machine as the online server
// (src/flow.ts) and is drawn by the shared table (play/table.ts). No rules
// logic lives here: legality comes from legalActions / commandsFor, moves go
// through flow.submit, the AI seat uses the engine AIs and default policies.
//
// The rules and cards are edited on the settings page (/rules, play/rules-page.ts):
// the start card links there (for=ai) and the match's 「ルール・カードを変える」
// too (for=ai-game). The match is stored after every accepted input
// (play/ai-store.ts), so leaving /ai or reloading it resumes the same match.
import { commandsFor } from "../src/commands.ts";
import { parsePack } from "../src/cards.ts";
import type { CardPack } from "../src/cards.ts";
import { createFlow, submit } from "../src/flow.ts";
import type { Flow, FlowInput } from "../src/flow.ts";
import { legalEntries } from "../src/preview.ts";
import { presetConfig } from "../src/presets.ts";
import type { PlayablePack } from "../src/presets.ts";
import { decodeSettings, encodeSettings, settingsConfig, settingsPack } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import { overridesBetween } from "../src/card-overrides.ts";
import { diffPatch } from "../src/config-schema.ts";
import { makeCtx, opponent } from "../src/state.ts";
import type { PlayerId } from "../src/types.ts";
import { AI_KINDS, AI_LABELS, makeAi } from "../src/ai/index.ts";
import { counterOrderCandidates, counterOrderOutcomes } from "../src/counter-order.ts";
import { EVAL_PROFILE_NAMES } from "../src/ai/eval.ts";
import type { AiSeat } from "../src/ai/index.ts";
import type { LogItem } from "../online/protocol.ts";
import {
  AI_GAME_KEY,
  clearStoredGame,
  DEFAULT_EVAL,
  defaultAiSetup,
  loadStoredGame,
  newerRecord,
  newGameId,
  readAiSetup,
  settingsToCarry,
  sharedRecordText,
  storageOr,
  storedGameOf,
  writeAiSetup,
  writeStoredGame,
} from "./ai-store.ts";
import type { AiKind, AiSetup, LoadedGame, StoredAiGame, Stores } from "./ai-store.ts";
import { decideAiMove, freshMemo, isPacedMove, playAiMove } from "./ai-seat.ts";
import type { AiMemo } from "./ai-seat.ts";
import { boardOf } from "./board-snapshot.ts";
import { createTable } from "./table.ts";
import { bindModeSwitch } from "./mode-switch.ts";
import {
  actionsHtml,
  entryPanelHtml,
  entryProblemHtml,
  entryTopHtml,
  modeSlotOf,
  moreHtml,
  quietButton,
  rulesBlockHtml,
  showEntryPage,
  showTablePage,
} from "./entry-shell.ts";
import type { TableModel, TablePrompt } from "./table.ts";
import { esc } from "./render.ts";
import { rulesHref } from "./rules-url.ts";
import { badgeHtml, diffFromPresetHtml } from "./settings-badge.ts";

const AI_DELAY_MS = 420;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing #${id}`);
  return el as T;
};
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Start = Omit<StoredAiGame, "version" | "inputs">;

type Game = {
  id: number;
  flow: Flow;
  /** What the match started with: stored with the inputs, replayed on a reload. */
  start: Start;
  human: PlayerId;
  ai: AiSeat;
  /** The AI seat's plan for its turn (play/ai-seat.ts). */
  memo: AiMemo;
  aiLabel: string;
  /** The starting settings with the cards in force (mid-game changes included), for the badge and the table. */
  settings: GameSettings;
  printed: CardPack;
  busy: boolean;
  error: string;
  /** Inputs already in storage; -1 = not stored yet, "over" = the finished match was forgotten. */
  saved: number | "over";
};

let G: Game | null = null;
let gameCounter = 0;
const PACKS = new Map<string, CardPack>();
const stores: Stores = { session: storageOr(() => sessionStorage), local: storageOr(() => localStorage) };

/** The setup page (play/entry-shell.ts) and the table: one of them is shown at a time. */
const entryEl = $("entry");
const tableEl = $("table");

const table = createTable(tableEl, {
  send: (input) => onHumanInput(input),
  extraControls: (box, m) => {
    if (m.prompt.kind === "over") {
      const again = document.createElement("button");
      again.type = "button";
      again.className = "btn btn-gold";
      again.textContent = "もう一戦";
      again.addEventListener("click", () => void openSetup());
      box.appendChild(again);
    }
    if (G !== null && G.error !== "") {
      const e = document.createElement("span");
      e.className = "err";
      e.textContent = G.error;
      box.appendChild(e);
    }
  },
});

table.slots.header.innerHTML = `<div class="brand"><span class="brand-mark" aria-hidden="true">符</span><span class="brand-name">陰陽符陣<small>(仮)</small></span><span class="brand-sub">対 AI</span></div>`;
table.slots.tools.innerHTML = `<div class="tools"><button type="button" class="rules-badge" id="rulesBadge" title="基準からの変更点">設定を選んで対局開始</button><a class="btn btn-quiet" id="changeRules" href="${rulesHref({ for: "ai-game" })}" hidden>ルール・カードを変える</a><button type="button" class="btn btn-quiet" id="newGame">新しい対局</button></div>`;
$("newGame").addEventListener("click", () => void openSetup());
$("rulesBadge").addEventListener("click", () => showDiff());

// --------------------------------------------------------------- model

const promptOf = (g: Game): TablePrompt => {
  const f = g.flow;
  const ph = f.phase;
  if (ph.kind === "over") {
    const who = f.state.winner === null ? "引き分け" : f.state.winner === g.human ? "あなたの勝ち" : "AIの勝ち";
    return { kind: "over", text: `対局終了 — ${who}`, winner: f.state.winner };
  }
  if (ph.kind === "mulligan") return ph.submitted[g.human] ? { kind: "idle", text: "AIのマリガン待ち…" } : { kind: "mulligan" };
  if (ph.kind === "counterOrder" && ph.player !== g.human) return { kind: "idle", text: "相手が反撃の順番を選んでいます…" };
  if (ph.player !== g.human) return { kind: "idle", text: "AIが考えています…" };
  if (ph.kind === "counterOrder") {
    return {
      kind: "counterOrder",
      attackerUid: ph.action.uid,
      uids: ph.uids.slice(),
      outcomes: counterOrderOutcomes(f.ctx, f.state, ph.action, counterOrderCandidates(ph.uids)),
    };
  }
  if (ph.kind === "tansu") return { kind: "tansu", uids: ph.uids };
  if (ph.kind === "discard") return { kind: "discard" };
  const legal = legalEntries(f.ctx, f.state);
  return { kind: "main", legal, commands: commandsFor(f.ctx, f.state, legal.map((e) => e.action)) };
};

const PHASE_TEXT: Record<string, string> = {
  mulligan: "マリガン",
  tansu: "古箪笥の選択",
  counterOrder: "反撃の順番",
  main: "行動中",
  discard: "手札整理",
  over: "対局終了",
};

const refresh = (): void => {
  const g = G;
  if (g === null) return;
  persist(g);
  const f = g.flow;
  const names: [string, string] = [0, 1].map((p) => (p === g.human ? "あなた" : g.aiLabel)) as [string, string];
  const log: LogItem[] = f.log
    .filter((e) => e.audience === "all" || e.audience === g.human)
    .map((e) => ({ seq: e.seq, event: e.event }));
  const model: TableModel = {
    key: `local-${g.id}`,
    ctx: f.ctx,
    board: boardOf(f.state),
    viewer: g.human,
    hand: f.state.players[g.human].hand.slice(),
    names,
    prompt: promptOf(g),
    log,
    cardMods: g.settings.cards,
    printed: (id) => g.printed.byId.get(id),
    phaseText: PHASE_TEXT[f.phase.kind] ?? "",
  };
  // nothing to change mid-game once it is over
  $("changeRules").hidden = f.phase.kind === "over";
  table.update(model);
};

// ------------------------------------------------------------- storage

/** The start card's choices (this tab); the settings are kept encoded, as in a share URL. */
let setup: AiSetup = readAiSetup(stores) ?? defaultAiSetup();

const saveSetup = (next: AiSetup): void => {
  setup = next;
  writeAiSetup(stores, next);
};

/**
 * The rules and cards a match is left with (it ended, or 「新しい対局」 from it)
 * carry over to the next start card — unless other rules were chosen on the
 * start card since this match started: those are what the start card keeps.
 */
const carryOver = (g: Game): void => {
  saveSetup({ ...setup, s: settingsToCarry(setup.s, g.start.settings, settingsInForce(g)) });
};

/** Another screen carried this match further: this tab takes that record and starts over from it. */
const adopt = (newer: StoredAiGame): void => {
  G = null;
  writeStoredGame({ session: stores.session, local: null }, newer);
  location.reload();
};

/**
 * Stores the match after every accepted input (refresh runs after each). A
 * finished match is forgotten, and the rules and cards it ended with carry
 * over to the next start card.
 */
const persist = (g: Game): void => {
  if (G !== g || g.saved === "over") return;
  if (g.flow.phase.kind === "over") {
    clearStoredGame(stores, storedGameOf(g.start, g.flow));
    g.saved = "over";
    carryOver(g);
    return;
  }
  if (g.saved === g.flow.inputs.length) return;
  const game = storedGameOf(g.start, g.flow);
  // a storage event this screen missed: the browser's copy is this match, further along
  const newer = newerRecord(sharedRecordText(stores), game);
  if (newer !== null) return adopt(newer);
  writeStoredGame(stores, game);
  g.saved = g.flow.inputs.length;
};

// ---------------------------------------------------------------- inputs

const onHumanInput = (input: FlowInput): void => {
  const g = G;
  if (g === null) return;
  const r = submit(g.flow, g.human, input);
  g.error = r.ok ? "" : `受け付けられませんでした: ${r.error}`;
  refresh();
  void pump(g);
};

/**
 * Plays every input the AI seat owes (play/ai-seat.ts decides each one, the
 * same driver the spectate page uses), with a short delay before each
 * main-phase action and the discard.
 */
const pump = async (g: Game): Promise<void> => {
  if (g.busy) return;
  g.busy = true;
  const aiSeat = opponent(g.human);
  try {
    for (;;) {
      if (G !== g) return;
      const move = decideAiMove(g.flow, aiSeat, g.ai, g.memo);
      if (move === null) return;
      if (isPacedMove(move)) {
        await sleep(AI_DELAY_MS);
        if (G !== g) return;
      }
      const r = playAiMove(g.flow, aiSeat, move, g.memo);
      if (!r.ok) {
        g.error = `AIの手が受け付けられませんでした: ${r.error}`;
        refresh();
        return;
      }
      refresh();
    }
  } finally {
    g.busy = false;
  }
};

// ------------------------------------------------------------------ setup

const loadPackByName = async (name: PlayablePack): Promise<CardPack> => {
  const hit = PACKS.get(name);
  if (hit !== undefined) return hit;
  const res = await fetch(`/data/pack-${name}.json`);
  if (!res.ok) throw new Error(`パック ${name} を読み込めません (${res.status})`);
  const pack = parsePack(await res.json());
  PACKS.set(name, pack);
  return pack;
};

/** Encoded settings checked against their printed pack. */
const checkedSettings = async (encoded: string): Promise<{ ok: true; value: GameSettings; printed: CardPack } | { ok: false; error: string }> => {
  const first = decodeSettings(encoded, null);
  if (!first.ok) return first;
  const printed = await loadPackByName(first.value.pack).catch(() => null);
  if (printed === null) return { ok: false, error: `パック ${first.value.pack} を読み込めません` };
  const checked = decodeSettings(encoded, () => printed);
  return checked.ok ? { ok: true, value: checked.value, printed } : checked;
};

const freshSeed = (): number => 1 + Math.floor(Math.random() * 999_999_999);

/** The rules and cards in force in a game, mid-game changes included. */
const settingsInForce = (g: Game): GameSettings => ({
  ...g.settings,
  config: diffPatch(presetConfig(g.settings.rule), g.flow.ctx.cfg),
  cards: overridesBetween(g.printed, g.flow.ctx.pack),
});

const option = (value: string, label: string, selected: boolean): string =>
  `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;

/** A stored match of this browser that is not the one on the table (offered as 「続きから」). */
let waiting: LoadedGame | null = null;

const canContinue = (): boolean => (G !== null && G.flow.phase.kind !== "over") || waiting !== null;

const CONTINUE_BUTTON = quietButton("data-continue", "続きから");

/** The start card's 「続きから」 follows storage: another tab may have finished, moved on or started a match meanwhile. */
const syncContinue = async (): Promise<void> => {
  const btns = entryEl.hidden ? null : entryEl.querySelector<HTMLElement>(".entry-secondary");
  if (btns === null || (G !== null && G.flow.phase.kind !== "over")) return;
  waiting = await loadStoredGame(stores, loadPackByName);
  const shown = btns.querySelector("button[data-continue]");
  if (canContinue() && shown === null) btns.insertAdjacentHTML("afterbegin", CONTINUE_BUTTON);
  if (!canContinue() && shown !== null) shown.remove();
};

let continuing = false;

/** 「続きから」: the match as storage has it now, not as it was when the start card opened. */
const continueStored = async (): Promise<void> => {
  if (continuing) return;
  if (G !== null && G.flow.phase.kind !== "over") {
    showTablePage(entryEl, tableEl);
    return;
  }
  continuing = true;
  try {
    const latest = await loadStoredGame(stores, loadPackByName);
    if (latest === null) {
      waiting = null;
      await openSetup("続きの対局はもうありません(別の画面で終わったか、消えました)");
      return;
    }
    resume(latest);
  } finally {
    continuing = false;
  }
};

const startCardHtml = (settings: GameSettings, printed: CardPack | null, problem: string): string => {
  const o = setup;
  const look = { rule: settings.rule, pack: settings.pack, cfg: settingsConfig(settings), cards: settings.cards, printed };
  const encoded = encodeSettings(settings);
  const fields = `<div class="entry-grid">
      <label>あなたの席<select name="seat" data-first>${option("0", "先手", o.human === 0)}${option("1", "後手", o.human === 1)}</select></label>
      <label>AI<select name="ai">${AI_KINDS.map((k) => option(k, AI_LABELS[k], o.ai === k)).join("")}</select></label>
    </div>
    ${moreHtml(`<label>AIの方針<select name="eval">${EVAL_PROFILE_NAMES.map((p) => option(p, p, p === o.evalName)).join("")}</select></label>
      <label>シード<input name="seed" type="number" value="${o.seed}" inputmode="numeric"></label>${
        o.playedSeed === null
          ? ""
          : `<label class="entry-check"><input type="checkbox" name="sameSeed"> 前回と同じシード(${o.playedSeed})で配り直す</label>`
      }`)}`;
  return `${entryTopHtml("ai", encoded)}${entryPanelHtml(
    "ai",
    `${fields}${rulesBlockHtml(look, rulesHref({ for: "ai", s: encoded }))}${actionsHtml("ai", problem, canContinue() ? CONTINUE_BUTTON : "")}`,
  )}`;
};

/** The start card's fields into the stored choices (kept across the settings page and reloads). */
const readStartForm = (form: HTMLFormElement): AiSetup => {
  const data = new FormData(form);
  const seed = Number(data.get("seed"));
  return {
    ...setup,
    human: String(data.get("seat")) === "1" ? 1 : 0,
    ai: AI_KINDS.find((k) => k === String(data.get("ai"))) ?? "greedy",
    evalName: EVAL_PROFILE_NAMES.find((p) => p === String(data.get("eval"))) ?? DEFAULT_EVAL,
    seed: Number.isFinite(seed) && seed !== 0 ? Math.trunc(seed) : 1,
  };
};

const openSetup = async (problem = ""): Promise<void> => {
  // another game: a new deal, and the rules as carryOver decides
  if (G !== null) {
    if (G.saved !== "over") carryOver(G);
    saveSetup({ ...setup, seed: freshSeed() });
  }
  let checked = await checkedSettings(setup.s);
  if (!checked.ok) {
    problem ||= `設定を読めないので基準に戻しました: ${checked.error}`;
    saveSetup({ ...setup, s: defaultAiSetup().s });
    checked = await checkedSettings(setup.s);
    if (!checked.ok) {
      showEntryPage(entryEl, tableEl, entryProblemHtml("ai", checked.error));
      return;
    }
  }
  const shown = checked.value;
  const form = showEntryPage(entryEl, tableEl, startCardHtml(shown, checked.printed, problem));
  if (form === null) return;
  form.addEventListener("change", () => saveSetup(readStartForm(form)));
  // leaving for 観戦 or the lobby keeps the seat, AI and seed chosen here
  bindModeSwitch(modeSlotOf(entryEl), () => saveSetup(readStartForm(form)));
  form.addEventListener("submit", (ev) => ev.preventDefault());
  form.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest("[data-edit-rules]") !== null) {
      saveSetup(readStartForm(form));
      return;
    }
    if (t.closest("button[data-continue]") !== null) {
      void continueStored();
      return;
    }
    if (t.closest("button[data-start]") !== null) {
      const o = readStartForm(form);
      const same = new FormData(form).get("sameSeed") !== null && o.playedSeed !== null;
      const seed = same && o.playedSeed !== null ? o.playedSeed : o.seed;
      saveSetup({ ...o, s: encodeSettings(shown), playedSeed: seed });
      showTablePage(entryEl, tableEl);
      void startGame({ id: newGameId(), settings: shown, human: o.human, ai: o.ai, evalName: o.evalName, seed });
    }
  });
};

const showDiff = (): void => {
  const g = G;
  if (g === null) return void openSetup();
  const dlg = $<HTMLDialogElement>("setup");
  const look = { rule: g.settings.rule, pack: g.settings.pack, cfg: g.flow.ctx.cfg, cards: g.settings.cards, printed: g.printed };
  dlg.className = "yy-dialog";
  dlg.innerHTML = `<form method="dialog" class="setup diff-dialog"><h2>この対局の設定</h2><p class="muted">${badgeHtml(look)}(基準からの違い)</p>${diffFromPresetHtml(look)}<div class="setup-btns"><button type="submit" class="btn btn-quiet" value="close">閉じる</button></div></form>`;
  dlg.showModal();
};

const renderBadge = (g: Game): void => {
  $("rulesBadge").innerHTML = badgeHtml({ rule: g.settings.rule, pack: g.settings.pack, cfg: g.flow.ctx.cfg, cards: g.settings.cards, printed: g.printed });
  $("changeRules").hidden = g.flow.phase.kind === "over";
};

const aiOf = (start: Start): { ai: AiSeat; label: string } => ({
  // the seed only perturbs exact ties, so the same match still replays identically
  ai: makeAi(start.ai, start.evalName, { seed: start.seed }),
  label: `AI ${AI_LABELS[start.ai]}`,
});

/** The table shows a match: the URL loses its ?s= (a reload resumes the match, not the start card). */
const play = (start: Start, flow: Flow, printed: CardPack): void => {
  const { ai, label } = aiOf(start);
  gameCounter += 1;
  const g: Game = {
    id: gameCounter,
    flow,
    start,
    human: start.human,
    ai,
    memo: freshMemo(),
    aiLabel: label,
    settings: { ...start.settings, cards: overridesBetween(printed, flow.ctx.pack) },
    printed,
    busy: false,
    error: "",
    saved: -1,
  };
  G = g;
  waiting = null;
  showTablePage(entryEl, tableEl);
  if (location.search !== "") history.replaceState(null, "", location.pathname);
  renderBadge(g);
  refresh();
  void pump(g);
};

const startGame = async (start: Start): Promise<void> => {
  let printed: CardPack;
  try {
    printed = await loadPackByName(start.settings.pack);
  } catch (err) {
    $("rulesBadge").textContent = err instanceof Error ? err.message : String(err);
    return;
  }
  const ctx = makeCtx(settingsConfig(start.settings), settingsPack(start.settings, printed));
  play(start, createFlow(ctx, start.seed), printed);
};

const resume = (loaded: LoadedGame): void => {
  // 「前回と同じシード」 is the deal of the match on the table
  saveSetup({ ...setup, playedSeed: loaded.game.seed });
  const { id, settings, human, ai, evalName, seed } = loaded.game;
  play({ id, settings, human, ai, evalName, seed }, loaded.flow, loaded.printed);
};

/**
 * A ?s= link (a share URL, or the settings page returning) opens the start card
 * with those settings. Otherwise this tab's stored match resumes at once; a
 * match stored by another visit is offered on the start card.
 */
const init = async (): Promise<void> => {
  const shared = new URLSearchParams(location.search).get("s");
  let problem = "";
  if (shared !== null) {
    const checked = await checkedSettings(shared);
    if (checked.ok) saveSetup({ ...setup, s: encodeSettings(checked.value) });
    else problem = `共有された設定を読めません: ${checked.error}`;
  }
  const loaded = await loadStoredGame(stores, loadPackByName);
  if (loaded !== null && loaded.fromTab && shared === null) return resume(loaded);
  waiting = loaded;
  await openSetup(problem);
};

// The same match carried further on another screen (the settings page opened in a new tab, or this
// match continued in another tab): take that record for this tab and start over from it, instead of
// writing the older match over it at the next input. Another match — one started in another tab — is
// left where it is: this tab keeps playing its own, and the start card offers the latest one.
window.addEventListener("storage", (ev) => {
  const g = G;
  if (ev.key !== AI_GAME_KEY || ev.storageArea !== stores.local) return;
  if (g === null || g.saved === "over") {
    void syncContinue();
    return;
  }
  const newer = newerRecord(ev.newValue, storedGameOf(g.start, g.flow));
  if (newer !== null) adopt(newer);
});

// a start card left open while another tab plays: 「続きから」 is looked up again when this tab comes back
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void syncContinue();
});
window.addEventListener("focus", () => void syncContinue());

// Back / Forward may show this page from the back-forward cache, with a match older than the stored one
window.addEventListener("pageshow", (ev) => {
  if (ev.persisted) location.reload();
});

void init();
