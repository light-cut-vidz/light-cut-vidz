// ffmpeg's atempo filter only accepts speeds in [0.5, 2.0]; chain it for values outside that range.
function clampAtempo(speed) {
  if (speed >= 0.5 && speed <= 2) return speed.toFixed(4)
  if (speed > 2) return `2.0,atempo=${(speed / 2).toFixed(4)}`
  return `0.5,atempo=${(speed * 2).toFixed(4)}`
}

module.exports = { clampAtempo }
