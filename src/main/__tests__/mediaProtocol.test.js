import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { requireSrc } from './__doubles__/installElectron.js'

const { createMediaHandler, parseRange, mediaType, CSP } = requireSrc('main/lib/mediaProtocol.js')

describe('parseRange', () => {
  it('parses a closed range', () => expect(parseRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 }))
  it('parses an open-ended range', () => expect(parseRange('bytes=4-', 10)).toEqual({ start: 4, end: 9 }))
  it('parses a suffix range as the last N bytes', () => expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 }))
  it('clamps an end past the file', () => expect(parseRange('bytes=0-99', 10)).toEqual({ start: 0, end: 9 }))
  it('flags a start past the end of the file', () => expect(parseRange('bytes=10-', 10)).toBe('unsatisfiable'))
  it('flags an inverted range', () => expect(parseRange('bytes=5-2', 10)).toBe('unsatisfiable'))
  it('ignores a missing or unsupported header', () => {
    expect(parseRange(null, 10)).toBeNull()
    expect(parseRange('bytes=0-1,4-5', 10)).toBeNull()
    expect(parseRange('items=0-1', 10)).toBeNull()
  })
})

describe('mediaType', () => {
  it('knows the supported containers, case-insensitively', () => {
    expect(mediaType('/a/b.MP4')).toBe('video/mp4')
    expect(mediaType('/a/b.webm')).toBe('video/webm')
  })
  it('knows nothing about other files', () => {
    expect(mediaType('/etc/passwd')).toBeUndefined()
    expect(mediaType('/home/u/.ssh/id_rsa')).toBeUndefined()
  })
})

describe('media handler', () => {
  let dir
  let clip
  let fetchFile
  let allowed
  let handle
  const req = (file, range) => ({
    url: `lcv-file://local${file}`,
    headers: new Headers(range ? { Range: range } : {}),
  })

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcv-media-'))
    clip = path.join(dir, 'clip.mp4')
    fs.writeFileSync(clip, '0123456789')
    fs.mkdirSync(path.join(dir, 'dist'))
    fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<html></html>')
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'SECRET')
    fs.writeFileSync(path.join(dir, 'secret.mp4.txt'), 'SECRET')
  })
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  const make = () => {
    fetchFile = vi.fn(async (url) => new Response(fs.readFileSync(new URL(url)), { headers: { 'content-type': 'text/html' } }))
    allowed = new Set([clip])
    handle = createMediaHandler({ fetchFile, appRoot: path.join(dir, 'dist'), isAllowedMedia: (p) => allowed.has(p) })
  }

  it('answers a range request with a real 206 and Content-Range', async () => {
    make()
    const res = await handle(req(clip, 'bytes=2-5'))
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(res.headers.get('content-length')).toBe('4')
    expect(await res.text()).toBe('2345')
  })

  it('serves the whole file, advertising range support, when no range is asked', async () => {
    make()
    const res = await handle(req(clip))
    expect(res.status).toBe(200)
    expect(res.headers.get('accept-ranges')).toBe('bytes')
    expect(res.headers.get('content-type')).toBe('video/mp4')
    expect(await res.text()).toBe('0123456789')
  })

  it('answers 416 for a range outside the file', async () => {
    make()
    const res = await handle(req(clip, 'bytes=50-'))
    expect(res.status).toBe(416)
    expect(res.headers.get('content-range')).toBe('bytes */10')
  })

  it('refuses a media file nobody opened', async () => {
    make()
    allowed.clear()
    expect((await handle(req(clip))).status).toBe(403)
  })

  it('refuses a file that is not media even if it is "allowed"', async () => {
    make()
    const secret = path.join(dir, 'secret.txt')
    allowed.add(secret)
    expect((await handle(req(secret))).status).toBe(403)
  })

  it('does not let ../ climb out of the app bundle', async () => {
    make()
    const res = await handle({ url: 'lcv-file://local' + path.join(dir, 'dist', '..', 'secret.txt'), headers: new Headers() })
    expect(res.status).toBe(403)
    expect(fetchFile).not.toHaveBeenCalled()
  })

  it('does not let an encoded ../ climb out either', async () => {
    make()
    const res = await handle({ url: `lcv-file://local${dir}/dist/%2e%2e/secret.txt`, headers: new Headers() })
    expect(res.status).toBe(403)
  })

  it('answers 404 for an opened video that has since been deleted', async () => {
    make()
    const gone = path.join(dir, 'gone.mp4')
    allowed.add(gone)
    expect((await handle(req(gone))).status).toBe(404)
  })

  it('serves the app bundle through fetchFile and attaches the CSP to the page', async () => {
    make()
    const res = await handle(req(path.join(dir, 'dist', 'index.html')))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-security-policy')).toBe(CSP)
    expect(CSP).toContain("script-src 'self'")
    expect(CSP).not.toContain("'unsafe-eval'")
  })

  it('answers 404 when the bundle file is missing', async () => {
    make()
    fetchFile.mockRejectedValueOnce(new Error('ERR_FILE_NOT_FOUND'))
    expect((await handle(req(path.join(dir, 'dist', 'nope.js')))).status).toBe(404)
  })
})

describe('media handler — CORS', () => {
  it('lets a page on another origin (the dev server) read frames of an opened video', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcv-cors-'))
    const clip = path.join(dir, 'c.mp4')
    fs.writeFileSync(clip, 'x')
    const handle = createMediaHandler({ fetchFile: vi.fn(), appRoot: path.join(dir, 'dist'), isAllowedMedia: () => true })
    for (const range of [null, 'bytes=0-0']) {
      const res = await handle({ url: `lcv-file://local${clip}`, headers: new Headers(range ? { Range: range } : {}) })
      expect(res.headers.get('access-control-allow-origin')).toBe('*')
    }
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
