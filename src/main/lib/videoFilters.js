// Pure builders for ffmpeg video filter chains used in the export pipeline.

const { aspects: ASPECTS } = require('../../shared/constants.json')
const REFRAME_MODES = ['blur', 'crop']

function rotationFilter(totalRotate) {
  // 450° and -270° are a quarter turn: fold into [0, 360) so the cheap
  // lossless transposes below match them.
  totalRotate = ((totalRotate % 360) + 360) % 360
  if (totalRotate === 0) return null
  if (totalRotate === 90) return 'transpose=1'
  if (totalRotate === 180) return 'transpose=1,transpose=1'
  if (totalRotate === 270) return 'transpose=2'
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

// Round down to an even number: libx264 in yuv420p needs even dimensions, and
// ffmpeg silently falls back to the barely-playable yuv444p profile otherwise.
// Rounding down (never up) keeps the crop inside the source frame.
function toEven(n) {
  return Math.max(2, Math.floor(Math.round(n) / 2) * 2)
}

function cropFilter(crop) {
  if (!crop) return null
  return `crop=${toEven(crop.w)}:${toEven(crop.h)}:${Math.round(crop.x)}:${Math.round(crop.y)}`
}

function speedFilter(speed) {
  if (speed === 1) return null
  return `setpts=${(1 / speed).toFixed(4)}*PTS`
}

// Final guard on the chain: an odd output size (odd source, arbitrary-angle
// rotation, perspective expansion) makes libx264 drop to yuv444p, which most
// players and hardware decoders cannot read. Always end on even dimensions.
const EVEN_DIMENSIONS = 'scale=trunc(iw/2)*2:trunc(ih/2)*2'

// The crop comes first: the crop box is drawn on the unrotated frame, so its
// coordinates only mean something in the source's own pixel space. Applied
// after a rotation it would be out of bounds (90°) or cut the wrong area
// (straighten, which enlarges the canvas).
// Never upscales: a 4K clip exported at "1080p" is scaled down, a 480p clip
// stays 480p. `-2` keeps the width even.
function resolutionFilter(maxHeight) {
  if (!maxHeight) return null
  return `scale=-2:'min(${maxHeight},ih)'`
}

/** "9:16" → "(9/16)", safe to multiply or divide by inside an ffmpeg expression. */
const ratioExpression = (aspect) => `(${aspect.replace(':', '/')})`

/**
 * Fits the frame to a target aspect ratio (a social-network format).
 * - 'crop': the largest centred area of that ratio, the rest is cut away.
 * - 'blur': the whole frame stays, centred over a blurred, enlarged copy of
 *   itself that fills the canvas. The canvas is the smallest one of that ratio
 *   that contains the frame, so nothing is scaled down.
 * The expressions only use the incoming frame's size, so rotation, crop and
 * perspective upstream need no special case. The blur variant contains a
 * labelled sub-graph, which still chains with the filters around it.
 */
function reframeFilter(reframe) {
  if (!reframe) return null
  const r = ratioExpression(reframe.aspect)
  if (reframe.mode === 'crop') {
    const evenDown = (expr) => `trunc((${expr})/2)*2`
    return `crop=w='${evenDown(`min(iw,ih*${r})`)}':h='${evenDown(`min(ih,iw/${r})`)}'`
  }
  // The canvas is rounded *up* to even, so the blurred layer is never a pixel
  // smaller than the frame laid over it. Its crop is left unrounded for the same
  // reason; the chain's final even-size scale tidies the result.
  const evenUp = (expr) => `trunc(((${expr})+1)/2)*2`
  return [
    'split[rf0][rf1]',
    `[rf1]scale=w='${evenUp(`max(iw,ih*${r})`)}':h='${evenUp(`max(ih,iw/${r})`)}':force_original_aspect_ratio=increase,crop=w='min(iw,ih*${r})':h='min(ih,iw/${r})',boxblur=luma_radius='min(w,h)/24':luma_power=2:chroma_radius='min(cw,ch)/24':chroma_power=2[rfbg]`,
    '[rfbg][rf0]overlay=x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2',
  ].join(';')
}

// For a reframed video "1080p" means the shorter side, as for a landscape clip:
// a 9:16 export at 1080 is 1080×1920. Never upscales.
function shortSideFilter(maxShortSide) {
  if (!maxShortSide) return null
  return `scale=w='if(gt(iw,ih),-2,min(${maxShortSide},iw))':h='if(gt(iw,ih),min(${maxShortSide},ih),-2)'`
}

function buildVideoFilters({ rotation = 0, straighten = 0, perspectiveH = 0, perspectiveV = 0, crop = null, colorFilter = '', speed = 1, maxHeight = null, reframe = null } = {}) {
  return /** @type {string[]} */ ([
    cropFilter(crop),
    rotationFilter(rotation + straighten),
    perspectiveFilter(perspectiveH, perspectiveV),
    colorFilter || null,
    speedFilter(speed),
    reframeFilter(reframe),
    reframe ? shortSideFilter(maxHeight) : resolutionFilter(maxHeight),
    EVEN_DIMENSIONS,
  ].filter(Boolean))
}

module.exports = { ASPECTS, REFRAME_MODES, reframeFilter, shortSideFilter, resolutionFilter, toEven, rotationFilter, perspectiveFilter, cropFilter, speedFilter, buildVideoFilters, EVEN_DIMENSIONS }
