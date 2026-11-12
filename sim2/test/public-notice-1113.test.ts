// 11/13 本人: 一般の人が遊ぶ公開版に「データやスキル効果は調整中。予告なく変更することがあり、製品版とは異なる」を出す。
// トップ(紹介ページ)の下・対局前の画面・遊び方ページの3か所。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("公開版の注記: 札の数値・効果は調整中、予告なく変わる、製品版とは異なる", () => {
  for (const p of ["play/welcome.html", "play/entry-shell.ts", "play/guide.html"]) {
    const s = read(p);
    assert.match(s, /数値・効果/, p);
    assert.match(s, /調整中/, p);
    assert.match(s, /予告なく/, p);
    assert.match(s, /製品版とは異なります/, p);
  }
});
