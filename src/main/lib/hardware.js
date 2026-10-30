// What this ffmpeg build can really do beyond software encoding: hardware H.264
// encoders and the stabilisation filters. Each hardware encoder is *tried* with
// a tiny encode, because being compiled in does not mean a GPU and driver are
// there to back it.

const path = require('path')
const { hardwareProfile } = require('./exportPlan')
const { escapeForFfmpegFilter } = require('./subtitles')

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

/**
 * Whether stabilisation really works with this build: having the filters is not
 * enough (some builds write motion data they cannot read back — "Cannot parse
 * localmotion!"), so both passes are tried on a short synthetic shaky clip.
 * @param {object} deps
 * @param {(args: string[]) => Promise<void>} deps.run   resolves when ffmpeg exits 0
 * @param {string} deps.filtersText  output of `ffmpeg -filters`
 * @param {string} deps.workDir      scratch directory for the motion file
 */
async function stabilizationWorks({ run, filtersText, workDir }) {
  if (!hasStabilization(filtersText)) return false
  const trf = escapeForFfmpegFilter(path.join(workDir, 'probe.trf'))
  // A shaky picture with real texture: flat or static test patterns make
  // vid.stab fail even on builds where it works on real footage.
  const source = ['-f', 'lavfi', '-i', "testsrc2=s=480x300:r=25:d=2,crop=320:240:x='80+20*sin(t*13)':y='30+15*sin(t*17)'"]
  try {
    await run([...source, '-vf', `vidstabdetect=shakiness=6:accuracy=15:result=${trf}`, '-f', 'null', '-'])
    await run([...source, '-vf', `vidstabtransform=input=${trf}`, '-f', 'null', '-'])
    return true
  } catch {
    return false
  }
}

module.exports = { detectHardware, hasStabilization, stabilizationWorks, CANDIDATES }
