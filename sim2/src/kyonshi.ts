// 僵尸公主 of the 10/3 sheet (effect key ac13): 「攻撃・反撃によって対象のHPを0に
// した場合、その位置に移動する。この時、向きを90度変えられる。」 After the move
// its OWNER chooses: keep the facing, turn left 90°, or turn right 90°. A 180°
// turn is not allowed (the card says 90度; 家鳴り tm18 reads it the same way).
// Spec: EFFECTS-SPEC.md §6.3 裁定3. The 9/22 僵尸公主 (ad13) and sk13 keep their
// facing: their cards say 同じ向きのまま.
//
// The move can come from its own attack (the owner's turn) or from its counter
// (the other seat's turn); the owner answers either way. No move, no choice.
//
// As with 灯籠の精 (src/lantern.ts), the engine resolves synchronously, so the
// answers are collected beforehand: a resolution runs inside
// withKyonshiTurns(turns), and each move of a turning 僵尸公主 (an "ask", in
// resolution order) takes the next answer. Asks beyond the answers given keep
// the facing (the headless default, which is what the engine did before).
// Pure: no node builtins.
import { toBoardCells, turnFacing } from "./board.ts";
import { effectKeyOf } from "./cards.ts";
import { cardOfUnit, isHidden } from "./state.ts";
import type { Ctx } from "./state.ts";
import type { Facing, GameEvent, GameState, PlayerId, Pos, Unit } from "./types.ts";

/** Keep the facing (0), turn left 90° (-1), turn right 90° (1). */
export type KyonshiTurn = -1 | 0 | 1;

/** The answers in the order a prompt shows them: keep, left, right. */
export const KYONSHI_TURNS: readonly KyonshiTurn[] = [0, -1, 1];

/** Effect keys whose move may turn 90°. */
const TURNING_KEYS: ReadonlySet<string> = new Set(["ac13"]);

/** Does this card's on-kill move come with the 90° choice (effects on)? */
export const turnsOnMove = (ctx: Ctx, cardId: string): boolean =>
  ctx.cfg.effects && ctx.pack.byId.has(cardId) && TURNING_KEYS.has(effectKeyOf(ctx.pack, cardId));

export const isKyonshiTurn = (v: unknown): v is KyonshiTurn => v === 0 || v === 1 || v === -1;

/** One facing the owner may choose, with the enemies its attack would cover from the new cell. */
export type KyonshiOption = { turn: KyonshiTurn; facing: Facing; targets: number[] };

/** One choice owed: which way the 僵尸公主 that just moved faces. */
export type KyonshiAsk = {
  uid: number;
  cardId: string;
  owner: PlayerId;
  from: Pos;
  to: Pos;
  /** Its facing now (kept by the move). */
  facing: Facing;
  /** attack: its own attack destroyed the target; counter: its counter destroyed the attacker. */
  cause: "attack" | "counter";
  /** keep, left, right (KYONSHI_TURNS order). */
  options: KyonshiOption[];
};

const FACING_WORD = ["上", "右", "下", "左"];

/** 「右へ90度」 / 「左へ90度」 / 「向きはそのまま」 */
export const kyonshiTurnWord = (turn: KyonshiTurn): string =>
  turn === 1 ? "右へ90度" : turn === -1 ? "左へ90度" : "向きはそのまま";

/** The options as the board stands right after the move. */
export const kyonshiOptions = (ctx: Ctx, s: GameState, u: Unit): KyonshiOption[] => {
  const range = cardOfUnit(ctx, u).attackRange;
  return KYONSHI_TURNS.map((turn) => {
    const facing = turn === 0 ? u.facing : turnFacing(u.facing, turn);
    const cells = toBoardCells(range, u.pos, facing);
    const targets = s.units
      .filter((x) => x.owner !== u.owner && !isHidden(x) && cells.some((c) => c.x === x.pos.x && c.y === x.pos.y))
      .map((x) => x.uid);
    return { turn, facing, targets };
  });
};

// ---------------------------------------------------------------- session

type Session = { turns: readonly KyonshiTurn[]; asks: KyonshiAsk[] };

let session: Session | null = null;

/**
 * Runs `run` (one resolution) with the owners' answers. Returns what it
 * returned and every ask met on the way, in resolution order. Nests: the
 * outer session is restored afterwards.
 */
export const withKyonshiTurns = <T>(turns: readonly KyonshiTurn[], run: () => T): { result: T; asks: KyonshiAsk[] } => {
  const outer = session;
  const mine: Session = { turns, asks: [] };
  session = mine;
  try {
    return { result: run(), asks: mine.asks };
  } finally {
    session = outer;
  }
};

/**
 * Called by the engine right after a turning 僵尸公主 moved (u.pos is the new
 * cell): records the ask, applies the answer (or keeps the facing) and logs
 * the choice as an effect line 「僵尸公主が移動 → 右へ90度(下向き)」.
 */
export const applyKyonshiTurn = (
  ctx: Ctx,
  s: GameState,
  u: Unit,
  from: Pos,
  cause: "attack" | "counter",
  events: GameEvent[],
): void => {
  const ask: KyonshiAsk = {
    uid: u.uid,
    cardId: u.cardId,
    owner: u.owner,
    from: { x: from.x, y: from.y },
    to: { x: u.pos.x, y: u.pos.y },
    facing: u.facing,
    cause,
    options: kyonshiOptions(ctx, s, u),
  };
  const i = session === null ? -1 : session.asks.length;
  session?.asks.push(ask);
  const given = i >= 0 ? session?.turns[i] : undefined;
  const turn: KyonshiTurn = given !== undefined && isKyonshiTurn(given) ? given : 0;
  const before = u.facing;
  if (turn !== 0) u.facing = turnFacing(u.facing, turn);
  const name = cardOfUnit(ctx, u).nameJa;
  const how = turn === 0 ? kyonshiTurnWord(0) : `${kyonshiTurnWord(turn)}(${FACING_WORD[u.facing]}向き)`;
  events.push({ t: "effect", player: u.owner, source: u.cardId, uid: u.uid, text: `${name}が移動 → ${how}`, from: before, to: u.facing });
};
