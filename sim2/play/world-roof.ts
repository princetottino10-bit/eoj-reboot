// The rooftop: wet tiles with rain puddles, parapet, stairwell hut, water
// tanks, antennas, laundry, the street shrine (土地), strings of paper
// lanterns, and in the middle the mahjong table with the lacquered 九宮盤 and
// its turning 太極.
import * as THREE from "./vendor/three/three.module.js";
import { batch, canvasTex, glowSprite, sagPoints, std, wires } from "./world-kit.ts";
import type { Item, Obj, Quality, Vec3 } from "./world-kit.ts";
import { boardCanvas, glowCanvas, makeCanvas, PAL, plaqueCanvas, rng, taijiCanvas } from "./world-paint.ts";
import { ROOF, swayer } from "./world-city.ts";
import { lightCone } from "./world-volume.ts";
import type { Beam } from "./world-volume.ts";

export type Roof = {
  root: Obj;
  /** the board's top surface height */
  boardY: number;
  /** where the incense embers rise from */
  incense: Vec3;
  update: (t: number, dt: number, reduced: boolean) => void;
};

const TABLE_Y = 0.86;
const BOARD = 2.5;

/** Wet roof tiles: colour, and a roughness map where puddles are near-mirror smooth. */
const floorMaps = (): { map: HTMLCanvasElement; rough: HTMLCanvasElement } => {
  const S = 1024;
  const col = makeCanvas(S, S);
  const rough = makeCanvas(S, S);
  const r = rng(7);
  const tile = S / 16;
  for (let i = 0; i < 16; i++) {
    for (let j = 0; j < 16; j++) {
      const v = 70 + r() * 22;
      col.g.fillStyle = `rgb(${v},${v - 4},${v - 8})`;
      col.g.fillRect(i * tile + 2, j * tile + 2, tile - 4, tile - 4);
      const rv = 150 + r() * 70;
      rough.g.fillStyle = `rgb(${rv},${rv},${rv})`;
      rough.g.fillRect(i * tile, j * tile, tile, tile);
    }
  }
  col.g.strokeStyle = "#2a2826";
  col.g.lineWidth = 4;
  for (let i = 0; i <= 16; i++) {
    col.g.beginPath();
    col.g.moveTo(i * tile, 0);
    col.g.lineTo(i * tile, S);
    col.g.moveTo(0, i * tile);
    col.g.lineTo(S, i * tile);
    col.g.stroke();
  }
  // puddles: darker, and smooth
  for (let k = 0; k < 14; k++) {
    const x = r() * S;
    const y = r() * S;
    const rx = 40 + r() * 120;
    const ry = 25 + r() * 70;
    const a = r() * 3;
    const grad = rough.g.createRadialGradient(x, y, 0, x, y, rx);
    grad.addColorStop(0, "rgb(80,80,80)");
    grad.addColorStop(0.8, "rgb(105,105,105)");
    grad.addColorStop(1, "rgba(105,105,105,0)");
    rough.g.fillStyle = grad;
    rough.g.beginPath();
    rough.g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2);
    rough.g.fill();
    col.g.fillStyle = "rgba(12,12,16,0.55)";
    col.g.beginPath();
    col.g.ellipse(x, y, rx * 0.9, ry * 0.9, a, 0, Math.PI * 2);
    col.g.fill();
  }
  return { map: col.c, rough: rough.c };
};

/** What shows through the stairwell door: a landing and steps going down under a weak warm bulb. */
const doorwayCanvas = (): HTMLCanvasElement => {
  const W = 128;
  const H = 270;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = "#0b0908";
  g.fillRect(0, 0, W, H);
  const light = g.createRadialGradient(W * 0.6, 36, 4, W * 0.6, 60, 170);
  light.addColorStop(0, "rgba(255,190,110,0.85)");
  light.addColorStop(0.35, "rgba(190,110,50,0.4)");
  light.addColorStop(1, "rgba(40,20,8,0)");
  g.fillStyle = light;
  g.fillRect(0, 0, W, H);
  // the back wall's tiles and the steps down
  g.strokeStyle = "rgba(10,8,6,0.5)";
  g.lineWidth = 1;
  for (let y = 0; y < 150; y += 14) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const y = 150 + i * 20;
    g.fillStyle = `rgba(120,80,45,${0.5 - i * 0.07})`;
    g.fillRect(i * 6, y, W - i * 6, 8);
    g.fillStyle = "rgba(0,0,0,0.75)";
    g.fillRect(i * 6, y + 8, W - i * 6, 12);
  }
  g.strokeStyle = "rgba(20,14,10,0.9)";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(8, 120);
  g.lineTo(50, 250);
  g.stroke();
  g.fillStyle = "#ffe2b0";
  g.beginPath();
  g.arc(W * 0.6, 30, 5, 0, Math.PI * 2);
  g.fill();
  return c;
};

const table = (root: Obj, boxes: Item[]): { taiji: Obj } => {
  const wood = "#4a2c1c";
  boxes.push({ p: [0, TABLE_Y - 0.06, 0], s: [3.0, 0.12, 3.0], color: wood });
  boxes.push({ p: [0, TABLE_Y - 0.2, 0], s: [2.8, 0.16, 2.8], color: "#35200f" });
  for (const [x, z] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
    boxes.push({ p: [x, (TABLE_Y - 0.28) / 2, z], s: [0.12, TABLE_Y - 0.28, 0.12], color: wood });
  }
  // red plastic stools
  const stool = new THREE.CylinderGeometry(0.22, 0.28, 0.46, 20, 1, false);
  const plastic = new THREE.MeshPhysicalMaterial({ color: "#c0261d", roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  for (const [x, z] of [[0.3, 2.2], [-0.2, -2.3], [2.25, 0.4], [-2.3, -0.3]]) {
    const m = new THREE.Mesh(stool, plastic);
    m.position.set(x, 0.23, z);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
  // the 九宮盤: black lacquer (clearcoat) with gold inlay (metalness mask)
  const lacquer = new THREE.MeshPhysicalMaterial({ color: "#0b090a", roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(BOARD, 0.1, BOARD), lacquer);
  slab.position.set(0, TABLE_Y + 0.05, 0);
  slab.castShadow = true;
  slab.receiveShadow = true;
  root.add(slab);
  const mask = canvasTex(boardCanvas(true), null, false);
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(BOARD, BOARD),
    new THREE.MeshPhysicalMaterial({
      map: canvasTex(boardCanvas()),
      metalnessMap: mask,
      metalness: 1,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
    }),
  );
  top.rotation.x = -Math.PI / 2;
  top.position.set(0, TABLE_Y + 0.101, 0);
  top.receiveShadow = true;
  root.add(top);
  const taiji = new THREE.Mesh(
    new THREE.CylinderGeometry(0.33, 0.33, 0.02, 48),
    [
      new THREE.MeshPhysicalMaterial({ color: PAL.gold, metalness: 1, roughness: 0.3 }),
      new THREE.MeshPhysicalMaterial({ map: canvasTex(taijiCanvas()), roughness: 0.3, clearcoat: 1, emissive: 0xffffff, emissiveMap: canvasTex(taijiCanvas()), emissiveIntensity: 0.12 }),
      new THREE.MeshPhysicalMaterial({ color: "#111", roughness: 0.4 }),
    ],
  );
  taiji.position.set(0, TABLE_Y + 0.115, 0);
  root.add(taiji);
  return { taiji };
};

const shrine = (root: Obj, boxes: Item[], q: Quality): { incense: Vec3; flames: Obj[]; glow: Obj | null } => {
  const x0 = 3.6;
  const z0 = -ROOF + 0.7;
  const red = new THREE.MeshPhysicalMaterial({ color: "#8e1d16", roughness: 0.35, clearcoat: 0.8 });
  for (const [p, s] of [
    [[x0, 0.5, z0], [1.6, 1.0, 0.8]],
    [[x0, 1.55, z0 - 0.1], [1.3, 1.1, 0.6]],
  ] as [Vec3, Vec3][]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), red);
    m.position.set(p[0], p[1], p[2]);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  }
  boxes.push({ p: [x0, 2.18, z0 - 0.05], s: [1.6, 0.14, 0.8], color: "#b08a3a" });
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.86),
    new THREE.MeshStandardMaterial({ map: canvasTex(plaqueCanvas()), emissive: 0xffffff, emissiveMap: canvasTex(plaqueCanvas()), emissiveIntensity: 0.5, roughness: 0.4 }),
  );
  plaque.position.set(x0, 1.55, z0 + 0.205);
  root.add(plaque);
  boxes.push({ p: [x0, 1.1, z0 + 0.18], s: [0.34, 0.2, 0.3], color: "#8a6a2e" });
  const tip = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff7a2a").multiplyScalar(4) });
  for (const dx of [-0.08, 0, 0.08]) {
    boxes.push({ p: [x0 + dx, 1.38, z0 + 0.18], s: [0.02, 0.4, 0.02], color: "#6b3b2a" });
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), tip);
    m.position.set(x0 + dx, 1.59, z0 + 0.18);
    root.add(m);
  }
  const flames: Obj[] = [];
  const flame = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffb347").multiplyScalar(3) });
  for (const dx of [-0.55, 0.55]) {
    boxes.push({ p: [x0 + dx, 1.2, z0 + 0.2], s: [0.12, 0.4, 0.12], color: "#c0261d" });
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 8), flame);
    f.position.set(x0 + dx, 1.5, z0 + 0.2);
    root.add(f);
    flames.push(f);
  }
  let glow: Obj | null = null;
  if (q.pointLights >= 3) {
    glow = new THREE.PointLight("#ff6a2a", 6, 6, 1.6);
    glow.position.set(x0, 1.7, z0 + 0.8);
    root.add(glow);
  }
  return { incense: [x0, 1.6, z0 + 0.18], flames, glow };
};

const laundry = (root: Obj, boxes: Item[], a: Vec3, b: Vec3): ((t: number) => void) => {
  boxes.push({ p: [a[0], a[1] / 2, a[2]], s: [0.07, a[1], 0.07], color: "#6d5a3c" });
  boxes.push({ p: [b[0], b[1] / 2, b[2]], s: [0.07, b[1], 0.07], color: "#6d5a3c" });
  const pts = sagPoints(a, b, 0.3, 12);
  root.add(wires([pts]));
  const cloth = ["#e9e2cf", "#3a5a8c", "#a8413a", "#d8cfae", "#4f8a78", "#e9e2cf"];
  const items: Item[] = [];
  for (let i = 1; i < pts.length - 1; i += 2) {
    const p = pts[i];
    const h = 0.55 + (i % 3) * 0.15;
    items.push({ p: [p[0], p[1] - h / 2, p[2]], s: [0.46, h, 0.015], ry: Math.atan2(b[0] - a[0], b[2] - a[2]) + Math.PI / 2, color: cloth[i % cloth.length] });
  }
  const mesh = batch(new THREE.BoxGeometry(1, 1, 1), std(0xffffff, 0.95, 0, { side: THREE.DoubleSide }), items);
  root.add(mesh);
  return swayer(mesh, items);
};

/** Strings of red paper lanterns: glowing bodies, halos, and one or two real lights. */
const lanterns = (root: Obj, boxes: Item[], q: Quality): Vec3[] => {
  const poles: [Vec3, Vec3][] = [
    [[-ROOF + 0.4, 6.6, -ROOF + 0.4], [ROOF - 0.4, 6.2, ROOF - 0.4]],
    [[ROOF - 0.4, 7.0, -ROOF + 0.4], [-ROOF + 0.4, 6.4, ROOF - 0.4]],
  ];
  const bodies: Item[] = [];
  const caps: Item[] = [];
  const lines: Vec3[][] = [];
  const at: Vec3[] = [];
  const halo = canvasTex(glowCanvas());
  let lights = q.pointLights >= 6 ? 2 : 1;
  for (const [a, b] of poles) {
    for (const p of [a, b]) boxes.push({ p: [p[0], p[1] / 2, p[2]], s: [0.12, p[1], 0.12], color: "#2a2a30" });
    const pts = sagPoints(a, b, 0.9, 26);
    lines.push(pts);
    for (let i = 2; i < pts.length - 2; i += 2) {
      if (Math.hypot(pts[i][0], pts[i][2]) < 4.6) continue;
      const [x, y, z] = pts[i];
      bodies.push({ p: [x, y - 0.5, z], s: [1, 1.2, 1], color: "#ffffff" });
      at.push([x, y - 0.5, z]);
      caps.push({ p: [x, y - 0.17, z], s: [1, 1, 1], color: "#c9a23a" });
      caps.push({ p: [x, y - 0.83, z], s: [1, 1, 1], color: "#c9a23a" });
      const h = glowSprite(halo, "#ff4a22", 1.3, 0.3);
      h.position.set(x, y - 0.5, z);
      root.add(h);
      if (lights > 0 && i === 8) {
        const l = new THREE.PointLight("#ff5a2a", 10, 9, 1.7);
        l.position.set(x, y - 0.7, z);
        root.add(l);
        lights -= 1;
      }
    }
  }
  root.add(wires(lines));
  const paper = new THREE.MeshStandardMaterial({ color: "#d8321f", emissive: "#ff3a18", emissiveIntensity: 1.6, roughness: 0.8 });
  root.add(batch(new THREE.SphereGeometry(0.28, 16, 12), paper, bodies, false));
  root.add(batch(new THREE.CylinderGeometry(0.14, 0.14, 0.07, 12), std(0xffffff, 0.35, 0.9), caps, false));
  return at;
};

export const buildRoof = (q: Quality): Roof => {
  const root = new THREE.Group();
  const boxes: Item[] = [];
  // our tower below, and the parapet
  boxes.push({ p: [0, -20.05, 0], s: [ROOF * 2 + 0.6, 40, ROOF * 2 + 0.6], color: "#3a3a3e" });
  for (const s of [-1, 1]) {
    boxes.push({ p: [0, 0.5, s * ROOF], s: [ROOF * 2 + 0.6, 1.0, 0.3], color: "#6a6862" });
    boxes.push({ p: [s * ROOF, 0.5, 0], s: [0.3, 1.0, ROOF * 2], color: "#6a6862" });
  }
  const maps = floorMaps();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOF * 2, ROOF * 2),
    new THREE.MeshStandardMaterial({
      map: canvasTex(maps.map, [2, 2]),
      roughnessMap: canvasTex(maps.rough, [2, 2], false),
      roughness: 1,
      metalness: 0.05,
      envMapIntensity: 1.0,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);
  // stairwell hut with a lit door and an outside stair
  boxes.push({ p: [-5.2, 1.6, -5.6], s: [4.2, 3.2, 3.6], color: "#3e3b39" });
  boxes.push({ p: [-5.2, 3.3, -5.4], s: [4.8, 0.18, 4.2], color: "#3a3836" });
  // the doorway: a dark frame, the stair inside under a weak bulb, the steel leaf standing ajar
  const inside = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), new THREE.MeshBasicMaterial({ map: canvasTex(doorwayCanvas()) }));
  inside.position.set(-4.3, 0.95, -3.795);
  root.add(inside);
  for (const [x, y, w, h] of [[-4.8, 0.98, 0.1, 2.0], [-3.8, 0.98, 0.1, 2.0], [-4.3, 1.98, 1.1, 0.1]]) {
    boxes.push({ p: [x, y, -3.74], s: [w, h, 0.14], color: "#24211f" });
  }
  boxes.push({ p: [-4.3, 0.04, -3.66], s: [1.0, 0.08, 0.28], color: "#4a4744" });
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.86, 0.05), std("#4d4138", 0.55, 0.6));
  leaf.position.set(-4.75 + 0.43 * Math.cos(1.15), 0.95, -3.76 + 0.43 * Math.sin(1.15));
  leaf.rotation.y = -1.15;
  leaf.castShadow = true;
  root.add(leaf);
  for (let i = 0; i < 9; i++) boxes.push({ p: [-2.7, 0.18 + i * 0.36, -7.2 + i * 0.36], s: [0.9, 0.08, 0.36], color: "#5b3b2e" });
  // water tanks and antennas
  const tankMat = std("#7c8288", 0.55, 0.7);
  for (const [x, z] of [[6.2, -5.4], [-6.6, 3.2]]) {
    for (const [dx, dz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) boxes.push({ p: [x + dx, 0.8, z + dz], s: [0.1, 1.6, 0.1], color: "#35302c" });
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 1.9, 24), tankMat);
    tank.position.set(x, 2.55, z);
    tank.castShadow = true;
    tank.receiveShadow = true;
    root.add(tank);
  }
  for (const [x, z, h] of [[7.2, 7.0, 4.6], [7.5, 6.3, 3.6], [-7.3, -7.2, 5.2]]) {
    boxes.push({ p: [x, h / 2, z], s: [0.07, h, 0.07], color: "#2a2a30" });
    boxes.push({ p: [x, h - 0.4, z], s: [1.3, 0.05, 0.05], ry: 0.4, color: "#2a2a30" });
    boxes.push({ p: [x, h - 0.9, z], s: [0.9, 0.05, 0.05], ry: 0.4, color: "#2a2a30" });
  }
  const { taiji } = table(root, boxes);
  const { incense, flames, glow } = shrine(root, boxes, q);
  const sway = laundry(root, boxes, [-7.4, 2.2, 5.2], [-2.8, 2.4, 7.2]);
  const lanternAt = lanterns(root, boxes, q);
  // the warm light over the table (a lamp just out of frame above)
  const lamp = new THREE.PointLight("#ffbf73", 34, 16, 1.5);
  lamp.position.set(0, 6.4, 3.2);
  root.add(lamp);
  // light shafts in the rain haze: the lamp onto the table, and under a few lanterns
  const beams: Beam[] = [];
  const cone = (apex: Vec3, to: Vec3, radius: number, color: string, strength: number): void => {
    const c = lightCone(apex, to, radius, color, strength);
    root.add(c.mesh);
    beams.push(c.beam);
  };
  cone([0, 6.4, 3.2], [0, 0.9, 0.3], 1.7, "#ffbf73", 0.1);
  const shafts = q.tier === "high" ? 5 : 2;
  lanternAt
    .filter((_, i) => i % 3 === 1)
    .slice(0, shafts)
    .forEach(([x, y, z]) => cone([x, y - 0.3, z], [x, y - 3.2, z], 0.9, "#ff5a2a", 0.2));
  root.add(batch(new THREE.BoxGeometry(1, 1, 1), std(0xffffff, 0.8, 0.05), boxes));
  const update = (t: number, dt: number, reduced: boolean): void => {
    if (!reduced) sway(t);
    taiji.rotation.y = reduced ? t * 0.05 : t * 0.18;
    const k = reduced ? 1 : 1 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.1);
    for (const f of flames) f.scale.set(1, k, 1);
    if (glow !== null) glow.intensity = 6 * k;
    lamp.intensity = reduced ? 34 : 34 + 1.5 * Math.sin(t * 2.3) * Math.sin(t * 5.9);
    beams[0].mat.uniforms.uFlicker.value = lamp.intensity / 34;
    void dt;
  };
  return { root, boardY: TABLE_Y + 0.1, incense, update };
};
