export interface CacheStatus {
  type: 'CACHE_STATUS'
  ready: boolean
  version?: string
  buildId?: string
  pinnedSamples?: number
  expectedCount?: number
  missing?: string[]
  corrupt?: string[]
  errorCode?: string
}
export function isVerified(status: CacheStatus, buildId?: string): boolean {
  return Boolean(status) && typeof status === 'object' && status.type === 'CACHE_STATUS' && status.ready === true && /^[a-f0-9]{64}$/.test(status.version || '') && /^[a-f0-9]{64}$/.test(status.buildId || '') && Number.isInteger(status.expectedCount) && status.expectedCount! >= 29 && status.pinnedSamples === 21 && Array.isArray(status.missing) && status.missing.length === 0 && Array.isArray(status.corrupt) && status.corrupt.length === 0 && (!buildId || status.buildId === buildId)
}
export function updateIsQuiet(state: { status: string; activeNotes: number[]; sustainedNotes: number[]; sustain: boolean }, lastActivity: number, now: number): boolean {
  return state.status !== 'loading' && state.activeNotes.length === 0 && state.sustainedNotes.length === 0 && !state.sustain && now - lastActivity >= 1100
}
export function workerRequest<T>(worker: ServiceWorker, type: string, payload: Record<string, unknown> = {}, timeoutMs = 20000, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const cleanup = () => { clearTimeout(timer); channel.port1.close(); signal?.removeEventListener('abort', abort) }
    const abort = () => { cleanup(); reject(new DOMException('Canceled worker request', 'AbortError')) }
    const timer = setTimeout(() => { cleanup(); reject(new Error('Worker request timed out')) }, timeoutMs)
    channel.port1.onmessage = event => { cleanup(); resolve(event.data as T) }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) { abort(); return }
    try { worker.postMessage({ type, ...payload }, [channel.port2]) } catch (error) { cleanup(); reject(error) }
  })
}
