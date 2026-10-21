// Pure pieces of the export pipeline: input validation, the single-pass
// filter graph, per-format encoder settings and progress arithmetic. Nothing
// here touches ffmpeg or the disk, so all of it is unit-testable.

const { clampAtempo } = require('./atempo')

const FORMATS = ['mp4', 'mov', 'webm', 'avi', 'gif']
const ANIMATIONS = [
  'word-pop', 'word-bounce', 'word-highlight', 'rainbow',
  'sentence-fade', 'sentence-slide', 'typewriter',
]
const POSITIONS = ['top', 'middle', 'bottom']
const MAX_CUES = 50000
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
// The font name lands verbatim in a comma-separated ASS Style line.
const FONT_NAME = /^[\p{L}\p{N} _-]{1,64}$/u

const isNum = (n) => typeof n === 'number' && Number.isFinite(n)

function fail(msg) {
  throw new Error(`Invalid export options: ${msg}`)
}

function num(value, name, min, max, fallback) {
  const v = value === undefined || value === null ? fallback : value
  if (!isNum(v) || v < min || v > max) fail(`${name} must be a number in [${min}, ${max}]`)
  return v
}

function validateSubtitles(subtitles) {
  if (!subtitles) return null
  const { cues, style, animation } = subtitles
  if (!Array.isArray(cues) || cues.length > MAX_CUES) fail('subtitles.cues')
  if (cues.length === 0) return null
  const cleanCues = cues.map((c, i) => {
    if (!c || !isNum(c.start) || !isNum(c.end) || c.start < 0 || c.end <= c.start || typeof c.text !== 'string') {
      fail(`subtitles.cues[${i}]`)
    }
    return { id: i + 1, start: c.start, end: c.end, text: c.text }
  })
  if (!style || typeof style !== 'object') fail('subtitles.style')
  for (const key of ['color', 'outlineColor', 'backgroundColor', 'accentColor']) {
    if (!HEX_COLOR.test(style[key])) fail(`subtitles.style.${key}`)
  }
  if (typeof style.fontFamily !== 'string' || !FONT_NAME.test(style.fontFamily)) fail('subtitles.style.fontFamily')
  if (!POSITIONS.includes(style.position)) fail('subtitles.style.position')
  const cleanStyle = {
    fontFamily: style.fontFamily,
    fontSize: num(style.fontSize, 'subtitles.style.fontSize', 0.5, 30),
    color: style.color,
    outlineColor: style.outlineColor,
    outlineWidth: num(style.outlineWidth, 'subtitles.style.outlineWidth', 0, 20),
    backgroundColor: style.backgroundColor,
    backgroundOpacity: num(style.backgroundOpacity, 'subtitles.style.backgroundOpacity', 0, 1),
    position: style.position,
    accentColor: style.accentColor,
  }
  if (!ANIMATIONS.includes(animation)) fail('subtitles.animation')
  return { cues: cleanCues, style: cleanStyle, animation }
}

/**
 * Rejects anything the renderer should never send and returns a normalised
 * copy. The renderer is trusted today, but its values end up in an ffmpeg
 * filtergraph and an .ass file, where a stray string is an injection.
 */
function validateExportOptions(options) {
  if (!options || typeof options !== 'object') fail('missing options')
  const { inputPath, outputPath, format } = options
  if (typeof inputPath !== 'string' || !inputPath) fail('inputPath')
  if (typeof outputPath !== 'string' || !outputPath) fail('outputPath')
  if (!FORMATS.includes(format)) fail('format')

  if (!Array.isArray(options.segments) || options.segments.length === 0) {
    throw new Error('Nothing to export: every part of the video has been cut.')
  }
  const segments = options.segments.map((s, i) => {
    if (!s || !isNum(s.start) || !isNum(s.end) || s.start < 0 || s.end <= s.start) fail(`segments[${i}]`)
    return { start: s.start, end: s.end }
  }).sort((a, b) => a.start - b.start)

  let crop = null
  if (options.crop) {
    const c = options.crop
    crop = {
      x: num(c.x, 'crop.x', 0, 100000),
      y: num(c.y, 'crop.y', 0, 100000),
      w: num(c.w, 'crop.w', 1, 100000),
      h: num(c.h, 'crop.h', 1, 100000),
    }
  }

  if (options.filter !== undefined && typeof options.filter !== 'string') fail('filter')

  return {
    inputPath,
    outputPath,
    format,
    segments,
    crop,
    filter: options.filter || 'none',
    speed: num(options.speed, 'speed', 0.25, 4, 1),
    rotation: num(options.rotation, 'rotation', -360, 360, 0),
    straighten: num(options.straighten, 'straighten', -45, 45, 0),
    perspectiveH: num(options.perspectiveH, 'perspectiveH', -45, 45, 0),
    perspectiveV: num(options.perspectiveV, 'perspectiveV', -45, 45, 0),
    muted: options.muted === true,
    subtitles: validateSubtitles(options.subtitles),
  }
}

/** Appends `.format` unless the path already ends with it. */
function ensureExtension(filePath, format) {
  return filePath.toLowerCase().endsWith(`.${format}`) ? filePath : `${filePath}.${format}`
}

/** Length of the exported video: kept parts, played at `speed`. */
function expectedDuration(segments, speed) {
  return segments.reduce((sum, s) => sum + (s.end - s.start), 0) / speed
}

const GIF_TAIL = 'fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse'

/**
 * One filter graph for the whole export: trim every kept segment, concat them,
 * apply the geometry/colour/speed chain, and (for GIF) the palette pipeline.
 * Doing it in a single pass avoids the encode → concat → re-encode round trip
 * (two quality generations, a few ms of audio priming gap at each join).
 */
function buildFilterComplex({ segments, videoChain, speed, withAudio, gif = false }) {
  const parts = []
  segments.forEach((s, i) => {
    const range = `start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)}`
    parts.push(`[0:v]trim=${range},setpts=PTS-STARTPTS[v${i}]`)
    if (withAudio) parts.push(`[0:a]atrim=${range},asetpts=PTS-STARTPTS[a${i}]`)
  })
  const inputs = segments.map((_, i) => `[v${i}]${withAudio ? `[a${i}]` : ''}`).join('')
  parts.push(`${inputs}concat=n=${segments.length}:v=1:a=${withAudio ? 1 : 0}[vc]${withAudio ? '[ac]' : ''}`)

  const chain = gif ? `${videoChain.join(',')},${GIF_TAIL}` : videoChain.join(',')
  parts.push(`[vc]${chain}[vout]`)
  if (withAudio) parts.push(speed === 1 ? '[ac]anull[aout]' : `[ac]atempo=${clampAtempo(speed)}[aout]`)
  return parts.join(';')
}

const X264 = ['-c:v libx264', '-preset fast', '-crf 22', '-pix_fmt yuv420p']
const VP9 = ['-c:v libvpx-vp9', '-crf 30', '-b:v 0', '-row-mt 1', '-deadline good', '-cpu-used 4', '-pix_fmt yuv420p']

function videoEncoder(format) {
  if (format === 'webm') return VP9
  if (format === 'gif') return []
  return X264
}

function audioEncoder(format, { copy = false } = {}) {
  if (format === 'gif') return []
  if (format === 'webm') return ['-c:a libopus', '-b:a 128k']
  if (copy) return ['-c:a copy']
  return format === 'avi' ? ['-c:a libmp3lame', '-b:a 192k'] : ['-c:a aac', '-b:a 192k']
}

/** Settings for the (single, or first) pass that writes the final file. */
function finalOptions(format) {
  const faststart = format === 'mp4' || format === 'mov' ? ['-movflags +faststart'] : []
  return [...videoEncoder(format), ...audioEncoder(format), ...faststart]
}

/** High-quality intermediate, only used when subtitles must be burned in. */
const INTERMEDIATE_OPTIONS = ['-c:v libx264', '-preset veryfast', '-crf 16', '-pix_fmt yuv420p', '-c:a aac', '-b:a 192k']

/** Second pass: burn subtitles into the intermediate and encode to `format`. */
function burnOptions(format, subtitlesFilter) {
  const faststart = format === 'mp4' || format === 'mov' ? ['-movflags +faststart'] : []
  const vf = format === 'gif' ? `${subtitlesFilter},${GIF_TAIL}` : subtitlesFilter
  return {
    videoFilter: vf,
    options: [...videoEncoder(format), ...audioEncoder(format, { copy: format === 'mp4' || format === 'mov' }), ...faststart],
  }
}

/**
 * Maps ffmpeg's progress onto the overall bar. `passIndex`/`passCount` slice
 * the bar when the export needs two passes; the result never goes backwards.
 */
function createProgressTracker(send) {
  let last = -1
  return (passIndex, passCount, doneSeconds, totalSeconds) => {
    const within = totalSeconds > 0 ? Math.min(1, Math.max(0, doneSeconds / totalSeconds)) : 0
    // Keep 100 for the very end, when the file is really complete.
    const pct = Math.min(99, Math.round(((passIndex + within) / passCount) * 100))
    if (pct > last) {
      last = pct
      send(pct)
    }
  }
}

module.exports = {
  FORMATS,
  validateExportOptions,
  ensureExtension,
  expectedDuration,
  buildFilterComplex,
  finalOptions,
  burnOptions,
  INTERMEDIATE_OPTIONS,
  createProgressTracker,
}
