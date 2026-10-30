import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import UpdateBanner from '../components/UpdateBanner'
import { LangProvider } from '../i18n'
import type { UpdateNotice, UpdatePrompt } from '../electron'

let prompt: (p: UpdatePrompt) => void
let notice: (n: UpdateNotice) => void
const answerUpdate = vi.fn()

beforeEach(() => {
  answerUpdate.mockClear()
  window.electronAPI = {
    ...window.electronAPI,
    onUpdatePrompt: vi.fn((cb: (p: UpdatePrompt) => void) => { prompt = cb; return () => {} }),
    onUpdateNotice: vi.fn((cb: (n: UpdateNotice) => void) => { notice = cb; return () => {} }),
    answerUpdate,
  }
})

const r = () => render(<LangProvider><UpdateBanner /></LangProvider>)
const QUESTION: UpdatePrompt = { id: 7, message: 'Version 2.0.0 is available', detail: 'Install?\n\nWhat is new:\n- a thing', buttons: ['Download & Install', 'Later'] }

describe('UpdateBanner', () => {
  it('shows nothing until the updater speaks', () => {
    const { container } = r()
    expect(container.firstChild).toBeNull()
  })

  it('shows a question with the updater\'s own buttons', () => {
    r()
    act(() => prompt(QUESTION))
    expect(screen.getByRole('status').textContent).toContain('Version 2.0.0 is available')
    expect(screen.getByRole('button', { name: 'Download & Install' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Later' })).toBeTruthy()
  })

  it('sends the index of the clicked button, and goes away', () => {
    const { container } = r()
    act(() => prompt(QUESTION))
    fireEvent.click(screen.getByRole('button', { name: 'Download & Install' }))
    expect(answerUpdate).toHaveBeenCalledWith(7, 0)
    expect(container.querySelector('.update-banner')).toBeNull()

    act(() => prompt(QUESTION))
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(answerUpdate).toHaveBeenLastCalledWith(7, 1)
  })

  it('keeps what is new behind a toggle', () => {
    const { container } = r()
    act(() => prompt(QUESTION))
    expect(container.querySelector('.update-notes')).toBeNull()

    fireEvent.click(container.querySelector('.update-notes-toggle')!)
    expect(container.querySelector('.update-notes')?.textContent).toContain('a thing')

    fireEvent.click(container.querySelector('.update-notes-toggle')!)
    expect(container.querySelector('.update-notes')).toBeNull()
  })

  it('has no toggle when the question carries no details', () => {
    const { container } = r()
    act(() => prompt({ id: 1, message: 'Ready', buttons: ['Restart', 'Later'] }))
    expect(container.querySelector('.update-notes-toggle')).toBeNull()
  })

  it('shows the updater\'s other messages as a toast', () => {
    r()
    act(() => notice({ type: 'info', message: 'You are already on the latest version.' }))
    expect(screen.getByRole('status').textContent).toBe('You are already on the latest version.')
  })
})
