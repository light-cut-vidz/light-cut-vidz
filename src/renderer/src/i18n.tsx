import React, { createContext, useContext, useState, useEffect } from 'react'
import { en, type Translations } from './messages/en'
import { fr } from './messages/fr'

export type Lang = 'en' | 'fr'
export type { Translations }

export const translations = { en, fr }

interface LangCtx {
  lang: Lang
  t: Translations
}

const LangContext = createContext<LangCtx>({ lang: 'en', t: en })

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    let saved: string | null = null
    try { saved = localStorage.getItem('lcv_lang') } catch { /* storage blocked: use the system language */ }
    if (saved === 'fr' || saved === 'en') return saved
    // First launch: follow the system language rather than always English.
    return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
  })

  useEffect(() => {
    // The language is switched from the native menu only; sync the current one to
    // the main process on startup so the menu checkmark is correct.
    window.electronAPI.setLanguage(lang)

    // Listen for language changes triggered from the native menu.
    const off = window.electronAPI.onMenuSetLanguage((l: string) => {
      if (l === 'en' || l === 'fr') {
        setLangState(l)
        try { localStorage.setItem('lcv_lang', l) } catch { /* not remembered */ }
      }
    })
    return off
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LangContext.Provider value={{ lang, t: translations[lang] }}>
      {children}
    </LangContext.Provider>
  )
}

export const useT = () => useContext(LangContext)
