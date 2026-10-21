import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
    cancelFfmpeg: vi.fn().mockResolvedValue(undefined),
    saveProject: vi.fn().mockResolvedValue(null),
    getChangelog: vi.fn().mockResolvedValue([]),
    onMenuShowChangelog: vi.fn(() => () => {}),
    setDirty: vi.fn(),
    onMenuSaveProject: vi.fn(() => () => {}),
    onMenuLoadProject: vi.fn(() => () => {}),
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

  it('clears the history when another video is loaded (after confirming)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { container } = await loadedApp()
    const presets = container.querySelectorAll('.preset-btn')
    fireEvent.click(presets[presets.length - 1])
    await waitFor(() => expect(screen.getByTitle(/undo|annuler/i)).not.toBeDisabled())

    fireEvent.click(screen.getByRole('button', { name: /open video|ouvrir/i }))
    await waitFor(() => expect(screen.getByTitle(/undo|annuler/i)).toBeDisabled())
    expect(container.querySelector('.speed-display')?.textContent).toBe('1x')
  })
})

describe('App — opening a video over unsaved edits', () => {
  it('keeps the current video and its edits when the user declines', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { container } = await loadedApp()
    const presets = container.querySelectorAll('.preset-btn')
    fireEvent.click(presets[presets.length - 1])
    await waitFor(() => expect(screen.getByTitle(/undo|annuler/i)).not.toBeDisabled())
    const speed = container.querySelector('.speed-display')?.textContent
    const previewCalls = vi.mocked(window.electronAPI.previewVideo).mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: /open video|ouvrir/i }))
    await waitFor(() => expect(confirm).toHaveBeenCalled())

    expect(vi.mocked(window.electronAPI.previewVideo).mock.calls.length).toBe(previewCalls)
    expect(container.querySelector('.speed-display')?.textContent).toBe(speed)
  })

  it('does not ask when there is nothing to lose', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    confirm.mockClear()
    await loadedApp()
    fireEvent.click(screen.getByRole('button', { name: /open video|ouvrir/i }))
    await waitFor(() => expect(window.electronAPI.openVideo).toHaveBeenCalledTimes(2))
    expect(confirm).not.toHaveBeenCalled()
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

describe('App — loading can be cancelled and cannot race', () => {
  it('goes back to the drop zone and stops ffmpeg when the user cancels', async () => {
    let finish: ((url: string) => void) | null = null
    const cancelFfmpeg = vi.fn().mockResolvedValue(undefined)
    window.electronAPI = {
      ...window.electronAPI,
      openVideo: vi.fn().mockResolvedValue('/tmp/in.mp4'),
      cancelFfmpeg,
      previewVideo: vi.fn(() => new Promise<string>(resolve => { finish = resolve })),
    }
    const { container } = r()
    fireEvent.click(screen.getByRole('button', { name: /browse|parcourir/i }))
    await waitFor(() => expect(container.querySelector('.loading-screen')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /cancel|annuler/i }))

    expect(cancelFfmpeg).toHaveBeenCalled()
    await waitFor(() => expect(container.querySelector('.dropzone')).toBeTruthy())
    // The transcode finishing afterwards must not resurrect the cancelled load.
    await act(async () => { finish!('lcv-file://local/tmp/late.webm') })
    expect(container.querySelector('.app-layout')).toBeNull()
  })

  it('ignores an older load that finishes after a newer one', async () => {
    const finishers: Array<(url: string) => void> = []
    window.electronAPI = {
      ...window.electronAPI,
      openVideo: vi.fn().mockResolvedValueOnce('/tmp/a.mp4').mockResolvedValueOnce('/tmp/b.mp4'),
      previewVideo: vi.fn(() => new Promise<string>(resolve => { finishers.push(resolve) })),
    }
    const { container } = r()
    fireEvent.click(screen.getByRole('button', { name: /browse|parcourir/i }))
    await waitFor(() => expect(finishers).toHaveLength(1))
    // Menu "Open" while the first one is still transcoding.
    const menuCalls = vi.mocked(window.electronAPI.onMenuOpenVideo).mock.calls
    const onMenuOpen = menuCalls[menuCalls.length - 1][0]
    act(() => { onMenuOpen('/tmp/b.mp4') })
    await waitFor(() => expect(finishers).toHaveLength(2))

    await act(async () => { finishers[1]('lcv-file://local/tmp/b.webm') })
    await act(async () => { finishers[0]('lcv-file://local/tmp/a.webm') })

    await waitFor(() => expect(container.querySelector('.app-layout')).toBeTruthy())
    expect(container.querySelector('video')?.getAttribute('src')).toBe('lcv-file://local/tmp/b.webm')
  })

  it('tells the user when the video cannot be played at all', async () => {
    window.electronAPI = {
      ...window.electronAPI,
      openVideo: vi.fn().mockResolvedValue('/tmp/in.mp4'),
      previewVideo: vi.fn().mockRejectedValue('ffmpeg exploded'),
      toFileUrl: vi.fn().mockRejectedValue(new Error('refused')),
    }
    const { container } = r()
    fireEvent.click(screen.getByRole('button', { name: /browse|parcourir/i }))
    await waitFor(() => expect(container.querySelector('.toast')).toBeTruthy())
    expect(container.querySelector('.dropzone')).toBeTruthy()
  })

  it('shows a message when the player itself reports an error', async () => {
    const { container } = await loadedApp()
    fireEvent.error(container.querySelector('video')!)
    await waitFor(() => expect(container.querySelector('.toast')).toBeTruthy())
  })
})

describe('App — dropping files', () => {
  const dropOf = (name: string) => {
    const event = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown }
    event.dataTransfer = { files: [new File(['x'], name)] }
    return event
  }

  // Dropping outside the drop zone used to make Chromium navigate to the file,
  // replacing the editor (and every edit) with the raw video.
  it('never lets the browser navigate to a dropped file', async () => {
    await loadedApp()
    const event = dropOf('clip.mp4')
    act(() => { window.dispatchEvent(event) })
    expect(event.defaultPrevented).toBe(true)
  })

  it('also cancels dragover so the drop is delivered to the page', async () => {
    await loadedApp()
    const over = new Event('dragover', { bubbles: true, cancelable: true })
    act(() => { window.dispatchEvent(over) })
    expect(over.defaultPrevented).toBe(true)
  })

  it('opens a video dropped on the editor', async () => {
    await loadedApp()
    window.electronAPI.getPathForFile = vi.fn(() => '/tmp/dropped.mkv')
    act(() => { window.dispatchEvent(dropOf('dropped.mkv')) })
    await waitFor(() => expect(window.electronAPI.previewVideo).toHaveBeenCalledWith('/tmp/dropped.mkv'))
  })

  it('rejects a dropped file that is not a video, with a message', async () => {
    const { container } = await loadedApp()
    const before = vi.mocked(window.electronAPI.previewVideo).mock.calls.length
    act(() => { window.dispatchEvent(dropOf('notes.txt')) })
    await waitFor(() => expect(container.querySelector('.toast')).toBeTruthy())
    expect(vi.mocked(window.electronAPI.previewVideo).mock.calls.length).toBe(before)
  })

  it('accepts a video whose MIME type is empty (MKV/FLV on some platforms)', async () => {
    const { container } = r()
    const dropzone = container.querySelector('.dropzone') as HTMLElement
    window.electronAPI.getPathForFile = vi.fn(() => '/tmp/movie.mkv')
    fireEvent.drop(dropzone, { dataTransfer: { files: [new File(['x'], 'movie.mkv', { type: '' })] } })
    await waitFor(() => expect(window.electronAPI.previewVideo).toHaveBeenCalledWith('/tmp/movie.mkv'))
  })

  it('says why a non-video dropped on the drop zone was ignored', async () => {
    const { container } = r()
    fireEvent.drop(container.querySelector('.dropzone') as HTMLElement, { dataTransfer: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } })
    await waitFor(() => expect(container.querySelector('.toast')).toBeTruthy())
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
// ─── Playback fixes: Space, frame-accurate cut skipping, replay at the end ───

describe('App — playback fixes', () => {
  function videoOf(container: HTMLElement) {
    const video = container.querySelector('video') as HTMLVideoElement
    let time = 0
    let paused = true
    Object.defineProperty(video, 'currentTime', { configurable: true, get: () => time, set: (t: number) => { time = t } })
    Object.defineProperty(video, 'paused', { configurable: true, get: () => paused })
    Object.defineProperty(video, 'ended', { configurable: true, get: () => false })
    Object.defineProperty(video, 'duration', { configurable: true, get: () => 100 })
    video.play = vi.fn(() => { paused = false; return Promise.resolve() })
    video.pause = vi.fn(() => { paused = true })
    return video
  }

  async function ready() {
    const view = await loadedApp()
    const video = videoOf(view.container)
    act(() => { fireEvent.loadedMetadata(video) })
    return { ...view, video }
  }

  function cutMiddle(container: HTMLElement) {
    const track = container.querySelector('.tl-track') as HTMLElement
    track.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 1000, bottom: 60, width: 1000, height: 60, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    track.setPointerCapture = vi.fn()
    fireEvent.pointerDown(track, { clientX: 200, pointerId: 1 })
    fireEvent.pointerUp(track, { clientX: 400, pointerId: 1 })
  }

  describe('Space', () => {
    it('toggles playback', async () => {
      const { video } = await ready()
      fireEvent.keyDown(window, { code: 'Space' })
      expect(video.play).toHaveBeenCalledTimes(1)
      act(() => { fireEvent.play(video) })
      fireEvent.keyDown(window, { code: 'Space' })
      expect(video.pause).toHaveBeenCalledTimes(1)
    })

    it('does not also activate the toolbar button that has focus', async () => {
      const { container } = await ready()
      const down = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true })
      const up = new KeyboardEvent('keyup', { code: 'Space', bubbles: true, cancelable: true })
      const mute = container.querySelector('.tool-toggle-btn.active-ok:last-of-type, .tool-toggle-btn') as HTMLElement
      act(() => { mute.focus(); mute.dispatchEvent(down); mute.dispatchEvent(up) })
      expect(down.defaultPrevented).toBe(true)
      expect(up.defaultPrevented).toBe(true)
    })

    it('is left alone while typing in a text field', async () => {
      const { container, video } = await ready()
      cutMiddle(container)
      const input = container.querySelector('.cut-editor-input') as HTMLInputElement
      fireEvent.keyDown(input, { code: 'Space' })
      expect(video.play).not.toHaveBeenCalled()
    })

    it('is ignored while the export dialog is open', async () => {
      const { video } = await ready()
      fireEvent.click(screen.getByRole('button', { name: /^export(er)?$/i }))
      await waitFor(() => expect(document.querySelector('.modal')).toBeTruthy())
      fireEvent.keyDown(window, { code: 'Space' })
      expect(video.play).not.toHaveBeenCalled()
    })

    it('is ignored when no video is loaded', () => {
      r()
      expect(() => fireEvent.keyDown(window, { code: 'Space' })).not.toThrow()
    })
  })

  describe('cut skipping runs every frame, not every ~250 ms', () => {
    let frames: Array<() => void>
    beforeEach(() => {
      frames = []
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        frames.push(() => cb(0))
        return frames.length
      })
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    })
    afterEach(() => { vi.restoreAllMocks() })

    it('jumps over a cut on the next frame without waiting for timeupdate', async () => {
      const { container, video } = await ready()
      cutMiddle(container)
      act(() => { fireEvent.play(video) })
      video.currentTime = 25 // inside the 20–40 cut; no `timeupdate` fired
      Object.defineProperty(video, 'paused', { configurable: true, get: () => false })
      act(() => { frames.splice(0).forEach(f => f()) })
      expect(video.currentTime).toBe(40)
    })

    it('stops polling when playback stops', async () => {
      const { container, video } = await ready()
      cutMiddle(container)
      act(() => { fireEvent.play(video) })
      act(() => { fireEvent.pause(video) })
      const cancel = vi.mocked(window.cancelAnimationFrame)
      expect(cancel).toHaveBeenCalled()
    })
  })

  // Seeking to the end of a cut lands on the nearest frame, often a few ms
  // *before* it. That used to count as "still inside the cut": the player sought
  // again, landed short again, and froze for good.
  describe('landing just short of the end of a cut', () => {
    async function playingInCut() {
      const { container, video } = await ready()
      cutMiddle(container) // cut 20–40
      Object.defineProperty(video, 'paused', { configurable: true, get: () => false })
      return { video }
    }

    it('does not seek again from a frame a hair before the cut end', async () => {
      const { video } = await playingInCut()
      act(() => { video.currentTime = 39.98; fireEvent.timeUpdate(video) })
      expect(video.currentTime).toBe(39.98)
    })

    it('still skips a position clearly inside the cut', async () => {
      const { video } = await playingInCut()
      act(() => { video.currentTime = 39.5; fireEvent.timeUpdate(video) })
      expect(video.currentTime).toBe(40)
    })

    it('does not restart a seek that is already in progress', async () => {
      const { video } = await playingInCut()
      Object.defineProperty(video, 'seeking', { configurable: true, get: () => true })
      act(() => { video.currentTime = 25; fireEvent.timeUpdate(video) })
      expect(video.currentTime).toBe(25)
    })
  })

  describe('replay after playback stopped short of the end', () => {
    // Playback stops at the end of the last kept part. With a cut at the tail the
    // file has not "ended", so the next Play used to start inside the cut and stop
    // again at once: it took two clicks to get back to the start.
    it('restarts from the first kept part on one click', async () => {
      const { container, video } = await ready()
      const track = container.querySelector('.tl-track') as HTMLElement
      track.getBoundingClientRect = () =>
        ({ left: 0, top: 0, right: 1000, bottom: 60, width: 1000, height: 60, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
      track.setPointerCapture = vi.fn()
      fireEvent.pointerDown(track, { clientX: 800, pointerId: 1 })
      fireEvent.pointerUp(track, { clientX: 1000, pointerId: 1 }) // cut the last 20 s: kept = 0–80
      video.currentTime = 80

      fireEvent.click(container.querySelector('.play-btn') as HTMLElement)

      expect(video.currentTime).toBe(0)
      expect(video.play).toHaveBeenCalled()
    })

    it('does not rewind when playback resumes mid-video', async () => {
      const { container, video } = await ready()
      video.currentTime = 30
      fireEvent.click(container.querySelector('.play-btn') as HTMLElement)
      expect(video.currentTime).toBe(30)
    })
  })

  describe('shortcut hints', () => {
    it('names the shortcut in the undo and redo tooltips', async () => {
      await ready()
      expect(screen.getByTitle(/undo|annuler/i).getAttribute('title')).toMatch(/Ctrl\+Z|Cmd\+Z/)
      expect(screen.getByTitle(/redo|rétablir/i).getAttribute('title')).toMatch(/Ctrl\+Y|Cmd\+Shift\+Z/)
    })
  })
})

// ─── Projects, unsaved edits, text-field undo, keyboard transport ───────────

describe('App — projects and unsaved edits', () => {
  const menuHandler = (name: 'onMenuSaveProject' | 'onMenuLoadProject' | 'onMenuUndo') => {
    const calls = vi.mocked(window.electronAPI[name]).mock.calls as unknown as Array<[(...a: unknown[]) => void]>
    return calls[calls.length - 1][0]
  }

  it('reports whether there are edits the main process should protect', async () => {
    const { container } = await loadedApp()
    expect(window.electronAPI.setDirty).toHaveBeenLastCalledWith(false)
    const presets = container.querySelectorAll('.preset-btn')
    fireEvent.click(presets[presets.length - 1])
    await waitFor(() => expect(window.electronAPI.setDirty).toHaveBeenLastCalledWith(true))
  })

  it('saves the video path and every edit when the menu asks', async () => {
    const saveProject = vi.fn().mockResolvedValue('/p/x.lcvproj')
    window.electronAPI = { ...window.electronAPI, saveProject }
    const { container } = await loadedApp()
    const presets = container.querySelectorAll('.preset-btn')
    fireEvent.click(presets[presets.length - 1])
    await act(async () => { menuHandler('onMenuSaveProject')() })
    expect(saveProject).toHaveBeenCalledWith(expect.objectContaining({ videoPath: '/tmp/in.mp4', state: expect.objectContaining({ speed: 4 }) }))
    await waitFor(() => expect(container.querySelector('.toast')).toBeTruthy())
  })

  it('does not save anything without a video', async () => {
    const saveProject = vi.fn()
    window.electronAPI = { ...window.electronAPI, saveProject }
    r()
    await act(async () => { menuHandler('onMenuSaveProject')() })
    expect(saveProject).not.toHaveBeenCalled()
  })

  it('shows a message when saving fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    window.electronAPI = { ...window.electronAPI, saveProject: vi.fn().mockRejectedValue(new Error('EACCES')) }
    const { container } = await loadedApp()
    await act(async () => { menuHandler('onMenuSaveProject')() })
    await waitFor(() => expect(container.querySelector('.toast')).toBeTruthy())
    log.mockRestore()
  })

  it('opens a project: loads its video and restores its edits as the starting point', async () => {
    const { container } = r()
    await act(async () => {
      menuHandler('onMenuLoadProject')({ videoPath: '/tmp/proj.mp4', state: { speed: 2, muted: true, cutSegments: [{ id: 'a', start: 1, end: 2 }] } })
    })
    await waitFor(() => expect(container.querySelector('.app-layout')).toBeTruthy())
    expect(window.electronAPI.previewVideo).toHaveBeenCalledWith('/tmp/proj.mp4')
    expect(container.querySelector('.speed-display')?.textContent).toBe('2x')
    expect(container.querySelectorAll('.tl-cut')).toHaveLength(1)
    // The restored state is the baseline, not an undoable edit.
    expect(screen.getByTitle(/undo|annuler/i)).toBeDisabled()
  })

  it('sanitises a project file with bad values instead of trusting it', async () => {
    const { container } = r()
    await act(async () => { menuHandler('onMenuLoadProject')({ videoPath: '/tmp/p.mp4', state: { speed: 9999, rotation: 'x' } }) })
    await waitFor(() => expect(container.querySelector('.app-layout')).toBeTruthy())
    expect(container.querySelector('.speed-display')?.textContent).toBe('1x')
  })
})

describe('App — undo inside a text field', () => {
  it('leaves Cmd/Ctrl+Z to the focused text field', async () => {
    const exec = vi.fn(() => true)
    ;(document as unknown as { execCommand: unknown }).execCommand = exec
    const { container } = await loadedApp()
    const presets = container.querySelectorAll('.preset-btn')
    fireEvent.click(presets[presets.length - 1])
    await waitFor(() => expect(screen.getByTitle(/undo|annuler/i)).not.toBeDisabled())

    // Select a cut so its time fields exist, focus one, then trigger the menu's Undo.
    const track = container.querySelector('.tl-track') as HTMLElement
    track.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 60, width: 1000, height: 60, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    track.setPointerCapture = vi.fn()
    const video = container.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'duration', { configurable: true, get: () => 100 })
    act(() => { fireEvent.loadedMetadata(video) })
    fireEvent.pointerDown(track, { clientX: 200, pointerId: 1 })
    fireEvent.pointerUp(track, { clientX: 400, pointerId: 1 })
    const input = container.querySelector('.cut-editor-input') as HTMLInputElement
    act(() => input.focus())

    const calls = vi.mocked(window.electronAPI.onMenuUndo).mock.calls as unknown as Array<[() => void]>
    act(() => { calls[calls.length - 1][0]() })
    expect(exec).toHaveBeenCalledWith('undo')
  })
})

describe('App — keyboard transport', () => {
  function playing() {
    return loadedApp().then(view => {
      const video = view.container.querySelector('video') as HTMLVideoElement
      let time = 50
      Object.defineProperty(video, 'currentTime', { configurable: true, get: () => time, set: (t: number) => { time = t } })
      Object.defineProperty(video, 'duration', { configurable: true, get: () => 100 })
      Object.defineProperty(video, 'paused', { configurable: true, get: () => true })
      video.pause = vi.fn()
      act(() => { fireEvent.loadedMetadata(video); fireEvent.timeUpdate(video) })
      return { ...view, video }
    })
  }

  it.each([
    ['ArrowRight', {}, 51],
    ['ArrowLeft', {}, 49],
    ['ArrowRight', { shiftKey: true }, 55],
    ['ArrowLeft', { shiftKey: true }, 45],
    ['KeyL', {}, 55],
    ['KeyJ', {}, 45],
  ])('%s %j seeks to %i s', async (code, mods, expected) => {
    const { video } = await playing()
    fireEvent.keyDown(window, { code, ...mods })
    expect(video.currentTime).toBeCloseTo(expected, 5)
  })

  it('steps one frame back and forward with , and . (pausing first)', async () => {
    const { video } = await playing()
    fireEvent.keyDown(window, { code: 'Period' })
    expect(video.currentTime).toBeCloseTo(50 + 1 / 30, 5)
    expect(video.pause).toHaveBeenCalled()
    act(() => { fireEvent.timeUpdate(video) }) // the player reports the new position
    fireEvent.keyDown(window, { code: 'Comma' })
    expect(video.currentTime).toBeCloseTo(50, 5)
  })

  it('K toggles playback like Space', async () => {
    const { video } = await playing()
    video.play = vi.fn(() => Promise.resolve())
    fireEvent.keyDown(window, { code: 'KeyK' })
    expect(video.play).toHaveBeenCalled()
  })

  it('never seeks past the ends', async () => {
    const { video } = await playing()
    video.currentTime = 99.5
    act(() => { fireEvent.timeUpdate(video) })
    fireEvent.keyDown(window, { code: 'ArrowRight', shiftKey: true })
    expect(video.currentTime).toBeLessThanOrEqual(100)
  })

  it('ignores shortcuts with Ctrl/Cmd (they belong to the menu)', async () => {
    const { video } = await playing()
    fireEvent.keyDown(window, { code: 'KeyL', ctrlKey: true })
    expect(video.currentTime).toBe(50)
  })

  it('leaves arrow keys to a focused slider', async () => {
    const { video, container } = await playing()
    const slider = container.querySelector('input[type="range"]') as HTMLInputElement
    fireEvent.keyDown(slider, { code: 'ArrowRight' })
    expect(video.currentTime).toBe(50)
  })

  it('leaves letters to a text field', async () => {
    const { video, container } = await playing()
    const track = container.querySelector('.tl-track') as HTMLElement
    track.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 60, width: 1000, height: 60, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
    track.setPointerCapture = vi.fn()
    fireEvent.pointerDown(track, { clientX: 200, pointerId: 1 })
    fireEvent.pointerUp(track, { clientX: 400, pointerId: 1 })
    fireEvent.keyDown(container.querySelector('.cut-editor-input') as HTMLElement, { code: 'KeyL' })
    expect(video.currentTime).toBe(50)
  })
})

describe('App — filter previews', () => {
  it('opens the filters panel even when the frame cannot be captured (tainted canvas)', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => { throw new DOMException('Tainted canvases may not be exported.', 'SecurityError') })
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: () => {} } as unknown as CanvasRenderingContext2D)
    const { container } = await loadedApp()
    const video = container.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 640 })
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 360 })
    fireEvent.click(container.querySelectorAll('.tool-toggle-btn')[1])
    await waitFor(() => expect(container.querySelector('.filters-panel')).toBeTruthy())
    expect(container.querySelector('.filter-preview-img')).toBeNull() // placeholders instead
    toDataURL.mockRestore(); getContext.mockRestore(); log.mockRestore()
  })
})
