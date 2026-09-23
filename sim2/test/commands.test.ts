// The unit command menu (src/commands.ts) must agree with the engine's legal
// actions at every point of real games, and only the acting seat receives it.
import test from "node:test";
import assert from "node:assert/strict";
import { commandsFor } from "../src/commands.ts";
import type { CommandId } from "../src/commands.ts";
import { createFlow } from "../src/flow.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig } from "../src/presets.ts";
import { legalActions } from "../src/rules.ts";
import { makeCtx } from "../src/state.ts";
import type { Action } from "../src/types.ts";
import { gameView } from "../online/view.ts";
import { blankState, place } from "./helpers.ts";
import { aiStep, SK } from "./online-helpers.ts";

const TM = loadPack(packPath("tsukumo-miyako"));

const matches = (id: CommandId, uid: number, a: Action, facing: number): boolean => {
  if (!("uid" in a) || a.uid !== uid) return false;
  if (a.kind === "attack") {
    const v = a.variant ?? "normal";
    return (id === "attack" && v === "normal") || (id === "konshin" && v === "konshin") || (id === "heal" && v === "heal");
  }
  if (a.kind === "rotate") return (id === "rotateLeft" && a.facing === (facing + 3) % 4) || (id === "rotateRight" && a.facing === (facing + 1) % 4);
  return a.kind === "proxyRotate" && id === "proxyRotate";
};

test("commands: enabled exactly when a matching legal action exists, with a reason otherwise", () => {
  let checked = 0;
  const seen = new Set<string>();
  for (const [pack, rule, seed] of [[SK, "r0913", 3], [TM, "r0828", 8], [TM, "r0913", 21], [SK, "r0828", 34]] as const) {
    const f = createFlow(makeCtx(presetConfig(rule), pack), seed);
    for (let i = 0; i < 3000 && f.phase.kind !== "over"; i++) {
      if (f.phase.kind === "main") {
        const legal = legalActions(f.ctx, f.state);
        const menu = commandsFor(f.ctx, f.state, legal);
        for (const u of f.state.units.filter((x) => x.owner === f.state.turnPlayer)) {
          for (const c of menu[String(u.uid)] ?? []) {
            const has = legal.some((a) => matches(c.id, u.uid, a, u.facing));
            assert.equal(c.enabled, has, `${pack.packId} ${rule} step ${i} uid ${u.uid} ${c.id}`);
            assert.equal(c.reason === null, c.enabled);
            seen.add(`${c.id}:${c.enabled ? "on" : c.reason}`);
            checked += 1;
          }
        }
        for (const a of legal) {
          if (!("uid" in a)) continue;
          const list = menu[String(a.uid)] ?? [];
          const u = f.state.units.find((x) => x.uid === a.uid);
          assert.ok(u !== undefined && list.some((c) => c.enabled && matches(c.id, a.uid, a, u.facing)), `legal ${JSON.stringify(a)} has a menu entry`);
        }
      }
      aiStep(f);
    }
  }
  assert.ok(checked > 200, `checked ${checked}`);
  assert.ok([...seen].some((k) => k.startsWith("attack:霊力が足りない")), "mana shortfall reason appears");
  assert.ok([...seen].some((k) => k === "rotateLeft:回転済み" || k === "rotateLeft:攻撃済み(このターンは行動終了)"));
});

test("commands: Kuryugai lock, konshin / heal / proxy entries and their reasons", () => {
  const ctx = makeCtx(presetConfig("r0828"), TM);
  const s = blankState(ctx, 1);
  const kubi = place(s, "tm09", 0, 0, 0, 0); // 首引の鬼娘: konshin
  const meoto = place(s, "tm06", 0, 2, 0, 0); // 夫婦面: heal
  const kuryu = place(s, "tm17", 0, 1, 0, 0); // own 玖龍街: proxy rotate
  place(s, "tm17", 1, 1, 2, 2); // enemy 玖龍街 locks our rotate commands
  const menu = commandsFor(ctx, s);
  const ids = (uid: number) => (menu[String(uid)] ?? []).map((c) => c.id);
  assert.deepEqual(ids(kubi), ["attack", "konshin", "rotateLeft", "rotateRight"]);
  assert.deepEqual(ids(meoto), ["attack", "heal", "rotateLeft", "rotateRight"]);
  assert.deepEqual(ids(kuryu), ["attack", "rotateLeft", "rotateRight", "proxyRotate"]);
  const rot = (menu[String(kubi)] ?? []).find((c) => c.id === "rotateLeft");
  assert.equal(rot?.enabled, false);
  assert.equal(rot?.reason, "玖龍街により回転不可");
  const proxy = (menu[String(kuryu)] ?? []).find((c) => c.id === "proxyRotate");
  assert.equal(proxy?.enabled, true, "proxy rotation bypasses the lock (mana 1 = cost 1)");
  const atk = (menu[String(kubi)] ?? []).find((c) => c.id === "attack");
  assert.equal(atk?.enabled, false);
  assert.match(atk?.reason ?? "", /霊力が足りない\(あと1\)|範囲内に敵がいない/);
});

test("commands travel with the legal list: only to the seat that is to act", () => {
  const f = createFlow(makeCtx(presetConfig("r0828"), SK), 12);
  for (let i = 0; i < 6; i++) aiStep(f);
  while (f.phase.kind !== "main") aiStep(f);
  const src = { flow: f, matchNo: 1, rule: "r0828" as const, pack: "shuten-kyuryu" };
  const actor = f.phase.player;
  assert.ok(gameView(src, actor).commands !== null);
  assert.equal(gameView(src, actor === 0 ? 1 : 0).commands, null);
  assert.equal(gameView(src, null).commands, null);
});
