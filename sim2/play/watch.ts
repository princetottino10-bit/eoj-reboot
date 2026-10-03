// 観戦モード (/watch): two AIs play each other on the shared table, one
// visible step at a time, slowly enough to follow. The match runs on the same
// flow and the same AI seat driver as the AI table (play/watch-core.ts,
// play/ai-seat.ts); this page only draws it, paces it and takes the
// controls. The rules and cards come from the AI table's start card (?s=).
import { parsePack } from "../src/cards.ts";
import type { CardPack } from "../src/cards.ts";
import { AI_KINDS, AI_LABELS, makeAi } from "../src/ai/index.ts";
import type { AiKind } from "../src/ai/index.ts";
import type { PlayablePack } from "../src/presets.ts";
import { decodeSettings, encodeSettings, settingsConfig, settingsPack } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import { overridesBetween } from "../src/card-overrides.ts";
import { makeCtx } from "../src/state.ts";
import type { LogItem } from "../online/protocol.ts";
import { DEFAULT_EVAL, defaultAiSetup, readAiSetup, storageOr } from "./ai-store.ts";
import type { Stores } from "./ai-store.ts";
import { boardOf } from "./board-snapshot.ts";
import { esc, seatWord } from "./render.ts";
import { bindModeSwitch } from "./mode-switch.ts";
import {
  actionsHtml,
  entryPanelHtml,
  entryProblemHtml,
  entryShown,
  entryTopHtml,
  modeSlotOf,
  moreHtml,
  quietButton,
  rulesBlockHtml,
  showEntryPage,
  showTablePage,
} from "./entry-shell.ts";
import { rulesHref } from "./rules-url.ts";
import { badgeHtml, diffFromPresetHtml } from "./settings-badge.ts";
import { createTable } from "./table.ts";
import type { TableModel, TablePrompt } from "./table.ts";
import {
  createRunner,
  createWatchGame,
  defaultWatchSetup,
  nextSeat,
  nextThinks,
  parseWatchSetup,
  playWatchStep,
  SPEED_LABELS,
  SPEEDS,
  WATCH_SETUP_KEY,
  watchNames,
} from "./watch-core.ts";
import type { Runner, RunnerView, WatchGame, WatchSetup, WatchStep } from "./watch-core.ts";
import type { WatchLevel } from "./watch-text.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing #${id}`);
  return el as T;
};

const stores: Stores = { session: storageOr(() => sessionStorage), local: storageOr(() => localStorage) };

// ------------------------------------------------------------------ setup

const readSetup = (): WatchSetup | null => {
  try {
    const text = stores.session?.getItem(WATCH_SETUP_KEY) ?? null;
    return text === null ? null : parseWatchSetup(JSON.parse(text));
  } catch {
    return null;
  }
};

let setup: WatchSetup = readSetup() ?? defaultWatchSetup((readAiSetup(stores) ?? defaultAiSetup()).s);

const saveSetup = (next: WatchSetup): void => {
  setup = next;
  try {
    stores.session?.setItem(WATCH_SETUP_KEY, JSON.stringify(next));
  } catch {
    // unavailable storage: the choices last as long as the page
  }
};

const PACKS = new Map<string, CardPack>();

const loadPackByName = async (name: PlayablePack): Promise<CardPack> => {
  const hit = PACKS.get(name);
  if (hit !== undefined) return hit;
  const res = await fetch(`/data/pack-${name}.json`);
  if (!res.ok) throw new Error(`パック ${name} を読み込めません (${res.status})`);
  const pack = parsePack(await res.json());
  PACKS.set(name, pack);
  return pack;
};

type Checked = { ok: true; value: GameSettings; printed: CardPack } | { ok: false; error: string };

/** Encoded settings checked against their printed pack. */
const checkedSettings = async (encoded: string): Promise<Checked> => {
  const first = decodeSettings(encoded, null);
  if (!first.ok) return first;
  const printed = await loadPackByName(first.value.pack).catch(() => null);
  if (printed === null) return { ok: false, error: `パック ${first.value.pack} を読み込めません` };
  const checked = decodeSettings(encoded, () => printed);
  return checked.ok ? { ok: true, value: checked.value, printed } : checked;
};

// ------------------------------------------------------------------ state

type Watch = {
  id: number;
  game: WatchGame;
  settings: GameSettings;
  printed: CardPack;
  ais: [AiKind, AiKind];
  seed: number;
  names: [string, string];
  runner: Runner;
  last: WatchStep | null;
  history: WatchStep[];
  thinking: boolean;
  error: string;
};

let W: Watch | null = null;
let counter = 0;

/** The setup page (play/entry-shell.ts) and the table: one of them is shown at a time. */
const entryEl = $("entry");
const tableEl = $("table");

const table = createTable(tableEl, {
  // a spectator never sends an input
  send: () => undefined,
  extraControls: (box, m) => {
    if (m.prompt.kind !== "over" || W === null) return;
    const again = document.createElement("button");
    again.type = "button";
    again.className = "btn btn-gold";
    again.textContent = "もう一度観戦";
    again.addEventListener("click", () => void begin({ ...setup, seed: freshSeed() }));
    const replay = document.createElement("button");
    replay.type = "button";
    replay.className = "btn btn-quiet";
    replay.textContent = "同じ対局を最初から";
    replay.addEventListener("click", () => restart());
    box.append(again, replay);
  },
});

table.slots.header.innerHTML = `<div class="brand"><span class="brand-mark" aria-hidden="true">符</span><span class="brand-name">陰陽符陣<small>(仮)</small></span><span class="brand-sub">観戦</span></div>`;
table.slots.tools.innerHTML = `<div class="tools"><button type="button" class="rules-badge" id="rulesBadge" title="基準からの変更点"></button><button type="button" class="btn btn-quiet" id="restart">最初から</button><button type="button" class="btn btn-quiet" id="reSetup">設定を変える</button><a class="btn btn-quiet" href="/ai">AIと対戦へ</a></div>`;
$("restart").addEventListener("click", () => restart());
$("reSetup").addEventListener("click", () => void openSetup());
$("rulesBadge").addEventListener("click", () => showDiff());

// the control bar and the caption live in the notice slot above the board
table.slots.notice.innerHTML = `<div class="wt">
  <div class="wt-bar">
    <button type="button" class="btn btn-gold wt-toggle" data-w="toggle" aria-keyshortcuts="Space">一時停止</button>
    <button type="button" class="btn wt-step" data-w="step" aria-keyshortcuts="ArrowRight" disabled>一手進める</button>
    <span class="wt-speed" role="group" aria-label="速さ">${SPEEDS.map((s) => `<button type="button" class="btn btn-quiet" data-w="speed" data-speed="${s}" aria-pressed="false">${SPEED_LABELS[s]}</button>`).join("")}</span>
    <label class="wt-hands"><input type="checkbox" data-w="hands"> 手札を見る</label>
    <span class="wt-status" aria-live="polite"></span>
  </div>
  <div class="wt-cap">
    <p class="wt-banner" hidden></p>
    <ul class="wt-subs"></ul>
  </div>
  <details class="wt-hist"><summary>これまでの実況(<span class="wt-count">0</span>手)</summary><ol class="wt-hist-list"></ol></details>
  <p class="err wt-err" role="alert" hidden></p>
</div>`;

const notice = table.slots.notice;
const q = <T extends HTMLElement>(sel: string): T => {
  const el = notice.querySelector<T>(sel);
  if (el === null) throw new Error(`missing ${sel}`);
  return el;
};
const ui = {
  toggle: q<HTMLButtonElement>(".wt-toggle"),
  step: q<HTMLButtonElement>(".wt-step"),
  hands: q<HTMLInputElement>('input[data-w="hands"]'),
  status: q(".wt-status"),
  banner: q(".wt-banner"),
  subs: q(".wt-subs"),
  count: q(".wt-count"),
  hist: q(".wt-hist-list"),
  err: q(".wt-err"),
};

// ------------------------------------------------------------------ drawing

const PHASE_TEXT: Record<string, string> = {
  mulligan: "マリガン",
  tansu: "古箪笥の選択",
  counterOrder: "反撃の順番",
  lantern: "灯籠の精の灯",
  kyonshi: "僵尸公主の向き",
  main: "行動中",
  discard: "手札整理",
  over: "対局終了",
};

const promptOf = (w: Watch): TablePrompt => {
  const f = w.game.flow;
  if (f.phase.kind === "over") {
    const who = f.state.winner === null ? "引き分け" : `${w.names[f.state.winner]}の勝ち`;
    return { kind: "over", text: `対局終了 — ${who}`, winner: f.state.winner };
  }
  const main = w.last?.lines.find((l) => l.tone === "main")?.text;
  return { kind: "idle", text: main ?? "対局の準備ができました" };
};

const modelOf = (w: Watch): TableModel => {
  const f = w.game.flow;
  const log: LogItem[] = f.log.filter((e) => e.audience === "all").map((e) => ({ seq: e.seq, event: e.event }));
  return {
    key: `watch-${w.id}`,
    ctx: f.ctx,
    board: boardOf(f.state),
    viewer: null,
    hand: setup.hands ? f.state.players[0].hand.slice() : null,
    oppHand: setup.hands ? f.state.players[1].hand.slice() : null,
    names: w.names,
    prompt: promptOf(w),
    log,
    cardMods: w.settings.cards,
    printed: (id) => w.printed.byId.get(id),
    phaseText: PHASE_TEXT[f.phase.kind] ?? "",
    spot: w.last === null ? null : { actor: w.last.actor, targets: w.last.targets },
  };
};

const lineHtml = (text: string, tone: string): string => `<li class="wt-${tone}">${esc(text)}</li>`;

/** The caption of the latest step (the action itself is the prompt under the board). */
const drawCaption = (w: Watch): void => {
  const s = w.last;
  const key = s !== null && s.level !== "normal" && s.banner !== null;
  ui.banner.hidden = !key;
  if (key && s !== null && s.banner !== null && ui.banner.textContent !== s.banner) {
    ui.banner.textContent = s.banner;
    ui.banner.dataset.level = s.level;
    // restart the entrance (a fresh element restarts the CSS animation)
    ui.banner.classList.remove("is-in");
    void ui.banner.offsetWidth;
    ui.banner.classList.add("is-in");
  }
  // the action is the prompt under the board and the headline is the banner: the rest is said here
  const bare = (t: string): string => t.replace(/^(──|◆)\s*/, "").replace(/(収入\+\d+)$/, "");
  const first = s === null ? -1 : s.lines.findIndex((x) => x.tone === "main");
  const rest = s === null ? [] : s.lines.filter((l, i) => i !== first && !(key && bare(l.text) === s.banner));
  ui.subs.innerHTML = rest.map((l) => lineHtml(l.text, l.tone)).join("");
  ui.count.textContent = String(w.history.length);
};

const addHistory = (s: WatchStep): void => {
  const li = document.createElement("li");
  li.className = `wt-h wt-h-${s.level}`;
  li.innerHTML = `<ol>${s.lines.map((l) => lineHtml(l.text, l.tone)).join("")}</ol>`;
  ui.hist.prepend(li);
};

const drawControls = (v: RunnerView): void => {
  const w = W;
  ui.toggle.textContent = v.over ? "終了" : v.paused ? "再開" : "一時停止";
  ui.toggle.disabled = v.over;
  ui.toggle.setAttribute("aria-pressed", String(v.paused));
  ui.step.disabled = !v.paused || v.busy || v.over;
  for (const b of notice.querySelectorAll<HTMLButtonElement>('button[data-w="speed"]')) {
    b.setAttribute("aria-pressed", String(b.dataset.speed === v.speed));
    b.classList.toggle("is-on", b.dataset.speed === v.speed);
  }
  ui.hands.checked = setup.hands;
  const who = w === null ? null : nextSeat(w.game.flow);
  ui.status.textContent =
    w !== null && w.thinking && who !== null
      ? `${seatWord(who)}が考え中…`
      : v.over
        ? "対局終了"
        : v.paused
          ? "一時停止中(→ で一手ずつ)"
          : "";
  ui.status.classList.toggle("is-thinking", w !== null && w.thinking);
  ui.err.hidden = w === null || w.error === "";
  ui.err.textContent = w?.error ?? "";
};

const redraw = (w: Watch): void => {
  if (W !== w) return;
  table.update(modelOf(w));
  drawCaption(w);
  drawControls(w.runner.view());
};

// --------------------------------------------------------------- running

/** Lets the browser paint (the 「考え中」 mark shows before the AI blocks the page to think). */
const paint = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** One step: think (with the mark up when it plans), play, draw. */
const nextStep = async (w: Watch): Promise<WatchLevel | null> => {
  if (W !== w) return null;
  if (nextThinks(w.game)) {
    w.thinking = true;
    drawControls(w.runner.view());
    await paint();
  }
  let step: WatchStep | null;
  try {
    step = playWatchStep(w.game);
  } finally {
    w.thinking = false;
  }
  if (W !== w) return null;
  if (step !== null) {
    w.last = step;
    w.history.push(step);
    addHistory(step);
  }
  redraw(w);
  return step === null ? null : step.level;
};

const freshSeed = (): number => 1 + Math.floor(Math.random() * 999_999_999);

const renderBadge = (w: Watch): void => {
  $("rulesBadge").innerHTML = badgeHtml({ rule: w.settings.rule, pack: w.settings.pack, cfg: w.game.flow.ctx.cfg, cards: w.settings.cards, printed: w.printed });
};

/** Starts a spectated match with these choices (its settings checked first). */
const begin = async (choice: WatchSetup): Promise<void> => {
  const checked = await checkedSettings(choice.s);
  if (!checked.ok) return openSetup(`設定を読めません: ${checked.error}`);
  saveSetup(choice);
  W?.runner.stop();
  resumeOnClose = false;
  showTablePage(entryEl, tableEl);
  const settings = checked.value;
  const printed = checked.printed;
  const ctx = makeCtx(settingsConfig(settings), settingsPack(settings, printed));
  // the seed also perturbs the strong AI's exact ties, so a seed replays the same match
  const ais: [AiKind, AiKind] = [choice.ais[0], choice.ais[1]];
  const game = createWatchGame(ctx, choice.seed, [
    makeAi(ais[0], DEFAULT_EVAL, { seed: choice.seed }),
    makeAi(ais[1], DEFAULT_EVAL, { seed: choice.seed + 1 }),
  ]);
  counter += 1;
  const w: Watch = {
    id: counter,
    game,
    settings: { ...settings, cards: overridesBetween(printed, ctx.pack) },
    printed,
    ais,
    seed: choice.seed,
    names: watchNames(ais),
    runner: null as unknown as Runner,
    last: null,
    history: [],
    thinking: false,
    error: "",
  };
  w.runner = createRunner({
    next: () => nextStep(w),
    now: () => performance.now(),
    sleep,
    settleMs: () => table.animatingMs(),
    speed: choice.speed,
    onChange: (v) => {
      if (W === w) drawControls(v);
    },
    onError: (err) => {
      w.error = `止まりました: ${err instanceof Error ? err.message : String(err)}`;
      if (W === w) drawControls(w.runner.view());
    },
  });
  W = w;
  ui.hist.innerHTML = "";
  if (location.search !== "") history.replaceState(null, "", location.pathname);
  renderBadge(w);
  redraw(w);
  void w.runner.run();
};

/** 最初から: the same match (same settings, AIs and seed) from its deal. */
const restart = (): void => {
  const w = W;
  if (w === null) return void openSetup();
  void begin({ ...setup, s: encodeSettings(w.settings), ais: w.ais, seed: w.seed });
};

// ---------------------------------------------------------------- controls

notice.addEventListener("click", (ev) => {
  const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-w]");
  const w = W;
  if (t === null || w === null) return;
  const act = t.dataset.w;
  if (act === "toggle") w.runner.toggle();
  else if (act === "step") void w.runner.step();
  else if (act === "speed") {
    const s = SPEEDS.find((x) => x === t.dataset.speed);
    if (s === undefined) return;
    w.runner.setSpeed(s);
    saveSetup({ ...setup, speed: s });
  }
});

ui.hands.addEventListener("change", () => {
  saveSetup({ ...setup, hands: ui.hands.checked });
  if (W !== null) redraw(W);
});

const typing = (t: EventTarget | null): boolean =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);

// Space: pause / resume; →: one step (pausing first). Buttons would also take Space on key-up: that is swallowed.
document.addEventListener("keydown", (ev) => {
  const w = W;
  if (w === null || typing(ev.target) || document.querySelector("dialog[open]") !== null || entryShown(entryEl) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.key === " " || ev.code === "Space") {
    ev.preventDefault();
    if (!ev.repeat) w.runner.toggle();
  } else if (ev.key === "ArrowRight") {
    ev.preventDefault();
    if (!w.runner.view().paused) w.runner.pause();
    void w.runner.step();
  }
});
document.addEventListener("keyup", (ev) => {
  if ((ev.key === " " || ev.code === "Space") && !typing(ev.target) && document.querySelector("dialog[open]") === null && !entryShown(entryEl))
    ev.preventDefault();
});

// --------------------------------------------------------------- the card

const option = (value: string, label: string, selected: boolean): string =>
  `<option value="${esc(value)}"${selected ? " selected" : ""}>${esc(label)}</option>`;

/** `first`: the field the page focuses when it opens (not the mode switch above it). */
const aiSelect = (name: string, chosen: AiKind, first = false): string =>
  `<select name="${name}"${first ? " data-first" : ""}>${AI_KINDS.map((k) => option(k, AI_LABELS[k], k === chosen)).join("")}</select>`;

const readForm = (form: HTMLFormElement): WatchSetup => {
  const data = new FormData(form);
  const kind = (v: FormDataEntryValue | null): AiKind => AI_KINDS.find((k) => k === String(v)) ?? "greedy";
  const seed = Number(data.get("seed"));
  return {
    ...setup,
    ais: [kind(data.get("ai0")), kind(data.get("ai1"))],
    seed: Number.isFinite(seed) && seed !== 0 ? Math.trunc(seed) : 1,
    speed: SPEEDS.find((s) => s === String(data.get("speed"))) ?? "normal",
    hands: data.get("hands") !== null,
  };
};

/** A match left running when the setup page opened goes on when the page is closed without starting another. */
let resumeOnClose = false;

const closeSetup = (): void => {
  showTablePage(entryEl, tableEl);
  const w = W;
  if (w !== null && resumeOnClose) w.runner.resume();
  resumeOnClose = false;
};

const setupHtml = (shown: GameSettings, printed: CardPack, problem: string): string => {
  const look = { rule: shown.rule, pack: shown.pack, cfg: settingsConfig(shown), cards: shown.cards, printed };
  const o = setup;
  const encoded = encodeSettings(shown);
  const fields = `<div class="entry-grid entry-grid-3">
      <label>先手のAI${aiSelect("ai0", o.ais[0], true)}</label>
      <label>後手のAI${aiSelect("ai1", o.ais[1])}</label>
      <label>速さ<select name="speed">${SPEEDS.map((s) => option(s, SPEED_LABELS[s], s === o.speed)).join("")}</select></label>
    </div>
    <label class="entry-check"><input type="checkbox" name="hands"${o.hands ? " checked" : ""}> 両者の手札を見る</label>
    ${moreHtml(`<label>シード<span class="entry-inline"><input name="seed" type="number" value="${o.seed}" inputmode="numeric"><button type="button" class="btn btn-quiet" data-newseed>新しいシード</button></span></label>`)}`;
  // the rules are edited through the AI table's settings flow (for=ai), as the AI screen does
  return `${entryTopHtml("watch", encoded)}${entryPanelHtml(
    "watch",
    `${fields}${rulesBlockHtml(look, rulesHref({ for: "ai", s: encoded }))}${actionsHtml("watch", problem, W === null ? "" : quietButton("data-close", "観戦中の対局に戻る"))}`,
  )}`;
};

const openSetup = async (problem = ""): Promise<void> => {
  let checked = await checkedSettings(setup.s);
  if (!checked.ok) {
    problem ||= `設定を読めないので基準に戻しました: ${checked.error}`;
    saveSetup({ ...setup, s: defaultAiSetup().s });
    checked = await checkedSettings(setup.s);
    if (!checked.ok) {
      showEntryPage(entryEl, tableEl, entryProblemHtml("watch", checked.error));
      return;
    }
  }
  const shown = checked.value;
  // the match on the table waits while its setup page is up
  const w = W;
  if (w !== null && entryEl.hidden) {
    const v = w.runner.view();
    resumeOnClose = !v.paused && !v.over;
    if (resumeOnClose) w.runner.pause();
  }
  const form = showEntryPage(entryEl, tableEl, setupHtml(shown, checked.printed, problem));
  if (form === null) return;
  form.addEventListener("change", () => saveSetup(readForm(form)));
  bindModeSwitch(modeSlotOf(entryEl), () => saveSetup(readForm(form)));
  form.addEventListener("submit", (ev) => ev.preventDefault());
  form.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement;
    if (t.closest("[data-edit-rules]") !== null) return saveSetup(readForm(form));
    if (t.closest("button[data-close]") !== null) return closeSetup();
    if (t.closest("button[data-newseed]") !== null) {
      const seed = form.querySelector<HTMLInputElement>('input[name="seed"]');
      if (seed !== null) seed.value = String(freshSeed());
      saveSetup(readForm(form));
      return;
    }
    if (t.closest("button[data-start]") !== null) {
      void begin({ ...readForm(form), s: encodeSettings(shown) });
    }
  });
};

const showDiff = (): void => {
  const w = W;
  if (w === null) return void openSetup();
  const dlg = $<HTMLDialogElement>("setup");
  const look = { rule: w.settings.rule, pack: w.settings.pack, cfg: w.game.flow.ctx.cfg, cards: w.settings.cards, printed: w.printed };
  dlg.className = "yy-dialog";
  dlg.innerHTML = `<form method="dialog" class="setup diff-dialog"><h2>この対局の設定</h2><p class="muted">${badgeHtml(look)}(基準からの違い)</p>${diffFromPresetHtml(look)}<div class="setup-btns"><button type="submit" class="btn btn-quiet" value="close">閉じる</button></div></form>`;
  dlg.showModal();
};

/** ?s= (from the AI table's start card) sets the rules and cards; the card opens to pick the AIs. */
const init = async (): Promise<void> => {
  const shared = new URLSearchParams(location.search).get("s");
  let problem = "";
  if (shared !== null) {
    const checked = await checkedSettings(shared);
    if (checked.ok) saveSetup({ ...setup, s: encodeSettings(checked.value) });
    else problem = `共有された設定を読めません: ${checked.error}`;
  }
  await openSetup(problem);
};

void init();
