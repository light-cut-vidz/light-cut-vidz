const { exec } = require('child_process')
const { shell } = require('electron')
const https = require('https')
const fs = require('fs')
const path = require('path')
const os = require('os')

const REPO = 'light-cut-vidz/light-cut-vidz'

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
    // app-update.yml absent in DMG builds that predate the publish config — ignore silently.
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

async function checkForUpdates({ autoUpdater, dialog, app, getWindow, t, state, isDev, isHomebrew, isDmg, isDeb, fromMenu,
  _homebrewHandler = _upgradeHomebrew,
  _dmgHandler = _upgradeDmg,
  _debHandler = _upgradeDeb,
}) {
  if (isDev) return
  const win = getWindow()

  if (isHomebrew) return _homebrewHandler({ dialog, app, win, t, fromMenu })
  if (isDmg)      return _dmgHandler({ dialog, app, win, t, fromMenu })
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
    if (fromMenu) {
      dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: String(err.message || err) })
    }
  }
}

async function _upgradeDmg({ dialog, app, win, t, fromMenu, _fetchJson = fetchJson, _openExternal = (url) => shell.openExternal(url) }) {
  let latest
  try {
    const data = await _fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`)
    latest = data?.tag_name?.replace(/^v/, '')
  } catch (err) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: String(err.message || err) })
    return
  }

  if (!latest) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'info', title: t('no_update_title'), message: t('no_update_msg') })
    return
  }

  const current = app.getVersion()
  if (latest === current) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'info', title: t('no_update_title'), message: t('no_update_msg_v', latest) })
    return
  }

  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    title: t('update_available_title'),
    message: t('update_available_msg', latest, current),
    detail: t('update_dmg_detail'),
    buttons: [t('update_open_releases'), t('update_later')],
    defaultId: 0,
  })
  if (response === 0) {
    _openExternal(`https://github.com/${REPO}/releases/latest`)
  }
}

async function _upgradeHomebrew({ dialog, app, win, t, fromMenu, _exec = exec, _fetchJson = fetchJson }) {
  let latest
  try {
    const data = await _fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`)
    latest = data?.tag_name?.replace(/^v/, '')
  } catch (err) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: String(err.message || err) })
    return
  }

  if (!latest) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'info', title: t('no_update_title'), message: t('no_update_msg') })
    return
  }

  const current = app.getVersion()
  if (latest === current) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'info', title: t('no_update_title'), message: t('no_update_msg_v', latest) })
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
    title: t('update_installing_title'),
    message: t('update_installing_msg'),
    buttons: ['OK'],
  })

  await new Promise((resolve) => {
    _exec('brew upgrade --cask lightcutvidz', (err) => {
      if (err) {
        dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: String(err.message || err) })
        return resolve()
      }
      app.relaunch()
      app.exit(0)
      resolve()
    })
  })
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
  if (latest === current) {
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

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    https.get(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'LightCutVidz-updater' } },
      (res) => {
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

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const parsed = new URL(url)
    https.get(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'LightCutVidz-updater' } },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close()
          return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
        }
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
      }
    ).on('error', (err) => {
      fs.unlink(dest, () => {})
      reject(err)
    })
  })
}

module.exports = { setupAutoUpdater, checkForUpdates, _upgradeHomebrew, _upgradeDmg, _upgradeDeb }
