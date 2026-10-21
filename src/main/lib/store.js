// Tiny JSON persistence for settings and the recent list, in the user-data
// folder. Reads are tolerant (a missing or corrupt file is just "empty") and
// writes are atomic (temp file + rename) so a crash cannot leave half a file.

const fs = require('fs')
const path = require('path')

/** @returns {Promise<any>} the parsed JSON, or null when absent/unreadable */
async function readJson(file) {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf-8'))
  } catch {
    return null
  }
}

async function writeJson(file, value) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await fs.promises.writeFile(tmp, JSON.stringify(value, null, 2), 'utf-8')
  await fs.promises.rename(tmp, file)
}

module.exports = { readJson, writeJson }
