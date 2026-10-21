import { defaultEditable } from '../hooks/useHistory'
import type { EditableState } from '../hooks/useHistory'

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Every editable value, ready to be written next to the video's path. */
export function toProject(videoPath: string, editable: EditableState) {
  return { videoPath, state: editable }
}

/**
 * Turns the `state` object of a project file back into editable state. The file
 * is untrusted input: anything of the wrong type falls back to its default
 * rather than reaching the editor.
 */
export function fromProjectState(raw: unknown): EditableState {
  const d = defaultEditable
  if (!isObj(raw)) return d
  const num = (key: keyof EditableState, min: number, max: number, fallback: number) => {
    const v = raw[key]
    return isNum(v) && v >= min && v <= max ? v : fallback
  }

  const cutSegments = Array.isArray(raw.cutSegments)
    ? raw.cutSegments.filter((s): s is Record<string, unknown> => isObj(s) && isNum(s.start) && isNum(s.end) && s.start >= 0 && s.end > s.start)
      .map((s, i) => ({ id: typeof s.id === 'string' ? s.id : `cut-${i}`, start: s.start as number, end: s.end as number }))
    : d.cutSegments

  const c = raw.crop
  const crop = isObj(c) && isNum(c.x) && isNum(c.y) && isNum(c.w) && isNum(c.h) && c.w > 0 && c.h > 0
    ? { x: c.x, y: c.y, w: c.w, h: c.h } : null

  let subtitles = d.subtitles
  const sub = raw.subtitles
  if (isObj(sub) && Array.isArray(sub.cues) && isObj(sub.style) && typeof sub.animation === 'string') {
    const cues = sub.cues.filter((q): q is Record<string, unknown> => isObj(q) && isNum(q.start) && isNum(q.end) && q.end > q.start && typeof q.text === 'string')
      .map((q, i) => ({ id: i + 1, start: q.start as number, end: q.end as number, text: q.text as string }))
    if (cues.length > 0) {
      subtitles = {
        fileName: typeof sub.fileName === 'string' ? sub.fileName : 'subtitles.srt',
        cues,
        style: { ...(sub.style as object) } as NonNullable<EditableState['subtitles']>['style'],
        animation: sub.animation as NonNullable<EditableState['subtitles']>['animation'],
      }
    }
  }

  return {
    speed: num('speed', 0.25, 4, d.speed),
    muted: raw.muted === true,
    crop,
    cutSegments,
    filter: typeof raw.filter === 'string' ? raw.filter : d.filter,
    rotation: num('rotation', -360, 360, d.rotation),
    straighten: num('straighten', -45, 45, d.straighten),
    perspectiveHorizontal: num('perspectiveHorizontal', -45, 45, d.perspectiveHorizontal),
    perspectiveVertical: num('perspectiveVertical', -45, 45, d.perspectiveVertical),
    subtitles,
  }
}
