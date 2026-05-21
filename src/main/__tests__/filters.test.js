import { describe, it, expect } from 'vitest'
import { getFilterFfmpeg } from '../filters.js'

describe('getFilterFfmpeg', () => {
  it('returns empty string for none', () => {
    expect(getFilterFfmpeg('none')).toBe('')
  })

  it('returns grayscale expression', () => {
    expect(getFilterFfmpeg('grayscale')).toBe('hue=s=0')
  })

  it('returns sepia colorchannelmixer', () => {
    expect(getFilterFfmpeg('sepia')).toContain('colorchannelmixer=')
  })

  it('returns mirror as hflip', () => {
    expect(getFilterFfmpeg('mirror')).toBe('hflip')
  })

  it('returns vflip for upside_down', () => {
    expect(getFilterFfmpeg('upside_down')).toBe('vflip')
  })

  it('returns empty string for unknown id', () => {
    expect(getFilterFfmpeg('unknown_filter')).toBe('')
  })
})
