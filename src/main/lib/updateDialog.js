// The updater asks its questions with `dialog.showMessageBox`. This stands in for
// it and shows them inside the app, the way LightCutSoundz does: a question with
// buttons becomes a banner at the top of the window, anything else a toast.

/**
 * @param {{ getWindow: () => any, dialog: { showMessageBox: Function } }} deps
 *   `dialog` is the real one, kept for when there is no window to show anything in.
 */
function createUpdateDialog({ getWindow, dialog }) {
  let seq = 0
  /** @type {{ id: number, buttons: number, resolve: (r: { response: number }) => void } | null} */
  let pending = null

  const usable = (win) => !!win && !win.isDestroyed?.() && !!win.webContents && !win.webContents.isDestroyed?.()

  function showMessageBox(win, opts) {
    const target = usable(win) ? win : getWindow()
    // 'success' is ours (a green toast); a native box only knows 'info'.
    if (!usable(target)) return dialog.showMessageBox(win, opts.type === 'success' ? { ...opts, type: 'info' } : opts)

    const buttons = opts.buttons || []
    if (buttons.length < 2) {
      target.webContents.send('update:notice', { type: opts.type || 'info', message: opts.message || opts.title || '' })
      return Promise.resolve({ response: 0 })
    }

    // A new question dismisses the previous one: the last button is "later".
    if (pending) pending.resolve({ response: pending.buttons - 1 })
    return new Promise((resolve) => {
      const id = ++seq
      pending = { id, buttons: buttons.length, resolve }
      target.webContents.send('update:prompt', { id, title: opts.title, message: opts.message, detail: opts.detail, buttons })
    })
  }

  /** The renderer's answer; anything it sends that is not a button counts as the last one. */
  function answer(id, response) {
    if (!pending || pending.id !== id) return
    const { buttons, resolve } = pending
    pending = null
    resolve({ response: Number.isInteger(response) && response >= 0 && response < buttons ? response : buttons - 1 })
  }

  return { showMessageBox, answer }
}

module.exports = { createUpdateDialog }
