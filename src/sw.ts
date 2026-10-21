/// <reference lib="webworker" />
import { PrecacheController } from 'workbox-precaching'
import { CACHE_PREFIX, cacheVersion, responseMatchesIntegrity, validateCacheManifest, type CacheEntry } from './features/offline/cacheManifest'

declare const self: ServiceWorkerGlobalScope
const entries = validateCacheManifest(self.__WB_MANIFEST, self.registration.scope)
const byUrl = new Map(entries.map(entry => [new URL(entry.url, self.registration.scope).href, entry]))
const controller = cacheVersion(entries).then(version => {
  const cacheName = `${CACHE_PREFIX}${version}`
  const precache = new PrecacheController({ cacheName, fallbackToNetwork: false })
  precache.addToCacheList(entries)
  return { precache, version, cacheName }
})

async function verifyCache() {
  const { precache, version, cacheName } = await controller
  const missing: string[] = []
  const corrupt: string[] = []
  for (const entry of entries) {
    const response = await precache.matchPrecache(new URL(entry.url, self.registration.scope).href)
    if (!response) missing.push(entry.url)
    else if (!await responseMatchesIntegrity(response, entry.integrity!)) corrupt.push(entry.url)
  }
  return { type: 'CACHE_STATUS', buildId: __KEYFLOW_BUILD_ID__, pinnedSamples: 21, version, cacheName, ready: missing.length === 0 && corrupt.length === 0, expectedCount: entries.length, missing, corrupt }
}

let repairing: Promise<Awaited<ReturnType<typeof verifyCache>>> | undefined
async function repairCache(event: ExtendableEvent) {
  if (repairing) return repairing
  repairing = (async () => {
    const { precache, cacheName } = await controller
    const cache = await caches.open(cacheName)
    for (const entry of entries) {
      const url = new URL(entry.url, self.registration.scope).href
      const response = await precache.matchPrecache(url)
      if (response && !await responseMatchesIntegrity(response, entry.integrity!)) await cache.delete(precache.getCacheKeyForURL(url)!)
    }
    if (event.type === 'install') await precache.install(event)
    else {
      for (const entry of entries) {
        const url = new URL(entry.url, self.registration.scope).href
        const existing = await precache.matchPrecache(url)
        if (existing && await responseMatchesIntegrity(existing, entry.integrity!)) continue
        const response = await fetch(url, { integrity: entry.integrity, credentials: 'same-origin', cache: 'reload' })
        if (!response.ok) throw new Error('Offline asset request failed')
        await cache.put(precache.getCacheKeyForURL(url)!, response)
      }
    }
    return verifyCache()
  })()
  try { return await repairing } finally { repairing = undefined }
}
function errorCode(error: unknown): string {
  return /quota/i.test(error instanceof Error ? `${error.name} ${error.message}` : String(error)) ? 'quota' : 'resources'
}
async function broadcast(data: object) {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of clients) client.postMessage(data)
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      if (!(await repairCache(event)).ready) throw new Error('Offline build cache is incomplete')
    } catch (error) {
      await broadcast({ type: 'CACHE_INSTALL_FAILED', errorCode: errorCode(error), buildId: __KEYFLOW_BUILD_ID__ })
      throw error
    }
  })())
})
self.addEventListener('activate', event => { event.waitUntil(controller.then(({ precache }) => precache.activate(event))) })
// No skipWaiting/clientsClaim takeover. Prior build caches are retained for safe updates.

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  const navigation = event.request.mode === 'navigate' && !url.pathname.startsWith('/samples/')
  const assetUrl = navigation ? new URL('index.html', self.registration.scope).href : url.href
  const entry = byUrl.get(assetUrl)
  if (!entry) return
  event.respondWith((async () => {
    const { precache, cacheName } = await controller
    const response = await precache.matchPrecache(assetUrl)
    // Eviction can invalidate readiness; online recovery still checks this build's bytes.
    if (response && await responseMatchesIntegrity(response.clone(), entry.integrity!)) return response
    await broadcast({ type: 'CACHE_INVALIDATED', buildId: __KEYFLOW_BUILD_ID__ })
    const fresh = await fetch(assetUrl, { integrity: entry.integrity, credentials: 'same-origin' })
    // Cache write failure must not prevent online playing; readiness stays false.
    try {
      if (fresh.ok) {
        await (await caches.open(cacheName)).put(precache.getCacheKeyForURL(assetUrl)!, fresh.clone())
        await broadcast({ type: 'CACHE_CHANGED', buildId: __KEYFLOW_BUILD_ID__ })
      }
    } catch { /* Retry/status belongs to the cache UI. */ }
    return fresh
  })())
})

self.addEventListener('message', event => {
  if (!event.ports[0]) return
  const port = event.ports[0]
  const type = event.data?.type
  if (!['VERIFY_CACHE', 'REPAIR_CACHE', 'APPLY_UPDATE'].includes(type)) return
  event.waitUntil((async () => {
    try {
      if (type === 'APPLY_UPDATE') {
        const status = await verifyCache()
        if (!status.ready || event.data.version !== status.version || event.data.idle !== true) {
          port.postMessage({ applied: false, reason: 'incomplete' }); return
        }
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        const sourceId = event.source && 'id' in event.source ? event.source.id : null
        if (clients.length !== 1 || clients[0].id !== sourceId) {
          port.postMessage({ applied: false, reason: 'other-clients' }); return
        }
        const channel = new MessageChannel()
        const idle = await new Promise<boolean>(resolve => {
          const timer = setTimeout(() => { channel.port1.close(); resolve(false) }, 3000)
          channel.port1.onmessage = reply => { clearTimeout(timer); channel.port1.close(); resolve(reply.data?.idle === true) }
          clients[0].postMessage({ type: 'PREPARE_UPDATE', version: status.version }, [channel.port2])
        })
        const stillSingle = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).every(client => client.id === sourceId)
        if (!idle || !stillSingle) { port.postMessage({ applied: false, reason: 'not-idle' }); return }
        port.postMessage({ applied: true })
        await self.skipWaiting()
        return
      }
      port.postMessage(type === 'REPAIR_CACHE' ? await repairCache(event) : await verifyCache())
    } catch (error) {
      port.postMessage({ type: 'CACHE_STATUS', ready: false, errorCode: errorCode(error) })
    }
  })())
})

// Compile-time manifest type checks do not replace the runtime pinned-core validation.
export type OfflineCacheContract = CacheEntry[]
