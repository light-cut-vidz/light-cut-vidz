import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { requireSrc } from './__doubles__/installElectron.js'

const { chmodBinaries } = requireSrc('main/lib/chmodBinaries.js')

const mode = (p) => fs.statSync(p).mode & 0o777

describe('chmodBinaries', () => {
  let dir

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  })

  it('makes matching binaries executable, in nested directories, without touching other files', () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chmod-binaries-'))
    const nested = path.join(dir, 'linux-x64')
    fs.mkdirSync(nested)
    const ffprobe = path.join(nested, 'ffprobe')
    const readme = path.join(nested, 'README.md')
    fs.writeFileSync(ffprobe, '')
    fs.writeFileSync(readme, '')
    fs.chmodSync(ffprobe, 0o644)
    fs.chmodSync(readme, 0o644)

    chmodBinaries(dir, ['ffmpeg', 'ffprobe'])

    expect(mode(ffprobe)).toBe(0o755)
    expect(mode(readme)).toBe(0o644)
  })

  it('does nothing when the directory does not exist', () => {
    expect(() => chmodBinaries(path.join(os.tmpdir(), 'does-not-exist-xyz'), ['ffmpeg'])).not.toThrow()
  })
})
