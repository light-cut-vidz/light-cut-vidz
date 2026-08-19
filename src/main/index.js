const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require('electron')
const { pathToFileURL } = require('url')
const path = require('path')
const fs = require('fs')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegStatic = require('ffmpeg-static')
const ffprobeInstaller = require('@ffprobe-installer/ffprobe')
const { autoUpdater } = require('electron-updater')
const { getFilterFfmpeg } = require('./filters')
const { fixAsarPath } = require('./lib/asar')
const { clampAtempo } = require('./lib/atempo')
const { buildVideoFilters } = require('./lib/videoFilters')
const {
  expandCuesToEvents, remapEventsToKeptSegments, buildAssContent, buildSubtitlesFilter,
} = require('./lib/subtitles')
const { translate } = require('./lib/i18n')
const { buildMenu, setUndoRedoEnabled, VIDEO_EXTENSIONS } = require('./lib/menu')
const { setupAutoUpdater, checkForUpdates } = require('./lib/updater')
const { showAboutWindow } = require('./lib/aboutWindow')
const { LOCAL_SCHEME, toLocalUrl, localUrlToPath } = require('./lib/localProtocol')

ffmpeg.setFfmpegPath(fixAsarPath(ffmpegStatic))
ffmpeg.setFfprobePath(fixAsarPath(ffprobeInstaller.path))

const isDev = process.env.NODE_ENV === 'development'
const isMac = process.platform === 'darwin'
const isAppImage = process.platform === 'linux' && !!process.env.APPIMAGE
const isDeb = process.platform === 'linux' && !isAppImage


let currentLang = 'en'
let win = null
const updaterState = { updateDownloaded: false }

const t = (key, ...args) => translate(currentLang, key, ...args)

// ─── Auto updater ─────────────────────────────────────────────────────────────

setupAutoUpdater({
  autoUpdater,
  dialog,
  getWindow: () => win,
  t,
  state: updaterState,
})

const checkUpdates = (fromMenu = false) => checkForUpdates({
  autoUpdater, dialog, app, getWindow: () => win, t, state: updaterState, isDev, isMac, isDeb, fromMenu,
})

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    icon: path.join(__dirname, '../../assets/icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    // Loaded through the custom scheme rather than loadFile: a file:// page has
    // an opaque origin and cannot fetch anything, so the <video> element could
    // not read local media without turning webSecurity off for the whole
    // renderer. Serving the page from the same scheme as the media keeps them
    // same-origin. Vite is configured with `base: './'`, so the bundle's
    // relative asset paths resolve correctly under it.
    win.loadURL(toLocalUrl(path.join(app.getAppPath(), 'dist', 'index.html')))
  }

  win.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12' && isDev) win.webContents.openDevTools()
    if (input.key === 'Escape' && win.isFullScreen()) win.setFullScreen(false)
  })
}

// Must run before app is ready: grants the scheme the privileges a <video> src
// needs (byte-range streaming and a proper security origin).
protocol.registerSchemesAsPrivileged([{
  scheme: LOCAL_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true },
}])

app.whenReady().then(() => {
  process.title = 'LightCutVidz'
  app.setName('LightCutVidz')
  protocol.handle(LOCAL_SCHEME, async (request) => {
    try {
      return await net.fetch(pathToFileURL(localUrlToPath(request.url)).toString())
    } catch (err) {
      console.error('[lcv-file] failed', request.url, err)
      return new Response('Not found', { status: 404 })
    }
  })
  createWindow()
  rebuildMenu()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', cleanupPreview)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ─── Native menu ──────────────────────────────────────────────────────────────

function rebuildMenu() {
  buildMenu({
    t,
    currentLang,
    onOpenVideo: (focused, filePath) => focused.webContents.send('menu:openVideo', filePath),
    onUndo: (focused) => focused?.webContents.send('menu:undo'),
    onRedo: (focused) => focused?.webContents.send('menu:redo'),
    onFullscreenEntered: (focused) => focused.webContents.send('menu:fullscreen-entered'),
    onAbout: () => showAboutWindow({ parent: win, title: t('about_title'), message: t('about_message', app.getVersion()) }),
    onCheckUpdates: checkUpdates,
    onSwitchLanguage: switchLanguage,
  })
}

function switchLanguage(lang) {
  currentLang = lang
  rebuildMenu()
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('menu:setLanguage', lang)
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.on('menu:setUndoRedoState', (_, { canUndo, canRedo }) => setUndoRedoEnabled(canUndo, canRedo))

ipcMain.on('menu:setLanguage', (_, lang) => {
  if (lang !== currentLang && (lang === 'en' || lang === 'fr')) {
    currentLang = lang
    rebuildMenu()
  }
})

ipcMain.handle('dialog:openVideo', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'Videos', extensions: VIDEO_EXTENSIONS }],
    properties: ['openFile'],
  })
  return canceled ? null : filePaths[0]
})

// The preview WebM of the currently loaded video. Kept so it can be deleted
// when another video is loaded and when the app quits — these files are large
// and the OS does not clear the temp dir on its own.
let currentPreviewPath = null

function cleanupPreview() {
  if (!currentPreviewPath) return
  try { fs.unlinkSync(currentPreviewPath) } catch { /* already gone */ }
  currentPreviewPath = null
}

// Transcode to WebM for preview (Electron lacks H.264/AAC codecs).
ipcMain.handle('ffmpeg:preview', async (event, inputPath) => {
  cleanupPreview()
  const outPath = path.join(app.getPath('temp'), `lc_preview_${Date.now()}.webm`)
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v libvpx-vp9',
        '-crf 33',
        '-b:v 0',
        '-deadline realtime',
        '-cpu-used 8',
        '-c:a libopus',
        '-b:a 128k',
        '-vf scale=trunc(iw/2)*2:trunc(ih/2)*2', // ensure even dimensions
      ])
      .output(outPath)
      .on('progress', (p) => event.sender.send('ffmpeg:preview-progress', Math.round(p.percent || 0)))
      .on('end', () => {
        currentPreviewPath = outPath
        resolve(toLocalUrl(outPath))
      })
      .on('error', (err) => reject(err.message))
      .run()
  })
})

// Renderer falls back to the source file when the preview transcode fails; it
// still needs a URL the privileged scheme can serve.
ipcMain.handle('file:toUrl', (_, filePath) => toLocalUrl(filePath))

ipcMain.handle('dialog:openSubtitle', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'Subtitles', extensions: ['srt'] }],
    properties: ['openFile'],
  })
  if (canceled) return null
  const content = fs.readFileSync(filePaths[0], 'utf-8')
  return { filePath: filePaths[0], content }
})

ipcMain.handle('dialog:saveVideo', async (_, defaultName) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName || 'output.mp4',
    filters: [
      { name: 'MP4', extensions: ['mp4'] },
      { name: 'MOV', extensions: ['mov'] },
      { name: 'WebM', extensions: ['webm'] },
      { name: 'AVI', extensions: ['avi'] },
      { name: 'GIF', extensions: ['gif'] },
    ],
  })
  return canceled ? null : filePath
})

ipcMain.handle('ffmpeg:probe', async (_, filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err.message)
      else resolve(metadata)
    })
  })
})

ipcMain.handle('ffmpeg:export', async (event, options) => {
  const {
    inputPath, outputPath, segments, speed, crop, filter,
    rotation, straighten, perspectiveH, perspectiveV, muted, format, subtitles,
  } = options

  const tmpDir = app.getPath('temp')
  const segmentFiles = []
  const scratchFiles = []
  try {
    const colorFilter = getFilterFfmpeg(filter)
    const vFilters = buildVideoFilters({ rotation, straighten, perspectiveH, perspectiveV, crop, colorFilter, speed })

    // Step 1: extract & process each kept segment
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const segOut = path.join(tmpDir, `lc_seg_${Date.now()}_${i}.mp4`)
      segmentFiles.push(segOut)

      await new Promise((res, rej) => {
        let cmd = ffmpeg(inputPath)
          .inputOptions([`-ss ${seg.start}`, `-t ${seg.end - seg.start}`])

        if (vFilters.length > 0) cmd = cmd.videoFilter(vFilters.join(','))

        if (muted) cmd = cmd.noAudio()
        else if (speed !== 1) cmd = cmd.audioFilter(`atempo=${clampAtempo(speed)}`)

        cmd
          .outputOptions(['-c:v libx264', '-preset fast', '-crf 22', '-pix_fmt yuv420p', '-movflags +faststart'])
          .output(segOut)
          .on('progress', (p) => {
            const overall = (i / segments.length + (p.percent || 0) / 100 / segments.length) * 100
            event.sender.send('ffmpeg:progress', Math.round(overall))
          })
          .on('end', res)
          .on('error', rej)
          .run()
      })
    }

    // Step 2: concatenate (only if more than one segment)
    if (segmentFiles.length === 1) {
      const { filter: subtitlesFilter, assPath } = await buildExportSubtitlesFilter(segmentFiles[0], subtitles, segments, tmpDir)
      if (assPath) scratchFiles.push(assPath)
      await convertToFormat(segmentFiles[0], outputPath, format, event, subtitlesFilter)
    } else {
      const concatList = path.join(tmpDir, `lc_concat_${Date.now()}.txt`)
      scratchFiles.push(concatList)
      fs.writeFileSync(concatList, segmentFiles.map(f => `file '${f}'`).join('\n'))

      const concatOut = path.join(tmpDir, `lc_joined_${Date.now()}.mp4`)
      scratchFiles.push(concatOut)
      await new Promise((res, rej) => {
        ffmpeg()
          .input(concatList)
          .inputOptions(['-f concat', '-safe 0'])
          .outputOptions(['-c copy'])
          .output(concatOut)
          .on('end', res)
          .on('error', rej)
          .run()
      })

      const { filter: subtitlesFilter, assPath } = await buildExportSubtitlesFilter(concatOut, subtitles, segments, tmpDir)
      if (assPath) scratchFiles.push(assPath)
      await convertToFormat(concatOut, outputPath, format, event, subtitlesFilter)
    }

    event.sender.send('ffmpeg:progress', 100)
    return { success: true, outputPath }
  } catch (err) {
    throw new Error(err.message || String(err), { cause: err })
  } finally {
    // Runs on the failure path too: a segment that errors halfway through
    // otherwise leaves every already-encoded piece behind in the temp dir.
    for (const f of [...segmentFiles, ...scratchFiles]) {
      try { fs.unlinkSync(f) } catch { /* never written, or already removed */ }
    }
  }
})

// Builds the burn-in subtitles filter for the given (post-crop/rotation) intermediate
// video file, if a subtitle track is configured. Probes the file for its actual output
// dimensions (needed for ASS PlayResX/Y and the sentence-slide \move coordinates), then
// expands cues into animation events and remaps them onto the concatenated/virtual
// (post-cut) timeline before writing a temporary .ass file for ffmpeg's `subtitles` filter.
async function buildExportSubtitlesFilter(intermediatePath, subtitles, keptSegments, tmpDir) {
  if (!subtitles || !Array.isArray(subtitles.cues) || subtitles.cues.length === 0) {
    return { filter: null, assPath: null }
  }

  const metadata = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(intermediatePath, (err, meta) => (err ? reject(err) : resolve(meta)))
  })
  const videoStream = (metadata.streams || []).find(s => s.codec_type === 'video')
  const videoWidth = videoStream?.width || 1920
  const videoHeight = videoStream?.height || 1080

  const events = expandCuesToEvents(subtitles.cues, subtitles.animation, {
    videoWidth,
    videoHeight,
    position: subtitles.style.position,
    color: subtitles.style.color,
    accentColor: subtitles.style.accentColor,
  })
  const remapped = remapEventsToKeptSegments(events, keptSegments)
  const assContent = buildAssContent(remapped, subtitles.style, videoWidth, videoHeight)
  const assPath = path.join(tmpDir, `lc_subs_${Date.now()}.ass`)
  fs.writeFileSync(assPath, assContent, 'utf-8')

  return { filter: buildSubtitlesFilter(assPath), assPath }
}

function convertToFormat(inputPath, outputPath, format, event, subtitlesFilter = null) {
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath)

    if (format === 'gif') {
      const gifFilter = subtitlesFilter
        ? `${subtitlesFilter},fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`
        : 'fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse'
      cmd = cmd
        .outputOptions(['-vf', gifFilter])
        .noAudio()
    } else if (format === 'webm') {
      const opts = ['-c:v libvpx-vp9', '-crf 30', '-b:v 0']
      if (subtitlesFilter) opts.push('-vf', subtitlesFilter)
      opts.push('-c:a libopus')
      cmd = cmd.outputOptions(opts)
    } else if (subtitlesFilter) {
      // mp4/mov/avi with subtitles: burning in requires re-encoding the video stream,
      // so the stream-copy fast path below can't be used here.
      cmd = cmd.outputOptions(['-vf', subtitlesFilter, '-c:v libx264', '-preset fast', '-crf 20', '-pix_fmt yuv420p', '-c:a copy'])
    } else {
      // mp4, mov, avi — stream copy when already h264
      cmd = cmd.outputOptions(['-c copy'])
    }

    cmd
      .output(outputPath)
      .on('progress', (p) => event.sender.send('ffmpeg:progress', Math.round(p.percent || 0)))
      .on('end', resolve)
      .on('error', reject)
      .run()
  })
}
