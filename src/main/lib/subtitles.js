// Pure builders for the subtitle burn-in export pipeline: per-word/per-char
// timing, cut-timeline remapping, and .ass (libass) generation for the ffmpeg
// `subtitles` filter. SRT parsing lives in the renderer (utils/srt.ts) — cues
// arrive here already parsed, over IPC.

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

// Shared with the preview (src/shared/constants.json).
const { rainbowPalette: RAINBOW_PALETTE } = require('../../shared/constants.json')

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
// Intro animations (fade, slide, pop-in scale) belong to the moment a cue first
// appears. The part of a cue that survives *after* a cut is a continuation: it
// must not fade or slide in again.
function stripIntroAnimation(text) {
  return text
    .replace(/\\fad\([^)]*\)/g, '')
    .replace(/\\move\([^)]*\)/g, '')
    .replace(/\\t\([^)]*\)/g, '')
    .replace(/\\fscx60\\fscy60|\\fscx135\\fscy135/g, '')
    .replace(/\{\}/g, '')
}

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
          text: clipStart > ev.start ? stripIntroAnimation(ev.text) : ev.text,
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
  // 4 = box painted with BackColour (libass extension) and the text keeps its
  // outline. 3, the "official" opaque box, paints it with OutlineColour instead,
  // which silently ignores the chosen background colour and opacity.
  const borderStyle = backgroundOpacity > 0 ? 4 : 1
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

  // ASS times have a resolution of 10 ms: an event shorter than that (a
  // typewriter step on a fast cue) rounds to zero length and is never drawn.
  const lines = events
    .filter(ev => toAssTime(ev.start) !== toAssTime(ev.end))
    .map(ev => `Dialogue: 0,${toAssTime(ev.start)},${toAssTime(ev.end)},Default,,0,0,0,,${ev.text}`)
    .join('\n')

  return header + lines + '\n'
}

// Two escaping layers: the option value (`\`, `:`, `'`), then the filtergraph
// that carries it (`\`, `'`, `,`, `;`, brackets, spaces). Quoting would not do:
// inside '…' a backslash cannot escape an apostrophe.
function escapeForFfmpegFilter(p) {
  const option = p.replace(/[\\':]/g, m => `\\${m}`)
  return option.replace(/[\\',;[\] ]/g, m => `\\${m}`)
}

function buildSubtitlesFilter(assPath) {
  return `subtitles=${escapeForFfmpegFilter(assPath)}`
}

module.exports = {
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
