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
  createProgressTracker, gifTail, hardwareSetup, buildDetectGraph, stabilizeFilter,
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

const isCancel = (err) => !!err && err.message === 'cancelled'

/**
 * @param {object} deps
 * @param {(args: string[], onProgress: (seconds: number) => void) => Promise<void>} deps.run
 *        starts ffmpeg with these arguments and resolves when it ends
 * @param {(file) => Promise<object>} deps.probe  stream info (see lib/ffmpeg.js)
 * @param {(id: string) => string} deps.getFilterFfmpeg
 * @param {(pct: number) => void} deps.sendProgress
 * @param {() => void} [deps.onStartWriting] called right before ffmpeg first writes
 * @param {(message: string) => void} [deps.warn]  non-fatal events (hardware fallback)
 * @param {object} deps.options   already validated (see validateExportOptions)
 * @param {string} deps.workDir   private scratch directory
 */
async function exportVideo({ run, probe, getFilterFfmpeg, sendProgress, onStartWriting, warn = () => {}, options, workDir }) {
  const { inputPath, outputPath, segments, speed, format, subtitles, quality, stabilize } = options

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
    // A GIF's size is its width; the height cap applies to video only.
    maxHeight: format === 'gif' ? null : options.resolution,
  })

  const gif = format === 'gif' ? gifTail({ width: options.gifWidth, fps: options.gifFps, quality }) : null
  const keptSeconds = segments.reduce((sum, s) => sum + (s.end - s.start), 0)
  const total = expectedDuration(segments, speed)
  const passCount = (stabilize !== 'off' ? 1 : 0) + 1 + (subtitles ? 1 : 0)
  const report = createProgressTracker(sendProgress)
  let pass = 0
  const onProgress = (seconds, outTotal, index) => report(index, passCount, seconds, outTotal)

  if (onStartWriting) onStartWriting()

  // Stabilisation, pass 1: measure the camera motion over the kept footage.
  /** @type {string|null} */
  let stabFilter = null
  if (stabilize !== 'off') {
    const trf = path.join(workDir, 'motion.trf')
    const index = pass++
    await run(
      ['-i', inputPath, '-filter_complex', buildDetectGraph({ segments, trf, level: stabilize }), '-map', '[vo]', '-f', 'null', '-'],
      (seconds) => onProgress(seconds, keptSeconds, index),
    )
    stabFilter = stabilizeFilter({ trf, level: stabilize })
  }

  // Encodes with the hardware encoder when one was asked for; if that fails for
  // any reason but a cancellation (driver, unsupported size…), retries once in
  // software instead of failing the export.
  /** @param {string|null} hardware @param {(hw: string|null) => Promise<void>} attempt */
  const withFallback = async (hardware, attempt) => {
    if (!hardware) return attempt(null)
    try {
      return await attempt(hardware)
    } catch (err) {
      if (isCancel(err)) throw err
      warn(`Hardware encoding (${hardware}) failed, retrying in software: ${err instanceof Error ? err.message : err}`)
      return attempt(null)
    }
  }

  // Main pass: cut, join, stabilise, geometry, colour, speed and encode in one
  // graph. With subtitles it only writes an intermediate, because the .ass needs
  // the dimensions of the finished frame.
  const firstTarget = subtitles ? path.join(workDir, 'intermediate.mp4') : outputPath
  const mainIndex = pass++
  await withFallback(subtitles ? null : options.hardware, async (hardware) => {
    const hw = hardwareSetup(format, hardware, quality)
    const graph = buildFilterComplex({
      segments, videoChain, speed, withAudio, gif: subtitles ? null : gif, stabilize: stabFilter, hardwareFilter: subtitles ? '' : hw.filter,
    })
    /** @type {string[]} */
    const args = [
      ...(subtitles ? [] : hw.inputArgs),
      '-i', inputPath,
      '-filter_complex', graph,
      '-map', '[vout]',
      ...(withAudio ? ['-map', '[aout]'] : []),
      ...(subtitles ? INTERMEDIATE_OPTIONS : finalOptions(format, { quality, hardware })),
      ...(format === 'gif' && !subtitles ? ['-loop', '0'] : []),
      '-f', subtitles ? 'mp4' : format,
      firstTarget,
    ]
    await run(args, (seconds) => onProgress(seconds, total, mainIndex))
  })

  // Subtitles pass: burn them into the intermediate.
  if (subtitles) {
    const filter = await buildExportSubtitlesFilter({ probe, intermediatePath: firstTarget, subtitles, keptSegments: segments, speed, workDir })
    const index = pass
    await withFallback(options.hardware, async (hardware) => {
      const burn = burnOptions(format, filter, { quality, hardware, gif })
      await run([
        ...burn.inputArgs,
        '-i', firstTarget,
        '-vf', burn.videoFilter,
        ...(format === 'gif' ? ['-an', '-loop', '0'] : []),
        ...burn.options,
        '-f', format,
        outputPath,
      ], (seconds) => onProgress(seconds, total, index))
    })
  }
}

module.exports = { exportVideo, buildExportSubtitlesFilter }
