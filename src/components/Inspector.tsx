import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { seconds, timecode } from "@/lib/format";
import { useStore } from "@/store";
import type { Clip } from "@/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { predecessor } from "@/lib/fx";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { FONTS, TEMPLATES, updateText } from "@/lib/text";
import type { Anim, TextStyle } from "@/types";
import { cn } from "@/lib/utils";

const ANIMS: [Anim, string][] = [
  ["none", "None"],
  ["fade", "Fade"],
  ["pop", "Pop"],
  ["slide-up", "Slide up"],
  ["slide-down", "Slide down"],
  ["slide-left", "Slide left"],
  ["slide-right", "Slide right"],
];

export default function Inspector() {
  const project = useStore((s) => s.project)!;
  const selection = useStore((s) => s.selection);
  const update = useStore((s) => s.update);
  const clip = selection.length === 1 ? project.clips[selection[0]] : undefined;

  if (!clip) {
    return (
      <div className="grid gap-5 p-4">
        <Section title="Project">
          <Row label="Name">
            <Input
              value={project.name}
              onChange={(e) =>
                update((p) => {
                  p.name = e.target.value;
                })
              }
              className="h-7 text-xs"
            />
          </Row>
          <Row label="Format">
            <span className="mono text-xs text-muted-foreground">
              {project.width}×{project.height} @ {project.fps}fps
            </span>
          </Row>
        </Section>
        <Section title="Background audio">
          <Row label="Auto-duck under voice">
            <Switch
              checked={project.ducking.enabled}
              onCheckedChange={(c) =>
                update((p) => {
                  p.ducking.enabled = c;
                })
              }
            />
          </Row>
          <SliderRow
            label="Duck amount"
            value={project.ducking.ratio}
            min={2}
            max={20}
            step={1}
            fmt={(v) => `${v}:1`}
            onChange={(v) =>
              update((p) => {
                p.ducking.ratio = v;
              })
            }
          />
          {project.tracks
            .filter((t) => t.kind === "background")
            .map((t) => (
              <SliderRow
                key={t.id}
                label={`${t.name} volume`}
                value={t.volume}
                min={0}
                max={1}
                step={0.01}
                fmt={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) =>
                  update((p) => {
                    p.tracks.find((x) => x.id === t.id)!.volume = v;
                  })
                }
              />
            ))}
        </Section>
        {selection.length > 1 && <p className="text-xs text-muted-foreground">{selection.length} clips selected</p>}
      </div>
    );
  }

  const asset = project.assets[clip.assetId];
  const track = project.tracks.find((t) => t.id === clip.trackId)!;
  const set = <K extends keyof Clip>(k: K, v: Clip[K]) =>
    update((p) => {
      p.clips[clip.id][k] = v;
    });
  const fps = project.fps;
  const isVideoTrack = track.kind === "video";
  const hasAudio = asset.kind === "audio" || asset.hasAudio;

  return (
    <div className="grid gap-5 p-4">
      <Section title="Clip">
        <div className="truncate text-sm">{asset.voice ? asset.voice.text : asset.name}</div>
        <div className="mono grid grid-cols-2 gap-x-3 text-[11px] text-muted-foreground">
          <span>In</span>
          <span className="text-right">{timecode(clip.start, fps)}</span>
          <span>Out</span>
          <span className="text-right">{timecode(clip.start + clip.duration, fps)}</span>
          <span>Duration</span>
          <span className="text-right">{seconds(clip.duration, fps)}</span>
        </div>
      </Section>

      {isVideoTrack && (
        <Section title="Transform">
          <SliderRow label="Scale" value={clip.scale} min={0.1} max={3} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("scale", v)} />
          <SliderRow label="X" value={clip.x} min={-project.width} max={project.width} step={1} fmt={(v) => `${v}px`} onChange={(v) => set("x", v)} />
          <SliderRow label="Y" value={clip.y} min={-project.height} max={project.height} step={1} fmt={(v) => `${v}px`} onChange={(v) => set("y", v)} />
          <SliderRow label="Opacity" value={clip.opacity} min={0} max={1} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("opacity", v)} />
        </Section>
      )}

      {asset.text && <TextSection assetId={asset.id} s={asset.text} />}

      {isVideoTrack && (
        <Section title="Animation">
          <Row label="In">
            <AnimSelect value={clip.animIn} onChange={(v) => set("animIn", v)} />
          </Row>
          <Row label="Out">
            <AnimSelect value={clip.animOut} onChange={(v) => set("animOut", v)} />
          </Row>
          {(clip.animIn !== "none" || clip.animOut !== "none") && (
            <SliderRow label="Duration" value={clip.animFrames / fps} min={0.1} max={Math.min(3, clip.duration / fps / 2)} step={0.05} fmt={(v) => `${v.toFixed(2)}s`} onChange={(v) => set("animFrames", Math.round(v * fps))} />
          )}
        </Section>
      )}

      {isVideoTrack && (
        <Section title="Fades & transition">
          <SliderRow label="Fade in" value={clip.fadeIn / fps} min={0} max={Math.min(10, clip.duration / fps)} step={0.1} fmt={(v) => `${v.toFixed(1)}s`} onChange={(v) => set("fadeIn", Math.round(v * fps))} />
          <SliderRow label="Fade out" value={clip.fadeOut / fps} min={0} max={Math.min(10, clip.duration / fps)} step={0.1} fmt={(v) => `${v.toFixed(1)}s`} onChange={(v) => set("fadeOut", Math.round(v * fps))} />
          <Row label="Transition in">
            <Select value={clip.transition} onValueChange={(v) => v && set("transition", v as Clip["transition"])}>
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="dissolve">Cross dissolve</SelectItem>
                <SelectItem value="fade">Fade through black</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          {clip.transition !== "none" && (
            <>
              <SliderRow label="Duration" value={clip.transitionFrames / fps} min={0.1} max={Math.min(5, clip.duration / fps)} step={0.1} fmt={(v) => `${v.toFixed(1)}s`} onChange={(v) => set("transitionFrames", Math.round(v * fps))} />
              {!predecessor(project, clip) && <p className="text-[11px] text-muted-foreground">No clip ends where this one starts — it will {clip.transition === "dissolve" ? "dissolve" : "fade"} in from black.</p>}
            </>
          )}
        </Section>
      )}

      {isVideoTrack && (
        <Section title="Style">
          <SliderRow label="Corner radius" value={clip.radius} min={0} max={300} step={1} fmt={(v) => `${v}px`} onChange={(v) => set("radius", v)} />
          <SliderRow label="Border" value={clip.border} min={0} max={60} step={1} fmt={(v) => `${v}px`} onChange={(v) => set("border", v)} />
          {clip.border > 0 && (
            <Row label="Border color">
              <input type="color" value={clip.borderColor} onChange={(e) => set("borderColor", e.target.value)} className="h-6 w-10 cursor-pointer rounded border bg-transparent" />
            </Row>
          )}
          <SliderRow label="Shadow" value={clip.shadow} min={0} max={200} step={1} fmt={(v) => (v ? `${v}px` : "off")} onChange={(v) => set("shadow", v)} />
          {clip.shadow > 0 && (
            <SliderRow label="Shadow opacity" value={clip.shadowOpacity} min={0} max={1} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("shadowOpacity", v)} />
          )}
        </Section>
      )}

      {hasAudio && (
        <Section title="Audio">
          <Row label="Mute">
            <Switch checked={clip.muted} onCheckedChange={(c) => set("muted", c)} />
          </Row>
          <SliderRow label="Volume" value={clip.volume} min={0} max={2} step={0.01} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set("volume", v)} />
          {!isVideoTrack && (
            <>
              <SliderRow label="Fade in" value={clip.fadeIn / fps} min={0} max={Math.min(10, clip.duration / fps)} step={0.1} fmt={(v) => `${v.toFixed(1)}s`} onChange={(v) => set("fadeIn", Math.round(v * fps))} />
              <SliderRow label="Fade out" value={clip.fadeOut / fps} min={0} max={Math.min(10, clip.duration / fps)} step={0.1} fmt={(v) => `${v.toFixed(1)}s`} onChange={(v) => set("fadeOut", Math.round(v * fps))} />
            </>
          )}
        </Section>
      )}

      {asset.voice && (
        <Section title="Voice">
          <p className="text-xs leading-relaxed text-muted-foreground">{asset.voice.text}</p>
          <div className="mono text-[10px] text-muted-foreground">
            {asset.voice.modelId} · {asset.voice.voiceId}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3">
      <div className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  fmt,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="mono text-[11px] text-muted-foreground">{fmt(value)}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : (v as number))} />
    </div>
  );
}

function AnimSelect({ value, onChange }: { value: Anim; onChange: (v: Anim) => void }) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as Anim)}>
      <SelectTrigger className="h-7 w-36 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ANIMS.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TextSection({ assetId, s }: { assetId: string; s: TextStyle }) {
  const set = (patch: Partial<TextStyle>) => updateText(assetId, patch);
  const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c);
  return (
    <>
      <Section title="Text">
        <Textarea value={s.text} onChange={(e) => set({ text: e.target.value })} className="min-h-20 text-sm" />
        <div className="grid grid-cols-3 gap-1.5">
          {TEMPLATES.map((t) => (
            <Button key={t.name} variant="secondary" size="xs" className="h-7 justify-start truncate px-2" onClick={() => set(t.style)}>
              {t.name}
            </Button>
          ))}
        </div>
      </Section>
      <Section title="Font">
        <Select value={s.font} onValueChange={(v) => v && set({ font: v })}>
          <SelectTrigger className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONTS.map((f) => (
              <SelectItem key={f} value={f} style={{ fontFamily: f }}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
          <Select value={String(s.weight)} onValueChange={(v) => v && set({ weight: Number(v) })}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[300, 400, 500, 600, 700, 800, 900].map((w) => (
                <SelectItem key={w} value={String(w)}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded-md border">
            {(["left", "center", "right"] as const).map((a) => {
              const I = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
              return (
                <button key={a} className={cn("p-1.5 hover:bg-accent", s.align === a && "bg-accent text-primary")} onClick={() => set({ align: a })}>
                  <I className="size-3.5" />
                </button>
              );
            })}
          </div>
          <input type="color" value={isHex(s.color) ? s.color : "#ffffff"} onChange={(e) => set({ color: e.target.value })} className="h-7 w-9 cursor-pointer rounded border bg-transparent" title="Text color" />
        </div>
        <SliderRow label="Size" value={s.size} min={12} max={400} step={1} fmt={(v) => `${v}px`} onChange={(v) => set({ size: v })} />
        <SliderRow label="Line height" value={s.lineHeight} min={0.8} max={2} step={0.05} fmt={(v) => v.toFixed(2)} onChange={(v) => set({ lineHeight: v })} />
      </Section>
      <Section title="Background & effects">
        <Row label="Background">
          <div className="flex items-center gap-2">
            <input type="color" value={isHex(s.bg) ? s.bg : "#000000"} onChange={(e) => set({ bg: e.target.value })} className="h-6 w-9 cursor-pointer rounded border bg-transparent" />
            <Switch checked={!!s.bg} onCheckedChange={(c) => set({ bg: c ? "#000000" : "" })} />
          </div>
        </Row>
        {s.bg && (
          <>
            <SliderRow label="Padding" value={s.bgPad} min={0} max={120} step={1} fmt={(v) => `${v}px`} onChange={(v) => set({ bgPad: v })} />
            <SliderRow label="Radius" value={s.bgRadius} min={0} max={100} step={1} fmt={(v) => `${v}px`} onChange={(v) => set({ bgRadius: v })} />
          </>
        )}
        <SliderRow label="Outline" value={s.stroke} min={0} max={30} step={1} fmt={(v) => `${v}px`} onChange={(v) => set({ stroke: v })} />
        {s.stroke > 0 && (
          <Row label="Outline color">
            <input type="color" value={s.strokeColor} onChange={(e) => set({ strokeColor: e.target.value })} className="h-6 w-9 cursor-pointer rounded border bg-transparent" />
          </Row>
        )}
        <SliderRow label="Shadow" value={s.shadow} min={0} max={100} step={1} fmt={(v) => (v ? `${v}px` : "off")} onChange={(v) => set({ shadow: v })} />
      </Section>
    </>
  );
}
