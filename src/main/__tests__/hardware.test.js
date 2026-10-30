import { describe, it, expect, vi } from 'vitest'
import { requireSrc } from './__doubles__/installElectron.js'

const { detectHardware, hasStabilization, stabilizationWorks, CANDIDATES } = requireSrc('main/lib/hardware.js')

describe('detectHardware', () => {
  it('tries only the encoders that make sense for the platform', () => {
    expect(CANDIDATES.darwin).toEqual(['videotoolbox'])
    expect(CANDIDATES.linux).toEqual(['nvenc', 'vaapi', 'qsv'])
    expect(CANDIDATES.win32).toEqual(['nvenc', 'qsv'])
  })

  it('returns the encoders whose trial encode succeeds, in order', async () => {
    const run = vi.fn(async (args) => { if (args.includes('h264_nvenc') || args.includes('h264_qsv')) throw new Error('no device') })
    expect(await detectHardware({ run, platform: 'linux' })).toEqual(['vaapi'])
    expect(run).toHaveBeenCalledTimes(3)
  })

  it('returns an empty list when nothing works, without throwing', async () => {
    expect(await detectHardware({ run: async () => { throw new Error('x') }, platform: 'linux' })).toEqual([])
  })

  it('returns nothing for a platform with no candidate', async () => {
    const run = vi.fn()
    expect(await detectHardware({ run, platform: 'freebsd' })).toEqual([])
    expect(run).not.toHaveBeenCalled()
  })

  it('trial-encodes a tiny synthetic clip to a null output', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    await detectHardware({ run, platform: 'darwin' })
    const args = run.mock.calls[0][0]
    expect(args).toContain('lavfi')
    expect(args.slice(-3)).toEqual(['-f', 'null', '-'])
    expect(args).toContain('h264_videotoolbox')
  })

  it('gives VAAPI its device and upload filter in the trial too', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    await detectHardware({ run, platform: 'linux' })
    const vaapi = run.mock.calls.map(c => c[0]).find(a => a.includes('h264_vaapi'))
    expect(vaapi).toContain('-vaapi_device')
    expect(vaapi[vaapi.indexOf('-vf') + 1]).toBe('format=nv12,hwupload')
  })
})

describe('hasStabilization', () => {
  it('needs both filters', () => {
    expect(hasStabilization(' ... vidstabdetect  V->V\n ... vidstabtransform V->V')).toBe(true)
    expect(hasStabilization(' ... vidstabdetect  V->V')).toBe(false)
    expect(hasStabilization('')).toBe(false)
  })
})

describe('stabilizationWorks', () => {
  const filtersText = ' ... vidstabdetect  V->V\n ... vidstabtransform V->V'

  it('tries both passes and says yes when they succeed', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    expect(await stabilizationWorks({ run, filtersText, workDir: '/w' })).toBe(true)
    expect(run.mock.calls[0][0].join(' ')).toContain('vidstabdetect=shakiness=6:accuracy=15:result=/w/probe.trf')
    expect(run.mock.calls[1][0].join(' ')).toContain('vidstabtransform=input=/w/probe.trf')
  })

  it('says no when the motion data cannot be read back', async () => {
    const run = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Cannot parse localmotion!'))
    expect(await stabilizationWorks({ run, filtersText, workDir: '/w' })).toBe(false)
  })

  it('says no without trying when the filters are missing', async () => {
    const run = vi.fn()
    expect(await stabilizationWorks({ run, filtersText: '', workDir: '/w' })).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })
})
