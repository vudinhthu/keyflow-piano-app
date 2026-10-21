import { describe, expect, it } from 'vitest'
import samples from '../src/features/audio/sample-manifest.json'
import { cacheVersion, responseMatchesIntegrity, sha256Integrity, validateCacheManifest } from '../src/features/offline/cacheManifest'

const scope = 'https://piano.test/'
const entry = (url: string) => ({ url, revision: 'revision', integrity: sha256Integrity('0'.repeat(64)) })
const contract = () => [
  ...['assets/client.js', 'assets/client.css', 'index.html', 'manifest.webmanifest', 'icons/piano-192.png', 'icons/piano-512.png', 'THIRD_PARTY_NOTICES.md', 'samples/salamander/ATTRIBUTION.md', 'samples/salamander/manifest.json'].map(entry),
  ...samples.assets.map(asset => ({ url: `samples/salamander/${asset.file}`, revision: asset.sha256, integrity: sha256Integrity(asset.sha256) })),
]
describe('versioned complete offline contract', () => {
  it('requires the complete pinned core plus shell/icons/credits before installing', () => {
    expect(validateCacheManifest(contract(), scope)).toHaveLength(30)
    expect(() => validateCacheManifest(contract().slice(0, -1), scope)).toThrow(/core sample/)
    const incompatible = contract(); incompatible.at(-1)!.integrity = sha256Integrity('0'.repeat(64))
    expect(() => validateCacheManifest(incompatible, scope)).toThrow(/incompatible/)
    expect(() => validateCacheManifest(contract().filter(e => e.url !== 'index.html'), scope)).toThrow(/offline asset/)
    expect(() => validateCacheManifest(['index.html'], scope)).toThrow(/integrity/)
    expect(validateCacheManifest([...contract(), { url: 'icons/piano-192.png', revision: 'revision' }], scope)).toHaveLength(30)
    expect(() => validateCacheManifest([...contract(), { url: 'unbound.png', revision: 'revision' }], scope)).toThrow(/integrity/)
    expect(() => validateCacheManifest([...contract(), { url: 'icons/piano-192.png', revision: 'different' }], scope)).toThrow(/integrity/)
  })
  it('rejects an offline installation that omits third-party license notices', () => {
    expect(() => validateCacheManifest(contract().filter(e => e.url !== 'THIRD_PARTY_NOTICES.md'), scope)).toThrow('Missing offline asset: THIRD_PARTY_NOTICES.md')
  })
  it('binds the cache version to shell and sample bytes, independent of manifest ordering', async () => {
    const original = contract()
    const version = await cacheVersion(original)
    expect(await cacheVersion([...original].reverse())).toBe(version)
    expect(await cacheVersion(original.map(e => e.url === 'index.html' ? { ...e, integrity: sha256Integrity('1'.repeat(64)) } : e))).not.toBe(version)
    expect(await cacheVersion(original.map(e => e.url.endsWith('C3.mp3') ? { ...e, revision: 'new-sample-version' } : e))).not.toBe(version)
  })
  it('detects cache eviction/corruption rather than trusting presence or byte count', async () => {
    const body = new TextEncoder().encode('piano sample bytes')
    const hash = await crypto.subtle.digest('SHA-256', body)
    const integrity = `sha256-${btoa(String.fromCharCode(...new Uint8Array(hash)))}`
    expect(await responseMatchesIntegrity(new Response(body), integrity)).toBe(true)
    const corrupt = body.slice(); corrupt[0] ^= 1
    expect(await responseMatchesIntegrity(new Response(corrupt), integrity)).toBe(false)
    expect(await responseMatchesIntegrity(new Response(body, { status: 503 }), integrity)).toBe(false)
  })
})
