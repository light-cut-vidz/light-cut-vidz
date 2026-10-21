import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { requireSrc } from './__doubles__/installElectron.js'

const { kindOf, sanitizeRecent, addRecent, removeRecent, MAX_RECENT } = requireSrc('main/lib/recent.js')
const { sanitizeSettings, THEMES, DEFAULTS } = requireSrc('main/lib/settings.js')
const { readJson, writeJson } = requireSrc('main/lib/store.js')

describe('kindOf', () => {
  it('tells projects from videos, whatever the case', () => {
    expect(kindOf('/a/b.lcvproj')).toBe('project')
    expect(kindOf('/a/b.LCVPROJ')).toBe('project')
    expect(kindOf('/a/b.MP4')).toBe('video')
    expect(kindOf('/a/b.mkv')).toBe('video')
  })
  it.each([['a relative path', 'b.mp4'], ['another file type', '/etc/passwd'], ['a non-string', 42], ['nothing', undefined]])('refuses %s', (_n, v) => {
    expect(kindOf(v)).toBeNull()
  })
})

describe('addRecent', () => {
  it('puts the newest first', () => {
    const list = addRecent(addRecent([], '/a.mp4', 1), '/b.mp4', 2)
    expect(list.map(i => i.path)).toEqual(['/b.mp4', '/a.mp4'])
  })
  it('moves an item already present to the top instead of duplicating it', () => {
    let list = addRecent(addRecent([], '/a.mp4', 1), '/b.mp4', 2)
    list = addRecent(list, '/a.mp4', 3)
    expect(list.map(i => i.path)).toEqual(['/a.mp4', '/b.mp4'])
    expect(list[0].openedAt).toBe(3)
  })
  it(`keeps at most ${MAX_RECENT} items`, () => {
    let list = []
    for (let i = 0; i < 25; i++) list = addRecent(list, `/v${i}.mp4`, i)
    expect(list).toHaveLength(MAX_RECENT)
    expect(list[0].path).toBe('/v24.mp4')
  })
  it('ignores a path the app would not open', () => {
    expect(addRecent([], '/etc/passwd')).toEqual([])
  })
  it('does not mutate its input', () => {
    const list = Object.freeze([])
    expect(() => addRecent(list, '/a.mp4')).not.toThrow()
  })
})

describe('removeRecent', () => {
  it('removes one entry', () => {
    const list = addRecent(addRecent([], '/a.mp4'), '/b.mp4')
    expect(removeRecent(list, '/a.mp4').map(i => i.path)).toEqual(['/b.mp4'])
  })
})

describe('sanitizeRecent (a file from disk is not trusted)', () => {
  it('keeps valid entries', () => {
    expect(sanitizeRecent({ items: [{ path: '/a.mp4', openedAt: 5 }, { path: '/p.lcvproj', openedAt: 6 }] }))
      .toEqual([{ kind: 'video', path: '/a.mp4', openedAt: 5 }, { kind: 'project', path: '/p.lcvproj', openedAt: 6 }])
  })
  it.each([null, undefined, 3, 'x', [], {}, { items: 'no' }, { items: null }])('copes with %j', (raw) => {
    expect(sanitizeRecent(raw)).toEqual([])
  })
  it('drops entries of the wrong shape, unknown types, relative paths and duplicates', () => {
    const out = sanitizeRecent({ items: [null, 3, { path: '/etc/passwd' }, { path: 'rel.mp4' }, { path: '/a.mp4' }, { path: '/a.mp4' }, { path: 7 }] })
    expect(out.map(i => i.path)).toEqual(['/a.mp4'])
  })
  it('never trusts the kind written in the file', () => {
    expect(sanitizeRecent({ items: [{ kind: 'project', path: '/a.mp4' }] })[0].kind).toBe('video')
  })
  it('bounds the length', () => {
    expect(sanitizeRecent({ items: Array.from({ length: 100 }, (_, i) => ({ path: `/v${i}.mp4` })) })).toHaveLength(MAX_RECENT)
  })
  it('replaces a bad timestamp by 0', () => {
    expect(sanitizeRecent({ items: [{ path: '/a.mp4', openedAt: 'yesterday' }] })[0].openedAt).toBe(0)
  })
})

describe('sanitizeSettings', () => {
  it('defaults to following the system theme', () => {
    expect(DEFAULTS.theme).toBe('system')
    expect(sanitizeSettings(null)).toEqual({ theme: 'system' })
  })
  it.each(THEMES)('keeps the %s theme', (theme) => {
    expect(sanitizeSettings({ theme })).toEqual({ theme })
  })
  it.each([[{ theme: 'purple' }], [{ theme: 3 }], [[]], ['dark'], [undefined]])('falls back for %j', (raw) => {
    expect(sanitizeSettings(raw)).toEqual({ theme: 'system' })
  })
  it('drops unknown keys', () => {
    expect(sanitizeSettings({ theme: 'dark', evil: 1 })).toEqual({ theme: 'dark' })
  })
})

describe('store', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcv-store-'))
  it('round-trips JSON, creating missing folders', async () => {
    const file = path.join(dir, 'deep', 'er', 'x.json')
    await writeJson(file, { a: [1, 2] })
    expect(await readJson(file)).toEqual({ a: [1, 2] })
  })
  it('reads null for a missing file', async () => {
    expect(await readJson(path.join(dir, 'nope.json'))).toBeNull()
  })
  it('reads null for a corrupt file instead of throwing', async () => {
    const file = path.join(dir, 'bad.json')
    fs.writeFileSync(file, '{ not json')
    expect(await readJson(file)).toBeNull()
  })
  it('leaves no temp file behind', async () => {
    const file = path.join(dir, 'clean.json')
    await writeJson(file, { ok: true })
    expect(fs.readdirSync(dir).filter(f => f.startsWith('clean.json'))).toEqual(['clean.json'])
  })
  it('overwrites atomically', async () => {
    const file = path.join(dir, 'over.json')
    await writeJson(file, { v: 1 })
    await writeJson(file, { v: 2 })
    expect(await readJson(file)).toEqual({ v: 2 })
  })
})
