import { api } from "./tauri";
import { describe } from "./project";
import { addText } from "./text";
import { addClip, addTrack, id, trackClips, useStore } from "@/store";
import type { Asset } from "@/types";

type Kind = "voice" | "sfx" | "music";

/** Generates audio with ElevenLabs into the project's voice/ folder and registers the asset. */
export async function generateAudio(kind: Kind, text: string, opts: { seconds?: number; instrumental?: boolean } = {}): Promise<Asset> {
  const p = useStore.getState().project!;
  const aid = id();
  const out = `${p.dir}/voice/${kind}-${aid}.mp3`;
  const v = p.voice;
  if (kind === "voice") {
    if (!v.voiceId.trim()) throw new Error("Pick a voice in the Voice tab first");
    await api.audio(
      `text-to-speech/${v.voiceId.trim()}`,
      { text, model_id: v.modelId, voice_settings: { stability: v.stability, similarity_boost: v.similarity, style: v.style, use_speaker_boost: v.speakerBoost } },
      out,
    );
  } else if (kind === "music") {
    await api.audio("music", { prompt: text, music_length_ms: (opts.seconds ?? 60) * 1000, model_id: "music_v2", force_instrumental: opts.instrumental ?? true }, out);
  } else {
    await api.audio("sound-generation", { text, ...(opts.seconds ? { duration_seconds: opts.seconds } : {}) }, out);
  }
  const asset = await describe(p, aid, "audio", text.slice(0, 60), out);
  if (kind === "voice") asset.voice = { text, voiceId: v.voiceId, modelId: v.modelId };
  else asset.gen = { kind, prompt: text };
  useStore.getState().update((p) => {
    p.assets[asset.id] = asset;
  });
  return asset;
}

/** The track a generated kind belongs on (created if missing). */
export function trackFor(kind: Kind) {
  const tracks = useStore.getState().project!.tracks;
  const t =
    kind === "music"
      ? tracks.find((t) => t.kind === "background")
      : tracks.find((t) => t.kind === "audio" && t.name === (kind === "voice" ? "Voice" : "SFX")) ?? (kind === "voice" ? tracks.find((t) => t.kind === "audio") : undefined);
  return t?.id ?? addTrack(kind === "music" ? "background" : "audio", kind === "voice" ? "Voice" : kind === "sfx" ? "SFX" : "Music");
}

/** Frame after the last clip on a track (for laying narration end-to-end). */
export function trackEnd(trackId: string) {
  const p = useStore.getState().project!;
  return trackClips(p, trackId).reduce((m, c) => Math.max(m, c.start + c.duration), 0);
}

export function placeAsset(assetId: string, kind: Kind, at: number) {
  return addClip(assetId, trackFor(kind), at);
}

export { addText };
