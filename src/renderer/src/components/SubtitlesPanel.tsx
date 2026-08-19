import React, { useCallback } from 'react'
import type { SubtitlesState, SubtitleStyle, SubtitleAnimation } from '../App'
import { parseSrt } from '../utils/srt'
import { useT } from '../i18n'
import './SubtitlesPanel.css'

interface Props {
  subtitles: SubtitlesState | null
  onImport: (fileName: string, cues: ReturnType<typeof parseSrt>) => void
  onStyleChange: (style: SubtitleStyle) => void
  onAnimationChange: (animation: SubtitleAnimation) => void
  onRemove: () => void
}

const FONT_OPTIONS = [
  'Arial', 'Arial Black', 'Impact', 'Verdana', 'Georgia',
  'Times New Roman', 'Comic Sans MS', 'Trebuchet MS', 'Courier New',
  'Roboto', 'Helvetica', 'Calibri', 'Segoe UI', 'Tahoma', 'Futura', 'Century Gothic', 'Palatino',
]

export default function SubtitlesPanel({ subtitles, onImport, onStyleChange, onAnimationChange, onRemove }: Props) {
  const { t } = useT()

  const ANIMATIONS: { id: SubtitleAnimation; label: string; desc: string }[] = [
    { id: 'word-pop', label: t.subtitles_anim_word_pop, desc: t.subtitles_anim_word_pop_desc },
    { id: 'word-bounce', label: t.subtitles_anim_word_bounce, desc: t.subtitles_anim_word_bounce_desc },
    { id: 'word-highlight', label: t.subtitles_anim_word_highlight, desc: t.subtitles_anim_word_highlight_desc },
    { id: 'rainbow', label: t.subtitles_anim_rainbow, desc: t.subtitles_anim_rainbow_desc },
    { id: 'sentence-fade', label: t.subtitles_anim_sentence_fade, desc: t.subtitles_anim_sentence_fade_desc },
    { id: 'sentence-slide', label: t.subtitles_anim_sentence_slide, desc: t.subtitles_anim_sentence_slide_desc },
    { id: 'typewriter', label: t.subtitles_anim_typewriter, desc: t.subtitles_anim_typewriter_desc },
  ]

  const handleImport = useCallback(async () => {
    const result = await window.electronAPI.openSubtitleFile()
    if (!result) return
    const cues = parseSrt(result.content)
    const fileName = result.filePath.split(/[/\\]/).pop() || result.filePath
    onImport(fileName, cues)
  }, [onImport])

  if (!subtitles) {
    return (
      <div className="subtitles-panel">
        <p className="subtitles-hint">{t.subtitles_hint}</p>
        <button className="btn-primary" onClick={handleImport}>{t.subtitles_import}</button>
      </div>
    )
  }

  const { style, animation } = subtitles

  const patchStyle = (patch: Partial<SubtitleStyle>) => onStyleChange({ ...style, ...patch })

  return (
    <div className="subtitles-panel">
      <div className="subtitles-file-row">
        <span className="subtitles-filename">{subtitles.fileName}</span>
        <button className="btn-ghost subtitles-remove" onClick={onRemove}>{t.subtitles_remove}</button>
      </div>

      <div className="subtitles-section">
        <div className="subtitles-label">{t.subtitles_animation}</div>
        <div className="subtitles-anim-grid">
          {ANIMATIONS.map(a => (
            <button
              key={a.id}
              className={`subtitles-anim-card ${animation === a.id ? 'active' : ''}`}
              onClick={() => onAnimationChange(a.id)}
            >
              <span className="subtitles-anim-name">{a.label}</span>
              <span className="subtitles-anim-desc">{a.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="subtitles-section">
        <div className="subtitles-label">{t.subtitles_font}</div>
        <select
          className="subtitles-select"
          value={style.fontFamily}
          onChange={e => patchStyle({ fontFamily: e.target.value })}
        >
          {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      <div className="subtitles-section">
        <div className="subtitles-label">{t.subtitles_size}</div>
        <input
          type="range" min="2" max="12" step="0.5"
          value={style.fontSize}
          onChange={e => patchStyle({ fontSize: Number(e.target.value) })}
          className="subtitles-slider"
        />
      </div>

      <div className="subtitles-section subtitles-colors">
        <div className="subtitles-color-field">
          <label>{t.subtitles_color}</label>
          <input type="color" value={style.color} onChange={e => patchStyle({ color: e.target.value })} />
        </div>
        <div className="subtitles-color-field">
          <label>{t.subtitles_outline}</label>
          <input type="color" value={style.outlineColor} onChange={e => patchStyle({ outlineColor: e.target.value })} />
        </div>
        <div className="subtitles-color-field">
          <label>{t.subtitles_background}</label>
          <input type="color" value={style.backgroundColor} onChange={e => patchStyle({ backgroundColor: e.target.value })} />
        </div>
        {animation === 'word-highlight' && (
          <div className="subtitles-color-field">
            <label>{t.subtitles_accent}</label>
            <input type="color" value={style.accentColor} onChange={e => patchStyle({ accentColor: e.target.value })} />
          </div>
        )}
      </div>

      <div className="subtitles-section">
        <div className="subtitles-label">{t.subtitles_outline_width}</div>
        <input
          type="range" min="0" max="6" step="0.5"
          value={style.outlineWidth}
          onChange={e => patchStyle({ outlineWidth: Number(e.target.value) })}
          className="subtitles-slider"
        />
      </div>

      <div className="subtitles-section">
        <div className="subtitles-label">{t.subtitles_background_opacity}</div>
        <input
          type="range" min="0" max="1" step="0.05"
          value={style.backgroundOpacity}
          onChange={e => patchStyle({ backgroundOpacity: Number(e.target.value) })}
          className="subtitles-slider"
        />
      </div>

      <div className="subtitles-section">
        <div className="subtitles-label">{t.subtitles_position}</div>
        <div className="subtitles-position-row">
          {([
            { id: 'top', label: t.subtitles_position_top },
            { id: 'middle', label: t.subtitles_position_middle },
            { id: 'bottom', label: t.subtitles_position_bottom },
          ] as const).map(pos => (
            <button
              key={pos.id}
              className={`btn-secondary ${style.position === pos.id ? 'active' : ''}`}
              onClick={() => patchStyle({ position: pos.id })}
            >
              {pos.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
