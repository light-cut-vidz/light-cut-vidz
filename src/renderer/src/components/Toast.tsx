import React, { useEffect, useState } from 'react'
import './Toast.css'

interface Props {
  message: string
  duration?: number
  onDone: () => void
}

export default function Toast({ message, duration = 3500, onDone }: Props) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    let fade: ReturnType<typeof setTimeout> | undefined
    const t = setTimeout(() => { setVisible(false); fade = setTimeout(onDone, 300) }, duration)
    return () => { clearTimeout(t); clearTimeout(fade) }
  }, [duration, onDone])

  return (
    <div role="status" className={`toast ${visible ? 'toast-in' : 'toast-out'}`}>
      {message}
    </div>
  )
}
