import React from 'react'
import './CompositionGrid.css'

interface Props {
  visible: boolean
}

export default function CompositionGrid({ visible }: Props) {
  if (!visible) return null

  return (
    <div className="composition-grid">
      <div className="grid-line grid-v1" />
      <div className="grid-line grid-v2" />
      <div className="grid-line grid-h1" />
      <div className="grid-line grid-h2" />
    </div>
  )
}
