#!/usr/bin/env bash
# Downloads static macOS arm64 ffmpeg/ffprobe builds into src-tauri/binaries (Tauri sidecars).
set -euo pipefail
cd "$(dirname "$0")/../src-tauri/binaries"
for bin in ffmpeg ffprobe; do
  curl -fsSL -o "$bin.zip" "https://ffmpeg.martin-riedl.de/redirect/latest/macos/arm64/release/$bin.zip"
  unzip -oq "$bin.zip" && rm "$bin.zip"
  mv "$bin" "$bin-aarch64-apple-darwin" && chmod +x "$bin-aarch64-apple-darwin"
done
ls -la
