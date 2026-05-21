// Pure builders for ffmpeg video filter chains used in the export pipeline.

function rotationFilter(totalRotate) {
  if (totalRotate === 0) return null
  if (totalRotate === 90) return 'transpose=1'
  if (totalRotate === 180) return 'transpose=1,transpose=1'
  if (totalRotate === 270 || totalRotate === -90) return 'transpose=2'
  // Arbitrary angle. ow/oh expand the output canvas to fit the rotated content.
  return `rotate=${totalRotate}*PI/180:ow=rotw(${totalRotate}*PI/180):oh=roth(${totalRotate}*PI/180)`
}

function perspectiveFilter(perspectiveH, perspectiveV) {
  if (!perspectiveH && !perspectiveV) return null
  const hRad = (perspectiveH || 0) * Math.PI / 180
  const vRad = (perspectiveV || 0) * Math.PI / 180

  if (perspectiveH !== 0 && perspectiveV === 0) {
    const s = Math.sin(hRad) * 0.2
    return `perspective=x0=0:y0=-H*${s}:x1=W:y1=H*${s}:x2=0:y2=H+H*${s}:x3=W:y3=H-H*${s}:sense=destination`
  }
  if (perspectiveV !== 0 && perspectiveH === 0) {
    const s = Math.sin(vRad) * 0.2
    return `perspective=x0=-W*${s}:y0=0:x1=W+W*${s}:y1=0:x2=W*${s}:y2=H:x3=W-W*${s}:y3=H:sense=destination`
  }
  const sh = Math.sin(hRad) * 0.2
  const sv = Math.sin(vRad) * 0.2
  return `perspective=x0=-W*${sv}:y0=-H*${sh}:x1=W+W*${sv}:y1=H*${sh}:x2=W*${sv}:y2=H+H*${sh}:x3=W-W*${sv}:y3=H-H*${sh}:sense=destination`
}

function cropFilter(crop) {
  if (!crop) return null
  return `crop=${Math.round(crop.w)}:${Math.round(crop.h)}:${Math.round(crop.x)}:${Math.round(crop.y)}`
}

function speedFilter(speed) {
  if (speed === 1) return null
  return `setpts=${(1 / speed).toFixed(4)}*PTS`
}

function buildVideoFilters({ rotation = 0, straighten = 0, perspectiveH = 0, perspectiveV = 0, crop = null, colorFilter = '', speed = 1 } = {}) {
  return [
    rotationFilter(rotation + straighten),
    perspectiveFilter(perspectiveH, perspectiveV),
    cropFilter(crop),
    colorFilter || null,
    speedFilter(speed),
  ].filter(Boolean)
}

module.exports = { rotationFilter, perspectiveFilter, cropFilter, speedFilter, buildVideoFilters }
