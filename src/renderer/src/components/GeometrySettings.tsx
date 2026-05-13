import React from 'react'
import { useT } from '../i18n'
import './GeometrySettings.css'

interface Props {
  rotation: number
  straighten: number
  perspectiveH: number
  perspectiveV: number
  onRotationChange: (rotation: number) => void
  onStraightenChange: (val: number) => void
  onPerspectiveHChange: (val: number) => void
  onPerspectiveVChange: (val: number) => void
  onReset: () => void
}

export default function GeometrySettings({
  rotation,
  straighten,
  perspectiveH,
  perspectiveV,
  onRotationChange,
  onStraightenChange,
  onPerspectiveHChange,
  onPerspectiveVChange,
  onReset,
}: Props) {
  const { t } = useT()

  const handleRotate = () => {
    onRotationChange((rotation + 90) % 360)
  }

  return (
    <div className="geometry-panel">
      <div className="geometry-controls">
        <div className="geometry-row">
          <label>{t.geometry_rotate}</label>
          <div className="rotate-control">
            <button className="btn-secondary btn-icon" onClick={handleRotate} title={t.geometry_rotate}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6"></path>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
            </button>
            <span className="geometry-value">{rotation}°</span>
          </div>
        </div>

        <div className="geometry-row">
          <label>{t.geometry_straighten}</label>
          <input
            type="range"
            min="-45"
            max="45"
            value={straighten}
            onChange={(e) => onStraightenChange(Number(e.target.value))}
            className="geometry-slider"
          />
          <span className="geometry-value">{straighten}°</span>
        </div>

        <div className="geometry-row">
          <label>{t.geometry_perspective_h}</label>
          <input
            type="range"
            min="-45"
            max="45"
            value={perspectiveH}
            onChange={(e) => onPerspectiveHChange(Number(e.target.value))}
            className="geometry-slider"
          />
          <span className="geometry-value">{perspectiveH}°</span>
        </div>

        <div className="geometry-row">
          <label>{t.geometry_perspective_v}</label>
          <input
            type="range"
            min="-45"
            max="45"
            value={perspectiveV}
            onChange={(e) => onPerspectiveVChange(Number(e.target.value))}
            className="geometry-slider"
          />
          <span className="geometry-value">{perspectiveV}°</span>
        </div>

        <button className="btn-ghost geometry-reset" onClick={onReset}>
          {t.geometry_reset}
        </button>
      </div>
    </div>
  )
}
