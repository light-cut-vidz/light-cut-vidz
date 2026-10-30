import { describe, it, expect, vi } from 'vitest'
import { requireSrc } from './__doubles__/installElectron.js'

const { createExportQueue } = requireSrc('main/lib/exportQueue.js')

/** An `execute` the test finishes by hand. */
function manual() {
  const runs = []
  const execute = vi.fn((spec, ctx) => new Promise((resolve, reject) => {
    runs.push({ spec, ctx, resolve, reject })
  }))
  return { execute, runs }
}
const meta = (n) => ({ name: `clip${n}.mp4`, format: 'mp4', outputPath: `/out/clip${n}.mp4` })
const tick = () => new Promise(r => setTimeout(r, 0))

describe('export queue', () => {
  it('starts the first job at once and keeps the next ones waiting', async () => {
    const m = manual()
    const q = createExportQueue({ execute: m.execute })
    q.add('a', meta(1)); q.add('b', meta(2)); q.add('c', meta(3))
    await tick()
    expect(m.runs).toHaveLength(1)
    expect(q.list().map(j => j.status)).toEqual(['running', 'queued', 'queued'])
  })

  it('runs jobs strictly one after the other, in order', async () => {
    const m = manual()
    const q = createExportQueue({ execute: m.execute })
    q.add('a', meta(1)); q.add('b', meta(2))
    await tick()
    m.runs[0].resolve({ success: true })
    await tick()
    expect(m.runs.map(r => r.spec)).toEqual(['a', 'b'])
    m.runs[1].resolve({ success: true })
    await tick()
    expect(q.list().map(j => j.status)).toEqual(['done', 'done'])
    expect(q.hasActive()).toBe(false)
  })

  it('resolves `done` with the job result', async () => {
    const m = manual()
    const q = createExportQueue({ execute: m.execute })
    const { done } = q.add('a', meta(1))
    await tick()
    m.runs[0].resolve({ success: true, outputPath: '/out/clip1.mp4' })
    await expect(done).resolves.toEqual({ success: true, outputPath: '/out/clip1.mp4' })
  })

  it('a failing job does not stop the next one', async () => {
    const m = manual()
    const q = createExportQueue({ execute: m.execute })
    const first = q.add('a', meta(1)); q.add('b', meta(2))
    await tick()
    m.runs[0].reject(new Error('ffmpeg exploded'))
    await expect(first.done).rejects.toThrow('ffmpeg exploded')
    await tick()
    expect(q.list()[0]).toMatchObject({ status: 'error', error: 'ffmpeg exploded' })
    expect(q.list()[1].status).toBe('running')
  })

  it('does not raise an unhandled rejection for a fire-and-forget job that fails', async () => {
    const m = manual()
    const q = createExportQueue({ execute: m.execute })
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    q.add('a', meta(1))
    await tick()
    m.runs[0].reject(new Error('boom'))
    await tick(); await tick()
    process.off('unhandledRejection', unhandled)
    expect(unhandled).not.toHaveBeenCalled()
  })

  describe('progress', () => {
    it('is recorded, rounded and clamped', async () => {
      const m = manual()
      const q = createExportQueue({ execute: m.execute })
      q.add('a', meta(1))
      await tick()
      m.runs[0].ctx.setProgress(41.6)
      expect(q.list()[0].progress).toBe(42)
      m.runs[0].ctx.setProgress(250)
      expect(q.list()[0].progress).toBe(100)
      m.runs[0].ctx.setProgress(-5)
      expect(q.list()[0].progress).toBe(0)
    })

    it('notifies only when the visible value changes', async () => {
      const m = manual()
      const onChange = vi.fn()
      const q = createExportQueue({ execute: m.execute, onChange })
      q.add('a', meta(1))
      await tick()
      onChange.mockClear()
      m.runs[0].ctx.setProgress(10); m.runs[0].ctx.setProgress(10.2); m.runs[0].ctx.setProgress(10.4)
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('calls the per-job callback', async () => {
      const m = manual()
      const onProgress = vi.fn()
      const q = createExportQueue({ execute: m.execute })
      q.add('a', { ...meta(1), onProgress })
      await tick()
      m.runs[0].ctx.setProgress(30)
      expect(onProgress).toHaveBeenCalledWith(30)
    })

    it('reaches 100 when the job is done', async () => {
      const m = manual()
      const q = createExportQueue({ execute: m.execute })
      q.add('a', meta(1))
      await tick()
      m.runs[0].resolve({})
      await tick()
      expect(q.list()[0].progress).toBe(100)
    })
  })

  describe('cancel', () => {
    it('removes a waiting job without ever running it', async () => {
      const m = manual()
      const q = createExportQueue({ execute: m.execute })
      q.add('a', meta(1))
      const second = q.add('b', meta(2))
      await tick()
      expect(q.cancel(second.id)).toBe(true)
      await expect(second.done).rejects.toThrow('cancelled')
      m.runs[0].resolve({})
      await tick()
      expect(m.runs).toHaveLength(1)
      expect(q.list().map(j => j.status)).toEqual(['done', 'cancelled'])
    })

    it('kills the running job and moves on to the next', async () => {
      const m = manual()
      const q = createExportQueue({ execute: m.execute })
      const first = q.add('a', meta(1)); q.add('b', meta(2))
      await tick()
      const kill = vi.fn(() => m.runs[0].reject(new Error('whatever ffmpeg says')))
      m.runs[0].ctx.setKill(kill)
      expect(q.cancel(first.id)).toBe(true)
      expect(kill).toHaveBeenCalled()
      await expect(first.done).rejects.toThrow('cancelled') // reported as a cancellation, not as ffmpeg's error
      await tick()
      expect(q.list()[0].status).toBe('cancelled')
      expect(q.list()[1].status).toBe('running')
    })

    it('lets the job notice a cancellation that arrives before it can be killed', async () => {
      const m = manual()
      const q = createExportQueue({ execute: m.execute })
      const first = q.add('a', meta(1))
      await tick()
      q.cancel(first.id) // no kill function registered yet
      expect(m.runs[0].ctx.isCancelled()).toBe(true)
    })

    it('ignores unknown and finished jobs', async () => {
      const m = manual()
      const q = createExportQueue({ execute: m.execute })
      const first = q.add('a', meta(1))
      await tick()
      m.runs[0].resolve({})
      await tick()
      expect(q.cancel(first.id)).toBe(false)
      expect(q.cancel(999)).toBe(false)
    })

    it('cancelAll stops everything that is active', async () => {
      const m = manual()
      const q = createExportQueue({ execute: m.execute })
      q.add('a', meta(1)); q.add('b', meta(2))
      await tick()
      m.runs[0].ctx.setKill(() => m.runs[0].reject(new Error('x')))
      q.cancelAll()
      await tick()
      expect(q.list().map(j => j.status)).toEqual(['cancelled', 'cancelled'])
      expect(q.hasActive()).toBe(false)
    })
  })

  it('refuses a second active job that writes the same file', () => {
    const m = manual()
    const q = createExportQueue({ execute: m.execute })
    q.add('a', meta(1))
    expect(() => q.add('b', meta(1))).toThrow('already writes to that file')
  })

  it('accepts the same file again once the first job is over', async () => {
    const m = manual()
    const q = createExportQueue({ execute: m.execute })
    q.add('a', meta(1))
    await tick()
    m.runs[0].resolve({})
    await tick()
    expect(() => q.add('b', meta(1))).not.toThrow()
  })

  it('clearFinished forgets finished jobs but keeps the active ones', async () => {
    const m = manual()
    const q = createExportQueue({ execute: m.execute })
    q.add('a', meta(1)); q.add('b', meta(2))
    await tick()
    m.runs[0].resolve({})
    await tick()
    q.clearFinished()
    expect(q.list()).toHaveLength(1)
    expect(q.list()[0].name).toBe('clip2.mp4')
  })

  it('counts the active jobs and looks one up', async () => {
    const m = manual()
    const q = createExportQueue({ execute: m.execute })
    const a = q.add('a', meta(1)); q.add('b', meta(2))
    expect(q.activeCount()).toBe(2)
    expect(q.get(a.id)).toMatchObject({ name: 'clip1.mp4' })
    expect(q.get(42)).toBeNull()
  })

  it('never exposes the job spec or its internals to the UI', async () => {
    const m = manual()
    const q = createExportQueue({ execute: m.execute })
    q.add({ secret: 'inputPath' }, meta(1))
    expect(Object.keys(q.list()[0]).sort()).toEqual(['error', 'format', 'id', 'name', 'outputPath', 'progress', 'status'])
  })
})
