import { useEffect } from 'react'
import { audioEngine } from '../features/audio/AudioEngine'
import { KeyboardListener } from '../features/keyboard/KeyboardListener'
import { shiftOctave } from '../features/keyboard/controls'
import { usePianoStore } from '../stores/pianoStore'

export function useKeyboard(): void {
  useEffect(() => new KeyboardListener(audioEngine, () => usePianoStore.getState().octaveShift, shiftOctave, () => usePianoStore.getState().velocity).attach(), [])
}
