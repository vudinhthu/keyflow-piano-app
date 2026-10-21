import { usePianoStore } from '../../stores/pianoStore'
import { noteName } from '../piano/notes'

import { MIN_OCTAVE_SHIFT, MAX_OCTAVE_SHIFT, VELOCITY_LEVELS } from '../piano/preferences'
export { MIN_OCTAVE_SHIFT, MAX_OCTAVE_SHIFT, VELOCITY_LEVELS } from '../piano/preferences'

export function setVelocity(value: number): void {
  if (VELOCITY_LEVELS.some((level) => level.value === value)) usePianoStore.setState({ velocity: value })
}

export function shiftOctave(direction: -1 | 1): void {
  const current = usePianoStore.getState().octaveShift
  usePianoStore.setState({ octaveShift: Math.max(MIN_OCTAVE_SHIFT, Math.min(MAX_OCTAVE_SHIFT, current + direction)) })
}

export function keyboardRange(shift: number): string {
  return `${noteName(48 + shift * 12)} — ${noteName(71 + shift * 12)}`
}
