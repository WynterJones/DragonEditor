import { addClip, addTrack, id, useStore } from "@/store";
import type { Asset, TextStyle } from "@/types";

export const FONTS = ["Geist Variable", "Helvetica Neue", "Arial Black", "Avenir Next", "Futura", "Georgia", "Impact", "Menlo", "Times New Roman", "Trebuchet MS", "Verdana"];

export const DEFAULT_TEXT: TextStyle = {
  text: "Your text here",
  font: "Geist Variable",
  size: 96,
  weight: 700,
  color: "#ffffff",
  align: "center",
  lineHeight: 1.15,
  bg: "",
  bgPad: 24,
  bgRadius: 16,
  stroke: 0,
  strokeColor: "#000000",
  shadow: 0,
};

export const TEMPLATES: { name: string; style: Partial<TextStyle> }[] = [
  { name: "Clean", style: { font: "Geist Variable", weight: 600, color: "#ffffff", bg: "", stroke: 0, shadow: 24 } },
  { name: "Bold title", style: { font: "Arial Black", weight: 900, size: 140, color: "#ffffff", bg: "", stroke: 0, shadow: 40 } },
  { name: "Gold", style: { font: "Geist Variable", weight: 800, color: "#f2c14e", bg: "", stroke: 0, shadow: 30 } },
  { name: "Outline", style: { font: "Arial Black", weight: 900, color: "#ffffff", bg: "", stroke: 10, strokeColor: "#000000", shadow: 0 } },
  { name: "Caption bar", style: { font: "Geist Variable", weight: 600, size: 64, color: "#ffffff", bg: "rgba(0,0,0,0.75)", bgPad: 20, bgRadius: 8, stroke: 0, shadow: 0 } },
  { name: "Highlight", style: { font: "Geist Variable", weight: 800, color: "#101010", bg: "#f2c14e", bgPad: 20, bgRadius: 6, stroke: 0, shadow: 0 } },
  { name: "Lower third", style: { font: "Helvetica Neue", weight: 700, size: 56, align: "left", color: "#ffffff", bg: "rgba(16,16,16,0.85)", bgPad: 22, bgRadius: 4, stroke: 0, shadow: 0 } },
  { name: "Serif", style: { font: "Georgia", weight: 400, color: "#ffffff", bg: "", stroke: 0, shadow: 20 } },
  { name: "Mono", style: { font: "Menlo", weight: 400, size: 64, color: "#7dd3fc", bg: "rgba(0,0,0,0.7)", bgPad: 18, bgRadius: 6, stroke: 0, shadow: 0 } },
];

let measurerCtx: CanvasRenderingContext2D | null = null;
const measurerOf = () => (measurerCtx ??= document.createElement("canvas").getContext("2d")!);
const fontSpec = (s: TextStyle) => `${s.weight} ${s.size}px "${s.font}"`;

/** Word-wraps to maxWidth and returns the block size (px, unscaled). */
export function layout(s: TextStyle, maxWidth: number) {
  const measurer = measurerOf();
  measurer.font = fontSpec(s);
  const lines: string[] = [];
  for (const para of s.text.split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (line && measurer.measureText(next).width > maxWidth - 2 * s.bgPad) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  const width = Math.max(1, ...lines.map((l) => measurer.measureText(l).width)) + 2 * s.bgPad + s.stroke * 2;
  const height = lines.length * s.size * s.lineHeight + 2 * s.bgPad + s.stroke * 2;
  return { lines, width: Math.ceil(width), height: Math.ceil(height) };
}

/** Renders the block at pixel scale `k` into a canvas. */
export function renderText(s: TextStyle, k: number, maxWidth: number) {
  const { lines, width, height } = layout(s, maxWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * k));
  canvas.height = Math.max(1, Math.round(height * k));
  const ctx = canvas.getContext("2d")!;
  ctx.scale(k, k);
  if (s.bg) {
    ctx.fillStyle = s.bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, s.bgRadius);
    ctx.fill();
  }
  ctx.font = fontSpec(s);
  ctx.textBaseline = "middle";
  ctx.textAlign = s.align;
  const inner = s.bgPad + s.stroke;
  const x = s.align === "left" ? inner : s.align === "right" ? width - inner : width / 2;
  const lh = s.size * s.lineHeight;
  lines.forEach((line, i) => {
    const y = inner + lh * (i + 0.5);
    if (s.shadow > 0) {
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = s.shadow;
      ctx.shadowOffsetY = s.shadow * 0.3;
    }
    if (s.stroke > 0) {
      ctx.lineJoin = "round";
      ctx.lineWidth = s.stroke * 2;
      ctx.strokeStyle = s.strokeColor;
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = s.color;
    ctx.fillText(line, x, y);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  });
  return canvas;
}

export const wrapWidth = (projectWidth: number) => projectWidth * 0.9;

/** Creates a text asset + clip at the playhead on the top video track. */
export function addText(text?: string, at?: number) {
  const s = useStore.getState();
  const p = s.project;
  if (!p) return;
  const style = { ...DEFAULT_TEXT, size: Math.round(p.height / 11), text: text ?? DEFAULT_TEXT.text };
  const { width, height } = layout(style, wrapWidth(p.width));
  const asset: Asset = { id: id(), kind: "text", name: style.text, path: "", duration: 0, width, height, hasAudio: false, text: style };
  s.update((p) => {
    p.assets[asset.id] = asset;
  });
  const track = useStore.getState().project!.tracks.find((t) => t.kind === "video" && !t.locked);
  const tid = track?.id ?? addTrack("video");
  return addClip(asset.id, tid, at ?? s.playhead);
}

export function updateText(assetId: string, patch: Partial<TextStyle>) {
  useStore.getState().update((p) => {
    const a = p.assets[assetId];
    if (!a?.text) return;
    Object.assign(a.text, patch);
    a.name = a.text.text;
    const { width, height } = layout(a.text, wrapWidth(p.width));
    a.width = width;
    a.height = height;
  });
}
