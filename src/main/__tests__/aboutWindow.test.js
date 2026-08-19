import { describe, it, expect } from 'vitest'
const { aboutHtml } = requireSrc('main/lib/aboutWindow.js')

describe('aboutHtml', () => {
  it('includes the title and message in the body', () => {
    const html = aboutHtml('LightCutVidz', 'Version 1.0.0')
    expect(html).toContain('<h1>LightCutVidz</h1>')
    expect(html).toContain('<p>Version 1.0.0</p>')
  })

  it('escapes html in title and message', () => {
    const html = aboutHtml('<script>alert(1)</script>', 'A & B')
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('A &amp; B')
  })

  it('produces a complete html document', () => {
    const html = aboutHtml('x', 'y')
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('</html>')
  })

  it('embeds a close button that runs window.close()', () => {
    const html = aboutHtml('x', 'y')
    expect(html).toContain('onclick="window.close()"')
  })
})

// ─── Window creation ─────────────────────────────────────────────────────────

import * as electronDouble from './__doubles__/electron.js'
import { installElectron, freshRequire, requireSrc } from './__doubles__/installElectron.js'
import { vi } from 'vitest'

const electron = { ...electronDouble }
const created = []
electron.BrowserWindow = class {
  constructor(opts) {
    this.opts = opts
    this.loadURL = vi.fn()
    this.setMenuBarVisibility = vi.fn()
    created.push(this)
  }
}
installElectron(electron)
const { showAboutWindow } = freshRequire('main/lib/aboutWindow.js')

describe('showAboutWindow', () => {
  function open(overrides = {}) {
    created.length = 0
    return showAboutWindow({ parent: { id: 1 }, title: 'LightCutVidz', message: 'Version 1.4.0', ...overrides })
  }

  it('opens a modal child of the main window', () => {
    open()
    expect(created[0].opts).toMatchObject({ modal: true, parent: { id: 1 }, resizable: false })
  })

  it('keeps node out of the about window', () => {
    open()
    expect(created[0].opts.webPreferences).toMatchObject({ nodeIntegration: false, contextIsolation: true })
  })

  it('loads the about page as an inline data URL', () => {
    const win = open()
    const [url] = win.loadURL.mock.calls[0]
    expect(url.startsWith('data:text/html;charset=utf-8,')).toBe(true)
    expect(decodeURIComponent(url)).toContain('Version 1.4.0')
  })

  it('hides the menu bar', () => {
    const win = open()
    expect(win.setMenuBarVisibility).toHaveBeenCalledWith(false)
  })

  it('escapes the message rather than injecting it raw', () => {
    const win = open({ message: '<img src=x onerror=alert(1)>' })
    const decoded = decodeURIComponent(win.loadURL.mock.calls[0][0])
    expect(decoded).not.toContain('<img src=x')
    expect(decoded).toContain('&lt;img')
  })
})
