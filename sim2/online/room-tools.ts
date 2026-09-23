// The online room's settings surface: the "+N項目変更" badge with its
// difference list, the owner's settings link (a mid-match proposal or the
// next match's settings, made on the settings page /rules?for=room), and the
// proposal banner with agree / decline / withdraw, and for the proposer a
// short notice of the answer. The server validates and applies; this only
// shows and sends.
import { applyCardOverrides, cardChanges } from "../src/card-overrides.ts";
import type { CardPack } from "../src/cards.ts";
import { applyConfigPatch, configChanges } from "../src/config-schema.ts";
import { settingsConfig } from "../src/settings.ts";
import { esc } from "../play/cards-view.ts";
import { rulesHref } from "../play/rules-url.ts";
import { badgeHtml, cardChangeLines, changeListHtml, diffFromPresetHtml } from "../play/settings-badge.ts";
import type { SettingsLook } from "../play/settings-badge.ts";
import type { AnswerView, ClientInput, StateMessage } from "./protocol.ts";

export type RoomToolsOptions = {
  slots: { tools: HTMLElement; notice: HTMLElement };
  send: (input: ClientInput) => Promise<boolean>;
  /** Asks (with a confirmation) for the room to be deleted; see client.ts. */
  closeRoom: () => void;
  packOf: (name: string) => CardPack | null;
  loadPack: (name: string) => Promise<CardPack>;
};

const dialogEl = (): HTMLDialogElement => {
  const el = document.getElementById("settings");
  if (!(el instanceof HTMLDialogElement)) throw new Error("missing #settings dialog");
  return el;
};

/** How long the proposer sees "the opponent agreed / declined" (the server forgets it at the next input). */
const ANSWER_MS = 8000;
/** An answer older than this (server clock; room for a skewed browser clock) is history, not news. */
const STALE_ANSWER_MS = 60_000;

/** Answers this tab has already shown (or closed), across reloads and the trip to /rules. */
const SEEN_KEY = "sim2online:answers-seen";

const seenAnswers = (): string[] => {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY);
    const list: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(list) ? list.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
};

const markSeen = (key: string): void => {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seenAnswers().filter((k) => k !== key), key].slice(-20)));
  } catch {
    // storage unavailable: the notice may show once more after a reload
  }
};

export const createRoomTools = (opts: RoomToolsOptions): { render: (msg: StateMessage) => void } => {
  let last: StateMessage | null = null;
  let toolsHtml = "";
  let noticeHtml = "";
  /** The answer notice being shown: which answer, and whether it is still open (shown ones are in sessionStorage). */
  let answerSeen: { key: string; answer: AnswerView; open: boolean } | null = null;
  let answerTimer: ReturnType<typeof setTimeout> | null = null;

  const look = (msg: StateMessage): SettingsLook => {
    const g = msg.game;
    if (g !== null && g.phase.kind !== "over") {
      return { rule: g.rule, pack: g.pack, cfg: g.config, cards: g.cards, printed: opts.packOf(g.pack) };
    }
    const s = msg.room.settings;
    return { rule: s.rule, pack: s.pack, cfg: settingsConfig(s), cards: s.cards, printed: opts.packOf(s.pack) };
  };

  const showDiff = (msg: StateMessage): void => {
    const dlg = dialogEl();
    const l = look(msg);
    const playing = msg.game !== null && msg.game.phase.kind !== "over";
    dlg.innerHTML = `<form method="dialog" class="setup diff-dialog">
      <h2>${playing ? "この試合のルール" : "次の試合の設定"}</h2>
      <p class="muted">${badgeHtml(l)}(基準プリセットからの違い)</p>
      ${diffFromPresetHtml(l)}
      <div class="setup-btns"><button type="submit" class="btn btn-quiet" value="close">閉じる</button></div>
    </form>`;
    dlg.showModal();
  };

  const bannerHtml = (msg: StateMessage): string => {
    const p = msg.room.proposal;
    if (p === null) return "";
    const seat = msg.you.seat;
    const mine = seat !== null && p.by === seat;
    const other = seat !== null && msg.you.role === "player" && p.by !== seat;
    let changes: string;
    let title: string;
    if (p.scope === "now") {
      const g = msg.game;
      const printed = g === null ? null : opts.packOf(g.pack);
      const inPlay = g === null || printed === null ? null : applyCardOverrides(printed, g.cards);
      const cardLines =
        inPlay === null ? [] : cardChanges(inPlay, p.cards).map((c) => `${inPlay.byId.get(c.cardId)?.nameJa ?? c.cardId} の${c.label} ${c.from}→${c.to}`);
      changes = g === null ? "" : changeListHtml(configChanges(g.config, applyConfigPatch(g.config, p.patch)), cardLines);
      title = "試合中のルール・カード変更";
    } else {
      const from = msg.room.settings;
      const printedTo = opts.packOf(p.settings.pack);
      const printedFrom = opts.packOf(from.pack);
      const base = p.settings.rule !== from.rule || p.settings.pack !== from.pack ? [`基準: ${from.rule}/${from.pack} → ${p.settings.rule}/${p.settings.pack}`] : [];
      const cardLines = cardChangeLines(printedTo, p.settings.cards);
      const oldCards = cardChangeLines(printedFrom, from.cards);
      const cardDiff = JSON.stringify(cardLines) === JSON.stringify(oldCards) ? [] : [`カードの数値: ${cardLines.length === 0 ? "印刷どおり" : cardLines.join(" / ")}`];
      changes = changeListHtml(configChanges(settingsConfig(from), settingsConfig(p.settings)), [...base, ...cardDiff]);
      title = "次の試合の設定の変更";
    }
    const who = mine ? "あなたの提案" : `${esc(msg.room.seats[p.by].name)}の提案`;
    // both seats asked for a rematch: the server starts it once this proposal is answered or withdrawn
    const held = p.scope === "next" && msg.room.rematch[0] && msg.room.rematch[1];
    const buttons = other
      ? `${held ? `<span class="muted">答えるともう一戦が始まります</span>` : ""}<button type="button" class="btn btn-gold" data-proposal="accept">同意する</button><button type="button" class="btn btn-quiet" data-proposal="decline">断る</button>`
      : mine
        ? `<span class="muted">${held ? "相手が答えるともう一戦が始まります" : "相手の同意を待っています"}</span><button type="button" class="btn btn-quiet" data-proposal="withdraw">取り下げる</button>`
        : "";
    // the owner replaced a proposal that was still waiting: the other seat is answering something new
    const replaced = p.replaced && !mine ? `<p class="proposal-replaced">前の提案は差し替えられました。内容を確かめてから答えてください。</p>` : "";
    return `<div class="proposal" data-id="${p.id}" role="alert"><div class="proposal-head"><b>${title}</b><span>${who}</span></div>${replaced}${changes}<div class="proposal-btns">${buttons}</div></div>`;
  };

  const answerHtml = (msg: StateMessage): string => {
    const a = msg.room.lastAnswer;
    const key = a === null ? "" : `${msg.room.code}:${a.id}`;
    if (a === null || msg.you.seat !== a.by || msg.room.proposal !== null) return "";
    if (answerSeen?.key !== key) {
      // news only once: an answer this tab has shown before (a reload, back from /rules) or one long past stays quiet
      if (seenAnswers().includes(key) || Date.now() - a.at > STALE_ANSWER_MS) return "";
      answerSeen = { key, answer: a, open: true };
      markSeen(key);
      if (answerTimer !== null) clearTimeout(answerTimer);
      answerTimer = setTimeout(() => {
        if (answerSeen?.key === key) answerSeen = { ...answerSeen, open: false };
        if (last !== null) render(last);
      }, ANSWER_MS);
    }
    if (!answerSeen.open) return "";
    const { scope, accepted } = answerSeen.answer;
    const text = accepted ? "相手が提案に同意しました" : "相手が提案を断りました";
    const what = scope === "now" ? "試合中のルール・カード変更" : "次の試合の設定";
    return `<div class="proposal proposal-answer" data-answer="${accepted ? "accepted" : "declined"}" role="status"><div class="proposal-head"><b>${text}</b><span>${what}</span></div><div class="proposal-btns"><button type="button" class="btn btn-quiet" data-answer-close>閉じる</button></div></div>`;
  };

  opts.slots.notice.addEventListener("click", (ev) => {
    if ((ev.target as HTMLElement).closest("button[data-answer-close]") !== null) {
      if (answerSeen !== null) answerSeen = { ...answerSeen, open: false };
      if (last !== null) render(last);
      return;
    }
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-proposal]");
    const p = last?.room.proposal;
    if (b === null || b.disabled || p === null || p === undefined) return;
    const act = b.dataset.proposal;
    // one answer per proposal: every button of the banner waits for the server (a second press or a double click sends nothing)
    const buttons = [...opts.slots.notice.querySelectorAll<HTMLButtonElement>("button[data-proposal]")];
    for (const x of buttons) x.disabled = true;
    const sent = act === "withdraw" ? opts.send({ type: "withdraw", id: p.id }) : opts.send({ type: "answer", id: p.id, accept: act === "accept" });
    void sent.then((ok) => {
      // refused (the proposal was replaced or is gone): the next state redraws the banner; give the buttons back meanwhile
      if (!ok) for (const x of buttons) x.disabled = false;
    });
  });

  opts.slots.tools.addEventListener("click", (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>("button[data-tool]");
    const msg = last;
    if (b === null || msg === null) return;
    if (b.dataset.tool === "diff") showDiff(msg);
    if (b.dataset.tool === "close") opts.closeRoom();
  });

  const ensurePacks = (msg: StateMessage): void => {
    const names = new Set([msg.room.settings.pack, msg.game?.pack ?? msg.room.settings.pack]);
    const p = msg.room.proposal;
    if (p !== null && p.scope === "next") names.add(p.settings.pack);
    for (const name of names) {
      if (opts.packOf(name) === null) void opts.loadPack(name).then(() => last !== null && render(last));
    }
  };

  const render = (msg: StateMessage): void => {
    last = msg;
    ensurePacks(msg);
    const owner = msg.you.seat !== null && msg.room.owner === msg.you.seat;
    const g = msg.game;
    const canPropose = owner && g !== null && msg.room.seats[0].taken && msg.room.seats[1].taken;
    const label = g !== null && g.phase.kind !== "over" ? "ルール・カード変更を提案" : "次の試合の設定";
    // only once the match is over: a live game is left by 投了, not by deleting the room under the other seat
    const canClose = msg.you.role === "player" && msg.room.status === "over";
    const html = `<div class="tools">
      <button type="button" class="rules-badge" data-tool="diff" title="基準からの変更点を見る">${badgeHtml(look(msg))}</button>
      ${canPropose ? `<a class="btn btn-quiet" data-tool="settings" href="${esc(rulesHref({ for: "room", code: msg.room.code, seat: msg.you.seat }))}">${label}</a>` : ""}
      ${canClose ? `<button type="button" class="btn btn-quiet" data-tool="close" title="部屋を削除して、この接続元の部屋数の枠を空けます">部屋を閉じる</button>` : ""}
    </div>`;
    if (toolsHtml !== html) {
      toolsHtml = html;
      opts.slots.tools.innerHTML = html;
    }
    const answer = answerHtml(msg);
    const banner = bannerHtml(msg) || answer;
    if (noticeHtml !== banner) {
      noticeHtml = banner;
      opts.slots.notice.innerHTML = banner;
    }
  };

  return { render };
};
