import { describe, it, expect, vi, beforeEach } from 'vitest'
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

  it('shows an error dialog when autoUpdater errors', () => {
    const deps = makeDeps()
    setupAutoUpdater(deps)
    deps.autoUpdater.handlers.error(new Error('boom'))
    expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'error', message: 'boom' }),
    )
  })

  it('silently ignores ENOENT errors (app-update.yml missing)', () => {
    const deps = makeDeps()
    setupAutoUpdater(deps)
    const err = Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })
    deps.autoUpdater.handlers.error(err)
    expect(deps.dialog.showMessageBox).not.toHaveBeenCalled()
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

})

describe('_upgradeMac', () => {
  const win = {}
  const baseOpts = (overrides = {}) => ({
    dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) },
    app: { getVersion: () => '1.0.0', exit: vi.fn() },
    win,
    t: (key) => key,
    fromMenu: true,
    ...overrides,
  })

  const release = (over = {}) => ({
    tag_name: 'v2.0.0',
    assets: [{ name: 'LightCutVidz-mac-arm64.zip', browser_download_url: 'https://dl/app.zip' }],
    ...over,
  })

  /** Les dépendances d'une mise à jour qui va jusqu'au bout. */
  const installOpts = (over = {}) => baseOpts({
    _fetchJson: vi.fn().mockResolvedValue(release()),
    _downloadFile: vi.fn().mockResolvedValue(undefined),
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

  it("télécharge l'archive publiée avec la release", async () => {
    const opts = installOpts()

    await _upgradeMac(opts)

    expect(opts._downloadFile).toHaveBeenCalledWith('https://dl/app.zip', expect.stringContaining('.zip'))
  })

  it("remplace l'app puis la rouvre, sans passer par brew", async () => {
    const opts = installOpts()

    await _upgradeMac(opts)

    const script = opts._spawn.mock.calls[0][0]
    expect(script).toContain('ditto -x -k')
    expect(script).toContain('/Applications/LightCutVidz.app')
    expect(script).toContain('open -a')
    // La release fait foi : le cask du tap n'est réécrit qu'après, et attendre
    // qu'il le soit laissait une mise à jour sans effet.
    expect(script).not.toContain('brew')
  })

  it("quitte l'app avant de la remplacer — macOS refuse d'écraser un bundle en cours", async () => {
    const opts = installOpts()

    await _upgradeMac(opts)

    expect(opts.app.exit).toHaveBeenCalledWith(0)
  })

  it("lève la quarantaine et resigne, sinon macOS refuse la copie fraîche", async () => {
    const opts = installOpts()

    await _upgradeMac(opts)

    const script = opts._spawn.mock.calls[0][0]
    expect(script).toContain('xattr -dr com.apple.quarantine')
    expect(script).toContain('codesign --force --deep --sign -')
  })

  it('décompresse dans un dossier propre à la version', async () => {
    const opts = installOpts()

    await _upgradeMac(opts)

    expect(opts._spawn.mock.calls[0][0]).toContain('/tmp/lcv-update-2.0.0')
  })

  it('efface le téléchargement derrière lui', async () => {
    const opts = installOpts()

    await _upgradeMac(opts)

    expect(opts._spawn.mock.calls[0][0]).toMatch(/rm -rf .*\.zip/)
  })

  it('does nothing when user declines', async () => {
    const opts = installOpts()
    opts.dialog.showMessageBox.mockResolvedValueOnce({ response: 1 })

    await _upgradeMac(opts)

    expect(opts._downloadFile).not.toHaveBeenCalled()
    expect(opts._spawn).not.toHaveBeenCalled()
  })

  it("signale une release sans archive macOS plutôt que de lancer un script bancal", async () => {
    const opts = installOpts({ _fetchJson: vi.fn().mockResolvedValue(release({ assets: [] })) })

    await _upgradeMac(opts)

    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ type: 'error', title: 'update_failed_title' })
    )
    expect(opts._spawn).not.toHaveBeenCalled()
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
  const baseOpts = (overrides = {}) => ({
    dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) },
    app: { getVersion: () => '1.0.0', relaunch: vi.fn(), exit: vi.fn() },
    win,
    t: (key) => key,
    fromMenu: true,
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
    opts._fetchJson = vi.fn().mockResolvedValue({ tag_name: 'v2.0.0', assets: [] })
    await _upgradeDeb(opts)
    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ type: 'error', title: 'update_failed_title' })
    )
  })

  it('downloads and installs when user accepts', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue({
      tag_name: 'v2.0.0',
      assets: [{ name: 'lightcutvidz_2.0.0_amd64.deb', browser_download_url: 'https://example.com/file.deb' }],
    })
    opts._downloadFile = vi.fn().mockResolvedValue(undefined)
    opts._exec = vi.fn((cmd, cb) => cb(null))
    await _upgradeDeb(opts)
    expect(opts._downloadFile).toHaveBeenCalled()
    expect(opts._exec).toHaveBeenCalledWith(expect.stringContaining('pkexec apt-get install'), expect.any(Function))
    expect(opts.app.relaunch).toHaveBeenCalled()
    expect(opts.app.exit).toHaveBeenCalledWith(0)
  })

  it('shows error when apt install fails', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue({
      tag_name: 'v2.0.0',
      assets: [{ name: 'lightcutvidz_2.0.0_amd64.deb', browser_download_url: 'https://example.com/file.deb' }],
    })
    opts._downloadFile = vi.fn().mockResolvedValue(undefined)
    opts._exec = vi.fn((cmd, cb) => cb(new Error('apt failed')))
    await _upgradeDeb(opts)
    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ type: 'error', title: 'update_failed_title' })
    )
    expect(opts.app.relaunch).not.toHaveBeenCalled()
  })
})

// ─── HTTP layer ──────────────────────────────────────────────────────────────
// Neither helper used to check the status code: a rate-limited GitHub reply
// parsed as "no update available", and an error page was written to disk as if
// it were the .deb, then handed to `pkexec apt-get install`.

import os from 'os'
import path from 'path'
import fs from 'fs'
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

describe('fetchJson', () => {
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

  it('rejects a redirect with no location header rather than looping', async () => {
    const get = fakeGet([{ status: 302, headers: {}, body: '' }])
    await expect(downloadFile('https://example.com/pkg.deb', dest, get)).rejects.toThrow('302')
  })
})

describe('_upgradeMac — chemins restants', () => {
  const win = {}
  const baseOpts = (overrides = {}) => ({
    dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) },
    app: { getVersion: () => '1.0.0', exit: vi.fn() },
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
      win, expect.objectContaining({ type: 'error', title: 'update_failed_title' })
    )
  })

  it('choisit le .deb parmi plusieurs assets', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue({
      tag_name: 'v2.0.0',
      assets: [{ name: 'app.AppImage', browser_download_url: 'https://x/a' }, asset],
    })
    opts._downloadFile = vi.fn().mockResolvedValue(undefined)
    opts._exec = vi.fn((cmd, cb) => cb(null))

    await _upgradeDeb(opts)

    expect(opts._downloadFile).toHaveBeenCalledWith(asset.browser_download_url, expect.stringContaining(asset.name))
  })

  it('ne télécharge rien si l’utilisateur refuse', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue({ tag_name: 'v2.0.0', assets: [asset] })
    opts._downloadFile = vi.fn()
    opts.dialog.showMessageBox.mockResolvedValueOnce({ response: 1 })

    await _upgradeDeb(opts)

    expect(opts._downloadFile).not.toHaveBeenCalled()
  })

  it('signale un téléchargement qui échoue', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue({ tag_name: 'v2.0.0', assets: [asset] })
    opts._downloadFile = vi.fn().mockRejectedValue(new Error('disque plein'))
    opts._exec = vi.fn()

    await _upgradeDeb(opts)

    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ type: 'error', title: 'update_failed_title' })
    )
    expect(opts._exec).not.toHaveBeenCalled()
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
    opts._fetchJson = vi.fn().mockResolvedValue({ tag_name: 'v2.0.0', assets: [] })

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
  it('affiche une erreur du moteur de mise à jour', () => {
    const deps = makeDeps()
    setupAutoUpdater(deps)

    deps.autoUpdater.handlers.error(new Error('serveur injoignable'))

    expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'error', message: 'serveur injoignable' }),
    )
  })

  it('accepte une erreur qui n’est pas un Error', () => {
    const deps = makeDeps()
    setupAutoUpdater(deps)

    deps.autoUpdater.handlers.error('panne sèche')

    expect(deps.dialog.showMessageBox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ message: 'panne sèche' }),
    )
  })

  it('ignore l’absence d’app-update.yml des anciens DMG', () => {
    const deps = makeDeps()
    setupAutoUpdater(deps)

    const err = new Error('no such file')
    err.code = 'ENOENT'
    deps.autoUpdater.handlers.error(err)

    expect(deps.dialog.showMessageBox).not.toHaveBeenCalled()
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
