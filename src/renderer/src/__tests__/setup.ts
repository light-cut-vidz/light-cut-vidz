import '@testing-library/jest-dom/vitest'

// Mock localStorage for tests
const localStorageMock = {
  getItem: (_key: string) => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  length: 0,
  key: () => null,
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// jsdom does not implement media playback; without these every video element
// prints "Not implemented: HTMLMediaElement's load() method" dozens of times.
Object.defineProperty(window.HTMLMediaElement.prototype, 'load', { configurable: true, value: () => {} })

// Minimal Electron API mock for tests that render components using LangProvider
window.electronAPI = {
  getPathForFile: () => '',
  toFileUrl: async (filePath: string) => `lcv-file://local${filePath}`,
  openVideo: async () => null,
  saveVideo: async () => null,
  cancelFfmpeg: async () => {},
  getChangelog: async () => [],
  getCapabilities: async () => ({ hardware: [], stabilization: true }),
  queueAdd: async () => ({ id: 1 }),
  queueList: async () => [],
  queueCancel: async () => true,
  queueClearFinished: async () => {},
  queueReveal: async () => {},
  onQueueUpdate: () => () => {},
  listRecent: async () => [],
  openRecent: async () => {},
  removeRecent: async () => {},
  clearRecent: async () => {},
  getSettings: async () => ({ theme: 'system' as const }),
  setTheme: async () => {},
  onUpdatePrompt: () => () => {},
  onUpdateNotice: () => () => {},
  answerUpdate: () => {},
  onMenuAbout: () => () => {},
  onMenuShowChangelog: () => () => {},
  setDirty: () => {},
  previewVideo: async () => '',
  openSubtitleFile: async () => null,
  onPreviewProgress: () => () => {},
  exportVideo: async () => ({ success: true, outputPath: '' }),
  onProgress: () => () => {},
  onMenuOpenVideo: () => () => {},
  onMenuUndo: () => () => {},
  onMenuRedo: () => () => {},
  onRecentChanged: () => () => {},
  onFullscreenEntered: () => () => {},
  setUndoRedoState: () => {},
  setLanguage: () => {},
  onMenuSetLanguage: () => () => {},
}
