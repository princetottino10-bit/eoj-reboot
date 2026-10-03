// Finds a mid-game position for the /world showcase: plays r1003 +
// adopted-1003 AI-vs-AI games with fixed seeds and lists the positions (after
// a whole turn) where every unit has art and both sides have 2+ units, best
// first: player 0 on 玖龍街 cards and player 1 on 酒呑 cards as far as possible,
// then cards that face the viewer's side (south) so their faces show.
// Usage: node --experimental-strip-types sim2/scripts/world-position-search.ts [seeds] [ai]
import { loadPack, packPath } from "../src/pack-io.ts";
import { presetConfig } from "../src/presets.ts";
import { createGame, makeCtx, unitHp, unitMaxHp } from "../src/state.ts";
import { checkRoundLimit, defaultMulliganPolicy, endTurn, performMulligan, startTurn } from "../src/turn.ts";
import { playMainPhase } from "../src/runner.ts";
import { makeAi } from "../src/ai/index.ts";
import type { GameEvent } from "../src/types.ts";

const pack = loadPack(packPath("adopted-1003"));
const ctx = makeCtx(presetConfig("r1003"), pack);
const seeds = Number(process.argv[2] ?? 200);
const kind = process.argv[3] ?? "greedy";
const ais = [makeAi(kind), makeAi(kind)] as const;

type Hit = { seed: number; turns: number; score: number; units: string };
const hits: Hit[] = [];
for (let seed = 1; seed <= seeds; seed++) {
  const s = createGame(ctx, seed);
  const events: GameEvent[] = [];
  performMulligan(ctx, s, events, (c, st, p) => (ais[p].mulligan ?? defaultMulliganPolicy)(c, st, p));
  for (let turn = 1; turn <= 14 && !s.ended; turn++) {
    if (checkRoundLimit(ctx, s, events)) break;
    startTurn(ctx, s, events, ais[s.turnPlayer].tansu);
    if (s.ended) break;
    playMainPhase(ctx, s, [ais[0], ais[1]], events);
    if (s.ended) break;
    endTurn(ctx, s, events, ais[s.turnPlayer].discard);
    const byOwner = [0, 1].map((p) => s.units.filter((u) => u.owner === p));
    const clanOk = byOwner[0].every((u) => pack.byId.get(u.cardId)?.printId?.startsWith("T")) && byOwner[1].every((u) => pack.byId.get(u.cardId)?.printId?.startsWith("O"));
    const artOk = s.units.every((u) => pack.byId.get(u.cardId)?.art !== undefined);
    const match = byOwner[0].filter((u) => pack.byId.get(u.cardId)?.printId?.startsWith("T")).length + byOwner[1].filter((u) => pack.byId.get(u.cardId)?.printId?.startsWith("O")).length;
    if (!artOk || byOwner[0].length < 2 || byOwner[1].length < 2 || s.units.some((u) => u.hiddenBy !== null)) continue;
    const units = s.units
      .map((u) => `${pack.byId.get(u.cardId)?.printId}@${u.pos.x},${u.pos.y} f${u.facing} p${u.owner} ${unitHp(ctx, u)}/${unitMaxHp(ctx, u)}`)
      .join("  ");
    hits.push({ seed, turns: turn, score: (clanOk ? 100 : 0) + match * 10 - (s.units.length - match) * 15 + s.units.length * 3 + s.units.filter((u) => u.facing === 2).length * 12 + s.units.filter((u) => u.facing !== 0).length * 4, units });
  }
}
hits.sort((a, b) => b.score - a.score);
for (const h of hits.slice(0, 12)) console.log(`seed ${h.seed} turns ${h.turns}: ${h.units}`);
console.log(`${hits.length} candidate positions`);
