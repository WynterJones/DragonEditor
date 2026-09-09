import { useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FileAudio, Film, Image as ImageIcon, Mic, Plus, Trash2, Type } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ALL_EXT, importFile } from "@/lib/project";
import { seconds } from "@/lib/format";
import { addClip, addClipAuto, removeAsset, useStore } from "@/store";
import type { Asset } from "@/types";

export default function MediaPanel() {
  const project = useStore((s) => s.project)!;
  const update = useStore((s) => s.update);
  const [busy, setBusy] = useState(false);
  const assets = Object.values(project.assets).filter((a) => !a.voice && a.kind !== "text");

  const pick = async () => {
    const files = await open({ multiple: true, filters: [{ name: "Media", extensions: ALL_EXT }] });
    if (!files?.length) return;
    setBusy(true);
    for (const f of files) {
      try {
        const a = await importFile(project, f);
        update((p) => {
          p.assets[a.id] = a;
        });
      } catch (e) {
        toast.error(`${f.split("/").pop()}: ${e}`);
      }
    }
    setBusy(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 pb-2">
        <Button size="sm" variant="secondary" className="flex-1" onClick={pick} disabled={busy}>
          <Plus /> {busy ? "Importing…" : "Import media"}
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {assets.length === 0 ? (
          <p className="px-4 py-10 text-center text-xs leading-relaxed text-muted-foreground">
            Import video, images or audio — or drop files from Finder.
            <br />
            Drag items onto the timeline, or double-click to add at the playhead.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 px-3 pb-3">
            {assets.map((a) => (
              <AssetCard key={a.id} asset={a} fps={project.fps} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

const ICON = { video: Film, image: ImageIcon, audio: FileAudio, text: Type };

export function AssetCard({ asset, fps }: { asset: Asset; fps: number }) {
  const ghost = useRef<HTMLDivElement | null>(null);
  const Icon = asset.voice ? Mic : ICON[asset.kind];

  // pointer-drag to timeline (HTML5 DnD conflicts with Tauri's native file-drop on macOS)
  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      if (!moved) {
        moved = true;
        useStore.getState().setUI({ dragAsset: asset.id });
        const g = document.createElement("div");
        g.className = "pointer-events-none fixed z-50 rounded-md border border-primary bg-primary/20 px-2 py-1 text-xs text-foreground";
        g.textContent = asset.voice ? asset.voice.text.slice(0, 40) : asset.name;
        document.body.appendChild(g);
        ghost.current = g;
      }
      ghost.current!.style.left = `${ev.clientX + 12}px`;
      ghost.current!.style.top = `${ev.clientY + 12}px`;
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      ghost.current?.remove();
      ghost.current = null;
      if (!moved) return;
      useStore.getState().setUI({ dragAsset: null });
      const row = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => (el as HTMLElement).dataset.track) as HTMLElement | undefined;
      if (!row) return;
      const lane = row.lastElementChild as HTMLElement;
      const rect = lane.getBoundingClientRect();
      const frame = Math.max(0, Math.round((ev.clientX - rect.left) / useStore.getState().zoom));
      if (!addClip(asset.id, row.dataset.track!, frame)) toast.error(`${asset.kind} clips can't go on that track`);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      className="group relative cursor-grab overflow-hidden rounded-md border bg-[var(--surface-2)] transition-colors hover:border-primary/50 active:cursor-grabbing"
      onPointerDown={onDown}
      onDoubleClick={() => addClipAuto(asset.id, useStore.getState().playhead) ?? toast.error("No compatible track")}
      title={asset.voice?.text ?? asset.name}
    >
      <div className="flex aspect-video items-center justify-center bg-black/60">
        {asset.thumb ? (
          <img src={convertFileSrc(asset.thumb)} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : asset.peaks ? (
          <MiniWave peaks={asset.peaks} voice={!!asset.voice} />
        ) : (
          <Icon className="size-6 text-muted-foreground" />
        )}
      </div>
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <Icon className="size-3 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-[11px]">{asset.voice ? asset.voice.text : asset.name}</span>
        <span className="mono text-[10px] text-muted-foreground">{asset.kind === "image" ? "img" : seconds(asset.duration, fps)}</span>
      </div>
      <button
        className="absolute top-1 right-1 rounded bg-black/70 p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          removeAsset(asset.id);
        }}
        title="Remove from project"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}

function MiniWave({ peaks, voice }: { peaks: number[]; voice: boolean }) {
  const step = Math.max(1, Math.floor(peaks.length / 120));
  const pts: string[] = [];
  for (let i = 0; i < peaks.length; i += step) pts.push(`${i},${1 - peaks[i]}`, `${i},${1 + peaks[i]}`);
  return (
    <svg viewBox={`0 0 ${peaks.length} 2`} preserveAspectRatio="none" className={cn("h-2/3 w-[90%]", voice ? "text-emerald-400" : "text-teal-300")}>
      <polyline points={pts.join(" ")} fill="none" stroke="currentColor" strokeWidth={step * 0.8} />
    </svg>
  );
}

export function useDragAssetCursor() {
  const dragging = useStore((s) => s.dragAsset !== null);
  useEffect(() => {
    document.body.style.cursor = dragging ? "grabbing" : "";
  }, [dragging]);
}
