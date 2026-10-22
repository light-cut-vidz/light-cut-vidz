const { execFile, spawn } = require('child_process')
const crypto = require('crypto')
const https = require('https')
const fs = require('fs')
const path = require('path')
const os = require('os')

const REPO = 'light-cut-vidz/light-cut-vidz'

/** @param {unknown} err */
const errorText = (err) => String((err && /** @type {Error} */ (err).message) || err)

const { isNewer } = require('./version')
const { parseChangelog, entriesBetween, formatNotes } = require('./changelog')

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

  // electron-updater emits `error` AND rejects the promise of the call that
  // failed; the callers (checkForUpdates, downloadUpdate) report that rejection.
  // Showing a dialog here too is what used to pop it up twice. Errors outside a
  // user-driven call (e.g. a background check, app-update.yml absent in some
  // builds) are only logged.
  autoUpdater.on('error', (err) => {
    console.error('[updater]', err && err.message ? err.message : err)
  })

  autoUpdater.on('update-downloaded', () => {
    state.updateDownloaded = true
    showUpdateReadyDialog({ dialog, win: getWindow(), t, autoUpdater })
  })
}

/**
 * One check at a time. The start-up check and a click on "Check for updates"
 * could overlap and each open its own "update available" dialog; a check asked
 * for while another is running (or while its dialog is still on screen) joins
 * it instead of starting a second one.
 */
function checkForUpdates(deps) {
  const { state } = deps
  if (state.checking) return state.checking
  state.checking = runCheck(deps).finally(() => { state.checking = null })
  return state.checking
}

async function runCheck({ autoUpdater, dialog, app, getWindow, t, state, isDev, isMac, isDeb, isManual = false, fromMenu, openExternal, getLang, _fetchText = fetchText,
  _macHandler = _upgradeMac,
  _debHandler = _upgradeDeb,
  _manualHandler = _upgradeManual,
}) {
  const win = getWindow()
  if (isDev) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'info', title: t('dev_mode_title'), message: t('dev_mode_msg') })
    return
  }

  const lang = getLang && getLang()

  if (isMac)  return _macHandler({ dialog, app, win, t, fromMenu, lang, _fetchText })
  if (isDeb)      return _debHandler({ dialog, app, win, t, fromMenu, lang, _fetchText })
  if (isManual)   return _manualHandler({ dialog, app, win, t, fromMenu, openExternal, lang, _fetchText })

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

    const notes = await loadReleaseNotes({ lang, current: app.getVersion(), latest, _fetchText })
    const { response } = await dialog.showMessageBox(win, {
      type: 'info',
      title: t('update_available_title'),
      message: t('update_available_msg', latest, app.getVersion()),
      detail: withNotes(t, t('update_available_detail'), notes),
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
        dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: errorText(err) })
      })
    }
  } catch (err) {
    if (fromMenu) {
      dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: errorText(err) })
    }
  }
}

function _defaultSpawn(script, args) {
  const child = spawn('sh', ['-c', script, 'sh', ...args], { detached: true, stdio: 'ignore' })
  child.unref()
}

/**
 * What the update brings, in the user's language: the changelog entries between
 * the installed and the new version, read from the changelog *at the new tag*
 * (so skipped versions are all included). Returns '' on any failure — the notes
 * are a courtesy and must never block an update.
 */
async function loadReleaseNotes({ lang, current, latest, _fetchText = fetchText }) {
  if (!lang) return ''
  try {
    const file = lang === 'fr' ? 'CHANGELOG.fr.md' : 'CHANGELOG.md'
    const text = await _fetchText(`https://raw.githubusercontent.com/${REPO}/v${latest}/${file}`)
    return formatNotes(entriesBetween(parseChangelog(text), current, latest))
  } catch {
    return ''
  }
}

/** The dialog's `detail`: the question, then what is new. */
const withNotes = (t, detail, notes) => (notes ? `${detail}\n\n${t('update_whats_new')}\n${notes}` : detail)

const VERSION_RE = /^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.]+)?$/
const ASSET_NAME_RE = /^[A-Za-z0-9._-]+$/
const CHECKSUMS_NAME = 'SHA256SUMS'

/** Hash of `file`, streamed so a large package is not read into memory. */
function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

/**
 * Checks `file` against a `sha256sum`-format listing ("<hex>  <name>").
 * Throws when the name is absent or the hash differs.
 */
async function verifyChecksum(file, sumsText, assetName) {
  const line = String(sumsText).split(/\r?\n/)
    .map(l => /^([a-fA-F0-9]{64}) [ *]?(.+)$/.exec(l.trim()))
    .find(m => m && m[2] === assetName)
  if (!line) throw new Error(`No checksum published for ${assetName}`)
  const actual = await sha256File(file)
  if (actual !== line[1].toLowerCase()) throw new Error(`Checksum mismatch for ${assetName}`)
}

async function _verifyDownload(dir, assetPath, sumsPath, assetName) {
  await verifyChecksum(assetPath, await fs.promises.readFile(sumsPath, 'utf-8'), assetName)
}

const quietRemove = (target) => { try { fs.rmSync(target, { recursive: true, force: true }) } catch { /* ignore */ } }

/**
 * Shared front half of the macOS and deb flows: find the newer release, ask the
 * user, download the package and its checksum list into a private directory and
 * verify them. Returns { latest, dir, assetPath } or null when nothing is to be
 * installed (the user has been told why where that matters).
 *
 * The tag and asset names come from the network and end up in file paths and
 * commands, hence the strict patterns.
 */
async function _prepareUpdate({ dialog, app, win, t, fromMenu, ext, noAssetKey, lang = '', _fetchText = fetchText,
  _fetchJson = fetchJson,
  _downloadFile = downloadFile,
  _verify = _verifyDownload,
}) {
  const info = (title, message) => dialog.showMessageBox(win, { type: 'info', title, message })
  const error = (message) => dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message })

  let releaseData
  try {
    releaseData = await _fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`)
  } catch (err) {
    if (fromMenu) error(errorText(err))
    return null
  }

  const latest = releaseData?.tag_name?.replace(/^v/, '')
  if (!latest) {
    if (fromMenu) info(t('no_update_title'), t('no_update_msg'))
    return null
  }
  if (!VERSION_RE.test(latest)) {
    if (fromMenu) error(t('update_bad_release'))
    return null
  }

  const current = app.getVersion()
  if (!isNewer(latest, current)) {
    if (fromMenu) info(t('no_update_title'), t('no_update_msg_v', latest))
    return null
  }

  const assets = releaseData?.assets || []
  const asset = assets.find(a => a.name.endsWith(ext))
  if (!asset) {
    if (fromMenu) error(t(noAssetKey))
    return null
  }
  if (!ASSET_NAME_RE.test(asset.name)) {
    if (fromMenu) error(t('update_bad_release'))
    return null
  }
  const sums = assets.find(a => a.name === CHECKSUMS_NAME)
  if (!sums) {
    if (fromMenu) error(t('update_no_checksum'))
    return null
  }

  const notes = await loadReleaseNotes({ lang, current, latest, _fetchText })
  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    title: t('update_available_title'),
    message: t('update_available_msg', latest, current),
    detail: withNotes(t, t('update_available_detail'), notes),
    buttons: [t('update_download_install'), t('update_later')],
    defaultId: 0,
  })
  if (response !== 0) return null

  dialog.showMessageBox(win, {
    type: 'info',
    title: t('update_downloading_title'),
    message: t('update_downloading_msg'),
    buttons: ['OK'],
  })

  // Private (0700) directory: a shared, predictable /tmp name could be swapped
  // by another local user between download and install.
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'lcv-update-'))
  const assetPath = path.join(dir, asset.name)
  const sumsPath = path.join(dir, CHECKSUMS_NAME)
  try {
    await _downloadFile(asset.browser_download_url, assetPath)
    await _downloadFile(sums.browser_download_url, sumsPath)
  } catch (err) {
    quietRemove(dir)
    error(errorText(err))
    return null
  }
  try {
    await _verify(dir, assetPath, sumsPath, asset.name)
  } catch {
    quietRemove(dir)
    error(t('update_bad_checksum'))
    return null
  }
  return { latest, dir, assetPath }
}

// The running bundle: <Name>.app/Contents/MacOS/<exe>.
function currentBundlePath(app) {
  const exe = typeof app.getPath === 'function' ? app.getPath('exe') : ''
  const bundle = path.resolve(exe, '..', '..', '..')
  return bundle.endsWith('.app') ? bundle : '/Applications/LightCutVidz.app'
}

/** Remplace l'app par la version publiée, puis la relance.
 *
 * `electron-updater` ne sait pas le faire sur macOS : son moteur vérifie la signature
 * Apple du bundle, et l'app n'est signée qu'ad hoc. Un script détaché n'a rien à
 * vérifier. L'app doit se retirer d'abord — macOS refuse qu'un bundle en cours
 * d'exécution soit remplacé.
 *
 * L'archive n'est installée qu'après vérification de sa somme SHA-256 publiée.
 * Le script reçoit ses chemins en arguments positionnels (jamais interpolés), et
 * copie la nouvelle version à côté avant de supprimer l'ancienne : un échec de
 * copie ne laisse plus l'utilisateur sans application.
 */
async function _upgradeMac({ dialog, app, win, t, fromMenu, lang = '', _fetchText = fetchText,
  _fetchJson = fetchJson,
  _downloadFile = downloadFile,
  _verify = _verifyDownload,
  _spawn = _defaultSpawn,
  _appPath = currentBundlePath(app),
}) {
  const prepared = await _prepareUpdate({
    dialog, app, win, t, fromMenu, ext: '.zip', noAssetKey: 'update_no_mac_archive', lang, _fetchText, _fetchJson, _downloadFile, _verify,
  })
  if (!prepared) return
  const { dir, assetPath } = prepared

  await dialog.showMessageBox(win, {
    type: 'info',
    title: t('update_installing_title'),
    message: t('update_restarting_msg'),
    buttons: ['OK'],
  })

  const stage = path.join(dir, 'stage')
  const script = [
    'sleep 2',
    'mkdir -p "$1"',
    'ditto -x -k "$2" "$1"',
    'rm -rf "$3.new"',
    'cp -R "$1/LightCutVidz.app" "$3.new"',
    'rm -rf "$3"',
    'mv "$3.new" "$3"',
    'rm -rf "$4"',
    // Sans ces deux-là macOS refuse d'ouvrir un bundle fraîchement recopié.
    'xattr -dr com.apple.quarantine "$3"',
    'codesign --force --deep --sign - "$3"',
    'open -a "$3"',
  ].join(' && ')
  _spawn(script, [stage, assetPath, _appPath, dir])
  app.exit(0)
}

async function _upgradeDeb({ dialog, app, win, t, fromMenu, lang = '', _fetchText = fetchText, _execFile = execFile, _fetchJson = fetchJson, _downloadFile = downloadFile, _verify = _verifyDownload }) {
  const prepared = await _prepareUpdate({
    dialog, app, win, t, fromMenu, ext: '.deb', noAssetKey: 'update_no_deb', lang, _fetchText, _fetchJson, _downloadFile, _verify,
  })
  if (!prepared) return
  const { dir, assetPath } = prepared

  dialog.showMessageBox(win, {
    type: 'info',
    title: t('update_installing_title'),
    message: t('update_installing_msg'),
    buttons: ['OK'],
  })

  // pkexec shows a polkit GUI password prompt on Linux desktops. No shell is
  // involved: the path is an argument, not part of a command line.
  _execFile('pkexec', ['apt-get', 'install', '-y', assetPath], (err) => {
    quietRemove(dir)
    if (err) {
      dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: errorText(err) })
      return
    }
    app.relaunch()
    app.exit(0)
  })
}

/**
 * A Linux install that is neither an AppImage nor a dpkg package (tarball,
 * Fedora/Arch repackage…) cannot be updated in place: tell the user a newer
 * version exists and open its download page.
 */
async function _upgradeManual({ dialog, app, win, t, fromMenu, openExternal, lang = '', _fetchText = fetchText, _fetchJson = fetchJson }) {
  let release
  try {
    release = await _fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`)
  } catch (err) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'error', title: t('update_failed_title'), message: errorText(err) })
    return
  }
  const latest = release?.tag_name?.replace(/^v/, '')
  if (!latest || !VERSION_RE.test(latest) || !isNewer(latest, app.getVersion())) {
    if (fromMenu) dialog.showMessageBox(win, { type: 'info', title: t('no_update_title'), message: latest ? t('no_update_msg_v', latest) : t('no_update_msg') })
    return
  }
  const notes = await loadReleaseNotes({ lang, current: app.getVersion(), latest, _fetchText })
  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    title: t('update_available_title'),
    message: t('update_available_msg', latest, app.getVersion()),
    detail: withNotes(t, t('update_manual_detail'), notes),
    buttons: [t('update_open_page'), t('update_later')],
    defaultId: 0,
  })
  if (response === 0 && openExternal) openExternal(`https://github.com/${REPO}/releases/tag/v${latest}`)
}

const REDIRECT_CODES = [301, 302, 303, 307, 308]
const MAX_REDIRECTS = 5
const MAX_JSON_BYTES = 5 * 1024 * 1024

function fetchJson(url, _get = https.get) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return reject(new Error('Refusing non-HTTPS request'))
    _get(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'LightCutVidz-updater' } },
      (res) => {
        // Without this, a rate-limited or failing GitHub response parses as
        // valid JSON with no tag_name, and the app reports "already up to date".
        if ((res.statusCode ?? 0) >= 400) {
          res.resume()
          reject(new Error(`GitHub responded ${res.statusCode}`))
          return
        }
        let data = ''
        res.on('data', chunk => {
          data += chunk
          if (data.length > MAX_JSON_BYTES) { res.destroy(); reject(new Error('Response too large')) }
        })
        res.on('end', () => {
          try { resolve(JSON.parse(data)) }
          catch (e) { reject(e) }
        })
      }
    ).on('error', reject)
  })
}

function fetchText(url, _get = https.get) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return reject(new Error('Refusing non-HTTPS request'))
    _get(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'LightCutVidz-updater' } },
      (res) => {
        if ((res.statusCode ?? 0) !== 200) {
          res.resume()
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }
        let data = ''
        res.setEncoding && res.setEncoding('utf8')
        res.on('data', chunk => {
          data += chunk
          if (data.length > MAX_JSON_BYTES) { res.destroy(); reject(new Error('Response too large')) }
        })
        res.on('end', () => resolve(data))
      }
    ).on('error', reject)
  })
}

function downloadFile(url, dest, _get = https.get, _redirects = 0) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') return reject(new Error('Refusing non-HTTPS download'))
    _get(
      { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers: { 'User-Agent': 'LightCutVidz-updater' } },
      (res) => {
        if (REDIRECT_CODES.includes(res.statusCode ?? 0) && res.headers.location) {
          res.resume()
          if (_redirects >= MAX_REDIRECTS) return reject(new Error('Too many redirects'))
          // The file is only created once a 200 arrives, so following a
          // redirect never leaves a half-opened destination behind.
          return downloadFile(new URL(res.headers.location, url).toString(), dest, _get, _redirects + 1).then(resolve, reject)
        }
        // An error body would otherwise be written to disk as if it were the
        // package, then handed to the installer.
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`Download failed with HTTP ${res.statusCode}`))
        }
        // `wx`: never follow or overwrite something already at that path.
        const file = fs.createWriteStream(dest, { flags: 'wx', mode: 0o600 })
        // Only what this call created may be deleted: on EEXIST the file at
        // `dest` belongs to someone else and must survive.
        let created = false
        file.on('open', () => { created = true })
        // Unlink only once the stream is closed: deleting first can race the
        // close and leave the half-written file on disk.
        const fail = (err) => {
          res.destroy()
          file.close(() => (created ? fs.unlink(dest, () => reject(err)) : reject(err)))
        }
        file.on('error', fail)
        res.on('error', fail)
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve(undefined)))
      }
    ).on('error', reject)
  })
}

module.exports = { loadReleaseNotes, fetchText, setupAutoUpdater, checkForUpdates, _upgradeMac, _upgradeDeb, _upgradeManual, fetchJson, downloadFile, isNewer, showUpdateReadyDialog, verifyChecksum }
