// Current-rules preset, destruction mana knobs, and editing card ranges /
// status (one card or many at once) all the way into a match.
import test from "node:test";
import assert from "node:assert/strict";
import { applyCardOverrides, cardChanges, normalizeCardOverrides, parseCardOverrides } from "../src/card-overrides.ts";
import { bulkStat, copyShape, costCounts, noChips, paintCell, resetCards, selectByChips, selectCards } from "../src/card-edits.ts";
import { destroyUnit, enemiesInRange, killReward } from "../src/combat.ts";
import { formatTenkey, parseTenkey } from "../src/cards.ts";
import { presetConfig, RULE_PRESETS } from "../src/presets.ts";
import { incomeFor } from "../src/rules.ts";
import { decodeSettings, defaultSettings, encodeSettings } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import { makeCtx, unitHp } from "../src/state.ts";
import { createFlow, replayFlow, submit } from "../src/flow.ts";
import { applyCardChange } from "../src/rule-change.ts";
import type { GameEvent } from "../src/types.ts";
import { cardFaceHtml } from "../play/cards-view.ts";
import { blankState, place } from "./helpers.ts";
import { SK } from "./online-helpers.ts";

test("9/14ルール = 9/13 rules with chip steps 3/4/5 (the default until 採用ルール 9/22); every preset's taiji discount is 1", () => {
  const now = presetConfig("r0914");
  const old = presetConfig("r0913");
  for (const id of ["r0923", "r0914", "r0913", "r0828"] as const) assert.equal(presetConfig(id).taijiDiscount, 1, id);
  assert.deepEqual(now.chipIncomeSteps, [3, 4, 5]);
  assert.deepEqual({ ...now, chipIncomeSteps: old.chipIncomeSteps }, old);
  // 採用ルール 9/22 is the default since 9/23 (pinned in adopted-0922.test.ts)
  assert.equal(defaultSettings().rule, "r0923");
  const ctx = makeCtx(now, SK);
  assert.deepEqual([2, 3, 4, 5, 6].map((chips) => incomeFor(ctx, chips) - now.baseIncome), [0, 1, 2, 3, 3]);
  // the preset table is not reachable through a returned config
  now.chipIncomeSteps.push(9);
  assert.deepEqual(RULE_PRESETS.r0914.overrides.chipIncomeSteps, [3, 4, 5]);
});

test("destruction mana: half rounded down by default; base and bonus change it, never below 0", () => {
  const oni = SK.byId.get("sk16"); // 酒呑童子, cost 6
  const kasa = SK.byId.get("sk05"); // 鎖鬼, cost 3
  assert.ok(oni !== undefined && kasa !== undefined);
  const reward = (over: object, card = kasa) => killReward(makeCtx(presetConfig("r0914", over), SK), card);
  assert.equal(reward({}), 1);
  assert.equal(reward({ killRewardBase: "half_ceil" }), 2);
  assert.equal(reward({ killRewardBase: "full" }), 3);
  assert.equal(reward({ killRewardBase: "zero", killRewardBonus: 2 }), 2);
  assert.equal(reward({ killRewardBonus: -5 }, oni), 0);
  assert.equal(reward({ killRewardBonus: 1 }, oni), 4);
  // and the engine pays it to the killer under killer_half
  const ctx = makeCtx(presetConfig("r0914", { killRewardBase: "full", killRewardBonus: 1 }), SK);
  const s = blankState(ctx, 0);
  place(s, "sk05", 1, 1, 1, 0);
  const u = s.units[0];
  assert.ok(u !== undefined);
  const events: GameEvent[] = [];
  destroyUnit(ctx, s, u, events, 0);
  assert.equal(s.players[0].mana, 4);
  assert.equal(s.players[1].mana, 0);
});

test("card overrides: range, blind spots, gap, attribute, type and area are validated", () => {
  const ok = parseCardOverrides(
    { sk03: { attackRange: [{ x: 0, y: 2 }, { x: 0, y: 1 }], blindSpots: [{ x: 0, y: -1 }], attribute: "yang", attackType: "jutsu", aoe: true, gapCell: { x: 0, y: 2 } } },
    SK,
  );
  assert.equal(ok.ok, true, ok.ok ? "" : ok.error);
  const bad: unknown[] = [
    { sk03: { attackRange: [{ x: 3, y: 0 }] } }, // beyond two cells
    { sk03: { attackRange: [{ x: 0, y: 0 }] } }, // the piece itself
    { sk03: { attackRange: [{ x: 0, y: 1 }, { x: 0, y: 1 }] } }, // duplicate
    { sk03: { blindSpots: [{ x: 0, y: 1 }] } }, // printed range already has the front cell
    { sk05: { gapCell: { x: 1, y: -1 } } }, // area card, gap outside its range
    { sk03: { attribute: "fire" } },
    { sk03: { attackType: "magic" } },
    { sk03: { aoe: "yes" } },
    { sk18: { attackRange: [{ x: 0, y: 1 }] } }, // a reigu has no range
    { sk03: { speed: 2 } },
  ];
  for (const v of bad) assert.equal(parseCardOverrides(v, SK).ok, false, JSON.stringify(v));
  // shape-only check without a pack still refuses a self-contradicting edit
  assert.equal(parseCardOverrides({ sk03: { attackRange: [{ x: 0, y: 1 }], blindSpots: [{ x: 0, y: 1 }] } }, null).ok, false);
});

test("a range override reaches the match; counter range follows a printed default; the printed pack is untouched", () => {
  const edits = { sk03: { attackRange: [{ x: 0, y: 2 }] } };
  const pack = applyCardOverrides(SK, edits);
  const printed = SK.byId.get("sk03");
  const edited = pack.byId.get("sk03");
  assert.ok(printed !== undefined && edited !== undefined);
  assert.deepEqual(printed.attackRange, [{ x: 0, y: 1 }]);
  assert.deepEqual(edited.attackRange, [{ x: 0, y: 2 }]);
  assert.deepEqual(edited.counterRange, [{ x: 0, y: 2 }]);
  const ctx = makeCtx(presetConfig("r0914"), pack);
  const s = blankState(ctx);
  place(s, "sk03", 0, 1, 0, 0);
  place(s, "sk02", 1, 1, 1, 2); // one step ahead: out of the new range
  place(s, "sk02", 1, 1, 2, 2); // two steps ahead: in range
  const attacker = s.units[0];
  assert.ok(attacker !== undefined);
  assert.deepEqual(enemiesInRange(ctx, s, attacker).map((u) => u.pos), [{ x: 1, y: 2 }]);
  // same cells in another order are "unchanged"
  const printedOrder = normalizeCardOverrides(SK, { sk05: { attackRange: [...(SK.byId.get("sk05")?.attackRange ?? [])].reverse() } });
  assert.deepEqual(printedOrder, {});
});

test("painting the grid: attack / blind are exclusive, gap marks an attack cell, erase clears", () => {
  let c = paintCell(SK, {}, "sk09", "attack", { x: 0, y: 2 });
  assert.equal(c.sk09?.attackRange?.some((p) => p.x === 0 && p.y === 2), true);
  c = paintCell(SK, c, "sk09", "blind", { x: 0, y: 2 });
  assert.equal(c.sk09?.attackRange?.some((p) => p.x === 0 && p.y === 2), false);
  assert.equal(c.sk09?.blindSpots?.some((p) => p.x === 0 && p.y === 2), true);
  c = paintCell(SK, c, "sk09", "gap", { x: -1, y: 0 }); // an attack cell of 一目鬼
  assert.deepEqual(c.sk09?.gapCell, { x: -1, y: 0 });
  c = paintCell(SK, c, "sk09", "erase", { x: -1, y: 0 });
  assert.equal(c.sk09?.gapCell, null);
  assert.equal(parseCardOverrides(normalizeCardOverrides(SK, c), SK).ok, true);
  assert.equal(paintCell(SK, c, "sk09", "attack", { x: 0, y: 0 }), c, "the piece's own cell is not paintable");
  assert.equal(paintCell(SK, c, "sk18", "attack", { x: 0, y: 1 }), c, "reigu have no range");
});

test("bulk edits: select by kind / attribute, +-1 with clamping, set with skips, copy a range, reset", () => {
  const shiki = selectCards(SK, {}, "shikigami");
  assert.equal(shiki.length, SK.cards.filter((x) => x.kind === "shikigami").length);
  const yin = selectCards(SK, {}, "yin");
  assert.ok(yin.length > 0 && yin.every((id) => SK.byId.get(id)?.attribute === "yin"));
  const plus = bulkStat(SK, {}, shiki, "hp", { delta: 1 });
  assert.equal(plus.changed, shiki.length);
  assert.equal(plus.cards.sk03?.hp, (SK.byId.get("sk03")?.hp ?? 0) + 1);
  const floor = bulkStat(SK, {}, shiki, "attackCost", { delta: -20 });
  assert.ok(Object.values(floor.cards).every((e) => e.attackCost === 0), "clamped to the minimum");
  const set = bulkStat(SK, {}, ["sk03", "sk18"], "summonCost", { value: 0 });
  assert.deepEqual(set.skipped, [SK.byId.get("sk03")?.nameJa], "a shikigami cannot cost 0; the reigu can");
  assert.equal(set.cards.sk18?.summonCost, 0);
  const copied = copyShape(SK, {}, "sk08", ["sk03", "sk18", "sk08"]);
  assert.equal(copied.changed, 1, "reigu and the source itself are skipped");
  assert.deepEqual(copied.cards.sk03?.attackRange, SK.byId.get("sk08")?.attackRange);
  assert.equal(parseCardOverrides(normalizeCardOverrides(SK, { ...plus.cards, ...copied.cards }), SK).ok, true);
  assert.deepEqual(Object.keys(resetCards(plus.cards, ["sk03"])).includes("sk03"), false);
  assert.deepEqual(selectCards(SK, copied.cards, "changed"), ["sk03"]);
});

test("range edits survive the share URL, compactly, and read as words in the change list", () => {
  const cards = copyShape(SK, {}, "sk17", selectCards(SK, {}, "shikigami")).cards; // 玖龍街: every cell around
  const s: GameSettings = { ...defaultSettings(), cards: normalizeCardOverrides(SK, cards) };
  const text = encodeSettings(s);
  assert.ok(text.length < 4000, `encoded length ${text.length}`);
  const back = decodeSettings(text, () => SK);
  assert.equal(back.ok, true, back.ok ? "" : back.error);
  if (back.ok) assert.deepEqual(back.value.cards, s.cards);
  const lines = cardChanges(SK, { sk03: { attackRange: [{ x: 0, y: 2 }, { x: 0, y: 1 }], attribute: "yang" } }).map((c) => `${c.label} ${c.from}→${c.to}`);
  assert.deepEqual(lines, ["属性 陰→陽", "攻撃範囲 前(2)→前2・前(-22)"]);
  assert.equal(formatTenkey(parseTenkey("-1-2-32")), "-1-2-32");
  assert.equal(formatTenkey([{ x: 2, y: 0 }]), null, "two cells sideways has no tenkey token");
});

test("a reigu in hand shows its effect text on the card", () => {
  const html = cardFaceHtml(makeCtx(presetConfig("r0914"), SK), "sk21", { size: "md" });
  assert.match(html, /class="fu-text"><span class="fu-tx">自分のユニット1体の現HPを7にする/);
  assert.doesNotMatch(html, /【霊具】/);
});

test("mid-match card change: units in play take it at once; HP is cut when the max drops, kept when it rises, never destroyed", () => {
  const ctx = makeCtx(presetConfig("r0914"), SK);
  const s = blankState(ctx);
  place(s, "sk13", 0, 0, 0, 0); // 僵尸公主 HP 5 on an empty cell
  place(s, "sk09", 1, 2, 2, 2); // 一目鬼 HP 6
  const [a, b] = s.units;
  assert.ok(a !== undefined && b !== undefined);
  b.damage = 2; // 4 / 6
  const down = applyCardChange(ctx, s, { sk13: { hp: 2 }, sk09: { hp: 3 } });
  assert.equal(unitHp(down.ctx, a), 2, "cut to the new max");
  assert.equal(unitHp(down.ctx, b), 3, "4 left, new max 3: cut to 3");
  const floor = applyCardChange(down.ctx, s, { sk09: { hp: 1 } });
  assert.equal(unitHp(floor.ctx, b), 1, "a change never destroys a unit");
  assert.deepEqual(down.changes.map((c) => `${c.cardId}.${c.field}`), ["sk09.hp", "sk13.hp"].sort());
  const up = applyCardChange(down.ctx, s, { sk13: { hp: 7 } });
  assert.equal(unitHp(up.ctx, a), 2, "a higher max does not heal");
  // through the flow: recorded, logged, refused once the match is over
  const f = createFlow(ctx, 7);
  assert.equal(submit(f, 0, { type: "cards", edits: { sk03: { hp: 4 } } }).ok, true);
  assert.equal(f.ctx.pack.byId.get("sk03")?.hp, 4);
  assert.equal(submit(f, 0, { type: "cards", edits: { sk03: { hp: 4 } } }).ok, false, "no change");
  assert.equal(submit(f, 0, { type: "cards", edits: { sk03: { blindSpots: [{ x: 0, y: 1 }] } } }).ok, false, "range and blind spot clash");
  assert.ok(f.log.some((l) => l.event.t === "cards"));
  const again = replayFlow(ctx, 7, f.inputs);
  assert.deepEqual(again.ctx.pack.byId.get("sk03"), f.ctx.pack.byId.get("sk03"));
  assert.equal(submit(f, 0, { type: "resign" }).ok, true);
  assert.equal(submit(f, 0, { type: "cards", edits: { sk03: { hp: 5 } } }).ok, false, "not after the match");
});
test("filter chips: OR inside a group, AND across groups; the cost chip follows edited costs", () => {
  const byCost = (cost: number) => SK.cards.filter((c) => c.summonCost === cost).map((c) => c.id);
  assert.deepEqual(selectByChips(SK, {}, noChips()), [], "no chip selects nothing");
  assert.deepEqual(selectByChips(SK, {}, { ...noChips(), cost: [3] }), byCost(3), "cost 3 (reigu with use cost 3 included)");
  const three4 = selectByChips(SK, {}, { ...noChips(), cost: [3, 4] });
  assert.deepEqual(three4, [...byCost(3), ...byCost(4)].sort((a, b) => a.localeCompare(b)));
  const yin34 = selectByChips(SK, {}, { kind: [], attr: ["yin"], cost: [3, 4] });
  assert.ok(yin34.length > 0);
  assert.ok(yin34.every((id) => { const c = SK.byId.get(id); return c?.kind === "shikigami" && c.attribute === "yin" && (c.summonCost === 3 || c.summonCost === 4); }));
  const shiki3 = selectByChips(SK, {}, { kind: ["shikigami"], attr: [], cost: [3] });
  assert.ok(shiki3.every((id) => SK.byId.get(id)?.kind === "shikigami"));
  // after a bulk change the chip sees the new cost
  const raised = bulkStat(SK, {}, byCost(2), "summonCost", { delta: 1 }).cards;
  assert.equal(selectByChips(SK, raised, { ...noChips(), cost: [2] }).length, 0);
  assert.equal(costCounts(SK, raised).find((x) => x.cost === 2), undefined);
  assert.equal(costCounts(SK, {}).reduce((n, x) => n + x.count, 0), SK.cards.length);
});
