import { invoke } from "@tauri-apps/api/core";
import type { MediaInfo, Voice } from "@/types";

export interface GenerateReq {
  voice_id: string;
  text: string;
  model_id: string;
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  out_path: string;
}

export const api = {
  closeSplash: () => invoke<void>("close_splash"),
  setApiKey: (key: string) => invoke<void>("set_api_key", { key }),
  hasApiKey: () => invoke<boolean>("has_api_key"),
  clearApiKey: () => invoke<void>("clear_api_key"),
  voices: () => invoke<Voice[]>("eleven_voices"),
  /** returns duration in seconds */
  generate: (req: GenerateReq) => invoke<number>("eleven_generate", { req }),
  probe: (path: string) => invoke<MediaInfo>("probe", { path }),
  thumbnail: (path: string, out: string, time: number) => invoke<void>("thumbnail", { path, out, time }),
  peaks: (path: string, count: number) => invoke<number[]>("peaks", { path, count }),
  exportStart: (args: string[]) => invoke<void>("export_start", { args }),
  exportCancel: () => invoke<void>("export_cancel"),
};
