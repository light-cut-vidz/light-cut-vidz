import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import React, { useRef } from 'react'
import CropOverlay from '../components/CropOverlay'
import { LangProvider } from '../i18n'
import type { CropRect } from '../App'

function makeVideo(width = 1920, height = 1080, displayWidth = 960) {
  const video = document.createElement('video') as HTMLVideoElement
  Object.defineProperty(video, 'videoWidth', { value: width, configurable: true })
  Object.defineProperty(video, 'videoHeight', { value: height, configurable: true })
  video.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: displayWidth, bottom: displayWidth * (height / width), width: displayWidth, height: displayWidth * (height / width), x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  return video
}

function Harness({ crop, onChange, onApply }: { crop?: CropRect | null; onChange?: (c: CropRect) => void; onApply?: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(makeVideo())
  return (
    <CropOverlay
      videoRef={videoRef}
      crop={crop ?? null}
      onChange={onChange ?? vi.fn()}
      onApply={onApply ?? vi.fn()}
    />
  )
}

describe('CropOverlay', () => {
  it('renders the apply button', () => {
    const { container } = render(<LangProvider><Harness /></LangProvider>)
    expect(container.querySelector('.crop-apply-btn')).toBeTruthy()
  })

  it('renders four corner handles', () => {
    const { container } = render(<LangProvider><Harness /></LangProvider>)
    expect(container.querySelectorAll('.crop-handle')).toHaveLength(4)
  })

  it('renders the crop-box and grid', () => {
    const { container } = render(<LangProvider><Harness /></LangProvider>)
    expect(container.querySelector('.crop-box')).toBeTruthy()
    expect(container.querySelector('.crop-grid')).toBeTruthy()
  })

  it('shows current dimensions', () => {
    const { container } = render(<LangProvider><Harness crop={{ x: 0, y: 0, w: 400, h: 200 }} /></LangProvider>)
    expect(container.textContent).toMatch(/400.*200/)
  })

  it('calls onApply when the apply button is clicked', () => {
    const onApply = vi.fn()
    const { container } = render(<LangProvider><Harness onApply={onApply} /></LangProvider>)
    fireEvent.click(container.querySelector('.crop-apply-btn')!)
    expect(onApply).toHaveBeenCalled()
  })

  it('calls onApply when Enter is pressed', () => {
    const onApply = vi.fn()
    render(<LangProvider><Harness onApply={onApply} /></LangProvider>)
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onApply).toHaveBeenCalled()
  })

  it('ignores other keys', () => {
    const onApply = vi.fn()
    render(<LangProvider><Harness onApply={onApply} /></LangProvider>)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onApply).not.toHaveBeenCalled()
  })

  it('removes the keydown listener on unmount', () => {
    const onApply = vi.fn()
    const { unmount } = render(<LangProvider><Harness onApply={onApply} /></LangProvider>)
    unmount()
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(onApply).not.toHaveBeenCalled()
  })
})
