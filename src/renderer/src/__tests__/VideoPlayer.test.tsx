import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import React, { useRef } from 'react'
import VideoPlayer from '../components/VideoPlayer'

function Harness(props: Partial<{
  speed: number
  muted: boolean
  filterId: string
  rotation: number
  straighten: number
  perspectiveH: number
  perspectiveV: number
  src: string
  onTimeUpdate: (t: number) => void
  onDurationLoaded: (d: number) => void
  onPlayPause: (p: boolean) => void
}> = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  return (
    <VideoPlayer
      videoRef={videoRef}
      src={props.src ?? 'file:///x.mp4'}
      speed={props.speed ?? 1}
      muted={props.muted ?? false}
      filterId={props.filterId ?? 'none'}
      rotation={props.rotation ?? 0}
      straighten={props.straighten ?? 0}
      perspectiveH={props.perspectiveH ?? 0}
      perspectiveV={props.perspectiveV ?? 0}
      onTimeUpdate={props.onTimeUpdate ?? vi.fn()}
      onDurationLoaded={props.onDurationLoaded ?? vi.fn()}
      onPlayPause={props.onPlayPause ?? vi.fn()}
    />
  )
}

describe('VideoPlayer', () => {
  it('renders a video element with src', () => {
    const { container } = render(<Harness src="file:///x.mp4" />)
    const video = container.querySelector('video')!
    expect(video.getAttribute('src')).toBe('file:///x.mp4')
  })

  it('applies the speed to the video element', () => {
    const { container } = render(<Harness speed={2} />)
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video.playbackRate).toBe(2)
  })

  it('applies muted to the video element', () => {
    const { container } = render(<Harness muted={true} />)
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video.muted).toBe(true)
  })

  it('applies the CSS filter for grayscale', () => {
    const { container } = render(<Harness filterId="grayscale" />)
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video.style.filter).toContain('grayscale')
  })

  it('replaces filter with transform for mirror filter', () => {
    const { container } = render(<Harness filterId="mirror" />)
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video.style.filter).toBe('none')
    expect(video.style.transform).toContain('scaleX(-1)')
  })

  it('applies rotation through CSS transform', () => {
    const { container } = render(<Harness rotation={90} />)
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video.style.transform).toContain('rotateZ(90deg)')
  })

  it('sums rotation and straighten in transform', () => {
    const { container } = render(<Harness rotation={90} straighten={5} />)
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video.style.transform).toContain('rotateZ(95deg)')
  })

  it('applies perspective rotations', () => {
    const { container } = render(<Harness perspectiveH={20} perspectiveV={10} />)
    const video = container.querySelector('video') as HTMLVideoElement
    expect(video.style.transform).toContain('rotateY(20deg)')
    expect(video.style.transform).toContain('rotateX(10deg)')
  })

  it('emits onTimeUpdate with current time', () => {
    const onTimeUpdate = vi.fn()
    const { container } = render(<Harness onTimeUpdate={onTimeUpdate} />)
    const video = container.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'currentTime', { configurable: true, value: 12.5 })
    fireEvent.timeUpdate(video)
    expect(onTimeUpdate).toHaveBeenCalledWith(12.5)
  })

  it('emits onDurationLoaded on loadedMetadata', () => {
    const onDurationLoaded = vi.fn()
    const { container } = render(<Harness onDurationLoaded={onDurationLoaded} />)
    const video = container.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'duration', { configurable: true, value: 60 })
    fireEvent.loadedMetadata(video)
    expect(onDurationLoaded).toHaveBeenCalledWith(60)
  })

  it('emits onPlayPause(true) when video plays', () => {
    const onPlayPause = vi.fn()
    const { container } = render(<Harness onPlayPause={onPlayPause} />)
    const video = container.querySelector('video') as HTMLVideoElement
    fireEvent.play(video)
    expect(onPlayPause).toHaveBeenCalledWith(true)
  })

  it('emits onPlayPause(false) when video pauses', () => {
    const onPlayPause = vi.fn()
    const { container } = render(<Harness onPlayPause={onPlayPause} />)
    const video = container.querySelector('video') as HTMLVideoElement
    fireEvent.pause(video)
    expect(onPlayPause).toHaveBeenCalledWith(false)
  })

  it('emits onPlayPause(false) when video ends', () => {
    const onPlayPause = vi.fn()
    const { container } = render(<Harness onPlayPause={onPlayPause} />)
    const video = container.querySelector('video') as HTMLVideoElement
    fireEvent.ended(video)
    expect(onPlayPause).toHaveBeenCalledWith(false)
  })

  it('toggles play/pause when video is clicked (paused → plays)', () => {
    const { container } = render(<Harness />)
    const video = container.querySelector('video') as HTMLVideoElement
    const playSpy = vi.fn().mockResolvedValue(undefined)
    video.play = playSpy
    Object.defineProperty(video, 'paused', { configurable: true, value: true })
    fireEvent.click(video)
    expect(playSpy).toHaveBeenCalledOnce()
  })

  it('toggles play/pause when video is clicked (playing → pauses)', () => {
    const { container } = render(<Harness />)
    const video = container.querySelector('video') as HTMLVideoElement
    const pauseSpy = vi.fn()
    video.pause = pauseSpy
    Object.defineProperty(video, 'paused', { configurable: true, value: false })
    Object.defineProperty(video, 'ended', { configurable: true, value: false })
    fireEvent.click(video)
    expect(pauseSpy).toHaveBeenCalledOnce()
  })
})
