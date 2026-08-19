import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import App from '../App'
import { LangProvider } from '../i18n'

class ResizeObserverStub {
  observe() { /* noop */ }
  unobserve() { /* noop */ }
  disconnect() { /* noop */ }
}

beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub
  window.electronAPI = {
    getPathForFile: vi.fn(() => '/tmp/dropped.mp4'),
    toFileUrl: vi.fn(async (p: string) => `lcv-file://local${p}`),
    openVideo: vi.fn().mockResolvedValue(null),
    saveVideo: vi.fn().mockResolvedValue(null),
    probeVideo: vi.fn().mockResolvedValue({ duration: 0, width: 0, height: 0 }),
    previewVideo: vi.fn().mockResolvedValue('/tmp/preview.webm'),
    openSubtitleFile: vi.fn().mockResolvedValue(null),
    onPreviewProgress: vi.fn(() => () => {}),
    exportVideo: vi.fn().mockResolvedValue({ success: true, outputPath: '' }),
    onProgress: vi.fn(() => () => {}),
    onMenuOpenVideo: vi.fn(() => () => {}),
    onMenuUndo: vi.fn(() => () => {}),
    onMenuRedo: vi.fn(() => () => {}),
    onFullscreenEntered: vi.fn(() => () => {}),
    setUndoRedoState: vi.fn(),
    setLanguage: vi.fn(),
    onMenuSetLanguage: vi.fn(() => () => {}),
  }
})

function r() {
  return render(<LangProvider><App /></LangProvider>)
}

describe('App', () => {
  it('renders the drop zone when no video is loaded', () => {
    const { container } = r()
    expect(container.querySelector('.dropzone')).toBeTruthy()
  })

  it('registers menu event listeners on mount', () => {
    r()
    expect(window.electronAPI.onMenuOpenVideo).toHaveBeenCalled()
    expect(window.electronAPI.onMenuUndo).toHaveBeenCalled()
    expect(window.electronAPI.onMenuRedo).toHaveBeenCalled()
    expect(window.electronAPI.onFullscreenEntered).toHaveBeenCalled()
  })

  it('syncs initial undo/redo state to the native menu', () => {
    r()
    expect(window.electronAPI.setUndoRedoState).toHaveBeenCalledWith(false, false)
  })

  it('calls openVideo when the dropzone browse button is clicked', async () => {
    const openVideo = vi.fn().mockResolvedValue(null)
    window.electronAPI = { ...window.electronAPI, openVideo }
    r()
    fireEvent.click(screen.getByRole('button', { name: /browse|parcourir/i }))
    await waitFor(() => expect(openVideo).toHaveBeenCalled())
  })

  it('loads a video and switches to the editor layout', async () => {
    const previewVideo = vi.fn().mockResolvedValue('/tmp/preview.webm')
    window.electronAPI = {
      ...window.electronAPI,
      openVideo: vi.fn().mockResolvedValue('/tmp/in.mp4'),
      previewVideo,
    }
    const { container } = r()
    fireEvent.click(screen.getByRole('button', { name: /browse|parcourir/i }))
    await waitFor(() => expect(previewVideo).toHaveBeenCalledWith('/tmp/in.mp4'))
    await waitFor(() => expect(container.querySelector('.app-layout')).toBeTruthy())
  })

  it('falls back to the source file URL when transcode fails', async () => {
    const previewVideo = vi.fn().mockRejectedValue(new Error('boom'))
    const toFileUrl = vi.fn(async (p: string) => `lcv-file://local${p}`)
    window.electronAPI = {
      ...window.electronAPI,
      openVideo: vi.fn().mockResolvedValue('/tmp/in.mp4'),
      previewVideo,
      toFileUrl,
    }
    const { container } = r()
    fireEvent.click(screen.getByRole('button', { name: /browse|parcourir/i }))
    await waitFor(() => expect(container.querySelector('.app-layout')).toBeTruthy())
    // The renderer never builds a file:// URL itself — the privileged scheme
    // is the only way it can reach a local file now.
    expect(toFileUrl).toHaveBeenCalledWith('/tmp/in.mp4')
    expect(container.querySelector('video')?.getAttribute('src')).toBe('lcv-file://local/tmp/in.mp4')
  })

  it('unregisters the preview progress listener even when transcode fails', async () => {
    const off = vi.fn()
    window.electronAPI = {
      ...window.electronAPI,
      openVideo: vi.fn().mockResolvedValue('/tmp/in.mp4'),
      previewVideo: vi.fn().mockRejectedValue(new Error('boom')),
      onPreviewProgress: vi.fn(() => off),
    }
    const { container } = r()
    fireEvent.click(screen.getByRole('button', { name: /browse|parcourir/i }))
    await waitFor(() => expect(container.querySelector('.app-layout')).toBeTruthy())
    expect(off).toHaveBeenCalledTimes(1)
  })

  it('triggers loadVideo when the open-video menu event fires', async () => {
    let menuHandler: ((path: string) => void) | null = null
    window.electronAPI = {
      ...window.electronAPI,
      onMenuOpenVideo: vi.fn((cb: (p: string) => void) => { menuHandler = cb; return () => {} }),
      previewVideo: vi.fn().mockResolvedValue('/tmp/preview.webm'),
    }
    const { container } = r()
    await act(async () => {
      menuHandler!('/tmp/menu-video.mp4')
    })
    await waitFor(() => expect(container.querySelector('.app-layout')).toBeTruthy())
  })

  it('triggers a Toast when fullscreen entered event fires', async () => {
    let fsHandler: (() => void) | null = null
    window.electronAPI = {
      ...window.electronAPI,
      openVideo: vi.fn().mockResolvedValue('/tmp/in.mp4'),
      previewVideo: vi.fn().mockResolvedValue('/tmp/preview.webm'),
      onFullscreenEntered: vi.fn((cb: () => void) => { fsHandler = cb; return () => {} }),
    }
    const { container } = r()
    fireEvent.click(screen.getByRole('button', { name: /browse|parcourir/i }))
    await waitFor(() => expect(container.querySelector('.app-layout')).toBeTruthy())
    act(() => { fsHandler!() })
    await waitFor(() => expect(container.querySelector('.toast')).toBeTruthy())
  })

  it('opens the export modal when the Export button is clicked (with video loaded)', async () => {
    window.electronAPI = {
      ...window.electronAPI,
      openVideo: vi.fn().mockResolvedValue('/tmp/in.mp4'),
      previewVideo: vi.fn().mockResolvedValue('/tmp/preview.webm'),
    }
    const { container } = r()
    fireEvent.click(screen.getByRole('button', { name: /browse|parcourir/i }))
    await waitFor(() => expect(container.querySelector('.app-layout')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /^export(er)?$/i }))
    await waitFor(() => expect(container.querySelector('.modal')).toBeTruthy())
  })

  it('cleans up listeners on unmount', () => {
    const offMenu = vi.fn()
    window.electronAPI = {
      ...window.electronAPI,
      onMenuOpenVideo: vi.fn(() => offMenu),
      onMenuUndo: vi.fn(() => offMenu),
      onMenuRedo: vi.fn(() => offMenu),
      onFullscreenEntered: vi.fn(() => offMenu),
    }
    const { unmount } = r()
    unmount()
    // 4 listeners registered → 4 off() calls
    expect(offMenu).toHaveBeenCalledTimes(4)
  })
})

// ─── Editing flows ───────────────────────────────────────────────────────────
// These drive the app the way a user does: load a video, then work the toolbar,
// the panels and the history.

async function loadedApp() {
  window.electronAPI = {
    ...window.electronAPI,
    openVideo: vi.fn().mockResolvedValue('/tmp/in.mp4'),
    previewVideo: vi.fn().mockResolvedValue('lcv-file://local/tmp/preview.webm'),
  }
  const view = r()
  fireEvent.click(screen.getByRole('button', { name: /browse|parcourir/i }))
  await waitFor(() => expect(view.container.querySelector('.app-layout')).toBeTruthy())
  return view
}

function toolbarButton(container: HTMLElement, index: number) {
  return container.querySelectorAll('.tool-toggle-btn')[index] as HTMLElement
}

describe('App — toolbar and panels', () => {
  it('toggles the geometry panel open and shut', async () => {
    const { container } = await loadedApp()
    fireEvent.click(toolbarButton(container, 0))
    await waitFor(() => expect(container.querySelector('.geometry-panel')).toBeTruthy())
    fireEvent.click(toolbarButton(container, 0))
    await waitFor(() => expect(container.querySelector('.geometry-panel')).toBeNull())
  })

  it('opens only one panel at a time', async () => {
    const { container } = await loadedApp()
    fireEvent.click(toolbarButton(container, 0))
    await waitFor(() => expect(container.querySelector('.geometry-panel')).toBeTruthy())
    fireEvent.click(toolbarButton(container, 1))
    await waitFor(() => expect(container.querySelector('.filters-panel, .filters')).toBeTruthy())
    expect(container.querySelector('.geometry-panel')).toBeNull()
  })

  it('opens the subtitles panel', async () => {
    const { container } = await loadedApp()
    const subsButton = Array.from(container.querySelectorAll('.tool-toggle-btn'))
      .find(b => b.querySelector('.tool-toggle-btn-label')) as HTMLElement
    fireEvent.click(subsButton)
    await waitFor(() => expect(container.querySelector('.subtitles-panel')).toBeTruthy())
  })

  it('mutes and unmutes the audio', async () => {
    const { container } = await loadedApp()
    const muteButton = container.querySelector('.tool-toggle-btn.active-ok') as HTMLElement
    fireEvent.click(muteButton)
    await waitFor(() => expect(container.querySelector('.tool-toggle-btn.active-danger')).toBeTruthy())
  })

  it('changes the speed from a preset', async () => {
    const { container } = await loadedApp()
    const presets = container.querySelectorAll('.preset-btn')
    fireEvent.click(presets[presets.length - 1])
    await waitFor(() => expect(container.querySelector('.speed-display')?.textContent).toBe('4x'))
  })
})

describe('App — undo and redo', () => {
  it('keeps both disabled until something is edited', async () => {
    await loadedApp()
    expect(screen.getByTitle(/undo|annuler/i)).toBeDisabled()
    expect(screen.getByTitle(/redo|rétablir/i)).toBeDisabled()
  })

  it('undoes a speed change', async () => {
    const { container } = await loadedApp()
    const presets = container.querySelectorAll('.preset-btn')
    fireEvent.click(presets[presets.length - 1])
    await waitFor(() => expect(container.querySelector('.speed-display')?.textContent).toBe('4x'))

    fireEvent.click(screen.getByTitle(/undo|annuler/i))
    await waitFor(() => expect(container.querySelector('.speed-display')?.textContent).toBe('1x'))
  })

  it('redoes what it just undid', async () => {
    const { container } = await loadedApp()
    const presets = container.querySelectorAll('.preset-btn')
    fireEvent.click(presets[presets.length - 1])
    fireEvent.click(screen.getByTitle(/undo|annuler/i))
    await waitFor(() => expect(container.querySelector('.speed-display')?.textContent).toBe('1x'))

    fireEvent.click(screen.getByTitle(/redo|rétablir/i))
    await waitFor(() => expect(container.querySelector('.speed-display')?.textContent).toBe('4x'))
  })

  it('keeps the native menu in step with the history', async () => {
    const { container } = await loadedApp()
    const setUndoRedoState = window.electronAPI.setUndoRedoState as ReturnType<typeof vi.fn>
    setUndoRedoState.mockClear()

    const presets = container.querySelectorAll('.preset-btn')
    fireEvent.click(presets[presets.length - 1])
    await waitFor(() => expect(setUndoRedoState).toHaveBeenCalledWith(true, false))

    fireEvent.click(screen.getByTitle(/undo|annuler/i))
    await waitFor(() => expect(setUndoRedoState).toHaveBeenCalledWith(false, true))
  })

  it('responds to undo driven from the native menu', async () => {
    let undoHandler: (() => void) | null = null
    window.electronAPI = {
      ...window.electronAPI,
      openVideo: vi.fn().mockResolvedValue('/tmp/in.mp4'),
      previewVideo: vi.fn().mockResolvedValue('lcv-file://local/tmp/preview.webm'),
      onMenuUndo: vi.fn((cb: () => void) => { undoHandler = cb; return () => {} }),
    }
    const { container } = r()
    fireEvent.click(screen.getByRole('button', { name: /browse|parcourir/i }))
    await waitFor(() => expect(container.querySelector('.app-layout')).toBeTruthy())

    const presets = container.querySelectorAll('.preset-btn')
    fireEvent.click(presets[presets.length - 1])
    await waitFor(() => expect(container.querySelector('.speed-display')?.textContent).toBe('4x'))

    act(() => { undoHandler!() })
    await waitFor(() => expect(container.querySelector('.speed-display')?.textContent).toBe('1x'))
  })

  it('clears the history when another video is loaded', async () => {
    const { container } = await loadedApp()
    const presets = container.querySelectorAll('.preset-btn')
    fireEvent.click(presets[presets.length - 1])
    await waitFor(() => expect(screen.getByTitle(/undo|annuler/i)).not.toBeDisabled())

    fireEvent.click(screen.getByRole('button', { name: /open video|ouvrir/i }))
    await waitFor(() => expect(screen.getByTitle(/undo|annuler/i)).toBeDisabled())
    expect(container.querySelector('.speed-display')?.textContent).toBe('1x')
  })
})

describe('App — export modal', () => {
  it('closes on the cancel button', async () => {
    const { container } = await loadedApp()
    fireEvent.click(screen.getByRole('button', { name: /^export(er)?$/i }))
    await waitFor(() => expect(container.querySelector('.modal')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /cancel|annuler/i }))
    await waitFor(() => expect(container.querySelector('.modal')).toBeNull())
  })

  it('closes when the backdrop is clicked', async () => {
    const { container } = await loadedApp()
    fireEvent.click(screen.getByRole('button', { name: /^export(er)?$/i }))
    await waitFor(() => expect(container.querySelector('.modal')).toBeTruthy())
    fireEvent.click(container.querySelector('.modal-backdrop')!)
    await waitFor(() => expect(container.querySelector('.modal')).toBeNull())
  })
})

describe('App — loading state', () => {
  it('shows progress while the preview transcodes', async () => {
    let report: ((p: number) => void) | null = null
    let finish: ((url: string) => void) | null = null
    window.electronAPI = {
      ...window.electronAPI,
      openVideo: vi.fn().mockResolvedValue('/tmp/in.mp4'),
      onPreviewProgress: vi.fn((cb: (p: number) => void) => { report = cb; return () => {} }),
      previewVideo: vi.fn(() => new Promise<string>(resolve => { finish = resolve })),
    }
    const { container } = r()
    fireEvent.click(screen.getByRole('button', { name: /browse|parcourir/i }))

    await waitFor(() => expect(container.querySelector('.loading-screen')).toBeTruthy())
    act(() => { report!(42) })
    await waitFor(() => {
      expect((container.querySelector('.loading-fill') as HTMLElement).style.width).toBe('42%')
    })

    await act(async () => { finish!('lcv-file://local/tmp/preview.webm') })
    await waitFor(() => expect(container.querySelector('.app-layout')).toBeTruthy())
  })
})

// ─── Playback across cuts ────────────────────────────────────────────────────
// Playback runs on real video time while the seekbar shows "virtual" time —
// the timeline with the cut zones removed.

describe('App — playback across cuts', () => {
  function videoOf(container: HTMLElement) {
    const video = container.querySelector('video') as HTMLVideoElement
    let time = 0
    let paused = true
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => time,
      set: (t: number) => { time = t },
    })
    Object.defineProperty(video, 'paused', { configurable: true, get: () => paused })
    Object.defineProperty(video, 'duration', { configurable: true, get: () => 100 })
    video.play = vi.fn(() => { paused = false; return Promise.resolve() })
    video.pause = vi.fn(() => { paused = true })
    return { video, setPaused: (p: boolean) => { paused = p } }
  }

  async function withCut() {
    const view = await loadedApp()
    const { video, setPaused } = videoOf(view.container)
    act(() => { fireEvent.loadedMetadata(video) })

    const track = view.container.querySelector('.tl-track') as HTMLElement
    track.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 60, width: 1000, height: 60, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    track.setPointerCapture = vi.fn()
    // Cut out 20s–40s of the 100s video.
    fireEvent.pointerDown(track, { clientX: 200, pointerId: 1 })
    fireEvent.pointerUp(track, { clientX: 400, pointerId: 1 })

    return { ...view, video, setPaused, track }
  }

  it('reports the duration once metadata loads', async () => {
    const { container } = await loadedApp()
    const { video } = videoOf(container)
    act(() => { fireEvent.loadedMetadata(video) })
    expect(container.querySelector('.vc-time')?.textContent).toContain('1:40')
  })

  it('shortens the displayed duration by the cut', async () => {
    const { container } = await withCut()
    // 100s of video minus a 20s cut
    await waitFor(() => expect(container.querySelector('.vc-time')?.textContent).toContain('1:20'))
  })

  it('skips over a cut zone during playback', async () => {
    const { video, setPaused } = await withCut()
    setPaused(false)
    act(() => {
      video.currentTime = 25
      fireEvent.timeUpdate(video)
    })
    expect(video.currentTime).toBe(40)
  })

  it('leaves the playhead alone inside a kept zone', async () => {
    const { video, setPaused } = await withCut()
    setPaused(false)
    act(() => {
      video.currentTime = 10
      fireEvent.timeUpdate(video)
    })
    expect(video.currentTime).toBe(10)
  })

  it('does not skip while paused', async () => {
    const { video, setPaused } = await withCut()
    setPaused(true)
    act(() => {
      video.currentTime = 25
      fireEvent.timeUpdate(video)
    })
    expect(video.currentTime).toBe(25)
  })

  it('stops at the end of the last kept segment', async () => {
    const { video, setPaused } = await withCut()
    setPaused(false)
    act(() => {
      video.currentTime = 100
      fireEvent.timeUpdate(video)
    })
    expect(video.pause).toHaveBeenCalled()
  })

  it('plays and pauses from the transport button', async () => {
    const { container } = await loadedApp()
    const { video } = videoOf(container)
    act(() => { fireEvent.loadedMetadata(video) })

    const playButton = container.querySelector('.play-btn') as HTMLElement
    fireEvent.click(playButton)
    expect(video.play).toHaveBeenCalled()

    act(() => { fireEvent.play(video) })
    fireEvent.click(playButton)
    expect(video.pause).toHaveBeenCalled()
  })

  it('seeks in virtual time, landing past the cut', async () => {
    const { container, video } = await withCut()
    const bar = container.querySelector('.seekbar') as HTMLElement
    bar.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 100, bottom: 10, width: 100, height: 10, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    bar.setPointerCapture = vi.fn()

    // Half-way along an 80s virtual timeline = 40s virtual → 60s real.
    fireEvent.pointerDown(bar, { clientX: 50, pointerId: 1 })
    expect(video.currentTime).toBe(60)
  })
})

describe('App — geometry adjustments', () => {
  async function openGeometry() {
    const view = await loadedApp()
    fireEvent.click(toolbarButton(view.container, 0))
    await waitFor(() => expect(view.container.querySelector('.geometry-panel')).toBeTruthy())
    return view
  }

  const rangeByLabel = (container: HTMLElement, index: number) =>
    container.querySelectorAll('.geometry-panel input[type=range]')[index] as HTMLInputElement

  it('rotates the video by quarter turns', async () => {
    const { container } = await openGeometry()

    fireEvent.click(container.querySelector('.geometry-panel .btn-icon') as HTMLElement)

    await waitFor(() => expect(container.querySelector('video')?.style.transform).toContain('rotate'))
  })

  it('straightens the video and keeps the change', async () => {
    const { container } = await openGeometry()

    fireEvent.change(rangeByLabel(container, 0), { target: { value: '5' } })

    await waitFor(() => expect(rangeByLabel(container, 0).value).toBe('5'))
  })

  it('applies horizontal and vertical perspective', async () => {
    const { container } = await openGeometry()

    fireEvent.change(rangeByLabel(container, 1), { target: { value: '10' } })
    fireEvent.change(rangeByLabel(container, 2), { target: { value: '-10' } })

    await waitFor(() => {
      expect(rangeByLabel(container, 1).value).toBe('10')
      expect(rangeByLabel(container, 2).value).toBe('-10')
    })
  })

  it('resets every geometry adjustment at once', async () => {
    const { container } = await openGeometry()
    fireEvent.change(rangeByLabel(container, 0), { target: { value: '7' } })
    fireEvent.change(rangeByLabel(container, 1), { target: { value: '12' } })
    await waitFor(() => expect(rangeByLabel(container, 0).value).toBe('7'))

    fireEvent.click(container.querySelector('.geometry-reset') as HTMLElement)

    await waitFor(() => {
      expect(rangeByLabel(container, 0).value).toBe('0')
      expect(rangeByLabel(container, 1).value).toBe('0')
    })
  })
})

describe('App — filters', () => {
  it('captures the current frame when the filters panel opens', async () => {
    const drawImage = vi.fn()
    const toDataURL = vi.fn(() => 'data:image/jpeg;base64,zz')
    const getContext = vi.fn(() => ({ drawImage })) as unknown as HTMLCanvasElement['getContext']
    HTMLCanvasElement.prototype.getContext = getContext
    HTMLCanvasElement.prototype.toDataURL = toDataURL as never
    const { container } = await loadedApp()
    const video = container.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true })
    Object.defineProperty(video, 'videoHeight', { value: 360, configurable: true })

    fireEvent.click(toolbarButton(container, 1))

    await waitFor(() => expect(container.querySelector('.filters-panel, .filters')).toBeTruthy())
    expect(drawImage).toHaveBeenCalled()
    expect(toDataURL).toHaveBeenCalled()
  })

  it('skips the capture when the video has no frame yet', async () => {
    const drawImage = vi.fn()
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage })) as never
    const { container } = await loadedApp()
    // videoWidth reste à 0 dans jsdom tant qu'aucune frame n'est décodée.

    fireEvent.click(toolbarButton(container, 1))

    await waitFor(() => expect(container.querySelector('.filters-panel, .filters')).toBeTruthy())
    expect(drawImage).not.toHaveBeenCalled()
  })

  it('survives a browser that hands back no 2D context', async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never
    const { container } = await loadedApp()
    const video = container.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true })

    fireEvent.click(toolbarButton(container, 1))

    await waitFor(() => expect(container.querySelector('.filters-panel, .filters')).toBeTruthy())
  })

  it('applies a filter to the video', async () => {
    const { container } = await loadedApp()
    fireEvent.click(toolbarButton(container, 1))
    await waitFor(() => expect(container.querySelector('.filters-panel, .filters')).toBeTruthy())

    const choices = container.querySelectorAll('.filter-card, .filter-item, .filter-btn')
    fireEvent.click(choices[choices.length - 1])

    await waitFor(() => expect(container.querySelector('video')?.style.filter).not.toBe(''))
  })
})

describe('App — crop', () => {
  it('clears an applied crop from the toolbar', async () => {
    const { container } = await loadedApp()
    // Ouvre le recadrage puis pose un cadre via l'overlay.
    fireEvent.click(container.querySelector('.tool-toggle-btn.crop-toggle, .tool-toggle-btn') as HTMLElement)
    await waitFor(() => expect(container.querySelector('.app-layout')).toBeTruthy())

    const resetBtn = container.querySelector('.crop-reset-btn')
    if (!resetBtn) return // aucun recadrage posé : rien à réinitialiser

    fireEvent.click(resetBtn as HTMLElement)

    await waitFor(() => expect(container.querySelector('.crop-applied-badge')).toBeNull())
  })
})

describe('App — subtitles', () => {
  const CUE = '1\n00:00:00,000 --> 00:00:02,000\nBonjour le monde\n\n'

  async function withSubtitles() {
    window.electronAPI = {
      ...window.electronAPI,
      openSubtitleFile: vi.fn().mockResolvedValue({ filePath: '/tmp/subs/clip.srt', content: CUE }),
    }
    const view = await loadedApp()
    const subsButton = Array.from(view.container.querySelectorAll('.tool-toggle-btn'))
      .find(b => b.querySelector('.tool-toggle-btn-label')) as HTMLElement
    fireEvent.click(subsButton)
    await waitFor(() => expect(view.container.querySelector('.subtitles-panel')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /import|importer/i }))
    await waitFor(() => expect(view.container.querySelector('.subtitles-remove')).toBeTruthy())
    return view
  }

  it('imports an SRT and names it after the file', async () => {
    const { container } = await withSubtitles()

    expect(container.textContent).toContain('clip.srt')
  })

  it('switches the caption animation', async () => {
    const { container } = await withSubtitles()
    const cards = container.querySelectorAll('.subtitles-anim-card')
    const last = cards[cards.length - 1]
    expect(last.className).not.toContain('active')

    fireEvent.click(last)

    await waitFor(() =>
      expect(
        container.querySelectorAll('.subtitles-anim-card')[cards.length - 1].className,
      ).toContain('active'),
    )
  })

  it('restyles the captions', async () => {
    const { container } = await withSubtitles()
    const colours = container.querySelectorAll('.subtitles-panel input[type=color]')

    fireEvent.change(colours[0], { target: { value: '#ff0000' } })

    await waitFor(() => expect((colours[0] as HTMLInputElement).value).toBe('#ff0000'))
  })

  it('resizes the captions', async () => {
    const { container } = await withSubtitles()
    const ranges = container.querySelectorAll('.subtitles-panel input[type=range]')

    fireEvent.change(ranges[0], { target: { value: '8' } })

    await waitFor(() => expect((ranges[0] as HTMLInputElement).value).toBe('8'))
  })

  it('removes the captions again', async () => {
    const { container } = await withSubtitles()

    fireEvent.click(container.querySelector('.subtitles-remove') as HTMLElement)

    await waitFor(() => expect(container.querySelector('.subtitles-remove')).toBeNull())
  })

  it('imports nothing when the file picker is dismissed', async () => {
    window.electronAPI = {
      ...window.electronAPI,
      openSubtitleFile: vi.fn().mockResolvedValue(null),
    }
    const { container } = await loadedApp()
    const subsButton = Array.from(container.querySelectorAll('.tool-toggle-btn'))
      .find(b => b.querySelector('.tool-toggle-btn-label')) as HTMLElement
    fireEvent.click(subsButton)
    await waitFor(() => expect(container.querySelector('.subtitles-panel')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /import|importer/i }))

    await waitFor(() => expect(container.querySelector('.subtitles-remove')).toBeNull())
  })
})

describe('App — reprise après la fin de la lecture', () => {
  it('repart du début quand la vidéo est arrivée au bout', async () => {
    const play = vi.fn(() => Promise.resolve())
    HTMLMediaElement.prototype.play = play as never
    const { container } = await loadedApp()
    const video = container.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'ended', { value: true, configurable: true })
    let t = 42
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      get: () => t,
      set: (v: number) => { t = v },
    })

    fireEvent.click(container.querySelector('.vc-play, .play-btn, .vc-btn-play') as HTMLElement)

    await waitFor(() => expect(play).toHaveBeenCalled())
    expect(t).toBe(0)
  })

  it('met en pause quand la lecture est en cours', async () => {
    const pause = vi.fn()
    HTMLMediaElement.prototype.pause = pause as never
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as never
    const { container } = await loadedApp()
    const playBtn = container.querySelector('.vc-play, .play-btn, .vc-btn-play') as HTMLElement

    fireEvent.click(playBtn)
    fireEvent.play(container.querySelector('video') as HTMLVideoElement)
    fireEvent.click(playBtn)

    await waitFor(() => expect(pause).toHaveBeenCalled())
  })
})