import { describe, it, expect } from 'vitest'
import {
  parseSrt, splitWordsProportional, splitCharsProportional, assColor, assColorTag,
  expandCuesToEvents, remapEventsToKeptSegments, toAssTime, buildAssContent, buildSubtitlesFilter,
} from '../lib/subtitles.js'

describe('parseSrt', () => {
  it('parses a well-formed SRT file', () => {
    const content = '1\n00:00:00,000 --> 00:00:02,680\nHello world.\n\n2\n00:00:02,680 --> 00:00:03,880\nSecond line.\n'
    const cues = parseSrt(content)
    expect(cues).toHaveLength(2)
    expect(cues[0]).toEqual({ id: 1, start: 0, end: 2.68, text: 'Hello world.' })
    expect(cues[1].text).toBe('Second line.')
  })

  it('skips malformed blocks and empty input', () => {
    expect(parseSrt('garbage\nno timestamp\n')).toHaveLength(0)
    expect(parseSrt('')).toEqual([])
  })
})

describe('splitWordsProportional', () => {
  it('splits duration proportionally to word length', () => {
    const out = splitWordsProportional({ start: 0, end: 6, text: 'a bb ccc' })
    expect(out.map(w => w.text)).toEqual(['a', 'bb', 'ccc'])
    expect(out[0].end - out[0].start).toBeCloseTo(1)
    expect(out[1].end - out[1].start).toBeCloseTo(2)
    expect(out[2].end - out[2].start).toBeCloseTo(3)
    expect(out[out.length - 1].end).toBe(6)
  })

  it('returns empty array for blank text', () => {
    expect(splitWordsProportional({ start: 0, end: 1, text: '  ' })).toEqual([])
  })
})

describe('splitCharsProportional', () => {
  it('produces cumulative text per character with equal duration split', () => {
    const out = splitCharsProportional({ start: 0, end: 3, text: 'abc' })
    expect(out.map(w => w.text)).toEqual(['a', 'ab', 'abc'])
    expect(out[0].end).toBeCloseTo(1)
    expect(out[out.length - 1].end).toBe(3)
  })
})

describe('assColor', () => {
  it('encodes opaque white', () => {
    expect(assColor('#FFFFFF', 1)).toBe('&H00FFFFFF')
  })

  it('encodes opaque black', () => {
    expect(assColor('#000000', 1)).toBe('&H00000000')
  })

  it('encodes fully transparent as FF alpha', () => {
    expect(assColor('#000000', 0)).toBe('&HFF000000')
  })

  it('uses BGR byte order', () => {
    // pure red (#FF0000) -> R=FF G=00 B=00 -> &HAA BB GG RR = &H000000FF
    expect(assColor('#FF0000', 1)).toBe('&H000000FF')
  })

  it('clamps out-of-range alpha', () => {
    expect(assColor('#FFFFFF', 2)).toBe('&H00FFFFFF')
    expect(assColor('#FFFFFF', -1)).toBe('&HFFFFFFFF')
  })
})

describe('assColorTag', () => {
  it('encodes without alpha, trailing ampersand, BGR order', () => {
    expect(assColorTag('#FF0000')).toBe('&H0000FF&')
  })
})

describe('toAssTime', () => {
  it('formats zero', () => {
    expect(toAssTime(0)).toBe('0:00:00.00')
  })

  it('formats minutes/seconds/centiseconds', () => {
    expect(toAssTime(65.5)).toBe('0:01:05.50')
  })

  it('formats hours', () => {
    expect(toAssTime(3661.25)).toBe('1:01:01.25')
  })

  it('does not overflow centiseconds on rounding', () => {
    expect(toAssTime(1.999)).toBe('0:00:02.00')
  })
})

describe('expandCuesToEvents', () => {
  const cue = { id: 1, start: 0, end: 2, text: 'hi there' }

  it('word-pop produces one event per word with pop tags', () => {
    const events = expandCuesToEvents([cue], 'word-pop', {})
    expect(events).toHaveLength(2)
    expect(events[0].text).toContain('\\fscx60')
    expect(events[0].text).toContain('hi')
  })

  it('word-bounce produces one event per word with a scale punch tag', () => {
    const events = expandCuesToEvents([cue], 'word-bounce', {})
    expect(events).toHaveLength(2)
    expect(events[0].text).toContain('\\fscx135')
    expect(events[0].text).toContain('hi')
  })

  it('rainbow produces one event per cue with each word in a distinct color', () => {
    const events = expandCuesToEvents([cue], 'rainbow', {})
    expect(events).toHaveLength(1)
    expect(events[0].text).toContain('\\fad(200,200)')
    expect(events[0].text).toContain('\\1c&H5C3BFF&') // RAINBOW_PALETTE[0] #FF3B5C -> BGR
    expect(events[0].text).toContain('\\1c&H00B8FF&') // RAINBOW_PALETTE[1] #FFB800 -> BGR
    expect(events[0].text).toContain('hi')
    expect(events[0].text).toContain('there')
  })

  it('typewriter produces cumulative per-character events', () => {
    const events = expandCuesToEvents([cue], 'typewriter', {})
    expect(events.length).toBe(Array.from(cue.text).length)
    expect(events[events.length - 1].text).toBe('hi there')
  })

  it('word-highlight produces one event per word with the active word colored', () => {
    const events = expandCuesToEvents([cue], 'word-highlight', { color: '#ffffff', accentColor: '#22d3ee' })
    expect(events).toHaveLength(2)
    expect(events[0].text).toContain('\\1c&HEED322&') // accentColor #22d3ee -> BGR (b=ee,g=d3,r=22)
    expect(events[0].text).toContain('hi')
    expect(events[0].text).toContain('there')
  })

  it('sentence-fade produces one event per cue with fad tag', () => {
    const events = expandCuesToEvents([cue], 'sentence-fade', {})
    expect(events).toHaveLength(1)
    expect(events[0].text).toContain('\\fad(200,200)')
    expect(events[0].start).toBe(0)
    expect(events[0].end).toBe(2)
  })

  it('sentence-slide produces one event per cue with move+fad tags', () => {
    const events = expandCuesToEvents([cue], 'sentence-slide', { videoWidth: 1920, videoHeight: 1080, position: 'bottom' })
    expect(events).toHaveLength(1)
    expect(events[0].text).toContain('\\move(')
    expect(events[0].text).toContain('\\fad(300,0)')
  })
})

describe('remapEventsToKeptSegments', () => {
  it('shifts an event fully inside a single kept segment', () => {
    const kept = [{ start: 0, end: 10 }]
    const out = remapEventsToKeptSegments([{ start: 2, end: 4, text: 'x' }], kept)
    expect(out).toEqual([{ start: 2, end: 4, text: 'x' }])
  })

  it('drops an event fully inside a cut region', () => {
    const kept = [{ start: 0, end: 5 }, { start: 10, end: 20 }]
    const out = remapEventsToKeptSegments([{ start: 6, end: 8, text: 'x' }], kept)
    expect(out).toEqual([])
  })

  it('shifts an event in a later kept segment by the cumulative duration of prior segments', () => {
    const kept = [{ start: 0, end: 5 }, { start: 10, end: 20 }]
    const out = remapEventsToKeptSegments([{ start: 12, end: 14, text: 'x' }], kept)
    // virtual offset after first segment = 5; event at real 12-14 -> real offset within seg = 2-4 -> virtual 7-9
    expect(out).toEqual([{ start: 7, end: 9, text: 'x' }])
  })

  it('splits an event straddling a cut boundary into two sub-events', () => {
    const kept = [{ start: 0, end: 5 }, { start: 10, end: 20 }]
    const out = remapEventsToKeptSegments([{ start: 3, end: 12, text: 'x' }], kept)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ start: 3, end: 5, text: 'x' })
    expect(out[1]).toEqual({ start: 5, end: 7, text: 'x' })
  })
})

describe('buildAssContent', () => {
  const style = {
    fontFamily: 'Arial', fontSize: 5, color: '#ffffff', outlineColor: '#000000',
    outlineWidth: 2, backgroundColor: '#000000', backgroundOpacity: 0, position: 'bottom',
  }

  it('includes PlayRes matching the given video dimensions', () => {
    const out = buildAssContent([], style, 1920, 1080)
    expect(out).toContain('PlayResX: 1920')
    expect(out).toContain('PlayResY: 1080')
  })

  it('uses BorderStyle 1 (outline only) when background opacity is 0', () => {
    const out = buildAssContent([], style, 1920, 1080)
    // ...Angle=0,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginL=20,MarginR=20,MarginV,Encoding=1
    expect(out).toMatch(/,0,0,1,2,1,2,20,20,\d+,1\n/)
  })

  it('uses BorderStyle 3 (opaque box) when background opacity is set', () => {
    const out = buildAssContent([], { ...style, backgroundOpacity: 0.5 }, 1920, 1080)
    expect(out).toMatch(/,0,0,3,2,1,2,20,20,\d+,1\n/)
  })

  it('maps position to the correct ASS alignment', () => {
    expect(buildAssContent([], { ...style, position: 'top' }, 1920, 1080)).toMatch(/,0,0,1,2,1,8,20,20,/)
    expect(buildAssContent([], { ...style, position: 'middle' }, 1920, 1080)).toMatch(/,0,0,1,2,1,5,20,20,/)
    expect(buildAssContent([], { ...style, position: 'bottom' }, 1920, 1080)).toMatch(/,0,0,1,2,1,2,20,20,/)
  })

  it('emits one Dialogue line per event', () => {
    const out = buildAssContent([{ start: 0, end: 1, text: 'hi' }, { start: 1, end: 2, text: 'there' }], style, 1920, 1080)
    expect((out.match(/^Dialogue:/gm) || [])).toHaveLength(2)
  })
})

describe('buildSubtitlesFilter', () => {
  it('escapes a simple unix path', () => {
    expect(buildSubtitlesFilter('/tmp/lc_subs.ass')).toBe("subtitles='/tmp/lc_subs.ass'")
  })

  it('escapes a Windows-style path with drive-letter colon and backslashes', () => {
    const out = buildSubtitlesFilter('C:\\Users\\foo\\lc_subs.ass')
    expect(out).toBe("subtitles='C\\:\\\\Users\\\\foo\\\\lc_subs.ass'")
  })

  it('escapes single quotes in the path', () => {
    expect(buildSubtitlesFilter("/tmp/it's.ass")).toBe("subtitles='/tmp/it\\'s.ass'")
  })
})
