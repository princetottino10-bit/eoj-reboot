// The interactive table shared by the local play UI and the online client.
// It draws a TableModel into a fixed skeleton and turns clicks and keys into
// FlowInputs through handlers.send. It never decides legality: everything
// clickable comes from the legal-action list and the command menu in the
// model (engine legalActions / commandsFor, run on the server online).
import { cardOf } from "../src/cards.ts";
import type { CardOverrides } from "../src/card-overrides.ts";
import type { CounterOrderOutcome } from "../src/counter-order.ts";
import type { UnitCommands } from "../src/commands.ts";
import type { FlowInput, TansuAnswer } from "../src/flow.ts";
import type { LegalEntry } from "../src/preview.ts";
import { baseSummonCost, underdogSummonDiscount } from "../src/rules.ts";
import { isHidden } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import type { CardDef, Facing, PlayerId, Pos } from "../src/types.ts";
import type { BoardView, LogItem } from "../online/protocol.ts";
import { boardHtml } from "./board-view.ts";
import type { BoardVM } from "./board-view.ts";
import { SEAT_SEAL, watchArtErrors } from "./cards-view.ts";
import { createFx } from "./fx.ts";
import { handHtml } from "./hand-view.ts";
import { ensureMarks } from "./marks.ts";
import type { HandCard, HandMode } from "./hand-view.ts";
import { detailHtml, logHtml, nameplateHtml, oppHandHtml, pilesHtml, turnHtml } from "./hud.ts";
import type { CardLook, Focus } from "./hud.ts";
import { promptHtml } from "./prompt-view.ts";
import { esc, resultHow, unitAtPos, unitById } from "./render.ts";
import type { LogNote, Names } from "./render.ts";
import {
  aimedEntry,
  attackEntries,
  cellMarks,
  commandMode,
  handEntries,
  handPlayable,
  NONE,
  predictionOf,
  radialItems,
  rangeSets,
  reiguEntry,
  reiguForecast,
  reiguPrediction,
  reiguPreviewPrediction,
  selStillValid,
  summonFacings,
  unitEntries,
} from "./select.ts";
import type { Sel } from "./select.ts";

export type TablePrompt =
  | { kind: "idle"; text: string }
  | { kind: "main"; legal: LegalEntry[]; commands: UnitCommands }
  | { kind: "discard" }
  | { kind: "mulligan" }
  | { kind: "tansu"; uids: number[] }
  /** 案A: this screen's seat puts the counterers of the declared attack in order. */
  | { kind: "counterOrder"; attackerUid: number; uids: number[]; outcomes: CounterOrderOutcome[] }
  | { kind: "over"; text: string; winner: PlayerId | null };

export type TableModel = {
  /** Identity of the match; a change clears the log and the selection. */
  key: string;
  ctx: Ctx;
  board: BoardView;
  /** Seat whose hand and inputs this screen shows; null = spectator. */
  viewer: PlayerId | null;
  hand: string[] | null;
  names: Names;
  prompt: TablePrompt;
  /** The full visible log so far. */
  log: LogItem[];
  /** Card number overrides of this match, and the printed cards they replace. */
  cardMods: CardOverrides;
  printed: (cardId: string) => CardDef | undefined;
  /** Short phase text for the turn indicator ("手札整理中" ...); "マリガン" marks the simultaneous mulligan. */
  phaseText: string;
};

export type TableHandlers = {
  /**
   * Takes an input. A screen that answers later (the online client: the server
   * has to take it first) returns a promise of whether it was taken: the choice
   * on screen is kept until then and stays for a retry when it was not.
   */
  send: (input: FlowInput) => void | Promise<boolean>;
  /** Screen-specific buttons beside "end turn" (resign, rematch, new game...). */
  extraControls?: (box: HTMLElement, model: TableModel) => void;
};

export type Table = {
  update: (m: TableModel) => void;
  /** Areas the page fills itself; the table never touches their content. */
  slots: { header: HTMLElement; tools: HTMLElement; notice: HTMLElement };
};

const SKELETON = `
  <header class="yy-top">
    <div class="yy-slot-header"></div>
    <div class="yy-opp"><div class="yy-opp-plate"></div><div class="yy-opp-hand"></div></div>
    <div class="yy-slot-tools"></div>
  </header>
  <aside class="yy-left"><div class="yy-piles-opp"></div><div class="yy-turn"></div><div class="yy-piles-self"></div></aside>
  <main class="yy-center">
    <div class="yy-slot-notice"></div>
    <div class="yy-board-wrap"><div class="yy-board"></div><div class="yy-result" hidden><div class="yy-result-mark"></div><p class="yy-result-text"></p><p class="yy-result-how"></p><div class="yy-result-actions"></div></div></div>
    <div class="yy-prompt" aria-live="polite"></div>
  </main>
  <aside class="yy-right"><div class="yy-detail"></div><div class="yy-log"></div></aside>
  <footer class="yy-self">
    <div class="yy-self-plate"></div>
    <div class="yy-hand"></div>
    <div class="yy-actions"><div class="yy-end"></div><div class="yy-extra"></div></div>
  </footer>
  <dialog class="yy-dialog yy-sheet" aria-label="詳しく見る"></dialog>
  <div class="yy-fx" aria-hidden="true"></div>`;

type SheetView = { kind: "grave"; seat: PlayerId } | { kind: "card"; cardId: string; fromSeat: PlayerId | null };

const q = <T extends HTMLElement = HTMLElement>(root: HTMLElement, sel: string): T => {
  const el = root.querySelector<T>(sel);
  if (el === null) throw new Error(`missing ${sel}`);
  return el;
};

/** Scrolls a horizontally scrolling row just enough to show the child fully (never the page). */
const revealInRow = (row: HTMLElement, child: Element): void => {
  if (row.scrollWidth <= row.clientWidth + 1) return;
  const r = row.getBoundingClientRect();
  const c = child.getBoundingClientRect();
  const pad = 10;
  if (c.left < r.left + pad) row.scrollLeft -= r.left + pad - c.left;
  else if (c.right > r.right - pad) row.scrollLeft += Math.min(c.right - (r.right - pad), c.left - (r.left + pad));
};

export const createTable = (root: HTMLElement, handlers: TableHandlers): Table => {
  root.classList.add("yy");
  root.innerHTML = SKELETON;
  // the card and board marks, once per page (every card refers to them); card art that
  // fails to load falls back to the placeholder face
  ensureMarks(root.ownerDocument);
  watchArtErrors(root.ownerDocument);
  const el = {
    oppPlate: q(root, ".yy-opp-plate"),
    oppHand: q(root, ".yy-opp-hand"),
    pilesOpp: q(root, ".yy-piles-opp"),
    pilesSelf: q(root, ".yy-piles-self"),
    board: q(root, ".yy-board"),
    prompt: q(root, ".yy-prompt"),
    turn: q(root, ".yy-turn"),
    detail: q(root, ".yy-detail"),
    log: q(root, ".yy-log"),
    selfPlate: q(root, ".yy-self-plate"),
    hand: q(root, ".yy-hand"),
    end: q(root, ".yy-end"),
    extra: q(root, ".yy-extra"),
    fx: q(root, ".yy-fx"),
    sheet: q<HTMLDialogElement>(root, ".yy-sheet"),
    result: q(root, ".yy-result"),
    resultMark: q(root, ".yy-result-mark"),
    resultText: q(root, ".yy-result-text"),
    resultHow: q(root, ".yy-result-how"),
    resultActions: q(root, ".yy-result-actions"),
  };
  const slots = { header: q(root, ".yy-slot-header"), tools: q(root, ".yy-slot-tools"), notice: q(root, ".yy-slot-notice") };

  // The board makes room for a tall prompt instead of sitting under it: the prompt's
  // height and (phones: one scrolling column) where the board starts on the page go
  // to CSS, which sizes the board with them (table.css). Layout only.
  const boardWrap = q(root, ".yy-board-wrap");
  const fitVars = new Map<string, string>();
  const setFitVar = (name: string, value: string): void => {
    if (fitVars.get(name) === value) return;
    fitVars.set(name, value);
    root.style.setProperty(name, value);
  };
  const fitBoard = (): void => {
    setFitVar("--prompt-live", `${Math.ceil(el.prompt.getBoundingClientRect().height)}px`);
    setFitVar("--board-top", `${Math.max(0, Math.round(boardWrap.getBoundingClientRect().top + window.scrollY))}px`);
  };
  if (typeof ResizeObserver === "function") {
    const watch = new ResizeObserver(() => fitBoard());
    for (const e of [el.prompt, q(root, ".yy-top"), q(root, ".yy-left"), slots.notice]) watch.observe(e);
  }
  window.addEventListener("resize", fitBoard);

  let model: TableModel | null = null;
  let sel: Sel = NONE;
  let history: Sel[] = [];
  let marked = new Set<number>();
  let tansuAnswers: TansuAnswer[] = [];
  /** 案A: the counter order being set, and how many counterers were tapped into place on the board. */
  let counterPick: number[] | null = null;
  let counterTaps = 0;
  let endConfirm = false;
  /** An input is on its way to a server: no other is sent until it is answered. */
  let inflight = false;
  let logOpen = false;
  let hover: Focus | null = null;
  let pinned: Focus = { kind: "none" };
  /** What the pop-up sheet shows (phones: the detail panel is off screen). */
  let sheet: SheetView | null = null;
  /** A hand card just tapped: scroll the hand row to show it after the redraw. */
  let reveal: number | null = null;
  let flash = "";
  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  let stamp = "";
  /** Units on the board when a summon was sent: the new one gets the summon-attack offer. */
  let followup: Set<number> | null = null;
  /** Per log seq: what the board looked like around a rotation (the events do not say). */
  let notes = new Map<number, LogNote>();
  const html = new Map<HTMLElement, string>();

  const fx = createFx({ root, layer: el.fx, board: el.board });

  /** Sets the content if it changed; returns whether it did. */
  const put = (target: HTMLElement, content: string): boolean => {
    if (html.get(target) === content) return false;
    html.set(target, content);
    target.innerHTML = content;
    return true;
  };

  // ---------------------------------------------------------------- helpers

  const legal = (): LegalEntry[] => (model !== null && model.prompt.kind === "main" ? model.prompt.legal : []);
  const commands = (): UnitCommands => (model !== null && model.prompt.kind === "main" ? model.prompt.commands : {});
  const handOf = (): string[] => model?.hand ?? [];
  const look = (m: TableModel): CardLook => ({ mods: m.cardMods, printed: m.printed });
  /** Something other than ending the turn is still possible. */
  const hasMoves = (): boolean => legal().some((e) => e.action.kind !== "pass");

  const setSel = (next: Sel, remember = true): void => {
    if (remember && sel.kind !== "none") history = [...history.slice(-20), sel];
    if (next.kind === "none") history = [];
    sel = next;
    endConfirm = false;
    render();
  };

  const say = (text: string): void => {
    flash = text;
    if (flashTimer !== null) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flash = "";
      render();
    }, 2600);
    render();
  };

  /** Everything the table holds about a choice being made (cleared once the input is taken). */
  const clearChoice = (): void => {
    sel = NONE;
    history = [];
    endConfirm = false;
    marked = new Set();
    tansuAnswers = [];
    counterPick = null;
    counterTaps = 0;
  };

  /** The counter order on screen (the prompt's default until it is changed). */
  const pickNow = (): number[] => {
    const p = model?.prompt;
    if (p === undefined || p.kind !== "counterOrder") return [];
    const ok = counterPick !== null && counterPick.length === p.uids.length && counterPick.every((u) => p.uids.includes(u));
    return ok && counterPick !== null ? counterPick : p.uids.slice();
  };

  /**
   * Sends an input. A screen that takes it at once (the AI table) clears the
   * choice first, so what follows can select for the player (a summon's attack
   * offer). A screen that has to ask a server keeps the choice on screen until
   * the answer: it is cleared when the input was taken and stays — with the
   * error the screen shows — when it was not, so pressing again sends the same
   * thing. While one input is on its way no other is sent.
   */
  const send = (input: FlowInput): void => {
    if (inflight) return;
    const sentStamp = stamp;
    const kept = { sel, history, endConfirm, marked, tansuAnswers, counterPick, counterTaps };
    clearChoice();
    const answer = handlers.send(input);
    if (!(answer instanceof Promise)) return;
    sel = kept.sel;
    history = kept.history;
    endConfirm = kept.endConfirm;
    marked = kept.marked;
    tansuAnswers = kept.tansuAnswers;
    counterPick = kept.counterPick;
    counterTaps = kept.counterTaps;
    inflight = true;
    const settle = (taken: boolean): void => {
      inflight = false;
      if (!taken) {
        followup = null;
        return render();
      }
      // a state that arrived meanwhile has already decided what stays selected
      if (stamp !== sentStamp) return;
      clearChoice();
      render();
    };
    void answer.then(settle, () => settle(false));
  };

  const sendAction = (entry: LegalEntry | undefined): void => {
    if (entry === undefined) return;
    if (entry.action.kind === "summon" || entry.action.kind === "inherit") {
      followup = new Set((model?.board.units ?? []).map((u) => u.uid));
    }
    send({ type: "action", action: entry.action });
  };

  /** End turn: asks first while other actions remain (button and Enter alike). */
  const endTurn = (): void => {
    if (endConfirm || !hasMoves()) return send({ type: "action", action: { kind: "pass" } });
    endConfirm = true;
    render();
  };

  /** The reigu entries aimed at one unit (targetUid null = the untargeted reigu). */
  const reiguEntriesFor = (handIndex: number, targetUid: number | null): LegalEntry[] =>
    handEntries(legal(), handOf(), handIndex, "reigu").filter((e) => e.action.kind === "reigu" && e.action.targetUid === targetUid);

  // --------------------------------------------------------------- clicks

  const onCell = (pos: Pos): void => {
    const m = model;
    if (m === null) return;
    const u = unitAtPos(m.board, pos);
    const lg = legal();
    const hand = handOf();
    if (m.prompt.kind === "counterOrder" && u !== undefined && m.prompt.uids.includes(u.uid)) {
      // tap in order: the tapped counterer takes the next place from the top
      const pick = pickNow().filter((x) => x !== u.uid);
      const at = Math.min(counterTaps, pick.length);
      counterPick = [...pick.slice(0, at), u.uid, ...pick.slice(at)];
      counterTaps = counterTaps + 1 >= counterPick.length ? 0 : counterTaps + 1;
      return render();
    }
    if (m.prompt.kind === "main") {
      const mark = cellMarks(m.board, lg, hand, sel).get(`${pos.x},${pos.y}`);
      const s = sel;
      if (s.kind === "hand" && mark === "summon") return setSel({ kind: "place", handIndex: s.handIndex, pos });
      if (s.kind === "hand" && mark === "inherit" && u !== undefined) return setSel({ kind: "inherit", handIndex: s.handIndex, targetUid: u.uid });
      if (s.kind === "aim" && (mark === "target" || mark === "heal") && u !== undefined) return setSel({ ...s, targetUid: u.uid });
      if (s.kind === "proxy" && mark === "proxy" && u !== undefined) return setSel({ kind: "proxy", uid: s.uid, targetUid: u.uid });
      // a targeted reigu never fires on the tap: the prompt shows what it will do (or the facing arrows) first
      if (s.kind === "reigu" && mark === "target" && u !== undefined) {
        // the target first; 閻魔獄卒棒 then marks the enemies next to it
        if (s.targetUid === null) return setSel({ kind: "reigu", handIndex: s.handIndex, targetUid: u.uid });
        return setSel({ ...s, victimUid: u.uid });
      }
      if (s.kind === "place" && s.pos.x === pos.x && s.pos.y === pos.y) return;
      // tapping the unit being turned / confirmed keeps the step
      if ((s.kind === "reigu" || s.kind === "proxy") && s.targetUid !== null && u !== undefined && u.uid === s.targetUid) return;
    }
    if (u !== undefined && (!isHidden(u) || u.owner === m.viewer)) {
      if (sel.kind === "unit" && sel.uid === u.uid) return setSel(NONE);
      pinned = { kind: "unit", uid: u.uid };
      return setSel({ kind: "unit", uid: u.uid, summonAttack: false });
    }
    setSel(NONE);
  };

  const onCommand = (id: string): void => {
    const m = model;
    const s = sel;
    if (m === null || m.prompt.kind !== "main" || (s.kind !== "unit" && s.kind !== "aim" && s.kind !== "proxy")) return;
    const info = (commands()[String(s.uid)] ?? []).find((c) => c.id === id);
    if (info === undefined) return;
    if (!info.enabled) return say(`${info.label}: ${info.reason ?? "今は使えない"}`);
    const lg = legal();
    const mode = commandMode(info.id);
    const summonAttack = s.kind === "unit" || s.kind === "aim" ? s.summonAttack : false;
    if (mode !== null) {
      const entries = attackEntries(lg, s.uid, mode);
      const area = entries.some((e) => e.action.kind === "attack" && e.action.targetUid === null);
      return setSel({ kind: "aim", uid: s.uid, mode, targetUid: null, area, summonAttack });
    }
    if (info.id === "proxyRotate") return setSel({ kind: "proxy", uid: s.uid, targetUid: null });
    const u = unitById(m.board, s.uid);
    if (u === undefined) return;
    const facing = ((u.facing + (info.id === "rotateLeft" ? 3 : 1)) % 4) as Facing;
    sendAction(unitEntries(lg, s.uid, "rotate").find((e) => e.action.kind === "rotate" && e.action.facing === facing));
  };

  const onHand = (i: number): void => {
    const m = model;
    if (m === null || m.hand === null) return;
    const cardId = m.hand[i];
    if (cardId === undefined) return;
    reveal = i;
    if (m.prompt.kind === "discard" || m.prompt.kind === "mulligan") {
      const next = new Set(marked);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      marked = next;
      pinned = { kind: "card", cardId };
      return render();
    }
    pinned = { kind: "card", cardId };
    if (m.prompt.kind !== "main") return render();
    const card = cardOf(m.ctx.pack, cardId);
    const same = (sel.kind === "hand" || sel.kind === "place" || sel.kind === "inherit" || sel.kind === "reigu") && sel.handIndex === i;
    if (same) return setSel(NONE);
    if (!handPlayable(legal(), m.hand, i, card.kind === "reigu")) {
      say(`${card.nameJa}: 今は使えない(霊力・置き場所・効果の条件を確認)`);
      return;
    }
    setSel(card.kind === "reigu" ? { kind: "reigu", handIndex: i, targetUid: null } : { kind: "hand", handIndex: i });
  };

  const onFace = (f: number): void => {
    const s = sel;
    if (s.kind === "place") return sendAction(summonFacings(legal(), handOf(), s.handIndex, s.pos).find((o) => o.facing === f)?.entry);
    if (s.kind === "reigu" && s.targetUid !== null) {
      return sendAction(reiguEntriesFor(s.handIndex, s.targetUid).find((e) => e.action.kind === "reigu" && e.action.facing === f));
    }
    if (s.kind === "proxy" && s.targetUid !== null) {
      return sendAction(unitEntries(legal(), s.uid, "proxyRotate").find((e) => e.action.kind === "proxyRotate" && e.action.targetUid === s.targetUid && e.action.facing === f));
    }
  };

  const onPromptButton = (act: string, data: DOMStringMap): void => {
    const m = model;
    if (m === null) return;
    const lg = legal();
    const hand = handOf();
    const s = sel;
    switch (act) {
      case "cancel":
        return setSel(NONE);
      case "retarget":
        if (s.kind === "reigu") setSel({ ...s, targetUid: null, mode: null, victimUid: null }, false);
        else if (s.kind === "aim" || s.kind === "proxy") setSel({ ...s, targetUid: null }, false);
        return;
      case "rmode":
        if (s.kind === "reigu" && (data.mode === "ken" || data.mode === "aku")) setSel({ ...s, mode: data.mode });
        return;
      case "remode":
        if (s.kind === "reigu") setSel({ ...s, mode: null }, false);
        return;
      case "revictim":
        if (s.kind === "reigu") setSel({ ...s, victimUid: null }, false);
        return;
      case "confirm":
        if (s.kind === "aim") return sendAction(aimedEntry(lg, s));
        if (s.kind === "inherit") {
          return sendAction(handEntries(lg, hand, s.handIndex, "inherit").find((e) => e.action.kind === "inherit" && e.action.targetUid === s.targetUid));
        }
        if (s.kind === "reigu") return sendAction(reiguEntry(lg, hand, s));
        return;
      case "dir":
        return onFace(Number(data.f));
      case "end":
      case "end-yes":
        return endTurn();
      case "end-no":
        endConfirm = false;
        return render();
      case "marks":
      case "marks-none": {
        // the marks stay until the input is taken (send clears them), so a refused send can be repeated
        const indices = act === "marks" ? [...marked].sort((a, b) => a - b) : [];
        if (m.prompt.kind === "mulligan") return send({ type: "mulligan", indices });
        if (m.prompt.kind === "discard") return send({ type: "discard", indices });
        return;
      }
      case "co-up":
      case "co-down": {
        if (m.prompt.kind !== "counterOrder") return;
        const pick = pickNow().slice();
        const i = Number(data.i);
        const j = act === "co-up" ? i - 1 : i + 1;
        if (!Number.isInteger(i) || j < 0 || j >= pick.length || i < 0 || i >= pick.length) return;
        [pick[i], pick[j]] = [pick[j], pick[i]];
        counterPick = pick;
        counterTaps = 0;
        return render();
      }
      case "co-reset":
        counterPick = null;
        counterTaps = 0;
        return render();
      case "co-send":
        if (m.prompt.kind !== "counterOrder") return;
        return send({ type: "counterOrder", order: pickNow() });
      case "tansu": {
        if (m.prompt.kind !== "tansu") return;
        const uid = m.prompt.uids[tansuAnswers.length];
        const choice = data.choice;
        if (uid === undefined || (choice !== "mana" && choice !== "draw" && choice !== "skip")) return;
        const answers: TansuAnswer[] = [...tansuAnswers, { uid, choice }];
        // the last answer is only kept once the whole set is taken: a refused send leaves it to be given again
        if (answers.length >= m.prompt.uids.length) return send({ type: "tansu", answers });
        tansuAnswers = answers;
        return render();
      }
      default:
    }
  };

  /** The detail panel is on screen (desktop); otherwise details open in the sheet. */
  const detailVisible = (): boolean => {
    const r = el.detail.getBoundingClientRect();
    return r.height >= 80 && r.top >= 0 && r.bottom <= window.innerHeight + 1;
  };

  const openSheet = (f: SheetView): void => {
    sheet = f;
    renderSheet();
    if (!el.sheet.open) el.sheet.showModal();
  };

  root.addEventListener("click", (ev) => {
    const target = (ev.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (target === null || !root.contains(target)) return;
    if (target.closest(".yy-slot-header, .yy-slot-tools, .yy-slot-notice, .yy-extra") !== null) return;
    const act = target.dataset.act ?? "";
    if (act === "cell") return onCell({ x: Number(target.dataset.x), y: Number(target.dataset.y) });
    if (act === "cmd") return onCommand(target.dataset.cmd ?? "");
    if (act === "face") return onFace(Number(target.dataset.f));
    if (act === "hand") return onHand(Number(target.dataset.i));
    if (act === "grave") {
      const seat = Number(target.dataset.seat) as PlayerId;
      pinned = { kind: "grave", seat };
      render();
      if (!detailVisible()) openSheet({ kind: "grave", seat });
      return;
    }
    if (act === "peek") {
      pinned = { kind: "card", cardId: target.dataset.card ?? "" };
      if (el.sheet.open) {
        sheet = { kind: "card", cardId: target.dataset.card ?? "", fromSeat: sheet?.kind === "grave" ? sheet.seat : null };
        renderSheet();
      }
      return render();
    }
    if (act === "sheet-back") {
      if (sheet?.kind === "card" && sheet.fromSeat !== null) {
        sheet = { kind: "grave", seat: sheet.fromSeat };
        renderSheet();
      }
      return;
    }
    if (act === "sheet-close") {
      el.sheet.close();
      return;
    }
    if (act === "log") {
      logOpen = !logOpen;
      return render();
    }
    onPromptButton(act, target.dataset);
  });

  // a tap on the sheet's backdrop closes it
  el.sheet.addEventListener("click", (ev) => {
    if (ev.target === el.sheet) el.sheet.close();
  });
  el.sheet.addEventListener("close", () => {
    sheet = null;
  });

  root.addEventListener("mouseover", (ev) => {
    const t = ev.target as HTMLElement;
    const card = t.closest<HTMLElement>(".hand-card");
    const piece = t.closest<HTMLElement>(".pc[data-uid]");
    const next: Focus | null =
      card !== null && model?.hand !== null && model !== null
        ? { kind: "card", cardId: model.hand?.[Number(card.dataset.i)] ?? "" }
        : piece !== null
          ? { kind: "unit", uid: Number(piece.dataset.uid) }
          : null;
    const same = JSON.stringify(next) === JSON.stringify(hover);
    if (same) return;
    hover = next;
    renderDetail();
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLSelectElement) return;
    if (root.closest("[hidden]") !== null || ev.defaultPrevented) return;
    // a start card, the settings or a detail sheet is open over the table: the keys belong to it, not to the match behind it
    if (document.querySelector("dialog[open]") !== null) return;
    const m = model;
    if (ev.key === "Escape") {
      if (endConfirm) {
        endConfirm = false;
        return render();
      }
      if (sel.kind !== "none") setSel(NONE);
      return;
    }
    if (ev.key === "Enter" && m !== null && m.prompt.kind === "main" && !ev.repeat) {
      // a focused control answers Enter itself (「戻る」 in the end-turn question, a link, a checkbox...)
      if ((ev.target as HTMLElement | null)?.closest?.("button, a[href], summary, [contenteditable]") !== null) return;
      ev.preventDefault();
      return endTurn();
    }
    if ((ev.key === "z" || ev.key === "Z") && !ev.ctrlKey && !ev.metaKey) {
      const prev = history[history.length - 1];
      history = history.slice(0, -1);
      sel = prev ?? NONE;
      endConfirm = false;
      render();
    }
  });

  // --------------------------------------------------------------- render

  const focusNow = (): Focus => {
    if (hover !== null) return hover;
    const s = sel;
    if (s.kind === "unit" || s.kind === "aim" || s.kind === "proxy") return { kind: "unit", uid: s.uid };
    if ((s.kind === "hand" || s.kind === "place" || s.kind === "inherit" || s.kind === "reigu") && model?.hand) {
      return { kind: "card", cardId: model.hand[s.handIndex] ?? "" };
    }
    return pinned;
  };

  const renderDetail = (): void => {
    const m = model;
    if (m === null) return;
    const f = focusNow();
    const valid = f.kind !== "card" || m.ctx.pack.byId.has(f.cardId);
    put(el.detail, detailHtml(m.ctx, m.board, m.names, valid ? f : { kind: "none" }, look(m)));
  };

  const renderSheet = (): void => {
    const m = model;
    const f = sheet;
    if (m === null || f === null) return;
    const back = f.kind === "card" && f.fromSeat !== null;
    const body = detailHtml(m.ctx, m.board, m.names, f.kind === "card" ? { kind: "card", cardId: f.cardId } : f, look(m));
    put(
      el.sheet,
      `<div class="sheet">${body}<div class="sheet-btns">${back ? '<button type="button" class="btn btn-quiet" data-act="sheet-back">一覧へ戻る</button>' : ""}<button type="button" class="btn" data-act="sheet-close">閉じる</button></div></div>`,
    );
  };

  const boardVM = (m: TableModel): BoardVM => {
    const lg = legal();
    const hand = handOf();
    const s = sel;
    const shownUid = s.kind === "unit" || s.kind === "aim" || s.kind === "proxy" ? s.uid : null;
    const shown = shownUid === null ? undefined : unitById(m.board, shownUid);
    const main = m.prompt.kind === "main";
    const own = shown !== undefined && shown.owner === m.viewer;
    const aimed = aimedEntry(lg, s);
    const turning = main && (s.kind === "reigu" || s.kind === "proxy") && s.targetUid !== null ? unitById(m.board, s.targetUid) : undefined;
    const turnEntries =
      turning === undefined
        ? []
        : s.kind === "reigu"
          ? reiguEntriesFor(s.handIndex, turning.uid).filter((e) => e.action.kind === "reigu" && e.action.facing !== null)
          : s.kind === "proxy"
            ? unitEntries(lg, s.uid, "proxyRotate").filter((e) => e.action.kind === "proxyRotate" && e.action.targetUid === turning.uid)
            : [];
    const facingOf = (e: LegalEntry): number | null =>
      e.action.kind === "reigu" || e.action.kind === "proxyRotate" ? e.action.facing : null;
    const reiguCard = s.kind === "reigu" ? hand[s.handIndex] : undefined;
    const forecast =
      main && s.kind === "reigu" && s.targetUid !== null && reiguCard !== undefined && turnEntries.length === 0
        ? reiguForecast(m.ctx, m.board, reiguCard, s.targetUid, m.viewer)
        : null;
    const reiguPv = main && s.kind === "reigu" ? reiguEntry(lg, hand, s)?.preview : undefined;
    // 案A: the counterers glow (tap them in order), the attacker is the selected piece
    const co = m.prompt.kind === "counterOrder" ? m.prompt : null;
    const coMarks = new Map<string, "target">();
    if (co !== null) for (const uid of co.uids) {
      const cu = unitById(m.board, uid);
      if (cu !== undefined) coMarks.set(`${cu.pos.x},${cu.pos.y}`, "target");
    }
    return {
      ctx: m.ctx,
      board: m.board,
      names: m.names,
      look: look(m),
      bottom: m.viewer === 1 ? 1 : 0,
      marks: main ? cellMarks(m.board, lg, hand, s) : co !== null ? coMarks : new Map(),
      range: s.kind === "unit" || (s.kind === "aim" && s.targetUid === null && !s.area) ? rangeSets(m.ctx, shown) : null,
      selectedUid: co !== null ? co.attackerUid : (shownUid ?? (s.kind === "inherit" || s.kind === "reigu" ? s.targetUid : null)),
      selectedCell: s.kind === "place" ? s.pos : null,
      prediction:
        aimed?.preview?.kind === "attack" && s.kind === "aim"
          ? predictionOf(s.uid, aimed.preview)
          : reiguPv?.kind === "reigu"
            ? reiguPreviewPrediction(reiguPv)
            : forecast === null
              ? null
              : reiguPrediction(forecast),
      radial:
        main && own && shown !== undefined && (s.kind === "unit" || (s.kind === "proxy" && s.targetUid === null))
          ? { uid: shown.uid, items: radialItems(commands(), shown.uid, m.board.players[shown.owner].mana, s) }
          : null,
      facing:
        main && s.kind === "place"
          ? {
              pos: s.pos,
              cardId: hand[s.handIndex] ?? "",
              options: summonFacings(lg, hand, s.handIndex, s.pos).map((o) => ({ facing: o.facing, enabled: o.entry !== undefined })),
            }
          : turning !== undefined && turnEntries.length > 0
            ? {
                pos: turning.pos,
                cardId: turning.cardId,
                options: ([0, 1, 2, 3] as Facing[]).map((f) => ({ facing: f, enabled: turnEntries.some((e) => facingOf(e) === f) })),
                turn: { from: turning.facing },
              }
            : null,
    };
  };

  /** 劣勢時の大型割引 on a hand shikigami of the viewer, as the board stands: { costNow } or nothing. */
  const discountedCost = (m: TableModel, card: CardDef): { costNow?: number } => {
    if (m.viewer === null || card.kind !== "shikigami") return {};
    const off = underdogSummonDiscount(m.ctx, m.board, m.viewer, card);
    return off > 0 ? { costNow: Math.max(1, baseSummonCost(m.ctx, card) - off) } : {};
  };

  const handCards = (m: TableModel): HandCard[] =>
    (m.hand ?? []).map((cardId, index) => {
      const card = cardOf(m.ctx.pack, cardId);
      const s = sel;
      return {
        cardId,
        index,
        playable: m.prompt.kind === "main" && handPlayable(legal(), m.hand ?? [], index, card.kind === "reigu"),
        selected: (s.kind === "hand" || s.kind === "place" || s.kind === "inherit" || s.kind === "reigu") && s.handIndex === index,
        marked: marked.has(index),
        ...discountedCost(m, card),
      };
    });

  const renderHand = (m: TableModel): void => {
    const mode: HandMode =
      m.prompt.kind === "discard" ? "discard" : m.prompt.kind === "mulligan" ? "mulligan" : m.prompt.kind === "main" ? "play" : "idle";
    // the phone hand is a scrolling row: a redraw must not jump it back to the first card
    const before = el.hand.querySelector<HTMLElement>(".hand");
    const left = before?.scrollLeft ?? 0;
    const changed = put(
      el.hand,
      m.hand === null
        ? `<div class="hand is-watch"><span class="muted">観戦中: 手札は見えません(${esc(m.names[0])} ${m.board.players[0].handCount}枚 / ${esc(m.names[1])} ${m.board.players[1].handCount}枚)</span></div>`
        : handHtml(m.ctx, handCards(m), mode, look(m)),
    );
    const row = el.hand.querySelector<HTMLElement>(".hand");
    if (row === null) return;
    if (changed && row !== before) row.scrollLeft = left;
    const shown = reveal;
    reveal = null;
    const card = shown === null ? null : row.querySelector(`.hand-card[data-i="${shown}"]`);
    if (card !== null) revealInRow(row, card);
  };

  const renderLog = (m: TableModel): void => {
    const changed = put(el.log, logHtml(m.ctx, m.names, m.log, logOpen, notes));
    const list = el.log.querySelector<HTMLElement>(".log-list");
    // newest lines at the bottom stay in view (the short list may be shorter than five lines)
    if (list !== null && changed) list.scrollTop = list.scrollHeight;
  };

  const render = (): void => {
    const m = model;
    if (m === null) return;
    const top: PlayerId = m.viewer === null ? 1 : m.viewer === 0 ? 1 : 0;
    const bottom: PlayerId = top === 0 ? 1 : 0;
    const lk = look(m);
    root.dataset.viewer = m.viewer === null ? "watch" : String(m.viewer);
    root.dataset.prompt = m.prompt.kind;
    put(el.oppPlate, nameplateHtml(m.ctx, m.board, top, m.names, false));
    put(el.oppHand, oppHandHtml(m.board.players[top].handCount));
    put(el.selfPlate, nameplateHtml(m.ctx, m.board, bottom, m.names, m.viewer === bottom));
    put(el.pilesOpp, pilesHtml(m.ctx, m.board, top, lk));
    put(el.pilesSelf, pilesHtml(m.ctx, m.board, bottom, lk));
    put(el.turn, turnHtml(m.ctx, m.board, m.names, { phaseText: m.phaseText, mulligan: m.phaseText === "マリガン" || m.prompt.kind === "mulligan" }));
    put(el.board, boardHtml(boardVM(m)));
    renderHand(m);
    put(
      el.prompt,
      promptHtml({
        ctx: m.ctx,
        board: m.board,
        names: m.names,
        viewer: m.viewer,
        hand: m.hand ?? [],
        prompt: m.prompt.kind === "over" ? { kind: "over", text: m.prompt.text } : m.prompt,
        sel,
        marked: marked.size,
        tansuIndex: tansuAnswers.length,
        endConfirm,
        flash,
        ...(m.prompt.kind === "counterOrder" ? { counterPick: pickNow() } : {}),
      }),
    );
    put(
      el.end,
      m.prompt.kind === "main"
        ? `<button type="button" class="btn btn-end${endConfirm ? " is-asking" : ""}" data-act="end" title="行動が残っていれば確認してから終了(Enter でも同じ)">ターン終了</button>`
        : "",
    );
    renderLog(m);
    renderDetail();
    if (el.sheet.open) renderSheet();
    renderResult(m);
    el.extra.innerHTML = "";
    el.resultActions.innerHTML = "";
    if (handlers.extraControls !== undefined) handlers.extraControls(m.prompt.kind === "over" ? el.resultActions : el.extra, m);
    fitBoard();
  };

  const renderResult = (m: TableModel): void => {
    const p = m.prompt;
    if (p.kind !== "over") {
      el.result.hidden = true;
      root.classList.remove("is-over");
      return;
    }
    // spectators: which seat won, not a lone seat mark
    const mark = p.winner === null ? "分" : m.viewer === null ? `${SEAT_SEAL[p.winner]}勝` : p.winner === m.viewer ? "勝" : "敗";
    const tone = p.winner === null ? "draw" : m.viewer === null ? "watch" : p.winner === m.viewer ? "win" : "lose";
    const resigned = m.log.some((l) => l.event.t === "resign");
    const how = resigned ? "投了" : resultHow(m.board.winType, m.board.winner, m.names);
    el.result.hidden = false;
    el.result.dataset.tone = tone;
    el.resultMark.classList.toggle("is-pair", mark.length > 1);
    root.classList.add("is-over");
    if (el.resultMark.textContent !== mark) el.resultMark.textContent = mark;
    if (el.resultText.textContent !== p.text) el.resultText.textContent = p.text;
    const howText = how === null || p.text.includes(how) ? "" : how;
    if (el.resultHow.textContent !== howText) el.resultHow.textContent = howText;
    el.resultHow.hidden = howText === "";
  };

  /** After an own summon / inherit, offer the fresh unit's summon-attack. */
  const applyFollowup = (m: TableModel): void => {
    const before = followup;
    followup = null;
    if (before === null || m.prompt.kind !== "main" || m.viewer === null) return;
    const fresh = m.board.units.find((u) => u.owner === m.viewer && !before.has(u.uid));
    if (fresh === undefined) return;
    const lg = m.prompt.legal;
    const normals = attackEntries(lg, fresh.uid, "normal");
    if (normals.length === 0 && attackEntries(lg, fresh.uid, "konshin").length === 0) return;
    const single = normals.some((e) => e.action.kind === "attack" && e.action.targetUid !== null);
    sel = single
      ? { kind: "aim", uid: fresh.uid, mode: "normal", targetUid: null, area: false, summonAttack: true }
      : { kind: "unit", uid: fresh.uid, summonAttack: true };
  };

  const present = (m: TableModel, fresh: LogItem[]): void => {
    const prev = model !== null && model.key === m.key ? model : null;
    if (prev === null) {
      sel = NONE;
      history = [];
      marked = new Set();
      tansuAnswers = [];
      followup = null;
      pinned = { kind: "none" };
      logOpen = false;
      if (el.sheet.open) el.sheet.close();
    }
    model = m;
    const lastSeq = m.log.length === 0 ? -1 : m.log[m.log.length - 1].seq;
    const nextStamp = `${m.key}|${lastSeq}|${m.prompt.kind}|${m.board.units.length}|${m.hand?.length ?? -1}`;
    if (nextStamp !== stamp) {
      const keep =
        (sel.kind === "unit" && m.prompt.kind !== "main" && unitById(m.board, sel.uid) !== undefined) ||
        (m.prompt.kind === "main" && sel.kind !== "none" && prev !== null && prev.prompt.kind === "main" && fresh.length === 0 &&
          selStillValid(sel, m.board, m.hand, m.prompt.legal));
      if (!keep) sel = NONE;
      if (m.prompt.kind !== "discard" && m.prompt.kind !== "mulligan") marked = new Set();
      if (m.prompt.kind !== "tansu") tansuAnswers = [];
      if (m.prompt.kind !== "counterOrder") {
        counterPick = null;
        counterTaps = 0;
      }
      endConfirm = false;
      stamp = nextStamp;
      if (m.prompt.kind === "main") applyFollowup(m);
    }
    render();
  };

  let lastSeen = -1;
  let lastKey = "";
  /** The newest model received (not necessarily drawn yet). */
  let latest: TableModel | null = null;

  const owesInput = (m: TableModel | null): boolean =>
    m !== null && m.viewer !== null && m.prompt.kind !== "idle" && m.prompt.kind !== "over";

  /** Rotations: the unit's card and facing before / after, from the previous board (the events carry neither). */
  const noteRotations = (prev: TableModel | null, m: TableModel, fresh: LogItem[]): void => {
    if (prev === null || prev.key !== m.key) return;
    for (const l of fresh) {
      const e = l.event;
      const uid = e.t === "rotate" ? e.uid : e.t === "effect" && e.text.includes("回転") ? e.uid : null;
      if (uid === null) continue;
      const before = unitById(prev.board, uid);
      const after = unitById(m.board, uid);
      if (before === undefined || after === undefined) continue;
      notes.set(l.seq, { cardId: after.cardId, from: before.facing, to: after.facing });
    }
  };

  const update = (m: TableModel): void => {
    if (m.key !== lastKey) {
      lastSeen = -1;
      lastKey = m.key;
      notes = new Map();
      // a match already under way when this screen first sees it (a reload, a resumed AI match, a
      // reconnect): its history is not news, so it is drawn without replaying every animation
      if (m.log.filter((l) => l.event.t === "turnStart").length > 1) lastSeen = m.log[m.log.length - 1].seq;
    }
    const fresh = m.log.filter((l) => l.seq > lastSeen);
    if (fresh.length > 0) lastSeen = fresh[fresh.length - 1].seq;
    noteRotations(latest, m, fresh);
    // a step that follows a prompt this screen was answering is its own input
    const immediate = latest === null || latest.key !== m.key || owesInput(latest) || fresh.length === 0;
    latest = m;
    fx.push({ fresh, immediate, viewer: m.viewer, show: () => present(m, fresh) });
  };

  return { update, slots };
};
