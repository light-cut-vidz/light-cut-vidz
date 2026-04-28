import { useState, useCallback, useRef } from 'react'
import type { TrimSegment, CropRect } from '../App'

export interface EditableState {
  speed: number
  muted: boolean
  crop: CropRect | null
  cutSegments: TrimSegment[]
}

export const defaultEditable: EditableState = {
  speed: 1,
  muted: false,
  crop: null,
  cutSegments: [],
}

export function useEditorHistory(initial: EditableState = defaultEditable) {
  const [current, setCurrent] = useState<EditableState>(initial)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const past   = useRef<EditableState[]>([])
  const future = useRef<EditableState[]>([])

  const syncFlags = () => {
    setCanUndo(past.current.length > 0)
    setCanRedo(future.current.length > 0)
  }

  const set = useCallback((updater: (prev: EditableState) => EditableState) => {
    setCurrent(prev => {
      const next = updater(prev)
      past.current.push(prev)
      future.current = []
      syncFlags()
      return next
    })
  }, [])

  const undo = useCallback(() => {
    setCurrent(prev => {
      if (!past.current.length) return prev
      future.current.push(prev)
      const next = past.current.pop()!
      syncFlags()
      return next
    })
  }, [])

  const redo = useCallback(() => {
    setCurrent(prev => {
      if (!future.current.length) return prev
      past.current.push(prev)
      const next = future.current.pop()!
      syncFlags()
      return next
    })
  }, [])

  const reset = useCallback((val: EditableState = defaultEditable) => {
    past.current   = []
    future.current = []
    setCurrent(val)
    syncFlags()
  }, [])

  return { editable: current, set, undo, redo, reset, canUndo, canRedo }
}
