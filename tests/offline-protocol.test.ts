import { describe, expect, it } from 'vitest'
import { isVerified, updateIsQuiet, type CacheStatus } from '../src/features/offline/protocol'

const valid = (): CacheStatus => ({ type: 'CACHE_STATUS', ready: true, version: 'a'.repeat(64), buildId: 'b'.repeat(64), expectedCount: 31, pinnedSamples: 21, missing: [], corrupt: [] })
describe('offline user-facing gates', () => {
  it('requires verified completeness and the client build, including when an old worker reports ready', () => {
    expect(isVerified(valid(), 'b'.repeat(64))).toBe(true)
    expect(isVerified(valid(), 'c'.repeat(64))).toBe(false)
    for (const patch of [{ missing: ['C2.mp3'] }, { corrupt: ['C3.mp3'] }, { expectedCount: 9 }, { pinnedSamples: 20 }, { ready: false }, { version: 'old' }, { buildId: undefined }]) expect(isVerified({ ...valid(), ...patch }, 'b'.repeat(64))).toBe(false)
  })
  it('blocks update during load, held/sustained notes, pedal and release tails', () => {
    const idle = { status: 'ready', activeNotes: [], sustainedNotes: [], sustain: false }
    expect(updateIsQuiet(idle, 0, 1100)).toBe(true)
    expect(updateIsQuiet(idle, 0, 1099)).toBe(false)
    for (const patch of [{ status: 'loading' }, { activeNotes: [60] }, { sustainedNotes: [60] }, { sustain: true }]) expect(updateIsQuiet({ ...idle, ...patch }, 0, 5000)).toBe(false)
  })
})
