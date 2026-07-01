// Pure builders for the subtitle burn-in export pipeline: SRT parsing,
// per-word/per-char timing, cut-timeline remapping, and .ass (libass)
// generation for the ffmpeg `subtitles` filter.

const TIME_RE = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/

function timeToSeconds(h, m, s, ms) {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000
}

// Duplicated from src/renderer/src/utils/srt.ts (no shared module between
// main/renderer in this repo — same convention as filters.js/utils/filters.ts).
function parseSrt(content) {
  const blocks = content.replace(/\r\n/g, '\n').split(/\n\s*\n/)
  const cues = []
  let autoId = 1

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    if (lines.length === 0) continue

    const timeLineIndex = lines.findIndex(l => TIME_RE.test(l))
    if (timeLineIndex === -1) continue

    const match = lines[timeLineIndex].match(TIME_RE)
    const start = timeToSeconds(match[1], match[2], match[3], match[4])
    const end = timeToSeconds(match[5], match[6], match[7], match[8])
    const text = lines.slice(timeLineIndex + 1).join('\n').trim()

    if (!text || end <= start) continue
    cues.push({ id: autoId++, start, end, text })
  }

  return cues.sort((a, b) => a.start - b.start)
}

// Duplicated split-proportional-to-length formula from utils/subtitles.ts — keep both in sync.
function splitWordsProportional(cue) {
  const words = cue.text.split(/\s+/).filter(w => w.length > 0)
  if (words.length === 0) return []

  const totalChars = words.reduce((sum, w) => sum + w.length, 0)
  const duration = cue.end - cue.start
  let t = cue.start
  const out = []

  for (const word of words) {
    const share = totalChars > 0 ? word.length / totalChars : 1 / words.length
    const wDur = duration * share
    out.push({ start: t, end: t + wDur, text: word })
    t += wDur
  }

  out[out.length - 1].end = cue.end
  return out
}

function splitCharsProportional(cue) {
  const chars = Array.from(cue.text)
  if (chars.length === 0) return []

  const duration = cue.end - cue.start
  const charDur = duration / chars.length
  let t = cue.start
  let cumulative = ''
  const out = []

  for (const char of chars) {
    cumulative += char
    out.push({ start: t, end: t + charDur, text: cumulative })
    t += charDur
  }

  out[out.length - 1].end = cue.end
  return out
}

function escapeAssText(text) {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\N')
}

// &HBBGGRR& — used inside inline override tags (e.g. \1c...).
function assColorTag(hex) {
  const clean = (hex || '#ffffff').replace('#', '')
  const r = clean.slice(0, 2)
  const g = clean.slice(2, 4)
  const b = clean.slice(4, 6)
  return `&H${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}&`
}

// &HAABBGGRR — used in [V4+ Styles] Style lines. ASS alpha is INVERTED
// (00 = fully opaque, FF = fully transparent) — the classic gotcha here.
function assColor(hex, alpha01 = 1) {
  const clean = (hex || '#ffffff').replace('#', '')
  const r = clean.slice(0, 2)
  const g = clean.slice(2, 4)
  const b = clean.slice(4, 6)
  const clamped = Math.min(1, Math.max(0, alpha01))
  const alphaByte = Math.round((1 - clamped) * 255)
  const aa = alphaByte.toString(16).padStart(2, '0').toUpperCase()
  return `&H${aa}${b.toUpperCase()}${g.toUpperCase()}${r.toUpperCase()}`
}

// Duplicated in src/renderer/src/utils/subtitles.ts — keep both palettes in sync.
const RAINBOW_PALETTE = ['#FF3B5C', '#FFB800', '#00E5A0', '#00B4FF', '#B14EFF', '#FF6EC7']

function slideCoords(videoWidth, videoHeight, position) {
  const x = Math.round(videoWidth / 2)
  const margin = Math.round(videoHeight * 0.06)
  let yTarget
  if (position === 'top') yTarget = margin
  else if (position === 'middle') yTarget = Math.round(videoHeight / 2)
  else yTarget = videoHeight - margin
  const yStart = yTarget + Math.round(videoHeight * 0.05)
  return { x, yTarget, yStart }
}

/**
 * Expands phrase-level cues (real/original video time) into a flat list of
 * `{start,end,text}` events with ASS override tags already embedded,
 * according to the chosen animation mode.
 */
function expandCuesToEvents(cues, animation, opts = {}) {
  const {
    videoWidth = 1920, videoHeight = 1080, position = 'bottom',
    color = '#ffffff', accentColor = '#22d3ee',
  } = opts
  const events = []

  for (const cue of cues) {
    if (animation === 'word-pop') {
      for (const w of splitWordsProportional(cue)) {
        events.push({
          start: w.start,
          end: w.end,
          text: `{\\fscx60\\fscy60\\t(0,120,\\fscx100\\fscy100)}${escapeAssText(w.text)}`,
        })
      }
    } else if (animation === 'word-bounce') {
      for (const w of splitWordsProportional(cue)) {
        events.push({
          start: w.start,
          end: w.end,
          text: `{\\fscx135\\fscy135\\t(0,80,\\fscx100\\fscy100)}${escapeAssText(w.text)}`,
        })
      }
    } else if (animation === 'rainbow') {
      const words = splitWordsProportional(cue)
      const text = words.map((w, i) => (
        `{\\1c${assColorTag(RAINBOW_PALETTE[i % RAINBOW_PALETTE.length])}}${escapeAssText(w.text)}`
      )).join(' ')
      events.push({ start: cue.start, end: cue.end, text: `{\\fad(200,200)}${text}` })
    } else if (animation === 'typewriter') {
      for (const c of splitCharsProportional(cue)) {
        events.push({ start: c.start, end: c.end, text: escapeAssText(c.text) })
      }
    } else if (animation === 'word-highlight') {
      const words = splitWordsProportional(cue)
      words.forEach((w, i) => {
        const text = words.map((other, j) => {
          const escaped = escapeAssText(other.text)
          return j === i
            ? `{\\1c${assColorTag(accentColor)}}${escaped}{\\1c${assColorTag(color)}}`
            : escaped
        }).join(' ')
        events.push({ start: w.start, end: w.end, text })
      })
    } else if (animation === 'sentence-slide') {
      const { x, yTarget, yStart } = slideCoords(videoWidth, videoHeight, position)
      events.push({
        start: cue.start,
        end: cue.end,
        text: `{\\move(${x},${yStart},${x},${yTarget},0,300)\\fad(300,0)}${escapeAssText(cue.text)}`,
      })
    } else {
      // sentence-fade (default fallback for unrecognized modes)
      events.push({ start: cue.start, end: cue.end, text: `{\\fad(200,200)}${escapeAssText(cue.text)}` })
    }
  }

  return events
}

/**
 * Clips each event against every kept (real-time) segment and shifts the
 * surviving pieces into the concatenated/"virtual" output timeline. Direct
 * generalization of utils/time.ts's realToVirtual() from a point to a range —
 * an event straddling a cut boundary is naturally split into sub-events.
 */
function remapEventsToKeptSegments(events, kept) {
  const out = []
  for (const ev of events) {
    let virtualOffset = 0
    for (const seg of kept) {
      const clipStart = Math.max(ev.start, seg.start)
      const clipEnd = Math.min(ev.end, seg.end)
      if (clipEnd > clipStart) {
        out.push({
          ...ev,
          start: virtualOffset + (clipStart - seg.start),
          end: virtualOffset + (clipEnd - seg.start),
        })
      }
      virtualOffset += seg.end - seg.start
    }
  }
  return out
}

function toAssTime(seconds) {
  const totalCs = Math.max(0, Math.round(seconds * 100))
  const cs = totalCs % 100
  const totalSec = Math.floor(totalCs / 100)
  const s = totalSec % 60
  const m = Math.floor(totalSec / 60) % 60
  const h = Math.floor(totalSec / 3600)
  const pad2 = n => String(n).padStart(2, '0')
  return `${h}:${pad2(m)}:${pad2(s)}.${pad2(cs)}`
}

const ALIGNMENT = { top: 8, middle: 5, bottom: 2 }

function buildAssContent(events, style, videoWidth, videoHeight) {
  const {
    fontFamily = 'Arial', fontSize = 5, color = '#ffffff', outlineColor = '#000000',
    outlineWidth = 2, backgroundColor = '#000000', backgroundOpacity = 0, position = 'bottom',
  } = style

  const fontSizePx = Math.max(8, Math.round((fontSize / 100) * videoHeight))
  const alignment = ALIGNMENT[position] || ALIGNMENT.bottom
  const marginV = Math.round(videoHeight * 0.06)
  const borderStyle = backgroundOpacity > 0 ? 3 : 1 // 3 = opaque box, 1 = outline+shadow only
  const primaryColour = assColor(color, 1)
  const secondaryColour = assColor(color, 1)
  const outlineColour = assColor(outlineColor, 1)
  const backColour = assColor(backgroundColor, backgroundOpacity)

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${fontFamily},${fontSizePx},${primaryColour},${secondaryColour},${outlineColour},${backColour},-1,0,0,0,100,100,0,0,${borderStyle},${outlineWidth},1,${alignment},20,20,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

  const lines = events
    .map(ev => `Dialogue: 0,${toAssTime(ev.start)},${toAssTime(ev.end)},Default,,0,0,0,,${ev.text}`)
    .join('\n')

  return header + lines + '\n'
}

function escapeForFfmpegFilter(p) {
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

function buildSubtitlesFilter(assPath) {
  return `subtitles='${escapeForFfmpegFilter(assPath)}'`
}

module.exports = {
  parseSrt,
  splitWordsProportional,
  splitCharsProportional,
  assColor,
  assColorTag,
  expandCuesToEvents,
  remapEventsToKeptSegments,
  toAssTime,
  buildAssContent,
  buildSubtitlesFilter,
  RAINBOW_PALETTE,
}
