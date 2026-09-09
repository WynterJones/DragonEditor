import { projectEnd, trackClips } from "@/store";
import type { Clip, Project, Track } from "@/types";

export interface ExportOpts {
  out: string;
  codec: "h264" | "h265";
  crf: number;
  width: number;
  height: number;
}

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
      const bw = Math.round(W * c.scale);
      const bh = Math.round(H * c.scale);
      f.push(
        `[${idx}:v]trim=duration=${sec(c.duration)},setpts=PTS-STARTPTS,fps=${fps},` +
          `scale=w=${bw}:h=${bh}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,` +
          `format=yuva420p,colorchannelmixer=aa=${c.opacity.toFixed(3)},setpts=PTS+${st}/TB[c${idx}]`,
      );
      vi++;
      f.push(
        `[${vlabel}][c${idx}]overlay=x=(W-w)/2+${Math.round(c.x * sx)}:y=(H-h)/2+${Math.round(c.y * sx)}` +
          `:enable='between(t,${st},${en})':eof_action=pass[v${vi}]`,
      );
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
