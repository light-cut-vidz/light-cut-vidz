import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupAutoUpdater, checkForUpdates } from '../lib/updater.js'

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
    app: { getVersion: () => '1.0.0' },
    getWindow: () => ({}),
    t: (key) => key,
    state: { updateDownloaded: false },
    isDev: false,
    isSnap: false,
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

  it('skips on snap', async () => {
    await checkForUpdates({ ...deps, isSnap: true })
    expect(deps.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
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
    // First message → confirm; Second → "downloading" notice
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
