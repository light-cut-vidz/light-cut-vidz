import '@testing-library/jest-dom'

// Mock localStorage for tests
const localStorageMock = {
  getItem: (key: string) => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  length: 0,
  key: () => null,
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Minimal Electron API mock for tests that render components using LangProvider
window.electronAPI = {
  openVideo: async () => null,
  saveVideo: async () => null,
  probeVideo: async () => ({ duration: 0, width: 0, height: 0 }),
  previewVideo: async () => '',
  onPreviewProgress: () => () => {},
  exportVideo: async () => ({ success: true, outputPath: '' }),
  onProgress: () => () => {},
  onMenuOpenVideo: () => () => {},
  onMenuUndo: () => () => {},
  onMenuRedo: () => () => {},
  onFullscreenEntered: () => () => {},
  setUndoRedoState: () => {},
  setLanguage: () => {},
  onMenuSetLanguage: () => () => {},
}
