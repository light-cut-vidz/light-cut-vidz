import { describe, it, expect } from 'vitest'
import { requireSrc } from './__doubles__/installElectron.js'
const { canPlayDirectly } = requireSrc('main/lib/preview.js')

const mp4 = (video = {}, audio = { codec_name: 'aac' }) => ({
  format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
  streams: [
    { codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', ...video },
    ...(audio ? [{ codec_type: 'audio', ...audio }] : []),
  ],
})

describe('canPlayDirectly', () => {
  it('accepts the usual phone/camera H.264 + AAC MP4', () => expect(canPlayDirectly(mp4())).toBe(true))
  it('accepts a video with no audio track', () => expect(canPlayDirectly(mp4({}, null))).toBe(true))
  it('accepts VP9 + Opus WebM', () => {
    expect(canPlayDirectly({
      format: { format_name: 'matroska,webm' },
      streams: [{ codec_type: 'video', codec_name: 'vp9', pix_fmt: 'yuv420p' }, { codec_type: 'audio', codec_name: 'opus' }],
    })).toBe(true)
  })
  it('rejects HEVC', () => expect(canPlayDirectly(mp4({ codec_name: 'hevc' }))).toBe(false))
  it('rejects 10-bit and 4:4:4 H.264', () => {
    expect(canPlayDirectly(mp4({ pix_fmt: 'yuv420p10le' }))).toBe(false)
    expect(canPlayDirectly(mp4({ pix_fmt: 'yuv444p' }))).toBe(false)
  })
  it('rejects an unsupported audio codec', () => expect(canPlayDirectly(mp4({}, { codec_name: 'ac3' }))).toBe(false))
  it('rejects containers other than mp4/mov/webm', () => {
    expect(canPlayDirectly({ ...mp4(), format: { format_name: 'avi' } })).toBe(false)
    expect(canPlayDirectly({ ...mp4(), format: { format_name: 'flv' } })).toBe(false)
  })
  it('rejects a file with a rotation tag (preview and export would disagree)', () => {
    expect(canPlayDirectly(mp4({ tags: { rotate: '90' } }))).toBe(false)
  })
  it('rejects missing or empty metadata', () => {
    expect(canPlayDirectly(null)).toBe(false)
    expect(canPlayDirectly({})).toBe(false)
    expect(canPlayDirectly({ format: { format_name: 'mp4' }, streams: [] })).toBe(false)
  })
})
