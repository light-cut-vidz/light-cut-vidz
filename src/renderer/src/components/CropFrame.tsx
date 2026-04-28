import React, { useEffect, useState, useCallback } from 'react'
import type { CropRect } from '../App'

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>
  crop: CropRect
}

interface DisplayPos { x: number; y: number; w: number; h: number }

export default function CropFrame({ videoRef, crop }: Props) {
  const [pos, setPos] = useState<DisplayPos | null>(null)

  const compute = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const vr = video.getBoundingClientRect()
    const pw = video.parentElement?.getBoundingClientRect()
    if (!pw) return
    const scale = vr.width / video.videoWidth
    setPos({
      x: (vr.left - pw.left) + crop.x * scale,
      y: (vr.top  - pw.top)  + crop.y * scale,
      w: crop.w * scale,
      h: crop.h * scale,
    })
  }, [videoRef, crop])

  useEffect(() => {
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [compute])

  if (!pos) return null

  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: pos.w,
        height: pos.h,
        border: '2px solid #e53e3e',
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)',
        pointerEvents: 'none',
        zIndex: 5,
        boxSizing: 'border-box',
      }}
    />
  )
}
