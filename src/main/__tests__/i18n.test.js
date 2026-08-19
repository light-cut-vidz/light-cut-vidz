import { describe, it, expect } from 'vitest'
import { requireSrc } from './__doubles__/installElectron.js'
const { translate, msgs } = requireSrc('main/lib/i18n.js')

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

describe('parameterised messages', () => {
  it.each(['en', 'fr'])('%s formats a version into no_update_msg_v', (lang) => {
    const out = translate(lang, 'no_update_msg_v', '1.4.0')
    expect(out).toContain('1.4.0')
    expect(typeof out).toBe('string')
  })

  it.each(['en', 'fr'])('%s formats both versions into update_available_msg', (lang) => {
    const out = translate(lang, 'update_available_msg', '1.5.0', '1.4.0')
    expect(out).toContain('1.5.0')
    expect(out).toContain('1.4.0')
  })

  it.each(['en', 'fr'])('%s formats the version into about_message', (lang) => {
    expect(translate(lang, 'about_message', '1.4.0')).toContain('1.4.0')
  })

  it('falls back to the english function for an unknown language', () => {
    expect(translate('de', 'about_message', '9.9.9')).toBe('Version 9.9.9')
  })

  it('returns undefined for an unknown key rather than throwing', () => {
    expect(translate('en', 'does_not_exist')).toBeUndefined()
  })

  it('leaves every plain string untouched by the formatter', () => {
    for (const key of Object.keys(msgs.en)) {
      if (typeof msgs.en[key] === 'string') {
        expect(translate('en', key)).toBe(msgs.en[key])
      }
    }
  })

  it('resolves every french key to a non-empty value', () => {
    for (const key of Object.keys(msgs.fr)) {
      const out = translate('fr', key, '1.0.0', '0.9.0')
      expect(String(out).trim(), `fr.${key}`).not.toBe('')
    }
  })
})
