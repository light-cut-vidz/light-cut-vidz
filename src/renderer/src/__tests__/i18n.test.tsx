import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, renderHook, act } from '@testing-library/react'
import React from 'react'
import { LangProvider, useT, translations } from '../i18n'

beforeEach(() => {
  // Reset localStorage between tests
  ;(window.localStorage as { setItem: (k: string, v: string) => void }).setItem = () => {}
  ;(window.localStorage as { getItem: (k: string) => string | null }).getItem = () => null
})

describe('translations', () => {
  it('exports both en and fr dictionaries', () => {
    expect(translations.en).toBeDefined()
    expect(translations.fr).toBeDefined()
  })

  it('en and fr have the same keys', () => {
    const enKeys = Object.keys(translations.en).sort()
    const frKeys = Object.keys(translations.fr).sort()
    expect(frKeys).toEqual(enKeys)
  })

  it('exposes function-valued translations for plurals', () => {
    expect(typeof translations.en.cuts_count).toBe('function')
    expect((translations.en.cuts_count as (n: number) => string)(1)).toMatch(/1 cut/)
    expect((translations.en.cuts_count as (n: number) => string)(3)).toMatch(/3 cuts/)
    expect((translations.fr.cuts_count as (n: number) => string)(1)).toMatch(/1 coupe/)
    expect((translations.fr.cuts_count as (n: number) => string)(3)).toMatch(/3 coupes/)
  })
})

describe('useT hook', () => {
  function wrap({ children }: { children: React.ReactNode }) {
    return <LangProvider>{children}</LangProvider>
  }

  it('defaults to english', () => {
    const { result } = renderHook(() => useT(), { wrapper: wrap })
    expect(result.current.lang).toBe('en')
    expect(result.current.t.tool_speed).toBe('Speed')
  })

  it('returns translated string for current language', () => {
    const setItem = vi.fn()
    Object.defineProperty(window, 'localStorage', {
      value: {
        ...window.localStorage,
        getItem: () => 'fr',
        setItem,
      },
      configurable: true,
    })
    const { result } = renderHook(() => useT(), { wrapper: wrap })
    expect(result.current.lang).toBe('fr')
    expect(result.current.t.tool_speed).toBe('Vitesse')
  })

  it('remembers a language chosen from the native menu', () => {
    const setItem = vi.fn()
    Object.defineProperty(window, 'localStorage', { value: { ...window.localStorage, getItem: () => null, setItem }, configurable: true })
    let handler: ((l: string) => void) | null = null
    window.electronAPI = { ...window.electronAPI, onMenuSetLanguage: (cb: (l: string) => void) => { handler = cb; return () => {} }, setLanguage: () => {} }
    const { result } = renderHook(() => useT(), { wrapper: wrap })
    act(() => { handler!('fr') })
    expect(result.current.t.tool_speed).toBe('Vitesse')
    expect(setItem).toHaveBeenCalledWith('lcv_lang', 'fr')
  })

  it('tells the main process its language once at startup', () => {
    const setLanguageSpy = vi.fn()
    window.electronAPI = { ...window.electronAPI, setLanguage: setLanguageSpy }
    renderHook(() => useT(), { wrapper: wrap })
    expect(setLanguageSpy).toHaveBeenCalledWith('en')
  })

  it('listens to native menu language changes', () => {
    let handler: ((l: string) => void) | null = null
    window.electronAPI = {
      ...window.electronAPI,
      onMenuSetLanguage: (cb: (l: string) => void) => { handler = cb; return () => {} },
      setLanguage: () => {},
    }
    const { result } = renderHook(() => useT(), { wrapper: wrap })
    expect(result.current.lang).toBe('en')
    act(() => { handler!('fr') })
    expect(result.current.lang).toBe('fr')
  })

  it('ignores invalid language values from the native menu', () => {
    let handler: ((l: string) => void) | null = null
    window.electronAPI = {
      ...window.electronAPI,
      onMenuSetLanguage: (cb: (l: string) => void) => { handler = cb; return () => {} },
      setLanguage: () => {},
    }
    const { result } = renderHook(() => useT(), { wrapper: wrap })
    act(() => { handler!('de') })
    expect(result.current.lang).toBe('en')
  })

  it('returns the english fallback object when no provider is mounted', () => {
    // Direct hook usage without provider - returns default ctx (lang: 'en')
    const { result } = renderHook(() => useT())
    expect(result.current.lang).toBe('en')
    expect(result.current.t.tool_speed).toBe('Speed')
  })
})

describe('LangProvider rendering', () => {
  it('renders children', () => {
    const { getByText } = render(
      <LangProvider><span>hello</span></LangProvider>,
    )
    expect(getByText('hello')).toBeTruthy()
  })

  it('exposes translations to nested components', () => {
    function Inner() {
      const { t } = useT()
      return <span>{t.tool_speed}</span>
    }
    const { getByText } = render(<LangProvider><Inner /></LangProvider>)
    expect(getByText('Speed')).toBeTruthy()
  })
})

describe('LangProvider — first launch', () => {
  const setNavigatorLanguage = (lang: string) => Object.defineProperty(window.navigator, 'language', { value: lang, configurable: true })
  function wrap({ children }: { children: React.ReactNode }) { return <LangProvider>{children}</LangProvider> }

  it('follows a French system language', () => {
    setNavigatorLanguage('fr-FR')
    expect(renderHook(() => useT(), { wrapper: wrap }).result.current.lang).toBe('fr')
    setNavigatorLanguage('en-US')
  })

  it('falls back to English for any other language', () => {
    setNavigatorLanguage('de-DE')
    expect(renderHook(() => useT(), { wrapper: wrap }).result.current.lang).toBe('en')
    setNavigatorLanguage('en-US')
  })

  it('a saved choice wins over the system language', () => {
    setNavigatorLanguage('fr-FR')
    ;(window.localStorage as { getItem: (k: string) => string | null }).getItem = () => 'en'
    expect(renderHook(() => useT(), { wrapper: wrap }).result.current.lang).toBe('en')
    setNavigatorLanguage('en-US')
  })
})
