#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_SLUG="woo-slack-store-tools"
OUT_DIR="$PLUGIN_DIR/dist"
STAMP="$(date +%Y%m%d-%H%M%S)"
ZIP_PATH="$OUT_DIR/${PLUGIN_SLUG}-${STAMP}.zip"

mkdir -p "$OUT_DIR"

# Build zip with plugin folder as root inside archive.
(
  cd "$PLUGIN_DIR/.."
  zip -r "$ZIP_PATH" "$PLUGIN_SLUG" \
    -x "${PLUGIN_SLUG}/dist/*" \
    -x "${PLUGIN_SLUG}/.DS_Store" \
    -x "${PLUGIN_SLUG}/__MACOSX/*"
)

echo "Created: $ZIP_PATH"
