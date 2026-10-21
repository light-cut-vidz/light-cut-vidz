// SRT files in the wild are UTF-8, UTF-8 with BOM, UTF-16, or — very commonly
// for French subtitles — Windows-1252. Reading them all as UTF-8 turns every
// accented letter of the latter into U+FFFD.

// Windows-1252 differs from Latin-1 only in 0x80–0x9F (curly quotes, dashes, €…).
// Node's own 'windows-1252' decoder does not always apply that table (it depends
// on how ICU was built), so map it here.
const CP1252_HIGH = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ'

function decodeWindows1252(buffer) {
  let out = ''
  for (const byte of buffer) out += byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte - 0x80] : String.fromCharCode(byte)
  return out
}

function decodeText(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(2))
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    // UTF-16BE: swap into LE rather than rely on a decoder label.
    const swapped = Buffer.from(buffer.subarray(2))
    swapped.swap16()
    return new TextDecoder('utf-16le').decode(swapped)
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\u{FEFF}/u, '')
  } catch {
    return decodeWindows1252(buffer)
  }
}

module.exports = { decodeText }
