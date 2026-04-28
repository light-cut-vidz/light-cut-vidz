import React, { useEffect, useRef } from 'react'
import './VideoPlayer.css'

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>
  src: string
  speed: number
  muted: boolean
  onTimeUpdate: (time: number) => void
  onDurationLoaded: (duration: number) => void
  onPlayPause: (playing: boolean) => void
}

export default function VideoPlayer({ videoRef, src, speed, muted, onTimeUpdate, onDurationLoaded, onPlayPause }: Props) {
  const prevSrc = useRef<string | null>(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed
  }, [speed, videoRef])

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted
  }, [muted, videoRef])

  useEffect(() => {
    if (src !== prevSrc.current && videoRef.current) {
      prevSrc.current = src
      videoRef.current.load()
    }
  }, [src, videoRef])

  return (
    <video
      ref={videoRef}
      className="video-element"
      src={src}
      onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
      onLoadedMetadata={(e) => onDurationLoaded(e.currentTarget.duration)}
      onPlay={() => onPlayPause(true)}
      onPause={() => onPlayPause(false)}
      onEnded={() => onPlayPause(false)}
      onClick={(e) => {
        const v = e.currentTarget
        if (v.paused || v.ended) { void v.play() } else { v.pause() }
      }}
    />
  )
}
