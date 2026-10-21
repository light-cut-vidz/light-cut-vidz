// The ffmpeg side of an export: probe the source, build the single-pass graph,
// run it, and — only when subtitles are requested — burn them in a second pass.
// It takes the ffmpeg factory and a `run` function instead of requiring them, so
// the main process and the integration tests drive exactly the same code.

const path = require('path')
const fs = require('fs')
const { buildVideoFilters } = require('./videoFilters')
const {
  expandCuesToEvents, remapEventsToKeptSegments, buildAssContent, buildSubtitlesFilter,
} = require('./subtitles')
const {
  expectedDuration, buildFilterComplex, finalOptions, burnOptions, INTERMEDIATE_OPTIONS,
  createProgressTracker,
} = require('./exportPlan')

/**
 * Builds the burn-in subtitles filter for the given intermediate video file.
 * Probes it for its actual output dimensions (needed for ASS PlayResX/Y and the
 * sentence-slide \move coordinates), expands cues into animation events and
 * remaps them onto the post-cut, post-speed output timeline, then writes a
 * temporary .ass file for ffmpeg's `subtitles` filter.
 */
async function buildExportSubtitlesFilter({ probe, intermediatePath, subtitles, keptSegments, speed, workDir }) {
  const metadata = await probe(intermediatePath)
  const videoStream = (metadata.streams || []).find(s => s.codec_type === 'video')
  const videoWidth = videoStream?.width || 1920
  const videoHeight = videoStream?.height || 1080

  const events = expandCuesToEvents(subtitles.cues, subtitles.animation, {
    videoWidth,
    videoHeight,
    position: subtitles.style.position,
    color: subtitles.style.color,
    accentColor: subtitles.style.accentColor,
  })
  // The intermediate is already sped up, so event times shrink with it.
  const remapped = remapEventsToKeptSegments(events, keptSegments)
    .map(ev => ({ ...ev, start: ev.start / speed, end: ev.end / speed }))
  const assContent = buildAssContent(remapped, subtitles.style, videoWidth, videoHeight)
  const assPath = path.join(workDir, 'subs.ass')
  await fs.promises.writeFile(assPath, assContent, 'utf-8')

  return buildSubtitlesFilter(assPath)
}

/** "-c:v libx264" style option strings → separate argv entries. */
const toArgs = (options) => options.flatMap(o => o.split(' '))

/**
 * @param {object} deps
 * @param {(args: string[], onProgress: (seconds: number) => void) => Promise<void>} deps.run
 *        starts ffmpeg with these arguments and resolves when it ends
 * @param {(file) => Promise<object>} deps.probe  stream info (see lib/ffmpeg.js)
 * @param {(id: string) => string} deps.getFilterFfmpeg
 * @param {(pct: number) => void} deps.sendProgress
 * @param {() => void} [deps.onStartWriting] called right before ffmpeg first writes
 * @param {object} deps.options   already validated (see validateExportOptions)
 * @param {string} deps.workDir   private scratch directory
 */
async function exportVideo({ run, probe, getFilterFfmpeg, sendProgress, onStartWriting, options, workDir }) {
  const { inputPath, outputPath, segments, speed, format, subtitles } = options

  const metadata = await probe(inputPath)
  const streams = metadata.streams || []
  if (!streams.some(s => s.codec_type === 'video')) throw new Error('The file has no video stream')
  const withAudio = !options.muted && format !== 'gif' && streams.some(s => s.codec_type === 'audio')

  const videoChain = buildVideoFilters({
    rotation: options.rotation,
    straighten: options.straighten,
    perspectiveH: options.perspectiveH,
    perspectiveV: options.perspectiveV,
    crop: options.crop,
    colorFilter: getFilterFfmpeg(options.filter),
    speed,
  })

  const total = expectedDuration(segments, speed)
  const passCount = subtitles ? 2 : 1
  const report = createProgressTracker(sendProgress)
  const onProgress = (pass) => (seconds) => report(pass, passCount, seconds, total)

  // Pass 1: cut, join, geometry, colour and speed in one graph. With subtitles
  // it only writes an intermediate, because the .ass needs the dimensions of the
  // finished frame.
  if (onStartWriting) onStartWriting()
  const firstTarget = subtitles ? path.join(workDir, 'intermediate.mp4') : outputPath
  const graph = buildFilterComplex({ segments, videoChain, speed, withAudio, gif: format === 'gif' && !subtitles })
  await run([
    '-i', inputPath,
    '-filter_complex', graph,
    '-map', '[vout]',
    ...(withAudio ? ['-map', '[aout]'] : []),
    ...toArgs(subtitles ? INTERMEDIATE_OPTIONS : finalOptions(format)),
    '-f', subtitles ? 'mp4' : format,
    firstTarget,
  ], onProgress(0))

  // Pass 2 (subtitles only): burn them into the intermediate.
  if (subtitles) {
    const filter = await buildExportSubtitlesFilter({ probe, intermediatePath: firstTarget, subtitles, keptSegments: segments, speed, workDir })
    const burn = burnOptions(format, filter)
    await run([
      '-i', firstTarget,
      '-vf', burn.videoFilter,
      ...(format === 'gif' ? ['-an'] : []),
      ...toArgs(burn.options),
      '-f', format,
      outputPath,
    ], onProgress(1))
  }
}

module.exports = { exportVideo, buildExportSubtitlesFilter }
