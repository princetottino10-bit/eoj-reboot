// The facade material for every tower: one MeshStandardMaterial whose colour
// and window lights are sampled in world space (so boxes of any size keep
// storey-sized windows), with a per-building shift and mirror so the 8 m tile
// does not read. Walls: stained concrete, pale tile patches, rusty grilles, and
// on a second, longer period torn posters, spray scribbles and rust drips; a
// large-scale grime map on top. Roofs: wet slab.
import * as THREE from "./vendor/three/three.module.js";
import { canvasTex } from "./world-kit.ts";
import type { Obj } from "./world-kit.ts";
import { makeCanvas, rng } from "./world-paint.ts";

/** One facade tile covers CELL×CELL metres: 5 windows across, 3 storeys up. */
const CELL = 8;
const COLS = 5;
const ROWS = 3;
const PX = 512;

const cellRect = (i: number, j: number): [number, number, number, number] => {
  const cw = PX / COLS;
  const ch = PX / ROWS;
  return [i * cw + cw * 0.2, j * ch + ch * 0.22, cw * 0.6, ch * 0.5];
};

const facadeCanvas = (): HTMLCanvasElement => {
  const { c, g } = makeCanvas(PX, PX);
  const r = rng(51);
  g.fillStyle = "#8b8a86";
  g.fillRect(0, 0, PX, PX);
  // patches of repair: lighter render, pale mosaic tiles, darker concrete
  for (let k = 0; k < 26; k++) {
    const tones = ["#9d9a93", "#7a7873", "#a9aaa4", "#8f8577", "#6f6d6a"];
    g.fillStyle = tones[Math.floor(r() * tones.length)];
    g.fillRect(r() * PX, r() * PX, 40 + r() * 140, 30 + r() * 110);
  }
  g.fillStyle = "#b9bdb8";
  for (let k = 0; k < 3; k++) {
    const x0 = r() * PX;
    const y0 = r() * PX;
    for (let a = 0; a < 10; a++) for (let b = 0; b < 8; b++) g.fillRect(x0 + a * 9, y0 + b * 9, 8, 8);
  }
  // floor slabs
  g.fillStyle = "rgba(40,38,36,0.45)";
  for (let j = 0; j < ROWS; j++) g.fillRect(0, (j * PX) / ROWS, PX, 7);
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const [x, y, w, h] = cellRect(i, j);
      // rain streaks below the sill
      const grad = g.createLinearGradient(0, y + h, 0, y + h + 90);
      grad.addColorStop(0, "rgba(30,26,22,0.55)");
      grad.addColorStop(1, "rgba(30,26,22,0)");
      g.fillStyle = grad;
      g.fillRect(x + w * 0.1, y + h, w * 0.8, 90);
      g.fillStyle = "#3c3f45";
      g.fillRect(x - 4, y - 4, w + 8, h + 8);
      g.fillStyle = "#1a1e26";
      g.fillRect(x, y, w, h);
      // rusty window grille
      g.strokeStyle = "#6b4630";
      g.lineWidth = 3;
      for (let b = 1; b < 4; b++) {
        g.beginPath();
        g.moveTo(x + (w * b) / 4, y);
        g.lineTo(x + (w * b) / 4, y + h);
        g.stroke();
      }
      g.beginPath();
      g.moveTo(x, y + h / 2);
      g.lineTo(x + w, y + h / 2);
      g.stroke();
    }
  }
  // grime
  for (let k = 0; k < 3000; k++) {
    g.fillStyle = `rgba(20,18,16,${0.05 + r() * 0.12})`;
    g.fillRect(r() * PX, r() * PX, 1 + r() * 3, 1 + r() * 6);
  }
  return c;
};

/** Which windows glow and how: warm tungsten, cool tubes, the odd red curtain. Same layout as the facade. */
const litCanvas = (): HTMLCanvasElement => {
  const { c, g } = makeCanvas(PX, PX);
  const r = rng(88);
  g.fillStyle = "#000";
  g.fillRect(0, 0, PX, PX);
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const roll = r();
      // tungsten, a few white tubes, the odd red-curtained room: no other colours in this city
      const color = roll < 0.3 ? "#ffb467" : roll < 0.37 ? "#f1ead8" : roll < 0.4 ? "#c8402e" : null;
      if (color === null) continue;
      const [x, y, w, h] = cellRect(i, j);
      g.fillStyle = color;
      g.globalAlpha = 0.55 + r() * 0.45;
      g.fillRect(x, y, w, h);
      g.globalAlpha = 1;
      g.fillStyle = "#000";
      for (let b = 1; b < 4; b++) g.fillRect(x + (w * b) / 4 - 1.5, y, 3, h);
      g.fillRect(x, y + h / 2 - 1.5, w, 3);
      // a curtain half-drawn on some
      if (r() < 0.4) {
        g.fillStyle = "rgba(0,0,0,0.6)";
        g.fillRect(x, y, w * (0.3 + r() * 0.4), h);
      }
    }
  }
  return c;
};

const roofCanvas = (): HTMLCanvasElement => {
  const { c, g } = makeCanvas(256, 256);
  const r = rng(12);
  g.fillStyle = "#4a4a4c";
  g.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 40; k++) {
    g.fillStyle = `rgba(${20 + r() * 40},${20 + r() * 30},${20 + r() * 20},${0.15 + r() * 0.25})`;
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 10 + r() * 40, 6 + r() * 30, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let k = 0; k < 2000; k++) {
    g.fillStyle = `rgba(10,10,12,${r() * 0.2})`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  return c;
};

/** Posters, scribbles and rust drips on a transparent 23 m × 17 m tile (no real text or brands). */
const decalCanvas = (): HTMLCanvasElement => {
  const S = 1024;
  const { c, g } = makeCanvas(S, S);
  const r = rng(404);
  // rust drips and pipe stains
  for (let k = 0; k < 46; k++) {
    const x = r() * S;
    const y = r() * S;
    const len = 40 + r() * 220;
    const w = k < 8 ? 8 + r() * 8 : 2 + r() * 5;
    const grad = g.createLinearGradient(0, y, 0, y + len);
    grad.addColorStop(0, `rgba(${110 + r() * 40},${55 + r() * 20},25,0.55)`);
    grad.addColorStop(1, "rgba(90,50,25,0)");
    g.fillStyle = grad;
    g.fillRect(x, y, w, len);
  }
  // torn posters: faded blocks, fake print lines, ragged edges, a missing corner now and then
  const paper = ["#d9c9a0", "#c9453a", "#d8c46a", "#5f6f88", "#efe9dc", "#b8544a", "#b7ab8c"];
  for (let k = 0; k < 26; k++) {
    const w = 26 + r() * 50;
    const h = w * (1.2 + r() * 0.5);
    const x = r() * (S - w);
    const y = r() * (S - h);
    g.save();
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i <= 6; i++) g.lineTo(x + (w * i) / 6, y + (r() - 0.5) * 5);
    for (let i = 0; i <= 6; i++) g.lineTo(x + w + (r() - 0.5) * 5, y + (h * i) / 6);
    const torn = r() < 0.5 ? h * (0.3 + r() * 0.4) : 0;
    g.lineTo(x + w * 0.6, y + h - torn);
    g.lineTo(x, y + h - torn * r());
    g.closePath();
    g.clip();
    g.globalAlpha = 0.55 + r() * 0.3;
    g.fillStyle = paper[Math.floor(r() * paper.length)];
    g.fillRect(x - 4, y - 4, w + 8, h + 8);
    g.fillStyle = "rgba(30,24,20,0.6)";
    g.fillRect(x + w * 0.15, y + h * 0.12, w * 0.7, h * 0.14);
    for (let i = 0; i < 5; i++) g.fillRect(x + w * 0.12, y + h * (0.38 + i * 0.1), w * (0.4 + r() * 0.4), 2);
    g.globalAlpha = 1;
    g.restore();
  }
  // spray scribbles (shapes only)
  const spray = ["#b8322a", "#f4f1e6", "#1a1a1a", "#c9a23a", "#2a3550"];
  g.lineCap = "round";
  for (let k = 0; k < 22; k++) {
    g.strokeStyle = spray[Math.floor(r() * spray.length)];
    g.globalAlpha = 0.45 + r() * 0.35;
    g.lineWidth = 2 + r() * 4;
    let x = r() * S;
    let y = r() * S;
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < 4; i++) {
      const nx = x + (r() - 0.3) * 60;
      const ny = y + (r() - 0.5) * 30;
      g.bezierCurveTo(x + (r() - 0.5) * 50, y - 25 * r(), nx - 20, ny + 25 * r(), nx, ny);
      x = nx;
      y = ny;
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  return c;
};

/** Low-frequency grime: soft light and dark blotches across whole buildings. */
const grimeCanvas = (): HTMLCanvasElement => {
  const S = 256;
  const { c, g } = makeCanvas(S, S);
  const r = rng(77);
  g.fillStyle = "rgb(150,150,150)";
  g.fillRect(0, 0, S, S);
  for (let k = 0; k < 90; k++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 10 + r() * 50;
    const v = r() < 0.55 ? 40 : 255;
    for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const grad = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
      grad.addColorStop(0, `rgba(${v},${v},${v},0.22)`);
      grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = grad;
      g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
    }
  }
  return c;
};

const VERT_HEAD = /* glsl */ `
varying vec3 vFacadePos;
varying vec3 vFacadeN;
flat varying float vFacadeSeed;
`;

const VERT_BODY = /* glsl */ `
vec4 fwp = vec4(transformed, 1.0);
vec3 fnrm = objectNormal;
#ifdef USE_INSTANCING
  fwp = instanceMatrix * fwp;
  fnrm = mat3(instanceMatrix) * fnrm;
  vFacadeSeed = float(gl_InstanceID);
#else
  vFacadeSeed = 0.0;
#endif
fwp = modelMatrix * fwp;
vFacadePos = fwp.xyz;
vFacadeN = normalize(mat3(modelMatrix) * fnrm);
`;

const FRAG_HEAD = /* glsl */ `
uniform sampler2D uFacade;
uniform sampler2D uLit;
uniform sampler2D uRoof;
uniform sampler2D uDecal;
uniform sampler2D uGrime;
uniform float uCell;
uniform float uLitGain;
varying vec3 vFacadePos;
varying vec3 vFacadeN;
flat varying float vFacadeSeed;
`;

const FRAG_MAP = /* glsl */ `
vec3 fan = abs(vFacadeN);
// per-building hash from the (flat, whole-number) instance id: stable across the face
float fseed = floor(vFacadeSeed + 0.5);
float fh = fract(fseed * 0.61803398875);
float fh2 = fract(fseed * 0.41421356237 + 0.3);
float fh3 = fract(fseed * 0.7548776662 + 0.1);
bool froof = fan.y > 0.6;
// metres along the wall; half the buildings mirrored
vec2 wuv = vec2((fan.x > fan.z ? vFacadePos.z : vFacadePos.x) * (fh3 > 0.5 ? -1.0 : 1.0), vFacadePos.y);
// shift by whole window columns and whole storeys, so windows stay whole
vec2 fuv = froof ? vFacadePos.xz / 4.0 : wuv / uCell + vec2(floor(fh * 5.0) / 5.0, floor(fh2 * 3.0) / 3.0);
// sample everything outside any branch (derivatives, hence mip levels, must stay defined)
vec4 fcolRoof = texture2D(uRoof, fuv);
vec4 fcolWall = texture2D(uFacade, fuv);
vec4 fdec = texture2D(uDecal, wuv / vec2(23.0, 17.0) + vec2(fh * 3.1, fh2 * 2.3));
float fgrime = texture2D(uGrime, wuv / 31.0 + vec2(fh2, fh)).r;
vec3 fLit = texture2D(uLit, fuv + vec2(floor(fh2 * 5.0) / 5.0, floor(fh * 3.0) / 3.0)).rgb * (1.0 - fdec.a);
vec3 fwall = mix(fcolWall.rgb * mix(0.62, 1.12, fgrime), fdec.rgb, fdec.a);
diffuseColor.rgb *= froof ? fcolRoof.rgb * mix(0.7, 1.1, fgrime) : fwall;
`;

const FRAG_EMISSIVE = /* glsl */ `
totalEmissiveRadiance += froof ? vec3(0.0) : fLit * uLitGain;
`;

/** The shared tower material. `litGain` scales how bright the lit windows are (bloom picks them up). */
export const facadeMaterial = (litGain: number): Obj => {
  const repeat = (c: HTMLCanvasElement, color: boolean): Obj => {
    const t = canvasTex(c, [1, 1], color);
    t.generateMipmaps = true;
    return t;
  };
  const uniforms = {
    uFacade: { value: repeat(facadeCanvas(), true) },
    uLit: { value: repeat(litCanvas(), true) },
    uRoof: { value: repeat(roofCanvas(), true) },
    uDecal: { value: repeat(decalCanvas(), true) },
    uGrime: { value: repeat(grimeCanvas(), false) },
    uCell: { value: CELL },
    uLitGain: { value: litGain },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.02, emissive: 0x000000 });
  mat.onBeforeCompile = (shader: Obj) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERT_HEAD}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_HEAD}`)
      .replace("#include <map_fragment>", FRAG_MAP)
      .replace("#include <emissivemap_fragment>", FRAG_EMISSIVE);
  };
  mat.customProgramCacheKey = () => "yy-facade";
  return mat;
};
