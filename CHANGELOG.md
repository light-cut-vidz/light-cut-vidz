# Changelog

All notable changes to LightCutVidz are listed here, newest first.
The French version is in [CHANGELOG.fr.md](CHANGELOG.fr.md) — keep both in step.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
