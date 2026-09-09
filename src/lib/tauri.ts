import { invoke } from "@tauri-apps/api/core";
import type { MediaInfo, Voice } from "@/types";

export const api = {
  closeSplash: () => invoke<void>("close_splash"),
  setApiKey: (key: string) => invoke<void>("set_api_key", { key }),
  hasApiKey: () => invoke<boolean>("has_api_key"),
  clearApiKey: () => invoke<void>("clear_api_key"),
  voices: () => invoke<Voice[]>("eleven_voices"),
  /** POST to an ElevenLabs audio endpoint, save mp3, return duration in seconds */
  audio: (path: string, body: Record<string, unknown>, outPath: string) => invoke<number>("eleven_audio", { path, body, outPath }),
  aiProviders: () => invoke<string[]>("ai_providers"),
  aiChat: (provider: string, prompt: string, cwd: string) => invoke<string>("ai_chat", { provider, prompt, cwd }),
  probe: (path: string) => invoke<MediaInfo>("probe", { path }),
  thumbnail: (path: string, out: string, time: number) => invoke<void>("thumbnail", { path, out, time }),
  peaks: (path: string, count: number) => invoke<number[]>("peaks", { path, count }),
  exportStart: (args: string[]) => invoke<void>("export_start", { args }),
  exportCancel: () => invoke<void>("export_cancel"),
};
