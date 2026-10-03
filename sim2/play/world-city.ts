// The city around the rooftop: a Kowloon-Walled-City-like block — towers
// crowding in on every side, AC units, rusty cages, pipes, laundry poles,
// bamboo scaffolding under green netting, a narrow fire stair, a mess of
// cables, and a slot between the towers toward the moon (world-sky.ts).
// The art direction's palette is two colours: ink-navy night and RED neon
// (a few amber / white tubes); the far signs are only blurred city light.
import * as THREE from "./vendor/three/three.module.js";
import { batch, canvasTex, sagPoints, std, wires } from "./world-kit.ts";
import type { Item, Obj, Quality, Vec3 } from "./world-kit.ts";
import { facadeMaterial } from "./world-facade.ts";
import { makeCanvas, rng, signCanvases } from "./world-paint.ts";
import type { SignStyle } from "./world-paint.ts";
import { buildSky, MOON_DIR } from "./world-sky.ts";

/** Half size of the rooftop the board stands on. */
export const ROOF = 8;
const BOTTOM = -40;

const TINTS = ["#ffffff", "#e8e4dc", "#d8dde6", "#efe2d0", "#d2d6cc", "#c9c3c9"];
/** Fictional shop names, traditional Chinese: a lucky word + the trade. */
const SIGN_TEXT = ["金龍茶餐廳", "永發押", "福記冰室", "萬安藥房", "榮華酒家", "玖龍士多", "新光髮廊", "德興涼茶", "大排檔", "祥興麻雀", "同福旅館", "寶生金舖"];
const RED = "#ff3a2c";
const AMBER = "#ffb24a";
const TUBE_WHITE = "#fff0dc";
/** Mostly red; a few amber and white tubes, and painted lightboxes in red and cream. */
const SIGN_STYLES: SignStyle[] = [
  { kind: "neon", color: RED, bg: "" },
  { kind: "neon", color: RED, bg: "" },
  { kind: "neon", color: RED, bg: "" },
  { kind: "neon", color: AMBER, bg: "" },
  { kind: "neon", color: TUBE_WHITE, bg: "" },
  { kind: "box", color: "#fff4e0", bg: "#b3221b" },
  { kind: "box", color: "#b3221b", bg: "#efe6d0" },
];
/** How many of the near signs are drawn sharp enough to read. */
const CRISP_SIGNS = 3;

type Face = { n: Vec3; c: Vec3; width: number; top: number };

/** A lit sign, for the glow volume in front of it (world-volume.ts). */
export type SignGlow = { pos: Vec3; n: Vec3; ry: number; w: number; h: number; color: string };

export type City = {
  root: Obj;
  /** AC units near rooftop height: where water drips from */
  drips: Vec3[];
  /** the neon signs nearest the rooftop */
  glows: SignGlow[];
  update: (t: number, dt: number, reduced: boolean) => void;
};

const faceRy = (n: Vec3): number => Math.atan2(n[0], n[2]);

const towardMoon = (x: number, z: number, cos: number): boolean =>
  (x * MOON_DIR[0] + z * MOON_DIR[2]) / (Math.hypot(x, z) * Math.hypot(MOON_DIR[0], MOON_DIR[2])) > cos;

type Build = { towers: Item[]; faces: Face[] };

/** Towers: an inner wall right at the rooftop's edge, then the rest of the block, then the far city. */
const towers = (r: () => number, b: Build): void => {
  const inner = ROOF + 2.2;
  for (const side of [0, 1, 2, 3]) {
    let u = -inner - 3;
    while (u < inner + 3) {
      const w = 3 + r() * 3.2;
      const d = 5 + r() * 4;
      const cu = u + w / 2;
      // side 0: −z wall, 1: +z, 2: −x, 3: +x
      const off = inner + d / 2 + r() * 0.8;
      const [cx, cz] = side === 0 ? [cu, -off] : side === 1 ? [cu, off] : side === 2 ? [-off, cu] : [off, cu];
      const slot = towardMoon(cx, cz, 0.9);
      const top = slot ? 3 + r() * 4 : 20 + r() * 30;
      const [sx, sz] = side < 2 ? [w, d] : [d, w];
      b.towers.push({ p: [cx, (top + BOTTOM) / 2, cz], s: [sx, top - BOTTOM, sz], color: TINTS[Math.floor(r() * TINTS.length)] });
      const n: Vec3 = side === 0 ? [0, 0, 1] : side === 1 ? [0, 0, -1] : side === 2 ? [1, 0, 0] : [-1, 0, 0];
      const fc: Vec3 = [cx + n[0] * (sx / 2), 0, cz + n[2] * (sz / 2)];
      b.faces.push({ n, c: fc, width: w, top });
      u += w + 0.15 + r() * 0.5;
    }
  }
  // the rest of the block and the far city
  for (let gx = -9; gx <= 9; gx++) {
    for (let gz = -9; gz <= 9; gz++) {
      const x = gx * 5.2 + (r() - 0.5);
      const z = gz * 5.2 + (r() - 0.5);
      const ring = Math.max(Math.abs(x), Math.abs(z));
      if (ring < inner + 9.5 || r() < 0.06) continue;
      const slot = towardMoon(x, z, 0.93);
      const top = slot ? -4 + r() * 8 : 12 + r() * 40;
      const w = 3.6 + r() * 1.4;
      const d = 3.6 + r() * 1.4;
      b.towers.push({ p: [x, (top + BOTTOM) / 2, z], s: [w, top - BOTTOM, d], color: TINTS[Math.floor(r() * TINTS.length)] });
    }
  }
  for (let a = 0; a < Math.PI * 2; a += 0.06 + r() * 0.06) {
    const rad = 90 + r() * 60;
    const slot = towardMoon(Math.cos(a), Math.sin(a), 0.985);
    const h = slot ? 8 + r() * 10 : 10 + r() * 55;
    const w = 6 + r() * 10;
    b.towers.push({ p: [Math.cos(a) * rad, (h + BOTTOM) / 2, Math.sin(a) * rad], s: [w, h - BOTTOM, w], ry: -a, color: TINTS[Math.floor(r() * TINTS.length)] });
  }
};

type Clutter = { acs: Item[]; cages: Item[]; pipes: Item[]; poles: Item[]; cloth: Item[]; ends: Vec3[] };

const BAMBOO = ["#b89c5a", "#a88c4c", "#c4a968"];

/**
 * Bamboo scaffolding over a facade, the way Hong Kong builds it: a lattice of
 * lashed poles standing off the wall, green netting hung over part of it.
 */
const scaffold = (r: () => number, f: Face, poles: Item[], root: Obj, netMat: Obj): void => {
  const tx = -f.n[2];
  const tz = f.n[0];
  const off = 0.7;
  const y0 = -6;
  const y1 = Math.min(f.top - 1, 19);
  const w = f.width + 0.6;
  const at = (u: number, y: number, o: number): Vec3 => [f.c[0] + tx * u + f.n[0] * o, y, f.c[2] + tz * u + f.n[2] * o];
  const along = Math.atan2(tx, tz);
  for (let u = -w / 2; u <= w / 2 + 0.01; u += 1.15) {
    poles.push({ p: at(u + (r() - 0.5) * 0.08, (y0 + y1) / 2, off), s: [0.06, y1 - y0 + r() * 0.8, 0.06], color: BAMBOO[Math.floor(r() * 3)] });
  }
  for (let y = y0 + 0.6; y <= y1; y += 1.7) {
    poles.push({ p: at(0, y, off + 0.05), s: [0.055, w + 0.5, 0.055], rx: Math.PI / 2, ry: along, color: BAMBOO[Math.floor(r() * 3)] });
    // putlogs back to the wall
    for (let u = -w / 2; u <= w / 2 + 0.01; u += 2.3) poles.push({ p: at(u, y - 0.05, off / 2), s: [0.035, off + 0.3, 0.035], rx: Math.PI / 2, ry: faceRy(f.n), color: BAMBOO[0] });
  }
  // netting over the upper two thirds, a panel missing here and there
  const panelW = w / 3;
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (r() < 0.22) continue;
      const ph = (y1 - y0) * 0.24;
      const net = new THREE.Mesh(new THREE.PlaneGeometry(panelW * 0.98, ph), netMat);
      const p = at((i - 1) * panelW, y1 - ph / 2 - j * ph * 1.01 - 0.3, off + 0.12);
      net.position.set(p[0], p[1], p[2]);
      net.rotation.y = faceRy(f.n);
      root.add(net);
    }
  }
};

/** A narrow zig-zag fire stair bolted to a facade: landings, flights, rails. */
const fireStair = (f: Face, steel: Item[]): void => {
  const tx = -f.n[2];
  const tz = f.n[0];
  const at = (u: number, y: number, o: number): Vec3 => [f.c[0] + tx * u + f.n[0] * o, y, f.c[2] + tz * u + f.n[2] * o];
  const along = Math.atan2(tx, tz);
  const run = 1.9;
  const rise = 2.67;
  const pitch = Math.atan2(rise, run);
  const len = Math.hypot(run, rise);
  const floors = Math.min(7, Math.floor((f.top - 2) / rise));
  for (let k = 0; k < floors; k++) {
    const y = -2 + k * rise;
    const dir = k % 2 === 0 ? 1 : -1;
    steel.push({ p: at(dir * (run / 2 + 0.35), y + rise, 0.5), s: [1.0, 0.07, 0.9], ry: along, color: "#4a3024" });
    steel.push({ p: at(0, y + rise / 2, 0.5), s: [0.7, 0.07, len], rx: -dir * pitch, ry: along, color: "#55372a" });
    steel.push({ p: at(0, y + rise / 2 + 0.9, 0.82), s: [0.04, 0.04, len], rx: -dir * pitch, ry: along, color: "#3a2a22" });
  }
};

/** AC units, cages, pipes and laundry on the faces that look onto the rooftop. */
const clutter = (r: () => number, faces: Face[], q: Quality): Clutter => {
  const out: Clutter = { acs: [], cages: [], pipes: [], poles: [], cloth: [], ends: [] };
  const clothColors = ["#e9e2cf", "#3a5a8c", "#a8413a", "#d8cfae", "#4f8a78", "#2b2b30", "#c7a23a"];
  for (const f of faces) {
    const tx = -f.n[2];
    const tz = f.n[0];
    const ry = faceRy(f.n);
    const at = (u: number, y: number, out0: number): Vec3 => [f.c[0] + tx * u + f.n[0] * out0, y, f.c[2] + tz * u + f.n[2] * out0];
    const floors = Math.floor((f.top + 8) / 2.67);
    for (let k = 0; k < floors; k++) {
      const y = -8 + k * 2.67;
      for (let i = 0; i < Math.floor(f.width / 1.6); i++) {
        const u = (i - (f.width / 1.6 - 1) / 2) * 1.6 + (r() - 0.5) * 0.3;
        if (r() < 0.42 * q.density) out.acs.push({ p: at(u, y + 0.1 + r() * 0.4, 0.28), s: [0.7, 0.45, 0.5], ry, color: r() < 0.5 ? "#c9c5ba" : "#a6a39a" });
        if (r() < 0.12) out.cages.push({ p: at(u, y + 1.1, 0.45), s: [1.3, 1.4, 0.9], ry, color: r() < 0.5 ? "#7a4a32" : "#55504a" });
      }
    }
    for (let k = 0; k < 2; k++) {
      const u = (r() - 0.5) * f.width;
      out.pipes.push({ p: at(u, (f.top + BOTTOM) / 2, 0.12), s: [1, f.top - BOTTOM, 1], color: r() < 0.5 ? "#6d6a64" : "#5a4636" });
    }
    // bamboo laundry poles sticking out, clothes hanging
    if (r() < 0.6) {
      const y = 2.5 + r() * 9;
      const u = (r() - 0.5) * (f.width - 1);
      const len = 1.6 + r() * 1.2;
      const base = at(u, y, len / 2);
      out.poles.push({ p: base, s: [0.05, len, 0.05], ry, rx: Math.PI / 2, color: "#8d7a4d" });
      for (let c = 0; c < 3; c++) {
        const p = at(u + (r() - 0.5) * 0.1, y - 0.4, 0.4 + c * (len / 3.2));
        out.cloth.push({ p, s: [0.55, 0.75, 0.02], ry: ry + Math.PI / 2, color: clothColors[Math.floor(r() * clothColors.length)] });
      }
    }
    // cable anchors at several heights
    for (let k = 0; k < 4; k++) out.ends.push(at((r() - 0.5) * f.width, 4 + r() * 16, 0.05));
  }
  return out;
};

/** Re-poses an instanced batch of hanging cloth each frame: a slow wind swing about the top edge. */
export const swayer = (mesh: Obj, items: Item[]): ((t: number) => void) => {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  return (t: number): void => {
    items.forEach((it, i) => {
      const swing = Math.sin(t * 1.7 + i * 1.3) * 0.22 + Math.sin(t * 3.1 + i) * 0.06;
      e.set(swing, it.ry ?? 0, 0, "YXZ");
      q.setFromEuler(e);
      // hinge at the top edge: move the centre down along the swung axis
      const h = it.s[1] / 2;
      pos.set(it.p[0], it.p[1] + h, it.p[2]);
      const drop = new THREE.Vector3(0, -h, 0).applyQuaternion(q);
      pos.add(drop);
      scl.set(it.s[0], it.s[1], it.s[2]);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
};

/** Signs on the faces around the rooftop, many overhanging above head height; some get a coloured light. */
const signs = (r: () => number, faces: Face[], root: Obj, q: Quality): { mats: { mat: Obj; base: number; phase: number }[]; glows: SignGlow[] } => {
  const mats: { mat: Obj; base: number; phase: number }[] = [];
  const glows: SignGlow[] = [];
  const count = Math.round(34 * (0.6 + 0.4 * q.density));
  let lights = Math.max(0, q.pointLights - 2);
  const backing = std("#1a1a1f", 0.6, 0.6);
  // the few crisp signs hang low on the side walls, where the first view looks
  const side = faces.filter((f) => f.n[0] !== 0 && f.c[2] < 3 && f.c[2] > -8 && f.top > 12);
  for (let k = 0; k < count; k++) {
    const crisp = k < CRISP_SIGNS && side.length > 0;
    const f = crisp ? side[(k * 5 + 1) % side.length] : faces[Math.floor(r() * faces.length)];
    if (f.top < 6) continue;
    const text = SIGN_TEXT[k % SIGN_TEXT.length];
    const style = crisp ? SIGN_STYLES[k === 1 ? 5 : 0] : SIGN_STYLES[Math.floor(r() * SIGN_STYLES.length)];
    const vertical = r() < 0.85 || crisp;
    // all but the nearest few are drawn soft: city light, not lettering
    const { map, glow } = signCanvases(text, style, vertical, !crisp);
    const sw = vertical ? 1.1 + r() * 0.4 : 0.9 * [...text].length;
    const sh = sw * (map.height / map.width);
    const neon = style.kind === "neon";
    const base = neon ? 3.2 : 1.6;
    const mat = new THREE.MeshStandardMaterial({
      map: canvasTex(map),
      emissiveMap: canvasTex(glow),
      emissive: 0xffffff,
      emissiveIntensity: base,
      roughness: 0.4,
      metalness: 0.1,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.12), [backing, backing, backing, backing, mat, mat]);
    const y = crisp ? 3.4 + sh / 2 + k * 0.8 : Math.min(f.top - sh / 2 - 0.3, 3.2 + sh / 2 + r() * 13);
    const u = (r() - 0.5) * Math.max(0, f.width - 1);
    const bx = f.c[0] - f.n[2] * u;
    const bz = f.c[2] + f.n[0] * u;
    const blade = crisp || r() < 0.72;
    const reach = blade ? sw / 2 + 0.25 + r() * 1.2 : 0.15;
    mesh.position.set(bx + f.n[0] * reach, y, bz + f.n[2] * reach);
    mesh.rotation.y = faceRy(f.n) + (blade ? Math.PI / 2 : 0);
    root.add(mesh);
    mats.push({ mat, base, phase: r() * 20 });
    if (neon && y < 13) glows.push({ pos: [mesh.position.x, y, mesh.position.z], n: f.n, ry: mesh.rotation.y, w: sw, h: sh, color: style.color });
    if (lights > 0 && neon && y < 12) {
      const light = new THREE.PointLight(style.color === TUBE_WHITE ? RED : style.color, 18, 12, 1.8);
      light.position.set(mesh.position.x + f.n[0] * 0.6, y, mesh.position.z + f.n[2] * 0.6);
      root.add(light);
      lights -= 1;
    }
  }
  return { mats, glows };
};

/** The weave of scaffold netting (repeats). */
const netCanvas = (): HTMLCanvasElement => {
  const { c, g } = makeCanvas(64, 64);
  g.fillStyle = "#9fd0b0";
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "rgba(20,60,40,0.55)";
  g.lineWidth = 1;
  for (let i = 0; i <= 64; i += 4) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 64);
    g.moveTo(0, i);
    g.lineTo(64, i);
    g.stroke();
  }
  g.fillStyle = "rgba(10,30,20,0.25)";
  g.fillRect(0, 28, 64, 5);
  return c;
};

/** A sign too far to read: a soft bar of light with darker blots where the characters would be. */
const farSignCanvas = (): HTMLCanvasElement => {
  const { c, g } = makeCanvas(32, 96);
  const grad = g.createRadialGradient(16, 48, 2, 16, 48, 46);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.75)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 96);
  g.fillStyle = "rgba(0,0,0,0.35)";
  for (let i = 0; i < 4; i++) g.fillRect(10, 14 + i * 18, 12, 11);
  return c;
};

/**
 * The canyon of signs, receding: soft red (some amber) bars of light down
 * both sides of the slot toward the moon and scattered on the towers behind
 * the first wall. They are meant to sink into the navy haze.
 */
const farSigns = (r: () => number, q: Quality): Obj => {
  const items: Item[] = [];
  const mx = MOON_DIR[0] / Math.hypot(MOON_DIR[0], MOON_DIR[2]);
  const mz = MOON_DIR[2] / Math.hypot(MOON_DIR[0], MOON_DIR[2]);
  const tint = (): string => (r() < 0.78 ? RED : r() < 0.7 ? AMBER : TUBE_WHITE);
  const corridor = Math.round(46 * q.density);
  for (let k = 0; k < corridor; k++) {
    const d = 13 + r() * 46;
    const sideways = (r() < 0.5 ? -1 : 1) * (d * 0.36 + 1.5 + r() * 2.5);
    const h = 1.6 + r() * 3.2;
    items.push({ p: [mx * d - mz * sideways, -2 + r() * 20, mz * d + mx * sideways], s: [h * 0.34, h, 1], ry: Math.atan2(-mx, -mz), color: tint() });
  }
  const around = Math.round(40 * q.density);
  for (let k = 0; k < around; k++) {
    const a = r() * Math.PI * 2;
    const d = 20 + r() * 26;
    const h = 1.6 + r() * 3;
    items.push({ p: [Math.cos(a) * d, 2 + r() * 26, Math.sin(a) * d], s: [h * 0.34, h, 1], ry: Math.atan2(-Math.cos(a), -Math.sin(a)), color: tint() });
  }
  const mat = new THREE.MeshBasicMaterial({ map: canvasTex(farSignCanvas()), color: new THREE.Color(2.2, 2.2, 2.2), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  return batch(new THREE.PlaneGeometry(1, 1), mat, items, false);
};

export const buildCity = (q: Quality): City => {
  const root = new THREE.Group();
  const r = rng(20261003);
  const b: Build = { towers: [], faces: [] };
  towers(r, b);
  const towerMesh = batch(new THREE.BoxGeometry(1, 1, 1), facadeMaterial(2.2), b.towers);
  // towers cast the moon's shadow onto the rooftop but do not take shadows themselves (no acne, cheaper)
  towerMesh.receiveShadow = false;
  root.add(towerMesh);
  const c = clutter(r, b.faces, q);
  const clothMesh = batch(new THREE.BoxGeometry(1, 1, 1), std(0xffffff, 0.9, 0, { side: THREE.DoubleSide }), c.cloth);
  root.add(clothMesh);
  // bamboo scaffolding on two facades, a fire stair on a third
  const tall = b.faces.filter((f) => f.top > 16);
  const netMat = new THREE.MeshStandardMaterial({ map: canvasTex(netCanvas(), [3, 3]), color: "#2a7a52", roughness: 1, transparent: true, opacity: 0.86, side: THREE.DoubleSide });
  const left = tall.find((f) => f.n[0] > 0 && f.c[2] > -7 && f.c[2] < 1);
  const right = tall.find((f) => f.n[0] < 0 && f.c[2] < -2 && f.c[2] > -9);
  const back = tall.find((f) => f.n[2] > 0 && f.c[0] > 4 && f.c[0] < 9);
  for (const f of [left, back]) if (f !== undefined) scaffold(r, f, c.poles, root, netMat);
  if (right !== undefined) fireStair(right, c.cages);
  root.add(batch(new THREE.BoxGeometry(1, 1, 1), std(0xffffff, 0.55, 0.35), c.acs));
  root.add(batch(new THREE.BoxGeometry(1, 1, 1), std(0xffffff, 0.7, 0.6), c.cages));
  root.add(batch(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), std(0xffffff, 0.5, 0.7), c.pipes, false));
  root.add(batch(new THREE.CylinderGeometry(1, 1, 1, 6), std(0xffffff, 0.6), c.poles, false));
  root.add(farSigns(r, q));
  const lit = signs(r, b.faces, root, q);
  // cables across the rooftop, anchor to anchor
  const lines: Vec3[][] = [];
  const ends = c.ends;
  const n = Math.round(70 * q.density);
  for (let k = 0; k < n && ends.length > 1; k++) {
    const a = ends[Math.floor(r() * ends.length)];
    const e = ends[Math.floor(r() * ends.length)];
    if (a === e || Math.hypot(a[0] - e[0], a[2] - e[2]) < 4) continue;
    lines.push(sagPoints(a, e, 0.6 + r() * 2.2, 14));
  }
  root.add(wires(lines));
  buildSky(root, q.tier === "high" ? 9 : 5);
  // water drips from the AC units just above the rooftop's head height
  const drips = c.acs.filter((a) => a.p[1] > 1.5 && a.p[1] < 9 && Math.max(Math.abs(a.p[0]), Math.abs(a.p[2])) < 13).map((a) => [a.p[0], a.p[1] - 0.25, a.p[2]] as Vec3);
  const sway = swayer(clothMesh, c.cloth);
  let swayClock = 0;
  const update = (t: number, dt: number, reduced: boolean): void => {
    // the washing moves in the wind (every other frame on the low tier)
    swayClock += 1;
    if (!reduced && (q.tier === "high" || swayClock % 2 === 0)) sway(t);
    for (const s of lit.mats) {
      // steady, with the odd stutter of a failing tube (not in reduced motion)
      const w = reduced ? 0 : Math.sin(t * 1.3 + s.phase) * Math.sin(t * 7.7 + s.phase * 3);
      s.mat.emissiveIntensity = w > 0.95 ? s.base * 0.15 : s.base;
    }
  };
  return { root, drips: drips.slice(0, q.tier === "high" ? 14 : 7), glows: lit.glows.slice(0, q.tier === "high" ? 4 : 2), update };
};
