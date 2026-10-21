import { describe, it, expect } from 'vitest'
import { toProject, fromProjectState } from '../utils/project'
import { defaultEditable } from '../hooks/useHistory'

describe('toProject', () => {
  it('pairs the video path with the edits', () => {
    expect(toProject('/a.mp4', defaultEditable)).toEqual({ videoPath: '/a.mp4', state: defaultEditable })
  })
})

describe('fromProjectState', () => {
  const full = {
    speed: 1.5, muted: true, crop: { x: 1, y: 2, w: 30, h: 40 }, filter: 'sepia', rotation: 90, straighten: 5,
    perspectiveHorizontal: 10, perspectiveVertical: -10,
    cutSegments: [{ id: 'a', start: 1, end: 2 }],
    subtitles: { fileName: 's.srt', animation: 'word-pop', cues: [{ id: 9, start: 0, end: 1, text: 'hi' }], style: { fontFamily: 'Arial' } },
  }

  it('restores a complete state', () => {
    const s = fromProjectState(full)
    expect(s).toMatchObject({ speed: 1.5, muted: true, filter: 'sepia', rotation: 90, straighten: 5, crop: full.crop })
    expect(s.cutSegments).toEqual(full.cutSegments)
    expect(s.subtitles?.cues).toEqual([{ id: 1, start: 0, end: 1, text: 'hi' }])
  })

  it('falls back to defaults for anything that is not an object', () => {
    for (const bad of [null, 3, 'x', [], undefined]) expect(fromProjectState(bad)).toEqual(defaultEditable)
  })

  it('replaces wrong or out-of-range values by their defaults', () => {
    const s = fromProjectState({ speed: 99, rotation: 'x', straighten: 500, perspectiveHorizontal: NaN, muted: 'yes', filter: 5 })
    expect(s).toMatchObject({ speed: 1, rotation: 0, straighten: 0, perspectiveHorizontal: 0, muted: false, filter: 'none' })
  })

  it('drops malformed cuts, crop and cues instead of passing them on', () => {
    const s = fromProjectState({
      crop: { x: 'a', y: 0, w: 1, h: 1 },
      cutSegments: [{ start: 5, end: 1 }, { start: 'x' }, null, { start: 2, end: 3 }],
      subtitles: { cues: [{ start: 3, end: 1, text: 'bad' }], style: {}, animation: 'word-pop' },
    })
    expect(s.crop).toBeNull()
    expect(s.cutSegments).toHaveLength(1)
    expect(s.cutSegments[0]).toMatchObject({ start: 2, end: 3 })
    expect(s.subtitles).toBeNull()
  })
})

describe('stabilisation in a project', () => {
  it.each(['light', 'normal', 'strong'])('restores %s', (level) => {
    expect(fromProjectState({ stabilize: level }).stabilize).toBe(level)
  })
  it.each([['off'], ['max'], [3], [null], [undefined]])('falls back to off for %j', (v) => {
    expect(fromProjectState({ stabilize: v }).stabilize).toBe('off')
  })
  it('is off by default', () => {
    expect(defaultEditable.stabilize).toBe('off')
    expect(fromProjectState(null).stabilize).toBe('off')
  })
})
