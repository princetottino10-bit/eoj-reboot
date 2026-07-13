#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "data", "cards.json");
const OUT_PATH = path.join(ROOT, "sim-results-stat-curves.json");
const PHASE2A_OUT_PATH = path.join(ROOT, "docs", "baselines", "phase2a-main-search-results.json");
const PHASE2A_MD_PATH = path.join(ROOT, "docs", "baselines", "phase2a-main-search.md");
const BASELINE_V3_OUT_PATH = path.join(ROOT, "docs", "baselines", "pure-vanilla-baseline-v3-results.json");
const BASELINE_V3_MD_PATH = path.join(ROOT, "docs", "baselines", "pure-vanilla-baseline-v3.md");
const PHASE2B_OUT_PATH = path.join(ROOT, "docs", "baselines", "phase2b-item-layer-results.json");
const PHASE2B_MD_PATH = path.join(ROOT, "docs", "baselines", "phase2b-item-layer.md");
const REACT_SWEEP_OUT_PATH = path.join(ROOT, "docs", "baselines", "react-cost-sweep-results.json");
const REACT_SWEEP_MD_PATH = path.join(ROOT, "docs", "baselines", "react-cost-sweep.md");
const PHASE2D_OUT_PATH = path.join(ROOT, "docs", "baselines", "phase2d-rotate-attack-results.json");
const PHASE2D_MD_PATH = path.join(ROOT, "docs", "baselines", "phase2d-rotate-attack.md");
const STANDARD_HANDICAP_OUT_PATH = path.join(ROOT, "docs", "baselines", "standard-mana-handicap-results.json");
const STANDARD_HANDICAP_MD_PATH = path.join(ROOT, "docs", "baselines", "standard-mana-handicap.md");
const BASELINE_V31_OUT_PATH = path.join(ROOT, "docs", "baselines", "pure-vanilla-baseline-v3.1-results.json");
const BASELINE_V31_MD_PATH = path.join(ROOT, "docs", "baselines", "pure-vanilla-baseline-v3.1.md");
const PHASE2B_V31_OUT_PATH = path.join(ROOT, "docs", "baselines", "phase2b-item-layer-v31-results.json");
const PHASE2B_V31_MD_PATH = path.join(ROOT, "docs", "baselines", "phase2b-item-layer-v31.md");
const REACT_VALUE_FORKED_OUT_PATH = path.join(ROOT, "docs", "baselines", "react-value-forked-results.json");
const REACT_VALUE_FORKED_MD_PATH = path.join(ROOT, "docs", "baselines", "react-value-forked.md");
const REACT_VALUE_FORKED_V2_OUT_PATH = path.join(ROOT, "docs", "baselines", "react-value-forked-v2-results.json");
const REACT_VALUE_FORKED_V2_MD_PATH = path.join(ROOT, "docs", "baselines", "react-value-forked-v2.md");
const R1_FIRSTPLAYER_32K_OUT_PATH = path.join(ROOT, "docs", "baselines", "r1-firstplayer-32k-results.json");
const R1_FIRSTPLAYER_32K_MD_PATH = path.join(ROOT, "docs", "baselines", "r1-firstplayer-32k.md");
const SHAPES_0718_OUT_PATH = path.join(ROOT, "docs", "baselines", "shapes-0718-results.json");
const SHAPES_0718_MD_PATH = path.join(ROOT, "docs", "baselines", "shapes-0718.md");
const SHAPES_0718_D1_OUT_PATH = path.join(ROOT, "docs", "baselines", "shapes-0718-d1-results.json");
const SHAPES_0718_D1_MD_PATH = path.join(ROOT, "docs", "baselines", "shapes-0718-d1.md");
const SHAPES_0718_M_OUT_PATH = path.join(ROOT, "docs", "baselines", "shapes-0718-m-results.json");
const SHAPES_0718_M_MD_PATH = path.join(ROOT, "docs", "baselines", "shapes-0718-m.md");

const FOCUS_FACTIONS = ["cip", "aggro", "spell", "defense"];
const BOARD_ATTRS = ["火", "火", "水", "水", "土", "土", "木", "木", "無"];
const ATTR_OPPOSITES = { 火: "水", 水: "火", 土: "木", 木: "土" };
const DIRS = [0, 1, 2, 3];
const LIFE_TOTAL = 15;
const MANA_CAP = 15;
const START_MANA_FIRST = 3;
const START_MANA_SECOND = 4;
const DESTROY_MANA_GAIN = 1;
const MAX_HP = 10;
const WEAK_BONUS = 2;
const HAND_SIZE = 5;
const DEFAULT_DECK_CREATURES = 12;
const DRAFT_DECK_CREATURES = 16;
const MAX_HALF_TURNS = 80;
const PURE_FACTION = "pure";
const PURE_ATTRIBUTES = ["earth", "water", "fire", "wind"];
const PURE_BOARD_ATTRS = ["water", "fire", "wind", "earth", "neutral", "water", "fire", "wind", "earth"];
const EXTRA_ATTR_OPPOSITES = { fire: "water", water: "fire", earth: "wind", wind: "earth" };
const ITEM_TYPES = ["removal", "economy", "buff", "draw"];
const PURE_ITEMS = {
  removal: { id: "item_removal", name: "Pure Item - Removal", cost: 2 },
  economy: { id: "item_economy", name: "Pure Item - Economy", cost: 1 },
  buff: { id: "item_buff", name: "Pure Item - Buff", cost: 2 },
  draw: { id: "item_draw", name: "Pure Item - Draw", cost: 1 },
};
const PURE_SHAPES_0718 = [
  { shape: "ashigaru", name: "足軽", count: 4, cost: 2, attackCells: [[1, 0]], weaknessCells: [[-1, 0]] },
  { shape: "kenshi", name: "剣士", count: 4, cost: 3, attackCells: [[1, 0]], weaknessCells: [[-1, 0]] },
  { shape: "kyuhei", name: "弓兵", count: 2, cost: 4, attackCells: [[1, 0], [2, 0]], weaknessCells: [[0, 1], [0, -1]] },
  { shape: "fuhei", name: "斧兵", count: 2, cost: 4, attackCells: [[1, 0], [0, 1], [0, -1]], weaknessCells: [[-1, 0]] },
  { shape: "souto", name: "双頭", count: 2, cost: 5, attackCells: [[1, 0], [-1, 0]], weaknessCells: [[0, 1], [0, -1]] },
  { shape: "senpu", name: "旋風", count: 1, cost: 6, attackCells: [[1, 0], [-1, 0], [0, 1], [0, -1]], weaknessCells: [[-1, 0]] },
  { shape: "ryu", name: "竜", count: 1, cost: 7, attackCells: [[1, 0], [2, 0], [0, 1], [0, -1]], weaknessCells: [[-1, 0]] },
];
const PURE_SHAPES_M_0718 = [
  { shape: "ashigaru", name: "足軽", count: 4, cost: 2, attackCells: [[1, 0]], weaknessCells: [[-1, 0]] },
  { shape: "kenshi", name: "剣士", count: 4, cost: 3, attackCells: [[1, 0]], weaknessCells: [[-1, 0]] },
  { shape: "kyuhei", name: "弓兵", count: 1, cost: 4, attackCells: [[1, 0], [2, 0]], weaknessCells: [[0, 1], [0, -1]] },
  { shape: "fuhei", name: "斧兵", count: 1, cost: 4, attackCells: [[1, 0], [0, 1], [0, -1]], weaknessCells: [[-1, 0]] },
  { shape: "juken", name: "重剣", count: 2, cost: 4, attackCells: [[1, 0]], weaknessCells: [[-1, 0]] },
  { shape: "souto", name: "双頭", count: 1, cost: 5, attackCells: [[1, 0], [-1, 0]], weaknessCells: [[0, 1], [0, -1]] },
  { shape: "taiken", name: "大剣", count: 1, cost: 5, attackCells: [[1, 0]], weaknessCells: [[-1, 0]] },
  { shape: "senpu", name: "旋風", count: 1, cost: 6, attackCells: [[1, 0], [-1, 0], [0, 1], [0, -1]], weaknessCells: [[-1, 0]] },
  { shape: "ryu", name: "竜", count: 1, cost: 7, attackCells: [[1, 0], [2, 0], [0, 1], [0, -1]], weaknessCells: [[-1, 0]] },
];
const REACT_NEED_TYPES = ["unneeded", "attackRequired", "rotationRequired", "eitherRequired"];

function emptyShapeStats(shapeDefinitions = PURE_SHAPES_0718) {
  return Object.fromEntries(shapeDefinitions.map((shape) => [shape.shape, {
    name: shape.name,
    kills: 0,
    deaths: 0,
    attackOnlyReacts: 0,
    rotateAttackReacts: 0,
  }]));
}

const HP_CURVES = {
  lean: { 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7 },
  standard: { 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8 },
  hybrid: { 2: 2, 3: 3, 4: 4, 5: 6, 6: 7, 7: 8 },
  lowLeanHighStandard: { 2: 2, 3: 3, 4: 4, 5: 6, 6: 7, 7: 8 },
  lowStandardHighLean: { 2: 3, 3: 4, 4: 5, 5: 5, 6: 6, 7: 7 },
  sturdy: { 2: 4, 3: 5, 4: 6, 5: 7, 6: 8, 7: 9 },
};

const ATK_CURVES = {
  low: { 2: 1, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3 },
  standard: { 2: 1, 3: 1, 4: 2, 5: 2, 6: 3, 7: 3 },
  high: { 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4 },
};

const REACT_CURVES = {
  light: { 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 3 },
  standard: { 2: 2, 3: 2, 4: 3, 5: 3, 6: 4, 7: 4 },
  heavy: { 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 7: 5 },
};

const REACT_COST_SWEEP_CURVES = {
  light: { 2: 1, 3: 2, 4: 2, 5: 2, 6: 2, 7: 3 },
  standard: { 2: 2, 3: 2, 4: 2, 5: 3, 6: 3, 7: 3 },
  heavy: { 2: 2, 3: 3, 4: 3, 5: 3, 6: 3, 7: 4 },
  heavyPlus: { 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 7: 5 },
};

const SHAPE_TAXES = ["light", "medium"];
const LIFE_RULES = ["123", "134"];

const PURE_CURVES = {
  curveA: { hp: "standard", atk: "high", react: "heavy" },
  curveB: { hp: "lean", atk: "high", react: "heavy" },
  curveC: { hp: "standard", atk: "high", react: "standard" },
  curveD: { hp: "standard", atk: "high", react: "light" },
};

const PURE_DISTRIBUTIONS = {
  light: { 2: 5, 3: 5, 4: 3, 5: 2, 6: 1, 7: 0 },
  lowmid: { 2: 4, 3: 4, 4: 4, 5: 2, 6: 1, 7: 1 },
  balance: { 2: 3, 3: 4, 4: 3, 5: 3, 6: 2, 7: 1 },
  midheavy: { 2: 2, 3: 3, 4: 3, 5: 3, 6: 3, 7: 2 },
  heavy: { 2: 2, 3: 2, 4: 3, 5: 3, 6: 3, 7: 3 },
};

const PHASE2A_DISTRIBUTIONS = {
  light: { 2: 5, 3: 5, 4: 3, 5: 2, 6: 1, 7: 0 },
  lowmid: { 2: 4, 3: 4, 4: 4, 5: 2, 6: 1, 7: 1 },
  lowbal: { 2: 4, 3: 4, 4: 3, 5: 3, 6: 1, 7: 1 },
  balance: { 2: 3, 3: 4, 4: 3, 5: 3, 6: 2, 7: 1 },
};

function parseArgs(argv) {
  const args = {
    samples: 300,
    top: 12,
    seed: 20260702,
    focus: false,
    only: null,
    p1Mana: 0,
    oracle: false,
    checkSearchDepth: 0,
    rotationGrid: false,
    deckRulesGrid: false,
    pureVanillaGrid: false,
    phase2aMainSearch: false,
    phase2aFreezeA: false,
    phase2bItemLayer: false,
    reactCostSweep: false,
    phase2dRotateAttack: false,
    standardManaHandicap: false,
    v31FreezeAndItems: false,
    reactValueForked: false,
    reactValueForkedV2: false,
    r1Firstplayer32k: false,
    shapes0718: false,
    shapes0718D1: false,
    shapes0718M: false,
    phase2aPrimarySamples: 1000,
    phase2aSecondarySamples: 2000,
    phase2aRobustnessSamples: 1000,
    phase2aCenterSamples: 2000,
    phase2aTop: 3,
    phase2bB1Samples: 2000,
    phase2bB2Samples: 1000,
    phase2bB3Samples: 1000,
    reactCostSweepSamples: 2000,
    phase2dSamples: 2000,
    standardManaHandicapSamples: 2000,
    v31CenterSamples: 2000,
    v31RobustnessSamples: 1000,
    v31ItemB1Samples: 2000,
    v31ItemB2Samples: 1000,
    v31ItemB3Samples: 1000,
    reactValueForkedSamples: 3000,
    reactValueForkedV2Samples: 3000,
    deckCreatures: DEFAULT_DECK_CREATURES,
    fatigue: false,
    deckRulesDraft: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--focus") args.focus = true;
    else if (arg === "--samples") args.samples = Number(argv[++i] ?? args.samples);
    else if (arg === "--top") args.top = Number(argv[++i] ?? args.top);
    else if (arg === "--seed") args.seed = Number(argv[++i] ?? args.seed);
    else if (arg === "--only") args.only = argv[++i] ?? null;
    else if (arg === "--p1-mana") args.p1Mana = Number(argv[++i] ?? args.p1Mana);
    else if (arg === "--oracle") args.oracle = true;
    else if (arg === "--rotation-grid") args.rotationGrid = true;
    else if (arg === "--deck-rules-grid") args.deckRulesGrid = true;
    else if (arg === "--phase2a-main-search") {
      args.phase2aMainSearch = true;
      args.oracle = true;
      args.checkSearchDepth = 6;
    }
    else if (arg === "--phase2a-freeze-a") {
      args.phase2aFreezeA = true;
      args.oracle = true;
      args.checkSearchDepth = 6;
    }
    else if (arg === "--phase2b-item-layer") {
      args.phase2bItemLayer = true;
      args.oracle = true;
      args.checkSearchDepth = 6;
    }
    else if (arg === "--react-cost-sweep") {
      args.reactCostSweep = true;
      args.oracle = true;
      args.checkSearchDepth = 6;
    }
    else if (arg === "--phase2d-rotate-attack") {
      args.phase2dRotateAttack = true;
      args.oracle = true;
      args.checkSearchDepth = 6;
    }
    else if (arg === "--standard-mana-handicap") {
      args.standardManaHandicap = true;
      args.oracle = true;
      args.checkSearchDepth = 6;
    }
    else if (arg === "--v31-freeze-and-items") {
      args.v31FreezeAndItems = true;
      args.oracle = true;
      args.checkSearchDepth = 6;
    }
    else if (arg === "--react-value-forked") {
      args.reactValueForked = true;
      args.oracle = false;
      args.checkSearchDepth = 6;
    }
    else if (arg === "--react-value-forked-v2") {
      args.reactValueForkedV2 = true;
      args.oracle = false;
      args.checkSearchDepth = 6;
    }
    else if (arg === "--r1-firstplayer-32k") {
      args.r1Firstplayer32k = true;
      args.oracle = false;
      args.checkSearchDepth = 6;
    }
    else if (arg === "--shapes-0718") {
      args.shapes0718 = true;
      args.oracle = true;
      args.checkSearchDepth = 6;
    }
    else if (arg === "--shapes-0718-d1") {
      args.shapes0718D1 = true;
      args.oracle = true;
      args.checkSearchDepth = 6;
    }
    else if (arg === "--shapes-0718-m") {
      args.shapes0718M = true;
      args.oracle = true;
      args.checkSearchDepth = 6;
    }
    else if (arg === "--phase2a-primary-samples") args.phase2aPrimarySamples = Number(argv[++i] ?? args.phase2aPrimarySamples);
    else if (arg === "--phase2a-secondary-samples") args.phase2aSecondarySamples = Number(argv[++i] ?? args.phase2aSecondarySamples);
    else if (arg === "--phase2a-robustness-samples") args.phase2aRobustnessSamples = Number(argv[++i] ?? args.phase2aRobustnessSamples);
    else if (arg === "--phase2a-center-samples") args.phase2aCenterSamples = Number(argv[++i] ?? args.phase2aCenterSamples);
    else if (arg === "--phase2a-top") args.phase2aTop = Number(argv[++i] ?? args.phase2aTop);
    else if (arg === "--phase2b-b1-samples") args.phase2bB1Samples = Number(argv[++i] ?? args.phase2bB1Samples);
    else if (arg === "--phase2b-b2-samples") args.phase2bB2Samples = Number(argv[++i] ?? args.phase2bB2Samples);
    else if (arg === "--phase2b-b3-samples") args.phase2bB3Samples = Number(argv[++i] ?? args.phase2bB3Samples);
    else if (arg === "--react-cost-sweep-samples") args.reactCostSweepSamples = Number(argv[++i] ?? args.reactCostSweepSamples);
    else if (arg === "--phase2d-samples") args.phase2dSamples = Number(argv[++i] ?? args.phase2dSamples);
    else if (arg === "--standard-mana-handicap-samples") args.standardManaHandicapSamples = Number(argv[++i] ?? args.standardManaHandicapSamples);
    else if (arg === "--v31-center-samples") args.v31CenterSamples = Number(argv[++i] ?? args.v31CenterSamples);
    else if (arg === "--v31-robustness-samples") args.v31RobustnessSamples = Number(argv[++i] ?? args.v31RobustnessSamples);
    else if (arg === "--v31-item-b1-samples") args.v31ItemB1Samples = Number(argv[++i] ?? args.v31ItemB1Samples);
    else if (arg === "--v31-item-b2-samples") args.v31ItemB2Samples = Number(argv[++i] ?? args.v31ItemB2Samples);
    else if (arg === "--v31-item-b3-samples") args.v31ItemB3Samples = Number(argv[++i] ?? args.v31ItemB3Samples);
    else if (arg === "--react-value-forked-samples") args.reactValueForkedSamples = Number(argv[++i] ?? args.reactValueForkedSamples);
    else if (arg === "--react-value-forked-v2-samples") args.reactValueForkedV2Samples = Number(argv[++i] ?? args.reactValueForkedV2Samples);
    else if (arg === "--pure-vanilla-grid" || arg === "--pure") {
      args.pureVanillaGrid = true;
      args.deckCreatures = DRAFT_DECK_CREATURES;
      args.fatigue = false;
    }
    else if (arg === "--deck-creatures") args.deckCreatures = Number(argv[++i] ?? args.deckCreatures);
    else if (arg === "--fatigue") args.fatigue = true;
    else if (arg === "--deck-rules-draft") {
      args.deckRulesDraft = true;
      args.deckCreatures = DRAFT_DECK_CREATURES;
      args.fatigue = true;
    }
    else if (arg === "--check-search-depth") {
      args.checkSearchDepth = Number(argv[++i] ?? args.checkSearchDepth);
    }
  }
  return args;
}

function rng(seed) {
  let t = seed >>> 0;
  const next = () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  next.clone = () => rng(t);
  next.state = () => t;
  return next;
}

function shuffle(arr, random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr, random) {
  return arr[Math.floor(random() * arr.length)];
}

function clampCost(cost) {
  return Math.max(2, Math.min(7, cost));
}

function row(idx) {
  return Math.floor(idx / 3);
}

function col(idx) {
  return idx % 3;
}

function idx(r, c) {
  return r * 3 + c;
}

function valid(r, c) {
  return r >= 0 && r < 3 && c >= 0 && c < 3;
}

function relToAbs(rr, rc, dir) {
  if (dir === 0) return [-rr, rc];
  if (dir === 1) return [rc, rr];
  if (dir === 2) return [rr, -rc];
  return [-rc, -rr];
}

function absToRel(dr, dc, dir) {
  if (dir === 0) return [-dr, dc];
  if (dir === 1) return [dc, dr];
  if (dir === 2) return [dr, -dc];
  return [-dc, -dr];
}

function attackCellIndices(fromIdx, attackCells, dir) {
  if (attackCells == null) return [];
  if (attackCells === "all") return [...Array(9).keys()].filter((i) => i !== fromIdx);
  const out = [];
  for (const [rr, rc] of attackCells) {
    const [dr, dc] = relToAbs(rr, rc, dir);
    const tr = row(fromIdx) + dr;
    const tc = col(fromIdx) + dc;
    if (valid(tr, tc)) out.push(idx(tr, tc));
  }
  return out;
}

function isBlindSpot(attackerIdx, defenderIdx, defenderDir, weaknessCells) {
  if (!weaknessCells || weaknessCells.length === 0) return false;
  const dr = row(attackerIdx) - row(defenderIdx);
  const dc = col(attackerIdx) - col(defenderIdx);
  const [rr, rc] = absToRel(dr, dc, defenderDir);
  return weaknessCells.some(([wr, wc]) => wr === rr && wc === rc);
}

function inCounterRange(defenderIdx, defender, attackerIdx) {
  const cells = attackCellIndices(defenderIdx, defender.card.counter_cells, defender.dir);
  return cells.includes(attackerIdx);
}

function attrBonus(cardAttr, cellAttr) {
  if (cardAttr === "無" || cellAttr === "無" || cardAttr === "neutral" || cellAttr === "neutral") return 0;
  if (cardAttr === cellAttr) return 2;
  if (ATTR_OPPOSITES[cardAttr] === cellAttr) return -2;
  if (EXTRA_ATTR_OPPOSITES[cardAttr] === cellAttr) return -2;
  return 0;
}

function controlCount(board, owner) {
  return board.filter((c) => c && c.owner === owner).length;
}

function occupiedCount(board) {
  return board.filter(Boolean).length;
}

function hasHighCostControlled(board, owner) {
  return board.some((c) => c && c.owner === owner && c.card.cost >= 5);
}

function adjacentCells(i) {
  const r = row(i);
  const c = col(i);
  return [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ]
    .filter(([rr, cc]) => valid(rr, cc))
    .map(([rr, cc]) => idx(rr, cc));
}

function validSummonCells(board, owner) {
  const hasAlly = board.some((c) => c && c.owner === owner);
  if (!hasAlly) return [...Array(9).keys()].filter((i) => board[i] == null);
  const out = new Set();
  for (let i = 0; i < 9; i++) {
    if (board[i]?.owner !== owner) continue;
    for (const adj of adjacentCells(i)) {
      if (board[adj] == null) out.add(adj);
    }
  }
  return [...out];
}

function rangeCount(card) {
  if (typeof card.attack_range_count === "number") return card.attack_range_count;
  if (card.attack_cells === "all") return 8;
  if (card.attack_cells == null) return 0;
  return card.attack_cells.length;
}

function targetCount(card) {
  if (typeof card.attack_target_count === "number") return card.attack_target_count;
  if (card.attack_mode === "simultaneous") return rangeCount(card);
  return card.attack_cells == null ? 0 : 1;
}

function counterCount(card) {
  if (card.counter_cells === "all") return 8;
  if (card.counter_cells == null) return 0;
  return card.counter_cells.length;
}

function generateCard(card, variant) {
  const cost = clampCost(card.cost);
  let hp = HP_CURVES[variant.hp][cost];
  let atk = ATK_CURVES[variant.atk][cost];
  let reactivation = REACT_CURVES[variant.react][cost];
  const r = rangeCount(card);
  const t = targetCount(card);
  const cc = counterCount(card);
  const isMagic = card.attack_type === "魔道";

  if (variant.shapeTax === "light") {
    if (t >= 2) reactivation += 1;
    if (r >= 4) reactivation += 1;
    if (isMagic && r >= 8) atk -= 1;
  } else if (variant.shapeTax === "medium") {
    if (t >= 2) atk -= 1;
    if (r >= 3) reactivation += 1;
    if (r >= 5) atk -= 1;
    if (isMagic) reactivation += 1;
    if (cc === 0) hp += 1;
  }

  if (card.attack_cells == null || card.attack_mode === "none") atk = 0;
  else atk = Math.max(1, atk);

  const attackReactivation = Math.max(1, reactivation);

  return {
    id: card.id,
    name: card.name,
    faction: card.faction,
    cost,
    hp: Math.max(1, hp),
    atk,
    life_value: card.life_value ?? lifeDamageForCost(cost, variant.lifeRule),
    reactivation_cost: attackReactivation,
    rotation_cost: rotationCostForVariant(attackReactivation, variant),
    attribute: card.attribute,
    attack_cells: card.attack_cells,
    counter_cells: isMagic ? null : card.attack_cells,
    weakness_cells: card.weakness_cells ?? [[-1, 0]],
    attack_type: card.attack_type,
    attack_mode: card.attack_mode ?? "choice",
    attack_target_count: Math.max(0, targetCount(card)),
    attack_range_count: Math.max(0, rangeCount(card)),
  };
}

function rotationCostForVariant(attackReactivation, variant) {
  if (variant.rotationCost === "fixed1") return 1;
  if (variant.rotationCost === "minus2min1") return Math.max(1, attackReactivation - 2);
  return attackReactivation;
}

function attackCost(card) {
  return card.reactivation_cost;
}

function rotationCost(card) {
  return card.rotation_cost ?? card.reactivation_cost;
}

function lifeDamageForCost(cost, rule) {
  let base;
  if (rule === "134") base = cost <= 4 ? 1 : cost <= 6 ? 3 : 4;
  else base = cost <= 4 ? 1 : cost <= 6 ? 2 : 3;
  return base;
}

function lifeDamageForCard(card, rule) {
  return card.life_value ?? lifeDamageForCost(card.cost, rule);
}

function makeInstance(card, owner, dir, hpBonus, halfTurn) {
  const maxHp = Math.min(MAX_HP, Math.max(1, card.hp + hpBonus));
  return {
    card,
    owner,
    hp: maxHp,
    maxHp,
    atk: card.atk,
    dir,
    hasActed: false,
    hasRotated: false,
    summonedOnTurn: halfTurn,
  };
}

function buildDeck(faction, cardsByFaction, random, deckSize) {
  const pool = cardsByFaction[faction];
  if (!pool || pool.length === 0) throw new Error(`No cards for faction: ${faction}`);

  if (deckSize > pool.length * 2) {
    throw new Error(`Deck size ${deckSize} exceeds 2-copy limit for faction ${faction} (${pool.length} cards)`);
  }

  if (deckSize <= pool.length) {
    return shuffle(pool, random).slice(0, deckSize);
  }

  const deck = [...shuffle(pool, random)];
  const counts = new Map(deck.map((card) => [card.id, 1]));
  while (deck.length < deckSize) {
    let added = false;
    for (const card of shuffle(pool, random)) {
      if ((counts.get(card.id) ?? 0) >= 2) continue;
      deck.push(card);
      counts.set(card.id, (counts.get(card.id) ?? 0) + 1);
      added = true;
      if (deck.length >= deckSize) break;
    }
    if (!added) break;
  }

  if (deck.length !== deckSize) {
    throw new Error(`Could not build deck for faction ${faction}: ${deck.length}/${deckSize}`);
  }

  return shuffle(deck, random);
}

function buildPureDeck(variant, random, owner) {
  const attrs = pureAttributeBag(random, DRAFT_DECK_CREATURES);
  if (variant.shapeDeck0718) {
    const shapeDefinitions = variant.shapeDefinitions ?? PURE_SHAPES_0718;
    const deck = [];
    let serial = 0;
    for (const shape of shapeDefinitions) {
      for (let i = 0; i < shape.count; i++) {
        deck.push(generatePureCard({ ...variant, shape }, shape.cost, attrs[serial], `${owner}-${shape.shape}-${i}-${serial}`));
        serial += 1;
      }
    }
    if (deck.length !== DRAFT_DECK_CREATURES) {
      throw new Error(`Shape deck produced ${deck.length}/${DRAFT_DECK_CREATURES} cards`);
    }
    return shuffle(deck, random);
  }
  const distribution = variant.distributionsByOwner?.[owner] ?? variant.distribution;
  const distributionName = variant.distributionNamesByOwner?.[owner] ?? variant.distributionName;
  const itemCounts = variant.itemCountsByOwner?.[owner] ?? variant.itemCounts ?? null;
  const deck = [];
  let serial = 0;
  for (const [costText, count] of Object.entries(distribution)) {
    const cost = Number(costText);
    for (let i = 0; i < count; i++) {
      deck.push(generatePureCard({ ...variant, distributionName }, cost, attrs[serial], `${owner}-${cost}-${i}-${serial}`));
      serial += 1;
    }
  }
  if (deck.length !== DRAFT_DECK_CREATURES) {
    throw new Error(`Pure deck distribution ${variant.distributionName} produced ${deck.length} cards`);
  }
  if (itemCounts) {
    let itemSerial = 0;
    for (const type of ITEM_TYPES) {
      const count = itemCounts[type] ?? 0;
      for (let i = 0; i < count; i++) {
        deck.push(generatePureItem(type, owner, `${owner}-${type}-${i}-${itemSerial}`));
        itemSerial += 1;
      }
    }
    if (itemSerial !== 8) {
      throw new Error(`Pure item counts for ${variant.name} produced ${itemSerial} items`);
    }
  }
  return shuffle(deck, random);
}

function pureAttributeBag(random, size) {
  const bag = [];
  for (let i = 0; bag.length < size; i++) {
    bag.push(PURE_ATTRIBUTES[i % PURE_ATTRIBUTES.length]);
  }
  return shuffle(bag, random);
}

function generatePureCard(variant, cost, attribute, idSuffix) {
  const hp = HP_CURVES[variant.hp][cost];
  const atk = ATK_CURVES[variant.atk][cost];
  const reactCurve = variant.reactCostCurve ?? REACT_CURVES[variant.react];
  const reactivation = reactCurve[cost];
  const shape = variant.shape ?? null;
  return {
    id: `pure-${variant.curveName}-${variant.distributionName}-${idSuffix}`,
    name: shape?.name ?? `Pure C${cost}`,
    shape: shape?.shape ?? null,
    faction: PURE_FACTION,
    card_type: "creature",
    cost,
    hp,
    atk,
    life_value: lifeDamageForCost(cost, "134"),
    reactivation_cost: reactivation,
    rotation_cost: reactivation,
    attribute,
    attack_cells: shape?.attackCells ?? [[1, 0]],
    counter_cells: variant.counterFront1 ? [[1, 0]] : (shape?.attackCells ?? [[1, 0]]),
    weakness_cells: shape?.weaknessCells ?? [[-1, 0]],
    attack_type: "physical",
    attack_mode: "choice",
    attack_target_count: 1,
    attack_range_count: 1,
  };
}

function generatePureItem(type, owner, idSuffix) {
  const item = PURE_ITEMS[type];
  if (!item) throw new Error(`Unknown pure item type: ${type}`);
  return {
    id: `${item.id}-${owner}-${idSuffix}`,
    base_id: item.id,
    name: item.name,
    faction: PURE_FACTION,
    card_type: "item",
    item_type: type,
    cost: item.cost,
  };
}

function isItemCard(card) {
  return card?.card_type === "item";
}

function isCreatureCard(card) {
  return card && !isItemCard(card);
}

function drawToFive(player, state = null, owner = null) {
  let fatigueApplied = false;
  while (player.hand.length < HAND_SIZE) {
    if (player.deck.length > 0) {
      player.hand.push(player.deck.pop());
      if (player.deck.length === 0 && state && owner != null) {
        recordDeckEmpty(state, owner);
      }
      continue;
    }
    if (state && owner != null) {
      recordDeckEmpty(state, owner);
    }
    if (state && owner != null && player.discard.length > 0) {
      player.deck = shuffle(player.discard, state.random);
      player.discard = [];
      recordDeckReshuffle(state);
      continue;
    }
    if (state?.fatigue && owner != null) {
      const opponent = 1 - owner;
      state.players[opponent].lifeDamage += 1;
      state.metrics.fatigueDamage += 1;
      state.metrics.fatigueEvents += 1;
      fatigueApplied = true;
    }
    break;
  }
  while (player.hand.length > HAND_SIZE) {
    player.discard.push(player.hand.pop());
  }
  return fatigueApplied;
}

function recordDeckEmpty(state, owner) {
  if (state.deckEmptied[owner]) return;
  state.deckEmptied[owner] = true;
  state.metrics.deckExhaustions += 1;
  if (state.metrics.firstDeckEmptyHalfTurn == null) {
    state.metrics.firstDeckEmptyHalfTurn = state.halfTurns;
  }
}

function recordDeckReshuffle(state) {
  state.metrics.deckReshuffles += 1;
  if (state.metrics.firstDeckReshuffleHalfTurn == null) {
    state.metrics.firstDeckReshuffleHalfTurn = state.halfTurns;
  }
}

function addMana(player, amount, metrics) {
  const before = player.mana;
  const next = before + amount;
  metrics.manaIncome += amount;
  if (next >= MANA_CAP) metrics.capHits += 1;
  if (next > MANA_CAP) metrics.manaOverflow += next - MANA_CAP;
  player.mana = Math.min(MANA_CAP, next);
}

function grantDestroyMana(state, owner) {
  const amount = state.destroyManaGain ?? DESTROY_MANA_GAIN;
  if (amount <= 0) return;
  addMana(state.players[owner], amount, state.metrics);
  state.metrics.destroyManaGained += amount;
}

function spendMana(state, amount) {
  state.players[state.active].mana -= amount;
  state.metrics.manaSpent += amount;
}

function destroyCreatureAt(state, boardIdx) {
  const creature = state.board[boardIdx];
  if (!creature) return null;
  state.players[creature.owner].discard.push(creature.card);
  state.board[boardIdx] = null;
  return creature;
}

function drawOneCard(player, state, owner) {
  if (player.deck.length === 0) {
    if (state && owner != null) recordDeckEmpty(state, owner);
    if (state && owner != null && player.discard.length > 0) {
      player.deck = shuffle(player.discard, state.random);
      player.discard = [];
      recordDeckReshuffle(state);
    }
  }
  if (player.deck.length === 0) return false;
  player.hand.push(player.deck.pop());
  if (player.deck.length === 0 && state && owner != null) recordDeckEmpty(state, owner);
  return true;
}

function emptyItemCounts() {
  return Object.fromEntries(ITEM_TYPES.map((type) => [type, 0]));
}

function emptyReactNeedCounts() {
  return Object.fromEntries(REACT_NEED_TYPES.map((type) => [type, 0]));
}

function itemCountsTotal(counts) {
  return ITEM_TYPES.reduce((sum, type) => sum + (counts?.[type] ?? 0), 0);
}

function itemCountsForBothPlayers(counts) {
  const out = emptyItemCounts();
  for (const type of ITEM_TYPES) out[type] = (counts?.[type] ?? 0) * 2;
  return out;
}

function findItemHandIndex(player, type) {
  return player.hand.findIndex((card) => isItemCard(card) && card.item_type === type);
}

function hasAffordableSummonWithMana(state, mana) {
  const active = state.active;
  if (controlCount(state.board, active) >= 5) return false;
  if (validSummonCells(state.board, active).length === 0) return false;
  return state.players[active].hand.some((card) => isCreatureCard(card) && card.cost <= mana);
}

function hasAffordableReactivationWithMana(state, mana) {
  const active = state.active;
  for (let i = 0; i < 9; i++) {
    const char = state.board[i];
    if (!char || char.owner !== active) continue;
    if (!char.hasActed && attackTargetsFor(state.board, i, char).length > 0 && attackCost(char.card) <= mana) return true;
    if (!char.hasRotated && rotationCost(char.card) <= mana) return true;
  }
  return false;
}

function wouldBlockCurrentSummon(state, cost) {
  const mana = state.players[state.active].mana;
  return hasAffordableSummonWithMana(state, mana) && !hasAffordableSummonWithMana(state, mana - cost);
}

function executeItemAction(state, action, source = "item-ai") {
  const active = state.active;
  const player = state.players[active];
  const card = player.hand[action.handIndex];
  if (!isItemCard(card) || card.item_type !== action.itemType) return false;
  if (player.mana < card.cost) return false;

  if (action.itemType === "removal") {
    const target = state.board[action.targetIdx];
    if (!target || target.owner === active) return false;
  } else if (action.itemType === "buff") {
    const target = state.board[action.targetIdx];
    if (!target || target.owner !== active || target.maxHp >= MAX_HP) return false;
  }

  player.hand.splice(action.handIndex, 1);
  spendMana(state, card.cost);
  player.discard.push(card);
  state.metrics.itemUses += 1;
  state.metrics.itemUsesByType[action.itemType] += 1;
  if (source === "check-search") state.metrics.checkSearchItemUses += 1;

  if (action.itemType === "removal") {
    const target = state.board[action.targetIdx];
    if (!target || target.owner === active) return true;
    target.hp -= 2;
    state.metrics.itemRemovalDamage += 2;
    if (target.hp <= 0) {
      const destroyed = destroyCreatureAt(state, action.targetIdx);
      if (destroyed) {
        const life = lifeDamageForCard(destroyed.card, state.lifeRule);
        state.players[active].lifeDamage += life;
        grantDestroyMana(state, destroyed.owner);
        recordKill(state, destroyed.card.cost, false, null, destroyed.card);
        state.metrics.itemRemovalKills += 1;
      }
    }
    return true;
  }

  if (action.itemType === "economy") {
    addMana(player, 2, state.metrics);
    return true;
  }

  if (action.itemType === "buff") {
    const target = state.board[action.targetIdx];
    if (!target || target.owner !== active) return true;
    const gain = Math.max(0, Math.min(MAX_HP, target.maxHp + 2) - target.maxHp);
    target.maxHp += gain;
    target.hp += gain;
    state.metrics.itemBuffHpGained += gain;
    return true;
  }

  if (action.itemType === "draw") {
    if (drawOneCard(player, state, active)) state.metrics.itemDrawCards += 1;
    return true;
  }

  return false;
}

function scoreRemovalItemTarget(state, targetIdx, manaAfter) {
  const active = state.active;
  const target = state.board[targetIdx];
  if (!target || target.owner === active || target.hp > 2) return -Infinity;
  let score = 30 + target.card.cost * 4 + lifeDamageForCard(target.card, state.lifeRule) * 5;
  if (controlCount(state.board, 1 - active) >= 4) score += 80;
  else if (controlCount(state.board, 1 - active) === 3) score += 30;
  if (hasAffordableSummonWithMana(state, manaAfter)) score += 18;
  return score;
}

function chooseRemovalItemAction(state) {
  const active = state.active;
  const player = state.players[active];
  const handIndex = findItemHandIndex(player, "removal");
  if (handIndex < 0) return null;
  const item = player.hand[handIndex];
  if (player.mana < item.cost) return null;
  const manaAfter = player.mana - item.cost;
  let best = null;
  for (let i = 0; i < 9; i++) {
    const score = scoreRemovalItemTarget(state, i, manaAfter);
    if (!Number.isFinite(score)) continue;
    if (!best || score > best.score) {
      best = { type: "item", itemType: "removal", handIndex, targetIdx: i, cost: item.cost, score };
    }
  }
  if (!best) return null;
  const oppControl = controlCount(state.board, 1 - active);
  if (!hasAffordableSummonWithMana(state, manaAfter) && oppControl < 4) return null;
  return best;
}

function chooseEconomyItemAction(state) {
  const player = state.players[state.active];
  const handIndex = findItemHandIndex(player, "economy");
  if (handIndex < 0 || player.mana < 1 || player.mana >= MANA_CAP) return null;
  const beforeMana = player.mana;
  const afterMana = Math.min(MANA_CAP, beforeMana + 1);
  const enablesSummon = !hasAffordableSummonWithMana(state, beforeMana) && hasAffordableSummonWithMana(state, afterMana);
  const enablesReactivation =
    !hasAffordableReactivationWithMana(state, beforeMana) && hasAffordableReactivationWithMana(state, afterMana);
  const itemCardsInHand = player.hand.filter(isItemCard).length;
  if (enablesSummon || enablesReactivation || (beforeMana <= 12 && itemCardsInHand >= 3)) {
    return { type: "item", itemType: "economy", handIndex, cost: 1, score: enablesSummon ? 42 : enablesReactivation ? 30 : 12 };
  }
  return null;
}

function scoreBuffTarget(state, targetIdx) {
  const active = state.active;
  const char = state.board[targetIdx];
  if (!char || char.owner !== active || char.maxHp >= MAX_HP) return -Infinity;
  const threatened = state.board.some((enemy, enemyIdx) => {
    if (!enemy || enemy.owner === active) return false;
    return attackTargetsFor(state.board, enemyIdx, enemy).includes(targetIdx);
  });
  let score = 8 + (targetIdx === 4 ? 5 : 0) + adjacentCells(targetIdx).length;
  if (threatened) score += 16;
  if (controlCount(state.board, active) >= 4) score += 12;
  score += Math.max(0, char.maxHp - char.hp);
  return score;
}

function chooseBuffItemAction(state) {
  const player = state.players[state.active];
  const handIndex = findItemHandIndex(player, "buff");
  if (handIndex < 0 || player.mana < 2 || wouldBlockCurrentSummon(state, 2)) return null;
  let best = null;
  for (let i = 0; i < 9; i++) {
    const score = scoreBuffTarget(state, i);
    if (!Number.isFinite(score)) continue;
    if (!best || score > best.score) {
      best = { type: "item", itemType: "buff", handIndex, targetIdx: i, cost: 2, score };
    }
  }
  return best && best.score >= 12 ? best : null;
}

function chooseDrawItemAction(state) {
  const player = state.players[state.active];
  const handIndex = findItemHandIndex(player, "draw");
  if (handIndex < 0 || player.mana < 1 || wouldBlockCurrentSummon(state, 1)) return null;
  const summonableCreatures = player.hand.filter((card) => isCreatureCard(card) && card.cost <= player.mana).length;
  if (summonableCreatures <= 2) {
    return { type: "item", itemType: "draw", handIndex, cost: 1, score: 14 - summonableCreatures * 3 };
  }
  return null;
}

function chooseItemAction(state) {
  const candidates = [
    chooseRemovalItemAction(state),
    chooseEconomyItemAction(state),
    chooseBuffItemAction(state),
    chooseDrawItemAction(state),
  ].filter(Boolean);
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

function attackTargetsFor(board, attackerIdx, attacker) {
  const cells = attackCellIndices(attackerIdx, attacker.card.attack_cells, attacker.dir);
  return cells.filter((i) => board[i] && board[i].owner !== attacker.owner);
}

function selectAttackTarget(board, attackerIdx, attacker, targets, state, source, metrics) {
  let best = null;
  for (const targetIdx of targets) {
    const score = scoreAttackTarget(board, attackerIdx, targetIdx, state, source);
    if (!best || score > best.score) best = { targetIdx, score };
  }
  return best;
}

function damagePreview(board, attackerIdx, targetIdx) {
  const attacker = board[attackerIdx];
  const defender = board[targetIdx];
  const blind = isBlindSpot(attackerIdx, targetIdx, defender.dir, defender.card.weakness_cells);
  const physical = attacker.card.attack_type !== "魔道";
  const damage = Math.max(0, attacker.atk + (physical && blind ? WEAK_BONUS : 0));
  const kills = defender.hp <= damage;
  const canCounter =
    physical &&
    defender.card.attack_type !== "魔道" &&
    !blind &&
    inCounterRange(targetIdx, defender, attackerIdx);
  const counterDamage = canCounter ? Math.max(0, defender.atk) : 0;
  const counterKills = canCounter && attacker.hp <= counterDamage;
  return { blind, damage, kills, canCounter, counterDamage, counterKills };
}

function scoreAttackTarget(board, attackerIdx, targetIdx, state, source) {
  const attacker = board[attackerIdx];
  const defender = board[targetIdx];
  const owner = attacker.owner;
  const opp = 1 - owner;
  const oppControl = controlCount(board, opp);
  const preview = damagePreview(board, attackerIdx, targetIdx);
  let score = 0;

  score += preview.damage * 4;
  if (preview.blind) score += 10;
  if (preview.kills) {
    score += 38 + lifeDamageForCard(defender.card, state.lifeRule) * 5;
    if (oppControl >= 4) score += 80;
    else if (oppControl === 3) score += 35;
  } else if (oppControl >= 4) {
    score += preview.damage * 5;
  }
  if (preview.counterKills) score -= preview.kills ? 18 : 42;
  if (preview.canCounter && !preview.counterKills) score -= preview.counterDamage * 2;
  if (source === "summon") score += 6;
  return score;
}

function resolveSingleAttack(state, attackerIdx, targetIdx, source) {
  const board = state.board;
  const attacker = board[attackerIdx];
  const defender = board[targetIdx];
  if (!attacker || !defender || attacker.owner === defender.owner) return;

  const owner = attacker.owner;
  const opp = 1 - owner;
  const preview = damagePreview(board, attackerIdx, targetIdx);
  state.metrics.attacks += 1;
  if (source === "summon") state.metrics.summonAttacks += 1;
  else state.metrics.manualAttacks += 1;
  if (preview.blind) state.metrics.weakAttacks += 1;

  defender.hp -= preview.damage;
  if (defender.hp <= 0) {
    destroyCreatureAt(state, targetIdx);
    const life = lifeDamageForCard(defender.card, state.lifeRule);
    state.players[owner].lifeDamage += life;
    grantDestroyMana(state, opp);
    recordKill(state, defender.card.cost, preview.blind, attacker.card, defender.card);
    return;
  }

  if (preview.canCounter && board[attackerIdx]) {
    attacker.hp -= preview.counterDamage;
    state.metrics.counterAttacks += 1;
    if (attacker.hp <= 0) {
      destroyCreatureAt(state, attackerIdx);
      const life = lifeDamageForCard(attacker.card, state.lifeRule);
      state.players[opp].lifeDamage += life;
      grantDestroyMana(state, owner);
      recordKill(state, attacker.card.cost, false, defender.card, attacker.card);
    }
  }
}

function recordKill(state, cost, wasWeak, killerCard = null, destroyedCard = null) {
  state.metrics.kills += 1;
  if (wasWeak) state.metrics.weakKills += 1;
  if (cost <= 4) state.metrics.killBands.low += 1;
  else if (cost <= 6) state.metrics.killBands.mid += 1;
  else state.metrics.killBands.high += 1;
  if (killerCard?.shape && state.metrics.shapeStats[killerCard.shape]) {
    state.metrics.shapeStats[killerCard.shape].kills += 1;
  }
  if (destroyedCard?.shape && state.metrics.shapeStats[destroyedCard.shape]) {
    state.metrics.shapeStats[destroyedCard.shape].deaths += 1;
  }
}

function executeAttackAction(state, attackerIdx, source) {
  const attacker = state.board[attackerIdx];
  if (!attacker) return false;
  const targets = attackTargetsFor(state.board, attackerIdx, attacker);
  if (targets.length === 0) return false;

  const mode = attacker.card.attack_mode;
  if (mode === "simultaneous") {
    const scored = targets
      .map((targetIdx) => ({ targetIdx, score: scoreAttackTarget(state.board, attackerIdx, targetIdx, state, source) }))
      .sort((a, b) => b.score - a.score);
    const limit = Math.max(1, attacker.card.attack_target_count || scored.length);
    for (const { targetIdx } of scored.slice(0, limit)) {
      if (!state.board[attackerIdx]) break;
      if (state.board[targetIdx]) resolveSingleAttack(state, attackerIdx, targetIdx, source);
      if (hasWinner(state)) break;
    }
  } else {
    const best = selectAttackTarget(state.board, attackerIdx, attacker, targets, state, source);
    if (!best) return false;
    resolveSingleAttack(state, attackerIdx, best.targetIdx, source);
  }

  const after = state.board[attackerIdx];
  if (after) after.hasActed = true;
  return true;
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function cloneStateWithRandom(state) {
  const cloned = cloneState(state);
  cloned.random = typeof state.random?.clone === "function" ? state.random.clone() : rng(0);
  return cloned;
}

function stateKey(state, depth) {
  const boardKey = state.board
    .map((c) => {
      if (!c) return "_";
      return [
        c.owner,
        c.card.id,
        c.hp,
        c.dir,
        c.hasActed ? 1 : 0,
        c.hasRotated ? 1 : 0,
      ].join(":");
    })
    .join("|");
  const handKey = state.players[state.active].hand.map((c) => c.id).join(",");
  return `${depth}/${state.active}/${state.players[state.active].mana}/${boardKey}/${handKey}`;
}

function combinations(values, size) {
  if (size >= values.length) return [[...values]];
  const out = [];
  const walk = (start, acc) => {
    if (acc.length === size) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < values.length; i++) {
      acc.push(values[i]);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  return out;
}

function generateOracleAttackActions(state, charIdx, char) {
  const targets = attackTargetsFor(state.board, charIdx, char);
  if (targets.length === 0) return [];
  if (char.card.attack_mode !== "simultaneous") {
    return targets.map((targetIdx) => ({
      type: "attack",
      idx: charIdx,
      cost: attackCost(char.card),
      targetIdxs: [targetIdx],
    }));
  }
  const limit = Math.max(
    1,
    Math.min(char.card.attack_target_count || targets.length, targets.length),
  );
  return combinations(targets, limit).map((targetIdxs) => ({
    type: "attack",
    idx: charIdx,
    cost: attackCost(char.card),
    targetIdxs,
  }));
}

function quarterTurnDirs(dir) {
  return [(dir + 1) % 4, (dir + 3) % 4];
}

function generateOracleRotateAttackActions(state, charIdx, char) {
  const actions = [];
  const originalDir = char.dir;
  for (const dir of quarterTurnDirs(originalDir)) {
    char.dir = dir;
    const targets = attackTargetsFor(state.board, charIdx, char);
    if (targets.length === 0) continue;
    if (char.card.attack_mode !== "simultaneous") {
      for (const targetIdx of targets) {
        actions.push({
          type: "rotateAttack",
          idx: charIdx,
          dir,
          cost: attackCost(char.card),
          targetIdxs: [targetIdx],
        });
      }
      continue;
    }
    const limit = Math.max(
      1,
      Math.min(char.card.attack_target_count || targets.length, targets.length),
    );
    for (const targetIdxs of combinations(targets, limit)) {
      actions.push({
        type: "rotateAttack",
        idx: charIdx,
        dir,
        cost: attackCost(char.card),
        targetIdxs,
      });
    }
  }
  char.dir = originalDir;
  return actions;
}

function generateOracleReactivationActions(state, options = {}) {
  const active = state.active;
  const player = state.players[active];
  const allowAttack = options.allowAttack !== false;
  const allowRotate = options.allowRotate !== false;
  const allowRotateAttack = state.rotateAttackRule && options.allowRotateAttack !== false;
  const actions = [];
  for (let i = 0; i < 9; i++) {
    const char = state.board[i];
    if (!char || char.owner !== active) continue;
    const reattackCost = attackCost(char.card);
    if (allowAttack && !char.hasActed && player.mana >= reattackCost) {
      actions.push(...generateOracleAttackActions(state, i, char));
    }
    if (allowRotateAttack && !char.hasActed && !char.hasRotated && player.mana >= reattackCost) {
      actions.push(...generateOracleRotateAttackActions(state, i, char));
    }
    if (allowRotate && !char.hasRotated) {
      const rotateCost = rotationCost(char.card);
      if (player.mana < rotateCost) continue;
      for (const dir of DIRS) {
        if (dir !== char.dir) actions.push({ type: "rotate", idx: i, dir, cost: rotateCost });
      }
    }
  }
  return actions;
}

function generateOracleSummonActions(state) {
  const active = state.active;
  const player = state.players[active];
  const cells = validSummonCells(state.board, active);
  const actions = [];
  for (let h = 0; h < player.hand.length; h++) {
    const card = player.hand[h];
    if (!isCreatureCard(card)) continue;
    if (!card || card.cost > player.mana) continue;
    for (const cellIdx of cells) {
      const hpDelta = attrBonus(card.attribute, state.boardAttrs[cellIdx]);
      if (card.hp + hpDelta <= 0) continue;
      for (const dir of DIRS) actions.push({ handIndex: h, cellIdx, dir });
    }
  }
  return actions;
}

function generateOracleItemActions(state) {
  const active = state.active;
  const player = state.players[active];
  const actions = [];
  for (let h = 0; h < player.hand.length; h++) {
    const card = player.hand[h];
    if (!isItemCard(card) || card.item_type !== "removal" || card.cost > player.mana) continue;
    for (let targetIdx = 0; targetIdx < 9; targetIdx++) {
      const target = state.board[targetIdx];
      if (!target || target.owner === active) continue;
      actions.push({
        type: "item",
        itemType: "removal",
        handIndex: h,
        targetIdx,
        cost: card.cost,
        kills: target.hp <= 2,
      });
    }
  }
  actions.sort((a, b) => {
    if (a.kills !== b.kills) return a.kills ? -1 : 1;
    const aCost = state.board[a.targetIdx]?.card.cost ?? 0;
    const bCost = state.board[b.targetIdx]?.card.cost ?? 0;
    return bCost - aCost;
  });
  return actions;
}

function applyOracleReactivation(state, action) {
  const player = state.players[state.active];
  player.mana -= action.cost;
  if (action.type === "rotate") {
    const char = state.board[action.idx];
    if (char) {
      char.dir = action.dir;
      char.hasRotated = true;
    }
    return;
  }
  if (action.type === "rotateAttack") {
    const char = state.board[action.idx];
    if (!char) return;
    char.dir = action.dir;
    for (const targetIdx of action.targetIdxs) {
      if (!state.board[action.idx]) break;
      if (state.board[targetIdx]) resolveSingleAttack(state, action.idx, targetIdx, "oracle");
      if (hasWinner(state)) break;
    }
    const after = state.board[action.idx];
    if (after) {
      after.hasActed = true;
      after.hasRotated = true;
    }
    return;
  }
  for (const targetIdx of action.targetIdxs) {
    if (!state.board[action.idx]) break;
    if (state.board[targetIdx]) resolveSingleAttack(state, action.idx, targetIdx, "oracle");
    if (hasWinner(state)) break;
  }
  const char = state.board[action.idx];
  if (char) char.hasActed = true;
}

function checkReturnedOrWon(state, checkOwner, responder) {
  return (
    controlCount(state.board, checkOwner) < 4 ||
    controlCount(state.board, responder) >= 5 ||
    state.players[responder].lifeDamage >= LIFE_TOTAL
  );
}

function findOracleReturnPlan(state, checkOwner, maxDepth = 12, options = {}) {
  const responder = state.active;
  const allowSummon = options.allowSummon !== false;
  const allowItems = options.allowItems !== false;
  const memo = new Set();

  const dfs = (node, depth) => {
    if (checkReturnedOrWon(node, checkOwner, responder)) return [];
    if (depth >= maxDepth) return null;

    if (allowSummon) {
      for (const summon of generateOracleSummonActions(node)) {
        const next = cloneState(node);
        executeSummon(next, summon);
        if (checkReturnedOrWon(next, checkOwner, responder)) {
          return [{ type: "summon", action: summon }];
        }
      }
    }

    const key = stateKey(node, depth);
    if (memo.has(key)) return null;
    memo.add(key);

    if (allowItems) {
      for (const action of generateOracleItemActions(node)) {
        const next = cloneState(node);
        executeItemAction(next, action, "oracle");
        const suffix = dfs(next, depth + 1);
        if (suffix !== null) return [{ type: "item", action }, ...suffix];
      }
    }

    const actions = generateOracleReactivationActions(node, options);
    actions.sort((a, b) => {
      const order = { attack: 0, rotateAttack: 1, rotate: 2 };
      if (a.type !== b.type) return (order[a.type] ?? 9) - (order[b.type] ?? 9);
      return 0;
    });

    for (const action of actions) {
      const next = cloneState(node);
      applyOracleReactivation(next, action);
      const suffix = dfs(next, depth + 1);
      if (suffix !== null) return [{ type: "reactivation", action }, ...suffix];
    }
    return null;
  };

  return dfs(cloneState(state), 0);
}

function canOracleReturnCheck(state, checkOwner, maxDepth = 12, options = {}) {
  return findOracleReturnPlan(state, checkOwner, maxDepth, options) !== null;
}

function recordShapeReactivation(state, idx, kind) {
  const shape = state.board[idx]?.card?.shape;
  if (!shape || !state.metrics.shapeStats[shape]) return;
  if (kind === "attack") state.metrics.shapeStats[shape].attackOnlyReacts += 1;
  if (kind === "rotateAttack") state.metrics.shapeStats[shape].rotateAttackReacts += 1;
}

function executePlannedReactivation(state, action) {
  const owner = state.active;
  spendMana(state, action.cost);
  state.metrics.reactivations += 1;
  if (action.type === "rotate") {
    state.metrics.rotations += 1;
    state.metrics.reactRotationOnlyByPlayer[owner] += 1;
    const char = state.board[action.idx];
    if (char) {
      char.dir = action.dir;
      char.hasRotated = true;
    }
    return;
  }
  if (action.type === "rotateAttack") {
    state.metrics.rotateAttacks += 1;
    state.metrics.reactRotateAttackByPlayer[owner] += 1;
    recordShapeReactivation(state, action.idx, "rotateAttack");
    const char = state.board[action.idx];
    if (!char) return;
    char.dir = action.dir;
    for (const targetIdx of action.targetIdxs) {
      if (!state.board[action.idx]) break;
      if (state.board[targetIdx]) resolveSingleAttack(state, action.idx, targetIdx, "check-search-rotate-attack");
      if (hasWinner(state)) break;
    }
    const after = state.board[action.idx];
    if (after) {
      after.hasActed = true;
      after.hasRotated = true;
    }
    return;
  }
  state.metrics.attackReactivationActions += 1;
  state.metrics.reactAttackOnlyByPlayer[owner] += 1;
  recordShapeReactivation(state, action.idx, "attack");
  for (const targetIdx of action.targetIdxs) {
    if (!state.board[action.idx]) break;
    if (state.board[targetIdx]) resolveSingleAttack(state, action.idx, targetIdx, "check-search");
    if (hasWinner(state)) break;
  }
  const char = state.board[action.idx];
  if (char) char.hasActed = true;
}

function executeCheckSearchPlan(state, plan, options = {}) {
  let usedSummon = false;
  for (const step of plan) {
    if (step.type === "summon") {
      executeSummon(state, step.action);
      usedSummon = true;
      break;
    }
    if (step.type === "item") {
      executeItemAction(state, step.action, "check-search");
      if (hasWinner(state)) break;
      continue;
    }
    if (options.onReactivationChosen) {
      options.onReactivationChosen(state, step.action, { source: "check-search" });
    }
    executePlannedReactivation(state, step.action);
    if (hasWinner(state)) break;
  }
  return usedSummon;
}

function planProfile(plan) {
  return {
    hasAttack: plan.some((step) => step.type === "reactivation" && step.action.type === "attack"),
    hasRotate: plan.some((step) => step.type === "reactivation" && step.action.type === "rotate"),
    hasRotateAttack: plan.some((step) => step.type === "reactivation" && step.action.type === "rotateAttack"),
    hasSummon: plan.some((step) => step.type === "summon"),
    hasItem: plan.some((step) => step.type === "item"),
    hasRemovalItem: plan.some((step) => step.type === "item" && step.action.itemType === "removal"),
    isMultiStep: plan.length > 1,
    itemSteps: plan.filter((step) => step.type === "item").length,
    length: plan.length,
  };
}

function classifyReactivationNeedFromReturnable(state, checkOwner, maxDepth) {
  const withoutBoth = canOracleReturnCheck(state, checkOwner, maxDepth, {
    allowAttack: false,
    allowRotate: false,
    allowRotateAttack: false,
  });

  const rotateAttackRequired = state.rotateAttackRule
    ? !canOracleReturnCheck(state, checkOwner, maxDepth, { allowRotateAttack: false })
    : false;

  if (withoutBoth) return { type: "unneeded", rotateAttackRequired };
  const withoutAttack = canOracleReturnCheck(state, checkOwner, maxDepth, {
    allowAttack: false,
    allowRotateAttack: false,
  });
  const withoutRotate = canOracleReturnCheck(state, checkOwner, maxDepth, { allowRotate: false });
  const attackRequired = !withoutAttack;
  const rotationRequired = !withoutRotate;
  if (attackRequired && !rotationRequired) return { type: "attackRequired", rotateAttackRequired };
  if (rotationRequired && !attackRequired) return { type: "rotationRequired", rotateAttackRequired };
  return { type: "eitherRequired", rotateAttackRequired };
}

function recordCheckResponseReactivationUsage(state, attackOnlyReacts, rotations, rotateAttacks, returned, needInfo) {
  const attackFamily = attackOnlyReacts + rotateAttacks;
  state.metrics.checkResponseTurns += 1;
  state.metrics.checkResponseAttackReacts += attackFamily;
  state.metrics.checkResponseAttackOnlyReacts += attackOnlyReacts;
  state.metrics.checkResponseRotations += rotations;
  state.metrics.checkResponseRotateAttacks += rotateAttacks;
  if (returned) {
    state.metrics.checkResponseReturnedTurns += 1;
    state.metrics.checkResponseReturnedAttackReacts += attackFamily;
    state.metrics.checkResponseReturnedAttackOnlyReacts += attackOnlyReacts;
    state.metrics.checkResponseReturnedRotations += rotations;
    state.metrics.checkResponseReturnedRotateAttacks += rotateAttacks;
  } else {
    state.metrics.checkResponseFailedTurns += 1;
    state.metrics.checkResponseFailedAttackReacts += attackFamily;
    state.metrics.checkResponseFailedAttackOnlyReacts += attackOnlyReacts;
    state.metrics.checkResponseFailedRotations += rotations;
    state.metrics.checkResponseFailedRotateAttacks += rotateAttacks;
  }

  if (needInfo) {
    state.metrics.reactNeedChecks += 1;
    state.metrics.reactNeedByType[needInfo.type] += 1;
    if (returned) state.metrics.reactNeedReturnedByType[needInfo.type] += 1;
    if (needInfo.rotateAttackRequired) {
      state.metrics.reactNeedRotateAttackRequired += 1;
      if (returned) state.metrics.reactNeedRotateAttackRequiredReturned += 1;
    }
  }
}

function hasWinner(state) {
  return state.players[0].lifeDamage >= LIFE_TOTAL || state.players[1].lifeDamage >= LIFE_TOTAL;
}

function scoreAttackAction(state, attackerIdx) {
  const attacker = state.board[attackerIdx];
  const targets = attackTargetsFor(state.board, attackerIdx, attacker);
  if (targets.length === 0) return -Infinity;
  const best = selectAttackTarget(state.board, attackerIdx, attacker, targets, state, "reactivation");
  if (!best) return -Infinity;
  return best.score - attackCost(attacker.card) * 4;
}

function scoreRotateAttackAction(state, attackerIdx, dir) {
  const attacker = state.board[attackerIdx];
  if (!attacker || attacker.dir === dir) return -Infinity;
  const originalDir = attacker.dir;
  attacker.dir = dir;
  const targets = attackTargetsFor(state.board, attackerIdx, attacker);
  let score = -Infinity;
  if (targets.length > 0) {
    const best = selectAttackTarget(state.board, attackerIdx, attacker, targets, state, "rotate-attack");
    if (best) score = best.score + 4 - attackCost(attacker.card) * 4;
  }
  attacker.dir = originalDir;
  return score;
}

function chooseBestAttackFamilyAction(state, options = {}) {
  const active = state.active;
  const player = state.players[active];
  let best = null;
  const allowAttack = options.allowAttack !== false;
  const allowRotateAttack = options.allowRotateAttack !== false && state.rotateAttackRule;
  const sameIdx = options.sameIdx;

  for (let i = 0; i < 9; i++) {
    if (sameIdx != null && i !== sameIdx) continue;
    const char = state.board[i];
    if (!char || char.owner !== active) continue;
    const reattackCost = attackCost(char.card);
    if (player.mana < reattackCost || char.hasActed) continue;

    if (allowAttack) {
      const score = scoreAttackAction(state, i);
      if (Number.isFinite(score) && (!best || score > best.score)) {
        best = { type: "attack", idx: i, cost: reattackCost, score };
      }
    }

    if (allowRotateAttack && !char.hasRotated) {
      for (const dir of quarterTurnDirs(char.dir)) {
        const score = scoreRotateAttackAction(state, i, dir);
        if (Number.isFinite(score) && (!best || score > best.score)) {
          best = { type: "rotateAttack", idx: i, dir, cost: reattackCost, score };
        }
      }
    }
  }
  return best;
}

function scoreRotation(state, charIdx, dir) {
  const char = state.board[charIdx];
  if (!char || char.dir === dir) return -Infinity;
  const owner = char.owner;
  const opp = 1 - owner;
  const oldDir = char.dir;
  char.dir = dir;
  const targets = attackTargetsFor(state.board, charIdx, char);
  let score = targets.length * 8;
  if (controlCount(state.board, opp) >= 3) score += targets.length * 5;
  for (const i of targets) {
    const preview = damagePreview(state.board, charIdx, i);
    if (preview.kills) score += controlCount(state.board, opp) >= 4 ? 35 : 15;
    if (preview.blind) score += 5;
  }
  const enemiesThreateningBlind = state.board.filter((c, i) => {
    if (!c || c.owner !== opp) return false;
    return isBlindSpot(i, charIdx, dir, char.card.weakness_cells);
  }).length;
  score -= enemiesThreateningBlind * 6;
  char.dir = oldDir;
  return score - rotationCost(char.card) * 3;
}

function chooseReactivation(state, options = {}) {
  const active = state.active;
  const player = state.players[active];
  const allowAttack = options.allowAttack !== false;
  const allowRotateAttack = options.allowRotateAttack !== false;
  const allowRotate = options.allowRotate !== false;
  let best = null;
  for (let i = 0; i < 9; i++) {
    const char = state.board[i];
    if (!char || char.owner !== active) continue;
    const reattackCost = attackCost(char.card);
    if (allowAttack && !char.hasActed && player.mana >= reattackCost) {
      const score = scoreAttackAction(state, i);
      if (score > 10 && (!best || score > best.score)) {
        best = { type: "attack", idx: i, cost: reattackCost, score };
      }
    }
    if (allowRotateAttack && state.rotateAttackRule && !char.hasActed && !char.hasRotated && player.mana >= reattackCost) {
      for (const dir of quarterTurnDirs(char.dir)) {
        const score = scoreRotateAttackAction(state, i, dir);
        if (score > 10 && (!best || score > best.score)) {
          best = { type: "rotateAttack", idx: i, dir, cost: reattackCost, score };
        }
      }
    }
    const rotateCost = rotationCost(char.card);
    if (allowRotate && !char.hasRotated && player.mana >= rotateCost) {
      for (const dir of DIRS) {
        const score = scoreRotation(state, i, dir);
        if (score > 14 && (!best || score > best.score)) {
          best = { type: "rotate", idx: i, dir, cost: rotateCost, score };
        }
      }
    }
  }
  return best;
}

function executeReactivation(state, action) {
  const owner = state.active;
  spendMana(state, action.cost);
  state.metrics.reactivations += 1;
  if (action.type === "attack") {
    state.metrics.attackReactivationActions += 1;
    state.metrics.reactAttackOnlyByPlayer[owner] += 1;
    recordShapeReactivation(state, action.idx, "attack");
    executeAttackAction(state, action.idx, "reactivation");
  } else if (action.type === "rotateAttack") {
    state.metrics.rotateAttacks += 1;
    state.metrics.reactRotateAttackByPlayer[owner] += 1;
    recordShapeReactivation(state, action.idx, "rotateAttack");
    const char = state.board[action.idx];
    if (char) {
      char.dir = action.dir;
      executeAttackAction(state, action.idx, "rotate-attack");
      const after = state.board[action.idx];
      if (after) after.hasRotated = true;
    }
  } else {
    state.metrics.rotations += 1;
    state.metrics.reactRotationOnlyByPlayer[owner] += 1;
    const char = state.board[action.idx];
    if (char) {
      char.dir = action.dir;
      char.hasRotated = true;
    }
  }
}

function scoreSummon(state, handIndex, cellIdx, dir) {
  const active = state.active;
  const opp = 1 - active;
  const card = state.players[active].hand[handIndex];
  const hpDelta = attrBonus(card.attribute, state.boardAttrs[cellIdx]);
  if (card.hp + hpDelta <= 0) return -Infinity;

  let score = 0;
  const currentControl = controlCount(state.board, active);
  const afterControl = currentControl + 1;
  score += afterControl * 12;
  if (afterControl >= 5) score += 1000;
  if (afterControl === 4) score += 55;
  if (controlCount(state.board, opp) >= 4) score += adjacentCells(cellIdx).filter((i) => state.board[i]?.owner === opp).length * 12;

  if (hpDelta > 0) score += 26;
  else if (hpDelta < 0) score -= 34;
  if (cellIdx === 4) score += 6;
  score += adjacentCells(cellIdx).filter((i) => state.board[i]?.owner === active).length * 5;
  score += card.hp * 2 + card.atk * 3 - card.cost * 2;

  const instance = makeInstance(card, active, dir, hpDelta, state.halfTurns);
  state.board[cellIdx] = instance;
  const targets = attackTargetsFor(state.board, cellIdx, instance);
  if (targets.length > 0) {
    const best = selectAttackTarget(state.board, cellIdx, instance, targets, state, "summon");
    score += best ? best.score * 0.9 : 0;
  }
  state.board[cellIdx] = null;
  return score;
}

function chooseSummon(state) {
  const active = state.active;
  const player = state.players[active];
  const cells = validSummonCells(state.board, active);
  let best = null;
  for (let h = 0; h < player.hand.length; h++) {
    const card = player.hand[h];
    if (!isCreatureCard(card)) continue;
    if (!card || card.cost > player.mana) continue;
    for (const c of cells) {
      for (const dir of DIRS) {
        const score = scoreSummon(state, h, c, dir);
        if (!Number.isFinite(score)) continue;
        if (!best || score > best.score) best = { handIndex: h, cellIdx: c, dir, score };
      }
    }
  }
  return best;
}

function recordFirstSummon(state, owner) {
  if (state.metrics.firstSummonHalfTurns[owner] == null) {
    state.metrics.firstSummonHalfTurns[owner] = state.halfTurns;
  }
}

function recordBoard3(state, owner) {
  if (state.metrics.firstBoard3HalfTurns[owner] == null && controlCount(state.board, owner) >= 3) {
    state.metrics.firstBoard3HalfTurns[owner] = state.halfTurns;
  }
}

function executeSummon(state, action) {
  if (!action) return false;
  const active = state.active;
  const player = state.players[active];
  const [card] = player.hand.splice(action.handIndex, 1);
  if (!card) return false;
  if (!isCreatureCard(card)) {
    player.hand.splice(action.handIndex, 0, card);
    return false;
  }
  const hpDelta = attrBonus(card.attribute, state.boardAttrs[action.cellIdx]);
  if (card.hp + hpDelta <= 0) {
    player.hand.splice(action.handIndex, 0, card);
    return false;
  }
  spendMana(state, card.cost);
  if (hpDelta > 0) state.metrics.attrMatchSummons += 1;
  else if (hpDelta < 0) state.metrics.attrBadSummons += 1;
  state.metrics.summons += 1;
  recordFirstSummon(state, active);
  const inst = makeInstance(card, active, action.dir, hpDelta, state.halfTurns);
  state.board[action.cellIdx] = inst;
  recordBoard3(state, active);
  executeAttackAction(state, action.cellIdx, "summon");
  return true;
}

function recordSummonStall(state) {
  const active = state.active;
  if (controlCount(state.board, active) >= 5) return;
  const player = state.players[active];
  state.metrics.summonDecisionTurns += 1;
  const creatureHand = player.hand.filter(isCreatureCard);
  if (creatureHand.length === 0) {
    state.metrics.summonStalledTurns += 1;
    state.metrics.summonStalledNoCards += 1;
    return;
  }
  if (!creatureHand.some((card) => card.cost <= player.mana)) {
    state.metrics.summonStalledTurns += 1;
    state.metrics.summonStalledMana += 1;
  }
}

function hasAttackReactivationOpportunity(state) {
  const active = state.active;
  const player = state.players[active];
  for (let i = 0; i < 9; i++) {
    const char = state.board[i];
    if (!char || char.owner !== active || char.hasActed) continue;
    if (player.mana < attackCost(char.card)) continue;
    if (attackTargetsFor(state.board, i, char).length > 0) return true;
  }
  return false;
}

function beginTurn(state) {
  const active = state.active;
  for (const char of state.board) {
    if (char && char.owner === active) {
      char.hasActed = false;
      char.hasRotated = false;
    }
  }
}

function finishTurn(state) {
  const active = state.active;
  const checkOwner = 1 - active;
  const activeHasTerritoryWin = controlCount(state.board, active) >= 5;

  if (state.pendingCheck[checkOwner]) {
    state.metrics.check4Responses += 1;
    const hadHighCost = state.pendingCheckHasHighCost[checkOwner];
    if (hadHighCost) state.metrics.check4WithHighCost += 1;
    const returned = controlCount(state.board, checkOwner) < 4 || activeHasTerritoryWin;
    if (returned) {
      state.metrics.check4Returned += 1;
      if (hadHighCost) state.metrics.check4WithHighCostReturned += 1;
      state.metrics.checkReturnedByPlayer[active] += 1;
    } else {
      state.metrics.checkFailedByPlayer[active] += 1;
    }
    state.pendingCheck[checkOwner] = false;
    state.pendingCheckHasHighCost[checkOwner] = false;
  }

  if (activeHasTerritoryWin) {
    state.winner = active;
    state.reason = "territory";
    return;
  }

  if (controlCount(state.board, active) === 4) {
    state.metrics.check4 += 1;
    state.pendingCheck[active] = true;
    state.pendingCheckHasHighCost[active] = hasHighCostControlled(state.board, active);
  }

  addMana(state.players[active], state.manaGain, state.metrics);
  const fatigueApplied = drawToFive(state.players[active], state, active);
  if (fatigueApplied && state.players[1 - active].lifeDamage >= LIFE_TOTAL) {
    state.winner = 1 - active;
    state.reason = "life";
    state.metrics.fatigueWins += 1;
    return;
  }
  state.active = 1 - active;
  state.halfTurns += 1;
}

function simulateTurn(state, options = {}) {
  if (!options.beginTurnAlreadyDone) beginTurn(state);

  const checkOwner = 1 - state.active;
  const respondingToCheck = state.pendingCheck[checkOwner];
  const responseAttackOnlyBefore = state.metrics.attackReactivationActions;
  const responseRotationsBefore = state.metrics.rotations;
  const responseRotateAttacksBefore = state.metrics.rotateAttacks;
  const reactivationOptions = options.disableAttackFamilyThisTurn
    ? { allowAttack: false, allowRotateAttack: false }
    : {};
  const checkSearchOptions = options.disableAttackFamilyThisTurn
    ? { allowAttack: false, allowRotateAttack: false }
    : {};
  let responseNeedInfo = null;
  let summonUsedBySearch = false;
  let oracleCanReturn = false;

  if (options.forceAttackFamilyAction && !hasWinner(state)) {
    executeReactivation(state, options.forceAttackFamilyAction);
  }

  if (state.oracle && state.pendingCheck[checkOwner]) {
    state.metrics.check4OracleChecks += 1;
    const highCostCheck = state.pendingCheckHasHighCost[checkOwner];
    if (highCostCheck) state.metrics.check4OracleHighCostChecks += 1;
    oracleCanReturn = canOracleReturnCheck(state, checkOwner);
    if (oracleCanReturn) {
      state.metrics.check4OracleReturnable += 1;
      if (highCostCheck) state.metrics.check4OracleHighCostReturnable += 1;
    }
  }

  if (state.checkSearchDepth > 0 && state.pendingCheck[checkOwner]) {
    const plan = findOracleReturnPlan(state, checkOwner, state.checkSearchDepth, checkSearchOptions);
    if (plan !== null && plan.length > 0) {
      if (state.reactNeedOracle) {
        responseNeedInfo = classifyReactivationNeedFromReturnable(state, checkOwner, state.checkSearchDepth);
      }
      state.metrics.checkSearchPlans += 1;
      state.metrics.checkSearchPlanSteps += plan.length;
      if (state.pendingCheckHasHighCost[checkOwner]) state.metrics.checkSearchHighCostPlans += 1;
      const profile = planProfile(plan);
      if (profile.hasAttack) state.metrics.checkSearchAttackPlans += 1;
      if (profile.hasRotate) state.metrics.checkSearchRotationPlans += 1;
      if (profile.hasRotateAttack) state.metrics.checkSearchRotateAttackPlans += 1;
      if (profile.hasSummon) state.metrics.checkSearchSummonPlans += 1;
      if (profile.hasItem) state.metrics.checkSearchItemPlans += 1;
      if (profile.hasRemovalItem) state.metrics.checkSearchRemovalItemPlans += 1;
      state.metrics.checkSearchItemPlanSteps += profile.itemSteps;
      if (profile.isMultiStep) state.metrics.checkSearchMultiStepPlans += 1;
      summonUsedBySearch = executeCheckSearchPlan(state, plan, {
        onReactivationChosen: options.onReactivationChosen,
      });
    } else if (oracleCanReturn) {
      state.metrics.checkSearchOracleMisses += 1;
      if (state.pendingCheckHasHighCost[checkOwner]) state.metrics.checkSearchHighCostOracleMisses += 1;
    }
  }

  if (!summonUsedBySearch) {
    const reactivationsBeforeChoice = state.metrics.reactivations;
    const hadAttackReactivationOpportunity = hasAttackReactivationOpportunity(state);
    if (hadAttackReactivationOpportunity) state.metrics.reactivationOpportunityTurns += 1;

    for (let guard = 0; guard < 12 && !hasWinner(state); guard++) {
      const action = chooseReactivation(state, reactivationOptions);
      if (!action) break;
      if (options.onReactivationChosen) {
        options.onReactivationChosen(state, action, { source: "normal" });
      }
      executeReactivation(state, action);
    }

    if (hadAttackReactivationOpportunity && state.metrics.reactivations === reactivationsBeforeChoice) {
      state.metrics.reactivationUnusedTurns += 1;
    }
  }

  if (!hasWinner(state) && !summonUsedBySearch) {
    for (let guard = 0; guard < 8 && !hasWinner(state); guard++) {
      const action = chooseItemAction(state);
      if (!action) break;
      executeItemAction(state, action, "item-ai");
    }
  }

  if (!hasWinner(state) && !summonUsedBySearch) {
    recordSummonStall(state);
    const summon = chooseSummon(state);
    if (summon) executeSummon(state, summon);
  }

  if (state.players[0].lifeDamage >= LIFE_TOTAL) {
    state.winner = 0;
    state.reason = "life";
  } else if (state.players[1].lifeDamage >= LIFE_TOTAL) {
    state.winner = 1;
    state.reason = "life";
  }

  if (respondingToCheck) {
    const attackOnlyReacts = state.metrics.attackReactivationActions - responseAttackOnlyBefore;
    const rotations = state.metrics.rotations - responseRotationsBefore;
    const rotateAttacks = state.metrics.rotateAttacks - responseRotateAttacksBefore;
    const returned = checkReturnedOrWon(state, checkOwner, state.active);
    recordCheckResponseReactivationUsage(state, attackOnlyReacts, rotations, rotateAttacks, returned, responseNeedInfo);
  }

  state.metrics.boardSamples += 1;
  state.metrics.boardTotal += occupiedCount(state.board);
  if (state.winner == null) finishTurn(state);
}

function makeInitialState(p0Faction, p1Faction, cardsByFaction, variant, seed) {
  const random = rng(seed);
  const boardAttrs = variant.pureVanilla ? [...PURE_BOARD_ATTRS] : shuffle(BOARD_ATTRS, random);
  const deck0 = variant.pureVanilla
    ? buildPureDeck(variant, random, 0)
    : buildDeck(p0Faction, cardsByFaction, random, variant.deckCreatures);
  const deck1 = variant.pureVanilla
    ? buildPureDeck(variant, random, 1)
    : buildDeck(p1Faction, cardsByFaction, random, variant.deckCreatures);
  const itemInitialByType = itemCountsForBothPlayers(variant.itemCounts ?? null);
  const itemInitial = itemCountsTotal(itemInitialByType);
  const p0StartMana = variant.p0StartingMana ?? 0;
  const p1StartMana = variant.p1StartingMana ?? 0;
  const p0 = { faction: p0Faction, mana: p0StartMana, lifeDamage: 0, deck: deck0, hand: [], discard: [] };
  const p1 = { faction: p1Faction, mana: p1StartMana, lifeDamage: 0, deck: deck1, hand: [], discard: [] };
  drawToFive(p0);
  drawToFive(p1);
  return {
    board: Array(9).fill(null),
    boardAttrs,
    random,
    players: [p0, p1],
    active: 0,
    halfTurns: 0,
    winner: null,
    reason: "",
    pendingCheck: [false, false],
    pendingCheckHasHighCost: [false, false],
    deckEmptied: [false, false],
    manaGain: variant.manaGain,
    lifeRule: variant.lifeRule,
    oracle: variant.oracle ?? false,
    checkSearchDepth: variant.checkSearchDepth ?? 0,
    reactNeedOracle: variant.reactNeedOracle ?? false,
    rotateAttackRule: variant.rotateAttackRule ?? false,
    fatigue: variant.fatigue ?? false,
    destroyManaGain: variant.destroyManaGain ?? DESTROY_MANA_GAIN,
    metrics: {
      attacks: 0,
      manualAttacks: 0,
      summonAttacks: 0,
      counterAttacks: 0,
      weakAttacks: 0,
      weakKills: 0,
      kills: 0,
      killBands: { low: 0, mid: 0, high: 0 },
      summons: 0,
      attrMatchSummons: 0,
      attrBadSummons: 0,
      reactivations: 0,
      attackReactivationActions: 0,
      rotations: 0,
      rotateAttacks: 0,
      reactAttackOnlyByPlayer: [0, 0],
      reactRotationOnlyByPlayer: [0, 0],
      reactRotateAttackByPlayer: [0, 0],
      winnerAttackOnlyReacts: 0,
      winnerRotationOnlyReacts: 0,
      winnerRotateAttacks: 0,
      loserAttackOnlyReacts: 0,
      loserRotationOnlyReacts: 0,
      loserRotateAttacks: 0,
      check4: 0,
      check4Responses: 0,
      check4Returned: 0,
      check4WithHighCost: 0,
      check4WithHighCostReturned: 0,
      check4OracleChecks: 0,
      check4OracleReturnable: 0,
      check4OracleHighCostChecks: 0,
      check4OracleHighCostReturnable: 0,
      checkSearchPlans: 0,
      checkSearchHighCostPlans: 0,
      checkSearchSummonPlans: 0,
      checkSearchAttackPlans: 0,
      checkSearchRotationPlans: 0,
      checkSearchRotateAttackPlans: 0,
      checkSearchItemPlans: 0,
      checkSearchRemovalItemPlans: 0,
      checkSearchMultiStepPlans: 0,
      checkSearchPlanSteps: 0,
      checkSearchItemPlanSteps: 0,
      checkSearchOracleMisses: 0,
      checkSearchHighCostOracleMisses: 0,
      itemUses: 0,
      itemUsesByType: emptyItemCounts(),
      itemRemovalDamage: 0,
      itemRemovalKills: 0,
      itemBuffHpGained: 0,
      itemDrawCards: 0,
      itemDead: 0,
      itemDeadByType: emptyItemCounts(),
      itemInitial,
      itemInitialByType,
      checkSearchItemUses: 0,
      manaOverflow: 0,
      capHits: 0,
      manaIncome: p0StartMana + p1StartMana,
      manaSpent: 0,
      deckExhaustions: 0,
      firstDeckEmptyHalfTurn: null,
      deckReshuffles: 0,
      firstDeckReshuffleHalfTurn: null,
      destroyManaGained: 0,
      fatigueDamage: 0,
      fatigueEvents: 0,
      fatigueWins: 0,
      firstSummonHalfTurns: [null, null],
      firstBoard3HalfTurns: [null, null],
      summonDecisionTurns: 0,
      summonStalledTurns: 0,
      summonStalledNoCards: 0,
      summonStalledMana: 0,
      reactivationOpportunityTurns: 0,
      reactivationUnusedTurns: 0,
      checkResponseTurns: 0,
      checkResponseReturnedTurns: 0,
      checkResponseFailedTurns: 0,
      checkResponseAttackReacts: 0,
      checkResponseAttackOnlyReacts: 0,
      checkResponseRotations: 0,
      checkResponseRotateAttacks: 0,
      checkResponseReturnedAttackReacts: 0,
      checkResponseReturnedAttackOnlyReacts: 0,
      checkResponseReturnedRotations: 0,
      checkResponseReturnedRotateAttacks: 0,
      checkResponseFailedAttackReacts: 0,
      checkResponseFailedAttackOnlyReacts: 0,
      checkResponseFailedRotations: 0,
      checkResponseFailedRotateAttacks: 0,
      reactNeedChecks: 0,
      reactNeedByType: emptyReactNeedCounts(),
      reactNeedReturnedByType: emptyReactNeedCounts(),
      reactNeedRotateAttackRequired: 0,
      reactNeedRotateAttackRequiredReturned: 0,
      checkReturnedByPlayer: [0, 0],
      checkFailedByPlayer: [0, 0],
      checkReturnPlayerSlots: 0,
      checkReturnPlayerWins: 0,
      checkFailedPlayerSlots: 0,
      checkFailedPlayerWins: 0,
      boardSamples: 0,
      boardTotal: 0,
      shapeStats: emptyShapeStats(variant.shapeDefinitions ?? (variant.shapeDeck0718 ? PURE_SHAPES_0718 : PURE_SHAPES_0718)),
    },
  };
}

function recordItemDeadAtEnd(state) {
  for (const player of state.players) {
    for (const card of [...player.hand, ...player.deck]) {
      if (!isItemCard(card)) continue;
      state.metrics.itemDead += 1;
      state.metrics.itemDeadByType[card.item_type] += 1;
    }
  }
}

function recordOutcomeUsageMetrics(state) {
  const winner = state.winner;
  if (winner === 0 || winner === 1) {
    const loser = 1 - winner;
    state.metrics.winnerAttackOnlyReacts += state.metrics.reactAttackOnlyByPlayer[winner];
    state.metrics.winnerRotationOnlyReacts += state.metrics.reactRotationOnlyByPlayer[winner];
    state.metrics.winnerRotateAttacks += state.metrics.reactRotateAttackByPlayer[winner];
    state.metrics.loserAttackOnlyReacts += state.metrics.reactAttackOnlyByPlayer[loser];
    state.metrics.loserRotationOnlyReacts += state.metrics.reactRotationOnlyByPlayer[loser];
    state.metrics.loserRotateAttacks += state.metrics.reactRotateAttackByPlayer[loser];
  }

  for (let player = 0; player < 2; player++) {
    if ((state.metrics.checkReturnedByPlayer[player] ?? 0) <= 0) continue;
    state.metrics.checkReturnPlayerSlots += 1;
    if (state.winner === player) state.metrics.checkReturnPlayerWins += 1;
  }
  for (let player = 0; player < 2; player++) {
    if ((state.metrics.checkFailedByPlayer[player] ?? 0) <= 0) continue;
    state.metrics.checkFailedPlayerSlots += 1;
    if (state.winner === player) state.metrics.checkFailedPlayerWins += 1;
  }
}

function simulateGame(p0Faction, p1Faction, cardsByFaction, variant, seed) {
  const state = makeInitialState(p0Faction, p1Faction, cardsByFaction, variant, seed);
  while (state.winner == null && state.halfTurns < MAX_HALF_TURNS) {
    simulateTurn(state);
  }
  if (state.winner == null) {
    const d0 = state.players[0].lifeDamage;
    const d1 = state.players[1].lifeDamage;
    state.winner = d0 > d1 ? 0 : d1 > d0 ? 1 : -1;
    state.reason = "timeout";
  }
  recordItemDeadAtEnd(state);
  recordOutcomeUsageMetrics(state);
  return {
    p0Faction,
    p1Faction,
    winner: state.winner,
    reason: state.reason,
    halfTurns: state.halfTurns + (state.winner !== null && state.reason !== "timeout" ? 1 : 0),
    metrics: state.metrics,
  };
}

function finishSimulatedState(state) {
  while (state.winner == null && state.halfTurns < MAX_HALF_TURNS) {
    simulateTurn(state);
  }
  if (state.winner == null) {
    const d0 = state.players[0].lifeDamage;
    const d1 = state.players[1].lifeDamage;
    state.winner = d0 > d1 ? 0 : d1 > d0 ? 1 : -1;
    state.reason = "timeout";
  }
  recordItemDeadAtEnd(state);
  recordOutcomeUsageMetrics(state);
  return {
    winner: state.winner,
    reason: state.reason,
    halfTurns: state.halfTurns + (state.winner !== null && state.reason !== "timeout" ? 1 : 0),
  };
}

function outcomeFromForkState(state, actor) {
  const result = finishSimulatedState(state);
  return {
    winner: result.winner,
    reason: result.reason,
    actorWon: result.winner === actor,
    rounds: result.halfTurns / 2,
  };
}

function reactValuePositionLayer(state) {
  const active = state.active;
  const diff = controlCount(state.board, active) - controlCount(state.board, 1 - active);
  if (diff <= -1) return { key: "behind", label: "劣勢", diff };
  if (diff >= 1) return { key: "ahead", label: "優勢", diff };
  return { key: "even", label: "互角", diff };
}

function reactValueCheckLayer(state) {
  const underCheck = !!state.pendingCheck[1 - state.active];
  return { key: underCheck ? "under_check" : "normal", label: underCheck ? "王手被弾中" : "通常", underCheck };
}

function reactValueLayerKey(positionKey, checkKey) {
  return `${positionKey}/${checkKey}`;
}

function reactValueLayerLabel(positionLabel, checkLabel) {
  return `${positionLabel} × ${checkLabel}`;
}

function actionKind(action) {
  if (!action) return "none";
  if (action.type === "rotateAttack") return "choice2";
  if (action.type === "attack") return "choice3";
  return action.type;
}

function actionKindLabel(kind) {
  if (kind === "combined") return "②+③";
  if (kind === "choice2") return "②のみ";
  if (kind === "choice3") return "③のみ";
  if (kind === "direct23") return "②vs③";
  return kind;
}

function spontaneousMatchesCategory(spontaneousKind, category) {
  if (category === "combined") return spontaneousKind === "choice2" || spontaneousKind === "choice3";
  return spontaneousKind === category;
}

function runForcedForkWorld(snapshot, action, actor) {
  const state = cloneStateWithRandom(snapshot);
  simulateTurn(state, { beginTurnAlreadyDone: true, forceAttackFamilyAction: action });
  return outcomeFromForkState(state, actor);
}

function runOffForkWorld(snapshot, actor) {
  const state = cloneStateWithRandom(snapshot);
  simulateTurn(state, { beginTurnAlreadyDone: true, disableAttackFamilyThisTurn: true });
  return outcomeFromForkState(state, actor);
}

function makeReactValueCandidate(state, gameIndex, localCandidateIndex) {
  const forcedAction = chooseBestAttackFamilyAction(state);
  if (!forcedAction) return null;
  const spontaneousAction = chooseReactivation(state);
  const position = reactValuePositionLayer(state);
  const check = reactValueCheckLayer(state);
  const forcedKind = actionKind(forcedAction);
  const directAttackAction =
    forcedKind === "choice2"
      ? chooseBestAttackFamilyAction(state, { allowRotateAttack: false })
      : null;
  return {
    gameIndex,
    localCandidateIndex,
    actor: state.active,
    halfTurn: state.halfTurns,
    round: state.halfTurns / 2,
    activeControl: controlCount(state.board, state.active),
    opponentControl: controlCount(state.board, 1 - state.active),
    controlDiff: position.diff,
    positionKey: position.key,
    positionLabel: position.label,
    checkKey: check.key,
    checkLabel: check.label,
    layerKey: reactValueLayerKey(position.key, check.key),
    layerLabel: reactValueLayerLabel(position.label, check.label),
    underCheck: check.underCheck,
    forcedAction,
    forcedKind,
    spontaneousKind: actionKind(spontaneousAction),
    spontaneousAction,
    directAttackAction,
    snapshot: cloneStateWithRandom(state),
  };
}

function sampleReactValueCandidates(candidates, maxCount, seed) {
  if (candidates.length <= maxCount) return [...candidates];
  const random = rng(seed);
  const indexes = candidates.map((_, index) => index);
  shuffle(indexes, random);
  return indexes.slice(0, maxCount).map((index) => candidates[index]);
}

function simulateReactValueForkBaseGame(gameIndex, seed, variant) {
  const cardsByFaction = { [PURE_FACTION]: [] };
  const state = makeInitialState(PURE_FACTION, PURE_FACTION, cardsByFaction, variant, seed);
  const candidates = [];
  let localCandidateIndex = 0;
  while (state.winner == null && state.halfTurns < MAX_HALF_TURNS) {
    beginTurn(state);
    const candidate = makeReactValueCandidate(state, gameIndex, localCandidateIndex);
    if (candidate) {
      candidates.push(candidate);
      localCandidateIndex += 1;
    }
    simulateTurn(state, { beginTurnAlreadyDone: true });
  }
  return sampleReactValueCandidates(candidates, 2, (seed ^ 0x9e3779b9) >>> 0);
}

function runReactValueFork(candidate, sampledIndex) {
  const actor = candidate.actor;
  const on = runForcedForkWorld(candidate.snapshot, candidate.forcedAction, actor);
  const off = runOffForkWorld(candidate.snapshot, actor);
  let directChoice3 = null;
  if (candidate.forcedKind === "choice2" && candidate.directAttackAction) {
    directChoice3 = runForcedForkWorld(candidate.snapshot, candidate.directAttackAction, actor);
  }
  return {
    gameIndex: candidate.gameIndex,
    localCandidateIndex: candidate.localCandidateIndex,
    sampledIndex,
    actor,
    halfTurn: candidate.halfTurn,
    round: candidate.round,
    activeControl: candidate.activeControl,
    opponentControl: candidate.opponentControl,
    controlDiff: candidate.controlDiff,
    positionKey: candidate.positionKey,
    positionLabel: candidate.positionLabel,
    checkKey: candidate.checkKey,
    checkLabel: candidate.checkLabel,
    layerKey: candidate.layerKey,
    layerLabel: candidate.layerLabel,
    underCheck: candidate.underCheck,
    forcedKind: candidate.forcedKind,
    forcedAction: summarizeForkAction(candidate.forcedAction),
    spontaneousKind: candidate.spontaneousKind,
    spontaneousAction: summarizeForkAction(candidate.spontaneousAction),
    on,
    off,
    directChoice3,
  };
}

function chooseReactValueV2Alternative(state, source) {
  if (source === "check-search" && state.pendingCheck[1 - state.active]) {
    const plan = findOracleReturnPlan(state, 1 - state.active, state.checkSearchDepth, {
      allowAttack: false,
      allowRotateAttack: false,
    });
    if (plan && plan.length > 0) return cloneState(plan[0]);
  }

  const rotate = chooseReactivation(state, { allowAttack: false, allowRotateAttack: false });
  if (rotate) return { type: "reactivation", action: cloneState(rotate) };
  const item = chooseItemAction(state);
  if (item) return { type: "item", action: cloneState(item) };
  const summon = chooseSummon(state);
  if (summon) return { type: "summon", action: cloneState(summon) };
  return { type: "wait", action: null };
}

function reactValueV2AlternativeKind(alternative) {
  if (!alternative) return "wait";
  if (alternative.type === "reactivation") return actionKind(alternative.action);
  return alternative.type;
}

function executeReactValueV2SelectedAction(state, action, source) {
  if (source === "check-search") executePlannedReactivation(state, action);
  else executeReactivation(state, action);
}

function finishReactValueV2CurrentTurn(state) {
  if (state.players[0].lifeDamage >= LIFE_TOTAL) {
    state.winner = 0;
    state.reason = "life";
  } else if (state.players[1].lifeDamage >= LIFE_TOTAL) {
    state.winner = 1;
    state.reason = "life";
  }
  if (state.winner == null) finishTurn(state);
}

function runReactValueV2OnWorld(candidate) {
  const state = cloneStateWithRandom(candidate.snapshot);
  executeReactValueV2SelectedAction(state, candidate.selectedAction, candidate.source);
  if (!hasWinner(state)) simulateTurn(state, { beginTurnAlreadyDone: true });
  return outcomeFromForkState(state, candidate.actor);
}

function runReactValueV2OffWorld(candidate) {
  const state = cloneStateWithRandom(candidate.snapshot);
  const alternative = chooseReactValueV2Alternative(state, candidate.source);
  if (alternative.type === "reactivation") {
    executePlannedReactivation(state, alternative.action);
    if (!hasWinner(state)) simulateTurn(state, { beginTurnAlreadyDone: true });
  } else if (alternative.type === "item") {
    executeItemAction(state, alternative.action, "react-value-v2-off");
    if (!hasWinner(state)) simulateTurn(state, { beginTurnAlreadyDone: true });
  } else if (alternative.type === "summon") {
    executeSummon(state, alternative.action);
    finishReactValueV2CurrentTurn(state);
  } else {
    finishReactValueV2CurrentTurn(state);
  }
  return {
    alternative: {
      kind: reactValueV2AlternativeKind(alternative),
      action: summarizeForkAction(alternative.action),
    },
    outcome: outcomeFromForkState(state, candidate.actor),
  };
}

function makeReactValueV2Candidate(state, action, source, gameIndex, localCandidateIndex) {
  if (source !== "normal") return null;
  const kind = actionKind(action);
  if (kind !== "choice2" && kind !== "choice3") return null;
  const position = reactValuePositionLayer(state);
  const check = reactValueCheckLayer(state);
  return {
    gameIndex,
    localCandidateIndex,
    actor: state.active,
    halfTurn: state.halfTurns,
    round: state.halfTurns / 2,
    source,
    selectedKind: kind,
    selectedAction: cloneState(action),
    activeControl: controlCount(state.board, state.active),
    opponentControl: controlCount(state.board, 1 - state.active),
    controlDiff: position.diff,
    positionKey: position.key,
    positionLabel: position.label,
    checkKey: check.key,
    checkLabel: check.label,
    layerKey: reactValueLayerKey(position.key, check.key),
    layerLabel: reactValueLayerLabel(position.label, check.label),
    underCheck: check.underCheck,
    snapshot: cloneStateWithRandom(state),
  };
}

function sampleReactValueV2MatchedCandidates(candidates, seed) {
  const byActor = [
    candidates.filter((candidate) => candidate.actor === 0),
    candidates.filter((candidate) => candidate.actor === 1),
  ];
  if (byActor[0].length === 0 || byActor[1].length === 0) return [];
  const random = rng(seed);
  return byActor.map((actorCandidates) => actorCandidates[Math.floor(random() * actorCandidates.length)]);
}

function simulateReactValueV2BaseGame(gameIndex, seed, variant) {
  const cardsByFaction = { [PURE_FACTION]: [] };
  const state = makeInitialState(PURE_FACTION, PURE_FACTION, cardsByFaction, variant, seed);
  const candidates = [];
  let localCandidateIndex = 0;
  while (state.winner == null && state.halfTurns < MAX_HALF_TURNS) {
    simulateTurn(state, {
      onReactivationChosen: (choiceState, action, meta) => {
        const candidate = makeReactValueV2Candidate(
          choiceState,
          action,
          meta.source,
          gameIndex,
          localCandidateIndex,
        );
        if (!candidate) return;
        candidates.push(candidate);
        localCandidateIndex += 1;
      },
    });
  }
  return sampleReactValueV2MatchedCandidates(candidates, (seed ^ 0x517cc1b7) >>> 0);
}

function runReactValueV2Fork(candidate, sampledIndex) {
  const on = runReactValueV2OnWorld(candidate);
  const offResult = runReactValueV2OffWorld(candidate);
  return {
    gameIndex: candidate.gameIndex,
    localCandidateIndex: candidate.localCandidateIndex,
    sampledIndex,
    actor: candidate.actor,
    halfTurn: candidate.halfTurn,
    round: candidate.round,
    source: candidate.source,
    activeControl: candidate.activeControl,
    opponentControl: candidate.opponentControl,
    controlDiff: candidate.controlDiff,
    positionKey: candidate.positionKey,
    positionLabel: candidate.positionLabel,
    checkKey: candidate.checkKey,
    checkLabel: candidate.checkLabel,
    layerKey: candidate.layerKey,
    layerLabel: candidate.layerLabel,
    underCheck: candidate.underCheck,
    selectedKind: candidate.selectedKind,
    selectedAction: summarizeForkAction(candidate.selectedAction),
    offAlternative: offResult.alternative,
    on,
    off: offResult.outcome,
  };
}

function summarizeForkAction(action) {
  if (!action) return null;
  return {
    type: action.type,
    idx: action.idx,
    dir: action.dir,
    cost: action.cost,
    score: Number.isFinite(action.score) ? Number(action.score.toFixed(3)) : action.score,
  };
}

function makeVariants(args) {
  if (args.pureVanillaGrid) return makePureVanillaVariants(args);
  if (args.deckRulesGrid) return makeDeckRulesGridVariants(args);
  if (args.rotationGrid) return makeRotationGridVariants(args);

  let variants = [];
  const hpNames = args.focus ? ["standard", "sturdy"] : Object.keys(HP_CURVES);
  const atkNames = args.focus ? ["low", "standard"] : Object.keys(ATK_CURVES);
  const reactNames = args.focus ? ["standard", "heavy"] : Object.keys(REACT_CURVES);
  for (const hp of hpNames) {
    for (const atk of atkNames) {
      for (const react of reactNames) {
        for (const shapeTax of SHAPE_TAXES) {
          for (const lifeRule of LIFE_RULES) {
            variants.push({
              name: `${hp}/${atk}/${react}/${shapeTax}/life${lifeRule}`,
              hp,
              atk,
              react,
              rotationCost: "same",
              shapeTax,
              lifeRule,
              manaGain: 3,
              p1StartingMana: args.p1Mana,
              oracle: args.oracle,
              checkSearchDepth: args.checkSearchDepth,
              deckCreatures: args.deckCreatures,
              fatigue: args.fatigue,
            });
          }
        }
      }
    }
  }
  if (args.only) {
    const matcher = new RegExp(args.only);
    variants = variants.filter((variant) => matcher.test(variant.name));
  }
  return variants;
}

function makePureVanillaVariants(args) {
  const variants = [];
  for (const [curveName, curve] of Object.entries(PURE_CURVES)) {
    for (const [distributionName, distribution] of Object.entries(PURE_DISTRIBUTIONS)) {
      variants.push({
        name: `${curveName}/${distributionName}`,
        pureVanilla: true,
        curveName,
        distributionName,
        distribution,
        hp: curve.hp,
        atk: curve.atk,
        react: curve.react,
        rotationCost: "same",
        shapeTax: "none",
        lifeRule: "134",
        manaGain: 3,
        p0StartingMana: START_MANA_FIRST,
        p1StartingMana: START_MANA_SECOND,
        oracle: args.oracle,
        checkSearchDepth: args.checkSearchDepth,
        deckCreatures: DRAFT_DECK_CREATURES,
        fatigue: false,
      });
    }
  }

  if (args.only) {
    const matcher = new RegExp(args.only);
    return variants.filter((variant) => matcher.test(variant.name));
  }
  return variants;
}

function makeR1BaseVariant(args) {
  return {
    hp: "standard",
    atk: "high",
    react: "heavy",
    rotationCost: "fixed1",
    shapeTax: "light",
    lifeRule: "134",
    manaGain: 3,
    p1StartingMana: args.p1Mana,
    oracle: args.oracle,
    checkSearchDepth: args.checkSearchDepth,
  };
}

function makeDeckRulesGridVariants(args) {
  const base = makeR1BaseVariant(args);
  let variants = [
    {
      name: "D0_v1.1_12creatures_noFatigue",
      deckCreatures: DEFAULT_DECK_CREATURES,
      fatigue: false,
    },
    {
      name: "D1_16creatures_noFatigue",
      deckCreatures: DRAFT_DECK_CREATURES,
      fatigue: false,
    },
    {
      name: "D2_16creatures_fatigue",
      deckCreatures: DRAFT_DECK_CREATURES,
      fatigue: true,
    },
  ].map((variant) => ({ ...base, ...variant }));

  if (args.only) {
    const matcher = new RegExp(args.only);
    variants = variants.filter((variant) => matcher.test(variant.name));
  }
  return variants;
}

function makeRotationGridVariants(args) {
  const base = {
    ...makeR1BaseVariant(args),
    rotationCost: undefined,
    deckCreatures: args.deckCreatures,
    fatigue: args.fatigue,
  };
  let variants = [
    { name: "A0_standard-high-heavy-light-life134_rotSame", react: "heavy", rotationCost: "same" },
    { name: "A1_standard-high-standard-light-life134_rotSame", react: "standard", rotationCost: "same" },
    { name: "A2_standard-high-light-light-life134_rotSame", react: "light", rotationCost: "same" },
    { name: "R1_standard-high-heavy-light-life134_rot1", react: "heavy", rotationCost: "fixed1" },
    { name: "R2_standard-high-heavy-light-life134_rotMinus2Min1", react: "heavy", rotationCost: "minus2min1" },
  ].map((variant) => ({ ...base, ...variant }));

  if (args.only) {
    const matcher = new RegExp(args.only);
    variants = variants.filter((variant) => matcher.test(variant.name));
  }
  return variants;
}

function makePhase2aPrimaryVariants(args) {
  const variants = [];
  for (const hp of ["lean", "hybrid"]) {
    for (const atk of ["high", "standard"]) {
      for (const react of ["heavy", "standard"]) {
        for (const [distributionName, distribution] of Object.entries(PHASE2A_DISTRIBUTIONS)) {
          variants.push(makePhase2aVariant({
            name: `P1_${hp}-${atk}-${react}_${distributionName}_m${START_MANA_SECOND}_dm${DESTROY_MANA_GAIN}`,
            phase: "primary",
            hp,
            atk,
            react,
            distributionName,
            distribution,
            p1StartingMana: START_MANA_SECOND,
            destroyManaGain: DESTROY_MANA_GAIN,
            oracle: true,
            checkSearchDepth: 6,
          }));
        }
      }
    }
  }
  if (args.only) {
    const matcher = new RegExp(args.only);
    return variants.filter((variant) => matcher.test(variant.name));
  }
  return variants;
}

function makePhase2aVariant({
  name,
  phase,
  hp,
  atk,
  react,
  distributionName,
  distribution,
  p1StartingMana,
  destroyManaGain,
  oracle,
  checkSearchDepth,
  distributionsByOwner = null,
  distributionNamesByOwner = null,
  robustnessNote = null,
  sourcePrimaryRank = null,
}) {
  return {
    name,
    phase,
    pureVanilla: true,
    curveName: `${hp}-${atk}-${react}`,
    distributionName,
    distribution: cloneDistribution(distribution),
    hp,
    atk,
    react,
    rotationCost: "same",
    shapeTax: "none",
    lifeRule: "134",
    manaGain: 3,
    p0StartingMana: START_MANA_FIRST,
    p1StartingMana,
    destroyManaGain,
    oracle,
    checkSearchDepth,
    deckCreatures: DRAFT_DECK_CREATURES,
    fatigue: false,
    distributionsByOwner,
    distributionNamesByOwner,
    robustnessNote,
    sourcePrimaryRank,
  };
}

function cloneDistribution(distribution) {
  const out = {};
  for (const cost of [2, 3, 4, 5, 6, 7]) out[cost] = distribution[cost] ?? 0;
  return out;
}

function distributionLabel(distribution) {
  return [2, 3, 4, 5, 6, 7].map((cost) => `C${cost}:${distribution[cost] ?? 0}`).join(" ");
}

function shiftedDistribution(base, direction, step) {
  const dist = cloneDistribution(base);
  for (let moved = 0; moved < 2; moved++) {
    const costs = direction < 0 ? [7, 6, 5, 4, 3] : [2, 3, 4, 5, 6];
    const source = costs.find((cost) => (dist[cost] ?? 0) > 0);
    if (source == null) break;
    const target = Math.max(2, Math.min(7, source + direction * step));
    if (target === source) break;
    dist[source] -= 1;
    dist[target] = (dist[target] ?? 0) + 1;
  }
  return dist;
}

function makeRobustnessNeighbors(centerDistribution) {
  return [
    {
      name: "lighter_step1",
      note: "Move two cards from the highest available costs down by one cost.",
      distribution: shiftedDistribution(centerDistribution, -1, 1),
    },
    {
      name: "lighter_step2",
      note: "Move two cards from the highest available costs down by two costs.",
      distribution: shiftedDistribution(centerDistribution, -1, 2),
    },
    {
      name: "heavier_step1",
      note: "Move two cards from the lowest available costs up by one cost.",
      distribution: shiftedDistribution(centerDistribution, 1, 1),
    },
    {
      name: "heavier_step2",
      note: "Move two cards from the lowest available costs up by two costs.",
      distribution: shiftedDistribution(centerDistribution, 1, 2),
    },
  ];
}

function runVariantBatch(label, variants, samples, seedBase) {
  const cardsByFaction = { [PURE_FACTION]: [] };
  const out = [];
  for (let v = 0; v < variants.length; v++) {
    const variant = variants[v];
    const gameResults = [];
    for (let i = 0; i < samples; i++) {
      const seed = (seedBase + i * 9176) >>> 0;
      gameResults.push(simulateGame(PURE_FACTION, PURE_FACTION, cardsByFaction, variant, seed));
    }
    const summary = summarize(gameResults);
    out.push({ variant, score: scoreSummary(summary), summary });
    console.error(`${label}: simulated ${v + 1}/${variants.length} variants`);
  }
  return out.sort((a, b) => a.score - b.score);
}

function runUnrankedVariantBatch(label, variants, samples, seedBase) {
  const cardsByFaction = { [PURE_FACTION]: [] };
  const out = [];
  for (let v = 0; v < variants.length; v++) {
    const variant = variants[v];
    const gameResults = [];
    for (let i = 0; i < samples; i++) {
      const seed = (seedBase + v * 1000003 + i * 9176) >>> 0;
      gameResults.push(simulateGame(PURE_FACTION, PURE_FACTION, cardsByFaction, variant, seed));
    }
    const summary = summarize(gameResults);
    out.push({ variant, summary });
    console.error(`${label}: simulated ${v + 1}/${variants.length} variants`);
  }
  return out;
}

function makeSecondaryVariants(primaryResults) {
  const variants = [];
  for (let rank = 0; rank < primaryResults.length; rank++) {
    const base = primaryResults[rank].variant;
    for (const p1StartingMana of [3, 4, 5]) {
      for (const destroyManaGain of [0, 1, 2]) {
        variants.push(makePhase2aVariant({
          name: `P2_r${rank + 1}_${base.hp}-${base.atk}-${base.react}_${base.distributionName}_m${p1StartingMana}_dm${destroyManaGain}`,
          phase: "secondary",
          hp: base.hp,
          atk: base.atk,
          react: base.react,
          distributionName: base.distributionName,
          distribution: base.distribution,
          p1StartingMana,
          destroyManaGain,
          oracle: true,
          checkSearchDepth: 6,
          sourcePrimaryRank: rank + 1,
        }));
      }
    }
  }
  return variants;
}

function makeRobustnessVariants(bestResult) {
  const base = bestResult.variant;
  const center = cloneDistribution(base.distribution);
  const neighbors = makeRobustnessNeighbors(center);
  const variants = [];

  for (const neighbor of neighbors) {
    variants.push(makePhase2aVariant({
      name: `R_mirror_${neighbor.name}`,
      phase: "robustness",
      hp: base.hp,
      atk: base.atk,
      react: base.react,
      distributionName: neighbor.name,
      distribution: neighbor.distribution,
      p1StartingMana: base.p1StartingMana,
      destroyManaGain: base.destroyManaGain,
      oracle: true,
      checkSearchDepth: 6,
      robustnessNote: `${neighbor.note} Mirror: ${distributionLabel(neighbor.distribution)}`,
    }));
    variants.push(makePhase2aVariant({
      name: `R_cross_${neighbor.name}_vs_center`,
      phase: "robustness",
      hp: base.hp,
      atk: base.atk,
      react: base.react,
      distributionName: `${neighbor.name}_vs_${base.distributionName}`,
      distribution: neighbor.distribution,
      p1StartingMana: base.p1StartingMana,
      destroyManaGain: base.destroyManaGain,
      oracle: true,
      checkSearchDepth: 6,
      distributionsByOwner: [cloneDistribution(neighbor.distribution), center],
      distributionNamesByOwner: [neighbor.name, base.distributionName],
      robustnessNote: `P0 ${neighbor.name} vs P1 center. ${neighbor.note}`,
    }));
    variants.push(makePhase2aVariant({
      name: `R_cross_center_vs_${neighbor.name}`,
      phase: "robustness",
      hp: base.hp,
      atk: base.atk,
      react: base.react,
      distributionName: `${base.distributionName}_vs_${neighbor.name}`,
      distribution: center,
      p1StartingMana: base.p1StartingMana,
      destroyManaGain: base.destroyManaGain,
      oracle: true,
      checkSearchDepth: 6,
      distributionsByOwner: [center, cloneDistribution(neighbor.distribution)],
      distributionNamesByOwner: [base.distributionName, neighbor.name],
      robustnessNote: `P0 center vs P1 ${neighbor.name}. ${neighbor.note}`,
    }));
  }
  return variants;
}

function runPhase2a(args) {
  fs.mkdirSync(path.dirname(PHASE2A_OUT_PATH), { recursive: true });
  const primaryVariants = makePhase2aPrimaryVariants(args);
  const primary = runVariantBatch("phase2a primary", primaryVariants, args.phase2aPrimarySamples, args.seed);
  const topPrimary = primary.slice(0, args.phase2aTop);
  const secondaryVariants = makeSecondaryVariants(topPrimary);
  const secondary = runVariantBatch("phase2a secondary", secondaryVariants, args.phase2aSecondarySamples, (args.seed + 0x2a0000) >>> 0);
  const bestSecondary = secondary[0];
  const robustnessVariants = makeRobustnessVariants(bestSecondary);
  const robustness = runVariantBatch("phase2a robustness", robustnessVariants, args.phase2aRobustnessSamples, (args.seed + 0x2b0000) >>> 0);

  const output = {
    generatedAt: new Date().toISOString(),
    assumptions: {
      ruleSpecSource: "C:\\Users\\princ\\.codex\\attachments\\a2e72f60-bb0d-4b66-af1d-26fe7f1a501f\\pasted-text.txt",
      phase2aTask: path.join(ROOT, "docs", "codex-task-phase2a-main-search.md"),
      kpiDesign: path.join(ROOT, "docs", "kpi-design-pure-vanilla.md"),
      baseline: path.join(ROOT, "docs", "baselines", "pure-vanilla-calibration-v2.md"),
      lifeTotal: LIFE_TOTAL,
      manaGain: 3,
      manaCap: MANA_CAP,
      startManaFirst: START_MANA_FIRST,
      startManaSecondPrimary: START_MANA_SECOND,
      destroyManaGainPrimary: DESTROY_MANA_GAIN,
      maxHp: MAX_HP,
      weakPhysicalBonus: WEAK_BONUS,
      oracle: true,
      checkSearchDepth: 6,
      pureVanilla: {
        faction: PURE_FACTION,
        curves: {
          hp: ["lean", "hybrid"],
          atk: ["high", "standard"],
          react: ["heavy", "standard"],
        },
        distributions: PHASE2A_DISTRIBUTIONS,
        template: {
          attack_cells: [[1, 0]],
          counter_cells: [[1, 0]],
          weakness_cells: [[-1, 0]],
          attack_type: "physical",
          attack_mode: "choice",
          attack_target_count: 1,
        },
        boardAttributes: PURE_BOARD_ATTRS,
      },
      scoring: {
        avgRounds: "7-10",
        p90Rounds: "<=14",
        territoryWinRate: ">=95%",
        timeoutRate: "0%",
        p0WinRate: "50-53%",
        check4ReturnRate: "45-55%",
        killsPerGame: "3.5-5",
        attackReactivationsPerGame: "2.5-4.5",
        weakKillRate: ">=45%",
        summonStallRate: ">=20%",
        manaUtilization: ">=87%",
        board3MedianRound: "<=4",
        rotations: "logged only, not scored",
      },
    },
    primary: {
      samplesPerVariant: args.phase2aPrimarySamples,
      variants: primary,
    },
    secondary: {
      samplesPerVariant: args.phase2aSecondarySamples,
      topPrimaryCount: args.phase2aTop,
      sourcePrimaryVariants: topPrimary.map((result, index) => ({
        rank: index + 1,
        name: result.variant.name,
        score: result.score,
        summary: result.summary,
      })),
      variants: secondary,
    },
    robustness: {
      samplesPerVariant: args.phase2aRobustnessSamples,
      bestSecondary: {
        name: bestSecondary.variant.name,
        score: bestSecondary.score,
        variant: bestSecondary.variant,
        summary: bestSecondary.summary,
      },
      centerDistribution: distributionLabel(bestSecondary.variant.distribution),
      variants: robustness,
    },
  };

  fs.writeFileSync(PHASE2A_OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  fs.writeFileSync(PHASE2A_MD_PATH, phase2aMarkdown(output), "utf8");
  console.log(`\nWrote ${path.relative(ROOT, PHASE2A_OUT_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, PHASE2A_MD_PATH)}`);
}

function phase2aMarkdown(output) {
  const lines = [];
  lines.push("# Phase2a Main Search");
  lines.push("");
  lines.push(`Date: ${output.generatedAt}`);
  lines.push("");
  lines.push("## Command");
  lines.push("");
  lines.push("```powershell");
  lines.push("node scripts\\explore-stat-curves.cjs --phase2a-main-search --seed 20260702");
  lines.push("```");
  lines.push("");
  lines.push("## Implementation Notes");
  lines.push("");
  lines.push("- `scoreSummary` is aligned to the confirmed KPI bands in `docs/kpi-design-pure-vanilla.md`.");
  lines.push("- Rotation metrics are logged but not included in the score.");
  lines.push("- Rotation remains once per creature per turn.");
  lines.push("- Destroyed creatures do not counterattack because attack resolution returns immediately on defender destruction.");
  lines.push("- When a creature goes from board to discard through destruction, its owner gains the variant's `DESTROY_MANA_GAIN`.");
  lines.push("- Pure body items are not implemented in this phase.");
  lines.push("- No final design decision is made here; this file is a result handoff.");
  lines.push("");
  lines.push("## Primary Ranking");
  lines.push("");
  lines.push(phase2aTable(output.primary.variants, true));
  lines.push("");
  lines.push("## Secondary Sweep");
  lines.push("");
  lines.push("Top 3 primary variants were swept across `START_MANA_SECOND={3,4,5}` and `DESTROY_MANA_GAIN={0,1,2}` with the full cartesian grid.");
  lines.push("");
  lines.push(phase2aTable(output.secondary.variants, true));
  lines.push("");
  lines.push("## Robustness Test");
  lines.push("");
  lines.push(`Best secondary variant: \`${output.robustness.bestSecondary.name}\``);
  lines.push("");
  lines.push(`Center distribution: \`${output.robustness.centerDistribution}\``);
  lines.push("");
  lines.push("Neighborhood rules:");
  lines.push("");
  lines.push("- `lighter_step1`: move two cards from the highest available costs down by one cost.");
  lines.push("- `lighter_step2`: move two cards from the highest available costs down by two costs.");
  lines.push("- `heavier_step1`: move two cards from the lowest available costs up by one cost.");
  lines.push("- `heavier_step2`: move two cards from the lowest available costs up by two costs.");
  lines.push("");
  lines.push(phase2aTable(output.robustness.variants, false));
  lines.push("");
  lines.push("## Output");
  lines.push("");
  lines.push(`JSON: \`${PHASE2A_OUT_PATH}\``);
  return `${lines.join("\n")}\n`;
}

function phase2aTable(results, ranked) {
  const rows = ranked ? [...results].sort((a, b) => a.score - b.score) : results;
  const lines = [
    "| Rank | Variant | Score | AvgR | P90 | Terr | Life | Timeout | P0 | 4Ret | Oracle | Realized | Kills | AtkReact | WeakKill | Stall | ManaUse | Board3Med | Rot | Reshuffle | Notes |",
    "|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ];
  rows.forEach((result, index) => {
    const s = result.summary;
    const oracle = s.check4OracleChecksPerGame > 0 ? formatPct(s.check4OracleReturnableRate) : "-";
    const realized = s.check4OracleChecksPerGame > 0 ? formatPct(s.check4OracleRealizationRate) : "-";
    const note = result.variant.robustnessNote ? result.variant.robustnessNote.replaceAll("|", "/") : "";
    lines.push(
      `| ${index + 1} | ${result.variant.name} | ${result.score.toFixed(2)} | ${s.avgRounds.toFixed(2)} | ${s.p90Rounds.toFixed(1)} | ${formatPct(s.territoryWinRate)} | ${formatPct(s.lifeWinRate)} | ${formatPct(s.timeoutRate)} | ${formatPct(s.p0WinRate)} | ${formatPct(s.check4ReturnRate)} | ${oracle} | ${realized} | ${s.killsPerGame.toFixed(1)} | ${s.attackReactivationsPerGame.toFixed(1)} | ${formatPct(s.weakKillRate)} | ${formatPct(s.summonStallRate)} | ${formatPct(s.manaUtilization)} | ${formatNullable(s.board3.medianRound)} | ${s.rotationsPerGame.toFixed(1)} | ${formatPct(s.deckReshuffleGameRate)} | ${note} |`,
    );
  });
  return lines.join("\n");
}

function makeBaselineV3CenterVariant() {
  return makePhase2aVariant({
    name: "baseline_v3_center_hybrid-high-heavy_lowmid_m4_dm1",
    phase: "baseline-v3-center",
    hp: "hybrid",
    atk: "high",
    react: "heavy",
    distributionName: "lowmid",
    distribution: PHASE2A_DISTRIBUTIONS.lowmid,
    p1StartingMana: START_MANA_SECOND,
    destroyManaGain: DESTROY_MANA_GAIN,
    oracle: true,
    checkSearchDepth: 6,
  });
}

function reactSweepLevelLabel(level) {
  return level === "heavyPlus" ? "heavy+" : level;
}

function reactCurveLabel(curve) {
  return [2, 3, 4, 5, 6, 7].map((cost) => curve[cost]).join("/");
}

function makeReactCostSweepVariants() {
  return ["light", "standard", "heavy", "heavyPlus"].map((level) => {
    const curve = REACT_COST_SWEEP_CURVES[level];
    return {
      ...makeBaselineV3CenterVariant(),
      name: `react_cost_${level}`,
      phase: "react-cost-sweep",
      react: "custom",
      reactLevelName: level,
      reactCostCurve: { ...curve },
      curveName: `hybrid-high-${level}`,
      reactNeedOracle: true,
      itemCounts: null,
    };
  });
}

function runReactCostSweep(args) {
  fs.mkdirSync(path.dirname(REACT_SWEEP_OUT_PATH), { recursive: true });
  const variants = makeReactCostSweepVariants();
  const runs = runUnrankedVariantBatch("react cost sweep", variants, args.reactCostSweepSamples, args.seed);
  const command = "node scripts\\explore-stat-curves.cjs --react-cost-sweep --seed 20260702";
  const output = {
    generatedAt: new Date().toISOString(),
    assumptions: {
      task: path.join(ROOT, "docs", "codex-task-react-cost-sweep.md"),
      baselineV3: BASELINE_V3_MD_PATH,
      kpiDesign: path.join(ROOT, "docs", "kpi-design-pure-vanilla.md"),
      fixedConfiguration: {
        hp: "hybrid",
        hpCurve: HP_CURVES.hybrid,
        atk: "high",
        atkCurve: ATK_CURVES.high,
        distributionName: "lowmid",
        distribution: PHASE2A_DISTRIBUTIONS.lowmid,
        startManaFirst: START_MANA_FIRST,
        startManaSecond: START_MANA_SECOND,
        destroyManaGain: DESTROY_MANA_GAIN,
      },
      reactCostCurves: REACT_COST_SWEEP_CURVES,
      controlLevel: "heavyPlus",
      rules: {
        rotationCost: "same as attack reactivation cost",
        rotationLimit: "once per creature per turn",
        destroyedDefenderDoesNotCounter: true,
        ownerGainsManaWhenCreatureLeavesBoardToDiscard: true,
        items: "not implemented in this sweep",
      },
      measurementD: {
        depth: 6,
        method:
          "For each depth-6 returnable check, rerun the oracle from the same state with attack reactivation disabled, rotation disabled, and both disabled. Classification is based on these restricted action spaces, not on the first returned plan.",
      },
      seedPolicy: "All four cost levels use the same seed sequence (seed + gameIndex * 9176) to isolate reactivation-cost effects.",
      lifeTotal: LIFE_TOTAL,
      manaGain: 3,
      manaCap: MANA_CAP,
      maxHp: MAX_HP,
      weakPhysicalBonus: WEAK_BONUS,
      oracle: true,
      checkSearchDepth: 6,
      scoring: "not used; rows are reported in fixed level order",
    },
    reproducibility: {
      command,
      repoHead: gitHead(),
      scriptPath: __filename,
      scriptSha256: sha256File(__filename),
      seed: args.seed,
      oracle: true,
      checkSearchDepth: 6,
      samplesPerVariant: args.reactCostSweepSamples,
    },
    runs,
  };

  fs.writeFileSync(REACT_SWEEP_OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  const resultJsonSha256 = sha256File(REACT_SWEEP_OUT_PATH);
  fs.writeFileSync(REACT_SWEEP_MD_PATH, reactCostSweepMarkdown(output, { resultJsonSha256 }), "utf8");
  console.log(`\nWrote ${path.relative(ROOT, REACT_SWEEP_OUT_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, REACT_SWEEP_MD_PATH)}`);
}

function makePhase2dVariant({
  runId,
  reactLevelName,
  rotateAttackRule,
  destroyManaGain,
  purpose,
  p0StartingMana = START_MANA_FIRST,
  p1StartingMana = START_MANA_SECOND,
  phase = "phase2d-rotate-attack",
}) {
  const curve = REACT_COST_SWEEP_CURVES[reactLevelName];
  return {
    ...makeBaselineV3CenterVariant(),
    name: `${runId}_${reactLevelName}${rotateAttackRule ? "_rotateAttack" : "_noRotateAttack"}_m${p0StartingMana}-${p1StartingMana}_dm${destroyManaGain}`,
    runId,
    purpose,
    phase,
    react: "custom",
    reactLevelName,
    reactCostCurve: { ...curve },
    curveName: `hybrid-high-${reactLevelName}`,
    rotateAttackRule,
    reactNeedOracle: true,
    p0StartingMana,
    p1StartingMana,
    destroyManaGain,
    itemCounts: null,
  };
}

function makeBaselineV31CenterVariant() {
  const variant = makePhase2dVariant({
    runId: "v31",
    reactLevelName: "heavy",
    rotateAttackRule: true,
    destroyManaGain: DESTROY_MANA_GAIN,
    phase: "baseline-v31-center",
    purpose: "Frozen v3.1 center: v3 body with heavy 2/3/3/3/3/4 reactivation and choice 2 rotate-attack rule.",
  });
  return {
    ...variant,
    name: "baseline_v31_center_hybrid-high-heavy-rotateAttack_lowmid_m4_dm1",
  };
}

function makeV31RobustnessVariant(base, { name, distributionName, distribution, distributionsByOwner = null, distributionNamesByOwner = null, note }) {
  return {
    ...base,
    name,
    runId: name,
    phase: "baseline-v31-robustness",
    distributionName,
    distribution: cloneDistribution(distribution),
    distributionsByOwner: distributionsByOwner ? distributionsByOwner.map(cloneDistribution) : null,
    distributionNamesByOwner,
    robustnessNote: note,
    itemCounts: null,
  };
}

function makeV31RobustnessVariants(centerVariant) {
  const center = cloneDistribution(centerVariant.distribution);
  const neighbors = makeRobustnessNeighbors(center);
  const variants = [];

  for (const neighbor of neighbors) {
    variants.push(makeV31RobustnessVariant(centerVariant, {
      name: `R_mirror_${neighbor.name}`,
      distributionName: neighbor.name,
      distribution: neighbor.distribution,
      note: `${neighbor.note} Mirror: ${distributionLabel(neighbor.distribution)}`,
    }));
    variants.push(makeV31RobustnessVariant(centerVariant, {
      name: `R_cross_${neighbor.name}_vs_center`,
      distributionName: `${neighbor.name}_vs_${centerVariant.distributionName}`,
      distribution: neighbor.distribution,
      distributionsByOwner: [neighbor.distribution, center],
      distributionNamesByOwner: [neighbor.name, centerVariant.distributionName],
      note: `P0 ${neighbor.name} vs P1 center. ${neighbor.note}`,
    }));
    variants.push(makeV31RobustnessVariant(centerVariant, {
      name: `R_cross_center_vs_${neighbor.name}`,
      distributionName: `${centerVariant.distributionName}_vs_${neighbor.name}`,
      distribution: center,
      distributionsByOwner: [center, neighbor.distribution],
      distributionNamesByOwner: [centerVariant.distributionName, neighbor.name],
      note: `P0 center vs P1 ${neighbor.name}. ${neighbor.note}`,
    }));
  }
  return variants;
}

function makePhase2dVariants() {
  return [
    makePhase2dVariant({
      runId: "R0a",
      reactLevelName: "heavyPlus",
      rotateAttackRule: false,
      destroyManaGain: 1,
      purpose: "Control: v3 heavy+ cost without rotate-attack rule.",
    }),
    makePhase2dVariant({
      runId: "R0b",
      reactLevelName: "heavy",
      rotateAttackRule: false,
      destroyManaGain: 1,
      purpose: "Cost-effect control: heavy cost without rotate-attack rule.",
    }),
    makePhase2dVariant({
      runId: "R1",
      reactLevelName: "heavy",
      rotateAttackRule: true,
      destroyManaGain: 1,
      purpose: "Main candidate: heavy cost with rotate-attack rule.",
    }),
    makePhase2dVariant({
      runId: "R2",
      reactLevelName: "heavyPlus",
      rotateAttackRule: true,
      destroyManaGain: 1,
      purpose: "Rule-effect isolation at current heavy+ cost.",
    }),
    makePhase2dVariant({
      runId: "R3",
      reactLevelName: "standard",
      rotateAttackRule: false,
      destroyManaGain: 1,
      purpose: "Standard cost rerun for winner/loser and check-return follow-through metrics.",
    }),
    makePhase2dVariant({
      runId: "R4",
      reactLevelName: "light",
      rotateAttackRule: false,
      destroyManaGain: 1,
      purpose: "Light cost rerun for winner/loser and check-return follow-through metrics.",
    }),
    makePhase2dVariant({
      runId: "R5",
      reactLevelName: "standard",
      rotateAttackRule: false,
      destroyManaGain: 2,
      purpose: "Standard cost with DESTROY_MANA_GAIN=2.",
    }),
    makePhase2dVariant({
      runId: "R6",
      reactLevelName: "standard",
      rotateAttackRule: true,
      destroyManaGain: 2,
      purpose: "Standard cost plus rotate-attack rule with DESTROY_MANA_GAIN=2.",
    }),
  ];
}

function runPhase2dRotateAttack(args) {
  fs.mkdirSync(path.dirname(PHASE2D_OUT_PATH), { recursive: true });
  const variants = makePhase2dVariants();
  const runs = runUnrankedVariantBatch("phase2d rotate attack", variants, args.phase2dSamples, args.seed);
  const command = "node scripts\\explore-stat-curves.cjs --phase2d-rotate-attack --seed 20260702";
  const output = {
    generatedAt: new Date().toISOString(),
    assumptions: {
      task: path.join(ROOT, "docs", "codex-task-phase2d-rotate-attack.md"),
      reactCostSweep: path.join(ROOT, "docs", "baselines", "react-cost-sweep.md"),
      reactCostSweepReport: path.join(ROOT, "docs", "react-cost-sweep-report.md"),
      baselineV3: BASELINE_V3_MD_PATH,
      fixedConfiguration: {
        hp: "hybrid",
        hpCurve: HP_CURVES.hybrid,
        atk: "high",
        atkCurve: ATK_CURVES.high,
        distributionName: "lowmid",
        distribution: PHASE2A_DISTRIBUTIONS.lowmid,
        startManaFirst: START_MANA_FIRST,
        startManaSecond: START_MANA_SECOND,
      },
      runs: variants.map((variant) => ({
        runId: variant.runId,
        reactLevelName: variant.reactLevelName,
        reactCostCurve: variant.reactCostCurve,
        rotateAttackRule: variant.rotateAttackRule,
        destroyManaGain: variant.destroyManaGain,
        purpose: variant.purpose,
      })),
      rules: {
        rotateAttack:
          "When enabled, an attack reactivation may rotate one quarter-turn immediately before the attack for the same one reactivation cost, consuming both the attack slot and rotation slot.",
        rotateOnly:
          "Rotate-only behavior is left as the existing v3 engine behavior for R0a/R0b comparability; the new rotate-attack action itself is limited to one quarter-turn.",
        summonAttack: "Rotate-attack is not applied to summon attacks.",
        destroyedDefenderDoesNotCounter: true,
        ownerGainsManaWhenCreatureLeavesBoardToDiscard: "DESTROY_MANA_GAIN is run-specific.",
        items: "not implemented in this sweep",
      },
      measurementD: {
        depth: 6,
        method:
          "For each depth-6 returnable check, rerun restricted oracles from the same state. Attack-required disables attack-only and rotate-attack actions as the attack family; rotation-required disables rotate-only; unneeded disables all three reactivation choices; rotate-attack-required additionally disables only choice 2.",
      },
      seedPolicy: "All runs use the same seed sequence (seed + gameIndex * 9176) for paired comparison.",
      lifeTotal: LIFE_TOTAL,
      manaGain: 3,
      manaCap: MANA_CAP,
      maxHp: MAX_HP,
      weakPhysicalBonus: WEAK_BONUS,
      oracle: true,
      checkSearchDepth: 6,
      scoring: "not used; rows are reported in task order",
    },
    reproducibility: {
      command,
      repoHead: gitHead(),
      scriptPath: __filename,
      scriptSha256: sha256File(__filename),
      seed: args.seed,
      oracle: true,
      checkSearchDepth: 6,
      samplesPerVariant: args.phase2dSamples,
    },
    runs,
  };

  fs.writeFileSync(PHASE2D_OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  const resultJsonSha256 = sha256File(PHASE2D_OUT_PATH);
  fs.writeFileSync(PHASE2D_MD_PATH, phase2dMarkdown(output, { resultJsonSha256 }), "utf8");
  console.log(`\nWrote ${path.relative(ROOT, PHASE2D_OUT_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, PHASE2D_MD_PATH)}`);
}

function makeStandardManaHandicapVariants() {
  return [
    makePhase2dVariant({
      runId: "S1",
      reactLevelName: "standard",
      rotateAttackRule: false,
      destroyManaGain: 1,
      p0StartingMana: 3,
      p1StartingMana: 3,
      phase: "standard-mana-handicap",
      purpose: "No second-player starting mana handicap, no choice 2.",
    }),
    makePhase2dVariant({
      runId: "S2",
      reactLevelName: "standard",
      rotateAttackRule: true,
      destroyManaGain: 1,
      p0StartingMana: 3,
      p1StartingMana: 3,
      phase: "standard-mana-handicap",
      purpose: "No second-player starting mana handicap, with choice 2.",
    }),
    makePhase2dVariant({
      runId: "S3",
      reactLevelName: "standard",
      rotateAttackRule: true,
      destroyManaGain: 1,
      p0StartingMana: 3,
      p1StartingMana: 4,
      phase: "standard-mana-handicap",
      purpose: "Current second-player +1 starting mana handicap, with choice 2.",
    }),
    makePhase2dVariant({
      runId: "S4",
      reactLevelName: "standard",
      rotateAttackRule: false,
      destroyManaGain: 1,
      p0StartingMana: 3,
      p1StartingMana: 5,
      phase: "standard-mana-handicap",
      purpose: "Second-player +2 starting mana handicap, no choice 2.",
    }),
  ];
}

function loadPhase2dReferenceRun(runId) {
  if (!fs.existsSync(PHASE2D_OUT_PATH)) return null;
  const raw = JSON.parse(fs.readFileSync(PHASE2D_OUT_PATH, "utf8"));
  return (raw.runs ?? []).find((run) => run.variant?.runId === runId) ?? null;
}

function runStandardManaHandicap(args) {
  fs.mkdirSync(path.dirname(STANDARD_HANDICAP_OUT_PATH), { recursive: true });
  const variants = makeStandardManaHandicapVariants();
  const runs = runUnrankedVariantBatch(
    "standard mana handicap",
    variants,
    args.standardManaHandicapSamples,
    args.seed,
  );
  const command = "node scripts\\explore-stat-curves.cjs --standard-mana-handicap --seed 20260702";
  const referenceR3 = loadPhase2dReferenceRun("R3");
  const output = {
    generatedAt: new Date().toISOString(),
    assumptions: {
      task: path.join(ROOT, "docs", "codex-task-standard-mana-handicap.md"),
      phase2d: PHASE2D_MD_PATH,
      phase2dResults: PHASE2D_OUT_PATH,
      fixedConfiguration: {
        hp: "hybrid",
        hpCurve: HP_CURVES.hybrid,
        atk: "high",
        atkCurve: ATK_CURVES.high,
        reactLevelName: "standard",
        reactCostCurve: REACT_COST_SWEEP_CURVES.standard,
        distributionName: "lowmid",
        distribution: PHASE2A_DISTRIBUTIONS.lowmid,
        startManaFirst: 3,
        destroyManaGain: 1,
      },
      runs: variants.map((variant) => ({
        runId: variant.runId,
        p0StartingMana: variant.p0StartingMana,
        p1StartingMana: variant.p1StartingMana,
        secondPlayerHandicap: variant.p1StartingMana - variant.p0StartingMana,
        rotateAttackRule: variant.rotateAttackRule,
        destroyManaGain: variant.destroyManaGain,
        purpose: variant.purpose,
      })),
      reference: {
        source: PHASE2D_OUT_PATH,
        runId: "R3",
        note: "Phase2d R3 is standard / second-player +1 / no choice 2 / dm1 and is included as the requested reference row.",
      },
      rules: {
        rotateAttack:
          "When enabled, an attack reactivation may rotate one quarter-turn immediately before the attack for the same one reactivation cost, consuming both the attack slot and rotation slot.",
        rotationLimit: "once per creature per turn",
        destroyedDefenderDoesNotCounter: true,
        ownerGainsManaWhenCreatureLeavesBoardToDiscard: "DESTROY_MANA_GAIN=1 for all S runs",
        items: "not implemented in this sweep",
      },
      seedPolicy: "All runs use the same seed sequence (seed + gameIndex * 9176) for paired comparison.",
      lifeTotal: LIFE_TOTAL,
      manaGain: 3,
      manaCap: MANA_CAP,
      maxHp: MAX_HP,
      weakPhysicalBonus: WEAK_BONUS,
      oracle: true,
      checkSearchDepth: 6,
      scoring: "not used; rows are reported in task order",
    },
    reproducibility: {
      command,
      repoHead: gitHead(),
      scriptPath: __filename,
      scriptSha256: sha256File(__filename),
      seed: args.seed,
      oracle: true,
      checkSearchDepth: 6,
      samplesPerVariant: args.standardManaHandicapSamples,
    },
    referenceR3,
    runs,
  };

  fs.writeFileSync(STANDARD_HANDICAP_OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  const resultJsonSha256 = sha256File(STANDARD_HANDICAP_OUT_PATH);
  fs.writeFileSync(STANDARD_HANDICAP_MD_PATH, standardManaHandicapMarkdown(output, { resultJsonSha256 }), "utf8");
  console.log(`\nWrote ${path.relative(ROOT, STANDARD_HANDICAP_OUT_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, STANDARD_HANDICAP_MD_PATH)}`);
}

function makePhase2bVariant(name, itemCounts, note, baseVariant = makeBaselineV3CenterVariant(), phase = "phase2b-item-layer") {
  return {
    ...baseVariant,
    name,
    phase,
    itemCounts: { ...itemCounts },
    itemLayerNote: note,
  };
}

function makePhase2bVariants(baseVariant = makeBaselineV3CenterVariant(), phase = "phase2b-item-layer") {
  return [
    makePhase2bVariant(
      "B1_main_items_2-2-2-2",
      { removal: 2, economy: 2, buff: 2, draw: 2 },
      "Main item mix: two copies of each pure item archetype.",
      baseVariant,
      phase,
    ),
    makePhase2bVariant(
      "B2_removal_heavy_4-2-1-1",
      { removal: 4, economy: 2, buff: 1, draw: 1 },
      "Removal-heavy sensitivity run from the Phase2b task document.",
      baseVariant,
      phase,
    ),
    makePhase2bVariant(
      "B3_no_removal_0-3-3-2",
      { removal: 0, economy: 3, buff: 3, draw: 2 },
      "No-removal separation run from the Phase2b task document.",
      baseVariant,
      phase,
    ),
  ];
}

function loadBaselineV3Reference() {
  if (!fs.existsSync(BASELINE_V3_OUT_PATH)) return null;
  const raw = JSON.parse(fs.readFileSync(BASELINE_V3_OUT_PATH, "utf8"));
  return raw.center?.result ?? null;
}

function loadBaselineV3Robustness() {
  if (!fs.existsSync(BASELINE_V3_OUT_PATH)) return [];
  const raw = JSON.parse(fs.readFileSync(BASELINE_V3_OUT_PATH, "utf8"));
  return raw.robustness?.variants ?? [];
}

function loadPhase2bReferenceRun(id) {
  if (!fs.existsSync(PHASE2B_OUT_PATH)) return null;
  const raw = JSON.parse(fs.readFileSync(PHASE2B_OUT_PATH, "utf8"));
  return (raw.runs ?? []).find((run) => run.id === id) ?? null;
}

function runPhase2bItemLayer(args) {
  fs.mkdirSync(path.dirname(PHASE2B_OUT_PATH), { recursive: true });
  const [b1Variant, b2Variant, b3Variant] = makePhase2bVariants();
  const b1 = runVariantBatch("phase2b B1", [b1Variant], args.phase2bB1Samples, args.seed)[0];
  const b2 = runVariantBatch("phase2b B2", [b2Variant], args.phase2bB2Samples, args.seed)[0];
  const b3 = runVariantBatch("phase2b B3", [b3Variant], args.phase2bB3Samples, args.seed)[0];

  const command = "node scripts\\explore-stat-curves.cjs --phase2b-item-layer --seed 20260702";
  const output = {
    generatedAt: new Date().toISOString(),
    assumptions: {
      phase2bTask: path.join(ROOT, "docs", "codex-task-phase2b-item-layer.md"),
      ruleSpecSource: "RULE_SPEC.md was not present in the repository; applied the Phase2b task rulings and prior RULE_SPEC attachment rulings.",
      baselineV3: BASELINE_V3_MD_PATH,
      kpiDesign: path.join(ROOT, "docs", "kpi-design-pure-vanilla.md"),
      fixedConfiguration: {
        hp: "hybrid",
        hpCurve: HP_CURVES.hybrid,
        atk: "high",
        atkCurve: ATK_CURVES.high,
        react: "heavy",
        reactCurve: REACT_CURVES.heavy,
        distributionName: "lowmid",
        distribution: PHASE2A_DISTRIBUTIONS.lowmid,
        startManaFirst: START_MANA_FIRST,
        startManaSecond: START_MANA_SECOND,
        destroyManaGain: DESTROY_MANA_GAIN,
      },
      rules: {
        rotationLimit: "once per creature per turn",
        destroyedDefenderDoesNotCounter: true,
        ownerGainsManaWhenCreatureLeavesBoardToDiscard: true,
        itemTiming: "items are used only before summon; summon ends the main phase",
        usedItemsGoToDiscard: true,
        discardReshufflesWhenDeckIsEmpty: true,
      },
      itemDefinitions: PURE_ITEMS,
      itemRuns: Object.fromEntries(makePhase2bVariants().map((variant) => [variant.name, variant.itemCounts])),
      lifeTotal: LIFE_TOTAL,
      manaGain: 3,
      manaCap: MANA_CAP,
      maxHp: MAX_HP,
      weakPhysicalBonus: WEAK_BONUS,
      oracle: true,
      checkSearchDepth: 6,
      gateJudgement: "not made by this script; values are reported as decision material only",
    },
    reproducibility: {
      command,
      repoHead: gitHead(),
      scriptPath: __filename,
      scriptSha256: sha256File(__filename),
      seed: args.seed,
      oracle: true,
      checkSearchDepth: 6,
    },
    b0Reference: {
      source: BASELINE_V3_OUT_PATH,
      result: loadBaselineV3Reference(),
    },
    runs: [
      { id: "B1", samplesPerVariant: args.phase2bB1Samples, result: b1 },
      { id: "B2", samplesPerVariant: args.phase2bB2Samples, result: b2 },
      { id: "B3", samplesPerVariant: args.phase2bB3Samples, result: b3 },
    ],
  };

  fs.writeFileSync(PHASE2B_OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  const resultJsonSha256 = sha256File(PHASE2B_OUT_PATH);
  fs.writeFileSync(PHASE2B_MD_PATH, phase2bMarkdown(output, { resultJsonSha256 }), "utf8");
  console.log(`\nWrote ${path.relative(ROOT, PHASE2B_OUT_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, PHASE2B_MD_PATH)}`);
}

function runBaselineV31Freeze(args) {
  fs.mkdirSync(path.dirname(BASELINE_V31_OUT_PATH), { recursive: true });
  const centerVariant = makeBaselineV31CenterVariant();
  const center = runVariantBatch("baseline v3.1 center", [centerVariant], args.v31CenterSamples, args.seed)[0];
  const robustness = runVariantBatch(
    "baseline v3.1 robustness",
    makeV31RobustnessVariants(centerVariant),
    args.v31RobustnessSamples,
    args.seed,
  );
  const command = "node scripts\\explore-stat-curves.cjs --v31-freeze-and-items --seed 20260702";
  const output = {
    generatedAt: new Date().toISOString(),
    assumptions: {
      task: path.join(ROOT, "docs", "codex-task-v31-freeze-and-items.md"),
      adoptedSource: PHASE2D_MD_PATH,
      previousBaselineV3: BASELINE_V3_MD_PATH,
      chosenConfiguration: {
        hp: "hybrid",
        hpCurve: HP_CURVES.hybrid,
        atk: "high",
        atkCurve: ATK_CURVES.high,
        reactLevelName: "heavy",
        reactCostCurve: REACT_COST_SWEEP_CURVES.heavy,
        distributionName: "lowmid",
        distribution: PHASE2A_DISTRIBUTIONS.lowmid,
        startManaFirst: START_MANA_FIRST,
        startManaSecond: START_MANA_SECOND,
        destroyManaGain: DESTROY_MANA_GAIN,
        rotateAttackRule: true,
      },
      rules: {
        rotateAttack:
          "An attack reactivation may rotate one quarter-turn immediately before the attack for the same one reactivation cost, consuming both the attack slot and rotation slot.",
        rotateOnly: "Rotation remains once per creature per turn and costs the same as reactivation.",
        summonAttack: "Rotate-attack is not applied to summon attacks.",
        destroyedDefenderDoesNotCounter: true,
        ownerGainsManaWhenCreatureLeavesBoardToDiscard: true,
        items: "not implemented in the v3.1 pure-body freeze",
      },
      measurementAdditions: {
        failedCheckResponseWinRate:
          "For each player with at least one failed 4-check response in a game, record whether that player eventually won; reported beside check-return player win rate.",
      },
      seedPolicy: "Center and robustness runs use the v3 freeze seed sequence (seed + gameIndex * 9176).",
      lifeTotal: LIFE_TOTAL,
      manaGain: 3,
      manaCap: MANA_CAP,
      maxHp: MAX_HP,
      weakPhysicalBonus: WEAK_BONUS,
      oracle: true,
      checkSearchDepth: 6,
      gateJudgement: "not made by this script; values are reported as decision material only",
    },
    reproducibility: {
      command,
      repoHead: gitHead(),
      scriptPath: __filename,
      scriptSha256: sha256File(__filename),
      seed: args.seed,
      oracle: true,
      checkSearchDepth: 6,
      centerSamples: args.v31CenterSamples,
      robustnessSamples: args.v31RobustnessSamples,
    },
    v3Reference: {
      source: BASELINE_V3_OUT_PATH,
      result: loadBaselineV3Reference(),
      robustness: loadBaselineV3Robustness(),
    },
    center: {
      samplesPerVariant: args.v31CenterSamples,
      result: center,
    },
    robustness: {
      samplesPerVariant: args.v31RobustnessSamples,
      centerDistribution: distributionLabel(centerVariant.distribution),
      variants: robustness,
    },
  };

  fs.writeFileSync(BASELINE_V31_OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  const resultJsonSha256 = sha256File(BASELINE_V31_OUT_PATH);
  fs.writeFileSync(BASELINE_V31_MD_PATH, baselineV31Markdown(output, { resultJsonSha256 }), "utf8");
  console.log(`\nWrote ${path.relative(ROOT, BASELINE_V31_OUT_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, BASELINE_V31_MD_PATH)}`);
  return output;
}

function runPhase2bItemLayerV31(args, baselineV31Output) {
  fs.mkdirSync(path.dirname(PHASE2B_V31_OUT_PATH), { recursive: true });
  const baseVariant = makeBaselineV31CenterVariant();
  const [b1Variant, b2Variant, b3Variant] = makePhase2bVariants(baseVariant, "phase2b-item-layer-v31");
  const b1 = runVariantBatch("phase2b v3.1 B1", [b1Variant], args.v31ItemB1Samples, args.seed)[0];
  const b2 = runVariantBatch("phase2b v3.1 B2", [b2Variant], args.v31ItemB2Samples, args.seed)[0];
  const b3 = runVariantBatch("phase2b v3.1 B3", [b3Variant], args.v31ItemB3Samples, args.seed)[0];
  const command = "node scripts\\explore-stat-curves.cjs --v31-freeze-and-items --seed 20260702";
  const output = {
    generatedAt: new Date().toISOString(),
    assumptions: {
      task: path.join(ROOT, "docs", "codex-task-v31-freeze-and-items.md"),
      phase2bTask: path.join(ROOT, "docs", "codex-task-phase2b-item-layer.md"),
      baselineV31: BASELINE_V31_MD_PATH,
      oldPhase2b: PHASE2B_MD_PATH,
      fixedConfiguration: {
        hp: "hybrid",
        hpCurve: HP_CURVES.hybrid,
        atk: "high",
        atkCurve: ATK_CURVES.high,
        reactLevelName: "heavy",
        reactCostCurve: REACT_COST_SWEEP_CURVES.heavy,
        rotateAttackRule: true,
        distributionName: "lowmid",
        distribution: PHASE2A_DISTRIBUTIONS.lowmid,
        startManaFirst: START_MANA_FIRST,
        startManaSecond: START_MANA_SECOND,
        destroyManaGain: DESTROY_MANA_GAIN,
      },
      rules: {
        rotateAttack:
          "Choice 2 is enabled: rotate one quarter-turn immediately before an attack reactivation, consuming both rotation and attack slots.",
        rotationLimit: "once per creature per turn",
        destroyedDefenderDoesNotCounter: true,
        ownerGainsManaWhenCreatureLeavesBoardToDiscard: true,
        itemTiming: "items are used only before summon; summon ends the main phase",
        usedItemsGoToDiscard: true,
        discardReshufflesWhenDeckIsEmpty: true,
      },
      itemDefinitions: PURE_ITEMS,
      itemRuns: Object.fromEntries(makePhase2bVariants(baseVariant, "phase2b-item-layer-v31").map((variant) => [variant.name, variant.itemCounts])),
      measurementAdditions: {
        failedCheckResponseWinRate:
          "For each player with at least one failed 4-check response in a game, record whether that player eventually won; reported beside check-return player win rate.",
      },
      seedPolicy: "B1'/B2'/B3' use the same seed sequence as the v3.1 body baseline for paired comparison.",
      lifeTotal: LIFE_TOTAL,
      manaGain: 3,
      manaCap: MANA_CAP,
      maxHp: MAX_HP,
      weakPhysicalBonus: WEAK_BONUS,
      oracle: true,
      checkSearchDepth: 6,
      gateJudgement: "not made by this script; values are reported as decision material only",
    },
    reproducibility: {
      command,
      repoHead: gitHead(),
      scriptPath: __filename,
      scriptSha256: sha256File(__filename),
      seed: args.seed,
      oracle: true,
      checkSearchDepth: 6,
      b1Samples: args.v31ItemB1Samples,
      b2Samples: args.v31ItemB2Samples,
      b3Samples: args.v31ItemB3Samples,
    },
    v31BodyReference: {
      source: BASELINE_V31_OUT_PATH,
      result: baselineV31Output.center.result,
    },
    oldB1Reference: {
      source: PHASE2B_OUT_PATH,
      run: loadPhase2bReferenceRun("B1"),
    },
    runs: [
      { id: "B1'", samplesPerVariant: args.v31ItemB1Samples, result: b1 },
      { id: "B2'", samplesPerVariant: args.v31ItemB2Samples, result: b2 },
      { id: "B3'", samplesPerVariant: args.v31ItemB3Samples, result: b3 },
    ],
  };

  fs.writeFileSync(PHASE2B_V31_OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  const resultJsonSha256 = sha256File(PHASE2B_V31_OUT_PATH);
  fs.writeFileSync(PHASE2B_V31_MD_PATH, phase2bV31Markdown(output, { resultJsonSha256 }), "utf8");
  console.log(`\nWrote ${path.relative(ROOT, PHASE2B_V31_OUT_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, PHASE2B_V31_MD_PATH)}`);
  return output;
}

function runV31FreezeAndItems(args) {
  const baselineV31Output = runBaselineV31Freeze(args);
  runPhase2bItemLayerV31(args, baselineV31Output);
}

function makeReactValueForkVariant() {
  return {
    ...makeBaselineV31CenterVariant(),
    name: "react_value_forked_R1_v31_body",
    phase: "react-value-forked",
    oracle: false,
    checkSearchDepth: 6,
    reactNeedOracle: false,
    itemCounts: null,
  };
}

function runReactValueForked(args) {
  fs.mkdirSync(path.dirname(REACT_VALUE_FORKED_OUT_PATH), { recursive: true });
  const variant = makeReactValueForkVariant();
  const forks = [];
  const command = "node scripts\\explore-stat-curves.cjs --react-value-forked --seed 20260702";

  for (let i = 0; i < args.reactValueForkedSamples; i++) {
    const seed = (args.seed + i * 9176) >>> 0;
    const candidates = simulateReactValueForkBaseGame(i, seed, variant);
    for (let j = 0; j < candidates.length; j++) {
      forks.push(runReactValueFork(candidates[j], j));
    }
    if ((i + 1) % 100 === 0 || i + 1 === args.reactValueForkedSamples) {
      console.error(`react value forked: simulated ${i + 1}/${args.reactValueForkedSamples} base games, forks=${forks.length}`);
    }
  }

  const aggregation = aggregateReactValueForks(forks);
  const output = {
    generatedAt: new Date().toISOString(),
    assumptions: {
      task: path.join(ROOT, "docs", "codex-task-react-value-forked.md"),
      phase2d: PHASE2D_MD_PATH,
      configuration: {
        name: "R1 / v3.1 pure-body",
        hp: "hybrid",
        hpCurve: HP_CURVES.hybrid,
        atk: "high",
        atkCurve: ATK_CURVES.high,
        reactLevelName: "heavy",
        reactCostCurve: REACT_COST_SWEEP_CURVES.heavy,
        rotateAttackRule: true,
        distributionName: "lowmid",
        distribution: PHASE2A_DISTRIBUTIONS.lowmid,
        startManaFirst: START_MANA_FIRST,
        startManaSecond: START_MANA_SECOND,
        destroyManaGain: DESTROY_MANA_GAIN,
        items: "not implemented; 16 pure creatures only",
      },
      forkProtocol: {
        trigger:
          "At the post-begin-turn state, if the active player has at least one legal attack-family reactivation (choice 2 rotate-attack or choice 3 attack-only), record the state as a candidate.",
        sampling: "After each base game, sample at most two candidate states uniformly without replacement.",
        onWorld: "Force the highest-scoring attack-family reactivation once, then continue with normal AI.",
        offWorld: "For that one turn only, forbid attack-family reactivations in check-search and normal reactivation choice; rotate-only, items, summon, and later turns remain normal.",
        directChoice3World:
          "When the forced action is choice 2 and any legal attack-only action exists in the same state, run a third world that forces the best attack-only action.",
        randomHandling:
          "Forked worlds clone the state and PRNG state at the sampled candidate, so ON/OFF/direct worlds resume from the same random sequence.",
      },
      strata: {
        position: "behind/even/ahead by active controlled cells minus opponent controlled cells: <=-1 / 0 / >=1",
        check: "under_check if opponent has a pending 4-check against the active player, otherwise normal",
      },
      rules: {
        rotateAttack:
          "Choice 2 rotates one quarter-turn immediately before resolving attack, consumes both rotation and attack slots, costs one reactivation, and does not apply to summon attacks.",
        destroyedDefenderDoesNotCounter: true,
        ownerGainsManaWhenCreatureLeavesBoardToDiscard: true,
      },
      oracle: false,
      checkSearchDepth: 6,
      scoring: "not used; no adoption judgement is made",
    },
    reproducibility: {
      command,
      repoHead: gitHead(),
      scriptPath: __filename,
      scriptSha256: sha256File(__filename),
      seed: args.seed,
      baseGames: args.reactValueForkedSamples,
      oracle: false,
      checkSearchDepth: 6,
    },
    variant,
    aggregation,
    forks,
  };

  fs.writeFileSync(REACT_VALUE_FORKED_OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  const resultJsonSha256 = sha256File(REACT_VALUE_FORKED_OUT_PATH);
  fs.writeFileSync(REACT_VALUE_FORKED_MD_PATH, reactValueForkedMarkdown(output, { resultJsonSha256 }), "utf8");
  console.log(`\nWrote ${path.relative(ROOT, REACT_VALUE_FORKED_OUT_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, REACT_VALUE_FORKED_MD_PATH)}`);
}

function runReactValueForkedV2(args) {
  fs.mkdirSync(path.dirname(REACT_VALUE_FORKED_V2_OUT_PATH), { recursive: true });
  const variant = {
    ...makeReactValueForkVariant(),
    name: "react_value_forked_v2_R1_v31_body",
    phase: "react-value-forked-v2",
  };
  const forks = [];
  const command = "node scripts\\explore-stat-curves.cjs --react-value-forked-v2 --seed 20260702";

  for (let i = 0; i < args.reactValueForkedV2Samples; i++) {
    const seed = (args.seed + i * 9176) >>> 0;
    const candidates = simulateReactValueV2BaseGame(i, seed, variant);
    for (let j = 0; j < candidates.length; j++) {
      forks.push(runReactValueV2Fork(candidates[j], j));
    }
    if ((i + 1) % 100 === 0 || i + 1 === args.reactValueForkedV2Samples) {
      console.error(
        `react value forked v2: simulated ${i + 1}/${args.reactValueForkedV2Samples} base games, forks=${forks.length}`,
      );
    }
  }

  const aggregation = aggregateReactValueV2Forks(forks);
  const output = {
    generatedAt: new Date().toISOString(),
    status: aggregation.symmetry.pass ? "complete" : "stopped-symmetry-failed",
    assumptions: {
      task: path.join(ROOT, "docs", "codex-task-react-value-forked-v2.md"),
      discardedV1: REACT_VALUE_FORKED_MD_PATH,
      configuration: {
        name: "R1 / v3.1 pure-body",
        hpCurve: HP_CURVES.hybrid,
        atkCurve: ATK_CURVES.high,
        reactCostCurve: REACT_COST_SWEEP_CURVES.heavy,
        rotateAttackRule: true,
        distribution: PHASE2A_DISTRIBUTIONS.lowmid,
        startManaFirst: START_MANA_FIRST,
        startManaSecond: START_MANA_SECOND,
        destroyManaGain: DESTROY_MANA_GAIN,
        items: "none; 16 pure creatures only",
      },
      forkProtocol: {
        trigger: "Record only attack-family reactivations actually selected by the normal reactivation AI; check-return search plan steps are excluded.",
        sampling:
          "For games where both players have at least one recorded decision, sample one decision uniformly per player; unmatched games are excluded. This yields at most two matched decisions per base game.",
        onWorld: "Execute the exact selected choice 2/3 action, then resume normal AI.",
        offWorld:
          "At the same decision point, select one best alternative after excluding choice 2/3; execute it once, then resume normal AI. Summon or wait ends the current main phase.",
        randomHandling: "Clone state and PRNG at the decision point; ON and OFF resume from identical PRNG state.",
      },
      strata: {
        position: "behind/even/ahead by controlled-cell difference: <=-1 / 0 / >=1",
        check: "under_check when the opponent has a pending four-cell check; otherwise normal",
      },
      symmetryGate: {
        offWinRateToleranceFromHalf: 0.025,
        onPlusOffToleranceFromOne: 0.025,
      },
      oracle: false,
      checkSearchDepth: 6,
      scoring: "not used; no adoption judgement is made",
    },
    reproducibility: {
      command,
      repoHead: gitHead(),
      scriptPath: __filename,
      scriptSha256: sha256File(__filename),
      seed: args.seed,
      baseGames: args.reactValueForkedV2Samples,
      oracle: false,
      checkSearchDepth: 6,
    },
    variant,
    aggregation,
    forks,
  };

  fs.writeFileSync(REACT_VALUE_FORKED_V2_OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  const resultJsonSha256 = sha256File(REACT_VALUE_FORKED_V2_OUT_PATH);
  fs.writeFileSync(
    REACT_VALUE_FORKED_V2_MD_PATH,
    reactValueForkedV2Markdown(output, { resultJsonSha256 }),
    "utf8",
  );
  console.log(`\nWrote ${path.relative(ROOT, REACT_VALUE_FORKED_V2_OUT_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, REACT_VALUE_FORKED_V2_MD_PATH)}`);
  if (!aggregation.symmetry.pass) {
    console.error("react value forked v2: symmetry gate failed; report saved with stopped status");
    process.exitCode = 2;
  }
}

function runPhase2aFreezeA(args) {
  fs.mkdirSync(path.dirname(BASELINE_V3_OUT_PATH), { recursive: true });
  const command = "node scripts\\explore-stat-curves.cjs --phase2a-freeze-a --seed 20260702";
  const centerVariant = makeBaselineV3CenterVariant();
  const center = runVariantBatch("baseline v3 center", [centerVariant], args.phase2aCenterSamples, args.seed)[0];
  const robustness = runVariantBatch(
    "baseline v3 robustness",
    makeRobustnessVariants({ variant: centerVariant }),
    args.phase2aRobustnessSamples,
    args.seed,
  );
  const previousRobustnessComparison = comparePreviousRobustness(robustness);

  const reproducibility = {
    command,
    repoHead: gitHead(),
    scriptPath: __filename,
    scriptSha256: sha256File(__filename),
    seed: args.seed,
    oracle: true,
    checkSearchDepth: 6,
  };
  const output = {
    generatedAt: new Date().toISOString(),
    assumptions: {
      freezeTask: path.join(ROOT, "docs", "codex-task-phase2a-freeze.md"),
      previousPhase2a: path.join(ROOT, "docs", "baselines", "phase2a-main-search.md"),
      kpiDesign: path.join(ROOT, "docs", "kpi-design-pure-vanilla.md"),
      chosenPlan: "A",
      chosenConfiguration: {
        hp: "hybrid",
        hpCurve: HP_CURVES.hybrid,
        atk: "high",
        atkCurve: ATK_CURVES.high,
        react: "heavy",
        reactCurve: REACT_CURVES.heavy,
        distributionName: "lowmid",
        distribution: PHASE2A_DISTRIBUTIONS.lowmid,
        startManaFirst: START_MANA_FIRST,
        startManaSecond: START_MANA_SECOND,
        destroyManaGain: DESTROY_MANA_GAIN,
      },
      rules: {
        rotationLimit: "once per creature per turn",
        destroyedDefenderDoesNotCounter: true,
        ownerGainsManaWhenCreatureLeavesBoardToDiscard: true,
        pureBodyItems: "not implemented in this baseline",
      },
      lifeTotal: LIFE_TOTAL,
      manaGain: 3,
      manaCap: MANA_CAP,
      maxHp: MAX_HP,
      weakPhysicalBonus: WEAK_BONUS,
      boardAttributes: PURE_BOARD_ATTRS,
    },
    reproducibility,
    center: {
      samplesPerVariant: args.phase2aCenterSamples,
      result: center,
    },
    robustness: {
      samplesPerVariant: args.phase2aRobustnessSamples,
      centerDistribution: distributionLabel(centerVariant.distribution),
      variants: robustness,
      previousComparison: previousRobustnessComparison,
    },
  };

  fs.writeFileSync(BASELINE_V3_OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  const resultJsonSha256 = sha256File(BASELINE_V3_OUT_PATH);
  fs.writeFileSync(BASELINE_V3_MD_PATH, baselineV3Markdown(output, { resultJsonSha256 }), "utf8");
  console.log(`\nWrote ${path.relative(ROOT, BASELINE_V3_OUT_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, BASELINE_V3_MD_PATH)}`);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function comparePreviousRobustness(currentRobustness) {
  if (!fs.existsSync(PHASE2A_OUT_PATH)) return [];
  const previous = JSON.parse(fs.readFileSync(PHASE2A_OUT_PATH, "utf8"));
  const previousByName = new Map((previous.robustness?.variants ?? []).map((result) => [result.variant.name, result]));
  return currentRobustness
    .map((current) => {
      const prev = previousByName.get(current.variant.name);
      if (!prev) return null;
      const delta = robustnessDelta(current.summary, prev.summary);
      return {
        name: current.variant.name,
        current: pickRobustnessMetrics(current.summary),
        previous: pickRobustnessMetrics(prev.summary),
        delta,
        notable: isNotableRobustnessDelta(delta),
      };
    })
    .filter(Boolean);
}

function pickRobustnessMetrics(summary) {
  return {
    score: scoreSummary(summary),
    avgRounds: summary.avgRounds,
    p90Rounds: summary.p90Rounds,
    p0WinRate: summary.p0WinRate,
    check4ReturnRate: summary.check4ReturnRate,
    killsPerGame: summary.killsPerGame,
    summonStallRate: summary.summonStallRate,
  };
}

function robustnessDelta(current, previous) {
  return {
    avgRounds: current.avgRounds - previous.avgRounds,
    p90Rounds: current.p90Rounds - previous.p90Rounds,
    p0WinRate: current.p0WinRate - previous.p0WinRate,
    check4ReturnRate: current.check4ReturnRate - previous.check4ReturnRate,
    killsPerGame: current.killsPerGame - previous.killsPerGame,
    summonStallRate: current.summonStallRate - previous.summonStallRate,
  };
}

function isNotableRobustnessDelta(delta) {
  return (
    Math.abs(delta.avgRounds) >= 0.5 ||
    Math.abs(delta.p90Rounds) >= 1 ||
    Math.abs(delta.p0WinRate) >= 0.05 ||
    Math.abs(delta.check4ReturnRate) >= 0.03 ||
    Math.abs(delta.killsPerGame) >= 0.3 ||
    Math.abs(delta.summonStallRate) >= 0.03
  );
}

function baselineV3Markdown(output, { resultJsonSha256 }) {
  const lines = [];
  const center = output.center.result;
  lines.push("# Pure Vanilla Baseline v3");
  lines.push("");
  lines.push(`Date: ${output.generatedAt}`);
  lines.push("");
  lines.push("## Frozen Configuration");
  lines.push("");
  lines.push("| Item | Value |");
  lines.push("|---|---|");
  lines.push("| Plan | A |");
  lines.push("| HP curve | hybrid: 2/3/4/6/7/8 |");
  lines.push("| ATK curve | high: 1/2/2/3/3/4 |");
  lines.push("| Reactivation curve | heavy: 2/3/3/4/4/5 |");
  lines.push(`| Distribution | lowmid: ${distributionLabel(output.assumptions.chosenConfiguration.distribution)} |`);
  lines.push(`| START_MANA_FIRST | ${START_MANA_FIRST} |`);
  lines.push(`| START_MANA_SECOND | ${START_MANA_SECOND} |`);
  lines.push(`| DESTROY_MANA_GAIN | ${DESTROY_MANA_GAIN} |`);
  lines.push("| Items/effects | Not implemented in this pure-body baseline |");
  lines.push("");
  lines.push("## Reproduction");
  lines.push("");
  lines.push("```powershell");
  lines.push(output.reproducibility.command);
  lines.push("```");
  lines.push("");
  lines.push("| Artifact | Value |");
  lines.push("|---|---|");
  lines.push(`| Repo HEAD | \`${output.reproducibility.repoHead}\` |`);
  lines.push(`| Script SHA256 | \`${output.reproducibility.scriptSha256}\` |`);
  lines.push(`| Result JSON SHA256 | \`${resultJsonSha256}\` |`);
  lines.push(`| Result JSON | \`${BASELINE_V3_OUT_PATH}\` |`);
  lines.push(`| Seed | ${output.reproducibility.seed} |`);
  lines.push(`| Oracle / depth | yes / ${output.reproducibility.checkSearchDepth} |`);
  lines.push("");
  lines.push("## Rule Notes");
  lines.push("");
  lines.push("- Rotation is limited to once per creature per turn.");
  lines.push("- A creature destroyed during destruction judgment does not counterattack.");
  lines.push("- The owner of a creature sent from board to discard gains `DESTROY_MANA_GAIN`.");
  lines.push("- This is a pure-body baseline with no items, shapes, or effects. Average rounds are lower-side by design; Phase2b will test pure item inclusion with a target of roughly 8.5-10R.");
  lines.push("");
  lines.push("## Center Mirror");
  lines.push("");
  lines.push(`Samples: ${output.center.samplesPerVariant}`);
  lines.push("");
  lines.push(centerSummaryTable(center));
  lines.push("");
  lines.push("## Robustness Results");
  lines.push("");
  lines.push(`Samples per variant: ${output.robustness.samplesPerVariant}`);
  lines.push("");
  lines.push("Neighborhood rules match the Phase2a robustness test: 4 neighbor mirrors plus 8 cross matchups against the center distribution.");
  lines.push("");
  lines.push(phase2aTable(output.robustness.variants, false));
  lines.push("");
  lines.push("## Difference From Previous Plan B Robustness");
  lines.push("");
  lines.push("Previous robustness was run on the Phase2a secondary winner (`START_MANA_SECOND=3`, `DESTROY_MANA_GAIN=0`). The table below compares same-named robustness rows against this Plan A freeze run. `Notable` is a mechanical flag only, not a design judgment.");
  lines.push("");
  lines.push(previousRobustnessDiffTable(output.robustness.previousComparison));
  return `${lines.join("\n")}\n`;
}

function baselineV31Markdown(output, { resultJsonSha256 }) {
  const lines = [];
  const center = output.center.result;
  lines.push("# Pure Vanilla Baseline v3.1");
  lines.push("");
  lines.push(`Date: ${output.generatedAt}`);
  lines.push("");
  lines.push("## Frozen Configuration");
  lines.push("");
  lines.push("| Item | Value |");
  lines.push("|---|---|");
  lines.push("| Plan | R1 adoption path |");
  lines.push("| HP curve | hybrid: 2/3/4/6/7/8 |");
  lines.push("| ATK curve | high: 1/2/2/3/3/4 |");
  lines.push("| Reactivation curve | heavy: 2/3/3/3/3/4 |");
  lines.push("| Rotate-attack rule | enabled: one quarter-turn immediately before attack, consumes rotation and attack slots |");
  lines.push(`| Distribution | lowmid: ${distributionLabel(output.assumptions.chosenConfiguration.distribution)} |`);
  lines.push(`| START_MANA_FIRST | ${START_MANA_FIRST} |`);
  lines.push(`| START_MANA_SECOND | ${START_MANA_SECOND} |`);
  lines.push(`| DESTROY_MANA_GAIN | ${DESTROY_MANA_GAIN} |`);
  lines.push("| Items/effects | Not implemented in this pure-body baseline |");
  lines.push("");
  lines.push("## Reproduction");
  lines.push("");
  lines.push("```powershell");
  lines.push(output.reproducibility.command);
  lines.push("```");
  lines.push("");
  lines.push("| Artifact | Value |");
  lines.push("|---|---|");
  lines.push(`| Repo HEAD | \`${output.reproducibility.repoHead}\` |`);
  lines.push(`| Script SHA256 | \`${output.reproducibility.scriptSha256}\` |`);
  lines.push(`| Result JSON SHA256 | \`${resultJsonSha256}\` |`);
  lines.push(`| Result JSON | \`${BASELINE_V31_OUT_PATH}\` |`);
  lines.push(`| Center samples | ${output.reproducibility.centerSamples} |`);
  lines.push(`| Robustness samples / variant | ${output.reproducibility.robustnessSamples} |`);
  lines.push(`| Seed | ${output.reproducibility.seed} |`);
  lines.push(`| Oracle / depth | yes / ${output.reproducibility.checkSearchDepth} |`);
  lines.push("");
  lines.push("## Rule Notes");
  lines.push("");
  lines.push("- Choice 2 is enabled: an attack reactivation may rotate one quarter-turn immediately before resolving the attack for the same single reactivation cost.");
  lines.push("- Choice 2 consumes both the attack slot and rotation slot; it does not apply to summon attacks and adds no post-attack rotation.");
  lines.push("- Rotation remains limited to once per creature per turn.");
  lines.push("- A creature destroyed during destruction judgment does not counterattack.");
  lines.push("- The owner of a creature sent from board to discard gains `DESTROY_MANA_GAIN=1`.");
  lines.push("- New measurement: player-slots that failed at least one 4-check response are tracked with their eventual win rate.");
  lines.push("- No gate judgement or next action decision is made in this file.");
  lines.push("");
  lines.push("## Center Mirror");
  lines.push("");
  lines.push(`Samples: ${output.center.samplesPerVariant}`);
  lines.push("");
  lines.push(centerMaterialTable(center));
  lines.push("");
  lines.push("## v3 Difference Summary");
  lines.push("");
  lines.push(v31DeltaFromV3Table(output));
  lines.push("");
  lines.push("## Center Diagnostics");
  lines.push("");
  lines.push(phase2dKpiTable([center]));
  lines.push("");
  lines.push(phase2dWinnerLoserTable([center]));
  lines.push("");
  lines.push(phase2dCheckReturnWinTable([center]));
  lines.push("");
  lines.push(phase2dPlanTable([center]));
  lines.push("");
  lines.push(phase2dCheckResponseTable([center]));
  lines.push("");
  lines.push(phase2dNeedTable([center]));
  lines.push("");
  lines.push("## Robustness Results");
  lines.push("");
  lines.push(`Samples per variant: ${output.robustness.samplesPerVariant}`);
  lines.push("");
  lines.push("Neighborhood rules match the v3 freeze: 4 neighbor mirrors plus 8 cross matchups against the center distribution.");
  lines.push("");
  lines.push(phase2aTable(output.robustness.variants, false));
  lines.push("");
  lines.push("## Robustness Follow-Through");
  lines.push("");
  lines.push(checkFollowThroughTable([center, ...output.robustness.variants]));
  lines.push("");
  lines.push("## Robustness Difference From v3");
  lines.push("");
  lines.push(v31RobustnessDeltaFromV3Table(output));
  lines.push("");
  lines.push("## Output");
  lines.push("");
  lines.push(`JSON: \`${BASELINE_V31_OUT_PATH}\``);
  return `${lines.join("\n")}\n`;
}

function v31DeltaFromV3Table(output) {
  const prev = output.v3Reference?.result;
  if (!prev) return "_No v3 center result was available for comparison._";
  const current = output.center.result.summary;
  const old = prev.summary;
  const oldAttackFamily = old.attackReactivationsPerGame ?? 0;
  const oldAttackOnly = old.attackOnlyReactivationsPerGame ?? oldAttackFamily;
  const oldRotations = old.rotationsPerGame ?? 0;
  const oldChoice2 = old.rotateAttacksPerGame ?? 0;
  const rows = [
    ["Avg rounds", old.avgRounds.toFixed(2), current.avgRounds.toFixed(2), fmtDelta(current.avgRounds - old.avgRounds, 2)],
    ["P90 rounds", old.p90Rounds.toFixed(1), current.p90Rounds.toFixed(1), fmtDelta(current.p90Rounds - old.p90Rounds, 1)],
    ["Territory win", formatPct(old.territoryWinRate), formatPct(current.territoryWinRate), fmtDeltaPct(current.territoryWinRate - old.territoryWinRate)],
    ["Life win", formatPct(old.lifeWinRate), formatPct(current.lifeWinRate), fmtDeltaPct(current.lifeWinRate - old.lifeWinRate)],
    ["P0 win", formatPct(old.p0WinRate), formatPct(current.p0WinRate), fmtDeltaPct(current.p0WinRate - old.p0WinRate)],
    ["4-check return", formatPct(old.check4ReturnRate), formatPct(current.check4ReturnRate), fmtDeltaPct(current.check4ReturnRate - old.check4ReturnRate)],
    ["Kills/game", old.killsPerGame.toFixed(1), current.killsPerGame.toFixed(1), fmtDelta(current.killsPerGame - old.killsPerGame, 1)],
    ["Attack family/game", oldAttackFamily.toFixed(2), current.attackReactivationsPerGame.toFixed(2), fmtDelta(current.attackReactivationsPerGame - oldAttackFamily, 2)],
    ["Attack-only/game", oldAttackOnly.toFixed(2), current.attackOnlyReactivationsPerGame.toFixed(2), fmtDelta(current.attackOnlyReactivationsPerGame - oldAttackOnly, 2)],
    ["Rotate-only/game", oldRotations.toFixed(2), current.rotationsPerGame.toFixed(2), fmtDelta(current.rotationsPerGame - oldRotations, 2)],
    ["Choice2/game", oldChoice2.toFixed(2), current.rotateAttacksPerGame.toFixed(2), fmtDelta(current.rotateAttacksPerGame - oldChoice2, 2)],
    ["Summon stall", formatPct(old.summonStallRate), formatPct(current.summonStallRate), fmtDeltaPct(current.summonStallRate - old.summonStallRate)],
    ["Mana use", formatPct(old.manaUtilization), formatPct(current.manaUtilization), fmtDeltaPct(current.manaUtilization - old.manaUtilization)],
  ];
  const lines = ["| KPI | v3 | v3.1 | Delta |", "|---|---:|---:|---:|"];
  for (const [name, oldValue, currentValue, delta] of rows) {
    lines.push(`| ${name} | ${oldValue} | ${currentValue} | ${delta} |`);
  }
  return lines.join("\n");
}

function centerMaterialTable(result) {
  const s = result.summary;
  const rows = [
    ["Avg rounds", "reported", s.avgRounds.toFixed(2)],
    ["P90 rounds", "reported", s.p90Rounds.toFixed(1)],
    ["Territory win", "reported", formatPct(s.territoryWinRate)],
    ["Life win", "reported", formatPct(s.lifeWinRate)],
    ["Timeout", "reported", formatPct(s.timeoutRate)],
    ["P0 win", "reported", formatPct(s.p0WinRate)],
    ["4-check return", "reported", formatPct(s.check4ReturnRate)],
    ["Oracle realization", "reported", formatPct(s.check4OracleRealizationRate)],
    ["Kills/game", "reported", s.killsPerGame.toFixed(1)],
    ["Attack family/game", "attack-only + choice 2", s.attackReactivationsPerGame.toFixed(2)],
    ["Attack-only/game", "reported", s.attackOnlyReactivationsPerGame.toFixed(2)],
    ["Choice2/game", "reported", s.rotateAttacksPerGame.toFixed(2)],
    ["Rotate-only/game", "reported", s.rotationsPerGame.toFixed(2)],
    ["Weak kill", "reported", formatPct(s.weakKillRate)],
    ["Summon stall", "reported", formatPct(s.summonStallRate)],
    ["Mana utilization", "reported", formatPct(s.manaUtilization)],
    ["Board3 median", "reported", formatNullable(s.board3.medianRound)],
    ["Return-slot win", "reported", formatMaybePct(s.checkReturnPlayerWinRate)],
    ["Failed-slot win", "reported", formatMaybePct(s.checkFailedPlayerWinRate)],
    ["Deck reshuffle", "reported", formatPct(s.deckReshuffleGameRate)],
  ];
  const lines = ["| KPI | Role | Value |", "|---|---|---:|"];
  for (const [name, role, value] of rows) {
    lines.push(`| ${name} | ${role} | ${value} |`);
  }
  return lines.join("\n");
}

function checkFollowThroughTable(results) {
  const lines = [
    "| Row | Return slots/game | Return-slot win | Failed slots/game | Failed-slot win | Returned turns/game | Failed turns/game |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const result of results) {
    const s = result.summary;
    lines.push(
      `| ${result.variant.name} | ${s.checkReturnPlayerSlotsPerGame.toFixed(2)} | ${formatMaybePct(s.checkReturnPlayerWinRate)} | ${safeFixed(s.checkFailedPlayerSlotsPerGame, 2)} | ${formatMaybePct(s.checkFailedPlayerWinRate)} | ${s.checkResponseReturnedTurnsPerGame.toFixed(2)} | ${s.checkResponseFailedTurnsPerGame.toFixed(2)} |`,
    );
  }
  return lines.join("\n");
}

function v31RobustnessDeltaFromV3Table(output) {
  const previousByName = new Map((output.v3Reference?.robustness ?? []).map((result) => [result.variant.name, result]));
  if (previousByName.size === 0) return "_No v3 robustness result was available for comparison._";
  const lines = [
    "| Variant | dAvgR | dP90 | dP0 | d4Ret | dKills | dAtkFamily | dChoice2 | dStall | Notable |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---|",
  ];
  for (const current of output.robustness.variants) {
    const prev = previousByName.get(current.variant.name);
    if (!prev) continue;
    const c = current.summary;
    const p = prev.summary;
    const deltas = {
      avgRounds: c.avgRounds - p.avgRounds,
      p90Rounds: c.p90Rounds - p.p90Rounds,
      p0WinRate: c.p0WinRate - p.p0WinRate,
      check4ReturnRate: c.check4ReturnRate - p.check4ReturnRate,
      killsPerGame: c.killsPerGame - p.killsPerGame,
      attackReactivationsPerGame: c.attackReactivationsPerGame - p.attackReactivationsPerGame,
      rotateAttacksPerGame: c.rotateAttacksPerGame - (p.rotateAttacksPerGame ?? 0),
      summonStallRate: c.summonStallRate - p.summonStallRate,
    };
    const notable =
      Math.abs(deltas.avgRounds) >= 0.5 ||
      Math.abs(deltas.p90Rounds) >= 1 ||
      Math.abs(deltas.p0WinRate) >= 0.05 ||
      Math.abs(deltas.check4ReturnRate) >= 0.03 ||
      Math.abs(deltas.killsPerGame) >= 0.3 ||
      Math.abs(deltas.attackReactivationsPerGame) >= 0.3 ||
      Math.abs(deltas.summonStallRate) >= 0.03;
    lines.push(
      `| ${current.variant.name} | ${fmtDelta(deltas.avgRounds, 2)} | ${fmtDelta(deltas.p90Rounds, 1)} | ${fmtDeltaPct(deltas.p0WinRate)} | ${fmtDeltaPct(deltas.check4ReturnRate)} | ${fmtDelta(deltas.killsPerGame, 1)} | ${fmtDelta(deltas.attackReactivationsPerGame, 2)} | ${fmtDelta(deltas.rotateAttacksPerGame, 2)} | ${fmtDeltaPct(deltas.summonStallRate)} | ${notable ? "yes" : "no"} |`,
    );
  }
  return lines.length > 2 ? lines.join("\n") : "_No matching v3 robustness rows were available for comparison._";
}

function centerSummaryTable(result) {
  const s = result.summary;
  const rows = [
    ["Avg rounds", "7-10", s.avgRounds.toFixed(2), inBand(s.avgRounds, 7, 10)],
    ["P90 rounds", "<=14", s.p90Rounds.toFixed(1), s.p90Rounds <= 14],
    ["Territory win", ">=95%", formatPct(s.territoryWinRate), s.territoryWinRate >= 0.95],
    ["Timeout", "0%", formatPct(s.timeoutRate), s.timeoutRate === 0],
    ["P0 win", "50-53%", formatPct(s.p0WinRate), inBand(s.p0WinRate, 0.5, 0.53)],
    ["4-check return", "45-55%", formatPct(s.check4ReturnRate), inBand(s.check4ReturnRate, 0.45, 0.55)],
    ["Oracle realization", ">=95%", formatPct(s.check4OracleRealizationRate), s.check4OracleRealizationRate >= 0.95],
    ["Kills/game", "3.5-5", s.killsPerGame.toFixed(1), inBand(s.killsPerGame, 3.5, 5)],
    ["Attack reactivation/game", "2.5-4.5", s.attackReactivationsPerGame.toFixed(1), inBand(s.attackReactivationsPerGame, 2.5, 4.5)],
    ["Weak kill", ">=45%", formatPct(s.weakKillRate), s.weakKillRate >= 0.45],
    ["Stall turn", ">=20%", formatPct(s.summonStallRate), s.summonStallRate >= 0.2],
    ["Mana utilization", ">=87%", formatPct(s.manaUtilization), s.manaUtilization >= 0.87],
    ["Board3 median", "<=4R", formatNullable(s.board3.medianRound), s.board3.medianRound != null && s.board3.medianRound <= 4],
    ["Life win", "logged", formatPct(s.lifeWinRate), null],
    ["Rotations/game", "logged only", s.rotationsPerGame.toFixed(1), null],
    ["Deck reshuffle", "logged", formatPct(s.deckReshuffleGameRate), null],
  ];
  const lines = ["| KPI | Confirmed Band | Value | Status |", "|---|---:|---:|---|"];
  for (const [name, band, value, status] of rows) {
    const text = status == null ? "log" : status ? "inside" : "outside";
    lines.push(`| ${name} | ${band} | ${value} | ${text} |`);
  }
  return lines.join("\n");
}

function inBand(value, min, max) {
  return value >= min && value <= max;
}

function previousRobustnessDiffTable(comparisons) {
  if (comparisons.length === 0) return "_No previous robustness result was available for comparison._";
  const lines = [
    "| Variant | dAvgR | dP90 | dP0 | d4Ret | dKills | dStall | Notable |",
    "|---|---:|---:|---:|---:|---:|---:|---|",
  ];
  for (const row of comparisons) {
    const d = row.delta;
    lines.push(
      `| ${row.name} | ${fmtDelta(d.avgRounds, 2)} | ${fmtDelta(d.p90Rounds, 1)} | ${fmtDeltaPct(d.p0WinRate)} | ${fmtDeltaPct(d.check4ReturnRate)} | ${fmtDelta(d.killsPerGame, 1)} | ${fmtDeltaPct(d.summonStallRate)} | ${row.notable ? "yes" : "no"} |`,
    );
  }
  return lines.join("\n");
}

function reactValueLayerDefinitions() {
  return [
    { key: "behind/under_check", label: "劣勢 × 王手被弾中" },
    { key: "behind/normal", label: "劣勢 × 通常" },
    { key: "even/under_check", label: "互角 × 王手被弾中" },
    { key: "even/normal", label: "互角 × 通常" },
    { key: "ahead/under_check", label: "優勢 × 王手被弾中" },
    { key: "ahead/normal", label: "優勢 × 通常" },
  ];
}

function emptyReactValueStat() {
  return {
    n: 0,
    onWins: 0,
    offWins: 0,
    onRounds: 0,
    offRounds: 0,
    spontaneousUses: 0,
  };
}

function emptyReactValueDirectStat() {
  return {
    n: 0,
    choice2Wins: 0,
    choice3Wins: 0,
    choice2Rounds: 0,
    choice3Rounds: 0,
    spontaneousChoice2: 0,
    spontaneousChoice3: 0,
  };
}

function addReactValueStat(stat, fork, category) {
  stat.n += 1;
  if (fork.on.actorWon) stat.onWins += 1;
  if (fork.off.actorWon) stat.offWins += 1;
  stat.onRounds += fork.on.rounds;
  stat.offRounds += fork.off.rounds;
  if (spontaneousMatchesCategory(fork.spontaneousKind, category)) stat.spontaneousUses += 1;
}

function addReactValueDirectStat(stat, fork) {
  stat.n += 1;
  if (fork.on.actorWon) stat.choice2Wins += 1;
  if (fork.directChoice3.actorWon) stat.choice3Wins += 1;
  stat.choice2Rounds += fork.on.rounds;
  stat.choice3Rounds += fork.directChoice3.rounds;
  if (fork.spontaneousKind === "choice2") stat.spontaneousChoice2 += 1;
  if (fork.spontaneousKind === "choice3") stat.spontaneousChoice3 += 1;
}

function finalizeReactValueStat(stat) {
  return {
    ...stat,
    onWinRate: stat.n > 0 ? stat.onWins / stat.n : null,
    offWinRate: stat.n > 0 ? stat.offWins / stat.n : null,
    deltaWinRate: stat.n > 0 ? (stat.onWins - stat.offWins) / stat.n : null,
    avgOnRounds: stat.n > 0 ? stat.onRounds / stat.n : null,
    avgOffRounds: stat.n > 0 ? stat.offRounds / stat.n : null,
    spontaneousUseRate: stat.n > 0 ? stat.spontaneousUses / stat.n : null,
  };
}

function finalizeReactValueDirectStat(stat) {
  return {
    ...stat,
    choice2WinRate: stat.n > 0 ? stat.choice2Wins / stat.n : null,
    choice3WinRate: stat.n > 0 ? stat.choice3Wins / stat.n : null,
    deltaWinRate: stat.n > 0 ? (stat.choice2Wins - stat.choice3Wins) / stat.n : null,
    avgChoice2Rounds: stat.n > 0 ? stat.choice2Rounds / stat.n : null,
    avgChoice3Rounds: stat.n > 0 ? stat.choice3Rounds / stat.n : null,
    spontaneousChoice2Rate: stat.n > 0 ? stat.spontaneousChoice2 / stat.n : null,
    spontaneousChoice3Rate: stat.n > 0 ? stat.spontaneousChoice3 / stat.n : null,
  };
}

function aggregateReactValueForks(forks) {
  const categories = ["combined", "choice2", "choice3"];
  const layers = reactValueLayerDefinitions();
  const byCategory = Object.fromEntries(categories.map((category) => [category, emptyReactValueStat()]));
  const byCategoryLayer = Object.fromEntries(
    categories.map((category) => [
      category,
      Object.fromEntries(layers.map((layer) => [layer.key, emptyReactValueStat()])),
    ]),
  );
  const direct = emptyReactValueDirectStat();
  const directByLayer = Object.fromEntries(layers.map((layer) => [layer.key, emptyReactValueDirectStat()]));

  for (const fork of forks) {
    addReactValueStat(byCategory.combined, fork, "combined");
    addReactValueStat(byCategoryLayer.combined[fork.layerKey], fork, "combined");

    if (fork.forcedKind === "choice2" || fork.forcedKind === "choice3") {
      addReactValueStat(byCategory[fork.forcedKind], fork, fork.forcedKind);
      addReactValueStat(byCategoryLayer[fork.forcedKind][fork.layerKey], fork, fork.forcedKind);
    }

    if (fork.forcedKind === "choice2" && fork.directChoice3) {
      addReactValueDirectStat(direct, fork);
      addReactValueDirectStat(directByLayer[fork.layerKey], fork);
    }
  }

  return {
    totalForks: forks.length,
    directChoice2VsChoice3Forks: direct.n,
    categories: Object.fromEntries(categories.map((category) => [category, finalizeReactValueStat(byCategory[category])])),
    byLayer: Object.fromEntries(
      categories.map((category) => [
        category,
        Object.fromEntries(layers.map((layer) => [layer.key, finalizeReactValueStat(byCategoryLayer[category][layer.key])])),
      ]),
    ),
    directChoice2VsChoice3: finalizeReactValueDirectStat(direct),
    directChoice2VsChoice3ByLayer: Object.fromEntries(
      layers.map((layer) => [layer.key, finalizeReactValueDirectStat(directByLayer[layer.key])]),
    ),
  };
}

function reactValueForkedMarkdown(output, { resultJsonSha256 }) {
  const lines = [];
  lines.push("# Reactivation Value Forked Comparison");
  lines.push("");
  lines.push(`Date: ${output.generatedAt}`);
  lines.push("");
  lines.push("## Reproduction");
  lines.push("");
  lines.push("```powershell");
  lines.push(output.reproducibility.command);
  lines.push("```");
  lines.push("");
  lines.push("| Artifact | Value |");
  lines.push("|---|---|");
  lines.push(`| Repo HEAD | \`${output.reproducibility.repoHead}\` |`);
  lines.push(`| Script SHA256 | \`${output.reproducibility.scriptSha256}\` |`);
  lines.push(`| Result JSON SHA256 | \`${resultJsonSha256}\` |`);
  lines.push(`| Result JSON | \`${REACT_VALUE_FORKED_OUT_PATH}\` |`);
  lines.push(`| Base games | ${output.reproducibility.baseGames} |`);
  lines.push(`| Fork samples | ${output.aggregation.totalForks} |`);
  lines.push(`| Seed | ${output.reproducibility.seed} |`);
  lines.push(`| Oracle / check-search depth | no / ${output.reproducibility.checkSearchDepth} |`);
  lines.push("");
  lines.push("## Implementation Notes");
  lines.push("");
  lines.push("- Configuration is fixed to R1/v3.1: heavy reactivation cost `2/3/3/3/3/4`, choice 2 rotate-attack enabled, 16 pure creatures, no items.");
  lines.push("- Candidate states are captured after `beginTurn`, before check-search, reactivation, item use, or summon.");
  lines.push("- A candidate requires at least one legal attack-family reactivation: choice 2 rotate-attack or choice 3 attack-only. Rotate-only is not a trigger.");
  lines.push("- Each base game stores all candidates and then samples at most two uniformly without replacement.");
  lines.push("- ON forces the highest-scoring attack-family reactivation once, then returns to normal AI. OFF forbids choice 2 and choice 3 for that one turn only, including check-search.");
  lines.push("- Forked worlds clone both game state and PRNG state at the sampled point, so paired worlds resume from the same random sequence.");
  lines.push("- Oracle metrics are omitted for this task; depth 6 check-return search remains active.");
  lines.push("- No adoption judgement is made here.");
  lines.push("");
  lines.push("## Overall");
  lines.push("");
  lines.push(reactValueOverallTable(output.aggregation));
  lines.push("");
  lines.push("## Layer Counts");
  lines.push("");
  lines.push(reactValueLayerCountTable(output.aggregation));
  lines.push("");
  lines.push("## ②+③ Combined By Layer");
  lines.push("");
  lines.push(reactValueLayerTable(output.aggregation, "combined"));
  lines.push("");
  lines.push("## ② Only By Layer");
  lines.push("");
  lines.push(reactValueLayerTable(output.aggregation, "choice2"));
  lines.push("");
  lines.push("## ③ Only By Layer");
  lines.push("");
  lines.push(reactValueLayerTable(output.aggregation, "choice3"));
  lines.push("");
  lines.push("## ② vs ③ Direct Comparison");
  lines.push("");
  lines.push("Rows only include states where choice 2 was the forced best action and at least one legal attack-only action also existed in the same state.");
  lines.push("");
  lines.push(reactValueDirectTable(output.aggregation));
  lines.push("");
  lines.push("## Output");
  lines.push("");
  lines.push(`JSON: \`${REACT_VALUE_FORKED_OUT_PATH}\``);
  return `${lines.join("\n")}\n`;
}

function reactValueOverallTable(aggregation) {
  const lines = [
    "| Category | n | ON win | OFF win | Δ ON-OFF | AvgR ON | AvgR OFF | Normal AI use |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const category of ["combined", "choice2", "choice3"]) {
    lines.push(reactValueStatRow(actionKindLabel(category), aggregation.categories[category]));
  }
  return lines.join("\n");
}

function reactValueLayerCountTable(aggregation) {
  const lines = [
    "| Layer | ②+③ n | ② n | ③ n | ②vs③ direct n |",
    "|---|---:|---:|---:|---:|",
  ];
  for (const layer of reactValueLayerDefinitions()) {
    lines.push(
      `| ${layer.label} | ${aggregation.byLayer.combined[layer.key].n} | ${aggregation.byLayer.choice2[layer.key].n} | ${aggregation.byLayer.choice3[layer.key].n} | ${aggregation.directChoice2VsChoice3ByLayer[layer.key].n} |`,
    );
  }
  return lines.join("\n");
}

function reactValueLayerTable(aggregation, category) {
  const lines = [
    "| Layer | n | ON win | OFF win | Δ ON-OFF | AvgR ON | AvgR OFF | Normal AI use |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const layer of reactValueLayerDefinitions()) {
    lines.push(reactValueStatRow(layer.label, aggregation.byLayer[category][layer.key]));
  }
  return lines.join("\n");
}

function reactValueStatRow(label, stat) {
  return `| ${label} | ${stat.n} | ${formatOptionalPct(stat.onWinRate)} | ${formatOptionalPct(stat.offWinRate)} | ${formatOptionalDeltaPct(stat.deltaWinRate)} | ${formatOptionalNumber(stat.avgOnRounds, 2)} | ${formatOptionalNumber(stat.avgOffRounds, 2)} | ${formatOptionalPct(stat.spontaneousUseRate)} |`;
}

function reactValueDirectTable(aggregation) {
  const lines = [
    "| Layer | n | ② win | ③ win | Δ ②-③ | AvgR ② | AvgR ③ | AI chose ② | AI chose ③ |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    reactValueDirectRow("Overall", aggregation.directChoice2VsChoice3),
  ];
  for (const layer of reactValueLayerDefinitions()) {
    lines.push(reactValueDirectRow(layer.label, aggregation.directChoice2VsChoice3ByLayer[layer.key]));
  }
  return lines.join("\n");
}

function reactValueDirectRow(label, stat) {
  return `| ${label} | ${stat.n} | ${formatOptionalPct(stat.choice2WinRate)} | ${formatOptionalPct(stat.choice3WinRate)} | ${formatOptionalDeltaPct(stat.deltaWinRate)} | ${formatOptionalNumber(stat.avgChoice2Rounds, 2)} | ${formatOptionalNumber(stat.avgChoice3Rounds, 2)} | ${formatOptionalPct(stat.spontaneousChoice2Rate)} | ${formatOptionalPct(stat.spontaneousChoice3Rate)} |`;
}

function formatOptionalPct(value) {
  return typeof value === "number" ? formatPct(value) : "-";
}

function formatOptionalDeltaPct(value) {
  return typeof value === "number" ? fmtDeltaPct(value) : "-";
}

function formatOptionalNumber(value, digits = 2) {
  return typeof value === "number" ? value.toFixed(digits) : "-";
}

function emptyReactValueV2Stat() {
  return {
    n: 0,
    onWins: 0,
    offWins: 0,
    onDraws: 0,
    offDraws: 0,
    onRounds: 0,
    offRounds: 0,
    offAlternatives: {},
    sources: {},
  };
}

function addReactValueV2Stat(stat, fork) {
  stat.n += 1;
  if (fork.on.actorWon) stat.onWins += 1;
  if (fork.off.actorWon) stat.offWins += 1;
  if (fork.on.winner !== 0 && fork.on.winner !== 1) stat.onDraws += 1;
  if (fork.off.winner !== 0 && fork.off.winner !== 1) stat.offDraws += 1;
  stat.onRounds += fork.on.rounds;
  stat.offRounds += fork.off.rounds;
  const alternative = fork.offAlternative.kind;
  stat.offAlternatives[alternative] = (stat.offAlternatives[alternative] ?? 0) + 1;
  stat.sources[fork.source] = (stat.sources[fork.source] ?? 0) + 1;
}

function finalizeReactValueV2Stat(stat) {
  const offAlternativeRates = Object.fromEntries(
    Object.entries(stat.offAlternatives).map(([key, value]) => [key, stat.n > 0 ? value / stat.n : null]),
  );
  return {
    ...stat,
    onWinRate: stat.n > 0 ? stat.onWins / stat.n : null,
    offWinRate: stat.n > 0 ? stat.offWins / stat.n : null,
    deltaWinRate: stat.n > 0 ? (stat.onWins - stat.offWins) / stat.n : null,
    onDrawRate: stat.n > 0 ? stat.onDraws / stat.n : null,
    offDrawRate: stat.n > 0 ? stat.offDraws / stat.n : null,
    avgOnRounds: stat.n > 0 ? stat.onRounds / stat.n : null,
    avgOffRounds: stat.n > 0 ? stat.offRounds / stat.n : null,
    offAlternativeRates,
  };
}

function reactValueV2Symmetry(forks, combined) {
  let onOnly = 0;
  let offOnly = 0;
  let bothWin = 0;
  let bothLose = 0;
  for (const fork of forks) {
    if (fork.on.actorWon && fork.off.actorWon) bothWin += 1;
    else if (fork.on.actorWon) onOnly += 1;
    else if (fork.off.actorWon) offOnly += 1;
    else bothLose += 1;
  }
  const offDeviation = combined.offWinRate == null ? null : Math.abs(combined.offWinRate - 0.5);
  const sum = combined.onWinRate == null || combined.offWinRate == null
    ? null
    : combined.onWinRate + combined.offWinRate;
  const sumDeviation = sum == null ? null : Math.abs(sum - 1);
  return {
    n: forks.length,
    onWinRate: combined.onWinRate,
    offWinRate: combined.offWinRate,
    onPlusOffWinRate: sum,
    offDeviationFromHalf: offDeviation,
    onPlusOffDeviationFromOne: sumDeviation,
    tolerance: 0.025,
    pass: forks.length > 0 && offDeviation <= 0.025 && sumDeviation <= 0.025,
    pairedOutcomes: { onOnly, offOnly, bothWin, bothLose },
  };
}

function aggregateReactValueV2Forks(forks) {
  const categories = ["combined", "choice2", "choice3"];
  const layers = reactValueLayerDefinitions();
  const rawCategories = Object.fromEntries(categories.map((category) => [category, emptyReactValueV2Stat()]));
  const rawLayers = Object.fromEntries(
    categories.map((category) => [
      category,
      Object.fromEntries(layers.map((layer) => [layer.key, emptyReactValueV2Stat()])),
    ]),
  );

  for (const fork of forks) {
    addReactValueV2Stat(rawCategories.combined, fork);
    addReactValueV2Stat(rawLayers.combined[fork.layerKey], fork);
    addReactValueV2Stat(rawCategories[fork.selectedKind], fork);
    addReactValueV2Stat(rawLayers[fork.selectedKind][fork.layerKey], fork);
  }

  const categoryStats = Object.fromEntries(
    categories.map((category) => [category, finalizeReactValueV2Stat(rawCategories[category])]),
  );
  const byLayer = Object.fromEntries(
    categories.map((category) => [
      category,
      Object.fromEntries(
        layers.map((layer) => [layer.key, finalizeReactValueV2Stat(rawLayers[category][layer.key])]),
      ),
    ]),
  );
  return {
    totalForks: forks.length,
    symmetry: reactValueV2Symmetry(forks, categoryStats.combined),
    categories: categoryStats,
    byLayer,
  };
}

function reactValueForkedV2Markdown(output, { resultJsonSha256 }) {
  const { symmetry } = output.aggregation;
  const lines = [
    "# 再命令の損得計測 v2（対称fork）",
    "",
    `Date: ${output.generatedAt}`,
    "",
    "## 対称性検証",
    "",
    "| 判定 | n | ON勝率 | OFF勝率 | ON+OFF | OFFの50%差 | 合計の100%差 |",
    "|---|---:|---:|---:|---:|---:|---:|",
    `| ${symmetry.pass ? "PASS" : "FAIL - 集計停止"} | ${symmetry.n} | ${formatOptionalPct(symmetry.onWinRate)} | ${formatOptionalPct(symmetry.offWinRate)} | ${formatOptionalPct(symmetry.onPlusOffWinRate)} | ${formatOptionalDeltaPct(symmetry.offDeviationFromHalf)} | ${formatOptionalDeltaPct(symmetry.onPlusOffDeviationFromOne)} |`,
    "",
    "許容差はOFF勝率50%およびON+OFF=100%から各2.5pt。FAILの場合は以降の値を採用判断に使わない。",
    "",
    "## 再現情報",
    "",
    "```powershell",
    output.reproducibility.command,
    "```",
    "",
    "| Artifact | Value |",
    "|---|---|",
    `| Status | \`${output.status}\` |`,
    `| Repo HEAD | \`${output.reproducibility.repoHead}\` |`,
    `| Script SHA256 | \`${output.reproducibility.scriptSha256}\` |`,
    `| Result JSON SHA256 | \`${resultJsonSha256}\` |`,
    `| Base games | ${output.reproducibility.baseGames} |`,
    `| Fork samples | ${output.aggregation.totalForks} |`,
    `| Seed | ${output.reproducibility.seed} |`,
    `| Oracle / check-search depth | no / ${output.reproducibility.checkSearchDepth} |`,
    "",
    "## 実装ノート",
    "",
    "- R1/v3.1固定: HP hybrid、ATK high、再命令heavy `2/3/3/3/3/4`、回転攻撃あり、式神16枚、霊具なし。",
    "- 通常の再命令AIが実際に②回転攻撃・③攻撃を選んだ直前だけを候補化した。王手返答探索の計画手は別の意思決定器なので対象外。",
    "- 両プレイヤーに候補がある試合だけを使い、各プレイヤーの候補から1局面ずつ一様抽出した。1試合2局面の対応抽出により、元対局を再現するONの無条件勝率は構造上50%になる。",
    "- ONは選択済みの同じ手を実行。OFFは同じ状態で②③を除外し、王手中は制限付き返答探索、通常時は①回転→霊具→召喚→待機の既存優先順で次善手を1手選ぶ。",
    "- 次善手が①回転または霊具なら、その1手後から通常AIへ戻る。召喚または待機ならそのメインフェイズを終了する。",
    "- 分岐状態とPRNG内部状態を複製し、両世界を同一乱数系列から完走した。",
    "- v1は全合法局面でONだけを強制し、OFFだけを制約下で再最適化した非対称比較だったため破棄。本v2はAIが実使用した局面に限定し、両世界の差を最初の1手に揃えた。",
  ];

  if (!symmetry.pass) {
    lines.push("", "## 停止理由", "", "対称性ゲートを外れたため、層別結果の報告を停止した。実装を再確認して再実行すること。");
    return `${lines.join("\n")}\n`;
  }

  lines.push("", "## 全体", "", reactValueV2OverallTable(output.aggregation));
  lines.push("", "## 層別n", "", reactValueV2LayerCountTable(output.aggregation));
  for (const category of ["combined", "choice2", "choice3"]) {
    lines.push("", `## ${actionKindLabel(category)} 層別`, "", reactValueV2LayerTable(output.aggregation, category));
  }
  lines.push("", "## OFF代替手の内訳", "", reactValueV2AlternativeTable(output.aggregation));
  lines.push("", "## 出力", "", `JSON: \`${REACT_VALUE_FORKED_V2_OUT_PATH}\``);
  return `${lines.join("\n")}\n`;
}

function reactValueV2OverallTable(aggregation) {
  const lines = [
    "| 種別 | n | ON勝率 | OFF勝率 | Δ ON-OFF | 平均R ON | 平均R OFF |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const category of ["combined", "choice2", "choice3"]) {
    lines.push(reactValueV2StatRow(actionKindLabel(category), aggregation.categories[category]));
  }
  return lines.join("\n");
}

function reactValueV2LayerCountTable(aggregation) {
  const lines = ["| 層 | ②+③ n | ② n | ③ n |", "|---|---:|---:|---:|"];
  for (const layer of reactValueLayerDefinitions()) {
    lines.push(`| ${layer.label} | ${aggregation.byLayer.combined[layer.key].n} | ${aggregation.byLayer.choice2[layer.key].n} | ${aggregation.byLayer.choice3[layer.key].n} |`);
  }
  return lines.join("\n");
}

function reactValueV2LayerTable(aggregation, category) {
  const lines = [
    "| 層 | n | ON勝率 | OFF勝率 | Δ ON-OFF | 平均R ON | 平均R OFF |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const layer of reactValueLayerDefinitions()) {
    lines.push(reactValueV2StatRow(layer.label, aggregation.byLayer[category][layer.key]));
  }
  return lines.join("\n");
}

function reactValueV2StatRow(label, stat) {
  return `| ${label} | ${stat.n} | ${formatOptionalPct(stat.onWinRate)} | ${formatOptionalPct(stat.offWinRate)} | ${formatOptionalDeltaPct(stat.deltaWinRate)} | ${formatOptionalNumber(stat.avgOnRounds)} | ${formatOptionalNumber(stat.avgOffRounds)} |`;
}

function reactValueV2AlternativeTable(aggregation) {
  const kinds = ["rotate", "summon", "item", "wait"];
  const lines = [
    "| 種別 / 層 | n | ①回転 | 召喚 | 霊具 | 待機 |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const category of ["combined", "choice2", "choice3"]) {
    lines.push(reactValueV2AlternativeRow(actionKindLabel(category), aggregation.categories[category], kinds));
    for (const layer of reactValueLayerDefinitions()) {
      lines.push(reactValueV2AlternativeRow(`${actionKindLabel(category)} / ${layer.label}`, aggregation.byLayer[category][layer.key], kinds));
    }
  }
  return lines.join("\n");
}

function reactValueV2AlternativeRow(label, stat, kinds) {
  const values = kinds.map((kind) => {
    const count = stat.offAlternatives[kind] ?? 0;
    const rate = stat.n > 0 ? count / stat.n : null;
    return `${count} (${formatOptionalPct(rate)})`;
  });
  return `| ${label} | ${stat.n} | ${values.join(" | ")} |`;
}

function reactCostSweepMarkdown(output, { resultJsonSha256 }) {
  const lines = [];
  lines.push("# Reactivation Cost Sweep");
  lines.push("");
  lines.push(`Date: ${output.generatedAt}`);
  lines.push("");
  lines.push("## Reproduction");
  lines.push("");
  lines.push("```powershell");
  lines.push(output.reproducibility.command);
  lines.push("```");
  lines.push("");
  lines.push("| Artifact | Value |");
  lines.push("|---|---|");
  lines.push(`| Repo HEAD | \`${output.reproducibility.repoHead}\` |`);
  lines.push(`| Script SHA256 | \`${output.reproducibility.scriptSha256}\` |`);
  lines.push(`| Result JSON SHA256 | \`${resultJsonSha256}\` |`);
  lines.push(`| Result JSON | \`${REACT_SWEEP_OUT_PATH}\` |`);
  lines.push(`| Samples / variant | ${output.reproducibility.samplesPerVariant} |`);
  lines.push(`| Seed | ${output.reproducibility.seed} |`);
  lines.push(`| Oracle / depth | yes / ${output.reproducibility.checkSearchDepth} |`);
  lines.push("");
  lines.push("## Implementation Notes");
  lines.push("");
  lines.push("- All v3 baseline values are fixed except the reactivation/rotation cost curve.");
  lines.push("- Rotation cost is always the same as attack reactivation cost, and each creature may rotate at most once per turn.");
  lines.push("- Measurement C records attack reactivations and rotations used during the turn that responds to a pending 4-check, then splits those counts by whether the check was returned.");
  lines.push("- Measurement D first requires the normal depth-6 return plan to exist. From that same state, the oracle is rerun with attack reactivation disabled, rotation disabled, and both disabled. The resulting classification is therefore independent of the default search order that tries summon plans first.");
  lines.push("- All four cost levels use the same seed sequence (`seed + gameIndex * 9176`) so deltas against heavy+ are paired comparisons.");
  lines.push("- No score ranking or adoption judgement is made here.");
  lines.push("");
  lines.push("## KPI Comparison");
  lines.push("");
  lines.push(reactSweepKpiTable(output.runs));
  lines.push("");
  lines.push("## B. Check Return Plan Mix");
  lines.push("");
  lines.push(reactSweepPlanTable(output.runs));
  lines.push("");
  lines.push("## C. Reactivation Use During Check Response");
  lines.push("");
  lines.push(reactSweepCheckResponseTable(output.runs));
  lines.push("");
  lines.push("## D. Reactivation Necessity Oracle");
  lines.push("");
  lines.push(reactSweepNeedTable(output.runs));
  lines.push("");
  lines.push("## Output");
  lines.push("");
  lines.push(`JSON: \`${REACT_SWEEP_OUT_PATH}\``);
  return `${lines.join("\n")}\n`;
}

function reactSweepControl(runs) {
  return runs.find((run) => run.variant.reactLevelName === "heavyPlus") ?? runs[runs.length - 1];
}

function reactSweepKpiTable(runs) {
  const control = reactSweepControl(runs).summary;
  const lines = [
    "| Level | Curve | AvgR | dAvgR | P90 | dP90 | Terr | P0 | dP0 | 4Ret | d4Ret | Kills | dKills | AtkReact | dAtk | Rot | dRot | RotShare | Unused | Stall | ManaUse |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const run of runs) {
    const s = run.summary;
    lines.push(
      `| ${reactSweepLevelLabel(run.variant.reactLevelName)} | ${reactCurveLabel(run.variant.reactCostCurve)} | ${s.avgRounds.toFixed(2)} | ${fmtDelta(s.avgRounds - control.avgRounds, 2)} | ${s.p90Rounds.toFixed(1)} | ${fmtDelta(s.p90Rounds - control.p90Rounds, 1)} | ${formatPct(s.territoryWinRate)} | ${formatPct(s.p0WinRate)} | ${fmtDeltaPct(s.p0WinRate - control.p0WinRate)} | ${formatPct(s.check4ReturnRate)} | ${fmtDeltaPct(s.check4ReturnRate - control.check4ReturnRate)} | ${s.killsPerGame.toFixed(1)} | ${fmtDelta(s.killsPerGame - control.killsPerGame, 1)} | ${s.attackReactivationsPerGame.toFixed(2)} | ${fmtDelta(s.attackReactivationsPerGame - control.attackReactivationsPerGame, 2)} | ${s.rotationsPerGame.toFixed(2)} | ${fmtDelta(s.rotationsPerGame - control.rotationsPerGame, 2)} | ${formatPct(s.rotationShare)} | ${formatPct(s.reactivationUnusedRate)} | ${formatPct(s.summonStallRate)} | ${formatPct(s.manaUtilization)} |`,
    );
  }
  return lines.join("\n");
}

function reactSweepPlanTable(runs) {
  const lines = [
    "| Level | Check plans/game | Summon plan | Attack react plan | Rotation plan | Multi-step | Avg steps |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const run of runs) {
    const s = run.summary;
    lines.push(
      `| ${reactSweepLevelLabel(run.variant.reactLevelName)} | ${s.checkSearchPlansPerGame.toFixed(2)} | ${planCell(s.checkSearchSummonPlansPerGame, s.checkSearchPlansPerGame)} | ${planCell(s.checkSearchAttackPlansPerGame, s.checkSearchPlansPerGame)} | ${planCell(s.checkSearchRotationPlansPerGame, s.checkSearchPlansPerGame)} | ${planCell(s.checkSearchMultiStepPlansPerGame, s.checkSearchPlansPerGame)} | ${s.checkSearchAvgPlanSteps.toFixed(2)} |`,
    );
  }
  return lines.join("\n");
}

function reactSweepCheckResponseTable(runs) {
  const lines = [
    "| Level | Response turns/game | Returned turns | Failed turns | Attack total | Attack returned | Attack failed | Rotation total | Rotation returned | Rotation failed |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const run of runs) {
    const s = run.summary;
    lines.push(
      `| ${reactSweepLevelLabel(run.variant.reactLevelName)} | ${s.checkResponseTurnsPerGame.toFixed(2)} | ${s.checkResponseReturnedTurnsPerGame.toFixed(2)} | ${s.checkResponseFailedTurnsPerGame.toFixed(2)} | ${s.checkResponseAttackReactsPerGame.toFixed(2)} | ${s.checkResponseReturnedAttackReactsPerGame.toFixed(2)} | ${s.checkResponseFailedAttackReactsPerGame.toFixed(2)} | ${s.checkResponseRotationsPerGame.toFixed(2)} | ${s.checkResponseReturnedRotationsPerGame.toFixed(2)} | ${s.checkResponseFailedRotationsPerGame.toFixed(2)} |`,
    );
  }
  return lines.join("\n");
}

function reactSweepNeedTable(runs) {
  const lines = [
    "| Level | Returnable checks/game | React unnecessary | Attack required | Rotation required | Either/both required |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const run of runs) {
    const s = run.summary;
    lines.push(
      `| ${reactSweepLevelLabel(run.variant.reactLevelName)} | ${s.reactNeedChecksPerGame.toFixed(2)} | ${needCell(s, "unneeded")} | ${needCell(s, "attackRequired")} | ${needCell(s, "rotationRequired")} | ${needCell(s, "eitherRequired")} |`,
    );
  }
  return lines.join("\n");
}

function planCell(perGame, totalPerGame) {
  const rate = totalPerGame > 0 ? perGame / totalPerGame : 0;
  return `${perGame.toFixed(2)} (${formatPct(rate)})`;
}

function needCell(summary, type) {
  const perGame = summary.reactNeedPerGameByType?.[type] ?? 0;
  const returnedRate = summary.reactNeedReturnedRateByType?.[type] ?? 0;
  return `${perGame.toFixed(2)} (${formatPct(returnedRate)})`;
}

function phase2dMarkdown(output, { resultJsonSha256 }) {
  const lines = [];
  lines.push("# Phase2d Rotate-Attack Rule Sweep");
  lines.push("");
  lines.push(`Date: ${output.generatedAt}`);
  lines.push("");
  lines.push("## Reproduction");
  lines.push("");
  lines.push("```powershell");
  lines.push(output.reproducibility.command);
  lines.push("```");
  lines.push("");
  lines.push("| Artifact | Value |");
  lines.push("|---|---|");
  lines.push(`| Repo HEAD | \`${output.reproducibility.repoHead}\` |`);
  lines.push(`| Script SHA256 | \`${output.reproducibility.scriptSha256}\` |`);
  lines.push(`| Result JSON SHA256 | \`${resultJsonSha256}\` |`);
  lines.push(`| Result JSON | \`${PHASE2D_OUT_PATH}\` |`);
  lines.push(`| Samples / run | ${output.reproducibility.samplesPerVariant} |`);
  lines.push(`| Seed | ${output.reproducibility.seed} |`);
  lines.push(`| Oracle / depth | yes / ${output.reproducibility.checkSearchDepth} |`);
  lines.push("");
  lines.push("## Implementation Notes");
  lines.push("");
  lines.push("- Choice 2 rotates one quarter-turn immediately before resolving the attack, then marks both `hasActed` and `hasRotated` if the attacker remains on board.");
  lines.push("- Choice 2 costs the same as one attack reactivation. It does not apply to summon attacks.");
  lines.push("- The normal AI scores choice 2 by temporarily rotating, evaluating the best post-rotation target, and comparing it against attack-only and rotate-only choices.");
  lines.push("- The check-return search and oracle include choice 2 whenever the run enables the rule.");
  lines.push("- Measurement D treats choice 2 as part of the attack family for attack-required classification, and also reports a separate choice-2-required restricted oracle.");
  lines.push("- Rotate-only behavior is otherwise left as the existing v3 engine behavior so R0a remains the phase2c/v3 paired-control rerun.");
  lines.push("- No score ranking or adoption judgement is made here.");
  lines.push("");
  lines.push("## Run Setup");
  lines.push("");
  lines.push(phase2dRunSetupTable(output.runs));
  lines.push("");
  lines.push("## KPI Comparison");
  lines.push("");
  lines.push(phase2dKpiTable(output.runs));
  lines.push("");
  lines.push("## Winner/Loser Reactivation Use");
  lines.push("");
  lines.push(phase2dWinnerLoserTable(output.runs));
  lines.push("");
  lines.push("## Check Return Follow-Through");
  lines.push("");
  lines.push(phase2dCheckReturnWinTable(output.runs));
  lines.push("");
  lines.push("## B. Check Return Plan Mix");
  lines.push("");
  lines.push(phase2dPlanTable(output.runs));
  lines.push("");
  lines.push("## C. Reactivation Use During Check Response");
  lines.push("");
  lines.push(phase2dCheckResponseTable(output.runs));
  lines.push("");
  lines.push("## D. Reactivation Necessity Oracle");
  lines.push("");
  lines.push(phase2dNeedTable(output.runs));
  lines.push("");
  lines.push("## Output");
  lines.push("");
  lines.push(`JSON: \`${PHASE2D_OUT_PATH}\``);
  return `${lines.join("\n")}\n`;
}

function phase2dControl(runs) {
  return runs.find((run) => run.variant.runId === "R0a") ?? runs[0];
}

function phase2dRunLabel(run) {
  const variant = run.variant;
  return `${variant.runId} ${reactSweepLevelLabel(variant.reactLevelName)} ${variant.rotateAttackRule ? "with 2" : "no 2"} dm${variant.destroyManaGain}`;
}

function phase2dRunSetupTable(runs) {
  const lines = [
    "| Run | Cost | Choice 2 | DM | Purpose |",
    "|---|---|---:|---:|---|",
  ];
  for (const run of runs) {
    const v = run.variant;
    lines.push(
      `| ${v.runId} | ${reactSweepLevelLabel(v.reactLevelName)} ${reactCurveLabel(v.reactCostCurve)} | ${v.rotateAttackRule ? "yes" : "no"} | ${v.destroyManaGain} | ${v.purpose} |`,
    );
  }
  return lines.join("\n");
}

function phase2dKpiTable(runs) {
  const control = phase2dControl(runs).summary;
  const lines = [
    "| Run | AvgR | dAvgR | P90 | Terr | P0 | dP0 | 4Ret | d4Ret | Kills | dKills | AtkFamily | Attack3 | Rotate1 | Choice2 | Unused | Stall | ManaUse |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const run of runs) {
    const s = run.summary;
    lines.push(
      `| ${phase2dRunLabel(run)} | ${s.avgRounds.toFixed(2)} | ${fmtDelta(s.avgRounds - control.avgRounds, 2)} | ${s.p90Rounds.toFixed(1)} | ${formatPct(s.territoryWinRate)} | ${formatPct(s.p0WinRate)} | ${fmtDeltaPct(s.p0WinRate - control.p0WinRate)} | ${formatPct(s.check4ReturnRate)} | ${fmtDeltaPct(s.check4ReturnRate - control.check4ReturnRate)} | ${s.killsPerGame.toFixed(1)} | ${fmtDelta(s.killsPerGame - control.killsPerGame, 1)} | ${s.attackReactivationsPerGame.toFixed(2)} | ${s.attackOnlyReactivationsPerGame.toFixed(2)} | ${s.rotationsPerGame.toFixed(2)} | ${s.rotateAttacksPerGame.toFixed(2)} | ${formatPct(s.reactivationUnusedRate)} | ${formatPct(s.summonStallRate)} | ${formatPct(s.manaUtilization)} |`,
    );
  }
  return lines.join("\n");
}

function phase2dWinnerLoserTable(runs) {
  const lines = [
    "| Run | Winner attack3 | Winner rotate1 | Winner choice2 | Loser attack3 | Loser rotate1 | Loser choice2 |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const run of runs) {
    const s = run.summary;
    lines.push(
      `| ${phase2dRunLabel(run)} | ${s.winnerAttackOnlyReactsPerGame.toFixed(2)} | ${s.winnerRotationOnlyReactsPerGame.toFixed(2)} | ${s.winnerRotateAttacksPerGame.toFixed(2)} | ${s.loserAttackOnlyReactsPerGame.toFixed(2)} | ${s.loserRotationOnlyReactsPerGame.toFixed(2)} | ${s.loserRotateAttacksPerGame.toFixed(2)} |`,
    );
  }
  return lines.join("\n");
}

function phase2dCheckReturnWinTable(runs) {
  const lines = [
    "| Run | Check return player-slots/game | Win rate after returning at least one check | Check fail player-slots/game | Win rate after failing at least one check response | Returned check turns/game | Failed response turns/game |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const run of runs) {
    const s = run.summary;
    lines.push(
      `| ${phase2dRunLabel(run)} | ${s.checkReturnPlayerSlotsPerGame.toFixed(2)} | ${formatMaybePct(s.checkReturnPlayerWinRate)} | ${safeFixed(s.checkFailedPlayerSlotsPerGame, 2)} | ${formatMaybePct(s.checkFailedPlayerWinRate)} | ${s.checkResponseReturnedTurnsPerGame.toFixed(2)} | ${s.checkResponseFailedTurnsPerGame.toFixed(2)} |`,
    );
  }
  return lines.join("\n");
}

function phase2dPlanTable(runs) {
  const lines = [
    "| Run | Plans/game | Summon | Attack3 | Rotate1 | Choice2 | Multi-step | Avg steps |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const run of runs) {
    const s = run.summary;
    lines.push(
      `| ${phase2dRunLabel(run)} | ${s.checkSearchPlansPerGame.toFixed(2)} | ${planCell(s.checkSearchSummonPlansPerGame, s.checkSearchPlansPerGame)} | ${planCell(s.checkSearchAttackPlansPerGame, s.checkSearchPlansPerGame)} | ${planCell(s.checkSearchRotationPlansPerGame, s.checkSearchPlansPerGame)} | ${planCell(s.checkSearchRotateAttackPlansPerGame, s.checkSearchPlansPerGame)} | ${planCell(s.checkSearchMultiStepPlansPerGame, s.checkSearchPlansPerGame)} | ${s.checkSearchAvgPlanSteps.toFixed(2)} |`,
    );
  }
  return lines.join("\n");
}

function phase2dCheckResponseTable(runs) {
  const lines = [
    "| Run | Response turns | Returned | Failed | Attack family total | Attack3 returned | Attack3 failed | Choice2 returned | Choice2 failed | Rotate1 returned | Rotate1 failed |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const run of runs) {
    const s = run.summary;
    lines.push(
      `| ${phase2dRunLabel(run)} | ${s.checkResponseTurnsPerGame.toFixed(2)} | ${s.checkResponseReturnedTurnsPerGame.toFixed(2)} | ${s.checkResponseFailedTurnsPerGame.toFixed(2)} | ${s.checkResponseAttackReactsPerGame.toFixed(2)} | ${s.checkResponseReturnedAttackOnlyReactsPerGame.toFixed(2)} | ${s.checkResponseFailedAttackOnlyReactsPerGame.toFixed(2)} | ${s.checkResponseReturnedRotateAttacksPerGame.toFixed(2)} | ${s.checkResponseFailedRotateAttacksPerGame.toFixed(2)} | ${s.checkResponseReturnedRotationsPerGame.toFixed(2)} | ${s.checkResponseFailedRotationsPerGame.toFixed(2)} |`,
    );
  }
  return lines.join("\n");
}

function phase2dNeedTable(runs) {
  const lines = [
    "| Run | Returnable checks/game | React unnecessary | Attack-family required | Rotate1 required | Either/both required | Choice2 required |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const run of runs) {
    const s = run.summary;
    lines.push(
      `| ${phase2dRunLabel(run)} | ${s.reactNeedChecksPerGame.toFixed(2)} | ${needCell(s, "unneeded")} | ${needCell(s, "attackRequired")} | ${needCell(s, "rotationRequired")} | ${needCell(s, "eitherRequired")} | ${s.reactNeedRotateAttackRequiredPerGame.toFixed(2)} (${formatPct(s.reactNeedRotateAttackRequiredReturnRate)}) |`,
    );
  }
  return lines.join("\n");
}

function standardManaHandicapMarkdown(output, { resultJsonSha256 }) {
  const lines = [];
  const comparisonRuns = standardHandicapComparisonRuns(output);
  lines.push("# Standard Mana Handicap Sweep");
  lines.push("");
  lines.push(`Date: ${output.generatedAt}`);
  lines.push("");
  lines.push("## Reproduction");
  lines.push("");
  lines.push("```powershell");
  lines.push(output.reproducibility.command);
  lines.push("```");
  lines.push("");
  lines.push("| Artifact | Value |");
  lines.push("|---|---|");
  lines.push(`| Repo HEAD | \`${output.reproducibility.repoHead}\` |`);
  lines.push(`| Script SHA256 | \`${output.reproducibility.scriptSha256}\` |`);
  lines.push(`| Result JSON SHA256 | \`${resultJsonSha256}\` |`);
  lines.push(`| Result JSON | \`${STANDARD_HANDICAP_OUT_PATH}\` |`);
  lines.push(`| Samples / run | ${output.reproducibility.samplesPerVariant} |`);
  lines.push(`| Seed | ${output.reproducibility.seed} |`);
  lines.push(`| Oracle / depth | yes / ${output.reproducibility.checkSearchDepth} |`);
  lines.push("");
  lines.push("## Implementation Notes");
  lines.push("");
  lines.push("- All S runs fix standard reactivation cost `2/2/2/3/3/3` and `DESTROY_MANA_GAIN=1`.");
  lines.push("- The phase2d R3 row is loaded from `phase2d-rotate-attack-results.json` and shown as the requested reference: standard, second-player +1, no choice 2, dm1.");
  lines.push("- Measurement is identical to phase2d: full KPI set, winner/loser reactivation use, check-return follow-through, and B/C/D oracle diagnostics.");
  lines.push("- All newly simulated S runs use the same seed sequence (`seed + gameIndex * 9176`) for paired comparison.");
  lines.push("- No adoption judgement is made here.");
  lines.push("");
  lines.push("## Run Setup");
  lines.push("");
  lines.push(standardHandicapRunSetupTable(output));
  lines.push("");
  lines.push("## First-Player Win Sensitivity");
  lines.push("");
  lines.push(standardHandicapSensitivityTable(comparisonRuns));
  lines.push("");
  lines.push("## KPI Comparison");
  lines.push("");
  lines.push(phase2dKpiTable(comparisonRuns));
  lines.push("");
  lines.push("## Winner/Loser Reactivation Use");
  lines.push("");
  lines.push(phase2dWinnerLoserTable(comparisonRuns));
  lines.push("");
  lines.push("## Check Return Follow-Through");
  lines.push("");
  lines.push(phase2dCheckReturnWinTable(comparisonRuns));
  lines.push("");
  lines.push("## B. Check Return Plan Mix");
  lines.push("");
  lines.push(phase2dPlanTable(comparisonRuns));
  lines.push("");
  lines.push("## C. Reactivation Use During Check Response");
  lines.push("");
  lines.push(phase2dCheckResponseTable(comparisonRuns));
  lines.push("");
  lines.push("## D. Reactivation Necessity Oracle");
  lines.push("");
  lines.push(phase2dNeedTable(comparisonRuns));
  lines.push("");
  lines.push("## Output");
  lines.push("");
  lines.push(`JSON: \`${STANDARD_HANDICAP_OUT_PATH}\``);
  return `${lines.join("\n")}\n`;
}

function standardHandicapComparisonRuns(output) {
  const runs = [...output.runs];
  if (output.referenceR3) {
    runs.splice(2, 0, {
      ...output.referenceR3,
      variant: {
        ...output.referenceR3.variant,
        runId: "R3-ref",
        p0StartingMana: 3,
        p1StartingMana: 4,
        purpose: "Reference from phase2d: standard, second-player +1, no choice 2, dm1.",
      },
    });
  }
  return runs;
}

function standardHandicapRunSetupTable(output) {
  const lines = [
    "| Run | Source | Initial mana | Handicap | Choice 2 | DM | Purpose |",
    "|---|---|---:|---:|---:|---:|---|",
  ];
  for (const run of standardHandicapComparisonRuns(output)) {
    const v = run.variant;
    const source = v.runId === "R3-ref" ? "phase2d R3" : "simulated";
    lines.push(
      `| ${v.runId} | ${source} | ${v.p0StartingMana}/${v.p1StartingMana} | ${v.p1StartingMana - v.p0StartingMana} | ${v.rotateAttackRule ? "yes" : "no"} | ${v.destroyManaGain} | ${v.purpose} |`,
    );
  }
  return lines.join("\n");
}

function standardHandicapSensitivityTable(runs) {
  const lines = [
    "| Row | Choice 2 | Handicap | Initial mana | P0 win | AvgR | 4Ret | Attack family | Choice2 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const run of runs) {
    const v = run.variant;
    const s = run.summary;
    lines.push(
      `| ${v.runId} | ${v.rotateAttackRule ? "yes" : "no"} | ${v.p1StartingMana - v.p0StartingMana} | ${v.p0StartingMana}/${v.p1StartingMana} | ${formatPct(s.p0WinRate)} | ${s.avgRounds.toFixed(2)} | ${formatPct(s.check4ReturnRate)} | ${s.attackReactivationsPerGame.toFixed(2)} | ${s.rotateAttacksPerGame.toFixed(2)} |`,
    );
  }
  return lines.join("\n");
}

function phase2bMarkdown(output, { resultJsonSha256 }) {
  const lines = [];
  const b1 = output.runs.find((run) => run.id === "B1")?.result;
  lines.push("# Phase2b Pure Item Layer");
  lines.push("");
  lines.push(`Date: ${output.generatedAt}`);
  lines.push("");
  lines.push("## Reproduction");
  lines.push("");
  lines.push("```powershell");
  lines.push(output.reproducibility.command);
  lines.push("```");
  lines.push("");
  lines.push("| Artifact | Value |");
  lines.push("|---|---|");
  lines.push(`| Repo HEAD | \`${output.reproducibility.repoHead}\` |`);
  lines.push(`| Script SHA256 | \`${output.reproducibility.scriptSha256}\` |`);
  lines.push(`| Result JSON SHA256 | \`${resultJsonSha256}\` |`);
  lines.push(`| Result JSON | \`${PHASE2B_OUT_PATH}\` |`);
  lines.push(`| Seed | ${output.reproducibility.seed} |`);
  lines.push(`| Oracle / depth | yes / ${output.reproducibility.checkSearchDepth} |`);
  lines.push("");
  lines.push("## Implementation Notes");
  lines.push("");
  lines.push("- B0 is quoted from the frozen v3 JSON and is not rerun here.");
  lines.push("- B1/B2/B3 keep the v3 body configuration fixed: hybrid HP, high ATK, heavy reactivation, lowmid distribution, second-player starting mana 4, destroy mana gain 1.");
  lines.push("- Items are represented as deck cards, go to discard when used, and can be reshuffled when the deck is empty.");
  lines.push("- Items are used only before summon. Once a summon happens, the main phase is treated as over.");
  lines.push("- Removal items are included in both oracle and executable check-return search.");
  lines.push("- The oracle/check-search item action space intentionally includes removal items only. Economy, buff, and draw can still be used by the normal pre-summon item AI, so actual/oracle realization may exceed 100% in this phase.");
  lines.push("- Normal item AI is intentionally minimal: removal kills, economy enabling/spare use, spare buffing, and draw when summonable creatures are scarce.");
  lines.push("- No gate judgement or next action decision is made in this file.");
  lines.push("");
  lines.push("## B1 KPI Material");
  lines.push("");
  lines.push(phase2bKpiTable(b1));
  lines.push("");
  lines.push("## B0/B1/B2/B3 Comparison");
  lines.push("");
  lines.push(phase2bComparisonTable(output));
  lines.push("");
  lines.push("## Item Usage");
  lines.push("");
  lines.push(phase2bItemTable(output));
  lines.push("");
  lines.push("## Item Mixes");
  lines.push("");
  lines.push("| Run | Mix |");
  lines.push("|---|---|");
  for (const run of output.runs) {
    lines.push(`| ${run.id} | ${formatItemCounts(run.result.variant.itemCounts)} |`);
  }
  lines.push("");
  lines.push("## Output");
  lines.push("");
  lines.push(`JSON: \`${PHASE2B_OUT_PATH}\``);
  return `${lines.join("\n")}\n`;
}

function phase2bV31Markdown(output, { resultJsonSha256 }) {
  const lines = [];
  const b1 = output.runs.find((run) => run.id === "B1'")?.result;
  lines.push("# Phase2b Pure Item Layer v3.1");
  lines.push("");
  lines.push(`Date: ${output.generatedAt}`);
  lines.push("");
  lines.push("## Reproduction");
  lines.push("");
  lines.push("```powershell");
  lines.push(output.reproducibility.command);
  lines.push("```");
  lines.push("");
  lines.push("| Artifact | Value |");
  lines.push("|---|---|");
  lines.push(`| Repo HEAD | \`${output.reproducibility.repoHead}\` |`);
  lines.push(`| Script SHA256 | \`${output.reproducibility.scriptSha256}\` |`);
  lines.push(`| Result JSON SHA256 | \`${resultJsonSha256}\` |`);
  lines.push(`| Result JSON | \`${PHASE2B_V31_OUT_PATH}\` |`);
  lines.push(`| B1' samples | ${output.reproducibility.b1Samples} |`);
  lines.push(`| B2' samples | ${output.reproducibility.b2Samples} |`);
  lines.push(`| B3' samples | ${output.reproducibility.b3Samples} |`);
  lines.push(`| Seed | ${output.reproducibility.seed} |`);
  lines.push(`| Oracle / depth | yes / ${output.reproducibility.checkSearchDepth} |`);
  lines.push("");
  lines.push("## Implementation Notes");
  lines.push("");
  lines.push("- B0 v3.1 body is quoted from the v3.1 freeze JSON generated earlier in the same command.");
  lines.push("- Old B1 is quoted from the previous v3 Phase2b JSON when available, for the requested side-by-side comparison.");
  lines.push("- B1'/B2'/B3' keep the v3.1 body configuration fixed: hybrid HP, high ATK, heavy 2/3/3/3/3/4 reactivation, choice 2 enabled, lowmid distribution, second-player starting mana 4, destroy mana gain 1.");
  lines.push("- Items are represented as deck cards, go to discard when used, and can be reshuffled when the deck is empty.");
  lines.push("- Items are used only before summon. Once a summon happens, the main phase is treated as over.");
  lines.push("- Removal items are included in both oracle and executable check-return search.");
  lines.push("- New measurement from v3.1 is retained: failed 4-check response player-slots and their eventual win rate.");
  lines.push("- No gate judgement or next action decision is made in this file.");
  lines.push("");
  lines.push("## B1' KPI Material");
  lines.push("");
  lines.push(phase2bKpiTable(b1));
  lines.push("");
  lines.push("## v3.1 Body / Old B1 / B1' / B2' / B3' Comparison");
  lines.push("");
  lines.push(phase2bV31ComparisonTable(output));
  lines.push("");
  lines.push("## Check Return Follow-Through");
  lines.push("");
  lines.push(phase2bV31FollowThroughTable(output));
  lines.push("");
  lines.push("## Item Usage");
  lines.push("");
  lines.push(phase2bItemTable(output));
  lines.push("");
  lines.push("## Item Mixes");
  lines.push("");
  lines.push("| Run | Mix |");
  lines.push("|---|---|");
  for (const run of output.runs) {
    lines.push(`| ${run.id} | ${formatItemCounts(run.result.variant.itemCounts)} |`);
  }
  lines.push("");
  lines.push("## Output");
  lines.push("");
  lines.push(`JSON: \`${PHASE2B_V31_OUT_PATH}\``);
  return `${lines.join("\n")}\n`;
}

function phase2bKpiTable(result) {
  if (!result) return "_B1 result is missing._";
  const s = result.summary;
  const rows = [
    ["Average rounds", "8.5-10 gate material", s.avgRounds.toFixed(2)],
    ["P90 rounds", "<=14", s.p90Rounds.toFixed(1)],
    ["Territory win rate", ">=95%", formatPct(s.territoryWinRate)],
    ["Life win rate", "reported", formatPct(s.lifeWinRate)],
    ["Timeout rate", "0%", formatPct(s.timeoutRate)],
    ["P0 win rate", "50-53%", formatPct(s.p0WinRate)],
    ["4-check return rate", "45-55%", formatPct(s.check4ReturnRate)],
    ["Oracle returnable", "reported", formatPct(s.check4OracleReturnableRate)],
    ["Actual/oracle ratio", "diagnostic; can exceed 100%", formatPct(s.check4OracleRealizationRate)],
    ["Kills/game", "3.5-6", s.killsPerGame.toFixed(1)],
    ["Attack reactivations/game", "2.5-4.5", s.attackReactivationsPerGame.toFixed(1)],
    ["Weak kill rate", ">=45%", formatPct(s.weakKillRate)],
    ["Summon stall rate", "reported", formatPct(s.summonStallRate)],
    ["Mana utilization", ">=87%", formatPct(s.manaUtilization)],
    ["Board3 median round", "<=4", formatNullable(s.board3.medianRound)],
    ["Items used/game", "reported", safeFixed(s.itemUsesPerGame, 1)],
    ["Removal item kills/game", "reported", safeFixed(s.itemRemovalKillsPerGame, 1)],
    ["Item dead rate", "reported", formatPct(s.itemDeadRate)],
  ];
  const lines = [
    "| KPI | Band / Role | B1 value |",
    "|---|---|---:|",
    ...rows.map(([name, band, value]) => `| ${name} | ${band} | ${value} |`),
  ];
  return lines.join("\n");
}

function phase2bV31ComparisonRows(output) {
  const rows = [];
  if (output.v31BodyReference?.result) {
    rows.push({
      id: "B0 v3.1 body",
      samples: output.v31BodyReference.result.summary.games,
      result: output.v31BodyReference.result,
      mix: "none",
      source: "v3.1 freeze",
    });
  }
  if (output.oldB1Reference?.run?.result) {
    rows.push({
      id: "old B1",
      samples: output.oldB1Reference.run.samplesPerVariant,
      result: output.oldB1Reference.run.result,
      mix: formatItemCounts(output.oldB1Reference.run.result.variant.itemCounts),
      source: "old v3 phase2b",
    });
  }
  for (const run of output.runs) {
    rows.push({
      id: run.id,
      samples: run.samplesPerVariant,
      result: run.result,
      mix: formatItemCounts(run.result.variant.itemCounts),
      source: "v3.1 rerun",
    });
  }
  return rows;
}

function phase2bV31ComparisonTable(output) {
  const lines = [
    "| Run | Source | Mix | Games | AvgR | P90 | Terr | Life | Timeout | P0 | 4Ret | Kills | AtkFamily | Attack3 | Choice2 | WeakKill | Stall | ManaUse | Items | RemKills | Dead |",
    "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const row of phase2bV31ComparisonRows(output)) {
    const s = row.result.summary;
    const attackFamily = s.attackReactivationsPerGame ?? 0;
    const attackOnly = s.attackOnlyReactivationsPerGame ?? attackFamily;
    const choice2 = s.rotateAttacksPerGame ?? 0;
    lines.push(
      `| ${row.id} | ${row.source} | ${row.mix} | ${row.samples ?? s.games} | ${s.avgRounds.toFixed(2)} | ${s.p90Rounds.toFixed(1)} | ${formatPct(s.territoryWinRate)} | ${formatPct(s.lifeWinRate)} | ${formatPct(s.timeoutRate)} | ${formatPct(s.p0WinRate)} | ${formatPct(s.check4ReturnRate)} | ${s.killsPerGame.toFixed(1)} | ${attackFamily.toFixed(2)} | ${attackOnly.toFixed(2)} | ${choice2.toFixed(2)} | ${formatPct(s.weakKillRate)} | ${formatPct(s.summonStallRate)} | ${formatPct(s.manaUtilization)} | ${safeFixed(s.itemUsesPerGame, 1)} | ${safeFixed(s.itemRemovalKillsPerGame, 1)} | ${formatPct(s.itemDeadRate ?? 0)} |`,
    );
  }
  return lines.join("\n");
}

function phase2bV31FollowThroughTable(output) {
  const lines = [
    "| Run | Return slots/game | Return-slot win | Failed slots/game | Failed-slot win | Returned turns/game | Failed turns/game |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const row of phase2bV31ComparisonRows(output)) {
    const s = row.result.summary;
    lines.push(
      `| ${row.id} | ${safeFixed(s.checkReturnPlayerSlotsPerGame, 2)} | ${formatMaybePct(s.checkReturnPlayerWinRate)} | ${safeFixed(s.checkFailedPlayerSlotsPerGame, 2)} | ${formatMaybePct(s.checkFailedPlayerWinRate)} | ${safeFixed(s.checkResponseReturnedTurnsPerGame, 2)} | ${safeFixed(s.checkResponseFailedTurnsPerGame, 2)} |`,
    );
  }
  return lines.join("\n");
}

function phase2bComparisonTable(output) {
  const rows = [];
  if (output.b0Reference.result) {
    rows.push({ id: "B0", samples: output.b0Reference.result.summary.games, result: output.b0Reference.result, mix: "none" });
  }
  for (const run of output.runs) {
    rows.push({ id: run.id, samples: run.samplesPerVariant, result: run.result, mix: formatItemCounts(run.result.variant.itemCounts) });
  }
  const lines = [
    "| Run | Mix | Games | AvgR | P90 | Terr | Life | Timeout | P0 | 4Ret | Kills | AtkReact | WeakKill | Stall | ManaUse | Items | RemKills | Dead |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const row of rows) {
    const s = row.result.summary;
    lines.push(
      `| ${row.id} | ${row.mix} | ${row.samples} | ${s.avgRounds.toFixed(2)} | ${s.p90Rounds.toFixed(1)} | ${formatPct(s.territoryWinRate)} | ${formatPct(s.lifeWinRate)} | ${formatPct(s.timeoutRate)} | ${formatPct(s.p0WinRate)} | ${formatPct(s.check4ReturnRate)} | ${s.killsPerGame.toFixed(1)} | ${s.attackReactivationsPerGame.toFixed(1)} | ${formatPct(s.weakKillRate)} | ${formatPct(s.summonStallRate)} | ${formatPct(s.manaUtilization)} | ${safeFixed(s.itemUsesPerGame, 1)} | ${safeFixed(s.itemRemovalKillsPerGame, 1)} | ${formatPct(s.itemDeadRate ?? 0)} |`,
    );
  }
  return lines.join("\n");
}

function phase2bItemTable(output) {
  const lines = [
    "| Run | Removal use | Economy use | Buff use | Draw use | Removal kills | Buff HP | Draw cards | Check item plan | Check removal plan | Dead removal | Dead economy | Dead buff | Dead draw |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const run of output.runs) {
    const s = run.result.summary;
    const use = s.itemUsePerGameByType ?? emptyItemCounts();
    const dead = s.itemDeadRateByType ?? emptyItemCounts();
    lines.push(
      `| ${run.id} | ${safeFixed(use.removal, 2)} | ${safeFixed(use.economy, 2)} | ${safeFixed(use.buff, 2)} | ${safeFixed(use.draw, 2)} | ${safeFixed(s.itemRemovalKillsPerGame, 2)} | ${safeFixed(s.itemBuffHpGainedPerGame, 2)} | ${safeFixed(s.itemDrawCardsPerGame, 2)} | ${formatPct(s.checkSearchItemPlanRate ?? 0)} | ${formatPct(s.checkSearchRemovalItemPlanRate ?? 0)} | ${formatPct(dead.removal ?? 0)} | ${formatPct(dead.economy ?? 0)} | ${formatPct(dead.buff ?? 0)} | ${formatPct(dead.draw ?? 0)} |`,
    );
  }
  return lines.join("\n");
}

function formatItemCounts(counts) {
  if (!counts) return "none";
  return ITEM_TYPES.map((type) => `${type}:${counts[type] ?? 0}`).join(" ");
}

function safeFixed(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function fmtDelta(value, digits) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function fmtDeltaPct(value) {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}pt`;
}

function summarize(results) {
  const rounds = results.map((r) => r.halfTurns / 2).sort((a, b) => a - b);
  const deckEmptyRounds = results
    .map((r) => r.metrics.firstDeckEmptyHalfTurn)
    .filter((value) => typeof value === "number")
    .map((halfTurn) => halfTurn / 2)
    .sort((a, b) => a - b);
  const deckReshuffleRounds = results
    .map((r) => r.metrics.firstDeckReshuffleHalfTurn)
    .filter((value) => typeof value === "number")
    .map((halfTurn) => halfTurn / 2)
    .sort((a, b) => a - b);
  const firstSummonRounds = collectPlayerRoundMetric(results, "firstSummonHalfTurns");
  const board3Rounds = collectPlayerRoundMetric(results, "firstBoard3HalfTurns");
  const sumMetrics = results.reduce((acc, r) => {
    for (const [k, v] of Object.entries(r.metrics)) {
      if (typeof v === "number") acc[k] = (acc[k] ?? 0) + v;
    }
    acc.killBands.low += r.metrics.killBands.low;
    acc.killBands.mid += r.metrics.killBands.mid;
    acc.killBands.high += r.metrics.killBands.high;
    for (const type of ITEM_TYPES) {
      acc.itemUsesByType[type] += r.metrics.itemUsesByType?.[type] ?? 0;
      acc.itemDeadByType[type] += r.metrics.itemDeadByType?.[type] ?? 0;
      acc.itemInitialByType[type] += r.metrics.itemInitialByType?.[type] ?? 0;
    }
    for (const type of REACT_NEED_TYPES) {
      acc.reactNeedByType[type] += r.metrics.reactNeedByType?.[type] ?? 0;
      acc.reactNeedReturnedByType[type] += r.metrics.reactNeedReturnedByType?.[type] ?? 0;
    }
    for (const shape of Object.keys(acc.shapeStats)) {
      acc.shapeStats[shape].kills += r.metrics.shapeStats?.[shape]?.kills ?? 0;
      acc.shapeStats[shape].deaths += r.metrics.shapeStats?.[shape]?.deaths ?? 0;
      acc.shapeStats[shape].attackOnlyReacts += r.metrics.shapeStats?.[shape]?.attackOnlyReacts ?? 0;
      acc.shapeStats[shape].rotateAttackReacts += r.metrics.shapeStats?.[shape]?.rotateAttackReacts ?? 0;
    }
    for (const [shape, stats] of Object.entries(r.metrics.shapeStats ?? {})) {
      if (acc.shapeStats[shape]) continue;
      acc.shapeStats[shape] = {
        name: stats.name,
        kills: stats.kills ?? 0,
        deaths: stats.deaths ?? 0,
        attackOnlyReacts: stats.attackOnlyReacts ?? 0,
        rotateAttackReacts: stats.rotateAttackReacts ?? 0,
      };
    }
    return acc;
  }, {
    killBands: { low: 0, mid: 0, high: 0 },
    itemUsesByType: emptyItemCounts(),
    itemDeadByType: emptyItemCounts(),
    itemInitialByType: emptyItemCounts(),
    reactNeedByType: emptyReactNeedCounts(),
    reactNeedReturnedByType: emptyReactNeedCounts(),
    shapeStats: emptyShapeStats(),
  });
  const n = results.length;
  const reasonCount = (reason) => results.filter((r) => r.reason === reason).length;
  const p0Wins = results.filter((r) => r.winner === 0).length;
  const median = rounds[Math.floor(rounds.length / 2)] ?? 0;
  const p90 = rounds[Math.floor(rounds.length * 0.9)] ?? 0;
  const deckEmptyMedian = deckEmptyRounds[Math.floor(deckEmptyRounds.length / 2)] ?? null;
  const deckEmptyP90 = deckEmptyRounds[Math.floor(deckEmptyRounds.length * 0.9)] ?? null;
  const deckReshuffleMedian = deckReshuffleRounds[Math.floor(deckReshuffleRounds.length / 2)] ?? null;
  const deckReshuffleP90 = deckReshuffleRounds[Math.floor(deckReshuffleRounds.length * 0.9)] ?? null;
  const firstSummonStats = roundDistributionStats(firstSummonRounds, n * 2);
  const board3Stats = roundDistributionStats(board3Rounds, n * 2);
  const check4ReturnRate = sumMetrics.check4Responses > 0 ? sumMetrics.check4Returned / sumMetrics.check4Responses : 0;
  const check4WithHighCostReturnRate =
    sumMetrics.check4WithHighCost > 0 ? sumMetrics.check4WithHighCostReturned / sumMetrics.check4WithHighCost : 0;
  const check4OracleReturnableRate =
    sumMetrics.check4OracleChecks > 0 ? sumMetrics.check4OracleReturnable / sumMetrics.check4OracleChecks : 0;
  const check4OracleHighCostReturnableRate =
    sumMetrics.check4OracleHighCostChecks > 0
      ? sumMetrics.check4OracleHighCostReturnable / sumMetrics.check4OracleHighCostChecks
      : 0;
  const check4OracleRealizationRate =
    check4OracleReturnableRate > 0 ? check4ReturnRate / check4OracleReturnableRate : 0;
  const check4HighCostOracleRealizationRate =
    check4OracleHighCostReturnableRate > 0
      ? check4WithHighCostReturnRate / check4OracleHighCostReturnableRate
      : 0;
  const weakAttackRate = sumMetrics.attacks > 0 ? sumMetrics.weakAttacks / sumMetrics.attacks : 0;
  const weakKillRate = sumMetrics.kills > 0 ? sumMetrics.weakKills / sumMetrics.kills : 0;
  const rotationShare = sumMetrics.reactivations > 0 ? sumMetrics.rotations / sumMetrics.reactivations : 0;
  const attrMatchRate = sumMetrics.summons > 0 ? sumMetrics.attrMatchSummons / sumMetrics.summons : 0;
  const attrBadRate = sumMetrics.summons > 0 ? sumMetrics.attrBadSummons / sumMetrics.summons : 0;
  const summonStallRate =
    sumMetrics.summonDecisionTurns > 0 ? sumMetrics.summonStalledTurns / sumMetrics.summonDecisionTurns : 0;
  const summonStallNoCardsRate =
    sumMetrics.summonDecisionTurns > 0 ? sumMetrics.summonStalledNoCards / sumMetrics.summonDecisionTurns : 0;
  const summonStallManaRate =
    sumMetrics.summonDecisionTurns > 0 ? sumMetrics.summonStalledMana / sumMetrics.summonDecisionTurns : 0;
  const manaUtilization = sumMetrics.manaIncome > 0 ? sumMetrics.manaSpent / sumMetrics.manaIncome : 0;
  const reactivationUnusedRate =
    sumMetrics.reactivationOpportunityTurns > 0
      ? sumMetrics.reactivationUnusedTurns / sumMetrics.reactivationOpportunityTurns
      : 0;
  const fatigueShareOfLifeWins = reasonCount("life") > 0 ? sumMetrics.fatigueWins / reasonCount("life") : 0;
  const avg = (key) => (sumMetrics[key] ?? 0) / n;
  const matchupMatrix = summarizeMatchups(results);
  const itemUsePerGameByType = Object.fromEntries(ITEM_TYPES.map((type) => [type, sumMetrics.itemUsesByType[type] / n]));
  const itemDeadRateByType = Object.fromEntries(
    ITEM_TYPES.map((type) => [
      type,
      sumMetrics.itemInitialByType[type] > 0 ? sumMetrics.itemDeadByType[type] / sumMetrics.itemInitialByType[type] : 0,
    ]),
  );
  const reactNeedPerGameByType = Object.fromEntries(
    REACT_NEED_TYPES.map((type) => [type, sumMetrics.reactNeedByType[type] / n]),
  );
  const reactNeedReturnedRateByType = Object.fromEntries(
    REACT_NEED_TYPES.map((type) => [
      type,
      sumMetrics.reactNeedByType[type] > 0 ? sumMetrics.reactNeedReturnedByType[type] / sumMetrics.reactNeedByType[type] : 0,
    ]),
  );

  return {
    games: n,
    avgRounds: avgArray(rounds),
    medianRounds: median,
    p90Rounds: p90,
    p0WinRate: p0Wins / n,
    territoryWinRate: reasonCount("territory") / n,
    lifeWinRate: reasonCount("life") / n,
    timeoutRate: reasonCount("timeout") / n,
    avgBoard: sumMetrics.boardSamples > 0 ? sumMetrics.boardTotal / sumMetrics.boardSamples : 0,
    check4PerGame: avg("check4"),
    check4ReturnRate,
    check4WithHighCostPerGame: avg("check4WithHighCost"),
    check4WithHighCostReturnRate,
    check4OracleChecksPerGame: avg("check4OracleChecks"),
    check4OracleReturnableRate,
    check4OracleHighCostChecksPerGame: avg("check4OracleHighCostChecks"),
    check4OracleHighCostReturnableRate,
    check4OracleRealizationRate,
    check4HighCostOracleRealizationRate,
    checkSearchPlansPerGame: avg("checkSearchPlans"),
    checkSearchHighCostPlansPerGame: avg("checkSearchHighCostPlans"),
    checkSearchSummonPlansPerGame: avg("checkSearchSummonPlans"),
    checkSearchAttackPlansPerGame: avg("checkSearchAttackPlans"),
    checkSearchRotationPlansPerGame: avg("checkSearchRotationPlans"),
    checkSearchRotateAttackPlansPerGame: avg("checkSearchRotateAttackPlans"),
    checkSearchItemPlansPerGame: avg("checkSearchItemPlans"),
    checkSearchRemovalItemPlansPerGame: avg("checkSearchRemovalItemPlans"),
    checkSearchMultiStepPlansPerGame: avg("checkSearchMultiStepPlans"),
    checkSearchAvgPlanSteps:
      sumMetrics.checkSearchPlans > 0 ? sumMetrics.checkSearchPlanSteps / sumMetrics.checkSearchPlans : 0,
    checkSearchItemPlanStepShare:
      sumMetrics.checkSearchPlanSteps > 0 ? sumMetrics.checkSearchItemPlanSteps / sumMetrics.checkSearchPlanSteps : 0,
    checkSearchItemPlanRate:
      sumMetrics.checkSearchPlans > 0 ? sumMetrics.checkSearchItemPlans / sumMetrics.checkSearchPlans : 0,
    checkSearchRemovalItemPlanRate:
      sumMetrics.checkSearchPlans > 0 ? sumMetrics.checkSearchRemovalItemPlans / sumMetrics.checkSearchPlans : 0,
    checkSearchOracleMissesPerGame: avg("checkSearchOracleMisses"),
    checkSearchHighCostOracleMissesPerGame: avg("checkSearchHighCostOracleMisses"),
    itemUsesPerGame: avg("itemUses"),
    itemUsePerGameByType,
    itemRemovalDamagePerGame: avg("itemRemovalDamage"),
    itemRemovalKillsPerGame: avg("itemRemovalKills"),
    itemBuffHpGainedPerGame: avg("itemBuffHpGained"),
    itemDrawCardsPerGame: avg("itemDrawCards"),
    itemDeadPerGame: avg("itemDead"),
    itemInitialPerGame: avg("itemInitial"),
    itemDeadRate: sumMetrics.itemInitial > 0 ? sumMetrics.itemDead / sumMetrics.itemInitial : 0,
    itemDeadRateByType,
    checkSearchItemUsesPerGame: avg("checkSearchItemUses"),
    killsPerGame: avg("kills"),
    weakAttackRate,
    weakKillRate,
    manualAttacksPerGame: avg("manualAttacks"),
    summonAttacksPerGame: avg("summonAttacks"),
    reactivationsPerGame: avg("reactivations"),
    attackReactivationsPerGame: avg("reactivations") - avg("rotations"),
    attackOnlyReactivationsPerGame: avg("attackReactivationActions"),
    rotationsPerGame: avg("rotations"),
    rotateAttacksPerGame: avg("rotateAttacks"),
    rotationShare,
    winnerAttackOnlyReactsPerGame: avg("winnerAttackOnlyReacts"),
    winnerRotationOnlyReactsPerGame: avg("winnerRotationOnlyReacts"),
    winnerRotateAttacksPerGame: avg("winnerRotateAttacks"),
    loserAttackOnlyReactsPerGame: avg("loserAttackOnlyReacts"),
    loserRotationOnlyReactsPerGame: avg("loserRotationOnlyReacts"),
    loserRotateAttacksPerGame: avg("loserRotateAttacks"),
    shapeStats: Object.fromEntries(Object.entries(sumMetrics.shapeStats).map(([shape, stats]) => [shape, {
      name: stats.name,
      kills: stats.kills,
      deaths: stats.deaths,
      attackOnlyReacts: stats.attackOnlyReacts,
      rotateAttackReacts: stats.rotateAttackReacts,
      killsPerGame: stats.kills / n,
      deathsPerGame: stats.deaths / n,
      attackOnlyReactsPerGame: stats.attackOnlyReacts / n,
      rotateAttackReactsPerGame: stats.rotateAttackReacts / n,
    }])),
    reactivationOpportunityTurnsPerGame: avg("reactivationOpportunityTurns"),
    reactivationUnusedRate,
    checkReturnPlayerSlotsPerGame: avg("checkReturnPlayerSlots"),
    checkReturnPlayerWinRate:
      sumMetrics.checkReturnPlayerSlots > 0 ? sumMetrics.checkReturnPlayerWins / sumMetrics.checkReturnPlayerSlots : 0,
    checkFailedPlayerSlotsPerGame: avg("checkFailedPlayerSlots"),
    checkFailedPlayerWinRate:
      sumMetrics.checkFailedPlayerSlots > 0 ? sumMetrics.checkFailedPlayerWins / sumMetrics.checkFailedPlayerSlots : 0,
    checkResponseTurnsPerGame: avg("checkResponseTurns"),
    checkResponseReturnedTurnsPerGame: avg("checkResponseReturnedTurns"),
    checkResponseFailedTurnsPerGame: avg("checkResponseFailedTurns"),
    checkResponseAttackReactsPerGame: avg("checkResponseAttackReacts"),
    checkResponseAttackOnlyReactsPerGame: avg("checkResponseAttackOnlyReacts"),
    checkResponseRotationsPerGame: avg("checkResponseRotations"),
    checkResponseRotateAttacksPerGame: avg("checkResponseRotateAttacks"),
    checkResponseReturnedAttackReactsPerGame: avg("checkResponseReturnedAttackReacts"),
    checkResponseReturnedAttackOnlyReactsPerGame: avg("checkResponseReturnedAttackOnlyReacts"),
    checkResponseReturnedRotationsPerGame: avg("checkResponseReturnedRotations"),
    checkResponseReturnedRotateAttacksPerGame: avg("checkResponseReturnedRotateAttacks"),
    checkResponseFailedAttackReactsPerGame: avg("checkResponseFailedAttackReacts"),
    checkResponseFailedAttackOnlyReactsPerGame: avg("checkResponseFailedAttackOnlyReacts"),
    checkResponseFailedRotationsPerGame: avg("checkResponseFailedRotations"),
    checkResponseFailedRotateAttacksPerGame: avg("checkResponseFailedRotateAttacks"),
    reactNeedChecksPerGame: avg("reactNeedChecks"),
    reactNeedCounts: { ...sumMetrics.reactNeedByType },
    reactNeedReturnedCounts: { ...sumMetrics.reactNeedReturnedByType },
    reactNeedPerGameByType,
    reactNeedReturnedRateByType,
    reactNeedRotateAttackRequiredPerGame: avg("reactNeedRotateAttackRequired"),
    reactNeedRotateAttackRequiredReturnRate:
      sumMetrics.reactNeedRotateAttackRequired > 0
        ? sumMetrics.reactNeedRotateAttackRequiredReturned / sumMetrics.reactNeedRotateAttackRequired
        : 0,
    manaOverflowPerGame: avg("manaOverflow"),
    manaCapHitsPerGame: avg("capHits"),
    manaIncomePerGame: avg("manaIncome"),
    manaSpentPerGame: avg("manaSpent"),
    manaUtilization,
    deckExhaustionsPerGame: avg("deckExhaustions"),
    deckEmptyGameRate: deckEmptyRounds.length / n,
    firstDeckEmptyAvgRound: deckEmptyRounds.length > 0 ? avgArray(deckEmptyRounds) : null,
    firstDeckEmptyMedianRound: deckEmptyMedian,
    firstDeckEmptyP90Round: deckEmptyP90,
    deckReshufflesPerGame: avg("deckReshuffles"),
    deckReshuffleGameRate: deckReshuffleRounds.length / n,
    firstDeckReshuffleAvgRound: deckReshuffleRounds.length > 0 ? avgArray(deckReshuffleRounds) : null,
    firstDeckReshuffleMedianRound: deckReshuffleMedian,
    firstDeckReshuffleP90Round: deckReshuffleP90,
    destroyManaGainedPerGame: avg("destroyManaGained"),
    fatigueDamagePerGame: avg("fatigueDamage"),
    fatigueEventsPerGame: avg("fatigueEvents"),
    fatigueWinRate: avg("fatigueWins"),
    fatigueShareOfLifeWins,
    firstSummon: firstSummonStats,
    board3: board3Stats,
    summonDecisionTurnsPerGame: avg("summonDecisionTurns"),
    summonStalledTurnsPerGame: avg("summonStalledTurns"),
    summonStallRate,
    summonStallNoCardsRate,
    summonStallManaRate,
    attrMatchSummonRate: attrMatchRate,
    attrBadSummonRate: attrBadRate,
    killBandsPerGame: {
      low: sumMetrics.killBands.low / n,
      mid: sumMetrics.killBands.mid / n,
      high: sumMetrics.killBands.high / n,
    },
    matchupMatrix,
  };
}

function summarizeMatchups(results) {
  const cells = {};
  for (const result of results) {
    const row = (cells[result.p0Faction] ??= {});
    const cell = (row[result.p1Faction] ??= {
      games: 0,
      p0Wins: 0,
      p1Wins: 0,
      draws: 0,
      totalRounds: 0,
      territoryWins: 0,
      lifeWins: 0,
      timeoutWins: 0,
      fatigueWins: 0,
    });
    cell.games += 1;
    cell.totalRounds += result.halfTurns / 2;
    if (result.winner === 0) cell.p0Wins += 1;
    else if (result.winner === 1) cell.p1Wins += 1;
    else cell.draws += 1;
    if (result.reason === "territory") cell.territoryWins += 1;
    else if (result.reason === "life") cell.lifeWins += 1;
    else if (result.reason === "timeout") cell.timeoutWins += 1;
    cell.fatigueWins += result.metrics.fatigueWins ?? 0;
  }

  for (const row of Object.values(cells)) {
    for (const cell of Object.values(row)) {
      cell.p0WinRate = cell.games > 0 ? cell.p0Wins / cell.games : 0;
      cell.p1WinRate = cell.games > 0 ? cell.p1Wins / cell.games : 0;
      cell.drawRate = cell.games > 0 ? cell.draws / cell.games : 0;
      cell.avgRounds = cell.games > 0 ? cell.totalRounds / cell.games : 0;
      cell.territoryWinRate = cell.games > 0 ? cell.territoryWins / cell.games : 0;
      cell.lifeWinRate = cell.games > 0 ? cell.lifeWins / cell.games : 0;
      cell.timeoutRate = cell.games > 0 ? cell.timeoutWins / cell.games : 0;
      cell.fatigueWinRate = cell.games > 0 ? cell.fatigueWins / cell.games : 0;
      delete cell.totalRounds;
    }
  }
  return cells;
}

function avgArray(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function collectPlayerRoundMetric(results, key) {
  return results
    .flatMap((result) => result.metrics[key] ?? [])
    .filter((value) => typeof value === "number")
    .map((halfTurn) => halfTurn / 2)
    .sort((a, b) => a - b);
}

function roundDistributionStats(rounds, totalSlots) {
  const reached = rounds.length;
  return {
    reached,
    reachedRate: totalSlots > 0 ? reached / totalSlots : 0,
    missingRate: totalSlots > 0 ? (totalSlots - reached) / totalSlots : 0,
    avgRound: reached > 0 ? avgArray(rounds) : null,
    medianRound: reached > 0 ? rounds[Math.floor(reached / 2)] : null,
    p90Round: reached > 0 ? rounds[Math.floor(reached * 0.9)] : null,
  };
}

function scoreSummary(s) {
  const band = (value, min, max, weight) => {
    if (value < min) return (min - value) * weight;
    if (value > max) return (value - max) * weight;
    return 0;
  };
  const floor = (value, min, weight) => (value < min ? (min - value) * weight : 0);
  const ceiling = (value, max, weight) => (value > max ? (value - max) * weight : 0);
  let penalty = 0;

  penalty += band(s.avgRounds, 7, 10, 20);
  penalty += ceiling(s.p90Rounds, 14, 8);
  penalty += floor(s.territoryWinRate, 0.95, 120);
  penalty += ceiling(s.timeoutRate, 0, 1000);
  penalty += band(s.p0WinRate, 0.5, 0.53, 100);
  penalty += band(s.check4ReturnRate, 0.45, 0.55, 100);
  penalty += band(s.killsPerGame, 3.5, 5, 10);

  penalty += band(s.attackReactivationsPerGame, 2.5, 4.5, 8);
  penalty += floor(s.weakKillRate, 0.45, 70);

  penalty += floor(s.summonStallRate, 0.2, 60);
  penalty += floor(s.manaUtilization, 0.87, 60);
  penalty += s.board3.medianRound == null ? 40 : ceiling(s.board3.medianRound, 4, 12);

  return penalty;
}

function formatPct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function formatMaybePct(n) {
  return Number.isFinite(n) ? formatPct(n) : "-";
}

function formatNullable(n, digits = 1) {
  return typeof n === "number" ? n.toFixed(digits) : "-";
}

function printTable(results, top) {
  const ranked = [...results].sort((a, b) => a.score - b.score).slice(0, top);
  console.log("\nTop variants");
  console.log("rank | variant | score | avgR | med | p90 | terr | life | fatigueWin | p0 | 4ret | oracle | realized | high4ret | highOracle | kills | rotations | rotShare | weakKill | deckEmpty | emptyMed | emptyP90 | fatigueDmg | manaOverflow | killBands");
  console.log("---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---");
  ranked.forEach((r, i) => {
    const s = r.summary;
    const bands = `${s.killBandsPerGame.low.toFixed(1)}/${s.killBandsPerGame.mid.toFixed(1)}/${s.killBandsPerGame.high.toFixed(1)}`;
    const oracle = s.check4OracleChecksPerGame > 0 ? formatPct(s.check4OracleReturnableRate) : "-";
    const realized = s.check4OracleChecksPerGame > 0 ? formatPct(s.check4OracleRealizationRate) : "-";
    const high4ret = s.check4WithHighCostPerGame > 0 ? formatPct(s.check4WithHighCostReturnRate) : "-";
    const highOracle = s.check4OracleHighCostChecksPerGame > 0 ? formatPct(s.check4OracleHighCostReturnableRate) : "-";
    console.log(
      `${i + 1} | ${r.variant.name} | ${r.score.toFixed(2)} | ${s.avgRounds.toFixed(2)} | ${s.medianRounds.toFixed(1)} | ${s.p90Rounds.toFixed(1)} | ${formatPct(s.territoryWinRate)} | ${formatPct(s.lifeWinRate)} | ${formatPct(s.fatigueWinRate)} | ${formatPct(s.p0WinRate)} | ${formatPct(s.check4ReturnRate)} | ${oracle} | ${realized} | ${high4ret} | ${highOracle} | ${s.killsPerGame.toFixed(1)} | ${s.rotationsPerGame.toFixed(1)} | ${formatPct(s.rotationShare)} | ${formatPct(s.weakKillRate)} | ${formatPct(s.deckEmptyGameRate)} | ${formatNullable(s.firstDeckEmptyMedianRound)} | ${formatNullable(s.firstDeckEmptyP90Round)} | ${s.fatigueDamagePerGame.toFixed(1)} | ${s.manaOverflowPerGame.toFixed(1)} | ${bands}`,
    );
  });
}

function printPureTable(results) {
  console.log("\nPure vanilla calibration variants");
  console.log("variant | avgR | med | p90 | terr | life | timeout | p0 | 4ret | oracle | realized | kills | attackReact | rotations | rotShare | weakKill | stuck | manaUse | firstSummonMed | board3Med | deckEmpty | emptyMed | reshuffle | reshuffleMed | destroyMana | reactUnused");
  console.log("---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:");
  for (const result of results) {
    const s = result.summary;
    const oracle = s.check4OracleChecksPerGame > 0 ? formatPct(s.check4OracleReturnableRate) : "-";
    const realized = s.check4OracleChecksPerGame > 0 ? formatPct(s.check4OracleRealizationRate) : "-";
    console.log(
      `${result.variant.name} | ${s.avgRounds.toFixed(2)} | ${s.medianRounds.toFixed(1)} | ${s.p90Rounds.toFixed(1)} | ${formatPct(s.territoryWinRate)} | ${formatPct(s.lifeWinRate)} | ${formatPct(s.timeoutRate)} | ${formatPct(s.p0WinRate)} | ${formatPct(s.check4ReturnRate)} | ${oracle} | ${realized} | ${s.killsPerGame.toFixed(1)} | ${s.attackReactivationsPerGame.toFixed(1)} | ${s.rotationsPerGame.toFixed(1)} | ${formatPct(s.rotationShare)} | ${formatPct(s.weakKillRate)} | ${formatPct(s.summonStallRate)} | ${formatPct(s.manaUtilization)} | ${formatNullable(s.firstSummon.medianRound)} | ${formatNullable(s.board3.medianRound)} | ${formatPct(s.deckEmptyGameRate)} | ${formatNullable(s.firstDeckEmptyMedianRound)} | ${formatPct(s.deckReshuffleGameRate)} | ${formatNullable(s.firstDeckReshuffleMedianRound)} | ${s.destroyManaGainedPerGame.toFixed(1)} | ${formatPct(s.reactivationUnusedRate)}`,
    );
  }
}

function r1FirstplayerConfidence(p0Wins, games) {
  const p = games > 0 ? p0Wins / games : null;
  if (p == null) return { p0WinRate: null, margin95: null, lower95: null, upper95: null };
  const margin95 = 1.96 * Math.sqrt((p * (1 - p)) / games);
  return {
    p0WinRate: p,
    margin95,
    lower95: Math.max(0, p - margin95),
    upper95: Math.min(1, p + margin95),
  };
}

function r1FirstplayerResultRow(gameResults, batchIndex, startGame, endGame) {
  const summary = summarize(gameResults);
  const p0Wins = Math.round(summary.p0WinRate * gameResults.length);
  return {
    batch: batchIndex + 1,
    startGame,
    endGame,
    games: gameResults.length,
    p0Wins,
    ...r1FirstplayerConfidence(p0Wins, gameResults.length),
    avgRounds: summary.avgRounds,
    territoryWinRate: summary.territoryWinRate,
    timeoutRate: summary.timeoutRate,
  };
}

function r1Firstplayer32kMarkdown(output, { resultJsonSha256 }) {
  const overall = output.overall;
  const lines = [
    "# R1構成 先手勝率 高精度測定",
    "",
    `Date: ${output.generatedAt}`,
    "",
    "## 全体結果",
    "",
    "| 指標 | 値 |",
    "|---|---:|",
    `| 試合数 | ${overall.games.toLocaleString("en-US")} |`,
    `| 先手勝利数 | ${overall.p0Wins.toLocaleString("en-US")} |`,
    `| 先手勝率 | ${formatPct(overall.p0WinRate)} |`,
    `| 95%信頼区間 | ${formatPct(overall.lower95)} - ${formatPct(overall.upper95)} |`,
    `| 95%信頼区間の幅(±) | ${formatPct(overall.margin95)} |`,
    `| 参考: 平均R | ${overall.avgRounds.toFixed(2)} |`,
    `| 参考: 占拠勝ち率 | ${formatPct(overall.territoryWinRate)} |`,
    `| 参考: 引き分け/タイムアウト率 | ${formatPct(overall.timeoutRate)} |`,
    "",
    "目標帯50〜53%との位置関係は測定結果として記載する。採用判定は行わない。",
    "",
    "## 2000試合バッチ別",
    "",
    "| Batch | 試合範囲 | 先手勝利数 | 先手勝率 |",
    "|---:|---:|---:|---:|",
  ];
  for (const batch of output.batches) {
    lines.push(`| ${batch.batch} | ${batch.startGame + 1}-${batch.endGame} | ${batch.p0Wins} | ${formatPct(batch.p0WinRate)} |`);
  }
  const rates = output.batches.map((batch) => batch.p0WinRate);
  lines.push(
    "",
    `バッチ別レンジ: ${formatPct(Math.min(...rates))} - ${formatPct(Math.max(...rates))}`,
    "",
    "## 構成",
    "",
    "- R1/v3.1固定: HP hybrid、ATK high、lowmid分布。",
    "- 再命令コスト: heavy `2/3/3/3/3/4`。回転攻撃②あり。",
    "- 式神16枚のみ、霊具なし、先手霊力3・後手霊力4、DESTROY_MANA_GAIN=1、マナ上限15。",
    "- エンジン・カード数値は変更せず、先手勝率の測定のみ行った。",
    "",
    "## 再現情報",
    "",
    "```powershell",
    output.reproducibility.command,
    "```",
    "",
    "| Artifact | Value |",
    "|---|---|",
    `| Repo HEAD | \`${output.reproducibility.repoHead}\` |`,
    `| Script SHA256 | \`${output.reproducibility.scriptSha256}\` |`,
    `| Result JSON SHA256 | \`${resultJsonSha256}\` |`,
    `| Seed | ${output.reproducibility.seed} |`,
    `| Games | ${output.reproducibility.games.toLocaleString("en-US")} |`,
    `| Oracle | ${output.reproducibility.oracle ? "yes" : "no"} |`,
    `| Check-search depth | ${output.reproducibility.checkSearchDepth} |`,
    "",
    `JSON: \`${R1_FIRSTPLAYER_32K_OUT_PATH}\``,
  );
  return `${lines.join("\n")}\n`;
}

function runR1Firstplayer32k(args) {
  fs.mkdirSync(path.dirname(R1_FIRSTPLAYER_32K_OUT_PATH), { recursive: true });
  const games = 32000;
  const batchSize = 2000;
  const variant = makeBaselineV31CenterVariant();
  const cardsByFaction = { [PURE_FACTION]: [] };
  const allResults = [];
  const batches = [];

  for (let batchIndex = 0; batchIndex < games / batchSize; batchIndex++) {
    const batchResults = [];
    const startGame = batchIndex * batchSize;
    for (let offset = 0; offset < batchSize; offset++) {
      const gameIndex = startGame + offset;
      const seed = (args.seed + gameIndex * 9176) >>> 0;
      batchResults.push(simulateGame(PURE_FACTION, PURE_FACTION, cardsByFaction, variant, seed));
    }
    allResults.push(...batchResults);
    batches.push(r1FirstplayerResultRow(batchResults, batchIndex, startGame, startGame + batchSize));
    console.error(`r1 firstplayer: simulated ${startGame + batchSize}/${games}`);
  }

  const summary = summarize(allResults);
  const p0Wins = Math.round(summary.p0WinRate * games);
  const confidence = r1FirstplayerConfidence(p0Wins, games);
  const command = "node scripts\\explore-stat-curves.cjs --r1-firstplayer-32k --seed 20260702";
  const output = {
    generatedAt: new Date().toISOString(),
    status: "complete",
    assumptions: {
      task: path.join(ROOT, "docs", "codex-task-r1-firstplayer-32k.md"),
      configuration: {
        name: "R1 / v3.1",
        variant,
        oracle: false,
        checkSearchDepth: 6,
        engineChanged: false,
      },
      seedSeries: "seed + gameIndex * 9176, gameIndex 0..31999",
      batchSize,
    },
    reproducibility: {
      command,
      repoHead: gitHead(),
      scriptPath: __filename,
      scriptSha256: sha256File(__filename),
      seed: args.seed,
      games,
      oracle: false,
      checkSearchDepth: 6,
    },
    overall: {
      games,
      p0Wins,
      ...confidence,
      avgRounds: summary.avgRounds,
      territoryWinRate: summary.territoryWinRate,
      timeoutRate: summary.timeoutRate,
    },
    batches,
  };
  fs.writeFileSync(R1_FIRSTPLAYER_32K_OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  const resultJsonSha256 = sha256File(R1_FIRSTPLAYER_32K_OUT_PATH);
  fs.writeFileSync(R1_FIRSTPLAYER_32K_MD_PATH, r1Firstplayer32kMarkdown(output, { resultJsonSha256 }), "utf8");
  console.log(`Wrote ${path.relative(ROOT, R1_FIRSTPLAYER_32K_OUT_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, R1_FIRSTPLAYER_32K_MD_PATH)}`);
  console.log(`first-player win rate: ${formatPct(confidence.p0WinRate)} [${formatPct(confidence.lower95)}, ${formatPct(confidence.upper95)}]`);
}

function shapes0718MetricRows(summary, baseline) {
  const metrics = [
    ["平均R", "avgRounds", 2, false],
    ["中央値R", "medianRounds", 1, false],
    ["P90 R", "p90Rounds", 1, false],
    ["占拠勝ち率", "territoryWinRate", 1, true],
    ["生命勝ち率", "lifeWinRate", 1, true],
    ["タイムアウト率", "timeoutRate", 1, true],
    ["先手勝率", "p0WinRate", 1, true],
    ["4チェック返し率", "check4ReturnRate", 1, true],
    ["4チェック返しオラクル率", "check4OracleReturnableRate", 1, true],
    ["撃破数/試合", "killsPerGame", 2, false],
    ["弱点撃破率", "weakKillRate", 1, true],
    ["攻撃系再命令/試合", "attackReactivationsPerGame", 2, false],
    ["③攻撃再命令/試合", "attackOnlyReactivationsPerGame", 2, false],
    ["②回転攻撃/試合", "rotateAttacksPerGame", 2, false],
    ["①回転/試合", "rotationsPerGame", 2, false],
    ["再命令未使用率", "reactivationUnusedRate", 1, true],
    ["召喚手詰まり率", "summonStallRate", 1, true],
    ["マナ利用率", "manaUtilization", 1, true],
  ];
  return metrics.map(([label, key, digits, percent]) => {
    const value = summary[key] ?? 0;
    const base = baseline?.[key] ?? null;
    const format = (v) => percent ? formatPct(v) : v.toFixed(digits);
    const delta = base == null ? "-" : percent ? fmtDeltaPct(value - base) : fmtDelta(value - base, digits);
    return { label, key, value: format(value), delta };
  });
}

function shapes0718Markdown(output, { resultJsonSha256 }) {
  const rows = shapes0718MetricRows(output.run.summary, output.baseline.summary);
  const lines = [
    "# 7/18 形状バリエーション検証ラン",
    "",
    `Date: ${output.generatedAt}`,
    "",
    "## 全KPI",
    "",
    "| 指標 | 形状入り | R1素体対照 | 差分 |",
    "|---|---:|---:|---:|",
  ];
  for (const row of rows) {
    const baselineValue = output.baseline.summary[row.key] ?? 0;
    const percent = ["territoryWinRate", "lifeWinRate", "timeoutRate", "p0WinRate", "check4ReturnRate", "check4OracleReturnableRate", "weakKillRate", "reactivationUnusedRate", "summonStallRate", "manaUtilization"].includes(row.key);
    const digits = ["avgRounds", "killsPerGame", "attackReactivationsPerGame", "attackOnlyReactivationsPerGame", "rotateAttacksPerGame", "rotationsPerGame"].includes(row.key) ? 2 : 1;
    const baseText = percent ? formatPct(baselineValue) : baselineValue.toFixed(digits);
    lines.push(`| ${row.label} | ${row.value} | ${baseText} | ${row.delta} |`);
  }
  lines.push(
    "",
    "先手勝率は2000試合の参考値であり、判定には使わない。",
    "",
    "## 形状別内訳",
    "",
    "| 形状 | 撃破数 | 被撃破数 | ③攻撃再命令 | ②回転攻撃 |",
    "|---|---:|---:|---:|---:|",
  );
  for (const shape of PURE_SHAPES_0718) {
    const stat = output.run.summary.shapeStats[shape.shape];
    lines.push(`| ${shape.name} (${shape.shape}) | ${stat.kills} (${stat.killsPerGame.toFixed(2)}/試合) | ${stat.deaths} (${stat.deathsPerGame.toFixed(2)}/試合) | ${stat.attackOnlyReacts} (${stat.attackOnlyReactsPerGame.toFixed(2)}/試合) | ${stat.rotateAttackReacts} (${stat.rotateAttackReactsPerGame.toFixed(2)}/試合) |`);
  }
  lines.push(
    "",
    "## 構成と実装ノート",
    "",
    "- R1/v3.1のステータス・再命令コスト・霊力設定は固定し、式神16枚の形状だけを変更した。形状税はなし。",
    "- 足軽4、剣士4、弓兵2、斧兵2、双頭2、旋風1、竜1。全員 physical / choice / 対象1体。",
    "- 物理カードの反撃判定は `attack_cells` を参照し、反撃範囲=攻撃範囲とした。死角攻撃と撃破済み反撃不可は既存裁定を維持した。",
    "- AI、チェック探索、オラクルの対象選択ロジックは追加変更していない。",
    "",
    "## 再現情報",
    "",
    "```powershell",
    output.reproducibility.command,
    "```",
    "",
    "| Artifact | Value |",
    "|---|---|",
    `| Repo HEAD | \`${output.reproducibility.repoHead}\` |`,
    `| Script SHA256 | \`${output.reproducibility.scriptSha256}\` |`,
    `| Result JSON SHA256 | \`${resultJsonSha256}\` |`,
    `| Games | ${output.reproducibility.games} |`,
    `| Seed | ${output.reproducibility.seed} |`,
    `| Oracle / depth | yes / ${output.reproducibility.checkSearchDepth} |`,
    "",
    `JSON: \`${SHAPES_0718_OUT_PATH}\``,
  );
  return `${lines.join("\n")}\n`;
}

function runShapes0718(args) {
  fs.mkdirSync(path.dirname(SHAPES_0718_OUT_PATH), { recursive: true });
  const variant = {
    ...makeBaselineV31CenterVariant(),
    name: "shapes_0718_R1_v31",
    phase: "shapes-0718",
    shapeDeck0718: true,
  };
  const cardsByFaction = { [PURE_FACTION]: [] };
  const gameResults = [];
  for (let i = 0; i < 2000; i++) {
    const seed = (args.seed + i * 9176) >>> 0;
    gameResults.push(simulateGame(PURE_FACTION, PURE_FACTION, cardsByFaction, variant, seed));
    if ((i + 1) % 100 === 0 || i === 1999) console.error(`shapes 0718: simulated ${i + 1}/2000`);
  }
  const summary = summarize(gameResults);
  const baselinePath = path.join(ROOT, "docs", "baselines", "phase2d-rotate-attack-results.json");
  const baselineData = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const baselineRun = baselineData.runs.find((run) => run.variant.runId === "R1");
  if (!baselineRun) throw new Error("Could not find R1 baseline in phase2d results");
  const command = "node scripts\\explore-stat-curves.cjs --shapes-0718 --seed 20260702";
  const output = {
    generatedAt: new Date().toISOString(),
    status: "complete",
    assumptions: {
      task: path.join(ROOT, "docs", "codex-task-shapes-0718.md"),
      testPackage: path.join(ROOT, "docs", "test-package-0718.md"),
      configuration: variant,
      counterRule: "Physical counter range is attack_cells; magic has no counterattack.",
      oracle: true,
      checkSearchDepth: 6,
    },
    reproducibility: {
      command,
      repoHead: gitHead(),
      scriptPath: __filename,
      scriptSha256: sha256File(__filename),
      games: 2000,
      seed: args.seed,
      oracle: true,
      checkSearchDepth: 6,
    },
    run: { variant, summary },
    baseline: {
      source: baselinePath,
      runId: baselineRun.variant.runId,
      variant: baselineRun.variant,
      summary: baselineRun.summary,
    },
  };
  fs.writeFileSync(SHAPES_0718_OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  const resultJsonSha256 = sha256File(SHAPES_0718_OUT_PATH);
  fs.writeFileSync(SHAPES_0718_MD_PATH, shapes0718Markdown(output, { resultJsonSha256 }), "utf8");
  console.log(`Wrote ${path.relative(ROOT, SHAPES_0718_OUT_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, SHAPES_0718_MD_PATH)}`);
}

function shapes0718D1Markdown(output, { resultJsonSha256 }) {
  const metrics = shapes0718MetricRows(output.run.summary, output.baseline.summary);
  const lines = [
    "# 7/18 形状構成 切り分けラン D1",
    "",
    `Date: ${output.generatedAt}`,
    "",
    "## 全KPI 3列比較",
    "",
    "| 指標 | 素体R1 | 形状+反撃=攻撃範囲 | 形状+反撃=前1(D1) |",
    "|---|---:|---:|---:|",
  ];
  const percentKeys = new Set(["territoryWinRate", "lifeWinRate", "timeoutRate", "p0WinRate", "check4ReturnRate", "check4OracleReturnableRate", "weakKillRate", "reactivationUnusedRate", "summonStallRate", "manaUtilization"]);
  const fixedDigits = new Set(["avgRounds", "killsPerGame", "attackReactivationsPerGame", "attackOnlyReactivationsPerGame", "rotateAttacksPerGame", "rotationsPerGame"]);
  for (const row of metrics) {
    const key = row.key;
    const format = (value) => percentKeys.has(key) ? formatPct(value) : value.toFixed(fixedDigits.has(key) ? 2 : (key === "medianRounds" || key === "p90Rounds" ? 1 : 2));
    lines.push(`| ${row.label} | ${format(output.baseline.summary[key] ?? 0)} | ${format(output.previous.run.summary[key] ?? 0)} | ${format(output.run.summary[key] ?? 0)} |`);
  }
  lines.push(
    "",
    "先手勝率は各2000試合の参考値であり、判定には使わない。",
    "",
    "## 形状別内訳 3列比較",
    "",
    "| 形状 | 指標 | 素体R1 | 形状+反撃=攻撃範囲 | D1:形状+反撃=前1 |",
    "|---|---|---:|---:|---:|",
  );
  const shapeMetrics = [
    ["kills", "撃破数"],
    ["deaths", "被撃破数"],
    ["attackOnlyReacts", "③攻撃再命令"],
    ["rotateAttackReacts", "②回転攻撃"],
  ];
  for (const shape of PURE_SHAPES_0718) {
    const current = output.run.summary.shapeStats[shape.shape];
    const previous = output.previous.run.summary.shapeStats[shape.shape];
    const baseline = output.baseline.summary.shapeStats?.[shape.shape] ?? { kills: 0, deaths: 0, attackOnlyReacts: 0, rotateAttackReacts: 0 };
    for (const [key, label] of shapeMetrics) {
      lines.push(`| ${shape.name} (${shape.shape}) | ${label} | ${baseline[key] ?? 0} | ${previous[key] ?? 0} | ${current[key] ?? 0} |`);
    }
  }
  lines.push(
    "",
    "## 実装ノート",
    "",
    "- 前回shapes-0718と同じ7形状、16枚デッキ、R1/v3.1のステータス・再命令・霊力・シード系列を使用した。",
    "- 攻撃範囲と弱点範囲は変更していない。今回変更したのは物理カードの `counter_cells` のみで、全形状を `[[1,0]]` にした。",
    "- 反撃判定は `counter_cells` を参照する。死角攻撃・撃破済み反撃不可・物理のみの裁定は継続した。",
    "- AI、チェック探索、オラクルの対象選択ロジックは追加変更していない。",
    "",
    "## 再現情報",
    "",
    "```powershell",
    output.reproducibility.command,
    "```",
    "",
    "| Artifact | Value |",
    "|---|---|",
    `| Repo HEAD | \`${output.reproducibility.repoHead}\` |`,
    `| Script SHA256 | \`${output.reproducibility.scriptSha256}\` |`,
    `| Result JSON SHA256 | \`${resultJsonSha256}\` |`,
    `| Games | ${output.reproducibility.games} |`,
    `| Seed | ${output.reproducibility.seed} |`,
    `| Oracle / depth | yes / ${output.reproducibility.checkSearchDepth} |`,
    "",
    `JSON: \`${SHAPES_0718_D1_OUT_PATH}\``,
  );
  return `${lines.join("\n")}\n`;
}

function runShapes0718D1(args) {
  fs.mkdirSync(path.dirname(SHAPES_0718_D1_OUT_PATH), { recursive: true });
  const variant = {
    ...makeBaselineV31CenterVariant(),
    name: "shapes_0718_d1_R1_v31_counter_front1",
    phase: "shapes-0718-d1",
    shapeDeck0718: true,
    counterFront1: true,
  };
  const cardsByFaction = { [PURE_FACTION]: [] };
  const gameResults = [];
  for (let i = 0; i < 2000; i++) {
    const seed = (args.seed + i * 9176) >>> 0;
    gameResults.push(simulateGame(PURE_FACTION, PURE_FACTION, cardsByFaction, variant, seed));
    if ((i + 1) % 100 === 0 || i === 1999) console.error(`shapes 0718 d1: simulated ${i + 1}/2000`);
  }
  const summary = summarize(gameResults);
  const previous = JSON.parse(fs.readFileSync(SHAPES_0718_OUT_PATH, "utf8"));
  const phase2d = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "baselines", "phase2d-rotate-attack-results.json"), "utf8"));
  const baselineRun = phase2d.runs.find((run) => run.variant.runId === "R1");
  if (!baselineRun) throw new Error("Could not find R1 baseline in phase2d results");
  const command = "node scripts\\explore-stat-curves.cjs --shapes-0718-d1 --seed 20260702";
  const output = {
    generatedAt: new Date().toISOString(),
    status: "complete",
    assumptions: {
      task: path.join(ROOT, "docs", "codex-task-shapes-0718-d1.md"),
      previousRun: SHAPES_0718_OUT_PATH,
      configuration: variant,
      counterRule: "All physical shape cards use counter_cells [[1,0]]; attack_cells unchanged.",
      oracle: true,
      checkSearchDepth: 6,
    },
    reproducibility: {
      command,
      repoHead: gitHead(),
      scriptPath: __filename,
      scriptSha256: sha256File(__filename),
      games: 2000,
      seed: args.seed,
      oracle: true,
      checkSearchDepth: 6,
    },
    run: { variant, summary },
    previous,
    baseline: {
      source: path.join(ROOT, "docs", "baselines", "phase2d-rotate-attack-results.json"),
      runId: baselineRun.variant.runId,
      variant: baselineRun.variant,
      summary: baselineRun.summary,
    },
  };
  fs.writeFileSync(SHAPES_0718_D1_OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  const resultJsonSha256 = sha256File(SHAPES_0718_D1_OUT_PATH);
  fs.writeFileSync(SHAPES_0718_D1_MD_PATH, shapes0718D1Markdown(output, { resultJsonSha256 }), "utf8");
  console.log(`Wrote ${path.relative(ROOT, SHAPES_0718_D1_OUT_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, SHAPES_0718_D1_MD_PATH)}`);
}

function shapes0718M2Definitions() {
  return PURE_SHAPES_0718.map((shape) => ({
    ...shape,
    weaknessCells: shape.shape === "kyuhei" || shape.shape === "souto" ? [[0, -1]] : shape.weaknessCells,
  }));
}

function runShapes0718MVariant(variant, args, label) {
  const cardsByFaction = { [PURE_FACTION]: [] };
  const gameResults = [];
  for (let i = 0; i < 2000; i++) {
    const seed = (args.seed + i * 9176) >>> 0;
    gameResults.push(simulateGame(PURE_FACTION, PURE_FACTION, cardsByFaction, variant, seed));
    if ((i + 1) % 100 === 0 || i === 1999) console.error(`${label}: simulated ${i + 1}/2000`);
  }
  return { variant, summary: summarize(gameResults) };
}

function shapes0718MMetricFormat(key, value) {
  const percentKeys = new Set(["territoryWinRate", "lifeWinRate", "timeoutRate", "p0WinRate", "check4ReturnRate", "check4OracleReturnableRate", "weakKillRate", "reactivationUnusedRate", "summonStallRate", "manaUtilization"]);
  if (percentKeys.has(key)) return formatPct(value);
  if (["medianRounds", "p90Rounds"].includes(key)) return value.toFixed(1);
  return value.toFixed(2);
}

function shapes0718MMarkdown(output, { resultJsonSha256 }) {
  const metrics = shapes0718MetricRows(output.runs.M1.summary, output.baseline.summary);
  const lines = [
    "# 7/18 形状構成トリム版 Mバッチ",
    "",
    `Date: ${output.generatedAt}`,
    "",
    "## 全KPI 5列比較",
    "",
    "| 指標 | 素体R1 | 形状フル+反撃=攻撃範囲 | D1 | M1 | M1a |",
    "|---|---:|---:|---:|---:|---:|",
  ];
  for (const row of metrics) {
    lines.push(`| ${row.label} | ${shapes0718MMetricFormat(row.key, output.baseline.summary[row.key] ?? 0)} | ${shapes0718MMetricFormat(row.key, output.full.summary[row.key] ?? 0)} | ${shapes0718MMetricFormat(row.key, output.d1.summary[row.key] ?? 0)} | ${shapes0718MMetricFormat(row.key, output.runs.M1.summary[row.key] ?? 0)} | ${shapes0718MMetricFormat(row.key, output.runs.M1a.summary[row.key] ?? 0)} |`);
  }
  lines.push(
    "",
    "先手勝率は各2000試合の参考値であり、判定には使わない。",
    "",
    "## M2参考ラン(D1との対比)",
    "",
    "| 指標 | D1 | M2 | 差分(M2-D1) |",
    "|---|---:|---:|---:|",
  );
  for (const row of metrics) {
    const d1 = output.d1.summary[row.key] ?? 0;
    const m2 = output.runs.M2.summary[row.key] ?? 0;
    const percent = ["territoryWinRate", "lifeWinRate", "timeoutRate", "p0WinRate", "check4ReturnRate", "check4OracleReturnableRate", "weakKillRate", "reactivationUnusedRate", "summonStallRate", "manaUtilization"].includes(row.key);
    lines.push(`| ${row.label} | ${shapes0718MMetricFormat(row.key, d1)} | ${shapes0718MMetricFormat(row.key, m2)} | ${percent ? fmtDeltaPct(m2 - d1) : fmtDelta(m2 - d1, ["medianRounds", "p90Rounds"].includes(row.key) ? 1 : 2)} |`);
  }
  lines.push(
    "",
    "## M1/M1a形状別内訳",
    "",
    "| 形状 | 指標 | M1(反撃前1) | M1a(反撃=攻撃範囲) |",
    "|---|---|---:|---:|",
  );
  for (const shape of PURE_SHAPES_M_0718) {
    for (const [key, label] of [["kills", "撃破数"], ["deaths", "被撃破数"], ["attackOnlyReacts", "③攻撃再命令"], ["rotateAttackReacts", "②回転攻撃"]]) {
      lines.push(`| ${shape.name} (${shape.shape}) | ${label} | ${output.runs.M1.summary.shapeStats[shape.shape]?.[key] ?? 0} | ${output.runs.M1a.summary.shapeStats[shape.shape]?.[key] ?? 0} |`);
    }
  }
  lines.push(
    "",
    "## 構成と実装ノート",
    "",
    "- M1/M1aは足軽4、剣士4、弓兵1、斧兵1、重剣2、双頭1、大剣1、旋風1、竜1の16枚。重剣・大剣はC4/C5の前1・弱点後1。",
    "- M1は全形状の反撃範囲を前1、M1aは各形状の攻撃範囲と同一にした。M2は旧7形状で弓兵・双頭の弱点を右1へ縮小し、反撃前1。",
    "- ステータス、霊力、再命令コスト、攻撃範囲、AI、チェック探索、オラクル深度以外のルールは変更していない。",
    "",
    "## 再現情報",
    "",
    "```powershell",
    output.reproducibility.command,
    "```",
    "",
    "| Artifact | Value |",
    "|---|---|",
    `| Repo HEAD | \`${output.reproducibility.repoHead}\` |`,
    `| Script SHA256 | \`${output.reproducibility.scriptSha256}\` |`,
    `| Result JSON SHA256 | \`${resultJsonSha256}\` |`,
    `| Games per run | ${output.reproducibility.gamesPerRun} |`,
    `| Seed | ${output.reproducibility.seed} |`,
    `| Oracle / depth | yes / ${output.reproducibility.checkSearchDepth} |`,
    "",
    `JSON: \`${SHAPES_0718_M_OUT_PATH}\``,
  );
  return `${lines.join("\n")}\n`;
}

function runShapes0718M(args) {
  fs.mkdirSync(path.dirname(SHAPES_0718_M_OUT_PATH), { recursive: true });
  const base = makeBaselineV31CenterVariant();
  const mDefinitions = PURE_SHAPES_M_0718;
  const m1 = { ...base, name: "shapes_0718_M1_counter_front1", phase: "shapes-0718-m", shapeDeck0718: true, shapeDefinitions: mDefinitions, counterFront1: true };
  const m1a = { ...base, name: "shapes_0718_M1a_counter_attack", phase: "shapes-0718-m", shapeDeck0718: true, shapeDefinitions: mDefinitions, counterFront1: false };
  const m2 = { ...base, name: "shapes_0718_M2_narrow_weakness_counter_front1", phase: "shapes-0718-m", shapeDeck0718: true, shapeDefinitions: shapes0718M2Definitions(), counterFront1: true };
  const runs = {
    M1: runShapes0718MVariant(m1, args, "shapes 0718 M1"),
    M1a: runShapes0718MVariant(m1a, args, "shapes 0718 M1a"),
    M2: runShapes0718MVariant(m2, args, "shapes 0718 M2"),
  };
  const full = JSON.parse(fs.readFileSync(SHAPES_0718_OUT_PATH, "utf8"));
  const d1 = JSON.parse(fs.readFileSync(SHAPES_0718_D1_OUT_PATH, "utf8"));
  const phase2d = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "baselines", "phase2d-rotate-attack-results.json"), "utf8"));
  const baselineRun = phase2d.runs.find((run) => run.variant.runId === "R1");
  if (!baselineRun) throw new Error("Could not find R1 baseline in phase2d results");
  const command = "node scripts\\explore-stat-curves.cjs --shapes-0718-m --seed 20260702";
  const output = {
    generatedAt: new Date().toISOString(),
    status: "complete",
    assumptions: {
      task: path.join(ROOT, "docs", "codex-task-shapes-0718-m.md"),
      configuration: "M1/M1a/M2, all R1/v3.1 settings fixed",
      oracle: true,
      checkSearchDepth: 6,
    },
    reproducibility: { command, repoHead: gitHead(), scriptPath: __filename, scriptSha256: sha256File(__filename), gamesPerRun: 2000, seed: args.seed, oracle: true, checkSearchDepth: 6 },
    baseline: { source: path.join(ROOT, "docs", "baselines", "phase2d-rotate-attack-results.json"), variant: baselineRun.variant, summary: baselineRun.summary },
    full: { source: SHAPES_0718_OUT_PATH, run: full.run, summary: full.run.summary },
    d1: { source: SHAPES_0718_D1_OUT_PATH, run: d1.run, summary: d1.run.summary },
    runs,
  };
  fs.writeFileSync(SHAPES_0718_M_OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  const resultJsonSha256 = sha256File(SHAPES_0718_M_OUT_PATH);
  fs.writeFileSync(SHAPES_0718_M_MD_PATH, shapes0718MMarkdown(output, { resultJsonSha256 }), "utf8");
  console.log(`Wrote ${path.relative(ROOT, SHAPES_0718_M_OUT_PATH)}`);
  console.log(`Wrote ${path.relative(ROOT, SHAPES_0718_M_MD_PATH)}`);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.phase2aMainSearch) {
    runPhase2a(args);
    return;
  }
  if (args.phase2aFreezeA) {
    runPhase2aFreezeA(args);
    return;
  }
  if (args.phase2bItemLayer) {
    runPhase2bItemLayer(args);
    return;
  }
  if (args.reactCostSweep) {
    runReactCostSweep(args);
    return;
  }
  if (args.phase2dRotateAttack) {
    runPhase2dRotateAttack(args);
    return;
  }
  if (args.standardManaHandicap) {
    runStandardManaHandicap(args);
    return;
  }
  if (args.v31FreezeAndItems) {
    runV31FreezeAndItems(args);
    return;
  }
  if (args.reactValueForkedV2) {
    runReactValueForkedV2(args);
    return;
  }
  if (args.r1Firstplayer32k) {
    runR1Firstplayer32k(args);
    return;
  }
  if (args.shapes0718) {
    runShapes0718(args);
    return;
  }
  if (args.shapes0718D1) {
    runShapes0718D1(args);
    return;
  }
  if (args.shapes0718M) {
    runShapes0718M(args);
    return;
  }
  if (args.reactValueForked) {
    runReactValueForked(args);
    return;
  }
  const raw = args.pureVanillaGrid ? null : JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const variants = makeVariants(args);
  const random = rng(args.seed);
  const baseCards = raw ? raw.characters.filter((c) => FOCUS_FACTIONS.includes(c.faction)) : [];

  const output = {
    generatedAt: new Date().toISOString(),
    assumptions: {
      focusFactions: FOCUS_FACTIONS,
      lifeTotal: LIFE_TOTAL,
      manaGain: 3,
      manaCap: MANA_CAP,
      startManaFirst: args.pureVanillaGrid ? START_MANA_FIRST : 0,
      startManaSecond: args.pureVanillaGrid ? START_MANA_SECOND : args.p1Mana,
      maxHp: MAX_HP,
      destroyManaGain: DESTROY_MANA_GAIN,
      oracle: args.oracle,
      checkSearchDepth: args.checkSearchDepth,
      rotationGrid: args.rotationGrid,
      deckRulesGrid: args.deckRulesGrid,
      pureVanillaGrid: args.pureVanillaGrid,
      deckCreatures: args.deckCreatures,
      fatigue: args.fatigue,
      deckRulesDraft: args.deckRulesDraft,
      weakPhysicalBonus: WEAK_BONUS,
      noCost1Creatures: "cost 1 creature shapes are kept but treated as cost 2",
      effects: "ignored except attack shape/type/counter/weakness",
      items: "ignored",
      rounds: "reported as half-turns / 2",
      samplesPerVariant: args.samples,
      pureVanilla: args.pureVanillaGrid
        ? {
            faction: PURE_FACTION,
            curves: PURE_CURVES,
            distributions: PURE_DISTRIBUTIONS,
            template: {
              attack_cells: [[1, 0]],
              counter_cells: [[1, 0]],
              weakness_cells: [[-1, 0]],
              attack_type: "physical",
              attack_mode: "choice",
              attack_target_count: 1,
            },
            attributeAssignment: "each 16-card deck gets an exactly even shuffled bag of the four non-neutral board attributes",
            boardAttributes: PURE_BOARD_ATTRS,
            deckExhaustion: "shuffle discard into a new deck; no fatigue or deck-out loss",
          }
        : null,
    },
    variants: [],
  };

  for (let v = 0; v < variants.length; v++) {
    const variant = variants[v];
    const generatedCards = variant.pureVanilla ? [] : baseCards.map((card) => generateCard(card, variant));
    const cardsByFaction = variant.pureVanilla
      ? { [PURE_FACTION]: [] }
      : Object.fromEntries(
          FOCUS_FACTIONS.map((faction) => [faction, generatedCards.filter((c) => c.faction === faction)]),
        );
    const gameResults = [];
    for (let i = 0; i < args.samples; i++) {
      const p0 = variant.pureVanilla ? PURE_FACTION : pick(FOCUS_FACTIONS, random);
      const p1 = variant.pureVanilla ? PURE_FACTION : pick(FOCUS_FACTIONS, random);
      const seed = (args.seed + v * 1000003 + i * 9176) >>> 0;
      gameResults.push(simulateGame(p0, p1, cardsByFaction, variant, seed));
    }
    const summary = summarize(gameResults);
    if (args.pureVanillaGrid) output.variants.push({ variant, summary });
    else output.variants.push({ variant, score: scoreSummary(summary), summary });
    if (args.rotationGrid || args.deckRulesGrid || args.pureVanillaGrid || (v + 1) % 12 === 0 || v + 1 === variants.length) {
      console.error(`simulated ${v + 1}/${variants.length} variants`);
    }
  }

  if (!args.pureVanillaGrid) output.variants.sort((a, b) => a.score - b.score);
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  if (args.pureVanillaGrid) printPureTable(output.variants);
  else printTable(output.variants, args.top);
  console.log(`\nWrote ${path.relative(ROOT, OUT_PATH)}`);
}

main();
