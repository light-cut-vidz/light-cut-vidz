import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import FilmStrip from '../components/FilmStrip'

describe('FilmStrip', () => {
  it('renders empty placeholder when no videoUrl provided', () => {
    const { container } = render(<FilmStrip videoUrl="" duration={0} trackWidth={0} />)
    expect(container.querySelector('.filmstrip-empty')).toBeTruthy()
  })

  it('renders empty placeholder when duration is 0', () => {
    const { container } = render(<FilmStrip videoUrl="x.mp4" duration={0} trackWidth={500} />)
    expect(container.querySelector('.filmstrip-empty')).toBeTruthy()
  })

  it('renders empty placeholder when trackWidth is 0', () => {
    const { container } = render(<FilmStrip videoUrl="x.mp4" duration={60} trackWidth={0} />)
    expect(container.querySelector('.filmstrip-empty')).toBeTruthy()
  })

  it('does not throw on mount when all props are valid', () => {
    expect(() => render(<FilmStrip videoUrl="file://x.mp4" duration={60} trackWidth={400} />)).not.toThrow()
  })

  it('uses empty class when no thumbs yet captured', () => {
    const { container } = render(<FilmStrip videoUrl="file://x.mp4" duration={60} trackWidth={400} />)
    expect(container.querySelector('.filmstrip-empty')).toBeTruthy()
  })
})
