import { describe, it, expect, vi } from 'vitest'
import { requireSrc } from './__doubles__/installElectron.js'

const { exportVideo } = requireSrc('main/lib/exportRun.js')
const { validateExportOptions } = requireSrc('main/lib/exportPlan.js')

const probe = async () => ({ streams: [{ codec_type: 'video', width: 1920, height: 1080 }, { codec_type: 'audio', codec_name: 'aac' }] })
const base = { inputPath: '/in.mp4', outputPath: '/out.mp4', format: 'mp4', segments: [{ start: 0, end: 4 }] }

function setup(extra = {}, runImpl) {
  const calls = []
  const run = vi.fn(async (args, onProgress) => {
    calls.push(args)
    onProgress(1)
    if (runImpl) return runImpl(args, calls.length)
  })
  const warn = vi.fn()
  const progress = []
  const options = validateExportOptions({ ...base, ...extra })
  const go = () => exportVideo({ run, probe, getFilterFfmpeg: () => '', sendProgress: p => progress.push(p), warn, options, workDir: '/w' })
  return { calls, run, warn, progress, go }
}

describe('exportVideo — hardware encoding', () => {
  it('uses the hardware encoder when asked', async () => {
    const t = setup({ hardware: 'nvenc' })
    await t.go()
    expect(t.calls).toHaveLength(1)
    expect(t.calls[0]).toContain('h264_nvenc')
  })

  it('puts the device argument for VAAPI before the input and uploads frames in the graph', async () => {
    const t = setup({ hardware: 'vaapi' })
    await t.go()
    const args = t.calls[0]
    expect(args.indexOf('-vaapi_device')).toBeLessThan(args.indexOf('-i'))
    expect(args[args.indexOf('-filter_complex') + 1]).toContain('format=nv12,hwupload[vout]')
  })

  it('retries once in software when the hardware encoder fails, and says so', async () => {
    const t = setup({ hardware: 'nvenc' }, (args) => { if (args.includes('h264_nvenc')) throw new Error('No NVENC capable devices found') })
    await t.go()
    expect(t.calls).toHaveLength(2)
    expect(t.calls[1]).toContain('libx264')
    expect(t.calls[1]).not.toContain('h264_nvenc')
    expect(t.warn).toHaveBeenCalledWith(expect.stringContaining('No NVENC capable devices found'))
  })

  it('does not retry after a cancellation', async () => {
    const t = setup({ hardware: 'nvenc' }, () => { throw new Error('cancelled') })
    await expect(t.go()).rejects.toThrow('cancelled')
    expect(t.calls).toHaveLength(1)
  })

  it('fails with the software error when software fails too', async () => {
    const t = setup({ hardware: 'nvenc' }, (args) => { throw new Error(args.includes('libx264') ? 'disk full' : 'hw broke') })
    await expect(t.go()).rejects.toThrow('disk full')
  })

  it('never uses hardware for webm or gif', async () => {
    for (const format of ['webm', 'gif']) {
      const t = setup({ hardware: 'nvenc', format, outputPath: `/out.${format}` })
      await t.go()
      expect(t.calls[0]).not.toContain('h264_nvenc')
    }
  })

  it('keeps the subtitle intermediate in software and encodes the final pass in hardware', async () => {
    const style = { fontFamily: 'Arial', fontSize: 5, color: '#ffffff', outlineColor: '#000000', outlineWidth: 2, backgroundColor: '#000000', backgroundOpacity: 0, position: 'bottom', accentColor: '#22d3ee' }
    const t = setup({ hardware: 'nvenc', subtitles: { cues: [{ id: 1, start: 0, end: 1, text: 'hi' }], style, animation: 'sentence-fade' } })
    // the .ass is written to /w, which does not exist here
    const fs = (await import('fs')).default
    const spy = vi.spyOn(fs.promises, 'writeFile').mockResolvedValue()
    await t.go()
    spy.mockRestore()
    expect(t.calls[0]).toContain('libx264')
    expect(t.calls[1]).toContain('h264_nvenc')
  })
})

describe('exportVideo — stabilisation passes', () => {
  it('runs a detection pass to a null output before the main pass', async () => {
    const t = setup({ stabilize: 'normal' })
    await t.go()
    expect(t.calls).toHaveLength(2)
    expect(t.calls[0].slice(-3)).toEqual(['-f', 'null', '-'])
    expect(t.calls[0][t.calls[0].indexOf('-filter_complex') + 1]).toContain('vidstabdetect')
    expect(t.calls[1][t.calls[1].indexOf('-filter_complex') + 1]).toContain('vidstabtransform')
    expect(t.calls[1].at(-1)).toBe('/out.mp4')
  })

  it('uses the same motion file in both passes', async () => {
    const t = setup({ stabilize: 'light' })
    await t.go()
    const graph = (i) => t.calls[i][t.calls[i].indexOf('-filter_complex') + 1]
    expect(graph(0)).toContain('/w/motion.trf')
    expect(graph(1)).toContain('/w/motion.trf')
  })

  it('adds no pass when stabilisation is off', async () => {
    const t = setup({ stabilize: 'off' })
    await t.go()
    expect(t.calls).toHaveLength(1)
  })

  it('shares one progress bar across the passes', async () => {
    const t = setup({ stabilize: 'normal' }, async () => {})
    const seen = []
    const run = vi.fn(async (args, onProgress) => { onProgress(args.includes('null') ? 4 : 4); seen.push(args) })
    const progress = []
    await exportVideo({ run, probe, getFilterFfmpeg: () => '', sendProgress: p => progress.push(p), options: validateExportOptions({ ...base, stabilize: 'normal' }), workDir: '/w' })
    expect(progress).toEqual([50, 99]) // end of pass 1 of 2, then end of pass 2 (held back from 100)
    t.calls.length = 0
  })
})

describe('exportVideo — quality, resolution and GIF settings reach ffmpeg', () => {
  it('passes the quality as a CRF', async () => {
    const t = setup({ quality: 'high' })
    await t.go()
    expect(t.calls[0][t.calls[0].indexOf('-crf') + 1]).toBe('18')
  })

  it('caps the height in the filter chain, after speed and before the even guard', async () => {
    const t = setup({ resolution: 720, speed: 2 })
    await t.go()
    const graph = t.calls[0][t.calls[0].indexOf('-filter_complex') + 1]
    expect(graph).toMatch(/setpts=0\.5000\*PTS,scale=-2:'min\(720,ih\)',scale=trunc\(iw\/2\)\*2:trunc\(ih\/2\)\*2\[vout\]/)
  })

  it('does not cap the height of a GIF; uses its own width and frame rate', async () => {
    const t = setup({ format: 'gif', outputPath: '/o.gif', resolution: 720, gifWidth: 320, gifFps: 12 })
    await t.go()
    const graph = t.calls[0][t.calls[0].indexOf('-filter_complex') + 1]
    expect(graph).not.toContain("min(720,ih)")
    expect(graph).toContain("fps=12,scale='min(320,iw)'")
    expect(t.calls[0]).toContain('-loop')
  })
})
