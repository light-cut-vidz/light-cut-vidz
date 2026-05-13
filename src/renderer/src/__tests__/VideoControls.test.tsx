import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import VideoControls from '../components/VideoControls'

describe('VideoControls', () => {
  const defaultProps = {
    currentTime: 0,
    duration: 100,
    isPlaying: false,
    onPlayPause: vi.fn(),
    onSeek: vi.fn(),
  }

  it('renders play button when paused', () => {
    render(<VideoControls {...defaultProps} />)
    const btn = screen.getByRole('button')
    expect(btn).toBeTruthy()
  })

  it('calls onPlayPause when play button is clicked', () => {
    const onPlayPause = vi.fn()
    render(<VideoControls {...defaultProps} onPlayPause={onPlayPause} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onPlayPause).toHaveBeenCalledOnce()
  })

  it('displays current time and duration', () => {
    const { container } = render(<VideoControls {...defaultProps} currentTime={65} duration={120} />)
    const timeEl = container.querySelector('.vc-time')!
    expect(timeEl.textContent).toMatch(/1:05/)
    expect(timeEl.textContent).toMatch(/2:00/)
  })

  it('shows pause icon when playing', () => {
    const { container } = render(<VideoControls {...defaultProps} isPlaying={true} />)
    // Pause icon has two rect elements
    const rects = container.querySelectorAll('rect')
    expect(rects.length).toBe(2)
  })

  it('calls onSeek when seekbar is clicked', () => {
    const onSeek = vi.fn()
    const { container } = render(<VideoControls {...defaultProps} onSeek={onSeek} duration={100} />)
    const seekbar = container.querySelector('.seekbar')!
    Object.defineProperty(seekbar, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 100, top: 0, bottom: 0, right: 100, height: 10 }),
    })
    seekbar.setPointerCapture = vi.fn()
    fireEvent.pointerDown(seekbar, { clientX: 50, buttons: 1 })
    expect(onSeek).toHaveBeenCalledWith(expect.closeTo(50, 0))
  })
})
