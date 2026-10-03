// Post-processing and image-based lighting for /world: a small HDR "neon
// room" baked into an environment map (so wet tiles, lacquer and card gloss
// reflect the red signs, the lamps and the moon), then render → bloom → vignette → output (ACES,
// sRGB) → FXAA. Also the run-time quality drop when frames are slow.
import * as THREE from "./vendor/three/three.module.js";
import { EffectComposer } from "./vendor/three/postprocessing/EffectComposer.js";
import { RenderPass } from "./vendor/three/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "./vendor/three/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "./vendor/three/postprocessing/ShaderPass.js";
import { OutputPass } from "./vendor/three/postprocessing/OutputPass.js";
import { FXAAPass } from "./vendor/three/postprocessing/FXAAPass.js";
import type { Obj, Quality } from "./world-kit.ts";

/** Neon panels, the moon and a warm lamp around a dark box: reflections without a second render. */
export const neonEnvironment = (renderer: Obj): Obj => {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.BoxGeometry(40, 30, 40), new THREE.MeshBasicMaterial({ color: "#050810", side: THREE.BackSide })));
  const panel = (color: string, gain: number, p: [number, number, number], s: [number, number]): void => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s[0], s[1]), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gain), side: THREE.DoubleSide }));
    m.position.set(p[0], p[1], p[2]);
    m.lookAt(0, 2, 0);
    env.add(m);
  };
  panel("#ff3a2c", 4, [-12, 5, -8], [2, 6]);
  panel("#ff3a2c", 4.5, [12, 7, -6], [2, 7]);
  panel("#ff4a1a", 3.5, [-8, 4, 12], [6, 2]);
  panel("#ffb040", 4, [10, 3, 11], [3, 3]);
  panel("#c8d6ff", 2.2, [-2, 13, -12], [3, 3]);
  panel("#ffc890", 2.5, [0, 12, 2], [2, 2]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
  return tex;
};

const VIGNETTE = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 0.42 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
  fragmentShader:
    "uniform sampler2D tDiffuse; uniform float uAmount; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = smoothstep(0.85, 0.2, length(d * vec2(1.0, 1.15))); c.rgb *= mix(1.0 - uAmount, 1.0, v); gl_FragColor = c; }",
};

export type Post = {
  render: () => void;
  setSize: (w: number, h: number) => void;
  applyQuality: (q: Quality) => void;
  /** renders one frame at `pixelRatio` (a high-res still), leaving the buffers at that size; undo with setSize */
  renderAt: (pixelRatio: number) => void;
  /** the canvas size in CSS pixels */
  size: () => { w: number; h: number };
};

export const buildPost = (renderer: Obj, scene: Obj, camera: Obj, q0: Quality): Post => {
  let q = q0;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.92);
  composer.addPass(bloom);
  composer.addPass(new ShaderPass(VIGNETTE));
  composer.addPass(new OutputPass());
  const fxaa = new FXAAPass();
  composer.addPass(fxaa);
  let size = { w: 1, h: 1 };
  const resizeAll = (w: number, h: number, dpr: number): void => {
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    composer.setPixelRatio(dpr);
    composer.setSize(w, h);
    // the bloom buffers at their own (smaller) scale
    bloom.setSize(Math.round(w * dpr * q.bloomScale * 2), Math.round(h * dpr * q.bloomScale * 2));
  };
  const setSize = (w: number, h: number): void => {
    size = { w, h };
    resizeAll(w, h, Math.min(window.devicePixelRatio || 1, q.dpr));
  };
  const renderAt = (pixelRatio: number): void => {
    resizeAll(size.w, size.h, pixelRatio);
    composer.render();
  };
  const applyQuality = (next: Quality): void => {
    q = next;
    setSize(size.w, size.h);
  };
  return { render: () => composer.render(), setSize, applyQuality, renderAt, size: () => size };
};
