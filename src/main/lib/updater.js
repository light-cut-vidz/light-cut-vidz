// Wraps electron-updater with our localized dialogs. Side-effect-free until
// setupAutoUpdater() is called, which wires the event listeners.

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

async function checkForUpdates({ autoUpdater, dialog, app, getWindow, t, state, isDev, isSnap, fromMenu }) {
  if (isDev || isSnap) return
  const win = getWindow()

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

module.exports = { setupAutoUpdater, checkForUpdates }
