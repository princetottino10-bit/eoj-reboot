// The night sky over the block: an ink-navy gradient (never purple) with a
// little of the city's red glow low on the horizon, stars, a small correctly exposed moon with a soft halo,
// clouds lit from below by the city, and the hills (Lion Rock) behind.
import * as THREE from "./vendor/three/three.module.js";
import { canvasTex, glowSprite } from "./world-kit.ts";
import type { Obj, Vec3 } from "./world-kit.ts";
import { glowCanvas, makeCanvas, rng } from "./world-paint.ts";

/** Where the moon hangs; the towers that way stay low so it shows through the gap. */
export const MOON_DIR: Vec3 = [-0.08, 0.17, -0.98];

const moonCanvas = (): HTMLCanvasElement => {
  const S = 256;
  const { c, g } = makeCanvas(S, S);
  const r = rng(3);
  const m = S / 2;
  const disc = g.createRadialGradient(m - 10, m - 12, 10, m, m, m - 4);
  disc.addColorStop(0, "#fffaf0");
  disc.addColorStop(0.75, "#ece6d8");
  disc.addColorStop(1, "#b9b2a4");
  g.fillStyle = disc;
  g.beginPath();
  g.arc(m, m, m - 4, 0, Math.PI * 2);
  g.fill();
  // maria and craters, clipped to the disc
  g.save();
  g.clip();
  for (const [x, y, rad] of [[0.38, 0.36, 0.2], [0.6, 0.42, 0.14], [0.5, 0.62, 0.17], [0.3, 0.6, 0.1], [0.68, 0.66, 0.09]]) {
    g.fillStyle = "rgba(120,118,112,0.35)";
    g.beginPath();
    g.ellipse(x * S, y * S, rad * S, rad * S * 0.8, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let k = 0; k < 40; k++) {
    g.strokeStyle = `rgba(90,88,84,${0.1 + r() * 0.2})`;
    g.beginPath();
    g.arc(r() * S, r() * S, 2 + r() * 7, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
  return c;
};

/** Soft cumulus puffs, dark on top and warm-magenta underneath (the city glow). */
const cloudCanvas = (seed: number): HTMLCanvasElement => {
  const W = 512;
  const H = 192;
  const { c, g } = makeCanvas(W, H);
  const r = rng(seed);
  for (let k = 0; k < 70; k++) {
    const x = 40 + r() * (W - 80);
    const y = H * 0.35 + r() * H * 0.4 - Math.sin((x / W) * Math.PI) * 30;
    const rad = 18 + r() * 46;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, "rgba(255,255,255,0.5)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = "source-atop";
  const tint = g.createLinearGradient(0, 0, 0, H);
  tint.addColorStop(0, "#131b2e");
  tint.addColorStop(0.6, "#202b44");
  tint.addColorStop(1, "#4a3238");
  g.fillStyle = tint;
  g.fillRect(0, 0, W, H);
  return c;
};

const SKY_VERT = "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }";
const SKY_FRAG = /* glsl */ `
uniform vec3 zenith; uniform vec3 mid; uniform vec3 horizon; uniform vec3 glow; uniform vec3 moonDir;
varying vec3 vDir;
void main(){
  float y = vDir.y;
  vec3 c = mix(horizon, mid, smoothstep(0.0, 0.25, y));
  c = mix(c, zenith, smoothstep(0.2, 0.85, y));
  c += glow * pow(clamp(1.0 - y, 0.0, 1.0), 10.0);
  // faint scattering around the moon
  c += vec3(0.16, 0.19, 0.3) * pow(max(dot(normalize(vDir), moonDir), 0.0), 60.0);
  gl_FragColor = vec4(c, 1.0);
}`;

export const buildSky = (root: Obj, cloudCount: number): void => {
  const r = rng(99);
  const moonDir = new THREE.Vector3(MOON_DIR[0], MOON_DIR[1], MOON_DIR[2]).normalize();
  const sky = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color("#02050c") },
      mid: { value: new THREE.Color("#081226") },
      horizon: { value: new THREE.Color("#101a30") },
      glow: { value: new THREE.Color("#3a1414") },
      moonDir: { value: moonDir },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), sky);
  dome.renderOrder = -10;
  root.add(dome);
  const pts: number[] = [];
  for (let i = 0; i < 600; i++) {
    const a = r() * Math.PI * 2;
    const y = 0.12 + r() * 0.88;
    const k = Math.sqrt(1 - y * y);
    pts.push(Math.cos(a) * k * 420, y * 420, Math.sin(a) * k * 420);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  root.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: "#aeb8e0", size: 1.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));
  // the moon: small, textured, just bright enough for a gentle bloom
  const moonTex = canvasTex(moonCanvas());
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(7.5, 48),
    new THREE.MeshBasicMaterial({ map: moonTex, color: new THREE.Color(1.15, 1.13, 1.08), fog: false, transparent: true }),
  );
  moon.position.copy(moonDir.clone().multiplyScalar(380));
  moon.lookAt(0, 0, 0);
  root.add(moon);
  const halo = glowSprite(canvasTex(glowCanvas()), "#8fa2dc", 55, 0.28);
  halo.material.fog = false;
  halo.position.copy(moonDir.clone().multiplyScalar(385));
  root.add(halo);
  // clouds lit from below by the city
  for (let i = 0; i < cloudCount; i++) {
    // the first three sit in the slot between the towers, around the moon; the rest all round
    const near = i < 3;
    const a = Math.atan2(MOON_DIR[2], MOON_DIR[0]) + (near ? (i - 1) * 0.22 + (r() - 0.5) * 0.1 : (r() - 0.5) * 2.4 + (i % 3 === 0 ? Math.PI : 0));
    const el = near ? 0.12 + i * 0.07 : 0.05 + r() * 0.3;
    const d = new THREE.Vector3(Math.cos(a), el, Math.sin(a)).normalize();
    const w = 140 + r() * 140;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w * 0.375),
      new THREE.MeshBasicMaterial({ map: canvasTex(cloudCanvas(10 + i)), color: new THREE.Color(0.95, 0.9, 0.95), opacity: 0.75, transparent: true, depthWrite: false, fog: false }),
    );
    m.position.copy(d.multiplyScalar(330));
    m.lookAt(0, m.position.y * 0.6, 0);
    m.renderOrder = -5;
    root.add(m);
  }
  // hills behind the city (Lion Rock)
  const hill: number[] = [];
  const idx: number[] = [];
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const h = 8 + 7 * Math.sin(a * 3 + 1) + 5 * Math.sin(a * 7 + 2) + (Math.abs(a - 3.9) < 0.35 ? 22 * Math.cos((a - 3.9) * 4.4) : 0);
    hill.push(Math.cos(a) * 320, -30, Math.sin(a) * 320, Math.cos(a) * 320, h, Math.sin(a) * 320);
    if (i < steps) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const hg = new THREE.BufferGeometry();
  hg.setAttribute("position", new THREE.Float32BufferAttribute(hill, 3));
  hg.setIndex(idx);
  const hills = new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: "#0b0e1e", fog: false, side: THREE.DoubleSide }));
  hills.renderOrder = -4;
  root.add(hills);
};
