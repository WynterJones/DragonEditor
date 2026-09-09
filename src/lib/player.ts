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
  private lastSeek = new Map<string, number>();
  private clockId: string | null = null;
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

  /** Start/stop/sync media elements to the playhead. The clock clip is never re-seeked. */
  private sync(p: Project, frame: number, now: number) {
    const active = new Set(this.active(p, frame).map((c) => c.id));
    for (const c of Object.values(p.clips)) {
      const a = p.assets[c.assetId];
      const track = p.tracks.find((t) => t.id === c.trackId);
      if (!a || !track || a.kind === "image" || a.kind === "text") continue;
      const el = this.el(c, a, p) as HTMLMediaElement;
      if (!active.has(c.id) || track.muted || el.ended) {
        if (!el.paused) el.pause();
        continue;
      }
      const vol = Math.min(1, c.volume * track.volume);
      if (el.volume !== vol) el.volume = vol;
      if (el.muted !== c.muted) el.muted = c.muted;
      const t = (frame - c.start + c.inPoint) / p.fps;
      if (el.paused) {
        el.currentTime = t;
        this.lastSeek.set(c.id, now);
        void el.play().catch(() => {});
      } else if (c.id !== this.clockId && Math.abs(el.currentTime - t) > 0.5 && now - (this.lastSeek.get(c.id) ?? 0) > 2000) {
        // ponytail: media plays at 1x so drift doesn't grow; only fix gross offsets, rarely — each seek is an audible skip
        el.currentTime = t;
        this.lastSeek.set(c.id, now);
      }
    }
  }

  /** The media element the timeline follows while playing: a ready, playing video (else audio). */
  private clockClip(p: Project, frame: number): Clip | null {
    const ready = (c: Clip) => {
      const el = this.els.get(c.id);
      return el instanceof HTMLMediaElement && !el.paused && el.readyState >= 3 && !el.ended;
    };
    const active = this.active(p, frame).filter((c) => {
      const a = p.assets[c.assetId];
      const t = p.tracks.find((t) => t.id === c.trackId);
      return a && t && !t.muted && (a.kind === "video" || a.kind === "audio") && ready(c);
    });
    const current = active.find((c) => c.id === this.clockId);
    if (current) return current;
    const pick = active.find((c) => p.assets[c.assetId].kind === "video") ?? active[0] ?? null;
    this.clockId = pick?.id ?? null;
    return pick;
  }

  play(p: Project, frame: number) {
    if (this.playing) return;
    if (frame >= projectEnd(p)) frame = 0;
    this.playing = true;
    this.t0 = performance.now();
    this.f0 = frame;
    this.clockId = null;
    // warm every media element now so clips don't start late when they become active
    for (const c of Object.values(p.clips)) {
      const a = p.assets[c.assetId];
      if (a && a.kind !== "image" && a.kind !== "text") this.el(c, a, p);
    }
    let last = -1;
    const loop = () => {
      const p2 = this.last?.p ?? p;
      const now = performance.now();
      const end = projectEnd(p2);
      const clock = this.clockClip(p2, Math.max(last, this.f0));
      let fr: number;
      if (clock) {
        const el = this.els.get(clock.id) as HTMLMediaElement;
        fr = Math.max(this.f0, clock.start + Math.floor((el.currentTime - clock.inPoint / p2.fps) * p2.fps));
        // re-anchor the wall clock so time stays continuous when this clip ends
        this.f0 = fr;
        this.t0 = now;
      } else {
        fr = this.f0 + Math.floor(((now - this.t0) * p2.fps) / 1000);
      }
      if (fr >= end) {
        fr = end;
        this.pause();
        this.render(p2, fr);
        this.onFrame?.(fr);
        return;
      }
      this.sync(p2, fr, now);
      if (fr !== last) {
        last = fr;
        this.render(p2, fr);
        this.onFrame?.(fr);
      }
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  pause() {
    this.playing = false;
    this.clockId = null;
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
