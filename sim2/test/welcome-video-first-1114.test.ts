// 11/14 本人: 来る人はCFページで既に惹かれているので、トップの最初の画面には遊び方動画を出す。
// 盤と札の絵・大きなロゴ(見せ場)は遊び方動画より下へ。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../play/welcome.html", import.meta.url), "utf8");

test("トップ: 遊び方動画はヘッダーのすぐ下、絵とロゴの見せ場より上", () => {
  const head = html.indexOf('<header class="g-head">');
  const video = html.lastIndexOf("<section", html.indexOf('id="w-video"'));
  const hero = html.indexOf('class="w-hero"');
  const art = html.indexOf('class="w-hero-art"');
  const logo = html.indexOf('class="w-logo"');
  for (const [name, i] of Object.entries({ head, video, hero, art, logo })) assert.ok(i >= 0, name);
  assert.ok(head < video, "動画はヘッダーの下");
  assert.ok(video < hero, "動画は見せ場より上");
  assert.ok(video < art, "動画は盤と札の絵より上");
  assert.ok(video < logo, "動画は大きなロゴより上");
  // ヘッダーと動画の間に別の section を挟まない
  assert.ok(!html.slice(head, video).includes("<section"), "動画の前に別の区画がない");
});
