import { describe, it, expect } from 'vitest'
import { requireSrc } from './__doubles__/installElectron.js'
const { serializeProject, parseProject, PROJECT_EXTENSION } = requireSrc('main/lib/project.js')

const ok = { videoPath: '/home/u/clip.mp4', state: { speed: 2, cutSegments: [] } }

describe('project files', () => {
  it('round-trips', () => {
    expect(parseProject(serializeProject(ok))).toEqual(ok)
  })
  it('uses the .lcvproj extension', () => expect(PROJECT_EXTENSION).toBe('lcvproj'))

  it.each([
    ['not JSON', 'hello'],
    ['an array', '[]'],
    ['no marker', JSON.stringify({ videoPath: '/a.mp4', state: {} })],
    ['a newer format', JSON.stringify({ lightcutvidz: 99, videoPath: '/a.mp4', state: {} })],
    ['a relative path', JSON.stringify({ lightcutvidz: 1, videoPath: 'a.mp4', state: {} })],
    ['a non-video path (would widen the allow-list)', JSON.stringify({ lightcutvidz: 1, videoPath: '/etc/passwd', state: {} })],
    ['a missing state', JSON.stringify({ lightcutvidz: 1, videoPath: '/a.mp4' })],
    ['a non-string path', JSON.stringify({ lightcutvidz: 1, videoPath: 3, state: {} })],
  ])('rejects %s', (_n, text) => {
    expect(() => parseProject(text)).toThrow('not a project')
  })

  it('rejects an absurdly large file', () => {
    expect(() => parseProject(`{"lightcutvidz":1,"pad":"${'x'.repeat(51 * 1024 * 1024)}"}`)).toThrow('not a project')
  })
})
