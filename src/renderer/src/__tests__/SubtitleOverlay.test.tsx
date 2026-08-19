import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import React, { useRef } from 'react'
import SubtitleOverlay from '../components/SubtitleOverlay'
import { DEFAULT_SUBTITLE_STYLE } from '../App'
import type { SubtitlesState, SubtitleAnimation } from '../App'

class ResizeObserverStub {
  callback: () => void
  static instances: ResizeObserverStub[] = []
  constructor(cb: () => void) {
    this.callback = cb
    ResizeObserverStub.instances.push(this)
  }
  observe() { /* noop */ }
  unobserve() { /* noop */ }
  disconnect() { /* noop */ }
}

beforeEach(() => {
  ResizeObserverStub.instances = []
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub
})

/** A video element that reports a size only once metadata has "loaded". */
function makeVideo({ ready = true } = {}) {
  const video = document.createElement('video')
  const parent = document.createElement('div')
  parent.appendChild(video)
  document.body.appendChild(parent)

  let width = ready ? 1920 : 0
  Object.defineProperty(video, 'videoWidth', { get: () => width, configurable: true })
  Object.defineProperty(video, 'videoHeight', { get: () => (width ? 1080 : 0), configurable: true })
  video.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 960, bottom: 540, width: 960, height: 540, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  parent.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 960, bottom: 540, width: 960, height: 540, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect

  return {
    video,
    loadMetadata() {
      width = 1920
      act(() => { video.dispatchEvent(new Event('loadedmetadata')) })
    },
  }
}

function subs(animation: SubtitleAnimation, text = 'hello brave world'): SubtitlesState {
  return {
    fileName: 'c.srt',
    cues: [{ id: 1, start: 0, end: 3, text }],
    style: DEFAULT_SUBTITLE_STYLE,
    animation,
  }
}

// The video handle is created by the test, not by the component, so the spec
// can drive `loadedmetadata` while the same element stays mounted.
function Harness({ subtitles, currentTime, video }: {
  subtitles: SubtitlesState | null
  currentTime: number
  video: HTMLVideoElement
}) {
  const videoRef = useRef<HTMLVideoElement | null>(video)
  return <SubtitleOverlay videoRef={videoRef} subtitles={subtitles} currentTime={currentTime} />
}

function r({ subtitles, currentTime, ready = true }: {
  subtitles: SubtitlesState | null
  currentTime: number
  ready?: boolean
}) {
  const handle = makeVideo({ ready })
  const result = render(<Harness subtitles={subtitles} currentTime={currentTime} video={handle.video} />)
  return {
    ...result,
    handle,
    update: () => result.rerender(
      <Harness subtitles={subtitles} currentTime={currentTime} video={handle.video} />,
    ),
  }
}

describe('SubtitleOverlay — visibility', () => {
  it('renders nothing without subtitles', () => {
    const { container } = r({ subtitles: null, currentTime: 0 })
    expect(container.querySelector('.subtitle-overlay')).toBeNull()
  })

  it('renders nothing outside any cue window', () => {
    const { container } = r({ subtitles: subs('sentence-fade'), currentTime: 10 })
    expect(container.querySelector('.subtitle-overlay')).toBeNull()
  })

  it('renders the active cue', () => {
    const { container } = r({ subtitles: subs('sentence-fade'), currentTime: 1 })
    expect(container.querySelector('.subtitle-overlay')).toBeTruthy()
  })

  // compute() bails while videoWidth is 0, and used to re-run only on window
  // resize — so captions on a not-yet-ready video never appeared.
  it('appears once the video reports its size', () => {
    const { container, handle, update } = r({ subtitles: subs('sentence-fade'), currentTime: 1, ready: false })
    expect(container.querySelector('.subtitle-overlay')).toBeNull()

    handle.loadMetadata()
    update()

    expect(container.querySelector('.subtitle-overlay')).toBeTruthy()
  })

  it('observes the video element for size changes', () => {
    r({ subtitles: subs('sentence-fade'), currentTime: 1 })
    expect(ResizeObserverStub.instances.length).toBeGreaterThan(0)
  })
})

describe('SubtitleOverlay — animation modes', () => {
  it('word-pop shows one word at a time', () => {
    const { container } = r({ subtitles: subs('word-pop'), currentTime: 0.1 })
    const el = container.querySelector('.sub-word-pop')
    expect(el?.textContent).toBe('hello')
  })

  it('word-pop advances with time', () => {
    const { container } = r({ subtitles: subs('word-pop'), currentTime: 2.9 })
    expect(container.querySelector('.sub-word-pop')?.textContent).toBe('world')
  })

  it('word-bounce shows one word at a time', () => {
    const { container } = r({ subtitles: subs('word-bounce'), currentTime: 0.1 })
    expect(container.querySelector('.sub-word-bounce')?.textContent).toBe('hello')
  })

  it('rainbow colours every word and keeps the full line', () => {
    const { container } = r({ subtitles: subs('rainbow'), currentTime: 1 })
    const spans = container.querySelectorAll('.sub-sentence-fade span')
    expect(spans).toHaveLength(3)
    expect(container.textContent).toContain('hello brave world')
    expect((spans[0] as HTMLElement).style.color).not.toBe('')
  })

  it('typewriter reveals a growing prefix', () => {
    const early = r({ subtitles: subs('typewriter'), currentTime: 0.2 })
    const late = r({ subtitles: subs('typewriter'), currentTime: 2.8 })
    const earlyText = early.container.querySelector('.sub-typewriter')!.textContent!
    const lateText = late.container.querySelector('.sub-typewriter')!.textContent!
    expect(lateText.length).toBeGreaterThan(earlyText.length)
    expect('hello brave world'.startsWith(earlyText)).toBe(true)
  })

  it('word-highlight keeps the whole line and accents the active word', () => {
    const { container } = r({ subtitles: subs('word-highlight'), currentTime: 0.1 })
    const spans = container.querySelectorAll('.sub-highlight-line span')
    expect(spans).toHaveLength(3)
    expect((spans[0] as HTMLElement).style.color).toBe('rgb(34, 211, 238)')
    expect((spans[1] as HTMLElement).style.color).toBe('')
  })

  it('sentence-slide renders the full cue', () => {
    const { container } = r({ subtitles: subs('sentence-slide'), currentTime: 1 })
    expect(container.querySelector('.sub-sentence-slide')?.textContent).toBe('hello brave world')
  })

  it('falls back to sentence-fade for an unknown mode', () => {
    const { container } = r({
      subtitles: subs('nonsense' as SubtitleAnimation),
      currentTime: 1,
    })
    expect(container.querySelector('.sub-sentence-fade')).toBeTruthy()
  })

  it('renders multi-line cues with a line break', () => {
    const { container } = r({ subtitles: subs('sentence-fade', 'line one\nline two'), currentTime: 1 })
    expect(container.querySelectorAll('br')).toHaveLength(1)
  })
})

describe('SubtitleOverlay — styling', () => {
  it('scales the font to the video height', () => {
    const { container } = r({ subtitles: subs('sentence-fade'), currentTime: 1 })
    const span = container.querySelector('.sub-sentence-fade') as HTMLElement
    // fontSize 5 → 5% of the 540px displayed height
    expect(span.style.fontSize).toBe('27px')
  })

  it('leaves the background transparent at zero opacity', () => {
    const { container } = r({ subtitles: subs('sentence-fade'), currentTime: 1 })
    const span = container.querySelector('.sub-sentence-fade') as HTMLElement
    expect(span.style.backgroundColor).toBe('transparent')
  })

  it('paints a translucent box when opacity is set', () => {
    const withBox = subs('sentence-fade')
    withBox.style = { ...withBox.style, backgroundColor: '#123456', backgroundOpacity: 0.5 }
    const { container } = r({ subtitles: withBox, currentTime: 1 })
    const span = container.querySelector('.sub-sentence-fade') as HTMLElement
    expect(span.style.backgroundColor).toBe('rgba(18, 52, 86, 0.5)')
  })

  it.each([
    ['top', 'flex-start'],
    ['middle', 'center'],
    ['bottom', 'flex-end'],
  ] as const)('aligns %s to %s', (position, justify) => {
    const positioned = subs('sentence-fade')
    positioned.style = { ...positioned.style, position }
    const { container } = r({ subtitles: positioned, currentTime: 1 })
    const overlay = container.querySelector('.subtitle-overlay') as HTMLElement
    expect(overlay.style.justifyContent).toBe(justify)
  })

  it('cleans up its listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = r({ subtitles: subs('sentence-fade'), currentTime: 1 })
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function))
    removeSpy.mockRestore()
  })
})
