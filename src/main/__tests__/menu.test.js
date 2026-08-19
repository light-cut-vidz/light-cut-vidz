import { describe, it, expect, vi } from 'vitest'
const { buildMenuTemplate, VIDEO_EXTENSIONS } = requireSrc('main/lib/menu.js')

function makeOpts(overrides = {}) {
  return {
    t: (key) => key,
    currentLang: 'en',
    onOpenVideo: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onFullscreenEntered: vi.fn(),
    onAbout: vi.fn(),
    onCheckUpdates: vi.fn(),
    onSwitchLanguage: vi.fn(),
    ...overrides,
  }
}

describe('VIDEO_EXTENSIONS', () => {
  it('lists supported video formats', () => {
    expect(VIDEO_EXTENSIONS).toContain('mp4')
    expect(VIDEO_EXTENSIONS).toContain('mov')
    expect(VIDEO_EXTENSIONS).toContain('webm')
  })
})

describe('buildMenuTemplate', () => {
  it('builds a template with File / Edit / View / Help', () => {
    const tpl = buildMenuTemplate(makeOpts())
    const labels = tpl.map(m => m.label || '')
    expect(labels).toContain('menu_file')
    expect(labels).toContain('menu_edit')
    expect(labels).toContain('menu_view')
    expect(labels).toContain('menu_help')
  })

  it('marks the current language as checked', () => {
    const tpl = buildMenuTemplate(makeOpts({ currentLang: 'fr' }))
    const help = tpl.find(m => m.label === 'menu_help')
    const lang = help.submenu.find(s => s.label === 'menu_language')
    const en = lang.submenu.find(s => s.id === 'lang-en')
    const fr = lang.submenu.find(s => s.id === 'lang-fr')
    expect(fr.checked).toBe(true)
    expect(en.checked).toBe(false)
  })

  it('"Check for updates" is always enabled', () => {
    const tpl = buildMenuTemplate(makeOpts())
    const help = tpl.find(m => m.label === 'menu_help')
    const item = help.submenu.find(s => s.label === 'menu_check_updates')
    expect(item.enabled).not.toBe(false)
  })

  it('undo/redo start disabled', () => {
    const tpl = buildMenuTemplate(makeOpts())
    const edit = tpl.find(m => m.label === 'menu_edit')
    expect(edit.submenu.find(s => s.id === 'undo').enabled).toBe(false)
    expect(edit.submenu.find(s => s.id === 'redo').enabled).toBe(false)
  })

  it('invokes onSwitchLanguage when a language radio is clicked', () => {
    const onSwitchLanguage = vi.fn()
    const tpl = template(makeOpts({ onSwitchLanguage }))
    const help = tpl.find(m => m.label === 'menu_help')
    const lang = help.submenu.find(s => s.label === 'menu_language')
    lang.submenu.find(s => s.id === 'lang-fr').click()
    expect(onSwitchLanguage).toHaveBeenCalledWith('fr')
  })

  it('invokes onAbout when About menu item is clicked', () => {
    const onAbout = vi.fn()
    const tpl = buildMenuTemplate(makeOpts({ onAbout }))
    const help = tpl.find(m => m.label === 'menu_help')
    const about = help.submenu.find(s => s.label === 'menu_about')
    about.click()
    expect(onAbout).toHaveBeenCalled()
  })

  it('invokes onCheckUpdates with fromMenu=true', () => {
    const onCheckUpdates = vi.fn()
    const tpl = template(makeOpts({ onCheckUpdates }))
    const help = tpl.find(m => m.label === 'menu_help')
    const item = help.submenu.find(s => s.label === 'menu_check_updates')
    item.click()
    expect(onCheckUpdates).toHaveBeenCalledWith(true)
  })

  it('uses Ctrl+Y for redo on non-mac platforms', () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    try {
      const tpl = buildMenuTemplate(makeOpts())
      const edit = tpl.find(m => m.label === 'menu_edit')
      expect(edit.submenu.find(s => s.id === 'redo').accelerator).toBe('Ctrl+Y')
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })
})

// ─── Menu item behaviour ─────────────────────────────────────────────────────
// The click handlers are where the menu actually does something; they reach for
// electron's Menu/BrowserWindow/dialog, which the config aliases to a double.

import * as electronDouble from './__doubles__/electron.js'
import { installElectron, freshRequire, requireSrc } from './__doubles__/installElectron.js'

// menu.js is CommonJS: its `require('electron')` bypasses the Vite alias, so the
// double has to be seeded into Node's module cache and the module re-required.
const electron = { ...electronDouble }
installElectron(electron)
const { buildMenu, setUndoRedoEnabled, buildMenuTemplate: template } = freshRequire('main/lib/menu.js')
const { Menu, BrowserWindow, dialog } = electron

function findItem(tpl, menuKey, label) {
  const menu = tpl.find(m => m.label === menuKey)
  return menu.submenu.find(i => i.label === label)
}

describe('menu click handlers', () => {
  it('opens a video and forwards the chosen path', async () => {
    const win = { id: 1 }
    const onOpenVideo = vi.fn()
    vi.spyOn(BrowserWindow, 'getFocusedWindow').mockReturnValue(win)
    vi.spyOn(dialog, 'showOpenDialog').mockResolvedValue({ canceled: false, filePaths: ['/a.mp4'] })

    await findItem(template(makeOpts({ onOpenVideo })), 'menu_file', 'menu_open_video').click()

    expect(onOpenVideo).toHaveBeenCalledWith(win, '/a.mp4')
    vi.restoreAllMocks()
  })

  it('forwards nothing when the open dialog is cancelled', async () => {
    const onOpenVideo = vi.fn()
    vi.spyOn(BrowserWindow, 'getFocusedWindow').mockReturnValue({ id: 1 })
    vi.spyOn(dialog, 'showOpenDialog').mockResolvedValue({ canceled: true, filePaths: [] })

    await findItem(template(makeOpts({ onOpenVideo })), 'menu_file', 'menu_open_video').click()

    expect(onOpenVideo).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('does nothing when no window has focus', async () => {
    const onOpenVideo = vi.fn()
    vi.spyOn(BrowserWindow, 'getFocusedWindow').mockReturnValue(null)
    const showOpenDialog = vi.spyOn(dialog, 'showOpenDialog')

    await findItem(template(makeOpts({ onOpenVideo })), 'menu_file', 'menu_open_video').click()

    expect(showOpenDialog).not.toHaveBeenCalled()
    expect(onOpenVideo).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('routes undo and redo to the focused window', () => {
    const win = { id: 7 }
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    vi.spyOn(BrowserWindow, 'getFocusedWindow').mockReturnValue(win)

    const tpl = template(makeOpts({ onUndo, onRedo }))
    findItem(tpl, 'menu_edit', 'menu_undo').click()
    findItem(tpl, 'menu_edit', 'menu_redo').click()

    expect(onUndo).toHaveBeenCalledWith(win)
    expect(onRedo).toHaveBeenCalledWith(win)
    vi.restoreAllMocks()
  })

  it('signals only when entering fullscreen, not when leaving it', () => {
    const onFullscreenEntered = vi.fn()
    const win = { isFullScreen: () => false, setFullScreen: vi.fn() }
    vi.spyOn(BrowserWindow, 'getFocusedWindow').mockReturnValue(win)

    findItem(template(makeOpts({ onFullscreenEntered })), 'menu_view', 'menu_fullscreen').click()
    expect(win.setFullScreen).toHaveBeenCalledWith(true)
    expect(onFullscreenEntered).toHaveBeenCalledWith(win)

    win.isFullScreen = () => true
    onFullscreenEntered.mockClear()
    findItem(template(makeOpts({ onFullscreenEntered })), 'menu_view', 'menu_fullscreen').click()
    expect(win.setFullScreen).toHaveBeenCalledWith(false)
    expect(onFullscreenEntered).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('asks for an update check explicitly from the menu', () => {
    const onCheckUpdates = vi.fn()
    findItem(template(makeOpts({ onCheckUpdates })), 'menu_help', 'menu_check_updates').click()
    // `true` = user-initiated, so "no update" is reported rather than silent.
    expect(onCheckUpdates).toHaveBeenCalledWith(true)
  })

  it('switches language from the Help submenu', () => {
    const onSwitchLanguage = vi.fn()
    const help = template(makeOpts({ onSwitchLanguage })).find(m => m.label === 'menu_help')
    const langs = help.submenu.find(i => i.label === 'menu_language').submenu
    langs.find(l => l.id === 'lang-fr').click()
    expect(onSwitchLanguage).toHaveBeenCalledWith('fr')
  })

  it('checks the radio matching the current language', () => {
    const help = template(makeOpts({ currentLang: 'fr' })).find(m => m.label === 'menu_help')
    const langs = help.submenu.find(i => i.label === 'menu_language').submenu
    expect(langs.find(l => l.id === 'lang-fr').checked).toBe(true)
    expect(langs.find(l => l.id === 'lang-en').checked).toBe(false)
  })
})

describe('buildMenu', () => {
  it('installs the built template as the application menu', () => {
    const setApplicationMenu = vi.spyOn(Menu, 'setApplicationMenu')
    buildMenu(makeOpts())
    expect(setApplicationMenu).toHaveBeenCalledWith(expect.any(Array))
    vi.restoreAllMocks()
  })
})

describe('setUndoRedoEnabled', () => {
  it('does nothing when no menu is installed', () => {
    vi.spyOn(Menu, 'getApplicationMenu').mockReturnValue(null)
    expect(() => setUndoRedoEnabled(true, true)).not.toThrow()
    vi.restoreAllMocks()
  })

  it('toggles both items', () => {
    const items = { undo: { enabled: false }, redo: { enabled: false } }
    vi.spyOn(Menu, 'getApplicationMenu').mockReturnValue({ getMenuItemById: (id) => items[id] })

    setUndoRedoEnabled(true, false)
    expect(items.undo.enabled).toBe(true)
    expect(items.redo.enabled).toBe(false)
    vi.restoreAllMocks()
  })

  it('tolerates a menu missing those items', () => {
    vi.spyOn(Menu, 'getApplicationMenu').mockReturnValue({ getMenuItemById: () => undefined })
    expect(() => setUndoRedoEnabled(true, true)).not.toThrow()
    vi.restoreAllMocks()
  })
})
