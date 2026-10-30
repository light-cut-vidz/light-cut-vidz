// In production, native binaries are unpacked from the asar archive.
function fixAsarPath(p) {
  return p.replace('app.asar', 'app.asar.unpacked')
}

module.exports = { fixAsarPath }
