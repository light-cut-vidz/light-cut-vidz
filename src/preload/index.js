const { contextBridge, ipcRenderer, webUtils } = require('electron')

// Subscribes `callback` to `channel` and returns an unsubscribe that removes only
// that listener — removeAllListeners would also drop other components' handlers.
function subscribe(channel, callback) {
  const handler = (_, ...args) => callback(...args)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Electron 32 removed the non-standard `File.path`; this is its replacement.
  getPathForFile: (file) => webUtils.getPathForFile(file),
  toFileUrl: (filePath) => ipcRenderer.invoke('file:toUrl', filePath),
  openVideo: () => ipcRenderer.invoke('dialog:openVideo'),
  previewVideo: (filePath) => ipcRenderer.invoke('ffmpeg:preview', filePath),
  onPreviewProgress: (callback) => subscribe('ffmpeg:preview-progress', callback),
  saveVideo: (defaultName, format) => ipcRenderer.invoke('dialog:saveVideo', defaultName, format),
  openSubtitleFile: () => ipcRenderer.invoke('dialog:openSubtitle'),
  exportVideo: (options) => ipcRenderer.invoke('ffmpeg:export', options),
  cancelFfmpeg: () => ipcRenderer.invoke('ffmpeg:cancel'),
  getChangelog: (lang) => ipcRenderer.invoke('changelog:get', lang),
  onMenuShowChangelog: (callback) => subscribe('menu:showChangelog', () => callback()),
  saveProject: (project) => ipcRenderer.invoke('project:save', project),
  setDirty: (dirty) => { ipcRenderer.send('app:setDirty', !!dirty) },
  onMenuSaveProject: (callback) => subscribe('menu:saveProject', () => callback()),
  onMenuLoadProject: (callback) => subscribe('menu:loadProject', callback),
  onProgress: (callback) => subscribe('ffmpeg:progress', callback),
  onMenuOpenVideo: (callback) => subscribe('menu:openVideo', callback),
  onMenuUndo: (callback) => subscribe('menu:undo', () => callback()),
  onMenuRedo: (callback) => subscribe('menu:redo', () => callback()),
  onFullscreenEntered: (callback) => subscribe('menu:fullscreen-entered', () => callback()),
  setUndoRedoState: (canUndo, canRedo) => {
    ipcRenderer.send('menu:setUndoRedoState', { canUndo, canRedo })
  },
  setLanguage: (lang) => {
    ipcRenderer.send('menu:setLanguage', lang)
  },
  onMenuSetLanguage: (callback) => subscribe('menu:setLanguage', callback),
})
