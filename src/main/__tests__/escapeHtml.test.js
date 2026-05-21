import { describe, it, expect } from 'vitest'
import { escapeHtml } from '../lib/escapeHtml.js'

describe('escapeHtml', () => {
  it('escapes &', () => {
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry')
  })

  it('escapes <', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
  })

  it('escapes "', () => {
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;')
  })

  it('escapes all special chars in one go', () => {
    expect(escapeHtml('<a href="x">A&B</a>')).toBe('&lt;a href=&quot;x&quot;&gt;A&amp;B&lt;/a&gt;')
  })

  it('coerces non-strings to string', () => {
    expect(escapeHtml(42)).toBe('42')
    expect(escapeHtml(null)).toBe('null')
    expect(escapeHtml(undefined)).toBe('undefined')
  })

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('')
  })

  it('handles ampersand-first-then-tag order correctly', () => {
    expect(escapeHtml('&<')).toBe('&amp;&lt;')
  })
})
