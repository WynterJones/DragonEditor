import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildArgs } from "@/lib/exportPlan";
import { api } from "@/lib/tauri";
import { seconds } from "@/lib/format";
import { projectEnd, useStore } from "@/store";

const QUALITY = [
  ["18", "Max · CRF 18 (large file)"],
  ["21", "High · CRF 21"],
  ["23", "Good · CRF 23 (YouTube-ready)"],
];

export default function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const project = useStore((s) => s.project)!;
  const [codec, setCodec] = useState<"h264" | "h265">("h264");
  const [crf, setCrf] = useState("21");
  const [scale, setScale] = useState("1");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ pct: 0, fps: 0, speed: "" });
  const [done, setDone] = useState<string | null>(null);

  const end = projectEnd(project);
  const durUs = (end / project.fps) * 1e6;

  useEffect(() => {
    if (!running) return;
    const un = listen<{ frame: number; fps: number; out_time_us: number; speed: string }>("export-progress", (e) => {
      setProgress({ pct: Math.min(100, (e.payload.out_time_us / durUs) * 100), fps: e.payload.fps, speed: e.payload.speed });
    });
    return () => void un.then((f) => f());
  }, [running, durUs]);

  const start = async () => {
    const k = Number(scale);
    const out = await save({
      defaultPath: `${project.name}.mp4`,
      filters: [{ name: "MP4 video", extensions: ["mp4"] }],
    });
    if (!out) return;
    let args: string[];
    try {
      args = buildArgs(project, { out, codec, crf: Number(crf), width: Math.round((project.width * k) / 2) * 2, height: Math.round((project.height * k) / 2) * 2 });
    } catch (e) {
      return toast.error(String(e));
    }
    setRunning(true);
    setDone(null);
    setProgress({ pct: 0, fps: 0, speed: "" });
    try {
      await api.exportStart(args);
      setDone(out);
      toast.success("Export complete", { action: { label: "Show in Finder", onClick: () => revealItemInDir(out) } });
    } catch (e) {
      const msg = String(e);
      if (!msg.includes("cancelled")) toast.error(msg, { duration: 12000 });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !running && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export MP4</DialogTitle>
          <DialogDescription>
            {seconds(end, project.fps)} · {project.width}×{project.height} @ {project.fps}fps
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Resolution</Label>
            <Select value={scale} onValueChange={(v) => v && setScale(v)} disabled={running}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">
                  Project · {project.width}×{project.height}
                </SelectItem>
                <SelectItem value="0.5">
                  Half · {project.width / 2}×{project.height / 2}
                </SelectItem>
                <SelectItem value="2">
                  Double · {project.width * 2}×{project.height * 2}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Codec</Label>
              <Select value={codec} onValueChange={(v) => v && setCodec(v as "h264" | "h265")} disabled={running}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="h264">H.264 (compatible)</SelectItem>
                  <SelectItem value="h265">H.265 / HEVC (smaller)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Quality</Label>
              <Select value={crf} onValueChange={(v) => v && setCrf(v)} disabled={running}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUALITY.map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">AAC 256k stereo · 48kHz · faststart. Rendered by FFmpeg.</p>

          {running && (
            <div className="grid gap-2">
              <Progress value={progress.pct} />
              <div className="mono flex justify-between text-[11px] text-muted-foreground">
                <span>{progress.pct.toFixed(0)}%</span>
                <span>
                  {progress.fps.toFixed(0)} fps · {progress.speed}
                </span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {running ? (
              <Button variant="destructive" onClick={() => api.exportCancel()}>
                Cancel
              </Button>
            ) : (
              <>
                {done && (
                  <Button variant="secondary" onClick={() => revealItemInDir(done)}>
                    Show in Finder
                  </Button>
                )}
                <Button onClick={start} disabled={end === 0}>
                  {running && <Loader2 className="animate-spin" />} Export
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
