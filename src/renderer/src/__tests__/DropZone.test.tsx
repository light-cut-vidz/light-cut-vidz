import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import DropZone from '../components/DropZone'
import { LangProvider } from '../i18n'

function renderWithI18n(ui: React.ReactElement) {
  return render(<LangProvider>{ui}</LangProvider>)
}

describe('DropZone', () => {
  it('renders the browse button', () => {
    renderWithI18n(<DropZone onDrop={vi.fn()} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: /browse|parcourir/i })).toBeTruthy()
  })

  it('calls onOpen when the browse button is clicked', () => {
    const onOpen = vi.fn()
    renderWithI18n(<DropZone onDrop={vi.fn()} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /browse|parcourir/i }))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('adds the dragging class on drag over', () => {
    const { container } = renderWithI18n(<DropZone onDrop={vi.fn()} onOpen={vi.fn()} />)
    const zone = container.querySelector('.dropzone')!
    fireEvent.dragOver(zone)
    expect(zone.classList.contains('dragging')).toBe(true)
  })

  it('removes the dragging class on drag leave', () => {
    const { container } = renderWithI18n(<DropZone onDrop={vi.fn()} onOpen={vi.fn()} />)
    const zone = container.querySelector('.dropzone')!
    fireEvent.dragOver(zone)
    fireEvent.dragLeave(zone)
    expect(zone.classList.contains('dragging')).toBe(false)
  })

  it('calls onDrop with file path for a video file', () => {
    const onDrop = vi.fn()
    const { container } = renderWithI18n(<DropZone onDrop={onDrop} onOpen={vi.fn()} />)
    const zone = container.querySelector('.dropzone')!
    const file = new File(['x'], 'movie.mp4', { type: 'video/mp4' })
    Object.defineProperty(file, 'path', { value: '/tmp/movie.mp4', configurable: true })
    fireEvent.drop(zone, { dataTransfer: { files: [file] } })
    expect(onDrop).toHaveBeenCalledWith('/tmp/movie.mp4')
  })

  it('falls back to file name when path is unavailable', () => {
    const onDrop = vi.fn()
    const { container } = renderWithI18n(<DropZone onDrop={onDrop} onOpen={vi.fn()} />)
    const zone = container.querySelector('.dropzone')!
    const file = new File(['x'], 'noPath.mp4', { type: 'video/mp4' })
    fireEvent.drop(zone, { dataTransfer: { files: [file] } })
    expect(onDrop).toHaveBeenCalledWith('noPath.mp4')
  })

  it('ignores non-video files', () => {
    const onDrop = vi.fn()
    const { container } = renderWithI18n(<DropZone onDrop={onDrop} onOpen={vi.fn()} />)
    const zone = container.querySelector('.dropzone')!
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    fireEvent.drop(zone, { dataTransfer: { files: [file] } })
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('ignores drops with empty files list', () => {
    const onDrop = vi.fn()
    const { container } = renderWithI18n(<DropZone onDrop={onDrop} onOpen={vi.fn()} />)
    const zone = container.querySelector('.dropzone')!
    fireEvent.drop(zone, { dataTransfer: { files: [] } })
    expect(onDrop).not.toHaveBeenCalled()
  })

  it('clears dragging class after drop', () => {
    const { container } = renderWithI18n(<DropZone onDrop={vi.fn()} onOpen={vi.fn()} />)
    const zone = container.querySelector('.dropzone')!
    fireEvent.dragOver(zone)
    expect(zone.classList.contains('dragging')).toBe(true)
    const file = new File(['x'], 'a.mp4', { type: 'video/mp4' })
    fireEvent.drop(zone, { dataTransfer: { files: [file] } })
    expect(zone.classList.contains('dragging')).toBe(false)
  })
})
