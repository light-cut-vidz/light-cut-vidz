const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const ffmpeg = require('fluent-ffmpeg')
const ffmpegStatic = require('ffmpeg-static')
const ffprobeInstaller = require('@ffprobe-installer/ffprobe')
const { autoUpdater } = require('electron-updater')

// In production, binaries are unpacked from the asar archive
function fixAsarPath(p) {
  return p.replace('app.asar', 'app.asar.unpacked')
}

ffmpeg.setFfmpegPath(fixAsarPath(ffmpegStatic))
ffmpeg.setFfprobePath(fixAsarPath(ffprobeInstaller.path))

const isDev = process.env.NODE_ENV === 'development'
const isSnap = !!process.env.SNAP

// ─── i18n (main process) ──────────────────────────────────────────────────────

let currentLang = 'en'
let win = null

const msgs = {
  en: {
    // Auto-updater dialogs
    update_ready_title: 'Update ready',
    update_ready_msg: 'The update has been downloaded. The app will restart to apply it.',
    update_restart_now: 'Restart now',
    update_later: 'Later',
    dev_mode_title: 'Dev mode',
    dev_mode_msg: 'Auto-update is disabled in development.',
    no_update_title: 'No update',
    no_update_msg: 'You are already using the latest version.',
    no_update_msg_v: (v) => `You are already on the latest version (${v}).`,
    update_available_title: 'Update available',
    update_available_msg: (latest, current) => `Version ${latest} is available (current: ${current}).`,
    update_available_detail: 'Do you want to download and install it now?',
    update_download_install: 'Download & Install',
    update_downloading_title: 'Downloading update…',
    update_downloading_msg: 'The update is being downloaded. You will be prompted to restart when ready.',
    update_failed_title: 'Update check failed',
    // Menu
    menu_file: 'File',
    menu_open_video: 'Open video…',
    menu_edit: 'Edit',
    menu_undo: 'Undo',
    menu_redo: 'Redo',
    menu_view: 'View',
    menu_fullscreen: 'Toggle Full Screen',
    menu_help: 'Help',
    menu_check_updates: 'Check for Updates…',
    menu_language: 'Language',
  },
  fr: {
    // Auto-updater dialogs
    update_ready_title: 'Mise à jour prête',
    update_ready_msg: 'La mise à jour a été téléchargée. L\'application va redémarrer pour l\'appliquer.',
    update_restart_now: 'Redémarrer maintenant',
    update_later: 'Plus tard',
    dev_mode_title: 'Mode développement',
    dev_mode_msg: 'La mise à jour automatique est désactivée en développement.',
    no_update_title: 'Pas de mise à jour',
    no_update_msg: 'Vous utilisez déjà la dernière version.',
    no_update_msg_v: (v) => `Vous êtes déjà sur la dernière version (${v}).`,
    update_available_title: 'Mise à jour disponible',
    update_available_msg: (latest, current) => `La version ${latest} est disponible (actuelle : ${current}).`,
    update_available_detail: 'Voulez-vous la télécharger et l\'installer maintenant ?',
    update_download_install: 'Télécharger et installer',
    update_downloading_title: 'Téléchargement en cours…',
    update_downloading_msg: 'La mise à jour est en cours de téléchargement. Vous serez invité à redémarrer une fois prêt.',
    update_failed_title: 'Échec de la vérification',
    // Menu
    menu_file: 'Fichier',
    menu_open_video: 'Ouvrir une vidéo…',
    menu_edit: 'Édition',
    menu_undo: 'Annuler',
    menu_redo: 'Rétablir',
    menu_view: 'Affichage',
    menu_fullscreen: 'Basculer en plein écran',
    menu_help: 'Aide',
    menu_check_updates: 'Vérifier les mises à jour…',
    menu_language: 'Langue',
  },
}

const t = (key, ...args) => {
  const val = msgs[currentLang]?.[key] ?? msgs.en[key]
  return typeof val === 'function' ? val(...args) : val
}

// ─── Auto updater ─────────────────────────────────────────────────────────────

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

let updateDownloaded = false

autoUpdater.on('error', (err) => {
  dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: String(err.message || err) })
})

autoUpdater.on('update-downloaded', () => {
  updateDownloaded = true
  dialog.showMessageBox(win, {
    type: 'info',
    title: t('update_ready_title'),
    message: t('update_ready_msg'),
    buttons: [t('update_restart_now'), t('update_later')],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall()
  })
})

async function checkForUpdates(fromMenu = false) {
  if (isDev || isSnap) return
  if (updateDownloaded) {
    dialog.showMessageBox(win, {
      type: 'info',
      title: t('update_ready_title'),
      message: t('update_ready_msg'),
      buttons: [t('update_restart_now'), t('update_later')],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
    return
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result || !result.updateInfo) {
      if (fromMenu) dialog.showMessageBox(win, { type: 'info', title: t('no_update_title'), message: t('no_update_msg') })
      return
    }
    const latest = result.updateInfo.version
    if (latest === app.getVersion()) {
      if (fromMenu) dialog.showMessageBox(win, { type: 'info', title: t('no_update_title'), message: t('no_update_msg_v', latest) })
      return
    }
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: t('update_available_title'),
      message: t('update_available_msg', latest, app.getVersion()),
      detail: t('update_available_detail'),
      buttons: [t('update_download_install'), t('update_later')],
      defaultId: 0,
    })
    if (response === 0) {
      dialog.showMessageBox(win, {
        type: 'info',
        title: t('update_downloading_title'),
        message: t('update_downloading_msg'),
        buttons: ['OK'],
      })
      autoUpdater.downloadUpdate().catch((err) => {
        dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: String(err.message || err) })
      })
    }
  } catch (err) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: String(err.message || err) })
  }
}

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
      webSecurity: false, // allow loading local video files
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html')
    win.loadFile(indexPath)
  }

  win.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12' && isDev) win.webContents.openDevTools()
    if (input.key === 'Escape' && win.isFullScreen()) win.setFullScreen(false)
  })
}

app.whenReady().then(() => {
  process.title = 'LightCutVidz'
  app.setName('LightCutVidz')
  createWindow()
  buildMenu()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ─── Native menu ──────────────────────────────────────────────────────────────

function buildMenu() {
  const isMac = process.platform === 'darwin'

  const template = [
    ...(isMac ? [{
      label: 'LightCutVidz',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: t('menu_file'),
      submenu: [
        {
          label: t('menu_open_video'),
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const win = BrowserWindow.getFocusedWindow()
            if (!win) return
            const { canceled, filePaths } = await dialog.showOpenDialog(win, {
              filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'm4v'] }],
              properties: ['openFile'],
            })
            if (!canceled && filePaths[0]) {
              win.webContents.send('menu:openVideo', filePaths[0])
            }
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: t('menu_edit'),
      submenu: [
        {
          id: 'undo',
          label: t('menu_undo'),
          accelerator: 'CmdOrCtrl+Z',
          enabled: false,
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu:undo'),
        },
        {
          id: 'redo',
          label: t('menu_redo'),
          accelerator: process.platform === 'darwin' ? 'Cmd+Shift+Z' : 'Ctrl+Y',
          enabled: false,
          click: () => BrowserWindow.getFocusedWindow()?.webContents.send('menu:redo'),
        },
      ],
    },
    {
      label: t('menu_view'),
      submenu: [
        {
          label: t('menu_fullscreen'),
          accelerator: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (!win) return
            const entering = !win.isFullScreen()
            win.setFullScreen(entering)
            if (entering) {
              win.webContents.send('menu:fullscreen-entered')
            }
          },
        },
      ],
    },
    {
      label: t('menu_help'),
      submenu: [
        {
          label: t('menu_check_updates'),
          enabled: !isSnap,
          click: () => checkForUpdates(true),
        },
        { type: 'separator' },
        {
          label: t('menu_language'),
          submenu: [
            {
              id: 'lang-en',
              label: 'English',
              type: 'radio',
              checked: currentLang === 'en',
              click: () => switchLanguage('en'),
            },
            {
              id: 'lang-fr',
              label: 'Français',
              type: 'radio',
              checked: currentLang === 'fr',
              click: () => switchLanguage('fr'),
            },
          ],
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function switchLanguage(lang) {
  currentLang = lang
  buildMenu()
  // Notify all renderer windows
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('menu:setLanguage', lang)
  }
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// Undo/Redo menu state sync
ipcMain.on('menu:setUndoRedoState', (_, { canUndo, canRedo }) => {
  const menu = Menu.getApplicationMenu()
  if (!menu) return
  const undoItem = menu.getMenuItemById('undo')
  const redoItem = menu.getMenuItemById('redo')
  if (undoItem) undoItem.enabled = canUndo
  if (redoItem) redoItem.enabled = canRedo
})

// Language sync from renderer (on startup or programmatic change)
ipcMain.on('menu:setLanguage', (_, lang) => {
  if (lang !== currentLang && (lang === 'en' || lang === 'fr')) {
    currentLang = lang
    buildMenu()
  }
})

// Open file dialog
ipcMain.handle('dialog:openVideo', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'Videos', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'm4v'] }],
    properties: ['openFile'],
  })
  if (canceled) return null
  return filePaths[0]
})

// Transcode video to WebM for preview (solves Electron codec limitations)
ipcMain.handle('ffmpeg:preview', async (event, inputPath) => {
  const tmpDir = app.getPath('temp')
  const outPath = path.join(tmpDir, `lc_preview_${Date.now()}.webm`)

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
      .on('end', () => resolve(outPath))
      .on('error', (err) => reject(err.message))
      .run()
  })
})

// Save file dialog
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
  if (canceled) return null
  return filePath
})

// Get video metadata
ipcMain.handle('ffmpeg:probe', async (_, filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err.message)
      else resolve(metadata)
    })
  })
})

// Export video with all edits applied
ipcMain.handle('ffmpeg:export', async (event, options) => {
  const {
    inputPath,
    outputPath,
    segments,      // [{start, end}] — parts to KEEP
    speed,         // e.g. 1.5
    crop,          // {x, y, w, h} in original pixels, or null
    muted,         // boolean
    format,        // 'mp4' | 'mov' | 'webm' | 'gif' | 'avi'
    duration,      // total duration in seconds
  } = options

  return new Promise(async (resolve, reject) => {
    try {
      const tmpDir = app.getPath('temp')
      const segmentFiles = []

      // Step 1: Extract and process each kept segment
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i]
        const segOut = path.join(tmpDir, `lc_seg_${Date.now()}_${i}.mp4`)
        segmentFiles.push(segOut)

        await new Promise((res, rej) => {
          let cmd = ffmpeg(inputPath)
            .inputOptions([`-ss ${seg.start}`, `-t ${seg.end - seg.start}`])

          // Build video filters
          const vFilters = []

          if (crop) {
            vFilters.push(`crop=${Math.round(crop.w)}:${Math.round(crop.h)}:${Math.round(crop.x)}:${Math.round(crop.y)}`)
          }

          if (speed !== 1) {
            vFilters.push(`setpts=${(1 / speed).toFixed(4)}*PTS`)
          }

          if (vFilters.length > 0) {
            cmd = cmd.videoFilter(vFilters.join(','))
          }

          // Audio filters
          if (muted) {
            cmd = cmd.noAudio()
          } else if (speed !== 1) {
            cmd = cmd.audioFilter(`atempo=${clampAtempo(speed)}`)
          }

          cmd
            .outputOptions(['-c:v libx264', '-preset fast', '-crf 22', '-movflags +faststart'])
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

      // Step 2: Concatenate segments if more than one
      if (segmentFiles.length === 1) {
        // Just re-encode to target format/container
        await convertToFormat(segmentFiles[0], outputPath, format, event)
        fs.unlinkSync(segmentFiles[0])
      } else {
        const concatList = path.join(tmpDir, `lc_concat_${Date.now()}.txt`)
        fs.writeFileSync(concatList, segmentFiles.map(f => `file '${f}'`).join('\n'))

        const concatOut = path.join(tmpDir, `lc_joined_${Date.now()}.mp4`)
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

        // Convert to final format
        await convertToFormat(concatOut, outputPath, format, event)

        // Cleanup temp files
        segmentFiles.forEach(f => { try { fs.unlinkSync(f) } catch {} })
        try { fs.unlinkSync(concatList) } catch {}
        try { fs.unlinkSync(concatOut) } catch {}
      }

      event.sender.send('ffmpeg:progress', 100)
      resolve({ success: true, outputPath })
    } catch (err) {
      reject(err.message || String(err))
    }
  })
})

function convertToFormat(inputPath, outputPath, format, event) {
  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath)

    if (format === 'gif') {
      cmd = cmd
        .outputOptions(['-vf', 'fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse'])
        .noAudio()
    } else if (format === 'webm') {
      cmd = cmd.outputOptions(['-c:v libvpx-vp9', '-crf 30', '-b:v 0', '-c:a libopus'])
    } else {
      // mp4, mov, avi — copy stream if already h264
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

// atempo filter only accepts 0.5–2.0, chain for values outside that range
function clampAtempo(speed) {
  if (speed >= 0.5 && speed <= 2) return speed.toFixed(4)
  if (speed > 2) return `2.0,atempo=${(speed / 2).toFixed(4)}`
  // speed < 0.5
  return `0.5,atempo=${(speed * 2).toFixed(4)}`
}
