import { useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { api } from "@/lib/tauri";
import { useStore } from "@/store";
import Start from "@/screens/Start";
import Editor from "@/screens/Editor";

const SPLASH_MIN_MS = 1400;
const started = performance.now();

export default function App() {
  const hasProject = useStore((s) => s.project !== null);

  useEffect(() => {
    const wait = Math.max(0, SPLASH_MIN_MS - (performance.now() - started));
    const t = setTimeout(() => void api.closeSplash(), wait);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) return;
    check()
      .then((u) => {
        if (!u) return;
        toast(`DragonEditor ${u.version} is available`, {
          duration: 15000,
          action: {
            label: "Update",
            onClick: () => {
              toast.promise(u.downloadAndInstall().then(() => relaunch()), {
                loading: "Downloading update…",
                success: "Restarting…",
                error: (e) => `Update failed: ${e}`,
              });
            },
          },
        });
      })
      .catch(() => {});
  }, []);

  return (
    <>
      {hasProject ? <Editor /> : <Start />}
      <Toaster position="bottom-right" theme="dark" richColors />
    </>
  );
}
