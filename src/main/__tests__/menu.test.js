import { describe, it, expect, vi } from 'vitest'
import { buildMenuTemplate, VIDEO_EXTENSIONS } from '../lib/menu.js'

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
    const tpl = buildMenuTemplate(makeOpts({ onSwitchLanguage }))
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
    const tpl = buildMenuTemplate(makeOpts({ onCheckUpdates }))
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
