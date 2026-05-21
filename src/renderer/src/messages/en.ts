export const en = {
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

  // Filters
  tool_filters: 'Filters',

  // Geometry
  tool_geometry: 'Layout',
  geometry_rotate: 'Rotate',
  geometry_straighten: 'Straighten',
  geometry_perspective_h: 'Horizontal Perspective',
  geometry_perspective_v: 'Vertical Perspective',
  geometry_reset: 'Reset Layout',

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

export type Translations = typeof en
