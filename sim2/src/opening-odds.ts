// How often a player can put shikigami on the board on their first turn, for
// the deck as it is set up (card numbers and 枚数 edits included): the chance
// of at least one, and of two (one may go on the 太極 for its discount), with
// the one mulligan the rules allow and without it. Counted by dealing many
// shuffled hands with a fixed seed, so the same settings always show the same
// numbers. Pure: no node builtins, importable from the browser.
import type { CardPack } from "./cards.ts";
import type { CardDef, Config, PlayerId } from "./types.ts";

export type OpeningOdds = {
  seat: PlayerId;
  /** 霊力 on that first turn. */
  mana: number;
  /** Chances (0..1) after the mulligan (the plain deal when the rules have none). */
  one: number;
  two: number;
  /** Two on the first turn with the hand as dealt (no mulligan). */
  twoAsDealt: number;
};

export const OPENING_TRIALS = 20000;

const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffled = <T>(xs: readonly T[], rnd: () => number): T[] => {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** 霊力 for the first turn: the starting 霊力, plus the income when it comes at the turn start. */
export const firstTurnMana = (cfg: Config, seat: PlayerId): number =>
  cfg.startMana[seat] + (cfg.incomeTiming === "turn_start" ? cfg.baseIncome : 0);

type Costs = { plain: (c: number) => number; taiji: (c: number) => number };

const costsOf = (cfg: Config): Costs => {
  const plain = (c: number): number => (cfg.summonCostScale === "half" ? Math.max(1, Math.ceil(c / 2)) : c);
  return { plain, taiji: (c) => Math.max(cfg.taijiFloor, plain(c) - cfg.taijiDiscount) };
};

/** The cheapest way to summon two of these printed costs: the dearer one on the 太極. */
const pairCost = (k: Costs, a: number, b: number): number => Math.min(k.plain(a) + k.taiji(b), k.taiji(a) + k.plain(b));

/** How many shikigami (0, 1 or 2) this hand can summon with `mana`. */
const summonable = (k: Costs, costs: readonly number[], mana: number, two: boolean): 0 | 1 | 2 => {
  if (costs.length === 0) return 0;
  if (two) {
    for (let i = 0; i < costs.length; i++) for (let j = i + 1; j < costs.length; j++) if (pairCost(k, costs[i], costs[j]) <= mana) return 2;
  }
  return costs.some((c) => k.taiji(c) <= mana) ? 1 : 0;
};

export const openingOdds = (cfg: Config, pack: CardPack, trials = OPENING_TRIALS): [OpeningOdds, OpeningOdds] => {
  const k = costsOf(cfg);
  const cardOf = (id: string): CardDef | undefined => pack.byId.get(id);
  const costOf = (id: string): number | null => {
    const c = cardOf(id);
    return c === undefined || c.kind !== "shikigami" ? null : c.summonCost;
  };
  const shikiCosts = (ids: readonly string[]): number[] => ids.flatMap((id) => {
    const c = costOf(id);
    return c === null ? [] : [c];
  });
  const twoAllowed = cfg.summonLimit === null || cfg.summonLimit >= 2;
  const deck = pack.deckList;
  const handSize = Math.min(cfg.handRefill, deck.length);
  const run = (seat: PlayerId): OpeningOdds => {
    const mana = firstTurnMana(cfg, seat);
    const rnd = mulberry32(20261004 + seat);
    let one = 0;
    let two = 0;
    let twoAsDealt = 0;
    for (let t = 0; t < trials; t++) {
      const order = shuffled(deck, rnd);
      let hand = order.slice(0, handSize);
      let got = summonable(k, shikiCosts(hand), mana, twoAllowed);
      if (got === 2) twoAsDealt += 1;
      if (got < 2 && cfg.mulligan) {
        // keep the cheapest shikigami when some card in the deck could join it on this turn; return the rest
        const costs = shikiCosts(hand).sort((a, b) => a - b);
        const cheapestInDeck = Math.min(...shikiCosts(order.slice(handSize)), Infinity);
        const keepOne = costs.length > 0 && (twoAllowed ? pairCost(k, costs[0], cheapestInDeck) <= mana : k.taiji(costs[0]) <= mana);
        const keepId = keepOne ? hand.find((id) => costOf(id) === costs[0]) : undefined;
        const kept = keepId === undefined ? [] : [keepId];
        const back = hand.filter((id, i) => !(id === keepId && i === hand.indexOf(keepId)));
        const rest = shuffled([...order.slice(handSize), ...back], rnd);
        hand = [...kept, ...rest.slice(0, handSize - kept.length)];
        got = summonable(k, shikiCosts(hand), mana, twoAllowed);
      }
      if (got >= 1) one += 1;
      if (got === 2) two += 1;
    }
    return { seat, mana, one: one / trials, two: two / trials, twoAsDealt: twoAsDealt / trials };
  };
  return [run(0), run(1)];
};

/** The deck at a glance: its size, the shikigami in it, and how many cost `cheap` or less. */
export const deckShape = (pack: CardPack, cheap = 4): { size: number; shikigami: number; cheap: number } => {
  let shikigami = 0;
  let low = 0;
  for (const id of pack.deckList) {
    const c = pack.byId.get(id);
    if (c === undefined || c.kind !== "shikigami") continue;
    shikigami += 1;
    if (c.summonCost <= cheap) low += 1;
  }
  return { size: pack.deckList.length, shikigami, cheap: low };
};
