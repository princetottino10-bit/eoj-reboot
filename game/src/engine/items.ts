import { getCardName } from "../data/cards.js";
import { clearAffiliatedEffects } from "./combat.js";
import type { EffectAtom, EffectTarget } from "./effectSpecs.js";
import { ITEM_SPECS } from "./effectSpecs.js";
import type { Board, CellIndex, Direction, GameState } from "./types.js";
import { appendLog, assertNonNull } from "./types.js";

// ============================================================
// エフェクト原子の適用
// ============================================================

function applyItemAtom(
  state: GameState,
  atom: EffectAtom,
  atomTarget: EffectTarget | undefined,
  targetIdx: CellIndex | undefined,
  active: 0 | 1,
): GameState {
  const opp = (1 - active) as 0 | 1;

  // ── 対象不要なアトム ──
  if (atom.type === "draw") {
    const np = [...state.players] as typeof state.players;
    const deck = [...np[active].deck];
    const hand = [...np[active].hand];
    for (let i = 0; i < atom.count; i++) {
      if (deck.length > 0) hand.push(assertNonNull(deck.pop()));
    }
    np[active] = { ...np[active], deck, hand };
    return appendLog(
      { ...state, players: np },
      `${atom.count}枚ドロー`,
      "info",
    );
  }
  if (atom.type === "mana_gain") {
    const np = [...state.players] as typeof state.players;
    np[active] = { ...np[active], mana: np[active].mana + atom.amount };
    return appendLog({ ...state, players: np }, `マナ+${atom.amount}`, "info");
  }

  if (targetIdx === undefined) return state;
  const nb = [...state.board] as Board;
  const c = nb[targetIdx];
  if (!c) return state;

  // オーナーシップガード（spec の target 種別から判定）
  const isAllyScope =
    atomTarget === "select_ally" || atomTarget === "select_adj_ally";
  const isEnemyScope =
    atomTarget === "select_enemy" || atomTarget === "select_adj_enemy";
  if (isAllyScope && c.owner !== active) return state;
  if (isEnemyScope && c.owner !== opp) return state;

  // ── 対象ありアトム ──
  switch (atom.type) {
    case "heal": {
      nb[targetIdx] = { ...c, hp: Math.min(c.hp + atom.amount, c.maxHp) };
      return appendLog({ ...state, board: nb }, `HP+${atom.amount}`, "heal");
    }
    case "give_marker": {
      nb[targetIdx] = {
        ...c,
        markers: { ...c.markers, [atom.marker]: c.markers[atom.marker] + 1 },
      };
      return appendLog(
        { ...state, board: nb },
        `${atom.marker}マーカー付与`,
        "info",
      );
    }
    case "atk_delta": {
      if ("turns" in atom && atom.turns) {
        nb[targetIdx] = { ...c, tempAtkBuff: c.tempAtkBuff + atom.delta };
      } else {
        nb[targetIdx] = { ...c, atk: Math.max(0, c.atk + atom.delta) };
      }
      const sign = atom.delta > 0 ? "+" : "";
      return appendLog(
        { ...state, board: nb },
        `ATK${sign}${atom.delta}`,
        "info",
      );
    }
    case "hp_delta": {
      const newHp = c.hp + atom.amount;
      if (newHp <= 0) {
        nb[targetIdx] = null;
        clearAffiliatedEffects(nb, c.cardId);
        if (c.owner === opp) {
          const np = [...state.players] as typeof state.players;
          np[active] = { ...np[active], vp: np[active].vp + 1 };
          return appendLog(
            { ...state, board: nb, players: np },
            `${Math.abs(atom.amount)}ダメ（撃破！1VP）`,
            "system",
          );
        }
        return appendLog(
          { ...state, board: nb },
          `${Math.abs(atom.amount)}ダメ`,
          "damage",
        );
      }
      nb[targetIdx] = { ...c, hp: newHp };
      return appendLog(
        { ...state, board: nb },
        atom.amount < 0 ? `${Math.abs(atom.amount)}ダメ` : `HP+${atom.amount}`,
        atom.amount < 0 ? "damage" : "heal",
      );
    }
    case "rotate": {
      if (atom.degrees === "any" || atom.degrees === "either") return state; // 向き選択はUI側で処理
      const rotated =
        atom.degrees === 180
          ? (((c.dir + 2) % 4) as Direction)
          : (((c.dir + 1) % 4) as Direction);
      nb[targetIdx] = { ...c, dir: rotated };
      return appendLog({ ...state, board: nb }, `${atom.degrees}°回転`, "info");
    }
    case "dir_lock": {
      nb[targetIdx] = { ...c, status: { ...c.status, dirLocked: atom.turns } };
      return appendLog(
        { ...state, board: nb },
        `向き固定${atom.turns}ターン`,
        "info",
      );
    }
    case "clear_has_acted": {
      nb[targetIdx] = { ...c, hasActed: false };
      return appendLog(
        { ...state, board: nb },
        `${getCardName(c.cardId)} 再行動可能`,
        "info",
      );
    }
    case "bounce": {
      nb[targetIdx] = null;
      const np = [...state.players] as typeof state.players;
      if (c.owner === active) {
        np[active] = { ...np[active], hand: [...np[active].hand, c.cardId] };
        return appendLog(
          { ...state, board: nb, players: np },
          `${getCardName(c.cardId)} を手札に戻した`,
          "info",
        );
      } else {
        np[opp] = { ...np[opp], hand: [...np[opp].hand, c.cardId] };
        return appendLog(
          { ...state, board: nb, players: np },
          `${getCardName(c.cardId)} を相手の手札に戻した`,
          "system",
        );
      }
    }
    default:
      return state;
  }
}

// ============================================================
// 公開 API
// ============================================================

/**
 * ITEM_SPECS を参照してアイテム効果を適用する。
 * targetIdx は対象ありアイテムに渡す。即時効果（draw, mana_gain など）は undefined でよい。
 */
export function applyItemEffect(
  state: GameState,
  itemId: string,
  targetIdx: CellIndex | undefined,
  active: 0 | 1,
): GameState {
  const spec = ITEM_SPECS[itemId];
  if (!spec) return appendLog(state, `${itemId} は未実装`, "system");

  const clause = spec.clauses.find((c) => c.trigger === "on_use");
  if (!clause) return state;

  let ns = state;
  for (const atom of clause.effects) {
    const atomTarget =
      "target" in atom ? (atom as { target: EffectTarget }).target : undefined;
    ns = applyItemAtom(ns, atom, atomTarget, targetIdx, active);
  }
  return ns;
}
