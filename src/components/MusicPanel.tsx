import { useState } from "react";
import { Loader2, Music, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/tauri";
import { describe } from "@/lib/project";
import { addClip, addTrack, id, projectEnd, useStore } from "@/store";
import { AssetCard } from "./MediaPanel";
import { openSettings } from "./SettingsDialog";

const num = (v: number | readonly number[]) => (Array.isArray(v) ? v[0] : (v as number));

export default function MusicPanel() {
  const project = useStore((s) => s.project)!;
  const update = useStore((s) => s.update);
  const end = projectEnd(project);
  const [musicPrompt, setMusicPrompt] = useState("");
  const [seconds, setSeconds] = useState(Math.min(300, Math.max(10, Math.ceil(end / project.fps) || 60)));
  const [instrumental, setInstrumental] = useState(true);
  const [sfxPrompt, setSfxPrompt] = useState("");
  const [sfxSeconds, setSfxSeconds] = useState(0);
  const [busy, setBusy] = useState<"music" | "sfx" | null>(null);
  const generated = Object.values(project.assets).filter((a) => a.gen).reverse();

  const generate = async (kind: "music" | "sfx") => {
    const prompt = (kind === "music" ? musicPrompt : sfxPrompt).trim();
    if (!prompt) return toast.error("Describe what you want first");
    setBusy(kind);
    try {
      const aid = id();
      const out = `${project.dir}/voice/${kind}-${aid}.mp3`;
      if (kind === "music") await api.audio("music", { prompt, music_length_ms: seconds * 1000, model_id: "music_v2", force_instrumental: instrumental }, out);
      else await api.audio("sound-generation", { text: prompt, ...(sfxSeconds > 0 ? { duration_seconds: sfxSeconds } : {}) }, out);
      const asset = await describe(project, aid, "audio", prompt.slice(0, 60), out);
      asset.gen = { kind, prompt };
      update((p) => {
        p.assets[asset.id] = asset;
      });
      const s = useStore.getState();
      const tracks = s.project!.tracks;
      const track = kind === "music" ? tracks.find((t) => t.kind === "background") : tracks.find((t) => t.kind === "audio" && t.name === "SFX");
      const tid = track?.id ?? addTrack(kind === "music" ? "background" : "audio", kind === "music" ? "Music" : "SFX");
      addClip(asset.id, tid, s.playhead);
      toast.success(kind === "music" ? "Music added to the Music track" : "Sound effect added at the playhead");
    } catch (e) {
      toast.error(String(e), { action: { label: "Settings", onClick: openSettings } });
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="grid gap-5 px-3 pb-4">
        <div className="grid gap-3">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Music className="size-3.5 text-primary" /> Background music
          </div>
          <Textarea
            value={musicPrompt}
            onChange={(e) => setMusicPrompt(e.target.value)}
            placeholder="Warm lo-fi hip hop, soft piano, vinyl crackle, relaxed 80 bpm, no vocals…"
            className="min-h-20 text-sm"
          />
          <div className="grid gap-1.5">
            <div className="flex justify-between">
              <Label>Length</Label>
              <span className="mono text-[11px] text-muted-foreground">
                {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
                {end > 0 && ` · timeline ${Math.ceil(end / project.fps)}s`}
              </span>
            </div>
            <Slider value={[seconds]} min={10} max={300} step={5} onValueChange={(v) => setSeconds(num(v))} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Instrumental only</Label>
            <Switch checked={instrumental} onCheckedChange={setInstrumental} />
          </div>
          <Button onClick={() => generate("music")} disabled={busy !== null}>
            {busy === "music" ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy === "music" ? "Composing…" : "Generate music"}
          </Button>
          <p className="text-[11px] text-muted-foreground">Lands on the Music track at the playhead and auto-ducks under voice. ElevenLabs Music — uses your plan's credits.</p>
        </div>

        <div className="grid gap-3 border-t pt-4">
          <div className="flex items-center gap-2 text-xs font-medium">
            <Zap className="size-3.5 text-primary" /> Sound effect
          </div>
          <Textarea value={sfxPrompt} onChange={(e) => setSfxPrompt(e.target.value)} placeholder="Cinematic whoosh transition, short riser, deep impact…" className="min-h-14 text-sm" />
          <div className="grid gap-1.5">
            <div className="flex justify-between">
              <Label>Duration</Label>
              <span className="mono text-[11px] text-muted-foreground">{sfxSeconds ? `${sfxSeconds.toFixed(1)}s` : "auto"}</span>
            </div>
            <Slider value={[sfxSeconds]} min={0} max={30} step={0.5} onValueChange={(v) => setSfxSeconds(num(v))} />
          </div>
          <Button variant="secondary" onClick={() => generate("sfx")} disabled={busy !== null}>
            {busy === "sfx" ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy === "sfx" ? "Generating…" : "Generate sound effect"}
          </Button>
        </div>

        {generated.length > 0 && (
          <div className="grid gap-2 border-t pt-3">
            <Label className="text-muted-foreground">Generated</Label>
            <div className="grid grid-cols-2 gap-2">
              {generated.map((a) => (
                <AssetCard key={a.id} asset={a} fps={project.fps} />
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
