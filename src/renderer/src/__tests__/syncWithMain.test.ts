// The main process (CommonJS) and the renderer (TypeScript) each carry a copy of
// a few tables, with "keep in sync" comments. This is the check that enforces it.
import { describe, it, expect } from 'vitest'
import { createRequire } from 'module'
import { VIDEO_FILTERS } from '../utils/filters'
import { RAINBOW_PALETTE, getWordWindows, getCharWindows } from '../utils/subtitles'
import { VIDEO_EXTENSIONS } from '../utils/video'

const req = createRequire(import.meta.url)
const main = {
  filters: req('../../../main/filters.js') as { getFilterFfmpeg: (id: string) => string },
  subtitles: req('../../../main/lib/subtitles.js') as {
    RAINBOW_PALETTE: string[]
    splitWordsProportional: (c: unknown) => unknown
    splitCharsProportional: (c: unknown) => unknown
  },
  menu: req('../../../main/lib/menu.js') as { VIDEO_EXTENSIONS: string[] },
}

describe('main/renderer parity', () => {
  it('every filter maps to the same ffmpeg chain on both sides', () => {
    for (const f of VIDEO_FILTERS) expect(main.filters.getFilterFfmpeg(f.id), f.id).toBe(f.ffmpeg)
  })

  it('an unknown filter id means "no filter" on both sides', () => {
    expect(main.filters.getFilterFfmpeg('nope')).toBe('')
  })

  it('the rainbow palette is identical', () => {
    expect(main.subtitles.RAINBOW_PALETTE).toEqual(RAINBOW_PALETTE)
  })

  it('word and character timing use the same split', () => {
    const cue = { id: 1, start: 1, end: 4, text: 'hello brave new world' }
    expect(main.subtitles.splitWordsProportional(cue)).toEqual(getWordWindows(cue))
    expect(main.subtitles.splitCharsProportional(cue)).toEqual(getCharWindows(cue))
  })

  it('both sides accept the same video extensions', () => {
    expect(main.menu.VIDEO_EXTENSIONS).toEqual(VIDEO_EXTENSIONS)
  })
})
