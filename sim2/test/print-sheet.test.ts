// /print: the printable card sheets of 10/3テスト案. Both servers route /print
// to play/print.html and hand out its modules; the sheets carry every card of
// adopted-1003 once, in print number order, at 63 x 88 mm on A4 with crop
// marks in the margins; the 早見表 reads every number from the preset.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig } from "../src/presets.ts";
import { makeCtx } from "../src/state.ts";
import { EFFECT_TEXT } from "../src/effects.ts";
import { createPlayServer, playTarget } from "../play/server.ts";
import { createOnlineApp, createOnlineServer, onlineStaticAllowed, staticTarget } from "../online/server.ts";
import {
  backSheetHtml,
  cropMarksSvg,
  GRID_X,
  GRID_Y,
  MARK_GAP,
  MARK_LEN,
  pagesOf,
  PER_PAGE,
  PRINT_TEXT,
  printDocHtml,
  printOrder,
  printTextOf,
  quickRules,
  SHEET,
} from "../play/print-sheet.ts";

const AC = loadPack(packPath("adopted-1003"));
const CTX = makeCtx(presetConfig("r1003"), AC);
const count = (s: string, needle: string): number => s.split(needle).length - 1;

const MODULES = ["/play/print.html", "/play/print.ts", "/play/print-sheet.ts", "/play/print.css"];

test("print: /print maps to play/print.html on both servers and its files pass the online allowlist", () => {
  for (const path of ["/print", "/print/", "/print?side=back"]) {
    assert.equal(playTarget(path), "/play/print.html", path);
  }
  assert.equal(staticTarget("/print"), "/play/print.html");
  assert.equal(staticTarget("/print/"), "/play/print.html");
  for (const path of MODULES) assert.ok(onlineStaticAllowed(path.slice(1)), path);
});

const listen = async (server: Server): Promise<string> => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

test("print: both servers serve the page and its modules", async () => {
  const servers: Server[] = [createPlayServer(), createOnlineServer(createOnlineApp({ recordDir: mkdtempSync(join(tmpdir(), "sim2-print-")) }))];
  for (const server of servers) {
    const base = await listen(server);
    try {
      const page = await fetch(`${base}/print`);
      assert.equal(page.status, 200);
      assert.match(page.headers.get("content-type") ?? "", /^text\/html/);
      const html = await page.text();
      assert.match(html, /<script type="module" src="\/play\/print\.ts"><\/script>/);
      assert.match(html, /href="\/play\/table\.css"/);
      assert.match(html, /href="\/play\/print\.css"/);
      for (const path of MODULES.slice(1)) {
        const res = await fetch(base + path);
        assert.equal(res.status, 200, path);
        assert.match(res.headers.get("content-type") ?? "", path.endsWith(".css") ? /^text\/css/ : /^text\/javascript/, path);
        await res.arrayBuffer();
      }
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }
});

test("print order: all 23 cards once, T- then O- by number, three sheets of 9 / 9 / 5", () => {
  const order = printOrder(AC);
  assert.equal(order.length, 23);
  assert.deepEqual(new Set(order.map((c) => c.id)).size, 23);
  const ids = order.map((c) => c.printId);
  const want = [...Array.from({ length: 11 }, (_, i) => `T-${String(i + 1).padStart(3, "0")}`), ...Array.from({ length: 12 }, (_, i) => `O-${String(i + 1).padStart(3, "0")}`)];
  assert.deepEqual(ids, want);
  assert.equal(order.filter((c) => c.kind === "shikigami").length, 17);
  assert.equal(order.filter((c) => c.kind === "reigu").length, 6);
  assert.deepEqual(pagesOf(order).map((p) => p.length), [9, 9, 5]);
  assert.equal(PER_PAGE, 9);
});

test("the sheets: true-size lg faces of the table, the 10/3 numbers, crop marks only in the margins", () => {
  const html = printDocHtml(CTX, "10/3テスト案", "front");
  assert.equal(count(html, 'class="pr-page pr-cards"'), 3);
  assert.equal(count(html, 'class="pr-page pr-rules"'), 1);
  // one face per card, the table's lg face
  assert.equal(count(html, 'class="pr-slot"'), 23);
  assert.equal(count(html, "fu fu-lg"), 23);
  for (const c of AC.cards) assert.equal(count(html, `data-card="${c.id}"`), 1, c.id);
  // 10/3 values after the sheet update
  const face = (id: string): string => html.split(`data-card="${id}"`)[1].split('class="pr-slot"')[0];
  assert.match(face("ac16"), /title="HP 11"/, "酒呑童子 HP 11");
  assert.match(face("ac07"), /この式神のATK分だけ対象のHP\+/, "変面 heals the full ATK");
  assert.match(face("ac15"), /攻撃範囲: 前2・前・右前 \/ 反撃範囲: 前2・前・右前 \/ 死角: 右"/, "茨木童子 attack -223 / counter -223 / blind 6");
  assert.match(face("ac23"), /鬼の酒/);
  assert.match(face("ac23"), /O-012/);
  // art where the kit has it
  assert.equal(count(html, "<img "), AC.cards.filter((c) => c.art !== undefined).length);
  // 僵尸公主's 90° turn is in the table now: the paper card and the table say the sheet's words
  assert.equal(printTextOf("ac13"), undefined);
  assert.deepEqual(PRINT_TEXT, {});
  assert.match(face("ac13"), /攻撃・反撃によって対象のHPを0にした場合、その位置に移動する。この時、向きを90度変えられる/);
  assert.doesNotMatch(html, /未実装/);
  assert.doesNotMatch(EFFECT_TEXT.ac13, /未実装/);
  // the grid: centred, margins of 8 mm or more, cards edge to edge
  assert.equal(GRID_X * 2 + SHEET.cols * SHEET.cardW, SHEET.pageW);
  assert.equal(GRID_Y * 2 + SHEET.rows * SHEET.cardH, SHEET.pageH);
  assert.ok(GRID_X >= 8 && GRID_Y >= 8);
  assert.match(html, /<div class="pr-slot" style="left:73\.5mm;top:104\.5mm">/);
  // crop marks: 2 per cut line (4 + 4 lines), none over a card, none closer than 5 mm to the edge
  const svg = cropMarksSvg();
  const lines = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"\/>/g)].map((m) => m.slice(1).map(Number));
  assert.equal(lines.length, 16);
  const inGrid = (x: number, y: number): boolean => x > GRID_X && x < GRID_X + 189 && y > GRID_Y && y < GRID_Y + 264;
  for (const [x1, y1, x2, y2] of lines) {
    assert.ok(!inGrid(x1, y1) && !inGrid(x2, y2) && !inGrid((x1 + x2) / 2, (y1 + y2) / 2), `${x1},${y1}`);
    for (const v of [x1, x2]) assert.ok(v >= 5 && v <= SHEET.pageW - 5, `x ${v}`);
    for (const v of [y1, y2]) assert.ok(v >= 5 && v <= SHEET.pageH - 5, `y ${v}`);
  }
  assert.ok(MARK_GAP > 0 && MARK_LEN > 0);
  assert.equal(count(html, 'class="pr-crop"'), 3);
});

test("the backs: one sheet of nine on the same grid", () => {
  const html = backSheetHtml("10/3テスト案");
  assert.equal(count(html, 'class="pr-back"'), 9);
  assert.equal(count(html, 'class="pr-slot"'), 9);
  assert.match(html, /陰陽符陣/);
  assert.equal(printDocHtml(CTX, "10/3テスト案", "back"), html);
});

test("the 早見表 reads every number from the r1003 preset", () => {
  const cfg = presetConfig("r1003");
  const rows = quickRules(cfg, AC.cards.length);
  const text = (label: string): string => rows.find((r) => r.label === label)?.text ?? "";
  assert.match(text("初期霊力"), /先手6・後手8/);
  assert.match(text("収入"), /自分のターン終了時に6。占拠チップ4枚で7・5枚で9。/);
  assert.match(text("収入"), /減らない/);
  assert.match(text("太極"), /召喚コスト−2 \(1より下がらない\)/);
  assert.match(text("属性"), /HP\+2.*HP−2/);
  assert.match(text("死角"), /ダメージ\+2/);
  assert.match(text("HPの上限"), /19まで/);
  assert.match(text("占拠"), /HP11以上の式神は2マス分/);
  assert.match(text("勝ち"), /5マス分を占拠していれば制圧。次の自分のターン終了時まで保てば勝ち/);
  assert.match(text("生命"), /生命価なし/);
  assert.match(text("手札"), /山札は23枚/);
  assert.match(text("効果"), /各カードの文面/);
  // the numbers follow the config, not the text
  const other = quickRules(presetConfig("r1003", { maxHp: 15, startMana: [5, 7], controlCountThreshold: 12 }), 23);
  const t2 = (label: string): string => other.find((r) => r.label === label)?.text ?? "";
  assert.match(t2("HPの上限"), /15まで/);
  assert.match(t2("初期霊力"), /先手5・後手7/);
  assert.match(t2("占拠"), /HP12以上/);
  // the page
  const page = printDocHtml(CTX, "10/3テスト案", "front").split('class="pr-page pr-rules"')[1];
  assert.match(page, /10\/3テスト案 早見表/);
  assert.equal(count(page, "<tr>"), rows.length);
});
