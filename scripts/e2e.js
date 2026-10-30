// Runs e2e/smoke.js in Electron. Linux needs a virtual display (xvfb-run) and
// --no-sandbox in CI; macOS has a real window server, so it runs as-is.
const { spawnSync } = require('child_process')
const path = require('path')

const electron = require('electron')
const smoke = path.join(__dirname, '..', 'e2e', 'smoke.js')
const args = ['--no-sandbox', '--disable-gpu', smoke]
const headless = process.platform === 'linux' && !process.env.DISPLAY

const [cmd, cmdArgs] = headless ? ['xvfb-run', ['-a', electron, ...args]] : [electron, args]
const result = spawnSync(cmd, cmdArgs, { stdio: 'inherit' })
process.exit(result.status ?? 1)
