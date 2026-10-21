import { describe, expect, it, vi } from 'vitest'
import { createStore } from 'zustand/vanilla'
import { DEFAULT_SETTINGS } from '../src/features/piano/preferences'
import { initializeSettings, parseSettings, SETTINGS_KEY } from '../src/features/settings/persistence'

const saved = (value: object) => JSON.stringify({ version: 1, ...value })
const freshStore = () => createStore(() => ({ ...DEFAULT_SETTINGS, activeNotes: [] as number[], sustainedNotes: [] as number[], sustain: false, status: 'idle' }))

describe('settings persistence', () => {
  it('restores exactly chosen preferences before audio startup, ignoring injected transient state', () => {
    const store = freshStore()
    const storage = { getItem: vi.fn(() => saved({ volume: 0, octaveShift: 2, velocity: 0.4, activeNotes: [60], sustain: true, status: 'ready' })), setItem: vi.fn() }
    initializeSettings(store, () => storage)
    expect(store.getState()).toEqual({ volume: 0, octaveShift: 2, velocity: 0.4, activeNotes: [], sustainedNotes: [], sustain: false, status: 'idle' })
    expect(storage.getItem).toHaveBeenCalledWith(SETTINGS_KEY)
    expect(storage.setItem).not.toHaveBeenCalled()
  })
  it.each([null, 'broken JSON', 'null', '[]', '5', '{}', saved({ version: 2, volume: 30 }), saved({ version: '1', volume: 30 })])('uses defaults for missing/corrupt/unsupported records: %s', (raw) => {
    expect(parseSettings(raw)).toEqual(DEFAULT_SETTINGS)
  })
  it('defaults invalid fields independently without discarding valid choices', () => {
    expect(parseSettings(saved({ volume: 40, octaveShift: 1.5, velocity: '1' }))).toEqual({ volume: 40, octaveShift: 0, velocity: 0.72 })
    for (const volume of [-1, 101, 50.5, '30', null]) expect(parseSettings(saved({ volume, octaveShift: -1, velocity: 1 }))).toEqual({ volume: 100, octaveShift: -1, velocity: 1 })
    for (const octaveShift of [-2, 3, '1', null]) expect(parseSettings(saved({ octaveShift })).octaveShift).toBe(0)
    for (const velocity of [0, 0.5, 2, null]) expect(parseSettings(saved({ velocity })).velocity).toBe(0.72)
  })
  it('persists preferences across a fresh store and writes nothing on note/pedal/status changes', () => {
    let record: string | null = null
    const storage = { getItem: () => record, setItem: vi.fn((_key: string, value: string) => { record = value }) }
    const store = freshStore()
    const unsubscribe = initializeSettings(store, () => storage)
    store.setState({ volume: 25, octaveShift: 1, velocity: 1 })
    store.setState({ activeNotes: [60], sustainedNotes: [62], sustain: true, status: 'ready' })
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(JSON.parse(record!)).toEqual({ version: 1, volume: 25, octaveShift: 1, velocity: 1 })
    const reopened = freshStore()
    initializeSettings(reopened, () => storage)
    expect(reopened.getState()).toEqual({ volume: 25, octaveShift: 1, velocity: 1, activeNotes: [], sustainedNotes: [], sustain: false, status: 'idle' })
    unsubscribe()
    store.setState({ volume: 50 })
    expect(storage.setItem).toHaveBeenCalledTimes(1)
  })
  it('continues when storage access, reading or quota writes throw and retries on later preference changes', () => {
    const store = freshStore()
    expect(() => initializeSettings(store, () => { throw new Error('SecurityError') })).not.toThrow()
    expect(() => store.setState({ volume: 20 })).not.toThrow()
    const storage = { getItem: () => { throw new Error('read denied') }, setItem: vi.fn().mockImplementationOnce(() => { throw new Error('QuotaExceededError') }) }
    initializeSettings(store, () => storage)
    expect(store.getState().volume).toBe(100)
    expect(() => store.setState({ volume: 30 })).not.toThrow()
    store.setState({ volume: 40 })
    expect(storage.setItem).toHaveBeenLastCalledWith(SETTINGS_KEY, saved({ volume: 40, octaveShift: 0, velocity: 0.72 }))
  })
})
