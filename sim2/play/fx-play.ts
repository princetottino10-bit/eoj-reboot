// The animations of one step, built from the engine events it produced
// (DESIGN-UI-V2 Sec.1.5). Pieces that left the board are replayed as ghosts
// cut from the previous frame. Web Animations API with transform / opacity
// (the burn also clips); the returned number is how long the step needs
// before the next queued step may be drawn. Every beat stays under ~0.9s.
//
//   summon   the card flies in folded like a talisman, unfolds, a gold burst
//   attack   the attacker lunges, an ink slash crosses the target, the damage in vermilion
//   destroy  the card burns away; its 生命価 flame flies to the owner's life number,
//            which changes when the flame arrives
//   control  the rim lights gold, the 「制」 seal stamps onto the holder's edge, the lanterns light
import type { GameEvent } from "../src/types.ts";
import type { FlowEvent } from "../src/flow.ts";
import type { LogItem } from "../online/protocol.ts";
import { esc } from "./cards-view.ts";
import { mark } from "./marks.ts";

export type Snapshot = {
  pieces: Map<number, { rect: DOMRect; html: string; facing: number }>;
  stats: Map<string, number>;
  selectedHand: DOMRect | null;
  oppHand: DOMRect | null;
  selfHand: DOMRect | null;
};

type Host = { root: HTMLElement; layer: HTMLElement; board: HTMLElement };

type DestroyEvent = Extract<GameEvent, { t: "destroy" }>;

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/** A 生命価 flame on its way to a name plate: it lands `at` ms into the step, taking `loss` life. */
type Flight = { seat: number; at: number; loss: number };

type Ctx = { host: Host; snap: Snapshot; viewer: 0 | 1 | null; end: number; destroys: Map<number, DestroyEvent>; flights: Flight[] };

const centerOf = (r: DOMRect): { x: number; y: number } => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

const run = (c: Ctx, el: Element | null, frames: Keyframe[], delay: number, duration: number, easing = EASE): void => {
  if (el === null) return;
  el.animate(frames, { duration, delay, easing, fill: "backwards" });
  c.end = Math.max(c.end, delay + duration);
};

const pieceEl = (c: Ctx, uid: number): HTMLElement | null => c.host.board.querySelector<HTMLElement>(`.pc[data-uid="${uid}"]`);

const pieceRect = (c: Ctx, uid: number): DOMRect | null => pieceEl(c, uid)?.getBoundingClientRect() ?? c.snap.pieces.get(uid)?.rect ?? null;

/** A temporary element in the fx layer; removed after `life` ms. */
const temp = (c: Ctx, cls: string, rect: DOMRect, html: string, life: number): HTMLElement => {
  const el = document.createElement("div");
  el.className = cls;
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.top}px`;
  el.style.width = `${rect.width}px`;
  el.style.height = `${rect.height}px`;
  el.innerHTML = html;
  c.host.layer.appendChild(el);
  setTimeout(() => el.remove(), life + 60);
  return el;
};

/** The piece as it looked before this step (for pieces that are gone now). */
const ghost = (c: Ctx, uid: number, life: number): HTMLElement | null => {
  const old = c.snap.pieces.get(uid);
  return old === undefined ? null : temp(c, "fx-cell", old.rect, old.html, life);
};

/** Keyframe easings apply per segment; the whole animation then runs on linear time so the offsets mean what they say. */
const OUT = "cubic-bezier(0.2, 0.8, 0.3, 1)";

const word = (c: Ctx, text: string, at: DOMRect, cls: string, delay: number, duration: number): void => {
  const el = temp(c, `fx-word ${cls}`, at, `<span>${esc(text)}</span>`, delay + duration);
  el.style.opacity = "0";
  run(c, el, [
    { opacity: 0, transform: "translateY(10px) scale(0.7)", easing: OUT },
    { opacity: 1, transform: "translateY(-6px) scale(1.08)", offset: 0.2, easing: "ease-out" },
    { opacity: 1, transform: "translateY(-18px) scale(1)", offset: 0.72, easing: "ease-in" },
    { opacity: 0, transform: "translateY(-34px) scale(1)" },
  ], delay, duration, "linear");
};

const isOwn = (c: Ctx, player: number): boolean => (c.viewer === null ? player === 0 : player === c.viewer);

// ------------------------------------------------------------------ beats

/** A gold burst of rays where a piece lands. */
const burst = (c: Ctx, at: DOMRect, t: number): void => {
  const el = temp(c, "fx-burst", at, "<i></i>", t + 560);
  el.style.opacity = "0";
  run(c, el, [
    { opacity: 0, transform: "scale(0.35) rotate(-8deg)" },
    { opacity: 1, transform: "scale(0.95) rotate(0deg)", offset: 0.35 },
    { opacity: 0, transform: "scale(1.3) rotate(6deg)" },
  ], t, 520, "ease-out");
};

const summon = (c: Ctx, e: Extract<GameEvent, { t: "summon" }>, t: number): number => {
  const el = pieceEl(c, e.uid);
  if (el === null) return t;
  const to = el.getBoundingClientRect();
  if (e.inheritedFrom !== undefined) {
    const g = ghost(c, e.inheritedFrom.uid, t + 450);
    run(c, g, [{ opacity: 1, transform: "scale(1)" }, { opacity: 0.6, transform: "scale(1.06) translateY(-4px)", offset: 0.4 }, { opacity: 0, transform: "scale(1.12) translateY(-10px)" }], t, 450);
    if (g !== null) g.style.opacity = "0";
    run(c, el, [{ opacity: 0, transform: "translateY(14%) scale(0.94)" }, { opacity: 1, transform: "none" }], t + 140, 420);
    word(c, "継承", to, "fx-violet", t + 120, 700);
    return t + 450;
  }
  const origin = isOwn(c, e.player) ? (c.snap.selectedHand ?? c.snap.selfHand) : c.snap.oppHand;
  const from = origin === null ? to : origin;
  const a = centerOf(from);
  const b = centerOf(to);
  const s = Math.max(0.4, Math.min(1.6, from.width / Math.max(1, to.width)));
  // folded like a talisman on the way (a narrow strip), unfolding as it lands
  run(c, el, [
    { transform: `translate(${a.x - b.x}px, ${a.y - b.y}px) scale(${s * 0.22}, ${s})`, opacity: 0.85, easing: OUT },
    { transform: "translate(0, -5%) scale(0.2, 1.04)", opacity: 1, offset: 0.46, easing: "cubic-bezier(0.3, 0, 0.2, 1.4)" },
    { transform: "translate(0, 0) scale(1.06, 1.02)", offset: 0.8, easing: "ease-out" },
    { transform: "none" },
  ], t, 560, "linear");
  burst(c, to, t + 260);
  return t + 540;
};

/** The card burns away from the bottom edge up, with a glowing edge and a few embers. */
const burn = (c: Ctx, uid: number, t: number): void => {
  const old = c.snap.pieces.get(uid);
  if (old === undefined) return;
  const g = temp(c, "fx-cell fx-burn", old.rect, old.html, t + 680);
  const edge = (y: number): string => {
    const pts = Array.from({ length: 9 }, (_, i) => `${100 - i * 12.5}% ${(y + (i % 2 === 0 ? 4 : -4)).toFixed(1)}%`);
    return `polygon(0 0, 100% 0, ${pts.join(", ")}, 0 0)`;
  };
  g.animate([{ clipPath: edge(108) }, { clipPath: edge(-8) }], { duration: 640, delay: t, easing: "cubic-bezier(0.45, 0, 0.8, 0.6)", fill: "both" });
  c.end = Math.max(c.end, t + 640);
  const line = temp(c, "fx-burn-edge", old.rect, "<i></i>", t + 680);
  line.style.opacity = "0";
  run(c, line, [
    { opacity: 0, transform: "translateY(0)" },
    { opacity: 1, transform: `translateY(${-old.rect.height * 0.2}px)`, offset: 0.15 },
    { opacity: 1, transform: `translateY(${-old.rect.height * 0.85}px)`, offset: 0.85 },
    { opacity: 0, transform: `translateY(${-old.rect.height}px)` },
  ], t, 640, "cubic-bezier(0.45, 0, 0.8, 0.6)");
  // kept until the last ember (t + 120 + 4 * 70 + 620) has faded
  const embers = temp(c, "fx-embers", old.rect, "<i></i><i></i><i></i><i></i><i></i>", t + 1040);
  embers.querySelectorAll("i").forEach((dot, i) => {
    (dot as HTMLElement).style.opacity = "0";
    run(c, dot, [
      { opacity: 0, transform: "translate(0, 0) scale(1)" },
      { opacity: 1, transform: `translate(${(i - 2) * 3}px, -14px) scale(1)`, offset: 0.3 },
      { opacity: 0, transform: `translate(${(i - 2) * 7}px, -46px) scale(0.4)` },
    ], t + 120 + i * 70, 620, "ease-out");
  });
};

/** The destroyed card's 生命価 flame flies to its owner's life number. */
const flame = (c: Ctx, uid: number, t: number): void => {
  const d = c.destroys.get(uid);
  const old = c.snap.pieces.get(uid);
  if (d === undefined || old === undefined || d.lifeLoss <= 0) return;
  const target = c.host.root.querySelector<HTMLElement>(`.np[data-seat="${d.owner}"] [data-stat="life"] b`);
  if (target === null) return;
  const from = centerOf(old.rect);
  const toRect = target.getBoundingClientRect();
  const to = centerOf(toRect);
  const size = Math.max(24, Math.min(44, old.rect.width * 0.24));
  const box = new DOMRect(from.x - size / 2, from.y - size / 2, size, size);
  const el = temp(c, "fx-flame", box, `${mark("life")}${d.lifeLoss > 1 ? `<b>−${d.lifeLoss}</b>` : ""}`, t + 700);
  el.style.opacity = "0";
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lift = -Math.min(120, Math.max(50, Math.abs(dx) * 0.25 + 40));
  run(c, el, [
    { opacity: 0, transform: "translate(0, 0) scale(0.5)", easing: "ease-out" },
    { opacity: 1, transform: "translate(0, -10px) scale(1.1)", offset: 0.16, easing: "ease-in-out" },
    { opacity: 1, transform: `translate(${dx * 0.5}px, ${dy * 0.5 + lift}px) scale(1)`, offset: 0.56, easing: "ease-in" },
    { opacity: 1, transform: `translate(${dx}px, ${dy}px) scale(0.72)`, offset: 0.92 },
    { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(0.5)` },
  ], t, 660, "linear");
  c.flights.push({ seat: d.owner, at: t + 610, loss: d.lifeLoss });
};

/**
 * 採用 9/22 (no life): the destroyed card's 霊力価 (the print kit's blue flame)
 * flies to the 霊力 of whoever it paid (the destroyer), marked +N, and the
 * number pulses when it lands.
 */
const manaFlight = (c: Ctx, uid: number, t: number): void => {
  const d = c.destroys.get(uid);
  const old = c.snap.pieces.get(uid);
  if (d === undefined || old === undefined || d.lifeLoss > 0 || d.manaGain <= 0 || d.manaTo === undefined || d.manaTo === null) return;
  const target = c.host.root.querySelector<HTMLElement>(`.np[data-seat="${d.manaTo}"] [data-stat="mana"] b`);
  if (target === null) return;
  const from = centerOf(old.rect);
  const to = centerOf(target.getBoundingClientRect());
  const size = Math.max(24, Math.min(44, old.rect.width * 0.24));
  const box = new DOMRect(from.x - size / 2, from.y - size / 2, size, size);
  const el = temp(c, "fx-flame fx-mana", box, `${mark("flame")}<b>+${d.manaGain}</b>`, t + 700);
  el.style.opacity = "0";
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lift = -Math.min(120, Math.max(50, Math.abs(dx) * 0.25 + 40));
  run(c, el, [
    { opacity: 0, transform: "translate(0, 0) scale(0.5)", easing: "ease-out" },
    { opacity: 1, transform: "translate(0, -10px) scale(1.1)", offset: 0.16, easing: "ease-in-out" },
    { opacity: 1, transform: `translate(${dx * 0.5}px, ${dy * 0.5 + lift}px) scale(1)`, offset: 0.56, easing: "ease-in" },
    { opacity: 1, transform: `translate(${dx}px, ${dy}px) scale(0.72)`, offset: 0.92 },
    { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(0.5)` },
  ], t, 660, "linear");
  pulse(c, d.manaTo, "mana", "fx-up", t + 610);
};

/** A destroyed piece: it burns, and (after a beat) its flame leaves for the owner's plate (or its 霊力価 for the destroyer's). */
const destroyBeat = (c: Ctx, uid: number, t: number): number => {
  burn(c, uid, t);
  flame(c, uid, t + 220);
  manaFlight(c, uid, t + 220);
  return t + 640;
};

const pulse = (c: Ctx, seat: number, stat: string, cls: string, t: number): void => {
  const el = c.host.root.querySelector<HTMLElement>(`.np[data-seat="${seat}"] [data-stat="${stat}"] b`);
  if (el === null) return;
  setTimeout(() => el.classList.add(cls), t);
  setTimeout(() => el.classList.remove(cls), t + 520);
  run(c, el, [{ transform: "scale(1)" }, { transform: "scale(1.45)", offset: 0.35 }, { transform: "scale(1)" }], t, 500);
};

/** An ink slash across the target (the hit); the damage number follows in vermilion. */
const slash = (c: Ctx, at: DOMRect, t: number): void => {
  const el = temp(c, "fx-slash", at, '<svg viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><path d="M0 12 C 25 8, 60 5, 100 2 L 98 9 C 60 12, 30 15, 2 17 Z"/></svg>', t + 480);
  const svg = el.firstElementChild;
  el.style.opacity = "1";
  run(c, svg, [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], t, 170, "cubic-bezier(0.2, 0.8, 0.2, 1)");
  run(c, el, [{ opacity: 1 }, { opacity: 1, offset: 0.45 }, { opacity: 0 }], t, 460, "ease-in");
};

const attack = (c: Ctx, e: Extract<GameEvent, { t: "attack" }>, destroyed: number[], t: number): number => {
  const aRect = pieceRect(c, e.uid);
  if (aRect === null) return t;
  const attacker = pieceEl(c, e.uid) ?? ghost(c, e.uid, t + (e.counterTotal > 0 ? 700 : 400));
  const first = e.hits[0];
  const tRect = first === undefined ? null : pieceRect(c, first.uid);
  const a = centerOf(aRect);
  const b = tRect === null ? { x: a.x, y: a.y - aRect.height } : centerOf(tRect);
  const dx = (b.x - a.x) * 0.24;
  const dy = (b.y - a.y) * 0.24;
  run(c, attacker, [{ transform: "none" }, { transform: `translate(${dx}px, ${dy}px) scale(1.05)`, offset: 0.35 }, { transform: "none" }], t, 400);
  let beat = t + 400;
  for (const h of e.hits) {
    const r = pieceRect(c, h.uid);
    if (r === null) continue;
    const el = h.destroyed ? null : pieceEl(c, h.uid);
    if (e.variant === "heal") {
      word(c, `+${-h.dmg}`, r, "fx-heal", t + 160, 820);
      continue;
    }
    slash(c, r, t + 120);
    run(c, el, [
      { transform: "none" }, { transform: "translateX(-6px)", offset: 0.2 }, { transform: "translateX(5px)", offset: 0.45 },
      { transform: "translateX(-3px)", offset: 0.7 }, { transform: "none" },
    ], t + 150, 260);
    word(c, `−${h.dmg}`, r, "fx-dmg", t + 170, 820);
    if (h.blind) {
      const flash = temp(c, "fx-flash", r, "", t + 800);
      flash.style.opacity = "0";
      run(c, flash, [{ opacity: 0, transform: "scale(0.4)" }, { opacity: 1, transform: "scale(1)", offset: 0.35 }, { opacity: 0, transform: "scale(1.5)" }], t + 120, 520, "ease-out");
      word(c, "死角", r, "fx-gold", t + 200, 800);
      beat = Math.max(beat, t + 600);
    }
  }
  const counters = e.counterUids ?? [];
  if (e.counterTotal > 0) {
    const ct = beat;
    for (const uid of counters) {
      const r = pieceRect(c, uid);
      const el = pieceEl(c, uid);
      if (r === null) continue;
      const cc = centerOf(r);
      run(c, el, [{ transform: "none" }, { transform: `translate(${(a.x - cc.x) * 0.22}px, ${(a.y - cc.y) * 0.22}px) scale(1.05)`, offset: 0.4 }, { transform: "none" }], ct, 300);
    }
    run(c, e.attackerDestroyed ? null : pieceEl(c, e.uid), [{ transform: "none" }, { transform: "translateX(6px)", offset: 0.3 }, { transform: "translateX(-5px)", offset: 0.6 }, { transform: "none" }], ct + 110, 240);
    word(c, `反撃 −${e.counterTotal}`, aRect, "fx-counter", ct + 90, 900);
    beat = ct + 300;
  }
  // several pieces may fall to one attack: each burns (a little apart), each flame flies to its owner
  let n = 0;
  for (const uid of destroyed) {
    const late = uid === e.uid;
    const at = (late ? beat : t + 380) + (late ? 0 : n++ * 110);
    beat = Math.max(beat, destroyBeat(c, uid, at));
  }
  return beat;
};

const rotations = (c: Ctx, t: number): number => {
  let end = t;
  for (const el of c.host.board.querySelectorAll<HTMLElement>(".pc[data-uid]")) {
    const old = c.snap.pieces.get(Number(el.dataset.uid));
    const dir = el.querySelector<HTMLElement>(".pc-dir");
    if (old === undefined || dir === null) continue;
    const now = Number((dir.className.match(/f(\d)/) ?? ["", "0"])[1]);
    if (now === old.facing) continue;
    let delta = (now - old.facing) * 90;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    const from = old.facing * 90;
    run(c, dir, [{ transform: `rotate(${from}deg)` }, { transform: `rotate(${from + delta}deg)` }], t, 220);
    run(c, el.querySelector(".pc-body"), [{ rotate: `${from}deg` }, { rotate: `${from + delta}deg` }], t, 220);
    // the numbers and the cube stay upright all the way round
    for (const up of el.querySelectorAll(".pc-body .num, .pc-cube")) {
      run(c, up, [{ rotate: `${-from}deg` }, { rotate: `${-(from + delta)}deg` }], t, 220);
    }
    end = t + 220;
  }
  return end;
};

const moves = (c: Ctx, e: Extract<GameEvent, { t: "move" }>, t: number): number => {
  const el = pieceEl(c, e.uid);
  const old = c.snap.pieces.get(e.uid);
  if (el === null || old === undefined) return t;
  const a = centerOf(old.rect);
  const b = centerOf(el.getBoundingClientRect());
  run(c, el, [{ transform: `translate(${a.x - b.x}px, ${a.y - b.y}px)` }, { transform: "none" }], t, 320);
  return t + 320;
};

/** Mulligan: the hand is dealt again, card by card. */
const redeal = (c: Ctx, t: number): number => {
  const cards = [...c.host.root.querySelectorAll(".yy-hand .hand-card")];
  cards.forEach((el, i) => {
    run(c, el.querySelector(".fu"), [{ opacity: 0, transform: "translateY(90px) rotate(-6deg)" }, { opacity: 1, transform: "none" }], t + i * 90, 360);
  });
  return t + cards.length * 90 + 200;
};

const band = (c: Ctx, text: string, seat: number | null, cls: string, t: number, duration: number): void => {
  const center = c.host.board.getBoundingClientRect();
  const rect = new DOMRect(0, center.top + center.height / 2 - 34, window.innerWidth, 68);
  const seal = seat === null ? "" : `<b class="fx-band-seal o${seat}">${seat === 0 ? "先" : "後"}</b>`;
  const el = temp(c, `fx-band ${cls}`, rect, `<div class="fx-band-in">${seal}<span>${esc(text)}</span></div>`, t + duration);
  el.style.opacity = "0";
  run(c, el, [
    { opacity: 0, transform: "translateX(-60%)" },
    { opacity: 1, transform: "translateX(-4%)", offset: 0.28 },
    { opacity: 1, transform: "translateX(4%)", offset: 0.72 },
    { opacity: 0, transform: "translateX(60%)" },
  ], t, duration, "cubic-bezier(0.4, 0, 0.2, 1)");
};

const nameOf = (c: Ctx, seat: number): string =>
  c.host.root.querySelector(`.np[data-seat="${seat}"] .np-name`)?.textContent ?? (seat === 0 ? "先手" : "後手");

const chips = (c: Ctx, e: Extract<GameEvent, { t: "turnEnd" }>, t: number): number => {
  if (e.chipGained <= 0) return t;
  let at = t;
  for (let i = e.chips - e.chipGained + 1; i <= e.chips; i++) {
    const el = c.host.root.querySelector(`.np[data-seat="${e.player}"] .chip[data-chip="${i}"]`);
    run(c, el, [{ opacity: 0.2, transform: "scale(1.9)" }, { opacity: 1, transform: "scale(1)" }], at, 300);
    at += 300;
  }
  return at;
};

/** 制圧 gained: the rim lights gold, the seal stamps onto the holder's edge, the lanterns light one by one. */
const control = (c: Ctx, seat: number, t: number): number => {
  const rim = temp(c, "fx-rim", c.host.board.getBoundingClientRect(), "<i></i>", t + 900);
  run(c, rim.firstElementChild, [{ transform: "rotate(0deg)", opacity: 1 }, { transform: "rotate(360deg)", opacity: 0.2 }], t, 820, "linear");
  const box = c.host.board.querySelector(`.bd-ctl[data-seat="${seat}"]`);
  const seal = box?.querySelector(".bd-seal") ?? null;
  run(c, seal, [
    { opacity: 0, transform: "scale(2.6) rotate(-14deg)", easing: "cubic-bezier(0.5, 0, 0.75, 0)" },
    { opacity: 1, transform: "scale(0.9) rotate(2deg)", offset: 0.6, easing: "ease-out" },
    { opacity: 1, transform: "scale(1.05)", offset: 0.8, easing: "ease-in-out" },
    { opacity: 1, transform: "none" },
  ], t + 260, 440, "linear");
  box?.querySelectorAll(".bd-lamp.on").forEach((lamp, i) => {
    run(c, lamp, [{ opacity: 0.15, transform: "scale(1.9)" }, { opacity: 1, transform: "scale(1)" }], t + 120 + i * 80, 260, "ease-out");
  });
  return t + 700;
};

/**
 * Name plate numbers after the step. A life number a flame is flying to
 * keeps its old value until the flame lands, then takes each loss in turn.
 */
const statChanges = (c: Ctx): void => {
  for (const [key, before] of c.snap.stats) {
    const [stat, seat] = key.split("-");
    const el = c.host.root.querySelector<HTMLElement>(`.np[data-seat="${seat}"] [data-stat="${stat}"] b`);
    if (el === null) continue;
    const now = Number(el.textContent);
    if (now === before) continue;
    if (stat === "mana") pulse(c, Number(seat), "mana", now > before ? "fx-up" : "fx-down", 0);
    if (stat !== "life" || now > before) continue;
    const flights = c.flights.filter((f) => String(f.seat) === seat).sort((a, b) => a.at - b.at);
    if (flights.length === 0) {
      pulse(c, Number(seat), "life", "fx-hurt", 300);
      continue;
    }
    const final = el.textContent ?? "";
    el.textContent = String(before);
    // each landing writes only over what the previous one left: a newer step that redrew or held
    // this number (or replaced the plate) wins, and the rest of this chain stops
    let expect = String(before);
    let shown = before;
    flights.forEach((f, i) => {
      shown -= f.loss;
      const value = i === flights.length - 1 ? final : String(Math.max(Number(final), shown));
      const prev = expect;
      expect = value;
      setTimeout(() => {
        if (el.isConnected && el.textContent === prev) el.textContent = value;
      }, f.at);
      pulse(c, Number(seat), "life", "fx-hurt", f.at);
    });
  }
};

/** Plays a step's events. Returns the time (ms) the step needs. */
export const playStep = (host: Host, snap: Snapshot, fresh: LogItem[], viewer: 0 | 1 | null): number => {
  const events = fresh.map((l) => l.event);
  const destroys = new Map<number, DestroyEvent>();
  for (const e of events) if (e.t === "destroy") destroys.set(e.uid, e);
  const c: Ctx = { host, snap, viewer, end: 0, destroys, flights: [] };
  const attackKills = new Map<number, number[]>();
  events.forEach((e, i) => {
    if (e.t !== "attack") return;
    const uids = new Set([e.uid, ...e.hits.map((h) => h.uid)]);
    const kills: number[] = [];
    for (let j = 0; j < i; j++) {
      const d = events[j];
      if (d.t === "destroy" && uids.has(d.uid)) kills.push(d.uid);
    }
    attackKills.set(i, kills);
  });
  const claimed = new Set([...attackKills.values()].flat());
  let t = 0;
  let rotated = false;
  events.forEach((e: GameEvent | FlowEvent, i) => {
    switch (e.t) {
      case "summon":
        t = summon(c, e, t);
        break;
      case "attack":
        t = attack(c, e, attackKills.get(i) ?? [], t);
        break;
      case "destroy":
        if (!claimed.has(e.uid)) t = destroyBeat(c, e.uid, t);
        break;
      case "rotate":
      case "reigu":
        if (!rotated) {
          rotated = true;
          t = Math.max(t, rotations(c, t));
        }
        break;
      case "move":
        t = moves(c, e, t);
        break;
      case "mulligan":
        if (e.returned > 0 && isOwn(c, e.player) && c.viewer !== null) t = redeal(c, t);
        break;
      case "turnEnd":
        t = chips(c, e, t);
        break;
      case "turnStart":
        band(c, `${nameOf(c, e.player)}の番`, e.player, `o${e.player}`, t, 760);
        t += 260;
        break;
      case "control":
        if (e.change === "gain") t = control(c, e.player, t);
        break;
      case "gameEnd":
      case "resign": {
        const result = host.root.querySelector(".yy-result-mark");
        run(c, result, [{ opacity: 0, transform: "scale(1.6)", filter: "blur(6px)" }, { opacity: 1, transform: "scale(0.96)", filter: "blur(0)", offset: 0.7 }, { opacity: 1, transform: "scale(1)", filter: "blur(0)" }], t + 150, 620);
        break;
      }
      default:
    }
  });
  statChanges(c);
  return Math.max(c.end, t);
};
