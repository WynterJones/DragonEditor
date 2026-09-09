import { copyFile, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { api } from "./tauri";
import { id } from "@/store";
import { CLIP_STYLE_DEFAULTS, type Asset, type AssetKind, type Project } from "@/types";

const RECENT_KEY = "dragon.recent";

export interface Recent {
  name: string;
  dir: string;
  openedAt: number;
}

export function recents(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function pushRecent(p: Project) {
  const list = recents().filter((r) => r.dir !== p.dir);
  list.unshift({ name: p.name, dir: p.dir, openedAt: Date.now() });
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12)));
}

export function forgetRecent(dir: string) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(recents().filter((r) => r.dir !== dir)));
}

export async function createProject(opts: { name: string; parent: string; width: number; height: number; fps: number }) {
  const dir = `${opts.parent}/${opts.name.replace(/[/\\:]/g, "-")}.dragon`;
  for (const sub of ["", "assets", "voice", "cache"]) await mkdir(`${dir}/${sub}`, { recursive: true });
  const p: Project = {
    version: 1,
    name: opts.name,
    dir,
    width: opts.width,
    height: opts.height,
    fps: opts.fps,
    assets: {},
    clips: {},
    tracks: [
      { id: id(), kind: "video", name: "V1", muted: false, locked: false, volume: 1 },
      { id: id(), kind: "audio", name: "Voice", muted: false, locked: false, volume: 1 },
      { id: id(), kind: "background", name: "Music", muted: false, locked: false, volume: 0.4 },
    ],
    ducking: { enabled: true, ratio: 6 },
    voice: {
      script: "",
      voiceId: "",
      modelId: "eleven_multilingual_v2",
      stability: 0.5,
      similarity: 0.75,
      style: 0,
      speakerBoost: true,
    },
  };
  await saveProject(p);
  return p;
}

export async function saveProject(p: Project) {
  const { dir: _dir, ...rest } = p;
  await writeTextFile(`${p.dir}/project.json`, JSON.stringify(rest, null, 2));
}

export async function openProject(dir: string): Promise<Project> {
  const p = JSON.parse(await readTextFile(`${dir}/project.json`)) as Project;
  p.dir = dir;
  for (const id in p.clips) p.clips[id] = { ...CLIP_STYLE_DEFAULTS, ...p.clips[id] };
  return p;
}

const EXT: Record<AssetKind, string[]> = {
  video: ["mp4", "mov", "m4v", "webm", "mkv", "avi"],
  image: ["png", "jpg", "jpeg", "webp", "gif", "bmp"],
  audio: ["mp3", "wav", "aac", "m4a", "flac", "ogg", "aiff", "aif"],
};
export const ALL_EXT = Object.values(EXT).flat();

export function kindOf(path: string): AssetKind | null {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return (Object.keys(EXT) as AssetKind[]).find((k) => EXT[k].includes(ext)) ?? null;
}

/** Copies a file into the project, probes it, and builds thumbnail/peaks. */
export async function importFile(p: Project, src: string): Promise<Asset> {
  const kind = kindOf(src);
  if (!kind) throw new Error(`Unsupported file: ${src}`);
  const name = src.split("/").pop()!;
  const aid = id();
  const dest = `${p.dir}/assets/${aid}-${name}`;
  await copyFile(src, dest);
  return describe(p, aid, kind, name, dest);
}

export async function describe(p: Project, aid: string, kind: AssetKind, name: string, path: string): Promise<Asset> {
  const info = await api.probe(path);
  const asset: Asset = {
    id: aid,
    kind,
    name,
    path,
    duration: Math.round(info.duration * p.fps),
    width: info.width,
    height: info.height,
    hasAudio: info.has_audio,
  };
  if (kind !== "audio") {
    const thumb = `${p.dir}/cache/${aid}.jpg`;
    await api.thumbnail(path, thumb, kind === "video" ? Math.min(1, info.duration / 2) : 0);
    asset.thumb = thumb;
  }
  if (kind === "audio" || info.has_audio) {
    asset.peaks = (await api.peaks(path, 1000)).map((v) => Math.round(v * 100) / 100);
  }
  return asset;
}
