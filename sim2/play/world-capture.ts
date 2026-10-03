// 撮影 mode for /world: hides the page UI, frees the camera, and offers a
// high-res still (PNG, 4K on the long side where the device allows) and a
// 15-second seamless loop video of one full orbit (WebM via MediaRecorder).
// Esc, the 戻る button or the browser's back button return to the page.
import type { Obj } from "./world-kit.ts";
import type { Post } from "./world-post.ts";

export const LOOP_SECONDS = 15;
/** Long side of a saved still, in pixels (the device may cap it lower). */
const STILL_LONG_SIDE = 3840;

export type CaptureDeps = {
  renderer: Obj;
  post: Post;
  controls: Obj;
  camera: Obj;
  /** the per-frame hook: the capture drives the camera while recording */
  onFrame: (step: ((dt: number) => void) | null) => void;
  /** whether the page is on the low quality tier (smaller stills there) */
  lowTier: () => boolean;
  /** restores the normal render size after a still */
  restoreSize: () => void;
};

const stamp = (): string => {
  const d = new Date();
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

const download = (blob: Blob, name: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
};

/** The WebM flavour this browser can record, or null. */
export const pickVideoType = (canRecord: (t: string) => boolean): string | null => {
  for (const t of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) if (canRecord(t)) return t;
  return null;
};

export const setupCapture = (deps: CaptureDeps): void => {
  const body = document.body;
  const enterBtn = document.getElementById("capture");
  const bar = document.getElementById("capbar");
  const status = document.getElementById("cap-status");
  const progress = document.getElementById("cap-progress");
  const fill = document.getElementById("cap-fill");
  if (enterBtn === null || bar === null || status === null || progress === null || fill === null) return;
  const stillBtn = bar.querySelector<HTMLButtonElement>('[data-cap="still"]');
  const videoBtn = bar.querySelector<HTMLButtonElement>('[data-cap="video"]');
  const exitBtn = bar.querySelector<HTMLButtonElement>('[data-cap="exit"]');
  const canvas: HTMLCanvasElement = deps.renderer.domElement;
  const Recorder = (window as { MediaRecorder?: typeof MediaRecorder }).MediaRecorder;
  const videoType = Recorder !== undefined && typeof canvas.captureStream === "function" ? pickVideoType((t) => Recorder.isTypeSupported(t)) : null;
  if (videoType === null && videoBtn !== null) {
    videoBtn.disabled = true;
    videoBtn.title = "このブラウザは動画の書き出しに対応していません";
  }
  const saved = { min: 0, max: 0, minPolar: 0, maxPolar: 0, auto: false };
  let active = false;
  let recording: { rec: MediaRecorder; cancel: boolean } | null = null;
  const say = (text: string): void => {
    status.textContent = text;
  };

  const enter = (): void => {
    if (active) return;
    active = true;
    body.classList.add("is-capture");
    bar.hidden = false;
    const c = deps.controls;
    Object.assign(saved, { min: c.minDistance, max: c.maxDistance, minPolar: c.minPolarAngle, maxPolar: c.maxPolarAngle, auto: c.autoRotate });
    // free look: closer in, higher up, down to the tiles
    c.minDistance = 1.5;
    c.minPolarAngle = 0.15;
    c.maxPolarAngle = 1.56;
    c.autoRotate = false;
    say(videoType === null ? "ドラッグで構図を決めて保存。動画はこのブラウザでは書き出せません" : "ドラッグで構図を決めて保存");
    history.pushState({ capture: true }, "");
    stillBtn?.focus();
  };

  const exit = (fromHistory = false): void => {
    if (!active) return;
    if (recording !== null) {
      recording.cancel = true;
      recording.rec.stop();
    }
    active = false;
    body.classList.remove("is-capture");
    bar.hidden = true;
    const c = deps.controls;
    c.minDistance = saved.min;
    c.maxDistance = saved.max;
    c.minPolarAngle = saved.minPolar;
    c.maxPolarAngle = saved.maxPolar;
    c.autoRotate = saved.auto;
    if (!fromHistory && history.state?.capture === true) history.back();
    enterBtn.focus();
  };

  const still = (): void => {
    const { w, h } = deps.post.size();
    const gl = deps.renderer.getContext();
    const maxSize: number = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) ?? 4096;
    const want = STILL_LONG_SIDE / Math.max(w, h);
    const cap = deps.lowTier() ? 2 : 4;
    const ratio = Math.max(1, Math.min(want, cap, maxSize / Math.max(w, h)));
    try {
      deps.post.renderAt(ratio);
      // the drawing buffer is read in the same task it was drawn in
      canvas.toBlob((blob) => {
        if (blob === null) say("静止画を作れませんでした");
        else {
          download(blob, `onmyo-fujin-world-${stamp()}.png`);
          say(`静止画を保存しました(${Math.round(w * ratio)}×${Math.round(h * ratio)})`);
        }
      }, "image/png");
    } catch {
      say("静止画を作れませんでした(端末のメモリ不足かもしれません)");
    } finally {
      deps.restoreSize();
    }
  };

  const video = (): void => {
    if (videoType === null || Recorder === undefined || recording !== null) return;
    const stream = canvas.captureStream(30);
    const rec = new Recorder(stream, { mimeType: videoType, videoBitsPerSecond: 8_000_000 });
    const chunks: Blob[] = [];
    const job = { rec, cancel: false };
    recording = job;
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    // one full orbit around the target at the current height and distance: the last frame meets the first
    const c = deps.controls;
    const start = c.getAzimuthalAngle();
    const polar = c.getPolarAngle();
    const dist = c.getDistance();
    const target = c.target.clone();
    c.enabled = false;
    progress.hidden = false;
    let elapsed = 0;
    const place = (): void => {
      const a = start + (elapsed / LOOP_SECONDS) * Math.PI * 2;
      deps.camera.position.set(
        target.x + dist * Math.sin(polar) * Math.sin(a),
        target.y + dist * Math.cos(polar),
        target.z + dist * Math.sin(polar) * Math.cos(a),
      );
      deps.camera.lookAt(target);
    };
    const done = (): void => {
      deps.onFrame(null);
      c.enabled = true;
      progress.hidden = true;
      fill.style.transform = "scaleX(0)";
      if (videoBtn !== null) videoBtn.textContent = "15秒ループ動画";
      recording = null;
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      const cancelled = job.cancel;
      done();
      if (cancelled) {
        say("動画の書き出しを止めました");
        return;
      }
      download(new Blob(chunks, { type: "video/webm" }), `onmyo-fujin-world-loop-${stamp()}.webm`);
      say("15秒のループ動画を保存しました(WebM)");
    };
    place();
    deps.onFrame((dt) => {
      elapsed = Math.min(LOOP_SECONDS, elapsed + dt);
      place();
      fill.style.transform = `scaleX(${elapsed / LOOP_SECONDS})`;
      say(`録画中… あと${Math.ceil(LOOP_SECONDS - elapsed)}秒`);
      if (elapsed >= LOOP_SECONDS && rec.state === "recording") rec.stop();
    });
    rec.start(500);
    if (videoBtn !== null) videoBtn.textContent = "録画を止める";
  };

  enterBtn.addEventListener("click", enter);
  stillBtn?.addEventListener("click", still);
  videoBtn?.addEventListener("click", () => {
    if (recording !== null) {
      recording.cancel = true;
      recording.rec.stop();
    } else video();
  });
  exitBtn?.addEventListener("click", () => exit());
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && active) exit();
  });
  window.addEventListener("popstate", () => {
    if (active) exit(true);
  });
};
