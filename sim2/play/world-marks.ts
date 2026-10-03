// 式神の証 and board marks for /world, painted on canvases:
// - 円相 (the brush ring) by attribute: 陽 white ink, 陰 black ink with a faint
//   light rim so it reads on dark ground, 空 a clean ring of light (tinted 緑青
//   by the material);
// - 緑青の呪紋 (a small glyph that glows on each piece);
// - the thin frame of a held cell, the seat marker (先/後), the facing arrow,
//   the HP badge.
import { GOTHIC, makeCanvas, MINCHO, PAL, rng } from "./world-paint.ts";

/** 緑青: the colour of 霊力, and of nothing else in the scene. */
export const ROKUSHO = "#1A7F72";

export type EnsoKind = "yang" | "yin" | "none";

/** One pass of a loaded brush round a circle: thick where it lands, dry and split where it lifts. */
const brushRing = (g: CanvasRenderingContext2D, S: number, color: string, seed: number, grow: number): void => {
  const r = rng(seed);
  const m = S / 2;
  const R = S * 0.36;
  const start = -Math.PI * 0.62;
  const sweep = Math.PI * 1.86;
  g.strokeStyle = color;
  g.lineCap = "round";
  // the body of the stroke: overlapping arcs, wide at the start, thinning to the lift
  const hairs = 26;
  for (let h = 0; h < hairs; h++) {
    const off = (h / (hairs - 1) - 0.5) * S * 0.06;
    const a0 = start + r() * 0.12;
    const a1 = start + sweep * (0.72 + r() * 0.28);
    const steps = 40;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const a = a0 + (a1 - a0) * t;
      const b = a0 + (a1 - a0) * (t + 1 / steps);
      // dry brush toward the end: hairs break up
      if (t > 0.6 && r() < (t - 0.6) * 1.4) continue;
      g.globalAlpha = 0.5 + 0.5 * (1 - t);
      g.lineWidth = Math.max(1, (S * 0.008 + grow) * (1.2 - t * 0.7));
      const rad = R + off * (1 - t * 0.35);
      g.beginPath();
      g.arc(m, m, rad, a, b + 0.01);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
};

/** 円相 for an attribute. yang/yin are ink (normal blending); none is light (additive, white — tint it). */
export const ensoCanvas = (kind: EnsoKind): HTMLCanvasElement => {
  const S = 512;
  const { c, g } = makeCanvas(S, S);
  if (kind === "none") {
    const m = S / 2;
    g.strokeStyle = "#fff";
    g.shadowColor = "#fff";
    g.shadowBlur = 26;
    g.lineWidth = 9;
    g.beginPath();
    g.arc(m, m, S * 0.36, 0, Math.PI * 2);
    g.stroke();
    g.shadowBlur = 8;
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(m, m, S * 0.31, 0, Math.PI * 2);
    g.stroke();
    return c;
  }
  if (kind === "yin") {
    // a pale rim first, so black ink shows against the night
    g.shadowColor = "rgba(210,225,235,0.9)";
    g.shadowBlur = 14;
    brushRing(g, S, "rgba(190,205,215,0.55)", 11, 3);
    g.shadowBlur = 0;
    brushRing(g, S, "#07070a", 11, 0);
  } else {
    g.shadowColor = "rgba(255,250,235,0.6)";
    g.shadowBlur = 6;
    brushRing(g, S, "#f6f1e4", 23, 0);
  }
  return c;
};

/** 呪紋: a small seal-like glyph of strokes (white; the material tints it 緑青). */
export const glyphCanvas = (): HTMLCanvasElement => {
  const S = 128;
  const { c, g } = makeCanvas(S, S);
  g.strokeStyle = "#fff";
  g.shadowColor = "#fff";
  g.shadowBlur = 8;
  g.lineWidth = 5;
  g.lineCap = "round";
  g.beginPath();
  g.arc(64, 64, 44, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(64, 26);
  g.lineTo(64, 102);
  g.moveTo(38, 48);
  g.lineTo(90, 48);
  g.moveTo(44, 78);
  g.bezierCurveTo(54, 62, 74, 94, 86, 74);
  g.stroke();
  return c;
};

/** The thin frame of a held cell (white; tinted 緑青). */
export const cellFrameCanvas = (): HTMLCanvasElement => {
  const S = 256;
  const { c, g } = makeCanvas(S, S);
  g.strokeStyle = "#fff";
  g.shadowColor = "#fff";
  g.shadowBlur = 6;
  g.lineWidth = 4;
  g.strokeRect(18, 18, S - 36, S - 36);
  g.shadowBlur = 0;
  g.lineWidth = 8;
  for (const [x, y, dx, dy] of [[14, 14, 1, 1], [S - 14, 14, -1, 1], [14, S - 14, 1, -1], [S - 14, S - 14, -1, -1]]) {
    g.beginPath();
    g.moveTo(x, y + dy * 34);
    g.lineTo(x, y);
    g.lineTo(x + dx * 34, y);
    g.stroke();
  }
  return c;
};

/** The seat marker on a held cell: 先 on paper, 後 on ink. */
export const seatCanvas = (owner: 0 | 1): HTMLCanvasElement => {
  const S = 96;
  const { c, g } = makeCanvas(S, S);
  g.fillStyle = owner === 0 ? PAL.washi : "#101014";
  g.strokeStyle = owner === 0 ? "#101014" : PAL.washi;
  g.lineWidth = 5;
  g.beginPath();
  g.arc(48, 48, 40, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = owner === 0 ? "#101014" : PAL.washi;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `800 50px ${MINCHO}`;
  g.fillText(owner === 0 ? "先" : "後", 48, 51);
  return c;
};

/** A chevron pointing up the texture (+v): the facing arrow. */
export const chevronCanvas = (): HTMLCanvasElement => {
  const { c, g } = makeCanvas(128, 128);
  g.fillStyle = "#fff";
  g.strokeStyle = "rgba(0,0,0,0.75)";
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(64, 8);
  g.lineTo(120, 74);
  g.lineTo(90, 74);
  g.lineTo(64, 44);
  g.lineTo(38, 74);
  g.lineTo(8, 74);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(64, 64);
  g.lineTo(106, 114);
  g.lineTo(84, 114);
  g.lineTo(64, 90);
  g.lineTo(44, 114);
  g.lineTo(22, 114);
  g.closePath();
  g.fill();
  g.stroke();
  return c;
};

/** The HP badge over a piece: seat, 命 now/max on a dark pill; the number turns red when hurt. */
export const hpBadgeCanvas = (hp: number, max: number, owner: 0 | 1): HTMLCanvasElement => {
  const W = 232;
  const H = 88;
  const { c, g } = makeCanvas(W, H);
  const r = H / 2 - 4;
  g.fillStyle = "rgba(10,12,18,0.9)";
  g.strokeStyle = PAL.washiDim;
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(4 + r, 4);
  g.lineTo(W - 4 - r, 4);
  g.arc(W - 4 - r, H / 2, r, -Math.PI / 2, Math.PI / 2);
  g.lineTo(4 + r, H - 4);
  g.arc(4 + r, H / 2, r, Math.PI / 2, (3 * Math.PI) / 2);
  g.closePath();
  g.fill();
  g.stroke();
  g.drawImage(seatCanvas(owner), 12, 14, 60, 60);
  g.textBaseline = "middle";
  g.textAlign = "center";
  g.fillStyle = PAL.washiDim;
  g.font = `700 26px ${GOTHIC}`;
  g.fillText("命", 96, H / 2 + 2);
  g.fillStyle = hp < max ? PAL.vermHi : PAL.washi;
  g.font = `800 44px ${GOTHIC}`;
  g.fillText(`${hp}`, 146, H / 2 + 3);
  g.fillStyle = "rgba(243,238,225,0.6)";
  g.font = `700 24px ${GOTHIC}`;
  g.fillText(`/${max}`, 196, H / 2 + 8);
  return c;
};
