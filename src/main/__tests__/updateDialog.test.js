import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const { createUpdateDialog } = require(path.join(here, '..', 'lib', 'updateDialog.js'))

const makeWindow = () => ({ isDestroyed: () => false, webContents: { isDestroyed: () => false, send: vi.fn() } })
const setup = (win = makeWindow()) => {
  const realDialog = { showMessageBox: vi.fn().mockResolvedValue({ response: 0 }) }
  const ui = createUpdateDialog({ getWindow: () => win, dialog: realDialog })
  return { win, realDialog, ui }
}

describe('createUpdateDialog', () => {
  it('shows a message with a single button as a notice, and resolves at once', async () => {
    const { win, ui } = setup()
    await expect(ui.showMessageBox(win, { type: 'error', title: 'Failed', message: 'Boom', buttons: ['OK'] })).resolves.toEqual({ response: 0 })
    expect(win.webContents.send).toHaveBeenCalledWith('update:notice', { type: 'error', message: 'Boom' })
  })

  it('falls back to the title and to type info', async () => {
    const { win, ui } = setup()
    await ui.showMessageBox(win, { title: 'Only a title' })
    expect(win.webContents.send).toHaveBeenCalledWith('update:notice', { type: 'info', message: 'Only a title' })
  })

  it('asks a question with buttons and waits for the answer', async () => {
    const { win, ui } = setup()
    const result = ui.showMessageBox(win, { title: 'T', message: 'M', detail: 'D', buttons: ['Install', 'Later'] })
    const [, prompt] = win.webContents.send.mock.calls[0]
    expect(prompt).toMatchObject({ title: 'T', message: 'M', detail: 'D', buttons: ['Install', 'Later'] })

    ui.answer(prompt.id, 0)
    await expect(result).resolves.toEqual({ response: 0 })
  })

  it('treats an answer that is not a button as the last one', async () => {
    const { win, ui } = setup()
    const result = ui.showMessageBox(win, { buttons: ['A', 'B'] })
    ui.answer(win.webContents.send.mock.calls[0][1].id, 99)
    await expect(result).resolves.toEqual({ response: 1 })
  })

  it('ignores an answer to a question that is not the current one', async () => {
    const { win, ui } = setup()
    const result = ui.showMessageBox(win, { buttons: ['A', 'B'] })
    ui.answer(12345, 0)
    const settled = vi.fn()
    result.then(settled)
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()
    ui.answer(win.webContents.send.mock.calls[0][1].id, 0)
    await result
  })

  it('dismisses the previous question when a new one comes', async () => {
    const { win, ui } = setup()
    const first = ui.showMessageBox(win, { buttons: ['A', 'B', 'C'] })
    ui.showMessageBox(win, { buttons: ['X', 'Y'] })
    await expect(first).resolves.toEqual({ response: 2 })
  })

  it('uses the real dialog when there is no window to show anything in', async () => {
    const { realDialog, ui } = setup(null)
    await ui.showMessageBox(null, { message: 'M', buttons: ['A', 'B'] })
    expect(realDialog.showMessageBox).toHaveBeenCalled()
  })

  it('uses the main window when the one it is given is gone', async () => {
    const main = makeWindow()
    const { ui } = setup(main)
    const gone = { isDestroyed: () => true, webContents: {} }
    await ui.showMessageBox(gone, { message: 'M' })
    expect(main.webContents.send).toHaveBeenCalledWith('update:notice', expect.objectContaining({ message: 'M' }))
  })
})
