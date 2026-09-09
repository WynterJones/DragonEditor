import type { Clip, Project } from "@/types";

/** The clip on the same track that ends exactly where `c` starts. */
export function predecessor(p: Project, c: Clip) {
  return Object.values(p.clips).find((o) => o.trackId === c.trackId && o.start + o.duration === c.start);
}

export function successor(p: Project, c: Clip) {
  return Object.values(p.clips).find((o) => o.trackId === c.trackId && o.start === c.start + c.duration);
}

/** Effective fade lengths (frames) once transitions are folded in. */
export function fadeFrames(p: Project, c: Clip) {
  const inF = Math.max(c.fadeIn, c.transition !== "none" ? c.transitionFrames : 0);
  const s = successor(p, c);
  const outF = Math.max(c.fadeOut, s?.transition === "fade" ? s.transitionFrames : 0);
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
