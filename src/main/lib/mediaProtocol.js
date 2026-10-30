// Request handler for the privileged `lcv-file://` scheme.
//
// Two jobs the previous one-liner (`net.fetch(file://…)`) could not do:
//  - answer byte-range requests with a real 206 + Content-Range. net.fetch on a
//    file:// URL replies 200 with no range headers, which leaves <video> with an
//    empty `seekable` range — every seek snaps back to 0.
//  - refuse anything that is not the app bundle or a media file the user opened.
//    The scheme is privileged (bypassCSP, CORS) so it must not be a window onto
//    the whole disk.

const fs = require('fs')
const path = require('path')
const { Readable } = require('stream')
const { pathToFileURL } = require('url')
const { localUrlToPath } = require('./localProtocol')

const MEDIA_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.flv': 'video/x-flv',
}

const mediaType = (filePath) => MEDIA_TYPES[path.extname(filePath).toLowerCase()]

/**
 * Parses a single `bytes=a-b` range. Returns null when absent/unsupported (the
 * whole file is served), 'unsatisfiable' when it falls outside the file.
 */
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header || '')
  if (!m || (m[1] === '' && m[2] === '')) return null
  let start
  let end
  if (m[1] === '') {
    // Suffix range: the last N bytes.
    start = Math.max(0, size - Number(m[2]))
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (start > end || start >= size) return 'unsatisfiable'
  return { start, end }
}

// Applied to the app's own page. Scripts and styles only from the bundle; media
// and images may also come from blobs/data URLs (filmstrip, filter previews).
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "form-action 'none'",
].join('; ')

function isInside(root, target) {
  const rel = path.relative(root, target)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/**
 * @param {object} opts
 * @param {(url: string) => Promise<Response>} opts.fetchFile  net.fetch
 * @param {string} opts.appRoot       directory holding the built renderer
 * @param {(p: string) => boolean} opts.isAllowedMedia
 */
function createMediaHandler({ fetchFile, appRoot, isAllowedMedia }) {
  const root = path.resolve(appRoot)

  return async function handle(request) {
    let filePath
    try {
      filePath = path.resolve(localUrlToPath(request.url))
    } catch {
      return new Response('Bad request', { status: 400 })
    }

    if (isInside(root, filePath)) {
      let res
      try { res = await fetchFile(pathToFileURL(filePath).toString()) }
      catch { return new Response('Not found', { status: 404 }) }
      if (path.extname(filePath).toLowerCase() !== '.html') return res
      const headers = new Headers(res.headers)
      headers.set('Content-Security-Policy', CSP)
      return new Response(res.body, { status: res.status, headers })
    }

    const type = mediaType(filePath)
    if (!type || !isAllowedMedia(filePath)) return new Response('Forbidden', { status: 403 })

    let size
    try {
      const stat = await fs.promises.stat(filePath)
      if (!stat.isFile()) return new Response('Not found', { status: 404 })
      size = stat.size
    } catch {
      return new Response('Not found', { status: 404 })
    }

    const range = parseRange(request.headers.get('range'), size)
    if (range === 'unsatisfiable') {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    }

    // `*` is safe here: only files the user opened are served at all. It lets the
    // dev page (http://localhost:5173) read frames for the filter previews and
    // the filmstrip without tainting its canvas.
    const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' }
    if (!range) {
      return new Response(Readable.toWeb(fs.createReadStream(filePath)), {
        status: 200, headers: { ...base, 'Content-Length': String(size) },
      })
    }
    return new Response(Readable.toWeb(fs.createReadStream(filePath, { start: range.start, end: range.end })), {
      status: 206,
      headers: {
        ...base,
        'Content-Length': String(range.end - range.start + 1),
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
      },
    })
  }
}

module.exports = { createMediaHandler, CSP, parseRange, mediaType, MEDIA_TYPES }
