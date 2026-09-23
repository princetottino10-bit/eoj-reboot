// The 九宮盤: nine lacquer cells with a mother-of-pearl (螺鈿) disc holding
// each cell's attribute mark, the pieces on them, and the overlays drawn on
// top (legal-move glows, range markings in the colours of the card diagram,
// the round command menu, the facing picker, the attack prediction, and the
// control state's seal and lanterns). Pure string builders.
import { cellAttr } from "../src/board.ts";
import type { CommandId } from "../src/commands.ts";
import { cardOfUnit, controlNeed, unitHp, unitMaxHp } from "../src/state.ts";
import type { Ctx } from "../src/state.ts";
import type { Facing, PlayerId, Pos } from "../src/types.ts";
import type { BoardView } from "../online/protocol.ts";
import { cardFaceHtml, esc, pieceHtml } from "./cards-view.ts";
import type { CardLook } from "./hud.ts";
import { ATTR_MARK_ID, mark as markSvg } from "./marks.ts";
import { cellName, FACING_LABEL, occupiedOf, unitAtPos } from "./render.ts";
import type { Names } from "./render.ts";

/** move: where an effect will put a unit (茨木の左腕's 拳 / 握), shown with the confirm step. */
export type CellMark = "summon" | "inherit" | "target" | "heal" | "proxy" | "move";

export const posKey = (p: Pos): string => `${p.x},${p.y}`;

export type RadialItem = {
  id: CommandId;
  label: string;
  cost: number;
  enabled: boolean;
  reason: string | null;
  affordable: boolean;
  active: boolean;
};

export type PredictionHit = { uid: number; dmg: number; blind: boolean; destroyed: boolean; ally: boolean; heal: boolean; hpAfter: number };

export type Prediction = {
  /** null = no attacker on the board side (a reigu strike): no counter badge. */
  attackerUid: number | null;
  hits: PredictionHit[];
  heal: boolean;
  counterTotal: number;
  counterCount: number;
  attackerDestroyed: boolean;
  attackerHpAfter: number;
};

export type BoardVM = {
  ctx: Ctx;
  board: BoardView;
  names: Names;
  look: CardLook;
  marks: Map<string, CellMark>;
  /** The looked-at unit's ranges (counter / aoe optional for older callers). */
  range: { attack: Set<string>; blind: Set<string>; gap: Set<string>; counter?: Set<string>; aoe?: boolean } | null;
  /** The seat drawn at the bottom (the viewer; seat 0 for spectators): its control seal sits on the lower edge. */
  bottom?: PlayerId;
  selectedUid: number | null;
  selectedCell: Pos | null;
  prediction: Prediction | null;
  radial: { uid: number; items: RadialItem[] } | null;
  /**
   * The facing picker. `turn` = an existing unit is being turned (家鳴り, proxy
   * rotate): the ghost starts at its current facing and the piece under it fades.
   */
  facing: { pos: Pos; cardId: string; options: { facing: Facing; enabled: boolean }[]; turn?: { from: Facing } } | null;
};

const GLYPH: Record<CommandId, string> = {
  attack: "攻",
  konshin: "渾",
  regen: "再",
  drink: "酒",
  heal: "癒",
  rotateLeft: "左",
  rotateRight: "右",
  proxyRotate: "代",
};

/** Angle (deg, 0 = up, clockwise) of each command around the piece. */
const ANGLE: Record<CommandId, number> = {
  attack: 0,
  konshin: 52,
  // one card never has two of 渾身 / 再生 / 飲酒: they share the slot
  regen: 52,
  drink: 52,
  heal: -52,
  rotateLeft: -104,
  rotateRight: 104,
  proxyRotate: 180,
};

const gridPlace = (p: Pos): string => `grid-column:${p.x + 1};grid-row:${3 - p.y}`;

/** Seats in the control state; a finished match has none (the result says how it ended). */
const controlSeats = (board: BoardView): PlayerId[] => (board.ended ? [] : ([0, 1] as PlayerId[]).filter((p) => board.players[p].reach));

const cellHtml = (vm: BoardVM, pos: Pos): string => {
  const k = posKey(pos);
  const attr = cellAttr(pos);
  const u = unitAtPos(vm.board, pos);
  const mark = vm.marks.get(k);
  const ctl = controlSeats(vm.board);
  const cls = ["cell", `c-${attr}`];
  if (mark !== undefined) cls.push(`mk-${mark}`);
  if (vm.range?.attack.has(k)) cls.push("rg-attack", vm.range.aoe === true ? "rg-area" : "rg-single");
  if (vm.range?.counter?.has(k)) cls.push("rg-counter");
  if (vm.range?.blind.has(k)) cls.push("rg-blind");
  if (vm.range?.gap.has(k)) cls.push("rg-gap");
  if (u !== undefined && u.uid === vm.selectedUid) cls.push("is-selected");
  if (vm.selectedCell !== null && posKey(vm.selectedCell) === k) cls.push("is-selected");
  if (u !== undefined) cls.push("has-unit");
  if (vm.facing?.turn !== undefined && posKey(vm.facing.pos) === k) cls.push("is-turning");
  // the piece prints no name: the label says whose it is, which card, and its HP
  const who =
    u === undefined
      ? "空きマス"
      : `${vm.names[u.owner]}の駒 ${cardOfUnit(vm.ctx, u).nameJa}(HP ${Math.max(0, unitHp(vm.ctx, u))}/${unitMaxHp(vm.ctx, u)}・${FACING_LABEL[u.facing]}向き)`;
  const markText =
    mark === "summon" ? " / 召喚できる" : mark === "inherit" ? " / 継承召喚できる" : mark === "target" ? " / 対象にできる" : mark === "heal" ? " / 回復できる" : mark === "proxy" ? " / 回せる" : mark === "move" ? " / ここへ動かされる" : "";
  const rangeText = `${vm.range?.attack.has(k) ? " / 攻撃範囲" : ""}${vm.range?.counter?.has(k) ? " / 反撃範囲" : ""}${vm.range?.blind.has(k) ? " / 死角" : ""}${vm.range?.gap.has(k) ? " / 隙位置" : ""}`;
  const piece =
    u === undefined ? "" : pieceHtml(vm.ctx, u, { ...vm.look, control: ctl.includes(u.owner), turnPlayer: vm.board.turnPlayer });
  return `<button type="button" class="${cls.join(" ")}" data-act="cell" data-x="${pos.x}" data-y="${pos.y}" style="${gridPlace(pos)}"
    aria-label="${cellName(pos)}のマス / ${esc(who)}${markText}${rangeText}">
    <span class="raden${u === undefined ? "" : " chip"}" aria-hidden="true">${markSvg(ATTR_MARK_ID[attr], "raden-mk")}</span>${vm.range?.gap.has(k) ? '<span class="cell-gap">隙</span>' : ""}${piece}
  </button>`;
};

const radialHtml = (vm: BoardVM): string => {
  const r = vm.radial;
  if (r === null) return "";
  const u = vm.board.units.find((x) => x.uid === r.uid);
  if (u === undefined) return "";
  // On the top row the menu opens downward so it does not cover the opponent's nameplate.
  const angleOf = (id: CommandId): number => (u.pos.y === 2 ? 180 - ANGLE[id] : ANGLE[id]);
  const items = r.items
    .map((it) => {
      const tip = it.enabled ? `${it.label}(霊力${it.cost})` : `${it.label}: ${it.reason ?? "使えない"}`;
      const cls = ["rd-btn", it.enabled ? "" : "is-off", it.active ? "is-active" : ""].join(" ");
      return `<button type="button" class="${cls}" data-act="cmd" data-cmd="${it.id}" style="--a:${angleOf(it.id)}deg"
        aria-label="${esc(tip)}" aria-disabled="${!it.enabled}" data-tip="${esc(tip)}">
        <span class="rd-glyph">${GLYPH[it.id]}</span><span class="rd-cost ${it.affordable ? "ok" : "short"}">${it.cost}</span>
      </button>`;
    })
    .join("");
  return `<div class="rd" data-x="${u.pos.x}" style="${gridPlace(u.pos)}" role="menu" aria-label="駒への命令">${items}</div>`;
};

const facingHtml = (vm: BoardVM): string => {
  const f = vm.facing;
  if (f === null) return "";
  const verb = f.turn === undefined ? "向きで召喚" : "向きにする";
  const buttons = f.options
    .map(
      (o) => `<button type="button" class="fc-btn fc-${o.facing}" data-act="face" data-f="${o.facing}" ${o.enabled ? "" : "disabled"}
        aria-label="${FACING_LABEL[o.facing]}${verb}"><i class="fc-arrow"></i></button>`,
    )
    .join("");
  const turn = f.turn === undefined ? "" : ` fc-turn from-${f.turn.from}`;
  return `<div class="fc${turn}" data-x="${f.pos.x}" style="${gridPlace(f.pos)}">
    <div class="fc-ghost">${cardFaceHtml(vm.ctx, f.cardId, { size: "sm", ...vm.look })}</div>${buttons}
  </div>`;
};

const predictionHtml = (vm: BoardVM): string => {
  const pv = vm.prediction;
  if (pv === null) return "";
  const out: string[] = [];
  for (const h of pv.hits) {
    const u = vm.board.units.find((x) => x.uid === h.uid);
    if (u === undefined) continue;
    const badge = h.heal
      ? `<span class="pv-num heal">+${-h.dmg}</span>`
      : `<span class="pv-num">−${h.dmg}</span>${h.blind ? '<span class="pv-tag blind">死角</span>' : ""}${h.ally ? '<span class="pv-tag ally">味方</span>' : ""}`;
    out.push(`<div class="pv${h.destroyed ? " is-kill" : ""}" style="${gridPlace(u.pos)}">${badge}<span class="pv-after">HP ${h.hpAfter}</span>${
      h.destroyed ? '<span class="pv-stamp">撃破</span>' : ""
    }</div>`);
  }
  const a = pv.attackerUid === null ? undefined : vm.board.units.find((x) => x.uid === pv.attackerUid);
  if (a !== undefined && !pv.heal) {
    const counter =
      pv.counterTotal > 0
        ? `<span class="pv-counter">反撃 −${pv.counterTotal}</span>`
        : '<span class="pv-counter none">反撃なし</span>';
    out.push(`<div class="pv pv-self${pv.attackerDestroyed ? " is-kill" : ""}" style="${gridPlace(a.pos)}">${counter}${
      pv.attackerDestroyed ? '<span class="pv-stamp">撃破</span>' : ""
    }</div>`);
  }
  return out.join("");
};

/**
 * The control state on the board frame: a vermilion 「制」 seal on the
 * holder's edge and a row of lanterns, one per cell control needs, lit for
 * each cell the holder occupies. The rim glow is the board's own class.
 */
const controlHtml = (vm: BoardVM, seats: PlayerId[]): string =>
  seats
    .map((p) => {
      const need = controlNeed(vm.ctx, vm.board);
      const occ = occupiedOf(vm.ctx, vm.board, p);
      const lamps = Array.from({ length: need }, (_, i) => `<i class="bd-lamp${i < occ ? " on" : ""}"></i>`).join("");
      const edge = p === (vm.bottom ?? 0) ? "low" : "high";
      return `<div class="bd-ctl bd-ctl-${edge} o${p}" data-seat="${p}" aria-hidden="true"><span class="bd-lamps">${lamps}</span><span class="bd-seal">制</span></div>`;
    })
    .join("");

/**
 * The whole board. A side in the control state lights the rim gold (a slow
 * pulse while the other side is on turn and has to break it) and puts its
 * seal and lanterns on its edge.
 */
export const boardHtml = (vm: BoardVM): string => {
  const cells: string[] = [];
  for (let y = 2; y >= 0; y--) for (let x = 0; x < 3; x++) cells.push(cellHtml(vm, { x, y }));
  const ctl = controlSeats(vm.board);
  const cls = ["bd", ...ctl.map((p) => `ctl-${p}`), ctl.some((p) => p !== vm.board.turnPlayer) ? "ctl-wait" : ""].filter((c) => c !== "").join(" ");
  return `<div class="${cls}">
    <div class="bd-grid">${cells.join("")}</div>
    <div class="bd-over">${predictionHtml(vm)}${facingHtml(vm)}${radialHtml(vm)}</div>
    ${controlHtml(vm, ctl)}
  </div>`;
};
