// Colour treatments for the export. The table itself is shared with the renderer
// (src/shared/filters.json) so the preview and the export cannot drift apart.
const VIDEO_FILTERS = require('../shared/filters.json')

function getFilterFfmpeg(id) {
  const f = VIDEO_FILTERS.find(x => x.id === id)
  return f ? f.ffmpeg : ''
}

module.exports = { getFilterFfmpeg }
