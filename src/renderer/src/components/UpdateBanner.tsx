import { useCallback, useEffect, useState } from 'react'
import { useT } from '../i18n'
import Toast from './Toast'
import type { UpdateNotice, UpdatePrompt } from '../electron'
import './UpdateBanner.css'

/**
 * What the updater says, shown in the window: a question (a new version, an
 * update ready to install) as a banner with the updater's own buttons — the
 * first one goes ahead, the last one is "later" — and its other messages as a
 * toast. The same behaviour as LightCutSoundz.
 */
export default function UpdateBanner() {
  const { t } = useT()
  const [prompt, setPrompt] = useState<UpdatePrompt | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [notice, setNotice] = useState<UpdateNotice | null>(null)

  useEffect(() => {
    const offPrompt = window.electronAPI.onUpdatePrompt((p) => { setShowNotes(false); setPrompt(p) })
    const offNotice = window.electronAPI.onUpdateNotice(setNotice)
    return () => { offPrompt(); offNotice() }
  }, [])

  const answer = (response: number) => {
    if (prompt) window.electronAPI.answerUpdate(prompt.id, response)
    setPrompt(null)
  }
  const clearNotice = useCallback(() => setNotice(null), [])

  return (
    <>
      {prompt && (
        <div className="update-banner" role="status">
          <span>{prompt.message || prompt.title}</span>
          {prompt.detail && (
            <button className="btn-ghost update-notes-toggle" aria-expanded={showNotes} onClick={() => setShowNotes(v => !v)}>
              {showNotes ? t.update_hide_notes : t.update_notes}
            </button>
          )}
          {prompt.buttons.map((label, i) => (
            <button key={i} className={i === 0 ? 'btn-primary' : 'btn-ghost'} onClick={() => answer(i)}>{label}</button>
          ))}
          {showNotes && prompt.detail && <div className="update-notes">{prompt.detail}</div>}
        </div>
      )}
      {notice && <Toast key={notice.message} message={notice.message} type={notice.type} duration={notice.type === 'error' ? 6000 : 3500} onDone={clearNotice} />}
    </>
  )
}
