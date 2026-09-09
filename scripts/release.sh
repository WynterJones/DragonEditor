#!/usr/bin/env bash
# Build, sign, notarize and publish a DragonEditor release to GitHub.
#
#   ./scripts/release.sh 0.2.0
#
# Needs in the environment (put them in ~/.zshrc):
#   APPLE_ID, APPLE_PASSWORD (app-specific), APPLE_TEAM_ID   → notarization
#   TAURI_SIGNING_PRIVATE_KEY (or the key file below)         → updater signature
# and a "Developer ID Application" cert in the keychain (configured in tauri.conf.json).
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="${1:?usage: release.sh <version>}"
TAG="v$VERSION"
REPO="WynterJones/DragonEditor"
TARGET="aarch64-apple-darwin"
KEY_FILE="$HOME/.tauri/dragoneditor.key"

: "${APPLE_ID:?set APPLE_ID}" "${APPLE_PASSWORD:?set APPLE_PASSWORD}" "${APPLE_TEAM_ID:?set APPLE_TEAM_ID}"
export APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID
export TAURI_SIGNING_PRIVATE_KEY="${TAURI_SIGNING_PRIVATE_KEY:-$(cat "$KEY_FILE")}"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}"

[ -f "src-tauri/binaries/ffmpeg-$TARGET" ] || ./scripts/fetch-ffmpeg.sh
[ -z "$(git status --porcelain)" ] || { echo "working tree not clean"; exit 1; }

echo "▶ bumping version to $VERSION"
npm version "$VERSION" --no-git-tag-version >/dev/null
sed -i '' "s/^  \"version\": \".*\"/  \"version\": \"$VERSION\"/" src-tauri/tauri.conf.json
sed -i '' "s/^version = \".*\"/version = \"$VERSION\"/" src-tauri/Cargo.toml
(cd src-tauri && cargo generate-lockfile --offline >/dev/null 2>&1 || cargo update -p dragoneditor >/dev/null)

echo "▶ building, signing and notarizing (this takes a few minutes)"
npx tauri build --target "$TARGET"

BUNDLE="src-tauri/target/$TARGET/release/bundle"
DMG=$(ls "$BUNDLE"/dmg/*.dmg)
APP_TGZ=$(ls "$BUNDLE"/macos/*.app.tar.gz)
SIG=$(cat "$APP_TGZ.sig")
TGZ_NAME=$(basename "$APP_TGZ")

echo "▶ writing latest.json"
cat > "$BUNDLE/latest.json" <<EOF
{
  "version": "$VERSION",
  "notes": "See https://github.com/$REPO/releases/tag/$TAG",
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platforms": {
    "darwin-aarch64": {
      "signature": "$SIG",
      "url": "https://github.com/$REPO/releases/download/$TAG/$TGZ_NAME"
    }
  }
}
EOF

echo "▶ committing and tagging"
git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -qm "Release $TAG"
git tag "$TAG"
git push -q && git push -q --tags

echo "▶ publishing GitHub release"
gh release create "$TAG" --repo "$REPO" --title "DragonEditor $VERSION" --generate-notes \
  "$DMG" "$APP_TGZ" "$APP_TGZ.sig" "$BUNDLE/latest.json"

echo "✓ released $TAG — https://github.com/$REPO/releases/tag/$TAG"
