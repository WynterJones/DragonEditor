import { create } from "zustand";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import { CLIP_STYLE_DEFAULTS, type Asset, type Clip, type Project, type Track, type TrackKind } from "./types";

interface UI {
  playhead: number;
  selection: string[];
  /** px per frame */
  zoom: number;
  playing: boolean;
  dirty: boolean;
  dragAsset: string | null;
}

interface State extends UI {
  project: Project | null;
  setProject(p: Project | null): void;
  update(fn: (p: Project) => void): void;
  setUI(partial: Partial<UI>): void;
}

export const useStore = create<State>()(
  temporal(
    immer((set) => ({
      project: null,
      playhead: 0,
      selection: [],
      zoom: 100 / 30,
      playing: false,
      dirty: false,
      dragAsset: null,
      setProject: (project) =>
        set({ project, playhead: 0, selection: [], dirty: false, zoom: project ? 100 / project.fps : 100 / 30 }),
      update: (fn) =>
        set((s) => {
          if (!s.project) return;
          fn(s.project);
          s.dirty = true;
        }),
      setUI: (partial) => set(partial),
    })),
    { partialize: (s) => ({ project: s.project }), limit: 200, equality: (a, b) => a.project === b.project },
  ),
);

export const undo = () => useStore.temporal.getState().undo();
export const redo = () => useStore.temporal.getState().redo();

export const id = () => Math.random().toString(36).slice(2, 10);
export const IMAGE_SECONDS = 5;

export function projectEnd(p: Project) {
  return Object.values(p.clips).reduce((m, c) => Math.max(m, c.start + c.duration), 0);
}

export function trackClips(p: Project, trackId: string) {
  return Object.values(p.clips)
    .filter((c) => c.trackId === trackId)
    .sort((a, b) => a.start - b.start);
}

export function compatible(asset: Asset, track: Track) {
  return asset.kind === "audio" ? track.kind !== "video" : track.kind === "video";
}

function overlapping(p: Project, trackId: string, start: number, duration: number, ignore?: string) {
  return trackClips(p, trackId).find(
    (c) => c.id !== ignore && start < c.start + c.duration && start + duration > c.start,
  );
}

/** First free position at or after `start` on the track. */
export function findSlot(p: Project, trackId: string, start: number, duration: number, ignore?: string) {
  let s = Math.max(0, start);
  for (let i = 0; i < 1000; i++) {
    const hit = overlapping(p, trackId, s, duration, ignore);
    if (!hit) return s;
    s = hit.start + hit.duration;
  }
  return s;
}

export function clipDuration(p: Project, asset: Asset) {
  return asset.kind === "image" || asset.kind === "text" ? IMAGE_SECONDS * p.fps : asset.duration;
}

export function addClip(assetId: string, trackId: string, start: number): string | null {
  const { project: p, update, setUI } = useStore.getState();
  if (!p) return null;
  const asset = p.assets[assetId];
  const track = p.tracks.find((t) => t.id === trackId);
  if (!asset || !track || !compatible(asset, track)) return null;
  const duration = clipDuration(p, asset);
  const clip: Clip = {
    id: id(),
    assetId,
    trackId,
    start: findSlot(p, trackId, start, duration),
    inPoint: 0,
    duration,
    volume: 1,
    fadeIn: 0,
    fadeOut: 0,
    muted: false,
    x: 0,
    y: 0,
    scale: 1,
    opacity: 1,
    ...CLIP_STYLE_DEFAULTS,
  };
  update((p) => {
    p.clips[clip.id] = clip;
  });
  setUI({ selection: [clip.id] });
  return clip.id;
}

/** Adds to the first compatible track. */
export function addClipAuto(assetId: string, start: number) {
  const p = useStore.getState().project;
  if (!p) return null;
  const asset = p.assets[assetId];
  const track = p.tracks.find((t) => asset && compatible(asset, t) && !t.locked);
  return track ? addClip(assetId, track.id, start) : null;
}

export function addTrack(kind: TrackKind, name?: string): string {
  const tid = id();
  useStore.getState().update((p) => {
    const count = p.tracks.filter((t) => t.kind === kind).length + 1;
    const track: Track = {
      id: tid,
      kind,
      name: name ?? (kind === "video" ? `V${count}` : kind === "audio" ? `A${count}` : "Music"),
      muted: false,
      locked: false,
      volume: 1,
    };
    if (kind === "video") p.tracks.unshift(track);
    else {
      const bg = p.tracks.findIndex((t) => t.kind === "background");
      p.tracks.splice(bg === -1 ? p.tracks.length : bg, 0, track);
    }
  });
  return tid;
}

export function moveClip(clipId: string, trackId: string, start: number) {
  useStore.getState().update((p) => {
    const c = p.clips[clipId];
    if (!c) return;
    const dest = p.tracks.find((t) => t.id === trackId);
    if (!dest || !compatible(p.assets[c.assetId], dest)) return;
    if (overlapping(p, trackId, start, c.duration, clipId)) return;
    c.trackId = trackId;
    c.start = Math.max(0, start);
  });
}

export function trimClip(clipId: string, side: "l" | "r", edge: number) {
  useStore.getState().update((p) => {
    const c = p.clips[clipId];
    if (!c) return;
    const asset = p.assets[c.assetId];
    const maxLen = asset.kind === "video" || asset.kind === "audio" ? asset.duration : Infinity;
    if (side === "l") {
      const ns = Math.max(0, Math.min(edge, c.start + c.duration - 1));
      const delta = ns - c.start;
      if (c.inPoint + delta < 0) return;
      if (overlapping(p, c.trackId, ns, c.duration - delta, clipId)) return;
      c.start = ns;
      c.inPoint += delta;
      c.duration -= delta;
    } else {
      const nd = Math.max(1, Math.min(edge - c.start, maxLen - c.inPoint));
      if (overlapping(p, c.trackId, c.start, nd, clipId)) return;
      c.duration = nd;
    }
  });
}

export function splitAtPlayhead() {
  const { playhead, selection, update, setUI } = useStore.getState();
  if (!selection.length) return;
  const created: string[] = [];
  update((p) => {
    const targets = Object.values(p.clips).filter(
      (c) =>
        selection.includes(c.id) &&
        playhead > c.start &&
        playhead < c.start + c.duration &&
        !p.tracks.find((t) => t.id === c.trackId)?.locked,
    );
    for (const c of targets) {
      const off = playhead - c.start;
      const right: Clip = { ...c, id: id(), start: playhead, inPoint: c.inPoint + off, duration: c.duration - off, fadeIn: 0, transition: "none" };
      c.duration = off;
      c.fadeOut = 0;
      p.clips[right.id] = right;
      created.push(right.id);
    }
  });
  if (created.length) setUI({ selection: created });
}

export function deleteSelected() {
  const { selection, update, setUI } = useStore.getState();
  if (!selection.length) return;
  update((p) => {
    for (const id of selection) delete p.clips[id];
  });
  setUI({ selection: [] });
}

export function removeAsset(assetId: string) {
  useStore.getState().update((p) => {
    delete p.assets[assetId];
    for (const c of Object.values(p.clips)) if (c.assetId === assetId) delete p.clips[c.id];
  });
}
