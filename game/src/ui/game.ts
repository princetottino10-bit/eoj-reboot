import {
  getCardCost,
  getCardName,
  getCharDef,
  getItemDef,
  isCharCard,
} from "../data/cards.js";
import {
  getAdjacentCells,
  getAttackCells,
  getValidSummonCells,
  isBlindSpot,
  resolveSelectCells,
} from "../engine/board.js";
import { resolveAttack } from "../engine/combat.js";
import { calcCostReduction } from "../engine/cost.js";
import type { EffectCondition, EffectTarget } from "../engine/effectSpecs.js";
import {
  getEffectSpec,
  getFirstSelectTarget,
  getItemSpec,
  getUltSpec,
} from "../engine/effectSpecs.js";
import {
  applyAutoEffects,
  getSummonEffect,
  resolveSummonAutoAttack,
} from "../engine/effects.js";
import type { AttackCells } from "../engine/gamestate.js";
import { attributeHpBonus, createCharInstance } from "../engine/gamestate.js";
import { applyItemEffect } from "../engine/items.js";
import {
  applyDiscardEffect,
  applyEffectAfterDir,
  applyPendingEffect,
} from "../engine/pendingEffects.js";
import {
  drawStep,
  endTurnCleanup,
  spendReactivationMana,
  startTurnPhase,
} from "../engine/turn.js";
import type {
  Board,
  CellIndex,
  Direction,
  GameState,
  RelCoord,
} from "../engine/types.js";
import { appendLog, assertNonNull } from "../engine/types.js";
import { applyUltDirectEffect, applyUltTargetEffect } from "../engine/ults.js";
import { evalVictory } from "../engine/victory.js";
import { getState, resetGameUiExtra, setState } from "./app.js";

export interface GameUiExtra {
  mode:
    | "idle"
    | "summon_done"
    | "magic_attack_targeting"
    | "on_attack_cost_pending"
    | "on_attack_discard_pending"
    | "on_attack_rotate_pending"
    | "hand_selected"
    | "summon_dir_pending"
    | "char_selected"
    | "attack_targeting"
    | "effect_targeting"
    | "effect_dir_pending"
    | "effect_rotate_pending"
    | "discard_pending"
    | "ult_targeting"
    | "ult_dir_pending"
    | "element_swap_ally_pending"
    | "element_swap_hand_pending"
    | "item_rotate_pending";
  validCells: CellIndex[];
  dirPickerCell: CellIndex | null;
  summonHandIdx: number | null;
  selectedBoardIdx: CellIndex | null;
  pendingCardId: string | null;
  pendingCellIdx: CellIndex | null;
  /** Two-step effect: after target chosen, show direction picker (any) */
  effectDirContext: {
    cardId: string;
    summonIdx: CellIndex;
    targetIdx: CellIndex;
  } | null;
  /** Two-step effect: after target chosen, show 90° left/right picker */
  effectRotateContext: {
    cardId: string;
    summonIdx: CellIndex;
    targetIdx: CellIndex;
  } | null;
  /** Item effect: after target chosen, show 90° left/right picker */
  itemRotateContext: {
    cardId: string;
    targetIdx: CellIndex;
    handIdx: number;
  } | null;
  /** Discard-from-hand effect context */
  discardContext: {
    cardId: string;
    cellIdx: CellIndex;
    mandatory: boolean;
  } | null;
  /** Index of item card being played (in active player's hand) */
  itemHandIdx: number | null;
  /** Ult caster's board index (for multi-step ult flows) */
  ultCasterIdx: CellIndex | null;
  /** Board index selected in element_swap step 1 */
  elementSwapBoardIdx: CellIndex | null;
  /** Magic summon attack context: which summoned char and card */
  magicAttackContext: {
    cardId: string;
    summonIdx: CellIndex;
  } | null;
  /** On-attack effect flow context */
  onAttackContext: {
    attackerIdx: CellIndex;
    targetIdx: CellIndex;
    isSummonAttack: boolean;
    extraDamage: number;
    setPiercing: boolean;
    rotateAfterAttack: boolean;
    costClauseActivated: boolean;
  } | null;
}

const DIR_ARROWS = ["↑", "→", "↓", "←"] as const;

function dirArrow(dir: Direction): string {
  // biome-ignore lint/style/noNonNullAssertion: DIR_ARROWS has 4 elements, dir is Direction (0|1|2|3)
  return DIR_ARROWS[dir]!;
}

const TARGET_HINT: Partial<Record<EffectTarget, string>> = {
  select_ally: "対象の味方を選択",
  select_adj_ally: "隣接味方を選択",
  select_enemy: "対象の敵を選択",
  select_adj_enemy: "隣接敵を選択",
  select_any: "対象を選択",
};

function markerStr(char: NonNullable<Board[number]>): string {
  const parts: string[] = [];
  if (char.markers.protection > 0) parts.push(`防${char.markers.protection}`);
  if (char.markers.evasion > 0) parts.push(`回${char.markers.evasion}`);
  if (char.markers.piercing > 0) parts.push(`貫${char.markers.piercing}`);
  if (char.markers.quickness > 0) parts.push(`先${char.markers.quickness}`);
  if (char.status.brainwashedTurns > 0)
    parts.push(`洗脳${char.status.brainwashedTurns}`);
  if (char.status.actionTax > 0) parts.push(`再+${char.status.actionTax}`);
  if (char.keywords.includes("防護")) parts.push("防護");
  if (char.keywords.includes("回避")) parts.push("回避");
  if (char.keywords.includes("貫通")) parts.push("貫通");
  if (char.keywords.includes("先制")) parts.push("先制");
  if (char.keywords.includes("不動")) parts.push("不動");
  if (char.keywords.includes("カバー")) parts.push("カバー");
  if (char.keywords.includes("要塞")) parts.push("要塞");
  return parts.join(" ");
}

// ============================================================
// Card detail popup
// ============================================================

let _detailPopup: HTMLElement | null = null;
let _detailOverlay: HTMLElement | null = null;
// Suppresses the click event that fires after a long-press
let _longPressActive = false;

function ensureDetailPopup(): { popup: HTMLElement; overlay: HTMLElement } {
  if (!_detailPopup) {
    _detailPopup = document.createElement("div");
    _detailPopup.id = "card-detail-popup";
    document.body.appendChild(_detailPopup);

    _detailOverlay = document.createElement("div");
    _detailOverlay.id = "card-detail-overlay";
    _detailOverlay.addEventListener("click", hideCardDetail);
    document.body.appendChild(_detailOverlay);
  }
  // biome-ignore lint/style/noNonNullAssertion: both assigned in the if block above
  return { popup: _detailPopup!, overlay: _detailOverlay! };
}

function hideCardDetail(): void {
  if (_detailPopup) {
    _detailPopup.style.display = "none";
    _detailPopup.classList.remove("modal-mode");
  }
  if (_detailOverlay) _detailOverlay.style.display = "none";
}

function buildWeaknessGrid(
  weaknessCells: [number, number][] | undefined,
): string {
  const cells = weaknessCells ?? [[-1, 0]];
  const gridCells: string[] = [];
  for (let gridRow = 0; gridRow < 4; gridRow++) {
    const coordRow = 2 - gridRow;
    for (let gridCol = 0; gridCol < 3; gridCol++) {
      const coordCol = gridCol - 1;
      const isChar = coordRow === 0 && coordCol === 0;
      const isWeak =
        !isChar && cells.some(([r, c]) => r === coordRow && c === coordCol);
      let cls = "cd-attack-cell";
      let content = "";
      if (isChar) {
        cls += " char-pos";
        content = "自";
      } else if (isWeak) {
        cls += " weakness-cell";
        content = "★";
      }
      gridCells.push(`<div class="${cls}">${content}</div>`);
    }
  }
  return `<div class="cd-attack-grid">${gridCells.join("")}</div>`;
}

// ============================================================
// On-attack effect helpers
// ============================================================

function evalOnAttackCond(
  cond: EffectCondition | undefined,
  state: GameState,
  attackerIdx: CellIndex,
  targetIdx: CellIndex,
  owner: 0 | 1,
): boolean {
  if (!cond) return true;
  switch (cond.type) {
    case "self_in_b_position": {
      const defender = state.board[targetIdx];
      if (!defender) return false;
      const defDef = getCharDef(defender.cardId);
      const weaknessCells = (defDef?.weakness_cells ?? [[-1, 0]]) as RelCoord[];
      return isBlindSpot(attackerIdx, targetIdx, defender.dir, weaknessCells);
    }
    case "attacked_ally_count_gte":
      return (
        state.board.filter((c) => c?.owner === owner && c.hasActed).length >=
        cond.min
      );
    case "marker_ally_count_gte": {
      const count = state.board.filter((c) => {
        if (!c || c.owner !== owner) return false;
        return (
          c.markers.protection > 0 ||
          c.markers.evasion > 0 ||
          c.markers.piercing > 0 ||
          c.markers.quickness > 0 ||
          c.keywords.includes("防護") ||
          c.keywords.includes("回避") ||
          c.keywords.includes("貫通") ||
          c.keywords.includes("先制")
        );
      }).length;
      return count >= cond.min;
    }
    default:
      return false;
  }
}

interface OnAttackEffectSummary {
  extraDamage: number;
  setPiercing: boolean;
  rotateAfterAttack: boolean;
  hasOptionalCostClause: boolean;
}

function computeOnAttackEffects(
  state: GameState,
  attackerIdx: CellIndex,
  targetIdx: CellIndex,
  owner: 0 | 1,
): OnAttackEffectSummary {
  const attacker = state.board[attackerIdx];
  if (!attacker)
    return {
      extraDamage: 0,
      setPiercing: false,
      rotateAfterAttack: false,
      hasOptionalCostClause: false,
    };

  const spec = getEffectSpec(attacker.cardId);
  const clauses = spec.clauses.filter((c) => c.trigger === "on_attack");

  let extraDamage = 0;
  let setPiercing = false;
  let rotateAfterAttack = false;
  let hasOptionalCostClause = false;

  for (const clause of clauses) {
    if (clause.cost && !clause.costMandatory) {
      hasOptionalCostClause = true;
      continue;
    }
    if (clause.cost && clause.costMandatory) continue;
    if (
      !evalOnAttackCond(clause.condition, state, attackerIdx, targetIdx, owner)
    )
      continue;
    for (const eff of clause.effects) {
      if (eff.type === "extra_damage") extraDamage += eff.amount;
      else if (eff.type === "set_piercing") setPiercing = true;
      else if (
        eff.type === "rotate" &&
        (eff as { target: string }).target === "attack_target"
      )
        rotateAfterAttack = true;
    }
  }

  return { extraDamage, setPiercing, rotateAfterAttack, hasOptionalCostClause };
}

function applyOnAttackPostEffects(
  state: GameState,
  attackerIdx: CellIndex,
  targetIdx: CellIndex,
  owner: 0 | 1,
): GameState {
  const attacker = state.board[attackerIdx];
  if (!attacker) return state;

  const spec = getEffectSpec(attacker.cardId);
  const clauses = spec.clauses.filter((c) => c.trigger === "on_attack");
  const opp = (1 - owner) as 0 | 1;

  let newState = state;

  for (const clause of clauses) {
    if (clause.cost && !clause.costMandatory) continue;
    if (
      !evalOnAttackCond(
        clause.condition,
        newState,
        attackerIdx,
        targetIdx,
        owner,
      )
    )
      continue;
    for (const eff of clause.effects) {
      if (eff.type === "action_tax") {
        const adjIdxs = getAdjacentCells(attackerIdx);
        const nb = [...newState.board] as Board;
        let applied = false;
        for (const adjIdx of adjIdxs) {
          const c = nb[adjIdx];
          if (c && c.owner === opp) {
            nb[adjIdx] = {
              ...c,
              status: {
                ...c.status,
                actionTax: c.status.actionTax + eff.amount,
                actionTaxBy: attacker.cardId,
              },
            };
            applied = true;
          }
        }
        if (applied)
          newState = appendLog(
            { ...newState, board: nb },
            `攻撃時効果: 隣接敵に再起動コスト+${eff.amount}`,
            "info",
          );
        else newState = { ...newState, board: nb };
      } else if (eff.type === "draw") {
        for (let i = 0; i < eff.count; i++) {
          const deck = newState.players[owner].deck;
          if (deck.length > 0) {
            const card = assertNonNull(deck.at(-1));
            const np = [...newState.players] as typeof newState.players;
            np[owner] = {
              ...np[owner],
              deck: deck.slice(0, -1),
              hand: [...np[owner].hand, card],
            };
            newState = appendLog(
              { ...newState, players: np },
              `攻撃時効果: ${eff.count}枚ドロー`,
              "info",
            );
          }
        }
      }
    }
  }

  return newState;
}

function handleSummonDone(state: GameState): void {
  if (getState().online) {
    onEndTurn(state);
  } else {
    setState({
      gameState: state,
      gameUiExtra: { ...resetGameUiExtra(), mode: "summon_done" },
    });
  }
}

function executeAttack(
  state: GameState,
  attackerIdx: CellIndex,
  targetIdx: CellIndex,
  isSummonAttack: boolean,
  extraDamage: number,
  setPiercing: boolean,
  rotateAfterAttack: boolean,
): void {
  const active = state.active;
  const attacker = state.board[attackerIdx];
  if (!attacker) {
    if (isSummonAttack) handleSummonDone(state);
    else setState({ gameState: state, gameUiExtra: resetGameUiExtra() });
    return;
  }
  const def = getCharDef(attacker.cardId);
  if (!def) {
    if (isSummonAttack) handleSummonDone(state);
    else setState({ gameState: state, gameUiExtra: resetGameUiExtra() });
    return;
  }
  const targetChar = state.board[targetIdx];
  if (!targetChar) {
    if (isSummonAttack) handleSummonDone(state);
    else setState({ gameState: state, gameUiExtra: resetGameUiExtra() });
    return;
  }

  const workBoard = state.board.map((c) =>
    c === null
      ? null
      : {
          ...c,
          keywords: [...c.keywords],
          markers: { ...c.markers },
          status: { ...c.status },
        },
  ) as Board;

  const preAttackLogs: string[] = [];
  if (extraDamage > 0) {
    const a = workBoard[attackerIdx];
    if (a) {
      workBoard[attackerIdx] = {
        ...a,
        tempAtkBuff: (a.tempAtkBuff ?? 0) + extraDamage,
      };
      preAttackLogs.push(`攻撃時効果: ATK+${extraDamage}`);
    }
  }
  if (setPiercing) {
    const a = workBoard[attackerIdx];
    if (a) {
      workBoard[attackerIdx] = {
        ...a,
        markers: { ...a.markers, piercing: a.markers.piercing + 1 },
      };
      preAttackLogs.push("攻撃時効果: 貫通付与");
    }
  }

  const defDef = getCharDef(targetChar.cardId);
  const result = resolveAttack(workBoard, attackerIdx, targetIdx, {
    teamDR: state.teamDR,
    weaknessCells: (defDef?.weakness_cells ?? [[-1, 0]]) as RelCoord[],
    attackType: def.attack_type === "魔法" ? "magic" : "physical",
    defenderCost: defDef?.cost ?? 1,
    attackerCost: def.cost,
    defenderAttackCells: (defDef?.attack_cells ?? null) as
      | "all"
      | null
      | [number, number][],
  });

  if (!isSummonAttack && workBoard[attackerIdx])
    // biome-ignore lint/style/noNonNullAssertion: null check above
    workBoard[attackerIdx] = { ...workBoard[attackerIdx]!, hasActed: true };

  let newState = spendReactivationMana(
    { ...state, board: workBoard },
    attackerIdx,
    def.reactivation_cost,
  );
  for (const msg of preAttackLogs) newState = appendLog(newState, msg, "info");

  const atkName = getCardName(attacker.cardId);
  const defName = getCardName(targetChar.cardId);

  if (result.blocked) {
    newState = appendLog(newState, `${atkName} の攻撃がブロックされた`, "info");
  } else if (result.evaded) {
    newState = appendLog(newState, `${defName} が攻撃を回避！`, "info");
  } else {
    newState = appendLog(
      newState,
      `${atkName} → ${defName}: ${result.defenderDamage}ダメージ${result.isBlind ? " [B位置]" : ""}`,
      "damage",
    );
    if (result.counterDamage > 0)
      newState = appendLog(
        newState,
        `${defName} ← 反撃: ${result.counterDamage}ダメージ`,
        "damage",
      );
    if (result.vpAwarded > 0) {
      const np = [...newState.players] as typeof newState.players;
      np[active] = { ...np[active], vp: np[active].vp + result.vpAwarded };
      newState = { ...newState, players: np };
      newState = appendLog(
        newState,
        `${defName} 撃破！ ${result.vpAwarded}VP`,
        "system",
      );
    }
    if (result.counterVpAwarded > 0) {
      const opp = (1 - active) as 0 | 1;
      const np = [...newState.players] as typeof newState.players;
      np[opp] = { ...np[opp], vp: np[opp].vp + result.counterVpAwarded };
      newState = { ...newState, players: np };
      newState = appendLog(
        newState,
        `${atkName} 撃破（反撃）！ ${result.counterVpAwarded}VP`,
        "system",
      );
    }
  }

  newState = applyOnAttackPostEffects(newState, attackerIdx, targetIdx, active);

  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) {
    setState({ gameState: newState, screen: "over" });
    return;
  }

  if (rotateAfterAttack && newState.board[targetIdx] != null) {
    setState({
      gameState: newState,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: "on_attack_rotate_pending",
        onAttackContext: {
          attackerIdx,
          targetIdx,
          isSummonAttack,
          extraDamage: 0,
          setPiercing: false,
          rotateAfterAttack: false,
          costClauseActivated: false,
        },
      },
    });
    return;
  }

  if (isSummonAttack) {
    handleSummonDone(newState);
  } else {
    setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
  }
}

function buildAttackGrid(attackCells: AttackCells): string {
  if (attackCells === null) return '<div class="cd-attack-none">攻撃不可</div>';
  if (attackCells === "all") return '<div class="cd-attack-all">全域攻撃</div>';
  const cells: string[] = [];
  // 4 rows top→bottom: coord row +2, +1, 0 (char), -1
  for (let gridRow = 0; gridRow < 4; gridRow++) {
    const coordRow = 2 - gridRow;
    for (let gridCol = 0; gridCol < 3; gridCol++) {
      const coordCol = gridCol - 1;
      const isChar = coordRow === 0 && coordCol === 0;
      const isAttack =
        !isChar &&
        (attackCells as [number, number][]).some(
          ([r, c]) => r === coordRow && c === coordCol,
        );
      let cls = "cd-attack-cell";
      let content = "";
      if (isChar) {
        cls += " char-pos";
        content = "自";
      } else if (isAttack) {
        cls += " attack-cell";
        content = "●";
      }
      cells.push(`<div class="${cls}">${content}</div>`);
    }
  }
  return `<div class="cd-attack-grid">${cells.join("")}</div>`;
}

function buildCardDetailHtml(
  cardId: string,
  boardChar?: NonNullable<Board[number]>,
): string {
  if (isCharCard(cardId)) {
    const def = getCharDef(cardId);
    if (!def) return "";
    const kw = def.keywords.join(" ");
    const ult = def.ult;
    const ultHtml = ult
      ? `<div class="cd-ult">
           <div class="cd-ult-header">Ult: ${ult.name}　VP${ult.vp_cost}（${ult.timing}）</div>
           <div class="cd-ult-effect">${ult.effect}</div>
         </div>`
      : "";
    const currentHtml = boardChar
      ? `<div class="cd-current">現在: HP ${boardChar.hp}/${boardChar.maxHp} ATK ${boardChar.atk}</div>`
      : "";
    return `
      <div class="cd-header">
        <span class="cd-name">${def.name}</span>
        <span class="cd-type">${def.faction}</span>
      </div>
      <div class="cd-meta">${def.attribute} コスト${def.cost} | HP${def.hp} ATK${def.atk}</div>
      ${currentHtml}
      ${kw ? `<div class="cd-keywords">${kw}</div>` : ""}
      <div class="cd-effect">${def.effect}</div>
      ${ultHtml}
      <div class="cd-grids">
        <div class="cd-attack-section">
          <div class="cd-attack-label">攻撃範囲（前方↑）</div>
          ${buildAttackGrid(def.attack_cells)}
        </div>
        <div class="cd-attack-section">
          <div class="cd-attack-label">弱点位置（★）</div>
          ${buildWeaknessGrid(def.weakness_cells)}
        </div>
      </div>`;
  } else {
    const def = getItemDef(cardId);
    if (!def) return "";
    return `
      <div class="cd-header">
        <span class="cd-name">${def.name}</span>
        <span class="cd-type" style="color:#4ecdc4;">アイテム</span>
      </div>
      <div class="cd-meta">コスト${def.cost}</div>
      <div class="cd-effect">${def.effect}</div>`;
  }
}

function showCardDetailAt(
  anchor: HTMLElement,
  cardId: string,
  boardChar?: NonNullable<Board[number]>,
): void {
  const { popup } = ensureDetailPopup();
  popup.classList.remove("modal-mode");
  popup.innerHTML = buildCardDetailHtml(cardId, boardChar);
  popup.style.display = "block";

  const rect = anchor.getBoundingClientRect();
  const pw = 230;
  let left = rect.right + 10;
  if (left + pw > window.innerWidth - 4) left = rect.left - pw - 10;
  if (left < 4) left = 4;
  popup.style.left = `${left}px`;
  popup.style.top = `${Math.max(4, rect.top)}px`;

  requestAnimationFrame(() => {
    if (!_detailPopup) return;
    const h = _detailPopup.offsetHeight;
    const maxTop = window.innerHeight - h - 4;
    if (parseFloat(_detailPopup.style.top) > maxTop) {
      _detailPopup.style.top = `${Math.max(4, maxTop)}px`;
    }
  });
}

function showCardDetailModal(
  cardId: string,
  boardChar?: NonNullable<Board[number]>,
): void {
  const { popup, overlay } = ensureDetailPopup();
  popup.classList.add("modal-mode");
  popup.innerHTML = buildCardDetailHtml(cardId, boardChar);
  popup.style.display = "block";
  overlay.style.display = "block";
}

function addCardDetailListeners(
  el: HTMLElement,
  cardId: string,
  boardChar?: NonNullable<Board[number]>,
): void {
  el.addEventListener("pointerenter", (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    showCardDetailAt(el, cardId, boardChar);
  });
  el.addEventListener("pointerleave", (e: PointerEvent) => {
    if (e.pointerType === "touch") return;
    hideCardDetail();
  });

  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  el.addEventListener(
    "touchstart",
    () => {
      pressTimer = setTimeout(() => {
        _longPressActive = true;
        showCardDetailModal(cardId, boardChar);
      }, 500);
    },
    { passive: true },
  );
  const cancelPress = () => {
    if (pressTimer !== null) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
  };
  el.addEventListener("touchend", cancelPress, { passive: true });
  el.addEventListener("touchcancel", cancelPress, { passive: true });
  el.addEventListener("touchmove", cancelPress, { passive: true });
}

// ============================================================
// Rendering
// ============================================================

export function renderGame(state: GameState, ui: GameUiExtra): HTMLElement {
  const active = state.active;
  const opp = (1 - active) as 0 | 1;
  const div = document.createElement("div");
  div.className = "screen-game";

  // ── Header ──
  const p0Class = active === 0 ? "player-info active-player" : "player-info";
  const p1Class = active === 1 ? "player-info active-player" : "player-info";
  div.innerHTML = `
    <div class="game-header">
      <div class="${p0Class}">
        <div class="player-label p0-color">プレイヤー1</div>
        <div class="player-stat">VP: ${state.players[0].vp} / マナ: ${state.players[0].mana}</div>
        <div style="font-size:0.7rem;color:#888;">手札: ${state.players[0].hand.length}枚 / デッキ: ${state.players[0].deck.length}枚</div>
      </div>
      <div class="turn-info">
        <div class="turn-num">ターン ${state.turn + 1}</div>
        <div class="active-label">P${active + 1}のターン</div>
      </div>
      <div class="${p1Class}">
        <div class="player-label p1-color">プレイヤー2</div>
        <div class="player-stat">VP: ${state.players[1].vp} / マナ: ${state.players[1].mana}</div>
        <div style="font-size:0.7rem;color:#888;">手札: ${state.players[1].hand.length}枚 / デッキ: ${state.players[1].deck.length}枚</div>
      </div>
    </div>
  `;

  // ── Board ──
  const boardContainer = document.createElement("div");
  boardContainer.className = "board-container";
  const boardEl = document.createElement("div");
  boardEl.className = "board";
  for (let i = 0; i < 9; i++) {
    boardEl.appendChild(buildCell(state, ui, i as CellIndex));
  }
  boardContainer.appendChild(boardEl);
  div.appendChild(boardContainer);

  // ── Action panel ──
  div.appendChild(buildActionPanel(state, ui));

  // ── Hand ──
  div.appendChild(buildHandSection(state, ui, active, opp));

  // ── Log ──
  const logSection = document.createElement("div");
  logSection.className = "log-section";
  state.log
    .slice(-8)
    .reverse()
    .forEach((entry) => {
      const el = document.createElement("div");
      el.className = `log-entry ${entry.type}`;
      el.textContent = entry.text;
      logSection.appendChild(el);
    });
  div.appendChild(logSection);

  // ── Controls ──
  const { online, myPlayerIndex } = getState();
  const isMyTurn = !online || state.active === myPlayerIndex;

  const controls = document.createElement("div");
  controls.className = "game-controls";

  if (online && !isMyTurn) {
    const waitLabel = document.createElement("div");
    waitLabel.className = "action-label";
    waitLabel.style.cssText =
      "width:100%;text-align:center;color:#888;padding:8px;";
    waitLabel.textContent = `P${state.active + 1}のターン（相手が操作中）`;
    controls.appendChild(waitLabel);
  } else {
    const endTurnBtn = document.createElement("button");
    endTurnBtn.className = "btn";
    endTurnBtn.textContent = "ターン終了";
    endTurnBtn.addEventListener("click", () => onEndTurn(state));
    controls.appendChild(endTurnBtn);
  }
  div.appendChild(controls);

  // ── Overlays ──
  if (ui.mode === "summon_dir_pending" && ui.dirPickerCell !== null) {
    div.appendChild(
      buildDirPickerOverlay("向きを選択（召喚）", (dir) =>
        onDirPicked(state, ui, dir),
      ),
    );
  }
  if (ui.mode === "effect_dir_pending" && ui.effectDirContext !== null) {
    div.appendChild(
      buildDirPickerOverlay("向きを選択", (dir) =>
        onEffectDirPicked(state, ui, dir),
      ),
    );
  }
  if (ui.mode === "ult_dir_pending" && ui.pendingCellIdx !== null) {
    div.appendChild(
      buildDirPickerOverlay("向きを選択（ウルト）", (dir) =>
        onUltDirPicked(state, ui, dir),
      ),
    );
  }
  if (ui.mode === "effect_rotate_pending" && ui.effectRotateContext !== null) {
    div.appendChild(
      buildRotatePickerOverlay("回転方向を選択", (clockwise) =>
        onEffectRotatePicked(state, ui, clockwise),
      ),
    );
  }
  if (ui.mode === "item_rotate_pending" && ui.itemRotateContext !== null) {
    div.appendChild(
      buildRotatePickerOverlay("回転方向を選択", (clockwise) =>
        onItemRotatePicked(state, ui, clockwise),
      ),
    );
  }
  if (ui.mode === "on_attack_rotate_pending" && ui.onAttackContext !== null) {
    div.appendChild(
      buildDirPickerOverlay("向きを選択（攻撃時効果）", (dir) =>
        onOnAttackRotatePicked(state, ui, dir),
      ),
    );
  }

  return div;
}

function buildActionPanel(state: GameState, ui: GameUiExtra): HTMLElement {
  const active = state.active;
  const actionPanel = document.createElement("div");
  actionPanel.className = "action-panel";

  const cancel = (label = "キャンセル") => {
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary";
    btn.textContent = label;
    btn.addEventListener("click", () =>
      setState({ gameUiExtra: resetGameUiExtra() }),
    );
    return btn;
  };

  if (ui.mode === "summon_done") {
    const hint = document.createElement("div");
    hint.className = "action-label";
    hint.textContent = "召喚完了 — ターン終了ボタンを押してください";
    actionPanel.appendChild(hint);
  } else if (ui.mode === "on_attack_cost_pending") {
    const ctx = ui.onAttackContext;
    if (ctx) {
      const attacker = state.board[ctx.attackerIdx];
      if (attacker) {
        const spec = getEffectSpec(attacker.cardId);
        const optClause = spec.clauses.find(
          (c) => c.trigger === "on_attack" && c.cost && !c.costMandatory,
        );
        if (optClause?.cost) {
          const c = optClause.cost;
          const costDesc =
            c.type === "self_damage"
              ? `自身${c.amount}ダメージ`
              : c.type === "mana"
                ? `マナ${c.amount}`
                : c.type === "discard"
                  ? `手札${c.count}枚捨て`
                  : c.type === "self_damage_and_discard"
                    ? `自身${c.damage}ダメ + 手札${c.discard}枚捨て`
                    : "";
          const effectDesc = optClause.effects
            .map((e) => {
              if (e.type === "extra_damage") return `+${e.amount}ダメージ`;
              if (e.type === "set_piercing") return "貫通付与";
              return "";
            })
            .filter(Boolean)
            .join(" + ");
          const hint = document.createElement("div");
          hint.className = "action-label";
          hint.style.width = "100%";
          hint.textContent = `攻撃時効果: ${costDesc} → ${effectDesc}`;
          actionPanel.appendChild(hint);

          const canAfford = (() => {
            if (c.type === "mana")
              return state.players[active].mana >= c.amount;
            if (c.type === "discard")
              return state.players[active].hand.length >= c.count;
            if (c.type === "self_damage_and_discard")
              return state.players[active].hand.length >= c.discard;
            return true;
          })();

          const yesBtn = document.createElement("button");
          yesBtn.className = `btn btn-warning${canAfford ? "" : " disabled"}`;
          yesBtn.textContent = "発動する";
          if (canAfford)
            yesBtn.addEventListener("click", () =>
              onOnAttackCostYes(state, ui),
            );
          actionPanel.appendChild(yesBtn);

          const noBtn = document.createElement("button");
          noBtn.className = "btn btn-secondary";
          noBtn.textContent = "スキップ";
          noBtn.addEventListener("click", () => onOnAttackCostNo(state, ui));
          actionPanel.appendChild(noBtn);
        }
      }
    }
  } else if (ui.mode === "on_attack_discard_pending") {
    const hint = document.createElement("div");
    hint.className = "action-label";
    hint.style.width = "100%";
    hint.textContent = "捨てる手札を1枚選択（攻撃時コスト）";
    actionPanel.appendChild(hint);
  } else if (ui.mode === "char_selected" && ui.selectedBoardIdx !== null) {
    const char = state.board[ui.selectedBoardIdx];
    if (char && char.owner === active) {
      const labelEl = document.createElement("div");
      labelEl.className = "action-label";
      labelEl.textContent = `${char.keywords.includes("要塞") ? "[要塞] " : ""}${getCardName(char.cardId)} の行動:`;
      actionPanel.appendChild(labelEl);

      if (
        !char.hasActed &&
        !char.keywords.includes("要塞") &&
        char.status.brainwashedTurns === 0
      ) {
        const attackBtn = document.createElement("button");
        attackBtn.className = "btn btn-danger";
        attackBtn.textContent = "攻撃";
        attackBtn.addEventListener("click", () => onAttackClick(state, ui));
        actionPanel.appendChild(attackBtn);
      }

      if (
        !char.hasRotated &&
        char.status.dirLocked === 0 &&
        char.status.brainwashedTurns === 0
      ) {
        const rotLabel = document.createElement("div");
        rotLabel.className = "action-label";
        rotLabel.style.width = "100%";
        rotLabel.textContent = "向きを変える:";
        actionPanel.appendChild(rotLabel);
        for (let d = 0; d < 4; d++) {
          if (d === char.dir) continue;
          const rotBtn = document.createElement("button");
          rotBtn.className = "btn btn-secondary";
          // biome-ignore lint/style/noNonNullAssertion: d loops 0-3 matching Direction union
          rotBtn.textContent = DIR_ARROWS[d as Direction]!;
          rotBtn.addEventListener("click", () =>
            onRotateClick(state, ui, d as Direction),
          );
          actionPanel.appendChild(rotBtn);
        }
      }

      const ultSpec = getUltSpec(char.cardId);
      if (
        ultSpec !== null &&
        !char.ultUsed &&
        state.players[active].vp >= ultSpec.vpCost
      ) {
        const timingOk =
          ultSpec.timing === "immediate" || state.turn > char.summonedOnTurn;
        if (timingOk) {
          const ultBtn = document.createElement("button");
          ultBtn.className = "btn btn-warning";
          ultBtn.textContent = `ウルト (${ultSpec.vpCost}VP)`;
          ultBtn.addEventListener("click", () => onUltClick(state, ui));
          actionPanel.appendChild(ultBtn);
        }
      }

      actionPanel.appendChild(cancel());
    }
  } else if (ui.mode === "discard_pending") {
    const ctx = ui.discardContext;
    if (ctx) {
      const hint = document.createElement("div");
      hint.className = "action-label";
      hint.style.width = "100%";
      hint.textContent = ctx.mandatory
        ? "手札を1枚捨てる（必須）"
        : "手札を1枚捨てる（スキップ可）";
      actionPanel.appendChild(hint);
      if (!ctx.mandatory) {
        const skipBtn = document.createElement("button");
        skipBtn.className = "btn btn-secondary";
        skipBtn.textContent = "スキップ";
        skipBtn.addEventListener("click", () => onDiscardSkip(state, ui));
        actionPanel.appendChild(skipBtn);
      }
    }
  } else if (
    ui.mode === "hand_selected" ||
    ui.mode === "attack_targeting" ||
    ui.mode === "magic_attack_targeting" ||
    ui.mode === "effect_targeting" ||
    ui.mode === "effect_dir_pending" ||
    ui.mode === "effect_rotate_pending" ||
    ui.mode === "item_rotate_pending" ||
    ui.mode === "on_attack_rotate_pending"
  ) {
    actionPanel.appendChild(cancel());
    const hint = document.createElement("div");
    hint.className = "action-label";
    if (ui.mode === "hand_selected") hint.textContent = "召喚先のマスを選択";
    else if (
      ui.mode === "attack_targeting" ||
      ui.mode === "magic_attack_targeting"
    )
      hint.textContent = "攻撃対象を選択";
    else if (ui.mode === "on_attack_rotate_pending")
      hint.textContent = "向きを選択してください（オーバーレイ）";
    else if (ui.mode === "effect_dir_pending")
      hint.textContent = "向きを選択してください（オーバーレイ）";
    else if (
      ui.mode === "effect_rotate_pending" ||
      ui.mode === "item_rotate_pending"
    )
      hint.textContent = "回転方向を選択してください（オーバーレイ）";
    else
      hint.textContent =
        ui.itemHandIdx !== null
          ? "アイテム効果の対象を選択"
          : "効果の対象を選択";
    actionPanel.appendChild(hint);
  } else if (ui.mode === "ult_targeting") {
    actionPanel.appendChild(cancel());
    const hint = document.createElement("div");
    hint.className = "action-label";
    const ultName = ui.pendingCardId ? getCardName(ui.pendingCardId) : "ウルト";
    hint.textContent = `${ultName}のウルト: 対象を選択`;
    actionPanel.appendChild(hint);
  } else if (ui.mode === "ult_dir_pending") {
    const hint = document.createElement("div");
    hint.className = "action-label";
    hint.textContent = "向きを選択してください（オーバーレイ）";
    actionPanel.appendChild(hint);
  } else if (ui.mode === "element_swap_ally_pending") {
    actionPanel.appendChild(cancel());
    const hint = document.createElement("div");
    hint.className = "action-label";
    hint.textContent = "入れ替える盤面の味方を選択";
    actionPanel.appendChild(hint);
  } else if (ui.mode === "element_swap_hand_pending") {
    actionPanel.appendChild(cancel());
    const hint = document.createElement("div");
    hint.className = "action-label";
    hint.textContent = "入れ替える手札のキャラを選択（緑枠）";
    actionPanel.appendChild(hint);
  }

  return actionPanel;
}

function buildHandSection(
  state: GameState,
  ui: GameUiExtra,
  active: 0 | 1,
  opp: 0 | 1,
): HTMLElement {
  const handSection = document.createElement("div");
  handSection.className = "hand-section";

  const handTitle = document.createElement("h4");
  handTitle.innerHTML = `<span class="${active === 0 ? "p0-color" : "p1-color"}">P${active + 1}の手札</span>`;
  handSection.appendChild(handTitle);

  const handCards = document.createElement("div");
  handCards.className = "hand-cards";
  const isDiscardMode =
    ui.mode === "discard_pending" || ui.mode === "on_attack_discard_pending";
  const isElementSwapMode = ui.mode === "element_swap_hand_pending";
  const isSummonDone = ui.mode === "summon_done";

  const { online: isOnline, myPlayerIndex } = getState();
  const isMyTurn = !isOnline || myPlayerIndex === active;

  state.players[active].hand.forEach((cardId, idx) => {
    const cost = getCardCost(cardId);
    const isChar = isCharCard(cardId);
    const def = isChar ? getCharDef(cardId) : null;
    const reduction = def ? calcCostReduction(def, state.board, active) : 0;
    const effectiveCost = isChar ? Math.max(2, cost - reduction) : cost;
    const canAfford = state.players[active].mana >= effectiveCost;
    const isSelected = ui.mode === "hand_selected" && ui.summonHandIdx === idx;
    const isItemSel = ui.mode === "effect_targeting" && ui.itemHandIdx === idx;
    const isValidSwap = isElementSwapMode && ui.validCells.includes(idx);
    const cardEl = document.createElement("div");
    let cls = "hand-card";
    if (isSelected || isItemSel) cls += " selected";
    if (isSummonDone) cls += " disabled";
    if (!isDiscardMode && !isElementSwapMode && !isSummonDone && !canAfford)
      cls += " disabled";
    if (isElementSwapMode && !isValidSwap) cls += " disabled";
    cardEl.className = cls;

    if (isChar && def) {
      const kw = def.keywords.join(" ");
      const costDisplay =
        reduction > 0
          ? `コスト${effectiveCost}(${cost}→${effectiveCost})`
          : `コスト${cost}`;
      cardEl.innerHTML = `
        <div class="card-name">${getCardName(cardId)}</div>
        <div class="card-cost">${def.attribute} ${costDisplay}</div>
        <div class="card-stats">HP ${def.hp} / ATK ${def.atk}</div>
        ${kw ? `<div class="card-keywords">${kw}</div>` : ""}
        <div class="card-effect">${def.effect}</div>
      `;
    } else {
      const def = getItemDef(cardId);
      cardEl.innerHTML = `
        <div class="card-name">${getCardName(cardId)}</div>
        <div class="card-cost">【アイテム】 コスト${cost}</div>
        <div class="card-effect">${def?.effect ?? ""}</div>
      `;
    }
    addCardDetailListeners(cardEl, cardId);
    if (isElementSwapMode && isMyTurn && isValidSwap) {
      cardEl.style.borderColor = "#00cc66";
      cardEl.addEventListener("click", () => {
        if (_longPressActive) {
          _longPressActive = false;
          return;
        }
        hideCardDetail();
        doElementSwap(state, ui, idx);
      });
    } else if (isDiscardMode && isMyTurn) {
      cardEl.style.borderColor = "#ff6b6b";
      cardEl.addEventListener("click", () => {
        if (_longPressActive) {
          _longPressActive = false;
          return;
        }
        hideCardDetail();
        onDiscardCardClick(state, ui, idx);
      });
    } else if (!isElementSwapMode && !isSummonDone && canAfford && isMyTurn) {
      cardEl.addEventListener("click", () => {
        if (_longPressActive) {
          _longPressActive = false;
          return;
        }
        hideCardDetail();
        onHandCardClick(state, idx);
      });
    }
    handCards.appendChild(cardEl);
  });
  handSection.appendChild(handCards);

  const oppHandTitle = document.createElement("h4");
  oppHandTitle.innerHTML = `<span class="${opp === 0 ? "p0-color" : "p1-color"}">P${opp + 1}の手札</span>: ${state.players[opp].hand.length}枚`;
  handSection.appendChild(oppHandTitle);

  const oppHandCards = document.createElement("div");
  oppHandCards.className = "hand-cards";
  for (let i = 0; i < state.players[opp].hand.length; i++) {
    const back = document.createElement("div");
    back.className = "hand-back";
    back.textContent = "?";
    oppHandCards.appendChild(back);
  }
  handSection.appendChild(oppHandCards);
  return handSection;
}

function buildCell(
  state: GameState,
  ui: GameUiExtra,
  idx: CellIndex,
): HTMLElement {
  const char = state.board[idx];
  const attr = state.boardAttrs[idx] ?? "";
  const cell = document.createElement("div");

  let classes = "cell";
  if (char) classes += ` owner-${char.owner}`;
  if (ui.validCells.includes(idx) && ui.mode !== "element_swap_hand_pending") {
    classes +=
      ui.mode === "attack_targeting" || ui.mode === "magic_attack_targeting"
        ? " attack-target"
        : " valid";
  }
  if (ui.selectedBoardIdx === idx || ui.effectDirContext?.targetIdx === idx)
    classes += " selected";
  cell.className = classes;

  const attrEl = document.createElement("div");
  attrEl.className = "cell-attr";
  attrEl.textContent = attr;
  cell.appendChild(attrEl);

  if (char) {
    const charDiv = document.createElement("div");
    charDiv.className = "cell-char";
    const markers = markerStr(char);
    const dimmed = char.hasActed ? "opacity:0.6;" : "";
    charDiv.innerHTML = `
      <div class="char-dir" style="${dimmed}">${dirArrow(char.dir)}</div>
      <div class="char-name" style="${dimmed}">${getCardName(char.cardId)}</div>
      <div class="char-hp" style="${dimmed}">HP: ${char.hp}/${char.maxHp}</div>
      <div class="char-atk" style="${dimmed}">ATK: ${char.atk}</div>
      ${markers ? `<div class="char-markers">${markers}</div>` : ""}
    `;
    cell.appendChild(charDiv);
  }

  if (char) addCardDetailListeners(cell, char.cardId, char);

  const { online: cellOnline, myPlayerIndex: cellMyIdx } = getState();
  if (!cellOnline || state.active === cellMyIdx) {
    cell.addEventListener("click", () => {
      if (_longPressActive) {
        _longPressActive = false;
        return;
      }
      hideCardDetail();
      onCellClick(state, ui, idx);
    });
  }
  return cell;
}

function buildDirPickerOverlay(
  title: string,
  onPick: (dir: Direction) => void,
): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "dir-picker-overlay";
  const picker = document.createElement("div");
  picker.className = "dir-picker";
  picker.innerHTML = `<h3>${title}</h3>`;

  const grid = document.createElement("div");
  grid.className = "dir-grid";
  const positions = [
    null,
    { dir: 0 as Direction, label: "↑" },
    null,
    { dir: 3 as Direction, label: "←" },
    null,
    { dir: 1 as Direction, label: "→" },
    null,
    { dir: 2 as Direction, label: "↓" },
    null,
  ];
  positions.forEach((pos) => {
    const btn = document.createElement("div");
    btn.className = pos ? "dir-btn" : "dir-btn center";
    if (pos) {
      btn.textContent = pos.label;
      btn.addEventListener("click", () => onPick(pos.dir));
    }
    grid.appendChild(btn);
  });
  picker.appendChild(grid);

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn-secondary";
  cancelBtn.style.marginTop = "12px";
  cancelBtn.textContent = "キャンセル";
  cancelBtn.addEventListener("click", () =>
    setState({ gameUiExtra: resetGameUiExtra() }),
  );
  picker.appendChild(cancelBtn);

  overlay.appendChild(picker);
  return overlay;
}

function buildRotatePickerOverlay(
  title: string,
  onPick: (clockwise: boolean) => void,
): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "dir-picker-overlay";
  const picker = document.createElement("div");
  picker.className = "dir-picker";
  picker.innerHTML = `<h3>${title}</h3>`;

  const btns = document.createElement("div");
  btns.style.cssText =
    "display:flex;gap:12px;justify-content:center;margin-top:8px;";

  const rightBtn = document.createElement("button");
  rightBtn.className = "btn";
  rightBtn.textContent = "右90° →↻";
  rightBtn.addEventListener("click", () => onPick(true));

  const leftBtn = document.createElement("button");
  leftBtn.className = "btn";
  leftBtn.textContent = "←↺ 左90°";
  leftBtn.addEventListener("click", () => onPick(false));

  btns.appendChild(leftBtn);
  btns.appendChild(rightBtn);
  picker.appendChild(btns);

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn btn-secondary";
  cancelBtn.style.marginTop = "12px";
  cancelBtn.textContent = "キャンセル";
  cancelBtn.addEventListener("click", () =>
    setState({ gameUiExtra: resetGameUiExtra() }),
  );
  picker.appendChild(cancelBtn);

  overlay.appendChild(picker);
  return overlay;
}

// ============================================================
// Event handlers
// ============================================================

function onHandCardClick(state: GameState, handIdx: number): void {
  const active = state.active;
  const cardId = assertNonNull(state.players[active].hand[handIdx]);

  if (isCharCard(cardId)) {
    const def = getCharDef(cardId);
    const reduction = def ? calcCostReduction(def, state.board, active) : 0;
    const effectiveCost = Math.max(2, (def?.cost ?? 0) - reduction);
    if (state.players[active].mana < effectiveCost) return;
    const validCells = getValidSummonCells(state.board, active);
    setState({
      gameUiExtra: {
        ...getState().gameUiExtra,
        mode: "hand_selected",
        summonHandIdx: handIdx,
        validCells,
        selectedBoardIdx: null,
      },
    });
    return;
  }

  // Item card
  const itemDef = getItemDef(cardId);
  if (!itemDef) return;

  const cost = itemDef.cost;
  if (state.players[active].mana < cost) return;

  if (cardId === "item_element_swap") {
    const allAllies = state.board
      .map((c, i) => (c !== null && c.owner === active ? i : -1))
      .filter((i) => i >= 0) as CellIndex[];
    if (allAllies.length === 0) {
      addLog("味方がいません", "system");
      return;
    }
    setState({
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: "element_swap_ally_pending",
        validCells: allAllies,
        itemHandIdx: handIdx,
        pendingCardId: cardId,
      },
    });
    return;
  }

  // 対象選択不要なアイテムは即時発動
  const itemSpec = getItemSpec(cardId);
  if (!itemSpec || getFirstSelectTarget(itemSpec.clauses, "on_use") === null) {
    doApplyImmediateItem(state, handIdx, cardId);
    return;
  }

  // 対象選択が必要なアイテム
  const { validCells, hint } = getItemTargets(state, cardId, active);
  setState({
    gameUiExtra: {
      ...resetGameUiExtra(),
      mode: "effect_targeting",
      validCells,
      itemHandIdx: handIdx,
      pendingCardId: cardId,
    },
  });
  addLog(`アイテム効果: ${hint}`, "info");
}

function onCellClick(state: GameState, ui: GameUiExtra, idx: CellIndex): void {
  const active = state.active;

  if (ui.mode === "hand_selected") {
    if (!ui.validCells.includes(idx)) return;
    setState({
      gameUiExtra: {
        ...ui,
        mode: "summon_dir_pending",
        dirPickerCell: idx,
        validCells: [],
      },
    });
    return;
  }
  if (ui.mode === "attack_targeting") {
    if (!ui.validCells.includes(idx)) return;
    doAttack(state, ui, idx);
    return;
  }
  if (ui.mode === "magic_attack_targeting") {
    if (!ui.validCells.includes(idx)) return;
    doMagicSummonAttack(state, ui, idx);
    return;
  }
  if (ui.mode === "effect_targeting") {
    if (!ui.validCells.includes(idx)) return;
    if (ui.itemHandIdx !== null) {
      doResolveItemEffect(state, ui, idx);
    } else {
      doResolveEffect(state, ui, idx);
    }
    return;
  }
  if (ui.mode === "ult_targeting") {
    if (!ui.validCells.includes(idx)) return;
    onUltTargetClick(state, ui, idx);
    return;
  }
  if (ui.mode === "element_swap_ally_pending") {
    if (!ui.validCells.includes(idx)) return;
    onElementSwapAllyClick(state, ui, idx);
    return;
  }

  // 攻撃時コスト決定中はボードクリックを無視
  if (
    ui.mode === "on_attack_cost_pending" ||
    ui.mode === "on_attack_discard_pending"
  )
    return;

  const char = state.board[idx];
  if (char && char.owner === active) {
    setState({
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: "char_selected",
        selectedBoardIdx: idx,
      },
    });
    return;
  }
  setState({ gameUiExtra: resetGameUiExtra() });
}

function onAttackClick(state: GameState, ui: GameUiExtra): void {
  if (ui.selectedBoardIdx === null) return;
  const char = state.board[ui.selectedBoardIdx];
  if (!char) return;
  const def = getCharDef(char.cardId);
  if (!def) return;

  const opp = (1 - char.owner) as 0 | 1;
  let targetIdxs: CellIndex[];

  if (def.attack_cells === "all") {
    targetIdxs = state.board
      .map((c, i) => (c !== null && c.owner === opp ? i : -1))
      .filter((i) => i >= 0) as CellIndex[];
  } else if (def.attack_cells === null) {
    targetIdxs = [];
  } else {
    const cells = getAttackCells(
      ui.selectedBoardIdx,
      def.attack_cells,
      char.dir,
    );
    targetIdxs = (cells ?? []).filter((i) => {
      const c = state.board[i];
      return c != null && c.owner === opp;
    }) as CellIndex[];
  }

  setState({
    gameUiExtra: { ...ui, mode: "attack_targeting", validCells: targetIdxs },
  });
}

function onRotateClick(
  state: GameState,
  ui: GameUiExtra,
  newDir: Direction,
): void {
  if (ui.selectedBoardIdx === null) return;
  const char = state.board[ui.selectedBoardIdx];
  if (!char) return;
  const def = getCharDef(char.cardId);
  if (!def) return;

  const newBoard = [...state.board] as Board;
  newBoard[ui.selectedBoardIdx] = { ...char, dir: newDir, hasRotated: true };
  let newState = appendLog(
    { ...state, board: newBoard },
    `${getCardName(char.cardId)} が ${DIR_ARROWS[newDir]} を向いた`,
    "info",
  );
  newState = spendReactivationMana(
    newState,
    ui.selectedBoardIdx,
    def.reactivation_cost,
  );
  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
}

function onDirPicked(state: GameState, ui: GameUiExtra, dir: Direction): void {
  const cellIdx = ui.dirPickerCell;
  const handIdx = ui.summonHandIdx;
  if (cellIdx === null || handIdx === null) return;
  doSummon(state, handIdx, cellIdx, dir);
}

function onEffectDirPicked(
  state: GameState,
  ui: GameUiExtra,
  dir: Direction,
): void {
  const ctx = ui.effectDirContext;
  if (!ctx) return;
  const { cardId, summonIdx, targetIdx } = ctx;
  const active = state.active;

  const newBoard = [...state.board] as Board;
  const target = newBoard[targetIdx];
  if (!target) {
    setState({ gameUiExtra: resetGameUiExtra() });
    return;
  }

  newBoard[targetIdx] = { ...target, dir, hasRotated: true };
  let newState = appendLog(
    { ...state, board: newBoard },
    `${getCardName(target.cardId)} を ${DIR_ARROWS[dir]} に向けた`,
    "info",
  );

  newState = applyEffectAfterDir(newState, cardId, summonIdx, active);
  finalizeSummonTurn(newState, cardId, summonIdx);
}

function onEffectRotatePicked(
  state: GameState,
  ui: GameUiExtra,
  clockwise: boolean,
): void {
  const ctx = ui.effectRotateContext;
  if (!ctx) return;
  const { cardId, summonIdx, targetIdx } = ctx;
  const active = state.active;

  const newBoard = [...state.board] as Board;
  const target = newBoard[targetIdx];
  if (!target) {
    setState({ gameUiExtra: resetGameUiExtra() });
    return;
  }

  const newDir = clockwise
    ? (((target.dir + 1) % 4) as Direction)
    : (((target.dir + 3) % 4) as Direction);
  newBoard[targetIdx] = { ...target, dir: newDir };
  let newState = appendLog(
    { ...state, board: newBoard },
    `${getCardName(target.cardId)} を${clockwise ? "右" : "左"}90°回転させた`,
    "info",
  );

  newState = applyEffectAfterDir(newState, cardId, summonIdx, active);
  finalizeSummonTurn(newState, cardId, summonIdx);
}

function onItemRotatePicked(
  state: GameState,
  ui: GameUiExtra,
  clockwise: boolean,
): void {
  const ctx = ui.itemRotateContext;
  if (!ctx) return;
  const { cardId, targetIdx, handIdx } = ctx;
  const active = state.active;

  // Pay cost and discard item from hand
  const cost = getItemDef(cardId)?.cost ?? 0;
  const newHand = [...state.players[active].hand];
  newHand.splice(handIdx, 1);
  const newDiscard = [...state.players[active].discard, cardId];
  const ps = [...state.players] as typeof state.players;
  ps[active] = {
    ...ps[active],
    hand: newHand,
    discard: newDiscard,
    mana: ps[active].mana - cost,
  };
  let newState = { ...state, players: ps };

  const nb = [...newState.board] as Board;
  const target = nb[targetIdx];
  if (target) {
    const newDir = clockwise
      ? (((target.dir + 1) % 4) as Direction)
      : (((target.dir + 3) % 4) as Direction);
    nb[targetIdx] = { ...target, dir: newDir };
    newState = appendLog(
      { ...newState, board: nb },
      `${getCardName(target.cardId)} を${clockwise ? "右" : "左"}90°回転させた`,
      "info",
    );
  }

  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) {
    setState({ gameState: newState, screen: "over" });
    return;
  }
  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
}

function onDiscardCardClick(
  state: GameState,
  ui: GameUiExtra,
  handIdx: number,
): void {
  // On-attack discard flow
  if (ui.mode === "on_attack_discard_pending") {
    const attackCtx = ui.onAttackContext;
    if (!attackCtx) return;
    const active = state.active;
    const newHand = [...state.players[active].hand];
    const discarded = assertNonNull(newHand.splice(handIdx, 1)[0]);
    const newDiscard = [...state.players[active].discard, discarded];
    const ps = [...state.players] as typeof state.players;
    ps[active] = { ...ps[active], hand: newHand, discard: newDiscard };
    const ns = appendLog(
      { ...state, players: ps },
      `${getCardName(discarded)} を捨てた（攻撃時コスト）`,
      "info",
    );
    executeAttack(
      ns,
      attackCtx.attackerIdx,
      attackCtx.targetIdx,
      attackCtx.isSummonAttack,
      attackCtx.extraDamage,
      attackCtx.setPiercing,
      attackCtx.rotateAfterAttack,
    );
    return;
  }

  const ctx = ui.discardContext;
  if (!ctx) return;
  const { cardId, cellIdx, mandatory } = ctx;
  const active = state.active;

  // Discard the chosen card
  const newHand = [...state.players[active].hand];
  const discarded = assertNonNull(newHand.splice(handIdx, 1)[0]);
  const newDiscard = [...state.players[active].discard, discarded];
  const ps = [...state.players] as typeof state.players;
  ps[active] = { ...ps[active], hand: newHand, discard: newDiscard };
  let newState = appendLog(
    { ...state, players: ps },
    `${getCardName(discarded)} を捨てた`,
    "info",
  );

  // Ult discard flow (snipe_v2_09): proceed to enemy targeting
  if (ui.ultCasterIdx !== null) {
    const opp = (1 - active) as 0 | 1;
    const allEnemies = newState.board
      .map((c, i) => (c !== null && c.owner === opp ? i : -1))
      .filter((i) => i >= 0) as CellIndex[];
    newState = applyVictoryCheck(newState, null);
    if (newState.winner !== null) {
      setState({ gameState: newState, screen: "over" });
      return;
    }
    setState({
      gameState: newState,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: "ult_targeting",
        validCells: allEnemies,
        ultCasterIdx: ui.ultCasterIdx,
        pendingCardId: ui.pendingCardId,
      },
    });
    return;
  }

  // Apply the effect that required discard, then attack → end turn
  newState = applyDiscardEffect(newState, cardId, cellIdx, active, true);
  finalizeSummonTurn(newState, cardId, cellIdx);
  void mandatory;
}

function onDiscardSkip(state: GameState, ui: GameUiExtra): void {
  const ctx = ui.discardContext;
  if (!ctx) {
    setState({ gameUiExtra: resetGameUiExtra() });
    return;
  }
  if (ui.ultCasterIdx !== null) {
    // ウルトの捨て牌はスキップ不可（ultCasterIdx が入っている場合は何もしない）
    setState({ gameUiExtra: resetGameUiExtra() });
    return;
  }
  const { cardId, cellIdx } = ctx;
  const ns = appendLog(state, "スキップした", "info");
  finalizeSummonTurn(ns, cardId, cellIdx);
}

function onEndTurn(state: GameState): void {
  const active = state.active;
  let newState = endTurnCleanup(state);
  newState = applyVictoryCheck(newState, active);
  if (newState.winner !== null) {
    setState({ gameState: newState, screen: "over" });
    return;
  }

  newState = startTurnPhase(newState);
  newState = drawStep(newState);
  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) {
    setState({ gameState: newState, screen: "over" });
    return;
  }

  const { online } = getState();
  if (online) {
    // オンラインモード: パス画面不要。Firestore 経由で相手に通知
    setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
  } else {
    setState({
      gameState: newState,
      screen: "pass",
      passForPlayer: newState.active,
      gameUiExtra: resetGameUiExtra(),
    });
  }
}

// ============================================================
// Core game actions
// ============================================================

// 召喚時効果解決後に自動攻撃→VP→勝利チェック→ターン終了を行うヘルパー。
// スワップ等で召喚位置が変わる可能性があるため summonedOnTurn でキャラを探す。
function finalizeSummonTurn(
  state: GameState,
  cardId: string,
  fallbackSummonIdx: CellIndex,
): void {
  const active = state.active;
  const def = getCharDef(cardId);
  if (!def) {
    onEndTurn(state);
    return;
  }

  let summonIdx = state.board.findIndex(
    (c) => c !== null && c.owner === active && c.summonedOnTurn === state.turn,
  ) as CellIndex;
  if (summonIdx < 0) summonIdx = fallbackSummonIdx;

  // 魔法攻撃: 1体選んで攻撃する
  if (def.attack_cells === "all") {
    const opp = (1 - active) as 0 | 1;
    const enemies = state.board
      .map((c, i) => (c !== null && c.owner === opp ? i : -1))
      .filter((i) => i >= 0) as CellIndex[];
    if (enemies.length > 0) {
      setState({
        gameState: state,
        gameUiExtra: {
          ...resetGameUiExtra(),
          mode: "magic_attack_targeting",
          validCells: enemies,
          magicAttackContext: { cardId, summonIdx },
        },
      });
      return;
    }
    handleSummonDone(state);
    return;
  }

  const { board: boardAfterAtk, results } = resolveSummonAutoAttack(
    state.board,
    summonIdx,
    def,
    state.teamDR,
    (id) => {
      const d = getCharDef(id);
      return {
        cost: d?.cost ?? 1,
        attackCells: (d?.attack_cells ?? null) as
          | "all"
          | null
          | [number, number][],
        weaknessCells: (d?.weakness_cells ?? [[-1, 0]]) as [number, number][],
      };
    },
  );
  let newState = { ...state, board: boardAfterAtk };

  let vpGained = 0;
  let oppVpGained = 0;
  for (const { result } of results) {
    if (!result.blocked) {
      if (result.defenderDamage > 0)
        newState = appendLog(
          newState,
          `  → ${result.defenderDamage}ダメージ`,
          "damage",
        );
      if (result.vpAwarded > 0) {
        vpGained += result.vpAwarded;
        newState = appendLog(
          newState,
          `  → 撃破！ ${result.vpAwarded}VP`,
          "system",
        );
      }
    }
    if (result.counterDamage > 0)
      newState = appendLog(
        newState,
        `  ← 反撃 ${result.counterDamage}ダメージ`,
        "damage",
      );
    if (result.counterVpAwarded > 0) {
      oppVpGained += result.counterVpAwarded;
      newState = appendLog(
        newState,
        `  ← 撃破（反撃）！ ${result.counterVpAwarded}VP`,
        "system",
      );
    }
  }
  if (vpGained > 0) {
    const np = [...newState.players] as typeof newState.players;
    np[active] = { ...np[active], vp: np[active].vp + vpGained };
    newState = { ...newState, players: np };
  }
  if (oppVpGained > 0) {
    const opp = (1 - active) as 0 | 1;
    const np = [...newState.players] as typeof newState.players;
    np[opp] = { ...np[opp], vp: np[opp].vp + oppVpGained };
    newState = { ...newState, players: np };
  }

  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) {
    setState({ gameState: newState, screen: "over" });
    return;
  }
  handleSummonDone(newState);
}

function doSummon(
  state: GameState,
  handIdx: number,
  cellIdx: CellIndex,
  dir: Direction,
): void {
  const active = state.active;
  const cardId = assertNonNull(state.players[active].hand[handIdx]);
  const def = getCharDef(cardId);
  if (!def) return;

  const reduction = calcCostReduction(def, state.board, active);
  const effectiveCost = Math.max(2, def.cost - reduction);

  const cellAttr = state.boardAttrs[cellIdx] ?? "虚";
  const hpBonus = attributeHpBonus(def.attribute, cellAttr);
  let instance = createCharInstance(def, active, dir);
  const bonusedHp = Math.max(1, instance.hp + hpBonus);
  instance = {
    ...instance,
    hp: bonusedHp,
    maxHp: bonusedHp,
    summonedOnTurn: state.turn,
  };

  const newBoard = [...state.board] as Board;
  newBoard[cellIdx] = instance;
  const newHand = [...state.players[active].hand];
  newHand.splice(handIdx, 1);
  const ps = [...state.players] as typeof state.players;
  ps[active] = {
    ...ps[active],
    hand: newHand,
    mana: ps[active].mana - effectiveCost,
  };

  let newState = appendLog(
    { ...state, board: newBoard, players: ps },
    `P${active + 1}: ${def.name} を ${cellIdx + 1}番マスに召喚 (${DIR_ARROWS[dir]})` +
      (hpBonus !== 0 ? ` HP${hpBonus > 0 ? "+" : ""}${hpBonus}` : ""),
    "info",
  );

  // Auto effects (non-pending only)
  const effect = getSummonEffect(cardId);
  const r = applyAutoEffects(
    newState,
    cellIdx,
    active,
    effect.clauses,
    def.attribute,
  );
  newState = { ...newState, board: r.board, players: r.players };

  if (!effect.hasPending) {
    // pending効果なし: ルール通り「効果→自動攻撃→ターン終了」を即時完結
    finalizeSummonTurn(newState, cardId, cellIdx);
    return;
  }

  // pending効果あり: 自動攻撃はユーザー入力（効果解決）が完了してから実行する
  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) {
    setState({ gameState: newState, screen: "over" });
    return;
  }

  // コストとして手札を捨てるエフェクト → discard_pending フロー
  const discardCostClause = effect.clauses.find(
    (c) => c.trigger === "on_summon" && c.cost?.type === "discard",
  );
  if (discardCostClause) {
    setState({
      gameState: newState,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: "discard_pending",
        discardContext: {
          cardId,
          cellIdx,
          mandatory: discardCostClause.costMandatory ?? false,
        },
      },
    });
    return;
  }
  // ドロー後に強制捨て（draw を先に適用してから discard_pending へ）
  const drawThenDiscardClause = effect.clauses.find(
    (c) =>
      c.trigger === "on_summon" &&
      c.costMandatory &&
      c.effects.some((e) => e.type === "draw") &&
      c.effects.some((e) => e.type === "discard"),
  );
  if (drawThenDiscardClause) {
    for (const e of drawThenDiscardClause.effects.filter(
      (e) => e.type === "draw",
    )) {
      for (let i = 0; i < (e as { count: number }).count; i++)
        newState = drawStep(newState);
    }
    newState = appendLog(newState, "ドローした", "info");
    setState({
      gameState: newState,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: "discard_pending",
        discardContext: { cardId, cellIdx, mandatory: true },
      },
    });
    return;
  }

  // Target-selection effects
  const { validCells, hint } = getPendingTargets(newState, cardId, cellIdx);
  if (validCells.length === 0) {
    finalizeSummonTurn(newState, cardId, cellIdx);
    return;
  }
  newState = appendLog(newState, `効果: ${hint}`, "info");
  setState({
    gameState: newState,
    gameUiExtra: {
      ...resetGameUiExtra(),
      mode: "effect_targeting",
      validCells,
      pendingCardId: cardId,
      pendingCellIdx: cellIdx,
    },
  });
}

function doAttack(
  state: GameState,
  ui: GameUiExtra,
  targetIdx: CellIndex,
): void {
  const active = state.active;
  const attackerIdx = ui.selectedBoardIdx;
  if (attackerIdx === null) return;
  const attacker = state.board[attackerIdx];
  if (!attacker) return;

  const { extraDamage, setPiercing, rotateAfterAttack, hasOptionalCostClause } =
    computeOnAttackEffects(state, attackerIdx, targetIdx, active);

  if (hasOptionalCostClause) {
    setState({
      gameState: state,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: "on_attack_cost_pending",
        onAttackContext: {
          attackerIdx,
          targetIdx,
          isSummonAttack: false,
          extraDamage,
          setPiercing,
          rotateAfterAttack,
          costClauseActivated: false,
        },
      },
    });
    return;
  }

  executeAttack(
    state,
    attackerIdx,
    targetIdx,
    false,
    extraDamage,
    setPiercing,
    rotateAfterAttack,
  );
}

function doMagicSummonAttack(
  state: GameState,
  ui: GameUiExtra,
  targetIdx: CellIndex,
): void {
  const ctx = ui.magicAttackContext;
  if (!ctx) return;
  const active = state.active;

  let attackerIdx = state.board.findIndex(
    (c) => c !== null && c.owner === active && c.summonedOnTurn === state.turn,
  ) as CellIndex;
  if (attackerIdx < 0) attackerIdx = ctx.summonIdx;

  const { extraDamage, setPiercing, rotateAfterAttack, hasOptionalCostClause } =
    computeOnAttackEffects(state, attackerIdx, targetIdx, active);

  if (hasOptionalCostClause) {
    setState({
      gameState: state,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: "on_attack_cost_pending",
        onAttackContext: {
          attackerIdx,
          targetIdx,
          isSummonAttack: true,
          extraDamage,
          setPiercing,
          rotateAfterAttack,
          costClauseActivated: false,
        },
        magicAttackContext: ctx,
      },
    });
    return;
  }

  executeAttack(
    state,
    attackerIdx,
    targetIdx,
    true,
    extraDamage,
    setPiercing,
    rotateAfterAttack,
  );
}

function onOnAttackCostYes(state: GameState, ui: GameUiExtra): void {
  const ctx = ui.onAttackContext;
  if (!ctx) return;
  const { attackerIdx, targetIdx, isSummonAttack } = ctx;
  const active = state.active;
  const attacker = state.board[attackerIdx];
  if (!attacker) return;

  const spec = getEffectSpec(attacker.cardId);
  const optClause = spec.clauses.find(
    (c) => c.trigger === "on_attack" && c.cost && !c.costMandatory,
  );
  if (!optClause?.cost) {
    executeAttack(
      state,
      attackerIdx,
      targetIdx,
      isSummonAttack,
      ctx.extraDamage,
      ctx.setPiercing,
      ctx.rotateAfterAttack,
    );
    return;
  }

  let extraDamage = ctx.extraDamage;
  let setPiercing = ctx.setPiercing;
  const condOk =
    !optClause.condition ||
    evalOnAttackCond(
      optClause.condition,
      state,
      attackerIdx,
      targetIdx,
      active,
    );
  if (condOk) {
    for (const eff of optClause.effects) {
      if (eff.type === "extra_damage") extraDamage += eff.amount;
      else if (eff.type === "set_piercing") setPiercing = true;
    }
  }

  const updCtx = {
    ...ctx,
    extraDamage,
    setPiercing,
    costClauseActivated: true,
  };
  const cost = optClause.cost;

  if (cost.type === "self_damage") {
    const nb = [...state.board] as Board;
    const a = nb[attackerIdx];
    if (a) {
      const newHp = a.hp - cost.amount;
      nb[attackerIdx] = newHp <= 0 ? null : { ...a, hp: newHp };
    }
    const ns = appendLog(
      { ...state, board: nb },
      `攻撃時コスト: 自身${cost.amount}ダメージ`,
      "damage",
    );
    executeAttack(
      ns,
      attackerIdx,
      targetIdx,
      isSummonAttack,
      updCtx.extraDamage,
      updCtx.setPiercing,
      updCtx.rotateAfterAttack,
    );
  } else if (cost.type === "mana") {
    if (state.players[active].mana < cost.amount) {
      executeAttack(
        state,
        attackerIdx,
        targetIdx,
        isSummonAttack,
        ctx.extraDamage,
        ctx.setPiercing,
        ctx.rotateAfterAttack,
      );
      return;
    }
    const np = [...state.players] as typeof state.players;
    np[active] = { ...np[active], mana: np[active].mana - cost.amount };
    const ns = appendLog(
      { ...state, players: np },
      `攻撃時コスト: マナ${cost.amount}消費`,
      "info",
    );
    executeAttack(
      ns,
      attackerIdx,
      targetIdx,
      isSummonAttack,
      updCtx.extraDamage,
      updCtx.setPiercing,
      updCtx.rotateAfterAttack,
    );
  } else if (cost.type === "discard") {
    if (state.players[active].hand.length === 0) {
      executeAttack(
        state,
        attackerIdx,
        targetIdx,
        isSummonAttack,
        ctx.extraDamage,
        ctx.setPiercing,
        ctx.rotateAfterAttack,
      );
      return;
    }
    setState({
      gameState: state,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: "on_attack_discard_pending",
        onAttackContext: updCtx,
        magicAttackContext: ui.magicAttackContext,
      },
    });
  } else if (cost.type === "self_damage_and_discard") {
    const nb = [...state.board] as Board;
    const a = nb[attackerIdx];
    let ns = state;
    if (a) {
      const newHp = a.hp - cost.damage;
      nb[attackerIdx] = newHp <= 0 ? null : { ...a, hp: newHp };
      ns = appendLog(
        { ...state, board: nb },
        `攻撃時コスト: 自身${cost.damage}ダメージ`,
        "damage",
      );
    }
    if (ns.players[active].hand.length === 0) {
      executeAttack(
        ns,
        attackerIdx,
        targetIdx,
        isSummonAttack,
        ctx.extraDamage,
        ctx.setPiercing,
        ctx.rotateAfterAttack,
      );
      return;
    }
    setState({
      gameState: ns,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: "on_attack_discard_pending",
        onAttackContext: updCtx,
        magicAttackContext: ui.magicAttackContext,
      },
    });
  }
}

function onOnAttackCostNo(state: GameState, ui: GameUiExtra): void {
  const ctx = ui.onAttackContext;
  if (!ctx) return;
  executeAttack(
    state,
    ctx.attackerIdx,
    ctx.targetIdx,
    ctx.isSummonAttack,
    ctx.extraDamage,
    ctx.setPiercing,
    ctx.rotateAfterAttack,
  );
}

function onOnAttackRotatePicked(
  state: GameState,
  ui: GameUiExtra,
  dir: Direction,
): void {
  const ctx = ui.onAttackContext;
  if (!ctx) return;
  const { targetIdx, isSummonAttack } = ctx;

  const nb = [...state.board] as Board;
  const target = nb[targetIdx];
  if (!target) {
    if (isSummonAttack) handleSummonDone(state);
    else setState({ gameState: state, gameUiExtra: resetGameUiExtra() });
    return;
  }

  nb[targetIdx] = { ...target, dir };
  const ns = appendLog(
    { ...state, board: nb },
    `攻撃時効果: ${getCardName(target.cardId)} を ${DIR_ARROWS[dir]} に向けた`,
    "info",
  );
  const checked = applyVictoryCheck(ns, null);
  if (checked.winner !== null) {
    setState({ gameState: checked, screen: "over" });
    return;
  }
  if (isSummonAttack) {
    handleSummonDone(checked);
  } else {
    setState({ gameState: checked, gameUiExtra: resetGameUiExtra() });
  }
}

function doResolveEffect(
  state: GameState,
  ui: GameUiExtra,
  targetIdx: CellIndex,
): void {
  const cardId = ui.pendingCardId;
  const summonIdx = ui.pendingCellIdx;
  if (!cardId || summonIdx === null) {
    setState({ gameUiExtra: resetGameUiExtra() });
    return;
  }

  const active = state.active;

  // on_summon に rotate degrees:'any' があれば対象選択後に方向選択へ
  const needsDirPick = getEffectSpec(cardId).clauses.some(
    (c) =>
      c.trigger === "on_summon" &&
      c.effects.some(
        (e) =>
          e.type === "rotate" && (e as { degrees: unknown }).degrees === "any",
      ),
  );
  if (needsDirPick) {
    setState({
      gameState: state,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: "effect_dir_pending",
        effectDirContext: { cardId, summonIdx, targetIdx },
      },
    });
    return;
  }

  // on_summon に rotate degrees:'either' があれば左右90°選択へ
  const needsRotatePick = getEffectSpec(cardId).clauses.some(
    (c) =>
      c.trigger === "on_summon" &&
      c.effects.some(
        (e) =>
          e.type === "rotate" &&
          (e as { degrees: unknown }).degrees === "either",
      ),
  );
  if (needsRotatePick) {
    setState({
      gameState: state,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: "effect_rotate_pending",
        effectRotateContext: { cardId, summonIdx, targetIdx },
      },
    });
    return;
  }

  const newState = applyPendingEffect(
    state,
    cardId,
    summonIdx,
    targetIdx,
    active,
  );
  finalizeSummonTurn(newState, cardId, summonIdx);
}

function doResolveItemEffect(
  state: GameState,
  ui: GameUiExtra,
  targetIdx: CellIndex,
): void {
  const cardId = ui.pendingCardId;
  const handIdx = ui.itemHandIdx;
  if (!cardId || handIdx === null) {
    setState({ gameUiExtra: resetGameUiExtra() });
    return;
  }

  // item に rotate degrees:'either' があれば左右90°選択へ（コスト支払いは方向確定後）
  const itemSpec = getItemSpec(cardId);
  const needsRotatePick =
    itemSpec?.clauses.some(
      (c) =>
        c.trigger === "on_use" &&
        c.effects.some(
          (e) =>
            e.type === "rotate" &&
            (e as { degrees: unknown }).degrees === "either",
        ),
    ) ?? false;
  if (needsRotatePick) {
    setState({
      gameState: state,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: "item_rotate_pending",
        itemRotateContext: { cardId, targetIdx, handIdx },
      },
    });
    return;
  }

  const active = state.active;

  // Pay cost and discard item from hand
  const cost = getItemDef(cardId)?.cost ?? 0;
  const newHand = [...state.players[active].hand];
  newHand.splice(handIdx, 1);
  const newDiscard = [...state.players[active].discard, cardId];
  const ps = [...state.players] as typeof state.players;
  ps[active] = {
    ...ps[active],
    hand: newHand,
    discard: newDiscard,
    mana: ps[active].mana - cost,
  };
  let newState = { ...state, players: ps };

  newState = applyItemEffect(newState, cardId, targetIdx, active);
  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) {
    setState({ gameState: newState, screen: "over" });
    return;
  }
  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
}

// ============================================================
// Immediate item (no target)
// ============================================================

function doApplyImmediateItem(
  state: GameState,
  handIdx: number,
  cardId: string,
): void {
  const active = state.active;
  const cost = getItemDef(cardId)?.cost ?? 0;
  const newHand = [...state.players[active].hand];
  newHand.splice(handIdx, 1);
  const newDiscard = [...state.players[active].discard, cardId];
  const ps = [...state.players] as typeof state.players;
  ps[active] = {
    ...ps[active],
    hand: newHand,
    discard: newDiscard,
    mana: ps[active].mana - cost,
  };
  const newState = applyItemEffect(
    { ...state, players: ps },
    cardId,
    undefined,
    active,
  );
  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
}

// ============================================================
// Effect application
// ============================================================

function getPendingTargets(
  state: GameState,
  cardId: string,
  summonIdx: CellIndex,
): { validCells: CellIndex[]; hint: string } {
  const spec = getEffectSpec(cardId);
  const target = getFirstSelectTarget(spec.clauses, "on_summon");
  if (!target) return { validCells: [], hint: "" };
  const validCells = resolveSelectCells(
    target,
    state.board,
    state.active,
    summonIdx,
  );
  return { validCells, hint: TARGET_HINT[target] ?? "対象を選択" };
}

function getItemTargets(
  state: GameState,
  itemId: string,
  active: 0 | 1,
): { validCells: CellIndex[]; hint: string } {
  const spec = getItemSpec(itemId);
  if (!spec) return { validCells: [], hint: "" };
  const clause = spec.clauses.find((c) => c.trigger === "on_use");
  if (!clause) return { validCells: [], hint: "" };

  for (const atom of clause.effects) {
    if (!("target" in atom)) continue;
    const target = (atom as { target: EffectTarget }).target;
    if (
      ![
        "select_ally",
        "select_adj_ally",
        "select_enemy",
        "select_adj_enemy",
        "select_any",
      ].includes(target)
    )
      continue;
    let cells = resolveSelectCells(target, state.board, active);
    // bounce の maxCost 制約をアトムから読む
    if (atom.type === "bounce" && "maxCost" in atom) {
      const maxCost = (atom as { maxCost?: number }).maxCost;
      if (maxCost !== undefined) {
        cells = cells.filter((i) => {
          const c = state.board[i];
          return c != null && (getCharDef(c.cardId)?.cost ?? 99) <= maxCost;
        });
      }
    }
    return { validCells: cells, hint: TARGET_HINT[target] ?? "対象を選択" };
  }
  return { validCells: [], hint: "" };
}

// ============================================================
// Ult handlers
// ============================================================

function onUltClick(state: GameState, ui: GameUiExtra): void {
  const casterIdx = ui.selectedBoardIdx;
  if (casterIdx === null) return;
  const caster = state.board[casterIdx];
  if (!caster) return;
  const spec = getUltSpec(caster.cardId);
  if (!spec) return;
  const active = state.active;

  // Spend VP, mark used
  const np = [...state.players] as typeof state.players;
  np[active] = { ...np[active], vp: np[active].vp - spec.vpCost };
  const nb = [...state.board] as Board;
  nb[casterIdx] = { ...caster, ultUsed: true };
  let newState = appendLog(
    { ...state, board: nb, players: np },
    `${getCardName(caster.cardId)} がウルト発動！（${spec.vpCost}VP消費）`,
    "system",
  );

  const clause = spec.clauses.find((c) => c.trigger === "on_ult_activate");
  if (!clause) {
    setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
    return;
  }

  // 必須コスト: 手札捨て → discard_pending フローへ
  if (clause.cost?.type === "discard" && clause.costMandatory) {
    setState({
      gameState: newState,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: "discard_pending",
        discardContext: {
          cardId: caster.cardId,
          cellIdx: casterIdx,
          mandatory: true,
        },
        ultCasterIdx: casterIdx,
        pendingCardId: caster.cardId,
      },
    });
    return;
  }

  // 必須コスト: 自傷ダメージ → 即時適用してから対象選択へ
  if (clause.cost?.type === "self_damage" && clause.costMandatory) {
    const amount = clause.cost.amount;
    const updCaster = newState.board[casterIdx];
    if (updCaster) {
      const nb2 = [...newState.board] as Board;
      const newHp = updCaster.hp - amount;
      nb2[casterIdx] = newHp <= 0 ? null : { ...updCaster, hp: newHp };
      newState = appendLog(
        { ...newState, board: nb2 },
        `自身に${amount}ダメ（ウルトコスト）`,
        "damage",
      );
    }
  }

  // 対象選択が必要か UltSpec から判定
  const selectTarget = getFirstSelectTarget(spec.clauses, "on_ult_activate");
  if (selectTarget) {
    const validCells = resolveSelectCells(
      selectTarget,
      newState.board,
      active,
      casterIdx,
    );
    setState({
      gameState: newState,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: "ult_targeting",
        validCells,
        ultCasterIdx: casterIdx,
        pendingCardId: caster.cardId,
      },
    });
    return;
  }

  // 直接効果（対象選択なし）
  newState = applyUltDirectEffect(newState, casterIdx, active);
  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) {
    setState({ gameState: newState, screen: "over" });
    return;
  }
  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
}

function onUltTargetClick(
  state: GameState,
  ui: GameUiExtra,
  targetIdx: CellIndex,
): void {
  const casterIdx = ui.ultCasterIdx;
  if (casterIdx === null) return;
  const casterCardId = ui.pendingCardId ?? state.board[casterIdx]?.cardId;
  if (!casterCardId) return;
  const active = state.active;

  const { newState: afterEffect, continueToDir } = applyUltTargetEffect(
    state,
    casterIdx,
    casterCardId,
    targetIdx,
    active,
  );

  if (continueToDir) {
    const checked = applyVictoryCheck(afterEffect, null);
    if (checked.winner !== null) {
      setState({ gameState: checked, screen: "over" });
      return;
    }
    setState({
      gameState: checked,
      gameUiExtra: {
        ...resetGameUiExtra(),
        mode: "ult_dir_pending",
        pendingCellIdx: casterIdx,
        ultCasterIdx: casterIdx,
      },
    });
    return;
  }

  const newState = applyVictoryCheck(afterEffect, null);
  if (newState.winner !== null) {
    setState({ gameState: newState, screen: "over" });
    return;
  }
  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
}

function onUltDirPicked(
  state: GameState,
  ui: GameUiExtra,
  dir: Direction,
): void {
  const targetCellIdx = ui.pendingCellIdx;
  if (targetCellIdx === null) {
    setState({ gameUiExtra: resetGameUiExtra() });
    return;
  }
  const nb = [...state.board] as Board;
  const unit = nb[targetCellIdx];
  if (!unit) {
    setState({ gameUiExtra: resetGameUiExtra() });
    return;
  }
  nb[targetCellIdx] = { ...unit, dir };
  const newState = appendLog(
    { ...state, board: nb },
    `${getCardName(unit.cardId)} を ${DIR_ARROWS[dir]} に向けた`,
    "info",
  );
  const checked = applyVictoryCheck(newState, null);
  if (checked.winner !== null) {
    setState({ gameState: checked, screen: "over" });
    return;
  }
  setState({ gameState: checked, gameUiExtra: resetGameUiExtra() });
}

// ============================================================
// Element swap (item_element_swap)
// ============================================================

function onElementSwapAllyClick(
  state: GameState,
  ui: GameUiExtra,
  boardIdx: CellIndex,
): void {
  const handIdx = ui.itemHandIdx;
  if (handIdx === null) return;
  const active = state.active;
  const boardChar = state.board[boardIdx];
  if (!boardChar) return;
  const boardCharDef = getCharDef(boardChar.cardId);
  if (!boardCharDef) return;
  const boardAttr = boardCharDef.attribute;

  const matchingHandIdxs = state.players[active].hand
    .map((cId, i) => {
      if (!isCharCard(cId)) return -1;
      const def = getCharDef(cId);
      return def && def.attribute === boardAttr ? i : -1;
    })
    .filter((i) => i >= 0) as number[];

  if (matchingHandIdxs.length === 0) {
    addLog(`同属性（${boardAttr}）の手札キャラがいません`, "system");
    setState({ gameUiExtra: resetGameUiExtra() });
    return;
  }

  setState({
    gameUiExtra: {
      ...resetGameUiExtra(),
      mode: "element_swap_hand_pending",
      validCells: matchingHandIdxs as CellIndex[],
      itemHandIdx: handIdx,
      pendingCardId: "item_element_swap",
      pendingCellIdx: boardIdx,
      elementSwapBoardIdx: boardIdx,
    },
  });
  addLog(`同属性（${boardAttr}）の手札キャラを選択してください`, "info");
}

function doElementSwap(
  state: GameState,
  ui: GameUiExtra,
  swapHandIdx: number,
): void {
  const itemHandIdx = ui.itemHandIdx;
  const boardIdx = ui.elementSwapBoardIdx ?? ui.pendingCellIdx;
  if (itemHandIdx === null || boardIdx === null) {
    setState({ gameUiExtra: resetGameUiExtra() });
    return;
  }
  const active = state.active;

  const boardChar = state.board[boardIdx];
  if (!boardChar) {
    setState({ gameUiExtra: resetGameUiExtra() });
    return;
  }

  const newHand = [...state.players[active].hand];
  const itemCard = assertNonNull(newHand.splice(itemHandIdx, 1)[0]);
  const newDiscard = [...state.players[active].discard, itemCard];

  // Adjust swapHandIdx after item removal
  const adjustedSwapIdx =
    swapHandIdx > itemHandIdx ? swapHandIdx - 1 : swapHandIdx;
  const swapCardId = assertNonNull(newHand[adjustedSwapIdx]);
  newHand.splice(adjustedSwapIdx, 1);
  newHand.push(boardChar.cardId);

  const cost = getItemDef(itemCard)?.cost ?? 0;
  const ps = [...state.players] as typeof state.players;
  ps[active] = {
    ...ps[active],
    hand: newHand,
    discard: newDiscard,
    mana: ps[active].mana - cost,
  };

  const swapDef = getCharDef(swapCardId);
  if (!swapDef) {
    setState({ gameUiExtra: resetGameUiExtra() });
    return;
  }
  const newInstance = {
    ...createCharInstance(swapDef, active, boardChar.dir),
    summonedOnTurn: state.turn,
  };
  const newBoard = [...state.board] as Board;
  newBoard[boardIdx] = newInstance;

  let newState = appendLog(
    { ...state, board: newBoard, players: ps },
    `${getCardName(boardChar.cardId)} と ${getCardName(swapCardId)} を入れ替えた`,
    "info",
  );
  newState = applyVictoryCheck(newState, null);
  if (newState.winner !== null) {
    setState({ gameState: newState, screen: "over" });
    return;
  }
  setState({ gameState: newState, gameUiExtra: resetGameUiExtra() });
}

// ============================================================
// Utility helpers
// ============================================================

function applyVictoryCheck(
  state: GameState,
  endOfTurnPlayer: 0 | 1 | null,
): GameState {
  const winner = evalVictory(state, endOfTurnPlayer);
  if (winner === null) return state;
  let reason: string;
  if (winner === -1) reason = "引き分け（時間切れ）";
  else if (endOfTurnPlayer !== null)
    reason = `P${endOfTurnPlayer + 1}が5マス支配`;
  else reason = `P${winner + 1}がVP15達成`;
  return { ...state, winner, winReason: reason };
}

function addLog(
  text: string,
  type: "system" | "damage" | "heal" | "info",
): void {
  const { gameState } = getState();
  if (!gameState) return;
  setState({ gameState: appendLog(gameState, text, type) });
}
