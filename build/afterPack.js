const path = require('path')
const { chmodBinaries } = require('../src/main/lib/chmodBinaries')

const BINARY_NAMES = ['ffmpeg', 'ffprobe']

// electron-builder hook: restores the executable bit on the unpacked
// ffmpeg/ffprobe binaries, which packaging doesn't always preserve (see
// src/main/lib/chmodBinaries.js).
module.exports = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context
  if (electronPlatformName === 'win32') return

  const resourcesDir = electronPlatformName === 'darwin'
    ? path.join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(appOutDir, 'resources')

  chmodBinaries(path.join(resourcesDir, 'app.asar.unpacked', 'node_modules'), BINARY_NAMES)
}
