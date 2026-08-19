const { Menu, BrowserWindow, dialog } = require('electron')

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'm4v']

function buildMenuTemplate({ t, currentLang, onOpenVideo, onUndo, onRedo, onFullscreenEntered, onAbout, onCheckUpdates, onSwitchLanguage }) {
  const isMac = process.platform === 'darwin'

  return [
    ...(isMac ? [{
      label: 'LightCutVidz',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: t('menu_file'),
      submenu: [
        {
          label: t('menu_open_video'),
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const win = BrowserWindow.getFocusedWindow()
            if (!win) return
            const { canceled, filePaths } = await dialog.showOpenDialog(win, {
              filters: [{ name: 'Videos', extensions: VIDEO_EXTENSIONS }],
              properties: ['openFile'],
            })
            if (!canceled && filePaths[0]) onOpenVideo(win, filePaths[0])
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: t('menu_edit'),
      submenu: [
        {
          id: 'undo',
          label: t('menu_undo'),
          accelerator: 'CmdOrCtrl+Z',
          enabled: false,
          click: () => onUndo(BrowserWindow.getFocusedWindow()),
        },
        {
          id: 'redo',
          label: t('menu_redo'),
          accelerator: isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y',
          enabled: false,
          click: () => onRedo(BrowserWindow.getFocusedWindow()),
        },
      ],
    },
    {
      label: t('menu_view'),
      submenu: [
        {
          label: t('menu_fullscreen'),
          accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (!win) return
            const entering = !win.isFullScreen()
            win.setFullScreen(entering)
            if (entering) onFullscreenEntered(win)
          },
        },
      ],
    },
    {
      label: t('menu_help'),
      submenu: [
        { label: t('menu_about'), click: onAbout },
        { type: 'separator' },
        { label: t('menu_check_updates'), click: () => onCheckUpdates(true) },
        { type: 'separator' },
        {
          label: t('menu_language'),
          submenu: [
            { id: 'lang-en', label: 'English', type: 'radio', checked: currentLang === 'en', click: () => onSwitchLanguage('en') },
            { id: 'lang-fr', label: 'Français', type: 'radio', checked: currentLang === 'fr', click: () => onSwitchLanguage('fr') },
          ],
        },
      ],
    },
  ]
}

function buildMenu(opts) {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(opts)))
}

function setUndoRedoEnabled(canUndo, canRedo) {
  const menu = Menu.getApplicationMenu()
  if (!menu) return
  const undoItem = menu.getMenuItemById('undo')
  const redoItem = menu.getMenuItemById('redo')
  if (undoItem) undoItem.enabled = canUndo
  if (redoItem) redoItem.enabled = canRedo
}

module.exports = { buildMenu, buildMenuTemplate, setUndoRedoEnabled, VIDEO_EXTENSIONS }
