import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import Toast from '../components/Toast'

describe('Toast', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('renders the message', () => {
    render(<Toast message="Hello world" onDone={vi.fn()} />)
    expect(screen.getByText('Hello world')).toBeTruthy()
  })

  it('starts with the toast-in class', () => {
    const { container } = render(<Toast message="x" onDone={vi.fn()} />)
    expect(container.querySelector('.toast-in')).toBeTruthy()
  })

  it('transitions to toast-out after duration', () => {
    const { container } = render(<Toast message="x" duration={1000} onDone={vi.fn()} />)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(container.querySelector('.toast-out')).toBeTruthy()
  })

  it('invokes onDone after the exit animation', () => {
    const onDone = vi.fn()
    render(<Toast message="x" duration={500} onDone={onDone} />)
    act(() => { vi.advanceTimersByTime(500) })
    expect(onDone).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(300) })
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('uses default duration of 3500ms when not specified', () => {
    const onDone = vi.fn()
    const { container } = render(<Toast message="x" onDone={onDone} />)
    act(() => { vi.advanceTimersByTime(3499) })
    expect(container.querySelector('.toast-in')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(1) })
    expect(container.querySelector('.toast-out')).toBeTruthy()
  })

  it('clears its timer on unmount', () => {
    const onDone = vi.fn()
    const { unmount } = render(<Toast message="x" duration={1000} onDone={onDone} />)
    unmount()
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onDone).not.toHaveBeenCalled()
  })
})
