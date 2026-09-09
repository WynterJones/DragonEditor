import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { ChevronLeft, Redo2, Undo2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Timeline from "@/components/Timeline";
import Preview from "@/components/Preview";
import MediaPanel from "@/components/MediaPanel";
import VoicePanel from "@/components/VoicePanel";
import Inspector from "@/components/Inspector";
import ExportDialog from "@/components/ExportDialog";
import { SettingsButton } from "@/components/SettingsDialog";
import { importFile, kindOf, saveProject } from "@/lib/project";
import { deleteSelected, redo, splitAtPlayhead, undo, useStore } from "@/store";

export default function Editor() {
  const project = useStore((s) => s.project)!;
  const dirty = useStore((s) => s.dirty);
  const { setProject, setUI, update } = useStore.getState();
  const [exporting, setExporting] = useState(false);

  // autosave
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      saveProject(useStore.getState().project!)
        .then(() => setUI({ dirty: false }))
        .catch((e) => toast.error(`Autosave failed: ${e}`));
    }, 1500);
    return () => clearTimeout(t);
  }, [dirty, project]);

  // Finder drops
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent(async (e) => {
      if (e.payload.type !== "drop") return;
      const files = e.payload.paths.filter(kindOf);
      if (!files.length) return;
      const p = useStore.getState().project!;
      const t = toast.loading(`Importing ${files.length} file${files.length > 1 ? "s" : ""}…`);
      for (const f of files) {
        try {
          const a = await importFile(p, f);
          update((p) => {
            p.assets[a.id] = a;
          });
        } catch (err) {
          toast.error(`${f.split("/").pop()}: ${err}`);
        }
      }
      toast.dismiss(t);
    });
    return () => void unlisten.then((f) => f());
  }, []);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      const mod = e.metaKey || e.ctrlKey;
      const s = useStore.getState();
      if (mod && e.key === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (mod && e.key === "s") {
        e.preventDefault();
        saveProject(s.project!).then(() => setUI({ dirty: false }));
      } else if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setUI({ zoom: Math.min(s.zoom * 1.4, 40) });
      } else if (mod && e.key === "-") {
        e.preventDefault();
        setUI({ zoom: Math.max(s.zoom / 1.4, 0.05) });
      } else if (e.key === "s" || e.key === "S") {
        splitAtPlayhead();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        deleteSelected();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const d = (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1);
        setUI({ playhead: Math.max(0, s.playhead + d) });
      } else if (e.key === "Home") {
        setUI({ playhead: 0 });
      } else if (e.key === "Escape") {
        setUI({ selection: [] });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = async () => {
    if (useStore.getState().dirty) await saveProject(useStore.getState().project!);
    setProject(null);
  };

  return (
    <div className="grid h-screen grid-rows-[44px_minmax(0,1fr)_320px] bg-background">
      <header data-tauri-drag-region className="flex items-center gap-2 border-b bg-[var(--surface-1)] pr-3 pl-[84px]">
        <Button variant="ghost" size="icon-sm" onClick={close} title="Back to projects">
          <ChevronLeft />
        </Button>
        <img src="/brand/dragon.png" className="size-6" alt="" draggable={false} />
        <span className="text-sm font-medium">{project.name}</span>
        <span className="text-[11px] text-muted-foreground mono">
          {project.width}×{project.height} · {project.fps}fps{dirty ? " · unsaved" : ""}
        </span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" onClick={undo} title="Undo (⌘Z)">
          <Undo2 />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={redo} title="Redo (⇧⌘Z)">
          <Redo2 />
        </Button>
        <SettingsButton />
        <Button size="sm" onClick={() => setExporting(true)}>
          <Upload /> Export
        </Button>
      </header>

      <div className="grid min-h-0 grid-cols-[320px_minmax(0,1fr)_300px]">
        <aside className="min-h-0 border-r bg-[var(--surface-1)]">
          <Tabs defaultValue="media" className="flex h-full flex-col gap-0">
            <TabsList className="m-2 grid grid-cols-2">
              <TabsTrigger value="media">Media</TabsTrigger>
              <TabsTrigger value="voice">Voice</TabsTrigger>
            </TabsList>
            <TabsContent value="media" className="min-h-0 flex-1">
              <MediaPanel />
            </TabsContent>
            <TabsContent value="voice" className="min-h-0 flex-1">
              <VoicePanel />
            </TabsContent>
          </Tabs>
        </aside>
        <main className="min-h-0 min-w-0 bg-black">
          <Preview />
        </main>
        <aside className="min-h-0 overflow-y-auto border-l bg-[var(--surface-1)]">
          <Inspector />
        </aside>
      </div>

      <section className="min-h-0 border-t bg-[var(--surface-1)]">
        <Timeline />
      </section>

      <ExportDialog open={exporting} onOpenChange={setExporting} />
    </div>
  );
}
