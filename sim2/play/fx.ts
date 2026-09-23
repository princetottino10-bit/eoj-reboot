// Animation queue. Each model update is a step: its new log events are played
// as animations right after the step is drawn. Steps caused by the viewer's
// own input are drawn at once (animations never block input); the other
// seat's steps (AI or online opponent) wait for the previous step's
// animations, so their moves are seen one at a time.
// Only transform and opacity are animated; prefers-reduced-motion skips all.
import type { LogItem } from "../online/protocol.ts";
import { playStep } from "./fx-play.ts";
import type { Snapshot } from "./fx-play.ts";

export type FxStep = {
  fresh: LogItem[];
  /** true = caused by this screen's own input: draw immediately. */
  immediate: boolean;
  /** The seat whose screen this is (null = spectator). */
  viewer: 0 | 1 | null;
  /** Draws the step. */
  show: () => void;
};

export type FxHost = { root: HTMLElement; layer: HTMLElement; board: HTMLElement };

export type Fx = { push: (step: FxStep) => void };

export const reducedMotion = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const rectOf = (el: Element): DOMRect => el.getBoundingClientRect();

/** Where things were before a step is drawn: pieces, hand, name plate numbers. */
const capture = (host: FxHost): Snapshot => {
  const pieces = new Map<number, { rect: DOMRect; html: string; facing: number }>();
  for (const el of host.board.querySelectorAll<HTMLElement>(".pc[data-uid]")) {
    const dir = el.querySelector(".pc-dir");
    const facing = dir === null ? 0 : Number((dir.className.match(/f(\d)/) ?? ["", "0"])[1]);
    pieces.set(Number(el.dataset.uid), { rect: rectOf(el), html: el.outerHTML, facing });
  }
  const stats = new Map<string, number>();
  for (const el of host.root.querySelectorAll<HTMLElement>(".np[data-seat] [data-stat] b")) {
    const plate = el.closest<HTMLElement>(".np");
    const stat = el.closest<HTMLElement>("[data-stat]");
    if (plate !== null && stat !== null) stats.set(`${stat.dataset.stat}-${plate.dataset.seat}`, Number(el.textContent));
  }
  const selected = host.root.querySelector(".hand-card.is-selected");
  const oppHand = host.root.querySelector(".yy-opp-hand .ohand");
  return {
    pieces,
    stats,
    selectedHand: selected === null ? null : rectOf(selected),
    oppHand: oppHand === null ? null : rectOf(oppHand),
    selfHand: host.root.querySelector(".yy-hand") === null ? null : rectOf(host.root.querySelector(".yy-hand") as Element),
  };
};

export const createFx = (host: FxHost): Fx => {
  const queue: FxStep[] = [];
  let busyUntil = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const pump = (): void => {
    timer = null;
    while (queue.length > 0) {
      const now = performance.now();
      const next = queue[0];
      if (!next.immediate && now < busyUntil) {
        timer = setTimeout(pump, busyUntil - now);
        return;
      }
      queue.shift();
      const motion = !reducedMotion() && next.fresh.length > 0;
      const snap = motion ? capture(host) : null;
      next.show();
      const ms = snap === null ? 0 : playStep(host, snap, next.fresh, next.viewer);
      busyUntil = Math.max(next.immediate ? busyUntil : 0, performance.now() + (next.immediate ? 0 : ms));
    }
  };

  return {
    push: (step) => {
      if (step.immediate && queue.length > 0) {
        // own input: queued opponent steps are already superseded by this state
        queue.splice(0, queue.length);
      }
      if (step.immediate) {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        busyUntil = 0;
      }
      queue.push(step);
      if (timer === null) pump();
    },
  };
};
