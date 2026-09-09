import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { FolderOpen, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProject, forgetRecent, openProject, pushRecent, recents } from "@/lib/project";
import { useStore } from "@/store";
import { SettingsButton } from "@/components/SettingsDialog";

const PRESETS = [
  { id: "1080p", label: "1080p · 1920×1080", w: 1920, h: 1080 },
  { id: "4k", label: "4K · 3840×2160", w: 3840, h: 2160 },
  { id: "vertical", label: "Vertical · 1080×1920", w: 1080, h: 1920 },
  { id: "square", label: "Square · 1080×1080", w: 1080, h: 1080 },
];

export default function Start() {
  const setProject = useStore((s) => s.setProject);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Untitled");
  const [parent, setParent] = useState("");
  const [preset, setPreset] = useState("1080p");
  const [fps, setFps] = useState("30");
  const [recent, setRecent] = useState(recents());

  const load = async (dir: string) => {
    try {
      const p = await openProject(dir);
      pushRecent(p);
      setProject(p);
    } catch (e) {
      toast.error(`Couldn't open project: ${e}`);
      forgetRecent(dir);
      setRecent(recents());
    }
  };

  const browse = async () => {
    const dir = await open({ directory: true, title: "Open a .dragon project folder" });
    if (dir) await load(dir);
  };

  const startCreate = async () => {
    setParent(`${await homeDir()}Movies`);
    setCreating(true);
  };

  const pickParent = async () => {
    const dir = await open({ directory: true, defaultPath: parent, title: "Where to save the project" });
    if (dir) setParent(dir);
  };

  const create = async () => {
    const pr = PRESETS.find((p) => p.id === preset)!;
    try {
      const p = await createProject({ name: name.trim() || "Untitled", parent, width: pr.w, height: pr.h, fps: Number(fps) });
      pushRecent(p);
      setProject(p);
    } catch (e) {
      toast.error(`Couldn't create project: ${e}`);
    }
  };

  return (
    <div className="drag-region flex h-screen flex-col items-center justify-center gap-10 bg-[radial-gradient(ellipse_at_top,#1a1508_0%,#0a0a0a_55%)]">
      <div className="absolute top-3 right-3">
        <SettingsButton />
      </div>
      <img src="/brand/logo.png" alt="DragonEditor" className="w-[420px] drop-shadow-[0_0_40px_rgba(242,193,78,0.15)]" draggable={false} />
      <div className="flex gap-3">
        <Button size="lg" onClick={startCreate}>
          <Plus /> New Project
        </Button>
        <Button size="lg" variant="secondary" onClick={browse}>
          <FolderOpen /> Open Project
        </Button>
      </div>
      {recent.length > 0 && (
        <div className="w-[440px]">
          <div className="mb-2 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">Recent</div>
          <div className="divide-y divide-border rounded-lg border bg-card/60">
            {recent.map((r) => (
              <div key={r.dir} className="group flex items-center gap-3 px-3 py-2 hover:bg-accent">
                <button className="flex-1 truncate text-left" onClick={() => load(r.dir)}>
                  <div className="text-sm">{r.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{r.dir}</div>
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    forgetRecent(r.dir);
                    setRecent(recents());
                  }}
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === "Enter" && create()} />
            </div>
            <div className="grid gap-2">
              <Label>Location</Label>
              <div className="flex gap-2">
                <Input value={parent} readOnly className="flex-1 text-muted-foreground" />
                <Button variant="secondary" onClick={pickParent}>
                  Browse
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Format</Label>
                <Select value={preset} onValueChange={(v) => v && setPreset(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRESETS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Frame rate</Label>
                <Select value={fps} onValueChange={(v) => v && setFps(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["24", "30", "60"].map((f) => (
                      <SelectItem key={f} value={f}>
                        {f} fps
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={create} className="mt-2">
              Create
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
