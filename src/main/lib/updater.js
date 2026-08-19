const { exec, spawn } = require('child_process')
const https = require('https')
const fs = require('fs')
const path = require('path')
const os = require('os')

const REPO = 'light-cut-vidz/light-cut-vidz'

// Compares release versions numerically. An equality check is not enough: if the
// latest release is ever older than the installed build, `latest !== current` holds
// and a downgrade gets offered to the user as if it were an update.
function isNewer(remote, current) {
  const parse = (v) => String(v).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const [r, c] = [parse(remote), parse(current)]
  for (let i = 0; i < Math.max(r.length, c.length); i++) {
    if ((r[i] || 0) !== (c[i] || 0)) return (r[i] || 0) > (c[i] || 0)
  }
  return false
}

function showUpdateReadyDialog({ dialog, win, t, autoUpdater }) {
  return dialog.showMessageBox(win, {
    type: 'info',
    title: t('update_ready_title'),
    message: t('update_ready_msg'),
    buttons: [t('update_restart_now'), t('update_later')],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall()
  })
}

function setupAutoUpdater({ autoUpdater, dialog, getWindow, t, state }) {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (err) => {
    // app-update.yml absent in some builds — ignore silently.
    // The user-triggered path (checkForUpdates fromMenu) handles this case with a proper message.
    if (err.code === 'ENOENT') return
    dialog.showMessageBox(getWindow(), {
      type: 'error',
      title: t('update_failed_title'),
      message: String(err.message || err),
    })
  })

  autoUpdater.on('update-downloaded', () => {
    state.updateDownloaded = true
    showUpdateReadyDialog({ dialog, win: getWindow(), t, autoUpdater })
  })
}

async function checkForUpdates({ autoUpdater, dialog, app, getWindow, t, state, isDev, isMac, isDeb, fromMenu,
  _macHandler = _upgradeMac,
  _debHandler = _upgradeDeb,
}) {
  if (isDev) return
  const win = getWindow()

  if (isMac)  return _macHandler({ dialog, app, win, t, fromMenu })
  if (isDeb)      return _debHandler({ dialog, app, win, t, fromMenu })

  // electron-updater: AppImage (Linux) only
  if (state.updateDownloaded) {
    return showUpdateReadyDialog({ dialog, win, t, autoUpdater })
  }

  try {
    const result = await autoUpdater.checkForUpdates()
    if (!result || !result.updateInfo) {
      if (fromMenu) dialog.showMessageBox(win, { type: 'info', title: t('no_update_title'), message: t('no_update_msg') })
      return
    }
    const latest = result.updateInfo.version
    if (!isNewer(latest, app.getVersion())) {
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
    if (fromMenu) {
      dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: String(err.message || err) })
    }
  }
}

function _defaultSpawn(script) {
  const child = spawn('sh', ['-c', script], { detached: true, stdio: 'ignore' })
  child.unref()
}

/** Remplace l'app par la version publiée, puis la relance.
 *
 * `electron-updater` ne sait pas le faire sur macOS : son moteur vérifie la signature
 * Apple du bundle, et l'app n'est signée qu'ad hoc. Un script détaché n'a rien à
 * vérifier. L'app doit se retirer d'abord — macOS refuse qu'un bundle en cours
 * d'exécution soit remplacé.
 *
 * Ne passe volontairement plus par `brew upgrade` : le cask du tap n'est réécrit
 * qu'après la release, donc y déléguer laissait une fenêtre où l'utilisateur clique,
 * l'app redémarre, et rien n'a changé. La release seule fait foi, comme dans les
 * autres applications.
 */
async function _upgradeMac({ dialog, app, win, t, fromMenu,
  _fetchJson = fetchJson,
  _downloadFile = downloadFile,
  _spawn = _defaultSpawn,
  _appPath = '/Applications/LightCutVidz.app',
}) {
  let releaseData
  try {
    releaseData = await _fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`)
  } catch (err) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: String(err.message || err) })
    return
  }

  const latest = releaseData?.tag_name?.replace(/^v/, '')
  if (!latest) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'info', title: t('no_update_title'), message: t('no_update_msg') })
    return
  }

  const current = app.getVersion()
  if (!isNewer(latest, current)) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'info', title: t('no_update_title'), message: t('no_update_msg_v', latest) })
    return
  }

  const asset = releaseData?.assets?.find(a => a.name.endsWith('.zip'))
  if (!asset) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: 'No macOS archive found in this release.' })
    return
  }

  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    title: t('update_available_title'),
    message: t('update_available_msg', latest, current),
    detail: t('update_available_detail'),
    buttons: [t('update_download_install'), t('update_later')],
    defaultId: 0,
  })
  if (response !== 0) return

  dialog.showMessageBox(win, {
    type: 'info',
    title: t('update_downloading_title'),
    message: t('update_downloading_msg'),
    buttons: ['OK'],
  })

  const tmpPath = path.join(os.tmpdir(), asset.name)
  try {
    await _downloadFile(asset.browser_download_url, tmpPath)
  } catch (err) {
    dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: String(err.message || err) })
    return
  }

  await dialog.showMessageBox(win, {
    type: 'info',
    title: t('update_installing_title'),
    message: t('update_restarting_msg'),
    buttons: ['OK'],
  })

  // Dossier propre à la version : deux mises à jour lancées coup sur coup ne
  // doivent pas se disputer le même point de décompression.
  const stage = `/tmp/lcv-update-${latest}`
  const script = [
    'sleep 2',
    `rm -rf "${stage}"`,
    `mkdir -p "${stage}"`,
    `ditto -x -k "${tmpPath}" "${stage}"`,
    `rm -rf "${_appPath}"`,
    `cp -R "${stage}/LightCutVidz.app" "${_appPath}"`,
    `rm -rf "${stage}" "${tmpPath}"`,
    // Sans ces deux-là macOS refuse d'ouvrir un bundle fraîchement recopié.
    `xattr -dr com.apple.quarantine "${_appPath}"`,
    `codesign --force --deep --sign - "${_appPath}"`,
    `open -a "${_appPath}"`,
  ].join(' && ')
  _spawn(script)
  app.exit(0)
}

async function _upgradeDeb({ dialog, app, win, t, fromMenu, _exec = exec, _fetchJson = fetchJson, _downloadFile = downloadFile }) {
  let releaseData
  try {
    releaseData = await _fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`)
  } catch (err) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: String(err.message || err) })
    return
  }

  const latest = releaseData?.tag_name?.replace(/^v/, '')
  if (!latest) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'info', title: t('no_update_title'), message: t('no_update_msg') })
    return
  }

  const current = app.getVersion()
  if (!isNewer(latest, current)) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'info', title: t('no_update_title'), message: t('no_update_msg_v', latest) })
    return
  }

  const debAsset = releaseData?.assets?.find(a => a.name.endsWith('.deb'))
  if (!debAsset) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: 'No .deb package found in this release.' })
    return
  }

  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    title: t('update_available_title'),
    message: t('update_available_msg', latest, current),
    detail: t('update_available_detail'),
    buttons: [t('update_download_install'), t('update_later')],
    defaultId: 0,
  })
  if (response !== 0) return

  dialog.showMessageBox(win, {
    type: 'info',
    title: t('update_downloading_title'),
    message: t('update_downloading_msg'),
    buttons: ['OK'],
  })

  const tmpPath = path.join(os.tmpdir(), debAsset.name)
  try {
    await _downloadFile(debAsset.browser_download_url, tmpPath)
  } catch (err) {
    dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: String(err.message || err) })
    return
  }

  dialog.showMessageBox(win, {
    type: 'info',
    title: t('update_installing_title'),
    message: t('update_installing_msg'),
    buttons: ['OK'],
  })

  // pkexec shows a polkit GUI password prompt on Linux desktops
  _exec(`pkexec apt-get install -y "${tmpPath}"`, (err) => {
    if (err) {
      dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: String(err.message || err) })
      return
    }
    try { fs.unlinkSync(tmpPath) } catch { /* ignore */ }
    app.relaunch()
    app.exit(0)
  })
}

const REDIRECT_CODES = [301, 302, 303, 307, 308]

function fetchJson(url, _get = https.get) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    _get(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'LightCutVidz-updater' } },
      (res) => {
        // Without this, a rate-limited or failing GitHub response parses as
        // valid JSON with no tag_name, and the app reports "already up to date".
        if (res.statusCode >= 400) {
          res.resume()
          reject(new Error(`GitHub responded ${res.statusCode}`))
          return
        }
        let data = ''
        res.on('data', chunk => { data += chunk })
        res.on('end', () => {
          try { resolve(JSON.parse(data)) }
          catch (e) { reject(e) }
        })
      }
    ).on('error', reject)
  })
}

function downloadFile(url, dest, _get = https.get) {
  return new Promise((resolve, reject) => {
    // Unlink only once the stream is closed: createWriteStream opens the file
    // asynchronously, so deleting first can race the open and leave the
    // half-written file on disk.
    const fail = (err) => {
      file.close(() => fs.unlink(dest, () => reject(err)))
    }
    const file = fs.createWriteStream(dest)
    const parsed = new URL(url)
    _get(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'LightCutVidz-updater' } },
      (res) => {
        if (REDIRECT_CODES.includes(res.statusCode) && res.headers.location) {
          file.close()
          res.resume()
          return downloadFile(res.headers.location, dest, _get).then(resolve).catch(reject)
        }
        // An error body would otherwise be written to disk as if it were the
        // package, then handed to `pkexec apt-get install`.
        if (res.statusCode !== 200) {
          res.resume()
          return fail(new Error(`Download failed with HTTP ${res.statusCode}`))
        }
        res.pipe(file)
        file.on('error', fail)
        file.on('finish', () => file.close(() => resolve()))
      }
    ).on('error', fail)
  })
}

module.exports = { setupAutoUpdater, checkForUpdates, _upgradeMac, _upgradeDeb, fetchJson, downloadFile, isNewer, showUpdateReadyDialog }
