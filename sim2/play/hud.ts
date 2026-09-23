// Everything around the board: name plates, deck / grave piles, the
// opponent's face-down hand, the turn indicator, the detail panel and the log.
// Pure string builders over the public board view.
import type { CardOverrides } from "../src/card-overrides.ts";
import { cardOf } from "../src/cards.ts";
import { incomeParts } from "../src/rules.ts";
import { cardOfUnit, controlNeed, isHidden, unitHp, unitMaxHp } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import type { CardDef, PlayerId, Unit } from "../src/types.ts";
import type { BoardView, LogItem } from "../online/protocol.ts";
import { cardBackHtml, cardFaceHtml, cardThumbHtml, esc, SEAT_SEAL } from "./cards-view.ts";
import { orderLog } from "./log-order.ts";
import { controlLabel, describeEvent, FACING_LABEL, gapNote, occupiedOf, resultHow } from "./render.ts";
import type { LogNote, Names } from "./render.ts";

export type CardLook = { mods?: CardOverrides; printed?: (id: string) => CardDef | undefined };

/** The income tooltip: what p would be paid now (incomeParts: current-count income and 劣勢ボーナス included). */
const incomeTip = (ctx: Ctx, board: BoardView, p: PlayerId): string => {
  const inc = incomeParts(ctx, board, p);
  const bits = [`収入 ${inc.total}`];
  if (inc.underdog > 0) bits.push(`うち劣勢ボーナス+${inc.underdog}`);
  if (ctx.cfg.incomeMode === "current") bits.push("今の占拠で判定");
  return bits.join("・");
};

/** Chip marks: lit up to the chip count, one mark per income step reached is gold. */
const chipsHtml = (ctx: Ctx, board: BoardView, p: PlayerId): string => {
  const chips = board.players[p].chips;
  const slots = Math.max(ctx.cfg.controlWin, chips, ...ctx.cfg.chipIncomeSteps);
  const marks: string[] = [];
  for (let i = 1; i <= slots; i++) {
    const lit = i <= chips;
    const step = ctx.cfg.chipIncomeSteps.includes(i);
    marks.push(`<i class="chip${lit ? " on" : ""}${step ? " step" : ""}" data-chip="${i}"></i>`);
  }
  return `<span class="np-chips" title="チップ ${chips}枚(${incomeTip(ctx, board, p)})">${marks.join("")}</span>`;
};

/** How heavy units count, for the 占拠 tooltip ("" under controlCount cells). */
const occTip = (ctx: Ctx): string =>
  ctx.cfg.controlCount === "hp"
    ? `・HP${ctx.cfg.controlCountThreshold}以上の駒は2マス分`
    : ctx.cfg.controlCount === "cost"
      ? `・召喚コスト${ctx.cfg.controlCountThreshold}以上の駒は2マス分`
      : "";

/** controlWinMode "points": 「制圧点 1/2」. Nothing under "hold". */
const pointsHtml = (ctx: Ctx, points: number | undefined): string =>
  ctx.cfg.controlWinMode === "points"
    ? `<span class="np-stat np-pts" data-stat="points" title="制圧点(${ctx.cfg.controlPointsToWin}点で勝利)"><i>制圧点</i><b>${points ?? 0}</b><small>/${ctx.cfg.controlPointsToWin}</small></span>`
    : "";

export const nameplateHtml = (ctx: Ctx, board: BoardView, p: PlayerId, names: Names, you: boolean): string => {
  const ps = board.players[p];
  const turn = board.turnPlayer === p && !board.ended;
  const ctl = ps.reach && !board.ended;
  const occ = occupiedOf(ctx, board, p);
  const need = controlNeed(ctx, board);
  const late = need !== ctx.cfg.controlWin;
  const cls = ["np", `o${p}`, turn ? "is-turn" : "", ctl ? "is-ctl" : "", you ? "is-you" : ""].join(" ");
  return `<div class="${cls}" data-seat="${p}">
    <span class="np-seal" aria-label="${p === 0 ? "先手" : "後手"}">${SEAT_SEAL[p]}</span>
    <span class="np-who"><span class="np-name">${esc(names[p])}</span>${turn ? '<span class="np-turn">手番</span>' : ""}${
      ctl ? `<span class="np-ctl">${controlLabel(ctx)}</span>` : ""
    }</span>
    ${ctx.cfg.lifeValueEnabled ? `<span class="np-stat np-life" data-stat="life" title="生命"><i>生命</i><b>${Math.max(0, ps.life)}</b></span>` : ""}
    <span class="np-stat np-mana" data-stat="mana" title="霊力(上限 ${ctx.cfg.manaCap})"><i>霊力</i><b>${ps.mana}</b></span>
    <span class="np-stat np-occ${late ? " is-late" : ""}" data-need="${need}" title="占拠 / 制圧に必要なマス${late ? "(終盤)" : ""}${occTip(ctx)}"><i>占拠</i><b>${occ}</b><small>/${need}</small></span>
    ${pointsHtml(ctx, ps.controlPoints)}
    ${chipsHtml(ctx, board, p)}
  </div>`;
};

export const pilesHtml = (ctx: Ctx, board: BoardView, p: PlayerId, look: CardLook): string => {
  const ps = board.players[p];
  const top = ps.grave[ps.grave.length - 1];
  const layers = Math.min(4, Math.ceil(ps.deckCount / 6));
  const deck = Array.from({ length: Math.max(1, layers) }, (_, i) => cardBackHtml(`pile-layer l${i}${ps.deckCount === 0 ? " empty" : ""}`)).join("");
  return `<div class="piles o${p}">
    <div class="pile pile-deck" title="山札 ${ps.deckCount}枚${ps.reshuffleCount > 0 ? `(墓地から${ps.reshuffleCount}回戻した)` : ""}">
      <div class="pile-stack">${deck}</div><span class="pile-n"><b>${ps.deckCount}</b><i>山札</i></span>
    </div>
    <button type="button" class="pile pile-grave" data-act="grave" data-seat="${p}" title="墓地 ${ps.grave.length}枚(押すと一覧)">
      <div class="pile-stack">${top === undefined ? '<div class="fu fu-empty"></div>' : cardFaceHtml(ctx, top, { size: "sm", ...look })}</div>
      <span class="pile-n"><b>${ps.grave.length}</b><i>墓地</i></span>
    </button>
  </div>`;
};

export const oppHandHtml = (count: number): string => {
  const n = Math.min(count, 12);
  const mid = (n - 1) / 2;
  const backs = Array.from({ length: n }, (_, i) => {
    const off = i - mid;
    return `<div class="ohand-card" style="--i:${off.toFixed(2)}">${cardBackHtml()}</div>`;
  }).join("");
  return `<div class="ohand" aria-label="相手の手札 ${count}枚">${backs}<span class="ohand-n">${count}</span></div>`;
};

/** mulligan: both seats choose at once, so no one's turn is named. */
export type TurnInfo = { phaseText: string; mulligan?: boolean };

export const turnHtml = (ctx: Ctx, board: BoardView, names: Names, info: TurnInfo): string => {
  const p = board.turnPlayer;
  // a finished match has no control state to watch: the result says how it ended
  const holders = board.ended ? [] : ([0, 1] as PlayerId[]).filter((x) => board.players[x].reach);
  const who = board.ended
    ? "対局終了"
    : info.mulligan === true
      ? "マリガン(両者)"
      : `<span class="turn-seal">${SEAT_SEAL[p]}</span>${esc(names[p])}の番`;
  const how = board.ended ? resultHow(board.winType, board.winner, names) : null;
  const result =
    board.winner === null ? esc(how ?? "引き分け") : `${esc(names[board.winner])}の勝ち${how === null ? "" : `・${esc(how)}`}`;
  // "たろうが行動中" under "たろうの番" only needs "行動中"
  const own = `${names[p]}が`;
  const phaseText = info.phaseText.startsWith(own) ? info.phaseText.slice(own.length) : info.phaseText;
  const phase = board.ended ? result : info.mulligan === true ? "" : esc(phaseText);
  return `<div class="turn o${board.ended || info.mulligan === true ? "x" : p}">
    <span class="turn-round">第${board.round}ラウンド</span>
    <span class="turn-who">${who}</span>
    ${phase === "" ? "" : `<span class="turn-phase">${phase}</span>`}
    ${holders.map((h) => `<span class="turn-ctl o${h}" title="${esc(names[h])} ${controlLabel(ctx)}(占拠${occupiedOf(ctx, board, h)})"><span class="turn-ctl-who">${esc(names[h])} </span>${controlLabel(ctx)}<span class="turn-ctl-occ">(占拠${occupiedOf(ctx, board, h)})</span></span>`).join("")}
  </div>`;
};

// ------------------------------------------------------------------ detail

export type Focus =
  | { kind: "none" }
  | { kind: "card"; cardId: string; note?: string }
  | { kind: "unit"; uid: number }
  | { kind: "grave"; seat: PlayerId };

const unitStatus = (ctx: Ctx, u: Unit, names: Names, turnPlayer: PlayerId): string => {
  const flags: string[] = [];
  if (isHidden(u)) flags.push("マヨヒガで隠れている");
  // the acted-this-turn flags are cleared at the owner's next turn start: only the turn player's are current
  const current = u.owner === turnPlayer;
  if (current && u.attackedThisTurn) flags.push("このターン攻撃済み");
  else if (current && u.rotatedThisTurn) flags.push("このターン回転済み");
  if (current && u.summonedThisTurn) flags.push("このターン召喚");
  if (u.atkBuff > 0) flags.push(`ATK+${u.atkBuff}(このターン)`);
  const note = gapNote(ctx, u);
  return `<div class="dt-status o${u.owner}">
    <span>${esc(names[u.owner])}</span>
    <span><i>HP</i><b>${Math.max(0, unitHp(ctx, u))}</b>/${unitMaxHp(ctx, u)}</span>
    <span><i>向き</i>${FACING_LABEL[u.facing]}</span>
    ${flags.length > 0 ? `<span class="dt-flags">${flags.join(" / ")}</span>` : ""}
    ${note === "" ? "" : `<span class="dt-note">${esc(note)}</span>`}
  </div>`;
};

export const detailHtml = (ctx: Ctx, board: BoardView, names: Names, focus: Focus, look: CardLook): string => {
  if (focus.kind === "unit") {
    const u = board.units.find((x) => x.uid === focus.uid);
    if (u === undefined) return detailHtml(ctx, board, names, { kind: "none" }, look);
    return `<div class="dt dt-unit">${cardFaceHtml(ctx, cardOfUnit(ctx, u).id, { size: "lg", ...look })}${unitStatus(ctx, u, names, board.turnPlayer)}</div>`;
  }
  if (focus.kind === "card") {
    return `<div class="dt">${cardFaceHtml(ctx, focus.cardId, { size: "lg", ...look })}${
      focus.note === undefined ? "" : `<div class="dt-note">${esc(focus.note)}</div>`
    }</div>`;
  }
  if (focus.kind === "grave") {
    const g = board.players[focus.seat].grave;
    const item = (id: string): string => {
      const card = cardOf(ctx.pack, id);
      return `<li><button type="button" data-act="peek" data-card="${esc(id)}">${cardThumbHtml(card)}${esc(card.nameJa)}</button></li>`;
    };
    const items = g.length === 0 ? '<li class="muted">(なし)</li>' : g.map(item).join("");
    return `<div class="dt dt-grave"><h3>${esc(names[focus.seat])}の墓地(${g.length}枚)</h3><ol>${items}</ol></div>`;
  }
  return `<div class="dt dt-empty"><p>札や駒を選ぶと、ここに大きく表示します。</p></div>`;
};

// --------------------------------------------------------------------- log

export const LOG_SHORT = 5;

/** Lines in cause -> effect order (log-order.ts). `notes` adds what the table saw (rotations). */
export const logHtml = (ctx: Ctx, names: Names, log: LogItem[], expanded: boolean, notes?: ReadonlyMap<number, LogNote>): string => {
  const lines: string[] = [];
  const cardOfUid = new Map<number, string>();
  for (const item of log) if (item.event.t === "summon") cardOfUid.set(item.event.uid, item.event.cardId);
  for (const item of orderLog(log)) {
    const e = item.event;
    const note = notes?.get(item.seq) ?? (e.t === "rotate" && cardOfUid.has(e.uid) ? { cardId: cardOfUid.get(e.uid) } : undefined);
    const line = describeEvent(ctx, names, e, note);
    if (line !== null) lines.push(`<li class="${line.cls}" data-seq="${item.seq}" title="${esc(line.text)}">${esc(line.text)}</li>`);
  }
  const shown = expanded ? lines : lines.slice(-LOG_SHORT);
  return `<div class="log${expanded ? " is-open" : ""}">
    <div class="log-head"><h3>記録</h3><button type="button" data-act="log" aria-expanded="${expanded}">${
      expanded ? "直近だけ" : `全件(${lines.length})`
    }</button></div>
    <ol class="log-list">${shown.join("")}</ol>
  </div>`;
};
