// The light theme is plain CSS (prefers-color-scheme, driven by Electron's
// nativeTheme). Nothing renders it in jsdom, so this guards what can go wrong:
// a variable defined for one theme only, or a colour hard-coded where a
// variable belongs.
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = path.resolve(import.meta.dirname, '..')
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf-8')
const global = read('styles/global.css')

const block = (css: string, start: string) => {
  const i = css.indexOf(start)
  let depth = 0
  for (let j = css.indexOf('{', i); j < css.length; j++) {
    if (css[j] === '{') depth++
    if (css[j] === '}' && --depth === 0) return css.slice(css.indexOf('{', i) + 1, j)
  }
  return ''
}
const vars = (css: string) => new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]))

const dark = block(global, ':root {')
const light = block(block(global, '@media (prefers-color-scheme: light)'), ':root')

describe('theme variables', () => {
  it('has a light block that follows prefers-color-scheme', () => {
    expect(global).toMatch(/@media \(prefers-color-scheme: light\)/)
  })
  it('declares the browser colour scheme for each theme (form controls, scrollbars)', () => {
    expect(dark).toContain('color-scheme: dark')
    expect(light).toContain('color-scheme: light')
  })
  it('defines every surface and text colour in both themes', () => {
    for (const v of ['--bg-primary', '--bg-secondary', '--bg-tertiary', '--bg-hover', '--bg-card', '--border', '--accent', '--text-primary', '--text-secondary', '--text-muted', '--text-soft', '--danger', '--success', '--select', '--select-bg', '--drop-bg', '--tick-minor', '--hover-marker', '--trim-keep']) {
      expect(vars(dark).has(v), `${v} (dark)`).toBe(true)
      expect(vars(light).has(v), `${v} (light)`).toBe(true)
    }
  })
  it('only overrides variables that exist in the dark theme', () => {
    for (const v of vars(light)) expect(vars(dark).has(v), v).toBe(true)
  })
  it('keeps text readable: the light text is dark and the dark text is light', () => {
    const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) }
    const pick = (css: string, v: string) => new RegExp(`${v}:\\s*(#[0-9a-fA-F]{6})`).exec(css)![1]
    expect(lum(pick(light, '--text-primary'))).toBeLessThan(80)
    expect(lum(pick(light, '--bg-secondary'))).toBeGreaterThan(220)
    expect(lum(pick(dark, '--text-primary'))).toBeGreaterThan(200)
    expect(lum(pick(dark, '--bg-secondary'))).toBeLessThan(50)
  })
})

describe('components use the variables', () => {
  const css = (dir: string) => fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.css')).map(f => [`${dir}/${f}`, read(`${dir}/${f}`)] as const)
  // Colours that are meant to be the same in both themes: the picture area, the
  // cut (red), danger red, and the white-on-accent text.
  const allowed = new Set(['#000', '#fff', '#e53e3e', '#fc8181', '#ff3b30', '#000000', '#ffffff'])

  it.each(css('components'))('%s hard-codes no theme-dependent hex colour', (_file, text) => {
    const found = [...text.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0].toLowerCase()).filter(c => !allowed.has(c))
    expect(found).toEqual([])
  })
})
