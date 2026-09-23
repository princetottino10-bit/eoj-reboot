// The team's print kit (print-kit-a4-deck-oni-tsukumogami.pdf, cut up by
// sim2/out/printkit): print card numbers and card art in pack-adopted-0922,
// their validation in the pack parser, and both servers handing the art out
// as images (and nothing outside play/art/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { request } from "node:http";
import type { IncomingHttpHeaders, Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { ART_PATH, cardOf, parsePack, PRINT_ID } from "../src/cards.ts";
import type { CardPack } from "../src/cards.ts";
import { ALL_PACK_NAMES } from "../src/cards.ts";
import { loadPack, packPath } from "../src/pack-io.ts";
import { ART_MAX_AGE_S, createOnlineServer, onlineStaticAllowed, staticCacheControl, STATIC_MAX_AGE_S } from "../online/server.ts";
import type { OnlineApp } from "../online/server.ts";
import { createPlayServer, isImagePath, serve, serveImage } from "../play/server.ts";
import { newApp, testRecordDir } from "./online-api-helpers.ts";

const SIM2 = join(import.meta.dirname, "..");
const AD: CardPack = loadPack(packPath("adopted-0922"));

/** The kit's order: page 1 = cards 1-9, page 2 = 10-18, page 3 = 19-22 (read off the rendered pages). */
const PRINT_ORDER: [string, string, string][] = [
  ["ad01", "T-001", "灯籠の精"],
  ["ad02", "T-002", "提灯お化け"],
  ["ad03", "O-001", "影鬼"],
  ["ad04", "O-002", "鉞鬼"],
  ["ad05", "T-004", "古箪笥"],
  ["ad06", "O-003", "鎖鬼"],
  ["ad07", "T-003", "変面"],
  ["ad08", "O-004", "一角鬼"],
  ["ad09", "O-006", "一目鬼"],
  ["ad10", "T-007", "雲外鏡"],
  ["ad11", "T-005", "照魔鏡"],
  ["ad12", "O-005", "首引の姫鬼"],
  ["ad13", "T-006", "僵尸公主"],
  ["ad14", "O-007", "両面"],
  ["ad15", "O-008", "茨木童子"],
  ["ad16", "O-009", "酒呑童子"],
  ["ad17", "T-008", "玖龍街"],
  ["ad18", "T-009", "家鳴り"],
  ["ad19", "T-011", "マヨヒガ"],
  ["ad20", "T-010", "琵琶牧々"],
  ["ad21", "O-010", "茨木の左腕"],
  ["ad22", "O-011", "閻魔獄卒棒"],
];
/** The cards printed with a full-bleed illustration; the other twelve are blank. */
const ILLUSTRATED = ["T-001", "T-002", "O-001", "T-004", "O-003", "O-005", "T-006", "O-008", "O-009", "T-008"];

/** Width and height of a WebP file (VP8 lossy, VP8L lossless or VP8X extended). */
const webpSize = (b: Buffer): { w: number; h: number } => {
  assert.equal(b.toString("latin1", 0, 4), "RIFF");
  assert.equal(b.toString("latin1", 8, 12), "WEBP");
  const chunk = b.toString("latin1", 12, 16);
  if (chunk === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  assert.equal(chunk, "VP8X");
  return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
};

const baseCard = {
  id: "c1", name: "C", summonCost: 1, attackCost: 1, atk: 1, hp: 1, lifeValue: 1,
  attribute: "yin", aoe: false, attackRange: [], blindSpots: [],
};
const packOf = (...cards: Record<string, unknown>[]): unknown => ({ packId: "t", cards: cards.map((c, i) => ({ ...baseCard, id: `c${i}`, ...c })) });

// ------------------------------------------------------------------ parsing

test("printId and art are optional, validated card fields", () => {
  const art = { card: "play/art/adopted/T-001.webp", square: "play/art/adopted/T-001-sq.webp" };
  const p = parsePack(packOf({ printId: "T-001", art }, { printId: "O-011" }, {}));
  assert.equal(p.cards[0].printId, "T-001");
  assert.deepEqual(p.cards[0].art, art);
  assert.equal(p.cards[1].printId, "O-011");
  assert.equal(p.cards[1].art, undefined);
  assert.equal(p.cards[2].printId, undefined);
  assert.ok(!("printId" in p.cards[2]) && !("art" in p.cards[2]), "absent stays absent");
  // a .jpg is fine too, and deeper folders under play/art/
  assert.equal(parsePack(packOf({ art: { card: "play/art/x/y/a.jpg", square: "play/art/x/y/a-sq.jpg" } })).cards[0].art?.card, "play/art/x/y/a.jpg");

  for (const bad of ["T-1", "t-001", "TT-001", "T001", "T-0001", "T-00a", " T-001", "", 1, null]) {
    assert.throws(() => parsePack(packOf({ printId: bad })), /printId/, String(bad));
  }
  assert.throws(() => parsePack(packOf({ printId: "T-001" }, { printId: "T-001" })), /duplicate printId T-001/);

  const badPaths = [
    "data/pack-adopted-0922.json",
    "data/a.webp",
    "play/a.webp",
    "play/art/../../src/a.webp",
    "play/art/./a.webp",
    "/play/art/a.webp",
    "play\\art\\a.webp",
    "play/art/a.png",
    "play/art/a.svg",
    "play/art/a.webp?x=1",
    "https://example.com/play/art/a.webp",
    "play/art//a.webp",
    "play/art/a b.webp",
    "",
  ];
  for (const path of badPaths) {
    assert.equal(ART_PATH.test(path), false, path);
    assert.throws(() => parsePack(packOf({ art: { card: path, square: art.square } })), /art\.card/, path);
    assert.throws(() => parsePack(packOf({ art: { card: art.card, square: path } })), /art\.square/, path);
  }
  for (const shape of [art.card, [art.card, art.square], null, { card: art.card }, { ...art, extra: "x" }]) {
    assert.throws(() => parsePack(packOf({ art: shape })), /art/, JSON.stringify(shape));
  }
});

test("the other packs carry no print ids and no art", () => {
  for (const name of ALL_PACK_NAMES) {
    if (name === "adopted-0922") continue;
    for (const c of loadPack(packPath(name)).cards) {
      assert.equal(c.printId, undefined, `${name} ${c.id}`);
      assert.equal(c.art, undefined, `${name} ${c.id}`);
    }
  }
});

// ------------------------------------------------------------ the adopted pack

test("every adopted card carries the print kit's number, in the kit's order", () => {
  assert.deepEqual(AD.cards.map((c) => [c.id, c.printId, c.nameJa]), PRINT_ORDER);
  for (const c of AD.cards) {
    assert.ok(c.printId !== undefined && PRINT_ID.test(c.printId), c.id);
    // T = 玖龍街一門 (付喪神), O = 酒呑一門 (鬼)
    assert.equal(c.printId.startsWith("T-"), c.clan === "玖龍街一門", `${c.id} ${c.printId} ${c.clan}`);
  }
  // each clan is numbered 001..011 without gaps
  for (const prefix of ["T", "O"]) {
    const nums = AD.cards.flatMap((c) => (c.printId?.startsWith(prefix) ? [Number(c.printId.slice(2))] : [])).sort((a, b) => a - b);
    assert.deepEqual(nums, Array.from({ length: 11 }, (_, i) => i + 1), prefix);
  }
});

test("the ten illustrated cards have their art on disk: a card crop and a 256px square, small WebP files", () => {
  const withArt = AD.cards.filter((c) => c.art !== undefined);
  assert.deepEqual(withArt.map((c) => c.printId), ILLUSTRATED);
  let total = 0;
  for (const c of withArt) {
    const art = c.art!;
    assert.equal(art.card, `play/art/adopted/${c.printId}.webp`);
    assert.equal(art.square, `play/art/adopted/${c.printId}-sq.webp`);
    const card = readFileSync(join(SIM2, art.card));
    const square = readFileSync(join(SIM2, art.square));
    const cs = webpSize(card);
    const ss = webpSize(square);
    assert.ok(Math.max(cs.w, cs.h) >= 500 && Math.max(cs.w, cs.h) <= 720, `${c.printId} card art ${cs.w}x${cs.h}`);
    assert.ok(cs.w / cs.h > 0.8 && cs.w / cs.h < 1.4, `${c.printId} card art is roughly square: ${cs.w}x${cs.h}`);
    assert.deepEqual(ss, { w: 256, h: 256 }, `${c.printId} square`);
    assert.ok(card.length < 150 * 1024 && square.length < 40 * 1024, `${c.printId}: ${card.length} + ${square.length} bytes`);
    total += card.length + square.length;
  }
  assert.ok(total < 2 * 1024 * 1024, `all art together: ${total} bytes`);
  // the blank cards point at nothing
  for (const c of AD.cards) if (!ILLUSTRATED.includes(c.printId!)) assert.equal(c.art, undefined, c.id);
  assert.equal(cardOf(AD, "ad15").art?.square, "play/art/adopted/O-008-sq.webp");
});

// ------------------------------------------------------------------ serving

type Raw = { status: number; headers: IncomingHttpHeaders; body: Buffer };

const raw = (base: string, path: string, opts: { method?: string; headers?: Record<string, string> } = {}): Promise<Raw> =>
  new Promise((resolve, reject) => {
    const req = request(`${base}${path}`, { method: opts.method ?? "GET", headers: opts.headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });

const withServer = async (server: Server, body: (base: string) => Promise<void>): Promise<void> => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await body(base);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
};

const DIR = testRecordDir("printkit");
/** A real image placed outside play/art/ (under the git-ignored out/), to prove it is not served. */
const OUTSIDE_REL = `out/online-test-printkit-art-${process.pid}/T-001.webp`;
test.before(() => {
  mkdirSync(join(SIM2, OUTSIDE_REL, ".."), { recursive: true });
  copyFileSync(join(SIM2, "play/art/adopted/T-001.webp"), join(SIM2, OUTSIDE_REL));
});
test.after(() => {
  rmSync(join(SIM2, OUTSIDE_REL, ".."), { recursive: true, force: true });
  if (existsSync(DIR)) rmSync(DIR, { recursive: true, force: true });
});

test("the online server serves the art as image/webp, cached for a day, never gzipped; CSP img-src allows it", async () => {
  const app: OnlineApp = newApp(DIR);
  const file = readFileSync(join(SIM2, "play/art/adopted/T-001.webp"));
  await withServer(createOnlineServer(app), async (base) => {
    const r = await raw(base, "/play/art/adopted/T-001.webp", { headers: { "accept-encoding": "gzip" } });
    assert.equal(r.status, 200);
    assert.equal(r.headers["content-type"], "image/webp");
    assert.equal(r.headers["cache-control"], `public, max-age=${ART_MAX_AGE_S}`);
    assert.equal(r.headers["content-encoding"], undefined, "already compressed");
    assert.equal(r.headers["x-content-type-options"], "nosniff");
    assert.match(String(r.headers["content-security-policy"]), /(?:^|;\s*)img-src 'self'/);
    assert.equal(Number(r.headers["content-length"]), file.length);
    assert.deepEqual(r.body, file, "the bytes on disk, untouched");
    // every art file of the pack is reachable at its data path
    for (const c of AD.cards) {
      if (c.art === undefined) continue;
      for (const p of [c.art.card, c.art.square]) assert.equal((await raw(base, `/${p}`)).status, 200, p);
    }
    const head = await raw(base, "/play/art/adopted/O-008-sq.webp", { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    assert.equal(Number(head.headers["content-length"]), statSync(join(SIM2, "play/art/adopted/O-008-sq.webp")).size);

    // outside play/art/, or not an art file: 404, and the 404 is not cached
    for (const path of [
      `/${OUTSIDE_REL}`,
      `/play/art/adopted/..%2f..%2f..%2f${OUTSIDE_REL.replaceAll("/", "%2f")}`,
      "/play/art/adopted/nope.webp",
      "/play/art/adopted/T-001.png",
      "/play/art/adopted/T-001.webp.ts",
      "/data/T-001.webp",
      "/src/T-001.webp",
      "/play/T-001.webp",
    ]) {
      const bad = await raw(base, path);
      assert.equal(bad.status, 404, path);
      assert.equal(bad.headers["cache-control"], "no-store", path);
    }
    // the text files keep their rules
    const css = await raw(base, "/play/table.css");
    assert.equal(css.headers["cache-control"], `public, max-age=${STATIC_MAX_AGE_S}`);
  });
});

test("the static allow-list admits play/art/<set>/<file>.webp|.jpg and nothing around it", () => {
  assert.equal(onlineStaticAllowed("play/art/adopted/T-001.webp"), true);
  assert.equal(onlineStaticAllowed("play/art/adopted/T-001-sq.webp"), true);
  assert.equal(onlineStaticAllowed("play/art/adopted/T-001.jpg"), true);
  for (const rel of ["play/art/T-001.webp", "play/art/adopted/x/T-001.webp", "play/art/adopted/T-001.png", "play/art/adopted/T-001.svg", "play/art/adopted/.webp", "out/printkit/T-001.webp"]) {
    assert.equal(onlineStaticAllowed(rel), false, rel);
  }
  assert.equal(staticCacheControl("/play/art/adopted/T-001.webp"), `public, max-age=${ART_MAX_AGE_S}`);
  assert.equal(staticCacheControl("/online/lobby.html"), "no-store");
  assert.equal(isImagePath("/play/art/adopted/T-001.webp?v=2"), true);
  assert.equal(isImagePath("/play/table.css"), false);
});

test("serveImage reads only under play/art/, whatever the filter allows", async () => {
  const ok = await serveImage("/play/art/adopted/T-002-sq.webp");
  assert.equal(ok.code, 200);
  assert.equal(ok.type, "image/webp");
  assert.ok(Buffer.isBuffer(ok.body) && ok.body.equals(readFileSync(join(SIM2, "play/art/adopted/T-002-sq.webp"))));
  assert.equal((await serveImage(`/${OUTSIDE_REL}`, () => true)).code, 404, "a permissive filter does not widen it");
  assert.equal((await serveImage("/play/art/adopted/T-001.webp", () => false)).code, 404, "the filter still applies");
  assert.equal((await serveImage("/play/art/adopted/%00.webp")).code, 404);
  // the text path of the play server is unchanged: an image is not a text file
  assert.equal((await serve("/play/art/adopted/T-001.webp")).code, 404);
});

test("the local play server serves the art too (no-store, like everything it serves)", async () => {
  const file = readFileSync(join(SIM2, "play/art/adopted/T-008.webp"));
  await withServer(createPlayServer(), async (base) => {
    const r = await raw(base, "/play/art/adopted/T-008.webp");
    assert.equal(r.status, 200);
    assert.equal(r.headers["content-type"], "image/webp");
    assert.equal(r.headers["cache-control"], "no-store");
    assert.deepEqual(r.body, file);
    assert.equal((await raw(base, `/${OUTSIDE_REL}`)).status, 404);
    assert.equal((await raw(base, `/play/art/adopted/..%2f..%2f..%2f${OUTSIDE_REL.replaceAll("/", "%2f")}`)).status, 404);
  });
});
