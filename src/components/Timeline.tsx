import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Lock, LockOpen, Plus, Scissors, Type, Volume2, VolumeX, ZoomIn, ZoomOut } from "lucide-react";
import { addText } from "@/lib/text";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { addTrack, moveClip, projectEnd, splitAtPlayhead, trackClips, trimClip, useStore } from "@/store";
import type { Asset, Clip, Project, Track } from "@/types";

const HEADER_W = 176;
const RULER_H = 26;
const SNAP_PX = 8;
const rowH = (t: Track) => (t.kind === "video" ? 64 : 48);

type Drag =
  | { type: "move"; clipId: string; x0: number; start0: number; trackId: string; start: number }
  | { type: "trim"; clipId: string; side: "l" | "r"; x0: number; edge0: number; edge: number };

function snapCandidates(p: Project, ignore: string) {
  const c = [0, useStore.getState().playhead];
  for (const clip of Object.values(p.clips)) if (clip.id !== ignore) c.push(clip.start, clip.start + clip.duration);
  return c;
}

function snap(frame: number, cands: number[], zoom: number) {
  let best = frame;
  let bd = SNAP_PX / zoom;
  for (const c of cands) {
    const d = Math.abs(c - frame);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

export default function Timeline() {
  const project = useStore((s) => s.project)!;
  const zoom = useStore((s) => s.zoom);
  const selection = useStore((s) => s.selection);
  const setUI = useStore((s) => s.setUI);
  const update = useStore((s) => s.update);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [viewW, setViewW] = useState(1000);

  useEffect(() => {
    const el = scrollRef.current!;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const end = projectEnd(project);
  const laneW = Math.max((end + project.fps * 15) * zoom, viewW - HEADER_W);

  const frameAt = (clientX: number) => {
    const el = scrollRef.current!;
    const x = clientX - el.getBoundingClientRect().left + el.scrollLeft - HEADER_W;
    return Math.max(0, Math.round(x / zoom));
  };

  const trackAt = (clientY: number) =>
    (document.elementsFromPoint(HEADER_W + 10 + scrollRef.current!.getBoundingClientRect().left, clientY).find((e) => (e as HTMLElement).dataset.track) as HTMLElement | undefined)
      ?.dataset.track;

  // ---- clip drag / trim
  const onClipDown = (e: React.PointerEvent, clip: Clip, side?: "l" | "r") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const track = project.tracks.find((t) => t.id === clip.trackId)!;
    if (!e.shiftKey && !selection.includes(clip.id)) setUI({ selection: [clip.id] });
    else if (e.shiftKey) setUI({ selection: selection.includes(clip.id) ? selection.filter((i) => i !== clip.id) : [...selection, clip.id] });
    if (track.locked) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag(
      side
        ? { type: "trim", clipId: clip.id, side, x0: e.clientX, edge0: side === "l" ? clip.start : clip.start + clip.duration, edge: side === "l" ? clip.start : clip.start + clip.duration }
        : { type: "move", clipId: clip.id, x0: e.clientX, start0: clip.start, trackId: clip.trackId, start: clip.start },
    );
  };

  const onClipMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const clip = project.clips[drag.clipId];
    if (!clip) return;
    const dx = (e.clientX - drag.x0) / zoom;
    const cands = snapCandidates(project, clip.id);
    if (drag.type === "move") {
      let start = Math.max(0, Math.round(drag.start0 + dx));
      const sl = snap(start, cands, zoom);
      const sr = snap(start + clip.duration, cands, zoom) - clip.duration;
      if (sl !== start) start = sl;
      else if (sr !== start) start = sr;
      const tid = trackAt(e.clientY) ?? drag.trackId;
      setDrag({ ...drag, start: Math.max(0, start), trackId: tid });
    } else {
      const edge = snap(Math.round(drag.edge0 + dx), cands, zoom);
      setDrag({ ...drag, edge });
    }
  };

  const onClipUp = () => {
    if (!drag) return;
    if (drag.type === "move") moveClip(drag.clipId, drag.trackId, drag.start);
    else trimClip(drag.clipId, drag.side, drag.edge);
    setDrag(null);
  };

  // ---- scrub on ruler / empty lane
  const scrubbing = useRef(false);
  const onLaneDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    scrubbing.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setUI({ playhead: frameAt(e.clientX), selection: [], playing: false });
  };
  const onLaneMove = (e: React.PointerEvent) => {
    if (scrubbing.current) setUI({ playhead: frameAt(e.clientX) });
  };
  const onLaneUp = () => (scrubbing.current = false);

  // ---- ruler ticks
  const stepSec = [1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => s * project.fps * zoom >= 70) ?? 600;
  const ticks: number[] = [];
  for (let s = 0; s * project.fps * zoom < laneW; s += stepSec) ticks.push(s);

  const toggleTrack = (id: string, key: "muted" | "locked") =>
    update((p) => {
      const t = p.tracks.find((t) => t.id === id)!;
      t[key] = !t[key];
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 items-center gap-1 border-b px-2">
        <Button variant="ghost" size="xs" onClick={() => addTrack("video")}>
          <Plus /> Video
        </Button>
        <Button variant="ghost" size="xs" onClick={() => addTrack("audio")}>
          <Plus /> Audio
        </Button>
        <Button variant="ghost" size="xs" onClick={() => addText()} title="Add a text clip at the playhead">
          <Type /> Text
        </Button>
        <div className="mx-2 h-4 w-px bg-border" />
        <Button variant="ghost" size="xs" onClick={splitAtPlayhead} disabled={!selection.length} title="Split selected clips at playhead (S)">
          <Scissors /> Split
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="icon-xs" onClick={() => setUI({ zoom: Math.max(zoom / 1.4, 0.05) })}>
          <ZoomOut />
        </Button>
        <Slider
          className="w-36 [&_[data-slot=slider-range]]:bg-neutral-500 [&_[data-slot=slider-thumb]]:border-neutral-400 [&_[data-slot=slider-thumb]]:bg-neutral-200 [&_[data-slot=slider-thumb]]:ring-neutral-500/40"
          value={[Math.log(zoom)]}
          min={Math.log(0.05)}
          max={Math.log(40)}
          step={0.01}
          onValueChange={(v) => setUI({ zoom: Math.exp(Array.isArray(v) ? v[0] : (v as number)) })}
        />
        <Button variant="ghost" size="icon-xs" onClick={() => setUI({ zoom: Math.min(zoom * 1.4, 40) })}>
          <ZoomIn />
        </Button>
      </div>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
        <div style={{ width: HEADER_W + laneW }} className="relative">
          {/* ruler */}
          <div className="sticky top-0 z-20 flex" style={{ height: RULER_H }}>
            <div className="sticky left-0 z-30 shrink-0 border-r border-b bg-[var(--surface-2)]" style={{ width: HEADER_W }} />
            <div className="relative flex-1 cursor-ew-resize border-b bg-[var(--surface-1)]" onPointerDown={onLaneDown} onPointerMove={onLaneMove} onPointerUp={onLaneUp}>
              {ticks.map((s) => (
                <div key={s} className="absolute top-0 h-full border-l border-border" style={{ left: s * project.fps * zoom }}>
                  <span className="mono absolute top-1 left-1 text-[10px] text-muted-foreground">
                    {s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* tracks */}
          {project.tracks.map((t) => (
            <div key={t.id} className="flex border-b border-border/60" style={{ height: rowH(t) }} data-track={t.id}>
              <div
                className={cn("sticky left-0 z-[26] flex shrink-0 flex-col justify-center gap-1 border-r bg-[var(--surface-2)] px-3", t.kind === "background" && "bg-[#141208]")}
                style={{ width: HEADER_W }}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs font-medium", t.kind === "video" ? "text-sky-300" : t.kind === "audio" ? "text-emerald-300" : "text-primary")}>{t.name}</span>
                  <span className="text-[10px] text-muted-foreground uppercase">{t.kind === "background" ? "bg" : t.kind}</span>
                </div>
                <div className="flex gap-1">
                  <button className={cn("rounded p-0.5 hover:bg-accent", t.muted && "text-destructive")} onClick={() => toggleTrack(t.id, "muted")} title="Mute">
                    {t.muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                  </button>
                  <button className={cn("rounded p-0.5 hover:bg-accent", t.locked && "text-primary")} onClick={() => toggleTrack(t.id, "locked")} title="Lock">
                    {t.locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
                  </button>
                </div>
              </div>
              <div
                className={cn("relative flex-1", t.kind === "background" && "bg-[#0f0e09]", t.muted && "opacity-50")}
                onPointerDown={onLaneDown}
                onPointerMove={onLaneMove}
                onPointerUp={onLaneUp}
              >
                {trackClips(project, t.id).map((c) => {
                  const asset = project.assets[c.assetId];
                  if (!asset) return null;
                  let start = c.start;
                  let duration = c.duration;
                  let ghostTrack = c.trackId;
                  if (drag?.clipId === c.id) {
                    if (drag.type === "move") {
                      start = drag.start;
                      ghostTrack = drag.trackId;
                    } else if (drag.side === "l") {
                      const ns = Math.max(0, Math.min(drag.edge, c.start + c.duration - 1));
                      duration = c.duration - (ns - c.start);
                      start = ns;
                    } else duration = Math.max(1, drag.edge - c.start);
                  }
                  if (ghostTrack !== t.id) return null;
                  return (
                    <ClipView
                      key={c.id}
                      clip={c}
                      asset={asset}
                      track={t}
                      left={start * zoom}
                      width={Math.max(2, duration * zoom)}
                      selected={selection.includes(c.id)}
                      dragging={drag?.clipId === c.id}
                      onDown={onClipDown}
                      onMove={onClipMove}
                      onUp={onClipUp}
                    />
                  );
                })}
                {drag?.type === "move" && drag.trackId === t.id && project.clips[drag.clipId]?.trackId !== t.id && (
                  <GhostClip clip={project.clips[drag.clipId]} left={drag.start * zoom} zoom={zoom} onMove={onClipMove} onUp={onClipUp} />
                )}
              </div>
            </div>
          ))}
          <Playhead zoom={zoom} scrollRef={scrollRef} />
        </div>
      </div>
    </div>
  );
}

function GhostClip({ clip, left, zoom, onMove, onUp }: { clip: Clip; left: number; zoom: number; onMove: (e: React.PointerEvent) => void; onUp: () => void }) {
  return (
    <div
      className="absolute top-1 bottom-1 rounded-md border border-dashed border-primary/70 bg-primary/10"
      style={{ left, width: clip.duration * zoom }}
      onPointerMove={onMove}
      onPointerUp={onUp}
    />
  );
}

function ClipView({
  clip,
  asset,
  track,
  left,
  width,
  selected,
  dragging,
  onDown,
  onMove,
  onUp,
}: {
  clip: Clip;
  asset: Asset;
  track: Track;
  left: number;
  width: number;
  selected: boolean;
  dragging: boolean;
  onDown: (e: React.PointerEvent, clip: Clip, side?: "l" | "r") => void;
  onMove: (e: React.PointerEvent) => void;
  onUp: () => void;
}) {
  const isVideo = track.kind === "video";
  const color = asset.voice ? "bg-emerald-950/80 border-emerald-500/40" : asset.kind === "text" ? "bg-violet-950/70 border-violet-500/40" : isVideo ? "bg-sky-950/70 border-sky-500/40" : track.kind === "background" ? "bg-yellow-950/60 border-yellow-500/40" : "bg-teal-950/70 border-teal-500/40";
  return (
    <div
      className={cn(
        "group absolute top-1 bottom-1 overflow-hidden rounded-md border text-[11px] select-none",
        color,
        selected && "ring-2 ring-primary border-primary",
        dragging && "opacity-80 shadow-xl",
        track.locked ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
      )}
      style={{ left, width }}
      onPointerDown={(e) => onDown(e, clip)}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      {asset.thumb && (
        <img src={thumbUrl(asset.thumb)} alt="" className="pointer-events-none absolute inset-y-0 left-0 h-full object-cover opacity-60" draggable={false} />
      )}
      {asset.peaks && <Waveform clip={clip} asset={asset} voice={!!asset.voice} />}
      {clip.transition !== "none" && (
        <div className="pointer-events-none absolute inset-y-0 left-0 bg-gradient-to-r from-primary/50 to-transparent" style={{ width: (clip.transitionFrames / clip.duration) * 100 + "%" }} />
      )}
      {clip.fadeIn > 0 && <div className="pointer-events-none absolute top-0 left-0 h-full border-t border-r border-white/40 [clip-path:polygon(0_100%,100%_0,100%_100%)] bg-white/10" style={{ width: (clip.fadeIn / clip.duration) * 100 + "%" }} />}
      {clip.fadeOut > 0 && <div className="pointer-events-none absolute top-0 right-0 h-full border-t border-l border-white/40 [clip-path:polygon(0_0,100%_100%,0_100%)] bg-white/10" style={{ width: (clip.fadeOut / clip.duration) * 100 + "%" }} />}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-1 truncate bg-gradient-to-b from-black/60 to-transparent px-1.5 py-0.5 font-medium text-foreground/90">
        {clip.muted && <VolumeX className="size-3 shrink-0" />}
        <span className="truncate">{asset.voice ? asset.voice.text : asset.name}</span>
      </div>
      {!track.locked && (
        <>
          <div className="absolute inset-y-0 left-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-primary/70" onPointerDown={(e) => onDown(e, clip, "l")} />
          <div className="absolute inset-y-0 right-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 bg-primary/70" onPointerDown={(e) => onDown(e, clip, "r")} />
        </>
      )}
    </div>
  );
}

const thumbUrl = (p: string) => convertFileSrc(p);

function Waveform({ clip, asset, voice }: { clip: Clip; asset: Asset; voice: boolean }) {
  const peaks = asset.peaks!;
  const n = peaks.length;
  const i0 = Math.floor((clip.inPoint / asset.duration) * n);
  const i1 = Math.ceil(((clip.inPoint + clip.duration) / asset.duration) * n);
  const slice = peaks.slice(i0, Math.max(i0 + 1, i1));
  const step = Math.max(1, Math.floor(slice.length / 400));
  const pts: string[] = [];
  for (let i = 0; i < slice.length; i += step) pts.push(`${i},${1 - slice[i]}`);
  const top = pts.join(" ");
  const bottom = [...pts].reverse().map((p) => {
    const [x, y] = p.split(",");
    return `${x},${2 - Number(y)}`;
  }).join(" ");
  return (
    <svg className={cn("pointer-events-none absolute inset-0 h-full w-full", voice ? "text-emerald-400/70" : "text-teal-300/60")} viewBox={`0 0 ${slice.length} 2`} preserveAspectRatio="none">
      <polygon points={`${top} ${bottom}`} fill="currentColor" />
    </svg>
  );
}

function Playhead({ zoom, scrollRef }: { zoom: number; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const playhead = useStore((s) => s.playhead);
  const playing = useStore((s) => s.playing);
  const x = HEADER_W + playhead * zoom;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    const vis = x - el.scrollLeft;
    if (vis > el.clientWidth - 40 || vis < HEADER_W) el.scrollLeft = x - HEADER_W - 40;
  }, [x, playing]);
  return (
    <div className="pointer-events-none absolute top-0 bottom-0 z-[25] w-px bg-primary" style={{ left: x }}>
      <div className="absolute -top-0 -left-[5px] size-0 border-x-[5px] border-t-[8px] border-x-transparent border-t-primary" />
    </div>
  );
}
