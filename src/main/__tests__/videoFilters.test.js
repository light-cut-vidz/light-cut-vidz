import { describe, it, expect } from 'vitest'
import { requireSrc } from './__doubles__/installElectron.js'
const { toEven, rotationFilter, perspectiveFilter, cropFilter, speedFilter, buildVideoFilters, EVEN_DIMENSIONS, } = requireSrc('main/lib/videoFilters.js')

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

describe('toEven', () => {
  it('leaves even values untouched', () => {
    expect(toEven(320)).toBe(320)
    expect(toEven(2)).toBe(2)
  })

  it('rounds odd values down, never up past the source frame', () => {
    expect(toEven(301)).toBe(300)
    expect(toEven(1)).toBe(2)
  })

  it('rounds fractional values to the nearest integer first', () => {
    expect(toEven(100.5)).toBe(100)
    expect(toEven(101.6)).toBe(102)
  })

  it('never returns less than 2', () => {
    expect(toEven(0)).toBe(2)
    expect(toEven(-8)).toBe(2)
  })
})

describe('cropFilter', () => {
  it('returns null when crop is null', () => {
    expect(cropFilter(null)).toBeNull()
  })

  // Odd dimensions make libx264 fall back to yuv444p, which most players
  // and hardware decoders cannot read.
  it('forces even width and height', () => {
    expect(cropFilter({ x: 1.4, y: 2.6, w: 301, h: 201 })).toBe('crop=300:200:1:3')
  })

  it('rounds offsets to the nearest integer without forcing them even', () => {
    expect(cropFilter({ x: 1.4, y: 2.6, w: 100.5, h: 50.5 })).toBe('crop=100:50:1:3')
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
  // The chain always ends on the even-dimensions guard, even when the user
  // applied no transformation: the source itself may have an odd size.
  it('is never empty — the even-dimensions guard always closes the chain', () => {
    expect(buildVideoFilters()).toEqual([EVEN_DIMENSIONS])
  })

  it('keeps only the guard when all options are defaults', () => {
    expect(buildVideoFilters({ rotation: 0, straighten: 0, perspectiveH: 0, perspectiveV: 0, crop: null, colorFilter: '', speed: 1 }))
      .toEqual([EVEN_DIMENSIONS])
  })

  it('combines all filters in the correct order', () => {
    const out = buildVideoFilters({
      rotation: 90,
      perspectiveH: 10,
      crop: { x: 0, y: 0, w: 100, h: 100 },
      colorFilter: 'hue=s=0',
      speed: 2,
    })
    expect(out).toHaveLength(6)
    expect(out[0]).toBe('transpose=1')
    expect(out[1]).toMatch(/^perspective=/)
    expect(out[2]).toBe('crop=100:100:0:0')
    expect(out[3]).toBe('hue=s=0')
    expect(out[4]).toBe('setpts=0.5000*PTS')
    expect(out[5]).toBe(EVEN_DIMENSIONS)
  })

  it('puts the guard last, after an arbitrary-angle rotation expands the canvas', () => {
    const out = buildVideoFilters({ rotation: 15 })
    expect(out[0]).toMatch(/^rotate=/)
    expect(out[out.length - 1]).toBe(EVEN_DIMENSIONS)
  })

  it('adds straighten to rotation', () => {
    const out = buildVideoFilters({ rotation: 90, straighten: 0 })
    expect(out[0]).toBe('transpose=1')
  })

  it('skips color filter when empty string', () => {
    const out = buildVideoFilters({ crop: { x: 0, y: 0, w: 10, h: 10 }, colorFilter: '' })
    expect(out).toHaveLength(2)
    expect(out[0]).toMatch(/^crop=/)
    expect(out[1]).toBe(EVEN_DIMENSIONS)
  })

  it('treats falsy crop, no color, default speed/rotation as no transformation', () => {
    expect(buildVideoFilters({ crop: null })).toEqual([EVEN_DIMENSIONS])
  })
})
