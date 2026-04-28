import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import CutEditor from '../components/CutEditor'
import { LangProvider } from '../i18n'

function renderWithI18n(ui: React.ReactElement) {
  return render(<LangProvider>{ui}</LangProvider>)
}

const seg = { id: 'seg1', start: 10, end: 30 }

describe('CutEditor', () => {
  it('shows placeholder when no segment is selected', () => {
    renderWithI18n(
      <CutEditor
        seg={null}
        duration={100}
        onTimeInput={vi.fn()}
        onDelete={vi.fn()}
        onSeek={vi.fn()}
      />
    )
    expect(screen.getByText(/click a cut zone/i)).toBeTruthy()
  })

  it('renders start and end inputs when a segment is selected', () => {
    renderWithI18n(
      <CutEditor
        seg={seg}
        duration={100}
        onTimeInput={vi.fn()}
        onDelete={vi.fn()}
        onSeek={vi.fn()}
      />
    )
    const inputs = screen.getAllByRole('textbox')
    expect(inputs).toHaveLength(2)
    expect(inputs[0]).toHaveValue('0:10.0')
    expect(inputs[1]).toHaveValue('0:30.0')
  })

  it('calls onDelete when delete button is clicked', () => {
    const onDelete = vi.fn()
    renderWithI18n(
      <CutEditor
        seg={seg}
        duration={100}
        onTimeInput={vi.fn()}
        onDelete={onDelete}
        onSeek={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText(/delete/i))
    expect(onDelete).toHaveBeenCalledWith('seg1')
  })

  it('calls onSeek with seg.start when start seek button clicked', () => {
    const onSeek = vi.fn()
    renderWithI18n(
      <CutEditor
        seg={seg}
        duration={100}
        onTimeInput={vi.fn()}
        onDelete={vi.fn()}
        onSeek={onSeek}
      />
    )
    const seekButtons = screen.getAllByTitle(/jump/i)
    fireEvent.click(seekButtons[0])
    expect(onSeek).toHaveBeenCalledWith(10)
  })

  it('calls onTimeInput on blur of start input', () => {
    const onTimeInput = vi.fn()
    renderWithI18n(
      <CutEditor
        seg={seg}
        duration={100}
        onTimeInput={onTimeInput}
        onDelete={vi.fn()}
        onSeek={vi.fn()}
      />
    )
    const [startInput] = screen.getAllByRole('textbox')
    fireEvent.change(startInput, { target: { value: '0:05.0' } })
    fireEvent.blur(startInput)
    expect(onTimeInput).toHaveBeenCalledWith('seg1', 'start', '0:05.0')
  })

  it('calls onTimeInput on Enter key in end input', () => {
    const onTimeInput = vi.fn()
    renderWithI18n(
      <CutEditor
        seg={seg}
        duration={100}
        onTimeInput={onTimeInput}
        onDelete={vi.fn()}
        onSeek={vi.fn()}
      />
    )
    const [, endInput] = screen.getAllByRole('textbox')
    fireEvent.change(endInput, { target: { value: '0:35.0' } })
    fireEvent.keyDown(endInput, { key: 'Enter' })
    expect(onTimeInput).toHaveBeenCalledWith('seg1', 'end', '0:35.0')
  })

  it('updates inputs when seg changes', () => {
    const { rerender } = renderWithI18n(
      <CutEditor
        seg={seg}
        duration={100}
        onTimeInput={vi.fn()}
        onDelete={vi.fn()}
        onSeek={vi.fn()}
      />
    )
    const newSeg = { id: 'seg2', start: 50, end: 70 }
    rerender(
      <LangProvider>
        <CutEditor
          seg={newSeg}
          duration={100}
          onTimeInput={vi.fn()}
          onDelete={vi.fn()}
          onSeek={vi.fn()}
        />
      </LangProvider>
    )
    const inputs = screen.getAllByRole('textbox')
    expect(inputs[0]).toHaveValue('0:50.0')
    expect(inputs[1]).toHaveValue('1:10.0')
  })
})
