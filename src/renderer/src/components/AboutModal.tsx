import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import './ChangelogModal.css'

/** The "About" window: opens from the Help menu, closes on Escape, a click
 * outside, or its button. */
export default function AboutModal() {
  const { t } = useT()
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => window.electronAPI.onMenuAbout(setVersion), [])

  useEffect(() => {
    if (version === null) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setVersion(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [version])

  if (version === null) return null
  const close = () => setVersion(null)

  return (
    <div className="cl-backdrop" onClick={close}>
      <div className="cl-card about-card" role="dialog" aria-modal="true" aria-label={t.about_title} onClick={e => e.stopPropagation()}>
        <div className="cl-title">{t.about_title}</div>
        <div className="about-tagline">{t.about_tagline}</div>
        <div className="about-version">{t.about_version(version)}</div>
        <div className="about-licenses">{t.about_licenses}</div>
        <button className="btn-primary about-close" onClick={close} autoFocus>{t.about_close}</button>
      </div>
    </div>
  )
}
