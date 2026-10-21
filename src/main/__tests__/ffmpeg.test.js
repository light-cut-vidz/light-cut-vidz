import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'events'
import { requireSrc } from './__doubles__/installElectron.js'

const { createFfmpeg, parseMediaInfo, splitTopLevel } = requireSrc('main/lib/ffmpeg.js')

const MP4_INFO = `Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/v/in.mp4':
  Metadata:
    major_brand     : isom
  Duration: 00:01:02.50, start: 0.000000, bitrate: 15591 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 15513 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
      Metadata:
        handler_name    : VideoHandler
      Side data:
        displaymatrix: rotation of -90.00 degrees
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, mono, fltp, 69 kb/s (default)
At least one output file must be specified
`

describe('splitTopLevel', () => {
  it('ignores commas inside parentheses and brackets', () => {
    expect(splitTopLevel('h264 (High), yuv420p(tv, bt709), 1920x1080 [SAR 1:1, DAR 16:9], 30 fps'))
      .toEqual(['h264 (High)', 'yuv420p(tv, bt709)', '1920x1080 [SAR 1:1, DAR 16:9]', '30 fps'])
  })
})

describe('parseMediaInfo', () => {
  const info = parseMediaInfo(MP4_INFO)

  it('reads the container (a comma-separated list) and the duration', () => {
    expect(info.format.format_name).toBe('mov,mp4,m4a,3gp,3g2,mj2')
    expect(info.format.duration).toBe(62.5)
  })

  it('reads codec, pixel format and size of the video stream', () => {
    expect(info.streams[0]).toMatchObject({ codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', width: 1920, height: 1080 })
  })

  it('reads the audio codec', () => {
    expect(info.streams[1]).toMatchObject({ codec_type: 'audio', codec_name: 'aac' })
  })

  it('attaches a display-matrix rotation to the video stream', () => {
    expect(info.streams[0].tags).toEqual({ rotate: '90' })
  })

  it('does not mistake a hex tag for the frame size', () => {
    expect(info.streams[0].width).not.toBe(0x31637661)
  })

  it('flags a cover-art stream', () => {
    const cover = parseMediaInfo(`Input #0, mp3, from 'a.mp3':
  Duration: 00:03:00.00, start: 0.0, bitrate: 128 kb/s
  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 128 kb/s
  Stream #0:1: Video: mjpeg (Baseline), yuvj420p(pc, bt470bg/unknown/unknown), 500x500 [SAR 1:1 DAR 1:1], 90k tbr (attached pic)
`)
    expect(cover.streams[1].disposition).toEqual({ attached_pic: 1 })
  })

  it('reads WebM and unusual stream ids', () => {
    const webm = parseMediaInfo(`Input #0, matroska,webm, from 'a.webm':
  Duration: N/A, start: 0.000000, bitrate: N/A
  Stream #0:0(eng): Video: vp9 (Profile 0), yuv420p(tv), 640x360, SAR 1:1 DAR 16:9, 25 fps
  Stream #0:1(eng): Audio: opus, 48000 Hz, stereo, fltp
`)
    expect(webm.streams.map(s => s.codec_name)).toEqual(['vp9', 'opus'])
    expect(webm.streams[0]).toMatchObject({ width: 640, height: 360, pix_fmt: 'yuv420p' })
    expect(webm.format.duration).toBeUndefined()
  })

  it('throws ffmpeg\'s own message when the file is not media', () => {
    expect(() => parseMediaInfo("/x/a.txt: Invalid data found when processing input\n")).toThrow('Invalid data found')
  })
})

/** A child process the test drives by hand. */
function fakeChild() {
  const child = new EventEmitter()
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn(() => { child.emit('close', null) })
  return child
}

describe('run', () => {
  const make = () => {
    const child = fakeChild()
    const spawn = vi.fn(() => child)
    return { child, spawn, ff: createFfmpeg({ ffmpegPath: '/bin/ffmpeg', spawn }) }
  }

  it('starts the binary with an argument array and progress on stdout', () => {
    const { spawn, ff } = make()
    ff.run(['-i', 'a.mp4', 'out.mp4'])
    const [bin, args] = spawn.mock.calls[0]
    expect(bin).toBe('/bin/ffmpeg')
    expect(args).toEqual(['-hide_banner', '-nostdin', '-nostats', '-y', '-progress', 'pipe:1', '-i', 'a.mp4', 'out.mp4'])
  })

  it('reports progress in seconds, even when a line is split across chunks', () => {
    const { child, ff } = make()
    const onProgress = vi.fn()
    ff.run(['x'], { onProgress })
    child.stdout.emit('data', 'frame=10\nout_time_us=2500')
    child.stdout.emit('data', '000\nprogress=continue\nout_time_us=5000000\n')
    expect(onProgress.mock.calls.map(c => c[0])).toEqual([2.5, 5])
  })

  it('resolves on exit code 0', async () => {
    const { child, ff } = make()
    const { promise } = ff.run(['x'])
    child.emit('close', 0)
    await expect(promise).resolves.toBeUndefined()
  })

  it('rejects with the tail of stderr, without the stream chatter', async () => {
    const { child, ff } = make()
    const { promise } = ff.run(['x'])
    child.stderr.emit('data', 'Input #0, mov\n  Stream #0:0: Video: h264\n[Parsed_crop_1] Invalid too big or non positive size\nError reinitializing filters!\n')
    child.emit('close', 234)
    await expect(promise).rejects.toThrow('Invalid too big or non positive size | Error reinitializing filters!')
  })

  it('falls back to the exit code when stderr is empty', async () => {
    const { child, ff } = make()
    const { promise } = ff.run(['x'])
    child.emit('close', 1)
    await expect(promise).rejects.toThrow('code 1')
  })

  it('kills the process and rejects with "cancelled"', async () => {
    const { child, ff } = make()
    const handle = ff.run(['x'])
    handle.kill()
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    await expect(handle.promise).rejects.toThrow('cancelled')
  })

  it('rejects when the binary cannot be started', async () => {
    const { child, ff } = make()
    const { promise } = ff.run(['x'])
    child.emit('error', new Error('spawn EACCES'))
    await expect(promise).rejects.toThrow('EACCES')
  })
})

describe('probe', () => {
  it('parses what ffmpeg prints, whatever its exit code', async () => {
    const child = fakeChild()
    const ff = createFfmpeg({ ffmpegPath: '/bin/ffmpeg', spawn: vi.fn(() => child) })
    const promise = ff.probe('/v/in.mp4')
    child.stderr.emit('data', MP4_INFO)
    child.emit('close', 1)
    await expect(promise).resolves.toMatchObject({ format: { duration: 62.5 } })
  })

  it('rejects for an unreadable file', async () => {
    const child = fakeChild()
    const ff = createFfmpeg({ ffmpegPath: '/bin/ffmpeg', spawn: vi.fn(() => child) })
    const promise = ff.probe('/nope')
    child.stderr.emit('data', '/nope: No such file or directory\n')
    child.emit('close', 1)
    await expect(promise).rejects.toThrow('No such file')
  })
})
