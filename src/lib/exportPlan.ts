import { projectEnd, trackClips } from "@/store";
import type { Clip, Project, Track } from "@/types";
import { decorMargin, fitBox } from "./decor";

export interface ExportOpts {
  out: string;
  codec: "h264" | "h265";
  crf: number;
  width: number;
  height: number;
  /** per-clip PNGs rendered by prepareDecor(): rounded alpha mask + shadow/border frame */
  decor?: Record<string, { mask?: string; frame?: string }>;
}

export const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Builds the ffmpeg argv for a project. Every clip becomes its own input (input-seeked to
 * its in-point), video is layered with `overlay` onto a black base, audio is mixed with
 * `amix`, and the background track is ducked under everything else with `sidechaincompress`.
 */
export function buildArgs(p: Project, o: ExportOpts): string[] {
  const fps = p.fps;
  const W = o.width;
  const H = o.height;
  const sx = W / p.width;
  const end = projectEnd(p);
  if (end === 0) throw new Error("Timeline is empty");
  const sec = (fr: number) => (fr / fps).toFixed(4);
  const dur = sec(end);

  const inputs: string[] = [];
  const f: string[] = [];
  const vox: string[] = [];
  const bg: string[] = [];
  let n = 0;

  const audio = (idx: number, c: Clip, t: Track) => {
    const chain = [
      `atrim=duration=${sec(c.duration)}`,
      "asetpts=PTS-STARTPTS",
      "aformat=sample_rates=48000:channel_layouts=stereo",
      `volume=${(c.volume * t.volume).toFixed(3)}`,
    ];
    if (c.fadeIn > 0) chain.push(`afade=t=in:st=0:d=${sec(c.fadeIn)}`);
    if (c.fadeOut > 0) chain.push(`afade=t=out:st=${sec(c.duration - c.fadeOut)}:d=${sec(c.fadeOut)}`);
    const ms = Math.round((c.start / fps) * 1000);
    chain.push(`adelay=${ms}|${ms}`);
    f.push(`[${idx}:a]${chain.join(",")}[a${idx}]`);
    (t.kind === "background" ? bg : vox).push(`[a${idx}]`);
  };

  f.push(`color=c=black:s=${W}x${H}:r=${fps}:d=${dur}[v0]`);
  let vlabel = "v0";
  let vi = 0;
  const videoTracks = p.tracks.filter((t) => t.kind === "video" && !t.muted);
  for (const t of [...videoTracks].reverse()) {
    for (const c of trackClips(p, t.id)) {
      const a = p.assets[c.assetId];
      if (!a) continue;
      const idx = n++;
      const st = sec(c.start);
      const en = sec(c.start + c.duration);
      if (a.kind === "image") inputs.push("-loop", "1", "-framerate", String(fps), "-t", sec(c.duration), "-i", a.path);
      else inputs.push("-ss", sec(c.inPoint), "-i", a.path);
      const box = fitBox(p, c, a) ?? { left: 0, top: 0, width: p.width, height: p.height };
      const dw = even(box.width * sx);
      const dh = even(box.height * sx);
      const left = Math.round(box.left * sx);
      const top = Math.round(box.top * sx);
      const d = o.decor?.[c.id];
      const still = (path: string) => {
        inputs.push("-loop", "1", "-framerate", String(fps), "-t", sec(c.duration), "-i", path);
        return n++;
      };
      if (d?.frame) {
        const fi = still(d.frame);
        const m = Math.round(decorMargin(c) * sx);
        f.push(`[${fi}:v]format=yuva420p,setpts=PTS+${st}/TB[f${idx}]`);
        vi++;
        f.push(`[${vlabel}][f${idx}]overlay=x=${left - m}:y=${top - m}:enable='between(t,${st},${en})':eof_action=pass[v${vi}]`);
        vlabel = `v${vi}`;
      }
      let chain = `[${idx}:v]trim=duration=${sec(c.duration)},setpts=PTS-STARTPTS,fps=${fps},scale=${dw}:${dh}`;
      if (d?.mask) {
        const mi = still(d.mask);
        f.push(`[${mi}:v]format=gray[mk${idx}]`);
        f.push(`${chain}[cs${idx}]`);
        chain = `[cs${idx}][mk${idx}]alphamerge`;
      }
      f.push(`${chain},format=rgba,colorchannelmixer=aa=${c.opacity.toFixed(3)},format=yuva420p,setpts=PTS+${st}/TB[c${idx}]`);
      vi++;
      f.push(`[${vlabel}][c${idx}]overlay=x=${left}:y=${top}:enable='between(t,${st},${en})':eof_action=pass[v${vi}]`);
      vlabel = `v${vi}`;
      if (a.kind === "video" && a.hasAudio && !c.muted) audio(idx, c, t);
    }
  }

  for (const t of p.tracks.filter((t) => t.kind !== "video" && !t.muted)) {
    for (const c of trackClips(p, t.id)) {
      const a = p.assets[c.assetId];
      if (!a || c.muted) continue;
      const idx = n++;
      inputs.push("-ss", sec(c.inPoint), "-i", a.path);
      audio(idx, c, t);
    }
  }

  const mix = (labels: string[], out: string) =>
    f.push(
      labels.length === 1
        ? `${labels[0]}anull[${out}]`
        : `${labels.join("")}amix=inputs=${labels.length}:duration=longest:normalize=0[${out}]`,
    );
  let aout: string | null = null;
  if (vox.length && bg.length) {
    mix(vox, "vox");
    mix(bg, "bg");
    if (p.ducking.enabled) {
      f.push("[vox]asplit=2[vox1][vox2]");
      f.push(`[bg][vox2]sidechaincompress=threshold=0.03:ratio=${p.ducking.ratio}:attack=30:release=600[bgd]`);
      f.push("[vox1][bgd]amix=inputs=2:duration=longest:normalize=0[aout]");
    } else {
      f.push("[vox][bg]amix=inputs=2:duration=longest:normalize=0[aout]");
    }
    aout = "aout";
  } else if (vox.length || bg.length) {
    mix(vox.length ? vox : bg, "aout");
    aout = "aout";
  }

  const video =
    o.codec === "h265"
      ? ["-c:v", "libx265", "-tag:v", "hvc1", "-x265-params", "log-level=error"]
      : ["-c:v", "libx264", "-profile:v", "high"];

  return [
    "-hide_banner",
    "-nostats",
    "-y",
    ...inputs,
    "-filter_complex",
    f.join(";"),
    "-map",
    `[${vlabel}]`,
    ...(aout ? ["-map", `[${aout}]`, "-c:a", "aac", "-b:a", "256k", "-ar", "48000"] : ["-an"]),
    ...video,
    "-preset",
    "medium",
    "-crf",
    String(o.crf),
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(fps),
    "-movflags",
    "+faststart",
    "-t",
    dur,
    "-progress",
    "pipe:1",
    o.out,
  ];
}

/** Renders the rounded mask + shadow/border frame PNGs for every decorated video clip. */
export async function prepareDecor(p: Project, sx: number, write: (path: string, bytes: Uint8Array) => Promise<void>) {
  const { drawClip, hasDecor, renderPng } = await import("./decor");
  const decor: NonNullable<ExportOpts["decor"]> = {};
  for (const c of Object.values(p.clips)) {
    const a = p.assets[c.assetId];
    const t = p.tracks.find((t) => t.id === c.trackId);
    if (!a || t?.kind !== "video" || !hasDecor(c)) continue;
    const box = fitBox(p, c, a);
    if (!box) continue;
    const dw = even(box.width * sx);
    const dh = even(box.height * sx);
    const entry: { mask?: string; frame?: string } = {};
    if (c.radius > 0) {
      entry.mask = `${p.dir}/cache/export-${c.id}-mask.png`;
      const rc = { ...c, border: 0, shadow: 0, opacity: 1 };
      await write(entry.mask, await renderPng(dw, dh, (ctx) => drawClip(ctx, whiteRect(dw, dh), { left: 0, top: 0, width: dw, height: dh }, rc, sx)));
    }
    if (c.border > 0 || c.shadow > 0) {
      entry.frame = `${p.dir}/cache/export-${c.id}-frame.png`;
      const m = Math.round(decorMargin(c) * sx);
      await write(entry.frame, await renderPng(dw + 2 * m, dh + 2 * m, (ctx) => drawClip(ctx, null, { left: m, top: m, width: dw, height: dh }, c, sx)));
    }
    decor[c.id] = entry;
  }
  return decor;
}

function whiteRect(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  return c;
}
