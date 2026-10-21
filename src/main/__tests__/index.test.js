// Covers the Electron main process: IPC handler wiring and the FFmpeg export
// pipeline. Both are CommonJS and pull in `electron`, the ffmpeg wrapper and the
// bundled binary at require time, so all four are seeded into Node's module
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
let holdRunAt = -1
let probeResult = defaultProbe()
let probeError = null

function defaultProbe() {
  return {
    format: { duration: 10 },
    streams: [
      { codec_type: 'video', width: 1920, height: 1080 },
      { codec_type: 'audio', codec_name: 'aac' },
    ],
  }
}

const OWN_ARGS = new Set(['-i', '-filter_complex', '-map', '-f'])

/** What the tests read back from the arguments ffmpeg was started with. */
function describeArgs(args) {
  const valueAfter = (flag) => args[args.indexOf(flag) + 1]
  const outputOptions = []
  for (let i = 0; i < args.length - 1; i++) {
    if (!args[i].startsWith('-') || OWN_ARGS.has(args[i])) { if (OWN_ARGS.has(args[i])) i++; continue }
    const next = args[i + 1]
    if (next !== undefined && !next.startsWith('-') && i + 1 < args.length - 1) outputOptions.push(`${args[i]} ${next}`), i++
    else outputOptions.push(args[i])
  }
  return {
    args,
    inputs: args.includes('-i') ? [valueAfter('-i')] : [],
    complexFilter: args.includes('-filter_complex') ? valueAfter('-filter_complex') : null,
    complexMap: args.flatMap((a, i) => (a === '-map' ? [args[i + 1].replace(/[[\]]/g, '')] : [])),
    format: args.includes('-f') ? valueAfter('-f') : null,
    videoFilters: args.includes('-vf') ? [valueAfter('-vf')] : [],
    output: args[args.length - 1],
    outputOptions,
    killedWith: null,
  }
}

// Encoders a trial encode succeeds with, for the hardware-detection probe.
let workingEncoders = new Set()
let filtersText = ' ... vidstabdetect V->V\n ... vidstabtransform V->V'

function makeRun(args, opts) {
  // A tiny synthetic encode is the hardware-detection probe, not an export.
  if (args.includes('lavfi')) {
    const encoder = args[args.indexOf('-c:v') + 1]
    return { promise: workingEncoders.has(encoder) ? Promise.resolve() : Promise.reject(new Error('Encoder not found')), kill() {} }
  }
  const record = describeArgs(args)
  commands.push(record)
  const index = commands.length - 1
  let rejectRun
  const promise = new Promise((resolve, reject) => {
    rejectRun = reject
    queueMicrotask(() => {
      if (index === holdRunAt) return // stays "running" until killed
      if (index === failRunAt) return reject(new Error('ffmpeg exploded'))
      // Stand in for the file ffmpeg would have produced, so the cleanup
      // paths under test have something real to delete.
      try { fs.writeFileSync(record.output, 'VIDEO') } catch { /* outside tmp */ }
      // Le vrai ffmpeg pousse des progrès avant la fin : les relais IPC en dépendent.
      if (opts && opts.onProgress) opts.onProgress(1)
      resolve()
    })
  })
  return { promise, kill() { record.killedWith = 'SIGKILL'; rejectRun(new Error('cancelled')) } }
}

const probeSpy = vi.fn(() => (probeError ? Promise.reject(probeError) : Promise.resolve(probeResult)))
const createFfmpegSpy = vi.fn(() => ({ run: makeRun, probe: probeSpy, query: async () => filtersText }))

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
const windowHooks = new Map()
const nativeUpdaterHooks = new Map()
const showMessageBoxSync = vi.fn().mockReturnValue(0)

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
    requestSingleInstanceLock: () => true,
  },
  BrowserWindow: class {
    static getAllWindows() { return [] }
    static getFocusedWindow() { return null }
    constructor() {
      this.webContents = {
        send: vi.fn(), on: vi.fn(), openDevTools: vi.fn(),
        getURL: () => 'lcv-file://local/app/dist/index.html', setWindowOpenHandler: vi.fn(),
      }
    }
    on(event, fn) { windowHooks.set(event, fn) }
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
    showMessageBoxSync: (...a) => showMessageBoxSync(...a),
  },
  protocol: {
    registerSchemesAsPrivileged: (...a) => registerSchemesAsPrivileged(...a),
    handle: (...a) => protocolHandle(...a),
  },
  net: { fetch: (...a) => netFetch(...a) },
  Menu: { setApplicationMenu: vi.fn(), getApplicationMenu: () => null, buildFromTemplate: (t) => t },
  shell: { openExternal: vi.fn(), showItemInFolder: vi.fn() },
  autoUpdater: { on: (event, fn) => nativeUpdaterHooks.set(event, fn) },
  nativeTheme: { themeSource: 'system', shouldUseDarkColors: true },
}

installElectron(electronDouble)
req.cache[req.resolve('../lib/ffmpeg.js')] = { exports: { createFfmpeg: createFfmpegSpy }, loaded: true }
req.cache[req.resolve('ffmpeg-static')] = { exports: '/bin/ffmpeg', loaded: true }

// `buildMenu` est le vrai module : on l'enveloppe pour capturer les callbacks que
// `index.js` lui passe, tout en laissant le menu se construire pour de bon.
const menuModule = requireSrc('main/lib/menu.js')
const menuCalls = []
const realBuildMenu = menuModule.buildMenu
menuModule.buildMenu = (opts) => {
  menuCalls.push(opts)
  return realBuildMenu(opts)
}

const trustedFrame = { url: 'lcv-file://local/app/dist/index.html' }
const event = { sender: { send: vi.fn((channel, value) => sent.push([channel, value])) }, senderFrame: trustedFrame }

function invoke(channel, ...args) {
  const handler = ipcHandlers.get(channel)
  if (!handler) throw new Error(`no handler registered for ${channel}`)
  return handler(event, ...args)
}

/** Startup is asynchronous (settings are read first): wait until the window exists. */
async function booted() {
  await vi.waitFor(() => expect(windowHooks.has('close')).toBe(true))
}

beforeEach(async () => {
  vi.clearAllMocks()
  for (const f of fs.readdirSync(tmpDir)) fs.rmSync(path.join(tmpDir, f), { recursive: true, force: true })
  commands = []
  failRunAt = -1
  holdRunAt = -1
  probeError = null
  probeResult = defaultProbe()
  workingEncoders = new Set()
  filtersText = ' ... vidstabdetect V->V\n ... vidstabtransform V->V'
  sent.length = 0
  ipcHandlers.clear()
  ipcListeners.clear()
  appHooks.clear()
  windowHooks.clear()
  nativeUpdaterHooks.clear()
  electronDouble.nativeTheme.themeSource = 'system'
  freshRequire('main/index.js')
  await booted()
})

afterAll(() => {
  restoreElectron()
  delete req.cache[req.resolve('../lib/ffmpeg.js')]
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
  it('points the ffmpeg wrapper at the bundled binary', () => {
    expect(createFfmpegSpy).toHaveBeenCalledWith({ ffmpegPath: '/bin/ffmpeg' })
  })

  it('registers the local scheme as privileged before the app is ready', () => {
    const [[schemes]] = registerSchemesAsPrivileged.mock.calls
    expect(schemes[0].scheme).toBe('lcv-file')
    // A <video> src needs streaming (range requests) and a real origin.
    expect(schemes[0].privileges).toMatchObject({ standard: true, secure: true, stream: true })
  })

  it('does not let the scheme bypass the renderer CSP', () => {
    const [[schemes]] = registerSchemesAsPrivileged.mock.calls
    expect(schemes[0].privileges.bypassCSP).toBeUndefined()
  })

  it('refuses a file the user never opened', async () => {
    const [[scheme, handler]] = protocolHandle.mock.calls
    expect(scheme).toBe('lcv-file')
    const res = await handler({ url: 'lcv-file://local/etc/passwd', headers: new Headers() })
    expect(res.status).toBe(403)
    expect(netFetch).not.toHaveBeenCalled()
  })

  it('serves an opened video with byte-range support', async () => {
    const clip = path.join(tmpDir, 'clip.mp4')
    fs.writeFileSync(clip, '0123456789')
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [clip] })
    await invoke('dialog:openVideo')

    const [[, handler]] = protocolHandle.mock.calls
    const res = await handler({ url: `lcv-file://local${clip}`, headers: new Headers({ Range: 'bytes=2-5' }) })
    expect(res.status).toBe(206)
    expect(res.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(await res.text()).toBe('2345')
  })

  it('serves the app bundle through net.fetch', async () => {
    const [[, handler]] = protocolHandle.mock.calls
    await handler({ url: 'lcv-file://local/app/dist/index.html', headers: new Headers() })
    expect(netFetch.mock.calls[0][0]).toBe('file:///app/dist/index.html')
  })

  it('registers every IPC channel the preload can call', () => {
    expect([...ipcHandlers.keys()].sort()).toEqual([
      'changelog:get', 'dialog:openSubtitle', 'dialog:openVideo', 'dialog:saveVideo',
      'ffmpeg:cancel', 'ffmpeg:capabilities', 'ffmpeg:export', 'ffmpeg:preview', 'file:toUrl', 'project:save',
      'queue:add', 'queue:cancel', 'queue:clearFinished', 'queue:list', 'queue:reveal',
      'recent:clear', 'recent:list', 'recent:open', 'recent:remove', 'settings:get', 'settings:setTheme',
    ])
    expect([...ipcListeners.keys()].sort()).toEqual(['app:setDirty', 'menu:setLanguage', 'menu:setUndoRedoState'])
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

describe('ffmpeg:preview', () => {
  const friendly = {
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
    streams: [
      { codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p' },
      { codec_type: 'audio', codec_name: 'aac' },
    ],
  }

  it('returns a privileged-scheme URL, not a raw path', async () => {
    const url = await invoke('ffmpeg:preview', '/in.mp4')
    expect(url.startsWith(`lcv-file://local${tmpDir}/lc_preview_`)).toBe(true)
    expect(url.endsWith('.webm')).toBe(true)
  })

  it('plays an H.264/AAC source as-is instead of transcoding it', async () => {
    probeResult = friendly
    await expect(invoke('ffmpeg:preview', '/in.mp4')).resolves.toBe('lcv-file://local/in.mp4')
    expect(commands).toHaveLength(0)
  })

  it('still transcodes a source Chromium cannot decode', async () => {
    probeResult = { ...friendly, streams: [{ codec_type: 'video', codec_name: 'hevc', pix_fmt: 'yuv420p' }] }
    await invoke('ffmpeg:preview', '/in.mp4')
    expect(commands).toHaveLength(1)
  })

  it('transcodes when the probe fails, and lets the transcode report the problem', async () => {
    probeError = new Error('bad file')
    await invoke('ffmpeg:preview', '/in.mp4')
    expect(commands).toHaveLength(1)
  })

  it('refuses a path that is not a video file', async () => {
    await expect(invoke('ffmpeg:preview', '/etc/passwd')).rejects.toThrow('Not a supported video file')
  })

  it('forces even dimensions so the transcode never fails on an odd source', async () => {
    await invoke('ffmpeg:preview', '/in.mp4')
    expect(commands[0].outputOptions).toContain('-vf scale=trunc(iw/2)*2:trunc(ih/2)*2')
  })

  it('multithreads the VP9 encode', async () => {
    await invoke('ffmpeg:preview', '/in.mp4')
    expect(commands[0].outputOptions).toContain('-row-mt 1')
  })

  // These files are large; leaving one behind per opened video fills the temp dir.
  it('deletes the previous preview when another video is loaded', async () => {
    const first = (await invoke('ffmpeg:preview', '/a.mp4')).replace('lcv-file://local', '')
    expect(fs.existsSync(first)).toBe(true)

    const second = (await invoke('ffmpeg:preview', '/b.mp4')).replace('lcv-file://local', '')

    expect(first).not.toBe(second)
    expect(fs.existsSync(first)).toBe(false)
    expect(leftovers()).toEqual([path.basename(second)])
  })

  it('stops a transcode still running when another video is loaded', async () => {
    holdRunAt = 0
    const stale = invoke('ffmpeg:preview', '/a.mp4')
    await vi.waitFor(() => expect(commands).toHaveLength(1))

    await invoke('ffmpeg:preview', '/b.mp4')

    expect(commands[0].killedWith).toBe('SIGKILL')
    await expect(stale).rejects.toThrow('cancelled')
    expect(leftovers()).toHaveLength(1)
  })

  it('deletes the preview on quit', async () => {
    const url = (await invoke('ffmpeg:preview', '/a.mp4')).replace('lcv-file://local', '')
    appHooks.get('before-quit')()
    expect(fs.existsSync(url)).toBe(false)
  })

  it('rejects with the ffmpeg message and leaves no file behind', async () => {
    failRunAt = 0
    await expect(invoke('ffmpeg:preview', '/in.mp4')).rejects.toThrow('ffmpeg exploded')
    expect(leftovers()).toEqual([])
  })

  it('relaie la progression du transcodage', async () => {
    await invoke('ffmpeg:preview', '/in.mp4')
    expect(sent.some(([channel]) => channel === 'ffmpeg:preview-progress')).toBe(true)
  })
})

// ── Export ───────────────────────────────────────────────────────────────────

/** Registers the files the way the dialogs do: the export only accepts those. */
async function pickFiles({ input = '/in.mp4', output = '/out.mp4', format = 'mp4' } = {}) {
  showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [input] })
  await invoke('dialog:openVideo')
  showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: output })
  return invoke('dialog:saveVideo', 'x', format)
}

describe('dialog:saveVideo — format and extension', () => {
  it('offers only the chosen format', async () => {
    await invoke('dialog:saveVideo', 'x.webm', 'webm')
    expect(showSaveDialog.mock.calls[0][0].filters).toEqual([{ name: 'WebM', extensions: ['webm'] }])
  })

  it('appends the extension when the dialog returned a bare name', async () => {
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: '/save/video' })
    await expect(invoke('dialog:saveVideo', 'x', 'mp4')).resolves.toBe('/save/video.mp4')
  })

  it('keeps a name that already has the extension', async () => {
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: '/save/video.MP4' })
    await expect(invoke('dialog:saveVideo', 'x', 'mp4')).resolves.toBe('/save/video.MP4')
  })

  it('asks before silently overwriting the file it renamed to', async () => {
    const existing = path.join(tmpDir, 'taken.mp4')
    fs.writeFileSync(existing, 'old')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: path.join(tmpDir, 'taken') })
    electronDouble.dialog.showMessageBox.mockResolvedValueOnce({ response: 1 })
    await expect(invoke('dialog:saveVideo', 'x', 'mp4')).resolves.toBeNull()
  })
})

describe('ffmpeg:export — guards', () => {
  it('rejects an input the user never opened', async () => {
    await expect(invoke('ffmpeg:export', baseExport)).rejects.toThrow('not opened through the app')
  })

  it('rejects an output the save dialog never returned', async () => {
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/in.mp4'] })
    await invoke('dialog:openVideo')
    await expect(invoke('ffmpeg:export', baseExport)).rejects.toThrow('save dialog')
  })

  it('rejects a request with no kept segment', async () => {
    await pickFiles()
    await expect(invoke('ffmpeg:export', { ...baseExport, segments: [] })).rejects.toThrow('Nothing to export')
  })

  it('rejects values that would end up in the filtergraph as text', async () => {
    await pickFiles()
    await expect(invoke('ffmpeg:export', { ...baseExport, rotation: '0;movie=/etc/passwd' })).rejects.toThrow('rotation')
  })

  // Exports run one after the other: a second one waits instead of being refused.
  it('queues a second export behind the first and runs it afterwards', async () => {
    await pickFiles({ output: '/out1.mp4' })
    await pickFiles({ input: '/in2.mp4', output: '/out2.mp4' })
    holdRunAt = 0
    const first = invoke('ffmpeg:export', { ...baseExport, outputPath: '/out1.mp4' })
    await vi.waitFor(() => expect(commands).toHaveLength(1))
    const second = invoke('ffmpeg:export', { ...baseExport, inputPath: '/in2.mp4', outputPath: '/out2.mp4' })
    await Promise.resolve()
    expect(commands).toHaveLength(1) // not started yet
    expect((await invoke('queue:list')).map(j => j.status)).toEqual(['running', 'queued'])

    await invoke('ffmpeg:cancel') // stops what the dialog started, including the waiting one
    await expect(first).rejects.toThrow('cancelled')
    await expect(second).rejects.toThrow('cancelled')
  })

  it('runs the second export once the first has finished', async () => {
    await pickFiles({ output: '/out1.mp4' })
    await pickFiles({ input: '/in2.mp4', output: '/out2.mp4' })
    const first = invoke('ffmpeg:export', { ...baseExport, outputPath: '/out1.mp4' })
    const second = invoke('ffmpeg:export', { ...baseExport, inputPath: '/in2.mp4', outputPath: '/out2.mp4' })
    await expect(first).resolves.toMatchObject({ outputPath: '/out1.mp4' })
    await expect(second).resolves.toMatchObject({ outputPath: '/out2.mp4' })
    expect(commands.map(c => c.output)).toEqual(['/out1.mp4', '/out2.mp4'])
  })
})

describe('ffmpeg:export — single pass', () => {
  beforeEach(async () => { await pickFiles() })

  it('uses one ffmpeg command for any number of segments', async () => {
    const segments = [{ start: 0, end: 2 }, { start: 5, end: 8 }, { start: 9, end: 10 }]
    await invoke('ffmpeg:export', { ...baseExport, segments })
    expect(commands).toHaveLength(1)
    const graph = commands[0].complexFilter
    expect(graph).toContain('[0:v]trim=start=0.000:end=2.000,setpts=PTS-STARTPTS[v0]')
    expect(graph).toContain('[0:a]atrim=start=5.000:end=8.000,asetpts=PTS-STARTPTS[a1]')
    expect(graph).toContain('concat=n=3:v=1:a=1[vc][ac]')
    expect(commands[0].complexMap).toEqual(['vout', 'aout'])
  })

  it('probes the source once and nothing else', async () => {
    await invoke('ffmpeg:export', baseExport)
    expect(probeSpy).toHaveBeenCalledTimes(1)
  })

  // Without an explicit pixel format, an odd frame size makes libx264 fall back
  // to yuv444p, which most players and hardware decoders cannot read.
  it('pins the pixel format to yuv420p', async () => {
    await invoke('ffmpeg:export', baseExport)
    expect(commands[0].outputOptions).toContain('-pix_fmt yuv420p')
    expect(commands[0].outputOptions).toContain('-c:v libx264')
  })

  it('crops first, then rotates, and ends the chain on the even-dimensions guard', async () => {
    await invoke('ffmpeg:export', { ...baseExport, rotation: 90, crop: { x: 0, y: 0, w: 301, h: 201 } })
    const graph = commands[0].complexFilter
    const chain = graph.match(/;\[vc\](.*)\[vout\]/)[1]
    expect(chain.startsWith('crop=300:200:0:0,transpose=1')).toBe(true)
    expect(chain.endsWith('scale=trunc(iw/2)*2:trunc(ih/2)*2')).toBe(true)
  })

  it('drops audio when muted', async () => {
    await invoke('ffmpeg:export', { ...baseExport, muted: true })
    expect(commands[0].complexFilter).not.toContain('atrim')
    expect(commands[0].complexMap).toEqual(['vout'])
  })

  it('copes with a source that has no audio track', async () => {
    probeResult = { streams: [{ codec_type: 'video', width: 1920, height: 1080 }] }
    await invoke('ffmpeg:export', { ...baseExport, speed: 2 })
    expect(commands[0].complexFilter).not.toContain('atempo')
    expect(commands[0].complexMap).toEqual(['vout'])
  })

  it('applies atempo when the speed changed and audio is kept', async () => {
    await invoke('ffmpeg:export', { ...baseExport, speed: 2 })
    expect(commands[0].complexFilter).toContain('[ac]atempo=2.0000[aout]')
  })

  it('chains atempo for speeds outside its single-filter range', async () => {
    await invoke('ffmpeg:export', { ...baseExport, speed: 4 })
    expect(commands[0].complexFilter).toContain('[ac]atempo=2.0,atempo=2.0000[aout]')
  })

  it('rejects a file without a video stream before writing anything', async () => {
    probeResult = { streams: [{ codec_type: 'audio' }] }
    const out = path.join(tmpDir, 'existing.mp4')
    fs.writeFileSync(out, 'KEEP')
    await pickFiles({ output: out })
    await expect(invoke('ffmpeg:export', { ...baseExport, outputPath: out })).rejects.toThrow('no video stream')
    expect(fs.readFileSync(out, 'utf-8')).toBe('KEEP')
  })

  it('reports progress that only ever moves forward and finishes at 100', async () => {
    await invoke('ffmpeg:export', baseExport)
    const values = sent.filter(([c]) => c === 'ffmpeg:progress').map(([, v]) => v)
    expect(values.at(-1)).toBe(100)
    expect([...values].sort((x, y) => x - y)).toEqual(values)
  })

  it('resolves with the output path', async () => {
    await expect(invoke('ffmpeg:export', baseExport)).resolves.toEqual({ success: true, outputPath: '/out.mp4' })
  })

  it('removes its working directory afterwards', async () => {
    await invoke('ffmpeg:export', baseExport)
    expect(leftovers()).toEqual([])
  })
})

describe('ffmpeg:export — failure and cancellation', () => {
  it('rejects with the underlying ffmpeg message', async () => {
    await pickFiles()
    failRunAt = 0
    await expect(invoke('ffmpeg:export', baseExport)).rejects.toThrow('ffmpeg exploded')
  })

  it('deletes the truncated output and its working directory when ffmpeg fails', async () => {
    const out = path.join(tmpDir, 'partial.mp4')
    await pickFiles({ output: out })
    fs.writeFileSync(out, 'PARTIAL')
    failRunAt = 0
    await expect(invoke('ffmpeg:export', { ...baseExport, outputPath: out })).rejects.toThrow()
    expect(fs.existsSync(out)).toBe(false)
    expect(leftovers()).toEqual([])
  })

  it('kills ffmpeg on cancel and reports a cancellation', async () => {
    await pickFiles()
    holdRunAt = 0
    const running = invoke('ffmpeg:export', baseExport)
    await vi.waitFor(() => expect(commands).toHaveLength(1))

    await invoke('ffmpeg:cancel')

    expect(commands[0].killedWith).toBe('SIGKILL')
    await expect(running).rejects.toThrow('cancelled')
    expect(leftovers()).toEqual([])
  })

  it('stops running ffmpeg processes on quit', async () => {
    await pickFiles()
    holdRunAt = 0
    const running = invoke('ffmpeg:export', baseExport).catch(e => e)
    await vi.waitFor(() => expect(commands).toHaveLength(1))

    appHooks.get('before-quit')()

    expect(commands[0].killedWith).toBe('SIGKILL')
    expect((await running).message).toBe('cancelled')
  })
})

describe('ffmpeg:export — output formats', () => {
  it('forces the muxer instead of trusting the file name', async () => {
    await pickFiles({ format: 'webm', output: '/out.webm' })
    await invoke('ffmpeg:export', { ...baseExport, format: 'webm', outputPath: '/out.webm' })
    expect(commands[0].format).toBe('webm')
  })

  it('encodes mp4 with H.264 and AAC', async () => {
    await pickFiles()
    await invoke('ffmpeg:export', baseExport)
    const opts = commands[0].outputOptions
    expect(opts).toContain('-c:v libx264')
    expect(opts).toContain('-c:a aac')
    expect(opts).toContain('-movflags +faststart')
  })

  it('encodes webm with multithreaded VP9 and Opus', async () => {
    await pickFiles({ format: 'webm', output: '/out.webm' })
    await invoke('ffmpeg:export', { ...baseExport, format: 'webm', outputPath: '/out.webm' })
    const opts = commands[0].outputOptions
    expect(opts).toContain('-c:v libvpx-vp9')
    expect(opts).toContain('-row-mt 1')
    expect(opts).toContain('-c:a libopus')
  })

  it('builds a palette pipeline for gif and drops the audio', async () => {
    await pickFiles({ format: 'gif', output: '/out.gif' })
    await invoke('ffmpeg:export', { ...baseExport, format: 'gif', outputPath: '/out.gif' })
    expect(commands[0].complexFilter).toContain('palettegen')
    expect(commands[0].complexMap).toEqual(['vout'])
  })
})

describe('ffmpeg:export — burned-in subtitles', () => {
  const subtitles = {
    cues: [{ id: 1, start: 0, end: 2, text: 'hello world' }],
    style: { fontFamily: 'Arial', fontSize: 5, color: '#ffffff', outlineColor: '#000000', outlineWidth: 2, backgroundColor: '#000000', backgroundOpacity: 0, position: 'bottom', accentColor: '#22d3ee' },
    animation: 'word-pop',
  }

  /** Runs an export and returns the .ass text, captured before cleanup removes it. */
  async function exportWithSubs(extra = {}, subs = subtitles) {
    await pickFiles()
    const writes = []
    const original = fs.promises.writeFile.bind(fs.promises)
    const spy = vi.spyOn(fs.promises, 'writeFile').mockImplementation((p, content, enc) => {
      if (String(p).endsWith('.ass')) writes.push(String(content))
      return original(p, content, enc)
    })
    try { await invoke('ffmpeg:export', { ...baseExport, subtitles: subs, ...extra }) } finally { spy.mockRestore() }
    return writes[0]
  }

  it('encodes an intermediate first, then burns the subtitles in a second pass', async () => {
    await exportWithSubs()
    expect(commands).toHaveLength(2)
    expect(commands[0].output).toMatch(/intermediate\.mp4$/)
    expect(commands[1].inputs[0]).toBe(commands[0].output)
    expect(commands[1].output).toBe('/out.mp4')
  })

  it('points the subtitles filter at the generated .ass file', async () => {
    await exportWithSubs()
    expect(commands[1].videoFilters[0]).toMatch(/^subtitles=.*subs\.ass$/)
  })

  it('sizes the .ass from the probed output dimensions', async () => {
    const ass = await exportWithSubs()
    expect(ass).toContain('PlayResX: 1920')
    expect(ass).toContain('PlayResY: 1080')
    expect(ass).toContain('Dialogue:')
  })

  // The intermediate is already sped up: a cue at 4–6 s of the source shows at
  // 2–3 s of a 2x export, not at 4–6 s.
  it('moves the cues onto the sped-up timeline', async () => {
    const ass = await exportWithSubs(
      { speed: 2, segments: [{ start: 0, end: 10 }] },
      { ...subtitles, animation: 'sentence-fade', cues: [{ id: 1, start: 4, end: 6, text: 'later' }] },
    )
    expect(ass).toContain('Dialogue: 0,0:00:02.00,0:00:03.00')
  })

  it('shifts cues after a cut and divides by the speed', async () => {
    const ass = await exportWithSubs(
      { speed: 2, segments: [{ start: 0, end: 2 }, { start: 6, end: 10 }] },
      { ...subtitles, animation: 'sentence-fade', cues: [{ id: 1, start: 7, end: 9, text: 'x' }] },
    )
    // 7 s of the source = 2 + 1 = 3 s of kept footage = 1.5 s at 2x
    expect(ass).toContain('Dialogue: 0,0:00:01.50,0:00:02.50')
  })

  it('paints the background box with BackColour (BorderStyle 4), keeping the outline', async () => {
    const ass = await exportWithSubs({}, { ...subtitles, style: { ...subtitles.style, backgroundOpacity: 0.5, backgroundColor: '#0000ff' } })
    expect(ass).toMatch(/Style: Default,Arial,\d+,[^,]+,[^,]+,[^,]+,&H80FF0000,-1,0,0,0,100,100,0,0,4,/)
  })

  it('keeps the audio untouched for mp4', async () => {
    await exportWithSubs()
    expect(commands[1].outputOptions).toContain('-c:a copy')
    expect(commands[1].outputOptions).toContain('-c:v libx264')
  })

  it('removes its working directory afterwards', async () => {
    await exportWithSubs()
    expect(leftovers()).toEqual([])
  })

  it('adds no second pass when the cue list is empty', async () => {
    await pickFiles()
    await invoke('ffmpeg:export', { ...baseExport, subtitles: { ...subtitles, cues: [] } })
    expect(commands).toHaveLength(1)
  })

  it('rejects a font name that could break out of the ASS style line', async () => {
    await pickFiles()
    const style = { ...subtitles.style, fontFamily: 'Arial,0,0' }
    await expect(invoke('ffmpeg:export', { ...baseExport, subtitles: { ...subtitles, style } })).rejects.toThrow('fontFamily')
  })

  it('falls back to 1920x1080 when the probe reports no video stream for the intermediate', async () => {
    await pickFiles()
    // First probe (source) sees a video; the intermediate probe sees none.
    probeSpy.mockImplementationOnce(() => Promise.resolve(defaultProbe()))
    probeSpy.mockImplementationOnce(() => Promise.resolve({ streams: [] }))
    const writes = []
    const original = fs.promises.writeFile.bind(fs.promises)
    const spy = vi.spyOn(fs.promises, 'writeFile').mockImplementation((p, content, enc) => {
      if (String(p).endsWith('.ass')) writes.push(String(content))
      return original(p, content, enc)
    })
    await invoke('ffmpeg:export', { ...baseExport, subtitles })
    spy.mockRestore()
    expect(writes[0]).toContain('PlayResX: 1920')
  })
})

describe('IPC sender check', () => {
  const foreign = { sender: event.sender, senderFrame: { url: 'https://evil.example/page.html' } }

  it.each(['dialog:openVideo', 'dialog:saveVideo', 'ffmpeg:export', 'ffmpeg:preview', 'file:toUrl', 'ffmpeg:cancel', 'dialog:openSubtitle'])(
    'refuses %s from a frame that is not the app page', async (channel) => {
      await expect(Promise.resolve().then(() => ipcHandlers.get(channel)(foreign, '/a.mp4'))).rejects.toThrow('Untrusted sender')
    },
  )

  it('refuses a call with no frame information at all', async () => {
    await expect(Promise.resolve().then(() => ipcHandlers.get('ffmpeg:cancel')({ sender: event.sender }))).rejects.toThrow('Untrusted sender')
  })

  it('silently ignores menu messages from an untrusted frame', () => {
    expect(() => ipcListeners.get('menu:setLanguage')(foreign, 'fr')).not.toThrow()
    expect(menuCalls.at(-1)?.currentLang).not.toBe('fr')
  })
})

describe('menu IPC listeners — undo/redo survives a language change', () => {
  it('re-applies the last undo/redo state after the menu is rebuilt', async () => {
    const items = { undo: { enabled: false }, redo: { enabled: false } }
    electronDouble.Menu.getApplicationMenu = () => ({ getMenuItemById: (id) => items[id] })
    ipcListeners.get('menu:setUndoRedoState')({ senderFrame: trustedFrame }, { canUndo: true, canRedo: true })
    items.undo.enabled = false
    items.redo.enabled = false

    ipcListeners.get('menu:setLanguage')({ senderFrame: trustedFrame }, 'fr')

    expect(items.undo.enabled).toBe(true)
    expect(items.redo.enabled).toBe(true)
    electronDouble.Menu.getApplicationMenu = () => null
  })
})

describe('menu IPC listeners', () => {
  it('accepts a supported language', () => {
    expect(() => ipcListeners.get('menu:setLanguage')({ senderFrame: trustedFrame }, 'fr')).not.toThrow()
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

// ── Projects and unsaved edits ───────────────────────────────────────────────

describe('project files', () => {
  const project = (videoPath) => ({ videoPath, state: { speed: 2 } })

  it('writes a project chosen through the save dialog, adding the extension', async () => {
    const target = path.join(tmpDir, 'my-edit')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    await expect(invoke('project:save', project('/a.mp4'))).resolves.toBe(`${target}.lcvproj`)
    expect(JSON.parse(fs.readFileSync(`${target}.lcvproj`, 'utf-8'))).toMatchObject({ lightcutvidz: 1, videoPath: '/a.mp4', state: { speed: 2 } })
  })

  it('returns null when the save dialog is cancelled', async () => {
    await expect(invoke('project:save', project('/a.mp4'))).resolves.toBeNull()
  })

  it('refuses something that is not a project (it could not be reopened)', async () => {
    await expect(invoke('project:save', project('/etc/passwd'))).rejects.toThrow('not a project')
    await expect(invoke('project:save', null)).rejects.toThrow('Invalid project')
  })

  describe('opening', () => {
    async function openWith(contents, { exists = true } = {}) {
      const file = path.join(tmpDir, 'p.lcvproj')
      fs.writeFileSync(file, contents)
      const video = path.join(tmpDir, 'v.mp4')
      if (exists) fs.writeFileSync(video, 'x')
      showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [file] })
      const win = { webContents: { send: vi.fn() } }
      await Promise.resolve()
      await menuCalls.at(-1).onOpenProject(win)
      return { win, video }
    }

    it('hands a valid project to the renderer and allows its video', async () => {
      const video = path.join(tmpDir, 'v.mp4')
      const { win } = await openWith(JSON.stringify({ lightcutvidz: 1, videoPath: video, state: { speed: 3 } }))
      expect(win.webContents.send).toHaveBeenCalledWith('menu:loadProject', { videoPath: video, state: { speed: 3 } })
      const [[, handler]] = protocolHandle.mock.calls
      expect((await handler({ url: `lcv-file://local${video}`, headers: new Headers() })).status).toBe(200)
    })

    it('tells the user when the file is not a project', async () => {
      const { win } = await openWith('garbage')
      expect(win.webContents.send).not.toHaveBeenCalled()
      expect(electronDouble.dialog.showMessageBox).toHaveBeenCalledWith(win, expect.objectContaining({ type: 'error', message: expect.stringContaining('not a valid') }))
    })

    it('tells the user when the video has been moved or deleted', async () => {
      const video = path.join(tmpDir, 'v.mp4')
      const { win } = await openWith(JSON.stringify({ lightcutvidz: 1, videoPath: video, state: {} }), { exists: false })
      expect(win.webContents.send).not.toHaveBeenCalled()
      expect(electronDouble.dialog.showMessageBox).toHaveBeenCalledWith(win, expect.objectContaining({ message: expect.stringContaining('cannot be found') }))
    })

    it('does nothing when the dialog is cancelled', async () => {
      const win = { webContents: { send: vi.fn() } }
      await Promise.resolve()
      await menuCalls.at(-1).onOpenProject(win)
      expect(win.webContents.send).not.toHaveBeenCalled()
    })
  })

  it('"Save project" from the menu asks the renderer for its state', async () => {
    await Promise.resolve()
    const win = { webContents: { send: vi.fn() } }
    menuCalls.at(-1).onSaveProject(win)
    expect(win.webContents.send).toHaveBeenCalledWith('menu:saveProject')
  })
})

describe('closing the window with unsaved edits', () => {
  async function windowClose() {
    await Promise.resolve()
    const close = windowHooks.get('close')
    const event = { preventDefault: vi.fn() }
    close(event)
    return event
  }
  const markDirty = (dirty) => ipcListeners.get('app:setDirty')({ senderFrame: trustedFrame }, dirty)

  it('closes straight away when nothing was edited', async () => {
    const event = await windowClose()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(showMessageBoxSync).not.toHaveBeenCalled()
  })

  it('asks first when there are edits, and closes if the user confirms', async () => {
    markDirty(true)
    showMessageBoxSync.mockReturnValueOnce(0)
    const event = await windowClose()
    expect(showMessageBoxSync).toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('stays open when the user cancels', async () => {
    markDirty(true)
    showMessageBoxSync.mockReturnValueOnce(1)
    expect((await windowClose()).preventDefault).toHaveBeenCalled()
  })

  it('stops asking once the edits are gone', async () => {
    markDirty(true)
    markDirty(false)
    await windowClose()
    expect(showMessageBoxSync).not.toHaveBeenCalled()
  })

  // electron-updater emits this on Electron's native autoUpdater before it quits
  // to install: the restart must not stop at the "unsaved edits" prompt.
  it('does not ask when the app is restarting to install an update', async () => {
    markDirty(true)
    nativeUpdaterHooks.get('before-quit-for-update')()
    await windowClose()
    expect(showMessageBoxSync).not.toHaveBeenCalled()
  })

  it('ignores the flag from an untrusted frame', async () => {
    ipcListeners.get('app:setDirty')({ senderFrame: { url: 'https://evil.example/' } }, true)
    await windowClose()
    expect(showMessageBoxSync).not.toHaveBeenCalled()
  })
})

describe('changelog IPC and menu', () => {
  const fs_ = fs
  it('returns the entries up to the running version, in the asked language', async () => {
    // getAppPath is '/app' in the double: point it at a scratch copy of the files.
    const dir = path.join(tmpDir, 'appfiles')
    fs_.mkdirSync(dir)
    fs_.writeFileSync(path.join(dir, 'CHANGELOG.md'), '## [9.9.9] - 2030-01-01\n- future\n\n## [1.4.0] - 2026-01-01\n- english\n')
    fs_.writeFileSync(path.join(dir, 'CHANGELOG.fr.md'), '## [1.4.0] - 2026-01-01\n- français\n')
    const spy = vi.spyOn(electronDouble.app, 'getAppPath').mockReturnValue(dir)
    expect((await invoke('changelog:get', 'en')).map(e => e.version)).toEqual(['1.4.0']) // 9.9.9 is ahead of the build (1.4.0)
    expect((await invoke('changelog:get', 'fr'))[0].body).toBe('- français')
    expect((await invoke('changelog:get', 'xx'))[0].body).toBe('- english') // unknown language -> English
    spy.mockRestore()
  })

  it('returns an empty list when the file is missing', async () => {
    await expect(invoke('changelog:get', 'en')).resolves.toEqual([])
  })

  it('"What\'s new" in the Help menu asks the renderer to open the window', async () => {
    await Promise.resolve()
    const win = { webContents: { send: vi.fn() } }
    menuCalls.at(-1).onShowChangelog(win)
    expect(win.webContents.send).toHaveBeenCalledWith('menu:showChangelog')
  })
})

// ── Queue, capabilities, hardware and stabilisation ─────────────────────────

describe('export queue IPC', () => {
  it('queue:add returns at once and the job shows up in the list', async () => {
    await pickFiles({ output: '/q1.mp4' })
    holdRunAt = 0
    const { id } = await invoke('queue:add', { ...baseExport, outputPath: '/q1.mp4' })
    expect(typeof id).toBe('number')
    await vi.waitFor(() => expect(commands).toHaveLength(1))
    expect(await invoke('queue:list')).toEqual([expect.objectContaining({ id, name: 'q1.mp4', format: 'mp4', status: 'running' })])
    await invoke('queue:cancel', id)
  })

  it('runs queued jobs in order without anyone waiting for them', async () => {
    await pickFiles({ output: '/a.mp4' })
    await pickFiles({ input: '/in2.mp4', output: '/b.mp4' })
    await invoke('queue:add', { ...baseExport, outputPath: '/a.mp4' })
    await invoke('queue:add', { ...baseExport, inputPath: '/in2.mp4', outputPath: '/b.mp4' })
    await vi.waitFor(async () => expect((await invoke('queue:list')).map(j => j.status)).toEqual(['done', 'done']))
    expect(commands.map(c => c.output)).toEqual(['/a.mp4', '/b.mp4'])
  })

  it('cancels a waiting job without running it, and a running one by killing ffmpeg', async () => {
    await pickFiles({ output: '/a.mp4' })
    await pickFiles({ input: '/in2.mp4', output: '/b.mp4' })
    holdRunAt = 0
    const a = await invoke('queue:add', { ...baseExport, outputPath: '/a.mp4' })
    const b = await invoke('queue:add', { ...baseExport, inputPath: '/in2.mp4', outputPath: '/b.mp4' })
    await vi.waitFor(() => expect(commands).toHaveLength(1))
    expect(await invoke('queue:cancel', b.id)).toBe(true)
    expect(await invoke('queue:cancel', a.id)).toBe(true)
    expect(commands[0].killedWith).toBe('SIGKILL')
    await vi.waitFor(async () => expect((await invoke('queue:list')).map(j => j.status)).toEqual(['cancelled', 'cancelled']))
    expect(commands).toHaveLength(1)
  })

  it('keeps a failed job in the list with its error, and carries on with the next', async () => {
    await pickFiles({ output: '/a.mp4' })
    await pickFiles({ input: '/in2.mp4', output: '/b.mp4' })
    failRunAt = 0
    await invoke('queue:add', { ...baseExport, outputPath: '/a.mp4' })
    await invoke('queue:add', { ...baseExport, inputPath: '/in2.mp4', outputPath: '/b.mp4' })
    await vi.waitFor(async () => expect((await invoke('queue:list')).map(j => j.status)).toEqual(['error', 'done']))
    expect((await invoke('queue:list'))[0].error).toBe('ffmpeg exploded')
  })

  it('refuses two active jobs that write the same file', async () => {
    await pickFiles({ output: '/same.mp4' })
    holdRunAt = 0
    await invoke('queue:add', { ...baseExport, outputPath: '/same.mp4' })
    await expect(invoke('queue:add', { ...baseExport, outputPath: '/same.mp4' })).rejects.toThrow('already writes to that file')
    await invoke('queue:cancel', (await invoke('queue:list'))[0].id)
  })

  it('applies the same guards as a direct export', async () => {
    await expect(invoke('queue:add', baseExport)).rejects.toThrow('not opened through the app')
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/in.mp4'] })
    await invoke('dialog:openVideo')
    await expect(invoke('queue:add', baseExport)).rejects.toThrow('save dialog')
    await pickFiles()
    await expect(invoke('queue:add', { ...baseExport, segments: [] })).rejects.toThrow('Nothing to export')
  })

  it('clearFinished forgets finished jobs only', async () => {
    await pickFiles({ output: '/a.mp4' })
    await pickFiles({ input: '/in2.mp4', output: '/b.mp4' })
    holdRunAt = 1
    await invoke('queue:add', { ...baseExport, outputPath: '/a.mp4' })
    await invoke('queue:add', { ...baseExport, inputPath: '/in2.mp4', outputPath: '/b.mp4' })
    await vi.waitFor(async () => expect((await invoke('queue:list')).map(j => j.status)).toEqual(['done', 'running']))
    await invoke('queue:clearFinished')
    expect((await invoke('queue:list')).map(j => j.name)).toEqual(['b.mp4'])
    await invoke('queue:cancel', (await invoke('queue:list'))[0].id)
  })

  it('reveals a finished job in the file manager, and nothing else', async () => {
    await pickFiles({ output: '/shown.mp4' })
    const { id } = await invoke('queue:add', { ...baseExport, outputPath: '/shown.mp4' })
    await vi.waitFor(async () => expect((await invoke('queue:list'))[0].status).toBe('done'))
    await invoke('queue:reveal', id)
    expect(electronDouble.shell.showItemInFolder).toHaveBeenCalledWith('/shown.mp4')
    electronDouble.shell.showItemInFolder.mockClear()
    await invoke('queue:reveal', 9999)
    expect(electronDouble.shell.showItemInFolder).not.toHaveBeenCalled()
  })

  it('stops the running export when the app quits', async () => {
    await pickFiles()
    holdRunAt = 0
    await invoke('queue:add', baseExport)
    await vi.waitFor(() => expect(commands).toHaveLength(1))
    appHooks.get('before-quit')()
    expect(commands[0].killedWith).toBe('SIGKILL')
  })

  describe('closing the window', () => {
    it('asks first while an export is running, with its own message', async () => {
      await pickFiles()
      holdRunAt = 0
      await invoke('queue:add', baseExport)
      await vi.waitFor(() => expect(commands).toHaveLength(1))
      showMessageBoxSync.mockReturnValueOnce(1)
      const event = { preventDefault: vi.fn() }
      windowHooks.get('close')(event)
      expect(showMessageBoxSync.mock.calls[0][1].message).toMatch(/export/i)
      expect(event.preventDefault).toHaveBeenCalled()
      await invoke('queue:cancel', (await invoke('queue:list'))[0].id)
    })
  })
})

describe('ffmpeg capabilities and the options that depend on them', () => {
  it('reports the working hardware encoders and the stabilisation filters', async () => {
    workingEncoders = new Set(['h264_vaapi'])
    const caps = await invoke('ffmpeg:capabilities')
    expect(caps).toEqual({ hardware: process.platform === 'linux' ? ['vaapi'] : [], stabilization: true })
  })

  it('probes only once', async () => {
    await invoke('ffmpeg:capabilities')
    const before = createFfmpegSpy.mock.results[0].value
    await invoke('ffmpeg:capabilities')
    expect(createFfmpegSpy).toHaveBeenCalledTimes(1)
    expect(before).toBeTruthy()
  })

  it('reports no stabilisation when the filters are missing', async () => {
    filtersText = ' ... scale V->V'
    expect((await invoke('ffmpeg:capabilities')).stabilization).toBe(false)
  })

  it('uses a hardware encoder this machine really has', async () => {
    if (process.platform !== 'linux') return
    workingEncoders = new Set(['h264_nvenc'])
    await pickFiles()
    await invoke('ffmpeg:export', { ...baseExport, hardware: 'nvenc' })
    expect(commands.at(-1).args).toContain('h264_nvenc')
  })

  it('silently falls back to software for one it does not have', async () => {
    await pickFiles()
    await invoke('ffmpeg:export', { ...baseExport, hardware: 'nvenc' })
    expect(commands.at(-1).args).toContain('libx264')
    expect(commands.at(-1).args).not.toContain('h264_nvenc')
  })

  it('refuses stabilisation when this ffmpeg cannot do it', async () => {
    filtersText = ' ... scale V->V'
    await pickFiles()
    await expect(invoke('ffmpeg:export', { ...baseExport, stabilize: 'normal' })).rejects.toThrow('Stabilization is not available')
  })

  it('runs the stabilisation analysis before the export', async () => {
    await pickFiles()
    await invoke('ffmpeg:export', { ...baseExport, stabilize: 'light' })
    expect(commands).toHaveLength(2)
    expect(commands[0].complexFilter).toContain('vidstabdetect')
    expect(commands[1].complexFilter).toContain('vidstabtransform')
  })

  it('rejects an encoder id it does not know', async () => {
    await pickFiles()
    await expect(invoke('ffmpeg:export', { ...baseExport, hardware: 'h264_nvenc -x' })).rejects.toThrow('hardware')
  })

  it('does not probe the machine for a plain software export', async () => {
    await pickFiles()
    await invoke('ffmpeg:export', baseExport)
    expect(commands).toHaveLength(1)
  })
})

describe('using a system ffmpeg', () => {
  const original = process.env.LIGHTCUTVIDZ_FFMPEG
  afterAll(() => { if (original === undefined) delete process.env.LIGHTCUTVIDZ_FFMPEG; else process.env.LIGHTCUTVIDZ_FFMPEG = original })

  it('honours LIGHTCUTVIDZ_FFMPEG when it points at a real file', () => {
    const fake = path.join(tmpDir, 'my-ffmpeg')
    fs.writeFileSync(fake, '')
    process.env.LIGHTCUTVIDZ_FFMPEG = fake
    createFfmpegSpy.mockClear()
    freshRequire('main/index.js')
    expect(createFfmpegSpy).toHaveBeenCalledWith({ ffmpegPath: fake })
  })

  it.each([['a path that does not exist', '/nope/ffmpeg'], ['a relative path', 'ffmpeg'], ['an empty value', '']])('ignores %s', (_n, value) => {
    process.env.LIGHTCUTVIDZ_FFMPEG = value
    createFfmpegSpy.mockClear()
    freshRequire('main/index.js')
    expect(createFfmpegSpy).toHaveBeenCalledWith({ ffmpegPath: '/bin/ffmpeg' })
  })
})

// ── Recent files, theme ─────────────────────────────────────────────────────

describe('recent files', () => {
  const videoFile = () => { const f = path.join(tmpDir, 'seen.mp4'); fs.writeFileSync(f, 'x'); return f }
  const recentJson = () => JSON.parse(fs.readFileSync(path.join(tmpDir, 'recent.json'), 'utf-8'))

  it('remembers a video once it is loaded, and persists the list', async () => {
    const f = videoFile()
    await invoke('ffmpeg:preview', f)
    await vi.waitFor(() => expect(recentJson().items.map(i => i.path)).toContain(f))
    expect((await invoke('recent:list'))[0]).toMatchObject({ kind: 'video', path: f, name: 'seen.mp4', dir: tmpDir })
  })

  it('lists only files that still exist', async () => {
    const f = videoFile()
    await invoke('ffmpeg:preview', f)
    await invoke('ffmpeg:preview', '/gone/never.mp4')
    expect((await invoke('recent:list')).map(i => i.path)).toEqual([f])
  })

  it('moves a re-opened video to the top without duplicating it', async () => {
    const f = videoFile()
    const g = path.join(tmpDir, 'other.mp4'); fs.writeFileSync(g, 'x')
    await invoke('ffmpeg:preview', f); await invoke('ffmpeg:preview', g); await invoke('ffmpeg:preview', f)
    expect((await invoke('recent:list')).map(i => i.name)).toEqual(['seen.mp4', 'other.mp4'])
  })

  it('remembers a saved project', async () => {
    const target = path.join(tmpDir, 'saved')
    showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: target })
    await invoke('project:save', { videoPath: '/a.mp4', state: {} })
    const list = await invoke('recent:list')
    expect(list[0]).toMatchObject({ kind: 'project', name: 'saved.lcvproj' })
  })

  it('opens a project from the list and does not also list its video', async () => {
    const video = videoFile()
    const proj = path.join(tmpDir, 'p.lcvproj')
    fs.writeFileSync(proj, JSON.stringify({ lightcutvidz: 1, videoPath: video, state: {} }))
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [proj] })
    await Promise.resolve()
    const win = { webContents: { send: vi.fn() } }
    await menuCalls.at(-1).onOpenProject(win)
    expect(win.webContents.send).toHaveBeenCalledWith('menu:loadProject', expect.objectContaining({ videoPath: video }))
    await invoke('ffmpeg:preview', video) // what the renderer does next
    expect((await invoke('recent:list')).map(i => i.kind)).toEqual(['project'])
  })

  it('opens only what is in the list', async () => {
    const f = videoFile()
    await invoke('recent:open', f) // not listed yet: ignored
    expect(electronDouble.dialog.showMessageBox).not.toHaveBeenCalled()
  })

  it('removes one entry and clears the list', async () => {
    const f = videoFile()
    const g = path.join(tmpDir, 'other.mp4'); fs.writeFileSync(g, 'x')
    await invoke('ffmpeg:preview', f); await invoke('ffmpeg:preview', g)
    await invoke('recent:remove', f)
    expect((await invoke('recent:list')).map(i => i.path)).toEqual([g])
    await invoke('recent:clear')
    expect(await invoke('recent:list')).toEqual([])
    expect(recentJson().items).toEqual([])
  })

  it('rebuilds the menu with the recent files', async () => {
    const f = videoFile()
    await invoke('ffmpeg:preview', f)
    await vi.waitFor(() => expect(menuCalls.at(-1).recent.map(i => i.path)).toContain(f))
  })

  it('loads the list saved by a previous run at startup', async () => {
    const f = videoFile()
    fs.writeFileSync(path.join(tmpDir, 'recent.json'), JSON.stringify({ items: [{ path: f, openedAt: 1 }, { path: '/etc/passwd' }] }))
    windowHooks.clear()
    freshRequire('main/index.js')
    await booted()
    expect((await invoke('recent:list')).map(i => i.path)).toEqual([f])
  })
})

describe('theme', () => {
  it('defaults to following the system', async () => {
    expect(await invoke('settings:get')).toEqual({ theme: 'system' })
  })

  it('applies the choice to the native theme, persists it and rebuilds the menu', async () => {
    await invoke('settings:setTheme', 'light')
    expect(electronDouble.nativeTheme.themeSource).toBe('light')
    expect(JSON.parse(fs.readFileSync(path.join(tmpDir, 'settings.json'), 'utf-8'))).toEqual({ theme: 'light' })
    expect(menuCalls.at(-1).currentTheme).toBe('light')
  })

  it('ignores a theme it does not know', async () => {
    await invoke('settings:setTheme', 'neon')
    expect(electronDouble.nativeTheme.themeSource).not.toBe('neon')
    expect(await invoke('settings:get')).toEqual({ theme: 'system' })
  })

  it('restores the saved theme at startup', async () => {
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), JSON.stringify({ theme: 'dark' }))
    windowHooks.clear()
    freshRequire('main/index.js')
    await booted()
    expect(electronDouble.nativeTheme.themeSource).toBe('dark')
    expect(await invoke('settings:get')).toEqual({ theme: 'dark' })
  })

  it('ignores a corrupt settings file', async () => {
    fs.writeFileSync(path.join(tmpDir, 'settings.json'), '{{{')
    windowHooks.clear()
    freshRequire('main/index.js')
    await booted()
    expect(await invoke('settings:get')).toEqual({ theme: 'system' })
  })

  it('the View > Theme menu switches it', async () => {
    await Promise.resolve()
    menuCalls.at(-1).onSwitchTheme('dark')
    await vi.waitFor(() => expect(electronDouble.nativeTheme.themeSource).toBe('dark'))
  })
})
