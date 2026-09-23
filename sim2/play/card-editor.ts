// The settings panel's カード section: a table of every card (numbers edited
// in place, a check box to pick cards), a bar that changes the picked cards
// all at once, and an editor for one card with a live preview and a 5x5 grid
// to paint its attack range, blind spots and gap. The panel owns the working
// copy; this module renders it and turns clicks into new CardOverrides.
import {
  ATTACK_TYPE_LABELS,
  ATTR_LABELS,
  canEditShape,
  CARD_STATS,
  cardChangeCount,
  cellsText,
  cellWord,
  editableStats,
  editedCard,
  normalizeCardOverrides,
  applyCardOverrides,
  RANGE_REACH,
  statMin,
} from "../src/card-overrides.ts";
import type { CardEdit, CardOverrides, CardStatKey } from "../src/card-overrides.ts";
import { bulkStat, cellState, copyShape, costCounts, noChips, paintCell, resetCards, selectByChips, selectCards, setShape } from "../src/card-edits.ts";
import type { CardChips, CardFilter, RangeTool } from "../src/card-edits.ts";
import type { CardPack } from "../src/cards.ts";
import { makeCtx } from "../src/state.ts";
import type { AttackType, Attr, Config } from "../src/types.ts";
import { cardFaceHtml, counterCellsOf, esc, rangeSvg } from "./cards-view.ts";
import { mark } from "./marks.ts";

/** bulkOpen: the まとめて変更 bar is expanded (collapsed by default so the table and editor get the height). */
export type CardUi = { focus: string; selected: Set<string>; tool: RangeTool; chips: CardChips; bulkOpen: boolean };

export type CardWork = { printed: CardPack; cards: CardOverrides; cfg: Config; packName: string; locked: boolean };

export const initialCardUi = (printed: CardPack): CardUi => ({
  focus: (printed.cards.find((c) => c.kind === "shikigami") ?? printed.cards[0])?.id ?? "",
  selected: new Set(),
  tool: "attack",
  chips: noChips(),
  bulkOpen: false,
});

const TOOLS: readonly { id: RangeTool; label: string }[] = [
  { id: "attack", label: "攻撃" },
  { id: "blind", label: "死角" },
  { id: "gap", label: "隙" },
  { id: "erase", label: "消す" },
];

const CELL_WORD: Record<string, string> = { self: "自分", gap: "攻撃範囲・隙", attack: "攻撃範囲", blind: "死角", empty: "なし" };

const dis = (b: boolean): string => (b ? "disabled" : "");

// ------------------------------------------------------------------- html

/** A stat's column head: its short word, or for 霊力価 the print kit's flame (named for screen readers and in the tooltip). */
const statHead = (s: (typeof CARD_STATS)[number]): string =>
  s.key === "manaValue"
    ? `<th scope="col" class="ce-th-flame" title="${esc(s.label)}: ${esc(s.desc)}">${mark("flame", "ce-flame", s.label)}</th>`
    : `<th scope="col" title="${esc(s.desc)}">${esc(s.short)}</th>`;

/** A stat's name in the bulk bar; 霊力価 leads with its flame. */
const statLabel = (s: (typeof CARD_STATS)[number]): string =>
  `${s.key === "manaValue" ? mark("flame", "ce-flame") : ""}${esc(s.label)}`;

const tableHtml = (w: CardWork, ui: CardUi, cards: CardOverrides): string => {
  const head = CARD_STATS.map(statHead).join("");
  const rows = w.printed.cards
    .map((base) => {
      const card = editedCard(base, cards[base.id]);
      const edits = editableStats(base);
      const shapeMod = ["attribute", "attackType", "aoe", "attackRange", "blindSpots", "gapCell"].some((k) => cards[base.id]?.[k as keyof CardEdit] !== undefined);
      const cells = CARD_STATS.map((s) => {
        if (!edits.includes(s.key)) return `<td class="na">—</td>`;
        const v = card[s.key];
        const mod = v !== base[s.key];
        return `<td class="${mod ? "is-mod" : ""}"><input type="number" name="card.${esc(base.id)}.${s.key}" value="${v}" min="${statMin(base, s)}" max="${s.max}" ${dis(w.locked)} aria-label="${esc(base.nameJa)}の${esc(s.label)}" title="${mod ? `元の値 ${base[s.key]}` : esc(s.label)}"></td>`;
      }).join("");
      const mini =
        base.kind === "reigu"
          ? '<i class="sp-reigu">霊具</i>'
          : `<span class="ce-mini${shapeMod ? " is-mod" : ""}">${rangeSvg(card.attackRange, card.blindSpots, card.aoe ? (card.gapCell ?? null) : null, 0, { counter: counterCellsOf(w.cfg, card), aoe: card.aoe })}</span>`;
      const focus = base.id === ui.focus;
      return `<tr class="${focus ? "is-focus" : ""}">
        <td class="ce-check"><input type="checkbox" name="sel.${esc(base.id)}" ${ui.selected.has(base.id) ? "checked" : ""} ${dis(w.locked)} aria-label="${esc(base.nameJa)}を選ぶ"></td>
        <th scope="row"><button type="button" class="ce-name" data-focus="${esc(base.id)}" aria-pressed="${focus}"><span class="sp-card-id">${esc(base.id)}</span>${esc(base.nameJa)}</button></th>
        ${cells}<td class="ce-shape-cell">${mini}</td></tr>`;
    })
    .join("");
  return `<table class="sp-table ce-table"><thead><tr><th scope="col" class="ce-check"></th><th scope="col">カード(${esc(w.packName)})</th>${head}<th scope="col">範囲</th></tr></thead><tbody>${rows}</tbody></table>`;
};

const bulkHtml = (w: CardWork, ui: CardUi): string => {
  const n = ui.selected.size;
  const off = w.locked || n === 0;
  const chip = (group: string, value: string | number, label: string, on: boolean, extra = ""): string =>
    `<button type="button" class="ce-chip${on ? " on" : ""}" data-chip="${group}:${value}" aria-pressed="${on}" ${dis(w.locked)}>${esc(label)}${extra}</button>`;
  const costs = costCounts(w.printed, w.cards);
  for (const c of ui.chips.cost) if (!costs.some((x) => x.cost === c)) costs.push({ cost: c, count: 0 });
  costs.sort((a, b) => a.cost - b.cost);
  const filters = `<div class="ce-filter-rows">
    <div><span class="ce-flabel">種類</span>${chip("kind", "shikigami", "式神", ui.chips.kind.includes("shikigami"))}${chip("kind", "reigu", "霊具", ui.chips.kind.includes("reigu"))}</div>
    <div><span class="ce-flabel">属性</span>${(["yin", "yang", "none"] as const).map((a) => chip("attr", a, ATTR_LABELS[a], ui.chips.attr.includes(a))).join("")}</div>
    <div><span class="ce-flabel">召喚コスト</span>${costs.map((c) => chip("cost", c.cost, String(c.cost), ui.chips.cost.includes(c.cost), `<small>${c.count}枚</small>`)).join("")}</div>
    <div class="ce-quick"><button type="button" class="btn btn-quiet" data-select="all" ${dis(w.locked)}>すべて</button><button type="button" class="btn btn-quiet" data-select="changed" ${dis(w.locked)}>変更したカード</button><button type="button" class="btn btn-quiet" data-select="clear" ${dis(w.locked || n === 0)}>選択を外す</button><span class="ce-fhint">同じ行はどれか、行どうしは両方を満たすカードを選ぶ</span></div>
  </div>`;
  const stats = CARD_STATS.map(
    (s) => `<div class="ce-bulk-stat"><span class="ce-bulk-label">${statLabel(s)}</span>
      <span class="ce-bulk-btns"><button type="button" class="sp-btn" data-bulk="delta" data-stat="${s.key}" data-d="-1" ${dis(off)} aria-label="選んだカードの${esc(s.label)}を1減らす">−1</button><button type="button" class="sp-btn" data-bulk="delta" data-stat="${s.key}" data-d="1" ${dis(off)} aria-label="選んだカードの${esc(s.label)}を1増やす">+1</button><input type="number" name="bulk.${s.key}" min="${s.min}" max="${s.max}" placeholder="値" ${dis(off)} aria-label="選んだカードの${esc(s.label)}にする値"><button type="button" class="sp-btn ce-set" data-bulk="set" data-stat="${s.key}" ${dis(off)}>にする</button></span></div>`,
  ).join("");
  const focus = w.printed.byId.get(ui.focus);
  const canCopy = !off && focus !== undefined && canEditShape(focus);
  const head = `<div class="ce-bulk-head"><button type="button" class="ce-bulk-toggle" data-bulk-toggle="1" aria-expanded="${ui.bulkOpen}"><span class="ce-bulk-title">まとめて変更</span><span class="ce-bulk-caret" aria-hidden="true">${ui.bulkOpen ? "▾" : "▸"}</span><span class="ce-bulk-hint">${ui.bulkOpen ? "閉じる" : "種類・属性・コストで選んで数値をまとめて変える"}</span></button><span class="ce-selcount"><b>${n}</b>枚を選択中</span></div>`;
  if (!ui.bulkOpen) return `<div class="ce-bulk is-closed${off ? " is-off" : ""}">${head}</div>`;
  return `<div class="ce-bulk${off ? " is-off" : ""}">
    ${head}
    ${filters}
    <div class="ce-bulk-stats">${stats}</div>
    <div class="ce-bulk-foot">
      <button type="button" class="btn btn-quiet" data-bulk="copyShape" ${dis(!canCopy)}>「${esc(focus?.nameJa ?? "")}」の攻撃範囲・死角・隙を選んだカードにコピー</button>
      <button type="button" class="btn btn-quiet" data-bulk="reset" ${dis(off)}>選んだカードを印刷どおりに戻す</button>
    </div>
  </div>`;
};

const segHtml = (field: string, current: string, options: readonly { v: string; label: string }[], locked: boolean): string =>
  `<span class="sp-seg ce-seg">${options
    .map((o) => `<label class="${o.v === current ? "on" : ""}"><button type="button" data-shape="${field}" data-v="${o.v}" aria-pressed="${o.v === current}" ${dis(locked)}><span>${esc(o.label)}</span></button></label>`)
    .join("")}</span>`;

const gridHtml = (w: CardWork, ui: CardUi, cards: CardOverrides): string => {
  const base = w.printed.byId.get(ui.focus);
  if (base === undefined) return "";
  const card = editedCard(base, cards[base.id]);
  const buttons: string[] = [];
  for (let y = RANGE_REACH; y >= -RANGE_REACH; y--) {
    for (let x = -RANGE_REACH; x <= RANGE_REACH; x++) {
      const st = cellState(card, { x, y });
      const outer = Math.abs(x) === RANGE_REACH || Math.abs(y) === RANGE_REACH;
      if (st === "self") {
        buttons.push(`<span class="ce-cell ce-self" aria-label="自分(上が前)">▲</span>`);
        continue;
      }
      buttons.push(
        `<button type="button" class="ce-cell ce-${st}${outer ? " ce-outer" : ""}" data-cell="${x},${y}" ${dis(w.locked)} aria-label="${esc(cellWord({ x, y }))}: ${CELL_WORD[st]}">${st === "blind" ? "×" : ""}</button>`,
      );
    }
  }
  return `<div class="ce-grid" role="group" aria-label="攻撃範囲の編集(上が前)">${buttons.join("")}</div>`;
};

const editorHtml = (w: CardWork, ui: CardUi, cards: CardOverrides): string => {
  const base = w.printed.byId.get(ui.focus);
  if (base === undefined) return "";
  const card = editedCard(base, cards[base.id]);
  const ctx = makeCtx(w.cfg, applyCardOverrides(w.printed, cards));
  const changed = cards[base.id] !== undefined && Object.keys(cards[base.id]).length > 0;
  const preview = `<div class="ce-preview">${cardFaceHtml(ctx, base.id, { size: "lg", mods: cards, printed: (id) => w.printed.byId.get(id) })}</div>`;
  const head = `<div class="ce-head"><b>${esc(base.nameJa)}</b><span class="sp-card-id">${esc(base.id)}</span>${
    changed ? '<span class="sp-count">変更あり</span>' : ""
  }<button type="button" class="btn btn-quiet sp-reset" data-card-reset="${esc(base.id)}" ${dis(w.locked || !changed)}>このカードを戻す</button></div>`;
  if (!canEditShape(base)) {
    return `<div class="ce-editor">${head}<div class="ce-body">${preview}<p class="muted ce-note">霊具は使用コスト(表の「召」)だけ変えられます。</p></div></div>`;
  }
  const tools = TOOLS.map(
    (t) => `<button type="button" class="ce-tool ce-tool-${t.id}${ui.tool === t.id ? " on" : ""}" data-tool="${t.id}" aria-pressed="${ui.tool === t.id}" ${dis(w.locked || (t.id === "gap" && !card.aoe))}>${esc(t.label)}</button>`,
  ).join("");
  const gap = card.gapCell ?? null;
  const text = `<dl class="ce-text">
    <dt>攻撃範囲</dt><dd>${esc(cellsText(card.attackRange))}</dd>
    <dt>死角</dt><dd>${esc(cellsText(card.blindSpots))}</dd>
    <dt>隙</dt><dd>${card.aoe ? esc(gap === null ? "なし" : cellWord(gap)) : "単体攻撃は攻撃範囲全体"}</dd>
  </dl>`;
  const shape = `<div class="ce-shape">
    <div class="ce-tools" role="group" aria-label="塗るもの">${tools}</div>
    ${gridHtml(w, ui, cards)}
    <p class="ce-hint">上が前。道具を選んでマスを押す(もう一度押すと外れる)</p>
    ${text}
    <div class="ce-rows">
      <div><span>範囲/単体</span>${segHtml("aoe", String(card.aoe), [{ v: "true", label: "範囲" }, { v: "false", label: "単体" }], w.locked)}</div>
      <div><span>攻撃の種類</span>${segHtml("attackType", card.attackType, (Object.keys(ATTACK_TYPE_LABELS) as AttackType[]).map((v) => ({ v, label: ATTACK_TYPE_LABELS[v] })), w.locked)}</div>
      <div><span>属性</span>${segHtml("attribute", card.attribute, (Object.keys(ATTR_LABELS) as Attr[]).map((v) => ({ v, label: ATTR_LABELS[v] })), w.locked)}</div>
    </div>
  </div>`;
  return `<div class="ce-editor">${head}<div class="ce-body">${preview}${shape}</div></div>`;
};

/** Number of changed card fields, for the section tab. */
export const cardSectionCount = (w: CardWork): number => cardChangeCount(normalizeCardOverrides(w.printed, w.cards));

/** The whole カード section; hidden (but still in the form) when another section is shown. */
export const cardSectionHtml = (w: CardWork, ui: CardUi, shown: boolean): string => {
  const cards = normalizeCardOverrides(w.printed, w.cards);
  const count = cardChangeCount(cards);
  return `<section class="sp-group sp-cards" data-group="cards" ${shown ? "" : "hidden"}>
    <div class="sp-ghead"><h3 class="sp-gname">カード(数値・攻撃範囲)</h3>${count > 0 ? `<span class="sp-count">${count}か所変更</span>` : ""}${
      w.locked ? '<span class="sp-lock">変更できません</span>' : ""
    }<button type="button" class="btn btn-quiet sp-reset" data-reset="cards" ${dis(count === 0 || w.locked)}>カードを戻す</button></div>
    ${bulkHtml(w, ui)}
    <div class="ce-layout">
      <div class="sp-table-wrap">${tableHtml(w, ui, cards)}</div>
      ${editorHtml(w, ui, cards)}
    </div>
  </section>`;
};

// ----------------------------------------------------------------- reading

/**
 * Numbers typed in the table, laid over the shape edits already in the
 * working copy. Returns the new overrides and the first problem, if any.
 */
export const readCardTable = (form: HTMLFormElement, w: CardWork): { cards: CardOverrides; problem: string } => {
  let problem = "";
  const next: CardOverrides = {};
  for (const base of w.printed.cards) {
    const edit: CardEdit = { ...(w.cards[base.id] ?? {}) };
    for (const s of CARD_STATS) {
      const el = form.elements.namedItem(`card.${base.id}.${s.key}`);
      if (!(el instanceof HTMLInputElement)) continue;
      const v = Number(el.value);
      if (!Number.isInteger(v) || v < statMin(base, s) || v > s.max) {
        if (problem === "") problem = `${base.nameJa} の${s.label}は${statMin(base, s)}〜${s.max}の整数にしてください`;
        continue;
      }
      if (v === base[s.key]) delete edit[s.key];
      else edit[s.key] = v;
    }
    if (Object.keys(edit).length > 0) next[base.id] = edit;
  }
  return { cards: next, problem };
};

// ------------------------------------------------------------------ events

export type CardClickResult = { cards: CardOverrides; notice?: string; error?: string };

/**
 * A click inside the カード section. `cards` must already hold what the table
 * shows (call readCardTable first). null = not a card-section button.
 */
export const cardClick = (t: HTMLElement, form: HTMLFormElement, w: CardWork, ui: CardUi): CardClickResult | null => {
  const d = t.dataset;
  const cards = w.cards;
  const picked = w.printed.cards.map((c) => c.id).filter((id) => ui.selected.has(id));
  if (d.bulkToggle !== undefined) {
    ui.bulkOpen = !ui.bulkOpen;
    return { cards };
  }
  if (d.focus !== undefined) {
    ui.focus = d.focus;
    return { cards };
  }
  if (w.locked) return null;
  if (d.select !== undefined) {
    ui.chips = noChips();
    ui.selected = new Set(d.select === "clear" ? [] : selectCards(w.printed, cards, d.select as CardFilter));
    return { cards };
  }
  if (d.chip !== undefined) {
    const [group, raw] = d.chip.split(":");
    const toggle = <T>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
    const f = ui.chips;
    ui.chips =
      group === "kind"
        ? { ...f, kind: toggle(f.kind, raw as CardChips["kind"][number]) }
        : group === "attr"
          ? { ...f, attr: toggle(f.attr, raw as CardChips["attr"][number]) }
          : { ...f, cost: toggle(f.cost, Number(raw)) };
    ui.selected = new Set(selectByChips(w.printed, cards, ui.chips));
    return { cards };
  }
  if (d.tool !== undefined) {
    ui.tool = d.tool as RangeTool;
    return { cards };
  }
  if (d.cell !== undefined) {
    const [x, y] = d.cell.split(",").map(Number);
    return { cards: paintCell(w.printed, cards, ui.focus, ui.tool, { x, y }) };
  }
  if (d.shape !== undefined && d.v !== undefined) {
    const patch =
      d.shape === "aoe" ? { aoe: d.v === "true" } : d.shape === "attackType" ? { attackType: d.v as AttackType } : { attribute: d.v as Attr };
    return { cards: setShape(w.printed, cards, ui.focus, patch) };
  }
  if (d.cardReset !== undefined) return { cards: resetCards(cards, [d.cardReset]), notice: "このカードを印刷どおりに戻しました" };
  if (d.bulk === undefined) return null;
  if (picked.length === 0) return { cards, error: "先に表の左のチェックでカードを選んでください" };
  const stat = d.stat as CardStatKey | undefined;
  const label = CARD_STATS.find((s) => s.key === stat)?.label ?? "";
  switch (d.bulk) {
    case "delta": {
      const r = bulkStat(w.printed, cards, picked, stat as CardStatKey, { delta: Number(d.d) });
      return { cards: r.cards, notice: `${r.changed}枚の${label}を${Number(d.d) > 0 ? "+" : ""}${d.d}しました` };
    }
    case "set": {
      const input = form.elements.namedItem(`bulk.${stat}`);
      const raw = input instanceof HTMLInputElement ? input.value.trim() : "";
      if (raw === "" || !Number.isInteger(Number(raw))) return { cards, error: `${label}にする値を整数で入れてください` };
      const r = bulkStat(w.printed, cards, picked, stat as CardStatKey, { value: Number(raw) });
      const skipped = r.skipped.length > 0 ? `(範囲外で変えなかった: ${r.skipped.join("・")})` : "";
      return { cards: r.cards, notice: `${r.changed}枚の${label}を${raw}にしました${skipped}` };
    }
    case "copyShape": {
      const r = copyShape(w.printed, cards, ui.focus, picked);
      return { cards: r.cards, notice: `${r.changed}枚に攻撃範囲・死角・隙をコピーしました` };
    }
    case "reset":
      return { cards: resetCards(cards, picked), notice: `${picked.length}枚を印刷どおりに戻しました` };
    default:
      return null;
  }
};

/** A check box in the table changed: update the selection. */
export const cardSelectChange = (t: HTMLInputElement, ui: CardUi): boolean => {
  if (!t.name.startsWith("sel.")) return false;
  const id = t.name.slice(4);
  const next = new Set(ui.selected);
  if (t.checked) next.add(id);
  else next.delete(id);
  ui.selected = next;
  return true;
};
