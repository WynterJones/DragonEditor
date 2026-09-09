import { useEffect, useRef } from "react";
import { Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Player } from "@/lib/player";
import { timecode } from "@/lib/format";
import { projectEnd, useStore } from "@/store";

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

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 min-w-0 flex-1 p-4">
        <canvas ref={canvasRef} className="h-full w-full object-contain" />
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
