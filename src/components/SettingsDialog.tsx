import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { ExternalLink, Loader2, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/tauri";

const listeners = new Set<() => void>();
export const openSettings = () => listeners.forEach((l) => l());

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const l = () => setOpen(true);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return (
    <>
      <Button variant="ghost" size="icon-sm" onClick={() => setOpen(true)} title="Settings">
        <Settings />
      </Button>
      <SettingsDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [hasKey, setHasKey] = useState(false);
  const [key, setKey] = useState("");
  const [version, setVersion] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.hasApiKey().then(setHasKey);
    getVersion().then(setVersion);
    setKey("");
  }, [open]);

  const saveKey = async () => {
    if (!key.trim()) return;
    await api.setApiKey(key);
    setHasKey(true);
    setKey("");
    toast.success("API key saved to your keychain");
  };

  const clearKey = async () => {
    await api.clearApiKey();
    setHasKey(false);
  };

  const checkUpdates = async () => {
    setChecking(true);
    try {
      const u = await check();
      if (!u) return toast("You're on the latest version");
      toast(`Version ${u.version} available`, {
        duration: 20000,
        action: {
          label: "Install",
          onClick: () =>
            toast.promise(u.downloadAndInstall().then(() => relaunch()), {
              loading: "Downloading…",
              success: "Restarting…",
              error: (e) => `Update failed: ${e}`,
            }),
        },
      });
    } catch (e) {
      toast.error(`Update check failed: ${e}`);
    } finally {
      setChecking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>DragonEditor {version}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>ElevenLabs API key</Label>
              <button className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" onClick={() => openUrl("https://elevenlabs.io/app/settings/api-keys")}>
                Get a key <ExternalLink className="size-3" />
              </button>
            </div>
            {hasKey ? (
              <div className="flex items-center justify-between rounded-md border bg-[var(--surface-2)] px-3 py-2 text-xs">
                <span className="text-emerald-400">● Key stored in keychain</span>
                <Button variant="ghost" size="xs" onClick={clearKey}>
                  Remove
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk_…" className="mono" onKeyDown={(e) => e.key === "Enter" && saveKey()} />
                <Button onClick={saveKey} disabled={!key.trim()}>
                  Save
                </Button>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">Stored in the macOS keychain. Never written to project files.</p>
          </div>

          <div className="grid gap-2">
            <Label>Updates</Label>
            <div className="flex items-center justify-between rounded-md border bg-[var(--surface-2)] px-3 py-2 text-xs">
              <span className="text-muted-foreground">Checked automatically on launch</span>
              <Button variant="secondary" size="xs" onClick={checkUpdates} disabled={checking}>
                {checking && <Loader2 className="animate-spin" />} Check now
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
