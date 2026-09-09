import type { Anim, Clip, Project } from "@/types";
import type { Box } from "./decor";

/** The clip on the same track that ends exactly where `c` starts. */
export function predecessor(p: Project, c: Clip) {
  return Object.values(p.clips).find((o) => o.trackId === c.trackId && o.start + o.duration === c.start);
}

export function successor(p: Project, c: Clip) {
  return Object.values(p.clips).find((o) => o.trackId === c.trackId && o.start === c.start + c.duration);
}

/**
 * Effective fade lengths (frames) once transitions are folded in. A dissolving successor
 * overrides this clip's video fade-out (it keeps rendering underneath); audio still fades.
 */
export function fadeFrames(p: Project, c: Clip, audio = false) {
  const fades = (a: Anim) => (a === "fade" || a === "pop" ? c.animFrames : 0);
  const inF = Math.max(c.fadeIn, c.transition !== "none" ? c.transitionFrames : 0, audio ? 0 : fades(c.animIn));
  const s = successor(p, c);
  let outF = Math.max(c.fadeOut, s?.transition === "fade" ? s.transitionFrames : 0, audio ? 0 : fades(c.animOut));
  if (!audio && s?.transition === "dissolve") outF = 0;
  return { in: Math.min(inF, c.duration), out: Math.min(outF, c.duration) };
}

/** Frames a clip keeps rendering past its end so the next clip can dissolve over it. */
export function extension(p: Project, c: Clip) {
  const s = successor(p, c);
  return s?.transition === "dissolve" ? s.transitionFrames : 0;
}

/** Opacity multiplier for a clip at an absolute frame (1 inside its extension). */
export function alphaAt(p: Project, c: Clip, frame: number) {
  const rel = frame - c.start;
  const toEnd = c.start + c.duration - frame;
  if (toEnd <= 0) return 1;
  const f = fadeFrames(p, c);
  let a = 1;
  if (f.in > 0 && rel < f.in) a = rel / f.in;
  if (f.out > 0 && toEnd < f.out) a = Math.min(a, toEnd / f.out);
  return Math.max(0, Math.min(1, a));
}

const easeOut = (t: number) => 1 - (1 - t) ** 2;

/** Slide distance for a box (px). */
export const slideDist = (b: Box) => b.height * 0.5 + 40;

/** Pixel offset + scale for a slide/pop animation at progress `e` (1 = settled). */
export function animOffset(anim: Anim, e: number, b: Box) {
  const d = slideDist(b) * (1 - e);
  switch (anim) {
    case "slide-up": return { dx: 0, dy: d, k: 1 };
    case "slide-down": return { dx: 0, dy: -d, k: 1 };
    case "slide-left": return { dx: d, dy: 0, k: 1 };
    case "slide-right": return { dx: -d, dy: 0, k: 1 };
    case "pop": return { dx: 0, dy: 0, k: 0.5 + 0.5 * e };
    default: return { dx: 0, dy: 0, k: 1 };
  }
}

/** Box after in/out animations at an absolute frame (alpha is handled by fadeFrames). */
export function animatedBox(c: Clip, b: Box, frame: number): Box {
  if (c.animIn === "none" && c.animOut === "none") return b;
  const n = Math.max(1, c.animFrames);
  const i = animOffset(c.animIn, easeOut(Math.min(1, (frame - c.start) / n)), b);
  const o = animOffset(c.animOut, easeOut(Math.min(1, Math.max(0, c.start + c.duration - frame) / n)), b);
  const k = Math.min(i.k, o.k);
  const w = b.width * k;
  const h = b.height * k;
  return { left: b.left + (b.width - w) / 2 + i.dx + o.dx, top: b.top + (b.height - h) / 2 + i.dy + o.dy, width: w, height: h };
}
