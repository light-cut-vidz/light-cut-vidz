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
    const t = setTimeout(() => { setVisible(false); setTimeout(onDone, 300) }, duration)
    return () => clearTimeout(t)
  }, [duration, onDone])

  return (
    <div className={`toast ${visible ? 'toast-in' : 'toast-out'}`}>
      {message}
    </div>
  )
}
