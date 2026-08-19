const VIDEO_FILTERS = [
  { id: 'none', ffmpeg: '' },
  { id: 'grayscale', ffmpeg: 'hue=s=0' },
  { id: 'sepia', ffmpeg: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131' },
  { id: 'invert', ffmpeg: 'negate' },
  { id: 'blur', ffmpeg: 'boxblur=5:1' },
  { id: 'bright', ffmpeg: 'eq=brightness=0.3' },
  { id: 'dark', ffmpeg: 'eq=brightness=-0.3' },
  { id: 'contrast', ffmpeg: 'eq=contrast=2.0' },
  { id: 'saturate', ffmpeg: 'eq=saturation=2.0' },
  { id: 'hue', ffmpeg: 'hue=h=90' },
  { id: 'vintage', ffmpeg: 'curves=vintage' },
  { id: 'noir', ffmpeg: 'format=gray,eq=contrast=1.5' },
  { id: 'dramatic', ffmpeg: 'eq=contrast=1.5:brightness=-0.1:saturation=1.2' },
  { id: 'cold', ffmpeg: 'colortemperature=temperature=10000' },
  { id: 'warm', ffmpeg: 'colortemperature=temperature=4000' },
  { id: 'mirror', ffmpeg: 'hflip' },
  { id: 'upside_down', ffmpeg: 'vflip' },
  { id: 'posterize', ffmpeg: 'unsharp,eq=contrast=2,hqdn3d' },
  { id: 'vignette', ffmpeg: 'vignette' },
  { id: 'edges', ffmpeg: 'edgedetect=low=0.1:high=0.4' },
]

function getFilterFfmpeg(id) {
  const f = VIDEO_FILTERS.find(x => x.id === id)
  return f ? f.ffmpeg : ''
}

module.exports = { getFilterFfmpeg }
