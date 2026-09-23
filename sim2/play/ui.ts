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
import { createFlow, submit, submitDiscardWith } from "../src/flow.ts";
import type { Flow, FlowInput } from "../src/flow.ts";
import { legalEntries } from "../src/preview.ts";
import { presetConfig } from "../src/presets.ts";
import type { PlayablePack } from "../src/presets.ts";
import { isLegal } from "../src/rules.ts";
import { decodeSettings, encodeSettings, settingsConfig, settingsPack } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import { overridesBetween } from "../src/card-overrides.ts";
import { diffPatch } from "../src/config-schema.ts";
import { makeCtx, opponent } from "../src/state.ts";
import { defaultDiscardPolicy, defaultMulliganPolicy } from "../src/turn.ts";
import { defaultTansuPolicy } from "../src/effects.ts";
import type { GameState, PlayerId } from "../src/types.ts";
import { AI_KINDS, AI_LABELS, makeAi } from "../src/ai/index.ts";
import { bestCounterOrder, MAX_REPLANS } from "../src/ai/counter-order.ts";
import { counterOrderCandidates, counterOrderOutcomes } from "../src/counter-order.ts";
import { EVAL_PROFILE_NAMES } from "../src/ai/eval.ts";
import type { AiSeat } from "../src/ai/index.ts";
import type { BoardView, LogItem } from "../online/protocol.ts";
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
import { createTable } from "./table.ts";
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

const table = createTable($("table"), {
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

// a snapshot: the flow mutates its state in place, and the table compares consecutive boards
const boardOf = (s: GameState): BoardView => ({
  units: s.units.map((u) => ({ ...u, pos: { ...u.pos } })),
  players: [0, 1].map((p) => {
    const ps = s.players[p];
    return {
      life: ps.life,
      mana: ps.mana,
      chips: ps.chips,
      reach: ps.reach,
      handCount: ps.hand.length,
      deckCount: ps.deck.length,
      grave: ps.grave.slice(),
      reshuffleCount: ps.reshuffleCount,
    };
  }) as BoardView["players"],
  turnPlayer: s.turnPlayer,
  round: s.round,
  ended: s.ended,
  winner: s.winner,
  winType: s.winType,
  summonsThisTurn: s.summonsThisTurn,
});

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

/** Plays every input the AI seat owes, with a short delay per action. */
const pump = async (g: Game): Promise<void> => {
  if (g.busy) return;
  g.busy = true;
  const aiSeat = opponent(g.human);
  try {
    for (;;) {
      if (G !== g) return;
      const f = g.flow;
      const ph = f.phase;
      if (ph.kind === "mulligan" && !ph.submitted[aiSeat]) {
        // a seat that answers for itself (strong) is asked; greedy / beam keep the engine defaults
        const choose = g.ai.mulligan ?? defaultMulliganPolicy;
        submit(f, aiSeat, { type: "mulligan", indices: choose(f.ctx, f.state, aiSeat) });
      } else if (ph.kind === "tansu" && ph.player === aiSeat) {
        const choose = g.ai.tansu ?? defaultTansuPolicy;
        submit(f, aiSeat, {
          type: "tansu",
          answers: ph.uids.map((uid) => {
            const unit = f.state.units.find((u) => u.uid === uid);
            return { uid, choice: unit === undefined ? ("mana" as const) : choose(f.ctx, f.state, unit) };
          }),
        });
      } else if (ph.kind === "counterOrder" && ph.player === aiSeat) {
        // 案A: the AI seat orders its counters the way its eval likes best
        const order = (g.ai.counterOrder ?? bestCounterOrder)(f.ctx, f.state, ph.action) ?? ph.uids;
        submit(f, aiSeat, { type: "counterOrder", order });
      } else if (ph.kind === "main" && ph.player === aiSeat) {
        await runAiTurn(g, aiSeat);
      } else if (ph.kind === "discard" && ph.player === aiSeat) {
        await sleep(AI_DELAY_MS);
        if (G !== g) return;
        submitDiscardWith(f, aiSeat, g.ai.discard ?? defaultDiscardPolicy);
      } else {
        return;
      }
      refresh();
    }
  } finally {
    g.busy = false;
  }
};

/**
 * The AI seat's main phase. The plan is taken again from the board as it is
 * whenever its next action is no longer legal (the human ordered their counters
 * differently from what the plan assumed: after a counterOrder input the pump
 * calls this afresh, so the plan is always made on the current board).
 */
const runAiTurn = async (g: Game, seat: PlayerId): Promise<void> => {
  const f = g.flow;
  let plan = g.ai.planTurn(f.ctx, f.state);
  let taken = 0;
  let replans = 0;
  while (f.phase.kind === "main") {
    const a = plan[0];
    if (a === undefined || a.kind === "pass" || taken >= f.ctx.cfg.maxActionsPerTurn) break;
    if (!isLegal(f.ctx, f.state, a)) {
      if (replans >= MAX_REPLANS) break;
      replans += 1;
      plan = g.ai.planTurn(f.ctx, f.state);
      continue;
    }
    plan = plan.slice(1);
    await sleep(AI_DELAY_MS);
    if (G !== g) return;
    submit(f, seat, { type: "action", action: a });
    taken += 1;
    refresh();
  }
  if (f.phase.kind !== "main") return;
  await sleep(AI_DELAY_MS);
  if (G !== g) return;
  submit(f, seat, { type: "action", action: { kind: "pass" } });
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

const CONTINUE_BUTTON = '<button type="button" class="btn btn-quiet" data-continue>続きから</button>';

/** The start card's 「続きから」 follows storage: another tab may have finished, moved on or started a match meanwhile. */
const syncContinue = async (): Promise<void> => {
  const dlg = $<HTMLDialogElement>("setup");
  const btns = dlg.open ? dlg.querySelector<HTMLElement>(".start-card .setup-btns") : null;
  if (btns === null || (G !== null && G.flow.phase.kind !== "over")) return;
  waiting = await loadStoredGame(stores, loadPackByName);
  const shown = btns.querySelector("button[data-continue]");
  if (canContinue() && shown === null) btns.insertAdjacentHTML("afterbegin", CONTINUE_BUTTON);
  if (!canContinue() && shown !== null) shown.remove();
};

let continuing = false;

/** 「続きから」: the match as storage has it now, not as it was when the start card opened. */
const continueStored = async (dlg: HTMLDialogElement): Promise<void> => {
  if (continuing) return;
  if (G !== null && G.flow.phase.kind !== "over") {
    dlg.close();
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
    dlg.close();
    resume(latest);
  } finally {
    continuing = false;
  }
};

const startCardHtml = (settings: GameSettings, printed: CardPack | null, problem: string): string => {
  const o = setup;
  const look = { rule: settings.rule, pack: settings.pack, cfg: settingsConfig(settings), cards: settings.cards, printed };
  return `<form method="dialog" class="setup start-card" novalidate>
    <h2>対局の準備</h2>
    <div class="setup-grid">
      <label>あなたの席<select name="seat">${option("0", "先手", o.human === 0)}${option("1", "後手", o.human === 1)}</select></label>
      <label>AI<select name="ai">${AI_KINDS.map((k) => option(k, AI_LABELS[k], o.ai === k)).join("")}</select></label>
      <label>シード<input name="seed" type="number" value="${o.seed}" inputmode="numeric"></label>
    </div>
    <details class="start-more"><summary>詳細</summary>
      <label>AIの方針<select name="eval">${EVAL_PROFILE_NAMES.map((p) => option(p, p, p === o.evalName)).join("")}</select></label>
    </details>
    ${
      o.playedSeed === null
        ? ""
        : `<label class="start-check"><input type="checkbox" name="sameSeed"> 前回と同じシード(${o.playedSeed})で配り直す</label>`
    }
    <div class="start-rules">
      <span class="start-label">ルールとカード</span>
      <span class="rules-badge">${badgeHtml(look)}</span>
      <a class="btn btn-quiet" data-edit-rules href="${esc(rulesHref({ for: "ai", s: encodeSettings(settings) }))}">ルールとカードを編集</a>
    </div>
    <details class="start-diff"><summary>基準からの変更点</summary>${diffFromPresetHtml(look)}</details>
    ${problem === "" ? "" : `<p class="err" role="alert">${esc(problem)}</p>`}
    <div class="setup-btns">
      ${canContinue() ? CONTINUE_BUTTON : ""}
      <button type="button" class="btn btn-gold" data-start>対局開始</button>
    </div>
  </form>`;
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
      $("rulesBadge").textContent = checked.error;
      return;
    }
  }
  const shown = checked.value;
  const dlg = $<HTMLDialogElement>("setup");
  dlg.className = "yy-dialog yy-start";
  dlg.innerHTML = startCardHtml(shown, checked.printed, problem);
  const form = dlg.querySelector<HTMLFormElement>("form");
  if (form === null) return;
  form.addEventListener("change", () => saveSetup(readStartForm(form)));
  form.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest("[data-edit-rules]") !== null) {
      saveSetup(readStartForm(form));
      return;
    }
    if (t.closest("button[data-continue]") !== null) {
      void continueStored(dlg);
      return;
    }
    if (t.closest("button[data-start]") !== null) {
      const o = readStartForm(form);
      const same = new FormData(form).get("sameSeed") !== null && o.playedSeed !== null;
      const seed = same && o.playedSeed !== null ? o.playedSeed : o.seed;
      saveSetup({ ...o, s: encodeSettings(shown), playedSeed: seed });
      dlg.close();
      void startGame({ id: newGameId(), settings: shown, human: o.human, ai: o.ai, evalName: o.evalName, seed });
    }
  });
  if (!dlg.open) dlg.showModal();
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
    aiLabel: label,
    settings: { ...start.settings, cards: overridesBetween(printed, flow.ctx.pack) },
    printed,
    busy: false,
    error: "",
    saved: -1,
  };
  G = g;
  waiting = null;
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
