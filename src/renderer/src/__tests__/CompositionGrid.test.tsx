import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import CompositionGrid from '../components/CompositionGrid'

describe('CompositionGrid', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(<CompositionGrid visible={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the grid container when visible', () => {
    const { container } = render(<CompositionGrid visible={true} />)
    expect(container.querySelector('.composition-grid')).toBeTruthy()
  })

  it('renders the 4 rule-of-thirds lines', () => {
    const { container } = render(<CompositionGrid visible={true} />)
    expect(container.querySelectorAll('.grid-line')).toHaveLength(4)
    expect(container.querySelector('.grid-v1')).toBeTruthy()
    expect(container.querySelector('.grid-v2')).toBeTruthy()
    expect(container.querySelector('.grid-h1')).toBeTruthy()
    expect(container.querySelector('.grid-h2')).toBeTruthy()
  })
})
