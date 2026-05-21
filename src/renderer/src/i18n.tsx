import React, { createContext, useContext, useState, useEffect } from 'react'
import { en, type Translations } from './messages/en'
import { fr } from './messages/fr'

export type Lang = 'en' | 'fr'
export type { Translations }

export const translations = { en, fr }

interface LangCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: Translations
}

const LangContext = createContext<LangCtx>({ lang: 'en', setLang: () => {}, t: en })

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('lcv_lang')
    return saved === 'fr' ? 'fr' : 'en'
  })

  const setLang = (l: Lang) => {
    setLangState(l)
    localStorage.setItem('lcv_lang', l)
    window.electronAPI.setLanguage(l)
  }

  useEffect(() => {
    // Sync current lang to main process on startup so the menu checkmark is correct.
    window.electronAPI.setLanguage(lang)

    // Listen for language changes triggered from the native menu.
    const off = window.electronAPI.onMenuSetLanguage((l: string) => {
      if (l === 'en' || l === 'fr') {
        setLangState(l)
        localStorage.setItem('lcv_lang', l)
      }
    })
    return off
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LangContext.Provider value={{ lang, setLang, t: translations[lang] }}>
      {children}
    </LangContext.Provider>
  )
}

export const useT = () => useContext(LangContext)
