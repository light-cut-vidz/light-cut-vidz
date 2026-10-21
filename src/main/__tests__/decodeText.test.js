import { describe, it, expect } from 'vitest'
import { requireSrc } from './__doubles__/installElectron.js'
const { decodeText } = requireSrc('main/lib/decodeText.js')

describe('decodeText', () => {
  it('reads UTF-8', () => expect(decodeText(Buffer.from('café – Ça va', 'utf-8'))).toBe('café – Ça va'))
  it('drops a UTF-8 BOM', () => expect(decodeText(Buffer.from('﻿hello', 'utf-8'))).toBe('hello'))
  it('falls back to Windows-1252 for legacy French subtitles', () => {
    expect(decodeText(Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0xe0, 0x20, 0x92]))).toBe('café à ’')
  })
  it('reads UTF-16 little-endian with BOM', () => {
    expect(decodeText(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('été', 'utf16le')]))).toBe('été')
  })
  it('reads UTF-16 big-endian with BOM', () => {
    const le = Buffer.from('été', 'utf16le')
    le.swap16()
    expect(decodeText(Buffer.concat([Buffer.from([0xfe, 0xff]), le]))).toBe('été')
  })
  it('handles an empty file', () => expect(decodeText(Buffer.alloc(0))).toBe(''))
})
