// Runs the real export pipeline against the bundled ffmpeg — no doubles.
//
// The unit tests mock fluent-ffmpeg, so they only prove that strings are built,
// not that ffmpeg accepts them. Every bug here (crop after a 90° rotation,
// a subtitle background drawn in the outline colour, a speed change that shifts
// subtitles, an apostrophe in a path…) was invisible to them.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { createRequire } from 'module'
import { requireSrc } from './__doubles__/installElectron.js'

const req = createRequire(import.meta.url)
const FFMPEG = req('ffmpeg-static')

const { exportVideo } = requireSrc('main/lib/exportRun.js')
const { validateExportOptions } = requireSrc('main/lib/exportPlan.js')
const { getFilterFfmpeg } = requireSrc('main/filters.js')
const { createFfmpeg } = requireSrc('main/lib/ffmpeg.js')
const { canPlayDirectly } = requireSrc('main/lib/preview.js')

const ffmpeg = createFfmpeg({ ffmpegPath: FFMPEG })
const probe = (file) => ffmpeg.probe(file)
const run = (args, onProgress) => ffmpeg.run(args, { onProgress }).promise

let dir
let source
let silent

const base = {
  segments: [{ start: 0, end: 4 }], speed: 1, crop: null, filter: 'none',
  rotation: 0, straighten: 0, perspectiveH: 0, perspectiveV: 0, muted: false, format: 'mp4', subtitles: null,
}

/** Runs one export and returns the probed result. */
async function doExport(name, extra = {}, { input = source, workName = name } = {}) {
  const options = validateExportOptions({ ...base, inputPath: input, outputPath: path.join(dir, name), ...extra })
  const workDir = fs.mkdtempSync(path.join(dir, `${workName.replace(/[^\w]/g, '_')}-`))
  const progress = []
  await exportVideo({ run, probe, getFilterFfmpeg, sendProgress: p => progress.push(p), options, workDir })
  const meta = await probe(options.outputPath)
  return { meta, progress, workDir, out: options.outputPath }
}

const video = (meta) => meta.streams.find(s => s.codec_type === 'video')
const audio = (meta) => meta.streams.find(s => s.codec_type === 'audio')

/** Fraction of pixels in the frame at `t` that satisfy `test(r, g, b)`. */
function countPixels(file, t, test) {
  const raw = execFileSync(FFMPEG, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 })
  let n = 0
  for (let i = 0; i < raw.length; i += 3) if (test(raw[i], raw[i + 1], raw[i + 2])) n++
  return n
}

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcv-it-'))
  source = path.join(dir, 'source.mp4')
  silent = path.join(dir, 'silent.mp4')
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25:d=10', '-f', 'lavfi', '-i', 'sine=f=440:d=10',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source])
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', source, '-an', '-c:v', 'copy', silent])
}, 60000)

afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

describe('export — geometry', () => {
  it('exports a plain cut with the expected size, codec and duration', async () => {
    const { meta } = await doExport('plain.mp4')
    expect(video(meta)).toMatchObject({ codec_name: 'h264', pix_fmt: 'yuv420p', width: 640, height: 360 })
    expect(audio(meta).codec_name).toBe('aac')
    expect(meta.format.duration).toBeCloseTo(4, 0)
  }, 60000)

  // Regression: the crop used to run after the rotation, so a full-frame crop
  // was larger than the rotated picture and ffmpeg refused it.
  it('rotates by 90° with a crop set, instead of failing', async () => {
    const { meta } = await doExport('rot-crop.mp4', { rotation: 90, crop: { x: 0, y: 0, w: 640, h: 360 } })
    expect(video(meta)).toMatchObject({ width: 360, height: 640 })
  }, 60000)

  it('crops the intended region when the picture is also straightened', async () => {
    const { meta } = await doExport('straighten-crop.mp4', { straighten: 10, crop: { x: 100, y: 50, w: 300, h: 200 } })
    // Crop first: the output is the crop's size, rotated canvas enlarging it.
    expect(video(meta).width).toBeGreaterThanOrEqual(300)
    expect(video(meta).width % 2).toBe(0)
    expect(video(meta).height % 2).toBe(0)
  }, 60000)

  it('keeps even dimensions for an odd crop', async () => {
    const { meta } = await doExport('odd.mp4', { crop: { x: 0, y: 0, w: 301, h: 201 } })
    expect(video(meta)).toMatchObject({ width: 300, height: 200, pix_fmt: 'yuv420p' })
  }, 60000)

  it.each([
    ['perspective', { perspectiveH: 20, perspectiveV: -10 }],
    ['filter', { filter: 'sepia' }],
    ['mirror', { filter: 'mirror' }],
    ['vignette', { filter: 'vignette' }],
    ['edges', { filter: 'edges' }],
  ])('accepts %s', async (name, extra) => {
    const { meta } = await doExport(`${name}.mp4`, extra)
    expect(video(meta).width).toBeGreaterThan(0)
  }, 60000)
})

describe('export — cuts, speed and audio', () => {
  it('joins several kept segments in a single pass, without a priming gap', async () => {
    const { meta } = await doExport('cuts.mp4', { segments: [{ start: 0, end: 2 }, { start: 5, end: 7 }, { start: 8, end: 9 }] })
    expect(meta.format.duration).toBeCloseTo(5, 0)
  }, 60000)

  it('halves the duration at 2x and keeps audio in sync', async () => {
    const { meta } = await doExport('fast.mp4', { speed: 2, segments: [{ start: 0, end: 8 }] })
    expect(meta.format.duration).toBeCloseTo(4, 0)
  }, 60000)

  it('handles 4x (chained atempo) and 0.25x', async () => {
    const fast = await doExport('x4.mp4', { speed: 4, segments: [{ start: 0, end: 8 }] })
    expect(fast.meta.format.duration).toBeCloseTo(2, 0)
    const slow = await doExport('x025.mp4', { speed: 0.25, segments: [{ start: 0, end: 2 }] })
    expect(slow.meta.format.duration).toBeCloseTo(8, 0)
  }, 120000)

  it('speeds up a source that has no audio track', async () => {
    const { meta } = await doExport('silent-fast.mp4', { speed: 2, segments: [{ start: 0, end: 6 }] }, { input: silent })
    expect(audio(meta)).toBeUndefined()
    expect(meta.format.duration).toBeCloseTo(3, 0)
  }, 60000)

  it('drops the audio when muted', async () => {
    const { meta } = await doExport('muted.mp4', { muted: true })
    expect(audio(meta)).toBeUndefined()
  }, 60000)

  it('reports progress that only moves forward', async () => {
    const { progress } = await doExport('progress.mp4', { segments: [{ start: 0, end: 6 }] })
    expect([...progress].sort((a, b) => a - b)).toEqual(progress)
    expect(Math.max(...progress)).toBeLessThanOrEqual(99)
  }, 60000)
})

describe('export — formats and file names', () => {
  it.each([
    ['mov', 'h264'],
    ['webm', 'vp9'],
    ['avi', 'h264'],
    ['gif', 'gif'],
  ])('writes a valid %s', async (format, codec) => {
    const { meta } = await doExport(`out.${format}`, { format, segments: [{ start: 0, end: 2 }] })
    expect(video(meta).codec_name).toBe(codec)
  }, 120000)

  it('encodes webm audio as Opus and gif without audio', async () => {
    expect(audio((await doExport('a.webm', { format: 'webm', segments: [{ start: 0, end: 2 }] })).meta).codec_name).toBe('opus')
    expect(audio((await doExport('b.gif', { format: 'gif', segments: [{ start: 0, end: 2 }] })).meta)).toBeUndefined()
  }, 120000)

  // Regression: the muxer was guessed from the name, so "video" or "x.webm" for
  // an MP4 export made ffmpeg fail.
  it('writes the requested format whatever the file is called', async () => {
    const { meta } = await doExport('no-extension', { format: 'mp4' })
    expect(meta.format.format_name).toContain('mp4')
  }, 60000)

  it('also copes with the output name ending in the wrong extension', async () => {
    const { meta } = await doExport('really-mp4.webm', { format: 'mp4' })
    expect(meta.format.format_name).toContain('mp4')
  }, 60000)
})

describe('export — burned-in subtitles', () => {
  const style = {
    fontFamily: 'DejaVu Sans', fontSize: 14, color: '#ffffff', outlineColor: '#ff0000', outlineWidth: 3,
    backgroundColor: '#0000ff', backgroundOpacity: 1, position: 'middle', accentColor: '#22d3ee',
  }
  const subs = (cues, over = {}) => ({ cues, style, animation: 'sentence-fade', ...over })
  const isBluish = (r, g, b) => b > 150 && b - r > 80 && b - g > 80
  const isRed = (r, g, b) => r > 200 && g < 60 && b < 60
  // Timing checks use an olive box: the test pattern has no olive, whereas a blue
  // box would vanish over its blue bar. "Visible" is the change in olive pixels
  // against the same export without subtitles.
  const olive = { ...style, backgroundColor: '#808000', outlineColor: '#808000' }
  const isOlive = (r, g, b) => Math.abs(r - 128) < 12 && Math.abs(g - 128) < 12 && b < 30
  const timed = (cues, over = {}) => subs(cues, { style: olive, ...over })
  const delta = async (name, extra, t) => {
    const withSubs = await doExport(`${name}.mp4`, extra)
    const without = await doExport(`${name}-plain.mp4`, { ...extra, subtitles: null })
    return countPixels(withSubs.out, t, isOlive) - countPixels(without.out, t, isOlive)
  }

  // Regression: BorderStyle 3 painted the box with the *outline* colour, so a
  // blue background came out red and the opacity slider did nothing.
  it('paints the background box in the chosen colour and keeps the outline', async () => {
    const { out } = await doExport('subs.mp4', { subtitles: subs([{ id: 1, start: 0, end: 3.5, text: 'HELLO WORLD' }]) })
    expect(countPixels(out, 1.5, isBluish)).toBeGreaterThan(200)
    expect(countPixels(out, 1.5, isRed)).toBeGreaterThan(20)
  }, 120000)

  it('shows nothing outside the cue', async () => {
    const extra = { subtitles: timed([{ id: 1, start: 0, end: 1, text: 'HELLO' }]) }
    expect(await delta('subs-on', extra, 0.6)).toBeGreaterThan(1500)
    expect(Math.abs(await delta('subs-off', extra, 3))).toBeLessThan(300)
  }, 120000)

  // Regression: cue times were never divided by the speed, so at 2x the
  // subtitle for source second 4–6 appeared at 4–6 of an output only 5 s long.
  it('keeps subtitles in sync when the speed changes', async () => {
    const extra = { subtitles: timed([{ id: 1, start: 4, end: 6, text: 'LATER' }]), speed: 2, segments: [{ start: 0, end: 10 }] }
    expect(await delta('subs-fast', extra, 2.5)).toBeGreaterThan(1500) // 4–6 s of source = 2–3 s at 2x
    expect(Math.abs(await delta('subs-fast-late', extra, 4.2))).toBeLessThan(300)
  }, 180000)

  it('shifts subtitles that come after a cut', async () => {
    // Source 6–9 s sits at 3–6 s of the kept footage (2 s from the first part, then 1..4 s of the second).
    const extra = { subtitles: timed([{ id: 1, start: 6, end: 9, text: 'AFTER' }]), segments: [{ start: 0, end: 2 }, { start: 5, end: 10 }] }
    expect(await delta('subs-cut', extra, 4.5)).toBeGreaterThan(1500)
    expect(Math.abs(await delta('subs-cut-early', extra, 1))).toBeLessThan(300)
  }, 180000)

  it('burns subtitles into every format without choking on the filter', async () => {
    for (const format of ['webm', 'gif', 'avi']) {
      const { meta } = await doExport(`subs.${format}`, { format, segments: [{ start: 0, end: 2 }], subtitles: subs([{ id: 1, start: 0, end: 2, text: 'HI' }]) })
      expect(video(meta)).toBeTruthy()
    }
  }, 180000)

  // Regression: quoting could not escape an apostrophe, and spaces/commas split
  // the filtergraph, so a TMPDIR like this made every subtitle export fail.
  it("survives an awkward scratch path (space, apostrophe, comma, brackets)", async () => {
    const { meta } = await doExport('subs-path.mp4', { segments: [{ start: 0, end: 2 }], subtitles: subs([{ id: 1, start: 0, end: 2, text: 'HI' }]) },
      { workName: "it's a, [odd];dir" })
    expect(video(meta)).toBeTruthy()
  }, 120000)

  it('handles a word-level animation and a cue spanning a cut', async () => {
    const { meta } = await doExport('subs-words.mp4', {
      segments: [{ start: 0, end: 3 }, { start: 5, end: 8 }],
      subtitles: subs([{ id: 1, start: 2, end: 6, text: 'one two three four' }], { animation: 'word-pop' }),
    })
    expect(meta.format.duration).toBeCloseTo(6, 0)
  }, 120000)
})

describe('export — failure', () => {
  it('rejects a file without a video stream', async () => {
    const audioOnly = path.join(dir, 'audio.m4a')
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', source, '-vn', '-c:a', 'copy', audioOnly])
    await expect(doExport('novideo.mp4', {}, { input: audioOnly })).rejects.toThrow('no video stream')
  }, 60000)
})

describe('probe — against real files', () => {
  it('reads an H.264/AAC MP4 and decides it can be played directly', async () => {
    const meta = await probe(source)
    expect(video(meta)).toMatchObject({ codec_name: 'h264', pix_fmt: 'yuv420p', width: 640, height: 360 })
    expect(audio(meta).codec_name).toBe('aac')
    expect(meta.format.duration).toBeCloseTo(10, 0)
    expect(canPlayDirectly(meta)).toBe(true)
  }, 60000)

  it('sees that a file has no audio track', async () => {
    expect(audio(await probe(silent))).toBeUndefined()
  }, 60000)

  it('decides an HEVC file needs the transcode', async () => {
    const hevc = path.join(dir, 'hevc.mp4')
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', source, '-t', '1', '-c:v', 'libx265', '-preset', 'ultrafast', '-tag:v', 'hvc1', '-an', hevc])
    const meta = await probe(hevc)
    expect(video(meta).codec_name).toBe('hevc')
    expect(canPlayDirectly(meta)).toBe(false)
  }, 60000)

  it('decides an AVI needs the transcode', async () => {
    const avi = path.join(dir, 'x.avi')
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', source, '-t', '1', '-c:v', 'mpeg4', '-an', avi])
    expect(canPlayDirectly(await probe(avi))).toBe(false)
  }, 60000)

  it('accepts a VP9/Opus WebM', async () => {
    const webm = path.join(dir, 'x.webm')
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', source, '-t', '1', '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libopus', webm])
    const meta = await probe(webm)
    expect(canPlayDirectly(meta)).toBe(true)
  }, 60000)

  it('detects a rotation flag and refuses direct play', async () => {
    const rot = path.join(dir, 'rot.mp4')
    execFileSync(FFMPEG, ['-v', 'error', '-y', '-display_rotation', '90', '-i', source, '-t', '1', '-c', 'copy', rot])
    const meta = await probe(rot)
    expect(video(meta).tags).toEqual({ rotate: '90' })
    expect(canPlayDirectly(meta)).toBe(false)
  }, 60000)

  it('rejects a file that is not media', async () => {
    const txt = path.join(dir, 'x.txt')
    fs.writeFileSync(txt, 'hello')
    await expect(probe(txt)).rejects.toThrow()
  }, 60000)

  it('rejects a missing file', async () => {
    await expect(probe(path.join(dir, 'missing.mp4'))).rejects.toThrow('No such file')
  }, 60000)
})

describe('run — cancellation and errors, against the real binary', () => {
  it('reports a real ffmpeg error message', async () => {
    await expect(run(['-i', source, '-vf', 'crop=9999:9999', path.join(dir, 'bad.mp4')])).rejects.toThrow(/Invalid too big|crop/i)
  }, 60000)

  it('can be killed mid-encode', async () => {
    const handle = ffmpeg.run(['-f', 'lavfi', '-i', 'testsrc2=s=1280x720:r=30:d=600', '-c:v', 'libx264', '-preset', 'veryslow', path.join(dir, 'long.mp4')])
    setTimeout(() => handle.kill(), 300)
    await expect(handle.promise).rejects.toThrow('cancelled')
  }, 60000)

  it('reports increasing progress in seconds', async () => {
    const seen = []
    await run(['-i', source, '-c:v', 'libx264', '-preset', 'ultrafast', '-an', path.join(dir, 'p.mp4')], (s) => seen.push(s))
    expect(seen.length).toBeGreaterThan(0)
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
    expect(seen.at(-1)).toBeCloseTo(10, 0)
  }, 60000)
})

// The live preview draws perspective with a projective map derived from the
// export's corner formula. This is the check that the two actually agree: where
// a marker lands in a real ffmpeg render must be where the preview puts it.
describe('perspective — preview geometry matches the real export', () => {
  it.each([
    [30, 0, 480, 90],
    [-25, 0, 100, 250],
    [0, 35, 520, 300],
    [20, -15, 320, 180],
  ])('H=%i V=%i, marker at (%i,%i)', async (ph, pv, mx, my) => {
    const { homography, perspectiveCorners } = await import('../../renderer/src/utils/video')
    const { perspectiveFilter } = requireSrc('main/lib/videoFilters.js')
    const W = 640
    const H = 360
    const raw = execFileSync(FFMPEG, ['-v', 'error', '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:d=1,drawbox=x=${mx - 4}:y=${my - 4}:w=9:h=9:color=white:t=fill`,
      '-vf', perspectiveFilter(ph, pv), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 26 })
    let sx = 0, sy = 0, n = 0
    for (let i = 0; i < raw.length; i++) if (raw[i] > 128) { sx += i % W; sy += Math.floor(i / W); n++ }
    expect(n).toBeGreaterThan(5)
    const found = [sx / n, sy / n]

    // Preview: the corners of the picture go to the listed points, projectively.
    const g = homography([[0, 0], [W, 0], [0, H], [W, H]], perspectiveCorners(W, H, ph, pv))
    const w = g[2][0] * mx + g[2][1] * my + g[2][2]
    const predicted = [(g[0][0] * mx + g[0][1] * my + g[0][2]) / w, (g[1][0] * mx + g[1][1] * my + g[1][2]) / w]
    expect(Math.abs(found[0] - predicted[0])).toBeLessThan(1.5)
    expect(Math.abs(found[1] - predicted[1])).toBeLessThan(1.5)
  }, 60000)
})

