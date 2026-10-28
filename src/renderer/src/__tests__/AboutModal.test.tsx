import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import AboutModal from '../components/AboutModal'
import { LangProvider } from '../i18n'

let open: (version: string) => void
beforeEach(() => {
  window.electronAPI = {
    ...window.electronAPI,
    onMenuAbout: vi.fn((cb: (v: string) => void) => { open = cb; return () => {} }),
  }
})

const r = () => render(<LangProvider><AboutModal /></LangProvider>)

describe('AboutModal', () => {
  it('shows nothing until the menu asks for it', () => {
    r()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the version it is given', () => {
    r()
    act(() => open('1.4.2'))
    expect(screen.getByRole('dialog').textContent).toContain('1.4.2')
  })

  it('closes with its button, with Escape and with a click outside', () => {
    const { container } = r()
    act(() => open('1.0.0'))
    fireEvent.click(container.querySelector('.about-close')!)
    expect(screen.queryByRole('dialog')).toBeNull()

    act(() => open('1.0.0'))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    act(() => open('1.0.0'))
    fireEvent.click(container.querySelector('.cl-backdrop')!)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stays open when the card itself is clicked', () => {
    const { container } = r()
    act(() => open('1.0.0'))
    fireEvent.click(container.querySelector('.about-card')!)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
