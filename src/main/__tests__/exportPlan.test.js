import { describe, it, expect, vi } from 'vitest'
import { requireSrc } from './__doubles__/installElectron.js'

const {
  validateExportOptions, ensureExtension, expectedDuration, buildFilterComplex, finalOptions, burnOptions,
  createProgressTracker, gifTail, hardwareProfile, hardwareSetup, buildDetectGraph, stabilizeFilter,
} = requireSrc('main/lib/exportPlan.js')

const ok = {
  inputPath: '/in.mp4', outputPath: '/out.mp4', format: 'mp4',
  segments: [{ start: 0, end: 5 }], speed: 1, crop: null, filter: 'none',
  rotation: 0, straighten: 0, perspectiveH: 0, perspectiveV: 0, muted: false, subtitles: null,
}
const style = {
  fontFamily: 'Arial', fontSize: 5, color: '#ffffff', outlineColor: '#000000', outlineWidth: 2,
  backgroundColor: '#000000', backgroundOpacity: 0, position: 'bottom', accentColor: '#22d3ee',
}

describe('validateExportOptions', () => {
  it('returns a normalised copy of valid options', () => {
    expect(validateExportOptions(ok)).toMatchObject({ format: 'mp4', speed: 1, muted: false, subtitles: null })
  })

  it('fills defaults for optional numbers', () => {
    const { rotation, straighten, speed } = validateExportOptions({ ...ok, rotation: undefined, straighten: undefined, speed: undefined })
    expect([rotation, straighten, speed]).toEqual([0, 0, 1])
  })

  it('sorts segments by start', () => {
    const { segments } = validateExportOptions({ ...ok, segments: [{ start: 5, end: 6 }, { start: 0, end: 1 }] })
    expect(segments[0].start).toBe(0)
  })

  it.each([
    ['missing options', undefined],
    ['unknown format', { ...ok, format: 'exe' }],
    ['no input', { ...ok, inputPath: '' }],
    ['no output', { ...ok, outputPath: 3 }],
    ['string rotation', { ...ok, rotation: '0;x' }],
    ['NaN speed', { ...ok, speed: NaN }],
    ['speed too high', { ...ok, speed: 40 }],
    ['straighten out of range', { ...ok, straighten: 90 }],
    ['inverted segment', { ...ok, segments: [{ start: 3, end: 1 }] }],
    ['negative segment', { ...ok, segments: [{ start: -1, end: 1 }] }],
    ['non-numeric crop', { ...ok, crop: { x: 'a', y: 0, w: 10, h: 10 } }],
    ['non-string filter', { ...ok, filter: {} }],
  ])('rejects %s', (_name, options) => {
    expect(() => validateExportOptions(options)).toThrow()
  })

  it('explains that an empty segment list means everything was cut', () => {
    expect(() => validateExportOptions({ ...ok, segments: [] })).toThrow('Nothing to export')
  })

  describe('subtitles', () => {
    const subs = { cues: [{ id: 1, start: 0, end: 1, text: 'hi' }], style, animation: 'word-pop' }

    it('accepts valid subtitles and renumbers the cues', () => {
      expect(validateExportOptions({ ...ok, subtitles: subs }).subtitles.cues).toEqual([{ id: 1, start: 0, end: 1, text: 'hi' }])
    })

    it('treats an empty cue list as no subtitles', () => {
      expect(validateExportOptions({ ...ok, subtitles: { ...subs, cues: [] } }).subtitles).toBeNull()
    })

    it.each([
      ['font with a comma', { ...style, fontFamily: 'Arial,0,0' }],
      ['font with a newline', { ...style, fontFamily: 'Arial\nStyle: x' }],
      ['bad colour', { ...style, color: 'red' }],
      ['colour with an injected tag', { ...style, outlineColor: '#00000}{\\p1' }],
      ['bad position', { ...style, position: 'left' }],
      ['font size out of range', { ...style, fontSize: 999 }],
      ['opacity out of range', { ...style, backgroundOpacity: 5 }],
    ])('rejects %s', (_n, bad) => {
      expect(() => validateExportOptions({ ...ok, subtitles: { ...subs, style: bad } })).toThrow()
    })

    it('rejects an unknown animation and a malformed cue', () => {
      expect(() => validateExportOptions({ ...ok, subtitles: { ...subs, animation: 'explode' } })).toThrow('animation')
      expect(() => validateExportOptions({ ...ok, subtitles: { ...subs, cues: [{ start: 2, end: 1, text: 'x' }] } })).toThrow('cues')
    })

    it('accepts accented and CJK font names', () => {
      expect(() => validateExportOptions({ ...ok, subtitles: { ...subs, style: { ...style, fontFamily: 'Noto Sans 日本語' } } })).not.toThrow()
    })
  })
})

describe('ensureExtension', () => {
  it('adds the extension when missing or different', () => {
    expect(ensureExtension('/a/b', 'mp4')).toBe('/a/b.mp4')
    expect(ensureExtension('/a/b.webm', 'mp4')).toBe('/a/b.webm.mp4')
  })
  it('keeps a matching extension, whatever its case', () => {
    expect(ensureExtension('/a/b.MP4', 'mp4')).toBe('/a/b.MP4')
  })
})

describe('expectedDuration', () => {
  it('sums the kept parts and divides by speed', () => {
    expect(expectedDuration([{ start: 0, end: 2 }, { start: 5, end: 9 }], 2)).toBe(3)
  })
})

describe('buildFilterComplex', () => {
  const base = { segments: [{ start: 0, end: 2 }, { start: 5, end: 8.5 }], videoChain: ['scale=trunc(iw/2)*2:trunc(ih/2)*2'], speed: 1, withAudio: true }

  it('trims, concatenates and maps both streams', () => {
    const g = buildFilterComplex(base)
    expect(g).toBe([
      '[0:v]trim=start=0.000:end=2.000,setpts=PTS-STARTPTS[v0]',
      '[0:a]atrim=start=0.000:end=2.000,asetpts=PTS-STARTPTS[a0]',
      '[0:v]trim=start=5.000:end=8.500,setpts=PTS-STARTPTS[v1]',
      '[0:a]atrim=start=5.000:end=8.500,asetpts=PTS-STARTPTS[a1]',
      '[v0][a0][v1][a1]concat=n=2:v=1:a=1[vc][ac]',
      '[vc]scale=trunc(iw/2)*2:trunc(ih/2)*2[vout]',
      '[ac]anull[aout]',
    ].join(';'))
  })

  it('has no audio branch when there is no audio', () => {
    const g = buildFilterComplex({ ...base, withAudio: false })
    expect(g).not.toContain('atrim')
    expect(g).toContain('concat=n=2:v=1:a=0[vc]')
    expect(g).not.toContain('[aout]')
  })

  it('speeds the audio up with a chained atempo beyond 2x', () => {
    expect(buildFilterComplex({ ...base, speed: 4 })).toContain('[ac]atempo=2.0,atempo=2.0000[aout]')
  })

  it('appends the palette pipeline for gif', () => {
    const g = buildFilterComplex({ ...base, withAudio: false, gif: gifTail() })
    expect(g).toMatch(/fps=15,scale='min\(480,iw\)':-1:flags=lanczos,split\[s0\]\[s1\];\[s0\]palettegen=max_colors=256:stats_mode=diff\[p\];\[s1\]\[p\]paletteuse=.*diff_mode=rectangle\[vout\]$/)
  })

  it('puts the stabilisation filter before the rest of the chain', () => {
    const g = buildFilterComplex({ ...base, stabilize: 'vidstabtransform=input=/t.trf' })
    expect(g).toContain('[vc]vidstabtransform=input=/t.trf,scale=trunc(iw/2)*2:trunc(ih/2)*2[vout]')
  })

  it('appends a hardware upload filter after the chain', () => {
    expect(buildFilterComplex({ ...base, hardwareFilter: 'format=nv12,hwupload' })).toContain('[vc]scale=trunc(iw/2)*2:trunc(ih/2)*2,format=nv12,hwupload[vout]')
  })

  it('does not append the hardware filter to a GIF (palette pipeline last)', () => {
    expect(buildFilterComplex({ ...base, withAudio: false, gif: gifTail(), hardwareFilter: 'hwupload' })).not.toContain('hwupload')
  })
})

describe('encoder options', () => {
  const has = (opts, flag, value) => opts.some((o, i) => o === flag && (value === undefined || opts[i + 1] === value))

  it('uses x264 + AAC + faststart for mp4/mov', () => {
    for (const f of ['mp4', 'mov']) {
      const o = finalOptions(f)
      expect(has(o, '-c:v', 'libx264')).toBe(true)
      expect(has(o, '-pix_fmt', 'yuv420p')).toBe(true)
      expect(has(o, '-c:a', 'aac')).toBe(true)
      expect(has(o, '-movflags', '+faststart')).toBe(true)
    }
  })
  it('uses MP3 audio for avi (AAC-in-AVI is poorly supported)', () => {
    expect(has(finalOptions('avi'), '-c:a', 'libmp3lame')).toBe(true)
  })
  it('uses multithreaded VP9 + Opus for webm', () => {
    const o = finalOptions('webm')
    expect(has(o, '-c:v', 'libvpx-vp9') && has(o, '-row-mt', '1') && has(o, '-c:a', 'libopus')).toBe(true)
  })
  it('sets no codec for gif', () => {
    expect(finalOptions('gif')).toEqual([])
  })

  describe('quality', () => {
    it.each([['high', '18'], ['balanced', '22'], ['small', '28']])('%s uses x264 CRF %s', (quality, crf) => {
      expect(has(finalOptions('mp4', { quality }), '-crf', crf)).toBe(true)
    })
    it.each([['high', '24'], ['balanced', '30'], ['small', '37']])('%s uses VP9 CRF %s', (quality, crf) => {
      expect(has(finalOptions('webm', { quality }), '-crf', crf)).toBe(true)
    })
    it('smaller means a lower audio bitrate and a slower x264 preset', () => {
      const small = finalOptions('mp4', { quality: 'small' })
      expect(has(small, '-b:a', '128k')).toBe(true)
      expect(has(small, '-preset', 'medium')).toBe(true)
      expect(has(finalOptions('mp4', { quality: 'high' }), '-b:a', '256k')).toBe(true)
    })
    it('falls back to balanced for an unknown level', () => {
      expect(finalOptions('mp4', { quality: 'weird' })).toEqual(finalOptions('mp4', { quality: 'balanced' }))
    })
    it('crf only ever goes up as quality goes down', () => {
      const crf = (q) => Number(finalOptions('mp4', { quality: q })[finalOptions('mp4', { quality: q }).indexOf('-crf') + 1])
      expect(crf('high')).toBeLessThan(crf('balanced'))
      expect(crf('balanced')).toBeLessThan(crf('small'))
    })
  })

  describe('hardware', () => {
    it.each([['videotoolbox', 'h264_videotoolbox'], ['nvenc', 'h264_nvenc'], ['qsv', 'h264_qsv'], ['vaapi', 'h264_vaapi']])('%s encodes with %s', (id, codec) => {
      expect(has(finalOptions('mp4', { hardware: id }), '-c:v', codec)).toBe(true)
    })
    it('keeps AAC audio and faststart with a hardware video encoder', () => {
      const o = finalOptions('mp4', { hardware: 'nvenc' })
      expect(has(o, '-c:a', 'aac') && has(o, '-movflags', '+faststart')).toBe(true)
    })
    it('never applies to webm or gif', () => {
      expect(has(finalOptions('webm', { hardware: 'nvenc' }), '-c:v', 'libvpx-vp9')).toBe(true)
      expect(finalOptions('gif', { hardware: 'nvenc' })).toEqual([])
    })
    it('VAAPI needs a device and an upload filter, the others need neither', () => {
      expect(hardwareSetup('mp4', 'vaapi')).toEqual({ inputArgs: ['-vaapi_device', '/dev/dri/renderD128'], filter: 'format=nv12,hwupload' })
      expect(hardwareSetup('mp4', 'videotoolbox')).toEqual({ inputArgs: [], filter: '' })
      expect(hardwareSetup('webm', 'vaapi')).toEqual({ inputArgs: [], filter: '' })
      expect(hardwareSetup('mp4', null)).toEqual({ inputArgs: [], filter: '' })
    })
    it('quality changes the hardware quantizer', () => {
      expect(hardwareProfile('nvenc', 'high').args).toContain('19')
      expect(hardwareProfile('nvenc', 'small').args).toContain('30')
    })
    it('rejects an unknown encoder', () => {
      expect(() => hardwareProfile('quantum')).toThrow('Unknown hardware encoder')
    })
  })

  it('burn pass copies audio for mp4/mov and carries the subtitles filter', () => {
    const { videoFilter, options } = burnOptions('mp4', 'subtitles=/x.ass')
    expect(videoFilter).toBe('subtitles=/x.ass')
    expect(has(options, '-c:a', 'copy')).toBe(true)
  })
  it('burn pass chains the palette after the subtitles for gif', () => {
    expect(burnOptions('gif', 'subtitles=/x.ass').videoFilter).toMatch(/^subtitles=\/x\.ass,fps=15/)
  })
  it('burn pass uses the requested GIF settings', () => {
    expect(burnOptions('gif', 'subtitles=/x.ass', { gif: gifTail({ width: 320, fps: 10, quality: 'small' }) }).videoFilter).toMatch(/fps=10,scale='min\(320,iw\)'.*max_colors=128/)
  })
  it('burn pass can encode in hardware, uploading after the subtitles', () => {
    const burn = burnOptions('mp4', 'subtitles=/x.ass', { hardware: 'vaapi' })
    expect(burn.videoFilter).toBe('subtitles=/x.ass,format=nv12,hwupload')
    expect(burn.inputArgs).toEqual(['-vaapi_device', '/dev/dri/renderD128'])
    expect(has(burn.options, '-c:v', 'h264_vaapi')).toBe(true)
  })
})

describe('gifTail', () => {
  it('caps the width at the source size and sets the frame rate', () => {
    expect(gifTail({ width: 640, fps: 20 })).toContain("fps=20,scale='min(640,iw)':-1:flags=lanczos")
  })
  it.each([['high', '256', 'sierra2_4a'], ['balanced', '256', 'bayer:bayer_scale=3'], ['small', '128', 'bayer:bayer_scale=5']])('%s: %s colours, %s dithering', (quality, colors, dither) => {
    const t = gifTail({ quality })
    expect(t).toContain(`max_colors=${colors}`)
    expect(t).toContain(`dither=${dither}`)
  })
  it('weights the palette towards motion and re-encodes only what changed', () => {
    expect(gifTail()).toContain('stats_mode=diff')
    expect(gifTail()).toContain('diff_mode=rectangle')
  })
})

describe('stabilisation graphs', () => {
  const segs = [{ start: 0, end: 2 }, { start: 5, end: 8 }]
  it('detects over the joined kept footage, video only', () => {
    const g = buildDetectGraph({ segments: segs, trf: '/w/motion.trf', level: 'normal' })
    expect(g).toContain('[0:v]trim=start=0.000:end=2.000')
    expect(g).toContain('concat=n=2:v=1:a=0[vc]')
    expect(g).toContain('vidstabdetect=shakiness=6:accuracy=9:result=/w/motion.trf[vo]')
    expect(g).not.toContain('atrim')
  })
  it.each([['light', 4, 8], ['normal', 6, 15], ['strong', 8, 30]])('%s: shakiness %i, smoothing %i', (level, shakiness, smoothing) => {
    expect(buildDetectGraph({ segments: segs, trf: '/t', level })).toContain(`shakiness=${shakiness}`)
    expect(stabilizeFilter({ trf: '/t', level })).toContain(`smoothing=${smoothing}`)
  })
  it('escapes an awkward scratch path in both passes', () => {
    const trf = "/tmp/it's a,dir/motion.trf"
    expect(buildDetectGraph({ segments: segs, trf, level: 'light' })).toContain(String.raw`result=/tmp/it\\\'s\ a\,dir/motion.trf`)
    expect(stabilizeFilter({ trf, level: 'light' })).toContain(String.raw`input=/tmp/it\\\'s\ a\,dir/motion.trf`)
  })
  it('zooms adaptively to hide the moving borders', () => {
    expect(stabilizeFilter({ trf: '/t', level: 'normal' })).toContain('optzoom=1')
  })
})

describe('new export options', () => {
  it('default to balanced quality, original size, no stabilisation, software', () => {
    expect(validateExportOptions(ok)).toMatchObject({ quality: 'balanced', resolution: null, stabilize: 'off', hardware: null, gifWidth: 480, gifFps: 15 })
  })
  it('accepts every choice the UI offers', () => {
    expect(validateExportOptions({ ...ok, quality: 'small', resolution: 720, stabilize: 'strong', hardware: 'vaapi', gifWidth: 320, gifFps: 10 }))
      .toMatchObject({ quality: 'small', resolution: 720, stabilize: 'strong', hardware: 'vaapi', gifWidth: 320, gifFps: 10 })
  })
  it.each([
    ['unknown quality', { quality: 'ultra' }],
    ['unknown stabilisation', { stabilize: 'max' }],
    ['unknown encoder', { hardware: 'h264_nvenc; rm -rf /' }],
    ['tiny resolution', { resolution: 10 }],
    ['text resolution', { resolution: '720;x' }],
    ['huge gif width', { gifWidth: 99999 }],
    ['zero gif fps', { gifFps: 0 }],
  ])('rejects %s', (_n, extra) => {
    expect(() => validateExportOptions({ ...ok, ...extra })).toThrow()
  })
  it('takes a social format, and none by default', () => {
    expect(validateExportOptions(ok).reframe).toBeNull()
    expect(validateExportOptions({ ...ok, reframe: { aspect: '9:16', mode: 'blur' } }).reframe).toEqual({ aspect: '9:16', mode: 'blur' })
  })
  it.each([
    ['unknown ratio', { aspect: '21:9', mode: 'blur' }],
    ['injected ratio', { aspect: "1:1,drawtext=text='x'", mode: 'crop' }],
    ['unknown mode', { aspect: '1:1', mode: 'stretch' }],
  ])('rejects a social format with an %s', (_n, reframe) => {
    expect(() => validateExportOptions({ ...ok, reframe })).toThrow(/reframe/)
  })
  it('null means "use the default" for resolution and hardware', () => {
    expect(validateExportOptions({ ...ok, resolution: null, hardware: null })).toMatchObject({ resolution: null, hardware: null })
  })
})

describe('createProgressTracker', () => {
  it('maps a single pass onto 0-99 and never reaches 100 by itself', () => {
    const send = vi.fn()
    const report = createProgressTracker(send)
    report(0, 1, 5, 10)
    report(0, 1, 10, 10)
    expect(send.mock.calls.map(c => c[0])).toEqual([50, 99])
  })

  it('splits the bar between two passes', () => {
    const send = vi.fn()
    const report = createProgressTracker(send)
    report(0, 2, 10, 10)
    report(1, 2, 5, 10)
    expect(send.mock.calls.map(c => c[0])).toEqual([50, 75])
  })

  it('never goes backwards and skips repeated values', () => {
    const send = vi.fn()
    const report = createProgressTracker(send)
    report(0, 1, 6, 10)
    report(0, 1, 3, 10)
    report(0, 1, 6, 10)
    expect(send.mock.calls.map(c => c[0])).toEqual([60])
  })

  it('tolerates an unknown total', () => {
    const send = vi.fn()
    createProgressTracker(send)(0, 1, 5, 0)
    expect(send).toHaveBeenCalledWith(0)
  })
})
