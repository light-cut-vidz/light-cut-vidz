import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import React from 'react'
import Timeline from '../components/Timeline'
import { LangProvider } from '../i18n'
import type { TrimSegment } from '../App'

class ResizeObserverStub {
  observe() { /* noop */ }
  unobserve() { /* noop */ }
  disconnect() { /* noop */ }
}

beforeEach(() => {
  // jsdom doesn't ship ResizeObserver
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub
})

function mockTrackRect(container: HTMLElement, left = 0, width = 100) {
  const track = container.querySelector('.tl-track') as HTMLElement
  track.getBoundingClientRect = () =>
    ({ left, top: 0, right: left + width, bottom: 40, width, height: 40, x: left, y: 0, toJSON: () => ({}) }) as DOMRect
  track.setPointerCapture = vi.fn()
  return track
}

function makeProps(overrides: Partial<{
  duration: number
  currentTime: number
  cutSegments: TrimSegment[]
  videoUrl: string
  onSeek: (t: number) => void
  onCutSegmentsChange: (segs: TrimSegment[]) => void
}> = {}) {
  return {
    duration: 100,
    currentTime: 0,
    cutSegments: [],
    videoUrl: 'file:///x.mp4',
    onSeek: vi.fn(),
    onCutSegmentsChange: vi.fn(),
    ...overrides,
  }
}

function r(props: ReturnType<typeof makeProps>) {
  return render(<LangProvider><Timeline {...props} /></LangProvider>)
}

describe('Timeline', () => {
  it('renders the trim label', () => {
    const { container } = r(makeProps())
    expect(container.querySelector('.tl-label')).toBeTruthy()
  })

  it('renders the filmstrip area', () => {
    const { container } = r(makeProps())
    expect(container.querySelector('.filmstrip, .filmstrip-empty')).toBeTruthy()
  })

  it('renders cut segments with correct positioning', () => {
    const { container } = r(makeProps({
      cutSegments: [{ id: 'a', start: 20, end: 40 }],
    }))
    const cut = container.querySelector('.tl-cut') as HTMLElement
    expect(cut).toBeTruthy()
    expect(cut.style.left).toBe('20%')
    expect(cut.style.width).toBe('20%')
  })

  it('shows the cut count and clear button when segments exist', () => {
    const { container } = r(makeProps({
      cutSegments: [{ id: 'a', start: 0, end: 10 }],
    }))
    expect(container.querySelector('.tl-cut-count')).toBeTruthy()
    expect(container.querySelector('.tl-clear-btn')).toBeTruthy()
  })

  it('does not show clear button without segments', () => {
    const { container } = r(makeProps())
    expect(container.querySelector('.tl-clear-btn')).toBeNull()
  })

  it('clear button clears all segments', () => {
    const onCutSegmentsChange = vi.fn()
    const { container } = r(makeProps({
      cutSegments: [{ id: 'a', start: 0, end: 10 }],
      onCutSegmentsChange,
    }))
    fireEvent.click(container.querySelector('.tl-clear-btn')!)
    expect(onCutSegmentsChange).toHaveBeenCalledWith([])
  })

  it('delete button on a cut removes only that segment', () => {
    const onCutSegmentsChange = vi.fn()
    const { container } = r(makeProps({
      cutSegments: [
        { id: 'a', start: 0, end: 10 },
        { id: 'b', start: 20, end: 30 },
      ],
      onCutSegmentsChange,
    }))
    const deleteButtons = container.querySelectorAll('.tl-cut-delete')
    fireEvent.click(deleteButtons[0])
    expect(onCutSegmentsChange).toHaveBeenCalledWith([{ id: 'b', start: 20, end: 30 }])
  })

  it('renders a ruler with major ticks', () => {
    const { container } = r(makeProps({ duration: 60 }))
    expect(container.querySelector('.tl-ruler')).toBeTruthy()
    expect(container.querySelectorAll('.tl-tick.major').length).toBeGreaterThan(0)
  })

  it('renders empty ruler when duration is 0', () => {
    const { container } = r(makeProps({ duration: 0 }))
    const ruler = container.querySelector('.tl-ruler')
    expect(ruler?.children.length).toBe(0)
  })

  it('positions the playhead based on currentTime', () => {
    const { container } = r(makeProps({ currentTime: 25 }))
    const playhead = container.querySelector('.tl-playhead') as HTMLElement
    expect(playhead.style.left).toBe('25%')
  })

  it('seeks when clicking the track (without drag distance)', () => {
    const onSeek = vi.fn()
    const { container } = r(makeProps({ onSeek }))
    const track = mockTrackRect(container, 0, 100)
    fireEvent.pointerDown(track, { clientX: 50, pointerId: 1 })
    fireEvent.pointerUp(track, { clientX: 50, pointerId: 1 })
    expect(onSeek).toHaveBeenCalledWith(50)
  })

  it('creates a new cut on drag with sufficient distance', () => {
    const onCutSegmentsChange = vi.fn()
    const { container } = r(makeProps({ onCutSegmentsChange }))
    const track = mockTrackRect(container, 0, 100)
    fireEvent.pointerDown(track, { clientX: 10, pointerId: 1 })
    fireEvent.pointerUp(track, { clientX: 30, pointerId: 1 })
    expect(onCutSegmentsChange).toHaveBeenCalled()
    const newCuts = onCutSegmentsChange.mock.calls[0][0]
    expect(newCuts).toHaveLength(1)
    expect(newCuts[0].start).toBeCloseTo(10, 0)
    expect(newCuts[0].end).toBeCloseTo(30, 0)
  })

  it('selects a cut when clicking inside it', () => {
    const { container } = r(makeProps({
      cutSegments: [{ id: 'a', start: 20, end: 40 }],
    }))
    const cut = container.querySelector('.tl-cut') as HTMLElement
    fireEvent.click(cut)
    expect(cut.className).toContain('selected')
  })

  it('renders the cut editor (precise time inputs) when a cut is selected', () => {
    const { container } = r(makeProps({
      cutSegments: [{ id: 'a', start: 20, end: 40 }],
    }))
    const cut = container.querySelector('.tl-cut') as HTMLElement
    fireEvent.click(cut)
    expect(container.querySelector('.cut-editor')).toBeTruthy()
    expect(container.querySelectorAll('.cut-editor-input').length).toBe(2)
  })

  it('does not create a cut for very short drags', () => {
    const onCutSegmentsChange = vi.fn()
    const onSeek = vi.fn()
    const { container } = r(makeProps({ onSeek, onCutSegmentsChange }))
    const track = mockTrackRect(container, 0, 100)
    fireEvent.pointerDown(track, { clientX: 50, pointerId: 1 })
    fireEvent.pointerUp(track, { clientX: 50, pointerId: 1 })
    expect(onCutSegmentsChange).not.toHaveBeenCalled()
    expect(onSeek).toHaveBeenCalledWith(50)
  })
})
