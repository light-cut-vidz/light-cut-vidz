import React, { useState, useEffect } from 'react'
import type { EditorState } from '../App'
import { formatTime, getKeptSegments } from '../utils/time'
import { getFilterById } from '../utils/filters'
import { useT } from '../i18n'
import './ExportModal.css'

interface Props {
  state: EditorState
  onClose: () => void
  /** Called after the export was added to the queue (the dialog then closes). */
  onQueued?: () => void
}

type Format = 'mp4' | 'mov' | 'webm' | 'avi' | 'gif'
type Quality = 'high' | 'balanced' | 'small'

const QUALITIES: Quality[] = ['high', 'balanced', 'small']
const RESOLUTIONS = [2160, 1440, 1080, 720, 480, 360]
const GIF_WIDTHS = [240, 320, 480, 640, 800]
const GIF_FPS = [8, 10, 12, 15, 20, 25]
const HARDWARE_FORMATS: Format[] = ['mp4', 'mov', 'avi']

interface Prefs {
  format: Format
  quality: Quality
  resolution: number | null
  gifWidth: number
  gifFps: number
  hardware: boolean
}
const DEFAULT_PREFS: Prefs = { format: 'mp4', quality: 'balanced', resolution: null, gifWidth: 480, gifFps: 15, hardware: true }
const PREFS_KEY = 'lcv_export_prefs'

/** Last used choices, validated: a stale or hand-edited value falls back to its default. */
function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
    return {
      format: ['mp4', 'mov', 'webm', 'avi', 'gif'].includes(raw.format) ? raw.format : DEFAULT_PREFS.format,
      quality: QUALITIES.includes(raw.quality) ? raw.quality : DEFAULT_PREFS.quality,
      resolution: RESOLUTIONS.includes(raw.resolution) ? raw.resolution : null,
      gifWidth: GIF_WIDTHS.includes(raw.gifWidth) ? raw.gifWidth : DEFAULT_PREFS.gifWidth,
      gifFps: GIF_FPS.includes(raw.gifFps) ? raw.gifFps : DEFAULT_PREFS.gifFps,
      hardware: raw.hardware !== false,
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export default function ExportModal({ state, onClose, onQueued }: Props) {
  const { t, lang } = useT()
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const { format, quality, resolution, gifWidth, gifFps } = prefs
  const update = (patch: Partial<Prefs>) => setPrefs(p => {
    const next = { ...p, ...patch }
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)) } catch { /* not remembered */ }
    return next
  })
  const setFormat = (f: Format) => update({ format: f })

  // What this machine's ffmpeg can do: hardware encoders (probed) and stabilisation.
  const [caps, setCaps] = useState<{ hardware: string[]; stabilization: boolean }>({ hardware: [], stabilization: true })
  useEffect(() => {
    let cancelled = false
    window.electronAPI.getCapabilities().then(c => { if (!cancelled) setCaps(c) }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  const hardwareId = caps.hardware[0] ?? null
  const hardwareApplies = !!hardwareId && HARDWARE_FORMATS.includes(format)
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

  // The exported clip plays the kept parts at `speed`, so it is shorter (or
  // longer) than the sum of the kept parts.
  const keptDuration = keptSegments.reduce((acc, s) => acc + (s.end - s.start), 0) / state.speed
  const exporting = progress !== null && !done
  const nothingToExport = keptSegments.length === 0

  useEffect(() => {
    const off = window.electronAPI.onProgress((p: number) => setProgress(p))
    return off
  }, [])

  // Closing mid-export would leave it running with no way to see or stop it.
  const requestClose = () => { if (!exporting) onClose() }

  const buildOptions = (savePath: string) => ({
    inputPath: state.videoPath as string,
    outputPath: savePath,
    segments: keptSegments,
    speed: state.speed,
    crop: state.crop,
    filter: state.filter,
    rotation: state.rotation,
    straighten: state.straighten,
    perspectiveH: state.perspectiveHorizontal,
    perspectiveV: state.perspectiveVertical,
    muted: state.muted,
    format,
    quality,
    resolution: format === 'gif' ? null : resolution,
    gifWidth,
    gifFps,
    stabilize: state.stabilize,
    hardware: hardwareApplies && prefs.hardware ? hardwareId : null,
    subtitles: state.subtitles
      ? { cues: state.subtitles.cues, style: state.subtitles.style, animation: state.subtitles.animation }
      : null,
  })

  const handleExport = async (mode: 'now' | 'queue' = 'now') => {
    setError(null)
    setDone(false)

    if (!state.videoPath || nothingToExport) return

    const baseName = state.videoPath.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || 'output'

    const savePath = await window.electronAPI.saveVideo(`${baseName}_edit.${format}`, format)
    if (!savePath) return

    if (mode === 'queue') {
      try {
        await window.electronAPI.queueAdd(buildOptions(savePath))
        onQueued?.()
        onClose()
      } catch (err: unknown) {
        setError((err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      }
      return
    }

    setProgress(0)

    try {
      const result = await window.electronAPI.exportVideo(buildOptions(savePath))
      setDone(true)
      setOutputPath(result.outputPath)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      // The user pressed "Stop export": not a failure worth an error banner.
      setError(/cancelled/i.test(message) ? t.export_cancelled : message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      setProgress(null)
    }
  }

  const activeFilter = getFilterById(state.filter)
  const filterName = lang === 'fr' ? activeFilter.nameFr : activeFilter.nameEn

  return (
    <div className="modal-backdrop" onClick={requestClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t.export_title}</h2>
          <button className="modal-close" onClick={requestClose} disabled={exporting}>×</button>
        </div>

        {/* Summary */}
        <div className="export-summary">
          <div className="summary-row">
            <span className="summary-label">{t.export_duration}</span>
            <span className="summary-value">{formatTime(keptDuration)}</span>
          </div>
          <div className="summary-row">
            <span className="summary-label">{t.tool_filters}</span>
            <span className="summary-value">{filterName}</span>
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
            <span className="summary-label">{t.tool_geometry}</span>
            <span className="summary-value">
              {state.rotation + state.straighten}° / H: {state.perspectiveHorizontal}° / V: {state.perspectiveVertical}°
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
          {state.stabilize !== 'off' && (
            <div className="summary-row">
              <span className="summary-label">{t.export_stabilization}</span>
              <span className="summary-value">{t[`stabilize_${state.stabilize}`]}</span>
            </div>
          )}
          <div className="summary-row">
            <span className="summary-label">{t.export_subtitles}</span>
            <span className="summary-value">
              {state.subtitles ? state.subtitles.fileName : t.export_subtitles_none}
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
              disabled={exporting}
            >
              <div className="format-name">{f.label}</div>
              <div className="format-desc">{f.desc}</div>
            </button>
          ))}
        </div>

        {/* Quality, size and speed */}
        <div className="export-options">
          <div className="opt-row">
            <span className="opt-label">{t.export_quality}</span>
            <div className="seg" role="group" aria-label={t.export_quality}>
              {QUALITIES.map(q => (
                <button key={q} className={`seg-btn ${quality === q ? 'active' : ''}`} aria-pressed={quality === q} disabled={exporting} onClick={() => update({ quality: q })}>
                  {t[`quality_${q}`]}
                </button>
              ))}
            </div>
          </div>

          {format !== 'gif' ? (
            <div className="opt-row">
              <label className="opt-label" htmlFor="opt-resolution">{t.export_resolution}</label>
              <select id="opt-resolution" className="opt-select" value={resolution ?? ''} disabled={exporting}
                onChange={e => update({ resolution: e.target.value === '' ? null : Number(e.target.value) })}>
                <option value="">{t.resolution_original}</option>
                {RESOLUTIONS.map(r => <option key={r} value={r}>{r}p</option>)}
              </select>
            </div>
          ) : (
            <>
              <div className="opt-row">
                <label className="opt-label" htmlFor="opt-gif-width">{t.export_gif_width}</label>
                <select id="opt-gif-width" className="opt-select" value={gifWidth} disabled={exporting} onChange={e => update({ gifWidth: Number(e.target.value) })}>
                  {GIF_WIDTHS.map(w => <option key={w} value={w}>{w}px</option>)}
                </select>
              </div>
              <div className="opt-row">
                <label className="opt-label" htmlFor="opt-gif-fps">{t.export_gif_fps}</label>
                <select id="opt-gif-fps" className="opt-select" value={gifFps} disabled={exporting} onChange={e => update({ gifFps: Number(e.target.value) })}>
                  {GIF_FPS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </>
          )}

          {hardwareApplies && (
            <div className="opt-row">
              <label className="opt-label" htmlFor="opt-hardware">{t.export_hardware}</label>
              <label className="opt-check" title={t.export_hardware_hint}>
                <input id="opt-hardware" type="checkbox" checked={prefs.hardware} disabled={exporting} onChange={e => update({ hardware: e.target.checked })} />
                <span>{t[`hw_${hardwareId as 'videotoolbox' | 'nvenc' | 'qsv' | 'vaapi'}`] ?? hardwareId}</span>
              </label>
            </div>
          )}
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

        {nothingToExport && <div className="export-error">{t.export_nothing}</div>}

        {error && (
          <div className="export-error">{t.export_error}: {error}</div>
        )}

        {/* Actions */}
        <div className="modal-actions">
          {exporting ? (
            <button className="btn-ghost" onClick={() => { void window.electronAPI.cancelFfmpeg() }}>{t.export_stop}</button>
          ) : (
            <button className="btn-ghost" onClick={onClose}>{t.export_cancel}</button>
          )}
          <button className="btn-ghost" onClick={() => { void handleExport('queue') }} disabled={exporting || nothingToExport}>
            {t.export_queue_add}
          </button>
          <button
            className="btn-primary"
            onClick={() => { void handleExport('now') }}
            disabled={exporting || nothingToExport}
          >
            {done ? t.export_again : t.export_btn}
          </button>
        </div>
      </div>
    </div>
  )
}

