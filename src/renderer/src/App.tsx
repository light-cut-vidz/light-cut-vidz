import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import DropZone from './components/DropZone'
import VideoPlayer from './components/VideoPlayer'
import Timeline from './components/Timeline'
import Toolbar from './components/Toolbar'
import ExportModal from './components/ExportModal'
import CropOverlay from './components/CropOverlay'
import CropFrame from './components/CropFrame'
import VideoControls from './components/VideoControls'
import Toast from './components/Toast'
import { useEditorHistory } from './hooks/useHistory'
import { getKeptSegments, getVirtualDuration, realToVirtual, virtualToReal } from './utils/time'
import { useT } from './i18n'
import './styles/App.css'

export interface TrimSegment {
  id: string
  start: number
  end: number
}

export interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

export interface EditorState {
  videoPath: string | null
  videoUrl: string | null
  duration: number
  speed: number
  muted: boolean
  cutSegments: TrimSegment[]
  crop: CropRect | null
}

const isMac = navigator.platform.includes('Mac')

export default function App() {
  const { t } = useT()
  const fullscreenHint = isMac ? t.fullscreen_hint_mac : t.fullscreen_hint_linux
  const [videoPath, setVideoPath] = useState<string | null>(null)
  const [videoUrl,  setVideoUrl]  = useState<string | null>(null)
  const [duration,  setDuration]  = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [showExport,  setShowExport]  = useState(false)
  const [showCrop,    setShowCrop]    = useState(false)
  const [loading, setLoading] = useState<{ msg: string; progress: number } | null>(null)
  const [toast,   setToast]   = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // All editable properties share one undo/redo history
  const { editable, set, undo, redo, reset, canUndo, canRedo } = useEditorHistory()

  // Convenience setters — each one is undoable
  const setSpeed       = (speed: number)              => set(p => ({ ...p, speed }))
  const setMuted       = (muted: boolean)              => set(p => ({ ...p, muted }))
  const setCrop        = (crop: CropRect | null)       => set(p => ({ ...p, crop }))
  const setCutSegments = (cutSegments: TrimSegment[])  => set(p => ({ ...p, cutSegments }))

  // ─── Load video ────────────────────────────────────────────────────────────
  const loadVideo = useCallback(async (filePath: string) => {
    setLoading({ msg: t.loading_preparing, progress: 0 })
    setIsPlaying(false)
    setShowCrop(false)
    reset()

    try {
      const off = window.electronAPI.onPreviewProgress((p) =>
        setLoading({ msg: 'Preparing video…', progress: p })
      )
      const previewPath = await window.electronAPI.previewVideo(filePath)
      off()
      setVideoPath(filePath)
      setVideoUrl(`file://${previewPath}`)
      setDuration(0)
      setCurrentTime(0)
    } catch (err) {
      console.error('Preview transcode failed:', err)
      setVideoPath(filePath)
      setVideoUrl(`file://${filePath}`)
      setDuration(0)
      setCurrentTime(0)
    } finally {
      setLoading(null)
    }
  }, [t, reset])

  const handleOpenVideo = useCallback(async () => {
    const filePath = await window.electronAPI.openVideo()
    if (filePath) loadVideo(filePath)
  }, [loadVideo])

  // ─── Menu events ───────────────────────────────────────────────────────────
  useEffect(() => {
    const offs = [
      window.electronAPI.onMenuOpenVideo((fp) => loadVideo(fp)),
      window.electronAPI.onMenuUndo(undo),
      window.electronAPI.onMenuRedo(redo),
      window.electronAPI.onFullscreenEntered(() => setToast(fullscreenHint)),
    ]
    return () => offs.forEach(off => off())
  }, [loadVideo, undo, redo, fullscreenHint])

  // Sync undo/redo state to native menu
  useEffect(() => {
    window.electronAPI.setUndoRedoState(canUndo, canRedo)
  }, [canUndo, canRedo])

  // Kept segments = inverse of cuts. Recomputed whenever cuts or duration change.
  const keptSegments = useMemo(
    () => getKeptSegments(editable.cutSegments, duration),
    [editable.cutSegments, duration]
  )
  const virtualDuration = useMemo(() => getVirtualDuration(keptSegments), [keptSegments])
  const virtualCurrentTime = useMemo(() => realToVirtual(currentTime, keptSegments), [currentTime, keptSegments])

  // Seek in real-time space (used by Timeline & CutEditor).
  const seek = useCallback((time: number) => {
    if (videoRef.current) videoRef.current.currentTime = time
  }, [])

  // Seek in virtual-time space (used by VideoControls seekbar).
  const seekVirtual = useCallback((virtualTime: number) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = virtualToReal(virtualTime, keptSegments)
  }, [keptSegments])

  // Skip over cut zones during playback and stop at end of last kept segment.
  const handleTimeUpdate = useCallback((realTime: number) => {
    setCurrentTime(realTime)
    const cuts = editable.cutSegments
    if (!cuts.length || !videoRef.current || videoRef.current.paused) return
    const video = videoRef.current
    for (const cut of cuts) {
      if (realTime >= cut.start && realTime < cut.end) {
        video.currentTime = cut.end
        return
      }
    }
    // Stop when we reach the end of the last kept segment (if a cut ends the video).
    const lastKept = keptSegments[keptSegments.length - 1]
    if (lastKept && realTime >= lastKept.end) {
      video.pause()
      video.currentTime = lastKept.end
    }
  }, [editable.cutSegments, keptSegments])

  const editorState: EditorState = {
    videoPath,
    videoUrl,
    duration,
    speed:       editable.speed,
    muted:       editable.muted,
    cutSegments: editable.cutSegments,
    crop:        editable.crop,
  }

  // ─── Loading screen ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-inner">
          <div className="loading-spinner" />
          <p className="loading-msg">{loading.msg}</p>
          {loading.progress > 0 && (
            <div className="loading-bar">
              <div className="loading-fill" style={{ width: `${loading.progress}%` }} />
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!videoPath) {
    return <DropZone onDrop={loadVideo} onOpen={handleOpenVideo} />
  }

  return (
    <div className="app-layout">
      {/* Top bar */}
      <div className="top-bar">
        <div className="app-title">LightCutVidz</div>
        <div className="top-bar-actions">
          <button className="btn-ghost btn-icon" onClick={undo} disabled={!canUndo} title={t.app_undo}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
            </svg>
          </button>
          <button className="btn-ghost btn-icon" onClick={redo} disabled={!canRedo} title={t.app_redo}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/>
            </svg>
          </button>
          <button className="btn-ghost" onClick={handleOpenVideo}>{t.app_open_video}</button>
          <button className="btn-primary" onClick={() => setShowExport(true)}>{t.app_export}</button>
        </div>
      </div>

      {/* Main area */}
      <div className="main-area">
        <div className="video-wrapper">
          <VideoPlayer
            videoRef={videoRef}
            src={videoUrl!}
            speed={editable.speed}
            muted={editable.muted}
            onTimeUpdate={handleTimeUpdate}
            onDurationLoaded={setDuration}
            onPlayPause={setIsPlaying}
          />
          {showCrop && (
            <CropOverlay
              videoRef={videoRef}
              crop={editable.crop}
              onChange={setCrop}
              onApply={() => setShowCrop(false)}
            />
          )}
          {!showCrop && editable.crop && (
            <CropFrame videoRef={videoRef} crop={editable.crop} />
          )}
        </div>

        <Toolbar
          state={editorState}
          showCrop={showCrop}
          onSpeedChange={setSpeed}
          onMuteToggle={() => setMuted(!editable.muted)}
          onCropToggle={() => setShowCrop(v => !v)}
          onCropReset={() => { setCrop(null); setShowCrop(false) }}
        />
      </div>

      {/* Seekbar + play/pause — uses virtual time to reflect trim */}
      <VideoControls
        currentTime={virtualCurrentTime}
        duration={virtualDuration}
        isPlaying={isPlaying}
        onPlayPause={() => {
          const video = videoRef.current
          if (!video) return
          if (isPlaying) {
            video.pause()
          } else {
            if (video.ended) video.currentTime = keptSegments[0]?.start ?? 0
            void video.play()
          }
        }}
        onSeek={seekVirtual}
      />

      {/* Trim timeline */}
      <div className="timeline-section">
        <Timeline
          duration={duration}
          currentTime={currentTime}
          cutSegments={editable.cutSegments}
          videoUrl={videoUrl!}
          onSeek={seek}
          onCutSegmentsChange={setCutSegments}
        />
      </div>

      {showExport && (
        <ExportModal
          state={editorState}
          onClose={() => setShowExport(false)}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  )
}
