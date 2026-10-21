export {}

export interface QueueJob {
  id: number
  name: string
  format: string
  status: 'queued' | 'running' | 'done' | 'error' | 'cancelled'
  progress: number
  outputPath: string
  error: string | null
}

export interface RecentEntry {
  kind: 'project' | 'video'
  path: string
  name: string
  dir: string
  openedAt: number
}

declare global {
  const __APP_VERSION__: string
  interface Window {
    electronAPI: {
      getPathForFile: (file: File) => string
      toFileUrl: (filePath: string) => Promise<string>
      openVideo: () => Promise<string | null>
      saveVideo: (defaultName?: string, format?: string) => Promise<string | null>
      cancelFfmpeg: () => Promise<void>
      getCapabilities: () => Promise<{ hardware: string[]; stabilization: boolean }>
      queueAdd: (options: unknown) => Promise<{ id: number }>
      queueList: () => Promise<QueueJob[]>
      queueCancel: (id: number) => Promise<boolean>
      queueClearFinished: () => Promise<void>
      queueReveal: (id: number) => Promise<void>
      onQueueUpdate: (callback: (jobs: QueueJob[]) => void) => () => void
      listRecent: () => Promise<RecentEntry[]>
      openRecent: (path: string) => Promise<void>
      removeRecent: (path: string) => Promise<void>
      clearRecent: () => Promise<void>
      getSettings: () => Promise<{ theme: 'system' | 'light' | 'dark' }>
      setTheme: (theme: 'system' | 'light' | 'dark') => Promise<void>
      getChangelog: (lang: string) => Promise<{ version: string; date: string; body: string }[]>
      onMenuShowChangelog: (callback: () => void) => () => void
      saveProject: (project: { videoPath: string; state: unknown }) => Promise<string | null>
      setDirty: (dirty: boolean) => void
      onMenuSaveProject: (callback: () => void) => () => void
      onMenuLoadProject: (callback: (project: { videoPath: string; state: unknown }) => void) => () => void
      previewVideo: (filePath: string) => Promise<string>
      openSubtitleFile: () => Promise<{ filePath: string; content: string } | null>
      onPreviewProgress: (callback: (progress: number) => void) => () => void
    exportVideo: (options: {
        inputPath: string
        outputPath: string
        segments: { start: number; end: number }[]
        speed: number
        crop: { x: number; y: number; w: number; h: number } | null
        filter: string
        rotation?: number
        straighten?: number
        perspectiveH?: number
        perspectiveV?: number
        muted: boolean
        format: string
        quality?: 'high' | 'balanced' | 'small'
        resolution?: number | null
        reframe?: { aspect: string; mode: 'blur' | 'crop' } | null
        stabilize?: 'off' | 'light' | 'normal' | 'strong'
        hardware?: string | null
        gifWidth?: number
        gifFps?: number
        subtitles?: {
          cues: { id: number; start: number; end: number; text: string }[]
          style: {
            fontFamily: string
            fontSize: number
            color: string
            outlineColor: string
            outlineWidth: number
            backgroundColor: string
            backgroundOpacity: number
            position: 'top' | 'middle' | 'bottom'
            accentColor: string
          }
          animation: string
        } | null
      }) => Promise<{ success: boolean; outputPath: string }>
      onProgress: (callback: (progress: number) => void) => () => void
      onMenuOpenVideo: (callback: (filePath: string) => void) => () => void
      onMenuUndo: (callback: () => void) => () => void
      onMenuRedo: (callback: () => void) => () => void
      onFullscreenEntered: (callback: () => void) => () => void
      setUndoRedoState: (canUndo: boolean, canRedo: boolean) => void
      setLanguage: (lang: string) => void
      onMenuSetLanguage: (callback: (lang: string) => void) => () => void
    }
  }
}
