export {}

interface ProbeVideoResult {
  duration: number
  width: number
  height: number
  fps?: number
  [key: string]: unknown
}

declare global {
  interface Window {
    electronAPI: {
      openVideo: () => Promise<string | null>
      saveVideo: (defaultName?: string) => Promise<string | null>
      probeVideo: (filePath: string) => Promise<ProbeVideoResult>
      previewVideo: (filePath: string) => Promise<string>
    onPreviewProgress: (callback: (progress: number) => void) => () => void
    exportVideo: (options: {
        inputPath: string
        outputPath: string
        segments: { start: number; end: number }[]
        speed: number
        crop: { x: number; y: number; w: number; h: number } | null
        muted: boolean
        format: string
        duration: number
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
