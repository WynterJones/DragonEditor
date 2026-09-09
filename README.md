<p align="center">
  <img src="brand/logo.png" alt="DragonEditor" width="520" />
</p>

<p align="center">
  <strong>A bespoke macOS video editor with ElevenLabs voice built in.</strong><br/>
  Write a script → generate a voice → arrange clips → export a polished MP4.
</p>

<p align="center">
  <a href="https://github.com/WynterJones/DragonEditor/releases/latest"><img src="https://img.shields.io/github/v/release/WynterJones/DragonEditor?style=flat-square&color=f2c14e" alt="release" /></a>
  <img src="https://img.shields.io/badge/platform-macOS%20(Apple%20Silicon)-black?style=flat-square" alt="macOS" />
  <img src="https://img.shields.io/badge/built%20with-Tauri%202%20%2B%20React-black?style=flat-square" alt="Tauri" />
</p>

---

<p align="center">
  <img src="brand/splash.png" alt="DragonEditor splash" width="640" />
</p>

## What it does

DragonEditor is not a Premiere clone. It does one workflow extremely well: producing **narrated video** — tutorials, explainers, faceless content, marketing clips — where the voice is *written*, not recorded.

- **Script → voice → timeline.** Paste an ElevenLabs voice ID (or pick from your voices), write text, hit Generate. The audio lands on the timeline as a clip you can move, trim and split like anything else.
- **Real timeline editing.** Unlimited video and audio tracks, drag/trim/split/snap, undo/redo, frame-accurate playhead.
- **Background music that ducks itself.** A dedicated music track with sidechain ducking under the voice.
- **High-quality export.** H.264 or H.265 MP4 via a bundled FFmpeg — not a screen recording of a canvas.
- **Projects are folders.** `MyVideo.dragon/` with `project.json` + `assets/` + `voice/`. Zip it, move it, version it.
- **Auto-updates.** Signed, notarized builds with in-app updates.

## Install

Download the latest `.dmg` from [Releases](https://github.com/WynterJones/DragonEditor/releases/latest), drag to Applications. Apple Silicon only for now.

First run: open **Settings → ElevenLabs API key** and paste your key. It's stored in the macOS keychain, never in a project file.

## Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / pause |
| `S` | Split clip(s) at playhead |
| `⌫` | Delete selected clips |
| `←` `→` | Step one frame (`⇧` for 10) |
| `Home` | Go to start |
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `⌘+` / `⌘-` | Zoom timeline |
| `⌘S` | Save (autosaves anyway) |

Drag media from the library onto a track, or double-click to drop it at the playhead. Drop files from Finder anywhere in the window to import.

## Development

```bash
git clone https://github.com/WynterJones/DragonEditor
cd DragonEditor
npm install
./scripts/fetch-ffmpeg.sh   # static ffmpeg/ffprobe sidecars
npm run tauri dev
```

Requires Node 20+, Rust stable, and Xcode command line tools.

### Stack

| Layer | Choice |
|---|---|
| Shell | Tauri 2 (Rust) |
| UI | React 19 · TypeScript · Tailwind 4 · shadcn/ui |
| State | Zustand + Immer, undo via zundo |
| Preview | Canvas compositor + HTML media elements |
| Render | FFmpeg sidecar, `filter_complex` generated from the timeline |
| Voice | ElevenLabs REST from Rust (key never enters the webview) |
| Secrets | macOS keychain via `keyring` |

### Layout

```
src/
  store.ts            timeline model + edit operations (frames, not seconds)
  lib/exportPlan.ts   timeline → ffmpeg argv
  lib/player.ts       preview compositor
  components/         Timeline, Preview, MediaPanel, VoicePanel, Inspector, ExportDialog
src-tauri/src/
  eleven.rs           ElevenLabs API
  media.rs            ffprobe / thumbnails / waveform peaks
  export.rs           ffmpeg job runner with progress events
  keys.rs             keychain
```

### Releasing

```bash
./scripts/release.sh 0.2.0
```

Builds, signs with the Developer ID certificate, notarizes with Apple, signs the updater bundle, pushes a tag and publishes a GitHub release with `latest.json` for the in-app updater. Needs `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` in the environment and the updater private key at `~/.tauri/dragoneditor.key`.

## Roadmap

See [PRD.md](PRD.md). Next up: transitions, text/title clips, proxies for 4K sources, captions generated from the script.

## License

MIT © Wynter Jones
