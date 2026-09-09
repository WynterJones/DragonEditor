import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Player } from "@/lib/player";
import { timecode } from "@/lib/format";
import { projectEnd, useStore } from "@/store";
import type { Clip } from "@/types";

export default function Preview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Player | null>(null);
  const project = useStore((s) => s.project)!;
  const playhead = useStore((s) => s.playhead);
  const playing = useStore((s) => s.playing);
  const setUI = useStore((s) => s.setUI);

  useEffect(() => {
    const player = new Player(canvasRef.current!);
    player.onFrame = (frame) => setUI({ playhead: frame, playing: player.playing });
    playerRef.current = player;
    return () => player.destroy();
  }, []);

  useEffect(() => {
    const player = playerRef.current!;
    if (player.playing) player.setProject(project);
    else player.render(project, playhead);
  }, [project, playhead]);

  // space toggles play (global, unless typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== " " || el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = () => {
    const player = playerRef.current!;
    const s = useStore.getState();
    if (player.playing) {
      player.pause();
      setUI({ playing: false });
    } else {
      player.play(s.project!, s.playhead);
      setUI({ playing: true });
    }
  };

  const seek = (frame: number) => {
    playerRef.current?.pause();
    setUI({ playhead: Math.max(0, Math.min(frame, projectEnd(project))), playing: false });
  };

  const end = projectEnd(project);

  // fitted frame rect inside the preview box (16px margin)
  const boxRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ left: 0, top: 0, width: 0, height: 0 });
  useEffect(() => {
    const el = boxRef.current!;
    const ro = new ResizeObserver(() => {
      const cw = el.clientWidth - 32;
      const ch = el.clientHeight - 32;
      const k = Math.min(cw / project.width, ch / project.height);
      const width = project.width * k;
      const height = project.height * k;
      setFrame({ left: (el.clientWidth - width) / 2, top: (el.clientHeight - height) / 2, width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [project.width, project.height]);

  return (
    <div className="flex h-full flex-col">
      <div ref={boxRef} className="bg-grid relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <canvas ref={canvasRef} className="absolute bg-black outline outline-1 outline-[#333]" style={frame} />
        <Overlay frame={frame} playhead={playhead} />
      </div>
      <div className="flex h-12 items-center justify-center gap-1 border-t bg-[var(--surface-1)]">
        <span className="mono w-28 text-right text-xs text-primary">{timecode(playhead, project.fps)}</span>
        <div className="mx-4 flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" onClick={() => seek(0)}>
            <SkipBack />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => seek(playhead - 1)}>
            <StepBack />
          </Button>
          <Button size="icon" className="mx-1 rounded-full" onClick={toggle}>
            {playing ? <Pause /> : <Play />}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => seek(playhead + 1)}>
            <StepForward />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => seek(end)}>
            <SkipForward />
          </Button>
        </div>
        <span className="mono w-28 text-xs text-muted-foreground">{timecode(end, project.fps)}</span>
      </div>
    </div>
  );
}

type Rect = { left: number; top: number; width: number; height: number };
const HANDLES = [
  ["nw", "-top-1.5 -left-1.5 cursor-nwse-resize"],
  ["ne", "-top-1.5 -right-1.5 cursor-nesw-resize"],
  ["sw", "-bottom-1.5 -left-1.5 cursor-nesw-resize"],
  ["se", "-bottom-1.5 -right-1.5 cursor-nwse-resize"],
];

/** Click/drag/scale the video clips visible at the playhead, directly on the preview. */
function Overlay({ frame, playhead }: { frame: Rect; playhead: number }) {
  const project = useStore((s) => s.project)!;
  const selection = useStore((s) => s.selection);
  const { setUI, update } = useStore.getState();
  const k = frame.width / project.width;
  if (!k) return null;

  const boxOf = (c: Clip): Rect | null => {
    const a = project.assets[c.assetId];
    if (!a?.width || !a.height) return null;
    const f = Math.min((project.width * c.scale) / a.width, (project.height * c.scale) / a.height);
    const dw = a.width * f;
    const dh = a.height * f;
    return { left: ((project.width - dw) / 2 + c.x) * k, top: ((project.height - dh) / 2 + c.y) * k, width: dw * k, height: dh * k };
  };

  // bottom track first so the top track's box is on top for hit-testing
  const visible = [...project.tracks]
    .reverse()
    .filter((t) => t.kind === "video" && !t.muted && !t.locked)
    .flatMap((t) => Object.values(project.clips).filter((c) => c.trackId === t.id && playhead >= c.start && playhead < c.start + c.duration));

  const drag = (e: React.PointerEvent, clip: Clip, mode: "move" | "scale") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setUI({ selection: [clip.id] });
    const r = (mode === "move" ? e.currentTarget : e.currentTarget.parentElement!).getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const d0 = Math.hypot(e.clientX - cx, e.clientY - cy);
    const { x, y, scale } = clip;
    const temporal = useStore.temporal.getState();
    let first = true;
    const move = (ev: PointerEvent) => {
      update((p) => {
        const c = p.clips[clip.id];
        if (!c) return;
        if (mode === "move") {
          c.x = Math.round(x + (ev.clientX - x0) / k);
          c.y = Math.round(y + (ev.clientY - y0) / k);
        } else {
          const d = Math.hypot(ev.clientX - cx, ev.clientY - cy);
          c.scale = Math.min(5, Math.max(0.05, Math.round(scale * (d / d0) * 1000) / 1000));
        }
      });
      if (first) {
        first = false;
        temporal.pause(); // one undo step for the whole drag
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      temporal.resume();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="absolute" style={frame} onPointerDown={() => setUI({ selection: [] })}>
      {visible.map((c) => {
        const box = boxOf(c);
        if (!box) return null;
        const selected = selection.includes(c.id);
        return (
          <div
            key={c.id}
            className={`absolute cursor-move ${selected ? "outline outline-2 outline-primary" : "hover:outline hover:outline-1 hover:outline-primary/50"}`}
            style={box}
            onPointerDown={(e) => drag(e, c, "move")}
          >
            {selected &&
              HANDLES.map(([id, cls]) => (
                <div key={id} className={`absolute size-3 rounded-sm border border-black bg-primary ${cls}`} onPointerDown={(e) => drag(e, c, "scale")} />
              ))}
          </div>
        );
      })}
    </div>
  );
}
