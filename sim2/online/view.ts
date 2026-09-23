// Per-viewer views. The ONLY place server state is turned into what a
// browser receives, so it builds everything by explicit whitelist:
//   - own hand: cardIds; opponent / spectator: hand size only
//   - decks: size only, for everyone (the order is never sent)
//   - rngState and the match seed: never sent (seed + inputs = every deck)
//   - log: engine events copied field by field; private flow events only to
//     their owner
import { overridesBetween } from "../src/card-overrides.ts";
import type { CardPack } from "../src/cards.ts";
import { commandsFor } from "../src/commands.ts";
import { counterOrderCandidates, counterOrderOutcomes } from "../src/counter-order.ts";
import type { Flow, FlowEvent, LogEntry } from "../src/flow.ts";
import { legalEntries } from "../src/preview.ts";
import type { RulePresetId } from "../src/presets.ts";
import type { GameEvent, GameState, PlayerId, PlayerState, Unit } from "../src/types.ts";
import type { BoardView, GameView, LogItem, PhaseView, PublicPlayer } from "./protocol.ts";

const publicUnit = (u: Unit): Unit => ({
  uid: u.uid,
  cardId: u.cardId,
  owner: u.owner,
  pos: { x: u.pos.x, y: u.pos.y },
  facing: u.facing,
  damage: u.damage,
  attackedThisTurn: u.attackedThisTurn,
  rotatedThisTurn: u.rotatedThisTurn,
  summonedThisTurn: u.summonedThisTurn,
  hiddenBy: u.hiddenBy,
  atkBuff: u.atkBuff,
});

const publicPlayer = (p: PlayerState): PublicPlayer => ({
  life: p.life,
  mana: p.mana,
  chips: p.chips,
  reach: p.reach,
  handCount: p.hand.length,
  deckCount: p.deck.length,
  grave: p.grave.slice(),
  reshuffleCount: p.reshuffleCount,
  controlPoints: p.controlPoints,
});

export const boardView = (s: GameState): BoardView => ({
  units: s.units.map(publicUnit),
  players: [publicPlayer(s.players[0]), publicPlayer(s.players[1])],
  turnPlayer: s.turnPlayer,
  round: s.round,
  ended: s.ended,
  winner: s.winner,
  winType: s.winType,
  summonsThisTurn: s.summonsThisTurn,
});

export const phaseView = (f: Flow): PhaseView => {
  const ph = f.phase;
  switch (ph.kind) {
    case "mulligan":
      return { kind: "mulligan", submitted: [ph.submitted[0], ph.submitted[1]] };
    case "tansu":
      return { kind: "tansu", player: ph.player, uids: ph.uids.slice() };
    case "main":
      return { kind: "main", player: ph.player };
    case "counterOrder":
      return {
        kind: "counterOrder",
        player: ph.player,
        attacker: ph.attacker,
        action: { ...ph.action },
        uids: ph.uids.slice(),
        outcomes: counterOrderOutcomes(f.ctx, f.state, ph.action, counterOrderCandidates(ph.uids)),
      };
    case "discard":
      return { kind: "discard", player: ph.player };
    default:
      return {
        kind: "over",
        winner: f.state.winner,
        winType: f.state.winType,
        resignedBy: f.resignedBy,
      };
  }
};

/** `printed` is the pack as loaded: `cards` in the view is what differs from it right now. */
export type ViewSource = { flow: Flow; matchNo: number; rule: RulePresetId; pack: string; printed?: CardPack };

export const gameView = (m: ViewSource, viewer: PlayerId | null): GameView => {
  const f = m.flow;
  const ph = f.phase;
  const toAct = ph.kind === "main" && viewer !== null && ph.player === viewer;
  const legal = toAct ? legalEntries(f.ctx, f.state) : null;
  return {
    matchNo: m.matchNo,
    viewer,
    rule: m.rule,
    pack: m.pack,
    config: { ...f.ctx.cfg, startMana: [f.ctx.cfg.startMana[0], f.ctx.cfg.startMana[1]], chipIncomeSteps: f.ctx.cfg.chipIncomeSteps.slice() },
    cards: m.printed === undefined ? {} : overridesBetween(m.printed, f.ctx.pack),
    board: boardView(f.state),
    hand: viewer === null ? null : f.state.players[viewer].hand.slice(),
    phase: phaseView(f),
    legal,
    commands: legal === null ? null : commandsFor(f.ctx, f.state, legal.map((e) => e.action)),
  };
};

// -------------------------------------------------------------------- log

/** Public fields of each event type. Unknown types are dropped. */
const EVENT_FIELDS: Record<string, readonly string[]> = {
  turnStart: ["player", "round", "income", "underdog"],
  summon: ["player", "uid", "cardId", "pos", "facing", "cost", "taiji", "baseCost", "inheritedFrom", "underdogDiscount"],
  attack: [
    "player", "uid", "cardId", "aoe", "cost", "hits", "counterTotal", "counterCount", "counterUids",
    "attackerDestroyed", "variant",
  ],
  reigu: ["player", "cardId", "targetUid", "cost"],
  effect: ["player", "source", "uid", "text", "from", "to"],
  rotate: ["player", "uid", "cost", "cardId", "from", "to"],
  move: ["player", "uid", "from", "to", "source"],
  mulligan: ["player", "returned"],
  control: ["player", "change", "need", "hold"],
  reshuffle: ["player", "count"],
  pass: ["player"],
  destroy: ["owner", "uid", "cardId", "lifeLoss", "manaGain", "killer", "manaTo", "killerRefund", "rewardDenied", "upsetBonus"],
  turnEnd: [
    "player", "round", "occupied", "chips", "chipGained", "reach", "discarded", "drawn",
    "boardHp", "manaLeft", "occBoth", "handBoth", "points",
  ],
  gameEnd: ["winner", "winType", "round"],
  resign: ["player", "round"],
  counterOrder: ["player", "round", "order", "cards"],
  config: ["player", "round", "changes"],
  cards: ["player", "round", "changes"],
  mulliganCards: ["player", "cards"],
};

const sanitize = (e: GameEvent | FlowEvent): GameEvent | FlowEvent | null => {
  const fields = EVENT_FIELDS[e.t];
  if (fields === undefined) return null;
  const src = e as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { t: e.t };
  for (const k of fields) {
    if (src[k] !== undefined) out[k] = JSON.parse(JSON.stringify(src[k])) as unknown;
  }
  return out as unknown as GameEvent | FlowEvent;
};

const canSee = (entry: LogEntry, viewer: PlayerId | null): boolean =>
  entry.audience === "all" || (viewer !== null && entry.audience === viewer);

/** Log entries with seq >= fromSeq that `viewer` may see. */
export const logView = (log: LogEntry[], viewer: PlayerId | null, fromSeq = 0): LogItem[] => {
  const out: LogItem[] = [];
  for (let i = Math.max(0, fromSeq); i < log.length; i++) {
    const entry = log[i];
    if (!canSee(entry, viewer)) continue;
    const event = sanitize(entry.event);
    if (event !== null) out.push({ seq: entry.seq, event });
  }
  return out;
};
