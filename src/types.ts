export type AssetKind = "video" | "image" | "audio";

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  path: string;
  /** frames at project fps; 0 for images */
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  thumb?: string;
  peaks?: number[];
  voice?: { text: string; voiceId: string; modelId: string };
}

export type TrackKind = "video" | "audio" | "background";

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  locked: boolean;
  volume: number;
}

/** All times are integer frames at project fps. */
export interface Clip {
  id: string;
  assetId: string;
  trackId: string;
  start: number;
  inPoint: number;
  duration: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  muted: boolean;
  x: number;
  y: number;
  scale: number;
  opacity: number;
  /** style, in project px */
  radius: number;
  border: number;
  borderColor: string;
  shadow: number;
  shadowOpacity: number;
}

export const CLIP_STYLE_DEFAULTS = { radius: 0, border: 0, borderColor: "#ffffff", shadow: 0, shadowOpacity: 0.6 };

export interface VoiceSettings {
  voiceId: string;
  modelId: string;
  stability: number;
  similarity: number;
  style: number;
  speakerBoost: boolean;
}

export interface Project {
  version: 1;
  name: string;
  dir: string;
  width: number;
  height: number;
  fps: number;
  assets: Record<string, Asset>;
  tracks: Track[];
  clips: Record<string, Clip>;
  ducking: { enabled: boolean; ratio: number };
  voice: VoiceSettings & { script: string };
}

export interface MediaInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  has_video: boolean;
  has_audio: boolean;
}

export interface Voice {
  voice_id: string;
  name: string;
  category?: string;
  preview_url?: string;
  labels: Record<string, string>;
}
