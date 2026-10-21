import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import ChangelogModal, { SHOW_CHANGELOG_EVENT } from '../components/ChangelogModal'
import { LangProvider } from '../i18n'

const ENTRIES = [
  { version: '1.0.2', date: '2026-10-21', body: '### Added\n- **Projects** with `.lcvproj`\n- Second\n\n### Fixed\n- A bug\n\nA closing paragraph.' },
  { version: '1.0.1', date: '2026-08-20', body: '### Fixed\n- Old' },
]

let menuCallback: (() => void) | null = null
let storage: Record<string, string> = {}

beforeEach(() => {
  menuCallback = null
  storage = {}
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => storage[k] ?? null, setItem: (k: string, v: string) => { storage[k] = v }, removeItem: () => {}, clear: () => {}, length: 0, key: () => null },
  })
  window.electronAPI = {
    ...window.electronAPI,
    getChangelog: vi.fn().mockResolvedValue(ENTRIES),
    onMenuShowChangelog: vi.fn((cb: () => void) => { menuCallback = cb; return () => {} }),
  }
})

const r = () => render(<LangProvider><ChangelogModal /></LangProvider>)
const open = () => act(() => { window.dispatchEvent(new Event(SHOW_CHANGELOG_EVENT)) })

describe('ChangelogModal', () => {
  it('renders nothing until asked', () => {
    const { container } = r()
    expect(container.firstChild).toBeNull()
  })

  it('opens from the Help menu', async () => {
    r()
    act(() => { menuCallback!() })
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('opens from the in-app event (the version button)', async () => {
    r(); open()
    expect(await screen.findByRole('dialog')).toBeTruthy()
  })

  it('asks the main process for the changelog in the current language', async () => {
    r(); open()
    await waitFor(() => expect(window.electronAPI.getChangelog).toHaveBeenCalledWith('en'))
  })

  it('shows every version with its date, newest first', async () => {
    const { container } = r(); open()
    await waitFor(() => expect(container.querySelectorAll('.cl-entry')).toHaveLength(2))
    const titles = Array.from(container.querySelectorAll('.cl-entry h3')).map(h => h.textContent)
    expect(titles[0]).toContain('1.0.2')
    expect(titles[0]).toContain('2026-10-21')
    expect(titles[1]).toContain('1.0.1')
  })

  it('renders headings, bullets, bold, code and paragraphs', async () => {
    const { container } = r(); open()
    await waitFor(() => expect(container.querySelector('.cl-entry')).toBeTruthy())
    const first = container.querySelector('.cl-entry') as HTMLElement
    expect(Array.from(first.querySelectorAll('h4')).map(h => h.textContent)).toEqual(['Added', 'Fixed'])
    expect(first.querySelectorAll('li')).toHaveLength(3)
    expect(first.querySelector('strong')?.textContent).toBe('Projects')
    expect(first.querySelector('code')?.textContent).toBe('.lcvproj')
    expect(first.querySelector('p')?.textContent).toBe('A closing paragraph.')
  })

  it('never injects markup from the changelog', async () => {
    window.electronAPI.getChangelog = vi.fn().mockResolvedValue([{ version: '1.0.0', date: '', body: '- <img src=x onerror=alert(1)> and <b>x</b>' }])
    const { container } = r(); open()
    await waitFor(() => expect(container.querySelector('li')).toBeTruthy())
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('li')?.textContent).toContain('<img src=x')
  })

  it('says so when there is no changelog', async () => {
    window.electronAPI.getChangelog = vi.fn().mockResolvedValue([])
    const { container } = r(); open()
    await waitFor(() => expect(container.querySelector('.cl-empty')?.textContent).toMatch(/no changelog/i))
  })

  it('says so when reading it fails', async () => {
    window.electronAPI.getChangelog = vi.fn().mockRejectedValue(new Error('x'))
    const { container } = r(); open()
    await waitFor(() => expect(container.querySelector('.cl-empty')?.textContent).toMatch(/no changelog/i))
  })

  it.each([
    ['the close button', () => fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0])],
    ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
    ['the backdrop', () => fireEvent.click(document.querySelector('.cl-backdrop')!)],
  ])('closes with %s', async (_n, close) => {
    r(); open()
    await screen.findByRole('dialog')
    act(() => { close() })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('stays open when clicking inside the window', async () => {
    r(); open()
    fireEvent.click(await screen.findByRole('dialog'))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  describe('after an update', () => {
    it('opens by itself once when the version changed since the last launch', async () => {
      storage.lcv_last_seen_version = '0.9.0'
      r()
      expect(await screen.findByRole('dialog')).toBeTruthy()
      expect(storage.lcv_last_seen_version).toBe('test')
    })

    it('does not open on a first install (nothing seen before)', () => {
      r()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(storage.lcv_last_seen_version).toBe('test')
    })

    it('does not open again on the next launch of the same version', () => {
      storage.lcv_last_seen_version = 'test'
      r()
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('survives unavailable storage', () => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('denied') } })
      expect(() => r()).not.toThrow()
    })
  })
})
