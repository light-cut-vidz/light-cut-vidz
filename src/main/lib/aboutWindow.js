const { BrowserWindow } = require('electron')
const { escapeHtml } = require('./escapeHtml')

function aboutHtml(title, message, note) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #1a1a1a;
    color: #e0e0e0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    text-align: center;
    gap: 10px;
  }
  h1 { font-size: 18px; font-weight: 600; }
  p  { font-size: 13px; color: #999; }
  p.note { font-size: 11px; color: #777; max-width: 300px; line-height: 1.4; }
  button {
    margin-top: 14px;
    padding: 8px 28px;
    background: #e05a00;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
  }
  button:hover { background: #f06a00; }
</style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  ${note ? `<p class="note">${escapeHtml(note)}</p>` : ''}
  <button onclick="window.close()">OK</button>
</body>
</html>`
}

function showAboutWindow({ parent, title, message, note }) {
  const win = new BrowserWindow({
    width: 360,
    height: 250,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    parent,
    modal: true,
    title,
    backgroundColor: '#1a1a1a',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(aboutHtml(title, message, note))}`)
  win.setMenuBarVisibility(false)
  return win
}

module.exports = { showAboutWindow, aboutHtml }
