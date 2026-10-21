import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPreparedSamples, loadSamples, prepareSamples, SAMPLE_MANIFEST } from '../src/features/audio/SampleLoader'

function sampleResponse(url: string): Response {
  const file = new URL(url).pathname.split('/').at(-1)!
  return new Response(readFileSync(new URL(`../public/samples/salamander/${file}`, import.meta.url)))
}
beforeEach(() => {
  clearPreparedSamples()
  vi.stubGlobal('window', { location: { href: 'http://localhost/' } })
})
afterEach(() => vi.unstubAllGlobals())

describe('separate sample data and audio readiness', () => {
  it('verifies all downloads before Start, then decodes without any fetch and can decode again', async () => {
    const fetcher = vi.fn(async (url: string) => sampleResponse(url))
    vi.stubGlobal('fetch', fetcher)
    const progress = vi.fn()
    await prepareSamples(new AbortController().signal, progress)
    expect(fetcher).toHaveBeenCalledTimes(21)
    expect(progress).toHaveBeenLastCalledWith(100)
    fetcher.mockClear()
    const context = { decodeAudioData: vi.fn(async () => ({ duration: 3 })) } as unknown as BaseAudioContext
    const buffers = await loadSamples(context, new AbortController().signal, progress)
    expect(Object.keys(buffers)).toHaveLength(21)
    await loadSamples(context, new AbortController().signal, progress)
    expect(context.decodeAudioData).toHaveBeenCalledTimes(42)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects Start before download without making network requests', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(loadSamples({} as BaseAudioContext, new AbortController().signal, vi.fn())).rejects.toThrow('Hãy tải dữ liệu')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('reads reopened cache only, including Workbox revision keys, with no network fallback', async () => {
    const match = vi.fn(async (url: string) => sampleResponse(url))
    vi.stubGlobal('caches', { open: vi.fn(async () => ({ match })) })
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await prepareSamples(new AbortController().signal, vi.fn(), 'saved-build')
    expect(match).toHaveBeenCalledTimes(21)
    expect(match).toHaveBeenCalledWith(expect.any(String), { ignoreSearch: true })
    expect(fetcher).not.toHaveBeenCalled()
    clearPreparedSamples()
    match.mockResolvedValue(undefined as unknown as Response)
    await expect(prepareSamples(new AbortController().signal, vi.fn(), 'saved-build')).rejects.toThrow('Không tải được sample')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects missing, partial and same-size corrupt downloads without publishing partial data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
    await expect(prepareSamples(new AbortController().signal, vi.fn())).rejects.toThrow('Không tải được sample')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(1))))
    await expect(prepareSamples(new AbortController().signal, vi.fn())).rejects.toThrow('chưa tải đầy đủ')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const sample = SAMPLE_MANIFEST.assets.find(s => s.file === new URL(url).pathname.split('/').at(-1))!
      return new Response(new ArrayBuffer(sample.bytes))
    }))
    await expect(prepareSamples(new AbortController().signal, vi.fn())).rejects.toThrow('không khớp')
    await expect(loadSamples({} as BaseAudioContext, new AbortController().signal, vi.fn())).rejects.toThrow('Hãy tải dữ liệu')
  })
  it('cannot publish decoded buffers after cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => sampleResponse(url)))
    await prepareSamples(new AbortController().signal, vi.fn())
    const controller = new AbortController()
    const context = { decodeAudioData: vi.fn(async () => { controller.abort(); return {} }) } as unknown as BaseAudioContext
    await expect(loadSamples(context, controller.signal, vi.fn())).rejects.toThrow()
  })
})
