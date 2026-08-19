// Stand-in for the `electron` module in the "main" test project.
//
// Outside a running Electron process, `require('electron')` resolves to the npm
// package, whose entry point exports the path to the binary as a string — so
// destructuring it yields undefined. It also lives in node_modules, which Vitest
// externalises, putting it out of `vi.mock`'s reach.
//
// vitest.config.ts aliases `electron` to this file for main-process tests. Being
// a local module, it is transformed rather than externalised, so specs can
// replace it with `vi.mock('electron', factory)` and drive the parts they need.
// The stubs below are only what an un-mocked import falls back to.

const noop = () => {}

export const app = {
  whenReady: () => Promise.resolve(),
  on: noop,
  quit: noop,
  exit: noop,
  relaunch: noop,
  getPath: () => '/tmp',
  getAppPath: () => '/app',
  getVersion: () => '0.0.0-test',
  setName: noop,
}

export class BrowserWindow {
  static getAllWindows() { return [] }
  static getFocusedWindow() { return null }
  constructor() {
    this.webContents = { send: noop, on: noop, openDevTools: noop }
  }
  loadURL() {}
  loadFile() {}
  isFullScreen() { return false }
  setFullScreen() {}
  setMenuBarVisibility() {}
}

export const ipcMain = { handle: noop, on: noop }
export const ipcRenderer = { invoke: () => Promise.resolve(), send: noop, on: noop, removeAllListeners: noop }
export const contextBridge = { exposeInMainWorld: noop }
export const webUtils = { getPathForFile: () => '' }
export const dialog = {
  showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
  showSaveDialog: () => Promise.resolve({ canceled: true, filePath: undefined }),
  showMessageBox: () => Promise.resolve({ response: 0 }),
}
export const protocol = { registerSchemesAsPrivileged: noop, handle: noop }
export const net = { fetch: () => Promise.resolve(new Response('')) }
export const shell = { openExternal: noop }
export const Menu = {
  setApplicationMenu: noop,
  getApplicationMenu: () => null,
  buildFromTemplate: (tpl) => tpl,
}

export default {
  app, BrowserWindow, ipcMain, ipcRenderer, contextBridge, webUtils,
  dialog, protocol, net, shell, Menu,
}
