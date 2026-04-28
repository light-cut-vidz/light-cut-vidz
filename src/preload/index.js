const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openVideo: () => ipcRenderer.invoke('dialog:openVideo'),
  previewVideo: (filePath) => ipcRenderer.invoke('ffmpeg:preview', filePath),
  onPreviewProgress: (callback) => {
    ipcRenderer.on('ffmpeg:preview-progress', (_, value) => callback(value))
    return () => ipcRenderer.removeAllListeners('ffmpeg:preview-progress')
  },
  saveVideo: (defaultName) => ipcRenderer.invoke('dialog:saveVideo', defaultName),
  probeVideo: (filePath) => ipcRenderer.invoke('ffmpeg:probe', filePath),
  exportVideo: (options) => ipcRenderer.invoke('ffmpeg:export', options),
  onProgress: (callback) => {
    ipcRenderer.on('ffmpeg:progress', (_, value) => callback(value))
    return () => ipcRenderer.removeAllListeners('ffmpeg:progress')
  },
  onMenuOpenVideo: (callback) => {
    ipcRenderer.on('menu:openVideo', (_, filePath) => callback(filePath))
    return () => ipcRenderer.removeAllListeners('menu:openVideo')
  },
  onMenuUndo: (callback) => {
    ipcRenderer.on('menu:undo', () => callback())
    return () => ipcRenderer.removeAllListeners('menu:undo')
  },
  onMenuRedo: (callback) => {
    ipcRenderer.on('menu:redo', () => callback())
    return () => ipcRenderer.removeAllListeners('menu:redo')
  },
  onFullscreenEntered: (callback) => {
    ipcRenderer.on('menu:fullscreen-entered', () => callback())
    return () => ipcRenderer.removeAllListeners('menu:fullscreen-entered')
  },
  setUndoRedoState: (canUndo, canRedo) => {
    ipcRenderer.send('menu:setUndoRedoState', { canUndo, canRedo })
  },
  setLanguage: (lang) => {
    ipcRenderer.send('menu:setLanguage', lang)
  },
  onMenuSetLanguage: (callback) => {
    ipcRenderer.on('menu:setLanguage', (_, lang) => callback(lang))
    return () => ipcRenderer.removeAllListeners('menu:setLanguage')
  },
})
