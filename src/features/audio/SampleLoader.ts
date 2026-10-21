import manifest from './sample-manifest.json'
import { sha256Integrity } from '../offline/cacheManifest'

export const SAMPLE_MANIFEST = manifest
let prepared: Record<string, ArrayBuffer> | undefined

// Compressed, integrity-checked bytes are prepared separately from Web Audio.
// Cache-only preparation on reopen must never silently fall back to the network.
export async function prepareSamples(signal: AbortSignal, progress: (done: number) => void, cacheName?: string): Promise<void> {
  const cache = cacheName ? await caches.open(cacheName) : undefined
  const next: Record<string, ArrayBuffer> = {}
  let loaded = 0
  const queue = [...manifest.assets]
  const worker = async () => {
    let sample: (typeof manifest.assets)[number] | undefined
    while ((sample = queue.shift())) {
      signal.throwIfAborted()
      const url = new URL(`${import.meta.env.BASE_URL}samples/salamander/${sample.file}`, window.location.href).href
      const response = cache
        ? await cache.match(url, { ignoreSearch: true })
        : await fetch(url, { signal, integrity: sha256Integrity(sample.sha256) })
      if (!response?.ok) throw new Error(`Không tải được sample ${sample.note}.`)
      const bytes = await response.arrayBuffer()
      if (bytes.byteLength !== sample.bytes) throw new Error(`Sample ${sample.note} chưa tải đầy đủ.`)
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      if (hash !== sample.sha256) throw new Error(`Sample ${sample.note} không khớp dữ liệu đã xác minh.`)
      signal.throwIfAborted()
      next[sample.note] = bytes
      progress(Math.round(++loaded / manifest.assets.length * 100))
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  signal.throwIfAborted()
  prepared = next
}

export function clearPreparedSamples(): void { prepared = undefined }

export async function loadSamples(context: BaseAudioContext, signal: AbortSignal, progress: (done: number) => void): Promise<Record<string, AudioBuffer>> {
  const data = prepared
  if (!data) throw new Error('Hãy tải dữ liệu tiếng đàn trước khi Start Piano.')
  const queue = [...manifest.assets]
  const buffers: Record<string, AudioBuffer> = {}
  let loaded = 0
  const worker = async () => {
    let sample: (typeof manifest.assets)[number] | undefined
    while ((sample = queue.shift())) {
      signal.throwIfAborted()
      // decodeAudioData detaches its input; preserve compressed bytes for retry/resume.
      const buffer = await context.decodeAudioData(data[sample.note].slice(0))
      signal.throwIfAborted()
      buffers[sample.note] = buffer
      progress(Math.round(++loaded / manifest.assets.length * 100))
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  return buffers
}
