import React, { useRef, useCallback, useState, useLayoutEffect } from 'react'
import type { TrimSegment } from '../App'
import { formatTime, parseTimeInput } from '../utils/time'
import { mergeSegments } from '../utils/timeline'
import { useT } from '../i18n'
import FilmStrip from './FilmStrip'
import CutEditor from './CutEditor'
import './Timeline.css'

interface Props {
  duration: number
  currentTime: number
  cutSegments: TrimSegment[]
  videoUrl: string
  onSeek: (time: number) => void
  onCutSegmentsChange: (segs: TrimSegment[]) => void
}

type DragMode =
  | { type: 'none' }
  | { type: 'new-cut'; startTime: number }
  | { type: 'move-cut'; id: string; offsetStart: number; offsetEnd: number }
  | { type: 'resize-cut'; id: string; edge: 'left' | 'right' }

const MIN_CUT = 0.05

export default function Timeline({
  duration, currentTime, cutSegments,
  videoUrl, onSeek, onCutSegmentsChange,
}: Props) {
  const { t } = useT()
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragMode>({ type: 'none' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [trackWidth, setTrackWidth] = useState(0)

  // Track width for filmstrip
  useLayoutEffect(() => {
    const el = trackRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setTrackWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const selectedSeg = cutSegments.find(s => s.id === selectedId) ?? null

  const timeToPercent = useCallback((t: number) => (duration > 0 ? (t / duration) * 100 : 0), [duration])
  const xToTime = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || duration <= 0) return 0
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration))
  }, [duration])

  // ─── Pointer down ──────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!trackRef.current || duration <= 0) return
    e.currentTarget.setPointerCapture(e.pointerId)

    const time = xToTime(e.clientX)
    const rect = trackRef.current.getBoundingClientRect()
    const handlePx = 8

    for (const seg of cutSegments) {
      const leftPx  = rect.left + (seg.start / duration) * rect.width
      const rightPx = rect.left + (seg.end   / duration) * rect.width

      if (Math.abs(e.clientX - leftPx) < handlePx) {
        dragRef.current = { type: 'resize-cut', id: seg.id, edge: 'left' }
        setSelectedId(seg.id)
        return
      }
      if (Math.abs(e.clientX - rightPx) < handlePx) {
        dragRef.current = { type: 'resize-cut', id: seg.id, edge: 'right' }
        setSelectedId(seg.id)
        return
      }
      if (e.clientX > leftPx + handlePx && e.clientX < rightPx - handlePx) {
        dragRef.current = { type: 'move-cut', id: seg.id, offsetStart: time - seg.start, offsetEnd: seg.end - time }
        setSelectedId(seg.id)
        return
      }
    }

    dragRef.current = { type: 'new-cut', startTime: time }
    setSelectedId(null)
  }, [cutSegments, duration, xToTime])

  // ─── Pointer move ──────────────────────────────────────────────────────────
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current
    const time = xToTime(e.clientX)

    if (drag.type === 'move-cut') {
      const seg = cutSegments.find(s => s.id === drag.id)
      if (!seg) return
      const dur = seg.end - seg.start
      let newStart = Math.max(0, time - drag.offsetStart)
      let newEnd = newStart + dur
      if (newEnd > duration) { newEnd = duration; newStart = duration - dur }
      onCutSegmentsChange(cutSegments.map(s => s.id === drag.id ? { ...s, start: newStart, end: newEnd } : s))
    } else if (drag.type === 'resize-cut') {
      const seg = cutSegments.find(s => s.id === drag.id)
      if (!seg) return
      if (drag.edge === 'left') {
        const newStart = Math.max(0, Math.min(seg.end - MIN_CUT, time))
        onCutSegmentsChange(cutSegments.map(s => s.id === drag.id ? { ...s, start: newStart } : s))
      } else {
        const newEnd = Math.min(duration, Math.max(seg.start + MIN_CUT, time))
        onCutSegmentsChange(cutSegments.map(s => s.id === drag.id ? { ...s, end: newEnd } : s))
      }
    }
  }, [cutSegments, duration, xToTime, onCutSegmentsChange])

  // ─── Pointer up ────────────────────────────────────────────────────────────
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current
    dragRef.current = { type: 'none' }

    if (drag.type === 'new-cut') {
      const time = xToTime(e.clientX)
      const start = Math.min(drag.startTime, time)
      const end   = Math.max(drag.startTime, time)
      if (end - start > MIN_CUT) {
        const id = `cut-${Date.now()}`
        const merged = mergeSegments([...cutSegments, { id, start, end }])
        onCutSegmentsChange(merged)
        setSelectedId(id)
      } else {
        onSeek(drag.startTime)
      }
    }
  }, [cutSegments, xToTime, onSeek, onCutSegmentsChange])

  const deleteCut = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onCutSegmentsChange(cutSegments.filter(s => s.id !== id))
    if (selectedId === id) setSelectedId(null)
  }, [cutSegments, selectedId, onCutSegmentsChange])

  // ─── Time input handlers ───────────────────────────────────────────────────
  const handleTimeInput = useCallback((id: string, edge: 'start' | 'end', raw: string) => {
    const parsed = parseTimeInput(raw)
    if (parsed === null) return
    const seg = cutSegments.find(s => s.id === id)
    if (!seg) return

    let updated: TrimSegment
    if (edge === 'start') {
      const newStart = Math.max(0, Math.min(seg.end - MIN_CUT, parsed))
      updated = { ...seg, start: newStart }
    } else {
      const newEnd = Math.min(duration, Math.max(seg.start + MIN_CUT, parsed))
      updated = { ...seg, end: newEnd }
    }
    onCutSegmentsChange(cutSegments.map(s => s.id === id ? updated : s))
  }, [cutSegments, duration, onCutSegmentsChange])

  const playheadPct = timeToPercent(currentTime)

  return (
    <div className="timeline">
      {/* Header */}
      <div className="tl-header">
        <span className="tl-label">{t.tl_trim}</span>
        {cutSegments.length > 0 && (
          <span className="tl-cut-count">{t.tl_cuts(cutSegments.length)}</span>
        )}
        {cutSegments.length > 0 && (
          <button className="tl-clear-btn" onClick={() => { onCutSegmentsChange([]); setSelectedId(null) }}>
            {t.tl_clear}
          </button>
        )}
        <span className="tl-hint">{t.tl_hint}</span>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="tl-track"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Ruler */}
        <TimeRuler duration={duration} />

        {/* Body */}
        <div className="tl-body">
          {/* Filmstrip */}
          <FilmStrip videoUrl={videoUrl} duration={duration} trackWidth={trackWidth} />

          {/* Darkening outside cuts (kept zones stay bright) */}
          <div className="tl-kept-mask" />

          {/* Cut segments */}
          {cutSegments.map(seg => (
            <div
              key={seg.id}
              className={`tl-cut ${selectedId === seg.id ? 'selected' : ''}`}
              style={{ left: `${timeToPercent(seg.start)}%`, width: `${timeToPercent(seg.end - seg.start)}%` }}
              onClick={(e) => { e.stopPropagation(); setSelectedId(seg.id) }}
            >
              <div className="tl-cut-handle tl-cut-handle-left" title={t.cut_resize} />
              <div className="tl-cut-info">
                <span className="tl-cut-duration">{formatTime(seg.end - seg.start)}</span>
                <button
                  className="tl-cut-delete"
                  onPointerDown={e => e.stopPropagation()}
                  onClick={e => deleteCut(seg.id, e)}
                >×</button>
              </div>
              <div className="tl-cut-handle tl-cut-handle-right" title={t.cut_resize} />
            </div>
          ))}

          {/* Playhead */}
          <div className="tl-playhead" style={{ left: `${playheadPct}%` }}>
            <div className="tl-playhead-head" />
          </div>
        </div>
      </div>

      {/* Precise time editor — always rendered to avoid layout shift */}
      <CutEditor
        seg={selectedSeg}
        duration={duration}
        onTimeInput={handleTimeInput}
        onDelete={(id) => { onCutSegmentsChange(cutSegments.filter(s => s.id !== id)); setSelectedId(null) }}
        onSeek={onSeek}
      />
    </div>
  )
}

// ─── TimeRuler ────────────────────────────────────────────────────────────────

function TimeRuler({ duration }: { duration: number }) {
  if (duration <= 0) return <div className="tl-ruler" />
  const step = duration <= 30 ? 1 : duration <= 120 ? 5 : duration <= 600 ? 15 : 60
  const ticks: { t: number; major: boolean }[] = []
  for (let t = 0; t <= duration; t += step) {
    ticks.push({ t, major: t % (step * 5) === 0 || step >= 15 })
  }
  return (
    <div className="tl-ruler">
      {ticks.map(({ t, major }) => (
        <div key={t} className={`tl-tick ${major ? 'major' : 'minor'}`} style={{ left: `${(t / duration) * 100}%` }}>
          {major && <span className="tl-tick-label">{formatTime(t)}</span>}
        </div>
      ))}
    </div>
  )
}

