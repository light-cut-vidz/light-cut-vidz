// What this ffmpeg build can really do beyond software encoding: hardware H.264
// encoders and the stabilisation filters. Each hardware encoder is *tried* with
// a tiny encode, because being compiled in does not mean a GPU and driver are
// there to back it.

const { hardwareProfile } = require('./exportPlan')

const CANDIDATES = {
  darwin: ['videotoolbox'],
  linux: ['nvenc', 'vaapi', 'qsv'],
  win32: ['nvenc', 'qsv'],
}

/**
 * @param {object} deps
 * @param {(args: string[]) => Promise<void>} deps.run   resolves when ffmpeg exits 0
 * @param {string} deps.platform
 * @returns {Promise<string[]>} the usable encoder ids, best first
 */
async function detectHardware({ run, platform }) {
  const usable = []
  for (const id of CANDIDATES[platform] || []) {
    const { inputArgs, filter, args } = hardwareProfile(id, 'balanced')
    try {
      await run([
        ...inputArgs,
        '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=0.3:r=10',
        '-vf', filter || 'format=yuv420p',
        ...args,
        '-f', 'null', '-',
      ])
      usable.push(id)
    } catch { /* not available on this machine */ }
  }
  return usable
}

/** `ffmpeg -filters` lists both stabilisation filters. */
const hasStabilization = (filtersText) => /\bvidstabdetect\b/.test(filtersText) && /\bvidstabtransform\b/.test(filtersText)

module.exports = { detectHardware, hasStabilization, CANDIDATES }
