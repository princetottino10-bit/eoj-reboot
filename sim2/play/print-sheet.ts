// The printable card sheets (/print): every card of a pack at true size
// (63 x 88 mm), 3 x 3 on A4 portrait with crop marks, then a one-page 早見表 of
// the ruleset, or (side "back") one page of card backs. Pure string builders:
// the faces are the table's own cardFaceHtml (size lg) scaled to the card by
// print.css, and every number on the 早見表 is read from the config, so the
// page follows the preset in code. print.ts puts this on the page and waits
// for the art and the fonts; scripts/print-cards.ts turns it into a PDF.
//
// Cutting: the nine cards of a page touch (shared cut lines), so two straight
// cuts per line free them: 4 vertical and 4 horizontal cuts along the marks.
import { chipStepsText, fieldOf } from "../src/config-schema.ts";
import type { CardPack } from "../src/cards.ts";
import type { Ctx } from "../src/state.ts";
import type { CardDef, Config } from "../src/types.ts";
import { cardFaceHtml, esc, rangeSvg } from "./cards-view.ts";
import { flames, mark } from "./marks.ts";

/** Sheet geometry in millimetres: A4 portrait, cards edge to edge in the middle. */
export const SHEET = { pageW: 210, pageH: 297, cardW: 63, cardH: 88, cols: 3, rows: 3 } as const;
export const PER_PAGE = SHEET.cols * SHEET.rows;
/** Top left corner of the card grid (the margins are equal on both sides). */
export const GRID_X = (SHEET.pageW - SHEET.cols * SHEET.cardW) / 2;
export const GRID_Y = (SHEET.pageH - SHEET.rows * SHEET.cardH) / 2;
/** Crop marks: their distance from the grid and their length (mm); the outer ends stay 5 mm or more from the paper's edge. */
export const MARK_GAP = 1.5;
export const MARK_LEN = 3.5;

/** Print number order: the T- (玖龍街) cards, then the O- (酒呑) cards, each by number; cards without a number last. */
const printKey = (c: CardDef): [number, number, string] => {
  const m = /^([A-Z]+)-(\d+)$/.exec(c.printId ?? "");
  if (m === null) return [9, 0, c.id];
  return [m[1] === "T" ? 0 : m[1] === "O" ? 1 : 2, Number(m[2]), c.id];
};

/** One copy of every card in the pack, in print number order. */
export const printOrder = (pack: CardPack): CardDef[] =>
  [...pack.cards].sort((a, b) => {
    const ka = printKey(a);
    const kb = printKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || (ka[2] < kb[2] ? -1 : ka[2] > kb[2] ? 1 : 0);
  });

/** Splits a list into pages of PER_PAGE. */
export const pagesOf = <T>(items: readonly T[], per: number = PER_PAGE): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += per) out.push(items.slice(i, i + per));
  return out;
};

const r2 = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * The crop marks of one sheet: a short hairline in the margin at each cut
 * line (4 vertical, 4 horizontal), never over a card.
 */
export const cropMarksSvg = (): string => {
  const { pageW, pageH, cardW, cardH, cols, rows } = SHEET;
  const right = GRID_X + cols * cardW;
  const bottom = GRID_Y + rows * cardH;
  const lines: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number): void => {
    lines.push(`<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}"/>`);
  };
  for (let i = 0; i <= cols; i++) {
    const x = GRID_X + i * cardW;
    line(x, GRID_Y - MARK_GAP - MARK_LEN, x, GRID_Y - MARK_GAP);
    line(x, bottom + MARK_GAP, x, bottom + MARK_GAP + MARK_LEN);
  }
  for (let j = 0; j <= rows; j++) {
    const y = GRID_Y + j * cardH;
    line(GRID_X - MARK_GAP - MARK_LEN, y, GRID_X - MARK_GAP, y);
    line(right + MARK_GAP, y, right + MARK_GAP + MARK_LEN, y);
  }
  return `<svg class="pr-crop" viewBox="0 0 ${pageW} ${pageH}" width="${pageW}mm" height="${pageH}mm" aria-hidden="true">${lines.join("")}</svg>`;
};

const slotStyle = (i: number): string => {
  const col = i % SHEET.cols;
  const row = Math.floor(i / SHEET.cols);
  return `left:${r2(GRID_X + col * SHEET.cardW)}mm;top:${r2(GRID_Y + row * SHEET.cardH)}mm`;
};

/**
 * The sheet's two notes, in the margins between the crop marks and at least
 * 8 mm in from the paper's edge: its name above the first column, how to cut
 * below the middle one.
 */
const notesHtml = (head: string, foot: string): string =>
  `<p class="pr-note pr-head">${esc(head)}</p><p class="pr-note pr-foot">${esc(foot)}</p>`;

/**
 * Paper cards print the card's own words where the table's text notes a part
 * the simulator does not do yet (players at a table can do it by hand). Empty
 * since 10/3: 僵尸公主's 90° turn (the last entry) is in the simulator now.
 */
export const PRINT_TEXT: Record<string, string> = {};

/** The effect text a printed card carries (undefined = the table's own). */
export const printTextOf = (cardId: string): string | undefined =>
  Object.prototype.hasOwnProperty.call(PRINT_TEXT, cardId) ? PRINT_TEXT[cardId] : undefined;

/** One A4 sheet of up to nine card faces. */
export const cardSheetHtml = (ctx: Ctx, cards: readonly CardDef[], page: number, pages: number, title: string): string => {
  const slots = cards
    .map((c, i) => `<div class="pr-slot" style="${slotStyle(i)}">${cardFaceHtml(ctx, c.id, { size: "lg", extraClass: "pr-card", text: printTextOf(c.id) })}</div>`)
    .join("");
  return `<section class="pr-page pr-cards" data-page="${page}">${cropMarksSvg()}${slots}${notesHtml(`${title} カード ${page}/${pages}`, "トンボで縦4本・横4本を切る (63×88mm)")}</section>`;
};

/** The back of a card: the 太極 mark and the game's name on the night lacquer. */
export const cardBackPrintHtml = (): string =>
  `<div class="pr-back"><span class="pr-back-frame"></span>${mark("taiji", "pr-back-mark")}<span class="pr-back-name">陰陽符陣</span></div>`;

/**
 * One sheet of nine backs on the same grid. The grid is centred, so turning
 * the sheet over (long or short edge) puts every back behind a face: the
 * mirror image of this page is itself.
 */
export const backSheetHtml = (title: string): string => {
  const slots = Array.from({ length: PER_PAGE }, (_, i) => `<div class="pr-slot" style="${slotStyle(i)}">${cardBackPrintHtml()}</div>`).join("");
  return `<section class="pr-page pr-cards pr-backs" data-page="back">${cropMarksSvg()}${slots}${notesHtml(`${title} 裏面`, "カードのページの裏に印刷")}</section>`;
};

const choiceLabel = (key: keyof Config, value: unknown): string => {
  const f = fieldOf(key);
  if (f === undefined || f.kind !== "choice") return String(value);
  return f.choices.find((c) => c.value === value)?.label ?? String(value);
};

/** One row of the 早見表: a heading and its text (plain text, escaped when drawn). */
export type QuickRow = { label: string; text: string };

/**
 * The 早見表 of a ruleset, every number taken from `cfg`. Short lines for the
 * table; the cards themselves carry the effects.
 */
export const quickRules = (cfg: Config, deckSize: number): QuickRow[] => {
  const [first, second] = cfg.startMana;
  const timing = cfg.incomeTiming === "turn_end" ? "自分のターン終了時" : "自分のターン開始時";
  const steps = cfg.chipIncomeSteps.length === 0 ? "" : `占拠チップ${chipStepsText(cfg.chipIncomeSteps, cfg.baseIncome)}。`;
  const ratchet = cfg.incomeMode === "ratchet" ? "チップはターン終了時の占拠数まで増え、減らない (収入も下がらない)。" : "収入はその時の占拠数で決まる。";
  const taiji = `太極のマスに召喚すると召喚コスト−${cfg.taijiDiscount} (${cfg.taijiFloor}より下がらない)。`;
  const attr = `同じ属性のマスでHP+${cfg.attrBonus}、反対の属性のマスでHP−${cfg.attrBonus}。`;
  const twoCells =
    cfg.controlCount === "hp"
      ? `HP${cfg.controlCountThreshold}以上の式神は2マス分と数える (ダメージで${cfg.controlCountThreshold}を下回れば1マス)。`
      : cfg.controlCount === "cost"
        ? `召喚コスト${cfg.controlCountThreshold}以上の式神は2マス分と数える。`
        : "";
  const keep = cfg.controlHold === "next_turn_end"
    ? `自分のターン終了時に${cfg.controlWin}マス分を占拠していれば制圧。次の自分のターン終了時まで保てば勝ち (途中で下回れば解ける)。`
    : `自分のターン終了時に${cfg.controlWin}マス分を占拠していれば制圧。次の自分のターン開始時にまだ${cfg.controlWin}マス分あれば勝ち。`;
  const big = cfg.controlBigCells > 0 ? `、${cfg.controlBigCells}マス分以上なら${cfg.controlBigPoints}点` : "";
  const points = `自分のターン終了時に${cfg.controlWin}マス分以上を占拠していれば制圧点1点${big} (減らない)。${cfg.controlPointsToWin}点先取で勝ち。`;
  const hold =
    cfg.controlWinMode === "points" ? points : cfg.controlWinMode === "hold_points" ? `${keep}また、${points}` : keep;
  const reward =
    cfg.killRewardBase === "card"
      ? `${cfg.refundMode === "killer_half" ? "撃破した側" : "撃破された側"}が、撃破された式神の霊力価 (青い炎の数) だけ霊力を得る。`
      : `撃破報酬: ${choiceLabel("refundMode", cfg.refundMode)}が${choiceLabel("killRewardBase", cfg.killRewardBase)}。`;
  const counter =
    cfg.counterMode === "all" && cfg.counterResolve === "chosen"
      ? "物理攻撃を受けて残った敵のうち、反撃範囲に攻撃者がいる物理の式神が全員反撃する。順番は反撃する側が選んで1体ずつ、攻撃者が倒れたら残りはしない。死角から受けたとき・術式の攻撃には反撃しない。"
      : `${choiceLabel("counterMode", cfg.counterMode)}、${choiceLabel("counterResolve", cfg.counterResolve)}。`;
  const refill = cfg.handMode === "replace_discarded" ? "捨てた枚数だけ引く" : `${cfg.handRefill}枚まで引く`;
  const aoe =
    cfg.aoeMode === "off"
      ? "範囲攻撃はなし (すべて単体)。"
      : `${cfg.aoeMode === "no_ff" ? "範囲攻撃は敵だけに当たる。" : cfg.jutsuAoeSparesAllies ? "物理の範囲攻撃は範囲内の味方にも当たる。術式の範囲攻撃は敵だけに当たる。" : "範囲攻撃は範囲内の味方にも当たる。"}`;
  const hand = `手札${cfg.handRefill}枚で始める${cfg.mulligan ? (cfg.mulliganTo === "grave" ? " (開始前に一度だけ、選んだ札を捨て札にして引き直せる)" : " (開始前に一度だけ、選んだ札を山札に戻して引き直せる)") : ""}。ターン終了時、好きなだけ捨ててから${refill}。山札は${deckSize}枚 (各1枚)、尽きたら捨て札を切り直す。`;
  const rows: QuickRow[] = [
    { label: "初期霊力", text: `先手${first}・後手${second}。霊力は${cfg.manaCap}まで貯まる。` },
    { label: "収入", text: `${timing}に${cfg.baseIncome}。${steps}${ratchet}` },
    { label: "太極", text: taiji },
    { label: "属性", text: attr },
    { label: "死角", text: `死角からの物理攻撃はダメージ+${cfg.blindBonus}。` },
    { label: "HPの上限", text: `盤上のHPは${cfg.maxHp}まで。回復はカードのHPを超えて${cfg.maxHp}まで伸びる。`},
    { label: "回転", text: `回転命令は霊力${cfg.rotateCost}で90度。` },
    { label: "範囲攻撃", text: aoe },
    { label: "反撃", text: counter },
    { label: "撃破", text: reward },
    { label: "占拠", text: `自分の式神がいるマスを占拠と数える。${twoCells}` },
    { label: "勝ち", text: cfg.deckOutMode === "second" ? `${hold}どちらかが2回目の山札切れを起こしたら、その補充が終わったところで終了。占拠の多い方の勝ち (同じなら引き分け)。` : hold },
    { label: "生命", text: cfg.lifeValueEnabled ? `生命${cfg.startLife}。撃破された式神の生命価だけ減り、0で負け。` : "生命価なし (生命の増減・生命での勝ち負けはない)。" },
    { label: "手札", text: hand },
  ];
  if (cfg.inheritSummon) rows.push({ label: "継承召喚", text: `自分の式神を、より召喚コストの高い式神に置き換えて召喚できる (位置と向きを引き継ぐ)。${cfg.inheritTaiji ? "" : "太極の上での継承召喚に太極割引はない。"}` });
  if (cfg.freeSummonAttack === "optional") {
    rows.push({
      label: "召喚攻撃",
      text: `召喚した手番に、その式神の1回目の攻撃は攻撃コストなし (${cfg.summonAttackForced ? "" : "攻撃するかは自由。"}【飲酒】などの追加の霊力は払う)。${
        cfg.inheritSummon ? (cfg.freeSummonAttackInherit ? "継承召喚で置いた式神も同じ (置き換えた式神が攻撃済みなら攻撃できない)。" : "継承召喚で置いた式神は攻撃コストを払う。") : ""
      }`,
    });
  }
  if (cfg.summonAttackForced) rows.push({ label: "必ず攻撃", text: "召喚 (継承召喚も) した式神は、攻撃範囲に敵がいて攻撃の霊力が払えるなら、ほかの行動の前にすぐ攻撃する (単体攻撃で敵が複数なら相手は選べる)。" });
  if (cfg.summonLimit !== null) rows.push({ label: "召喚", text: `1ターンに${cfg.summonLimit}回まで。` });
  rows.push({ label: "効果", text: cfg.effects ? "各カードの文面のとおり。" : "カードの効果は使わない。" });
  return rows;
};

/** The marks on a card face, explained once (the same marks the cards use). */
const legendHtml = (): string => {
  const sample = rangeSvg([{ x: 0, y: 1 }, { x: -1, y: 1 }], [{ x: 0, y: -1 }], null, 0, { counter: [{ x: 0, y: 1 }] });
  const item = (icon: string, text: string): string => `<li><span class="pr-li-ic">${icon}</span><span>${text}</span></li>`;
  return `<ul class="pr-legend">${[
    item(mark("mana-ring"), "召喚コスト (霊具は使用コスト)"),
    item(mark("mana"), "上から攻撃コスト・回転コスト"),
    item(mark("hp"), "HP"),
    item(mark("atk"), "ATK"),
    item(flames(1, "pr-flame"), "霊力価 (撃破したときに得る霊力)"),
    item(`${mark("phys")}${mark("jutsu")}`, "物理・術式 / 単体・範囲"),
    item(sample, "間合いの図 (上が正面): 黒▲=自分、朱=攻撃 (○単体・□範囲)、緑=反撃、茶=死角"),
  ].join("")}</ul>`;
};

/** The one-page 早見表 of the ruleset. */
export const quickRulesPageHtml = (cfg: Config, title: string, deckSize: number): string => {
  const rows = quickRules(cfg, deckSize)
    .map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${esc(r.text)}</td></tr>`)
    .join("");
  return `<section class="pr-page pr-rules" data-page="rules"><h1>${esc(title)} 早見表</h1><table class="pr-qr">${rows}</table><h2>カードの見かた</h2>${legendHtml()}</section>`;
};

export type PrintSide = "front" | "back";

/** The whole print document: the card sheets and the 早見表, or the back sheet. */
export const printDocHtml = (ctx: Ctx, title: string, side: PrintSide): string => {
  if (side === "back") return backSheetHtml(title);
  const cards = printOrder(ctx.pack);
  const pages = pagesOf(cards);
  return [...pages.map((p, i) => cardSheetHtml(ctx, p, i + 1, pages.length, title)), quickRulesPageHtml(ctx.cfg, title, cards.length)].join("");
};
