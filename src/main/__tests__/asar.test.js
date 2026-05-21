import { describe, it, expect } from 'vitest'
import { fixAsarPath } from '../lib/asar.js'

describe('fixAsarPath', () => {
  it('replaces app.asar with app.asar.unpacked', () => {
    expect(fixAsarPath('/foo/app.asar/bin/ffmpeg')).toBe('/foo/app.asar.unpacked/bin/ffmpeg')
  })

  it('leaves a path without app.asar untouched', () => {
    expect(fixAsarPath('/foo/bar/ffmpeg')).toBe('/foo/bar/ffmpeg')
  })

  it('only replaces the first occurrence', () => {
    expect(fixAsarPath('app.asar/x/app.asar/y')).toBe('app.asar.unpacked/x/app.asar/y')
  })

  it('handles empty string', () => {
    expect(fixAsarPath('')).toBe('')
  })
})
