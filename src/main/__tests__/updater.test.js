import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupAutoUpdater, checkForUpdates, _upgradeHomebrew, _upgradeDmg, _upgradeDeb } from '../lib/updater.js'

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
    isHomebrew: false,
    isDmg: false,
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

  it('skips electron-updater on homebrew', async () => {
    const _homebrewHandler = vi.fn().mockResolvedValue(undefined)
    await checkForUpdates({ ...deps, isHomebrew: true, _homebrewHandler })
    expect(deps.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(_homebrewHandler).toHaveBeenCalled()
  })

  it('skips electron-updater on DMG (uses _dmgHandler)', async () => {
    const _dmgHandler = vi.fn().mockResolvedValue(undefined)
    await checkForUpdates({ ...deps, isDmg: true, _dmgHandler })
    expect(deps.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(_dmgHandler).toHaveBeenCalled()
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

describe('_upgradeDmg', () => {
  const win = {}
  const baseOpts = (overrides = {}) => ({
    dialog: { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) },
    app: { getVersion: () => '1.0.0' },
    win,
    t: (key) => key,
    fromMenu: true,
    ...overrides,
  })

  it('shows error when GitHub API fails', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockRejectedValue(new Error('net'))
    await _upgradeDmg(opts)
    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ type: 'error', title: 'update_failed_title' })
    )
  })

  it('shows no update when already on latest', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue({ tag_name: 'v1.0.0' })
    await _upgradeDmg(opts)
    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ title: 'no_update_title' })
    )
  })

  it('opens releases page when user accepts', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue({ tag_name: 'v2.0.0' })
    opts._openExternal = vi.fn()
    await _upgradeDmg(opts)
    expect(opts._openExternal).toHaveBeenCalledWith(expect.stringContaining('github.com'))
  })

  it('does nothing when user declines', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue({ tag_name: 'v2.0.0' })
    opts._openExternal = vi.fn()
    opts.dialog.showMessageBox.mockResolvedValueOnce({ response: 1 })
    await _upgradeDmg(opts)
    expect(opts._openExternal).not.toHaveBeenCalled()
  })
})

describe('_upgradeHomebrew', () => {
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
    await _upgradeHomebrew(opts)
    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ type: 'error', title: 'update_failed_title' })
    )
  })

  it('shows no update when already on latest', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue({ tag_name: 'v1.0.0' })
    await _upgradeHomebrew(opts)
    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ title: 'no_update_title' })
    )
  })

  it('runs brew upgrade and relaunches when user accepts', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue({ tag_name: 'v2.0.0' })
    opts._exec = vi.fn((cmd, cb) => cb(null))
    opts._brewPath = '/opt/homebrew/bin/brew'
    await _upgradeHomebrew(opts)
    expect(opts._exec).toHaveBeenCalledWith(expect.stringContaining('upgrade --cask lightcutvidz'), expect.any(Function))
    expect(opts.app.relaunch).toHaveBeenCalled()
    expect(opts.app.exit).toHaveBeenCalledWith(0)
  })

  it('shows error when brew upgrade fails', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue({ tag_name: 'v2.0.0' })
    opts._brewPath = '/opt/homebrew/bin/brew'
    opts._exec = vi.fn((cmd, cb) => cb(new Error('brew failed')))
    await _upgradeHomebrew(opts)
    expect(opts.dialog.showMessageBox).toHaveBeenCalledWith(
      win, expect.objectContaining({ type: 'error', title: 'update_failed_title' })
    )
    expect(opts.app.relaunch).not.toHaveBeenCalled()
  })

  it('does nothing when user declines', async () => {
    const opts = baseOpts()
    opts._fetchJson = vi.fn().mockResolvedValue({ tag_name: 'v2.0.0' })
    opts._brewPath = '/opt/homebrew/bin/brew'
    opts._exec = vi.fn()
    opts.dialog.showMessageBox
      .mockResolvedValueOnce({ response: 1 }) // user declines
    await _upgradeHomebrew(opts)
    expect(opts._exec).not.toHaveBeenCalled()
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
