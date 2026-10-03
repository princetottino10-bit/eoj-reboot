// /world — a showcase 3D scene of the game's world, not a game: a rooftop in a
// Kowloon-Walled-City-like block at night, the lacquered 九宮盤 on a mahjong
// table, and the 式神 cards of 玖龍街一門 and 酒呑一門 floating over it.
// Physically based materials, moonlight with soft shadows, neon and lantern
// light, bloom and ACES tone mapping. three.js is vendored (three@0.186.1).
import * as THREE from "./vendor/three/three.module.js";
import { OrbitControls } from "./vendor/three/OrbitControls.js";
import { pickQuality, QUALITY } from "./world-kit.ts";
import type { Obj, Quality } from "./world-kit.ts";
import { buildPost, neonEnvironment } from "./world-post.ts";
import { buildCity } from "./world-city.ts";
import { buildRoof } from "./world-roof.ts";
import { buildFx } from "./world-fx.ts";
import { buildProps } from "./world-props.ts";
import { lightCone } from "./world-volume.ts";
import { setupCapture } from "./world-capture.ts";
import { buildCards, PACK_URL, parsePack } from "./world-cards.ts";
import type { CardInfo, Cards } from "./world-cards.ts";
import { GOTHIC, MINCHO } from "./world-paint.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`#${id} is missing`);
  return el as T;
};

const stage = $<HTMLDivElement>("stage");
const loading = $<HTMLDivElement>("loading");
const loadingText = $<HTMLParagraphElement>("loading-text");
const loadingBar = $<HTMLSpanElement>("loading-bar");
const caption = $<HTMLElement>("caption");
const hint = $<HTMLParagraphElement>("hint");
const notice = $<HTMLParagraphElement>("notice");

const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
let reduced = motionQuery.matches;

/** The part of the scene that has to stay framed: the board and the cards over it. */
const FRAME_W = 5.1;
/** On a portrait phone: the table's width (the heroes move in over it). */
const FRAME_W_NARROW = 3.5;
const FRAME_H = 5.3;
const TARGET_WIDE = new THREE.Vector3(0, 2.2, -0.5);
/** Portrait: aim a little lower so the board sits mid-screen with the towers and sky above. */
const TARGET_NARROW = new THREE.Vector3(0, 2.35, -0.4);
/** Towers start ~10 m out: the camera stays inside the rooftop. */
const MAX_DIST = 9.4;

const narrow = (aspect: number): boolean => aspect < 0.8;
const fovFor = (aspect: number): number => (narrow(aspect) ? 62 : 50);
/** On a portrait phone the two clans move closer together so both stay in frame. */
const spreadFor = (aspect: number): number => (narrow(aspect) ? 0.6 : 1);

/** Camera distance that fits the board and cards for this aspect ratio. */
const fitDistance = (aspect: number, fov: number): number => {
  const tanV = Math.tan(((fov / 2) * Math.PI) / 180);
  const byH = FRAME_H / 2 / tanV;
  const byW = (narrow(aspect) ? FRAME_W_NARROW : FRAME_W) / 2 / (tanV * aspect);
  return Math.min(MAX_DIST, Math.max(4.2, Math.max(byH, byW) * 1.06));
};

const showError = (msg: string): void => {
  loading.hidden = false;
  loading.classList.add("is-error");
  loadingText.textContent = msg;
};

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

const loadFonts = async (): Promise<void> => {
  if (!("fonts" in document)) return;
  const signs = "金龍茶餐廳永發押福記冰室萬安藥房榮華酒家玖士多新光髮廊德興涼大排檔祥麻雀同旅館寶生舖土地先後";
  await withTimeout(
    Promise.all([
      document.fonts.load(`800 40px ${MINCHO}`, "灯籠の精提灯お化け影鬼古箪笥鎖鬼首引姫僵尸公主茨木童子酒呑玖龍街一門勅令"),
      document.fonts.load(`800 40px ${GOTHIC}`, signs + "攻命0123456789"),
    ]).catch(() => undefined),
    2500,
  );
};

const renderCaption = (info: CardInfo): void => {
  const set = (sel: string, text: string): void => {
    const el = caption.querySelector(sel);
    if (el !== null) el.textContent = text;
  };
  set(".wc-name", info.name);
  set(".wc-clan", info.clan);
  set(".wc-effect", info.effect);
  set(".wc-stats", `召喚コスト ${info.cost} ・ 攻 ${info.atk} ・ 命 ${info.hp}`);
  set(".wc-board", info.board ?? "");
  caption.dataset.clan = info.clan.startsWith("酒呑") ? "shuten" : "kuryu";
  caption.hidden = false;
};

const start = (): void => {
  let q: Quality = pickQuality(location.search, navigator, window.matchMedia("(pointer: coarse)").matches);
  const forced = new URLSearchParams(location.search).has("q");
  let renderer: Obj;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  } catch {
    showError("この端末・ブラウザでは3D表示を開けませんでした");
    return;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  // PCF with a blur radius (three r18x folded PCFSoft into PCF)
  renderer.shadowMap.type = THREE.PCFShadowMap;
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#04070e");
  // ink-navy haze: far signs sink into it
  scene.fog = new THREE.FogExp2("#0a1322", 0.017);
  scene.environment = neonEnvironment(renderer);
  scene.environmentIntensity = 0.7;
  const aspect0 = stage.clientWidth / Math.max(1, stage.clientHeight);
  const camera = new THREE.PerspectiveCamera(fovFor(aspect0), aspect0, 0.1, 1000);
  const d0 = fitDistance(aspect0, fovFor(aspect0));
  const TARGET = narrow(aspect0) ? TARGET_NARROW : TARGET_WIDE;
  const polar0 = narrow(aspect0) ? 1.3 : 1.25;
  // a little from the right: the pieces facing right (east) show their faces too
  const az0 = narrow(aspect0) ? 0.1 : 0.2;
  camera.position.set(
    TARGET.x + d0 * Math.sin(polar0) * Math.sin(az0),
    TARGET.y + d0 * Math.cos(polar0),
    TARGET.z + d0 * Math.sin(polar0) * Math.cos(az0),
  );
  scene.add(new THREE.HemisphereLight("#3c5078", "#14100f", 0.9));
  // cool moonlight from high over the slot between the towers: the one shadow-casting light
  const moonLight = new THREE.DirectionalLight("#a9bcff", 1.3);
  moonLight.position.set(-5, 26, -12);
  moonLight.castShadow = true;
  const sc = moonLight.shadow.camera;
  sc.left = -12;
  sc.right = 12;
  sc.top = 12;
  sc.bottom = -12;
  sc.near = 1;
  sc.far = 70;
  moonLight.shadow.mapSize.set(q.shadowSize, q.shadowSize);
  moonLight.shadow.bias = -0.0004;
  moonLight.shadow.normalBias = 0.03;
  moonLight.shadow.radius = 3;
  scene.add(moonLight);

  const city = buildCity(q);
  const roof = buildRoof(q);
  const fx = buildFx(roof.incense, roof.boardY, q, city.drips);
  const props = buildProps(q);
  scene.add(city.root, roof.root, fx.root, props.root);
  // the nearest neon signs throw a coloured haze down in front of them
  for (const g of city.glows) {
    const apex: [number, number, number] = [g.pos[0] + g.n[0] * 0.3, g.pos[1], g.pos[2] + g.n[2] * 0.3];
    scene.add(lightCone(apex, [apex[0] + g.n[0] * 1.6, apex[1] - 4.5, apex[2] + g.n[2] * 1.6], 1.3, g.color, 0.12).mesh);
  }
  const post = buildPost(renderer, scene, camera, q);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(TARGET);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = MAX_DIST;
  controls.minPolarAngle = 0.55;
  controls.maxPolarAngle = 1.5;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.7;
  // the slow auto-orbit starts once the cards are up (so the first view is the framed one)
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.35;
  controls.update();

  let idleTimer = 0;
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    window.clearTimeout(idleTimer);
    hint.classList.add("is-gone");
  });
  controls.addEventListener("end", () => {
    window.clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      controls.autoRotate = !reduced && caption.hidden;
    }, 6000);
  });
  motionQuery.addEventListener("change", () => {
    reduced = motionQuery.matches;
    controls.autoRotate = !reduced;
  });

  let cards: Cards | null = null;
  const resize = (): void => {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    camera.aspect = w / h;
    camera.fov = fovFor(camera.aspect);
    camera.updateProjectionMatrix();
    post.setSize(w, h);
    cards?.setSpread(spreadFor(camera.aspect));
  };
  resize();
  window.addEventListener("resize", resize);

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  // a tap is a press that did not turn into a drag (no time limit: slow phones take a while per frame)
  let down: { x: number; y: number } | null = null;
  const canvas: HTMLCanvasElement = renderer.domElement;
  canvas.addEventListener("pointerdown", (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerup", (e: PointerEvent) => {
    const d = down;
    down = null;
    if (d === null || cards === null) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8) return;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(cards.meshes, true)[0];
    const info = hit === undefined ? null : cards.infoOf(hit.object);
    if (hit === undefined || info === null) {
      cards.select(null);
      caption.hidden = true;
      return;
    }
    cards.select(hit.object);
    controls.autoRotate = false;
    renderCaption(info);
  });
  caption.querySelector(".wc-close")?.addEventListener("click", () => {
    cards?.select(null);
    caption.hidden = true;
  });

  // adaptive quality: once the cards are up, slow frames step the quality down (twice at most)
  const lower = (next: Quality): void => {
    q = next;
    post.applyQuality(q);
    if (moonLight.shadow.map) {
      moonLight.shadow.map.dispose();
      moonLight.shadow.map = null;
    }
    moonLight.shadow.mapSize.set(q.shadowSize, q.shadowSize);
  };
  let probe = { frames: 0, time: 0, steps: 0 };
  const watchFps = (dt: number): void => {
    if (forced || cards === null || probe.steps >= 2) return;
    probe.frames += 1;
    probe.time += dt;
    if (probe.time < 2.5) return;
    const fps = probe.frames / probe.time;
    probe = { frames: 0, time: 0, steps: probe.steps + 1 };
    if (fps >= 40) {
      probe.steps = 2;
      return;
    }
    lower(q.tier === "high" ? QUALITY.low : { ...QUALITY.low, dpr: 1, bloomScale: 0.25 });
  };

  let captureStep: ((dt: number) => void) | null = null;
  setupCapture({
    renderer,
    post,
    controls,
    camera,
    onFrame: (step) => {
      captureStep = step;
    },
    lowTier: () => q.tier === "low",
    restoreSize: resize,
  });

  let last = performance.now();
  let t = 0;
  const frame = (): void => {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    t += dt;
    watchFps(dt);
    city.update(t, dt, reduced);
    roof.update(t, dt, reduced);
    fx.update(t, dt, reduced, camera);
    props.update(t, dt, reduced);
    cards?.update(t, reduced, camera);
    // while a loop video records, the capture drives the camera instead of the controls
    if (captureStep !== null) captureStep(dt);
    else controls.update(dt);
    post.render();
  };
  renderer.setAnimationLoop(frame);
  // nothing to draw while the tab is hidden
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      renderer.setAnimationLoop(null);
    } else {
      last = performance.now();
      renderer.setAnimationLoop(frame);
    }
  });

  const setProgress = (f: number): void => {
    loadingBar.style.transform = `scaleX(${Math.max(0.05, Math.min(1, f))})`;
  };
  setProgress(0.1);
  void (async () => {
    try {
      await loadFonts();
      setProgress(0.25);
      const res = await fetch(PACK_URL);
      if (!res.ok) throw new Error(`pack ${res.status}`);
      const pack = parsePack(await res.json());
      cards = await buildCards(pack, q, roof.boardY, (f) => setProgress(0.25 + f * 0.75));
      cards.setSpread(spreadFor(camera.aspect));
      scene.add(cards.root);
      if (cards.missing > 0) {
        notice.textContent = `カードの絵を${cards.missing}枚読み込めませんでした(名前だけ表示しています)`;
        notice.hidden = false;
      }
      loading.hidden = true;
      controls.autoRotate = !reduced;
    } catch {
      showError("カードの情報を読み込めませんでした。再読み込みしてください");
    }
  })();
};

start();
