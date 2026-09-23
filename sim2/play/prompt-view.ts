// The prompt bar under the board: what to do now, the prediction summary to
// confirm, and the buttons of the current step. Pure string builder; the
// controller wires the data-act buttons.
import { cardOf } from "../src/cards.ts";
import { armDamage, fxOf, REIGU_MODE_LABEL, REIGU_MODES, reiguTargeting } from "../src/effects.ts";
import type { CounterOrderOutcome } from "../src/counter-order.ts";
import type { LegalEntry, ReiguPreview } from "../src/preview.ts";
import type { Ctx } from "../src/state.ts";
import type { PlayerId } from "../src/types.ts";
import type { BoardView } from "../online/protocol.ts";
import { esc } from "./cards-view.ts";
import { attackSummaryLines, cardName, cellName, inheritSummaryLines, MANA_VALUE_TAG, unitById } from "./render.ts";
import type { Names } from "./render.ts";
import { aimedEntry, handEntries, reiguEntry, reiguForecast, summonFacings } from "./select.ts";
import type { ReiguForecast, Sel } from "./select.ts";

export type PromptKind =
  | { kind: "idle"; text: string }
  | { kind: "main"; legal: LegalEntry[] }
  | { kind: "discard" }
  | { kind: "mulligan" }
  | { kind: "tansu"; uids: number[] }
  /** 案A: this seat puts the counterers of the declared attack in order. */
  | { kind: "counterOrder"; attackerUid: number; uids: number[]; outcomes: CounterOrderOutcome[] }
  | { kind: "over"; text: string };

export type PromptVM = {
  ctx: Ctx;
  board: BoardView;
  names: Names;
  viewer: PlayerId | null;
  hand: string[];
  prompt: PromptKind;
  sel: Sel;
  marked: number;
  tansuIndex: number;
  endConfirm: boolean;
  flash: string;
  /** The counter order being set (counterOrder prompt); absent = the default. */
  counterPick?: number[];
};

const sameOrder = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** 案A prompt: the counterers top to bottom (▲▼ or tap them on the board in order), what that order leads to, 確定. */
const counterOrderBar = (vm: PromptVM, p: Extract<PromptKind, { kind: "counterOrder" }>): string => {
  const pick = vm.counterPick !== undefined && vm.counterPick.length === p.uids.length ? vm.counterPick : p.uids;
  const nm = (uid: number): string => {
    const u = unitById(vm.board, uid);
    return u === undefined ? "?" : `${esc(cardName(vm.ctx, u.cardId))}<span class="muted">(${esc(cellName(u.pos))})</span>`;
  };
  const attacker = unitById(vm.board, p.attackerUid);
  const aName = attacker === undefined ? "攻撃" : `${esc(cardName(vm.ctx, attacker.cardId))}の攻撃`;
  const rows = pick.map(
    (uid, i) =>
      `<span class="co-row"><b class="co-n">${i + 1}</b>${nm(uid)}<button type="button" class="co-mv" data-act="co-up" data-i="${i}" aria-label="${i + 1}番目を上へ"${i === 0 ? " disabled" : ""}>▲</button><button type="button" class="co-mv" data-act="co-down" data-i="${i}" aria-label="${i + 1}番目を下へ"${i === pick.length - 1 ? " disabled" : ""}>▼</button></span>`,
  );
  const out = p.outcomes.find((o) => sameOrder(o.order, pick));
  const lines = [`<span class="co-list" title="▲▼か、盤上の駒を反撃させたい順にタップ">${rows.join("")}</span>`];
  if (out !== undefined) {
    const skipped = pick.length - out.landed.length;
    const kill = out.killer === null ? "攻撃側は撃破されない" : `<b>${nm(out.killer)}</b>の反撃で撃破${skipped > 0 ? `(残り${skipped}体は反撃しない)` : ""}`;
    const moves = out.moves.map((m) => `${nm(m.uid)}が${esc(cellName(m.to))}へ移動`).join("・");
    lines.push(`この順番だと: ${kill}${moves === "" ? "" : ` → ${moves}`}`);
  }
  const def = sameOrder(pick, p.uids);
  return bar(
    "confirm co",
    `<b>反撃の順番</b>(${aName}へ上から順に反撃・撃破したら残りは反撃しない)`,
    lines,
    [btn("co-send", "この順番で確定", "btn-gold"), def ? "" : btn("co-reset", "既定の順番に戻す", "btn-quiet")].filter((b) => b !== ""),
    vm.flash,
  );
};

const btn = (act: string, label: string, cls = "", extra = ""): string =>
  `<button type="button" class="btn ${cls}" data-act="${act}" ${extra}>${label}</button>`;

const bar = (kind: string, hint: string, lines: string[], buttons: string[], flash: string): string =>
  `<div class="pr pr-${kind}">
    ${flash === "" ? "" : `<p class="pr-flash" role="alert">${esc(flash)}</p>`}
    <p class="pr-hint">${hint}</p>
    ${lines.length === 0 ? "" : `<div class="pr-lines">${lines.map((l) => `<div>${l}</div>`).join("")}</div>`}
    ${buttons.length === 0 ? "" : `<div class="pr-btns">${buttons.join("")}</div>`}
  </div>`;

/** Keyboard hints; hidden on touch screens and narrow layouts (table.css). */
const kbd = (text: string): string => `<span class="kbd-hint">${text}</span>`;

/** The board's range colours, the same as the card diagram (隙 = the provisional amber ring). */
const LEGEND =
  '<span class="legend"><i class="lg lg-attack"></i>攻撃範囲 <i class="lg lg-counter"></i>反撃範囲 <i class="lg lg-blind"></i>死角 <i class="lg lg-gap"></i>隙</span>';

const unitHint = (vm: PromptVM, uid: number, own: boolean): string => {
  const u = unitById(vm.board, uid);
  if (u === undefined) return "";
  // The gap explanation lives in the detail panel; repeating it here wraps the bar over the board.
  const who = own ? "" : `${esc(vm.names[u.owner])}の`;
  return `${who}<b>${esc(cardName(vm.ctx, u.cardId))}</b>${own ? ": 丸いメニューから命令を選ぶ" : ""} ${LEGEND}`;
};

/** Confirm lines for a targeted reigu (HTML). */
const reiguLines = (vm: PromptVM, fc: ReiguForecast): string[] => {
  const nm = (uid: number): string => {
    const u = unitById(vm.board, uid);
    return u === undefined ? "" : esc(cardName(vm.ctx, u.cardId));
  };
  const owner = (p: number): string => esc(vm.names[p as 0 | 1]);
  const lines: string[] = [];
  switch (fc.kind) {
    case "strike":
      if (fc.victim === null) {
        lines.push(`<b class="warn">${nm(fc.target.uid)}の正面にユニットがいない</b>`);
        break;
      }
      lines.push(`${nm(fc.target.uid)}の正面 → <b>${nm(fc.victim.uid)}</b>(${owner(fc.victim.owner)})に <b>${fc.dmg}ダメージ</b>(HP ${fc.before}→${fc.after})`);
      if (fc.ally) lines.push('<b class="warn">味方への攻撃です</b>');
      if (fc.destroyed) lines.push(`<b class="warn">撃破</b>${fc.lifeLoss > 0 ? `(${owner(fc.victim.owner)}の生命−${fc.lifeLoss})` : ""}`);
      lines.push('<span class="muted">反撃・死角なし</span>');
      break;
    case "setHp":
      lines.push(`<b>${nm(fc.target.uid)}</b>のHP ${fc.before}→<b>${fc.after}</b>`);
      break;
    case "hide":
      lines.push(`${fc.friendly ? "味方" : "敵"} <b>${nm(fc.target.uid)}</b>を隠す(HP ${fc.before}→${fc.after})${fc.destroyed ? ' <b class="warn">撃破</b>' : ""}`);
      lines.push('<span class="muted">使用者の次のターン開始まで対象外・占拠に数えない</span>');
      break;
    default:
      lines.push(`対象: <b>${nm(fc.target.uid)}</b>`);
  }
  if (fc.buffed) lines.push(`${nm(fc.target.uid)}: 霊具を受けてこのターンATK+1`);
  return lines;
};

/** What a reigu run on a copy did (茨木の左腕 / 閻魔獄卒棒), for its confirm step (HTML). */
export const reiguPreviewLines = (vm: PromptVM, pv: ReiguPreview): string[] => {
  const owner = (p: number): string => esc(vm.names[p as 0 | 1]);
  const lines: string[] = [];
  for (const h of pv.hits) {
    const moved = pv.moves.find((m) => m.uid === h.uid);
    // pushed onto another attribute: the HP change is the damage plus the new cell's attribute
    const attr = moved !== undefined && h.hpBefore - h.dmg !== h.hpAfter ? "・移動先の属性込み" : "";
    lines.push(
      `<b>${esc(cardName(vm.ctx, h.cardId))}</b>(${owner(h.owner)}) <b>−${h.dmg}</b>(HP ${h.hpBefore}→${h.hpAfter}${attr})${h.destroyed ? ' <b class="warn">撃破</b>' : ""}${
        moved === undefined ? "" : ` → ${esc(cellName(moved.to))}へ移動`
      }`,
    );
    if (h.ally) lines.push('<b class="warn">味方への効果です</b>');
  }
  for (const m of pv.moves) {
    if (!pv.hits.some((h) => h.uid === m.uid)) lines.push(`${esc(cardName(vm.ctx, m.cardId))}: ${esc(cellName(m.from))} → ${esc(cellName(m.to))}へ移動`);
  }
  const byCard = vm.ctx.cfg.killRewardBase === "card";
  for (const p of [0, 1]) {
    if (pv.manaGain[p] > 0) lines.push(`${byCard ? "" : "撃破により"}${owner(p)}の霊力+${pv.manaGain[p]}${byCard ? MANA_VALUE_TAG : ""}`);
    if (pv.lifeLoss[p] > 0) lines.push(`${owner(p)}の生命−${pv.lifeLoss[p]}`);
  }
  if (pv.ends !== null) lines.push(`<b class="warn">これで決着: ${pv.ends.winner === null ? "引き分け" : `${owner(pv.ends.winner)}の勝ち`}</b>`);
  lines.push('<span class="muted">反撃・死角なし</span>');
  return lines;
};

/** 茨木の左腕: pick 【拳】 or 【握】 (each with what it does), then confirm the one picked. */
const armBar = (vm: PromptVM, legal: LegalEntry[], s: Extract<Sel, { kind: "reigu" }>, cancel: string, retarget: string): string => {
  const card = cardOf(vm.ctx.pack, vm.hand[s.handIndex]);
  const f = vm.flash;
  const t = s.targetUid === null ? undefined : unitById(vm.board, s.targetUid);
  const who = t === undefined ? "" : `<b>${esc(cardName(vm.ctx, t.cardId))}</b>の正面方向で直近の敵に`;
  const previewOf = (mode: string): ReiguPreview | null => {
    const e = reiguEntry(legal, vm.hand, { ...s, mode: mode as "ken" | "aku", victimUid: null });
    return e?.preview?.kind === "reigu" ? e.preview : null;
  };
  if ((s.mode ?? null) === null) {
    const lines = REIGU_MODES.map((m) => {
      const pv = previewOf(m);
      const bits = pv === null ? [] : reiguPreviewLines(vm, pv).filter((l) => !l.includes("反撃・死角なし"));
      return `【${REIGU_MODE_LABEL[m]}】${m === "ken" ? "1マス遠ざける" : "1マス近づける"}: ${bits.join(" / ")}${pv !== null && pv.moves.length === 0 && pv.hits.every((h) => !h.destroyed) ? ' <span class="muted">(空きがないので動かない)</span>' : ""}`;
    });
    const buttons = REIGU_MODES.map((m) => btn("rmode", `【${REIGU_MODE_LABEL[m]}】`, m === "ken" ? "btn-gold" : "btn-red", `data-mode="${m}"`));
    return bar("pick", `<b>${esc(card.nameJa)}</b>: ${who}${armDamage(vm.ctx, card.id)}ダメージ。どちらを使うか選ぶ`, lines, [...buttons, retarget, cancel], f);
  }
  const mode = s.mode ?? "ken";
  const pv = previewOf(mode);
  const lines = pv === null ? [] : reiguPreviewLines(vm, pv);
  if (pv !== null && pv.moves.length === 0 && pv.hits.every((h) => !h.destroyed)) lines.splice(1, 0, `<span class="muted">${mode === "ken" ? "奥" : "手前"}のマスが空いていないので動かない</span>`);
  return bar("confirm", `<b>${esc(card.nameJa)}</b>【${REIGU_MODE_LABEL[mode]}】を使う:`, lines, [btn("confirm", `使う(霊力−${card.summonCost})`, "btn-gold"), btn("remode", "拳/握を選び直す", "btn-quiet"), retarget, cancel], f);
};

/** 閻魔獄卒棒: pick the enemy next to the chosen unit, then confirm. */
const clubBar = (vm: PromptVM, legal: LegalEntry[], s: Extract<Sel, { kind: "reigu" }>, cancel: string, retarget: string): string => {
  const card = cardOf(vm.ctx.pack, vm.hand[s.handIndex]);
  const f = vm.flash;
  const t = s.targetUid === null ? undefined : unitById(vm.board, s.targetUid);
  const tName = t === undefined ? "" : esc(cardName(vm.ctx, t.cardId));
  if ((s.victimUid ?? null) === null) {
    return bar("pick", `<b>${esc(card.nameJa)}</b>: <b>${tName}</b>の隣(死角以外)の敵を盤上で選ぶ`, [], [retarget, cancel], f);
  }
  const e = reiguEntry(legal, vm.hand, s);
  const lines = e?.preview?.kind === "reigu" ? reiguPreviewLines(vm, e.preview) : [];
  return bar("confirm", `<b>${esc(card.nameJa)}</b>を使う(${tName}から):`, lines, [btn("confirm", `使う(霊力−${card.summonCost})`, "btn-gold"), btn("revictim", "敵を選び直す", "btn-quiet"), retarget, cancel], f);
};

/** 劣勢時の大型割引 on a summon, from the legal list's summon previews: " (劣勢割引 −3)", "" when none. */
const summonDiscountNote = (entries: LegalEntry[]): string => {
  const off = Math.max(0, ...entries.map((e) => (e.preview?.kind === "summon" ? e.preview.underdogDiscount : 0)));
  return off > 0 ? ` <span class="pr-disc">(劣勢割引 −${off})</span>` : "";
};

/** The cost of summoning onto one cell, when 劣勢時の大型割引 changes it: " 霊力−10(本来13・劣勢割引)". */
const summonCostNote = (entries: LegalEntry[]): string => {
  const pv = entries.map((e) => e.preview).find((x) => x?.kind === "summon");
  return pv?.kind === "summon" ? ` <span class="pr-disc">霊力−${pv.cost}(本来${pv.costBefore}・劣勢割引)</span>` : "";
};

const mainBar = (vm: PromptVM, legal: LegalEntry[]): string => {
  const s = vm.sel;
  const cancel = btn("cancel", "やめる", "btn-quiet", 'title="Esc"');
  const f = vm.flash;
  if (vm.endConfirm) {
    const left = legal.filter((e) => e.action.kind !== "pass").length;
    const mana = vm.viewer === null ? 0 : vm.board.players[vm.viewer].mana;
    const note = left > 0 ? [`<span class="warn">まだ使える行動があります(霊力 ${mana})</span>`] : [];
    return bar("confirm", "ターンを終了しますか?", note, [btn("end-yes", `終了する${kbd("(Enter)")}`, "btn-gold"), btn("end-no", `戻る${kbd("(Esc)")}`, "btn-quiet")], f);
  }
  switch (s.kind) {
    case "hand": {
      const card = cardOf(vm.ctx.pack, vm.hand[s.handIndex]);
      const inh = handEntries(legal, vm.hand, s.handIndex, "inherit").length > 0;
      const disc = summonDiscountNote(handEntries(legal, vm.hand, s.handIndex, "summon"));
      return bar("pick", `<b>${esc(card.nameJa)}</b>: 光っているマスに召喚${inh ? ' / <span class="violet">紫の破線</span>の駒に継承召喚' : ""}${disc}`, [], [cancel], f);
    }
    case "place": {
      const card = cardOf(vm.ctx.pack, vm.hand[s.handIndex]);
      const at = summonFacings(legal, vm.hand, s.handIndex, s.pos).flatMap((o) => (o.entry === undefined ? [] : [o.entry]));
      return bar("pick", `<b>${esc(card.nameJa)}</b>を${esc(cellName(s.pos))}に置く向きを、盤上の矢印で選ぶ${summonCostNote(at)}`, [], [cancel], f);
    }
    case "inherit": {
      const e = handEntries(legal, vm.hand, s.handIndex, "inherit").find((x) => x.action.kind === "inherit" && x.action.targetUid === s.targetUid);
      const lines = e?.preview?.kind === "inherit" ? inheritSummaryLines(vm.ctx, e.preview) : [];
      return bar("confirm", "継承召喚の内容を確かめて確定", lines, [btn("confirm", "継承召喚する", "btn-violet"), cancel], f);
    }
    case "unit": {
      const u = unitById(vm.board, s.uid);
      const own = u !== undefined && u.owner === vm.viewer;
      const hint = s.summonAttack ? `召喚攻撃ができる: ${unitHint(vm, s.uid, true)}` : unitHint(vm, s.uid, own);
      return bar("unit", hint, [], [btn("cancel", s.summonAttack ? "召喚攻撃をしない" : "選択を解く", "btn-quiet", 'title="Esc"')], f);
    }
    case "aim": {
      const verb = s.mode === "heal" ? "回復" : s.mode === "konshin" ? "渾身攻撃" : s.mode === "regen" ? "再生攻撃" : s.mode === "drink" ? "飲酒攻撃" : "攻撃";
      const e = aimedEntry(legal, s);
      if (e === undefined) {
        return bar("pick", `${verb}する${s.mode === "heal" ? "味方" : "相手"}を盤上で選ぶ ${LEGEND}`, [], [cancel], f);
      }
      const lines = e.preview?.kind === "attack" ? attackSummaryLines(vm.ctx, vm.board, vm.names, s.uid, e.preview) : [];
      const cost = e.preview?.kind === "attack" ? `(霊力−${e.preview.cost})` : "";
      const buttons = [btn("confirm", `${verb}を確定${cost}`, s.mode === "heal" ? "btn-jade" : "btn-red")];
      if (!s.area) buttons.push(btn("retarget", "対象を選び直す", "btn-quiet"));
      buttons.push(cancel);
      const who = unitById(vm.board, s.uid);
      return bar("confirm", `<b>${who === undefined ? "" : esc(cardName(vm.ctx, who.cardId))}</b>の${verb}:`, lines, buttons, f);
    }
    case "proxy": {
      if (s.targetUid === null) return bar("pick", "代理回転: 回す式神を盤上で選ぶ", [], [cancel], f);
      const t = unitById(vm.board, s.targetUid);
      return bar("pick", `代理回転: <b>${t === undefined ? "" : esc(cardName(vm.ctx, t.cardId))}</b>の向きを盤上の矢印で選ぶ`, [], [btn("retarget", "対象を選び直す", "btn-quiet"), cancel], f);
    }
    case "reigu": {
      const card = cardOf(vm.ctx.pack, vm.hand[s.handIndex]);
      const entries = handEntries(legal, vm.hand, s.handIndex, "reigu");
      if (reiguTargeting(fxOf(vm.ctx, card.id)) === "none") {
        return bar("confirm", `<b>${esc(card.nameJa)}</b>(霊具・対象なし)を使う`, [], [btn("confirm", `使う(霊力−${card.summonCost})`, "btn-gold"), cancel], f);
      }
      const kind = reiguTargeting(fxOf(vm.ctx, card.id));
      if (s.targetUid === null) {
        const what = kind === "unit-own-mode" ? "使う自分の式神" : kind === "unit-own-victim" ? "使う自分の式神(酒呑一門)" : "対象";
        return bar("pick", `<b>${esc(card.nameJa)}</b>: ${what}を盤上で選ぶ`, [], [cancel], f);
      }
      const retarget = btn("retarget", "対象を選び直す", "btn-quiet");
      if (kind === "unit-own-mode") return armBar(vm, legal, s, cancel, retarget);
      if (kind === "unit-own-victim") return clubBar(vm, legal, s, cancel, retarget);
      const t = unitById(vm.board, s.targetUid);
      const turning = entries.some((e) => e.action.kind === "reigu" && e.action.targetUid === s.targetUid && e.action.facing !== null);
      if (turning) {
        return bar("pick", `<b>${esc(card.nameJa)}</b>: ${t === undefined ? "" : `<b>${esc(cardName(vm.ctx, t.cardId))}</b>の`}向きを盤上の矢印で選ぶ`, [], [retarget, cancel], f);
      }
      const fc = reiguForecast(vm.ctx, vm.board, card.id, s.targetUid, vm.viewer);
      const lines = fc === null ? [] : reiguLines(vm, fc);
      const risky = fc !== null && fc.kind === "strike" && (fc.ally || fc.victim === null);
      return bar("confirm", `<b>${esc(card.nameJa)}</b>を使う:`, lines, [btn("confirm", `使う(霊力−${card.summonCost})`, risky ? "btn-red" : "btn-gold"), retarget, cancel], f);
    }
    default:
      return bar("idle", `手札の札か、自分の駒を選ぶ${kbd("(Enter でターン終了)")}`, [], [], f);
  }
};

export const promptHtml = (vm: PromptVM): string => {
  const p = vm.prompt;
  switch (p.kind) {
    case "main":
      return mainBar(vm, p.legal);
    case "discard":
    case "mulligan": {
      const mull = p.kind === "mulligan";
      const hint = mull
        ? "マリガン: 山札に戻す札を手札から選ぶ(戻した枚数だけ引き直す)"
        : vm.ctx.cfg.handMode === "replace_discarded"
          ? "手札整理: 捨てる札を選ぶ(0枚でもよい)。捨てた枚数だけ引く"
          : `手札整理: 捨てる札を選ぶ(0枚でもよい)。確定すると${vm.ctx.cfg.handRefill}枚まで引く`;
      return bar(p.kind, hint, [], [
        btn("marks", mull ? `${vm.marked}枚戻して引き直す` : `${vm.marked}枚捨てて確定`, "btn-gold"),
        btn("marks-none", mull ? "このまま始める" : "捨てずに確定", "btn-quiet"),
      ], vm.flash);
    }
    case "tansu": {
      const uid = p.uids[vm.tansuIndex];
      const u = uid === undefined ? undefined : unitById(vm.board, uid);
      const name = u === undefined ? "古箪笥" : cardName(vm.ctx, u.cardId);
      return bar("tansu", `【${esc(name)}】ターン開始の効果: HPを1減らして何を得るか`, [], [
        btn("tansu", "HP−1 → 霊力+1", "btn-gold", 'data-choice="mana"'),
        btn("tansu", "HP−1 → 1枚引く", "", 'data-choice="draw"'),
        btn("tansu", "使わない", "btn-quiet", 'data-choice="skip"'),
      ], vm.flash);
    }
    case "counterOrder":
      return counterOrderBar(vm, p);
    case "over":
      return bar("over", esc(p.text), [], [], vm.flash);
    default: {
      const s = vm.sel;
      const hint = s.kind === "unit" ? `${esc(p.text)} — ${unitHint(vm, s.uid, false)}` : esc(p.text);
      return bar("idle", hint, [], [], vm.flash);
    }
  }
};
