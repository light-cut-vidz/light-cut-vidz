// Decides whether a source can go straight into the <video> element.
//
// Electron 41 ships H.264/AAC (Chromium's proprietary codecs are enabled), so
// the common phone/camera MP4 and MOV need no transcode at all. Anything else
// (HEVC, AVI, FLV, 10-bit H.264…) still goes through the VP9 preview.

const DIRECT_VIDEO = ['h264', 'vp8', 'vp9', 'av1']
const DIRECT_AUDIO = ['aac', 'mp3', 'opus', 'vorbis']
const DIRECT_PIX_FMT = ['yuv420p', 'yuvj420p']

/** @param {{format?: {format_name?: string}, streams?: object[]}} metadata stream info (see lib/ffmpeg.js) */
function canPlayDirectly(metadata) {
  const streams = (metadata && metadata.streams) || []
  const formatName = (metadata && metadata.format && metadata.format.format_name) || ''
  const containers = formatName.split(',')
  if (!containers.some(c => c === 'mov' || c === 'mp4' || c === 'webm')) return false

  const video = streams.find(s => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic))
  if (!video || !DIRECT_VIDEO.includes(video.codec_name)) return false
  if (video.pix_fmt && !DIRECT_PIX_FMT.includes(video.pix_fmt)) return false
  // An unreadable rotation tag would make the preview disagree with the export.
  if (video.tags && video.tags.rotate && video.tags.rotate !== '0') return false

  return streams.filter(s => s.codec_type === 'audio').every(a => DIRECT_AUDIO.includes(a.codec_name))
}

module.exports = { canPlayDirectly }
