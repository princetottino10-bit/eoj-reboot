// Shared three.js helpers for the world page: physically based materials,
// instanced batches (a whole block of AC units costs one draw call), canvas
// textures, sagging wires, and the quality tier.
import * as THREE from "./vendor/three/three.module.js";

/** three.js objects are typed loosely (see vendor/three/three.module.d.ts). */
export type Obj = any;

export type Vec3 = [number, number, number];

/** Render quality: chosen at start (phone / weak CPU → low), can drop at run time on low FPS. */
export type Quality = {
  tier: "high" | "low";
  /** device pixel ratio cap */
  dpr: number;
  shadowSize: number;
  /** bloom buffer size relative to the canvas */
  bloomScale: number;
  /** 0..1: share of the optional clutter (AC units, rain drops, signs) that is built */
  density: number;
  /** extra coloured point lights (neon spill, lanterns) */
  pointLights: number;
};

export const QUALITY: Record<"high" | "low", Quality> = {
  high: { tier: "high", dpr: 2, shadowSize: 2048, bloomScale: 0.5, density: 1, pointLights: 6 },
  low: { tier: "low", dpr: 1.25, shadowSize: 1024, bloomScale: 0.33, density: 0.6, pointLights: 3 },
};

/** ?q=high / ?q=low forces a tier; otherwise phones and small CPUs start low. */
export const pickQuality = (search: string, nav: Navigator, coarse: boolean): Quality => {
  const forced = new URLSearchParams(search).get("q");
  if (forced === "high" || forced === "low") return QUALITY[forced];
  const phone = coarse || /Mobi|Android|iPhone|iPad/i.test(nav.userAgent);
  const weak = (nav.hardwareConcurrency ?? 8) <= 4;
  return phone || weak ? QUALITY.low : QUALITY.high;
};

export const std = (color: number | string, roughness: number, metalness = 0, extra: Record<string, unknown> = {}): Obj =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });

export type Item = {
  p: Vec3;
  s: Vec3;
  /** rotation about y, radians */
  ry?: number;
  /** rotation about x, radians, applied before the y turn (lay a pole down, then aim it) */
  rx?: number;
  color: number | string;
};

/** One instanced mesh for many copies of `geo`, colours per instance; casts and receives shadows. */
export const batch = (geo: Obj, mat: Obj, items: Item[], shadows = true): Obj => {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  mesh.count = items.length;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  items.forEach((it, i) => {
    e.set(it.rx ?? 0, it.ry ?? 0, 0, "YXZ");
    q.setFromEuler(e);
    pos.set(it.p[0], it.p[1], it.p[2]);
    scl.set(it.s[0], it.s[1], it.s[2]);
    m.compose(pos, q, scl);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, col.set(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
};

export const canvasTex = (c: HTMLCanvasElement, repeat: [number, number] | null = null, color = true): Obj => {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat !== null) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
};

/** Points of a sagging wire from a to b (a parabola below the chord). */
export const sagPoints = (a: Vec3, b: Vec3, sag: number, steps: number): Vec3[] => {
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  return out;
};

/** Many polylines as one LineSegments (cables: thin, dark). */
export const wires = (lines: Vec3[][], color: number | string = 0x07070a): Obj => {
  const flatPts: number[] = [];
  for (const pts of lines) {
    for (let i = 0; i + 1 < pts.length; i++) flatPts.push(...pts[i], ...pts[i + 1]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(flatPts, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color }));
};

/** A camera-facing additive glow (lantern halo, card aura). */
export const glowSprite = (tex: Obj, color: number | string, size: number, opacity = 1): Obj => {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  s.scale.set(size, size, 1);
  return s;
};
