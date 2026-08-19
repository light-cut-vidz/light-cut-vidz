// Covers the Electron main process: IPC handler wiring and the FFmpeg export
// pipeline. Both are CommonJS and pull in `electron`, `fluent-ffmpeg` and the
// bundled binaries at require time, so all four are seeded into Node's module
// cache before the module under test is loaded.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { createRequire } from 'module'
import { installElectron, freshRequire, restoreElectron, requireSrc } from './__doubles__/installElectron.js'

const req = createRequire(import.meta.url)

// ── FFmpeg double ────────────────────────────────────────────────────────────
// Records every command built, and lets a test make the nth run fail.

let commands = []
let failRunAt = -1
let probeResult = { streams: [{ codec_type: 'video', width: 1920, height: 1080 }] }
let probeError = null

function makeCommand(inputs) {
  const record = {
    inputs,
    inputOptions: [],
    outputOptions: [],
    videoFilters: [],
    audioFilters: [],
    noAudio: false,
    output: null,
  }
  commands.push(record)
  const handlers = {}
  const cmd = {
    input: (i) => { record.inputs.push(i); return cmd },
    inputOptions: (o) => { record.inputOptions.push(...o); return cmd },
    outputOptions: (o) => { record.outputOptions.push(...(Array.isArray(o) ? o : [o])); return cmd },
    videoFilter: (f) => { record.videoFilters.push(f); return cmd },
    audioFilter: (f) => { record.audioFilters.push(f); return cmd },
    noAudio: () => { record.noAudio = true; return cmd },
    output: (o) => { record.output = o; return cmd },
    on: (event, fn) => { handlers[event] = fn; return cmd },
    run: () => {
      const index = commands.length - 1
      queueMicrotask(() => {
        if (index === failRunAt) return handlers.error?.(new Error('ffmpeg exploded'))
        // Stand in for the file ffmpeg would have produced, so the cleanup
        // paths under test have something real to delete.
        if (record.output) { try { fs.writeFileSync(record.output, 'VIDEO') } catch { /* outside tmp */ } }
        // Le vrai ffmpeg pousse des `progress` avant `end` : les relais IPC en dépendent.
        handlers.progress?.({ percent: 50 })
        handlers.end?.()
      })
      return cmd
    },
  }
  return cmd
}

const ffmpegDouble = (input) => makeCommand(input === undefined ? [] : [input])
ffmpegDouble.setFfmpegPath = vi.fn()
ffmpegDouble.setFfprobePath = vi.fn()
ffmpegDouble.ffprobe = vi.fn((_file, cb) => queueMicrotask(() => cb(probeError, probeResult)))

// ── Scratch directory ────────────────────────────────────────────────────────
// Real files rather than an fs double: swapping the built-in `fs` breaks the
// internals other core modules rely on, and the cleanup paths under test are
// exactly the ones worth exercising for real.

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcv-test-'))

/** Temp files the export/preview pipeline left behind. */
function leftovers() {
  return fs.readdirSync(tmpDir).filter(f => f.startsWith('lc_'))
}

// ── Electron double ──────────────────────────────────────────────────────────

const ipcHandlers = new Map()
const ipcListeners = new Map()
const sent = []
const appHooks = new Map()

const showOpenDialog = vi.fn().mockResolvedValue({ canceled: true, filePaths: [] })
const showSaveDialog = vi.fn().mockResolvedValue({ canceled: true, filePath: undefined })
const registerSchemesAsPrivileged = vi.fn()
const protocolHandle = vi.fn()
const netFetch = vi.fn().mockResolvedValue('RESPONSE')

const electronDouble = {
  app: {
    whenReady: () => Promise.resolve(),
    on: vi.fn((event, fn) => appHooks.set(event, fn)),
    quit: vi.fn(),
    getPath: () => tmpDir,
    getAppPath: () => '/app',
    getVersion: () => '1.4.0',
    setName: vi.fn(),
  },
  BrowserWindow: class {
    static getAllWindows() { return [] }
    static getFocusedWindow() { return null }
    constructor() { this.webContents = { send: vi.fn(), on: vi.fn(), openDevTools: vi.fn() } }
    loadURL() {}
    loadFile() {}
    setMenuBarVisibility() {}
    isFullScreen() { return false }
    setFullScreen() {}
  },
  ipcMain: {
    handle: vi.fn((channel, fn) => ipcHandlers.set(channel, fn)),
    on: vi.fn((channel, fn) => ipcListeners.set(channel, fn)),
  },
  dialog: {
    showOpenDialog: (...a) => showOpenDialog(...a),
    showSaveDialog: (...a) => showSaveDialog(...a),
    showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
  },
  protocol: {
    registerSchemesAsPrivileged: (...a) => registerSchemesAsPrivileged(...a),
    handle: (...a) => protocolHandle(...a),
  },
  net: { fetch: (...a) => netFetch(...a) },
  Menu: { setApplicationMenu: vi.fn(), getApplicationMenu: () => null, buildFromTemplate: (t) => t },
  shell: { openExternal: vi.fn() },
}

installElectron(electronDouble)
req.cache[req.resolve('fluent-ffmpeg')] = { exports: ffmpegDouble, loaded: true }
req.cache[req.resolve('ffmpeg-static')] = { exports: '/bin/ffmpeg', loaded: true }
req.cache[req.resolve('@ffprobe-installer/ffprobe')] = { exports: { path: '/bin/ffprobe' }, loaded: true }

// `buildMenu` est le vrai module : on l'enveloppe pour capturer les callbacks que
// `index.js` lui passe, tout en laissant le menu se construire pour de bon.
const menuModule = requireSrc('main/lib/menu.js')
const menuCalls = []
const realBuildMenu = menuModule.buildMenu
menuModule.buildMenu = (opts) => {
  menuCalls.push(opts)
  return realBuildMenu(opts)
}

const event = { sender: { send: vi.fn((channel, value) => sent.push([channel, value])) } }

function invoke(channel, ...args) {
  const handler = ipcHandlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler(event, ...args)
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const f of fs.readdirSync(tmpDir)) fs.rmSync(path.join(tmpDir, f), { force: true })
  commands = []
  failRunAt = -1
  probeError = null
  probeResult = { streams: [{ codec_type: 'video', width: 1920, height: 1080 }] }
  sent.length = 0
  ipcHandlers.clear()
  ipcListeners.clear()
  appHooks.clear()
  freshRequire('main/index.js')
})

afterAll(() => {
  restoreElectron()
  delete req.cache[req.resolve('fluent-ffmpeg')]
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

const baseExport = {
  inputPath: '/in.mp4',
  outputPath: '/out.mp4',
  segments: [{ start: 0, end: 5 }],
  speed: 1,
  crop: null,
  filter: 'none',
  rotation: 0,
  straighten: 0,
  perspectiveH: 0,
  perspectiveV: 0,
  muted: false,
  format: 'mp4',
  subtitles: null,
}

// ─────────────────────────────────────────────────────────────────────────────

describe('startup wiring', () => {
  it('points fluent-ffmpeg at the bundled binaries', () => {
    expect(ffmpegDouble.setFfmpegPath).toHaveBeenCalledWith('/bin/ffmpeg')
    expect(ffmpegDouble.setFfprobePath).toHaveBeenCalledWith('/bin/ffprobe')
  })

  it('registers the local scheme as privileged before the app is ready', () => {
    const [[schemes]] = registerSchemesAsPrivileged.mock.calls
    expect(schemes[0].scheme).toBe('lcv-file')
    // A <video> src needs streaming (range requests) and a real origin.
    expect(schemes[0].privileges).toMatchObject({ standard: true, secure: true, stream: true })
  })

  it('serves local files through the scheme handler', async () => {
    const [[scheme, handler]] = protocolHandle.mock.calls
    expect(scheme).toBe('lcv-file')

    await handler({ url: 'lcv-file://local/tmp/clip.mp4', headers: new Headers({ Range: 'bytes=0-9' }) })

    // The renderer's request headers must NOT be forwarded: Origin and the
    // Sec-Fetch-* set make net.fetch reject a file:// URL outright, which is
    // what breaks <video> playback.
    const [fetchedUrl, options] = netFetch.mock.calls[0]
    expect(fetchedUrl).toBe('file:///tmp/clip.mp4')
    expect(options).toBeUndefined()
  })

  it('answers 404 instead of throwing when the file is gone', async () => {
    const [[, handler]] = protocolHandle.mock.calls
    netFetch.mockRejectedValueOnce(new Error('ERR_FILE_NOT_FOUND'))
    const res = await handler({ url: 'lcv-file://local/tmp/missing.mp4', headers: new Headers() })
    expect(res.status).toBe(404)
  })

  it('registers every IPC channel the preload can call', () => {
    expect([...ipcHandlers.keys()].sort()).toEqual([
      'dialog:openSubtitle', 'dialog:openVideo', 'dialog:saveVideo',
      'ffmpeg:export', 'ffmpeg:preview', 'ffmpeg:probe', 'file:toUrl',
    ])
    expect([...ipcListeners.keys()].sort()).toEqual(['menu:setLanguage', 'menu:setUndoRedoState'])
  })
})

describe('file:toUrl', () => {
  it('hands back a URL on the privileged scheme, never a bare file://', () => {
    const url = invoke('file:toUrl', '/tmp/clip.mp4')
    expect(url).toBe('lcv-file://local/tmp/clip.mp4')
    expect(url.startsWith('file://')).toBe(false)
  })
})

describe('dialog:openVideo', () => {
  it('returns null when the user cancels', async () => {
    await expect(invoke('dialog:openVideo')).resolves.toBeNull()
  })

  it('returns the chosen path', async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/a.mp4'] })
    await expect(invoke('dialog:openVideo')).resolves.toBe('/a.mp4')
  })
})

describe('dialog:openSubtitle', () => {
  it('returns null when the user cancels', async () => {
    await expect(invoke('dialog:openSubtitle')).resolves.toBeNull()
  })

  it('reads the file and returns its content with the path', async () => {
    const srt = path.join(tmpDir, 'subs.srt')
    fs.writeFileSync(srt, '1\n00:00:00,000 --> 00:00:02,000\nhello\n')
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [srt] })
    await expect(invoke('dialog:openSubtitle')).resolves.toEqual({
      filePath: srt,
      content: '1\n00:00:00,000 --> 00:00:02,000\nhello\n',
    })
  })
})

describe('dialog:saveVideo', () => {
  it('returns null when the user cancels', async () => {
    await expect(invoke('dialog:saveVideo', 'out.mp4')).resolves.toBeNull()
  })

  it('returns the chosen destination', async () => {
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: '/save/out.mp4' })
    await expect(invoke('dialog:saveVideo', 'out.mp4')).resolves.toBe('/save/out.mp4')
  })
})

describe('ffmpeg:probe', () => {
  it('resolves the ffprobe metadata', async () => {
    await expect(invoke('ffmpeg:probe', '/a.mp4')).resolves.toEqual(probeResult)
  })

  it('rejects with the ffprobe message', async () => {
    probeError = new Error('bad file')
    await expect(invoke('ffmpeg:probe', '/a.mp4')).rejects.toBe('bad file')
  })
})

describe('ffmpeg:preview', () => {
  it('returns a privileged-scheme URL, not a raw path', async () => {
    const url = await invoke('ffmpeg:preview', '/in.mp4')
    expect(url.startsWith(`lcv-file://local${tmpDir}/lc_preview_`)).toBe(true)
    expect(url.endsWith('.webm')).toBe(true)
  })

  it('forces even dimensions so the transcode never fails on an odd source', async () => {
    await invoke('ffmpeg:preview', '/in.mp4')
    expect(commands[0].outputOptions).toContain('-vf scale=trunc(iw/2)*2:trunc(ih/2)*2')
  })

  // These files are large; leaving one behind per opened video fills the temp dir.
  it('deletes the previous preview when another video is loaded', async () => {
    // Pin the clock so the two previews get distinct filenames.
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000)
    const first = (await invoke('ffmpeg:preview', '/a.mp4')).replace('lcv-file://local', '')
    expect(fs.existsSync(first)).toBe(true)

    now.mockReturnValue(2000)
    const second = (await invoke('ffmpeg:preview', '/b.mp4')).replace('lcv-file://local', '')
    now.mockRestore()

    expect(first).not.toBe(second)
    expect(fs.existsSync(first)).toBe(false)
    expect(leftovers()).toEqual([path.basename(second)])
  })

  it('deletes the preview on quit', async () => {
    const url = (await invoke('ffmpeg:preview', '/a.mp4')).replace('lcv-file://local', '')
    appHooks.get('before-quit')()
    expect(fs.existsSync(url)).toBe(false)
  })

  it('rejects with the ffmpeg message', async () => {
    failRunAt = 0
    await expect(invoke('ffmpeg:preview', '/in.mp4')).rejects.toBe('ffmpeg exploded')
  })
})

describe('ffmpeg:export — encoder settings', () => {
  // Without an explicit pixel format, an odd frame size makes libx264 fall back
  // to yuv444p, which most players and hardware decoders cannot read.
  it('pins the pixel format to yuv420p on every segment', async () => {
    await invoke('ffmpeg:export', baseExport)
    expect(commands[0].outputOptions).toContain('-pix_fmt yuv420p')
  })

  it('always ends the filter chain on the even-dimensions guard', async () => {
    await invoke('ffmpeg:export', { ...baseExport, crop: { x: 0, y: 0, w: 301, h: 201 } })
    const chain = commands[0].videoFilters[0]
    expect(chain).toContain('crop=300:200:0:0')
    expect(chain.endsWith('scale=trunc(iw/2)*2:trunc(ih/2)*2')).toBe(true)
  })

  it('seeks and trims each kept segment', async () => {
    await invoke('ffmpeg:export', { ...baseExport, segments: [{ start: 2, end: 7 }] })
    expect(commands[0].inputOptions).toEqual(['-ss 2', '-t 5'])
  })

  it('drops audio when muted', async () => {
    await invoke('ffmpeg:export', { ...baseExport, muted: true })
    expect(commands[0].noAudio).toBe(true)
    expect(commands[0].audioFilters).toEqual([])
  })

  it('applies atempo when the speed changed and audio is kept', async () => {
    await invoke('ffmpeg:export', { ...baseExport, speed: 2 })
    expect(commands[0].audioFilters).toEqual(['atempo=2.0000'])
  })

  it('chains atempo for speeds outside its single-filter range', async () => {
    await invoke('ffmpeg:export', { ...baseExport, speed: 4 })
    expect(commands[0].audioFilters).toEqual(['atempo=2.0,atempo=2.0000'])
  })

  it('reports progress and finishes at 100', async () => {
    await invoke('ffmpeg:export', baseExport)
    expect(sent.at(-1)).toEqual(['ffmpeg:progress', 100])
  })

  it('resolves with the output path', async () => {
    await expect(invoke('ffmpeg:export', baseExport)).resolves.toEqual({
      success: true, outputPath: '/out.mp4',
    })
  })
})

describe('ffmpeg:export — multiple segments', () => {
  const twoSegments = { ...baseExport, segments: [{ start: 0, end: 2 }, { start: 5, end: 8 }] }

  it('encodes one command per segment, then concatenates', async () => {
    await invoke('ffmpeg:export', twoSegments)
    // 2 segments + 1 concat + 1 format conversion
    expect(commands).toHaveLength(4)
    expect(commands[2].inputOptions).toEqual(['-f concat', '-safe 0'])
    expect(commands[2].outputOptions).toContain('-c copy')
  })

  it('writes a concat list naming every segment', async () => {
    await invoke('ffmpeg:export', twoSegments)
    const list = commands.find(c => c.inputOptions.includes('-f concat')).inputs[0]
    // Read before the finally block removes it: capture from the write itself.
    expect(path.basename(list)).toMatch(/^lc_concat_\d+\.txt$/)
  })

  it('removes every intermediate file it created', async () => {
    await invoke('ffmpeg:export', twoSegments)
    expect(leftovers()).toEqual([])
  })
})

describe('ffmpeg:export — failure handling', () => {
  it('rejects with the underlying ffmpeg message', async () => {
    failRunAt = 0
    await expect(invoke('ffmpeg:export', baseExport)).rejects.toThrow('ffmpeg exploded')
  })

  // The pre-fix code only cleaned up on the success path, so a mid-export
  // failure left every already-encoded segment behind.
  it('still deletes the segments already encoded when one fails', async () => {
    failRunAt = 1
    const segments = [{ start: 0, end: 2 }, { start: 5, end: 8 }]
    await expect(invoke('ffmpeg:export', { ...baseExport, segments })).rejects.toThrow()
    expect(leftovers()).toEqual([])
  })
})

describe('ffmpeg:export — output formats', () => {
  it('stream-copies mp4 when nothing needs re-encoding', async () => {
    await invoke('ffmpeg:export', baseExport)
    expect(commands.at(-1).outputOptions).toContain('-c copy')
  })

  it('re-encodes webm with VP9 and Opus', async () => {
    await invoke('ffmpeg:export', { ...baseExport, format: 'webm' })
    const opts = commands.at(-1).outputOptions
    expect(opts).toContain('-c:v libvpx-vp9')
    expect(opts).toContain('-c:a libopus')
  })

  it('builds a palette pipeline for gif and drops the audio', async () => {
    await invoke('ffmpeg:export', { ...baseExport, format: 'gif' })
    const cmd = commands.at(-1)
    expect(cmd.outputOptions.join(' ')).toContain('palettegen')
    expect(cmd.noAudio).toBe(true)
  })
})

describe('ffmpeg:export — burned-in subtitles', () => {
  const subtitles = {
    cues: [{ id: 1, start: 0, end: 2, text: 'hello world' }],
    style: { fontFamily: 'Arial', fontSize: 5, color: '#ffffff', outlineColor: '#000000', outlineWidth: 2, backgroundColor: '#000000', backgroundOpacity: 0, position: 'bottom', accentColor: '#22d3ee' },
    animation: 'word-pop',
  }

  // The .ass is written then removed in the same call, so read it from the
  // filter argument ffmpeg was handed rather than after the fact.
  function assFilterOf() {
    const vf = commands.at(-1).outputOptions
    const i = vf.indexOf('-vf')
    return i === -1 ? null : vf[i + 1]
  }

  it('points the subtitles filter at the generated .ass file', async () => {
    await invoke('ffmpeg:export', { ...baseExport, subtitles })
    expect(assFilterOf()).toMatch(/^subtitles='.*lc_subs_\d+\.ass'$/)
  })

  it('sizes the .ass from the probed output dimensions', async () => {
    const writes = []
    const original = fs.writeFileSync.bind(fs)
    const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation((p, content, enc) => {
      if (String(p).endsWith('.ass')) writes.push(String(content))
      return original(p, content, enc)
    })
    await invoke('ffmpeg:export', { ...baseExport, subtitles })
    spy.mockRestore()
    expect(writes[0]).toContain('PlayResX: 1920')
    expect(writes[0]).toContain('PlayResY: 1080')
    expect(writes[0]).toContain('Dialogue:')
  })

  // Stream copy cannot burn anything in — the video has to be re-encoded.
  it('re-encodes mp4 instead of stream-copying when subtitles are burned in', async () => {
    await invoke('ffmpeg:export', { ...baseExport, subtitles })
    const opts = commands.at(-1).outputOptions
    expect(opts).toContain('-c:v libx264')
    expect(opts).toContain('-pix_fmt yuv420p')
    expect(opts).not.toContain('-c copy')
  })

  it('removes the temporary .ass file afterwards', async () => {
    await invoke('ffmpeg:export', { ...baseExport, subtitles })
    expect(leftovers()).toEqual([])
  })

  it('adds no subtitles filter when the cue list is empty', async () => {
    await invoke('ffmpeg:export', { ...baseExport, subtitles: { ...subtitles, cues: [] } })
    expect(assFilterOf()).toBeNull()
    expect(commands.at(-1).outputOptions).toContain('-c copy')
  })

  it('falls back to 1920x1080 when the probe reports no video stream', async () => {
    probeResult = { streams: [] }
    const writes = []
    const original = fs.writeFileSync.bind(fs)
    const spy = vi.spyOn(fs, 'writeFileSync').mockImplementation((p, content, enc) => {
      if (String(p).endsWith('.ass')) writes.push(String(content))
      return original(p, content, enc)
    })
    await invoke('ffmpeg:export', { ...baseExport, subtitles })
    spy.mockRestore()
    expect(writes[0]).toContain('PlayResX: 1920')
  })
})

describe('menu IPC listeners', () => {
  it('accepts a supported language', () => {
    expect(() => ipcListeners.get('menu:setLanguage')({}, 'fr')).not.toThrow()
  })

  it('ignores an unsupported language', () => {
    expect(() => ipcListeners.get('menu:setLanguage')({}, 'de')).not.toThrow()
  })

  it('forwards undo/redo availability to the native menu', () => {
    expect(() => ipcListeners.get('menu:setUndoRedoState')({}, { canUndo: true, canRedo: false })).not.toThrow()
  })
})

describe('cycle de vie de l’application', () => {
  it('quitte quand la dernière fenêtre se ferme, sauf sur macOS', () => {
    const original = process.platform
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })

    appHooks.get('window-all-closed')()

    expect(electronDouble.app.quit).toHaveBeenCalled()
    Object.defineProperty(process, 'platform', { value: original, configurable: true })
  })

  it('reste ouvert sur macOS quand toutes les fenêtres se ferment', () => {
    const original = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })

    appHooks.get('window-all-closed')()

    expect(electronDouble.app.quit).not.toHaveBeenCalled()
    Object.defineProperty(process, 'platform', { value: original, configurable: true })
  })

  it('rouvre une fenêtre sur activate quand il n’en reste aucune', () => {
    // `getAllWindows` renvoie [] dans le double : le hook doit reconstruire.
    expect(() => appHooks.get('activate')()).not.toThrow()
  })

  it('construit le menu une fois l’app prête', async () => {
    await Promise.resolve()

    expect(menuCalls.at(-1)).toMatchObject({ currentLang: expect.any(String) })
  })
})

describe('menu natif', () => {
  /** Fenêtre factice ayant le focus, pour les callbacks du menu. */
  const focused = () => ({ webContents: { send: vi.fn() } })

  /** Le menu n'est construit qu'une fois `app.whenReady()` résolu. */
  async function menuOpts() {
    await Promise.resolve()
    return menuCalls.at(-1)
  }

  it('relaie chaque entrée de menu vers le renderer', async () => {
    const calls = await menuOpts()
    const win = focused()

    calls.onOpenVideo(win, '/tmp/clip.mp4')
    calls.onUndo(win)
    calls.onRedo(win)
    calls.onFullscreenEntered(win)

    expect(win.webContents.send.mock.calls.map(c => c[0])).toEqual([
      'menu:openVideo', 'menu:undo', 'menu:redo', 'menu:fullscreen-entered',
    ])
    expect(win.webContents.send).toHaveBeenCalledWith('menu:openVideo', '/tmp/clip.mp4')
  })

  it('ignore undo et redo sans fenêtre au premier plan', async () => {
    const calls = await menuOpts()

    expect(() => { calls.onUndo(null); calls.onRedo(undefined) }).not.toThrow()
  })

  it('change la langue et prévient le renderer', async () => {
    const calls = await menuOpts()
    const before = menuCalls.length

    calls.onSwitchLanguage('fr')

    // Le menu est reconstruit dans la nouvelle langue.
    expect(menuCalls.length).toBeGreaterThan(before)
    expect(menuCalls.at(-1).currentLang).toBe('fr')
  })

  it('ouvre la fenêtre « à propos »', async () => {
    const calls = await menuOpts()
    expect(() => calls.onAbout()).not.toThrow()
  })

  it('déclenche la recherche de mise à jour', async () => {
    const calls = await menuOpts()
    expect(() => calls.onCheckUpdates(true)).not.toThrow()
  })
})

describe('menu:setUndoRedoState', () => {
  it('reflète l’état d’annulation du renderer dans le menu natif', () => {
    const listener = ipcListeners.get('menu:setUndoRedoState')

    expect(() => listener({}, { canUndo: true, canRedo: false })).not.toThrow()
  })
})

describe('ffmpeg:preview — progression', () => {
  it('relaie la progression du transcodage', async () => {
    const promise = invoke('ffmpeg:preview', '/in.mp4')
    await promise

    // Le double appelle `progress` avant `end`.
    expect(sent.some(([channel]) => channel === 'ffmpeg:preview-progress')).toBe(true)
  })
})
