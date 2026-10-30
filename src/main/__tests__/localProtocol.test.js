import { describe, it, expect } from 'vitest'
import { requireSrc } from './__doubles__/installElectron.js'
const { LOCAL_SCHEME, toLocalUrl, localUrlToPath } = requireSrc('main/lib/localProtocol.js')

describe('LOCAL_SCHEME', () => {
  it('is a dedicated scheme, not file:', () => {
    expect(LOCAL_SCHEME).toBe('lcv-file')
  })
})

describe('toLocalUrl', () => {
  it('builds a URL on the privileged scheme', () => {
    expect(toLocalUrl('/tmp/movie.mp4')).toBe('lcv-file://local/tmp/movie.mp4')
  })

  it('keeps path separators intact', () => {
    expect(toLocalUrl('/home/u/Videos/clip.mp4')).toBe('lcv-file://local/home/u/Videos/clip.mp4')
  })

  it('escapes spaces', () => {
    expect(toLocalUrl('/tmp/my holiday.mp4')).toBe('lcv-file://local/tmp/my%20holiday.mp4')
  })

  // Left unescaped, `#` and `?` would truncate the path at the fragment/query.
  it('escapes characters that would otherwise truncate the path', () => {
    expect(toLocalUrl('/tmp/a#b?c.mp4')).toBe('lcv-file://local/tmp/a%23b%3Fc.mp4')
  })

  it('escapes non-ASCII characters', () => {
    expect(toLocalUrl('/tmp/vidéo.mp4')).toBe('lcv-file://local/tmp/vid%C3%A9o.mp4')
  })

  it('inserts a separator for a relative path', () => {
    expect(toLocalUrl('clip.mp4')).toBe('lcv-file://local/clip.mp4')
  })
})

describe('localUrlToPath', () => {
  it('recovers the original path', () => {
    expect(localUrlToPath('lcv-file://local/tmp/movie.mp4')).toBe('/tmp/movie.mp4')
  })

  it.each([
    '/tmp/my holiday.mp4',
    '/tmp/a#b?c.mp4',
    '/tmp/vidéo.mp4',
    '/tmp/100% done/clip (1).mp4',
    "/tmp/o'brien & sons.mp4",
  ])('round-trips %s', (filePath) => {
    expect(localUrlToPath(toLocalUrl(filePath))).toBe(filePath)
  })
})
