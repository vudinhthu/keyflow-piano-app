import { create } from 'zustand'
import { DEFAULT_SETTINGS } from '../features/piano/preferences'

export type AudioStatus = 'idle' | 'loading' | 'ready' | 'error'
interface PianoState {
  inputBlocked: boolean
  status: AudioStatus
  progress: number
  activeNotes: number[]
  error: string | null
  volume: number
  octaveShift: number
  sustain: boolean
  sustainedNotes: number[]
  velocity: number
}

export const usePianoStore = create<PianoState>(() => ({ inputBlocked: false, status: 'idle', progress: 0, activeNotes: [], error: null, ...DEFAULT_SETTINGS, sustain: false, sustainedNotes: [] }))
