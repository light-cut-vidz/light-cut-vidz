import React, { createContext, useContext, useState, useEffect } from 'react'

export type Lang = 'en' | 'fr'

// ─── Translations ─────────────────────────────────────────────────────────────

const en = {
  // DropZone
  dropzone_subtitle: 'Drop a video file here',
  dropzone_or: 'or',
  dropzone_browse: 'Browse files',

  // Toolbar
  tool_speed: 'Speed',
  tool_audio: 'Audio',
  tool_muted: 'Muted',
  tool_sound_on: 'Sound On',
  tool_crop: 'Crop',
  crop_hint: 'Adjust the selection, then Enter or ✓ Apply',
  crop_adjust: 'Adjust',
  crop_reset: 'Reset crop',
  crop_set: 'Set crop',
  tool_trim: 'Trim',
  trim_hint: 'On the timeline below, drag to select zones to remove. Multiple selections supported.',
  cuts_count: (n: number) => `${n} cut${n > 1 ? 's' : ''}`,

  // Export modal
  export_title: 'Export video',
  export_duration: 'Duration',
  export_speed: 'Speed',
  export_audio: 'Audio',
  export_audio_muted: 'Muted',
  export_audio_on: 'On',
  export_crop: 'Crop',
  export_crop_none: 'None',
  export_cuts: 'Cuts',
  export_cuts_none: 'None',
  export_cuts_removed: (n: number) => `${n} segment${n > 1 ? 's' : ''} removed`,
  export_cancel: 'Cancel',
  export_btn: 'Export',
  export_again: 'Export again',
  export_done: 'Done!',
  export_saved: 'Saved to',
  export_error: 'Error',
  format_mp4_desc: 'H.264 – Best compatibility',
  format_mov_desc: 'Apple QuickTime',
  format_webm_desc: 'VP9 – Web optimized',
  format_avi_desc: 'Windows legacy',
  format_gif_desc: 'Animated image (480px wide)',

  // Timeline
  tl_trim: 'TRIM',
  tl_cuts: (n: number) => `${n} cut${n > 1 ? 's' : ''}`,
  tl_clear: 'Clear all',
  tl_hint: 'Drag on track to mark zones to remove',
  cut_editor_label: 'Selected cut:',
  cut_editor_placeholder: 'Click a cut zone to edit its start / end times',
  cut_start: 'Start',
  cut_end: 'End',
  cut_delete: 'Delete cut',
  cut_jump: 'Jump to',
  cut_resize: 'Drag to resize',
  cut_format: 'Format: M:SS.s',

  // App
  app_open_video: 'Open video',
  app_export: 'Export',
  app_undo: 'Undo (Ctrl+Z)',
  app_redo: 'Redo (Ctrl+Y)',
  fullscreen_hint_mac: 'Full screen — press Ctrl+Cmd+F or Esc to exit',
  fullscreen_hint_linux: 'Full screen — press F11 or Esc to exit',

  // Loading
  loading_preparing: 'Preparing video…',

  // CropOverlay
  crop_apply: '✓ Apply',
}

const fr: typeof en = {
  // DropZone
  dropzone_subtitle: 'Déposez une vidéo ici',
  dropzone_or: 'ou',
  dropzone_browse: 'Parcourir les fichiers',

  // Toolbar
  tool_speed: 'Vitesse',
  tool_audio: 'Audio',
  tool_muted: 'Muet',
  tool_sound_on: 'Son activé',
  tool_crop: 'Recadrage',
  crop_hint: 'Ajustez la sélection, puis Entrée ou ✓ Appliquer',
  crop_adjust: 'Ajuster',
  crop_reset: 'Réinitialiser',
  crop_set: 'Recadrer',
  tool_trim: 'Coupes',
  trim_hint: 'Sur la timeline ci-dessous, faites glisser pour sélectionner les zones à supprimer. Plusieurs sélections possibles.',
  cuts_count: (n: number) => `${n} coupe${n > 1 ? 's' : ''}`,

  // Export modal
  export_title: 'Exporter la vidéo',
  export_duration: 'Durée',
  export_speed: 'Vitesse',
  export_audio: 'Audio',
  export_audio_muted: 'Muet',
  export_audio_on: 'Activé',
  export_crop: 'Recadrage',
  export_crop_none: 'Aucun',
  export_cuts: 'Coupes',
  export_cuts_none: 'Aucune',
  export_cuts_removed: (n: number) => `${n} segment${n > 1 ? 's' : ''} supprimé${n > 1 ? 's' : ''}`,
  export_cancel: 'Annuler',
  export_btn: 'Exporter',
  export_again: 'Exporter à nouveau',
  export_done: 'Terminé !',
  export_saved: 'Enregistré dans',
  export_error: 'Erreur',
  format_mp4_desc: 'H.264 – Meilleure compatibilité',
  format_mov_desc: 'Apple QuickTime',
  format_webm_desc: 'VP9 – Optimisé web',
  format_avi_desc: 'Héritage Windows',
  format_gif_desc: 'Image animée (480px de large)',

  // Timeline
  tl_trim: 'COUPES',
  tl_cuts: (n: number) => `${n} coupe${n > 1 ? 's' : ''}`,
  tl_clear: 'Tout effacer',
  tl_hint: 'Faites glisser sur la piste pour marquer les zones à supprimer',
  cut_editor_label: 'Coupe sélectionnée :',
  cut_editor_placeholder: 'Cliquez sur une zone de coupe pour modifier ses temps',
  cut_start: 'Début',
  cut_end: 'Fin',
  cut_delete: 'Supprimer la coupe',
  cut_jump: 'Aller à',
  cut_resize: 'Glisser pour redimensionner',
  cut_format: 'Format : M:SS.s',

  // App
  app_open_video: 'Ouvrir une vidéo',
  app_export: 'Exporter',
  app_undo: 'Annuler (Ctrl+Z)',
  app_redo: 'Rétablir (Ctrl+Y)',
  fullscreen_hint_mac: 'Plein écran — appuyez sur Ctrl+Cmd+F ou Échap pour quitter',
  fullscreen_hint_linux: 'Plein écran — appuyez sur F11 ou Échap pour quitter',

  // Loading
  loading_preparing: 'Préparation de la vidéo…',

  // CropOverlay
  crop_apply: '✓ Appliquer',
}

export const translations = { en, fr }
export type Translations = typeof en

// ─── Context ──────────────────────────────────────────────────────────────────

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
    // Sync current lang to main process on startup so the menu checkmark is correct
    window.electronAPI.setLanguage(lang)

    // Listen for language changes triggered from the native menu
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
