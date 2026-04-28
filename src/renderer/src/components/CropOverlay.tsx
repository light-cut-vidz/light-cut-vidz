import React, { useRef, useState, useEffect, useCallback } from 'react'
import type { CropRect } from '../App'
import { useT } from '../i18n'
import './CropOverlay.css'

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>
  crop: CropRect | null
  onChange: (crop: CropRect) => void
  onApply: () => void
}

type Handle = 'tl' | 'tr' | 'bl' | 'br' | 'move'

export default function CropOverlay({ videoRef, crop, onChange, onApply }: Props) {
  const { t } = useT()
  const overlayRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ handle: Handle; startX: number; startY: number; initCrop: CropRect } | null>(null)
  const [videoNatural, setVideoNatural] = useState({ w: 1, h: 1 })
  const [displayRect, setDisplayRect] = useState({ x: 0, y: 0, w: 0, h: 0, scale: 1 })

  const [rect, setRect] = useState<CropRect>(
    crop ?? { x: 0, y: 0, w: 100, h: 100 }
  )

  // Enter key applies
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') onApply() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onApply])

  const updateDisplay = useCallback(() => {
    const video = videoRef.current
    const overlay = overlayRef.current
    if (!video || !overlay) return
    const vr = video.getBoundingClientRect()
    const or = overlay.getBoundingClientRect()
    const scale = vr.width / (video.videoWidth || vr.width)
    setDisplayRect({ x: vr.left - or.left, y: vr.top - or.top, w: vr.width, h: vr.height, scale })
    setVideoNatural({ w: video.videoWidth || vr.width, h: video.videoHeight || vr.height })
  }, [videoRef])

  useEffect(() => {
    updateDisplay()
    window.addEventListener('resize', updateDisplay)
    return () => window.removeEventListener('resize', updateDisplay)
  }, [updateDisplay])

  // Init full frame if no crop
  useEffect(() => {
    if (!crop && videoNatural.w > 1) {
      const full = { x: 0, y: 0, w: videoNatural.w, h: videoNatural.h }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRect(full)
      onChange(full)
    }
  }, [videoNatural]) // eslint-disable-line react-hooks/exhaustive-deps

  const toD = (r: CropRect) => ({
    x: displayRect.x + r.x * displayRect.scale,
    y: displayRect.y + r.y * displayRect.scale,
    w: r.w * displayRect.scale,
    h: r.h * displayRect.scale,
  })

  const onPointerDown = useCallback((e: React.PointerEvent, handle: Handle) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { handle, startX: e.clientX, startY: e.clientY, initCrop: { ...rect } }
  }, [rect])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const { handle, startX, startY, initCrop } = dragRef.current
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    const sc = displayRect.scale
    const min = 20
    let nx = initCrop.x, ny = initCrop.y, nw = initCrop.w, nh = initCrop.h

    if (handle === 'move') {
      nx = Math.max(0, Math.min(videoNatural.w - nw, initCrop.x + dx / sc))
      ny = Math.max(0, Math.min(videoNatural.h - nh, initCrop.y + dy / sc))
    } else {
      if (handle === 'tl' || handle === 'bl') {
        nx = Math.max(0, Math.min(initCrop.x + initCrop.w - min, initCrop.x + dx / sc))
        nw = initCrop.w - (nx - initCrop.x)
      }
      if (handle === 'tr' || handle === 'br') {
        nw = Math.max(min, Math.min(videoNatural.w - initCrop.x, initCrop.w + dx / sc))
      }
      if (handle === 'tl' || handle === 'tr') {
        ny = Math.max(0, Math.min(initCrop.y + initCrop.h - min, initCrop.y + dy / sc))
        nh = initCrop.h - (ny - initCrop.y)
      }
      if (handle === 'bl' || handle === 'br') {
        nh = Math.max(min, Math.min(videoNatural.h - initCrop.y, initCrop.h + dy / sc))
      }
    }

    const updated = { x: Math.round(nx), y: Math.round(ny), w: Math.round(nw), h: Math.round(nh) }
    setRect(updated)
    onChange(updated)
  }, [displayRect, videoNatural, onChange])

  const onPointerUp = useCallback(() => { dragRef.current = null }, [])

  const d = toD(rect)

  return (
    <div
      ref={overlayRef}
      className="crop-overlay"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Dark areas outside selection */}
      <div className="crop-shade" style={{ top: 0, left: 0, right: 0, height: d.y }} />
      <div className="crop-shade" style={{ top: d.y + d.h, left: 0, right: 0, bottom: 0 }} />
      <div className="crop-shade" style={{ top: d.y, left: 0, width: d.x, height: d.h }} />
      <div className="crop-shade" style={{ top: d.y, left: d.x + d.w, right: 0, height: d.h }} />

      {/* Selection box */}
      <div
        className="crop-box"
        style={{ left: d.x, top: d.y, width: d.w, height: d.h }}
        onPointerDown={(e) => onPointerDown(e, 'move')}
      >
        <div className="crop-grid" />
        {(['tl', 'tr', 'bl', 'br'] as Handle[]).map(h => (
          <div key={h} className={`crop-handle crop-handle-${h}`} onPointerDown={(e) => onPointerDown(e, h)} />
        ))}
        <div className="crop-dimensions">{rect.w} × {rect.h}</div>
      </div>

      {/* Apply button above selection */}
      <button
        className="crop-apply-btn"
        style={{ left: d.x + d.w / 2, top: Math.max(8, d.y - 44) }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onApply}
      >
        {t.crop_apply}  <kbd>Enter</kbd>
      </button>
    </div>
  )
}
