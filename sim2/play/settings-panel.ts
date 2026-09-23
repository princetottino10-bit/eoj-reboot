// The settings panel: rule variables and cards, for a match about to start
// (setup), the next match of a room (between) or the match being played
// (midgame). It mounts into a <dialog> or into a page element (the /rules
// page, play/rules-page.ts): one implementation, two layouts. In a dialog its
// body scrolls; on a page the document scrolls and the tabs and the footer
// stick. Inputs are generated from CONFIG_SCHEMA and the card section
// (card-editor.ts); values are checked with the same schema functions the
// server uses, and the server checks again.
import { applyCardOverrides, cardChangeCount, normalizeCardOverrides, overridesBetween, parseCardOverrides } from "../src/card-overrides.ts";
import type { CardOverrides } from "../src/card-overrides.ts";
import type { CardPack } from "../src/cards.ts";
import {
  applyConfigPatch,
  checkConfigRelations,
  checkFieldValue,
  CONFIG_GROUPS,
  CONFIG_SCHEMA,
  configChanges,
  diffPatch,
  fieldOf,
  formatConfigValue,
  sameValue,
} from "../src/config-schema.ts";
import type { ConfigField, ConfigPatch } from "../src/config-schema.ts";
import { isRulePresetId, PLAYABLE_PACKS, presetConfig, RULE_PRESETS } from "../src/presets.ts";
import type { PlayablePack, RulePresetId } from "../src/presets.ts";
import { isSettingPresetId, matchingSettingPreset, SETTING_PRESET_IDS, SETTING_PRESETS, settingPresetSettings } from "../src/setting-presets.ts";
import type { SettingPresetId } from "../src/setting-presets.ts";
import { encodeSettings } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import type { Config } from "../src/types.ts";
import { cardClick, cardSectionCount, cardSectionHtml, cardSelectChange, initialCardUi, readCardTable } from "./card-editor.ts";
import type { CardWork } from "./card-editor.ts";
import { esc, watchArtErrors } from "./cards-view.ts";
import { ensureMarks } from "./marks.ts";
import { deleteSaved, listSaved, saveNamed } from "./saved-settings.ts";

/** setup = before a match (everything); between = next match (everything); midgame = rules that may change now. */
export type PanelMode = "setup" | "between" | "midgame";

/** A footer button that submits the panel; `id` comes back in the result. */
export type PanelAction = { id: string; label: string; primary?: boolean };

export type PanelResult = {
  /** Which footer action was pressed. */
  action: string;
  settings: GameSettings;
  patch: ConfigPatch;
  /** midgame only (else {}): card fields to change now, each value replacing the one in play. */
  cardEdits: CardOverrides;
  form: FormData;
};

export type PanelOptions = {
  mode: PanelMode;
  settings: GameSettings;
  /** midgame: the rules in force right now (the submitted patch is the difference from these). */
  current?: Config;
  /** midgame: the card overrides in force right now, against the printed pack (the submitted cardEdits are the difference). */
  currentCards?: CardOverrides;
  /** Heading inside the panel (dialogs); a page shows its own. */
  title?: string;
  actions: PanelAction[];
  /** Base preset and pack may be switched (setup / between). */
  allowRuleAndPack: boolean;
  loadPack: (name: PlayablePack) => Promise<CardPack>;
  /** The share link for encoded settings; null hides sharing. */
  shareUrl: ((encoded: string) => string) | null;
  /** Page-specific fields at the top (seat, AI, seed...). */
  extraHtml?: string;
  /** Every change to the settings being edited (the page keeps them in its URL, so Back and reload find them). */
  onChange?: (settings: GameSettings, encoded: string) => void;
  /** Return false (or a promise of false) to keep the panel as it is (a dialog closes otherwise). */
  onSubmit: (result: PanelResult) => void | boolean | Promise<unknown>;
};

/**
 * The panel mounted in each host: an older panel (the page re-opened it with
 * another mode) must not draw over the one that replaced it.
 */
const mounted = new WeakMap<HTMLElement, object>();

type Work = { rule: RulePresetId; pack: PlayablePack; cfg: Config; cards: CardOverrides; printed: CardPack };

/** How long a page's actions stay disabled after a successful submit that is expected to leave the page. */
const PAGE_LEAVE_MS = 5000;

/** Elements whose scroll position survives a redraw ("form.sp" is the form itself). */
const SCROLLERS = ["form.sp", ".sp-body", ".sp-nav", ".sp-table-wrap"] as const;

const stepperHtml = (name: string, value: number, min: number, max: number, disabled: boolean, label: string): string =>
  `<span class="sp-step"><button type="button" class="sp-btn" data-step="-1" data-for="${name}" ${disabled ? "disabled" : ""} aria-label="${esc(label)}を1減らす">−</button><input type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="1" inputmode="numeric" ${disabled ? "disabled" : ""} aria-label="${esc(label)}"><button type="button" class="sp-btn" data-step="1" data-for="${name}" ${disabled ? "disabled" : ""} aria-label="${esc(label)}を1増やす">+</button></span>`;

const controlHtml = (f: ConfigField, v: unknown, disabled: boolean): string => {
  const name = `cfg.${f.key}`;
  switch (f.kind) {
    case "int":
      return stepperHtml(name, v as number, f.min, f.max, disabled, f.label);
    case "intPair": {
      const pair = v as [number, number];
      return `<span class="sp-pair">${f.parts
        .map((part, i) => `<label><i>${esc(part)}</i>${stepperHtml(`${name}.${i}`, pair[i], f.min, f.max, disabled, `${f.label}(${part})`)}</label>`)
        .join("")}</span>`;
    }
    case "intList":
      return `<input type="text" class="sp-list" name="${name}" value="${esc((v as number[]).join(","))}" ${disabled ? "disabled" : ""} aria-label="${esc(f.label)}" placeholder="なし">`;
    case "optInt": {
      const opts = [`<option value=""${v === null ? " selected" : ""}>${esc(f.nullLabel)}</option>`];
      for (let n = f.min; n <= f.max; n++) opts.push(`<option value="${n}"${v === n ? " selected" : ""}>${n}</option>`);
      return `<select name="${name}" ${disabled ? "disabled" : ""} aria-label="${esc(f.label)}">${opts.join("")}</select>`;
    }
    case "choice":
      return `<span class="sp-seg" role="radiogroup" aria-label="${esc(f.label)}">${f.choices
        .map(
          (c) => `<label class="${c.value === v ? "on" : ""}"><input type="radio" name="${name}" value="${esc(c.value)}" ${c.value === v ? "checked" : ""} ${disabled ? "disabled" : ""}><span>${esc(c.label)}</span></label>`,
        )
        .join("")}</span>`;
    default:
      return `<label class="sp-toggle"><input type="checkbox" name="${name}" ${v === true ? "checked" : ""} ${disabled ? "disabled" : ""}><span class="sp-knob" aria-hidden="true"></span><span class="sp-toggle-text">${v === true ? "オン" : "オフ"}</span></label>`;
  }
};

const readField = (form: HTMLFormElement, f: ConfigField): unknown => {
  const get = (n: string): Element | RadioNodeList | null => form.elements.namedItem(n);
  const name = `cfg.${f.key}`;
  switch (f.kind) {
    case "int":
      return Number((get(name) as HTMLInputElement).value);
    case "intPair":
      return [0, 1].map((i) => Number((get(`${name}.${i}`) as HTMLInputElement).value));
    case "intList": {
      const raw = (get(name) as HTMLInputElement).value.trim();
      return raw === "" ? [] : raw.split(/[,、\s]+/).filter((x) => x !== "").map(Number);
    }
    case "optInt": {
      const raw = (get(name) as HTMLSelectElement).value;
      return raw === "" ? null : Number(raw);
    }
    case "choice":
      return (get(name) as RadioNodeList).value;
    default:
      return (get(name) as HTMLInputElement).checked;
  }
};

/** Mounts the panel into `host`: a <dialog> (opened modally, closed on a submit) or any element of a page. */
export const openSettingsPanel = async (host: HTMLElement, opts: PanelOptions): Promise<void> => {
  const page = !(host instanceof HTMLDialogElement);
  // the card previews use the marks of the 記号体系 (once per page) and the print kit's art
  ensureMarks(host.ownerDocument);
  watchArtErrors(host.ownerDocument);
  const me = {};
  mounted.set(host, me);
  const live = (): boolean => mounted.get(host) === me;
  const printed = await opts.loadPack(opts.settings.pack);
  const w: Work = {
    rule: opts.settings.rule,
    pack: opts.settings.pack,
    cfg: presetConfig(opts.settings.rule, opts.settings.config),
    cards: { ...opts.settings.cards },
    printed,
  };
  // one section at a time, picked from the side tabs; the balance talk's variables first.
  // The card section keeps its focus and picks across renders.
  let shown = "economy";
  const cardUi = initialCardUi(printed);
  let error = "";
  let notice = "";
  /** 「すべて基準に戻す」 was pressed once: the footer asks before wiping everything. */
  let confirmResetAll = false;
  /** A submit is on its way (a proposal to the server, a page change): the actions wait. */
  let busy = false;
  /**
   * A field's change event fires as the focus leaves it — between the mousedown
   * and the mouseup of the click that took the focus away. Rebuilding the form
   * then swaps the element under the pointer and the click never happens, so a
   * redraw asked for while a button is held waits for the click to land.
   */
  let pointerHeld = false;
  let renderPending = false;
  /** What onChange last heard about, so a redraw that changes nothing stays quiet. */
  let told = "";

  const settingsOf = (): GameSettings => ({
    rule: w.rule,
    pack: w.pack,
    config: diffPatch(presetConfig(w.rule), w.cfg),
    cards: normalizeCardOverrides(w.printed, w.cards),
  });

  const base = (): Config => presetConfig(w.rule);

  const groupHtml = (gid: string, label: string): string => {
    const fields = CONFIG_SCHEMA.filter((f) => f.group === gid);
    const b = base() as unknown as Record<string, unknown>;
    const cur = w.cfg as unknown as Record<string, unknown>;
    const changed = fields.filter((f) => !sameValue(b[f.key], cur[f.key])).length;
    const rows = fields
      .map((f) => {
        const locked = opts.mode === "midgame" && !f.midGame;
        const mod = !sameValue(b[f.key], cur[f.key]);
        const live = opts.current as unknown as Record<string, unknown> | undefined;
        const pending = live !== undefined && !sameValue(live[f.key], cur[f.key]);
        return `<div class="sp-row${mod ? " is-mod" : ""}${locked ? " is-locked" : ""}${pending ? " is-pending" : ""}">
          <div class="sp-label"><span class="sp-name">${mod ? '<i class="sp-dot" title="基準から変更"></i>' : ""}${esc(f.label)}</span>
            <span class="sp-desc">${esc(f.desc)}${mod ? ` <span class="sp-base">基準: ${esc(formatConfigValue(f, b[f.key]))}</span>` : ""}${
              locked ? ' <span class="sp-lock">次の試合から</span>' : ""
            }</span></div>
          <div class="sp-ctl">${controlHtml(f, cur[f.key], locked)}</div>
        </div>`;
      })
      .join("");
    // every section stays in the form (collect reads all of them); only the shown one is visible
    return `<section class="sp-group" data-group="${gid}" ${shown === gid ? "" : "hidden"}>
      <div class="sp-ghead"><h3 class="sp-gname">${esc(label)}</h3>${changed > 0 ? `<span class="sp-count">${changed}項目変更</span>` : ""}
        <button type="button" class="btn btn-quiet sp-reset" data-reset="${gid}" ${changed === 0 ? "disabled" : ""}>この区分を戻す</button></div>
      <div class="sp-rows">${rows}</div>
    </section>`;
  };

  const groupChangeCount = (gid: string): number => {
    const b = base() as unknown as Record<string, unknown>;
    const cur = w.cfg as unknown as Record<string, unknown>;
    return CONFIG_SCHEMA.filter((f) => f.group === gid && !sameValue(b[f.key], cur[f.key])).length;
  };

  const navHtml = (): string => {
    const tab = (gid: string, label: string, count: number): string =>
      `<button type="button" class="sp-tab${shown === gid ? " on" : ""}" data-nav="${gid}" aria-current="${shown === gid ? "true" : "false"}"><span>${esc(label)}</span>${
        count > 0 ? `<b class="sp-tab-count">${count}</b>` : ""
      }</button>`;
    return `<nav class="sp-nav" aria-label="設定の区分">${CONFIG_GROUPS.map((g) => tab(g.id, g.label, groupChangeCount(g.id))).join("")}${tab(
      "cards",
      "カード(数値・攻撃範囲)",
      cardSectionCount(cardWork()),
    )}</nav>`;
  };

  const cardWork = (): CardWork => ({ printed: w.printed, cards: w.cards, cfg: w.cfg, packName: w.pack, locked: false });

  /** midgame: what the edited cards change against the cards in play. */
  const cardEditsNow = (): CardOverrides =>
    opts.mode !== "midgame"
      ? {}
      : overridesBetween(applyCardOverrides(w.printed, opts.currentCards ?? {}), applyCardOverrides(w.printed, normalizeCardOverrides(w.printed, w.cards)));

  const cardsHtml = (): string => cardSectionHtml(cardWork(), cardUi, shown === "cards");

  /** Range / blind / gap relations on the edited cards, as the server will check them. */
  const cardProblem = (): string => {
    const parsed = parseCardOverrides(normalizeCardOverrides(w.printed, w.cards), w.printed);
    return parsed.ok ? "" : parsed.error;
  };

  const savedHtml = (): string => {
    if (opts.mode === "midgame") return "";
    const saved = listSaved();
    const options = saved.map((s) => `<option value="${esc(s.name)}">${esc(s.name)}</option>`).join("");
    return `<div class="sp-saved">
      <select name="savedPick" aria-label="保存した設定"><option value="">保存した設定…</option>${options}</select>
      <button type="button" class="btn btn-quiet" data-saved="load">読み込む</button>
      <button type="button" class="btn btn-quiet" data-saved="delete">削除</button>
      <input type="text" name="saveName" maxlength="24" placeholder="名前を付けて保存" aria-label="保存する名前">
      <button type="button" class="btn btn-quiet" data-saved="save">保存</button>
      ${opts.shareUrl === null ? "" : '<button type="button" class="btn btn-quiet" data-saved="share">共有URLをコピー</button>'}
    </div>`;
  };

  const actionsHtml = (): string =>
    opts.actions
      .map((a) => `<button type="button" class="btn${a.primary === true ? " btn-gold" : ""}" data-submit="${esc(a.id)}" ${busy ? "disabled" : ""}>${esc(a.label)}</button>`)
      .join("");

  const render = (): void => {
    if (!live()) return; // this panel has been replaced (the page switched mode)
    renderPending = false;
    const s = settingsOf();
    const n = configChanges(base(), w.cfg).length + cardChangeCount(s.cards);
    const pendingCount = opts.current === undefined ? 0 : configChanges(opts.current, w.cfg).length + cardChangeCount(cardEditsNow());
    const ruleSeg = Object.values(RULE_PRESETS)
      .map((r) => `<label class="${r.id === w.rule ? "on" : ""}"><input type="radio" name="rule" value="${r.id}" ${r.id === w.rule ? "checked" : ""} ${opts.allowRuleAndPack ? "" : "disabled"}><span>${esc(r.label)}</span></label>`)
      .join("");
    const packOpts = PLAYABLE_PACKS.map((p) => `<option value="${p}"${p === w.pack ? " selected" : ""}>${p}</option>`).join("");
    // the picked bundle is read back from the settings, so an edit afterwards turns the picker to 「(なし)」 by itself
    const bundle = matchingSettingPreset(s, w.printed);
    const bundleOpts = [
      `<option value=""${bundle === null ? " selected" : ""}>(なし)</option>`,
      ...SETTING_PRESET_IDS.map((id) => `<option value="${id}"${id === bundle ? " selected" : ""}>${esc(SETTING_PRESETS[id].label)}</option>`),
    ].join("");
    // the hint lives on the control itself; the line below the row appears only
    // when there is a real note to read, so an untouched page keeps its height
    // (on a phone the header is what pushes the first section under the footer)
    const bundleHint = "調整案を選ぶと、ルールとカードがまとめてその案の値になります。";
    const bundleNote = bundle === null ? "" : SETTING_PRESETS[bundle].note;
    const form = host.querySelector<HTMLFormElement>("form.sp");
    // every scroller keeps its place across the redraw: the form (phones), the body (wide), the tab row, the card table, the page
    const scrolled = SCROLLERS.map((sel) => {
      const el = sel === "form.sp" ? form : form?.querySelector(sel);
      return { sel, top: el?.scrollTop ?? 0, left: el?.scrollLeft ?? 0 };
    });
    const pageScroll = { x: window.scrollX, y: window.scrollY };
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active !== null && host.contains(active) ? (active.getAttribute("name") ?? active.dataset.for ?? "") + "|" + (active.dataset.step ?? "") : "";
    const extras = form === null ? null : new FormData(form);
    const title = opts.title === undefined || opts.title === "" ? "" : `<h2>${esc(opts.title)}</h2>`;
    host.innerHTML = `<form method="dialog" class="sp${page ? " sp-page" : ""}" novalidate>
      <header class="sp-head">
        <div class="sp-base-row">
          ${title}
          <span class="sp-seg sp-rule" role="radiogroup" aria-label="基準ルール">${ruleSeg}</span>
          <label class="sp-bundle"><i>調整案</i><select name="bundle" aria-label="調整案" title="${esc(bundleNote === "" ? bundleHint : bundleNote)}">${bundleOpts}</select></label>
          <select name="pack" aria-label="パック" ${opts.allowRuleAndPack ? "" : "disabled"}>${packOpts}</select>
          <span class="sp-total">${esc(RULE_PRESETS[w.rule].label)} <b>${n > 0 ? `+${n}項目変更` : "基準のまま"}</b>${
            opts.mode === "midgame" ? ` / 今のルールから <b>${pendingCount}</b>項目` : ""
          }</span>
        </div>
        ${bundleNote === "" ? "" : `<p class="sp-bundle-note">${esc(bundleNote)}</p>`}
        <div class="sp-sub-row">
          ${opts.extraHtml === undefined ? "" : `<div class="sp-extra">${opts.extraHtml}</div>`}
          ${savedHtml()}
        </div>
      </header>
      <div class="sp-main">
        ${navHtml()}
        <div class="sp-body">
          ${opts.mode === "midgame" ? '<p class="sp-note">変更は次の操作から有効です(盤上の式神にもすぐ反映)。灰色の項目は次の試合から変えられます。</p>' : ""}
          ${CONFIG_GROUPS.map((g) => groupHtml(g.id, g.label)).join("")}
          ${cardsHtml()}
        </div>
      </div>
      <footer class="sp-foot${confirmResetAll ? " is-asking" : ""}">
        ${
          confirmResetAll
            ? '<span class="sp-ask">ルールとカードをすべて基準に戻しますか?</span><button type="button" class="btn btn-red" data-reset="all">戻す</button><button type="button" class="btn btn-quiet" data-reset-cancel="1">やめる</button>'
            : '<button type="button" class="btn btn-quiet" data-reset-ask="1">すべて基準に戻す</button>'
        }
        <span class="sp-msg${error === "" ? "" : " err"}" role="status">${esc(error || notice)}</span>
        ${page ? "" : '<button type="submit" class="btn btn-quiet" value="cancel" formnovalidate>閉じる</button>'}
        <span class="sp-actions">${actionsHtml()}</span>
      </footer>
    </form>`;
    const next = host.querySelector<HTMLFormElement>("form.sp");
    if (next !== null && extras !== null) {
      for (const [k, v] of extras.entries()) {
        const el = next.elements.namedItem(k);
        if (el instanceof HTMLInputElement && el.type !== "radio" && el.type !== "checkbox" && !k.startsWith("cfg.") && !k.startsWith("card.")) el.value = String(v);
        // a pick whose option is gone (the saved settings it named were deleted) leaves the list on its first entry
        // ("bundle" is read back from the settings themselves: the old pick must not stick after an edit)
        if (el instanceof HTMLSelectElement && !k.startsWith("cfg.") && k !== "pack" && k !== "bundle" && [...el.options].some((o) => o.value === String(v))) {
          el.value = String(v);
        }
      }
    }
    if (page) measureStickies();
    for (const s of scrolled) {
      const el = s.sel === "form.sp" ? next : next?.querySelector(s.sel);
      if (el === null || el === undefined) continue;
      el.scrollTop = s.top;
      el.scrollLeft = s.left;
    }
    // the document is the page's scroller: a redraw must not move it
    if (page && (window.scrollX !== pageScroll.x || window.scrollY !== pageScroll.y)) window.scrollTo(pageScroll.x, pageScroll.y);
    showActiveTab();
    if (focusKey !== "" && next !== null) {
      const [name, step] = focusKey.split("|");
      const target =
        step !== ""
          ? next.querySelector<HTMLElement>(`button[data-for="${CSS.escape(name)}"][data-step="${CSS.escape(step)}"]`)
          : next.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`);
      target?.focus({ preventScroll: true });
    }
    if (opts.onChange !== undefined) {
      const encoded = encodeSettings(s);
      if (encoded !== told) {
        told = encoded;
        opts.onChange(s, encoded);
      }
    }
  };

  /** Draws now, or after the click being made (see pointerHeld). */
  const renderSoon = (): void => {
    if (pointerHeld) {
      renderPending = true;
      return;
    }
    render();
  };

  /**
   * Page layout: the height stuck to the top above the content (the tab row
   * on phones, nothing beside side tabs) and the footer's height, for the
   * sticky table head, the card editor and the side tabs' height.
   */
  const measureStickies = (): void => {
    const form = host.querySelector<HTMLFormElement>("form.sp");
    const nav = form?.querySelector<HTMLElement>(".sp-nav");
    const foot = form?.querySelector<HTMLElement>(".sp-foot");
    if (form === null || form === undefined || nav === null || nav === undefined || foot === null || foot === undefined) return;
    const row = getComputedStyle(nav).flexDirection === "row";
    form.style.setProperty("--sp-stick", `${row ? nav.offsetHeight : 0}px`);
    form.style.setProperty("--sp-foot-h", `${foot.offsetHeight}px`);
  };

  /** The active tab stays inside the tab row's visible part (a sideways row on phones). */
  const showActiveTab = (): void => {
    const nav = host.querySelector<HTMLElement>(".sp-nav");
    const tab = nav?.querySelector<HTMLElement>(".sp-tab.on");
    if (nav === null || nav === undefined || tab === null || tab === undefined) return;
    const n = nav.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    if (nav.scrollWidth > nav.clientWidth + 1) {
      if (t.left < n.left) nav.scrollLeft -= n.left - t.left + 12;
      else if (t.right > n.right) nav.scrollLeft += t.right - n.right + 12;
    }
    if (nav.scrollHeight > nav.clientHeight + 1) {
      if (t.top < n.top) nav.scrollTop -= n.top - t.top + 8;
      else if (t.bottom > n.bottom) nav.scrollTop += t.bottom - n.bottom + 8;
    }
  };

  /**
   * A newly picked section starts at its top: the body scrolls to 0 and, where
   * the whole form (a dialog on a phone) or the document (a page) scrolls,
   * back up to just under the sticky tabs.
   */
  const toSectionTop = (): void => {
    const form = host.querySelector<HTMLFormElement>("form.sp");
    const body = form?.querySelector<HTMLElement>(".sp-body");
    const main = form?.querySelector<HTMLElement>(".sp-main");
    if (form === null || form === undefined || body === null || body === undefined || main === null || main === undefined) return;
    if (page) {
      const top = main.getBoundingClientRect().top + window.scrollY;
      if (window.scrollY > top) window.scrollTo(window.scrollX, top);
      return;
    }
    body.scrollTop = 0;
    if (form.scrollHeight > form.clientHeight + 1) form.scrollTop = Math.min(form.scrollTop, main.offsetTop);
  };

  /** Reads every control back into the working copy; returns the first problem. */
  const collect = (form: HTMLFormElement): string => {
    let problem = "";
    const patch: Record<string, unknown> = {};
    for (const f of CONFIG_SCHEMA) {
      if (opts.mode === "midgame" && !f.midGame) continue;
      const checked = checkFieldValue(f, readField(form, f));
      if (!checked.ok) {
        if (problem === "") problem = checked.error;
        continue;
      }
      patch[f.key] = checked.value;
    }
    w.cfg = applyConfigPatch(w.cfg, patch as ConfigPatch);
    const table = readCardTable(form, cardWork());
    w.cards = table.cards;
    if (problem === "") problem = table.problem;
    if (problem === "") problem = cardProblem();
    if (opts.mode !== "midgame" && problem === "") problem = checkConfigRelations(w.cfg) ?? "";
    return problem;
  };

  const refresh = (): void => {
    const form = host.querySelector<HTMLFormElement>("form.sp");
    if (form === null) return;
    // the working copy follows at once (a click landing now reads it); the redraw may wait for that click
    error = collect(form);
    renderSoon();
  };

  /** Bumped by every base / bundle switch, so a pack load that resolves late is dropped. */
  let switchGen = 0;

  /**
   * 調整案 picked: the working copy becomes that bundle, exactly as if the
   * values had been typed in by hand.
   *
   * Where the base rule may move (setup / between) the bundle is adopted whole:
   * its base preset, its pack, and every rule variable set to the bundle's
   * value, so the result is the bundle and nothing else.
   *
   * Where it may not (a match in progress) only the variables the bundle itself
   * names are touched: the base rule stays what the match is played on, and a
   * change the two sides already agreed on is not quietly undone. Those of the
   * bundle's own variables that cannot change mid-match are held back and named
   * in the notice.
   */
  const applyBundle = async (id: SettingPresetId): Promise<void> => {
    const b = SETTING_PRESETS[id];
    const full = opts.allowRuleAndPack;
    const gen = ++switchGen;
    if (full && b.pack !== w.pack) {
      const pack = await opts.loadPack(b.pack);
      if (gen !== switchGen) return; // the player has moved on: this answer is stale
      w.printed = pack;
      Object.assign(cardUi, initialCardUi(w.printed));
    }
    if (full) {
      w.rule = b.rule;
      w.pack = b.pack;
    }
    const target = presetConfig(b.rule, b.config) as unknown as Record<string, unknown>;
    const cur = w.cfg as unknown as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const held: string[] = [];
    const keys: string[] = full ? CONFIG_SCHEMA.map((f) => f.key) : Object.keys(b.config);
    for (const key of keys) {
      const f = fieldOf(key);
      if (f === undefined) continue;
      if (opts.mode === "midgame" && !f.midGame) {
        if (!sameValue(cur[key], target[key])) held.push(f.label);
        continue;
      }
      patch[key] = target[key];
    }
    w.cfg = applyConfigPatch(w.cfg, patch as ConfigPatch);
    // the bundle's card numbers belong to its own pack; a match on another pack keeps its cards
    const samePack = w.pack === b.pack;
    if (samePack) w.cards = settingPresetSettings(id, w.printed).cards;
    error = "";
    notice = `「${b.label}」を反映しました${held.length > 0 ? `(${held.join("・")}は次の試合から)` : ""}${
      samePack ? "" : `(カードの数値は ${b.pack} 用なので反映していません)`
    }`;
    confirmResetAll = false;
    render();
  };

  const switchBase = async (rule: RulePresetId, pack: PlayablePack): Promise<void> => {
    const keepRules = diffPatch(presetConfig(w.rule), w.cfg);
    const gen = ++switchGen;
    if (pack !== w.pack) {
      const loaded = await opts.loadPack(pack);
      if (gen !== switchGen) return; // another switch happened while this pack loaded
      w.printed = loaded;
      w.cards = {};
      Object.assign(cardUi, initialCardUi(w.printed));
    }
    w.rule = rule;
    w.pack = pack;
    w.cfg = presetConfig(rule, keepRules);
    render();
  };

  const submit = (form: HTMLFormElement, action: string): void => {
    if (busy) return;
    error = collect(form);
    if (error !== "") return render();
    const s = settingsOf();
    const patch = opts.current === undefined ? s.config : diffPatch(opts.current, w.cfg);
    const cardEdits = cardEditsNow();
    if (opts.mode === "midgame" && Object.keys(patch).length === 0 && cardChangeCount(cardEdits) === 0) {
      error = "今のルールとカードから変わる項目がありません";
      return render();
    }
    const data = new FormData(form);
    busy = true;
    notice = "";
    render();
    const done = (r: unknown): void => {
      if (r === false) {
        busy = false;
        return render();
      }
      if (host instanceof HTMLDialogElement) {
        busy = false;
        host.close("submit");
        return;
      }
      // a page leaves for where the settings go: the actions stay disabled meanwhile (a page that stays gets them back)
      setTimeout(() => {
        busy = false;
        render();
      }, PAGE_LEAVE_MS);
    };
    void Promise.resolve(opts.onSubmit({ action, settings: s, patch, cardEdits, form: data })).then(done, (err: unknown) => {
      error = err instanceof Error ? err.message : String(err);
      done(false);
    });
  };

  host.onchange = (ev) => {
    const t = ev.target as HTMLElement;
    const form = host.querySelector<HTMLFormElement>("form.sp");
    if (form === null) return;
    // only typed fields report on losing the focus, i.e. possibly mid-click; every other control
    // reports after its own click has been delivered, so nothing is waiting for it
    if (!(t instanceof HTMLInputElement && (t.type === "number" || t.type === "text"))) pointerHeld = false;
    if (t instanceof HTMLInputElement && t.name === "rule") {
      // the pack follows the base rule while it is that rule's own pack (採用ルール 9/22 has its own)
      if (isRulePresetId(t.value)) {
        const own = w.pack === RULE_PRESETS[w.rule].defaultPack;
        const next = own ? (PLAYABLE_PACKS.find((p) => p === RULE_PRESETS[t.value as RulePresetId].defaultPack) ?? w.pack) : w.pack;
        void switchBase(t.value, next);
      }
      return;
    }
    if (t instanceof HTMLSelectElement && t.name === "pack") {
      const pack = PLAYABLE_PACKS.find((p) => p === t.value) ?? w.pack;
      collect(form);
      void switchBase(w.rule, pack);
      return;
    }
    if (t instanceof HTMLSelectElement && t.name === "bundle") {
      // 「(なし)」 applies nothing: the list goes back to what the settings say
      // (and a bundle still waiting for its pack is dropped)
      if (!isSettingPresetId(t.value)) {
        switchGen += 1;
        return render();
      }
      void applyBundle(t.value).catch((err: unknown) => {
        error = err instanceof Error ? err.message : String(err);
        render();
      });
      return;
    }
    if (t instanceof HTMLInputElement && cardSelectChange(t, cardUi)) return refresh();
    if ((t as HTMLInputElement).name?.startsWith("cfg.") || (t as HTMLInputElement).name?.startsWith("card.")) refresh();
  };

  host.onclick = (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>("button");
    const form = host.querySelector<HTMLFormElement>("form.sp");
    if (t === null || form === null) return;
    const d = t.dataset;
    if (d.resetAsk !== undefined || d.resetCancel !== undefined) {
      confirmResetAll = d.resetAsk !== undefined;
      notice = "";
      return render();
    }
    // any other button answers "no" to a pending reset-all question
    if (d.reset !== "all") confirmResetAll = false;
    if (d.nav !== undefined) {
      error = collect(form);
      shown = d.nav;
      render();
      toSectionTop();
      return;
    }
    if (t.closest(".sp-cards") !== null && d.reset === undefined) {
      const problem = collect(form);
      const r = cardClick(t, form, cardWork(), cardUi);
      if (r !== null) {
        w.cards = r.cards;
        notice = r.notice ?? "";
        error = r.error ?? (problem || cardProblem());
        render();
        return;
      }
    }
    if (d.step !== undefined && d.for !== undefined) {
      const input = form.elements.namedItem(d.for);
      if (input instanceof HTMLInputElement) {
        const v = Number(input.value) + Number(d.step);
        input.value = String(Math.min(Number(input.max), Math.max(Number(input.min), v)));
        refresh();
      }
      return;
    }
    if (d.reset !== undefined) {
      ev.preventDefault();
      collect(form);
      if (d.reset === "cards" || d.reset === "all") w.cards = {};
      const b = base() as unknown as Record<string, unknown>;
      const fields = CONFIG_SCHEMA.filter((f) => d.reset === "all" || f.group === d.reset).filter(
        (f) => opts.mode !== "midgame" || f.midGame,
      );
      const patch: Record<string, unknown> = {};
      for (const f of fields) patch[f.key] = b[f.key];
      w.cfg = applyConfigPatch(w.cfg, patch as ConfigPatch);
      error = "";
      notice = d.reset === "all" ? "すべて基準に戻しました" : "";
      confirmResetAll = false;
      render();
      return;
    }
    if (d.saved !== undefined) {
      error = collect(form);
      if (error !== "") return render();
      const s = settingsOf();
      const pick = (form.elements.namedItem("savedPick") as HTMLSelectElement | null)?.value ?? "";
      const name = (form.elements.namedItem("saveName") as HTMLInputElement | null)?.value.trim() ?? "";
      if (d.saved === "save") {
        if (name === "") error = "保存する名前を入れてください";
        else notice = saveNamed(name, s) ? `「${name}」を保存しました` : "保存できませんでした(ブラウザの保存領域)";
      } else if (d.saved === "delete" && pick !== "") {
        deleteSaved(pick);
        notice = `「${pick}」を削除しました`;
      } else if (d.saved === "load" && pick !== "") {
        const found = listSaved().find((x) => x.name === pick);
        if (found !== undefined && found.settings !== null) {
          const loaded = found.settings;
          void opts.loadPack(loaded.pack).then((p) => {
            w.printed = p;
            w.rule = loaded.rule;
            w.pack = loaded.pack;
            w.cfg = presetConfig(loaded.rule, loaded.config);
            w.cards = { ...loaded.cards };
            Object.assign(cardUi, initialCardUi(p));
            notice = `「${pick}」を読み込みました`;
            error = "";
            render();
          });
          return;
        }
      } else if (d.saved === "share" && opts.shareUrl !== null) {
        const url = opts.shareUrl(encodeSettings(s));
        void navigator.clipboard?.writeText(url).then(
          () => {
            notice = "共有URLをコピーしました";
            render();
          },
          () => {
            notice = url;
            render();
          },
        );
        return;
      }
      return render();
    }
    if (d.submit !== undefined) submit(form, d.submit);
  };

  // a button is held: a redraw waits until its click has been delivered (renderSoon)
  host.onmousedown = () => {
    pointerHeld = true;
  };
  window.addEventListener("mouseup", () => {
    if (!live()) return;
    pointerHeld = false;
    // the click of this release is dispatched before a task queued here, so it reaches the element it was pressed on
    setTimeout(() => {
      if (renderPending) render();
    }, 0);
  });

  if (host instanceof HTMLDialogElement) {
    // a fresh panel: the previous session's form must not refill page fields (seat, seed...) over the new values
    if (!host.open) host.innerHTML = "";
    render();
    if (!host.open) host.showModal();
    return;
  }
  host.innerHTML = "";
  render();
  // the phone tab row wraps and changes height with the width: the sticky offsets follow
  window.addEventListener("resize", () => {
    if (live()) measureStickies();
  });
};
