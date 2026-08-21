#!/usr/bin/env bash
set -euo pipefail

# Reproducible local Android debug build. Run from repository root.
: "${HERE_SDK_DOWNLOAD_URL:?Set HERE_SDK_DOWNLOAD_URL}"
: "${HERE_SDK_VERSION:?Set HERE_SDK_VERSION}"
: "${SUPABASE_URL:?Set SUPABASE_URL}"
: "${SUPABASE_ANON_KEY:?Set SUPABASE_ANON_KEY}"
: "${HERE_ACCESS_KEY_ID:?Set HERE_ACCESS_KEY_ID}"
: "${HERE_ACCESS_KEY_SECRET:?Set HERE_ACCESS_KEY_SECRET}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLUTTER_DIR="$ROOT_DIR/spike/flutter"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cd "$ROOT_DIR"
rm -rf "$FLUTTER_DIR/plugins"
mkdir -p "$FLUTTER_DIR/plugins" "$FLUTTER_DIR/assets/brand"
cp "$ROOT_DIR/assets/brand/logo.png" "$FLUTTER_DIR/assets/brand/logo.png"
python3 -m pip install --disable-pip-version-check --quiet "gdown==5.2.0"
gdown --fuzzy "$HERE_SDK_DOWNLOAD_URL" -O "$TMP_DIR/here.zip"
test "$(head -c 2 "$TMP_DIR/here.zip")" = "PK"
unzip -q "$TMP_DIR/here.zip" -d "$TMP_DIR/unpacked"
tarball="$(find "$TMP_DIR/unpacked" -type f -name '*.tar.gz' -print -quit)"
test -n "$tarball"
tar -xzf "$tarball" -C "$FLUTTER_DIR/plugins"
extracted="$(find "$FLUTTER_DIR/plugins" -maxdepth 3 -type f -name pubspec.yaml -print -quit)"
test -n "$extracted"
plugin_dir="$(dirname "$extracted")"
if [ "$plugin_dir" != "$FLUTTER_DIR/plugins/here_sdk" ]; then
  rm -rf "$FLUTTER_DIR/plugins/here_sdk"
  mkdir -p "$FLUTTER_DIR/plugins/here_sdk"
  find "$plugin_dir" -mindepth 1 -maxdepth 1 -exec mv {} "$FLUTTER_DIR/plugins/here_sdk/" \;
  rmdir "$plugin_dir" 2>/dev/null || true
fi

cd "$FLUTTER_DIR"
flutter pub get
flutter build apk --debug \
  --dart-define=SUPABASE_URL="$SUPABASE_URL" \
  --dart-define=SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  --dart-define=HERE_ACCESS_KEY_ID="$HERE_ACCESS_KEY_ID" \
  --dart-define=HERE_ACCESS_KEY_SECRET="$HERE_ACCESS_KEY_SECRET"
echo "APK: $FLUTTER_DIR/build/app/outputs/flutter-apk/app-debug.apk"
