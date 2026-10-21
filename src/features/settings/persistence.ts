import type { StoreApi } from 'zustand'
import { DEFAULT_SETTINGS, MAX_OCTAVE_SHIFT, MIN_OCTAVE_SHIFT, VELOCITY_LEVELS } from '../piano/preferences'

export const SETTINGS_KEY = 'keyflow-piano:settings'
export interface PianoSettings { volume: number; octaveShift: number; velocity: number }
type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>
type StorageProvider = () => SettingsStorage

export function parseSettings(raw: string | null): PianoSettings {
  try {
    const data: unknown = raw === null ? null : JSON.parse(raw)
    if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1) return { ...DEFAULT_SETTINGS }
    const value = data as Record<string, unknown>
    return {
      volume: typeof value.volume === 'number' && Number.isInteger(value.volume) && value.volume >= 0 && value.volume <= 100 ? value.volume : DEFAULT_SETTINGS.volume,
      octaveShift: typeof value.octaveShift === 'number' && Number.isInteger(value.octaveShift) && value.octaveShift >= MIN_OCTAVE_SHIFT && value.octaveShift <= MAX_OCTAVE_SHIFT ? value.octaveShift : DEFAULT_SETTINGS.octaveShift,
      velocity: VELOCITY_LEVELS.some((level) => level.value === value.velocity) ? value.velocity as number : DEFAULT_SETTINGS.velocity,
    }
  } catch { return { ...DEFAULT_SETTINGS } }
}

// Read preferences before rendering; audio still starts only from a user gesture.
export function initializeSettings<T extends PianoSettings>(store: StoreApi<T>, storage: StorageProvider = () => window.localStorage): () => void {
  let settings = { ...DEFAULT_SETTINGS }
  try { settings = parseSettings(storage().getItem(SETTINGS_KEY)) } catch { /* Storage may be disabled. */ }
  store.setState(settings as Partial<T>)
  return store.subscribe((state, previous) => {
    if (state.volume === previous.volume && state.octaveShift === previous.octaveShift && state.velocity === previous.velocity) return
    try {
      storage().setItem(SETTINGS_KEY, JSON.stringify({ version: 1, volume: state.volume, octaveShift: state.octaveShift, velocity: state.velocity }))
    } catch { /* Quota/security failures must never interrupt playing. */ }
  })
}
