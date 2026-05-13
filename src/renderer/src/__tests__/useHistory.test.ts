import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useEditorHistory, defaultEditable } from '../hooks/useHistory'

describe('useEditorHistory', () => {
  it('initialises with default state', () => {
    const { result } = renderHook(() => useEditorHistory())
    expect(result.current.editable).toEqual(defaultEditable)
  })

  it('applies a change', () => {
    const { result } = renderHook(() => useEditorHistory())
    act(() => { result.current.set(p => ({ ...p, speed: 2 })) })
    expect(result.current.editable.speed).toBe(2)
  })

  it('undoes a change', () => {
    const { result } = renderHook(() => useEditorHistory())
    act(() => { result.current.set(p => ({ ...p, speed: 2 })) })
    act(() => { result.current.undo() })
    expect(result.current.editable.speed).toBe(1)
  })

  it('redoes after undo', () => {
    const { result } = renderHook(() => useEditorHistory())
    act(() => { result.current.set(p => ({ ...p, speed: 2 })) })
    act(() => { result.current.undo() })
    act(() => { result.current.redo() })
    expect(result.current.editable.speed).toBe(2)
  })

  it('clears redo stack after a new change', () => {
    const { result } = renderHook(() => useEditorHistory())
    act(() => { result.current.set(p => ({ ...p, speed: 2 })) })
    act(() => { result.current.undo() })
    act(() => { result.current.set(p => ({ ...p, speed: 3 })) })
    act(() => { result.current.undo() })
    // redo should bring us back to 3, not 2
    act(() => { result.current.redo() })
    expect(result.current.editable.speed).toBe(3)
  })

  it('stacks multiple undos', () => {
    const { result } = renderHook(() => useEditorHistory())
    act(() => { result.current.set(p => ({ ...p, speed: 2 })) })
    act(() => { result.current.set(p => ({ ...p, muted: true })) })
    act(() => { result.current.undo() })
    expect(result.current.editable.muted).toBe(false)
    expect(result.current.editable.speed).toBe(2)
    act(() => { result.current.undo() })
    expect(result.current.editable.speed).toBe(1)
  })

  it('does nothing on undo when history is empty', () => {
    const { result } = renderHook(() => useEditorHistory())
    act(() => { result.current.undo() })
    expect(result.current.editable).toEqual(defaultEditable)
  })

  it('does nothing on redo when future is empty', () => {
    const { result } = renderHook(() => useEditorHistory())
    act(() => { result.current.redo() })
    expect(result.current.editable).toEqual(defaultEditable)
  })

  it('reset clears history', () => {
    const { result } = renderHook(() => useEditorHistory())
    act(() => { result.current.set(p => ({ ...p, speed: 2 })) })
    act(() => { result.current.reset() })
    act(() => { result.current.undo() })
    // undo after reset should have no effect
    expect(result.current.editable).toEqual(defaultEditable)
  })

  it('tracks cutSegments changes', () => {
    const { result } = renderHook(() => useEditorHistory())
    const seg = { id: 'seg1', start: 1, end: 3 }
    act(() => { result.current.set(p => ({ ...p, cutSegments: [seg] })) })
    expect(result.current.editable.cutSegments).toHaveLength(1)
    act(() => { result.current.undo() })
    expect(result.current.editable.cutSegments).toHaveLength(0)
  })
})
