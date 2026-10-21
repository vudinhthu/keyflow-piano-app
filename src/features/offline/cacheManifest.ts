import samples from '../audio/sample-manifest.json'

export interface CacheEntry { url: string; revision?: string | null; integrity?: string }
export const CACHE_PREFIX = 'keyflow-piano-v1-'

export function sha256Integrity(hex: string): string {
  if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error('Invalid pinned SHA-256')
  return `sha256-${btoa(String.fromCharCode(...hex.match(/../g)!.map(pair => Number.parseInt(pair, 16))))}`
}

export function validateCacheManifest(entries: Array<CacheEntry | string>, scope: string): CacheEntry[] {
  const byUrl = new Map<string, CacheEntry>()
  for (const entry of entries) {
    if (typeof entry === 'string') throw new Error('Every cached asset needs integrity')
    if (!entry.integrity) continue
    if (!/^sha256-[A-Za-z0-9+/]{43}=$/.test(entry.integrity)) throw new Error('Every cached asset needs integrity')
    const url = new URL(entry.url, scope).href
    const previous = byUrl.get(url)
    if (previous && (previous.integrity !== entry.integrity || previous.revision !== entry.revision)) throw new Error('Conflicting offline asset')
    byUrl.set(url, entry)
  }
  // Vite PWA appends icon/manifest entries after transforms. Accept only redundant
  // records with exactly the same revision as an already integrity-bound asset.
  for (const entry of entries) {
    if (typeof entry === 'string') throw new Error('Every cached asset needs integrity')
    if (!entry.integrity) {
      const bound = byUrl.get(new URL(entry.url, scope).href)
      if (!bound || bound.revision !== entry.revision) throw new Error('Every cached asset needs integrity')
    }
  }
  const result = [...byUrl.values()]
  for (const asset of samples.assets) {
    const url = new URL(`samples/salamander/${asset.file}`, scope).href
    if (byUrl.get(url)?.integrity !== sha256Integrity(asset.sha256)) throw new Error(`Missing or incompatible core sample: ${asset.file}`)
  }
  for (const required of ['index.html', 'manifest.webmanifest', 'icons/piano-192.png', 'icons/piano-512.png', 'THIRD_PARTY_NOTICES.md', 'samples/salamander/ATTRIBUTION.md', 'samples/salamander/manifest.json']) {
    if (!byUrl.has(new URL(required, scope).href)) throw new Error(`Missing offline asset: ${required}`)
  }
  if (!result.some(entry => /\.js$/.test(entry.url)) || !result.some(entry => /\.css$/.test(entry.url))) throw new Error('Missing offline code/styles')
  return result
}

export async function cacheVersion(entries: CacheEntry[]): Promise<string> {
  const contract = entries.map(({ url, revision, integrity }) => [url, revision ?? null, integrity]).sort((a, b) => String(a[0]) < String(b[0]) ? -1 : String(a[0]) > String(b[0]) ? 1 : 0)
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(contract)))
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function responseMatchesIntegrity(response: Response, integrity: string): Promise<boolean> {
  if (!response.ok) return false
  const hash = await crypto.subtle.digest('SHA-256', await response.arrayBuffer())
  return `sha256-${btoa(String.fromCharCode(...new Uint8Array(hash)))}` === integrity
}
