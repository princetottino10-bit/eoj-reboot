// Canvas painting for the 3D world (/world): neon and lightbox signs, card
// faces, the lacquer board (colour + gold mask), talismans, soft glows.

export const PAL = {
  sumi: "#15131a",
  ink: "#26262b",
  night: "#1b2340",
  deep: "#0d1122",
  washi: "#f3eee1",
  washiDim: "#d9d0bb",
  verm: "#c0332b",
  vermHi: "#e0674f",
  gold: "#d7b565",
  goldDim: "#8f7a45",
  jade: "#4fd1a5",
  magenta: "#d8457f",
  amber: "#e0a43a",
  indigo: "#2b3a6b",
} as const;

export const MINCHO = '"Shippori Mincho B1", "Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif';
export const GOTHIC = '"Zen Kaku Gothic New", "Yu Gothic", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';

export const makeCanvas = (w: number, h: number): { c: HTMLCanvasElement; g: CanvasRenderingContext2D } => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (g === null) throw new Error("2D canvas is not available");
  return { c, g };
};

/** Small deterministic PRNG (mulberry32): the city is the same on every load. */
export const rng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Speckles of darker ink over a filled area: the grain of a woodblock print. */
const speckle = (g: CanvasRenderingContext2D, w: number, h: number, color: string, count: number, seed: number): void => {
  const r = rng(seed);
  g.fillStyle = color;
  for (let i = 0; i < count; i++) g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
};

export type SignStyle = { color: string; kind: "neon" | "box"; bg: string };

/**
 * A shop sign as two canvases: `map` (what it looks like unlit: backing,
 * tubes, frame) and `glow` (what emits light: bright tubes, or the whole
 * lightbox). Stacked (vertical) or in a row.
 */
export const signCanvases = (text: string, style: SignStyle, vertical: boolean, soft = false): { map: HTMLCanvasElement; glow: HTMLCanvasElement } => {
  const chars = [...text];
  const cell = 104;
  const pad = 26;
  const w = vertical ? cell + pad * 2 : cell * chars.length + pad * 2;
  const h = vertical ? cell * chars.length + pad * 2 : cell + pad * 2;
  const map = makeCanvas(w, h);
  const glow = makeCanvas(w, h);
  const neon = style.kind === "neon";
  const letters = (g: CanvasRenderingContext2D, color: string, blur: number): void => {
    g.fillStyle = color;
    g.strokeStyle = color;
    g.shadowColor = color;
    g.shadowBlur = blur;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `${neon ? 700 : 800} ${cell * 0.78}px ${GOTHIC}`;
    g.lineWidth = neon ? 4 : 1;
    chars.forEach((ch, i) => {
      const x = vertical ? w / 2 : pad + cell * i + cell / 2;
      const y = vertical ? pad + cell * i + cell / 2 + 3 : h / 2 + 3;
      if (neon) g.strokeText(ch, x, y);
      else g.fillText(ch, x, y);
    });
    g.strokeRect(10, 10, w - 20, h - 20);
    g.shadowBlur = 0;
  };
  map.g.fillStyle = neon ? "#16141b" : style.bg;
  map.g.fillRect(0, 0, w, h);
  letters(map.g, neon ? "#d9d4cc" : style.color, 0);
  speckle(map.g, w, h, "rgba(20,14,10,0.25)", Math.round((w * h) / 70), text.length * 31);
  glow.g.fillStyle = "#000";
  glow.g.fillRect(0, 0, w, h);
  if (neon) {
    letters(glow.g, style.color, 14);
    letters(glow.g, "#ffffff", 0);
    glow.g.globalCompositeOperation = "multiply";
    glow.g.fillStyle = style.color;
    glow.g.fillRect(0, 0, w, h);
  } else {
    glow.g.drawImage(map.c, 0, 0);
  }
  if (!soft) return { map: map.c, glow: glow.c };
  // soft: keep a sixth of the pixels; stretched back over the sign it is a blur of light, not lettering
  const small = (src: HTMLCanvasElement): HTMLCanvasElement => {
    const out = makeCanvas(Math.max(8, Math.round(w / 7)), Math.max(8, Math.round(h / 7)));
    out.g.imageSmoothingEnabled = true;
    out.g.drawImage(src, 0, 0, out.c.width, out.c.height);
    return out.c;
  };
  return { map: small(map.c), glow: small(glow.c) };
};

/** A soft round glow (white centre fading out), tinted by the material colour. */
export const glowCanvas = (): HTMLCanvasElement => {
  const { c, g } = makeCanvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
};

/** The 太極 mark as drawn in the 記号体系 icon: gold ring, indigo ground, paper and ink halves. */
export const taijiCanvas = (): HTMLCanvasElement => {
  const s = 512;
  const { c, g } = makeCanvas(s, s);
  const m = s / 2;
  const R = s * 0.46;
  g.fillStyle = PAL.sumi;
  g.beginPath();
  g.arc(m, m, s * 0.5, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = PAL.gold;
  g.lineWidth = s * 0.03;
  g.beginPath();
  g.arc(m, m, R + s * 0.025, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = PAL.night;
  g.beginPath();
  g.arc(m, m, R, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = PAL.washi;
  g.beginPath();
  g.arc(m, m, R, -Math.PI / 2, Math.PI / 2);
  g.arc(m, m + R / 2, R / 2, Math.PI / 2, -Math.PI / 2, true);
  g.arc(m, m - R / 2, R / 2, Math.PI / 2, -Math.PI / 2, true);
  g.fill();
  g.fillStyle = PAL.night;
  g.beginPath();
  g.arc(m, m + R / 2, R * 0.19, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = PAL.washi;
  g.beginPath();
  g.arc(m, m - R / 2, R * 0.19, 0, Math.PI * 2);
  g.fill();
  return c;
};

/**
 * The 九宮盤 top: black lacquer cells, double gold lines, raden (shell) flecks
 * at the crossings. With `mask`, the same drawing as a metalness mask (white =
 * gold inlay, black = lacquer).
 */
export const boardCanvas = (mask = false): HTMLCanvasElement => {
  const s = 1024;
  const { c, g } = makeCanvas(s, s);
  g.fillStyle = "#0e0c0d";
  g.fillRect(0, 0, s, s);
  const margin = 64;
  const cell = (s - margin * 2) / 3;
  // canvas row j, column i = board cell (x = i, y = j): the engine's fixed cell attributes
  // (yin (1,2) (0,1), yang (2,1) (1,0), taiji centre, the corners plain)
  const Y = "#1c2339";
  const G = "#2c1a13";
  const E = "#17130f";
  const grounds = [E, G, E, Y, E, G, E, Y, E];
  grounds.forEach((col, i) => {
    const x = margin + (i % 3) * cell;
    const y = margin + Math.floor(i / 3) * cell;
    g.fillStyle = mask ? "#000" : col;
    g.fillRect(x + 6, y + 6, cell - 12, cell - 12);
  });
  g.strokeStyle = mask ? "#fff" : PAL.gold;
  g.lineWidth = 7;
  g.strokeRect(margin - 22, margin - 22, s - (margin - 22) * 2, s - (margin - 22) * 2);
  g.lineWidth = 3;
  g.strokeRect(margin - 34, margin - 34, s - (margin - 34) * 2, s - (margin - 34) * 2);
  g.lineWidth = 5;
  for (let i = 0; i <= 3; i++) {
    const p = margin + i * cell;
    g.beginPath();
    g.moveTo(p, margin);
    g.lineTo(p, s - margin);
    g.moveTo(margin, p);
    g.lineTo(s - margin, p);
    g.stroke();
  }
  // raden: small flat shell chips in pale jade / violet / white at each crossing
  const shell = ["#bfe3d6", "#cdbfe6", "#eef0ea"];
  const r = rng(9);
  for (let i = 0; i <= 3; i++) {
    for (let j = 0; j <= 3; j++) {
      const x = margin + i * cell;
      const y = margin + j * cell;
      for (let k = 0; k < 5; k++) {
        g.fillStyle = mask ? "#555" : shell[k % 3];
        const a = r() * Math.PI * 2;
        const d = 10 + r() * 14;
        g.beginPath();
        g.moveTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
        g.lineTo(x + Math.cos(a + 0.5) * (d + 7), y + Math.sin(a + 0.5) * (d + 7));
        g.lineTo(x + Math.cos(a + 0.2) * (d + 12), y + Math.sin(a + 0.2) * (d + 12));
        g.fill();
      }
    }
  }
  if (!mask) speckle(g, s, s, "rgba(255,240,210,0.035)", 5000, 3);
  return c;
};

/**
 * 舞う符: a small paper talisman with red script, soft at the edges and
 * dissolving toward its lower end (it is half spirit already).
 */
export const talismanCanvas = (): HTMLCanvasElement => {
  const W = 64;
  const H = 176;
  const { c, g } = makeCanvas(W, H);
  g.fillStyle = "#e9dfc6";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#b3261e";
  g.strokeStyle = "#b3261e";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `800 34px ${MINCHO}`;
  g.fillText("勅", W / 2, 34);
  g.fillText("令", W / 2, 72);
  g.lineWidth = 3.5;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(W / 2, 96);
  g.bezierCurveTo(12, 114, 52, 126, 28, 148);
  g.stroke();
  // soft edges, and the lower third breaking up
  g.globalCompositeOperation = "destination-in";
  const side = g.createLinearGradient(0, 0, W, 0);
  side.addColorStop(0, "rgba(0,0,0,0)");
  side.addColorStop(0.16, "rgba(0,0,0,1)");
  side.addColorStop(0.84, "rgba(0,0,0,1)");
  side.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = side;
  g.fillRect(0, 0, W, H);
  const fall = g.createLinearGradient(0, 0, 0, H);
  fall.addColorStop(0, "rgba(0,0,0,0)");
  fall.addColorStop(0.06, "rgba(0,0,0,1)");
  fall.addColorStop(0.62, "rgba(0,0,0,1)");
  fall.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = fall;
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "destination-out";
  const r = rng(5);
  for (let k = 0; k < 60; k++) {
    const y = H * (0.6 + r() * 0.4);
    g.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.6})`;
    g.fillRect(r() * W, y, 2 + r() * 5, 2 + r() * 6);
  }
  g.globalCompositeOperation = "source-over";
  return c;
};

export type CardPaint = {
  name: string;
  clan: string;
  accent: string;
  atk: number;
  hp: number;
};

const CARD_W = 512;
const CARD_H = 740;

/** Card face: washi frame, the art in an ink box, the name on a plate, the clan strip. */
export const cardFaceCanvas = (img: HTMLImageElement | null, p: CardPaint): HTMLCanvasElement => {
  const { c, g } = makeCanvas(CARD_W, CARD_H);
  g.fillStyle = PAL.washi;
  g.fillRect(0, 0, CARD_W, CARD_H);
  g.fillStyle = p.accent;
  g.fillRect(0, 0, CARD_W, 18);
  g.fillRect(0, CARD_H - 18, CARD_W, 18);
  const ax = 28;
  const ay = 42;
  const aw = CARD_W - 56;
  const ah = Math.round(aw * (604 / 624));
  if (img !== null) {
    const ir = img.naturalWidth / img.naturalHeight;
    const br = aw / ah;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    if (ir > br) sw = sh * br;
    else sh = sw / br;
    g.drawImage(img, (img.naturalWidth - sw) / 2, 0, sw, sh, ax, ay, aw, ah);
  } else {
    g.fillStyle = PAL.night;
    g.fillRect(ax, ay, aw, ah);
    g.fillStyle = PAL.gold;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `800 150px ${MINCHO}`;
    g.fillText([...p.name][0] ?? "符", ax + aw / 2, ay + ah / 2);
  }
  g.strokeStyle = PAL.sumi;
  g.lineWidth = 6;
  g.strokeRect(ax, ay, aw, ah);
  // name plate
  const ny = ay + ah + 20;
  g.fillStyle = PAL.sumi;
  g.fillRect(ax, ny, aw, 96);
  g.strokeStyle = PAL.gold;
  g.lineWidth = 3;
  g.strokeRect(ax + 7, ny + 7, aw - 14, 82);
  g.fillStyle = PAL.washi;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const size = p.name.length > 5 ? 46 : 56;
  g.font = `800 ${size}px ${MINCHO}`;
  g.fillText(p.name, CARD_W / 2, ny + 50);
  // clan and stats
  g.fillStyle = PAL.ink;
  g.font = `700 30px ${MINCHO}`;
  g.textAlign = "left";
  g.fillText(p.clan, ax + 4, ny + 132);
  g.textAlign = "right";
  g.font = `800 30px ${GOTHIC}`;
  g.fillStyle = PAL.verm;
  g.fillText(`攻${p.atk}`, CARD_W - ax - 96, ny + 132);
  g.fillStyle = PAL.indigo;
  g.fillText(`命${p.hp}`, CARD_W - ax - 4, ny + 132);
  g.strokeStyle = PAL.sumi;
  g.lineWidth = 8;
  g.strokeRect(4, 4, CARD_W - 8, CARD_H - 8);
  return c;
};

/** Card back: indigo ground, a clan-coloured band, gold frame, the 太極 mark in the middle. */
export const cardBackCanvas = (band: string = PAL.gold): HTMLCanvasElement => {
  const { c, g } = makeCanvas(256, 370);
  g.fillStyle = PAL.night;
  g.fillRect(0, 0, 256, 370);
  g.fillStyle = band;
  g.fillRect(0, 0, 256, 10);
  g.fillRect(0, 360, 256, 10);
  g.strokeStyle = PAL.gold;
  g.lineWidth = 5;
  g.strokeRect(14, 14, 228, 342);
  g.lineWidth = 2;
  g.strokeRect(24, 24, 208, 322);
  g.drawImage(taijiCanvas(), 58, 115, 140, 140);
  return c;
};

/** The shrine plaque: vermilion ground, gold characters. */
export const plaqueCanvas = (): HTMLCanvasElement =>
  signCanvases("土地", { kind: "box", bg: PAL.verm, color: PAL.gold }, true).map;
