// Prints the GitHub release notes for a version: its section of CHANGELOG.md and
// of CHANGELOG.fr.md, one after the other.
//
//   node scripts/release-notes.js 1.0.2 > notes.md
//
// Fails (exit 1) when either changelog has no section for that version, so a
// release can never go out without notes in both languages.

const fs = require('fs')
const path = require('path')
const { parseChangelog } = require('../src/main/lib/changelog')

const version = String(process.argv[2] || '').replace(/^v/, '')
if (!version) { console.error('usage: release-notes.js <version>'); process.exit(2) }

const root = path.resolve(__dirname, '..')
const section = (file, title) => {
  const entry = parseChangelog(fs.readFileSync(path.join(root, file), 'utf-8')).find(e => e.version === version)
  if (!entry) { console.error(`${file} has no section for ${version}`); process.exit(1) }
  return `## ${title}\n\n${entry.body.replace(/^### /gm, '#### ')}`
}

console.log([section('CHANGELOG.md', 'English'), section('CHANGELOG.fr.md', 'Français')].join('\n\n---\n\n'))
