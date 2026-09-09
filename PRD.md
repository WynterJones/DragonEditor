# DragonEditor — Product Requirements Document

**Status:** Draft v1 · **Date:** 2026-09-08 · **Owner:** Wynter Jones

---

## 1. Summary

DragonEditor is a bespoke macOS desktop video editor built with Tauri v2 + React. It is designed for one workflow done extremely well: assemble video clips, images, and audio on a timeline, generate AI voiceover from a written script via ElevenLabs, and export a high-quality MP4.

It is not a Premiere/DaVinci clone. It is a fast, dark, focused tool for producing narrated video content (tutorials, explainers, marketing videos, faceless content) where the voice is written, not recorded.

## 2. Goals

1. **Script-to-voice is first-class.** Write a script, pick a voice, generate audio, and it lands on the timeline — no round-tripping through a browser and a downloads folder.
2. **Timeline editing that feels native.** Drag, trim, split, snap, ripple. 60fps interactions, no jank.
3. **Export that looks professional.** H.264/H.265 MP4 at up to 4K, correct color, clean audio mix, done by FFmpeg — not a screen recorder of a canvas.
4. **Polished dark UI.** Near-black palette, shadcn/ui components, keyboard-driven, splash intro with brand assets.
5. **Projects are portable folders.** No database, no lock-in. A project is a directory you can zip.

## 3. Non-Goals (v1)

- Multi-cam, color grading, keyframed effects, motion tracking, LUTs
- Collaboration / cloud sync
- Windows/Linux builds (architecture allows it; not tested/shipped in v1)
- Plugin system
- Recording (screen/webcam/mic capture)

## 4. Target User

Solo creator or small marketing team producing narrated videos regularly. Comfortable with a timeline, not interested in learning Premiere. Has an ElevenLabs account.

## 5. Core Features

### 5.1 Projects

- **Create project**: name, resolution preset (1080p, 4K, 1080×1920 vertical, 1080×1080 square, custom), frame rate (24/30/60), save location.
- **Project = folder** on disk:
  ```
  MyVideo.dragon/
    project.json        # timeline, tracks, clips, settings
    assets/             # imported media (copied or referenced by absolute path — user choice on import)
    voice/              # generated ElevenLabs audio + script text
    cache/             # thumbnails, waveform peaks, proxies (safe to delete)
  ```
- Recent projects list on the start screen.
- Autosave every 30s + on every destructive edit; undo/redo history (in-memory, 200 steps).

### 5.2 Media Library

- Import video (mp4, mov, mkv, webm), images (png, jpg, webp, gif), audio (mp3, wav, aac, m4a, flac) via file dialog or drag-drop from Finder.
- On import, background job generates: duration/dimensions/fps probe (ffprobe), filmstrip thumbnails, audio waveform peaks. Progress shown inline.
- Library panel: grid/list, search, type filter, drag any item onto the timeline.
- Missing-file detection with relink dialog.

### 5.3 Timeline

- **Tracks**: unlimited video tracks (stacked, higher = on top), unlimited audio tracks, plus one dedicated **Background Audio** track (see 5.5).
- **Clip operations**: drag to move, trim in/out handles, split at playhead (`S`), delete with ripple (`Shift+Del`) or leave gap (`Del`), duplicate, select multiple, drag-select, snap to clip edges / playhead / markers (toggle `N`).
- **Per-clip properties** (inspector panel): position/scale/rotation/opacity, crop, volume, fade in/out, speed (0.25×–4×), mute.
- **Images** get a default duration (5s, configurable) and are treated as video clips.
- **Transitions**: cross-dissolve, fade to black, between adjacent clips on the same track. Drag from a transitions palette.
- **Text/title clips**: simple text layer with font, size, color, position, background box, fade in/out. (Rendered via FFmpeg `drawtext` on export.)
- Zoom in/out (`⌘+` / `⌘-` / pinch), scroll, fit-to-window. Time ruler with frame-accurate playhead. Markers (`M`).
- Track controls: mute, solo, lock, rename, reorder.

### 5.4 Preview / Playback

- Real-time preview of the composited timeline in a canvas, with audio.
- Transport: play/pause (`Space`), step frame (`←`/`→`), jump to clip edges (`↑`/`↓`), go to start/end, JKL shuttle, loop selection.
- Quality toggle: full / half / quarter resolution preview for smooth playback of 4K sources.
- Safe-area / aspect guides overlay.

### 5.5 Background Audio

- A dedicated track pinned below the timeline for music beds.
- Drop an audio file → it loops or trims to project duration (toggle).
- Controls: volume, fade in/out, **auto-ducking** (lower background volume by N dB when any voice/audio clip is playing, with configurable attack/release).

### 5.6 ElevenLabs Voice (the differentiator)

- **Settings → API key** stored in the OS keychain (Tauri `stronghold`/keyring), never in project files.
- **Voice panel**:
  - Script editor (multiline, autosaves with project). Supports splitting a script into segments by blank line — each segment becomes its own clip so you can space narration around visuals.
  - Voice picker: fetches user's ElevenLabs voices (premade + cloned), shows preview sample, search.
  - Model select (e.g. `eleven_multilingual_v2`, `eleven_turbo_v2_5`, `eleven_v3` — list pulled from API), stability / similarity / style / speaker-boost sliders.
  - **Generate** → streams audio to `voice/<segment-id>.mp3`, stores script text + settings alongside in `project.json` so a segment can be regenerated after an edit.
  - Result auto-inserted at playhead on a "Voice" audio track (or appended after the last voice clip). Regenerate-in-place keeps timeline position.
  - Character-usage indicator (from `/v1/user/subscription`) and cost estimate before generating.
- **Regenerate diff**: editing a segment's text marks its clip "stale" (amber badge) until regenerated.
- Voice clips are ordinary audio clips — trim, move, fade, etc.

### 5.7 Export

- Export dialog: preset (YouTube 1080p, YouTube 4K, Vertical 1080×1920, Square, Custom), codec (H.264 / H.265 / ProRes for master), quality (CRF slider with named tiers: Good / High / Max), fps, audio (AAC 256k / 320k, sample rate 48k), output path.
- Renders via FFmpeg `filter_complex` graph generated from the timeline model — video overlays, scaling, transitions (`xfade`), text (`drawtext`), audio mix with ducking (`sidechaincompress`) and fades.
- Progress bar with fps/ETA, cancel, "reveal in Finder" on completion.
- Export runs in a background process; UI stays responsive.
- **Ground truth:** FFmpeg render is authoritative. Preview approximates it. Tests assert the two agree on clip timing to ±1 frame.

### 5.8 App Shell & Splash

- **Splash window** on launch: logo/splash asset, subtle animation, ~1.2s minimum or until main window is ready. Assets provided by owner (logo, icon, splash image).
- **Start screen**: New Project / Open Project / Recent list.
- **Editor layout** (resizable panels):
  ```
  ┌──────────────┬───────────────────────────────┬──────────────┐
  │ Media / Voice│          Preview              │  Inspector   │
  │ (tabs)       │                               │              │
  ├──────────────┴───────────────────────────────┴──────────────┤
  │                        Timeline                             │
  └─────────────────────────────────────────────────────────────┘
  ```
- Native macOS menu bar (File/Edit/Clip/View/Help), command palette (`⌘K`), full keyboard shortcut map, toast notifications.
- App icon + `.dmg` build via Tauri bundler, notarized.

## 6. Design

- **Palette**: background `#0a0a0a`, surfaces `#121212` / `#181818`, borders `#262626`, text `#ededed` / muted `#8a8a8a`, one accent (brand color from logo — TBD when assets arrive). No blue-grey "dark mode" — actual black.
- **Type**: Inter (UI), JetBrains Mono (timecodes).
- **Components**: shadcn/ui (Radix primitives) + Tailwind. Icons: Lucide.
- **Motion**: 120–180ms ease-out for panels/dialogs; timeline interactions have zero animation lag (transforms only, no layout thrash).
- **Density**: compact. 12–13px in panels, 32px row height in timeline tracks by default (adjustable).

## 7. Technical Architecture

| Layer | Choice | Why |
|---|---|---|
| Shell | Tauri v2 (Rust) | Small binary, native windowing, sidecar support, keychain |
| Frontend | React 19 + TypeScript + Vite | Ecosystem, shadcn |
| State | Zustand + Immer, single `project` store with undo middleware (`zundo`) | Simple, fast, serializable → `project.json` |
| UI | Tailwind v4 + shadcn/ui + Lucide | Requested; polished defaults |
| Timeline | Custom React component (absolute positioning, pointer events, virtualized) | No off-the-shelf timeline is good enough; this is the product |
| Preview | `<canvas>` compositor driven by `requestAnimationFrame`, hidden `<video>` elements per active clip, Web Audio API graph for mixing/ducking | Real-time, in-browser, no native deps |
| Waveforms | Web Audio `decodeAudioData` → peaks cached to `cache/` | Stdlib |
| Thumbnails / probe | FFmpeg / ffprobe sidecar | Already the export engine |
| Export | FFmpeg sidecar, `filter_complex` generated in TS, spawned from Rust, progress parsed from `-progress pipe:1` | Highest quality, proven, one engine for everything |
| ElevenLabs | Direct REST from Rust (`reqwest`) so the key never touches the webview | Key stays out of JS |
| Secrets | `tauri-plugin-stronghold` or macOS keychain via `keyring` crate | Don't store API keys in plaintext |
| Persistence | `project.json` (versioned schema, zod-validated on load) | Portable, diffable |

### 7.1 Data Model (sketch)

```ts
type Project = {
  version: 1;
  name: string;
  settings: { width: number; height: number; fps: 24 | 30 | 60 };
  assets: Record<AssetId, Asset>;          // media library
  tracks: Track[];                          // ordered; kind: 'video' | 'audio' | 'background'
  voice: { script: string; segments: VoiceSegment[]; defaults: VoiceSettings };
  markers: Marker[];
};

type Clip = {
  id: ClipId; assetId: AssetId; trackId: TrackId;
  start: number;        // timeline position, in frames
  inPoint: number;      // source offset, in frames
  duration: number;     // in frames
  transform?: { x: number; y: number; scale: number; rotation: number; opacity: number };
  audio?: { volume: number; fadeIn: number; fadeOut: number; muted: boolean };
  speed: number;
  transitionIn?: Transition; transitionOut?: Transition;
};

type VoiceSegment = {
  id: string; text: string; voiceId: string; modelId: string;
  settings: VoiceSettings; assetId?: AssetId; stale: boolean;
};
```

All times are integer **frames** at project fps. No floats on the timeline.

### 7.2 Rust Commands (Tauri `invoke`)

- `project_create / project_open / project_save`
- `media_import(path, copy: bool) → Asset` (probe + kick off cache jobs)
- `media_thumbnails(assetId)`, `media_peaks(assetId)` (emit progress events)
- `voice_list_voices()`, `voice_list_models()`, `voice_generate(segment) → path`, `voice_subscription()`
- `export_start(plan: ExportPlan) → jobId`, `export_cancel(jobId)` (emits `export://progress`)
- `secrets_set(key) / secrets_has()`

### 7.3 Sidecar

FFmpeg + ffprobe bundled as Tauri sidecars (static builds, `aarch64-apple-darwin` + `x86_64-apple-darwin`). Never shell out to a system ffmpeg.

## 8. Milestones

| # | Milestone | Scope |
|---|---|---|
| M0 | Scaffold | Tauri v2 + React + Tailwind + shadcn, dark theme, splash, start screen, project create/open/save |
| M1 | Media + Timeline | Import, library, thumbnails/peaks, timeline with move/trim/split/snap/undo, multi-track |
| M2 | Preview | Canvas compositor, audio playback, transport, JKL, quality toggle |
| M3 | Voice | ElevenLabs settings, voice picker, script segments, generate, stale-regenerate |
| M4 | Export | FFmpeg filtergraph, presets, progress, cancel; preview↔export parity tests |
| M5 | Polish | Background audio ducking, transitions, text clips, command palette, shortcuts, menu bar, DMG + notarize |

## 9. Success Criteria

- Import → 10-clip timeline with narration → 1080p export in **< 5 minutes of user effort**.
- Timeline interactions stay **≥ 55fps** with 100 clips across 6 tracks.
- Preview plays 1080p30 in real time on an M1 MacBook Air.
- Export output passes `ffprobe` validation and plays in QuickTime, Chrome, and YouTube upload without re-encode warnings.
- Zero API keys written to disk in plaintext.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Preview/export drift (browser video seeking isn't frame-exact) | Integer-frame model; export is ground truth; parity tests; preview labelled as approximate for transitions |
| 4K preview performance in webview | Proxy generation (720p H.264 in `cache/`) on import for sources > 1080p; quality toggle |
| FFmpeg `filter_complex` complexity explodes with many overlays | Generate per-track intermediate renders for > N layers, then composite (two-pass) |
| ElevenLabs API/model churn | Model list fetched live; settings versioned per segment |
| Sidecar signing/notarization pain | Sign sidecars in CI; document in `BUILD.md` |

## 11. Open Questions

1. Brand accent color / font — waiting on logo, icon, splash assets.
2. Should imports default to *copy into project* or *reference in place*? (Proposed: ask once, remember.)
3. Is ProRes master export needed in v1, or H.264/H.265 only?
4. Subtitle/caption generation from the script (we already have the text — cheap win) — v1 or v2?
