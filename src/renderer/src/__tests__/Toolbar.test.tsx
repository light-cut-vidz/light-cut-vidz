import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import React from 'react'
import Toolbar from '../components/Toolbar'
import { LangProvider } from '../i18n'
import type { EditorState } from '../App'

const baseState: EditorState = {
  videoPath: '/tmp/v.mp4',
  videoUrl: 'file:///tmp/v.mp4',
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
  subtitles: null,
}

function makeProps(overrides: Partial<EditorState> = {}, callbacks: Partial<{
  onSpeedChange: (s: number) => void
  onMuteToggle: () => void
  onCropToggle: () => void
  onCropReset: () => void
  onFilterToggle: () => void
  onGeometryToggle: () => void
  onSubtitlesToggle: () => void
}> = {}, flags: Partial<{ showCrop: boolean; showFilters: boolean; showGeometry: boolean; showSubtitles: boolean }> = {}) {
  return {
    state: { ...baseState, ...overrides },
    showCrop: false,
    showFilters: false,
    showGeometry: false,
    showSubtitles: false,
    ...flags,
    onSpeedChange: vi.fn(),
    onMuteToggle: vi.fn(),
    onCropToggle: vi.fn(),
    onCropReset: vi.fn(),
    onFilterToggle: vi.fn(),
    onGeometryToggle: vi.fn(),
    onSubtitlesToggle: vi.fn(),
    ...callbacks,
  }
}

function r(props: ReturnType<typeof makeProps>) {
  return render(<LangProvider><Toolbar {...props} /></LangProvider>)
}

describe('Toolbar', () => {
  it('renders all tool sections', () => {
    const { container } = r(makeProps())
    expect(container.querySelectorAll('.tool-section').length).toBeGreaterThanOrEqual(5)
  })

  it('displays current speed as Nx', () => {
    const { container } = r(makeProps({ speed: 1.5 }))
    expect(container.querySelector('.speed-display')?.textContent).toBe('1.5x')
  })

  it('calls onSpeedChange when a speed preset is clicked', () => {
    const onSpeedChange = vi.fn()
    const { container } = r(makeProps({}, { onSpeedChange }))
    const preset = container.querySelectorAll('.preset-btn')[0] as HTMLButtonElement
    fireEvent.click(preset)
    expect(onSpeedChange).toHaveBeenCalledWith(0.25)
  })

  it('marks the active speed preset', () => {
    const { container } = r(makeProps({ speed: 2 }))
    const active = container.querySelector('.preset-btn.active')
    expect(active?.textContent).toBe('2x')
  })

  it('calls onSpeedChange when the slider moves', () => {
    const onSpeedChange = vi.fn()
    const { container } = r(makeProps({}, { onSpeedChange }))
    const slider = container.querySelector('.speed-slider') as HTMLInputElement
    fireEvent.change(slider, { target: { value: '4' } })
    // index 4 → 1.25x
    expect(onSpeedChange).toHaveBeenCalledWith(1.25)
  })

  it('shows muted label when muted', () => {
    const { container } = r(makeProps({ muted: true }))
    expect(container.textContent).toMatch(/muted|muet/i)
  })

  it('calls onMuteToggle on audio button click', () => {
    const onMuteToggle = vi.fn()
    const { container } = r(makeProps({}, { onMuteToggle }))
    const audioSection = container.querySelectorAll('.tool-section')[4]
    const btn = audioSection.querySelector('button')!
    fireEvent.click(btn)
    expect(onMuteToggle).toHaveBeenCalledOnce()
  })

  it('shows the "set crop" button when no crop is active', () => {
    const { container } = r(makeProps())
    expect(container.textContent).toMatch(/set crop|recadrer/i)
  })

  it('shows the applied crop dimensions when crop is set', () => {
    const { container } = r(makeProps({ crop: { x: 0, y: 0, w: 320, h: 240 } }))
    expect(container.textContent).toMatch(/320.*240/)
  })

  it('shows the "Adjust" + "Reset" buttons when crop is set', () => {
    const { container } = r(makeProps({ crop: { x: 0, y: 0, w: 320, h: 240 } }))
    expect(container.textContent).toMatch(/adjust|ajuster/i)
    expect(container.textContent).toMatch(/reset|réinitialiser/i)
  })

  it('shows the crop hint while in crop mode', () => {
    const { container } = r(makeProps({}, {}, { showCrop: true }))
    expect(container.querySelector('.crop-hint')).toBeTruthy()
  })

  it('calls onCropToggle and onCropReset', () => {
    const onCropToggle = vi.fn()
    const onCropReset = vi.fn()
    const { container } = r(makeProps({ crop: { x: 0, y: 0, w: 10, h: 10 } }, { onCropToggle, onCropReset }))
    const buttons = container.querySelectorAll('button')
    // adjust button is first, reset second
    fireEvent.click(buttons[3]) // geom/filter buttons come before crop section
    // Just verify clicks work by clicking labelled buttons
    const adjustBtn = Array.from(buttons).find(b => /adjust|ajuster/i.test(b.textContent || ''))!
    const resetBtn = Array.from(buttons).find(b => /reset|réinit/i.test(b.textContent || ''))!
    fireEvent.click(adjustBtn)
    fireEvent.click(resetBtn)
    expect(onCropToggle).toHaveBeenCalled()
    expect(onCropReset).toHaveBeenCalled()
  })

  it('calls onFilterToggle', () => {
    const onFilterToggle = vi.fn()
    const { container } = r(makeProps({}, { onFilterToggle }))
    const filterBtn = container.querySelectorAll('.tool-toggle-btn')[1]
    fireEvent.click(filterBtn)
    expect(onFilterToggle).toHaveBeenCalledOnce()
  })

  it('calls onGeometryToggle', () => {
    const onGeometryToggle = vi.fn()
    const { container } = r(makeProps({}, { onGeometryToggle }))
    const geomBtn = container.querySelectorAll('.tool-toggle-btn')[0]
    fireEvent.click(geomBtn)
    expect(onGeometryToggle).toHaveBeenCalledOnce()
  })

  it('marks the filter button as accent when filter panel is shown', () => {
    const { container } = r(makeProps({}, {}, { showFilters: true }))
    const filterBtn = container.querySelectorAll('.tool-toggle-btn')[1]
    expect(filterBtn.className).toContain('active-accent')
  })

  it('marks geometry button as ok-state when a transform is applied', () => {
    const { container } = r(makeProps({ rotation: 90 }))
    const geomBtn = container.querySelectorAll('.tool-toggle-btn')[0]
    expect(geomBtn.className).toContain('active-ok')
  })

  it('shows cut count when there are cut segments', () => {
    const { container } = r(makeProps({
      cutSegments: [
        { id: 'a', start: 0, end: 10 },
        { id: 'b', start: 20, end: 30 },
      ],
    }))
    expect(container.querySelector('.trim-count')?.textContent).toMatch(/2/)
  })

  it('does not render trim count when no cuts', () => {
    const { container } = r(makeProps())
    expect(container.querySelector('.trim-count')).toBeNull()
  })
})
