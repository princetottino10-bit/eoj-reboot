// Log lines in cause -> effect order, for display only (the engine order is
// untouched). The engine records some consequences before the event that
// names their cause: an attack's damage bonuses, destructions and move come
// before the attack event; start-of-turn effects (古箪笥, マヨヒガ expiry)
// before turnStart; the control gain before turnEnd. Each such cause is moved
// up to the start of the run of events it caused.
import type { FlowEvent } from "../src/flow.ts";
import type { GameEvent } from "../src/types.ts";

type Ev = GameEvent | FlowEvent;
type Attack = Extract<GameEvent, { t: "attack" }>;

/** Events that start (or are) an action; nothing before them belongs to a later cause. */
const CAUSES = new Set<string>(["attack", "turnStart", "turnEnd", "summon", "reigu", "rotate", "pass", "mulligan", "mulliganCards", "config", "cards", "resign", "gameEnd"]);

/** Effect texts an attack writes AFTER its own event (or a summon writes), never before it. */
const NOT_BEFORE_ATTACK = /^(渾身|再生|雲外鏡):/;

/** Can the event at k be part of the lead-up to this attack? Returns how many events (1 or 2) it claims, 0 = stop. */
const attackClaim = (a: Attack, list: readonly { event: Ev }[], k: number, floor: number): number => {
  const e = list[k].event;
  const hitUids = new Set(a.hits.map((h) => h.uid));
  const destroyOfThis = (x: Ev): boolean => x.t === "destroy" && (x.uid === a.uid || hitUids.has(x.uid));
  if (destroyOfThis(e)) return 1;
  if (e.t === "move") return e.uid === a.uid ? 1 : 0;
  if (e.t !== "effect") return 0;
  if (e.source === a.cardId && e.uid !== null && hitUids.has(e.uid)) return 1;
  if (e.source === a.cardId && e.uid === a.uid && !NOT_BEFORE_ATTACK.test(e.text)) return 1;
  // an on-destroy effect (灯籠の精) right after a destruction this attack caused
  const prev = k - 1 >= floor ? list[k - 1].event : null;
  if (prev !== null && destroyOfThis(prev) && prev.t === "destroy" && prev.cardId === e.source) return 2;
  return 0;
};

const turnStartClaim = (p: number, e: Ev): number =>
  (e.t === "effect" && e.player === p) || (e.t === "control" && e.player === p && e.change === "lost") || (e.t === "reshuffle" && e.player === p) ? 1 : 0;

const turnEndClaim = (p: number, e: Ev): number =>
  (e.t === "control" && e.player === p && e.change === "gain") || (e.t === "reshuffle" && e.player === p) ? 1 : 0;

/** Index where the trailing cause at i should go (i itself when it claims nothing). */
const leadStart = (list: readonly { event: Ev }[], i: number, floor: number): number => {
  const cause = list[i].event;
  let k = i - 1;
  while (k >= floor) {
    const e = list[k].event;
    const n =
      cause.t === "attack"
        ? attackClaim(cause, list, k, floor)
        : cause.t === "turnStart"
          ? turnStartClaim(cause.player, e)
          : cause.t === "turnEnd"
            ? turnEndClaim(cause.player, e)
            : 0;
    if (n === 0) break;
    k -= n;
  }
  return k + 1;
};

export const orderLog = <T extends { event: Ev }>(items: readonly T[]): T[] => {
  const list = [...items];
  let floor = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i].event;
    if (!CAUSES.has(e.t)) continue;
    if (e.t === "attack" || e.t === "turnStart" || e.t === "turnEnd") {
      const start = leadStart(list, i, floor);
      if (start < i) {
        const [cause] = list.splice(i, 1);
        list.splice(start, 0, cause);
      }
    }
    floor = i + 1;
  }
  return list;
};
