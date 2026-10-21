const electron = require('electron')
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, nativeTheme } = electron
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
const { createExportQueue } = require('./lib/exportQueue')
const { readJson, writeJson } = require('./lib/store')
const { sanitizeRecent, addRecent, removeRecent } = require('./lib/recent')
const { sanitizeSettings, THEMES } = require('./lib/settings')
const { detectHardware, stabilizationWorks } = require('./lib/hardware')
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

// The bundled ffmpeg has no GPU encoder on Linux. Pointing this variable at a
// system ffmpeg (built with NVENC / VAAPI / QSV) makes those encoders usable.
const customFfmpeg = process.env.LIGHTCUTVIDZ_FFMPEG
const ffmpegPath = customFfmpeg && path.isAbsolute(customFfmpeg) && fs.existsSync(customFfmpeg)
  ? customFfmpeg
  : fixAsarPath(ffmpegStatic)
const ffmpeg = createFfmpeg({ ffmpegPath })

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
let settings = sanitizeSettings(null)
/** @type {{ kind: 'project'|'video', path: string, openedAt: number }[]} */
let recentItems = []
// The video of the project being opened is not "a video the user opened".
let skipRecentVideoFor = null
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

// ─── Settings and recent files ────────────────────────────────────────────────

const settingsFile = () => path.join(app.getPath('userData'), 'settings.json')
const recentFile = () => path.join(app.getPath('userData'), 'recent.json')

async function loadPersisted() {
  settings = sanitizeSettings(await readJson(settingsFile()))
  recentItems = sanitizeRecent(await readJson(recentFile()))
  // The renderer follows `prefers-color-scheme`, which this drives: one switch
  // themes the page, the native menus and the dialogs.
  if (nativeTheme) nativeTheme.themeSource = settings.theme
}

async function setTheme(theme) {
  if (!THEMES.includes(theme)) return
  settings = { ...settings, theme }
  if (nativeTheme) nativeTheme.themeSource = theme
  rebuildMenu()
  await writeJson(settingsFile(), settings).catch(() => {})
}

async function rememberRecent(filePath) {
  recentItems = addRecent(recentItems, filePath)
  rebuildMenu()
  await writeJson(recentFile(), { items: recentItems }).catch(() => {})
}

async function forgetRecent(filePath) {
  recentItems = filePath === undefined ? [] : removeRecent(recentItems, filePath)
  rebuildMenu()
  await writeJson(recentFile(), { items: recentItems }).catch(() => {})
}

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: nativeTheme && !nativeTheme.shouldUseDarkColors ? '#f4f4f6' : '#0f0f0f',
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
    const exportsRunning = exportQueue.hasActive()
    if ((!hasUnsavedEdits && !exportsRunning) || forceClose) return
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      message: exportsRunning ? t('confirm_quit_exports') : t('confirm_quit_msg'),
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

app.whenReady().then(async () => {
  await loadPersisted()
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
  exportQueue.cancelAll()
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
    currentTheme: settings.theme,
    recent: recentItems,
    onOpenRecent: openRecent,
    onClearRecent: () => { void forgetRecent() },
    onSwitchTheme: (theme) => { void setTheme(theme) },
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
  await openProjectFile(target, filePaths[0])
}

async function openProjectFile(target, filePath) {
  let project
  try {
    project = parseProject(await fs.promises.readFile(filePath, 'utf-8'))
  } catch {
    dialog.showMessageBox(target, { type: 'error', message: t('project_invalid') })
    return
  }
  if (!(await exists(project.videoPath))) {
    dialog.showMessageBox(target, { type: 'error', message: t('project_video_missing', project.videoPath) })
    return
  }
  allowMedia(project.videoPath)
  skipRecentVideoFor = project.videoPath
  void rememberRecent(filePath)
  target.webContents.send('menu:loadProject', project)
}

/** Opens something from the recent list (and only from it: that is the allow-list). */
async function openRecent(filePath) {
  const item = recentItems.find(i => i.path === filePath)
  if (!item || !win) return
  if (!(await exists(item.path))) {
    await forgetRecent(item.path)
    dialog.showMessageBox(win, { type: 'error', message: t('recent_missing', item.path) })
    return
  }
  if (item.kind === 'project') await openProjectFile(win, item.path)
  else sendOpenVideo(item.path)
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

function cancelAllCommands() {
  for (const handle of activeCommands) handle.kill()
}

const probeFile = (filePath) => ffmpeg.probe(filePath)

// ─── Export queue ─────────────────────────────────────────────────────────────

const sendToWindow = (channel, payload) => { if (win) win.webContents.send(channel, payload) }

const exportQueue = createExportQueue({
  execute: (options, ctx) => executeExport(options, ctx),
  onChange: (jobs) => sendToWindow('queue:update', jobs),
})

/** Runs one validated export: probe, passes, cleanup. Called by the queue. */
async function executeExport(options, ctx) {
  const handles = new Set()
  ctx.setKill(() => { for (const h of handles) h.kill() })

  // Each ffmpeg process of this job is tracked on its own, so cancelling the job
  // stops exactly its processes, and quitting stops all of them.
  const run = async (args, onProgress) => {
    if (ctx.isCancelled()) throw new Error('cancelled')
    const handle = ffmpeg.run(args, { onProgress })
    handles.add(handle)
    activeCommands.add(handle)
    try { await handle.promise } finally { handles.delete(handle); activeCommands.delete(handle) }
  }

  let workDir = null
  let startedWriting = false
  try {
    workDir = await fs.promises.mkdtemp(path.join(app.getPath('temp'), 'lc_export_'))
    activeWorkDirs.add(workDir)
    await exportVideo({
      run,
      probe: probeFile,
      getFilterFfmpeg,
      sendProgress: ctx.setProgress,
      warn: (message) => console.warn('[export]', message),
      onStartWriting: () => { startedWriting = true },
      options,
      workDir,
    })
    return { success: true, outputPath: options.outputPath }
  } catch (err) {
    // An interrupted run leaves a truncated file at the chosen location; a
    // failure before ffmpeg started must not touch a file being overwritten.
    if (startedWriting) await unlinkQuiet(options.outputPath)
    throw new Error(err instanceof Error ? err.message : String(err), { cause: err })
  } finally {
    // Runs on the failure path too: a pass that errors halfway through
    // otherwise leaves its intermediate behind in the temp dir.
    if (workDir) {
      activeWorkDirs.delete(workDir)
      await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {})
    }
  }
}

// What this ffmpeg can do beyond software encoding, probed once.
let capabilitiesPromise = null
function getCapabilities() {
  if (!capabilitiesPromise) {
    capabilitiesPromise = (async () => {
      const run = (args) => ffmpeg.run(args).promise
      const workDir = await fs.promises.mkdtemp(path.join(app.getPath('temp'), 'lc_probe_'))
      try {
        return {
          hardware: await detectHardware({ run, platform: process.platform }),
          stabilization: await stabilizationWorks({ run, filtersText: await ffmpeg.query(['-filters']), workDir }),
        }
      } finally {
        await fs.promises.rm(workDir, { recursive: true, force: true })
      }
    })()
  }
  return capabilitiesPromise
}

/** Validates an export request against the app's state and this machine. */
async function prepareExportJob(rawOptions) {
  const options = validateExportOptions(rawOptions)
  if (!allowedMedia.has(path.resolve(options.inputPath))) throw new Error('Input file was not opened through the app')
  if (!allowedOutputs.has(options.outputPath)) throw new Error('Output location was not chosen through the save dialog')
  if (options.hardware || options.stabilize !== 'off') {
    const caps = await getCapabilities()
    // An encoder this machine cannot run is not an error: fall back to software.
    if (options.hardware && !caps.hardware.includes(options.hardware)) options.hardware = null
    if (options.stabilize !== 'off' && !caps.stabilization) throw new Error('Stabilization is not available in this build of ffmpeg')
  }
  return options
}

const jobMeta = (options) => ({ name: path.basename(options.outputPath), format: options.format, outputPath: options.outputPath })

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
  if (skipRecentVideoFor === inputPath) skipRecentVideoFor = null
  else void rememberRecent(inputPath)

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
  void rememberRecent(finalPath)
  return finalPath
})

// Whether the renderer holds edits that closing the window would lose.
let hasUnsavedEdits = false
listen('app:setDirty', (_, dirty) => { hasUnsavedEdits = !!dirty })

handle('ffmpeg:cancel', () => {
  for (const id of dialogJobs) exportQueue.cancel(id)
  // ...and the preview transcode, which is not a queue job.
  if (previewHandle) previewHandle.kill()
})

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

// Jobs started from the export dialog (which waits for them): "Stop export" there
// cancels these, wherever they are in the queue.
const dialogJobs = new Set()

handle('ffmpeg:export', async (event, rawOptions) => {
  const options = await prepareExportJob(rawOptions)
  const job = exportQueue.add(options, { ...jobMeta(options), onProgress: (pct) => event.sender.send('ffmpeg:progress', pct) })
  dialogJobs.add(job.id)
  try {
    const result = await job.done
    event.sender.send('ffmpeg:progress', 100)
    return result
  } finally {
    dialogJobs.delete(job.id)
  }
})

// Adds an export to the queue and returns at once.
handle('queue:add', async (_, rawOptions) => {
  const options = await prepareExportJob(rawOptions)
  return { id: exportQueue.add(options, jobMeta(options)).id }
})
handle('queue:list', () => exportQueue.list())
handle('queue:cancel', (_, id) => exportQueue.cancel(id))
handle('queue:clearFinished', () => { exportQueue.clearFinished() })
handle('queue:reveal', (_, id) => {
  const job = exportQueue.get(id)
  if (job && job.status === 'done') shell.showItemInFolder(job.outputPath)
})
handle('recent:list', async () => {
  const out = []
  for (const item of recentItems) {
    if (await exists(item.path)) out.push({ kind: item.kind, path: item.path, name: path.basename(item.path), dir: path.dirname(item.path), openedAt: item.openedAt })
  }
  return out
})
handle('recent:open', (_, filePath) => openRecent(filePath))
handle('recent:remove', (_, filePath) => forgetRecent(typeof filePath === 'string' ? filePath : ''))
handle('recent:clear', () => forgetRecent())
handle('settings:get', () => ({ ...settings }))
handle('settings:setTheme', (_, theme) => setTheme(theme))
handle('ffmpeg:capabilities', () => getCapabilities())
