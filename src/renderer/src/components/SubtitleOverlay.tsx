import React, { useEffect, useState, useCallback } from 'react'
import type { SubtitlesState } from '../App'
import { getActiveCue, getWordWindows, getActiveWordIndex, getActiveCharCount, RAINBOW_PALETTE } from '../utils/subtitles'
import './SubtitleOverlay.css'

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>
  subtitles: SubtitlesState | null
  currentTime: number
}

interface DisplayRect { left: number; top: number; width: number; height: number }

const POSITION_JUSTIFY: Record<string, string> = {
  top: 'flex-start',
  middle: 'center',
  bottom: 'flex-end',
}

function renderMultiline(text: string) {
  return text.split('\n').map((line, i) => (
    <React.Fragment key={i}>
      {i > 0 && <br />}
      {line}
    </React.Fragment>
  ))
}

export default function SubtitleOverlay({ videoRef, subtitles, currentTime }: Props) {
  const [rect, setRect] = useState<DisplayRect | null>(null)

  const compute = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const vr = video.getBoundingClientRect()
    const pw = video.parentElement?.getBoundingClientRect()
    if (!pw) return
    setRect({ left: vr.left - pw.left, top: vr.top - pw.top, width: vr.width, height: vr.height })
  }, [videoRef])

  useEffect(() => {
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [compute, subtitles])

  if (!subtitles || !rect) return null

  const cue = getActiveCue(subtitles.cues, currentTime)
  if (!cue) return null

  const { style, animation } = subtitles
  const fontSize = (style.fontSize / 100) * rect.height
  const marginV = rect.height * 0.06

  const textStyle: React.CSSProperties = {
    fontFamily: style.fontFamily,
    fontSize: `${fontSize}px`,
    color: style.color,
    fontWeight: 700,
    WebkitTextStrokeWidth: style.outlineWidth,
    WebkitTextStrokeColor: style.outlineColor,
    paintOrder: 'stroke fill',
    backgroundColor: style.backgroundOpacity > 0 ? hexToRgba(style.backgroundColor, style.backgroundOpacity) : 'transparent',
    padding: style.backgroundOpacity > 0 ? '0.2em 0.5em' : 0,
    borderRadius: style.backgroundOpacity > 0 ? '0.2em' : 0,
  }

  let content: React.ReactNode = null

  if (animation === 'word-pop') {
    const idx = getActiveWordIndex(cue, currentTime)
    const words = getWordWindows(cue)
    const word = words[idx]?.text
    if (word) {
      content = (
        <span key={`${cue.id}-${idx}`} className="sub-word-pop" style={textStyle}>{word}</span>
      )
    }
  } else if (animation === 'word-bounce') {
    const idx = getActiveWordIndex(cue, currentTime)
    const words = getWordWindows(cue)
    const word = words[idx]?.text
    if (word) {
      content = (
        <span key={`${cue.id}-${idx}`} className="sub-word-bounce" style={textStyle}>{word}</span>
      )
    }
  } else if (animation === 'rainbow') {
    const words = getWordWindows(cue)
    content = (
      <span key={cue.id} className="sub-sentence-fade" style={textStyle}>
        {words.map((w, i) => (
          <span key={i} style={{ color: RAINBOW_PALETTE[i % RAINBOW_PALETTE.length] }}>
            {w.text}{i < words.length - 1 ? ' ' : ''}
          </span>
        ))}
      </span>
    )
  } else if (animation === 'typewriter') {
    const count = getActiveCharCount(cue, currentTime)
    const text = Array.from(cue.text).slice(0, count).join('')
    content = <span className="sub-typewriter" style={textStyle}>{renderMultiline(text)}</span>
  } else if (animation === 'word-highlight') {
    const words = getWordWindows(cue)
    const idx = getActiveWordIndex(cue, currentTime)
    content = (
      <span className="sub-highlight-line" style={textStyle}>
        {words.map((w, i) => (
          <span key={i} style={i === idx ? { color: style.accentColor } : undefined}>
            {w.text}{i < words.length - 1 ? ' ' : ''}
          </span>
        ))}
      </span>
    )
  } else if (animation === 'sentence-slide') {
    content = (
      <span key={cue.id} className="sub-sentence-slide" style={textStyle}>{renderMultiline(cue.text)}</span>
    )
  } else {
    // sentence-fade (default fallback)
    content = (
      <span key={cue.id} className="sub-sentence-fade" style={textStyle}>{renderMultiline(cue.text)}</span>
    )
  }

  return (
    <div
      className="subtitle-overlay"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        justifyContent: POSITION_JUSTIFY[style.position] || 'flex-end',
        padding: `${marginV}px 24px`,
      }}
    >
      {content}
    </div>
  )
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
