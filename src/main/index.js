const electron = require('electron')
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } = electron
const path = require('path')
const fs = require('fs')
const { spawnSync } = require('child_process')
const ffmpegStatic = require('ffmpeg-static')
const { autoUpdater } = require('electron-updater')
const { getFilterFfmpeg } = require('./filters')
const { fixAsarPath } = require('./lib/asar')
const { validateExportOptions, ensureExtension } = require('./lib/exportPlan')
const { exportVideo } = require('./lib/exportRun')
const { createFfmpeg } = require('./lib/ffmpeg')
const { canPlayDirectly } = require('./lib/preview')
const { decodeText } = require('./lib/decodeText')
const { parseChangelog, entriesUpTo } = require('./lib/changelog')
const { serializeProject, parseProject, PROJECT_EXTENSION } = require('./lib/project')
const { createMediaHandler, mediaType } = require('./lib/mediaProtocol')
const { translate } = require('./lib/i18n')
const { buildMenu, setUndoRedoEnabled, VIDEO_EXTENSIONS } = require('./lib/menu')
const { setupAutoUpdater, checkForUpdates } = require('./lib/updater')
const { showAboutWindow } = require('./lib/aboutWindow')
const { LOCAL_SCHEME, toLocalUrl } = require('./lib/localProtocol')

const ffmpeg = createFfmpeg({ ffmpegPath: fixAsarPath(ffmpegStatic) })

const isDev = process.env.NODE_ENV === 'development'
const isMac = process.platform === 'darwin'
const isAppImage = process.platform === 'linux' && !!process.env.APPIMAGE
// A Linux install that is neither an AppImage nor registered with dpkg (tarball,
// Fedora/Arch repackage…) must not be sent through `pkexec apt-get`.
const isDeb = process.platform === 'linux' && !isAppImage
  && spawnSync('dpkg-query', ['-W', 'lightcutvidz'], { stdio: 'ignore' }).status === 0
const isManual = process.platform === 'linux' && !isAppImage && !isDeb

let currentLang = 'en'
let win = null
let undoRedoState = { canUndo: false, canRedo: false }
let forceClose = false
const updaterState = { updateDownloaded: false }

const t = (key, ...args) => translate(currentLang, key, ...args)

// Only files the user picked (dialog, drop, menu, command line) may be read back
// through lcv-file:// or fed to ffmpeg, and only picked save locations written.
const allowedMedia = new Set()
const allowedOutputs = new Set()

function allowMedia(filePath) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || !mediaType(filePath)) {
    throw new Error('Not a supported video file')
  }
  allowedMedia.add(path.resolve(filePath))
  return filePath
}

// ─── Auto updater ─────────────────────────────────────────────────────────────

// An update restart must not stop at the "unsaved edits" prompt.
// electron-updater emits it on Electron's own (native) autoUpdater, not on its
// own object nor on `app`.
if (electron.autoUpdater) electron.autoUpdater.on('before-quit-for-update', () => { forceClose = true })

setupAutoUpdater({
  autoUpdater,
  dialog,
  getWindow: () => win,
  t,
  state: updaterState,
})

const checkUpdates = (fromMenu = false) => checkForUpdates({
  autoUpdater, dialog, app, getWindow: () => win, t, state: updaterState, isDev, isMac, isDeb, isManual, fromMenu,
  openExternal: (url) => shell.openExternal(url),
  getLang: () => currentLang,
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

  // The editor is a single page. A file dropped outside the drop zone, or a
  // link, would otherwise navigate the window away and lose every edit.
  win.webContents.on('will-navigate', (event, url) => {
    let target
    let current
    try {
      target = new URL(url)
      current = new URL(win.webContents.getURL())
    } catch {
      event.preventDefault()
      return
    }
    if (target.protocol !== current.protocol || target.host !== current.host) event.preventDefault()
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Closing with unsaved edits asks first (Cmd+Q and the window's × both end here).
  win.on('close', (event) => {
    if (!hasUnsavedEdits || forceClose) return
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      message: t('confirm_quit_msg'),
      buttons: [t('confirm_quit_yes'), t('cancel')],
      defaultId: 1,
      cancelId: 1,
    })
    if (choice !== 0) event.preventDefault()
  })

  win.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12' && isDev) win.webContents.openDevTools()
    if (input.key === 'Escape' && win.isFullScreen()) win.setFullScreen(false)
  })

  // Videos handed over on the command line / by the OS are sent once the
  // renderer is listening.
  win.webContents.on('did-finish-load', () => {
    const initial = videoFromArgv(process.argv)
    if (initial) sendOpenVideo(initial)
  })
}

function videoFromArgv(argv) {
  for (const arg of argv.slice(1)) {
    if (!path.isAbsolute(arg) || !VIDEO_EXTENSIONS.includes(path.extname(arg).slice(1).toLowerCase())) continue
    try { if (fs.statSync(arg).isFile()) return arg } catch { /* not a file */ }
  }
  return null
}

function sendOpenVideo(filePath) {
  allowMedia(filePath)
  if (win) win.webContents.send('menu:openVideo', filePath)
}

// Must run before app is ready: grants the scheme the privileges a <video> src
// needs (byte-range streaming and a proper security origin). No `bypassCSP`: the
// renderer's own Content-Security-Policy has to apply to this scheme.
protocol.registerSchemesAsPrivileged([{
  scheme: LOCAL_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
}])

const hasLock = !app.requestSingleInstanceLock || app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.on('second-instance', (_, argv) => {
    if (win) {
      if (win.isMinimized && win.isMinimized()) win.restore()
      if (win.focus) win.focus()
    }
    const initial = videoFromArgv(argv)
    if (initial) sendOpenVideo(initial)
  })
}

// macOS delivers "Open with…" as an event, never as argv.
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  try { sendOpenVideo(filePath) } catch { /* not a video */ }
})

app.whenReady().then(() => {
  process.title = 'LightCutVidz'
  app.setName('LightCutVidz')
  protocol.handle(LOCAL_SCHEME, createMediaHandler({
    fetchFile: (url) => net.fetch(url),
    appRoot: path.join(app.getAppPath(), 'dist'),
    isAllowedMedia: (p) => allowedMedia.has(p) || p === currentPreviewPath,
  }))
  createWindow()
  rebuildMenu()
  if (!isDev) setTimeout(() => checkUpdates(false), 5000)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  cancelAllCommands()
  cleanupPreviewSync()
  for (const dir of activeWorkDirs) { try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* gone */ } }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ─── Native menu ──────────────────────────────────────────────────────────────

function rebuildMenu() {
  buildMenu({
    t,
    currentLang,
    onOpenVideo: (focused, filePath) => { allowMedia(filePath); focused.webContents.send('menu:openVideo', filePath) },
    onSaveProject: (focused) => focused?.webContents.send('menu:saveProject'),
    onOpenProject: openProject,
    onUndo: (focused) => focused?.webContents.send('menu:undo'),
    onRedo: (focused) => focused?.webContents.send('menu:redo'),
    onFullscreenEntered: (focused) => focused.webContents.send('menu:fullscreen-entered'),
    onShowChangelog: (focused) => focused?.webContents.send('menu:showChangelog'),
    onAbout: () => showAboutWindow({ parent: win, title: t('about_title'), message: t('about_message', app.getVersion()), note: t('about_licenses') }),
    onCheckUpdates: checkUpdates,
    onSwitchLanguage: switchLanguage,
  })
  // A rebuilt menu starts with Undo/Redo disabled and the renderer will not
  // re-announce an unchanged state, so restore what it last reported.
  setUndoRedoEnabled(undoRedoState.canUndo, undoRedoState.canRedo)
}

async function openProject(focused) {
  const target = focused || win
  const { canceled, filePaths } = await dialog.showOpenDialog(target, {
    filters: [{ name: t('filter_projects'), extensions: [PROJECT_EXTENSION] }],
    properties: ['openFile'],
  })
  if (canceled || !filePaths[0]) return
  let project
  try {
    project = parseProject(await fs.promises.readFile(filePaths[0], 'utf-8'))
  } catch {
    dialog.showMessageBox(target, { type: 'error', message: t('project_invalid') })
    return
  }
  if (!(await exists(project.videoPath))) {
    dialog.showMessageBox(target, { type: 'error', message: t('project_video_missing', project.videoPath) })
    return
  }
  allowMedia(project.videoPath)
  target.webContents.send('menu:loadProject', project)
}

function switchLanguage(lang) {
  currentLang = lang
  rebuildMenu()
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('menu:setLanguage', lang)
  }
}

// ─── ffmpeg process bookkeeping ───────────────────────────────────────────────

const activeCommands = new Set()
const activeWorkDirs = new Set()

/**
 * Runs ffmpeg and tracks the process so it can be cancelled. Rejects with
 * Error('cancelled') when killed on purpose.
 */
async function runFfmpeg(args, onProgress) {
  const handle = ffmpeg.run(args, { onProgress })
  activeCommands.add(handle)
  try { await handle.promise } finally { activeCommands.delete(handle) }
}

function cancelAllCommands() {
  for (const handle of activeCommands) handle.kill()
}

const probeFile = (filePath) => ffmpeg.probe(filePath)

// Never written, or already removed: nothing to report either way.
const unlinkQuiet = (p) => fs.promises.unlink(p).catch(() => {})
const unlinkQuietSync = (p) => { try { fs.unlinkSync(p) } catch { /* already gone */ } }
const exists = (p) => fs.promises.access(p).then(() => true, () => false)

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// Only the app's own page may drive the main process. A frame that somehow ended
// up on another origin (or a future webview/iframe) gets nothing.
function trustedSender(event) {
  const url = event && event.senderFrame && event.senderFrame.url
  return typeof url === 'string' && (url.startsWith(`${LOCAL_SCHEME}://local/`) || (isDev && url.startsWith('http://localhost:5173/')))
}

const handle = (channel, fn) => ipcMain.handle(channel, (event, ...args) => {
  if (!trustedSender(event)) throw new Error('Untrusted sender')
  return fn(event, ...args)
})

const listen = (channel, fn) => ipcMain.on(channel, (event, ...args) => {
  if (trustedSender(event)) fn(event, ...args)
})

listen('menu:setUndoRedoState', (_, { canUndo, canRedo }) => {
  undoRedoState = { canUndo: !!canUndo, canRedo: !!canRedo }
  setUndoRedoEnabled(undoRedoState.canUndo, undoRedoState.canRedo)
})

listen('menu:setLanguage', (_, lang) => {
  if (lang !== currentLang && (lang === 'en' || lang === 'fr')) {
    currentLang = lang
    rebuildMenu()
  }
})

handle('dialog:openVideo', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: t('filter_videos'), extensions: VIDEO_EXTENSIONS }],
    properties: ['openFile'],
  })
  if (canceled) return null
  return allowMedia(filePaths[0])
})

// The preview WebM of the currently loaded video. Kept so it can be deleted
// when another video is loaded and when the app quits — these files are large
// and the OS does not clear the temp dir on its own.
let currentPreviewPath = null
let previewHandle = null
let previewCounter = 0

async function cleanupPreview() {
  const stale = currentPreviewPath
  currentPreviewPath = null
  if (stale) await unlinkQuiet(stale)
}

// App shutdown cannot wait for async work.
function cleanupPreviewSync() {
  if (currentPreviewPath) unlinkQuietSync(currentPreviewPath)
  currentPreviewPath = null
}

// Plays the source as-is when Chromium can decode it; otherwise transcodes to
// WebM (HEVC, AVI, FLV, 10-bit H.264…).
handle('ffmpeg:preview', async (event, inputPath) => {
  // A previous transcode still running would otherwise keep writing a file
  // nothing will ever delete. An export in progress is left alone.
  if (previewHandle) previewHandle.kill()
  await cleanupPreview()
  allowMedia(inputPath)

  let metadata = null
  try { metadata = await probeFile(inputPath) } catch { /* let the transcode report it */ }
  if (metadata && canPlayDirectly(metadata)) return toLocalUrl(inputPath)

  const outPath = path.join(app.getPath('temp'), `lc_preview_${Date.now()}_${previewCounter++}.webm`)
  currentPreviewPath = outPath
  const duration = (metadata && metadata.format && metadata.format.duration) || 0
  const handleRun = ffmpeg.run([
    '-i', inputPath,
    '-c:v', 'libvpx-vp9', '-crf', '33', '-b:v', '0', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1',
    '-c:a', 'libopus', '-b:a', '128k',
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', // ensure even dimensions
    outPath,
  ], {
    onProgress: (seconds) => {
      if (duration > 0) event.sender.send('ffmpeg:preview-progress', Math.min(99, Math.round((seconds / duration) * 100)))
    },
  })
  previewHandle = handleRun
  activeCommands.add(handleRun)
  try {
    await handleRun.promise
  } catch (err) {
    await unlinkQuiet(outPath)
    if (currentPreviewPath === outPath) currentPreviewPath = null
    throw err
  } finally {
    activeCommands.delete(handleRun)
    if (previewHandle === handleRun) previewHandle = null
  }
  event.sender.send('ffmpeg:preview-progress', 100)
  return toLocalUrl(outPath)
})

// Renderer falls back to the source file when the preview transcode fails; it
// still needs a URL the privileged scheme can serve.
handle('file:toUrl', (_, filePath) => toLocalUrl(allowMedia(filePath)))

// The changes that shipped up to this version, in the asked language (the
// "What's new" window). Newer entries — a changelog ahead of the build — are not
// shown.
handle('changelog:get', async (_, lang) => {
  const file = lang === 'fr' ? 'CHANGELOG.fr.md' : 'CHANGELOG.md'
  try {
    const text = await fs.promises.readFile(path.join(app.getAppPath(), file), 'utf-8')
    return entriesUpTo(parseChangelog(text), app.getVersion())
  } catch {
    return []
  }
})

handle('project:save', async (_, project) => {
  if (!project || typeof project !== 'object') throw new Error('Invalid project')
  const text = serializeProject(project)
  parseProject(text) // refuses a project this app would not be able to open again
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: `project.${PROJECT_EXTENSION}`,
    filters: [{ name: t('filter_projects'), extensions: [PROJECT_EXTENSION] }],
  })
  if (canceled || !filePath) return null
  const finalPath = ensureExtension(filePath, PROJECT_EXTENSION)
  await fs.promises.writeFile(finalPath, text, 'utf-8')
  return finalPath
})

// Whether the renderer holds edits that closing the window would lose.
let hasUnsavedEdits = false
listen('app:setDirty', (_, dirty) => { hasUnsavedEdits = !!dirty })

handle('ffmpeg:cancel', () => { cancelAllCommands() })

handle('dialog:openSubtitle', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: t('filter_subtitles'), extensions: ['srt'] }],
    properties: ['openFile'],
  })
  if (canceled) return null
  const content = decodeText(await fs.promises.readFile(filePaths[0]))
  return { filePath: filePaths[0], content }
})

handle('dialog:saveVideo', async (_, defaultName, format) => {
  const formats = { mp4: 'MP4', mov: 'MOV', webm: 'WebM', avi: 'AVI', gif: 'GIF' }
  const known = Object.keys(formats)
  const chosen = known.includes(format) ? format : null
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: defaultName || `output.${chosen || 'mp4'}`,
    // Offering only the chosen format keeps the name's extension and the
    // encoder in agreement.
    filters: (chosen ? [chosen] : known).map(ext => ({ name: formats[ext], extensions: [ext] })),
  })
  if (canceled || !filePath) return null

  // GTK dialogs return what was typed: no extension, or the wrong one. ffmpeg
  // picks its muxer from the name, so a mismatch fails the whole export.
  const finalPath = chosen ? ensureExtension(filePath, chosen) : filePath
  if (finalPath !== filePath && await exists(finalPath)) {
    // The dialog already confirmed `filePath`, not this one.
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      message: t('overwrite_msg', path.basename(finalPath)),
      buttons: [t('overwrite_yes'), t('update_later')],
      defaultId: 1,
      cancelId: 1,
    })
    if (response !== 0) return null
  }
  allowedOutputs.add(finalPath)
  return finalPath
})

let exporting = false

handle('ffmpeg:export', async (event, rawOptions) => {
  const options = validateExportOptions(rawOptions)
  const { inputPath, outputPath } = options

  if (!allowedMedia.has(path.resolve(inputPath))) throw new Error('Input file was not opened through the app')
  if (!allowedOutputs.has(outputPath)) throw new Error('Output location was not chosen through the save dialog')
  if (exporting) throw new Error('An export is already running')
  exporting = true

  let workDir = null
  let startedWriting = false
  try {
    workDir = await fs.promises.mkdtemp(path.join(app.getPath('temp'), 'lc_export_'))
    activeWorkDirs.add(workDir)

    await exportVideo({
      run: runFfmpeg,
      probe: probeFile,
      getFilterFfmpeg,
      sendProgress: (pct) => event.sender.send('ffmpeg:progress', pct),
      onStartWriting: () => { startedWriting = true },
      options,
      workDir,
    })

    event.sender.send('ffmpeg:progress', 100)
    return { success: true, outputPath }
  } catch (err) {
    // An interrupted run leaves a truncated file at the chosen location; a
    // failure before ffmpeg started must not touch a file being overwritten.
    if (startedWriting) await unlinkQuiet(outputPath)
    throw new Error(err instanceof Error ? err.message : String(err), { cause: err })
  } finally {
    // Runs on the failure path too: a pass that errors halfway through
    // otherwise leaves its intermediate behind in the temp dir.
    if (workDir) {
      activeWorkDirs.delete(workDir)
      await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {})
    }
    exporting = false
  }
})
