// A sequential queue of export jobs. ffmpeg already uses every core, so jobs run
// one after the other; the queue owns their lifecycle and tells the UI about it.
//
//   queued -> running -> done | error | cancelled
//
// It knows nothing about ffmpeg: `execute(spec, ctx)` does the work.

/** @typedef {'queued'|'running'|'done'|'error'|'cancelled'} JobStatus */
/** @typedef {{ id: number, name: string, format: string, status: JobStatus, progress: number, outputPath: string, error: string|null }} JobSnapshot */

/**
 * @param {object} deps
 * @param {(spec: any, ctx: { setProgress: (pct: number) => void, setKill: (fn: () => void) => void, isCancelled: () => boolean }) => Promise<any>} deps.execute
 * @param {(jobs: JobSnapshot[]) => void} [deps.onChange]  called after every visible change
 */
function createExportQueue({ execute, onChange = () => {} }) {
  /** @type {any[]} */
  const jobs = []
  let running = null
  let seq = 0

  const snapshot = (j) => ({ id: j.id, name: j.name, format: j.format, status: j.status, progress: j.progress, outputPath: j.outputPath, error: j.error })
  const list = () => jobs.map(snapshot)
  const emit = () => onChange(list())
  const isActive = (j) => j.status === 'queued' || j.status === 'running'

  async function pump() {
    if (running) return
    const job = jobs.find(j => j.status === 'queued')
    if (!job) return
    running = job
    job.status = 'running'
    emit()
    try {
      const result = await execute(job.spec, {
        setProgress: (pct) => {
          const p = Math.max(0, Math.min(100, Math.round(pct)))
          if (p === job.progress) return
          job.progress = p
          if (job.onProgress) job.onProgress(p)
          emit()
        },
        setKill: (fn) => { job.kill = fn },
        isCancelled: () => job.cancelled,
      })
      job.status = 'done'
      job.progress = 100
      job.resolve(result)
    } catch (err) {
      if (job.cancelled) {
        job.status = 'cancelled'
        job.reject(new Error('cancelled'))
      } else {
        job.status = 'error'
        job.error = err instanceof Error ? err.message : String(err)
        job.reject(err)
      }
    }
    job.kill = null
    running = null
    emit()
    pump()
  }

  /**
   * @param {any} spec  handed to `execute`
   * @param {{ name: string, format: string, outputPath: string, onProgress?: (pct: number) => void }} meta
   * @returns {{ id: number, done: Promise<any> }}
   */
  function add(spec, meta) {
    // Two jobs writing the same file would overwrite each other.
    if (jobs.some(j => isActive(j) && j.outputPath === meta.outputPath)) {
      throw new Error('Another queued export already writes to that file')
    }
    /** @type {any} */
    const job = {
      id: ++seq, ...meta, spec, status: 'queued', progress: 0, error: null, kill: null, cancelled: false,
      resolve: () => {}, reject: () => {}, done: null,
    }
    job.done = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject })
    // Nobody may be awaiting a fire-and-forget job: that is not an unhandled rejection.
    job.done.catch(() => {})
    jobs.push(job)
    emit()
    pump()
    return { id: job.id, done: job.done }
  }

  /** Cancels a waiting job outright, or kills a running one. Returns false if unknown or finished. */
  function cancel(id) {
    const job = jobs.find(j => j.id === id)
    if (!job || !isActive(job)) return false
    job.cancelled = true
    if (job.status === 'queued') {
      job.status = 'cancelled'
      job.reject(new Error('cancelled'))
      emit()
    } else if (job.kill) {
      job.kill()
    }
    return true
  }

  /** Cancels every active job (used when the app quits). */
  function cancelAll() {
    for (const job of [...jobs]) if (isActive(job)) cancel(job.id)
  }

  /** Forgets finished jobs, keeping the active ones. */
  function clearFinished() {
    for (let i = jobs.length - 1; i >= 0; i--) if (!isActive(jobs[i])) jobs.splice(i, 1)
    emit()
  }

  return {
    add, cancel, cancelAll, clearFinished, list,
    get: (id) => { const j = jobs.find(x => x.id === id); return j ? snapshot(j) : null },
    hasActive: () => jobs.some(isActive),
    activeCount: () => jobs.filter(isActive).length,
  }
}

module.exports = { createExportQueue }
