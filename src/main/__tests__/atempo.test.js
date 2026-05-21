import { describe, it, expect } from 'vitest'
import { clampAtempo } from '../lib/atempo.js'

describe('clampAtempo', () => {
  it('returns plain value for 1.0 (default speed)', () => {
    expect(clampAtempo(1)).toBe('1.0000')
  })

  it('returns plain value at lower bound (0.5)', () => {
    expect(clampAtempo(0.5)).toBe('0.5000')
  })

  it('returns plain value at upper bound (2.0)', () => {
    expect(clampAtempo(2)).toBe('2.0000')
  })

  it('returns plain value mid-range (1.25)', () => {
    expect(clampAtempo(1.25)).toBe('1.2500')
  })

  it('chains for speed > 2 (e.g. 4)', () => {
    expect(clampAtempo(4)).toBe('2.0,atempo=2.0000')
  })

  it('chains for speed = 3', () => {
    expect(clampAtempo(3)).toBe('2.0,atempo=1.5000')
  })

  it('chains for speed < 0.5 (e.g. 0.25)', () => {
    expect(clampAtempo(0.25)).toBe('0.5,atempo=0.5000')
  })

  it('chains for speed = 0.1', () => {
    expect(clampAtempo(0.1)).toBe('0.5,atempo=0.2000')
  })
})
