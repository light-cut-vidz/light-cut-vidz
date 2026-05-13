import React, { useEffect, useRef, useState } from 'react'
import './FilmStrip.css'

interface Props {
  videoUrl: string
  duration: number
  trackWidth: number
}

const THUMB_W = 80
const THUMB_H = 45

export default function FilmStrip({ videoUrl, duration, trackWidth }: Props) {
  const [thumbs, setThumbs] = useState<string[]>([])
  const abortRef = useRef(false)

  useEffect(() => {
    if (!videoUrl || duration <= 0 || trackWidth <= 0) return
    abortRef.current = false

    const count = Math.max(4, Math.ceil(trackWidth / THUMB_W))
    const video = document.createElement('video')
    video.src = videoUrl
    video.muted = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'

    const canvas = document.createElement('canvas')
    canvas.width = THUMB_W
    canvas.height = THUMB_H
    const ctx = canvas.getContext('2d')!

    const captured: string[] = []
    let index = 0

    const captureFrame = () => {
      if (abortRef.current) return
      ctx.drawImage(video, 0, 0, THUMB_W, THUMB_H)
      captured.push(canvas.toDataURL('image/jpeg', 0.6))
      setThumbs([...captured])
      index++
      if (index < count) {
        video.currentTime = (index / (count - 1)) * duration
      }
    }

    video.addEventListener('seeked', captureFrame)
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = 0
    })

    return () => {
      abortRef.current = true
      video.src = ''
    }
  }, [videoUrl, duration, trackWidth])

  if (thumbs.length === 0) return <div className="filmstrip filmstrip-empty" />

  return (
    <div className="filmstrip">
      {thumbs.map((src, i) => (
        <img key={i} src={src} className="filmstrip-thumb" draggable={false} />
      ))}
    </div>
  )
}
