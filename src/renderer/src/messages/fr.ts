import type { Translations } from './en'

export const fr: Translations = {
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

  // Filters
  tool_filters: 'Filtres',

  // Geometry
  tool_geometry: 'Disposition',
  geometry_rotate: 'Rotation',
  geometry_straighten: 'Redresser',
  geometry_perspective_h: 'Perspective horizontale',
  geometry_perspective_v: 'Perspective verticale',
  geometry_reset: 'Réinitialiser la disposition',

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
