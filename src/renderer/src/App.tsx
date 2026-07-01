import React, { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from 'react'
import DropZone from './components/DropZone'
import VideoPlayer from './components/VideoPlayer'
import Timeline from './components/Timeline'
import Toolbar from './components/Toolbar'
import CompositionGrid from './components/CompositionGrid'
import CropFrame from './components/CropFrame'
import VideoControls from './components/VideoControls'
import Toast from './components/Toast'
import { UndoIcon, RedoIcon } from './components/icons'
import SubtitleOverlay from './components/SubtitleOverlay'
import { useEditorHistory } from './hooks/useHistory'
import { getKeptSegments, getVirtualDuration, realToVirtual, virtualToReal } from './utils/time'
import type { SubtitleCue } from './utils/srt'
import { useT } from './i18n'
import './styles/App.css'

const ExportModal = lazy(() => import('./components/ExportModal'))
const Filters = lazy(() => import('./components/Filters'))
const GeometrySettings = lazy(() => import('./components/GeometrySettings'))
const CropOverlay = lazy(() => import('./components/CropOverlay'))
const SubtitlesPanel = lazy(() => import('./components/SubtitlesPanel'))

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

export type SubtitleAnimation =
  | 'word-pop' | 'word-bounce' | 'word-highlight' | 'rainbow'
  | 'sentence-fade' | 'sentence-slide' | 'typewriter'

export interface SubtitleStyle {
  fontFamily: string
  fontSize: number // relative unit (~% of video height), consistent between CSS preview and ASS export
  color: string
  outlineColor: string
  outlineWidth: number
  backgroundColor: string
  backgroundOpacity: number // 0-1
  position: 'top' | 'middle' | 'bottom'
  accentColor: string // word-highlight active-word color
}

export interface SubtitlesState {
  fileName: string
  cues: SubtitleCue[]
  style: SubtitleStyle
  animation: SubtitleAnimation
}

// Trendy 2026 default: bold white captions, black outline, no box, word-by-word pop-in.
export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  fontFamily: 'Arial',
  fontSize: 5,
  color: '#ffffff',
  outlineColor: '#000000',
  outlineWidth: 2,
  backgroundColor: '#000000',
  backgroundOpacity: 0,
  position: 'bottom',
  accentColor: '#22d3ee',
}

export interface EditorState {
  videoPath: string | null
  videoUrl: string | null
  duration: number
  speed: number
  muted: boolean
  cutSegments: TrimSegment[]
  crop: CropRect | null
  filter: string
  rotation: number
  straighten: number
  perspectiveHorizontal: number
  perspectiveVertical: number
  subtitles: SubtitlesState | null
}

type ActivePanel = 'crop' | 'filters' | 'geometry' | 'subtitles' | null

const isMac = navigator.platform.includes('Mac')

export default function App() {
  const { t } = useT()
  const fullscreenHint = isMac ? t.fullscreen_hint_mac : t.fullscreen_hint_linux

  const [videoPath, setVideoPath] = useState<string | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
  const [filterFrameUrl, setFilterFrameUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState<{ msg: string; progress: number } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const { editable, set, undo, redo, reset, canUndo, canRedo } = useEditorHistory()

  const showCrop = activePanel === 'crop'
  const showFilters = activePanel === 'filters'
  const showGeometry = activePanel === 'geometry'
  const showSubtitles = activePanel === 'subtitles'

  const captureFrame = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    setFilterFrameUrl(canvas.toDataURL('image/jpeg', 0.8))
  }, [])

  // Stable, undoable setters — each one snapshots the previous state onto the history stack
  const setSpeed = useCallback((speed: number) => set(p => ({ ...p, speed })), [set])
  const toggleMuted = useCallback(() => set(p => ({ ...p, muted: !p.muted })), [set])
  const setCrop = useCallback((crop: CropRect | null) => set(p => ({ ...p, crop })), [set])
  const setCutSegments = useCallback((cutSegments: TrimSegment[]) => set(p => ({ ...p, cutSegments })), [set])
  const setFilter = useCallback((filter: string) => set(p => ({ ...p, filter })), [set])
  const setRotation = useCallback((rotation: number) => set(p => ({ ...p, rotation })), [set])
  const setStraighten = useCallback((val: number) => set(p => ({ ...p, straighten: val })), [set])
  const setPerspectiveH = useCallback((val: number) => set(p => ({ ...p, perspectiveHorizontal: val })), [set])
  const setPerspectiveV = useCallback((val: number) => set(p => ({ ...p, perspectiveVertical: val })), [set])
  const resetGeometry = useCallback(() => set(p => ({
    ...p, rotation: 0, straighten: 0, perspectiveHorizontal: 0, perspectiveVertical: 0,
  })), [set])
  const setSubtitlesStyle = useCallback((style: SubtitleStyle) => set(p => (
    p.subtitles ? { ...p, subtitles: { ...p.subtitles, style } } : p
  )), [set])
  const setSubtitlesAnimation = useCallback((animation: SubtitleAnimation) => set(p => (
    p.subtitles ? { ...p, subtitles: { ...p.subtitles, animation } } : p
  )), [set])
  const setSubtitles = useCallback((fileName: string, cues: SubtitleCue[]) => set(p => ({
    ...p, subtitles: { fileName, cues, style: DEFAULT_SUBTITLE_STYLE, animation: 'word-pop' },
  })), [set])
  const removeSubtitles = useCallback(() => set(p => ({ ...p, subtitles: null })), [set])

  // Panel toggles — switching panels is a single state update
  const onCropToggle = useCallback(() => setActivePanel(p => p === 'crop' ? null : 'crop'), [])
  const onCropReset = useCallback(() => { setCrop(null); setActivePanel(p => p === 'crop' ? null : p) }, [setCrop])
  const onFilterToggle = useCallback(() => {
    setActivePanel(p => {
      if (p === 'filters') return null
      captureFrame()
      return 'filters'
    })
  }, [captureFrame])
  const onGeometryToggle = useCallback(() => setActivePanel(p => p === 'geometry' ? null : 'geometry'), [])
  const onSubtitlesToggle = useCallback(() => setActivePanel(p => p === 'subtitles' ? null : 'subtitles'), [])

  // ─── Load video ────────────────────────────────────────────────────────────
  const loadVideo = useCallback(async (filePath: string) => {
    setLoading({ msg: t.loading_preparing, progress: 0 })
    setIsPlaying(false)
    setActivePanel(null)
    reset()

    try {
      const off = window.electronAPI.onPreviewProgress((p) =>
        setLoading({ msg: t.loading_preparing, progress: p }),
      )
      const previewPath = await window.electronAPI.previewVideo(filePath)
      off()
      setVideoPath(filePath)
      setVideoUrl(`file://${previewPath}`)
    } catch (err) {
      console.error('Preview transcode failed:', err)
      setVideoPath(filePath)
      setVideoUrl(`file://${filePath}`)
    } finally {
      setDuration(0)
      setCurrentTime(0)
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

  useEffect(() => {
    window.electronAPI.setUndoRedoState(canUndo, canRedo)
  }, [canUndo, canRedo])

  // Kept segments = inverse of cuts.
  const keptSegments = useMemo(
    () => getKeptSegments(editable.cutSegments, duration),
    [editable.cutSegments, duration],
  )
  const virtualDuration = useMemo(() => getVirtualDuration(keptSegments), [keptSegments])
  const virtualCurrentTime = useMemo(
    () => realToVirtual(currentTime, keptSegments),
    [currentTime, keptSegments],
  )

  // Real-time space — used by Timeline & CutEditor.
  const seek = useCallback((time: number) => {
    if (videoRef.current) videoRef.current.currentTime = time
  }, [])

  // Virtual-time space — used by VideoControls seekbar.
  const seekVirtual = useCallback((virtualTime: number) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = virtualToReal(virtualTime, keptSegments)
  }, [keptSegments])

  // Skip cut zones during playback; stop at the end of the last kept segment.
  const handleTimeUpdate = useCallback((realTime: number) => {
    setCurrentTime(realTime)
    const cuts = editable.cutSegments
    const video = videoRef.current
    if (!cuts.length || !video || video.paused) return
    for (const cut of cuts) {
      if (realTime >= cut.start && realTime < cut.end) {
        video.currentTime = cut.end
        return
      }
    }
    const lastKept = keptSegments[keptSegments.length - 1]
    if (lastKept && realTime >= lastKept.end) {
      video.pause()
      video.currentTime = lastKept.end
    }
  }, [editable.cutSegments, keptSegments])

  const handlePlayPause = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
    } else {
      if (video.ended) video.currentTime = keptSegments[0]?.start ?? 0
      void video.play()
    }
  }, [isPlaying, keptSegments])

  const openExport = useCallback(() => setShowExport(true), [])
  const closeExport = useCallback(() => setShowExport(false), [])
  const onApplyCrop = useCallback(() => setActivePanel(null), [])
  const onToastDone = useCallback(() => setToast(null), [])

  const editorState = useMemo<EditorState>(() => ({
    videoPath,
    videoUrl,
    duration,
    speed: editable.speed,
    muted: editable.muted,
    cutSegments: editable.cutSegments,
    crop: editable.crop,
    filter: editable.filter,
    rotation: editable.rotation,
    straighten: editable.straighten,
    perspectiveHorizontal: editable.perspectiveHorizontal,
    perspectiveVertical: editable.perspectiveVertical,
    subtitles: editable.subtitles,
  }), [videoPath, videoUrl, duration, editable])

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
      <div className="top-bar">
        <div className="app-title">LightCutVidz</div>
        <div className="top-bar-actions">
          <button className="btn-ghost btn-icon" onClick={undo} disabled={!canUndo} title={t.app_undo}>
            <UndoIcon />
          </button>
          <button className="btn-ghost btn-icon" onClick={redo} disabled={!canRedo} title={t.app_redo}>
            <RedoIcon />
          </button>
          <button className="btn-ghost" onClick={handleOpenVideo}>{t.app_open_video}</button>
          <button className="btn-primary" onClick={openExport}>{t.app_export}</button>
        </div>
      </div>

      <div className="main-area">
        <div className="video-wrapper">
          <VideoPlayer
            videoRef={videoRef}
            src={videoUrl!}
            speed={editable.speed}
            muted={editable.muted}
            filterId={editable.filter}
            rotation={editable.rotation}
            straighten={editable.straighten}
            perspectiveH={editable.perspectiveHorizontal}
            perspectiveV={editable.perspectiveVertical}
            onTimeUpdate={handleTimeUpdate}
            onDurationLoaded={setDuration}
            onPlayPause={setIsPlaying}
          />
          <SubtitleOverlay videoRef={videoRef} subtitles={editable.subtitles} currentTime={currentTime} />
          <CompositionGrid visible={showCrop || showGeometry} />
          {showCrop && (
            <Suspense fallback={null}>
              <CropOverlay
                videoRef={videoRef}
                crop={editable.crop}
                onChange={setCrop}
                onApply={onApplyCrop}
              />
            </Suspense>
          )}
          {!showCrop && editable.crop && (
            <CropFrame videoRef={videoRef} crop={editable.crop} />
          )}
        </div>

        <Toolbar
          state={editorState}
          showCrop={showCrop}
          showFilters={showFilters}
          showGeometry={showGeometry}
          showSubtitles={showSubtitles}
          onSpeedChange={setSpeed}
          onMuteToggle={toggleMuted}
          onCropToggle={onCropToggle}
          onCropReset={onCropReset}
          onFilterToggle={onFilterToggle}
          onGeometryToggle={onGeometryToggle}
          onSubtitlesToggle={onSubtitlesToggle}
        />

        {showFilters && (
          <Suspense fallback={null}>
            <Filters
              activeFilterId={editable.filter}
              onSelect={setFilter}
              frameDataUrl={filterFrameUrl ?? undefined}
            />
          </Suspense>
        )}

        {showGeometry && (
          <Suspense fallback={null}>
            <GeometrySettings
              rotation={editable.rotation}
              straighten={editable.straighten}
              perspectiveH={editable.perspectiveHorizontal}
              perspectiveV={editable.perspectiveVertical}
              onRotationChange={setRotation}
              onStraightenChange={setStraighten}
              onPerspectiveHChange={setPerspectiveH}
              onPerspectiveVChange={setPerspectiveV}
              onReset={resetGeometry}
            />
          </Suspense>
        )}

        {showSubtitles && (
          <Suspense fallback={null}>
            <SubtitlesPanel
              subtitles={editable.subtitles}
              onImport={setSubtitles}
              onStyleChange={setSubtitlesStyle}
              onAnimationChange={setSubtitlesAnimation}
              onRemove={removeSubtitles}
            />
          </Suspense>
        )}
      </div>

      <VideoControls
        currentTime={virtualCurrentTime}
        duration={virtualDuration}
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onSeek={seekVirtual}
      />

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
        <Suspense fallback={null}>
          <ExportModal state={editorState} onClose={closeExport} />
        </Suspense>
      )}

      {toast && <Toast message={toast} onDone={onToastDone} />}
    </div>
  )
}
