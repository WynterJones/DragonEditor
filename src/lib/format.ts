export function timecode(frame: number, fps: number) {
  const total = Math.floor(frame / fps);
  const f = frame - total * fps;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${h ? p(h) + ":" : ""}${p(m)}:${p(s)}:${p(f)}`;
}

export function seconds(frame: number, fps: number) {
  const s = frame / fps;
  return s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${s.toFixed(1)}s`;
}

