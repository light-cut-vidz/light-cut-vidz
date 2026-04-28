import React, { useCallback, useState } from 'react'
import { useT } from '../i18n'
import './DropZone.css'

interface Props {
  onDrop: (filePath: string) => void
  onOpen: () => void
}

export default function DropZone({ onDrop, onOpen }: Props) {
  const { t } = useT()
  const [dragging, setDragging] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => setDragging(false), [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('video/')) {
      const fileObj = file as { path?: string; name: string }
      onDrop(fileObj.path || file.name)
    }
  }, [onDrop])

  return (
    <div
      className={`dropzone ${dragging ? 'dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="dropzone-inner">
        <div className="dropzone-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
          </svg>
        </div>
        <h2 className="dropzone-title">LightCutVidz</h2>
        <p className="dropzone-subtitle">{t.dropzone_subtitle}</p>
        <p className="dropzone-or">{t.dropzone_or}</p>
        <button className="dropzone-btn" onClick={onOpen}>
          {t.dropzone_browse}
        </button>
        <p className="dropzone-formats">MP4 · MOV · AVI · MKV · WebM</p>
      </div>
    </div>
  )
}
