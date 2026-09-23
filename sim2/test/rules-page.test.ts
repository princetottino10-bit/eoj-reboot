// The settings page (/rules) and the AI table's stored match: URL modes, the
// stored-match record (validation and restore by replay), the flow-input
// parser shared with the online protocol, and the pages' static routes.
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createFlow, submit, submitDiscardWith } from "../src/flow.ts";
import { parseFlowInput, parseRecordedInputs } from "../src/input-parse.ts";
import { encodeSettings, settingsConfig, settingsPack } from "../src/settings.ts";
import type { GameSettings } from "../src/settings.ts";
import { makeCtx } from "../src/state.ts";
import { defaultDiscardPolicy } from "../src/turn.ts";
import { packFor } from "../online/match.ts";
import { parseClientInput } from "../online/protocol.ts";
import { createOnlineApp, createOnlineServer, onlineStaticAllowed, staticTarget } from "../online/server.ts";
import {
  AI_GAME_KEY,
  AI_SETUP_KEY,
  clearStoredGame,
  defaultAiSetup,
  loadStoredGame,
  newerRecord,
  newGameId,
  parseAiSetup,
  parseStoredGame,
  readAiSetup,
  restoreStoredGame,
  storedGameOf,
  storedUnchanged,
  writeAiSetup,
  writeStoredGame,
} from "../play/ai-store.ts";
import type { KeyValueStore, StoredAiGame, Stores } from "../play/ai-store.ts";
import { originHref, parseRulesRoute, rulesHref, shareHref } from "../play/rules-url.ts";
import { playTarget, serve, serveFile } from "../play/server.ts";
import { aiStep } from "./online-helpers.ts";

// ------------------------------------------------------------------ URLs

test("the /rules URL names the page's mode; anything unusable is refused", () => {
  assert.deepEqual(parseRulesRoute(""), { for: "standalone", s: null });
  assert.deepEqual(parseRulesRoute("?s=abc"), { for: "standalone", s: "abc" });
  assert.deepEqual(parseRulesRoute("?s="), { for: "standalone", s: null });
  assert.deepEqual(parseRulesRoute("?for=ai&s=x_y-z"), { for: "ai", s: "x_y-z" });
  assert.deepEqual(parseRulesRoute("?for=lobby"), { for: "lobby", s: null });
  assert.deepEqual(parseRulesRoute("?for=ai-game&s=ignored"), { for: "ai-game" });
  assert.deepEqual(parseRulesRoute("?for=room&code=abc234"), { for: "room", code: "ABC234", seat: null });
  assert.equal(parseRulesRoute("?for=room&code=ABC1").for, "bad");
  assert.equal(parseRulesRoute("?for=room&code=ABCIO0").for, "bad", "letters outside the room-code alphabet");
  assert.equal(parseRulesRoute("?for=room").for, "bad");
  assert.equal(parseRulesRoute("?for=elsewhere").for, "bad");
});

test("links into /rules and back to where it was opened from", () => {
  assert.equal(rulesHref({ for: "standalone", s: null }), "/rules");
  assert.equal(rulesHref({ for: "standalone", s: "abc" }), "/rules?s=abc");
  assert.equal(rulesHref({ for: "ai", s: "abc" }), "/rules?for=ai&s=abc");
  assert.equal(rulesHref({ for: "lobby", s: null }), "/rules?for=lobby");
  assert.equal(rulesHref({ for: "ai-game" }), "/rules?for=ai-game");
  assert.equal(rulesHref({ for: "room", code: "ABC234", seat: null }), "/rules?for=room&code=ABC234");
  // the room link names the seat that opened it, so a browser in both seats edits as that seat
  assert.equal(rulesHref({ for: "room", code: "ABC234", seat: 1 }), "/rules?for=room&code=ABC234&seat=1");
  assert.deepEqual(parseRulesRoute("?for=room&code=ABC234&seat=0"), { for: "room", code: "ABC234", seat: 0 });
  assert.deepEqual(parseRulesRoute("?for=room&code=ABC234&seat=9"), { for: "room", code: "ABC234", seat: null });
  for (const r of [{ for: "ai", s: "q" }, { for: "lobby", s: null }, { for: "ai-game" }, { for: "room", code: "ZZZ222", seat: null }, { for: "room", code: "ZZZ222", seat: 1 }] as const) {
    assert.deepEqual(parseRulesRoute(rulesHref(r).slice("/rules".length)), r, rulesHref(r));
  }
  assert.equal(originHref({ for: "ai", s: null }, "new"), "/ai?s=new");
  assert.equal(originHref({ for: "ai", s: "old" }, null), "/ai");
  assert.equal(originHref({ for: "lobby", s: null }, "new"), "/?s=new");
  assert.equal(originHref({ for: "ai-game" }, "ignored"), "/ai");
  assert.equal(originHref({ for: "room", code: "ABC234", seat: 0 }, null), "/room/ABC234");
  assert.equal(originHref({ for: "standalone", s: "x" }, "y"), "/");
  assert.equal(originHref({ for: "bad", error: "" }, null), "/");
  const s = encodeSettings({ rule: "r0914", pack: "shuten-kyuryu", config: { baseIncome: 3 }, cards: {} });
  assert.equal(shareHref("https://h", { for: "ai", s: null }, s), `https://h/ai?s=${s}`);
  assert.equal(shareHref("https://h", { for: "lobby", s: null }, s), `https://h/rules?s=${s}`);
  assert.equal(shareHref("https://h", { for: "standalone", s: null }, s), `https://h/rules?s=${s}`);
});

// ------------------------------------------------------------ flow inputs

test("flow inputs from untrusted JSON: rebuilt from known fields; mid-match changes only where allowed", () => {
  assert.deepEqual(parseFlowInput({ type: "action", action: { kind: "summon", handIndex: 1, pos: { x: 2, y: 0 }, facing: 3, extra: 1 } }, { changes: false }), {
    ok: true,
    value: { type: "action", action: { kind: "summon", handIndex: 1, pos: { x: 2, y: 0 }, facing: 3 } },
  });
  assert.equal(parseFlowInput({ type: "action", action: { kind: "summon", handIndex: 1, pos: { x: 1.5, y: 0 }, facing: 0 } }, { changes: false })?.ok, false);
  assert.equal(parseFlowInput({ type: "discard", indices: [0, -1] }, { changes: false })?.ok, false);
  assert.equal(parseFlowInput({ type: "config", patch: { baseIncome: 3 } }, { changes: false }), null);
  assert.deepEqual(parseFlowInput({ type: "config", patch: { baseIncome: 3 } }, { changes: true }), { ok: true, value: { type: "config", patch: { baseIncome: 3 } } });
  assert.equal(parseFlowInput({ type: "config", patch: { baseIncome: 99 } }, { changes: true })?.ok, false);
  assert.equal(parseFlowInput({ type: "cards", edits: { sk01: { atk: 5 } } }, { changes: true })?.ok, true);
  assert.equal(parseFlowInput({ type: "rematch" }, { changes: true }), null);
  // the online protocol still refuses raw rule and card changes from a browser
  assert.equal(parseClientInput({ type: "config", patch: { baseIncome: 3 } }).ok, false);
  assert.equal(parseClientInput({ type: "cards", edits: {} }).ok, false);
  assert.equal(parseClientInput({ type: "resign" }).ok, true);
  assert.equal(parseRecordedInputs([{ seat: 2, input: { type: "resign" } }]).ok, false);
  assert.equal(parseRecordedInputs([{ seat: 0, input: { type: "rematch" } }]).ok, false);
  assert.equal(parseRecordedInputs("[]").ok, false);
});

// ----------------------------------------------------------- stored match

const SETTINGS: GameSettings = { rule: "r0914", pack: "shuten-kyuryu", config: { baseIncome: 3 }, cards: { sk02: { hp: 7 } } };

const memoryStore = (): KeyValueStore & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
};

const storesOf = (): Stores & { session: ReturnType<typeof memoryStore>; local: ReturnType<typeof memoryStore> } => ({
  session: memoryStore(),
  local: memoryStore(),
});

const storedRecord = (text: string | null): StoredAiGame | null => {
  const parsed = parseStoredGame(text === null ? null : (JSON.parse(text) as unknown), null);
  return parsed.ok ? parsed.value : null;
};
const recordId = (text: string | null): string | null => storedRecord(text)?.id ?? null;
const inputCount = (text: string | null): number => storedRecord(text)?.inputs.length ?? -1;

/** A match the AI table would store: AI inputs on both seats, a discard through the policy, and a mid-game rule and card change. */
const playedMatch = (steps: number): { start: Omit<StoredAiGame, "version" | "inputs">; game: StoredAiGame; flow: ReturnType<typeof createFlow> } => {
  const printed = packFor(SETTINGS.pack);
  const start = { id: newGameId(), settings: SETTINGS, human: 0 as const, ai: "greedy" as const, evalName: "territorial", seed: 4242 };
  const flow = createFlow(makeCtx(settingsConfig(SETTINGS), settingsPack(SETTINGS, printed)), start.seed);
  let changed = false;
  for (let i = 0; i < steps; i++) {
    if (!changed && flow.phase.kind === "main" && flow.state.round >= 2) {
      assert.ok(submit(flow, 0, { type: "config", patch: { baseIncome: 5 } }).ok);
      assert.ok(submit(flow, 0, { type: "cards", edits: { sk03: { atk: 6 } } }).ok);
      changed = true;
    }
    if (flow.phase.kind === "discard") assert.ok(submitDiscardWith(flow, flow.phase.player, defaultDiscardPolicy).ok);
    else if (!aiStep(flow)) break;
  }
  assert.ok(changed, "the match reached a mid-game change");
  return { start, game: storedGameOf(start, flow), flow };
};

test("a stored match survives JSON and replays to the same board, rules and cards (mid-game changes included)", () => {
  const { game, flow } = playedMatch(26);
  assert.notEqual(flow.phase.kind, "over");
  const raw: unknown = JSON.parse(JSON.stringify(game));
  const printed = packFor(SETTINGS.pack);
  const shape = parseStoredGame(raw, null);
  assert.ok(shape.ok, shape.ok ? "" : shape.error);
  const parsed = parseStoredGame(raw, () => printed);
  assert.ok(parsed.ok, parsed.ok ? "" : parsed.error);
  const restored = restoreStoredGame(parsed.value, printed);
  assert.ok(restored.ok, restored.ok ? "" : restored.error);
  const f = restored.value;
  assert.deepEqual(f.state, flow.state);
  assert.deepEqual(f.phase, flow.phase);
  assert.deepEqual(f.ctx.cfg, flow.ctx.cfg);
  assert.equal(f.ctx.cfg.baseIncome, 5);
  assert.equal(f.ctx.pack.byId.get("sk03")?.atk, 6);
  assert.equal(f.ctx.pack.byId.get("sk02")?.hp, 7, "the starting card edit");
  assert.equal(f.log.length, flow.log.length);
  assert.ok(f.log.some((l) => l.event.t === "config") && f.log.some((l) => l.event.t === "cards"), "the changes are in the log");
});

test("malformed or tampered stored matches are refused", () => {
  const { game } = playedMatch(26);
  const printed = packFor(SETTINGS.pack);
  const packOf = () => printed;
  const clone = (): Record<string, unknown> => JSON.parse(JSON.stringify(game)) as Record<string, unknown>;
  for (const [why, raw] of [
    ["not an object", "x"],
    ["other version", { ...clone(), version: 2 }],
    ["bad seat", { ...clone(), human: 3 }],
    ["bad AI", { ...clone(), ai: "gpt" }],
    ["bad eval profile", { ...clone(), evalName: "nope" }],
    ["bad seed", { ...clone(), seed: "1" }],
    ["bad settings", { ...clone(), settings: { rule: "r0000", pack: "shuten-kyuryu", config: {}, cards: {} } }],
    ["unknown card", { ...clone(), settings: { ...SETTINGS, cards: { zz99: { hp: 3 } } } }],
    ["inputs not a list", { ...clone(), inputs: {} }],
  ] as const) {
    assert.equal(parseStoredGame(raw, packOf).ok, false, why);
  }
  // well-formed but illegal: the replay refuses it
  const tampered = clone();
  const inputs = tampered.inputs as { seat: number; input: unknown }[];
  inputs.push({ seat: 1, input: { type: "action", action: { kind: "attack", uid: 999, targetUid: null } } });
  const parsed = parseStoredGame(tampered, packOf);
  assert.ok(parsed.ok);
  assert.equal(restoreStoredGame(parsed.value, printed).ok, false);
  // a different seed deals other cards: the recorded inputs stop fitting
  const reseeded = parseStoredGame({ ...clone(), seed: 7 }, packOf);
  assert.ok(reseeded.ok);
  assert.equal(restoreStoredGame(reseeded.value, printed).ok, false);
});

test("loading picks this tab's match, falls back to the browser's, and forgets unusable or finished ones", async () => {
  const printed = packFor(SETTINGS.pack);
  const loadPack = async () => printed;
  const { game } = playedMatch(26);
  const stores = storesOf();
  assert.equal(await loadStoredGame(stores, loadPack), null);

  assert.ok(writeStoredGame(stores, game));
  const mine = await loadStoredGame(stores, loadPack);
  assert.ok(mine !== null && mine.fromTab);
  assert.equal(mine.flow.inputs.length, game.inputs.length);

  // another tab (no session copy): offered, not this tab's
  stores.session.map.clear();
  const other = await loadStoredGame(stores, loadPack);
  assert.ok(other !== null && !other.fromTab);

  // broken JSON in this tab: forgotten, the browser's copy still loads
  stores.session.setItem(AI_GAME_KEY, "{not json");
  const fallback = await loadStoredGame(stores, loadPack);
  assert.ok(fallback !== null && !fallback.fromTab);
  stores.session.setItem(AI_GAME_KEY, JSON.stringify({ ...game, version: 99 }));
  assert.ok((await loadStoredGame(stores, loadPack)) !== null);
  assert.equal(stores.session.getItem(AI_GAME_KEY), null, "the unreadable record is gone");

  // a pack that cannot be fetched right now: skipped, but kept for later
  stores.session.setItem(AI_GAME_KEY, JSON.stringify(game));
  stores.local.map.clear();
  assert.equal(await loadStoredGame(stores, async () => Promise.reject(new Error("offline"))), null);
  assert.notEqual(stores.session.getItem(AI_GAME_KEY), null);

  // a finished match is not offered
  const done = createFlow(makeCtx(settingsConfig(SETTINGS), settingsPack(SETTINGS, printed)), 9);
  assert.ok(submit(done, 0, { type: "resign" }).ok);
  const finished = storedGameOf({ id: newGameId(), settings: SETTINGS, human: 0, ai: "beam", evalName: "territorial", seed: 9 }, done);
  writeStoredGame(stores, finished);
  assert.equal(await loadStoredGame(stores, loadPack), null);
  assert.equal(stores.session.getItem(AI_GAME_KEY), null);
  assert.equal(stores.local.getItem(AI_GAME_KEY), null);
});

test("forgetting a match leaves another tab's match offered; storage failures are quiet", () => {
  const { game } = playedMatch(20);
  const stores = storesOf();
  writeStoredGame(stores, game);
  const otherTab = { ...game, id: newGameId(), seed: game.seed + 1 };
  stores.local.setItem(AI_GAME_KEY, JSON.stringify(otherTab));
  clearStoredGame(stores, game);
  assert.equal(stores.session.getItem(AI_GAME_KEY), null);
  assert.notEqual(stores.local.getItem(AI_GAME_KEY), null, "another match stays");
  stores.session.setItem(AI_GAME_KEY, JSON.stringify(otherTab));
  clearStoredGame(stores, otherTab);
  assert.equal(stores.local.getItem(AI_GAME_KEY), null);

  const throwing: KeyValueStore = {
    getItem: () => {
      throw new Error("denied");
    },
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => {
      throw new Error("denied");
    },
  };
  const broken: Stores = { session: throwing, local: null };
  assert.equal(writeStoredGame(broken, game), false);
  assert.doesNotThrow(() => clearStoredGame(broken, game));
  assert.equal(readAiSetup(broken), null);
});

test("two screens on one match: a moved-on record is not overwritten, and a further one is adopted", () => {
  const { game, flow } = playedMatch(26);
  const stores = storesOf();
  writeStoredGame(stores, game);
  assert.ok(storedUnchanged(stores, game, true));
  assert.ok(storedUnchanged(stores, game, false));
  // the table in another tab plays on: the settings page's copy is stale
  const further = { ...game, inputs: [...game.inputs, { seat: 0 as const, input: { type: "resign" as const } }] };
  stores.local.setItem(AI_GAME_KEY, JSON.stringify(further));
  assert.equal(storedUnchanged(stores, game, false), false);
  assert.ok(storedUnchanged(stores, game, true), "this tab's copy is untouched");
  assert.equal(storedUnchanged(stores, { ...game, id: newGameId() }, true), false, "another match");
  // the table adopts a record of its own match that goes further, and nothing else
  assert.deepEqual(newerRecord(JSON.stringify(further), game)?.inputs.length, flow.inputs.length + 1);
  assert.equal(newerRecord(JSON.stringify(game), game), null, "not further");
  assert.equal(newerRecord(JSON.stringify({ ...further, id: newGameId() }), game), null, "another match");
  // the same match gone another way is not a continuation of this one
  const diverged = { ...game, inputs: [...game.inputs.slice(0, -1), { seat: 1 as const, input: { type: "resign" as const } }, { seat: 0 as const, input: { type: "resign" as const } }] };
  assert.equal(newerRecord(JSON.stringify(diverged), game), null, "longer but not this line of play");
  assert.equal(newerRecord("{broken", game), null);
  assert.equal(newerRecord(null, game), null);
});

test("matches started apart are different matches, even with the same settings and deal", () => {
  const { game } = playedMatch(20);
  const stores = storesOf();
  // two tabs, each starting the defaults: same seed, same settings, two ids
  const tabTwo = { ...game, id: newGameId(), inputs: game.inputs.slice(0, 4) };
  assert.notEqual(tabTwo.id, game.id);
  writeStoredGame(stores, game);
  assert.equal(newerRecord(JSON.stringify(tabTwo), game), null, "another tab's own match is never adopted");
  // the browser's copy is the latest match written; this tab keeps its own in its session
  writeStoredGame({ session: memoryStore(), local: stores.local }, tabTwo);
  assert.equal(recordId(stores.local.getItem(AI_GAME_KEY)), tabTwo.id);
  assert.equal(recordId(stores.session.getItem(AI_GAME_KEY)), game.id, "this tab's match is untouched");
  // and the shorter record of a match never replaces a longer one of the same match
  const behind = { ...game, inputs: game.inputs.slice(0, 5) };
  writeStoredGame({ session: stores.session, local: null }, behind);
  assert.equal(parseStoredGame(JSON.parse(stores.session.getItem(AI_GAME_KEY) ?? "null"), null).ok, true);
  assert.equal(inputCount(stores.session.getItem(AI_GAME_KEY)), game.inputs.length, "the longer record stays");
});

test("a record from before match ids gets the same id in every tab", () => {
  const { game } = playedMatch(18);
  const old = JSON.parse(JSON.stringify(game)) as Record<string, unknown>;
  delete old.id;
  const a = parseStoredGame(old, null);
  const b = parseStoredGame(JSON.parse(JSON.stringify(old)), null);
  assert.ok(a.ok && b.ok);
  assert.equal(a.value.id, b.value.id);
  assert.notEqual(a.value.id, game.id);
  const other = parseStoredGame({ ...old, seed: 999 }, null);
  assert.ok(other.ok);
  assert.notEqual(other.value.id, a.value.id, "another start is another match");
  assert.equal(parseStoredGame({ ...old, id: "not a valid id!" }, null).ok, false);
});

test("the start card's stored choices are validated", () => {
  const stores = storesOf();
  assert.equal(readAiSetup(stores), null);
  const setup = { ...defaultAiSetup(), human: 1 as const, ai: "beam" as const, seed: 77, playedSeed: 5 };
  writeAiSetup(stores, setup);
  assert.deepEqual(readAiSetup(stores), setup);
  assert.equal(parseAiSetup({ ...setup, s: "***" }), null);
  assert.equal(parseAiSetup({ ...setup, evalName: "nope" }), null);
  assert.equal(parseAiSetup({ ...setup, human: "0" }), null);
  assert.deepEqual(parseAiSetup({ ...setup, playedSeed: "x" }), { ...setup, playedSeed: null });
  stores.session.setItem(AI_SETUP_KEY, "{");
  assert.equal(readAiSetup(stores), null);
});

// ----------------------------------------------------------------- routes

test("/rules is served by both servers with its module; the room part only by the online server", async () => {
  assert.equal(staticTarget("/rules"), "/play/rules.html");
  assert.equal(staticTarget("/rules/"), "/play/rules.html");
  assert.ok(onlineStaticAllowed("play/rules.html"));
  assert.ok(onlineStaticAllowed("online/rules-room.ts"));
  assert.equal(playTarget("/rules?for=ai&s=abc"), "/play/rules.html");
  assert.equal(playTarget("/ai?s=abc"), "/play/index.html");
  assert.equal(playTarget("/?s=abc"), "/play/index.html");
  for (const path of ["/rules", "/rules?for=ai-game", "/ai", "/ai?s=abc", "/?s=abc"]) {
    assert.equal((await serve(path)).code, 200, `local ${path}`);
  }
  const page = await serveFile("/play/rules.html", onlineStaticAllowed);
  assert.equal(page.code, 200);
  for (const css of ["table.css", "panel.css"]) assert.ok(page.body.includes(`/play/${css}`), css);
  assert.ok(page.body.includes('src="/play/rules-page.ts"'));
  assert.ok(!/<script>/.test(page.body), "no inline scripts");
  assert.equal((await serveFile("/online/rules-room.ts", onlineStaticAllowed)).code, 200);
  assert.equal((await serve("/online/rules-room.ts")).code, 404, "the local server has no rooms");

  const server = createOnlineServer(createOnlineApp({ recordDir: join(import.meta.dirname, "..", "out", `rules-page-${process.pid}`) }));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  try {
    const addr = server.address();
    assert.ok(addr !== null && typeof addr === "object");
    for (const path of ["/rules", "/rules?for=room&code=ABC234", "/rules/?s=x"]) {
      const res: Response = await fetch(`http://127.0.0.1:${addr.port}${path}`);
      assert.equal(res.status, 200, path);
      assert.match(await res.text(), /rules-page\.ts/);
    }
    const head = await fetch(`http://127.0.0.1:${addr.port}/online/lobby.html`, { method: "HEAD" });
    assert.equal(head.status, 200, "the page asks this to offer room creation");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
