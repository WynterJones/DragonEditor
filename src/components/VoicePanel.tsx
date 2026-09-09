import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/tauri";
import { generateAudio, placeAsset } from "@/lib/generate";
import { useStore } from "@/store";
import type { Voice } from "@/types";
import { AssetCard } from "./MediaPanel";
import { openSettings } from "./SettingsDialog";

const MODELS = [
  ["eleven_multilingual_v2", "Multilingual v2 — best quality"],
  ["eleven_v3", "Eleven v3 — most expressive"],
  ["eleven_turbo_v2_5", "Turbo v2.5 — fast"],
  ["eleven_flash_v2_5", "Flash v2.5 — fastest"],
];

export default function VoicePanel() {
  const project = useStore((s) => s.project)!;
  const update = useStore((s) => s.update);
  const v = project.voice;
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [generating, setGenerating] = useState(false);
  const voiceAssets = Object.values(project.assets).filter((a) => a.voice).reverse();

  const setV = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) =>
    update((p) => {
      p.voice[k] = val;
    });

  const loadVoices = async () => {
    setLoadingVoices(true);
    try {
      setVoices(await api.voices());
    } catch (e) {
      toast.error(String(e), { action: { label: "Settings", onClick: openSettings } });
    } finally {
      setLoadingVoices(false);
    }
  };

  useEffect(() => {
    api.hasApiKey().then((ok) => {
      if (ok) loadVoices();
    });
  }, []);

  const generate = async () => {
    const text = v.script.trim();
    if (!text) return toast.error("Write something first");
    if (!v.voiceId.trim()) return toast.error("Enter a voice ID or pick a voice");
    setGenerating(true);
    try {
      const asset = await generateAudio("voice", text);
      placeAsset(asset.id, "voice", useStore.getState().playhead);
      toast.success("Voice added to timeline");
    } catch (e) {
      toast.error(String(e), { action: { label: "Settings", onClick: openSettings } });
    } finally {
      setGenerating(false);
    }
  };

  const pct = (n: number) => Math.round(n * 100);

  return (
    <ScrollArea className="h-full">
      <div className="grid gap-4 px-3 pb-4">
        <div className="grid gap-2">
          <Label>Script</Label>
          <Textarea
            value={v.script}
            onChange={(e) => setV("script", e.target.value)}
            placeholder="Write what the voice should say…"
            className="min-h-32 resize-y text-sm leading-relaxed"
          />
          <div className="text-right text-[10px] text-muted-foreground mono">{v.script.length} chars</div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>Voice</Label>
            <Button variant="ghost" size="xs" onClick={loadVoices} disabled={loadingVoices}>
              {loadingVoices ? <Loader2 className="animate-spin" /> : <RefreshCw />} Load my voices
            </Button>
          </div>
          {voices && voices.length > 0 && (
            <Select value={voices.some((x) => x.voice_id === v.voiceId) ? v.voiceId : null} onValueChange={(val) => val && setV("voiceId", val)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick from your ElevenLabs voices" />
              </SelectTrigger>
              <SelectContent>
                {voices.map((x) => (
                  <SelectItem key={x.voice_id} value={x.voice_id}>
                    {x.name}
                    {x.labels?.accent ? ` · ${x.labels.accent}` : ""}
                    {x.category === "cloned" ? " · cloned" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input value={v.voiceId} onChange={(e) => setV("voiceId", e.target.value)} placeholder="…or paste a voice ID" className="mono text-xs" />
        </div>

        <div className="grid gap-2">
          <Label>Model</Label>
          <Select value={v.modelId} onValueChange={(val) => val && setV("modelId", val)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map(([id, label]) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Param label="Stability" value={pct(v.stability)} onChange={(n) => setV("stability", n / 100)} />
        <Param label="Similarity" value={pct(v.similarity)} onChange={(n) => setV("similarity", n / 100)} />
        <Param label="Style" value={pct(v.style)} onChange={(n) => setV("style", n / 100)} />
        <div className="flex items-center justify-between">
          <Label>Speaker boost</Label>
          <Switch checked={v.speakerBoost} onCheckedChange={(c) => setV("speakerBoost", c)} />
        </div>

        <Button onClick={generate} disabled={generating} className="mt-1">
          {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {generating ? "Generating…" : "Generate & add to timeline"}
        </Button>

        {voiceAssets.length > 0 && (
          <div className="grid gap-2 border-t pt-3">
            <Label className="text-muted-foreground">Generated</Label>
            <div className="grid grid-cols-2 gap-2">
              {voiceAssets.map((a) => (
                <AssetCard key={a.id} asset={a} fps={project.fps} />
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function Param({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between">
        <Label>{label}</Label>
        <span className="mono text-[11px] text-muted-foreground">{value}%</span>
      </div>
      <Slider value={[value]} min={0} max={100} step={1} onValueChange={(n) => onChange(Array.isArray(n) ? n[0] : (n as number))} />
    </div>
  );
}
