import { describe, it, expect } from 'vitest'
import { translate, msgs } from '../lib/i18n.js'

describe('msgs', () => {
  it('has both en and fr dictionaries', () => {
    expect(msgs.en).toBeDefined()
    expect(msgs.fr).toBeDefined()
  })

  it('en and fr share the same keys', () => {
    const enKeys = Object.keys(msgs.en).sort()
    const frKeys = Object.keys(msgs.fr).sort()
    expect(frKeys).toEqual(enKeys)
  })
})

describe('translate', () => {
  it('returns the english string by default', () => {
    expect(translate('en', 'menu_file')).toBe('File')
  })

  it('returns the french string when lang=fr', () => {
    expect(translate('fr', 'menu_file')).toBe('Fichier')
  })

  it('falls back to english when the lang is unknown', () => {
    expect(translate('de', 'menu_file')).toBe('File')
  })

  it('invokes function-valued messages with args', () => {
    expect(translate('en', 'about_message', '1.2.3')).toBe('Version 1.2.3')
    expect(translate('fr', 'about_message', '1.2.3')).toBe('Version 1.2.3')
  })

  it('invokes function-valued message with multiple args', () => {
    expect(translate('en', 'update_available_msg', '2.0.0', '1.0.0'))
      .toContain('Version 2.0.0')
  })

  it('returns undefined for unknown keys (no en fallback)', () => {
    expect(translate('en', 'nonexistent_key')).toBeUndefined()
  })
})
