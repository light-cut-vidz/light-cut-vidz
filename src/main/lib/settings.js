// User preferences kept between launches.

const THEMES = ['system', 'light', 'dark']
const DEFAULTS = { theme: 'system' }

/** Anything unexpected on disk falls back to the default. */
function sanitizeSettings(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  return { theme: THEMES.includes(r.theme) ? r.theme : DEFAULTS.theme }
}

module.exports = { THEMES, DEFAULTS, sanitizeSettings }
