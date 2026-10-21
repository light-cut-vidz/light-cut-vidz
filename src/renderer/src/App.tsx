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
import FilterDefs from './components/FilterDefs'
import VignetteOverlay from './components/VignetteOverlay'
import { useEditorHistory } from './hooks/useHistory'
import { getKeptSegments, getVirtualDuration, realToVirtual, virtualToReal } from './utils/time'
import { isVideoFileName } from './utils/video'
import { toProject, fromProjectState } from './utils/project'
import type { RecentEntry } from './electron'
import type { EditableState, StabilizeLevel } from './hooks/useHistory'
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
  stabilize: StabilizeLevel
}

type ActivePanel = 'crop' | 'filters' | 'geometry' | 'subtitles' | null

// How far short of a requested time the player may land (about one frame).
const SEEK_LANDING_MARGIN = 0.05

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
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const { editable, set, setLive, endGesture, undo, redo, reset, canUndo, canRedo } = useEditorHistory()

  const showCrop = activePanel === 'crop'
  const showFilters = activePanel === 'filters'
  const showGeometry = activePanel === 'geometry'
  const showSubtitles = activePanel === 'subtitles'

  const captureFrame = useCallback(() => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    // The grid shows 20 thumbnails of this frame: a full-resolution 4K data URL
    // (several MB, encoded synchronously) buys nothing there.
    const scale = Math.min(1, 320 / video.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      setFilterFrameUrl(canvas.toDataURL('image/jpeg', 0.8))
    } catch (err) {
      // A tainted canvas must not take the panel down: the cards fall back to
      // their placeholder preview.
      console.error('Could not capture a frame for the filter previews:', err)
      setFilterFrameUrl(null)
    }
  }, [])

  // Stable, undoable setters — each one snapshots the previous state onto the history stack
  const setSpeed = useCallback((speed: number) => set(p => ({ ...p, speed })), [set])
  const toggleMuted = useCallback(() => set(p => ({ ...p, muted: !p.muted })), [set])
  const setCrop = useCallback((crop: CropRect | null) => set(p => ({ ...p, crop })), [set])
  const setCutSegments = useCallback((cutSegments: TrimSegment[]) => set(p => ({ ...p, cutSegments })), [set])
  const setStabilize = useCallback((stabilize: StabilizeLevel) => set(p => ({ ...p, stabilize })), [set])
  const setFilter = useCallback((filter: string) => set(p => ({ ...p, filter })), [set])
  const setRotation = useCallback((rotation: number) => set(p => ({ ...p, rotation })), [set])

  // Gesture-driven setters — a whole drag or slider scrub collapses into one
  // undo step, closed by onCommit (pointerup / keyup) below.
  const setSpeedLive = useCallback((speed: number) => setLive(p => ({ ...p, speed })), [setLive])
  const setCropLive = useCallback((crop: CropRect | null) => setLive(p => ({ ...p, crop })), [setLive])
  const setCutSegmentsLive = useCallback((cutSegments: TrimSegment[]) => setLive(p => ({ ...p, cutSegments })), [setLive])
  const setStraighten = useCallback((val: number) => setLive(p => ({ ...p, straighten: val })), [setLive])
  const setPerspectiveH = useCallback((val: number) => setLive(p => ({ ...p, perspectiveHorizontal: val })), [setLive])
  const setPerspectiveV = useCallback((val: number) => setLive(p => ({ ...p, perspectiveVertical: val })), [setLive])
  const resetGeometry = useCallback(() => set(p => ({
    ...p, rotation: 0, straighten: 0, perspectiveHorizontal: 0, perspectiveVertical: 0,
  })), [set])
  const setSubtitlesStyle = useCallback((style: SubtitleStyle) => set(p => (
    p.subtitles ? { ...p, subtitles: { ...p.subtitles, style } } : p
  )), [set])
  const setSubtitlesStyleLive = useCallback((style: SubtitleStyle) => setLive(p => (
    p.subtitles ? { ...p, subtitles: { ...p.subtitles, style } } : p
  )), [setLive])
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
    // Capturing is a side effect: it stays out of the state updater, which React
    // may run twice.
    if (activePanel !== 'filters') captureFrame()
    setActivePanel(p => p === 'filters' ? null : 'filters')
  }, [activePanel, captureFrame])
  const onGeometryToggle = useCallback(() => setActivePanel(p => p === 'geometry' ? null : 'geometry'), [])
  const onSubtitlesToggle = useCallback(() => setActivePanel(p => p === 'subtitles' ? null : 'subtitles'), [])

  // ─── Load video ────────────────────────────────────────────────────────────
  // Each load gets an id; only the latest may touch state, so two overlapping
  // loads (menu "Open" while one transcodes) cannot leave the player on one file
  // and the export on another.
  const loadId = useRef(0)
  const hasEdits = useRef(false)
  useEffect(() => { hasEdits.current = canUndo }, [canUndo])

  const loadVideo = useCallback(async (filePath: string, initial?: EditableState) => {
    if (hasEdits.current && !window.confirm(t.confirm_open_new)) return
    const id = ++loadId.current
    setLoading({ msg: t.loading_preparing, progress: 0 })

    // Registered outside the try so the failure path unregisters it too.
    const off = window.electronAPI.onPreviewProgress((p) => {
      if (id === loadId.current) setLoading({ msg: t.loading_preparing, progress: p })
    })
    let url: string | null = null
    try {
      url = await window.electronAPI.previewVideo(filePath)
    } catch (err) {
      if (id === loadId.current) {
        console.error('Preview transcode failed:', err)
        // Fall back to the source: it may still play natively.
        try { url = await window.electronAPI.toFileUrl(filePath) } catch { url = null }
      }
    }
    off()
    if (id !== loadId.current) return // superseded or cancelled

    if (!url) {
      setLoading(null)
      setToast(t.error_video_unreadable)
      return
    }
    setIsPlaying(false)
    setActivePanel(null)
    reset(initial)
    setVideoPath(filePath)
    setVideoUrl(url)
    setDuration(0)
    setCurrentTime(0)
    setLoading(null)
  }, [t, reset])

  const cancelLoad = useCallback(() => {
    loadId.current++
    void window.electronAPI.cancelFfmpeg()
    setLoading(null)
  }, [])

  const handleOpenVideo = useCallback(async () => {
    const filePath = await window.electronAPI.openVideo()
    if (filePath) loadVideo(filePath)
  }, [loadVideo])

  // With a text field focused, Cmd/Ctrl+Z belongs to the field, not to the
  // timeline's history (the menu accelerator would otherwise swallow it).
  const inTextField = () => {
    const el = document.activeElement as HTMLElement | null
    return !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['range', 'color', 'checkbox', 'radio', 'button'].includes((el as HTMLInputElement).type)))
  }
  const undoOrTextUndo = useCallback(() => { if (inTextField()) document.execCommand('undo'); else undo() }, [undo])
  const redoOrTextRedo = useCallback(() => { if (inTextField()) document.execCommand('redo'); else redo() }, [redo])

  // ─── Projects and unsaved edits ────────────────────────────────────────────
  const videoPathRef = useRef<string | null>(null)
  const editableRef = useRef(editable)
  useEffect(() => { videoPathRef.current = videoPath; editableRef.current = editable }, [videoPath, editable])

  const saveProject = useCallback(async () => {
    const path = videoPathRef.current
    if (!path) return
    try {
      const saved = await window.electronAPI.saveProject(toProject(path, editableRef.current))
      if (saved) setToast(t.project_saved)
    } catch (err) {
      console.error('Project save failed:', err)
      setToast(t.project_save_failed)
    }
  }, [t])

  // The main process asks before closing the window when this is true.
  useEffect(() => {
    window.electronAPI.setDirty(canUndo)
  }, [canUndo])

  // ─── Menu events ───────────────────────────────────────────────────────────
  useEffect(() => {
    const offs = [
      window.electronAPI.onMenuOpenVideo((fp) => loadVideo(fp)),
      window.electronAPI.onMenuUndo(undoOrTextUndo),
      window.electronAPI.onMenuRedo(redoOrTextRedo),
      window.electronAPI.onMenuSaveProject(() => { void saveProject() }),
      window.electronAPI.onMenuLoadProject((p) => { void loadVideo(p.videoPath, fromProjectState(p.state)) }),
      window.electronAPI.onFullscreenEntered(() => setToast(fullscreenHint)),
    ]
    return () => offs.forEach(off => off())
  }, [loadVideo, undoOrTextUndo, redoOrTextRedo, saveProject, fullscreenHint])

  useEffect(() => {
    window.electronAPI.setUndoRedoState(canUndo, canRedo)
  }, [canUndo, canRedo])

  // Dropping a file anywhere must never navigate the window to it (that would
  // wipe the editor). The drop zone handles its own; elsewhere we open it here.
  useEffect(() => {
    const onDragOver = (e: DragEvent) => e.preventDefault()
    const onDrop = (e: DragEvent) => {
      const handled = e.defaultPrevented
      e.preventDefault()
      if (handled) return
      const file = e.dataTransfer?.files[0]
      if (!file) return
      if (!isVideoFileName(file.name)) { setToast(t.error_not_video); return }
      const filePath = window.electronAPI.getPathForFile(file)
      if (filePath) void loadVideo(filePath)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [loadVideo, t])

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
  const skipCuts = useCallback((realTime: number) => {
    const cuts = editable.cutSegments
    const video = videoRef.current
    // A seek is already on its way: asking again restarts it.
    if (!cuts.length || !video || video.paused || video.seeking) return
    for (const cut of cuts) {
      // Seeking to `cut.end` lands on the nearest frame, which can be a few
      // milliseconds *before* it. Without a margin that still counts as inside the
      // cut, so the player seeks again, lands short again, and freezes there.
      if (realTime >= cut.start && realTime < cut.end - SEEK_LANDING_MARGIN) {
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

  const handleTimeUpdate = useCallback((realTime: number) => {
    setCurrentTime(realTime)
    skipCuts(realTime)
  }, [skipCuts])

  // `timeupdate` fires about every 250 ms: the player would run up to a quarter
  // second into a removed zone before skipping it. Check every frame instead.
  useEffect(() => {
    if (!isPlaying) return
    let raf = 0
    const tick = () => {
      const video = videoRef.current
      if (video && !video.paused) skipCuts(video.currentTime)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, skipCuts])

  const handlePlayPause = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.pause()
    } else {
      // Playback stops at the end of the last kept part, which may be short of
      // the file's end (so `ended` is false): restart from the top then too,
      // instead of needing a second click.
      const first = keptSegments[0]?.start ?? 0
      const lastEnd = keptSegments[keptSegments.length - 1]?.end
      if (video.ended || (lastEnd !== undefined && video.currentTime >= lastEnd - 0.05)) video.currentTime = first
      void video.play()
    }
  }, [isPlaying, keptSegments])

  // Keyboard transport. Space (or K) toggles playback, as the README promises —
  // without this it activated whichever toolbar button last had focus. The
  // others: ←/→ seek 1 s (Shift: 5 s), J/L seek 5 s, ,/. step one frame.
  const transportRef = useRef({ time: 0, duration: 0 })
  useEffect(() => { transportRef.current = { time: virtualCurrentTime, duration: virtualDuration } }, [virtualCurrentTime, virtualDuration])
  const FRAME = 1 / 30 // the real frame rate is not known to the renderer

  useEffect(() => {
    if (!videoPath || showExport) return
    const isTextual = (el: EventTarget | null) => {
      const node = el as HTMLElement | null
      if (!node) return false
      if (node.tagName === 'TEXTAREA' || node.tagName === 'SELECT' || node.isContentEditable) return true
      return node.tagName === 'INPUT' && (node as HTMLInputElement).type !== 'range' && (node as HTMLInputElement).type !== 'color'
    }
    const jump = (delta: number) => {
      const { time, duration: total } = transportRef.current
      seekVirtual(Math.max(0, Math.min(total, time + delta)))
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat && e.code === 'Space') return
      if (isTextual(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      const onRange = (e.target as HTMLElement | null)?.tagName === 'INPUT' // arrows belong to a focused slider
      switch (e.code) {
        case 'Space':
        case 'KeyK':
          e.preventDefault(); handlePlayPause(); break
        case 'ArrowLeft':
          if (onRange) return
          e.preventDefault(); jump(e.shiftKey ? -5 : -1); break
        case 'ArrowRight':
          if (onRange) return
          e.preventDefault(); jump(e.shiftKey ? 5 : 1); break
        case 'KeyJ': e.preventDefault(); jump(-5); break
        case 'KeyL': e.preventDefault(); jump(5); break
        case 'Comma': e.preventDefault(); videoRef.current?.pause(); jump(-FRAME); break
        case 'Period': e.preventDefault(); videoRef.current?.pause(); jump(FRAME); break
        default: break
      }
    }
    // A focused button clicks on Space *release*: swallow that as well.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTextual(e.target)) e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [videoPath, showExport, handlePlayPause, seekVirtual, FRAME])

  const openExport = useCallback(() => setShowExport(true), [])
  const closeExport = useCallback(() => setShowExport(false), [])
  const onApplyCrop = useCallback(() => setActivePanel(null), [])
  const onToastDone = useCallback(() => setToast(null), [])
  const onExportQueued = useCallback(() => setToast(t.export_queued), [t])
  const refreshRecent = useCallback(() => {
    window.electronAPI.listRecent().then(setRecent).catch(() => setRecent([]))
  }, [])
  // The home screen lists what was opened lately; refresh it whenever it is shown.
  useEffect(() => {
    if (!videoPath && !loading) refreshRecent()
  }, [videoPath, loading, refreshRecent])
  const onVideoError = useCallback(() => setToast(t.error_video_unreadable), [t])
  const onSubtitlesError = useCallback(
    (reason: 'empty' | 'read') => setToast(reason === 'empty' ? t.subtitles_empty : t.subtitles_error),
    [t],
  )

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
    stabilize: editable.stabilize,
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
          <button className="btn-ghost" onClick={cancelLoad}>{t.loading_cancel}</button>
        </div>
      </div>
    )
  }

  if (!videoPath) {
    return (
      <>
        <DropZone
          onDrop={loadVideo}
          onOpen={handleOpenVideo}
          onReject={() => setToast(t.error_not_video)}
          recent={recent}
          onOpenRecent={(p) => { void window.electronAPI.openRecent(p) }}
          onRemoveRecent={(p) => { void window.electronAPI.removeRecent(p).then(refreshRecent) }}
          onClearRecent={() => { void window.electronAPI.clearRecent().then(refreshRecent) }}
        />
        {toast && <Toast key={toast} message={toast} onDone={onToastDone} />}
      </>
    )
  }

  return (
    <div className="app-layout">
      <div className="top-bar">
        <div className="app-title">LightCutVidz</div>
        <div className="top-bar-actions">
          <button className="btn-ghost btn-icon" onClick={undo} disabled={!canUndo} title={`${t.app_undo} (${isMac ? 'Cmd+Z' : 'Ctrl+Z'})`}>
            <UndoIcon />
          </button>
          <button className="btn-ghost btn-icon" onClick={redo} disabled={!canRedo} title={`${t.app_redo} (${isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y'})`}>
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
            neutral={showCrop}
            onError={onVideoError}
            onTimeUpdate={handleTimeUpdate}
            onDurationLoaded={setDuration}
            onPlayPause={setIsPlaying}
          />
          <FilterDefs />
          <VignetteOverlay videoRef={videoRef} visible={editable.filter === 'vignette'} />
          <SubtitleOverlay videoRef={videoRef} subtitles={editable.subtitles} currentTime={currentTime} crop={editable.crop} />
          <CompositionGrid visible={showCrop || showGeometry} videoRef={videoRef} />
          {showCrop && (
            <Suspense fallback={null}>
              <CropOverlay
                videoRef={videoRef}
                crop={editable.crop}
                onChangeLive={setCropLive}
                onCommit={endGesture}
                onApply={onApplyCrop}
              />
            </Suspense>
          )}
          {!showCrop && editable.crop && (
            <CropFrame
              videoRef={videoRef}
              crop={editable.crop}
              geometry={{
                rotation: editable.rotation,
                straighten: editable.straighten,
                perspectiveH: editable.perspectiveHorizontal,
                perspectiveV: editable.perspectiveVertical,
                filterId: editable.filter,
              }}
            />
          )}
        </div>

        <Toolbar
          state={editorState}
          showCrop={showCrop}
          showFilters={showFilters}
          showGeometry={showGeometry}
          showSubtitles={showSubtitles}
          onSpeedChange={setSpeed}
          onSpeedChangeLive={setSpeedLive}
          onCommit={endGesture}
          onStabilizeChange={setStabilize}
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
              onCommit={endGesture}
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
              onStyleChangeLive={setSubtitlesStyleLive}
              onCommit={endGesture}
              onError={onSubtitlesError}
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
          onCutSegmentsChangeLive={setCutSegmentsLive}
          onCommit={endGesture}
        />
      </div>

      {showExport && (
        <Suspense fallback={null}>
          <ExportModal state={editorState} onClose={closeExport} onQueued={onExportQueued} />
        </Suspense>
      )}

      {toast && <Toast key={toast} message={toast} onDone={onToastDone} />}
    </div>
  )
}
