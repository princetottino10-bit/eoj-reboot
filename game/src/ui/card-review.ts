import { CARD_DB, FACTION_NAMES } from "../data/cards.js";
import changeHistoryJson from "../../../data/card-change-history.json";
import sharedReviewJson from "../../../data/card-review-notes.json";
import type { AttackCells, CharCardDef, FactionUltDef, ItemCardDef } from "../engine/gamestate.js";

type ReviewCard =
  | { kind: "character"; card: CharCardDef }
  | { kind: "item"; card: ItemCardDef }
  | { kind: "ult"; card: FactionUltDef };

interface ReviewNote {
  checks: Record<string, boolean>;
  memo: string;
}

interface SharedReviewExport {
  exported_at?: string;
  notes?: Record<string, ReviewNote>;
}

interface ChangeHistoryExport {
  updated_at?: string;
  changes?: Record<string, string[]>;
  global_changes?: string[];
}

interface ReviewState {
  index: number;
  faction: string;
  kind: "all" | "character" | "item" | "ult";
  query: string;
}

const STORAGE_KEY = "eoj-card-review-notes-v1";
const CHECKS = [
  ["name", "名前"],
  ["cost", "コスト"],
  ["stats", "HP/ATK/VP"],
  ["attack", "攻撃範囲"],
  ["counter", "反撃範囲"],
  ["weakness", "弱点"],
  ["effect", "効果文"],
  ["balance", "バランス注意"],
] as const;

const allCards: ReviewCard[] = [
  ...CARD_DB.characters.map((card) => ({ kind: "character" as const, card })),
  ...CARD_DB.items.map((card) => ({ kind: "item" as const, card })),
  ...CARD_DB.faction_ults.map((card) => ({ kind: "ult" as const, card })),
];

const state: ReviewState = {
  index: 0,
  faction: "all",
  kind: "all",
  query: "",
};

let notes = loadNotes();
const sharedReview = sharedReviewJson as SharedReviewExport;
const sharedNotes = sharedReview.notes ?? {};
const changeHistory = changeHistoryJson as ChangeHistoryExport;
const changeMap = changeHistory.changes ?? {};

function loadNotes(): Record<string, ReviewNote> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ReviewNote>) : {};
  } catch {
    return {};
  }
}

function saveNotes(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function reviewedEntries(): [string, ReviewNote][] {
  return Object.entries(notes).filter(([, note]) =>
    note.memo.trim() !== "" || Object.values(note.checks).some(Boolean)
  );
}

function downloadText(filename: string, text: string, type: string): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportJson(): void {
  const reviewed = Object.fromEntries(reviewedEntries());
  const payload = {
    exported_at: new Date().toISOString(),
    source: "eoj-card-review",
    card_count: Object.keys(reviewed).length,
    notes: reviewed,
  };
  downloadText(
    "card-review-notes.json",
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8",
  );
}

function exportMarkdown(): void {
  const lines = [
    "# カードレビュー",
    "",
    `Exported: ${new Date().toLocaleString("ja-JP")}`,
    "",
  ];

  for (const [id, note] of reviewedEntries()) {
    const entry = allCards.find((candidate) => cardId(candidate) === id);
    const name = entry?.card.name ?? id;
    const faction = entry?.card.faction
      ? FACTION_NAMES[entry.card.faction] ?? entry.card.faction
      : "-";
    const checked = CHECKS
      .filter(([key]) => note.checks[key])
      .map(([, label]) => label);

    lines.push(`## ${name} (${id})`);
    lines.push("");
    lines.push(`- \u7a2e\u5225: ${typeLabel(entry)}`);
    lines.push(`- 派閥: ${faction}`);
    lines.push(`- チェック: ${checked.length > 0 ? checked.join(", ") : "なし"}`);
    if (note.memo.trim()) {
      lines.push("- メモ:");
      lines.push("");
      lines.push(note.memo.trim());
    }
    lines.push("");
  }

  downloadText("card-review-notes.md", lines.join("\n"), "text/markdown;charset=utf-8");
}

function noteFor(id: string): ReviewNote {
  notes[id] ??= { checks: {}, memo: "" };
  return notes[id];
}

function sharedNoteFor(id: string): ReviewNote | null {
  const note = sharedNotes[id];
  if (!note) return null;
  if (!note.memo.trim() && !Object.values(note.checks ?? {}).some(Boolean)) return null;
  return note;
}

function changesFor(id: string): string[] {
  return changeMap[id] ?? [];
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function filteredCards(): ReviewCard[] {
  const q = state.query.trim().toLowerCase();
  return allCards.filter(({ kind, card }) => {
    if (state.kind !== "all" && state.kind !== kind) return false;
    if (state.faction !== "all" && card.faction !== state.faction) return false;
    if (!q) return true;
    return `${card.id} ${card.name} ${card.effect}`.toLowerCase().includes(q);
  });
}

function clampIndex(cards: ReviewCard[]): void {
  if (cards.length === 0) {
    state.index = 0;
    return;
  }
  state.index = Math.max(0, Math.min(state.index, cards.length - 1));
}

function cardId(entry: ReviewCard): string {
  return entry.card.id;
}

function typeLabel(entry: ReviewCard | undefined): string {
  if (entry?.kind === "item") return "\u30b9\u30da\u30eb";
  if (entry?.kind === "ult") return "\u30a6\u30eb\u30c8";
  return "\u30ad\u30e3\u30e9\u30af\u30bf\u30fc";
}

function statLine(entry: ReviewCard): string {
  const card = entry.card;
  if (entry.kind === "item") {
    return `${card.attribute ?? "-"} / Cost ${card.cost} / ${card.faction ?? "-"}`;
  }
  if (entry.kind === "ult") {
    return `${FACTION_NAMES[card.faction] ?? card.faction} / \u30c7\u30c3\u30ad\u5916`;
  }
  return `${card.attribute} / Cost ${card.cost} / HP ${card.hp} / ATK ${card.atk} / VP ${card.vp} / 再 ${card.reactivation_cost}`;
}

function renderCoordList(cells: AttackCells | undefined): string {
  if (cells === "all") return "全域";
  if (cells == null) return "なし";
  return cells.map(([r, c]) => `(${r},${c})`).join(" ");
}

function attackModeLabel(card: CharCardDef): string {
  if (card.attack_mode === "choice") return "範囲から1体を選択";
  if (card.attack_mode === "simultaneous") return "範囲内すべてへ同時攻撃";
  if (card.attack_mode === "none") return "攻撃不可";
  if (card.attack_cells === null) return "攻撃不可";
  return "攻撃方式未設定";
}

function gridBounds(...cellSets: (AttackCells | undefined)[]): [number, number] {
  let max = 2;
  for (const cells of cellSets) {
    if (!Array.isArray(cells)) continue;
    for (const [r, c] of cells) max = Math.max(max, Math.abs(r), Math.abs(c));
  }
  return [-max, max];
}

function hasCell(cells: AttackCells | undefined, r: number, c: number): boolean {
  if (cells === "all") return !(r === 0 && c === 0);
  if (!Array.isArray(cells)) return false;
  return cells.some(([rr, cc]) => rr === r && cc === c);
}

function renderRangeGrid(card: CharCardDef): string {
  const [min, max] = gridBounds(card.attack_cells, card.counter_cells, card.weakness_cells);
  const rows: string[] = [];
  for (let r = max; r >= min; r--) {
    for (let c = min; c <= max; c++) {
      const classes = ["review-cell"];
      let label = "";
      if (r === 0 && c === 0) {
        classes.push("self");
        label = "自";
      }
      if (hasCell(card.attack_cells, r, c)) classes.push("attack");
      if (hasCell(card.counter_cells, r, c)) classes.push("counter");
      if (hasCell(card.weakness_cells, r, c)) {
        classes.push("weak");
        label = label || "弱";
      }
      rows.push(`<span class="${classes.join(" ")}">${label}</span>`);
    }
  }
  const size = max - min + 1;
  return `<div class="review-range-grid" style="grid-template-columns: repeat(${size}, 28px);">${rows.join("")}</div>`;
}

function renderCardFace(entry: ReviewCard): string {
  const card = entry.card;
  if (entry.kind === "item") {
    return `
      <article class="review-card item-card">
        <div class="review-card-top">
          <span>${escapeHtml(card.attribute ?? "道具")}</span>
          <strong>${escapeHtml(card.name)}</strong>
          <span>C${card.cost}</span>
        </div>
        <div class="review-card-sub">${escapeHtml(card.faction ?? "")} / ${escapeHtml(card.id)}</div>
        <div class="review-effect">${escapeHtml(card.effect)}</div>
      </article>
    `;
  }
  if (entry.kind === "ult") {
    return `
      <article class="review-card ult-card">
        <div class="review-card-top">
          <span>ULT</span>
          <strong>${escapeHtml(card.name)}</strong>
          <span>OUT</span>
        </div>
        <div class="review-card-sub">${escapeHtml(FACTION_NAMES[card.faction] ?? card.faction)} / ${escapeHtml(card.id)}</div>
        <div class="review-ult-condition">${escapeHtml(card.condition || "-")}</div>
        <div class="review-effect">${escapeHtml(card.effect)}</div>
        ${card.source_card_id ? `<div class="review-card-sub">source: ${escapeHtml(card.source_card_id)}</div>` : ""}
      </article>
    `;
  }

  const ult = card.ult
    ? `<div class="review-ult"><strong>${escapeHtml(card.ult.name)}</strong><br>${escapeHtml(card.ult.condition ?? card.ult.timing ?? "")}<br>${escapeHtml(card.ult.effect)}</div>`
    : "";

  return `
    <article class="review-card">
      <div class="review-card-top">
        <span>${escapeHtml(card.attribute)}</span>
        <strong>${escapeHtml(card.name)}</strong>
        <span>C${card.cost}</span>
      </div>
      <div class="review-card-sub">${escapeHtml(FACTION_NAMES[card.faction] ?? card.faction)} / ${escapeHtml(card.id)}</div>
      <div class="review-stat-row">
        <span>HP ${card.hp}</span><span>ATK ${card.atk}</span><span>VP ${card.vp}</span><span>再 ${card.reactivation_cost}</span>
      </div>
      <div class="review-tags">${card.keywords.map((kw) => `<span>${escapeHtml(kw)}</span>`).join("") || "<em>キーワードなし</em>"}</div>
      <div class="review-attack-mode">${escapeHtml(attackModeLabel(card))}</div>
      <div class="review-effect">${escapeHtml(card.effect || "効果なし")}</div>
      ${ult}
      <div class="review-range-wrap">
        ${renderRangeGrid(card)}
        <div class="review-legend">
          <span><b class="lg attack"></b>攻撃</span>
          <span><b class="lg counter"></b>反撃</span>
          <span><b class="lg weak"></b>弱点</span>
        </div>
      </div>
    </article>
  `;
}

function renderInspector(entry: ReviewCard): string {
  if (entry.kind === "item") {
    return `
      <dl class="review-detail-list">
        <dt>ID</dt><dd>${escapeHtml(entry.card.id)}</dd>
        <dt>派閥</dt><dd>${escapeHtml(FACTION_NAMES[entry.card.faction ?? ""] ?? entry.card.faction ?? "-")}</dd>
        <dt>属性</dt><dd>${escapeHtml(entry.card.attribute ?? "-")}</dd>
        <dt>コスト</dt><dd>${entry.card.cost}</dd>
      </dl>
    `;
  }
  if (entry.kind === "ult") {
    return `
      <dl class="review-detail-list">
        <dt>ID</dt><dd>${escapeHtml(entry.card.id)}</dd>
        <dt>\u7a2e\u5225</dt><dd>\u30c7\u30c3\u30ad\u5916\u30a6\u30eb\u30c8</dd>
        <dt>\u9663\u55b6</dt><dd>${escapeHtml(FACTION_NAMES[entry.card.faction] ?? entry.card.faction)}</dd>
        <dt>\u5143\u30ab\u30fc\u30c9</dt><dd>${escapeHtml(entry.card.source_card_id ?? "-")}</dd>
      </dl>
    `;
  }
  const c = entry.card;
  return `
    <dl class="review-detail-list">
      <dt>ID</dt><dd>${escapeHtml(c.id)}</dd>
      <dt>派閥</dt><dd>${escapeHtml(FACTION_NAMES[c.faction] ?? c.faction)}</dd>
      <dt>攻撃</dt><dd>${escapeHtml(renderCoordList(c.attack_cells))}</dd>
      <dt>反撃</dt><dd>${escapeHtml(renderCoordList(c.counter_cells))}</dd>
      <dt>弱点</dt><dd>${escapeHtml(renderCoordList(c.weakness_cells))}</dd>
      <dt>攻撃方式</dt><dd>${escapeHtml(attackModeLabel(c))}</dd>
      <dt>攻撃種</dt><dd>${escapeHtml(c.attack_type)}</dd>
      <dt>重ね</dt><dd>${c.has_overlay ? "あり" : "なし"}</dd>
    </dl>
  `;
}

function renderSharedReview(id: string): string {
  const note = sharedNoteFor(id);
  if (!note) {
    return `<div class="review-shared-empty">共有レビューなし</div>`;
  }
  const checked = CHECKS
    .filter(([key]) => note.checks?.[key])
    .map(([, label]) => label);
  return `
    <div class="review-shared">
      ${checked.length > 0 ? `<div class="review-shared-tags">${checked.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div>` : ""}
      ${note.memo.trim() ? `<div class="review-shared-memo">${escapeHtml(note.memo.trim())}</div>` : ""}
    </div>
  `;
}

function renderChangeHistory(id: string): string {
  const changes = changesFor(id);
  const globals = changeHistory.global_changes ?? [];
  if (changes.length === 0 && globals.length === 0) {
    return `<div class="review-shared-empty">修正履歴なし</div>`;
  }
  return `
    <div class="review-history">
      ${changes.length > 0 ? `<ul>${changes.map((change) => `<li>${escapeHtml(change)}</li>`).join("")}</ul>` : ""}
      ${globals.length > 0 ? `<div class="review-history-global">${globals.map((change) => `<p>${escapeHtml(change)}</p>`).join("")}</div>` : ""}
    </div>
  `;
}

function renderReview(): void {
  const root = document.getElementById("app");
  if (!root) return;

  const cards = filteredCards();
  clampIndex(cards);
  const entry = cards[state.index] ?? null;
  const factions = Object.keys(CARD_DB.faction_names);
  const note = entry ? noteFor(cardId(entry)) : null;

  root.innerHTML = `
    <main class="screen-card-review">
      <header class="review-header">
        <div>
          <h1>カード検品</h1>
          <p>${CARD_DB.characters.length} creatures / ${CARD_DB.items.length} spells / ${CARD_DB.faction_ults.length} ults</p>
        </div>
        <div class="review-actions">
          <button id="export-json" class="review-action-btn">JSON出力</button>
          <button id="export-md" class="review-action-btn">Markdown出力</button>
        </div>
      </header>

      <section class="review-toolbar">
        <select id="review-kind">
          <option value="all" ${state.kind === "all" ? "selected" : ""}>すべて</option>
          <option value="character" ${state.kind === "character" ? "selected" : ""}>キャラクター</option>
          <option value="item" ${state.kind === "item" ? "selected" : ""}>\u30b9\u30da\u30eb</option>
          <option value="ult" ${state.kind === "ult" ? "selected" : ""}>\u30a6\u30eb\u30c8</option>
        </select>
        <select id="review-faction">
          <option value="all" ${state.faction === "all" ? "selected" : ""}>全派閥</option>
          ${factions.map((f) => `<option value="${escapeHtml(f)}" ${state.faction === f ? "selected" : ""}>${escapeHtml(FACTION_NAMES[f] ?? f)}</option>`).join("")}
        </select>
        <input id="review-query" value="${escapeHtml(state.query)}" placeholder="名前・ID・効果で検索" />
        <span class="review-count">${cards.length === 0 ? "0 / 0" : `${state.index + 1} / ${cards.length}`}</span>
      </section>

      ${
        entry
          ? `
        <section class="review-layout">
          <aside class="review-side list-side">
            <div class="review-mini-list">
              ${cards.map((candidate, i) => {
                const n = noteFor(cardId(candidate));
                const shared = sharedNoteFor(cardId(candidate));
                const marked = n.memo.trim() || n.checks.balance || shared || changesFor(cardId(candidate)).length > 0;
                return `<button class="${i === state.index ? "active" : ""} ${marked ? "marked" : ""}" data-jump="${i}">
                  <span>${escapeHtml(candidate.card.name)}</span>
                  <small>${escapeHtml(candidate.card.id)}</small>
                </button>`;
              }).join("")}
            </div>
          </aside>

          <section class="review-main-card">
            <div class="review-nav">
              <button id="review-prev" class="icon-btn" title="前へ">←</button>
              <div>
                <strong>${escapeHtml(entry.card.name)}</strong>
                <small>${escapeHtml(statLine(entry))}</small>
              </div>
              <button id="review-next" class="icon-btn" title="次へ">→</button>
            </div>
            ${renderCardFace(entry)}
          </section>

          <aside class="review-side">
            <h2>チェック</h2>
            <div class="review-checks">
              ${CHECKS.map(([key, label]) => `
                <label>
                  <input type="checkbox" data-check="${key}" ${note?.checks[key] ? "checked" : ""} />
                  <span>${label}</span>
                </label>
              `).join("")}
            </div>
            <h2>メモ</h2>
            <textarea id="review-memo" placeholder="修正案や気になる点を書く">${escapeHtml(note?.memo ?? "")}</textarea>
            <h2>共有レビュー</h2>
            ${renderSharedReview(cardId(entry))}
            <h2>修正履歴</h2>
            ${renderChangeHistory(cardId(entry))}
            <h2>詳細</h2>
            ${renderInspector(entry)}
          </aside>
        </section>`
          : `<div class="review-empty">該当カードがありません。</div>`
      }
    </main>
  `;

  wireEvents(cards);
}

function wireEvents(cards: ReviewCard[]): void {
  document.getElementById("export-json")?.addEventListener("click", exportJson);
  document.getElementById("export-md")?.addEventListener("click", exportMarkdown);

  const kind = document.getElementById("review-kind") as HTMLSelectElement | null;
  const faction = document.getElementById("review-faction") as HTMLSelectElement | null;
  const query = document.getElementById("review-query") as HTMLInputElement | null;
  kind?.addEventListener("change", () => {
    state.kind = kind.value as ReviewState["kind"];
    state.index = 0;
    renderReview();
  });
  faction?.addEventListener("change", () => {
    state.faction = faction.value;
    state.index = 0;
    renderReview();
  });
  query?.addEventListener("input", () => {
    state.query = query.value;
    state.index = 0;
    renderReview();
  });

  document.getElementById("review-prev")?.addEventListener("click", () => move(-1));
  document.getElementById("review-next")?.addEventListener("click", () => move(1));

  document.querySelectorAll<HTMLButtonElement>("[data-jump]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.index = Number(btn.dataset.jump ?? 0);
      renderReview();
    });
  });

  const entry = cards[state.index];
  if (!entry) return;
  const id = cardId(entry);
  document.querySelectorAll<HTMLInputElement>("[data-check]").forEach((input) => {
    input.addEventListener("change", () => {
      noteFor(id).checks[input.dataset.check ?? ""] = input.checked;
      saveNotes();
      renderReview();
    });
  });
  document.getElementById("review-memo")?.addEventListener("input", (event) => {
    noteFor(id).memo = (event.target as HTMLTextAreaElement).value;
    saveNotes();
  });
}

function move(delta: number): void {
  const cards = filteredCards();
  if (cards.length === 0) return;
  state.index = (state.index + delta + cards.length) % cards.length;
  renderReview();
}

export function startCardReviewApp(): void {
  document.body.classList.add("review-mode");
  renderReview();
  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
  });
}
