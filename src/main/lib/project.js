// Project files: the video's path plus every edit, as JSON. They come from disk,
// so everything is validated before it reaches the renderer or the allow-list.

const path = require('path')
const { videoExtensions } = require('../../shared/constants.json')

const MAX_PROJECT_BYTES = 50 * 1024 * 1024
const FORMAT_VERSION = 1
const PROJECT_EXTENSION = 'lcvproj'

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function serializeProject(project) {
  return JSON.stringify({ lightcutvidz: FORMAT_VERSION, videoPath: project.videoPath, state: project.state }, null, 2)
}

/**
 * @returns {{ videoPath: string, state: object }}
 * @throws when the text is not a project this version understands
 */
function parseProject(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > MAX_PROJECT_BYTES) throw new Error('not a project')
  let data
  try { data = JSON.parse(text) } catch { throw new Error('not a project') }
  if (!isObject(data) || data.lightcutvidz !== FORMAT_VERSION) throw new Error('not a project')
  const { videoPath, state } = data
  if (typeof videoPath !== 'string' || !path.isAbsolute(videoPath)) throw new Error('not a project')
  if (!videoExtensions.includes(path.extname(videoPath).slice(1).toLowerCase())) throw new Error('not a project')
  if (!isObject(state)) throw new Error('not a project')
  return { videoPath, state }
}

module.exports = { serializeProject, parseProject, PROJECT_EXTENSION, MAX_PROJECT_BYTES }
