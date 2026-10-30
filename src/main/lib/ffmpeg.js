// Thin wrapper over the bundled ffmpeg binary: runs it with an argument array
// (no shell, no quoting to get wrong), reports progress from `-progress pipe:1`,
// supports cancellation, and reads stream info from `ffmpeg -i` so that no
// separate ffprobe binary has to ship.

const { spawn: nodeSpawn } = require('child_process')

const STDERR_TAIL_LINES = 80

/** Splits on commas that are not inside parentheses or brackets. */
function splitTopLevel(text) {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/**
 * Parses what `ffmpeg -i <file>` prints on stderr into the subset of ffprobe's
 * JSON the app uses: { format: { format_name, duration }, streams: [...] }.
 * Throws when the output has no "Input #0" line (unreadable or not media).
 */
function parseMediaInfo(stderr) {
  const lines = String(stderr).split(/\r?\n/)
  const input = lines.map(l => /^Input #0, (.*), from '/.exec(l)).find(Boolean)
  if (!input) {
    const reason = lines.map(l => l.trim()).filter(Boolean).pop() || 'unreadable file'
    throw new Error(reason)
  }

  /** @type {{ format: { format_name: string, duration?: number }, streams: any[] }} */
  const info = { format: { format_name: input[1] }, streams: [] }
  /** @type {any} */
  let last = null
  for (const line of lines) {
    const dur = /^\s*Duration: (\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(line)
    if (dur) { info.format.duration = Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]); continue }

    const st = /^\s*Stream #0:\d+(?:\[[^\]]*\])?(?:\([^)]*\))?: (Video|Audio|Subtitle|Data|Attachment): (.*)$/.exec(line)
    if (st) {
      const type = st[1].toLowerCase()
      const fields = splitTopLevel(st[2])
      const stream = { codec_type: type, codec_name: (fields[0] || '').split(/[\s(]/)[0] }
      if (type === 'video') {
        stream.pix_fmt = (fields[1] || '').split('(')[0].trim() || undefined
        const dims = fields.map(f => /(?:^|\s)(\d{2,5})x(\d{2,5})(?:\s|$)/.exec(f)).find(Boolean)
        if (dims) { stream.width = Number(dims[1]); stream.height = Number(dims[2]) }
        if (/\(attached pic\)/.test(st[2])) stream.disposition = { attached_pic: 1 }
      }
      info.streams.push(stream)
      last = stream
      continue
    }

    const rot = /displaymatrix: rotation of (-?[\d.]+) degrees/.exec(line)
    if (rot && last && last.codec_type === 'video' && Number(rot[1]) !== 0) {
      last.tags = { rotate: String(Math.abs(Math.round(Number(rot[1])))) }
    }
  }
  return info
}

const CHATTER = /^\s*(Stream|Metadata|Input|Output|\[?out#|frame=|size=|video:|Conversion failed)/
const PROBLEM = /error|invalid|fail|no such|unable|cannot|could not|unrecognized|unknown|not supported|too big|permission/i

/** The few stderr lines that explain a failure, without the encoder's stats. */
function failureMessage(lines) {
  const useful = lines.filter(l => !CHATTER.test(l))
  const problems = useful.filter(l => PROBLEM.test(l))
  // The first problem line is the cause; what follows is the fallout.
  return (problems.length ? problems.slice(0, 2) : useful.slice(-3)).join(' | ')
}

/**
 * @param {object} opts
 * @param {string} opts.ffmpegPath
 * @param {Function} [opts.spawn]  injectable for tests
 */
function createFfmpeg({ ffmpegPath, spawn = nodeSpawn }) {
  /**
   * Starts ffmpeg. `onProgress(seconds)` receives the output time reached.
   * Returns { promise, kill }: the promise resolves on success, rejects with the
   * tail of ffmpeg's stderr on failure, or with Error('cancelled') after kill().
   */
  /** @param {string[]} args @param {{ onProgress?: (seconds: number) => void }} [opts] */
  function run(args, opts = {}) {
    const { onProgress } = opts
    const child = spawn(ffmpegPath, ['-hide_banner', '-nostdin', '-nostats', '-y', '-progress', 'pipe:1', ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let killed = false
    const tail = []
    let outBuf = ''

    child.stdout.on('data', (chunk) => {
      outBuf += chunk
      const lines = outBuf.split('\n')
      outBuf = lines.pop() || ''
      for (const line of lines) {
        const m = /^out_time_us=(\d+)$/.exec(line.trim())
        if (m && onProgress) onProgress(Number(m[1]) / 1e6)
      }
    })
    child.stderr.on('data', (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (!line.trim()) continue
        tail.push(line)
        if (tail.length > STDERR_TAIL_LINES) tail.shift()
      }
    })

    /** @type {Promise<void>} */
    const promise = new Promise((resolve, reject) => {
      child.on('error', (err) => reject(killed ? new Error('cancelled') : err))
      child.on('close', (code) => {
        if (killed) return reject(new Error('cancelled'))
        if (code === 0) return resolve(undefined)
        reject(new Error(failureMessage(tail) || `ffmpeg exited with code ${code}`))
      })
    })

    return {
      promise,
      kill() {
        killed = true
        try { child.kill('SIGKILL') } catch { /* already finished */ }
      },
    }
  }

  /** Stream info for `file`. */
  function probe(file) {
    return new Promise((resolve, reject) => {
      const child = spawn(ffmpegPath, ['-hide_banner', '-nostdin', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] })
      let err = ''
      child.stderr.on('data', (c) => { err += c })
      child.on('error', reject)
      // ffmpeg always exits non-zero here ("at least one output file must be
      // specified"); what matters is the description printed before that.
      child.on('close', () => { try { resolve(parseMediaInfo(err)) } catch (e) { reject(e) } })
    })
  }

  /** stdout of a short ffmpeg query such as `-filters` (resolves '' if it cannot run). */
  function query(args) {
    return new Promise((resolve) => {
      const child = spawn(ffmpegPath, ['-hide_banner', '-nostdin', ...args], { stdio: ['ignore', 'pipe', 'ignore'] })
      let out = ''
      child.stdout.on('data', (c) => { out += c })
      child.on('error', () => resolve(''))
      child.on('close', () => resolve(out))
    })
  }

  return { run, probe, query }
}

module.exports = { createFfmpeg, parseMediaInfo, splitTopLevel }
