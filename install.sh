#!/usr/bin/env bash
set -e

REPO="light-cut-vidz/light-cut-vidz"
INSTALL_DIR="$HOME/.local/bin"
DESKTOP_DIR="$HOME/.local/share/applications"
ICON_DIR="$HOME/.local/share/icons/hicolor/512x512/apps"
APP_NAME="lightcutvidz"

echo "LightCutVidz installer"
echo "=================="

# ── Detect package manager ────────────────────────────────────────────────────
if command -v apt-get &>/dev/null; then
  FORMAT="deb"
elif command -v dnf &>/dev/null || command -v yum &>/dev/null; then
  FORMAT="AppImage"
else
  FORMAT="AppImage"
fi

# ── Fetch latest release URL ──────────────────────────────────────────────────
echo "Fetching latest release from GitHub..."
API="https://api.github.com/repos/$REPO/releases/latest"

if command -v curl &>/dev/null; then
  RELEASE_JSON=$(curl -fsSL "$API")
else
  RELEASE_JSON=$(wget -qO- "$API")
fi

if [ "$FORMAT" = "deb" ]; then
  DOWNLOAD_URL=$(echo "$RELEASE_JSON" | grep -o '"browser_download_url": *"[^"]*\.deb"' | head -1 | grep -o '"https://[^"]*"' | tr -d '"')
else
  DOWNLOAD_URL=$(echo "$RELEASE_JSON" | grep -o '"browser_download_url": *"[^"]*\.AppImage"' | head -1 | grep -o '"https://[^"]*"' | tr -d '"')
fi

if [ -z "$DOWNLOAD_URL" ]; then
  echo "Error: could not find a download URL. Check https://github.com/$REPO/releases"
  exit 1
fi

FILENAME=$(basename "$DOWNLOAD_URL")
TMP_FILE="/tmp/$FILENAME"

echo "Downloading $FILENAME..."
if command -v curl &>/dev/null; then
  curl -fsSL --progress-bar "$DOWNLOAD_URL" -o "$TMP_FILE"
else
  wget -q --show-progress "$DOWNLOAD_URL" -O "$TMP_FILE"
fi

# ── Install ───────────────────────────────────────────────────────────────────
if [ "$FORMAT" = "deb" ]; then
  echo "Installing .deb package (requires sudo)..."
  sudo apt-get install -y "$TMP_FILE"
  rm -f "$TMP_FILE"
  echo ""
  echo "Done! Launch LightCutVidz from your applications menu."

else
  # AppImage: install to ~/.local/bin + .desktop entry
  mkdir -p "$INSTALL_DIR" "$DESKTOP_DIR" "$ICON_DIR"

  APPIMAGE_PATH="$INSTALL_DIR/LightCutVidz.AppImage"
  mv "$TMP_FILE" "$APPIMAGE_PATH"
  chmod +x "$APPIMAGE_PATH"

  # Download icon
  ICON_URL="https://raw.githubusercontent.com/$REPO/main/assets/icon.png"
  if command -v curl &>/dev/null; then
    curl -fsSL "$ICON_URL" -o "$ICON_DIR/$APP_NAME.png" 2>/dev/null || true
  else
    wget -qO "$ICON_DIR/$APP_NAME.png" "$ICON_URL" 2>/dev/null || true
  fi

  # Create .desktop entry
  cat > "$DESKTOP_DIR/lightcutvidz.desktop" <<EOF
[Desktop Entry]
Name=LightCutVidz
Comment=Lightweight video editor
Exec=$APPIMAGE_PATH
Icon=$APP_NAME
Terminal=false
Type=Application
Categories=AudioVideo;Video;
StartupWMClass=LightCutVidz
EOF

  update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true

  # Ensure ~/.local/bin is in PATH
  if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    echo ""
    echo "Add this line to your ~/.bashrc or ~/.zshrc to use 'lightcutvidz' from the terminal:"
    echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  fi

  echo ""
  echo "Done! LightCutVidz installed to $APPIMAGE_PATH"
  echo "Launch it from your applications menu or run: $APPIMAGE_PATH"
fi
