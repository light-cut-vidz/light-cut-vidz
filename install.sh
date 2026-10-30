#!/usr/bin/env bash
# LightCutVidz — one-line installer for macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/light-cut-vidz/light-cut-vidz/main/install.sh | bash
#
#   macOS         → Homebrew cask (light-cut-vidz/tap/light-cut-vidz)
#   Linux + apt   → .deb package
#   Linux (other) → .AppImage in ~/.local/bin, registered in the applications menu
#
# Re-run the same command to upgrade an existing install.
set -eo pipefail

REPO="light-cut-vidz/light-cut-vidz"
TAP="light-cut-vidz/tap"
CASK="light-cut-vidz"
APP_NAME="LightCutVidz"
APP_SLUG="lightcutvidz"
APP_COMMENT="Lightweight video editor"
CATEGORIES="AudioVideo;Video;"
ICON_URL="https://raw.githubusercontent.com/$REPO/main/assets/icon.png"
ICON_SIZE="512x512"
RUNTIME_DEPS=""

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# fetch <url> [output] — writes to <output>, or to stdout when omitted
fetch() {
  if command -v curl >/dev/null 2>&1; then
    if [ $# -ge 2 ]; then curl -fsSL "$1" -o "$2"; else curl -fsSL "$1"; fi
  elif command -v wget >/dev/null 2>&1; then
    if [ $# -ge 2 ]; then wget -qO "$2" "$1"; else wget -qO- "$1"; fi
  else
    die "curl or wget is required"
  fi
}

# sha256 <file> — hex digest, with whichever tool the system has
sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  else return 1
  fi
}

# verify_download <file> <asset name> — checks <file> against the release's
# SHA256SUMS. A release that publishes none is accepted with a warning, so older
# releases stay installable; a listed file that does not match is fatal.
verify_download() {
  sums_url="$(latest_asset_named SHA256SUMS)"
  if [ -z "$sums_url" ]; then
    log "Warning: this release publishes no SHA256SUMS — the download cannot be verified."
    return 0
  fi
  sums="$(fetch "$sums_url")" || die "could not download SHA256SUMS"
  expected="$(printf '%s\n' "$sums" | awk -v n="$2" '{ f=$2; sub(/^\*/, "", f) } f == n { print $1 }' | head -1)"
  [ -n "$expected" ] || die "SHA256SUMS does not list $2"
  actual="$(sha256 "$1")" || die "no sha256sum or shasum available to verify the download"
  [ "$actual" = "$expected" ] || die "checksum mismatch for $2 (expected $expected, got $actual)"
  log "Checksum verified."
}

# latest_asset_named <exact file name> — download URL of that asset, or nothing
latest_asset_named() {
  fetch "https://api.github.com/repos/$REPO/releases/latest" \
    | grep -o "\"browser_download_url\": *\"[^\"]*/$1\"" \
    | head -1 \
    | sed 's/.*"\(https[^"]*\)"/\1/'
}

# latest_asset <extension> — download URL of the first matching asset of the latest release
latest_asset() {
  fetch "https://api.github.com/repos/$REPO/releases/latest" \
    | grep -o "\"browser_download_url\": *\"[^\"]*\\.$1\"" \
    | head -1 \
    | sed 's/.*"\(https[^"]*\)"/\1/'
}

install_runtime_deps() {
  [ -n "$RUNTIME_DEPS" ] || return 0
  missing=""
  for dep in $RUNTIME_DEPS; do
    command -v "$dep" >/dev/null 2>&1 || missing="$missing $dep"
  done
  [ -n "$missing" ] || return 0
  log "Installing runtime dependencies:$missing"
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update && sudo apt-get install -y $missing
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y $missing
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -S --noconfirm $missing
  elif command -v zypper >/dev/null 2>&1; then
    sudo zypper install -y $missing
  else
    log "No supported package manager found — install these manually:$missing"
  fi
}

install_macos() {
  command -v brew >/dev/null 2>&1 \
    || die "Homebrew is required on macOS. Install it from https://brew.sh"
  brew tap "$TAP"
  if brew list --cask "$CASK" >/dev/null 2>&1; then
    log "Upgrading $APP_NAME via Homebrew…"
    brew upgrade --cask "$TAP/$CASK"
  else
    log "Installing $APP_NAME via Homebrew…"
    brew install --cask "$TAP/$CASK"
  fi
  log "Done. Launch $APP_NAME from Spotlight or your Applications folder."
}

install_deb() {
  url="$(latest_asset deb)"
  [ -n "$url" ] || die "No .deb in the latest release — see https://github.com/$REPO/releases"
  tmpdir="$(mktemp -d)"
  # `set -e` would otherwise leave the download behind when apt-get fails.
  trap 'rm -rf "$tmpdir"' EXIT
  tmp="$tmpdir/$(basename "$url")"
  log "Downloading $(basename "$url")…"
  fetch "$url" "$tmp"
  verify_download "$tmp" "$(basename "$url")"
  log "Installing the .deb package (sudo required)…"
  sudo apt-get install -y "$tmp"
  log "Done. Launch $APP_NAME from your applications menu."
}

install_appimage() {
  url="$(latest_asset AppImage)"
  [ -n "$url" ] || die "No .AppImage in the latest release — see https://github.com/$REPO/releases"

  bin_dir="$HOME/.local/bin"
  desktop_dir="$HOME/.local/share/applications"
  icon_dir="$HOME/.local/share/icons/hicolor/$ICON_SIZE/apps"
  mkdir -p "$bin_dir" "$desktop_dir" "$icon_dir"

  target="$bin_dir/$APP_SLUG.AppImage"
  log "Downloading $(basename "$url")…"
  fetch "$url" "$target"
  verify_download "$target" "$(basename "$url")" || { rm -f "$target"; exit 1; }
  chmod +x "$target"

  # AppImages need FUSE 2 to mount themselves; recent distributions no longer
  # install it by default.
  if ! (ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'); then
    log "Note: libfuse2 was not found. If $APP_NAME does not start, install it (e.g. 'sudo apt install libfuse2', 'sudo dnf install fuse-libs') or run: $target --appimage-extract-and-run"
  fi

  fetch "$ICON_URL" "$icon_dir/$APP_SLUG.png" 2>/dev/null || true

  cat > "$desktop_dir/$APP_SLUG.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$APP_NAME
Comment=$APP_COMMENT
Exec=$target
Icon=$APP_SLUG
Terminal=false
Categories=$CATEGORIES
StartupWMClass=$APP_NAME
EOF

  update-desktop-database "$desktop_dir" 2>/dev/null || true

  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *) log "Note: $bin_dir is not in your PATH — add it to your shell profile to launch from a terminal." ;;
  esac
  log "Done. Installed to $target — launch $APP_NAME from your applications menu."
}

echo "$APP_NAME installer"

case "$(uname -s)" in
  Darwin)
    install_macos
    ;;
  Linux)
    # Only x86_64 builds are published: on ARM the package would install and then
    # fail to run.
    case "$(uname -m)" in
      x86_64|amd64) ;;
      *) die "unsupported architecture: $(uname -m). Only x86_64 builds are published — see https://github.com/$REPO/releases" ;;
    esac
    install_runtime_deps
    if command -v apt-get >/dev/null 2>&1; then
      install_deb
    else
      install_appimage
    fi
    ;;
  *)
    die "Unsupported platform: $(uname -s). Download manually from https://github.com/$REPO/releases"
    ;;
esac
