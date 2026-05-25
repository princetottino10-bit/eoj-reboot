import { CARD_DB, FACTION_NAMES, FACTIONS } from "../data/cards.js";
import { createDraftState, makePick } from "../engine/draft.js";
import { createInitialGameState } from "../engine/gamestate.js";
import { drawStep, startTurnPhase } from "../engine/turn.js";
import { getState, resetGameUiExtra, setState } from "./app.js";

export interface DraftUiState {
  step: "faction" | "item";
  pickIndex: number; // 0-5 (4 faction picks, 2 item picks)
  p0Factions: string[];
  p1Factions: string[];
  p0Item: string;
  p1Item: string;
  hoveredFaction: string | null;
  hoveredItem: string | null;
}

// Draft order: P0→P1→P1→P0 (factions), P0→P1 (items)
const DRAFT_ORDER = [0, 1, 1, 0, 0, 1] as const;
const ITEM_SETS = ["A", "B", "C", "D"];

function currentPicker(ui: DraftUiState): 0 | 1 {
  return DRAFT_ORDER[ui.pickIndex] as 0 | 1;
}

function getAllPickedFactions(ui: DraftUiState): string[] {
  return [...ui.p0Factions, ...ui.p1Factions];
}

export function renderDraft(ui: DraftUiState): HTMLElement {
  const div = document.createElement("div");
  div.className = "screen-draft";

  const { online, myPlayerIndex } = getState();
  const picker = currentPicker(ui);
  const isMyTurn = !online || myPlayerIndex === picker;
  const isItemPhase = ui.pickIndex >= 4;
  const pickerLabel = `プレイヤー${picker + 1}`;
  const pickerClass = picker === 0 ? "p0-color" : "p1-color";

  // Summary of picks so far
  let summaryHtml = "";
  if (
    ui.p0Factions.length > 0 ||
    ui.p1Factions.length > 0 ||
    ui.p0Item ||
    ui.p1Item
  ) {
    summaryHtml = `<div class="draft-picks">`;
    if (ui.p0Factions.length > 0) {
      summaryHtml += `<div class="pick-row"><span class="pick-label p0-color">P1の派閥:</span><span class="pick-val">${ui.p0Factions.map((f) => FACTION_NAMES[f] ?? f).join(" / ")}</span></div>`;
    }
    if (ui.p1Factions.length > 0) {
      summaryHtml += `<div class="pick-row"><span class="pick-label p1-color">P2の派閥:</span><span class="pick-val">${ui.p1Factions.map((f) => FACTION_NAMES[f] ?? f).join(" / ")}</span></div>`;
    }
    if (ui.p0Item) {
      summaryHtml += `<div class="pick-row"><span class="pick-label p0-color">P1のアイテムセット:</span><span class="pick-val">セット${ui.p0Item}</span></div>`;
    }
    if (ui.p1Item) {
      summaryHtml += `<div class="pick-row"><span class="pick-label p1-color">P2のアイテムセット:</span><span class="pick-val">セット${ui.p1Item}</span></div>`;
    }
    summaryHtml += `</div>`;
  }

  let stepHtml = "";
  if (!isItemPhase) {
    const pickedFactions = getAllPickedFactions(ui);
    const myFactions = picker === 0 ? ui.p0Factions : ui.p1Factions;
    const pickNum = myFactions.length === 0 ? "1つ目" : "2つ目";

    stepHtml = `
      <div class="draft-step">
        <h3><span class="${pickerClass}">${pickerLabel}</span> の派閥選択（${pickNum}）</h3>
        <div class="faction-grid" id="faction-grid">
          ${FACTIONS.map((f) => {
            const isPicked =
              pickedFactions.includes(f) && !myFactions.includes(f);
            const isMyPick = myFactions.includes(f);
            const cls = isPicked ? "picked" : isMyPick ? "disabled" : "";
            return `<div class="faction-card ${cls}" data-faction="${f}">
              <div class="faction-name-jp">${FACTION_NAMES[f] ?? f}</div>
              <div class="faction-name-en">${f}</div>
            </div>`;
          }).join("")}
        </div>
      </div>
    `;
  } else {
    const myItem = picker === 0 ? ui.p0Item : ui.p1Item;
    const oppItem = picker === 0 ? ui.p1Item : ui.p0Item;

    stepHtml = `
      <div class="draft-step">
        <h3><span class="${pickerClass}">${pickerLabel}</span> のアイテムセット選択</h3>
        <div class="item-grid" id="item-grid">
          ${ITEM_SETS.map((s) => {
            const isPicked = oppItem === s;
            const isMyPick = myItem === s;
            const cls = isPicked ? "picked" : isMyPick ? "selected" : "";
            return `<div class="item-set-card ${cls}" data-item="${s}">
              <div style="font-size:1.2rem;font-weight:bold;">セット${s}</div>
            </div>`;
          }).join("")}
        </div>
      </div>
    `;
  }

  const waitingBanner = !isMyTurn
    ? `<div class="waiting-banner">P${picker + 1}が選択中...</div>`
    : "";

  div.innerHTML = `
    <h2>ドラフト</h2>
    ${waitingBanner}
    ${summaryHtml}
    ${stepHtml}
  `;

  if (!isMyTurn) return div; // 相手のターン中はクリック無効

  // Faction click handlers
  const factionGrid = div.querySelector("#faction-grid");
  if (factionGrid) {
    factionGrid
      .querySelectorAll<HTMLElement>(".faction-card")
      .forEach((card) => {
        if (
          card.classList.contains("picked") ||
          card.classList.contains("disabled")
        )
          return;
        card.addEventListener("click", () => {
          const faction = card.dataset.faction!;
          handleFactionPick(faction);
        });
      });
  }

  // Item click handlers
  const itemGrid = div.querySelector("#item-grid");
  if (itemGrid) {
    itemGrid.querySelectorAll<HTMLElement>(".item-set-card").forEach((card) => {
      if (card.classList.contains("picked")) return;
      card.addEventListener("click", () => {
        const item = card.dataset.item!;
        handleItemPick(item);
      });
    });
  }

  return div;
}

function handleFactionPick(faction: string): void {
  const { draftUi } = getState();
  const picker = currentPicker(draftUi);
  let newUi = { ...draftUi };

  if (picker === 0) {
    newUi = { ...newUi, p0Factions: [...draftUi.p0Factions, faction] };
  } else {
    newUi = { ...newUi, p1Factions: [...draftUi.p1Factions, faction] };
  }
  newUi = { ...newUi, pickIndex: draftUi.pickIndex + 1 };

  if (newUi.pickIndex === 4) {
    newUi = { ...newUi, step: "item" };
  }

  setState({ draftUi: newUi });
}

function handleItemPick(item: string): void {
  const { draftUi } = getState();
  const picker = currentPicker(draftUi);
  let newUi = { ...draftUi };

  if (picker === 0) {
    newUi = { ...newUi, p0Item: item };
  } else {
    newUi = { ...newUi, p1Item: item };
  }
  newUi = { ...newUi, pickIndex: draftUi.pickIndex + 1 };

  // Draft complete
  if (newUi.pickIndex === 6) {
    startGame(newUi);
    return;
  }

  setState({ draftUi: newUi });
}

function startGame(ui: DraftUiState): void {
  let draft = createDraftState();
  draft = makePick(draft, ui.p0Factions[0]!);
  draft = makePick(draft, ui.p1Factions[0]!);
  draft = makePick(draft, ui.p1Factions[1]!);
  draft = makePick(draft, ui.p0Factions[1]!);
  draft = makePick(draft, ui.p0Item);
  draft = makePick(draft, ui.p1Item);

  let gameState = createInitialGameState(draft, CARD_DB);
  gameState = startTurnPhase(gameState);
  gameState = drawStep(gameState);

  const { online } = getState();
  if (online) {
    // オンラインモード: パス画面不要、直接ゲームへ
    setState({ screen: "game", gameState, gameUiExtra: resetGameUiExtra() });
  } else {
    setState({
      screen: "pass",
      gameState,
      passForPlayer: gameState.active,
      gameUiExtra: resetGameUiExtra(),
    });
  }
}
