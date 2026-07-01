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

  it('falls back to direct file URL when transcode fails', async () => {
    const previewVideo = vi.fn().mockRejectedValue(new Error('boom'))
    window.electronAPI = {
      ...window.electronAPI,
      openVideo: vi.fn().mockResolvedValue('/tmp/in.mp4'),
      previewVideo,
    }
    const { container } = r()
    fireEvent.click(screen.getByRole('button', { name: /browse|parcourir/i }))
    await waitFor(() => expect(container.querySelector('.app-layout')).toBeTruthy())
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
