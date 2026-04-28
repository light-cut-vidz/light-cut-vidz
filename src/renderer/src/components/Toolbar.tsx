import React from 'react'
import type { EditorState } from '../App'
import { useT } from '../i18n'
import './Toolbar.css'

const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

interface Props {
  state: EditorState
  showCrop: boolean
  onSpeedChange: (speed: number) => void
  onMuteToggle: () => void
  onCropToggle: () => void
  onCropReset: () => void
}

export default function Toolbar({ state, showCrop, onSpeedChange, onMuteToggle, onCropToggle, onCropReset }: Props) {
  const { t } = useT()

  return (
    <div className="toolbar">
      {/* Speed */}
      <div className="tool-section">
        <div className="tool-label">{t.tool_speed}</div>
        <div className="speed-display">{state.speed}x</div>
        <input
          type="range"
          min={0}
          max={SPEED_PRESETS.length - 1}
          step={1}
          value={SPEED_PRESETS.indexOf(state.speed) !== -1 ? SPEED_PRESETS.indexOf(state.speed) : 3}
          onChange={(e) => onSpeedChange(SPEED_PRESETS[Number(e.target.value)])}
          className="speed-slider"
        />
        <div className="speed-labels">
          <span>0.25x</span>
          <span>4x</span>
        </div>
        <div className="speed-presets">
          {SPEED_PRESETS.map(s => (
            <button
              key={s}
              className={`preset-btn ${state.speed === s ? 'active' : ''}`}
              onClick={() => onSpeedChange(s)}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div className="tool-divider" />

      {/* Audio */}
      <div className="tool-section">
        <div className="tool-label">{t.tool_audio}</div>
        <button
          className={`tool-toggle-btn ${state.muted ? 'active-danger' : 'active-ok'}`}
          onClick={onMuteToggle}
        >
          {state.muted ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5z"/>
                <line x1="23" y1="9" x2="17" y2="15"/>
                <line x1="17" y1="9" x2="23" y2="15"/>
              </svg>
              {t.tool_muted}
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
              {t.tool_sound_on}
            </>
          )}
        </button>
      </div>

      <div className="tool-divider" />

      {/* Crop */}
      <div className="tool-section">
        <div className="tool-label">{t.tool_crop}</div>

        {showCrop ? (
          <p className="crop-hint">{t.crop_hint}</p>
        ) : state.crop ? (
          <>
            <div className="crop-applied-badge">
              ✓ {Math.round(state.crop.w)} × {Math.round(state.crop.h)}
            </div>
            <button className="tool-toggle-btn active-accent" onClick={onCropToggle}>
              {t.crop_adjust}
            </button>
            <button className="tool-toggle-btn crop-reset-btn" onClick={onCropReset}>
              {t.crop_reset}
            </button>
          </>
        ) : (
          <button className="tool-toggle-btn" onClick={onCropToggle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 2v14a2 2 0 0 0 2 2h14"/>
              <path d="M18 22V8a2 2 0 0 0-2-2H2"/>
            </svg>
            {t.crop_set}
          </button>
        )}
      </div>

      <div className="tool-divider" />

      {/* Trim info */}
      <div className="tool-section">
        <div className="tool-label">{t.tool_trim}</div>
        <p className="trim-hint">{t.trim_hint}</p>
        {state.cutSegments.length > 0 && (
          <div className="trim-count">{t.cuts_count(state.cutSegments.length)}</div>
        )}
      </div>
    </div>
  )
}
