// Small things that make the rooftop lived-in: mahjong tiles and tea cups on
// the table rim (never on the board), a bare bulb over the stairwell door with
// moths circling it, and a fluorescent tube that flickers now and then.
import * as THREE from "./vendor/three/three.module.js";
import { batch, canvasTex, glowSprite } from "./world-kit.ts";
import type { Item, Obj, Quality } from "./world-kit.ts";
import { glowCanvas, rng } from "./world-paint.ts";

export type Props = { root: Obj; update: (t: number, dt: number, reduced: boolean) => void };

const TABLE_TOP = 0.86;
const TUBE = new THREE.Color("#fff3e2");
/** The stairwell door's bulb (the hut in world-roof.ts). */
const DOOR_BULB: [number, number, number] = [-4.3, 2.35, -3.62];

const tiles = (root: Obj): void => {
  const r = rng(8);
  const ivory: Item[] = [];
  const backs: Item[] = [];
  const W = 0.034;
  const H = 0.046;
  const D = 0.024;
  // a standing hand on each side, and a few face-down tiles pushed to the corners
  for (let side = 0; side < 4; side++) {
    const ry = (side * Math.PI) / 2;
    const cos = Math.cos(ry);
    const sin = Math.sin(ry);
    const count = 9 + Math.floor(r() * 4);
    for (let i = 0; i < count; i++) {
      const u = (i - (count - 1) / 2) * (W + 0.003) + 0.18;
      const v = 1.38;
      const x = u * cos + v * sin;
      const z = -u * sin + v * cos;
      ivory.push({ p: [x, TABLE_TOP + H / 2, z], s: [W, H, D * 0.62], ry, color: "#efe9d8" });
      backs.push({ p: [x + sin * D * 0.4, TABLE_TOP + H / 2, z + cos * D * 0.4], s: [W, H, D * 0.38], ry, color: "#2f7d5a" });
    }
  }
  for (let k = 0; k < 7; k++) {
    const x = (r() < 0.5 ? -1 : 1) * (1.3 + r() * 0.12);
    const z = (r() < 0.5 ? -1 : 1) * (0.9 + r() * 0.45);
    backs.push({ p: [x, TABLE_TOP + D * 0.5, z], s: [W, D, H], ry: r() * 3, color: "#2f7d5a" });
  }
  root.add(batch(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, clearcoat: 0.6 }), ivory));
  root.add(batch(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.35, clearcoat: 0.6 }), backs));
};

const cups = (root: Obj): void => {
  const porcelain = new THREE.MeshPhysicalMaterial({ color: "#f2efe6", roughness: 0.18, clearcoat: 1 });
  const tea = new THREE.MeshStandardMaterial({ color: "#6b3a12", roughness: 0.1 });
  const cup = new THREE.CylinderGeometry(0.042, 0.03, 0.05, 20, 1, true);
  for (const [x, z] of [[1.36, 1.36], [-1.38, -1.34], [1.35, -1.38]]) {
    const m = new THREE.Mesh(cup, porcelain);
    m.position.set(x, TABLE_TOP + 0.025, z);
    m.castShadow = true;
    root.add(m);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), porcelain);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.set(x, TABLE_TOP + 0.001, z);
    root.add(bottom);
    const t = new THREE.Mesh(new THREE.CircleGeometry(0.038, 20), tea);
    t.rotation.x = -Math.PI / 2;
    t.position.set(x, TABLE_TOP + 0.04, z);
    root.add(t);
  }
};

export const buildProps = (q: Quality): Props => {
  const root = new THREE.Group();
  tiles(root);
  cups(root);
  const halo = canvasTex(glowCanvas());
  // bare bulb over the stairwell door, under a little tin shade
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffd89a").multiplyScalar(4) }));
  bulb.position.set(DOOR_BULB[0], DOOR_BULB[1], DOOR_BULB[2]);
  root.add(bulb);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.08, 16, 1, true), new THREE.MeshStandardMaterial({ color: "#5a5d58", metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide }));
  shade.position.set(DOOR_BULB[0], DOOR_BULB[1] + 0.07, DOOR_BULB[2]);
  root.add(shade);
  const bulbGlow = glowSprite(halo, "#ffc27a", 0.9, 0.5);
  bulbGlow.position.copy(bulb.position);
  root.add(bulbGlow);
  if (q.pointLights >= 6) {
    const l = new THREE.PointLight("#ffc27a", 4, 5, 1.8);
    l.position.set(DOOR_BULB[0], DOOR_BULB[1] - 0.1, DOOR_BULB[2] + 0.2);
    root.add(l);
  }
  // moths: dark flecks on erratic orbits round the bulb
  const MOTHS = 7;
  const mothPos = new Float32Array(MOTHS * 3);
  const mothGeo = new THREE.BufferGeometry();
  mothGeo.setAttribute("position", new THREE.BufferAttribute(mothPos, 3));
  const moths = new THREE.Points(mothGeo, new THREE.PointsMaterial({ color: "#2a2520", size: 0.035, transparent: true, opacity: 0.9 }));
  moths.frustumCulled = false;
  root.add(moths);
  // a fluorescent tube on the hut wall
  const tubeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff3e2").multiplyScalar(2.2) });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 8), tubeMat);
  tube.rotation.z = Math.PI / 2;
  tube.position.set(-6.4, 2.6, -3.74);
  root.add(tube);
  const tubeGlow = glowSprite(halo, "#ffe9cc", 1.8, 0.35);
  tubeGlow.position.copy(tube.position);
  root.add(tubeGlow);
  const r = rng(61);
  const phases = Array.from({ length: MOTHS }, () => [r() * 6, 0.12 + r() * 0.18, 2 + r() * 3] as const);
  let flicker = 0;
  const update = (t: number, dt: number, reduced: boolean): void => {
    phases.forEach(([ph, rad, sp], i) => {
      const a = ph + t * sp * (reduced ? 0.2 : 1);
      mothPos[i * 3] = DOOR_BULB[0] + Math.cos(a) * rad + Math.sin(t * 7 + ph) * 0.03;
      mothPos[i * 3 + 1] = DOOR_BULB[1] - 0.05 + Math.sin(a * 1.7) * 0.08;
      mothPos[i * 3 + 2] = DOOR_BULB[2] + 0.12 + Math.sin(a) * rad;
    });
    mothGeo.attributes.position.needsUpdate = true;
    // the tube: steady, then once in a while a few quick stutters (not in reduced motion)
    flicker -= dt;
    if (!reduced && flicker < -4 - (Math.sin(t * 0.37) + 1) * 3) flicker = 0.6;
    const on = reduced || flicker <= 0 || Math.sin(t * 60) > 0.2;
    tubeMat.color.copy(TUBE).multiplyScalar(on ? 2.2 : 0.25);
    tubeGlow.material.opacity = on ? 0.35 : 0.05;
  };
  return { root, update };
};
