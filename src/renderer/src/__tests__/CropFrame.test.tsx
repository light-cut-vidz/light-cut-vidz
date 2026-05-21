import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import React, { useRef } from 'react'
import CropFrame from '../components/CropFrame'

function Harness({ videoWidth = 1920, crop = { x: 100, y: 50, w: 300, h: 200 } }) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  return (
    <div style={{ position: 'relative' }} data-testid="parent">
      <video
        ref={(el) => {
          if (el) {
            Object.defineProperty(el, 'videoWidth', { value: videoWidth, configurable: true })
            Object.defineProperty(el, 'getBoundingClientRect', {
              value: () => ({ left: 10, top: 20, width: 960, height: 540, right: 970, bottom: 560 }),
              configurable: true,
            })
            const parent = el.parentElement!
            Object.defineProperty(parent, 'getBoundingClientRect', {
              value: () => ({ left: 0, top: 0, width: 1000, height: 600, right: 1000, bottom: 600 }),
              configurable: true,
            })
          }
          ;(videoRef as { current: HTMLVideoElement | null }).current = el
        }}
      />
      <CropFrame videoRef={videoRef} crop={crop} />
    </div>
  )
}

describe('CropFrame', () => {
  it('renders nothing when video has no width', () => {
    function NoVideo() {
      const ref = useRef<HTMLVideoElement | null>(null)
      return <CropFrame videoRef={ref} crop={{ x: 0, y: 0, w: 10, h: 10 }} />
    }
    const { container } = render(<NoVideo />)
    expect(container.firstChild).toBeNull()
  })

  it('renders an absolutely-positioned overlay when video has size', () => {
    const { container } = render(<Harness />)
    const frame = container.querySelector('[style*="position: absolute"]')
    expect(frame).toBeTruthy()
  })

  it('scales the crop using video width ratio (960/1920 = 0.5)', () => {
    const { container } = render(<Harness />)
    const frame = container.querySelector('[style*="position: absolute"]') as HTMLElement
    // crop.x=100 * 0.5 = 50, plus video offset 10 → left should be 60
    expect(frame.style.left).toBe('60px')
    // crop.y=50 * 0.5 = 25, plus video offset 20 → top should be 45
    expect(frame.style.top).toBe('45px')
    expect(frame.style.width).toBe('150px')
    expect(frame.style.height).toBe('100px')
  })
})
