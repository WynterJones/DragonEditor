import type { Asset, Clip, Project } from "@/types";

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where a clip's media lands in the project frame (project px): fit inside W*scale × H*scale, centered, offset by x/y. */
export function fitBox(p: Project, c: Clip, a: Asset): Box | null {
  if (!a.width || !a.height) return null;
  const f = Math.min((p.width * c.scale) / a.width, (p.height * c.scale) / a.height);
  const width = a.width * f;
  const height = a.height * f;
  return { left: (p.width - width) / 2 + c.x, top: (p.height - height) / 2 + c.y, width, height };
}

/** Extra space the shadow/border need around the box. */
export function decorMargin(c: Clip) {
  return Math.ceil(c.border + (c.shadow ? c.shadow * 2.5 : 0));
}

export const hasDecor = (c: Clip) => c.radius > 0 || c.border > 0 || c.shadow > 0;

function rounded(ctx: CanvasRenderingContext2D, b: Box, r: number) {
  ctx.beginPath();
  ctx.roundRect(b.left, b.top, b.width, b.height, Math.min(r, b.width / 2, b.height / 2));
}

/**
 * Draws one clip: shadow, then media clipped to the rounded rect, then the border.
 * `k` scales project px → canvas px. Pass `el = null` to draw only the decoration
 * with a transparent hole (used for the export frame PNG).
 */
export function drawClip(ctx: CanvasRenderingContext2D, el: CanvasImageSource | null, box: Box, c: Clip, k: number) {
  const r = c.radius * k;
  if (c.shadow > 0) {
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${c.shadowOpacity * c.opacity})`;
    ctx.shadowBlur = c.shadow * k;
    ctx.shadowOffsetY = c.shadow * 0.4 * k;
    ctx.fillStyle = "#000";
    rounded(ctx, box, r);
    ctx.fill();
    ctx.restore();
    if (!el) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      rounded(ctx, box, r);
      ctx.fill();
      ctx.restore();
    }
  }
  if (el) {
    ctx.save();
    rounded(ctx, box, r);
    ctx.clip();
    ctx.globalAlpha = c.opacity;
    ctx.drawImage(el, box.left, box.top, box.width, box.height);
    ctx.restore();
  }
  if (c.border > 0) {
    const bw = c.border * k;
    ctx.save();
    ctx.globalAlpha = c.opacity;
    ctx.strokeStyle = c.borderColor;
    ctx.lineWidth = bw;
    rounded(ctx, { left: box.left - bw / 2, top: box.top - bw / 2, width: box.width + bw, height: box.height + bw }, r > 0 ? r + bw / 2 : 0);
    ctx.stroke();
    ctx.restore();
  }
}

/** Rasterizes a draw callback to PNG bytes. */
export async function renderPng(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): Promise<Uint8Array> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  draw(canvas.getContext("2d")!);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));
  return new Uint8Array(await blob.arrayBuffer());
}
