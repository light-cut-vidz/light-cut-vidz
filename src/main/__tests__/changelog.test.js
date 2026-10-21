import { spawnSync } from 'child_process'
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { requireSrc } from './__doubles__/installElectron.js'

const { parseChangelog, entriesBetween, entriesUpTo, formatNotes } = requireSrc('main/lib/changelog.js')
const root = path.resolve(import.meta.dirname, '../../..')
const read = (f) => fs.readFileSync(path.join(root, f), 'utf-8')

const SAMPLE = `# Changelog

## [Unreleased]
- not shipped

## [1.2.0] - 2026-03-01
### Added
- **Bold** feature with \`code\`

### Fixed
- a bug

## [1.1.0] - 2026-02-01
### Fixed
- older bug

## 1.0.0 - 2026-01-01
- first
`

describe('parseChangelog', () => {
  const entries = parseChangelog(SAMPLE)

  it('reads versions and dates, newest first, skipping Unreleased', () => {
    expect(entries.map(e => [e.version, e.date])).toEqual([['1.2.0', '2026-03-01'], ['1.1.0', '2026-02-01'], ['1.0.0', '2026-01-01']])
  })
  it('keeps the body of each entry', () => {
    expect(entries[0].body).toContain('### Added')
    expect(entries[0].body).toContain('- a bug')
    expect(entries[0].body).not.toContain('older bug')
  })
  it('does not leak the Unreleased section into the previous entry', () => {
    expect(entries.some(e => e.body.includes('not shipped'))).toBe(false)
  })
  it('accepts a version without brackets or date', () => {
    expect(parseChangelog('## v2.0.0\n- x')).toEqual([{ version: '2.0.0', date: '', body: '- x' }])
  })
  it('copes with CRLF and empty input', () => {
    expect(parseChangelog('## [1.0.0] - 2026-01-01\r\n- a\r\n')[0].body).toBe('- a')
    expect(parseChangelog('')).toEqual([])
  })
})

describe('selecting entries', () => {
  const entries = parseChangelog(SAMPLE)
  it('entriesBetween: what an update from 1.0.0 to 1.2.0 brings', () => {
    expect(entriesBetween(entries, '1.0.0', '1.2.0').map(e => e.version)).toEqual(['1.2.0', '1.1.0'])
  })
  it('entriesBetween: nothing newer than the target', () => {
    expect(entriesBetween(entries, '1.0.0', '1.1.0').map(e => e.version)).toEqual(['1.1.0'])
  })
  it('entriesBetween: nothing when already up to date', () => {
    expect(entriesBetween(entries, '1.2.0', '1.2.0')).toEqual([])
  })
  it('entriesUpTo: only what the installed build already contains', () => {
    expect(entriesUpTo(entries, '1.1.0').map(e => e.version)).toEqual(['1.1.0', '1.0.0'])
  })
})

describe('formatNotes', () => {
  const text = formatNotes(parseChangelog(SAMPLE).slice(0, 1))
  it('turns headings into labels and bullets into •', () => {
    expect(text).toContain('1.2.0 (2026-03-01)')
    expect(text).toContain('Added:')
    expect(text).toContain('• Bold feature with code')
  })
  it('strips Markdown emphasis and code ticks', () => {
    expect(text).not.toMatch(/\*\*|`/)
  })
  it('cuts long notes on a line boundary with an ellipsis', () => {
    const long = formatNotes([{ version: '1.0.0', date: '', body: Array.from({ length: 200 }, (_, i) => `- line number ${i}`).join('\n') }], 300)
    expect(long.length).toBeLessThanOrEqual(305)
    expect(long.endsWith('…')).toBe(true)
    expect(long).not.toMatch(/line number \d+…/) // no half line
  })
  it('is empty for no entries', () => expect(formatNotes([])).toBe(''))
})

// The two changelogs and the version are kept in step by this test, not by memory.
describe('the project changelogs', () => {
  const en = parseChangelog(read('CHANGELOG.md'))
  const fr = parseChangelog(read('CHANGELOG.fr.md'))
  const version = JSON.parse(read('package.json')).version

  it('exist in English and French with the same versions and dates', () => {
    expect(fr.map(e => [e.version, e.date])).toEqual(en.map(e => [e.version, e.date]))
  })
  it('have the same number of sections and bullets per version', () => {
    const shape = (e) => [(e.body.match(/^### /gm) || []).length, (e.body.match(/^- /gm) || []).length]
    en.forEach((e, i) => expect(shape(fr[i]), e.version).toEqual(shape(e)))
  })
  it('document the version in package.json', () => {
    expect(en.some(e => e.version === version)).toBe(true)
    expect(fr.some(e => e.version === version)).toBe(true)
  })
  it('list versions newest first', () => {
    const { isNewer } = requireSrc('main/lib/version.js')
    en.slice(1).forEach((e, i) => expect(isNewer(en[i].version, e.version), e.version).toBe(true))
  })
  it('give every entry some content', () => {
    for (const e of [...en, ...fr]) expect(e.body.length, e.version).toBeGreaterThan(10)
  })
})

describe('scripts/release-notes.js', () => {
  const run = (version) => spawnSync(process.execPath, [path.join(root, 'scripts/release-notes.js'), version], { encoding: 'utf-8' })

  it('prints both languages for a documented version, accepting a leading v', () => {
    const out = run('v1.0.2')
    expect(out.status).toBe(0)
    expect(out.stdout).toContain('## English')
    expect(out.stdout).toContain('## Français')
    expect(out.stdout).toContain('Projects')
    expect(out.stdout).toContain('Projets')
  })

  it('fails for a version missing from the changelogs, so a release cannot go out without notes', () => {
    const out = run('9.9.9')
    expect(out.status).toBe(1)
    expect(out.stderr).toContain('no section for 9.9.9')
  })

  it('fails without an argument', () => {
    expect(run('').status).toBe(2)
  })
})
