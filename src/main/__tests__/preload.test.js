import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { installElectron, freshRequire, restoreElectron } from './__doubles__/installElectron.js'

// Captured from contextBridge.exposeInMainWorld when the preload module runs.
let api
const exposeInMainWorld = vi.fn((_name, value) => { api = value })
const invoke = vi.fn().mockResolvedValue('ok')
const send = vi.fn()
const on = vi.fn()
const removeAllListeners = vi.fn()
const getPathForFile = vi.fn(() => '/home/u/movie.mp4')

installElectron({
  contextBridge: { exposeInMainWorld: (...args) => exposeInMainWorld(...args) },
  ipcRenderer: {
    invoke: (...args) => invoke(...args),
    send: (...args) => send(...args),
    on: (...args) => on(...args),
    removeAllListeners: (...args) => removeAllListeners(...args),
  },
  webUtils: { getPathForFile: (...args) => getPathForFile(...args) },
})

beforeEach(() => {
  vi.clearAllMocks()
  freshRequire('preload/index.js')
})

afterAll(restoreElectron)

describe('preload bridge', () => {
  it('exposes the API under electronAPI', () => {
    expect(exposeInMainWorld).toHaveBeenCalledWith('electronAPI', expect.any(Object))
  })

  it('never leaks ipcRenderer itself to the renderer', () => {
    expect(api.ipcRenderer).toBeUndefined()
    expect(api.require).toBeUndefined()
  })
})

describe('getPathForFile', () => {
  // `File.path` was removed in Electron 32; webUtils is its replacement, and the
  // renderer cannot reach it without this bridge.
  it('resolves a dropped File through webUtils', () => {
    const file = { name: 'movie.mp4' }
    expect(api.getPathForFile(file)).toBe('/home/u/movie.mp4')
    expect(getPathForFile).toHaveBeenCalledWith(file)
  })
})

describe('invoke channels', () => {
  it.each([
    ['toFileUrl', 'file:toUrl', ['/tmp/a.mp4']],
    ['openVideo', 'dialog:openVideo', []],
    ['previewVideo', 'ffmpeg:preview', ['/tmp/a.mp4']],
    ['saveVideo', 'dialog:saveVideo', ['out.mp4']],
    ['openSubtitleFile', 'dialog:openSubtitle', []],
    ['probeVideo', 'ffmpeg:probe', ['/tmp/a.mp4']],
    ['exportVideo', 'ffmpeg:export', [{ format: 'mp4' }]],
  ])('%s invokes %s', (method, channel, args) => {
    api[method](...args)
    expect(invoke).toHaveBeenCalledWith(channel, ...args)
  })
})

describe('send channels', () => {
  it('setUndoRedoState sends a single payload object', () => {
    api.setUndoRedoState(true, false)
    expect(send).toHaveBeenCalledWith('menu:setUndoRedoState', { canUndo: true, canRedo: false })
  })

  it('setLanguage sends the language', () => {
    api.setLanguage('fr')
    expect(send).toHaveBeenCalledWith('menu:setLanguage', 'fr')
  })
})

describe('event subscriptions', () => {
  it.each([
    ['onPreviewProgress', 'ffmpeg:preview-progress'],
    ['onProgress', 'ffmpeg:progress'],
    ['onMenuOpenVideo', 'menu:openVideo'],
    ['onMenuUndo', 'menu:undo'],
    ['onMenuRedo', 'menu:redo'],
    ['onFullscreenEntered', 'menu:fullscreen-entered'],
    ['onMenuSetLanguage', 'menu:setLanguage'],
  ])('%s subscribes to %s and returns an unsubscribe function', (method, channel) => {
    const off = api[method](vi.fn())
    expect(on).toHaveBeenCalledWith(channel, expect.any(Function))
    off()
    expect(removeAllListeners).toHaveBeenCalledWith(channel)
  })

  it('forwards the payload without the IPC event object', () => {
    const cb = vi.fn()
    api.onProgress(cb)
    const [, handler] = on.mock.calls.find(([ch]) => ch === 'ffmpeg:progress')
    handler({ senderId: 1 }, 42)
    expect(cb).toHaveBeenCalledWith(42)
  })

  it('forwards no arguments for signal-only channels', () => {
    const cb = vi.fn()
    api.onMenuUndo(cb)
    const [, handler] = on.mock.calls.find(([ch]) => ch === 'menu:undo')
    handler({ senderId: 1 })
    expect(cb).toHaveBeenCalledWith()
  })
})
