// Compares release versions numerically. An equality check is not enough: if the
// latest release is ever older than the installed build, `latest !== current` holds
// and a downgrade gets offered to the user as if it were an update.
function isNewer(remote, current) {
  const parse = (v) => String(v).replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const [r, c] = [parse(remote), parse(current)]
  for (let i = 0; i < Math.max(r.length, c.length); i++) {
    if ((r[i] || 0) !== (c[i] || 0)) return (r[i] || 0) > (c[i] || 0)
  }
  return false
}

module.exports = { isNewer }
