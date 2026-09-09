import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Send, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "@/lib/tauri";
import { addText, generateAudio, placeAsset, trackEnd, trackFor } from "@/lib/generate";
import { id, useStore } from "@/store";
import type { Beat, BeatKind } from "@/types";

const SYSTEM = `You are the script writer inside DragonEditor, a video editor with AI narration (ElevenLabs), generated sound effects and music.
When asked for a script, write it as short BEATS, one per line, each prefixed with a tag:
[MUSIC] one line at the top describing instrumental background music
[VOICE] one or two spoken sentences of narration — sent to text-to-speech verbatim, so no stage directions
[SFX] a short sound-effect description, e.g. "soft whoosh transition"
[TEXT] short on-screen text
Rules: VOICE beats under 25 words; ~150 words of narration per minute of requested length; alternate VOICE with occasional SFX/TEXT; no headings, markdown, numbering or commentary — only tagged lines. If the user is just chatting, answer normally without tags.`;

const KINDS: Record<BeatKind, { label: string; color: string }> = {
  voice: { label: "Voice", color: "text-emerald-300" },
  sfx: { label: "SFX", color: "text-teal-300" },
  music: { label: "Music", color: "text-primary" },
  text: { label: "Text", color: "text-violet-300" },
  note: { label: "Note", color: "text-muted-foreground" },
};

export function parseBeats(text: string): Beat[] {
  const beats: Beat[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*\[?(VOICE|SFX|MUSIC|TEXT|NOTE)\]?\s*[:\-–]?\s*(.+?)\s*$/i);
    if (m) beats.push({ id: id(), kind: m[1].toLowerCase() as BeatKind, text: m[2].replace(/^["“]|["”]$/g, "") });
  }
  return beats;
}

export default function ScriptDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const project = useStore((s) => s.project)!;
  const update = useStore((s) => s.update);
  const script = project.script;
  const [providers, setProviders] = useState<string[] | null>(null);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [busyBeat, setBusyBeat] = useState<string | null>(null);
  const chatEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.aiProviders().then((p) => {
      setProviders(p);
      if (p.length && !p.includes(script.provider))
        update((pr) => {
          pr.script.provider = p[0];
        });
    });
  }, []);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [script.chat.length, thinking]);

  const send = async (text: string) => {
    const msg = text.trim();
    if (!msg || thinking) return;
    if (!providers?.length) return toast.error("Install Claude Code (claude) or Codex (codex) to use the script writer");
    setInput("");
    update((p) => {
      p.script.chat.push({ role: "user", text: msg });
    });
    setThinking(true);
    try {
      const chat = useStore.getState().project!.script.chat;
      const transcript = chat.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`).join("\n\n");
      const reply = await api.aiChat(script.provider, `${SYSTEM}\n\n${transcript}\n\nAssistant:`, project.dir);
      update((p) => {
        p.script.chat.push({ role: "assistant", text: reply });
      });
    } catch (e) {
      toast.error(String(e), { duration: 10000 });
    } finally {
      setThinking(false);
    }
  };

  const setBeats = (beats: Beat[], append = false) =>
    update((p) => {
      p.script.beats = append ? [...p.script.beats, ...beats] : beats;
    });

  const editBeat = (bid: string, patch: Partial<Beat>) =>
    update((p) => {
      const b = p.script.beats.find((b) => b.id === bid);
      if (b) Object.assign(b, patch);
    });

  const moveBeat = (i: number, d: -1 | 1) =>
    update((p) => {
      const j = i + d;
      if (j < 0 || j >= p.script.beats.length) return;
      [p.script.beats[i], p.script.beats[j]] = [p.script.beats[j], p.script.beats[i]];
    });

  /** Generates a beat and drops it on the timeline. Voice goes after the last narration; others at `at`. */
  const realize = async (b: Beat, at?: number) => {
    const s = useStore.getState();
    const pos = at ?? s.playhead;
    if (b.kind === "note") return;
    if (b.kind === "text") {
      addText(b.text, pos);
      return;
    }
    let assetId = b.assetId && s.project!.assets[b.assetId] ? b.assetId : undefined;
    if (!assetId) {
      const asset = await generateAudio(b.kind, b.text, b.kind === "music" ? { seconds: 60 } : {});
      assetId = asset.id;
      editBeat(b.id, { assetId });
    }
    placeAsset(assetId, b.kind, b.kind === "voice" ? trackEnd(trackFor("voice")) : b.kind === "music" ? 0 : pos);
  };

  const realizeOne = async (b: Beat) => {
    setBusyBeat(b.id);
    try {
      await realize(b);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusyBeat(null);
    }
  };

  /** Lays the whole script out: narration end-to-end, SFX/text aligned to where the next narration starts. */
  const realizeAll = async () => {
    const beats = useStore.getState().project!.script.beats;
    const t = toast.loading("Generating script…");
    try {
      for (const b of beats) {
        setBusyBeat(b.id);
        await realize(b, trackEnd(trackFor("voice")));
      }
      toast.success("Script is on the timeline");
    } catch (e) {
      toast.error(String(e));
    } finally {
      toast.dismiss(t);
      setBusyBeat(null);
    }
  };

  const lastReplyBeats = (() => {
    const last = [...script.chat].reverse().find((m) => m.role === "assistant");
    return last ? parseBeats(last.text) : [];
  })();

  return (
    <div
      className={cn(
        "fixed top-11 right-0 bottom-0 z-40 flex w-1/2 flex-col border-l bg-[var(--surface-1)] shadow-[-20px_0_60px_rgba(0,0,0,0.5)] transition-transform duration-200",
        open ? "translate-x-0" : "translate-x-full",
      )}
    >
      <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <TabsList>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="script">Script{script.beats.length ? ` · ${script.beats.length}` : ""}</TabsTrigger>
          </TabsList>
          <div className="flex-1" />
          {providers && providers.length > 0 && (
            <Select value={script.provider} onValueChange={(v) => v && update((p) => void (p.script.provider = v))}>
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p === "claude" ? "Claude Code" : "Codex"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X />
          </Button>
        </div>

        <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {script.chat.length === 0 && (
              <div className="grid gap-3 py-8 text-center">
                <Sparkles className="mx-auto size-6 text-primary" />
                <p className="text-sm">Tell me what the video is about and how long it should be.</p>
                <p className="text-xs text-muted-foreground">
                  {providers === null ? "Looking for Claude Code / Codex…" : providers.length ? `Using ${script.provider === "claude" ? "Claude Code" : "Codex"} on this Mac — no extra API key.` : "Install Claude Code or Codex CLI to enable the writer."}
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {["Write a 60-second explainer script about ", "Write a punchy 30-second product promo for ", "Write a 2-minute tutorial intro about "].map((q) => (
                    <button key={q} className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground" onClick={() => setInput(q)}>
                      {q.replace("Write a ", "").replace(" about ", "").replace(" for ", "")}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {script.chat.map((m, i) => (
              <div key={i} className={cn("mb-3 max-w-[92%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap", m.role === "user" ? "ml-auto bg-primary/15" : "bg-[var(--surface-3)]")}>
                {m.role === "assistant" ? <BeatText text={m.text} /> : m.text}
              </div>
            ))}
            {thinking && (
              <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" /> Writing…
              </div>
            )}
            <div ref={chatEnd} />
          </div>
          {lastReplyBeats.length > 0 && !thinking && (
            <div className="flex items-center gap-2 border-t bg-[var(--surface-2)] px-4 py-2 text-xs">
              <span className="text-muted-foreground">{lastReplyBeats.length} beats in the last reply</span>
              <div className="flex-1" />
              <Button size="xs" variant="secondary" onClick={() => setBeats(lastReplyBeats, true)}>
                Append to script
              </Button>
              <Button size="xs" onClick={() => setBeats(lastReplyBeats)}>
                Use as script
              </Button>
            </div>
          )}
          <div className="flex items-end gap-2 border-t p-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(input);
              }}
              placeholder="Describe the video… (⌘↩ to send)"
              className="min-h-10 flex-1 resize-none text-sm"
              rows={2}
            />
            <Button size="icon" onClick={() => send(input)} disabled={thinking || !input.trim()}>
              {thinking ? <Loader2 className="animate-spin" /> : <Send />}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="script" className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {script.beats.length === 0 && <p className="py-10 text-center text-xs text-muted-foreground">No beats yet — ask for a script in Chat, or add beats by hand.</p>}
            {script.beats.map((b, i) => (
              <div key={b.id} className="group mb-2 grid grid-cols-[92px_1fr_auto] items-start gap-2 rounded-md border bg-[var(--surface-2)] p-2">
                <Select value={b.kind} onValueChange={(v) => v && editBeat(b.id, { kind: v as BeatKind, assetId: undefined })}>
                  <SelectTrigger className={cn("h-7 text-xs font-medium", KINDS[b.kind].color)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(KINDS) as BeatKind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {KINDS[k].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  value={b.text}
                  onChange={(e) => editBeat(b.id, { text: e.target.value, assetId: undefined })}
                  className="min-h-8 resize-none border-0 bg-transparent px-1 py-1 text-sm shadow-none focus-visible:ring-0"
                  rows={Math.max(1, Math.ceil(b.text.length / 70))}
                />
                <div className="flex items-center gap-0.5">
                  {b.kind !== "note" && (
                    <Button size="xs" variant={b.assetId ? "secondary" : "default"} onClick={() => realizeOne(b)} disabled={busyBeat !== null} title={b.assetId ? "Add to timeline again" : "Generate and add to timeline"}>
                      {busyBeat === b.id ? <Loader2 className="animate-spin" /> : b.assetId ? <Check /> : <Sparkles />}
                      {b.assetId ? "Add" : "Generate"}
                    </Button>
                  )}
                  <div className="flex opacity-0 group-hover:opacity-100">
                    <Button variant="ghost" size="icon-xs" onClick={() => moveBeat(i, -1)}>
                      <ArrowUp />
                    </Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => moveBeat(i, 1)}>
                      <ArrowDown />
                    </Button>
                    <Button variant="ghost" size="icon-xs" onClick={() => setBeats(script.beats.filter((x) => x.id !== b.id))}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            <Button variant="ghost" size="xs" onClick={() => setBeats([{ id: id(), kind: "voice", text: "" }], true)}>
              <Plus /> Beat
            </Button>
          </div>
          <div className="flex items-center gap-2 border-t p-3">
            <p className="flex-1 text-[11px] text-muted-foreground">Narration is laid end-to-end on the Voice track; SFX and text land where the next line starts; music at 0.</p>
            <Button onClick={realizeAll} disabled={busyBeat !== null || !script.beats.length}>
              <Sparkles /> Generate all & build timeline
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function BeatText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const m = line.match(/^\s*\[?(VOICE|SFX|MUSIC|TEXT|NOTE)\]?\s*[:\-–]?\s*(.*)$/i);
        if (!m) return <div key={i}>{line}</div>;
        const k = m[1].toLowerCase() as BeatKind;
        return (
          <div key={i} className="grid grid-cols-[52px_1fr] gap-2">
            <span className={cn("mono text-[10px] font-semibold uppercase", KINDS[k].color)}>{KINDS[k].label}</span>
            <span>{m[2]}</span>
          </div>
        );
      })}
    </>
  );
}
