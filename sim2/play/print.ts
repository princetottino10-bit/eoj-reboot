// /print: the card sheets of a pack for a paper test play (play/print-sheet.ts).
//   /print                 10/3テスト案 (r1003 + adopted-1003): the cards, then the 早見表
//   /print?side=back       one sheet of card backs
//   /print?rule=r0923&pack=adopted-0922   another preset / pack (both must be known)
// When the art and the fonts have arrived and every effect text fits its box,
// <body data-ready="1"> tells scripts/print-cards.ts to make the PDF.
import { parsePack } from "../src/cards.ts";
import { PLAYABLE_PACKS, presetConfig, RULE_PRESET_IDS, RULE_PRESETS } from "../src/presets.ts";
import type { PlayablePack, RulePresetId } from "../src/presets.ts";
import { makeCtx } from "../src/state.ts";
import { watchArtErrors } from "./cards-view.ts";
import { ensureMarks } from "./marks.ts";
import { printDocHtml } from "./print-sheet.ts";
import type { PrintSide } from "./print-sheet.ts";

const q = new URLSearchParams(location.search);
const pick = <T extends string>(value: string | null, list: readonly T[], fallback: T): T =>
  list.find((x) => x === value) ?? fallback;

const rule: RulePresetId = pick(q.get("rule"), RULE_PRESET_IDS, "r1003");
const pack: PlayablePack = pick(q.get("pack"), PLAYABLE_PACKS, RULE_PRESETS[rule].defaultPack as PlayablePack);
const side: PrintSide = q.get("side") === "back" ? "back" : "front";

/** The smallest effect text (in the card's em) before a text is left to overflow. */
const MIN_TEXT_EM = 0.8;
const TEXT_STEP_EM = 0.05;

/** Shrinks an effect text that does not fit its box, a step at a time (most cards keep the table's size). */
const fitTexts = (root: HTMLElement): void => {
  for (const box of root.querySelectorAll<HTMLElement>(".pr-card .fu-text")) {
    const tx = box.querySelector<HTMLElement>(".fu-tx");
    if (tx === null) continue;
    let em = 1.15;
    while (box.scrollHeight > box.clientHeight + 0.5 && em > MIN_TEXT_EM) {
      em = Math.round((em - TEXT_STEP_EM) * 100) / 100;
      tx.style.fontSize = `${em}em`;
    }
    if (box.scrollHeight > box.clientHeight + 0.5) box.classList.add("pr-overflow");
  }
};

const imagesLoaded = (root: HTMLElement): Promise<unknown> =>
  Promise.all(
    [...root.querySelectorAll("img")].map((img) =>
      img.complete ? Promise.resolve() : new Promise((r) => {
        img.addEventListener("load", r, { once: true });
        img.addEventListener("error", r, { once: true });
      }),
    ),
  );

const main = async (): Promise<void> => {
  const root = document.getElementById("sheets");
  if (root === null) throw new Error("missing #sheets");
  const res = await fetch(`/data/pack-${encodeURIComponent(pack)}.json`);
  if (!res.ok) throw new Error(`パック ${pack} を読み込めません (${res.status})`);
  const ctx = makeCtx(presetConfig(rule), parsePack(await res.json()));
  const title = RULE_PRESETS[rule].label;
  document.title = `陰陽符陣(仮) ${title} ${side === "back" ? "裏面" : "カード"}`;
  ensureMarks(document);
  watchArtErrors(document);
  root.innerHTML = printDocHtml(ctx, title, side);
  await Promise.all([imagesLoaded(root), document.fonts.ready]);
  fitTexts(root);
  document.body.dataset.ready = "1";
};

main().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  const root = document.getElementById("sheets");
  if (root !== null) root.textContent = `印刷用のページを作れませんでした: ${msg}`;
  document.body.dataset.ready = "error";
});
