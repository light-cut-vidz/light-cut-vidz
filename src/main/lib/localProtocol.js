// Custom scheme used to hand local video files to the renderer.
//
// The renderer used to load videos straight from `file://`, which required
// `webSecurity: false` on the BrowserWindow — that disables the same-origin
// policy for the whole renderer, not just for video. Serving the file through a
// privileged custom scheme keeps web security on. The scheme is registered as
// `stream: true` so the <video> element can issue range requests and seek.

const LOCAL_SCHEME = 'lcv-file'

/** Absolute filesystem path → `lcv-file://local/<encoded path>` URL. */
function toLocalUrl(filePath) {
  // A single encodeURI pass would leave `#` and `?` intact, which truncates the
  // path; encodeURIComponent escapes them but also escapes the separators, so
  // encode each segment and rejoin.
  const encoded = String(filePath).split('/').map(encodeURIComponent).join('/')
  return `${LOCAL_SCHEME}://local${encoded.startsWith('/') ? '' : '/'}${encoded}`
}

/** `lcv-file://local/<encoded path>` URL → absolute filesystem path. */
function localUrlToPath(url) {
  const { pathname } = new URL(url)
  return decodeURIComponent(pathname)
}

module.exports = { LOCAL_SCHEME, toLocalUrl, localUrlToPath }
