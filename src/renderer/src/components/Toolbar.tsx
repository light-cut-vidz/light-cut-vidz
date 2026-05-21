import React, { memo } from 'react'
import type { EditorState } from '../App'
import { useT } from '../i18n'
import { CubeIcon, StarIcon, SoundOnIcon, SoundOffIcon, CropIcon } from './icons'
import './Toolbar.css'

const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]

interface Props {
  state: EditorState
  showCrop: boolean
  showFilters: boolean
  showGeometry: boolean
  onSpeedChange: (speed: number) => void
  onMuteToggle: () => void
  onCropToggle: () => void
  onCropReset: () => void
  onFilterToggle: () => void
  onGeometryToggle: () => void
}

function Toolbar({ state, showCrop, showFilters, showGeometry, onSpeedChange, onMuteToggle, onCropToggle, onCropReset, onFilterToggle, onGeometryToggle }: Props) {
  const { t } = useT()

  return (
    <div className="toolbar">
      {/* Geometry (Rotate & Perspective) */}
      <div className="tool-section">
        <div className="tool-label">{t.tool_geometry}</div>
        <button
          className={`tool-toggle-btn ${showGeometry ? 'active-accent' : (state.rotation !== 0 || state.perspectiveHorizontal !== 0 || state.perspectiveVertical !== 0 ? 'active-ok' : '')}`}
          onClick={onGeometryToggle}
        >
          <CubeIcon />
          {t.tool_geometry}
        </button>
      </div>

      <div className="tool-divider" />

      {/* Filters */}
      <div className="tool-section">
        <div className="tool-label">{t.tool_filters}</div>
        <button
          className={`tool-toggle-btn ${showFilters ? 'active-accent' : (state.filter !== 'none' ? 'active-ok' : '')}`}
          onClick={onFilterToggle}
        >
          <StarIcon />
          {state.filter === 'none' ? t.tool_filters : state.filter.charAt(0).toUpperCase() + state.filter.slice(1)}
        </button>
      </div>

      <div className="tool-divider" />

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
            <><SoundOffIcon />{t.tool_muted}</>
          ) : (
            <><SoundOnIcon />{t.tool_sound_on}</>
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
            <CropIcon />
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

      <div className="toolbar-spacer" />
      <div className="toolbar-version">v{__APP_VERSION__}</div>
    </div>
  )
}

export default memo(Toolbar)
