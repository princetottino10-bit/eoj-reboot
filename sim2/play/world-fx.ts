// Moving things: light rain, embers and curling smoke from the shrine's
// incense, water dripping off the AC units, paper talismans drifting round
// the board, and now and then a plane crossing low over the rooftops (Kai Tak
// days). Reduced motion slows or stops them.
import * as THREE from "./vendor/three/three.module.js";
import { canvasTex, glowSprite } from "./world-kit.ts";
import type { Obj, Quality, Vec3 } from "./world-kit.ts";
import { glowCanvas, rng, talismanCanvas } from "./world-paint.ts";

export type Fx = { root: Obj; update: (t: number, dt: number, reduced: boolean, camera: Obj) => void };

const EMBERS = 60;
const TALISMANS = 10;

/** Incense smoke: soft puffs that rise, widen, curl and fade (additive, so they fade to nothing). */
const smoke = (root: Obj, origin: Vec3, count: number): ((dt: number, reduced: boolean) => void) => {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const age: number[] = [];
  const LIFE = 5;
  for (let i = 0; i < count; i++) age.push((i / count) * LIFE);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 0.32, map: canvasTex(glowCanvas()), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  pts.frustumCulled = false;
  root.add(pts);
  return (dt: number, reduced: boolean): void => {
    for (let i = 0; i < count; i++) {
      age[i] = (age[i] + dt * (reduced ? 0.3 : 1)) % LIFE;
      const a = age[i];
      const ph = i * 2.39;
      pos[i * 3] = origin[0] + Math.sin(a * 1.4 + ph) * 0.05 * (1 + a * 1.5);
      pos[i * 3 + 1] = origin[1] + a * 0.32;
      pos[i * 3 + 2] = origin[2] + Math.cos(a * 1.1 + ph) * 0.04 * (1 + a * 1.5);
      const k = (1 - a / LIFE) * Math.min(1, a / 0.4) * 0.16;
      col[i * 3] = 0.62 * k;
      col[i * 3 + 1] = 0.64 * k;
      col[i * 3 + 2] = 0.72 * k;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
};

/** One drop at a time from each AC unit: hangs, falls, gone. */
const drips = (root: Obj, sources: Vec3[], r: () => number): ((dt: number, reduced: boolean) => void) => {
  const n = sources.length;
  const pos = new Float32Array(Math.max(1, n) * 3);
  const vy: number[] = [];
  const wait: number[] = [];
  const reset = (i: number): void => {
    pos.set(sources[i], i * 3);
    vy[i] = 0;
    wait[i] = 0.5 + r() * 2.5;
  };
  for (let i = 0; i < n; i++) reset(i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#b8cbe8", size: 0.035, transparent: true, opacity: 0.85 }));
  pts.frustumCulled = false;
  root.add(pts);
  return (dt: number, reduced: boolean): void => {
    if (reduced) return;
    for (let i = 0; i < n; i++) {
      if (wait[i] > 0) {
        wait[i] -= dt;
        continue;
      }
      vy[i] += 9.8 * dt;
      pos[i * 3 + 1] -= vy[i] * dt;
      if (pos[i * 3 + 1] < -3) reset(i);
    }
    geo.attributes.position.needsUpdate = true;
  };
};

export const buildFx = (incense: Vec3, boardY: number, q: Quality, dripFrom: Vec3[]): Fx => {
  const root = new THREE.Group();
  const r = rng(314);
  const smokeStep = smoke(root, [incense[0], incense[1] + 0.02, incense[2]], q.tier === "high" ? 40 : 20);
  const dripStep = drips(root, dripFrom, r);
  // rain: short bright streaks falling through the lights
  const drops = Math.round(900 * q.density);
  const rain = new Float32Array(drops * 6);
  const place = (i: number, y: number): void => {
    const x = (r() - 0.5) * 26;
    const z = (r() - 0.5) * 26;
    rain.set([x, y, z, x + 0.02, y - 0.35, z + 0.01], i * 6);
  };
  for (let i = 0; i < drops; i++) place(i, r() * 22);
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rain, 3));
  const rainLines = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: "#8fa4c8", transparent: true, opacity: 0.35, depthWrite: false }));
  rainLines.frustumCulled = false;
  root.add(rainLines);
  // embers
  const pos = new Float32Array(EMBERS * 3);
  const vel: number[] = [];
  const spawn = (i: number, fresh: boolean): void => {
    const fromShrine = i % 3 !== 0;
    const o = fromShrine ? incense : ([0, boardY + 0.2, 0] as Vec3);
    const spread = fromShrine ? 0.2 : 1.4;
    pos[i * 3] = o[0] + (r() - 0.5) * spread;
    pos[i * 3 + 1] = o[1] + (fresh ? r() * 6 : 0);
    pos[i * 3 + 2] = o[2] + (r() - 0.5) * spread;
    vel[i] = 0.25 + r() * 0.45;
  };
  for (let i = 0; i < EMBERS; i++) spawn(i, true);
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const embers = new THREE.Points(
    emberGeo,
    new THREE.PointsMaterial({ color: new THREE.Color("#ffa24a").multiplyScalar(3), size: 0.06, map: canvasTex(glowCanvas()), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  root.add(embers);
  // 舞う符: small paper slips, soft-edged and half dissolved; they thin out near the viewer
  const tex = canvasTex(talismanCanvas());
  const tGeo = new THREE.PlaneGeometry(0.075, 0.2);
  const talismans: { m: Obj; rad: number; h: number; speed: number; ph: number }[] = [];
  for (let i = 0; i < TALISMANS; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.8, 0.78, 0.74), transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    const m = new THREE.Mesh(tGeo, mat);
    m.raycast = () => undefined;
    root.add(m);
    talismans.push({ m, rad: 1.3 + r() * 2.2, h: 1.5 + r() * 2.8, speed: 0.07 + r() * 0.08, ph: r() * Math.PI * 2 });
  }
  // the plane
  const plane = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: "#20232e", roughness: 0.5, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.5, 9, 10), hull);
  body.rotation.z = Math.PI / 2;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2, 0.15, 10), hull);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2, 0.15), hull);
  tail.position.set(-4, 1, 0);
  const halo = canvasTex(glowCanvas());
  const beacon = glowSprite(halo, "#ff2a2a", 4, 1);
  beacon.material.fog = false;
  beacon.position.set(0, -0.8, 0);
  const landing = glowSprite(halo, "#fff4d6", 7, 1);
  landing.material.fog = false;
  landing.position.set(4.8, -0.2, 0);
  plane.add(body, wing, tail, beacon, landing);
  root.add(plane);
  const update = (t: number, dt: number, reduced: boolean, camera: Obj): void => {
    const k = reduced ? 0.25 : 1;
    smokeStep(dt, reduced);
    dripStep(dt, reduced);
    rainLines.visible = !reduced;
    if (!reduced) {
      for (let i = 0; i < drops; i++) {
        const o = i * 6;
        const fall = (14 + (i % 7)) * dt;
        rain[o + 1] -= fall;
        rain[o + 4] -= fall;
        if (rain[o + 4] < 0) place(i, 18 + r() * 4);
      }
      rainGeo.attributes.position.needsUpdate = true;
    }
    for (let i = 0; i < EMBERS; i++) {
      pos[i * 3 + 1] += vel[i] * dt * k;
      pos[i * 3] += Math.sin(t * 0.8 + i) * 0.12 * dt * k;
      if (pos[i * 3 + 1] > 9) spawn(i, false);
    }
    emberGeo.attributes.position.needsUpdate = true;
    for (const tl of talismans) {
      const a = tl.ph + t * tl.speed * k;
      tl.m.position.set(Math.cos(a) * tl.rad, tl.h + (reduced ? 0 : Math.sin(t * 0.9 + tl.ph) * 0.25), Math.sin(a) * tl.rad);
      tl.m.rotation.set(reduced ? 0 : Math.sin(t * 1.3 + tl.ph) * 0.4, -a, reduced ? 0 : Math.sin(t * 1.1 + tl.ph) * 0.3);
      // fade out as one drifts close to the viewer, and breathe in and out of sight
      const d = tl.m.position.distanceTo(camera.position);
      const near = Math.min(1, Math.max(0, (d - 2.2) / 2));
      tl.m.material.opacity = 0.8 * near * (reduced ? 1 : 0.6 + 0.4 * Math.sin(t * 0.7 + tl.ph * 3));
    }
    const cycle = 55;
    const u = ((t + 20) % cycle) / 18;
    plane.visible = !reduced && u < 1;
    if (plane.visible) {
      plane.position.set(-170 + u * 340, 75 - u * 18, -90 + u * 60);
      plane.rotation.y = -Math.atan2(60, 340);
      beacon.visible = Math.floor(t * 1.6) % 2 === 0;
    }
  };
  return { root, update };
};
