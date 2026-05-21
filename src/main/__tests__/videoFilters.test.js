import { describe, it, expect } from 'vitest'
import {
  rotationFilter, perspectiveFilter, cropFilter, speedFilter, buildVideoFilters,
} from '../lib/videoFilters.js'

describe('rotationFilter', () => {
  it('returns null for 0', () => {
    expect(rotationFilter(0)).toBeNull()
  })

  it('uses transpose=1 for 90', () => {
    expect(rotationFilter(90)).toBe('transpose=1')
  })

  it('uses double transpose for 180', () => {
    expect(rotationFilter(180)).toBe('transpose=1,transpose=1')
  })

  it('uses transpose=2 for 270', () => {
    expect(rotationFilter(270)).toBe('transpose=2')
  })

  it('uses transpose=2 for -90', () => {
    expect(rotationFilter(-90)).toBe('transpose=2')
  })

  it('falls back to rotate filter for arbitrary angles', () => {
    const out = rotationFilter(15)
    expect(out).toContain('rotate=15*PI/180')
    expect(out).toContain('ow=rotw(15*PI/180)')
    expect(out).toContain('oh=roth(15*PI/180)')
  })
})

describe('perspectiveFilter', () => {
  it('returns null when both perspectives are 0', () => {
    expect(perspectiveFilter(0, 0)).toBeNull()
  })

  it('produces a horizontal perspective for h-only', () => {
    const out = perspectiveFilter(20, 0)
    expect(out).toMatch(/^perspective=/)
    expect(out).toContain('sense=destination')
  })

  it('produces a vertical perspective for v-only', () => {
    const out = perspectiveFilter(0, 20)
    expect(out).toMatch(/^perspective=/)
    expect(out).toContain('sense=destination')
  })

  it('produces a combined perspective when both axes are set', () => {
    const out = perspectiveFilter(15, 25)
    expect(out).toMatch(/^perspective=/)
    expect(out).toContain('sense=destination')
  })
})

describe('cropFilter', () => {
  it('returns null when crop is null', () => {
    expect(cropFilter(null)).toBeNull()
  })

  it('rounds each component to nearest integer', () => {
    expect(cropFilter({ x: 1.4, y: 2.6, w: 100.5, h: 50.5 })).toBe('crop=101:51:1:3')
  })

  it('handles zero offsets', () => {
    expect(cropFilter({ x: 0, y: 0, w: 320, h: 240 })).toBe('crop=320:240:0:0')
  })
})

describe('speedFilter', () => {
  it('returns null at normal speed (1)', () => {
    expect(speedFilter(1)).toBeNull()
  })

  it('inverts speed for setpts (2x → 0.5)', () => {
    expect(speedFilter(2)).toBe('setpts=0.5000*PTS')
  })

  it('inverts speed for half speed (0.5x → 2.0)', () => {
    expect(speedFilter(0.5)).toBe('setpts=2.0000*PTS')
  })

  it('handles 4x', () => {
    expect(speedFilter(4)).toBe('setpts=0.2500*PTS')
  })
})

describe('buildVideoFilters', () => {
  it('returns empty array with no transformations', () => {
    expect(buildVideoFilters()).toEqual([])
  })

  it('returns empty array when all options are defaults', () => {
    expect(buildVideoFilters({ rotation: 0, straighten: 0, perspectiveH: 0, perspectiveV: 0, crop: null, colorFilter: '', speed: 1 })).toEqual([])
  })

  it('combines all filters in the correct order', () => {
    const out = buildVideoFilters({
      rotation: 90,
      perspectiveH: 10,
      crop: { x: 0, y: 0, w: 100, h: 100 },
      colorFilter: 'hue=s=0',
      speed: 2,
    })
    expect(out).toHaveLength(5)
    expect(out[0]).toBe('transpose=1')
    expect(out[1]).toMatch(/^perspective=/)
    expect(out[2]).toBe('crop=100:100:0:0')
    expect(out[3]).toBe('hue=s=0')
    expect(out[4]).toBe('setpts=0.5000*PTS')
  })

  it('adds straighten to rotation', () => {
    const out = buildVideoFilters({ rotation: 90, straighten: 0 })
    expect(out[0]).toBe('transpose=1')
  })

  it('skips color filter when empty string', () => {
    const out = buildVideoFilters({ crop: { x: 0, y: 0, w: 10, h: 10 }, colorFilter: '' })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatch(/^crop=/)
  })

  it('treats falsy crop, no color, default speed/rotation as empty', () => {
    expect(buildVideoFilters({ crop: null })).toEqual([])
  })
})
