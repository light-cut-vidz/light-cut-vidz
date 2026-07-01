export {}

interface ProbeVideoResult {
  duration: number
  width: number
  height: number
  fps?: number
  [key: string]: unknown
}

declare global {
  const __APP_VERSION__: string
  interface Window {
    electronAPI: {
      openVideo: () => Promise<string | null>
      saveVideo: (defaultName?: string) => Promise<string | null>
      probeVideo: (filePath: string) => Promise<ProbeVideoResult>
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
        duration: number
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
