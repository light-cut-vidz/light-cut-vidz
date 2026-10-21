import React, { useCallback, useEffect, useState } from 'react'
import { useT } from '../i18n'
import './ChangelogModal.css'

interface Entry { version: string; date: string; body: string }

export const SHOW_CHANGELOG_EVENT = 'lcv:show-changelog'
const LAST_SEEN_KEY = 'lcv_last_seen_version'

/** `**bold**` and `` `code` `` inside a line of a changelog entry. */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    return <React.Fragment key={i}>{part}</React.Fragment>
  })
}

/** The small Markdown subset the changelogs use: "### Heading" and "- bullet". */
function Body({ text }: { text: string }) {
  const blocks: React.ReactNode[] = []
  let items: string[] = []
  const flush = () => {
    if (items.length) blocks.push(<ul key={`ul${blocks.length}`}>{items.map((it, i) => <li key={i}>{inline(it)}</li>)}</ul>)
    items = []
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const heading = /^###\s+(.*)$/.exec(line)
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (heading) { flush(); blocks.push(<h4 key={`h${blocks.length}`}>{heading[1]}</h4>) }
    else if (bullet) items.push(bullet[1])
    else if (line) { flush(); blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>) }
  }
  flush()
  return <>{blocks}</>
}

/**
 * The "What's new" window. It owns its own visibility so it works from any
 * screen: it opens from the Help menu, from a click on the version number, and
 * by itself once after the app has been updated.
 */
export default function ChangelogModal() {
  const { t, lang } = useT()
  // After an update (not on a first install) tell the user what changed. Read
  // lazily and purely; the new version is recorded in the effect below.
  const [open, setOpen] = useState(() => {
    try {
      const last = localStorage.getItem(LAST_SEEN_KEY)
      return !!last && last !== __APP_VERSION__
    } catch { return false }
  })
  const [entries, setEntries] = useState<Entry[] | null>(null)

  const show = useCallback(() => setOpen(true), [])

  useEffect(() => {
    const offMenu = window.electronAPI.onMenuShowChangelog(show)
    window.addEventListener(SHOW_CHANGELOG_EVENT, show)

    try { localStorage.setItem(LAST_SEEN_KEY, __APP_VERSION__) } catch { /* storage unavailable */ }

    return () => { offMenu(); window.removeEventListener(SHOW_CHANGELOG_EVENT, show) }
  }, [show])

  // Read in the current language each time it opens (the language can change).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    window.electronAPI.getChangelog(lang)
      .then(list => { if (!cancelled) setEntries(list) })
      .catch(() => { if (!cancelled) setEntries([]) })
    return () => { cancelled = true }
  }, [open, lang])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <div className="cl-backdrop" onClick={() => setOpen(false)}>
      <div className="cl-modal" role="dialog" aria-modal="true" aria-label={t.changelog_title} onClick={e => e.stopPropagation()}>
        <div className="cl-header">
          <h2>{t.changelog_title}</h2>
          <button className="cl-close" onClick={() => setOpen(false)} aria-label={t.changelog_close}>×</button>
        </div>
        <div className="cl-body">
          {entries === null && <p className="cl-empty">…</p>}
          {entries !== null && entries.length === 0 && <p className="cl-empty">{t.changelog_empty}</p>}
          {entries?.map(e => (
            <section key={e.version} className="cl-entry">
              <h3>{t.changelog_version(e.version)}{e.date && <span className="cl-date">{e.date}</span>}</h3>
              <Body text={e.body} />
            </section>
          ))}
        </div>
        <div className="cl-actions">
          <button className="btn-primary" onClick={() => setOpen(false)}>{t.changelog_close}</button>
        </div>
      </div>
    </div>
  )
}
