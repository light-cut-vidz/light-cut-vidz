import React, { useState, useEffect } from 'react'
import type { EditorState } from '../App'
import { formatTime, getKeptSegments } from '../utils/time'
import { useT } from '../i18n'
import './ExportModal.css'

interface Props {
  state: EditorState
  onClose: () => void
}

type Format = 'mp4' | 'mov' | 'webm' | 'avi' | 'gif'

export default function ExportModal({ state, onClose }: Props) {
  const { t } = useT()
  const [format, setFormat] = useState<Format>('mp4')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [outputPath, setOutputPath] = useState<string | null>(null)

  const FORMATS: { id: Format; label: string; desc: string }[] = [
    { id: 'mp4', label: 'MP4', desc: t.format_mp4_desc },
    { id: 'mov', label: 'MOV', desc: t.format_mov_desc },
    { id: 'webm', label: 'WebM', desc: t.format_webm_desc },
    { id: 'avi', label: 'AVI', desc: t.format_avi_desc },
    { id: 'gif', label: 'GIF', desc: t.format_gif_desc },
  ]

  const keptSegments = getKeptSegments(state.cutSegments, state.duration)

  const keptDuration = keptSegments.reduce((acc, s) => acc + (s.end - s.start), 0)

  useEffect(() => {
    const off = window.electronAPI.onProgress((p: number) => setProgress(p))
    return off
  }, [])

  const handleExport = async () => {
    setError(null)
    setDone(false)

    const baseName = state.videoPath
      ? state.videoPath.split('/').pop()?.replace(/\.[^.]+$/, '') || 'output'
      : 'output'

    const savePath = await window.electronAPI.saveVideo(`${baseName}_edit.${format}`)
    if (!savePath) return

    setProgress(0)

    try {
      const result = await window.electronAPI.exportVideo({
        inputPath: state.videoPath!,
        outputPath: savePath,
        segments: keptSegments,
        speed: state.speed,
        crop: state.crop,
        muted: state.muted,
        format,
        duration: state.duration,
      })
      setDone(true)
      setOutputPath(result.outputPath)
    } catch (err: unknown) {
      setError(String(err))
      setProgress(null)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t.export_title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {/* Summary */}
        <div className="export-summary">
          <div className="summary-row">
            <span className="summary-label">{t.export_duration}</span>
            <span className="summary-value">{formatTime(keptDuration)}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">{t.export_speed}</span>
            <span className="summary-value">{state.speed}x</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">{t.export_audio}</span>
            <span className="summary-value">{state.muted ? t.export_audio_muted : t.export_audio_on}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">{t.export_crop}</span>
            <span className="summary-value">
              {state.crop ? `${state.crop.w}×${state.crop.h}` : t.export_crop_none}
            </span>
          </div>
          <div className="summary-row">
            <span className="summary-label">{t.export_cuts}</span>
            <span className="summary-value">
              {state.cutSegments.length > 0
                ? t.export_cuts_removed(state.cutSegments.length)
                : t.export_cuts_none}
            </span>
          </div>
        </div>

        {/* Format picker */}
        <div className="format-grid">
          {FORMATS.map(f => (
            <button
              key={f.id}
              className={`format-card ${format === f.id ? 'selected' : ''}`}
              onClick={() => setFormat(f.id)}
              disabled={progress !== null && !done}
            >
              <div className="format-name">{f.label}</div>
              <div className="format-desc">{f.desc}</div>
            </button>
          ))}
        </div>

        {/* Progress */}
        {progress !== null && (
          <div className="export-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="progress-label">{done ? t.export_done : `${progress}%`}</div>
          </div>
        )}

        {done && outputPath && (
          <div className="export-done">
            {t.export_saved} <strong>{outputPath}</strong>
          </div>
        )}

        {error && (
          <div className="export-error">{t.export_error}: {error}</div>
        )}

        {/* Actions */}
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>{t.export_cancel}</button>
          <button
            className="btn-primary"
            onClick={handleExport}
            disabled={progress !== null && !done}
          >
            {done ? t.export_again : t.export_btn}
          </button>
        </div>
      </div>
    </div>
  )
}

