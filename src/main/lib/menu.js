const { Menu, BrowserWindow, dialog } = require('electron')

const { videoExtensions: VIDEO_EXTENSIONS } = require('../../shared/constants.json')

function buildMenuTemplate({ t, currentLang, currentTheme = 'system', recent = [], onOpenRecent, onClearRecent, onSwitchTheme, onOpenVideo, onSaveProject, onOpenProject, onUndo, onRedo, onFullscreenEntered, onAbout, onCheckUpdates, onShowChangelog, onSwitchLanguage }) {
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
              filters: [{ name: t('filter_videos'), extensions: VIDEO_EXTENSIONS }],
              properties: ['openFile'],
            })
            if (!canceled && filePaths[0]) onOpenVideo(win, filePaths[0])
          },
        },
        { type: 'separator' },
        { label: t('menu_save_project'), accelerator: 'CmdOrCtrl+S', click: () => onSaveProject && onSaveProject(BrowserWindow.getFocusedWindow()) },
        {
          label: t('menu_open_recent'),
          enabled: recent.length > 0,
          submenu: [
            ...recent.map(item => ({
              label: `${item.kind === 'project' ? '◆ ' : ''}${require('path').basename(item.path)}`,
              toolTip: item.path,
              click: () => onOpenRecent && onOpenRecent(item.path),
            })),
            { type: 'separator' },
            { label: t('menu_clear_recent'), click: () => onClearRecent && onClearRecent() },
          ],
        },
        { label: t('menu_open_project'), accelerator: 'CmdOrCtrl+Shift+O', click: () => onOpenProject && onOpenProject(BrowserWindow.getFocusedWindow()) },
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
        // Without these, Cmd+C / Cmd+V / Cmd+A do nothing in text fields on macOS.
        ...(isMac ? [
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ] : []),
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
        {
          label: t('menu_theme'),
          submenu: ['system', 'light', 'dark'].map(theme => ({
            id: `theme-${theme}`,
            label: t(`theme_${theme}`),
            type: 'radio',
            checked: currentTheme === theme,
            click: () => onSwitchTheme && onSwitchTheme(theme),
          })),
        },
      ],
    },
    {
      label: t('menu_help'),
      submenu: [
        { label: t('menu_about'), click: onAbout },
        { label: t('menu_whats_new'), click: () => onShowChangelog && onShowChangelog(BrowserWindow.getFocusedWindow()) },
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
  Menu.setApplicationMenu(Menu.buildFromTemplate(/** @type {any} */ (buildMenuTemplate(opts))))
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
