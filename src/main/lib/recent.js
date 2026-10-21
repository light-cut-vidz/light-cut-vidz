// The "recent" list: projects and videos the user opened lately. Pure helpers;
// storage is in store.js and the wiring in index.js.

const path = require('path')
const { videoExtensions } = require('../../shared/constants.json')
const { PROJECT_EXTENSION } = require('./project')

const MAX_RECENT = 10

/** @typedef {{ kind: 'project'|'video', path: string, openedAt: number }} RecentItem */

/** What kind of file is this, or null if the app would not open it.
 * @returns {'project'|'video'|null} */
function kindOf(filePath) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) return null
  const ext = path.extname(filePath).slice(1).toLowerCase()
  if (ext === PROJECT_EXTENSION) return 'project'
  return videoExtensions.includes(ext) ? 'video' : null
}

/** Cleans a list read from disk: right shape, known kinds, no duplicates, bounded. */
/** @returns {RecentItem[]} */
function sanitizeRecent(raw) {
  const items = raw && Array.isArray(raw.items) ? raw.items : []
  const seen = new Set()
  /** @type {RecentItem[]} */
  const out = []
  for (const it of items) {
    if (!it || typeof it !== 'object') continue
    const kind = kindOf(it.path)
    if (!kind || seen.has(it.path)) continue
    seen.add(it.path)
    out.push({ kind, path: it.path, openedAt: Number.isFinite(it.openedAt) ? it.openedAt : 0 })
    if (out.length >= MAX_RECENT) break
  }
  return out
}

/** The list with `filePath` at the top (moved there if already present).
 * @param {RecentItem[]} items @param {string} filePath @returns {RecentItem[]} */
function addRecent(items, filePath, now = Date.now()) {
  const kind = kindOf(filePath)
  if (!kind) return items
  return [{ kind, path: filePath, openedAt: now }, ...items.filter(i => i.path !== filePath)].slice(0, MAX_RECENT)
}

const removeRecent = (items, filePath) => items.filter(i => i.path !== filePath)

module.exports = { kindOf, sanitizeRecent, addRecent, removeRecent, MAX_RECENT }
