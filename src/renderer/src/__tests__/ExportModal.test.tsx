import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import React from 'react'
import ExportModal from '../components/ExportModal'
import { LangProvider } from '../i18n'
import type { EditorState } from '../App'

const baseState: EditorState = {
  videoPath: '/tmp/clip.mp4',
  videoUrl: 'file:///tmp/clip.mp4',
  duration: 100,
  speed: 1,
  muted: false,
  cutSegments: [],
  crop: null,
  filter: 'none',
  rotation: 0,
  straighten: 0,
  perspectiveHorizontal: 0,
  perspectiveVertical: 0,
}

function r(state: Partial<EditorState> = {}, onClose = vi.fn()) {
  return render(
    <LangProvider>
      <ExportModal state={{ ...baseState, ...state }} onClose={onClose} />
    </LangProvider>,
  )
}

describe('ExportModal', () => {
  beforeEach(() => {
    window.electronAPI = {
      ...window.electronAPI,
      onProgress: () => () => {},
      saveVideo: vi.fn().mockResolvedValue('/tmp/out.mp4'),
      exportVideo: vi.fn().mockResolvedValue({ success: true, outputPath: '/tmp/out.mp4' }),
    }
  })

  it('renders the modal with all format cards', () => {
    const { container } = r()
    expect(container.querySelectorAll('.format-card')).toHaveLength(5)
  })

  it('starts with MP4 selected by default', () => {
    const { container } = r()
    const selected = container.querySelector('.format-card.selected')!
    expect(selected.textContent).toContain('MP4')
  })

  it('selects a different format when clicked', () => {
    const { container } = r()
    const webm = Array.from(container.querySelectorAll('.format-card')).find(c => c.textContent?.includes('WebM'))!
    fireEvent.click(webm)
    expect(webm.className).toContain('selected')
  })

  it('shows the kept duration in summary', () => {
    const { container } = r({ duration: 60 })
    expect(container.textContent).toMatch(/1:00/)
  })

  it('shows the audio status in summary (sound on)', () => {
    const { container } = r({ muted: false })
    expect(container.textContent).toMatch(/sound on|son activé|on|activé/i)
  })

  it('shows the audio status in summary (muted)', () => {
    const { container } = r({ muted: true })
    expect(container.textContent).toMatch(/muted|muet/i)
  })

  it('shows crop dimensions in summary', () => {
    const { container } = r({ crop: { x: 0, y: 0, w: 400, h: 200 } })
    expect(container.textContent).toMatch(/400×200/)
  })

  it('shows "None" when no crop is set', () => {
    const { container } = r({ crop: null })
    expect(container.textContent).toMatch(/none|aucun/i)
  })

  it('shows cut count when segments exist', () => {
    const { container } = r({ cutSegments: [{ id: 'a', start: 0, end: 10 }, { id: 'b', start: 20, end: 30 }] })
    expect(container.textContent).toMatch(/2 segment/i)
  })

  it('shows current speed in summary', () => {
    const { container } = r({ speed: 1.5 })
    expect(container.textContent).toMatch(/1\.5x/)
  })

  it('shows current filter name in summary', () => {
    const { container } = r({ filter: 'grayscale' })
    expect(container.textContent).toMatch(/grayscale|gris/i)
  })

  it('shows the geometry summary line', () => {
    const { container } = r({ rotation: 90, straighten: 5, perspectiveHorizontal: 10, perspectiveVertical: -5 })
    // 90 + 5 = 95° / H: 10 / V: -5
    expect(container.textContent).toMatch(/95°.*10.*-5/)
  })

  it('closes when the close button is clicked', () => {
    const onClose = vi.fn()
    const { container } = r({}, onClose)
    fireEvent.click(container.querySelector('.modal-close')!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes when the cancel button is clicked', () => {
    const onClose = vi.fn()
    r({}, onClose)
    fireEvent.click(screen.getByText(/cancel|annuler/i))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('closes when clicking the modal backdrop', () => {
    const onClose = vi.fn()
    const { container } = r({}, onClose)
    fireEvent.click(container.querySelector('.modal-backdrop')!)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not close when clicking inside the modal body', () => {
    const onClose = vi.fn()
    const { container } = r({}, onClose)
    fireEvent.click(container.querySelector('.modal')!)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('invokes saveVideo + exportVideo when export is clicked', async () => {
    const saveVideo = vi.fn().mockResolvedValue('/tmp/out.mp4')
    const exportVideo = vi.fn().mockResolvedValue({ success: true, outputPath: '/tmp/out.mp4' })
    window.electronAPI = { ...window.electronAPI, saveVideo, exportVideo }
    r()
    fireEvent.click(screen.getByRole('button', { name: /^export(er)?$/i }))
    await waitFor(() => expect(saveVideo).toHaveBeenCalled())
    await waitFor(() => expect(exportVideo).toHaveBeenCalled())
  })

  it('does not call exportVideo when the save dialog is cancelled', async () => {
    const exportVideo = vi.fn().mockResolvedValue({ success: true, outputPath: '' })
    window.electronAPI = {
      ...window.electronAPI,
      saveVideo: vi.fn().mockResolvedValue(null),
      exportVideo,
    }
    r()
    fireEvent.click(screen.getByRole('button', { name: /^export(er)?$/i }))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(exportVideo).not.toHaveBeenCalled()
  })
})
