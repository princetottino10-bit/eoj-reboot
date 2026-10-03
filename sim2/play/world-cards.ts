// The 式神 cards: the pieces of a real mid-game position standing in their
// cells on the 九宮盤 (world-position.ts), and the two hero cards, 玖龍街 and
// 酒呑童子, hovering behind the board. Every card keeps its face to the viewer;
// facing is the arrow on the cell. Each carries the 式神の証 of the art
// direction: the 円相 of its attribute (陽 white ink, 陰 black ink, 空 a ring of
// 緑青 light — level on the ground for the place-like 付喪神, upright behind the
// others) and a small 緑青 呪紋. 緑青 means 霊力 and nothing else: held cells
// get a thin 緑青 frame and a 先/後 seat marker, not clan colours.
import * as THREE from "./vendor/three/three.module.js";
import { EFFECT_TEXT } from "../src/effects.ts";
import { canvasTex, glowSprite } from "./world-kit.ts";
import type { Obj, Quality, Vec3 } from "./world-kit.ts";
import { cardBackCanvas, cardFaceCanvas, glowCanvas, PAL } from "./world-paint.ts";
import { cellFrameCanvas, chevronCanvas, ensoCanvas, glyphCanvas, hpBadgeCanvas, ROKUSHO, seatCanvas } from "./world-marks.ts";
import type { EnsoKind } from "./world-marks.ts";
import { FACING_WORD, WORLD_HEROES, WORLD_POSITION } from "./world-position.ts";

export const PACK_URL = "/data/pack-adopted-1003.json";

type PackCard = {
  printId?: string;
  nameJa?: string;
  name: string;
  clan?: string;
  kind?: string;
  summonCost?: number;
  atk?: number;
  hp?: number;
  effect?: string;
  attribute?: string;
  art?: { card?: string };
};

export type CardInfo = {
  printId: string;
  name: string;
  clan: string;
  cost: number;
  atk: number;
  hp: number;
  effect: string;
  /** 陽 / 陰 / 空 (none) */
  attr: EnsoKind;
  art: string | null;
  /** for a piece on the board: its state there */
  board?: string;
};

type Slot = { id: string; p: Vec3; scale: number };

/** The heroes: 玖龍街 back left, 酒呑童子 back right, large and hovering. */
const HEROES: Slot[] = [
  { id: WORLD_HEROES[0], p: [-1.8, 3.0, -1.9], scale: 1.3 },
  { id: WORLD_HEROES[1], p: [1.8, 3.0, -1.9], scale: 1.3 },
];

/** Board geometry (world-roof.ts): 2.5 wide, cells 0.729 apart; player 0's row y = 0 is the far side. */
const CELL = (2.5 * (1024 - 128)) / 3 / 1024;
const cellCentre = (x: number, y: number): [number, number] => [(x - 1) * CELL, (y - 1) * CELL];
/** A piece's card, nearly a cell wide. */
const PIECE = 0.68;
/** 付喪神 and places (things, not creatures): their 円相 lies level on the ground. */
const GROUND_RING = new Set(["T-001", "T-002", "T-004", "T-008"]);

const CARD_W = 0.8;
const CARD_H = CARD_W * (740 / 512);

const clanAccent = (clan: string): string => (clan.startsWith("酒呑") ? PAL.verm : "#2f9b7a");

/** A rounded-rectangle card outline, centred on the origin. */
const cardShape = (w: number, h: number, r: number): Obj => {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
};

const THICK = 0.024;

/** Body (gilt edge), printed face and back as separate geometries, UVs 0..1 over the card. */
const cardGeometry = (): { body: Obj; face: Obj; back: Obj } => {
  const shape = cardShape(CARD_W, CARD_H, 0.05);
  const body = new THREE.ExtrudeGeometry(shape, { depth: THICK, bevelEnabled: false, curveSegments: 6 });
  body.translate(0, 0, -THICK / 2);
  const face = new THREE.ShapeGeometry(shape, 6);
  const uv = face.attributes.uv;
  const pos = face.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / CARD_W + 0.5, pos.getY(i) / CARD_H + 0.5);
  const back = face.clone();
  face.translate(0, 0, THICK / 2 + 0.0008);
  back.rotateY(Math.PI);
  back.translate(0, 0, -THICK / 2 - 0.0008);
  return { body, face, back };
};

export const parsePack = (raw: unknown): Map<string, CardInfo> => {
  const out = new Map<string, CardInfo>();
  const cards = (raw as { cards?: unknown }).cards;
  if (!Array.isArray(cards)) return out;
  for (const c of cards as PackCard[]) {
    if (typeof c.printId !== "string") continue;
    const fx = c.effect === undefined ? undefined : EFFECT_TEXT[c.effect];
    out.set(c.printId, {
      printId: c.printId,
      name: c.nameJa ?? c.name,
      clan: c.clan ?? "",
      cost: c.summonCost ?? 0,
      atk: c.atk ?? 0,
      hp: c.hp ?? 0,
      effect: fx ?? "特別な効果はない。攻撃と体力で勝負する式神",
      attr: c.attribute === "yang" || c.attribute === "yin" ? c.attribute : "none",
      art: c.art?.card ?? null,
    });
  }
  return out;
};

const loadImage = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

export type Cards = {
  root: Obj;
  meshes: Obj[];
  /** how many art images failed to load */
  missing: number;
  infoOf: (mesh: Obj) => CardInfo | null;
  select: (mesh: Obj | null) => void;
  /** squeezes the two sides toward the middle (1 = as laid out), for narrow screens */
  setSpread: (f: number) => void;
  update: (t: number, reduced: boolean, camera: Obj) => void;
};

/** Loads the art (reporting progress 0..1), then builds the heroes and the board pieces. */
export const buildCards = async (pack: Map<string, CardInfo>, q: Quality, boardY: number, onProgress: (f: number) => void): Promise<Cards> => {
  const root = new THREE.Group();
  const ids = [...new Set<string>([...WORLD_HEROES, ...WORLD_POSITION.units.map((u) => u.printId)])].filter((id) => pack.has(id));
  let done = 0;
  let missing = 0;
  const images = new Map<string, HTMLImageElement | null>();
  await Promise.all(
    ids.map(async (id) => {
      const info = pack.get(id);
      const img = info?.art ? await loadImage("/" + info.art) : null;
      if (img === null) missing += 1;
      images.set(id, img);
      done += 1;
      onProgress(done / ids.length);
    }),
  );
  const faceMats = new Map<string, Obj>();
  const faceOf = (info: CardInfo): Obj => {
    const hit = faceMats.get(info.printId);
    if (hit !== undefined) return hit;
    const tex = canvasTex(cardFaceCanvas(images.get(info.printId) ?? null, { name: info.name, clan: info.clan, accent: clanAccent(info.clan), atk: info.atk, hp: info.hp }));
    // a slightly glossy printed face, lit a little from within so the art reads at night
    const mat = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.22 });
    faceMats.set(info.printId, mat);
    return mat;
  };
  const backTex = canvasTex(cardBackCanvas());
  const backMat = new THREE.MeshPhysicalMaterial({ map: backTex, roughness: 0.4, clearcoat: 0.6, emissive: 0xffffff, emissiveMap: backTex, emissiveIntensity: 0.18 });
  const edgeMat = new THREE.MeshPhysicalMaterial({ color: "#b8913f", metalness: 0.9, roughness: 0.3 });
  const geo = cardGeometry();
  const glowTex = canvasTex(glowCanvas());
  const teal = (gain: number): Obj => new THREE.Color(ROKUSHO).multiplyScalar(gain);
  // 円相 by attribute: ink (normal blending) for 陽/陰, 緑青 light for 空
  const ensoTex: Record<EnsoKind, Obj> = { yang: canvasTex(ensoCanvas("yang")), yin: canvasTex(ensoCanvas("yin")), none: canvasTex(ensoCanvas("none")) };
  const enso = (kind: EnsoKind, size: number): Obj => {
    const light = kind === "none";
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({
        map: ensoTex[kind],
        color: light ? teal(4) : 0xffffff,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: light ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    m.raycast = () => undefined;
    return m;
  };
  const glyphTex = canvasTex(glyphCanvas());
  const glyph = (size: number): Obj => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: glyphTex, color: teal(4.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    m.raycast = () => undefined;
    return m;
  };
  const meshes: Obj[] = [];
  const byMesh = new Map<Obj, CardInfo>();
  const auras = new Map<Obj, Obj>();
  /** what turns to the viewer each frame: the card's holder */
  type Pose = { holder: Obj; p: Vec3; scale: number; phase: number; hero: boolean; ring: Obj | null; glyph: Obj };
  const pose = new Map<Obj, Pose>();
  const glyphs: Obj[] = [];
  const makeCard = (info: CardInfo): { mesh: Obj; holder: Obj } => {
    const holder = new THREE.Group();
    const mesh = new THREE.Mesh(geo.body, edgeMat);
    const face = new THREE.Mesh(geo.face, faceOf(info));
    const rear = new THREE.Mesh(geo.back, backMat);
    // the 霊力 glow: only when the card is chosen
    const aura = glowSprite(glowTex, teal(3), CARD_H * 1.5, 0);
    aura.position.z = -0.1;
    aura.raycast = () => undefined;
    mesh.add(face, rear, aura);
    for (const m of [mesh, face, rear]) {
      m.castShadow = true;
      m.userData.card = mesh;
    }
    holder.add(mesh);
    meshes.push(mesh);
    byMesh.set(mesh, info);
    auras.set(mesh, aura);
    return { mesh, holder };
  };
  // heroes
  HEROES.forEach((s, i) => {
    const info = pack.get(s.id);
    if (info === undefined) return;
    const { mesh, holder } = makeCard(info);
    holder.position.set(s.p[0], s.p[1], s.p[2]);
    holder.scale.setScalar(s.scale);
    let ring: Obj;
    if (GROUND_RING.has(s.id)) {
      // a place, not a creature: the ring lies level round it
      ring = enso(info.attr, CARD_H * 1.9);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -CARD_H * 0.42;
    } else {
      ring = enso(info.attr, CARD_H * 1.4);
      ring.position.set(0, 0.02, -0.12);
    }
    holder.add(ring);
    const g = glyph(0.16);
    g.position.set(0, -CARD_H / 2 + 0.11, THICK / 2 + 0.004);
    mesh.add(g);
    glyphs.push(g);
    root.add(holder);
    pose.set(mesh, { holder, p: s.p, scale: s.scale, phase: i * 2.1, hero: true, ring, glyph: g });
  });
  // the pieces on the board
  const frameTex = canvasTex(cellFrameCanvas());
  const chevronTex = canvasTex(chevronCanvas());
  const flatMark = (tex: Obj, color: Obj | number, size: number, y: number, additive: boolean): Obj => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.raycast = () => undefined;
    return m;
  };
  const stand = new THREE.MeshPhysicalMaterial({ color: "#0c0a0b", roughness: 0.25, clearcoat: 1 });
  const seatTex = [canvasTex(seatCanvas(0)), canvasTex(seatCanvas(1))];
  WORLD_POSITION.units.forEach((u, i) => {
    const info = pack.get(u.printId);
    if (info === undefined) return;
    const [cx, cz] = cellCentre(u.x, u.y);
    const cell = new THREE.Group();
    cell.position.set(cx, boardY, cz);
    // the held cell: a thin 緑青 frame and the seat marker in its corner
    cell.add(flatMark(frameTex, teal(3), CELL * 0.97, 0.004, true));
    const seat = flatMark(seatTex[u.owner], 0xffffff, 0.15, 0.007, false);
    seat.position.x = -CELL * 0.36;
    seat.position.z = CELL * 0.36;
    cell.add(seat);
    // facing: only the arrow on the ground says it (the engine's +y is world +z here, +x is +x)
    const ry = [0, Math.PI / 2, Math.PI, -Math.PI / 2][u.facing];
    const chevron = flatMark(chevronTex, new THREE.Color(PAL.washi).multiplyScalar(1.4), 0.2, 0.009, false);
    chevron.rotation.z = ry + Math.PI;
    chevron.position.x = Math.sin(ry) * CELL * 0.37;
    chevron.position.z = Math.cos(ry) * CELL * 0.37;
    cell.add(chevron);
    const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(hpBadgeCanvas(u.hp, u.maxHp, u.owner)), transparent: true, depthWrite: false, depthTest: false }));
    badge.scale.set(0.42, 0.16, 1);
    badge.position.y = 0.06 + CARD_H * PIECE + 0.13;
    badge.renderOrder = 20;
    badge.raycast = () => undefined;
    cell.add(badge);
    root.add(cell);
    const pieceInfo: CardInfo = { ...info, board: `盤上: 命 ${u.hp}/${u.maxHp} ・ ${FACING_WORD[u.facing]}向き ・ ${u.owner === 0 ? "先手" : "後手"}の駒` };
    const { mesh, holder } = makeCard(pieceInfo);
    const p: Vec3 = [cx, boardY + 0.04 + (CARD_H * PIECE) / 2, cz];
    holder.position.set(p[0], p[1], p[2]);
    holder.scale.setScalar(PIECE);
    // stand and 呪紋 turn with the card
    const base = new THREE.Mesh(new THREE.BoxGeometry(CARD_W * 0.8, 0.07, 0.2), stand);
    base.position.y = -CARD_H / 2 - 0.02;
    base.castShadow = true;
    base.raycast = () => undefined;
    holder.add(base);
    const g = glyph(0.13);
    g.position.set(0, -CARD_H / 2 - 0.02, 0.102);
    holder.add(g);
    glyphs.push(g);
    let ring: Obj;
    if (GROUND_RING.has(u.printId)) {
      ring = enso(info.attr, CELL * 1.02);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.006;
      cell.add(ring);
    } else {
      ring = enso(info.attr, CARD_H * 1.22);
      ring.position.set(0, 0.02, -0.1);
      holder.add(ring);
    }
    root.add(holder);
    pose.set(mesh, { holder, p, scale: PIECE, phase: i * 1.7, hero: false, ring, glyph: g });
  });
  let selected: Obj | null = null;
  let spread = 1;
  const select = (mesh: Obj | null): void => {
    selected = mesh === null ? null : (mesh.userData.card ?? mesh);
  };
  const update = (t: number, reduced: boolean, camera: Obj): void => {
    const pulse = reduced ? 1 : 0.8 + 0.2 * Math.sin(t * 1.6);
    for (const g of glyphs) g.material.opacity = pulse;
    for (const m of meshes) {
      const b = pose.get(m);
      if (b === undefined) continue;
      const on = m === selected;
      const h = b.holder;
      if (b.hero) {
        const bob = reduced ? 0 : Math.sin(t * 0.9 + b.phase) * 0.07;
        h.position.set(b.p[0] * spread, b.p[1] + bob + (on ? 0.18 : 0), b.p[2]);
      } else {
        // pieces stand still; the chosen one rises a little
        h.position.y += (b.p[1] + (on ? 0.08 : 0) - h.position.y) * 0.15;
      }
      // every card keeps its face to the viewer (turning about the vertical only)
      h.rotation.y = Math.atan2(camera.position.x - h.position.x, camera.position.z - h.position.z);
      if (b.ring !== null && !reduced) b.ring.rotation.z = (b.ring.rotation.x === 0 ? Math.sin(t * 0.3 + b.phase) * 0.15 : t * 0.12 + b.phase);
      const aura = auras.get(m);
      if (aura !== undefined) aura.material.opacity += ((on ? 0.5 : 0) - aura.material.opacity) * 0.12;
      const target = b.scale * (on ? 1.08 : 1);
      h.scale.setScalar(h.scale.x + (target - h.scale.x) * 0.15);
    }
  };
  const setSpread = (f: number): void => {
    spread = f;
  };
  return { root, meshes, missing, infoOf: (m) => byMesh.get(m.userData.card ?? m) ?? null, select, setSpread, update };
};
