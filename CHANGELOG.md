# Changelog

All notable changes to LightCutVidz are listed here, newest first.
The French version is in [CHANGELOG.fr.md](CHANGELOG.fr.md) — keep both in step.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.1.0] - 2026-10-28

### Changed
- The top bar shows the name of the open file, with its size and duration, instead of the name of the app.
- The updater's questions and messages, and the About box, are shown in the window instead of native boxes; the "no update" notice is green and errors are red.
- The version number is no longer shown at the bottom of the sidebar; it is in the About box.

### Fixed
- Clearing the recent files from the File menu now empties the list on the home screen too.

### Removed
- Projects: *Save project…* and *Open project…* (`.lcvproj` files) are gone. You open a video, edit it and export it; nothing else is saved, and a project already in your recent list simply disappears from it.

## [1.0.7] - 2026-10-22

### Fixed
- *Check for updates* no longer fails with "GitHub responded 403". GitHub limits how often an app can ask it for the latest version, and a shared connection can use that allowance up; the app now finds the new version another way when that happens.

## [1.0.6] - 2026-10-22

### Fixed
- *Check for updates* could offer the same update twice when it ran at the same time as the automatic check made at start-up. There is now only one check at a time.

## [1.0.5] - 2026-10-21

### Fixed
- The Stabilization option could be hidden by mistake: the check that decides whether it works was unreliable and sometimes answered no. It now tests on a clip that really shakes, and gives the right answer every time.

## [1.0.4] - 2026-10-21

### Added
- **Social formats**: the crop tool now offers ratios — 9:16 (TikTok, Reels, Shorts), 4:5 (Instagram), 1:1 and 16:9 — and keeps the selection at that ratio while you resize it.
- **Fit to a format when exporting**: pick the proportions in the export window, either with a **blurred background** (the whole picture stays, centred over a blurred copy of itself — the usual look of a landscape video posted vertically) or **crop to fit**. Works for GIFs too.
- **Presets**: TikTok · Reels · Shorts, Instagram post, Square and YouTube set the format, proportions, resolution (1080 on the shorter side) and quality in one click.

### Fixed
- Video stabilization is now only offered when it really works with the FFmpeg in use; on some Macs it failed at export time ("Cannot parse localmotion").

## [1.0.3] - 2026-10-21

### Added
- **Export quality**: choose High, Balanced or Small file, and cap the resolution (4K down to 360p — a smaller video is never enlarged). Your choices are remembered.
- **Export queue**: *Add to queue* in the export window, then keep editing. Exports run one after the other; a button on screen shows their progress, lets you cancel one and open the result in its folder.
- **Recent files**: the home screen and *File → Open recent* list your latest videos and projects.
- **Light theme**: *View → Theme* offers Follow the system, Light and Dark; the choice is remembered.
- **Video stabilization** (Light, Normal, Strong) in the side panel. It analyses the footage first, then smooths it when you export.
- **Hardware acceleration** for H.264 export where the computer supports it (Apple VideoToolbox on a Mac). It is only offered when it really works, and falls back to software if it fails. On Linux the bundled FFmpeg has no GPU encoder: set `LIGHTCUTVIDZ_FFMPEG` to a system FFmpeg path to use NVENC, VAAPI or Quick Sync.
- **Optimized GIF**: choose the width and the frame rate; smarter palette and frame differences make files noticeably smaller.

### Changed
- Closing the window while exports are running now asks first.
- The GIF format card no longer states a fixed width.

## [1.0.2] - 2026-10-21

### Added
- **Projects**: save your edits to a `.lcvproj` file (Ctrl/Cmd+S) and reopen them later (Ctrl/Cmd+Shift+O).
- **Unsaved edits**: closing the window, or opening another video, now asks before discarding your work.
- **What's new** window (Help menu), shown automatically after an update, and the list of changes is now displayed when you check for updates.
- **Stop button** for exports, and a **Cancel** button while a video is being prepared.
- **Keyboard**: Space/K play-pause, ←/→ seek 1 s (Shift: 5 s), J/L seek 5 s, `,` and `.` step one frame, Delete removes the selected cut.
- **Open with…**: open a video from the file manager or the command line.
- Updates are now checked automatically a few seconds after launch.

### Changed
- **Much faster opening**: H.264/AAC videos (phones, cameras) open instantly instead of being converted first.
- **Much faster export**: one encoding pass instead of one per segment (WebM is about 5× faster), with no quality loss from re-encoding.
- Crop is applied before rotation and perspective; the picture is shown untransformed while you draw it.
- Filter previews now match the export: perspective, cold/warm/vintage tones, posterize, vignette and blur.
- Subtitles are laid out on the cropped picture, with the real outline size; overlapping cues are all shown.
- The save dialog offers only the chosen format and adds the extension if you forget it.
- The app follows your system language on first launch.
- Smaller download: the separate ffprobe binary is gone.

### Fixed
- **Seeking** on the timeline and seekbar jumped back to 0:00, so cuts could not be skipped and thumbnails were all the same.
- Playback froze when it jumped over a cut that left only a short tail of video.
- Exporting with a **rotation and a crop** failed (or cut the wrong area).
- **Subtitles** went out of sync when the speed was not 1×, and the background colour and opacity were ignored.
- Dropping a file on the editor replaced the whole window and lost your work.
- Exporting to a file name without the right extension failed.
- Undo/Redo stayed greyed out after switching language.
- Opening a video while another was loading could mix the two up.
- Many smaller timeline, crop, cut editor, toast and progress-bar issues.

### Security
- Only the app's own files and the videos you open can be read by the interface, and a strict Content-Security-Policy is applied.
- Updates are downloaded with a mandatory SHA-256 check, installed without a shell, from a private temporary folder.
- Electron 45 and up-to-date dependencies (no known vulnerability in the shipped app).
- Release files now come with a signed build attestation.

## [1.0.1] - 2026-08-20

### Fixed
- Linux: the bundled FFmpeg could not be started in packaged builds (permission error).

## [1.0.0] - 2026-08-19

### Added
- First release: trim, crop, geometry, filters, speed, burned-in subtitles and export to MP4, MOV, WebM, AVI and GIF.
