import { describe, it, expect } from 'vitest'
import { aboutHtml } from '../lib/aboutWindow.js'

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
