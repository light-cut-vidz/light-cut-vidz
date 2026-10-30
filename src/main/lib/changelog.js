// CHANGELOG.md (English) and CHANGELOG.fr.md (French) follow "Keep a Changelog":
//
//   ## [1.0.2] - 2026-10-21
//   ### Fixed
//   - …
//
// This module reads them. The same entries feed the update dialog, the in-app
// "What's new" window and the GitHub release notes.

const { isNewer } = require('./version')

/** @typedef {{ version: string, date: string, body: string }} ChangelogEntry */

/**
 * Entries in file order (newest first). A section that is not a version —
 * "## [Unreleased]" — is skipped.
 * @param {string} text
 * @returns {ChangelogEntry[]}
 */
function parseChangelog(text) {
  /** @type {{ version: string, date: string, lines: string[] }[]} */
  const entries = []
  /** @type {typeof entries[number] | null} */
  let current = null
  for (const line of String(text).split(/\r?\n/)) {
    const head = /^##\s+\[?v?(\d+\.\d+\.\d+[0-9A-Za-z.+-]*)\]?(?:\s+[-–—]\s+(\S+))?/.exec(line)
    if (head) {
      current = { version: head[1], date: head[2] || '', lines: [] }
      entries.push(current)
    } else if (/^##\s/.test(line)) {
      current = null
    } else if (current) {
      current.lines.push(line)
    }
  }
  return entries.map(e => ({ version: e.version, date: e.date, body: e.lines.join('\n').trim() }))
}

/** Entries newer than `current` and no newer than `latest`: what an update brings. */
function entriesBetween(entries, current, latest) {
  return entries.filter(e => isNewer(e.version, current) && !isNewer(e.version, latest))
}

/** Entries that already shipped in `current` or earlier: what the app may show as history. */
function entriesUpTo(entries, current) {
  return entries.filter(e => !isNewer(e.version, current))
}

/**
 * Plain text for a native dialog: headings become "Fixed:", bullets become "•".
 * Long notes are cut at a line boundary.
 */
function formatNotes(entries, maxChars = 1500) {
  /** @type {string[]} */
  const out = []
  for (const e of entries) {
    out.push(`${e.version}${e.date ? ` (${e.date})` : ''}`)
    for (const raw of e.body.split('\n')) {
      const line = raw.trim()
      if (!line) continue
      const heading = /^###\s+(.*)$/.exec(line)
      if (heading) out.push(`${heading[1]}:`)
      else out.push(line.replace(/^[-*]\s+/, '• ').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1'))
    }
    out.push('')
  }
  const text = out.join('\n').trim()
  if (text.length <= maxChars) return text
  const cut = text.slice(0, maxChars)
  return `${cut.slice(0, cut.lastIndexOf('\n') > 0 ? cut.lastIndexOf('\n') : maxChars)}\n…`
}

module.exports = { parseChangelog, entriesBetween, entriesUpTo, formatNotes }
