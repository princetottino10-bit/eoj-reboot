// Makes the printable PDFs of /print with headless Chrome:
//   node --experimental-strip-types sim2/scripts/print-cards.ts [--rule r1003] [--pack adopted-1003] [--out sim2/out/print-1003]
// Writes <out>/陰陽符陣_<label>_カード.pdf (the card sheets + 早見表) and
// <out>/陰陽符陣_<label>_裏面.pdf (one sheet of backs). The page is served by
// the local play server on a free port; the fonts come from Google Fonts as
// on the table (without a network the system mincho stands in).
import { mkdirSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join, resolve } from "node:path";
import { createPlayServer } from "../play/server.ts";
import { RULE_PRESETS } from "../src/presets.ts";
import type { RulePresetId } from "../src/presets.ts";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : fallback;
};

const rule = arg("rule", "r1003") as RulePresetId;
const preset = RULE_PRESETS[rule];
if (preset === undefined) throw new Error(`unknown rule ${rule}`);
const pack = arg("pack", preset.defaultPack);
const out = resolve(arg("out", join("sim2", "out", `print-${rule.slice(1)}`)));
const label = preset.label.replace(/\//g, "-");

const main = async (): Promise<void> => {
  mkdirSync(out, { recursive: true });
  const server = createPlayServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const puppeteer = (await import("puppeteer")).default;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    for (const [side, name] of [["front", "カード"], ["back", "裏面"]] as const) {
      const page = await browser.newPage();
      page.on("console", (m) => process.stderr.write(`[page] ${m.text()}\n`));
      await page.goto(`${base}/print?rule=${rule}&pack=${encodeURIComponent(pack)}&side=${side}`, { waitUntil: "networkidle0" });
      await page.waitForSelector("body[data-ready]", { timeout: 60_000 });
      const state = await page.$eval("body", (b) => (b as HTMLElement).dataset.ready);
      if (state !== "1") throw new Error(`/print (${side}) failed: ${await page.$eval("#sheets", (m) => m.textContent)}`);
      const overflow = await page.$$eval(".pr-overflow", (els) => els.length);
      if (overflow > 0) process.stderr.write(`warning: ${overflow} effect text(s) do not fit their box\n`);
      const path = join(out, `陰陽符陣_${label}_${name}.pdf`);
      await page.pdf({ path, preferCSSPageSize: true, printBackground: true });
      process.stdout.write(`${path}\n`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
};

main().catch((e: unknown) => {
  process.stderr.write(`${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
  process.exit(1);
});
