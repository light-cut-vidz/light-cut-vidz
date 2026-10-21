<p align="center">
  <img src="assets/icon.png" alt="LightCutVidz" width="480" />
</p>

# LightCutVidz

Trim, crop, filter and subtitle your videos, then export them — locally, with no external dependency to install. FFmpeg ships inside the app.

![CI](https://github.com/light-cut-vidz/light-cut-vidz/actions/workflows/ci.yml/badge.svg) ![license](https://img.shields.io/badge/license-MIT-blue) ![platforms](https://img.shields.io/badge/platforms-Linux%20%7C%20macOS-lightgrey)

**Website** — <https://light-cut-vidz.github.io/light-cut-vidz/>

---

## Features

- **Open video** — drag & drop or `Ctrl/Cmd+O` (MP4, MOV, AVI, MKV, WebM, FLV, M4V)
- **Playback** — play/pause (`Space`), seekbar with drag support; playback skips over cut zones, frame-accurately
- **Speed control** — 0.25× to 4×, from presets or a slider across them
- **Multi-segment trim** — draw cut zones on the timeline, adjust start/end with precise time inputs, delete individually
- **Timeline filmstrip** — thumbnail strip extracted from the video for visual reference
- **Crop** — draw a selection overlay, confirm with Enter or Apply; a red frame shows the active crop zone; lock it to a social ratio (9:16, 4:5, 1:1, 16:9)
- **Geometry** — 90° rotation, free straightening (±45°) and horizontal/vertical perspective correction
- **Filters** — 20 colour treatments (grayscale, sepia, vintage, noir, cold/warm, mirror, edges…), previewed live on the current frame
- **Subtitles** — import an `.srt` and burn it in, with 7 animation styles (word pop, bounce, highlight, rainbow, typewriter, sentence fade/slide) and full control over font, size, colours, outline, background and position
- **Social formats** — export as 9:16 (TikTok, Reels, Shorts), 4:5 (Instagram), 1:1 or 16:9, with a blurred background or cropped to fit; one-click presets
- **Stabilization** — light, normal or strong, applied at export (two-pass `vidstab`)
- **Mute** — toggle audio on/off
- **Projects** — save your edits to a `.lcvproj` file (`Ctrl/Cmd+S`) and reopen them later (`Ctrl/Cmd+Shift+O`); closing the window with unsaved edits asks first
- **What's new** — the changelog is shown in the app (Help → What's new, or click the version number), automatically after an update, and in the update dialog itself
- **Undo / Redo** — full history for every edit via `Ctrl/Cmd+Z` / `Ctrl+Y`; a whole drag or slider scrub counts as one step
- **Export** — MP4, MOV, WebM, AVI, GIF in a single encoding pass, with a progress bar and a **Stop** button; choose the **quality** and the **resolution**, optimise **GIFs** (width, frame rate), use **hardware acceleration** when available, or **queue** several exports
- **Full screen** — `F11` / `Ctrl+Cmd+F`, exit with `Escape`
- **Bilingual** — English and French (follows your system language on first launch), switchable from the Language menu
- **Recent files** — your latest projects and videos on the home screen and in *File → Open recent*
- **Light & dark themes** — *View → Theme* (follow the system, light or dark)
- **Open with…** — pass a video on the command line or use *Open with LightCutVidz* from your file manager

---

## Install

One command, identical on macOS and Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/light-cut-vidz/light-cut-vidz/main/install.sh | bash
```

| Platform | What it installs |
|----------|------------------|
| macOS | Homebrew cask `light-cut-vidz/tap/light-cut-vidz` |
| Linux — Debian / Ubuntu | `.deb` package |
| Linux — other distributions | `.AppImage` in `~/.local/bin`, registered in your applications menu |

Re-run the exact same command to upgrade to the latest release.

> Apple Silicon only (M1/M2/M3/M4). Linux builds are x86_64 only.

Downloads are checked against the release's `SHA256SUMS` when it is published. The in-app updater **requires** it and refuses anything it cannot verify.

### Manual install

**macOS — Homebrew**

```bash
brew install --cask light-cut-vidz/tap/light-cut-vidz
```

**Linux — Debian / Ubuntu**

Download the `.deb` from the [latest release](https://github.com/light-cut-vidz/light-cut-vidz/releases/latest), then:

```bash
sudo apt install ./LightCutVidz-linux.deb
```

**Linux — other distributions**

Download the `.AppImage` from the [latest release](https://github.com/light-cut-vidz/light-cut-vidz/releases/latest), then:

```bash
chmod +x LightCutVidz-linux.AppImage
./LightCutVidz-linux.AppImage
```

---

## Usage

### 1. Import a video

On launch, you land on the home screen. Two options:
- **Drag & drop** a video file anywhere in the window
- Click **Browse files** or press `Ctrl/Cmd+O` to open the file picker

Supported formats: MP4, MOV, AVI, MKV, WebM, FLV, M4V

> H.264/AAC files (the MP4/MOV from phones and cameras) open instantly and are played as they are. Other formats (HEVC, AVI, FLV, 10-bit video…) are first converted to a temporary WebM preview — a progress bar is shown and you can cancel. The preview is only for display; the export always starts from your original file.

### 2. Playback controls

| Action | How |
|--------|-----|
| Play / Pause | Click the play button or press `Space` |
| Seek ±1 s (±5 s with `Shift`) | `←` / `→` |
| Seek ±5 s | `J` / `L` |
| Previous / next frame | `,` / `.` |
| Play / Pause (alternative) | `K` |
| Delete the selected cut | `Delete` / `Backspace` |
| Seek | Click or drag anywhere on the seekbar |
| Full screen | `F11` (Linux) / `Ctrl+Cmd+F` (macOS) or menu View → Toggle Full Screen |
| Exit full screen | `Escape` |

### 3. Speed

In the toolbar, click a speed preset or use the slider:

`0.25×` · `0.5×` · `0.75×` · `1×` · `1.25×` · `1.5×` · `2×` · `3×` · `4×`

The speed is applied both during playback and at export (via FFmpeg `setpts` + `atempo` filters). Subtitles follow it.

### 4. Trim — Remove parts of the video

The timeline shows the full video duration. **Red zones = parts that will be removed.**

**Create a cut:**
1. Click and drag on the timeline to draw a red zone
2. Repeat as many times as needed — overlapping zones are automatically merged

**Adjust a cut:**
- **Move** — drag the center of a red zone
- **Resize** — drag the left or right edge
- **Edit precisely** — click a zone to open the time editor (type `1:23.4` or `83.5` seconds)
- **Delete** — click the `×` button on a zone, or select it and press the delete button in the editor

**Clear all cuts:** click **Clear all cuts** in the timeline bar.

A zone you are drawing is previewed before you release the mouse.

### 5. Crop

1. Click **Crop** in the toolbar — a selection overlay appears on the video
2. Drag the corner handles to resize the crop area (or pick a ratio — 9:16, 4:5, 1:1, 16:9 — at the top of the video: the box takes the largest centred area of that ratio and keeps it while you resize)
3. Drag inside the selection to move it
4. Press **Enter** or click **✓ Apply** to confirm
5. A thin red frame appears on the video indicating the active crop zone

To reset the crop, click **Reset crop** in the toolbar.

The crop is drawn on the original, unrotated frame (the picture is shown untransformed while you edit it) and is applied **before** rotation and perspective at export.

### 6. Geometry, filters and subtitles

**Geometry** — click **Geometry** in the toolbar to rotate in 90° steps, straighten by a free angle, or correct horizontal/vertical perspective. **Reset** clears all four at once.

**Filters** — click **Filters** to pick one of 20 colour treatments. The grid previews each one on the frame currently displayed.

**Subtitles** — click **Subtitles**, then **Import .srt**. Once loaded you can choose an animation style and adjust font, size, text/outline/background colours, outline width, background opacity and vertical position. The preview over the video matches what gets burned in at export.

### 7. Audio

Click the **Sound / Muted** button in the toolbar to toggle.

- **Sound On** — audio is preserved at export
- **Muted** — audio track is removed at export

### 8. Undo / Redo

Every edit is undoable — speed, mute, crop, cuts, rotation, perspective, filters and subtitle styling:

| Action | Shortcut |
|--------|----------|
| Undo | `Ctrl+Z` / `Cmd+Z` |
| Redo | `Ctrl+Y` / `Cmd+Shift+Z` |

Or use the **Edit** menu.

Inside a text field, `Ctrl/Cmd+Z` undoes the typing, not the timeline.

A continuous gesture — dragging a cut, resizing the crop box, scrubbing a slider — is recorded as a single history entry, so one `Ctrl+Z` undoes the whole movement.

### 9. Projects

**File → Save project…** (`Ctrl/Cmd+S`) writes the video's path and every edit (cuts, crop, geometry, filter, subtitles, speed, mute) to a `.lcvproj` file; **Open project…** restores them. The video itself is not copied: if it has moved, you are told. A project file is validated on opening, so a damaged or foreign file cannot do anything but show an error.

### 10. Export

Click **Export** in the toolbar.

1. Review the summary (output duration, speed, audio, crop, number of cuts)
2. Choose an output format:

| Format | Notes |
|--------|-------|
| MP4 | H.264 — best universal compatibility |
| MOV | QuickTime — ideal for macOS / Final Cut |
| WebM | VP9 — optimized for the web |
| AVI | Legacy Windows compatibility |
| GIF | Animated image (480px wide, 15 fps) |

3. Click **Export**, choose the output file location
4. A progress bar tracks the encoding. **Stop export** cancels it; the dialog cannot be closed while it runs.

**Quality** — *High*, *Balanced* or *Small file* (x264 CRF 18 / 22 / 28, VP9 CRF 24 / 30 / 37; audio 256 / 192 / 128 kbit/s). **Resolution** caps the height of the picture (4K … 360p) and never enlarges a smaller video. For a **GIF**, pick the width and the frame rate instead; the quality then sets the palette (256 or 128 colours) and the dithering. Your choices are remembered.

**Social formats** — pick a preset (*TikTok · Reels · Shorts*, *Instagram post*, *Square*, *YouTube*) or set the **Aspect ratio** yourself. *Blurred background* keeps the whole picture, centred over a blurred, enlarged copy of itself; *Crop to fit* cuts a centred area of that ratio instead. With a ratio set, the resolution applies to the **shorter side**: 1080 gives 1080×1920 for 9:16.

**Hardware acceleration** is offered for MP4, MOV and AVI when this computer can really do it — it is tested with a tiny encode, not assumed. The bundled FFmpeg supports Apple VideoToolbox on macOS; its Linux build has no GPU encoder. To use NVENC, VAAPI or Quick Sync on Linux, run the app with `LIGHTCUTVIDZ_FFMPEG=/usr/bin/ffmpeg` (a system FFmpeg built with them). If a hardware encode fails, the export is retried in software.

**Stabilization** (side panel) first analyses the kept footage, then smooths it during the export: it adds one pass and crops the picture a little to hide the borders.

**Queue** — *Add to queue* asks for the file and returns to the editor at once. Exports run one at a time; the **Exports** button (top right) lists them, cancels one, or shows a finished file in its folder. Closing the window while exports are running asks first.

The save dialog only offers the format you chose; the matching extension is added if you leave it out. Opening another video asks for confirmation when you have unsaved edits.

---

## Uninstall

**macOS — Homebrew**

```bash
brew uninstall --cask light-cut-vidz
brew untap light-cut-vidz/tap
```

Add `--zap` to also remove settings, caches and application data:

```bash
brew uninstall --zap --cask light-cut-vidz
```

**Linux — Debian / Ubuntu**

```bash
sudo apt remove lightcutvidz
```

**Linux — AppImage**

```bash
rm ~/.local/bin/lightcutvidz.AppImage
rm ~/.local/share/applications/lightcutvidz.desktop
rm ~/.local/share/icons/hicolor/512x512/apps/lightcutvidz.png
update-desktop-database ~/.local/share/applications
```

---

## Development

### Prerequisites

- Node.js 22.22+ or 24.15+ (required by Vitest 5, jsdom 30 and Electron 45's tooling)
- npm

### Setup

```bash
git clone https://github.com/light-cut-vidz/light-cut-vidz.git
cd light-cut-vidz
npm install --legacy-peer-deps
```

### Run in dev mode

```bash
npm run dev
```

Starts the Vite dev server on `localhost:5173` and opens the Electron window with hot reload.

### Build the packaged app

```bash
npm run build
```

Outputs to `dist-app/`:
- **Linux** → `LightCutVidz-linux.AppImage` + `LightCutVidz-linux.deb`
- **macOS** → Homebrew only (`brew install --cask light-cut-vidz/tap/light-cut-vidz`)

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Electron + Vite in development mode |
| `npm run build` | Build and package the app |
| `npm run vite:build` | Build the Vite frontend only |
| `npm run test` | Run unit tests |
| `npm run test:watch` | Watch mode |
| `npm run test:coverage` | Tests with coverage report |
| `npm run test:e2e` | Build, then launch the real app under `xvfb` and check seeking, security, and a full export (Linux) |
| `npm run lint` | ESLint on `src/` and `e2e/` |
| `npm run typecheck` | TypeScript check of the renderer, and of the main/preload JavaScript (`checkJs`) |

---

## CI / CD

Every push to `main` or `develop` runs the CI pipeline automatically:

1. **Lint** — ESLint
2. **Type check** — `tsc --noEmit`
3. **Tests** — Vitest with coverage artifact, including integration tests that drive the real bundled FFmpeg (macOS runs as an informational job)
4. **End-to-end** — the real Electron app under a virtual display (`npm run test:e2e`)
5. **Build** — Vite frontend build artifact

### Release a new version

1. Add a section for the version to **both** `CHANGELOG.md` and `CHANGELOG.fr.md` (same versions, same sections — a test checks it) and set the same version in `package.json`:

   ```markdown
   ## [1.0.3] - 2026-11-02
   ### Added
   - …
   ```

2. Tag and push:

```bash
git tag v1.0.3
git push origin v1.0.3
```

The changelog sections are what users see in the update dialog (read from the changelog at the new tag, in their language), in *Help → What's new*, and as the GitHub release notes. The release workflow fails if either changelog has no section for the tag.

The release workflow triggers on the tag and, in order:

1. runs lint, type check and the tests — a failure stops the release;
2. creates a draft GitHub release whose notes are the tag's section of both changelogs (it fails without them);
3. builds the macOS archive on a macOS runner and the AppImage + deb on a Linux runner;
4. publishes a `SHA256SUMS` file for all three artifacts, then marks the release as latest;
5. recomputes the archive's SHA-256 and pushes an updated cask to
   [light-cut-vidz/homebrew-tap](https://github.com/light-cut-vidz/homebrew-tap),
   which is what `brew install --cask light-cut-vidz/tap/light-cut-vidz` installs from.

The tap update needs the `HOMEBREW_TAP_SSH_KEY` secret (a deploy key with write access to the tap); without it that workflow fails — it does not skip itself.

---

## Project structure

```
light-cut-vidz/
├── src/
│   ├── main/                          # Electron main process (CommonJS)
│   │   ├── index.js                   # IPC handlers, FFmpeg export pipeline, window & protocol setup
│   │   ├── filters.js                 # filter id → ffmpeg filter string
│   │   ├── lib/
│   │   │   ├── exportQueue.js         # sequential export queue (status, progress, cancel)
│   │   │   ├── hardware.js            # probes real hardware encoders and the stabilisation filters
│   │   │   ├── store.js / recent.js / settings.js   # persisted settings and the recent list
│   │   │   ├── exportRun.js           # the ffmpeg passes of an export (single graph, optional subtitle pass)
│   │   │   ├── exportPlan.js          # option validation, filter graph, encoder settings, progress maths
│   │   │   ├── mediaProtocol.js       # lcv-file:// handler: byte ranges, allow-list, CSP
│   │   │   ├── preview.js             # can this file be played without transcoding?
│   │   │   ├── decodeText.js          # SRT decoding (UTF-8/16, Windows-1252)
│   │   │   ├── ffmpeg.js              # spawn wrapper: progress, cancellation, stream info from `ffmpeg -i`
│   │   │   ├── project.js             # .lcvproj validation
│   │   │   ├── videoFilters.js        # crop / rotate / perspective / speed filter chain
│   │   │   ├── subtitles.js           # cue → .ass generation, cut-timeline remapping
│   │   │   ├── updater.js             # per-install-method update flows (Homebrew, deb, AppImage)
│   │   │   ├── menu.js                # native menu template
│   │   │   ├── localProtocol.js       # lcv-file:// URL <-> path
│   │   │   ├── aboutWindow.js         # About dialog
│   │   │   ├── i18n.js                # main-process translations
│   │   │   ├── atempo.js              # atempo chaining outside [0.5, 2]
│   │   │   ├── asar.js                # unpacked-binary path fix
│   │   │   └── escapeHtml.js
│   │   └── __tests__/                 # unit tests + ffmpeg.integration.test.js (real ffmpeg, no mocks)
│   ├── preload/
│   │   └── index.js                   # contextBridge — the renderer's only door to the main process
│   └── renderer/
│       └── src/
│           ├── App.tsx
│           ├── components/            # VideoPlayer, VideoControls, Timeline, FilmStrip, CutEditor,
│           │                          # CropOverlay, CropFrame, CompositionGrid, Toolbar, Filters,
│           │                          # GeometrySettings, SubtitlesPanel, SubtitleOverlay,
│           │                          # ExportModal, DropZone, Toast, icons
│           ├── hooks/
│           │   ├── useHistory.ts       # unified undo/redo, with gesture coalescing
│           │   └── useVideoRect.ts     # where the <video> sits (layout metrics, rotation-proof)
│           ├── messages/               # en.ts / fr.ts
│           ├── utils/                  # time, timeline, srt, subtitles, filters
│           └── __tests__/
├── src/shared/                        # tables used by both processes (filters, palette, extensions)
├── e2e/smoke.js                       # end-to-end test of the real app (npm run test:e2e)
├── CHANGELOG.md / CHANGELOG.fr.md     # release notes, English and French (shown in the app and in updates)
├── scripts/release-notes.js           # builds the GitHub release notes from the changelogs
├── THIRD_PARTY_NOTICES.md             # FFmpeg (GPLv3) and other bundled software
├── html/                              # GitHub Pages landing page
├── install.sh                         # one-line installer (Homebrew on macOS, deb/AppImage on Linux)
├── .github/
│   └── workflows/
│       ├── ci.yml                     # lint + typecheck + tests + vite build
│       ├── release.yml                # build, publish, update the Homebrew tap
│       └── pages.yml                  # deploy html/ to GitHub Pages
├── vite.config.mts
├── vitest.config.ts
├── tsconfig.json                      # renderer
├── tsconfig.main.json                 # main + preload (checkJs)
├── eslint.config.mjs
└── package.json
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 41 |
| UI | React 19 + TypeScript |
| Bundler | Vite 8 |
| Video processing | FFmpeg (bundled via `ffmpeg-static`), driven through `child_process.spawn` with argument arrays — no wrapper library, no separate ffprobe |
| Packaging | `electron-builder` |
| Tests | Vitest + Testing Library |
| Linter | ESLint (flat config) |

### Architecture notes

**Preview: direct play, WebM otherwise**
Electron 41 plays H.264/AAC (and VP8/VP9/AV1) natively, so a compatible MP4/MOV/WebM is handed to the HTML5 player untouched (`lib/preview.js` decides from the stream info `ffmpeg -i` prints). Anything else — HEVC, AVI, FLV, 10-bit or 4:4:4 H.264 — is transcoded to VP9 + Opus WebM first. The preview is display-only: crop coordinates are in the preview's pixels, which is why it is never down-scaled.

**Why `asarUnpack`?**
Native binaries cannot be executed from inside an `.asar` archive. The `asarUnpack` field in `package.json` and the `fixAsarPath()` helper in the main process ensure FFmpeg is always accessible on the filesystem.

**Undo / Redo**
All editable state (speed, mute, crop, cuts, geometry, filter, subtitles) is managed by a single `useEditorHistory` hook. Every setter snapshots the full previous state onto a stack, so Undo/Redo work uniformly across all edit types with no extra code per feature. Continuous gestures use `setLive`, which snapshots once at the start and edits in place until `endGesture()` — otherwise a drag would push one entry per pointer event.

**Why a custom `lcv-file://` scheme?**
The renderer has to read video files off disk. Serving them over `file://` requires `webSecurity: false`, which drops the same-origin policy for the entire renderer. Instead, the main process registers a privileged scheme and serves both the app's own bundle and the media through it — same origin, web security intact.

The handler (`lib/mediaProtocol.js`) answers byte-range requests with a real `206` + `Content-Range` — `net.fetch('file://…')` does not, and without them `<video>` reports nothing seekable and every seek snaps back to 0. It only serves the app bundle and video files the user actually opened (dialog, drop, menu, command line); anything else is `403`. The page is delivered with a strict Content-Security-Policy, and the scheme does **not** bypass it. The window cannot navigate away and cannot open new windows.

**Export pipeline**
One FFmpeg invocation per export: every kept segment is `trim`med, `concat`enated, passed through crop → rotation → perspective → colour → speed, and encoded once straight to the chosen format. Subtitles need the dimensions of the finished frame, so that case writes a high-quality intermediate and burns them in a second pass. The renderer's options are validated in the main process (numbers, colours, font names) before they reach a filter graph or an `.ass` file, and only files picked through the open/save dialogs can be read or written.

**Why `-pix_fmt yuv420p`?**
Given an odd frame size, libx264 silently switches to `yuv444p` / High 4:4:4 Predictive, which QuickTime, iOS and most hardware decoders cannot play. The export pipeline pins the pixel format and ends every filter chain on an even-dimensions guard.

---

## License

LightCutVidz is MIT — see [LICENSE](LICENSE).

The packaged app bundles **FFmpeg, which is licensed under the GPL v3** (the build used enables GPL components such as x264 and x265). Sources and licenses of everything bundled are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
