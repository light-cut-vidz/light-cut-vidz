# Third-party software

LightCutVidz itself is released under the [MIT license](LICENSE). The packaged
application also ships the components below, each under its own license.

## FFmpeg (GPL-3.0-or-later)

Video decoding, encoding, filtering and subtitle rendering are done by FFmpeg,
bundled through the [`ffmpeg-static`](https://github.com/eugeneware/ffmpeg-static)
npm package (version 5.3.0, FFmpeg release build `b6.1.1`).

That binary is built with `--enable-gpl --enable-version3` and includes, among
others, libx264, libx265, libvpx, libopus, libmp3lame, libxvid and libass. **It is
therefore distributed under the GNU General Public License, version 3 or (at your
option) any later version**, not under the MIT license of this project. FFmpeg is
run as a separate process; LightCutVidz does not link against it.

- License text: <https://www.gnu.org/licenses/gpl-3.0.html>
  (also shipped inside the package as `node_modules/ffmpeg-static/ffmpeg.LICENSE`)
- Corresponding source code of the FFmpeg build:
  <https://johnvansickle.com/ffmpeg/> (source tarball of the same release) and
  <https://ffmpeg.org/download.html>
- The build recipe and exact version pinned by this project are in
  [`package-lock.json`](package-lock.json) (`ffmpeg-static`).

If you redistribute LightCutVidz, you must pass these terms on and make the
FFmpeg source available as above. To avoid the GPL, replace the bundled binary
with an LGPL build of FFmpeg (`ffmpeg-static` reads its path from the `FFMPEG_BIN`
environment variable at install time) and an encoder that build provides.

### Written offer of source

For at least three years from the date of each release, the maintainers of
LightCutVidz will give anyone who asks — through an issue on
<https://github.com/light-cut-vidz/light-cut-vidz/issues> — the complete
corresponding source code of the FFmpeg build bundled in that release (or a
direct link to it), for no more than the cost of performing the distribution.
The build is the unmodified static release `b6.1.1` published by the
`ffmpeg-static` project; no patch is applied by LightCutVidz.

### Patents

H.264/AVC, H.265/HEVC and some audio codecs are covered by patents in some
countries. Whether a licence is needed to encode or distribute such video depends
on your jurisdiction and use; none is granted by this software.

## Electron and Chromium (MIT, BSD-3-Clause and others)

The desktop shell is [Electron](https://www.electronjs.org/). Its bundled
`LICENSE` and `LICENSES.chromium.html` list the licenses of Chromium and its
dependencies; they ship with every packaged build.

## JavaScript dependencies

| Package | License |
|---|---|
| react, react-dom | MIT |
| electron-updater | MIT |

The full list of transitive dependencies and their licenses is in
`package-lock.json` and can be produced with `npx license-checker --production`.
