// Text and small helpers shared by the local play UI and the online client:
// log lines, banners, and the wording of previews. Pure: no DOM access, no
// rules maths (numbers come from engine helpers or from server-side previews).
import { cardOf } from "../src/cards.ts";
import type { Ctx } from "../src/state.ts";
import { cardOfUnit, controlCount, unitHp } from "../src/state.ts";
import { cellAttr, toBoardCells } from "../src/board.ts";
import { isAoeAttack } from "../src/combat.ts";
import { describeChange } from "../src/config-schema.ts";
import type { AttackPreview, InheritPreview } from "../src/preview.ts";
import type { FlowEvent } from "../src/flow.ts";
import type { ControlHold, Facing, GameEvent, PlayerId, Pos, Unit } from "../src/types.ts";
import type { BoardView } from "../online/protocol.ts";
import { esc } from "./cards-view.ts";
import { mark } from "./marks.ts";

export { esc };

export type Names = [string, string];

/** "(霊力価)" after a predicted 霊力 gain, with the print kit's flame (HTML; the log keeps plain text). */
export const MANA_VALUE_TAG = `(${mark("flame", "mk-inline")}霊力価)`;

export const FACING_ARROW = ["↑", "→", "↓", "←"];
export const FACING_LABEL = ["上", "右", "下", "左"];
export const ATTR_LABEL: Record<string, string> = {
  yin: "陰",
  yang: "陽",
  taiji: "太極",
  empty: "空",
  none: "空",
};

export const seatWord = (p: PlayerId): string => (p === 0 ? "先手" : "後手");

/**
 * A board cell in words, as it sits on screen (the top row is y 2 for every
 * viewer): "太極" for the centre, else side + row + attribute ("右上の空",
 * "上の陰", "左の陰").
 */
export const cellName = (p: Pos): string => {
  const attr = ATTR_LABEL[cellAttr(p)] ?? "";
  if (p.x === 1 && p.y === 1) return attr;
  const side = p.x === 0 ? "左" : p.x === 2 ? "右" : "";
  const row = p.y === 2 ? "上" : p.y === 0 ? "下" : "";
  return `${side}${row}の${attr}`;
};

export const cardName = (ctx: Ctx, id: string): string => cardOf(ctx.pack, id).nameJa;

/** 占拠 as the rules count it (controlCount: a heavy unit may count 2, hidden ones 0). */
export const occupiedOf = (ctx: Ctx, board: BoardView, p: PlayerId): number => controlCount(ctx, board, p);

export const unitAtPos = (board: BoardView, pos: Pos): Unit | undefined =>
  board.units.find((u) => u.pos.x === pos.x && u.pos.y === pos.y);

export const unitById = (board: BoardView, uid: number): Unit | undefined =>
  board.units.find((u) => u.uid === uid);

/** What the control flag means under a controlHold (default: the one in force). */
export const controlLabel = (ctx: Ctx, hold: ControlHold = ctx.cfg.controlHold): string =>
  hold === "next_turn_end" ? "制圧中" : "制圧リーチ";

/**
 * EXP-0913B counterMode "gap": the board cell of an AREA attacker's gap - the
 * only cell from which a defender can counter it. Empty when the card has no
 * gap, for jutsu (never countered), for single-target attacks (their whole
 * range is gap, see gapNote) and outside counterMode "gap".
 */
export const gapCells = (ctx: Ctx, u: Unit): Pos[] => {
  if (ctx.cfg.counterMode !== "gap") return [];
  const card = cardOfUnit(ctx, u);
  if (card.attackType !== "phys" || !isAoeAttack(ctx, card)) return [];
  const g = card.gapCell ?? null;
  return g === null ? [] : toBoardCells([g], u.pos, u.facing);
};

/** One-line explanation of where this unit can be countered from. */
export const gapNote = (ctx: Ctx, u: Unit): string => {
  if (ctx.cfg.counterMode !== "gap") return "";
  const card = cardOfUnit(ctx, u);
  if (card.atk <= 0 || card.attackRange.length === 0) return "";
  if (card.attackType !== "phys") return "術式: 反撃を受けない";
  if (!isAoeAttack(ctx, card)) return "単体攻撃: 範囲全体が隙(対象の反撃範囲に入っていれば反撃される)";
  return (card.gapCell ?? null) === null ? "範囲攻撃・隙なし: 反撃を受けない" : "範囲攻撃: 琥珀色の枠=隙位置(ここにいる敵だけが反撃できる)";
};

// ------------------------------------------------------------------- log

export type LogLine = { text: string; cls: string };

/**
 * What the screen saw around an event that the event itself does not carry:
 * the unit's card and its facing before / after (rotations). Filled by the
 * table from consecutive board views; absent for events seen only in replay.
 */
export type LogNote = { cardId?: string; from?: Facing; to?: Facing };

/** How the game was decided, from the winner's side. */
const winHow = (winType: string | null, loser: string): string =>
  winType === "control"
    ? "制圧"
    : winType === "life"
      ? `${loser}の生命が0`
      : winType === "deck_out"
        ? "山札切れの判定"
        : winType === "turn_limit"
          ? "ラウンド上限の判定"
          : "決着";

/** "右へ" / "左へ" / "反対へ" for a facing change, "" when unknown or unchanged. */
const turnWord = (from: Facing | undefined, to: Facing | undefined): string => {
  if (from === undefined || to === undefined) return "";
  const d = (to - from + 4) % 4;
  return d === 1 ? "右へ" : d === 3 ? "左へ" : d === 2 ? "反対へ" : "";
};

/** Fields a newer rotate event may carry (read defensively; older events lack them). */
type RotateExtra = { cardId?: string; from?: Facing; facing?: Facing; to?: Facing };

/** killRewardCondition notes on a destroy line: " (撃破報酬なし)" / " (格上撃破+N)". */
const killRewardNote = (e: { rewardDenied?: boolean; upsetBonus?: number }): string =>
  e.rewardDenied === true ? " (撃破報酬なし)" : (e.upsetBonus ?? 0) > 0 ? ` (格上撃破+${e.upsetBonus})` : "";

export const describeEvent = (ctx: Ctx, names: Names, e: GameEvent | FlowEvent, note?: LogNote): LogLine | null => {
  const name = (id: string): string => cardName(ctx, id);
  const seat = (p: PlayerId): string => names[p];
  switch (e.t) {
    case "turnStart":
      return {
        text: `── R${e.round} ${seat(e.player)}のターン開始${
          ctx.cfg.incomeTiming === "turn_start" ? ` (霊力+${e.income})` : ""
        }`,
        cls: "hl",
      };
    case "summon": {
      const where = e.taiji ? "【太極】" : cellName(e.pos);
      if (e.inheritedFrom !== undefined) {
        return {
          text: `${seat(e.player)}: 【継承召喚】${name(e.inheritedFrom.cardId)} → ${name(e.cardId)} ${where} ${
            FACING_ARROW[e.facing]
          } (霊力-${e.cost} / 回収+${e.inheritedFrom.refund})`,
          cls: "inh",
        };
      }
      return {
        text: `${seat(e.player)}: ${name(e.cardId)} を ${where} に召喚 ${FACING_ARROW[e.facing]} (霊力-${e.cost})`,
        cls: "",
      };
    }
    case "rotate": {
      const x = e as typeof e & RotateExtra;
      const cardId = x.cardId ?? note?.cardId;
      const from = x.from ?? note?.from;
      const to = x.to ?? x.facing ?? note?.to;
      const who = cardId === undefined ? "駒" : name(cardId);
      // a proxy rotate names its rotator here; the turned unit follows as an effect line
      if (from !== undefined && from === to) return { text: `${seat(e.player)}: ${who}の代理回転 (霊力-${e.cost})`, cls: "" };
      const dir = to === undefined ? "" : ` → ${FACING_LABEL[to]}向き`;
      return { text: `${seat(e.player)}: ${who}を${turnWord(from, to)}回転${dir} (霊力-${e.cost})`, cls: "" };
    }
    case "reigu":
      return { text: `◆ 霊具 — ${seat(e.player)}が ${name(e.cardId)} を使用 (霊力-${e.cost})`, cls: "reigu" };
    case "effect": {
      // rotations by effects (家鳴り, 玖龍街) say where the unit now faces: from the event, or what the
      // screen saw for events recorded before they carried it
      const x = e as typeof e & { from?: Facing; to?: Facing };
      const from = x.from ?? note?.from;
      const to = x.to ?? note?.to;
      const turned = to !== undefined && from !== to && e.text.includes("回転");
      return { text: `★ ${e.text}${turned ? ` → ${FACING_LABEL[to]}向き` : ""}`, cls: "fx" };
    }
    case "attack": {
      if (e.variant === "heal") {
        const h = e.hits[0];
        return {
          text: `${seat(e.player)}: ${name(e.cardId)}が味方 ${name(h.cardId)} を回復 +${-h.dmg} (霊力-${e.cost})`,
          cls: "",
        };
      }
      const hits = e.hits
        .map((h) => `${name(h.cardId)}に${h.dmg}${h.blind ? "【死角】" : ""}${h.ally ? "(味方)" : ""}${h.destroyed ? "→撃破" : ""}`)
        .join(" / ");
      const counter = e.counterTotal > 0 ? ` ⇔ 反撃${e.counterTotal}${e.counterCount > 1 ? `(${e.counterCount}体)` : ""}` : "";
      const dead = e.attackerDestroyed ? " → 攻撃側撃破" : "";
      const kind =
        e.variant === "konshin" ? "渾身" : e.variant === "regen" ? "【再生】" : e.variant === "drink" ? "【飲酒】" : e.aoe ? "範囲" : "";
      return { text: `${seat(e.player)}: ${name(e.cardId)}が${kind}攻撃 (霊力-${e.cost}) ${hits}${counter}${dead}`, cls: "" };
    }
    case "destroy": {
      // 採用 9/22: no life, the destroyer takes the card's 霊力価
      if (!ctx.cfg.lifeValueEnabled && e.lifeLoss === 0) {
        const to = e.manaTo ?? null;
        const pay = e.manaGain > 0 && to !== null ? ` → ${seat(to)}の霊力+${e.manaGain}${ctx.cfg.killRewardBase === "card" ? "(霊力価)" : ""}` : "";
        return { text: `　撃破: ${seat(e.owner)}の${name(e.cardId)}${pay}${killRewardNote(e)}`, cls: "wr" };
      }
      let mana = "";
      if (e.manaGain > 0 && e.manaTo !== undefined && e.manaTo !== null) {
        mana = e.killerRefund === true
          ? ` / 撃破により${seat(e.manaTo)}の霊力+${e.manaGain}`
          : ` / ${seat(e.manaTo)}に霊力+${e.manaGain}(還付)`;
      }
      return { text: `　撃破: ${seat(e.owner)}の${name(e.cardId)} → 生命-${e.lifeLoss}${mana}${killRewardNote(e)}`, cls: "wr" };
    }
    case "move":
      return e.source === "rule"
        ? { text: `　移動: ${cellName(e.from)} → ${cellName(e.to)}`, cls: "" }
        : null;
    case "control": {
      // described with the rules of that moment (a later change must not rewrite old lines); older records lack them
      const x = e as typeof e & { need?: number; hold?: ControlHold };
      const hold = x.hold ?? ctx.cfg.controlHold;
      const need = x.need ?? ctx.cfg.controlWin;
      const label = controlLabel(ctx, hold);
      if (e.change === "gain") {
        const how = hold === "next_turn_end"
          ? `次の自ターン終了時まで${need}マス維持で勝利`
          : `次の自ターン開始時に${need}マスなら勝利`;
        return { text: `◆ ${seat(e.player)}が${label} (${how})`, cls: "ctl" };
      }
      if (e.change === "lost") return { text: `◆ ${seat(e.player)}の${label}が崩れた`, cls: "ctl" };
      return { text: `◆ ${seat(e.player)}の制圧が成立`, cls: "ctl" };
    }
    case "mulligan":
      return {
        text: e.returned > 0
          ? `${seat(e.player)}: マリガンで${e.returned}枚戻して引き直し`
          : `${seat(e.player)}: マリガンなし`,
        cls: "",
      };
    case "mulliganCards":
      return { text: `　(あなたが戻した札: ${e.cards.map(name).join("、")})`, cls: "muted" };
    case "reshuffle":
      return { text: `${seat(e.player)}: 墓地を山札に戻してシャッフル(${e.count}回目)`, cls: "" };
    case "turnEnd": {
      const bits = [`占拠${e.occupied}`];
      if (e.chipGained > 0) bits.push(`チップ+${e.chipGained}(計${e.chips})`);
      else if (e.chipGained < 0) bits.push(`チップ−${-e.chipGained}(計${e.chips})`);
      if (e.discarded > 0) bits.push(`${e.discarded}枚捨てて${e.drawn}枚補充`);
      else if (e.drawn > 0) bits.push(`${e.drawn}枚補充`);
      return { text: `${seat(e.player)}: ターン終了 — ${bits.join(" / ")}`, cls: "" };
    }
    case "resign":
      return { text: `◆ ${seat(e.player)}が投了`, cls: "wr" };
    case "counterOrder":
      return { text: `◆ ${seat(e.player)}が反撃の順番を選択: ${e.cards.map((id) => (id === "" ? "?" : name(id))).join(" → ")}`, cls: "ctl" };
    case "config":
      return { text: `◇ ルール変更: ${e.changes.map(describeChange).join(" / ")}`, cls: "cfg" };
    case "cards":
      return { text: `◇ カード変更: ${e.changes.map((c) => `${cardName(ctx, c.cardId)}の${c.label} ${c.from}→${c.to}`).join(" / ")}`, cls: "cfg" };
    case "gameEnd": {
      const who =
        e.winner === null
          ? `引き分け(${winHow(e.winType, "両者")})`
          : `${seat(e.winner)}の勝ち(${winHow(e.winType, seat(e.winner === 0 ? 1 : 0))})`;
      return { text: `◆ 決着 (R${e.round}): ${who}`, cls: "wr" };
    }
    default:
      return null;
  }
};

// --------------------------------------------------------------- previews

const hpNow = (ctx: Ctx, board: BoardView, uid: number): number => {
  const u = unitById(board, uid);
  return u === undefined ? 0 : Math.max(0, unitHp(ctx, u));
};

/** Summary lines for the confirm bar under an attack prediction (HTML). */
export const attackSummaryLines = (ctx: Ctx, board: BoardView, names: Names, uid: number, pv: AttackPreview): string[] => {
  const attacker = unitById(board, uid);
  const aName = attacker === undefined ? "" : cardName(ctx, attacker.cardId);
  const lines: string[] = [];
  if (pv.heal) {
    for (const h of pv.hits) {
      lines.push(`${esc(cardName(ctx, h.cardId))} を回復 +${-h.dmg}(HP ${hpNow(ctx, board, h.uid)} → ${h.hpAfter})`);
    }
    return lines;
  }
  for (const h of pv.hits) {
    const tags = `${h.blind ? "【死角】" : ""}${h.ally ? "【味方】" : ""}`;
    lines.push(
      `${esc(cardName(ctx, h.cardId))} <b>−${h.dmg}</b>${tags}(HP ${hpNow(ctx, board, h.uid)}→${h.hpAfter})${
        h.destroyed ? ' <b class="warn">撃破</b>' : ""
      }`,
    );
  }
  // 案A: when the countering side's order changes the result, the counter line says who decides it
  const who = pv.counterOrderOpen === true ? "・順番は相手が選ぶ" : "";
  lines.push(pv.counterTotal > 0 ? `<b class="warn">反撃 −${pv.counterTotal}</b>(${pv.counterCount}体${who})` : "反撃なし");
  if (pv.attackerHpAfter !== pv.attackerHpBefore || pv.attackerDestroyed) {
    lines.push(`${esc(aName)} HP ${pv.attackerHpBefore}→${pv.attackerHpAfter}${pv.attackerDestroyed ? ' <b class="warn">撃破される</b>' : ""}`);
  }
  if (pv.movedTo !== null) lines.push(`撃破したマス(${cellName(pv.movedTo)})へ移動`);
  for (const m of pv.moves ?? []) {
    if (m.uid !== uid) lines.push(`${esc(cardName(ctx, m.cardId))}が${cellName(m.to)}へ移動(反撃で撃破)`);
  }
  if (pv.variant === "regen") lines.push("【再生】攻撃後HP+1(霊力+1込み)");
  if (pv.variant === "drink") lines.push("【飲酒】ATK+1(霊力+2込み)");
  for (const p of [0, 1] as PlayerId[]) {
    if (pv.manaGain[p] > 0) {
      const card = ctx.cfg.killRewardBase === "card";
      const why = card ? "" : ctx.cfg.refundMode === "killer_half" ? "撃破により" : "還付で";
      lines.push(`${why}${esc(names[p])}の霊力+${pv.manaGain[p]}${card ? MANA_VALUE_TAG : ""}`);
    }
    if (pv.lifeLoss[p] > 0) lines.push(`${esc(names[p])}の生命−${pv.lifeLoss[p]}`);
  }
  if (pv.ends !== null) {
    lines.push(`<b class="warn">この攻撃で決着: ${pv.ends.winner === null ? "引き分け" : `${esc(names[pv.ends.winner])}の勝ち`}</b>`);
  }
  return lines;
};

export const inheritSummaryLines = (ctx: Ctx, pv: InheritPreview): string[] => [
  `${esc(cardName(ctx, pv.fromCardId))} → <b>${esc(cardName(ctx, pv.toCardId))}</b>(位置と向きを引き継ぐ)`,
  `支払い <b>${pv.cost}</b>${(pv.underdogDiscount ?? 0) > 0 ? `(本来${pv.cost + (pv.underdogDiscount ?? 0)}・劣勢割引 −${pv.underdogDiscount})` : ""} / 回収 <b>+${pv.refund}</b> → 霊力 ${pv.manaBefore} → <b>${pv.manaAfter}</b>`,
  `継承後のHP <b>${pv.hpAfter}</b>/${pv.maxHpAfter}${pv.carriedDamage > 0 ? `(ダメージ${pv.carriedDamage}を引き継ぎ)` : ""}`,
  `<span class="muted">元の式神は墓地へ(撃破ではないので${ctx.cfg.lifeValueEnabled ? "生命は減らない" : "霊力価は誰も得ない"})</span>`,
];

/** Result words for a finished board ("制圧勝ち"); null while undecided (and on resign, which has no winType). */
export const resultHow = (winType: string | null, winner: PlayerId | null, names: Names): string | null => {
  if (winType === null) return null;
  if (winner === null) return `引き分け(${winHow(winType, "両者")})`;
  if (winType === "control") return "制圧勝ち";
  if (winType === "life") return `生命勝ち(${names[winner === 0 ? 1 : 0]}の生命が0)`;
  return winHow(winType, "");
};
