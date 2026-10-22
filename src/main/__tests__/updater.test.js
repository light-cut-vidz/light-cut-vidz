import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import os from 'os'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { requireSrc } from './__doubles__/installElectron.js'
const { setupAutoUpdater, checkForUpdates, _upgradeMac, _upgradeDeb } = requireSrc('main/lib/updater.js')

function makeAutoUpdater() {
  const handlers = {}
  return {
    handlers,
    on: vi.fn((event, fn) => { handlers[event] = fn }),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn().mockResolvedValue(undefined),
    quitAndInstall: vi.fn(),
    autoDownload: true,
    autoInstallOnAppQuit: false,
  }
}

function makeDeps(overrides = {}) {
  return {
    autoUpdater: makeAutoUpdater(),
    dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) },
    app: { getVersion: () => '1.0.0', relaunch: vi.fn(), exit: vi.fn() },
    getWindow: () => ({}),
    t: (key) => key,
    state: { updateDownloaded: false },
    isDev: false,
    isMac: false,
    isDeb: false,
    fromMenu: false,
    ...overrides,
  }
}

// Successful updates leave their private download directory for the install
// script (mocked here) to remove; sweep what the tests created.
afterEach(() => {
  for (const d of fs.readdirSync(os.tmpdir())) {
    if (d.startsWith('lcv-update-')) fs.rmSync(path.join(os.tmpdir(), d), { recursive: true, force: true })
  }
})

const SUMS = { name: 'SHA256SUMS', browser_download_url: 'https://dl/SHA256SUMS' }

/** A release carrying the package and the checksum list the updater insists on. */
const releaseWith = (assets, over = {}) => ({ tag_name: 'v2.0.0', assets: [...assets, SUMS], ...over })

describe('setupAutoUpdater', () => {
  it('configures autoUpdater settings', () => {
    const deps = makeDeps()
    setupAutoUpdater(deps)
    expect(deps.autoUpdater.autoDownload).toBe(false)
    expect(deps.autoUpdater.autoInstallOnAppQuit).toBe(true)
  })

  it('registers error and update-downloaded listeners', () => {
    const deps = makeDeps()
    setupAutoUpdater(deps)
    expect(deps.autoUpdater.handlers.error).toBeDefined()
    expect(deps.autoUpdater.handlers['update-downloaded']).toBeDefined()
  })

  // electron-updater emits `error` AND rejects the failing call's promise, and
  // that call already reports it: a dialog here as well showed it twice.
  it('does not pop a dialog on an engine error (the failing call reports it)', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = makeDeps()
    setupAutoUpdater(deps)
    deps.autoUpdater.handlers.error(new Error('boom'))
    expect(deps.dialog.showMessageBox).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it('marks state.updateDownloaded=true on update-downloaded', () => {
    const deps = makeDeps()
    setupAutoUpdater(deps)
    deps.autoUpdater.handlers['update-downloaded']()
    expect(deps.state.updateDownloaded).toBe(true)
  })
})

describe('checkForUpdates', () => {
  let deps
  beforeEach(() => { deps = makeDeps() })

  it('skips in dev mode', async () => {
    await checkForUpdates({ ...deps, isDev: true })
    expect(deps.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('skips electron-updater on macOS', async () => {
    const _macHandler = vi.fn().mockResolvedValue(undefined)
    await checkForUpdates({ ...deps, isMac: true, _macHandler })
    expect(deps.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(_macHandler).toHaveBeenCalled()
  })


  it('skips electron-updater on deb', async () => {
    const _debHandler = vi.fn().mockResolvedValue(undefined)
    await checkForUpdates({ ...deps, isDeb: true, _debHandler })
    expect(deps.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(_debHandler).toHaveBeenCalled()
  })

  it('re-prompts to install when an update is already downloaded', async () => {
    deps.state.updateDownloaded = true
    await checkForUpdates(deps)
    expect(deps.dialog.showMessageBox).toHaveBeenCalled()
    expect(deps.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('shows "no update" dialog from menu when no update info is returned', async () => {
    deps.autoUpdater.checkForUpdates.mockResolvedValue(null)
    await checkForUpdates({ ...deps, fromMenu: true })
    expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'no_update_title' }),
    )
  })

  it('does not show "no update" dialog when not from menu', async () => {
    deps.autoUpdater.checkForUpdates.mockResolvedValue(null)
    await checkForUpdates({ ...deps, fromMenu: false })
    expect(deps.dialog.showMessageBox).not.toHaveBeenCalled()
  })

  it('does not offer an update when the remote version is older than the installed one', async () => {
    deps.autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '1.0.0' } })
    deps.app.getVersion = () => '1.4.1'
    await checkForUpdates({ ...deps, fromMenu: true })
    expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'no_update_title' }),
    )
  })

  it('shows "already on latest" when remote version matches current', async () => {
    deps.autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '1.0.0' } })
    await checkForUpdates({ ...deps, fromMenu: true })
    expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'no_update_title' }),
    )
  })

  it('prompts and downloads when a newer version is available', async () => {
    deps.autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '2.0.0' } })
    deps.dialog.showMessageBox
      .mockResolvedValueOnce({ response: 0 })
      .mockResolvedValueOnce({ response: 0 })
    await checkForUpdates(deps)
    expect(deps.autoUpdater.downloadUpdate).toHaveBeenCalled()
  })

  it('skips download when user declines', async () => {
    deps.autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '2.0.0' } })
    deps.dialog.showMessageBox.mockResolvedValueOnce({ response: 1 })
    await checkForUpdates(deps)
    expect(deps.autoUpdater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('shows error dialog when check throws (from menu)', async () => {
    deps.autoUpdater.checkForUpdates.mockRejectedValue(new Error('network'))
    await checkForUpdates({ ...deps, fromMenu: true })
    expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'error', message: 'network' }),
    )
  })

  it('stays silent when check throws (not from menu)', async () => {
    deps.autoUpdater.checkForUpdates.mockRejectedValue(new Error('boom'))
    await checkForUpdates({ ...deps, fromMenu: false })
    expect(deps.dialog.showMessageBox).not.toHaveBeenCalled()
  })

  describe('overlapping checks', () => {
    const offers = () => deps.dialog.showMessageBox.mock.calls.filter(c => c[1].title === 'update_available_title')

    beforeEach(() => {
      deps.autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '2.0.0' } })
      deps.dialog.showMessageBox.mockResolvedValue({ response: 1 })
    })

    // The start-up check and a click on "Check for updates" used to run side by
    // side, and each opened its own "update available" dialog.
    it('offers the update once when the start-up check and a menu check overlap', async () => {
      await Promise.all([checkForUpdates(deps), checkForUpdates({ ...deps, fromMenu: true })])
      expect(offers()).toHaveLength(1)
      expect(deps.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1)
    })

    it('does not stack a second offer on one the user has not answered yet', async () => {
      let answer
      deps.dialog.showMessageBox.mockImplementationOnce(() => new Promise(res => { answer = res }))
      const first = checkForUpdates(deps)
      await vi.waitFor(() => expect(offers()).toHaveLength(1))
      const second = checkForUpdates({ ...deps, fromMenu: true })
      await new Promise(res => setTimeout(res, 10))
      expect(offers()).toHaveLength(1)
      answer({ response: 1 })
      await Promise.all([first, second])
      expect(offers()).toHaveLength(1)
    })

    it('checks again once the previous check is over (a "Later" is not forever)', async () => {
      await checkForUpdates(deps)
      await checkForUpdates({ ...deps, fromMenu: true })
      expect(offers()).toHaveLength(2)
    })

    it('is free again after a check that failed', async () => {
      deps.autoUpdater.checkForUpdates.mockRejectedValueOnce(new Error('network'))
      await checkForUpdates({ ...deps, fromMenu: true })
      await checkForUpdates({ ...deps, fromMenu: true })
      expect(offers()).toHaveLength(1)
    })
  })

})

describe('_upgradeMac', () => {
  const win = {}
  const zip = { name: 'LightCutVidz-mac-arm64.zip', browser_download_url: 'https://dl/app.zip' }
  const baseOpts = (overrides = {}) => ({
    dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) },
    app: { getVersion: () => '1.0.0', exit: vi.fn(), getPath: () => '/Applications/LightCutVidz.app/Contents/MacOS/LightCutVidz' },
    win,
    t: (key) => key,
    fromMenu: true,
    ...overrides,
  })
  const release = (over = {}) => releaseWith([zip], over)

  /** Les dépendances d'une mise à jour qui va jusqu'au bout. */
  const installOpts = (over = {}) => baseOpts({
    _fetchJson: vi.fn().mockResolvedValue(release()),
    _downloadFile: vi.fn().mockResolvedValue(undefined),
    _verify: vi.fn().mockResolvedValue(undefined),
    _spawn: vi.fn(),
    _appPath: '/Applications/LightCutVidz.app',
    ...over,
  })

  it('shows error when GitHub API fails', async () => {
    const opts = baseOpts({ _fetchJson: vi.fn().mockRejectedValue(new Error('net')) })

    await _upgradeMac(opts)

    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ type: 'error', title: 'update_failed_title' })
    )
  })

  it('shows no update when already on latest', async () => {
    const opts = baseOpts({ _fetchJson: vi.fn().mockResolvedValue({ tag_name: 'v1.0.0' }) })

    await _upgradeMac(opts)

    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ title: 'no_update_title' })
    )
  })

  it("télécharge l'archive et sa liste de sommes dans un dossier privé", async () => {
    const opts = installOpts()

    await _upgradeMac(opts)

    const [[zipUrl, zipDest], [sumsUrl, sumsDest]] = opts._downloadFile.mock.calls
    expect(zipUrl).toBe('https://dl/app.zip')
    expect(sumsUrl).toBe('https://dl/SHA256SUMS')
    expect(path.dirname(zipDest)).toBe(path.dirname(sumsDest))
    expect(path.dirname(zipDest)).toMatch(/lcv-update-/)
    expect(fs.statSync(path.dirname(zipDest)).mode & 0o077).toBe(0)
  })

  it("vérifie la somme SHA-256 avant d'installer quoi que ce soit", async () => {
    const opts = installOpts()

    await _upgradeMac(opts)

    expect(opts._verify).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('.zip'), expect.stringContaining('SHA256SUMS'), zip.name)
    expect(opts._spawn).toHaveBeenCalled()
  })

  it("n'installe rien et le dit quand la somme ne correspond pas", async () => {
    const opts = installOpts({ _verify: vi.fn().mockRejectedValue(new Error('Checksum mismatch')) })

    await _upgradeMac(opts)

    expect(opts._spawn).not.toHaveBeenCalled()
    expect(opts.app.exit).not.toHaveBeenCalled()
    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ type: 'error', message: 'update_bad_checksum' })
    )
  })

  it('refuse une release qui ne publie pas de sommes de contrôle', async () => {
    const opts = installOpts({ _fetchJson: vi.fn().mockResolvedValue({ tag_name: 'v2.0.0', assets: [zip] }) })

    await _upgradeMac(opts)

    expect(opts._downloadFile).not.toHaveBeenCalled()
    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ type: 'error', message: 'update_no_checksum' })
    )
  })

  it("remplace l'app puis la rouvre, sans passer par brew", async () => {
    const opts = installOpts()

    await _upgradeMac(opts)

    const [script] = opts._spawn.mock.calls[0]
    expect(script).toContain('ditto -x -k')
    expect(script).toContain('open -a')
    // La release fait foi : le cask du tap n'est réécrit qu'après, et attendre
    // qu'il le soit laissait une mise à jour sans effet.
    expect(script).not.toContain('brew')
  })

  // Les valeurs viennent du réseau : jamais dans la chaîne du shell.
  it('passe les chemins en arguments positionnels, pas dans le script', async () => {
    const opts = installOpts()

    await _upgradeMac(opts)

    const [script, args] = opts._spawn.mock.calls[0]
    expect(script).not.toContain('/Applications')
    expect(script).not.toContain('2.0.0')
    expect(args).toHaveLength(4)
    expect(args[2]).toBe('/Applications/LightCutVidz.app')
    expect(args[1]).toMatch(/LightCutVidz-mac-arm64\.zip$/)
  })

  it("copie la nouvelle version à côté avant de supprimer l'ancienne", async () => {
    const opts = installOpts()

    await _upgradeMac(opts)

    const [script] = opts._spawn.mock.calls[0]
    expect(script.indexOf('cp -R')).toBeGreaterThan(-1)
    expect(script.indexOf('cp -R')).toBeLessThan(script.indexOf('rm -rf "$3"'))
    // Chaîné avec && : un échec de copie arrête tout avant la suppression.
    expect(script).not.toMatch(/;\s/)
  })

  it("déduit l'emplacement de l'app qui tourne plutôt que de supposer /Applications", async () => {
    const opts = installOpts({ _appPath: undefined })
    opts.app.getPath = () => '/Users/me/Applications/LightCutVidz.app/Contents/MacOS/LightCutVidz'

    await _upgradeMac(opts)

    expect(opts._spawn.mock.calls[0][1][2]).toBe('/Users/me/Applications/LightCutVidz.app')
  })

  it("quitte l'app avant de la remplacer — macOS refuse d'écraser un bundle en cours", async () => {
    const opts = installOpts()

    await _upgradeMac(opts)

    expect(opts.app.exit).toHaveBeenCalledWith(0)
  })

  it("lève la quarantaine et resigne, sinon macOS refuse la copie fraîche", async () => {
    const opts = installOpts()

    await _upgradeMac(opts)

    const [script] = opts._spawn.mock.calls[0]
    expect(script).toContain('xattr -dr com.apple.quarantine')
    expect(script).toContain('codesign --force --deep --sign -')
  })

  it('efface le téléchargement derrière lui', async () => {
    const opts = installOpts()

    await _upgradeMac(opts)

    const [script, args] = opts._spawn.mock.calls[0]
    expect(script).toContain('rm -rf "$4"')
    expect(args[3]).toMatch(/lcv-update-/)
  })

  it('does nothing when user declines', async () => {
    const opts = installOpts()
    opts.dialog.showMessageBox.mockResolvedValueOnce({ response: 1 })

    await _upgradeMac(opts)

    expect(opts._downloadFile).not.toHaveBeenCalled()
    expect(opts._spawn).not.toHaveBeenCalled()
  })

  it("signale une release sans archive macOS plutôt que de lancer un script bancal", async () => {
    const opts = installOpts({ _fetchJson: vi.fn().mockResolvedValue(release({ assets: [SUMS] })) })

    await _upgradeMac(opts)

    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ type: 'error', message: 'update_no_mac_archive' })
    )
    expect(opts._spawn).not.toHaveBeenCalled()
  })

  it.each(['v1.2.3$(touch /tmp/pwn)', 'v2.0.0;reboot', 'latest'])('rejette le tag suspect %s', async (tag_name) => {
    const opts = installOpts({ _fetchJson: vi.fn().mockResolvedValue(release({ tag_name })) })

    await _upgradeMac(opts)

    expect(opts._downloadFile).not.toHaveBeenCalled()
    expect(opts._spawn).not.toHaveBeenCalled()
  })

  it("rejette un nom d'archive qui sortirait du dossier de téléchargement", async () => {
    const evil = { name: '../../evil$(x).zip', browser_download_url: 'https://dl/x.zip' }
    const opts = installOpts({ _fetchJson: vi.fn().mockResolvedValue(release({ assets: [evil, SUMS] })) })

    await _upgradeMac(opts)

    expect(opts._downloadFile).not.toHaveBeenCalled()
  })

  it("n'installe rien quand le téléchargement échoue", async () => {
    const opts = installOpts({ _downloadFile: vi.fn().mockRejectedValue(new Error('coupure')) })

    await _upgradeMac(opts)

    expect(opts._spawn).not.toHaveBeenCalled()
    expect(opts.app.exit).not.toHaveBeenCalled()
  })
})

describe('_upgradeDeb', () => {
  const win = {}
  const deb = { name: 'lightcutvidz_2.0.0_amd64.deb', browser_download_url: 'https://example.com/file.deb' }
  const baseOpts = (overrides = {}) => ({
    dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) },
    app: { getVersion: () => '1.0.0', relaunch: vi.fn(), exit: vi.fn() },
    win,
    t: (key) => key,
    fromMenu: true,
    _verify: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  })

  it('shows error when GitHub API fails', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockRejectedValue(new Error('net'))
    await _upgradeDeb(opts)
    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ type: 'error', title: 'update_failed_title' })
    )
  })

  it('shows no update when already on latest', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue({ tag_name: 'v1.0.0', assets: [] })
    await _upgradeDeb(opts)
    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ title: 'no_update_title' })
    )
  })

  it('shows error when no .deb asset found', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue(releaseWith([]))
    await _upgradeDeb(opts)
    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ type: 'error', message: 'update_no_deb' })
    )
  })

  it('downloads, verifies and installs when user accepts', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue(releaseWith([deb]))
    opts._downloadFile = vi.fn().mockResolvedValue(undefined)
    opts._execFile = vi.fn((cmd, args, cb) => cb(null))
    await _upgradeDeb(opts)
    expect(opts._downloadFile).toHaveBeenCalledTimes(2)
    expect(opts._verify).toHaveBeenCalled()
    expect(opts.app.relaunch).toHaveBeenCalled()
    expect(opts.app.exit).toHaveBeenCalledWith(0)
  })

  // No shell: the package path is an argument, never part of a command line.
  it('lance pkexec sans passer par un shell', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue(releaseWith([deb]))
    opts._downloadFile = vi.fn().mockResolvedValue(undefined)
    opts._execFile = vi.fn((cmd, args, cb) => cb(null))
    await _upgradeDeb(opts)
    const [file, args] = opts._execFile.mock.calls[0]
    expect(file).toBe('pkexec')
    expect(args.slice(0, 3)).toEqual(['apt-get', 'install', '-y'])
    expect(args[3]).toMatch(/lcv-update-.*lightcutvidz_2\.0\.0_amd64\.deb$/)
  })

  it("n'installe pas un .deb dont la somme ne correspond pas", async () => {
    const opts = baseOpts({ _verify: vi.fn().mockRejectedValue(new Error('Checksum mismatch')) })
    opts._fetchJson = vi.fn().mockResolvedValue(releaseWith([deb]))
    opts._downloadFile = vi.fn().mockResolvedValue(undefined)
    opts._execFile = vi.fn()
    await _upgradeDeb(opts)
    expect(opts._execFile).not.toHaveBeenCalled()
    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ type: 'error', message: 'update_bad_checksum' })
    )
  })

  it('shows error when apt install fails', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue(releaseWith([deb]))
    opts._downloadFile = vi.fn().mockResolvedValue(undefined)
    opts._execFile = vi.fn((cmd, args, cb) => cb(new Error('apt failed')))
    await _upgradeDeb(opts)
    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ type: 'error', title: 'update_failed_title' })
    )
    expect(opts.app.relaunch).not.toHaveBeenCalled()
  })
})

describe('verifyChecksum', () => {
  const { verifyChecksum } = requireSrc('main/lib/updater.js')
  let file
  const hashOf = (text) => crypto.createHash('sha256').update(text).digest('hex')

  beforeEach(() => {
    file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lcv-sum-')), 'pkg.deb')
    fs.writeFileSync(file, 'PACKAGE')
  })

  it('accepts a matching sha256sum line', async () => {
    await expect(verifyChecksum(file, `${hashOf('PACKAGE')}  pkg.deb\n`, 'pkg.deb')).resolves.toBeUndefined()
  })

  it('accepts the binary-mode marker and uppercase hex', async () => {
    await expect(verifyChecksum(file, `${hashOf('PACKAGE').toUpperCase()} *pkg.deb`, 'pkg.deb')).resolves.toBeUndefined()
  })

  it('rejects a different file content', async () => {
    await expect(verifyChecksum(file, `${hashOf('OTHER')}  pkg.deb`, 'pkg.deb')).rejects.toThrow('mismatch')
  })

  it('rejects when the asset is not listed', async () => {
    await expect(verifyChecksum(file, `${hashOf('PACKAGE')}  other.deb`, 'pkg.deb')).rejects.toThrow('No checksum')
  })
})

// ─── HTTP layer ──────────────────────────────────────────────────────────────
// Neither helper used to check the status code: a rate-limited GitHub reply
// parsed as "no update available", and an error page was written to disk as if
// it were the .deb, then handed to `pkexec apt-get install`.

const { fetchJson, downloadFile } = requireSrc('main/lib/updater.js')

/** Minimal stand-in for https.get: replays one scripted response. */
function fakeGet(responses) {
  const queue = [...responses]
  return (_opts, cb) => {
    const { status = 200, body = '', headers = {} } = queue.shift() ?? {}
    const listeners = {}
    const res = {
      statusCode: status,
      headers,
      resume: () => {},
      destroy: () => {},
      on: (event, fn) => { listeners[event] = fn; return res },
      pipe: (dest) => { dest.write(body); dest.end() },
    }
    queueMicrotask(() => {
      cb(res)
      if (listeners.data) listeners.data(body)
      if (listeners.end) listeners.end()
    })
    return { on: () => {} }
  }
}

const { fetchLocation, fetchLatestRelease } = requireSrc('main/lib/updater.js')

describe('fetchLocation', () => {
  it('refuses plain HTTP', async () => {
    await expect(fetchLocation('http://github.com/x', fakeGet([]))).rejects.toThrow('HTTPS')
  })

  it('returns where a redirect points, without following it', async () => {
    const get = fakeGet([{ status: 302, headers: { location: 'https://github.com/o/r/releases/tag/v2.0.0' } }])
    await expect(fetchLocation('https://github.com/o/r/releases/latest', get)).resolves.toBe('https://github.com/o/r/releases/tag/v2.0.0')
  })

  it('resolves a relative location', async () => {
    const get = fakeGet([{ status: 302, headers: { location: '/o/r/releases/tag/v2.0.0' } }])
    await expect(fetchLocation('https://github.com/o/r/releases/latest', get)).resolves.toBe('https://github.com/o/r/releases/tag/v2.0.0')
  })

  it('rejects a reply that is not a redirect', async () => {
    await expect(fetchLocation('https://github.com/x', fakeGet([{ status: 200 }]))).rejects.toThrow('HTTP 200')
  })

  it('rejects a redirect that leaves the host', async () => {
    const get = fakeGet([{ status: 302, headers: { location: 'https://evil.example/o/r/releases/tag/v9.9.9' } }])
    await expect(fetchLocation('https://github.com/o/r/releases/latest', get)).rejects.toThrow('Unexpected redirect')
  })

  it('rejects a downgrade to plain HTTP', async () => {
    const get = fakeGet([{ status: 302, headers: { location: 'http://github.com/o/r/releases/tag/v9.9.9' } }])
    await expect(fetchLocation('https://github.com/o/r/releases/latest', get)).rejects.toThrow('Unexpected redirect')
  })
})

// The API allows 60 anonymous requests an hour per IP: on a shared connection
// the update check used to fail with "GitHub responded 403".
describe('fetchLatestRelease', () => {
  const rateLimited = (status = 403) => vi.fn().mockRejectedValue(new Error(`GitHub responded ${status}`))
  const tagPage = (tag = 'v2.0.0') => vi.fn().mockResolvedValue(`https://github.com/light-cut-vidz/light-cut-vidz/releases/tag/${tag}`)

  it('uses the API when it answers', async () => {
    const release = { tag_name: 'v2.0.0', assets: [] }
    const _fetchLocation = vi.fn()
    await expect(fetchLatestRelease({ _fetchJson: vi.fn().mockResolvedValue(release), _fetchLocation })).resolves.toBe(release)
    expect(_fetchLocation).not.toHaveBeenCalled()
  })

  it.each([403, 429])('falls back to the releases page when the API answers %i', async (status) => {
    const release = await fetchLatestRelease({ _fetchJson: rateLimited(status), _fetchLocation: tagPage('v2.1.0') })
    expect(release.tag_name).toBe('v2.1.0')
    expect(release.assets.map(a => a.name)).toEqual(['LightCutVidz-linux.deb', 'LightCutVidz-mac-arm64.zip', 'SHA256SUMS'])
    expect(release.assets[0].browser_download_url).toBe('https://github.com/light-cut-vidz/light-cut-vidz/releases/download/v2.1.0/LightCutVidz-linux.deb')
  })

  it.each([
    ['a server error', new Error('GitHub responded 500')],
    ['no network', new Error('getaddrinfo ENOTFOUND api.github.com')],
  ])('does not hide %s behind the fallback', async (_n, err) => {
    const _fetchLocation = vi.fn()
    await expect(fetchLatestRelease({ _fetchJson: vi.fn().mockRejectedValue(err), _fetchLocation })).rejects.toBe(err)
    expect(_fetchLocation).not.toHaveBeenCalled()
  })

  it('reports the original error when the fallback finds no tag either', async () => {
    const _fetchLocation = vi.fn().mockResolvedValue('https://github.com/light-cut-vidz/light-cut-vidz/releases')
    await expect(fetchLatestRelease({ _fetchJson: rateLimited(), _fetchLocation })).rejects.toThrow('GitHub responded 403')
  })

  it('reports the fallback failure when the page cannot be reached', async () => {
    const _fetchLocation = vi.fn().mockRejectedValue(new Error('HTTP 503'))
    await expect(fetchLatestRelease({ _fetchJson: rateLimited(), _fetchLocation })).rejects.toThrow('HTTP 503')
  })
})

describe('updating while the API is rate-limited', () => {
  it('still offers and downloads the .deb (checksum verified as usual)', async () => {
    const showMessageBox = vi.fn().mockResolvedValue({ response: 0 })
    const _downloadFile = vi.fn().mockResolvedValue(undefined)
    const _execFile = vi.fn()
    await _upgradeDeb({
      dialog: { showMessageBox }, app: { getVersion: () => '1.0.0', relaunch: vi.fn(), exit: vi.fn() }, win: {}, t: (k) => k, fromMenu: true,
      _fetchJson: vi.fn().mockRejectedValue(new Error('GitHub responded 403')),
      _fetchLocation: vi.fn().mockResolvedValue('https://github.com/light-cut-vidz/light-cut-vidz/releases/tag/v2.0.0'),
      _downloadFile, _verify: vi.fn().mockResolvedValue(undefined), _execFile,
    })
    expect(showMessageBox.mock.calls.some(c => c[1].title === 'update_available_title')).toBe(true)
    expect(_downloadFile.mock.calls.map(c => c[0])).toEqual([
      'https://github.com/light-cut-vidz/light-cut-vidz/releases/download/v2.0.0/LightCutVidz-linux.deb',
      'https://github.com/light-cut-vidz/light-cut-vidz/releases/download/v2.0.0/SHA256SUMS',
    ])
    expect(_execFile).toHaveBeenCalled()
  })

  it('refuses a tag that is not a version, whatever page it came from', async () => {
    const showMessageBox = vi.fn().mockResolvedValue({ response: 0 })
    const _downloadFile = vi.fn()
    await _upgradeDeb({
      dialog: { showMessageBox }, app: { getVersion: () => '1.0.0', relaunch: vi.fn(), exit: vi.fn() }, win: {}, t: (k) => k, fromMenu: true,
      _fetchJson: vi.fn().mockRejectedValue(new Error('GitHub responded 403')),
      _fetchLocation: vi.fn().mockResolvedValue('https://github.com/light-cut-vidz/light-cut-vidz/releases/tag/v1$(touch%20x)'),
      _downloadFile, _verify: vi.fn(), _execFile: vi.fn(),
    })
    expect(_downloadFile).not.toHaveBeenCalled()
    expect(showMessageBox).toHaveBeenCalledWith({}, expect.objectContaining({ message: 'update_bad_release' }))
  })
})

describe('fetchJson', () => {
  it('refuses plain HTTP', async () => {
    await expect(fetchJson('http://api.github.com/x', fakeGet([]))).rejects.toThrow('HTTPS')
  })

  it('parses a successful response', async () => {
    const get = fakeGet([{ status: 200, body: '{"tag_name":"v2.0.0"}' }])
    await expect(fetchJson('https://api.github.com/x', get)).resolves.toEqual({ tag_name: 'v2.0.0' })
  })

  it.each([403, 404, 429, 500, 503])('rejects on HTTP %i', async (status) => {
    const get = fakeGet([{ status, body: '{"message":"rate limit exceeded"}' }])
    await expect(fetchJson('https://api.github.com/x', get)).rejects.toThrow(String(status))
  })

  it('rejects on a malformed body', async () => {
    const get = fakeGet([{ status: 200, body: 'not json' }])
    await expect(fetchJson('https://api.github.com/x', get)).rejects.toBeInstanceOf(Error)
  })
})

describe('checkForUpdates — mode développement', () => {
  it('explique au lieu de rester muet quand on le demande depuis le menu', async () => {
    const deps = makeDeps({ isDev: true, fromMenu: true })
    await checkForUpdates(deps)
    expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(), expect.objectContaining({ title: 'dev_mode_title' }),
    )
  })

  it('reste silencieux pour la vérification automatique', async () => {
    const deps = makeDeps({ isDev: true, fromMenu: false })
    await checkForUpdates(deps)
    expect(deps.dialog.showMessageBox).not.toHaveBeenCalled()
  })
})

describe('downloadFile', () => {
  let dest

  beforeEach(() => {
    dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lcv-dl-')), 'pkg.deb')
  })

  it('writes the body to the destination', async () => {
    const get = fakeGet([{ status: 200, body: 'DEB PAYLOAD' }])
    await downloadFile('https://example.com/pkg.deb', dest, get)
    expect(fs.readFileSync(dest, 'utf-8')).toBe('DEB PAYLOAD')
  })

  it.each([301, 302, 303, 307, 308])('follows a %i redirect', async (status) => {
    const get = fakeGet([
      { status, headers: { location: 'https://cdn.example.com/pkg.deb' } },
      { status: 200, body: 'REDIRECTED PAYLOAD' },
    ])
    await downloadFile('https://example.com/pkg.deb', dest, get)
    expect(fs.readFileSync(dest, 'utf-8')).toBe('REDIRECTED PAYLOAD')
  })

  it.each([403, 404, 500])('rejects on HTTP %i instead of saving the error body', async (status) => {
    const get = fakeGet([{ status, body: '<html>Not Found</html>' }])
    await expect(downloadFile('https://example.com/pkg.deb', dest, get)).rejects.toThrow(String(status))
  })

  it('leaves no partial file behind when the download fails', async () => {
    const get = fakeGet([{ status: 404, body: 'nope' }])
    await expect(downloadFile('https://example.com/pkg.deb', dest, get)).rejects.toThrow()
    expect(fs.existsSync(dest)).toBe(false)
  })

  it('refuses to download over plain HTTP', async () => {
    await expect(downloadFile('http://example.com/pkg.deb', dest, fakeGet([]))).rejects.toThrow('HTTPS')
  })

  it('gives up after too many redirects', async () => {
    const hop = { status: 302, headers: { location: 'https://example.com/again' } }
    const get = fakeGet(Array.from({ length: 10 }, () => hop))
    await expect(downloadFile('https://example.com/pkg.deb', dest, get)).rejects.toThrow('redirects')
  })

  it('never overwrites a file that already exists at the destination', async () => {
    fs.writeFileSync(dest, 'PRE-EXISTING')
    const get = fakeGet([{ status: 200, body: 'NEW' }])
    await expect(downloadFile('https://example.com/pkg.deb', dest, get)).rejects.toThrow()
    expect(fs.readFileSync(dest, 'utf-8')).toBe('PRE-EXISTING')
  })

  it('rejects a redirect with no location header rather than looping', async () => {
    const get = fakeGet([{ status: 302, headers: {}, body: '' }])
    await expect(downloadFile('https://example.com/pkg.deb', dest, get)).rejects.toThrow('302')
  })
})

describe('_upgradeMac — chemins restants', () => {
  const win = {}
  const baseOpts = (overrides = {}) => ({
    dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) },
    app: { getVersion: () => '1.0.0', exit: vi.fn(), getPath: () => '' },
    win,
    t: (key) => key,
    fromMenu: true,
    _downloadFile: vi.fn().mockResolvedValue(undefined),
    _spawn: vi.fn(),
    ...overrides,
  })

  it('signale une réponse GitHub sans numéro de version', async () => {
    const opts = baseOpts({ _fetchJson: vi.fn().mockResolvedValue({}) })

    await _upgradeMac(opts)

    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ title: 'no_update_title' })
    )
  })

  it('reste muet sur une erreur réseau hors du menu', async () => {
    const opts = baseOpts({ fromMenu: false, _fetchJson: vi.fn().mockRejectedValue(new Error('net')) })

    await _upgradeMac(opts)

    expect(opts.dialog.showMessageBox).not.toHaveBeenCalled()
  })

  it("reste muet quand il n'y a rien de neuf hors du menu", async () => {
    const opts = baseOpts({ fromMenu: false, _fetchJson: vi.fn().mockResolvedValue({ tag_name: 'v1.0.0' }) })

    await _upgradeMac(opts)

    expect(opts.dialog.showMessageBox).not.toHaveBeenCalled()
  })
})

describe('_upgradeDeb — chemins restants', () => {
  const win = {}
  const asset = { name: 'lightcutvidz_2.0.0_amd64.deb', browser_download_url: 'https://example.com/file.deb' }
  const baseOpts = (overrides = {}) => ({
    dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) },
    app: { getVersion: () => '1.0.0', relaunch: vi.fn(), exit: vi.fn() },
    win,
    t: (key) => key,
    fromMenu: true,
    _verify: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  })

  it('signale une réponse GitHub sans numéro de version', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue({ assets: [asset] })

    await _upgradeDeb(opts)

    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ title: 'no_update_title' })
    )
  })

  it('accepte une réponse sans liste d’assets', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue({ tag_name: 'v2.0.0' })

    await _upgradeDeb(opts)

    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ type: 'error', message: 'update_no_deb' })
    )
  })

  it('choisit le .deb parmi plusieurs assets', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue(releaseWith([{ name: 'app.AppImage', browser_download_url: 'https://x/a' }, asset]))
    opts._downloadFile = vi.fn().mockResolvedValue(undefined)
    opts._execFile = vi.fn((cmd, args, cb) => cb(null))

    await _upgradeDeb(opts)

    expect(opts._downloadFile).toHaveBeenCalledWith(asset.browser_download_url, expect.stringContaining(asset.name))
  })

  it('ne télécharge rien si l’utilisateur refuse', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue(releaseWith([asset]))
    opts._downloadFile = vi.fn()
    opts.dialog.showMessageBox.mockResolvedValueOnce({ response: 1 })

    await _upgradeDeb(opts)

    expect(opts._downloadFile).not.toHaveBeenCalled()
  })

  it('signale un téléchargement qui échoue', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue(releaseWith([asset]))
    opts._downloadFile = vi.fn().mockRejectedValue(new Error('disque plein'))
    opts._execFile = vi.fn()

    await _upgradeDeb(opts)

    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ type: 'error', title: 'update_failed_title' })
    )
    expect(opts._execFile).not.toHaveBeenCalled()
  })

  it('reste muet hors du menu quand rien ne va', async () => {
    for (const payload of [Promise.reject(new Error('net')), Promise.resolve({}), Promise.resolve({ tag_name: 'v1.0.0' })]) {
      const opts = baseOpts({ fromMenu: false })
      opts._fetchJson = vi.fn().mockReturnValue(payload)

      await _upgradeDeb(opts)

      expect(opts.dialog.showMessageBox).not.toHaveBeenCalled()
    }
  })

  it('reste muet sur un .deb introuvable hors du menu', async () => {
    const opts = baseOpts({ fromMenu: false })
    opts._fetchJson = vi.fn().mockResolvedValue(releaseWith([]))

    await _upgradeDeb(opts)

    expect(opts.dialog.showMessageBox).not.toHaveBeenCalled()
  })
})

describe('isNewer', () => {
  const { isNewer, showUpdateReadyDialog } = requireSrc('main/lib/updater.js')

  it('compare les versions champ par champ', () => {
    expect(isNewer('2.0.0', '1.9.9')).toBe(true)
    expect(isNewer('1.10.0', '1.9.0')).toBe(true)
    expect(isNewer('1.0.1', '1.0.0')).toBe(true)
  })

  it('refuse une version identique ou antérieure', () => {
    expect(isNewer('1.0.0', '1.0.0')).toBe(false)
    expect(isNewer('1.0.0', '2.0.0')).toBe(false)
  })

  it('ignore le préfixe « v »', () => {
    expect(isNewer('v2.0.0', '1.0.0')).toBe(true)
    expect(isNewer('2.0.0', 'v1.0.0')).toBe(true)
  })

  it('traite un champ manquant comme zéro', () => {
    expect(isNewer('1.1', '1.0.0')).toBe(true)
    expect(isNewer('1.0', '1.0.0')).toBe(false)
    expect(isNewer('1.0.0.1', '1.0.0')).toBe(true)
  })

  it('traite un champ illisible comme zéro', () => {
    expect(isNewer('1.0.beta', '1.0.0')).toBe(false)
    expect(isNewer('1.1.beta', '1.0.0')).toBe(true)
  })

  it('propose de redémarrer une fois la mise à jour prête', async () => {
    const autoUpdater = { quitAndInstall: vi.fn() }
    const dialog = { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) }

    await showUpdateReadyDialog({ dialog, win: {}, t: (k) => k, autoUpdater })

    expect(autoUpdater.quitAndInstall).toHaveBeenCalled()
  })

  it('remet le redémarrage à plus tard si l’utilisateur refuse', async () => {
    const autoUpdater = { quitAndInstall: vi.fn() }
    const dialog = { showMessageBox: vi.fn().mockResolvedValue({ response: 1 }) }

    await showUpdateReadyDialog({ dialog, win: {}, t: (k) => k, autoUpdater })

    expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })
})

describe('setupAutoUpdater — remontée des erreurs', () => {
  it('journalise une erreur du moteur sans ouvrir un second dialogue', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps = makeDeps()
    setupAutoUpdater(deps)

    deps.autoUpdater.handlers.error(new Error('serveur injoignable'))
    deps.autoUpdater.handlers.error('panne sèche')

    expect(deps.dialog.showMessageBox).not.toHaveBeenCalled()
    expect(log).toHaveBeenCalledTimes(2)
    log.mockRestore()
  })

  it('propose de redémarrer dès que la mise à jour est téléchargée', () => {
    const deps = makeDeps()
    setupAutoUpdater(deps)

    deps.autoUpdater.handlers['update-downloaded']()

    expect(deps.state.updateDownloaded).toBe(true)
    expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'update_ready_title' }),
    )
  })
})

describe('checkForUpdates — échec du téléchargement', () => {
  it('signale un téléchargement qui échoue', async () => {
    const deps = makeDeps({ fromMenu: true })
    deps.autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '2.0.0' } })
    deps.autoUpdater.downloadUpdate.mockRejectedValue(new Error('coupure réseau'))

    await checkForUpdates(deps)
    await new Promise(r => setTimeout(r, 0))

    expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'error', message: 'coupure réseau' }),
    )
  })

  it('accepte un rejet qui n’est pas un Error', async () => {
    const deps = makeDeps({ fromMenu: true })
    deps.autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '2.0.0' } })
    deps.autoUpdater.downloadUpdate.mockRejectedValue('panne')

    await checkForUpdates(deps)
    await new Promise(r => setTimeout(r, 0))

    expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'panne' }),
    )
  })

  it('accepte une réponse de vérification vide', async () => {
    const deps = makeDeps({ fromMenu: true })
    deps.autoUpdater.checkForUpdates.mockResolvedValue(null)

    await checkForUpdates(deps)

    expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'no_update_title' }),
    )
  })
})

describe('_upgradeManual — installs that cannot update themselves', () => {
  const { _upgradeManual } = requireSrc('main/lib/updater.js')
  const win = {}
  const opts = (over = {}) => ({
    dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) },
    app: { getVersion: () => '1.0.0' },
    win, t: (k) => k, fromMenu: true, openExternal: vi.fn(),
    _fetchJson: vi.fn().mockResolvedValue({ tag_name: 'v2.0.0' }),
    ...over,
  })

  it('opens the release page when the user accepts', async () => {
    const o = opts()
    await _upgradeManual(o)
    expect(o.openExternal).toHaveBeenCalledWith('https://github.com/light-cut-vidz/light-cut-vidz/releases/tag/v2.0.0')
  })

  it('opens nothing when the user says later', async () => {
    const o = opts()
    o.dialog.showMessageBox.mockResolvedValueOnce({ response: 1 })
    await _upgradeManual(o)
    expect(o.openExternal).not.toHaveBeenCalled()
  })

  it('says so when already up to date (menu only)', async () => {
    const o = opts({ _fetchJson: vi.fn().mockResolvedValue({ tag_name: 'v1.0.0' }) })
    await _upgradeManual(o)
    expect(o.dialog.showMessageBox).toHaveBeenCalledWith(win, expect.objectContaining({ title: 'no_update_title' }))
    const quiet = opts({ fromMenu: false, _fetchJson: vi.fn().mockResolvedValue({ tag_name: 'v1.0.0' }) })
    await _upgradeManual(quiet)
    expect(quiet.dialog.showMessageBox).not.toHaveBeenCalled()
  })

  it('rejects a malformed tag', async () => {
    const o = opts({ _fetchJson: vi.fn().mockResolvedValue({ tag_name: 'v2.0.0$(x)' }) })
    await _upgradeManual(o)
    expect(o.openExternal).not.toHaveBeenCalled()
  })

  it('reports a network failure from the menu only', async () => {
    const o = opts({ _fetchJson: vi.fn().mockRejectedValue(new Error('net')) })
    await _upgradeManual(o)
    expect(o.dialog.showMessageBox).toHaveBeenCalledWith(win, expect.objectContaining({ type: 'error' }))
    const quiet = opts({ fromMenu: false, _fetchJson: vi.fn().mockRejectedValue(new Error('net')) })
    await _upgradeManual(quiet)
    expect(quiet.dialog.showMessageBox).not.toHaveBeenCalled()
  })

  it('is what checkForUpdates picks for a manual install', async () => {
    const manual = vi.fn()
    const { checkForUpdates } = requireSrc('main/lib/updater.js')
    await checkForUpdates({ autoUpdater: {}, dialog: {}, app: {}, getWindow: () => win, t: k => k, state: {}, isDev: false, isMac: false, isDeb: false, isManual: true, fromMenu: true, _manualHandler: manual })
    expect(manual).toHaveBeenCalled()
  })
})

// ─── Release notes in the update dialog ─────────────────────────────────────

describe('release notes in the update dialog', () => {
  const { loadReleaseNotes, fetchText } = requireSrc('main/lib/updater.js')
  const CHANGES = `## [2.0.0] - 2026-05-01\n### Added\n- Shiny thing\n\n## [1.5.0] - 2026-04-01\n### Fixed\n- Old bug\n\n## [1.0.0] - 2026-01-01\n- first\n`
  const win = {}

  it('loadReleaseNotes lists every version between the installed one and the new one', async () => {
    const _fetchText = vi.fn().mockResolvedValue(CHANGES)
    const notes = await loadReleaseNotes({ lang: 'en', current: '1.0.0', latest: '2.0.0', _fetchText })
    expect(notes).toContain('2.0.0')
    expect(notes).toContain('1.5.0')
    expect(notes).not.toContain('first')
  })

  it('reads the changelog at the new tag, in the user language', async () => {
    const _fetchText = vi.fn().mockResolvedValue(CHANGES)
    await loadReleaseNotes({ lang: 'fr', current: '1.0.0', latest: '2.0.0', _fetchText })
    expect(_fetchText).toHaveBeenCalledWith('https://raw.githubusercontent.com/light-cut-vidz/light-cut-vidz/v2.0.0/CHANGELOG.fr.md')
    await loadReleaseNotes({ lang: 'en', current: '1.0.0', latest: '2.0.0', _fetchText })
    expect(_fetchText).toHaveBeenLastCalledWith('https://raw.githubusercontent.com/light-cut-vidz/light-cut-vidz/v2.0.0/CHANGELOG.md')
  })

  it('returns nothing, never an error, when the changelog cannot be fetched', async () => {
    const _fetchText = vi.fn().mockRejectedValue(new Error('404'))
    await expect(loadReleaseNotes({ lang: 'en', current: '1.0.0', latest: '2.0.0', _fetchText })).resolves.toBe('')
  })

  it('does not fetch anything without a language', async () => {
    const _fetchText = vi.fn()
    await expect(loadReleaseNotes({ lang: '', current: '1.0.0', latest: '2.0.0', _fetchText })).resolves.toBe('')
    expect(_fetchText).not.toHaveBeenCalled()
  })

  const macOpts = (over = {}) => ({
    dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 1 }) },
    app: { getVersion: () => '1.0.0', exit: vi.fn(), getPath: () => '' },
    win, t: (k, ...a) => (a.length ? `${k}:${a.join(',')}` : k), fromMenu: true, lang: 'en',
    _fetchJson: vi.fn().mockResolvedValue(releaseWith([{ name: 'LightCutVidz-mac-arm64.zip', browser_download_url: 'https://dl/a.zip' }])),
    _fetchText: vi.fn().mockResolvedValue(CHANGES),
    ...over,
  })

  it('shows what is new in the macOS update question', async () => {
    const o = macOpts()
    await _upgradeMac(o)
    const call = o.dialog.showMessageBox.mock.calls.find(([, d]) => d.title === 'update_available_title')
    expect(call[1].detail).toContain('update_available_detail')
    expect(call[1].detail).toContain('update_whats_new')
    expect(call[1].detail).toContain('• Shiny thing')
  })

  it('shows what is new in the deb update question', async () => {
    const o = { ...macOpts(), _fetchJson: vi.fn().mockResolvedValue(releaseWith([{ name: 'x.deb', browser_download_url: 'https://dl/x.deb' }])) }
    await _upgradeDeb(o)
    const call = o.dialog.showMessageBox.mock.calls.find(([, d]) => d.title === 'update_available_title')
    expect(call[1].detail).toContain('• Shiny thing')
  })

  it('shows what is new for a manual install', async () => {
    const o = { ...macOpts(), _fetchJson: vi.fn().mockResolvedValue({ tag_name: 'v2.0.0' }), openExternal: vi.fn() }
    await requireSrc('main/lib/updater.js')._upgradeManual(o)
    expect(o.dialog.showMessageBox.mock.calls[0][1].detail).toContain('• Shiny thing')
  })

  it('shows what is new on the AppImage path (electron-updater)', async () => {
    const deps = makeDeps({ fromMenu: true, getLang: () => 'en', _fetchText: vi.fn().mockResolvedValue(CHANGES) })
    deps.autoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '2.0.0' } })
    deps.dialog.showMessageBox.mockResolvedValue({ response: 1 })
    await checkForUpdates(deps)
    expect(deps.dialog.showMessageBox.mock.calls[0][1].detail).toContain('• Shiny thing')
  })

  it('still asks the question when the notes are unavailable', async () => {
    const o = macOpts({ _fetchText: vi.fn().mockRejectedValue(new Error('offline')) })
    await _upgradeMac(o)
    const call = o.dialog.showMessageBox.mock.calls.find(([, d]) => d.title === 'update_available_title')
    expect(call[1].detail).toBe('update_available_detail')
  })

  it('fetchText returns the body, and refuses plain HTTP and error statuses', async () => {
    const reply = (status, body) => (_o, cb) => {
      const handlers = {}
      const res = { statusCode: status, resume: () => {}, destroy: () => {}, setEncoding: () => {}, on: (e, f) => { handlers[e] = f; return res } }
      queueMicrotask(() => { cb(res); handlers.data && handlers.data(body); handlers.end && handlers.end() })
      return { on: () => {} }
    }
    await expect(fetchText('https://x/y.md', reply(200, '## [1.0.0]'))).resolves.toBe('## [1.0.0]')
    await expect(fetchText('https://x/y.md', reply(404, ''))).rejects.toThrow('404')
    await expect(fetchText('http://x/y.md', reply(200, ''))).rejects.toThrow('HTTPS')
  })
})
