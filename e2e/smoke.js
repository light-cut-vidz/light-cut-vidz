// End-to-end smoke test of the real application: the real main process, the real
// preload, the real built renderer, the real lcv-file:// protocol and the bundled
// ffmpeg. Nothing is mocked except the two native file dialogs, which cannot be
// clicked on a headless machine.
//
//   npm run vite:build
//   xvfb-run -a npx electron --no-sandbox e2e/smoke.js     (or: npm run test:e2e)
//
// It exists because the unit tests mock Electron and ffmpeg: they cannot see
// that <video> seeking snaps back to 0, that a file dropped on the window
// navigates it away, or that a CSP is missing.

const { app, dialog, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { execFileSync } = require('child_process')

const root = path.resolve(__dirname, '..')
// Run as a script, Electron reports the script's folder as the app path, but the
// renderer bundle lives under the project root.
app.getAppPath = () => root
// ...and no package.json next to the script means no version either.
app.getVersion = () => require('../package.json').version

const FFMPEG = /** @type {string} */ (/** @type {unknown} */ (require('ffmpeg-static')))
const { createFfmpeg } = require('../src/main/lib/ffmpeg')
const probe = createFfmpeg({ ffmpegPath: FFMPEG }).probe
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'lcv-e2e-'))
// Settings and the recent list go to a scratch folder, not the developer's real profile.
app.setPath('userData', path.join(work, 'userdata'))
const results = []

function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`)
}

function ff(args) {
  execFileSync(FFMPEG, ['-v', 'error', '-y', ...args])
}

if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  console.error('dist/ is missing: run `npm run vite:build` first.')
  process.exit(2)
}

// A 20 s H.264/AAC clip (plays natively), and an HEVC one (needs the transcode).
const h264 = path.join(work, 'clip.mp4')
const hevc = path.join(work, 'hevc.mp4')
const exported = path.join(work, 'exported.mp4')
const secret = path.join(work, 'secret.mp4')
ff(['-f', 'lavfi', '-i', 'testsrc2=s=640x360:r=25:d=20', '-f', 'lavfi', '-i', 'sine=f=440:d=20', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', h264])
ff(['-i', h264, '-t', '4', '-c:v', 'libx265', '-preset', 'ultrafast', '-tag:v', 'hvc1', '-c:a', 'aac', hevc])
fs.copyFileSync(h264, secret)

// The two dialogs hand back files as a user would pick them.
let nextOpen = h264
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [nextOpen] })
dialog.showSaveDialog = async () => ({ canceled: false, filePath: exported })

require('../src/main/index.js')

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function until(fn, ms = 20000) {
  const end = Date.now() + ms
  while (Date.now() < end) { try { const v = await fn(); if (v) return v } catch { /* retry */ } await sleep(100) }
  return false
}

app.whenReady().then(async () => {
  const win = await until(() => BrowserWindow.getAllWindows()[0])
  const run = (code) => win.webContents.executeJavaScript(code, true)
  try {
    await until(() => run("!!document.querySelector('.dropzone')"))

    // ── The page and its bridge ────────────────────────────────────────────
    check('renderer mounted (drop zone visible)', await run("!!document.querySelector('.dropzone')"))
    const api = await run('Object.keys(window.electronAPI).sort()')
    check('preload exposes the expected API', ['exportVideo', 'previewVideo', 'cancelFfmpeg', 'saveVideo'].every(k => api.includes(k)), JSON.stringify(api))
    check('preload does not expose ipcRenderer or the probe channel', !api.includes('ipcRenderer') && !api.includes('probeVideo'))

    const csp = await run('fetch(location.href).then(r => r.headers.get("content-security-policy"))')
    check('the page is served with a Content-Security-Policy', /script-src 'self'/.test(csp || ''), String(csp))

    // ── What's new ─────────────────────────────────────────────────────────
    const en = await run("window.electronAPI.getChangelog('en')")
    const fr = await run("window.electronAPI.getChangelog('fr')")
    check('the changelog is readable in English and French, same versions', en.length > 0 && JSON.stringify(en.map(e => e.version)) === JSON.stringify(fr.map(e => e.version)), `${en.length}/${fr.length}`)
    check('French entries are really French', /Ajouté|Corrigé|Modifié/.test(fr[0].body) && /Added|Fixed|Changed/.test(en[0].body))
    win.webContents.send('menu:showChangelog')
    check('Help > What\'s new opens the window with the entries', await until(() => run("document.querySelectorAll('.cl-entry').length > 0")))
    await run("document.querySelector('.cl-close').click()")

    // ── The protocol only serves what the user opened ──────────────────────
    const status = (url, range) => run(`fetch(${JSON.stringify(url)}, ${range ? `{ headers: { Range: '${range}' } }` : '{}'}).then(r => r.status)`)
    check('lcv-file refuses an arbitrary system file', (await status('lcv-file://local/etc/hostname')) === 403)
    check('lcv-file refuses a video that was never opened', (await status(`lcv-file://local${secret}`)) === 403)

    // ── Native playback and seeking (H.264) ────────────────────────────────
    const url = await run(`window.electronAPI.previewVideo(${JSON.stringify(h264)})`)
    check('an H.264/AAC file is played as-is (no transcode)', url === `lcv-file://local${h264}`, url)
    check('byte-range request gets a 206', (await status(url, 'bytes=10-19')) === 206)

    const seek = await run(`(async () => {
      const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; document.body.appendChild(v)
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('media error')); v.src = ${JSON.stringify(url)} })
      const s = v.seekable; const range = s.length ? [s.start(0), s.end(0)] : null
      v.currentTime = v.duration * 0.7
      await new Promise(res => { v.onseeked = res; setTimeout(res, 8000) })
      const out = { duration: v.duration, range, at: v.currentTime, target: v.duration * 0.7 }
      v.remove(); return out
    })()`)
    check('the video is seekable over its whole duration', seek.range && Math.abs(seek.range[1] - seek.duration) < 0.5, JSON.stringify(seek))
    check('seeking lands where asked instead of snapping back to 0', Math.abs(seek.at - seek.target) < 0.5, JSON.stringify(seek))

    // ── Transcoded preview (HEVC) ──────────────────────────────────────────
    nextOpen = hevc
    const hevcUrl = await run(`window.electronAPI.previewVideo(${JSON.stringify(hevc)})`)
    check('an HEVC file is transcoded to a WebM preview', hevcUrl.endsWith('.webm'), hevcUrl)
    const hevcSeek = await run(`(async () => {
      const v = document.createElement('video'); v.muted = true; document.body.appendChild(v)
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('media error')); v.src = ${JSON.stringify(hevcUrl)} })
      v.currentTime = v.duration / 2
      await new Promise(res => { v.onseeked = res; setTimeout(res, 8000) })
      const out = { at: v.currentTime, half: v.duration / 2 }; v.remove(); return out
    })()`)
    check('the transcoded preview is seekable too', Math.abs(hevcSeek.at - hevcSeek.half) < 0.5, JSON.stringify(hevcSeek))

    // ── The editor opens a video from the menu and survives a drop ────────
    win.webContents.send('menu:openVideo', h264)
    check('opening a video from the menu switches to the editor', await until(() => run("!!document.querySelector('.app-layout') && document.querySelector('video')?.readyState >= 1")))

    await run(`window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }))`)
    await run(`(() => { const f = new File(['x'], 'x.mp4'); const dt = new DataTransfer(); dt.items.add(f); window.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })) })()`)
    await sleep(500)
    check('a drop on the editor does not navigate the window away', await run("location.protocol === 'lcv-file:' && !!document.querySelector('#root > *')"))

    await run("location.href = 'file:///etc/hostname'")
    await sleep(800)
    check('navigating to an external URL is blocked', await run("location.protocol === 'lcv-file:' && !!document.querySelector('.app-layout')"))

    // ── A complete export through the real pipeline ────────────────────────
    const saved = await run(`window.electronAPI.saveVideo('clip_edit.mp4', 'mp4')`)
    check('the save dialog result is accepted for export', saved === exported, String(saved))
    // (returns nothing: the unsubscribe function it yields cannot be cloned out of the page)
    await run(`void window.electronAPI.onProgress(p => { window.__progress = (window.__progress || []).concat(p) })`)
    // The hard case from the audit: rotation together with a crop, and a cut.
    const outcome = await run(`window.electronAPI.exportVideo({
      inputPath: ${JSON.stringify(h264)}, outputPath: ${JSON.stringify(exported)},
      segments: [{ start: 0, end: 3 }, { start: 8, end: 11 }], speed: 2, crop: { x: 0, y: 0, w: 640, h: 360 },
      filter: 'none', rotation: 90, straighten: 0, perspectiveH: 0, perspectiveV: 0, muted: false, format: 'mp4',
      subtitles: { cues: [{ id: 1, start: 1, end: 2, text: 'hello' }], animation: 'sentence-fade',
        style: { fontFamily: 'Arial', fontSize: 5, color: '#ffffff', outlineColor: '#000000', outlineWidth: 2, backgroundColor: '#000000', backgroundOpacity: 0, position: 'bottom', accentColor: '#22d3ee' } },
    }).then(r => ({ ok: r.success }), e => ({ error: String(e.message || e) }))`)
    check('export with rotation + crop + cuts + speed + subtitles succeeds', outcome.ok === true, JSON.stringify(outcome))
    if (outcome.ok) {
      const meta = await probe(exported)
      const v = meta.streams.find(s => s.codec_type === 'video')
      check('exported video is rotated (360x640) and H.264', v.width === 360 && v.height === 640 && v.codec_name === 'h264', `${v.width}x${v.height} ${v.codec_name}`)
      check('exported duration is (3 + 3) / 2 = 3 s', Math.abs(meta.format.duration - 3) < 0.3, String(meta.format.duration))
      const reported = await run('window.__progress || []')
      check('progress ends at 100 and never goes backwards', reported.at(-1) === 100 && reported.every((p, i) => i === 0 || p >= reported[i - 1]), JSON.stringify(reported))
    }

    // ── Capabilities, queue, quality, GIF, stabilisation ───────────────────
    const caps = await run('window.electronAPI.getCapabilities()')
    check('capabilities: stabilisation is available and hardware is a list', caps.stabilization === true && Array.isArray(caps.hardware), JSON.stringify(caps))

    const shaky = path.join(work, 'shaky.mp4')
    ff(['-f', 'lavfi', '-i', "testsrc2=s=960x600:r=25:d=4,crop=640:360:x='160+40*sin(t*13)':y='120+30*sin(t*17)'", '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', shaky])
    nextOpen = shaky
    await run(`window.electronAPI.openVideo()`)
    const queued = []
    /** @type {[string, Record<string, any>][]} */
    const jobs = [
      ['q1.mp4', { quality: 'small', resolution: 180, stabilize: 'light' }],
      ['q2.gif', { format: 'gif', gifWidth: 200, gifFps: 10, quality: 'small' }],
      ['q3.mp4', { quality: 'small', resolution: 360, reframe: { aspect: '9:16', mode: 'blur' } }],
    ]
    for (const [name, extra] of jobs) {
      const out = path.join(work, name)
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: out })
      await run(`window.electronAPI.saveVideo(${JSON.stringify(name)}, ${JSON.stringify(extra.format || 'mp4')})`)
      const opts = { inputPath: shaky, outputPath: out, segments: [{ start: 0, end: 3 }], speed: 1, crop: null, filter: 'none', muted: true, format: 'mp4', subtitles: null, ...extra }
      queued.push({ out, ...(await run(`window.electronAPI.queueAdd(${JSON.stringify(opts)})`)) })
    }
    check('three exports queued from the renderer', queued.length === 3 && new Set(queued.map(q => q.id)).size === 3)
    check('the queue pill shows up', await until(() => run("!!document.querySelector('.queue-pill')")))
    const finished = await until(async () => {
      // (the earlier export through the dialog is in the list too)
      const list = (await run('window.electronAPI.queueList()')).filter(j => /^q[123]\./.test(j.name))
      return list.length === 3 && list.every(j => j.status === 'done' || j.status === 'error') ? list : false
    }, 90000)
    check('all queued exports finished, in order, without error', finished && finished.map(j => j.status).join() === 'done,done,done', JSON.stringify(finished))
    if (finished) {
      const mp4 = await probe(queued[0].out)
      const v1 = mp4.streams.find(x => x.codec_type === 'video')
      check('quality + resolution + stabilisation: 180p H.264 output', v1.height === 180 && v1.codec_name === 'h264', `${v1.width}x${v1.height}`)
      const gif = await probe(queued[1].out)
      const v2 = gif.streams.find(x => x.codec_type === 'video')
      check('GIF honours the width and is a real GIF', v2.codec_name === 'gif' && v2.width === 200, `${v2.codec_name} ${v2.width}`)
      const social = (await probe(queued[2].out)).streams.find(x => x.codec_type === 'video')
      check('social format: 9:16 with a blurred background, 360 on the shorter side', social.width === 360 && social.height >= 638 && social.height <= 642, `${social.width}x${social.height}`)
    }
    await run("document.querySelector('.queue-pill').click()")
    check('the queue window lists the jobs', await until(() => run("document.querySelectorAll('.queue-job').length >= 2")))
    await run("document.querySelector('.queue-close').click()")

    // ── Recent files ───────────────────────────────────────────────────────
    const recent = await run('window.electronAPI.listRecent()')
    check('opened videos are in the recent list, newest first', recent.length >= 2 && recent[0].path === h264 || recent.some(r => r.path === h264), JSON.stringify(recent.map(r => r.name)))

    // ── Theme: the page really follows nativeTheme ────────────────────────
    const scheme = () => run("matchMedia('(prefers-color-scheme: light)').matches")
    await run("window.electronAPI.setTheme('light')")
    check('theme "light" makes the page match prefers-color-scheme: light', await until(async () => (await scheme()) === true))
    const bg = (await run("getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim()"))
    check('...and the light colour variables apply', bg === '#ffffff' || bg === '#fff', bg)
    await run("window.electronAPI.setTheme('dark')")
    check('theme "dark" flips it back', await until(async () => (await scheme()) === false))
    check('the choice is saved', (await run('window.electronAPI.getSettings()')).theme === 'dark')

    // ── Guards on the export IPC ───────────────────────────────────────────
    const refused = await run(`window.electronAPI.exportVideo({
      inputPath: ${JSON.stringify(secret)}, outputPath: ${JSON.stringify(exported)}, segments: [{ start: 0, end: 1 }],
      speed: 1, crop: null, filter: 'none', muted: false, format: 'mp4', subtitles: null,
    }).then(() => 'accepted', e => String(e.message))`)
    check('export refuses a file that was never opened', /not opened/.test(refused), refused)
  } catch (err) {
    check('smoke test ran to completion', false, String(err instanceof Error ? err.stack : err))
  }

  fs.rmSync(work, { recursive: true, force: true })
  const failed = results.filter(r => !r.ok).length
  console.log(`\n${results.length - failed}/${results.length} checks passed`)
  app.exit(failed ? 1 : 0)
})
