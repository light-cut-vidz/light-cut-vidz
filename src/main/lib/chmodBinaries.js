const fs = require('fs')
const path = require('path')

// Recursively chmods 0755 any file under `dir` whose name is in `names`.
//
// Packaging (asar unpack, .deb/AppImage install) doesn't always preserve the
// executable bit on the bundled ffmpeg/ffprobe binaries, which makes
// `ffmpeg.export` fail at runtime with `spawn ... EACCES`.
function chmodBinaries(dir, names) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      chmodBinaries(full, names)
    } else if (names.includes(entry.name)) {
      fs.chmodSync(full, 0o755)
    }
  }
}

module.exports = { chmodBinaries }
