// Installs an `electron` double for CommonJS modules under test.
//
// The vitest.config.ts alias covers ESM `import`, but the main process and the
// preload are CommonJS: their `require('electron')` goes through Node's own
// resolver, which finds the real npm package (whose entry point exports the
// path to the binary as a plain string). Seeding Node's module cache is what
// makes the double visible to `require`.

import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const req = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))

const SRC_ROOT = path.resolve(here, '../../..')

function seed(id, exports) {
  req.cache[id] = { id, filename: id, loaded: true, exports, children: [], paths: [] }
}

/** Make `require('electron')` return `double` for every CJS module. */
export function installElectron(double) {
  seed(req.resolve('electron'), double)
  return double
}

// Seeded on import so any spec pulling in this helper can require main-process
// modules that touch electron at load time.
installElectron(await import('./electron.js').then(m => ({ ...m })))

/**
 * Require a main-process module the way the app does.
 *
 * Specs must go through this rather than `import`, otherwise a module ends up
 * loaded twice — once as ESM by its own spec, once as CJS through index.js —
 * and the two instances report coverage separately.
 */
export function requireSrc(relativeToSrc) {
  return req(path.join(SRC_ROOT, relativeToSrc))
}

/** Drop a CJS module from Node's cache so the next require re-runs it. */
export function freshRequire(relativeToSrc) {
  const filename = path.join(SRC_ROOT, relativeToSrc)
  delete req.cache[filename]
  return req(filename)
}

export function restoreElectron() {
  delete req.cache[req.resolve('electron')]
}
