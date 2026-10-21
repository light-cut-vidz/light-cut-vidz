import { describe, it, expect, vi } from 'vitest'
import { requireSrc } from './__doubles__/installElectron.js'

const {
  validateExportOptions, ensureExtension, expectedDuration, buildFilterComplex, finalOptions, burnOptions,
  createProgressTracker,
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
    const g = buildFilterComplex({ ...base, withAudio: false, gif: true })
    expect(g).toMatch(/fps=15,scale=480:-1:flags=lanczos,split\[s0\]\[s1\];\[s0\]palettegen\[p\];\[s1\]\[p\]paletteuse\[vout\]$/)
  })
})

describe('encoder options', () => {
  it('uses x264 + AAC + faststart for mp4/mov', () => {
    for (const f of ['mp4', 'mov']) {
      const o = finalOptions(f)
      expect(o).toEqual(expect.arrayContaining(['-c:v libx264', '-pix_fmt yuv420p', '-c:a aac', '-movflags +faststart']))
    }
  })
  it('uses MP3 audio for avi (AAC-in-AVI is poorly supported)', () => {
    expect(finalOptions('avi')).toContain('-c:a libmp3lame')
  })
  it('uses multithreaded VP9 + Opus for webm', () => {
    expect(finalOptions('webm')).toEqual(expect.arrayContaining(['-c:v libvpx-vp9', '-row-mt 1', '-c:a libopus']))
  })
  it('sets no codec for gif', () => {
    expect(finalOptions('gif')).toEqual([])
  })
  it('burn pass copies audio for mp4/mov and carries the subtitles filter', () => {
    const { videoFilter, options } = burnOptions('mp4', 'subtitles=/x.ass')
    expect(videoFilter).toBe('subtitles=/x.ass')
    expect(options).toContain('-c:a copy')
  })
  it('burn pass chains the palette after the subtitles for gif', () => {
    expect(burnOptions('gif', 'subtitles=/x.ass').videoFilter).toMatch(/^subtitles=\/x\.ass,fps=15/)
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
