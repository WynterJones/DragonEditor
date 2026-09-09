import { convertFileSrc } from "@tauri-apps/api/core";
import { projectEnd } from "@/store";
import { drawClip, fitBox } from "./decor";
import { alphaAt, animatedBox, extension } from "./fx";
import { renderText, wrapWidth } from "./text";
import type { Asset, Clip, Project } from "@/types";

type El = HTMLVideoElement | HTMLAudioElement | HTMLImageElement | HTMLCanvasElement;

/**
 * Canvas compositor + media scheduler for preview. One media element per clip;
 * video tracks are painted top-down, audio elements are played/paused as the
 * playhead enters/leaves clips. Export (ffmpeg) is the ground truth — this is
 * an approximation that's frame-accurate enough for editing.
 */
export class Player {
  playing = false;
  onFrame?: (frame: number) => void;
  private els = new Map<string, El>();
  private textKeys = new Map<string, string>();
  private raf = 0;
  private t0 = 0;
  private f0 = 0;
  private last: { p: Project; frame: number } | null = null;

  constructor(private canvas: HTMLCanvasElement) {}

  private el(clip: Clip, asset: Asset, p: Project): El {
    let el = this.els.get(clip.id);
    if (asset.kind === "text") {
      const key = JSON.stringify(asset.text) + clip.scale + p.width;
      if (el && this.textKeys.get(clip.id) === key) return el;
      el = renderText(asset.text!, Math.min(4, Math.max(0.25, clip.scale)), wrapWidth(p.width));
      this.els.set(clip.id, el);
      this.textKeys.set(clip.id, key);
      return el;
    }
    if (el) return el;
    const src = convertFileSrc(asset.path);
    const rerender = () => {
      if (!this.playing && this.last) this.render(this.last.p, this.last.frame);
    };
    if (asset.kind === "image") {
      el = new Image();
      el.onload = rerender;
    } else {
      el = asset.kind === "video" ? document.createElement("video") : new Audio();
      el.preload = "auto";
      el.onseeked = rerender;
      el.onloadeddata = rerender;
    }
    el.src = src;
    this.els.set(clip.id, el);
    return el;
  }

  private active(p: Project, frame: number) {
    return Object.values(p.clips).filter((c) => frame >= c.start && frame < c.start + c.duration);
  }

  render(p: Project, frame: number) {
    this.last = { p, frame };
    const ctx = this.canvas.getContext("2d")!;
    if (this.canvas.width !== p.width || this.canvas.height !== p.height) {
      this.canvas.width = p.width;
      this.canvas.height = p.height;
    }
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, p.width, p.height);
    for (const id of this.els.keys()) if (!p.clips[id]) this.drop(id);

    for (const t of [...p.tracks].reverse()) {
      if (t.kind !== "video" || t.muted) continue;
      const visible = Object.values(p.clips)
        .filter((c) => c.trackId === t.id && frame >= c.start && frame < c.start + c.duration + extension(p, c))
        .sort((a, b) => a.start - b.start);
      for (const c of visible) {
        const a = p.assets[c.assetId];
        if (!a) continue;
        const el = this.el(c, a, p);
        if (el instanceof HTMLVideoElement) {
          const t = (frame - c.start + c.inPoint) / p.fps;
          if (!this.playing && Math.abs(el.currentTime - t) > 1 / p.fps / 2) el.currentTime = t;
          if (el.readyState < 2) continue;
        } else if (el instanceof HTMLImageElement) {
          if (!el.complete || !el.naturalWidth) continue;
        } else if (!(el instanceof HTMLCanvasElement)) continue;
        const box = fitBox(p, c, a);
        const alpha = alphaAt(p, c, frame);
        if (box && alpha > 0) drawClip(ctx, el, animatedBox(c, box, frame), alpha === 1 ? c : { ...c, opacity: c.opacity * alpha }, 1);
      }
    }
  }

  /** Start/stop/sync media elements to the playhead. */
  private sync(p: Project, frame: number) {
    const active = new Set(this.active(p, frame).map((c) => c.id));
    for (const c of Object.values(p.clips)) {
      const a = p.assets[c.assetId];
      const track = p.tracks.find((t) => t.id === c.trackId);
      if (!a || !track || a.kind === "image" || a.kind === "text") continue;
      const el = this.el(c, a, p) as HTMLMediaElement;
      if (!active.has(c.id) || track.muted) {
        if (!el.paused) el.pause();
        continue;
      }
      el.volume = Math.min(1, c.volume * track.volume);
      el.muted = c.muted;
      const t = (frame - c.start + c.inPoint) / p.fps;
      if (el.paused || Math.abs(el.currentTime - t) > 0.3) {
        el.currentTime = t;
        void el.play().catch(() => {});
      }
    }
  }

  play(p: Project, frame: number) {
    if (this.playing) return;
    if (frame >= projectEnd(p)) frame = 0;
    this.playing = true;
    this.t0 = performance.now();
    this.f0 = frame;
    const loop = () => {
      const p2 = this.last?.p ?? p;
      const end = projectEnd(p2);
      let fr = this.f0 + Math.floor(((performance.now() - this.t0) * p2.fps) / 1000);
      if (fr >= end) {
        fr = end;
        this.pause();
      } else {
        this.sync(p2, fr);
        this.raf = requestAnimationFrame(loop);
      }
      this.render(p2, fr);
      this.onFrame?.(fr);
    };
    loop();
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    for (const el of this.els.values()) if (el instanceof HTMLMediaElement && !el.paused) el.pause();
  }

  /** Called while playing when the project changes (e.g. an edit mid-playback). */
  setProject(p: Project) {
    if (this.last) this.last.p = p;
  }

  private drop(id: string) {
    const el = this.els.get(id);
    if (el instanceof HTMLMediaElement) {
      el.pause();
      el.removeAttribute("src");
    }
    this.els.delete(id);
    this.textKeys.delete(id);
  }

  destroy() {
    this.pause();
    for (const id of [...this.els.keys()]) this.drop(id);
  }
}
